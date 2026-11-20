using System;

namespace Billiards.Physics
{
    /// <summary>
    /// Minimal double-precision 3D vector used by the simulation core.
    ///
    /// Why not UnityEngine.Vector3?
    ///  - The physics assembly has no engine references, so it can run on a background
    ///    thread (AI), inside plain NUnit tests and on a dedicated server later.
    ///  - Doubles keep long shots (many bounces) numerically stable, and the same
    ///    sequence of operations gives the same result on every ARM64 device, which is
    ///    the basis for "send only the shot parameters" online play.
    ///
    /// Axis convention matches Unity: X = long axis of the table, Y = up, Z = short axis.
    /// The table surface is the plane Y = 0; a resting ball has its centre at Y = R.
    /// </summary>
    [Serializable]
    public readonly struct DVec3 : IEquatable<DVec3>
    {
        public readonly double X;
        public readonly double Y;
        public readonly double Z;

        public DVec3(double x, double y, double z)
        {
            X = x;
            Y = y;
            Z = z;
        }

        public static readonly DVec3 Zero = new DVec3(0, 0, 0);
        public static readonly DVec3 Up = new DVec3(0, 1, 0);
        public static readonly DVec3 Right = new DVec3(1, 0, 0);
        public static readonly DVec3 Forward = new DVec3(0, 0, 1);

        public double LengthSq => X * X + Y * Y + Z * Z;
        public double Length => Math.Sqrt(LengthSq);

        /// <summary>The same vector with Y removed (projection onto the table plane).</summary>
        public DVec3 Horizontal => new DVec3(X, 0, Z);

        public DVec3 Normalized
        {
            get
            {
                double len = Length;
                return len > 1e-12 ? this / len : Zero;
            }
        }

        public static DVec3 operator +(DVec3 a, DVec3 b) => new DVec3(a.X + b.X, a.Y + b.Y, a.Z + b.Z);
        public static DVec3 operator -(DVec3 a, DVec3 b) => new DVec3(a.X - b.X, a.Y - b.Y, a.Z - b.Z);
        public static DVec3 operator -(DVec3 a) => new DVec3(-a.X, -a.Y, -a.Z);
        public static DVec3 operator *(DVec3 a, double s) => new DVec3(a.X * s, a.Y * s, a.Z * s);
        public static DVec3 operator *(double s, DVec3 a) => new DVec3(a.X * s, a.Y * s, a.Z * s);
        public static DVec3 operator /(DVec3 a, double s) => new DVec3(a.X / s, a.Y / s, a.Z / s);

        public static double Dot(DVec3 a, DVec3 b) => a.X * b.X + a.Y * b.Y + a.Z * b.Z;

        public static DVec3 Cross(DVec3 a, DVec3 b) => new DVec3(
            a.Y * b.Z - a.Z * b.Y,
            a.Z * b.X - a.X * b.Z,
            a.X * b.Y - a.Y * b.X);

        public static double Distance(DVec3 a, DVec3 b) => (a - b).Length;

        /// <summary>Rotates a vector around the world Y axis (positive = X towards Z).</summary>
        public static DVec3 RotateY(DVec3 v, double radians)
        {
            double c = Math.Cos(radians), s = Math.Sin(radians);
            return new DVec3(v.X * c - v.Z * s, v.Y, v.X * s + v.Z * c);
        }

        public bool Equals(DVec3 other) => X == other.X && Y == other.Y && Z == other.Z;
        public override bool Equals(object obj) => obj is DVec3 other && Equals(other);
        public override int GetHashCode()
        {
            unchecked
            {
                int h = X.GetHashCode();
                h = (h * 397) ^ Y.GetHashCode();
                return (h * 397) ^ Z.GetHashCode();
            }
        }
        public override string ToString() => $"({X:F4}, {Y:F4}, {Z:F4})";
    }
}
