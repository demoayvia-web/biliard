using System;
using System.Collections.Generic;

namespace Billiards.Physics
{
    /// <summary>
    /// Deterministic pool physics: fixed sub-steps, per-ball motion regimes, impulse-based
    /// collisions with friction, time-of-impact rewind for ball-ball contacts.
    ///
    /// Equations of motion (y up, contact point r = (0,-R,0), u = slip velocity v + w x r):
    ///   Sliding:  dv/dt = -mu_s g u_hat             dw/dt = (r x F) / I
    ///             u decays along a straight line at 7/2 mu_s g, then the ball rolls.
    ///   Rolling:  dv/dt = -mu_r g v_hat             w_horizontal locked to v / R
    ///   Spin:     dw_y/dt = -sign(w_y) * SpinDeceleration (in every on-table regime)
    ///   Airborne: dv/dt = -g, w constant
    ///
    /// Collisions all go through the same "impulse at contact point with Coulomb friction"
    /// routine, so throw (ball-ball), running/reverse english (cushion) and jump landings
    /// (slate) come from one well-tested piece of code.
    ///
    /// No allocations in Step(): safe to run thousands of shots per AI turn.
    /// </summary>
    public sealed class PoolPhysicsWorld
    {
        public readonly TableGeometry Table;
        public readonly PhysicsParams Params;

        /// <summary>Ball states. Index 0 is the cue ball by convention.</summary>
        public readonly BallState[] Balls;

        /// <summary>Events produced since the last <see cref="ClearEvents"/>.</summary>
        public readonly List<PhysicsEvent> Events = new List<PhysicsEvent>(64);

        /// <summary>Optional: set to false to skip event recording (AI fast path).</summary>
        public bool RecordEvents = true;

        /// <summary>Simulation time since the last strike.</summary>
        public double Time { get; private set; }

        private double _accumulator;

        // Cached constants.
        private readonly double _r;
        private readonly double _m;
        private readonly double _inertia;
        private readonly double _dt;
        private readonly double _cushionFreeHalfLength;
        private readonly double _cushionFreeHalfWidth;

        private const int MaxCollisionPasses = 4;
        private const double SlipEpsilon = 1e-6;
        private const double SpeedEpsilon = 1e-6;
        private const double AirborneEpsilon = 1e-6;

        public PoolPhysicsWorld(TableGeometry table, PhysicsParams parameters, int ballCount)
        {
            Table = table ?? throw new ArgumentNullException(nameof(table));
            Params = parameters ?? throw new ArgumentNullException(nameof(parameters));
            Balls = new BallState[ballCount];
            for (int i = 0; i < ballCount; i++)
                Balls[i] = new BallState { Number = i, Motion = BallMotion.Pocketed };

            _r = Params.BallRadius;
            _m = Params.BallMass;
            _inertia = Params.Inertia;
            _dt = Params.FixedDt;
            _cushionFreeHalfLength = Table.HalfLength - _r - 0.002;
            _cushionFreeHalfWidth = Table.HalfWidth - _r - 0.002;
        }

        // ------------------------------------------------------------------------------
        //  Public API
        // ------------------------------------------------------------------------------

        /// <summary>True when every ball on the table has stopped. The shot is over.</summary>
        public bool IsAtRest
        {
            get
            {
                for (int i = 0; i < Balls.Length; i++)
                    if (Balls[i].IsMoving) return false;
                return true;
            }
        }

        /// <summary>Places a ball on the cloth at rest (rack, ball-in-hand, re-spot).</summary>
        public void PlaceBall(int index, double x, double z)
        {
            Balls[index].Position = new DVec3(x, _r, z);
            Balls[index].Velocity = DVec3.Zero;
            Balls[index].AngularVelocity = DVec3.Zero;
            Balls[index].Motion = BallMotion.Stationary;
        }

        public void RemoveBall(int index) => Balls[index].Motion = BallMotion.Pocketed;

