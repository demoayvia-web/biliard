using System;
using System.Collections.Generic;

namespace Billiards.Physics
{
    /// <summary>Result of an aim-line query. Reused between frames to avoid garbage.</summary>
    public sealed class AimPrediction
    {
        /// <summary>Cue ball centre path: start, every cushion contact, end (ghost ball or cutoff).</summary>
        public readonly List<DVec3> CuePath = new List<DVec3>(8);
        /// <summary>Index of the first object ball hit, or -1.</summary>
        public int HitBall = -1;
        /// <summary>Where the cue ball centre is at first contact ("ghost ball").</summary>
        public DVec3 GhostPosition;
        /// <summary>Initial direction of the object ball (along the line of centres).</summary>
        public DVec3 ObjectDirection;
        /// <summary>Cue ball direction after contact for a stun shot (90-degree rule).</summary>
        public DVec3 CueDeflection;
        /// <summary>Cut angle in radians (0 = full ball).</summary>
        public double CutAngle;

        public void Clear()
        {
            CuePath.Clear();
            HitBall = -1;
            GhostPosition = ObjectDirection = CueDeflection = DVec3.Zero;
            CutAngle = 0;
        }
    }

    /// <summary>
    /// Fast geometric aim prediction (no friction, ideal reflections). Runs every frame
    /// while aiming. It is intentionally "honest geometry" — the assist level is a game
    /// design decision: the UI can hide bank lines or shorten the object-ball line for
    /// harder difficulty settings. For a full-physics preview (practice mode) clone the
    /// world and call SimulateToRest instead.
    /// </summary>
    public static class AimPredictor
    {
        public static void Predict(PoolPhysicsWorld world, int cueIndex, double heading, int maxCushions, AimPrediction result)
        {
            result.Clear();
            var p = world.Params;
            double R = p.BallRadius;
            // Horizontal radius of the ball at cushion-nose height (contact distance).
            double hOff = p.CushionHeight - R;
            double cushionReach = Math.Sqrt(Math.Max(0, R * R - hOff * hOff));

            DVec3 origin = world.Balls[cueIndex].Position.Horizontal;
            DVec3 dir = new DVec3(Math.Cos(heading), 0, Math.Sin(heading));
            result.CuePath.Add(origin);

            for (int bounce = 0; bounce <= maxCushions; bounce++)
            {
                // Nearest object ball (sphere sweep == ray vs circle of radius 2R).
                double bestBall = double.PositiveInfinity;
                int ballIndex = -1;
                for (int i = 0; i < world.Balls.Length; i++)
                {
                    if (i == cueIndex || !world.Balls[i].IsOnTable) continue;
                    double t = RayCircle(origin, dir, world.Balls[i].Position.Horizontal, 2 * R);
                    if (t < bestBall)
                    {
                        bestBall = t;
                        ballIndex = i;
                    }
                }

                // Nearest cushion (ray vs capsule around the nose line).
                double bestCushion = double.PositiveInfinity;
                DVec3 cushionNormal = DVec3.Zero;
                var cushions = world.Table.Cushions;
                for (int c = 0; c < cushions.Count; c++)
                {
                    double t = RayCapsule(origin, dir, cushions[c].A, cushions[c].B, cushionReach, out DVec3 nrm);
                    if (t < bestCushion)
                    {
                        bestCushion = t;
                        cushionNormal = nrm;
                    }
                }

                if (ballIndex >= 0 && bestBall <= bestCushion)
                {
                    DVec3 ghost = origin + dir * bestBall;
                    DVec3 objPos = world.Balls[ballIndex].Position.Horizontal;
                    DVec3 n = (objPos - ghost).Normalized;
                    result.CuePath.Add(ghost);
                    result.HitBall = ballIndex;
                    result.GhostPosition = ghost;
                    result.ObjectDirection = n;
                    result.CueDeflection = (dir - n * DVec3.Dot(dir, n)).Normalized;
                    result.CutAngle = Math.Acos(Math.Max(-1, Math.Min(1, DVec3.Dot(dir, n))));
                    return;
                }

                if (double.IsPositiveInfinity(bestCushion) || bounce == maxCushions)
                {
                    double len = double.IsPositiveInfinity(bestCushion) ? 0.5 : bestCushion;
                    result.CuePath.Add(origin + dir * len);
                    return;
                }

                origin += dir * bestCushion;
                result.CuePath.Add(origin);
                dir = (dir - cushionNormal * (2 * DVec3.Dot(dir, cushionNormal))).Normalized;
                origin += dir * 1e-6; // step off the surface
            }
        }

        /// <summary>Ray (unit dir) vs circle; returns distance or +inf.</summary>
        public static double RayCircle(DVec3 o, DVec3 d, DVec3 c, double radius)
        {
            DVec3 m = o - c;
            double b = DVec3.Dot(m, d);
            double cc = m.LengthSq - radius * radius;
            if (cc > 0 && b > 0) return double.PositiveInfinity; // outside, pointing away
            double disc = b * b - cc;
            if (disc < 0) return double.PositiveInfinity;
            double t = -b - Math.Sqrt(disc);
            return t >= 0 ? t : double.PositiveInfinity; // ignore if starting inside
        }

        /// <summary>Ray vs 2D capsule (segment AB inflated by radius). Outputs the surface normal.</summary>
        public static double RayCapsule(DVec3 o, DVec3 d, DVec3 a, DVec3 b, double radius, out DVec3 normal)
        {
            normal = DVec3.Zero;
            double best = double.PositiveInfinity;

            DVec3 ab = b - a;
            double len = ab.Length;
            DVec3 s = ab / len;
            var side = new DVec3(-s.Z, 0, s.X);

            // Two flat faces.
            for (int sign = -1; sign <= 1; sign += 2)
            {
                DVec3 nrm = side * sign;
                double denom = DVec3.Dot(d, nrm);
                if (denom >= -1e-12) continue; // parallel or moving away from this face
                DVec3 facePoint = a + nrm * radius;
                double t = DVec3.Dot(facePoint - o, nrm) / denom;
                if (t < 0 || t >= best) continue;
                double u = DVec3.Dot(o + d * t - a, s);
                if (u < 0 || u > len) continue;
                best = t;
                normal = nrm;
            }

            // Rounded ends (pocket jaw tips). Two explicit calls: no per-frame allocation.
            TestEnd(o, d, a, radius, ref best, ref normal);
            TestEnd(o, d, b, radius, ref best, ref normal);
            return best;
        }

        private static void TestEnd(DVec3 o, DVec3 d, DVec3 end, double radius, ref double best, ref DVec3 normal)
        {
            double t = RayCircle(o, d, end, radius);
            if (t < best)
            {
                best = t;
                normal = (o + d * t - end).Normalized;
            }
        }
    }
}
