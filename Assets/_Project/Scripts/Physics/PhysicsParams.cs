using System;

namespace Billiards.Physics
{
    /// <summary>
    /// Every tunable constant of the simulation in one place (SI units: m, kg, s, rad).
    /// Defaults follow published measurements for pool (Marlow "The Physics of Pocket
    /// Billiards", Dr. Dave Alciatore's technical proofs, Mathavan et al. 2010) and are a
    /// good starting point; the Unity side exposes them through a ScriptableObject so
    /// designers can tune "table feel" without touching code.
    /// </summary>
    [Serializable]
    public sealed class PhysicsParams
    {
        // ---- Ball -------------------------------------------------------------------
        public double BallRadius = 0.028575;   // 2.25" ball
        public double BallMass = 0.170;        // 6 oz

        // ---- Environment -----------------------------------------------------------
        public double Gravity = 9.81;

        // ---- Ball <-> cloth --------------------------------------------------------
        /// <summary>Sliding friction coefficient. Controls how fast draw/follow "takes".</summary>
        public double MuSlide = 0.20;
        /// <summary>Rolling resistance. 0.01 = medium-speed cloth.</summary>
        public double MuRoll = 0.010;
        /// <summary>Angular deceleration of spin about the vertical axis (rad/s^2).</summary>
        public double SpinDeceleration = 10.0;

        // ---- Ball <-> ball ---------------------------------------------------------
        public double BallRestitution = 0.95;
        /// <summary>
        /// Ball-ball friction, speed dependent (Alciatore's fit to measured throw):
        /// mu(v) = A + B * exp(-C * v), v = sliding speed at the contact point.
        /// Slow shots throw more than fast ones, exactly as players observe.
        /// </summary>
        public double BallFrictionA = 0.009951;
        public double BallFrictionB = 0.108;
        public double BallFrictionC = 1.088;

        // ---- Ball <-> cushion -----------------------------------------------------
        public double CushionRestitution = 0.85;
        /// <summary>Restitution falls slightly at high speed: e = max(min, e0 - k*|vn|).</summary>
        public double CushionRestitutionSpeedFactor = 0.02;
        public double CushionRestitutionMin = 0.70;
        /// <summary>Cushion friction. Gives "running" vs "reverse" english off the rail.</summary>
        public double CushionFriction = 0.20;
        /// <summary>Height of the cushion nose above the cloth (~63.5% of ball diameter).</summary>
        public double CushionHeight = 0.0363;

        // ---- Ball <-> slate (landing after a jump) --------------------------------
        public double TableRestitution = 0.50;
        public double TableFriction = 0.20;
        /// <summary>Below this vertical speed a landing ball stops bouncing.</summary>
        public double TableBounceStopSpeed = 0.05;

        // ---- Cue -------------------------------------------------------------------
        public double CueMass = 0.54;          // 19 oz
        public double TipRestitution = 0.75;
        /// <summary>Effective end mass of the shaft; drives squirt (cue ball deflection).</summary>
        public double CueEndMass = 0.010;
        /// <summary>Max tip offset as a fraction of R. Beyond ~0.5R a real tip miscues.</summary>
        public double MaxTipOffset = 0.5;
        public double MaxCueSpeed = 8.0;       // ~ a hard break

        // ---- Integration -----------------------------------------------------------
        /// <summary>
        /// Fixed sub-step. 1/1200 s keeps a 12 m/s break ball moving &lt; 0.35 R per step,
        /// so with time-of-impact rewind nothing tunnels. Fixed (not adaptive) so the
        /// result is independent of frame rate -> deterministic replays and netcode.
        /// </summary>
        public double FixedDt = 1.0 / 1200.0;

        // ---- Derived (cached) --------------------------------------------------------
        public double Inertia => 0.4 * BallMass * BallRadius * BallRadius; // solid sphere

        public PhysicsParams Clone() => (PhysicsParams)MemberwiseClone();
    }
}