        /// <summary>Hits ball <paramref name="index"/> with the cue. Resets the shot clock.</summary>
        public StrikeResult Strike(int index, in CueStrike strike)
        {
            StrikeResult result = CueStrikeModel.Compute(strike, Params);
            ref BallState b = ref Balls[index];
            b.Velocity = result.Velocity;
            b.AngularVelocity = result.AngularVelocity;
            Time = 0;
            _accumulator = 0;
            Emit(PhysicsEventType.CueStrike, index, -1, -1, result.Velocity.Length);

            // An elevated cue drives the ball into the slate: resolve that bounce now.
            if (b.Velocity.Y < 0) ResolveTableImpact(index);
            Classify(ref b);
            return result;
        }

        /// <summary>
        /// Advances by a frame delta using fixed sub-steps (frame-rate independent).
        /// </summary>
        /// <param name="maxSteps">Safety cap so a hitch never freezes the game.</param>
        public void Advance(double deltaTime, int maxSteps = 400)
        {
            _accumulator += deltaTime;
            int steps = 0;
            while (_accumulator >= _dt && steps < maxSteps)
            {
                Step();
                _accumulator -= _dt;
                steps++;
            }
            if (steps == maxSteps) _accumulator = 0; // drop time rather than spiral
        }

        /// <summary>Runs until every ball stops (AI, aim preview, tests, server).</summary>
        /// <returns>False if <paramref name="maxSeconds"/> elapsed first.</returns>
        public bool SimulateToRest(double maxSeconds = 30)
        {
            int maxSteps = (int)(maxSeconds / _dt);
            for (int i = 0; i < maxSteps; i++)
            {
                if (IsAtRest) return true;
                Step();
            }
            return IsAtRest;
        }

        public void ClearEvents() => Events.Clear();

        /// <summary>Deep copy sharing the immutable table and params (cheap).</summary>
        public PoolPhysicsWorld Clone()
        {
            var copy = new PoolPhysicsWorld(Table, Params, Balls.Length);
            copy.CopyStateFrom(this);
            return copy;
        }

        /// <summary>Copies ball states and time from another world with the same layout.</summary>
        public void CopyStateFrom(PoolPhysicsWorld other)
        {
            Array.Copy(other.Balls, Balls, Balls.Length);
            Time = other.Time;
            _accumulator = 0;
            Events.Clear();
        }

        // ------------------------------------------------------------------------------
        //  Stepping
        // ------------------------------------------------------------------------------

        /// <summary>One fixed sub-step of <see cref="PhysicsParams.FixedDt"/> seconds.</summary>
        public void Step()
        {
            double dt = _dt;

            // 1) Integrate free motion of every moving ball.
            for (int i = 0; i < Balls.Length; i++)
            {
                ref BallState b = ref Balls[i];
                if (!b.IsMoving) continue;
                Integrate(ref b, dt);
            }

            // 2) Collisions. A few passes handle chains (the break) within one step.
            for (int pass = 0; pass < MaxCollisionPasses; pass++)
            {
                bool any = ResolveBallBallCollisions(dt);
                any |= ResolveCushionCollisions();
                if (!any) break;
            }

            // 3) Slate landings, pockets, leaving the table.
            for (int i = 0; i < Balls.Length; i++)
            {
                ref BallState b = ref Balls[i];
                if (!b.IsMoving) continue; // resting balls cannot reach a pocket

                if (b.Motion == BallMotion.Airborne && b.Position.Y <= _r && b.Velocity.Y <= 0)
                    ResolveTableImpact(i);

                CheckPocketsAndBounds(i);
                if (b.IsOnTable) Classify(ref b);
            }

            Time += dt;
        }

