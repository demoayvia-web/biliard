using System;
using Billiards.Physics;
using NUnit.Framework;

namespace Billiards.Tests
{
    /// <summary>
    /// Physics regression tests. Each one checks a textbook billiards result, so a
    /// tuning change that breaks "real" behaviour fails CI instead of shipping.
    /// Run in Unity: Window > General > Test Runner > EditMode.
    /// </summary>
    public class PhysicsTests
    {
        private static PoolPhysicsWorld NewWorld(int balls = 16)
            => new PoolPhysicsWorld(TableGeometry.CreateStandard(), new PhysicsParams(), balls);

        private static void SetMoving(PoolPhysicsWorld w, int i, DVec3 velocity, DVec3 spin)
        {
            w.Balls[i].Velocity = velocity;
            w.Balls[i].AngularVelocity = spin;
            w.Balls[i].Motion = BallMotion.Sliding;
        }

        /// <summary>Step until the first event of the given type; returns false on timeout.</summary>
        private static bool StepUntil(PoolPhysicsWorld w, PhysicsEventType type, double maxSeconds = 10)
        {
            int start = w.Events.Count;
            for (int s = 0; s < maxSeconds / w.Params.FixedDt; s++)
            {
                w.Step();
                for (int e = start; e < w.Events.Count; e++)
                    if (w.Events[e].Type == type) return true;
            }
            return false;
        }

        [Test]
        public void SlidingBall_WithoutSpin_RollsAtFiveSevenths()
        {
            var w = NewWorld(1);
            w.PlaceBall(0, -1.0, 0);
            SetMoving(w, 0, new DVec3(2.0, 0, 0), DVec3.Zero);

            while (w.Balls[0].Motion == BallMotion.Sliding) w.Step();

            Assert.AreEqual(BallMotion.Rolling, w.Balls[0].Motion);
            Assert.AreEqual(2.0 * 5.0 / 7.0, w.Balls[0].Velocity.Length, 0.01);
        }

        [Test]
        public void RollingBall_StopsAtExpectedDistance()
        {
            var w = NewWorld(1);
            var p = w.Params;
            const double v0 = 0.5;
            w.PlaceBall(0, -1.0, 0);
            w.Balls[0].Velocity = new DVec3(v0, 0, 0);
            w.Balls[0].AngularVelocity = new DVec3(0, 0, -v0 / p.BallRadius);
            w.Balls[0].Motion = BallMotion.Rolling;

            Assert.IsTrue(w.SimulateToRest());
            double expected = v0 * v0 / (2 * p.MuRoll * p.Gravity);
            Assert.AreEqual(expected, w.Balls[0].Position.X + 1.0, expected * 0.01);
        }

        [Test]
        public void HeadOnStunShot_TransfersAlmostAllSpeed()
        {
            var w = NewWorld(2);
            w.PlaceBall(0, -0.5, 0);
            w.PlaceBall(1, -0.5 + 2 * w.Params.BallRadius + 0.002, 0);
            SetMoving(w, 0, new DVec3(2.0, 0, 0), DVec3.Zero);

            Assert.IsTrue(StepUntil(w, PhysicsEventType.BallBall));
            double cueAfter = w.Balls[0].Velocity.Length;
            double objAfter = w.Balls[1].Velocity.Length;
            double e = w.Params.BallRestitution;
            Assert.AreEqual((1 + e) / 2, objAfter / (objAfter + cueAfter), 0.01);
            Assert.Less(cueAfter, 0.1, "a stun shot should nearly stop the cue ball");
        }

        [Test]
        public void StunCutShot_SeparatesAtNinetyDegrees()
        {
            var w = NewWorld(2);
            double R = w.Params.BallRadius;
            const double cut = 30 * Math.PI / 180;
            // Object ball placed so that the line of centres at contact is 30 deg off the aim.
            var contactNormal = new DVec3(Math.Cos(cut), 0, Math.Sin(cut));
            w.PlaceBall(1, 0, 0);
            var ghost = -contactNormal * (2 * R);
            w.PlaceBall(0, ghost.X - 0.003, ghost.Z); // 3 mm run-up: still pure stun
            SetMoving(w, 0, new DVec3(1.5, 0, 0), DVec3.Zero);

            Assert.IsTrue(StepUntil(w, PhysicsEventType.BallBall));
            var vc = w.Balls[0].Velocity.Normalized;
            var vo = w.Balls[1].Velocity.Normalized;
            double angle = Math.Acos(DVec3.Dot(vc, vo)) * 180 / Math.PI;
            // Ideal balls separate at exactly 90 deg. Real balls (e < 1, throw) come out a
            // few degrees under; measured values are ~84-88 deg for a slow 30-deg stun cut.
            Assert.AreEqual(86, angle, 3.0, "90-degree rule (with realistic losses)");

            // Throw: the object ball is pushed a little along the cue direction (cut-induced throw).
            double throwDeg = Math.Acos(DVec3.Dot(vo, contactNormal)) * 180 / Math.PI;
            Assert.Greater(throwDeg, 1.0);
            Assert.Less(throwDeg, 5.0);
        }

        [Test]
        public void DrawShot_CueBallComesBack()
        {
            var w = NewWorld(2);
            w.PlaceBall(0, -0.6, 0);
            w.PlaceBall(1, 0.0, 0);
            w.Strike(0, new CueStrike(heading: 0, speed: 3.0, side: 0, vertical: -0.45));

            Assert.IsTrue(StepUntil(w, PhysicsEventType.BallBall));
            double contactX = w.Balls[0].Position.X;
            w.SimulateToRest();
            Assert.Less(w.Balls[0].Position.X, contactX - 0.1, "draw should pull the cue ball back");
        }

