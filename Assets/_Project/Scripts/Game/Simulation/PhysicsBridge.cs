using Billiards.Physics;
using UnityEngine;

namespace Billiards.Game
{
    /// <summary>Conversions between the engine-free physics core and Unity types.</summary>
    public static class PhysicsBridge
    {
        public static Vector3 ToUnity(this DVec3 v) => new Vector3((float)v.X, (float)v.Y, (float)v.Z);
        public static DVec3 ToSim(this Vector3 v) => new DVec3(v.x, v.y, v.z);

        /// <summary>Heading (radians, 0 = +X, PI/2 = +Z) from a horizontal Unity direction.</summary>
        public static double HeadingOf(Vector3 dir) => System.Math.Atan2(dir.z, dir.x);

        /// <summary>Unit horizontal direction from a heading.</summary>
        public static Vector3 DirectionOf(double heading) =>
            new Vector3((float)System.Math.Cos(heading), 0f, (float)System.Math.Sin(heading));
    }
}