        private void Integrate(ref BallState b, double dt)
        {
            double g = Params.Gravity;

            switch (b.Motion)
            {
                case BallMotion.Airborne:
                    b.Position += b.Velocity * dt + new DVec3(0, -0.5 * g * dt * dt, 0);
                    b.Velocity += new DVec3(0, -g * dt, 0);
                    return; // no cloth friction, spin unchanged

                case BallMotion.Sliding:
                    IntegrateSliding(ref b, dt);
                    break;

                case BallMotion.Rolling:
                    IntegrateRolling(ref b, dt);
                    break;

                case BallMotion.Spinning:
                    break; // only the vertical spin decays (below)
            }

            // Vertical-axis spin friction applies to every regime on the cloth.
            double wy = b.AngularVelocity.Y;
            double dwy = Params.SpinDeceleration * dt;
            wy = Math.Abs(wy) <= dwy ? 0 : wy - Math.Sign(wy) * dwy;
            b.AngularVelocity = new DVec3(b.AngularVelocity.X, wy, b.AngularVelocity.Z);
        }

        private void IntegrateSliding(ref BallState b, double dt)
        {
            double g = Params.Gravity;
            double mu = Params.MuSlide;

            DVec3 u = SlipVelocity(b);
            double uLen = u.Length;
            // Slip speed decreases linearly at 7/2 * mu * g (classic result).
            double slipDecay = 3.5 * mu * g;
            double tSlide = uLen / slipDecay;

            if (tSlide >= dt)
            {
                ApplySlidingFriction(ref b, u / uLen, dt);
                return;
            }

            // Slip ends inside this step: slide for tSlide, then roll for the rest.
            if (uLen > 0) ApplySlidingFriction(ref b, u / uLen, tSlide);
            LockToRolling(ref b);
            b.Motion = BallMotion.Rolling;
            IntegrateRolling(ref b, dt - tSlide, b.Position);
        }

        /// <summary>Kinetic friction for duration t with constant slip direction uHat.</summary>
        private void ApplySlidingFriction(ref BallState b, DVec3 uHat, double t)
        {
            double g = Params.Gravity;
            double mu = Params.MuSlide;

            // dv = -mu g uHat t; position uses the average velocity over t.
            DVec3 dv = uHat * (-mu * g * t);
            b.Position += (b.Velocity + dv * 0.5) * t;
            b.Velocity += dv;

            // dw = (r x F)/I with r = (0,-R,0), F = -mu m g uHat
            //    = (5 mu g / 2R) * (uHat.z, 0, -uHat.x) * t
            double k = 5.0 * mu * g / (2.0 * _r) * t;
            b.AngularVelocity += new DVec3(uHat.Z * k, 0, -uHat.X * k);
        }

        private void IntegrateRolling(ref BallState b, double dt) => IntegrateRolling(ref b, dt, b.Position);

        private void IntegrateRolling(ref BallState b, double dt, DVec3 start)
        {
            double decel = Params.MuRoll * Params.Gravity;
            DVec3 v = b.Velocity.Horizontal;
            double speed = v.Length;

            if (speed <= decel * dt)
            {
                // Comes to rest inside this step.
                double tStop = speed / decel;
                b.Position = start + v * (0.5 * tStop);
                b.Velocity = DVec3.Zero;
            }
            else
            {
                DVec3 dv = v / speed * (-decel * dt);
                b.Position = start + (v + dv * 0.5) * dt;
                b.Velocity = v + dv;
            }
            LockToRolling(ref b);
        }

        /// <summary>Sets horizontal spin so the contact point is at rest: w_x = v_z/R, w_z = -v_x/R.</summary>
        private void LockToRolling(ref BallState b)
        {
            DVec3 v = b.Velocity;
            b.AngularVelocity = new DVec3(v.Z / _r, b.AngularVelocity.Y, -v.X / _r);
        }

        /// <summary>Velocity of the contact point with the cloth: v + w x (0,-R,0).</summary>
        private DVec3 SlipVelocity(in BallState b)
        {
            DVec3 w = b.AngularVelocity;
            return new DVec3(b.Velocity.X + _r * w.Z, 0, b.Velocity.Z - _r * w.X);
        }

