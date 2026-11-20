using System;
using System.Collections.Generic;

namespace Billiards.Physics
{
    /// <summary>A straight piece of cushion nose, in the table plane (Y ignored).</summary>
    public readonly struct CushionSegment
    {
        public readonly DVec3 A;
        public readonly DVec3 B;
        /// <summary>True for the short angled pieces leading into pockets.</summary>
        public readonly bool IsJaw;

        public CushionSegment(DVec3 a, DVec3 b, bool isJaw)
        {
            A = a.Horizontal;
            B = b.Horizontal;
            IsJaw = isJaw;
        }

        /// <summary>Closest point on the segment to <paramref name="p"/> (horizontal).</summary>
        public DVec3 ClosestPoint(DVec3 p)
        {
            DVec3 ab = B - A;
            double t = DVec3.Dot(p.Horizontal - A, ab) / ab.LengthSq;
            if (t < 0) t = 0;
            else if (t > 1) t = 1;
            return A + ab * t;
        }
    }

    public readonly struct Pocket
    {
        public readonly DVec3 Center;
        /// <summary>A ball whose centre comes within this horizontal distance drops.</summary>
        public readonly double CaptureRadius;
        public readonly bool IsCorner;

        public Pocket(DVec3 center, double captureRadius, bool isCorner)
        {
            Center = center.Horizontal;
            CaptureRadius = captureRadius;
            IsCorner = isCorner;
        }
    }

    /// <summary>
    /// Collision geometry of a table: cushion noses as line segments (their end points
    /// act as rounded pocket jaws for free) and pockets as capture circles.
    /// The playing area is centred on the origin, long axis along X.
    ///
    /// Data-driven on purpose: 7/8/9-ft tables, tight "pro" pockets or a snooker-like
    /// layout are just different numbers, no code changes.
    /// </summary>
    public sealed class TableGeometry
    {
        public readonly double Length;   // playing surface, X
        public readonly double Width;    // playing surface, Z
        public readonly IReadOnlyList<CushionSegment> Cushions;
        public readonly IReadOnlyList<Pocket> Pockets;

        public TableGeometry(double length, double width, IReadOnlyList<CushionSegment> cushions, IReadOnlyList<Pocket> pockets)
        {
            Length = length;
            Width = width;
            Cushions = cushions;
            Pockets = pockets;
        }

        public double HalfLength => Length * 0.5;
        public double HalfWidth => Width * 0.5;

        /// <summary>Foot spot (apex ball of the rack) — centre of the foot half.</summary>
        public DVec3 FootSpot => new DVec3(Length * 0.25, 0, 0);
        /// <summary>Head spot, where the cue ball is usually placed for the break.</summary>
        public DVec3 HeadSpot => new DVec3(-Length * 0.25, 0, 0);
        /// <summary>X coordinate of the head string ("kitchen" line).</summary>
        public double HeadStringX => -Length * 0.25;

        public bool IsInsidePlayArea(DVec3 p, double margin)
            => Math.Abs(p.X) <= HalfLength - margin && Math.Abs(p.Z) <= HalfWidth - margin;

        /// <summary>
        /// Builds a WPA-style pocket table.
        /// </summary>
        /// <param name="length">Playing surface length (9 ft table: 2.54 m).</param>
        /// <param name="width">Playing surface width (9 ft table: 1.27 m).</param>
        /// <param name="cornerMouth">Corner pocket opening between jaw tips (WPA 4.5"-4.625").</param>
        /// <param name="sideMouth">Side pocket opening (WPA 5"-5.125").</param>
        public static TableGeometry CreateStandard(
            double length = 2.54, double width = 1.27,
            double cornerMouth = 0.116, double sideMouth = 0.130)
        {
            var cushions = new List<CushionSegment>(18);
            var pockets = new List<Pocket>(6);

            double hl = length * 0.5, hw = width * 0.5;
            // Distance from the corner to each jaw tip along the rail.
            double a = cornerMouth / Math.Sqrt(2.0);
            double hs = sideMouth * 0.5;
            const double cornerJawLength = 0.060;
            const double sideJawLength = 0.045;
            const double sideJawConvergence = 0.25; // side pocket throat narrows inward

            foreach (int sz in new[] { -1, 1 })
            {
                // Long rails, split by the side pocket.
                double z = sz * hw;
                cushions.Add(new CushionSegment(new DVec3(-(hl - a), 0, z), new DVec3(-hs, 0, z), false));
                cushions.Add(new CushionSegment(new DVec3(hs, 0, z), new DVec3(hl - a, 0, z), false));

                // Side pocket jaws converge slightly towards the back of the pocket.
                var outward = new DVec3(0, 0, sz);
                var leftJawDir = (outward + new DVec3(sideJawConvergence, 0, 0)).Normalized;
                var rightJawDir = (outward + new DVec3(-sideJawConvergence, 0, 0)).Normalized;
                var leftTip = new DVec3(-hs, 0, z);
                var rightTip = new DVec3(hs, 0, z);
                cushions.Add(new CushionSegment(leftTip, leftTip + leftJawDir * sideJawLength, true));
                cushions.Add(new CushionSegment(rightTip, rightTip + rightJawDir * sideJawLength, true));
                pockets.Add(new Pocket(new DVec3(0, 0, sz * (hw + 0.020)), 0.045, false));
            }

            foreach (int sx in new[] { -1, 1 })
            {
                // Short rails.
                double x = sx * hl;
                cushions.Add(new CushionSegment(new DVec3(x, 0, -(hw - a)), new DVec3(x, 0, hw - a), false));

                foreach (int sz in new[] { -1, 1 })
                {
                    // Corner pocket: two jaws parallel to the 45-degree pocket axis.
                    var corner = new DVec3(sx * hl, 0, sz * hw);
                    var axis = new DVec3(sx, 0, sz).Normalized;
                    var longRailTip = new DVec3(sx * (hl - a), 0, sz * hw);
                    var shortRailTip = new DVec3(sx * hl, 0, sz * (hw - a));
                    cushions.Add(new CushionSegment(longRailTip, longRailTip + axis * cornerJawLength, true));
                    cushions.Add(new CushionSegment(shortRailTip, shortRailTip + axis * cornerJawLength, true));
                    pockets.Add(new Pocket(corner + axis * 0.010, 0.045, true));
                }
            }

            return new TableGeometry(length, width, cushions, pockets);
        }
    }
}
