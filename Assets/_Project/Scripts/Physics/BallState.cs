namespace Billiards.Physics
{
    /// <summary>
    /// Motion regimes of a pool ball. Each regime has its own equations of motion,
    /// which is what makes draw, follow, stun and masse behave like the real thing.
    /// </summary>
    public enum BallMotion : byte
    {
        /// <summary>No linear or angular motion.</summary>
        Stationary,
        /// <summary>Not translating, only spinning about the vertical axis.</summary>
        Spinning,
        /// <summary>Contact point slips on the cloth: kinetic friction acts (draw/follow/masse phase).</summary>
        Sliding,
        /// <summary>Pure rolling (contact point at rest): only rolling resistance acts.</summary>
        Rolling,
        /// <summary>In the air after a jump shot or a hop off a ball/cushion.</summary>
        Airborne,
        /// <summary>Fell into a pocket; no longer simulated.</summary>
        Pocketed,
        /// <summary>Left the playing surface (flew over a rail).</summary>
        OffTable,
    }

    /// <summary>
    /// Full dynamic state of one ball. A plain struct so the whole table state can be
    /// copied with a single Array.Copy (cheap cloning for AI look-ahead and aim preview).
    /// </summary>
    public struct BallState
    {
        /// <summary>Ball number: 0 = cue ball, 1..15 object balls.</summary>
        public int Number;
        public DVec3 Position;
        public DVec3 Velocity;
        /// <summary>Angular velocity (rad/s). Direction = spin axis (right-hand rule).</summary>
        public DVec3 AngularVelocity;
        public BallMotion Motion;

        public bool IsOnTable => Motion != BallMotion.Pocketed && Motion != BallMotion.OffTable;

        public bool IsMoving => Motion == BallMotion.Sliding
                                || Motion == BallMotion.Rolling
                                || Motion == BallMotion.Spinning
                                || Motion == BallMotion.Airborne;

        public override string ToString() => $"#{Number} {Motion} p={Position} v={Velocity} w={AngularVelocity}";
    }
}