        /// <summary>Picks the motion regime from the current velocities.</summary>
        private void Classify(ref BallState b)
        {
            if (b.Position.Y > _r + AirborneEpsilon || b.Velocity.Y > AirborneEpsilon)
            {
                b.Motion = BallMotion.Airborne;
                return;
            }

            // On the cloth: kill tiny vertical drift.
            b.Position = new DVec3(b.Position.X, _r, b.Position.Z);
            b.Velocity = b.Velocity.Horizontal;

            if (SlipVelocity(b).Length > SlipEpsilon)
                b.Motion = BallMotion.Sliding;
            else if (b.Velocity.Length > SpeedEpsilon)
                b.Motion = BallMotion.Rolling;
            else if (Math.Abs(b.AngularVelocity.Y) > SpeedEpsilon)
            {
                b.Motion = BallMotion.Spinning;
                b.Velocity = DVec3.Zero;
                b.AngularVelocity = new DVec3(0, b.AngularVelocity.Y, 0);
            }
            else
            {
                b.Motion = BallMotion.Stationary;
                b.Velocity = DVec3.Zero;
                b.AngularVelocity = DVec3.Zero;
            }
        }

        // ------------------------------------------------------------------------------
        //  Ball <-> ball
        // ------------------------------------------------------------------------------

        private bool ResolveBallBallCollisions(double dt)
        {
            bool any = false;
            double minDist = 2 * _r;
            double minDistSq = minDist * minDist;

            for (int i = 0; i < Balls.Length; i++)
            {
                if (!Balls[i].IsOnTable) continue;
                for (int j = i + 1; j < Balls.Length; j++)
                {
                    if (!Balls[j].IsOnTable) continue;
                    // Two resting balls never need checking: the big win for performance.
                    if (!Balls[i].IsMoving && !Balls[j].IsMoving) continue;

                    DVec3 d = Balls[j].Position - Balls[i].Position;
                    if (d.LengthSq >= minDistSq) continue;

                    if (CollideBalls(i, j, dt)) any = true;
                }
            }
            return any;
        }

        private bool CollideBalls(int ia, int ib, double dt)
        {
            ref BallState a = ref Balls[ia];
            ref BallState b = ref Balls[ib];

            // --- Time-of-impact rewind ------------------------------------------------
            // Solve |(pA - vA t) - (pB - vB t)| = 2R for the smallest t >= 0 going back in
            // time, so the impulse is applied at the true contact geometry. This is what
            // keeps cut angles accurate even at break speed.
            DVec3 dp = a.Position - b.Position;
            DVec3 dv = a.Velocity - b.Velocity;
            double vv = dv.LengthSq;
            double tBack = 0;
            if (vv > 1e-12)
            {
                double pv = DVec3.Dot(dp, dv);
                double cc = dp.LengthSq - 4 * _r * _r; // negative while overlapping
                double disc = pv * pv - vv * cc;
                if (disc > 0)
                {
                    tBack = (pv + Math.Sqrt(disc)) / vv;
                    if (tBack < 0) tBack = 0;
                    if (tBack > dt) tBack = dt;
                }
            }
            a.Position -= a.Velocity * tBack;
            b.Position -= b.Velocity * tBack;

            DVec3 n = (b.Position - a.Position).Normalized; // A -> B
            double approach = DVec3.Dot(a.Velocity - b.Velocity, n);
            bool collided = false;

            if (approach > 0)
            {
                ApplyBallBallImpulse(ref a, ref b, n, approach);
                collided = true;
                Emit(PhysicsEventType.BallBall, ia, ib, -1, approach);
            }

            // Re-advance by the rewound time with the new velocities.
            a.Position += a.Velocity * tBack;
            b.Position += b.Velocity * tBack;

            // Resting contact / numerical overlap: separate symmetrically.
            DVec3 sep = b.Position - a.Position;
            double dist = sep.Length;
            if (dist < 2 * _r && dist > 1e-12)
            {
                DVec3 push = sep / dist * ((2 * _r - dist) * 0.5);
                a.Position -= push;
                b.Position += push;
            }

            if (collided)
            {
                Classify(ref a);
                Classify(ref b);
            }
            return collided;
        }