        [Test]
        public void FollowShot_CueBallRollsThrough()
        {
            var w = NewWorld(2);
            w.PlaceBall(0, -0.6, 0);
            w.PlaceBall(1, 0.0, 0);
            w.Strike(0, new CueStrike(heading: 0, speed: 2.0, side: 0, vertical: 0.45));

            Assert.IsTrue(StepUntil(w, PhysicsEventType.BallBall));
            double contactX = w.Balls[0].Position.X;
            w.SimulateToRest();
            Assert.Greater(w.Balls[0].Position.X, contactX + 0.1, "follow should carry the cue ball forward");
        }

        [Test]
        public void PerpendicularCushionHit_ReboundsWithRestitution()
        {
            var w = NewWorld(1);
            var p = w.Params;
            w.PlaceBall(0, 0.6, 0.3);
            // Rolling towards the +Z long rail.
            const double v0 = 1.0;
            w.Balls[0].Velocity = new DVec3(0, 0, v0);
            w.Balls[0].AngularVelocity = new DVec3(v0 / p.BallRadius, 0, 0);
            w.Balls[0].Motion = BallMotion.Rolling;

            Assert.IsTrue(StepUntil(w, PhysicsEventType.BallCushion));
            double vz = w.Balls[0].Velocity.Z;
            Assert.Less(vz, 0, "ball must come back off the rail");
            Assert.AreEqual(p.CushionRestitution, -vz / v0, 0.12);
            Assert.AreEqual(0, w.Balls[0].Velocity.X, 1e-6, "no english -> no sideways deflection");
        }

        [Test]
        public void RightEnglish_IntoRail_ComesOffToTheRight()
        {
            var w = NewWorld(1);
            w.PlaceBall(0, 0.6, -0.3);
            // Shooting towards +Z: the shooter's right is +X (right = Up x d), as in Unity.
            w.Strike(0, new CueStrike(heading: Math.PI / 2, speed: 2.0, side: 0.45, vertical: 0));
            Assert.IsTrue(StepUntil(w, PhysicsEventType.BallCushion));
            for (int i = 0; i < 200; i++) w.Step();
            Assert.Greater(w.Balls[0].Velocity.X, 0.02, "side spin throws the rebound to the shooter's right");
        }

        [Test]
        public void ElevatedCue_ProducesJump()
        {
            var w = NewWorld(1);
            w.PlaceBall(0, -0.5, 0);
            w.Strike(0, new CueStrike(heading: 0, speed: 5.0, elevation: 30 * Math.PI / 180));
            bool wasAirborne = false;
            for (int i = 0; i < 600; i++)
            {
                w.Step();
                if (w.Balls[0].Motion == BallMotion.Airborne) wasAirborne = true;
            }
            Assert.IsTrue(wasAirborne);
        }

        [Test]
        public void EightBallRack_HasFifteenDistinctBalls_WithEightInTheMiddle()
        {
            var w = NewWorld();
            var rack = RackBuilder.EightBall(w.Table, w.Params, seed: 123);
            var seen = new bool[16];
            foreach (var s in rack)
            {
                Assert.IsFalse(seen[s.Ball], $"ball {s.Ball} racked twice");
                seen[s.Ball] = true;
            }
            for (int i = 1; i <= 15; i++) Assert.IsTrue(seen[i], $"ball {i} missing");
            Assert.AreEqual(8, rack[4].Ball);
            bool cornerSolid = rack[10].Ball < 8, otherSolid = rack[14].Ball < 8;
            Assert.IsTrue(cornerSolid != otherSolid, "back corners: one solid, one stripe");
        }

        private static PoolPhysicsWorld RunBreak()
        {
            var w = NewWorld();
            foreach (var spot in RackBuilder.EightBall(w.Table, w.Params, seed: 42))
                w.PlaceBall(spot.Ball, spot.X, spot.Z);
            w.PlaceBall(0, w.Table.HeadSpot.X, 0.05);
            w.Strike(0, new CueStrike(heading: -0.02, speed: 7.5, vertical: 0.1));
            Assert.IsTrue(w.SimulateToRest(40), "break must come to rest");
            return w;
        }

        [Test]
        public void Break_IsDeterministic_AndSettles()
        {
            var a = RunBreak();
            var b = RunBreak();
            for (int i = 0; i < a.Balls.Length; i++)
            {
                Assert.AreEqual(a.Balls[i].Motion, b.Balls[i].Motion);
                Assert.IsTrue(a.Balls[i].Position.Equals(b.Balls[i].Position), $"ball {i} diverged");
                Assert.IsFalse(double.IsNaN(a.Balls[i].Position.X), $"ball {i} is NaN");
            }
        }

        [Test]
        public void AimPredictor_FindsGhostBall()
        {
            var w = NewWorld(2);
            w.PlaceBall(0, -0.5, 0);
            w.PlaceBall(1, 0.3, 0);
            var pred = new AimPrediction();
            AimPredictor.Predict(w, 0, 0, 2, pred);

            Assert.AreEqual(1, pred.HitBall);
            Assert.AreEqual(0.3 - 2 * w.Params.BallRadius, pred.GhostPosition.X, 1e-9);
            Assert.AreEqual(0, pred.CutAngle, 1e-9);
        }

        [Test]
        public void AimPredictor_BanksOffCushion()
        {
            var w = NewWorld(1);
            w.PlaceBall(0, 0, 0);
            var pred = new AimPrediction();
            AimPredictor.Predict(w, 0, Math.PI / 4, 1, pred);
            Assert.AreEqual(-1, pred.HitBall);
            Assert.GreaterOrEqual(pred.CuePath.Count, 3, "start, cushion contact, end");
        }
    }
}
