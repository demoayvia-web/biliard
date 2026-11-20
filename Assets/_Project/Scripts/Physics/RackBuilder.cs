using System;
using System.Collections.Generic;

namespace Billiards.Physics
{
    /// <summary>Ball number + spot on the cloth (X/Z of the ball centre).</summary>
    public readonly struct RackSpot
    {
        public readonly int Ball;
        public readonly double X;
        public readonly double Z;

        public RackSpot(int ball, double x, double z)
        {
            Ball = ball;
            X = x;
            Z = z;
        }
    }

    /// <summary>
    /// Produces rack layouts. Pure and seeded: the same seed gives the same rack, so a
    /// networked game only has to share the seed.
    /// </summary>
    public static class RackBuilder
    {
        /// <summary>
        /// A hair of space between balls. A perfectly frozen rack is unstable to simulate
        /// and less fun; real racks are never perfect either.
        /// </summary>
        public const double DefaultGap = 0.0002;

        /// <summary>
        /// 8-Ball triangle: apex on the foot spot, 8 in the middle of the third row,
        /// one solid and one stripe in the back corners, the rest random.
        /// </summary>
        public static List<RackSpot> EightBall(TableGeometry table, PhysicsParams p, int seed, double gap = DefaultGap)
        {
            var slots = TriangleSlots(table, p, new[] { 1, 2, 3, 4, 5 }, gap);
            var rng = new Random(seed);

            var solids = Shuffle(new List<int> { 1, 2, 3, 4, 5, 6, 7 }, rng);
            var stripes = Shuffle(new List<int> { 9, 10, 11, 12, 13, 14, 15 }, rng);

            var balls = new int[15];
            const int eightSlot = 4;               // row 3, centre
            const int backLeft = 10, backRight = 14;
            balls[eightSlot] = 8;
            bool solidLeft = rng.Next(2) == 0;
            balls[backLeft] = solidLeft ? Pop(solids) : Pop(stripes);
            balls[backRight] = solidLeft ? Pop(stripes) : Pop(solids);

            var rest = new List<int>();
            rest.AddRange(solids);
            rest.AddRange(stripes);
            Shuffle(rest, rng);
            for (int i = 0, k = 0; i < 15; i++)
                if (balls[i] == 0) balls[i] = rest[k++];

            return Zip(balls, slots);
        }

        /// <summary>9-Ball diamond: 1 on the foot spot, 9 in the centre, 2..8 random.</summary>
        public static List<RackSpot> NineBall(TableGeometry table, PhysicsParams p, int seed, double gap = DefaultGap)
        {
            var slots = TriangleSlots(table, p, new[] { 1, 2, 3, 2, 1 }, gap);
            var rng = new Random(seed);
            var rest = Shuffle(new List<int> { 2, 3, 4, 5, 6, 7, 8 }, rng);

            var balls = new int[9];
            balls[0] = 1;
            balls[4] = 9; // row 3, centre
            for (int i = 0, k = 0; i < 9; i++)
                if (balls[i] == 0) balls[i] = rest[k++];

            return Zip(balls, slots);
        }

        private static List<(double x, double z)> TriangleSlots(TableGeometry table, PhysicsParams p, int[] rowSizes, double gap)
        {
            double d = 2 * p.BallRadius + gap;
            double dx = d * Math.Sqrt(3) / 2;
            var foot = table.FootSpot;
            var slots = new List<(double, double)>();
            for (int row = 0; row < rowSizes.Length; row++)
            {
                int n = rowSizes[row];
                for (int j = 0; j < n; j++)
                    slots.Add((foot.X + row * dx, (j - (n - 1) * 0.5) * d));
            }
            return slots;
        }

        private static List<RackSpot> Zip(int[] balls, List<(double x, double z)> slots)
        {
            var result = new List<RackSpot>(balls.Length);
            for (int i = 0; i < balls.Length; i++)
                result.Add(new RackSpot(balls[i], slots[i].x, slots[i].z));
            return result;
        }

        private static List<int> Shuffle(List<int> list, Random rng)
        {
            for (int i = list.Count - 1; i > 0; i--)
            {
                int j = rng.Next(i + 1);
                int tmp = list[i];
                list[i] = list[j];
                list[j] = tmp;
            }
            return list;
        }

        private static int Pop(List<int> list)
        {
            int v = list[list.Count - 1];
            list.RemoveAt(list.Count - 1);
            return v;
        }
    }
}