        /// <summary>
        /// Equal-mass spheres, normal restitution + Coulomb friction at the contact point.
        /// Friction is capped by the impulse that would stop the tangential slip
        /// (|vt| * m / 7 for two equal solid spheres), which yields realistic throw:
        /// largest for slow, stun cut shots and for inside/outside english.
        /// </summary>
        private void ApplyBallBallImpulse(ref BallState a, ref BallState b, DVec3 n, double approach)
        {
            DVec3 rA = n * _r;
            DVec3 rB = -rA;

            DVec3 vcA = a.Velocity + DVec3.Cross(a.AngularVelocity, rA);
            DVec3 vcB = b.Velocity + DVec3.Cross(b.AngularVelocity, rB);
            DVec3 rel = vcA - vcB;

            double jn = (1 + Params.BallRestitution) * approach * _m * 0.5;

            DVec3 vt = rel - n * DVec3.Dot(rel, n);
            double vtLen = vt.Length;
            DVec3 impulseOnA = n * -jn;
            if (vtLen > 1e-9)
            {
                double mu = Params.BallFrictionA + Params.BallFrictionB * Math.Exp(-Params.BallFrictionC * vtLen);
                double jt = Math.Min(mu * jn, vtLen * _m / 7.0);
                impulseOnA -= vt / vtLen * jt;
            }

            a.Velocity += impulseOnA / _m;
            b.Velocity -= impulseOnA / _m;
            // rA x P == rB x (-P): both balls receive the same angular impulse.
            DVec3 dw = DVec3.Cross(rA, impulseOnA) / _inertia;
            a.AngularVelocity += dw;
            b.AngularVelocity += dw;
        }

        // ------------------------------------------------------------------------------
        //  Ball <-> cushion
        // ------------------------------------------------------------------------------

        private bool ResolveCushionCollisions()
        {
            bool any = false;
            double h = Params.CushionHeight;
            var cushions = Table.Cushions;

            for (int i = 0; i < Balls.Length; i++)
            {
                ref BallState b = ref Balls[i];
                if (!b.IsMoving || b.Motion == BallMotion.Spinning) continue;
                // Broad phase: every cushion lies on or outside the playing-area edge.
                if (Math.Abs(b.Position.X) < _cushionFreeHalfLength
                    && Math.Abs(b.Position.Z) < _cushionFreeHalfWidth) continue;

                for (int c = 0; c < cushions.Count; c++)
                {
                    DVec3 q = cushions[c].ClosestPoint(b.Position);
                    // The ball touches the cushion nose at height h, above its equator,
                    // so the contact normal points slightly downwards into the ball.
                    var contact = new DVec3(q.X, h, q.Z);
                    DVec3 delta = b.Position - contact;
                    double distSq = delta.LengthSq;
                    if (distSq >= _r * _r) continue;

                    double dist = Math.Sqrt(distSq);
                    if (dist < 1e-9) continue;
                    DVec3 n = delta / dist; // from cushion into the ball

                    // Push out horizontally (the slate keeps the ball at y = R).
                    DVec3 nh = n.Horizontal.Normalized;
                    double horizontalNeeded = Math.Sqrt(Math.Max(0, _r * _r - (b.Position.Y - h) * (b.Position.Y - h)));
                    double horizontalNow = delta.Horizontal.Length;
                    b.Position += nh * (horizontalNeeded - horizontalNow + 1e-7);

                    double vn = DVec3.Dot(b.Velocity, n);
                    if (vn >= 0) continue; // already separating

                    double e = Math.Max(Params.CushionRestitutionMin,
                        Params.CushionRestitution - Params.CushionRestitutionSpeedFactor * -vn);
                    ApplyStaticImpulse(ref b, n, e, Params.CushionFriction);

                    // The downward normal pushes the ball into the slate, which absorbs it.
                    if (b.Motion != BallMotion.Airborne && b.Velocity.Y < 0)
                        b.Velocity = b.Velocity.Horizontal;

                    Emit(PhysicsEventType.BallCushion, i, -1, c, -vn);
                    Classify(ref b);
                    any = true;
                }
            }
            return any;
        }

