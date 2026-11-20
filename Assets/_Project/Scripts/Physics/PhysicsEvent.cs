namespace Billiards.Physics
{
    public enum PhysicsEventType : byte
    {
        CueStrike,
        BallBall,
        BallCushion,
        BallPocketed,
        BallOffTable,
        TableBounce,
    }

    /// <summary>
    /// Something that happened during a shot. The rules engine (8-Ball / 9-Ball) only
    /// looks at this list: first ball contacted, rails touched, balls pocketed.
    /// The presentation layer uses the same events for sounds and haptics
    /// (Speed drives the volume).
    /// </summary>
    public readonly struct PhysicsEvent
    {
        public readonly PhysicsEventType Type;
        /// <summary>Simulation time of the event (seconds since the shot started).</summary>
        public readonly double Time;
        /// <summary>Index of the primary ball in the world's ball array.</summary>
        public readonly int BallA;
        /// <summary>Second ball index for BallBall, otherwise -1.</summary>
        public readonly int BallB;
        /// <summary>Cushion index for BallCushion, pocket index for BallPocketed, otherwise -1.</summary>
        public readonly int Feature;
        /// <summary>Relative normal speed at impact (m/s).</summary>
        public readonly double Speed;

        public PhysicsEvent(PhysicsEventType type, double time, int ballA, int ballB, int feature, double speed)
        {
            Type = type;
            Time = time;
            BallA = ballA;
            BallB = ballB;
            Feature = feature;
            Speed = speed;
        }

        public override string ToString() => $"{Time:F3}s {Type} a={BallA} b={BallB} f={Feature} v={Speed:F2}";
    }
}