        // ------------------------------------------------------------------------------
        //  Ball <-> slate
        // ------------------------------------------------------------------------------

        private void ResolveTableImpact(int index)
        {
            ref BallState b = ref Balls[index];
            b.Position = new DVec3(b.Position.X, _r, b.Position.Z);
            double vy = b.Velocity.Y;
            if (vy >= 0) return;

            ApplyStaticImpulse(ref b, DVec3.Up, Params.TableRestitution, Params.TableFriction);
            if (b.Velocity.Y < Params.TableBounceStopSpeed)
                b.Velocity = b.Velocity.Horizontal; // settle on the cloth
            Emit(PhysicsEventType.TableBounce, index, -1, -1, -vy);
        }

        // ------------------------------------------------------------------------------
        //  Shared impulse routine
        // ------------------------------------------------------------------------------

        /// <summary>
        /// Impulse between a ball and an immovable surface with normal <paramref name="n"/>
        /// (pointing into the ball). Contact point r = -nR. Normal restitution e, Coulomb
        /// friction mu capped at the impulse that stops tangential slip (2m|vt|/7).
        /// </summary>
        private void ApplyStaticImpulse(ref BallState b, DVec3 n, double e, double mu)
        {
            DVec3 r = n * -_r;
            DVec3 vc = b.Velocity + DVec3.Cross(b.AngularVelocity, r);
            double vn = DVec3.Dot(vc, n);
            if (vn >= 0) return;

            double jn = -(1 + e) * vn * _m;
            DVec3 impulse = n * jn;

            DVec3 vt = vc - n * vn;
            double vtLen = vt.Length;
            if (vtLen > 1e-9)
            {
                double jt = Math.Min(mu * jn, vtLen * 2.0 * _m / 7.0);
                impulse -= vt / vtLen * jt;
            }

            b.Velocity += impulse / _m;
            b.AngularVelocity += DVec3.Cross(r, impulse) / _inertia;
        }

        // ------------------------------------------------------------------------------
        //  Pockets & bounds
        // ------------------------------------------------------------------------------

        private void CheckPocketsAndBounds(int index)
        {
            ref BallState b = ref Balls[index];
            var pockets = Table.Pockets;
            for (int p = 0; p < pockets.Count; p++)
            {
                DVec3 d = (b.Position - pockets[p].Center).Horizontal;
                if (d.LengthSq < pockets[p].CaptureRadius * pockets[p].CaptureRadius
                    && b.Position.Y < _r + Params.CushionHeight)
                {
                    b.Motion = BallMotion.Pocketed;
                    Emit(PhysicsEventType.BallPocketed, index, -1, p, b.Velocity.Length);
                    b.Velocity = DVec3.Zero;
                    b.AngularVelocity = DVec3.Zero;
                    return;
                }
            }

            const double margin = 0.08;
            if (Math.Abs(b.Position.X) > Table.HalfLength + margin
                || Math.Abs(b.Position.Z) > Table.HalfWidth + margin)
            {
                b.Motion = BallMotion.OffTable;
                b.Velocity = DVec3.Zero;
                b.AngularVelocity = DVec3.Zero;
                Emit(PhysicsEventType.BallOffTable, index, -1, -1, 0);
            }
        }

        private void Emit(PhysicsEventType type, int a, int b, int feature, double speed)
        {
            if (RecordEvents) Events.Add(new PhysicsEvent(type, Time, a, b, feature, speed));
        }
    }
}
