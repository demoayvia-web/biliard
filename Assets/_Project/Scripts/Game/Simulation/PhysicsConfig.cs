using Billiards.Physics;
using UnityEngine;

namespace Billiards.Game
{
    /// <summary>
    /// Designer-facing physics tuning ("table feel"). Create several assets for different
    /// cloths: Assets > Create > Billiards > Physics Config. Values are converted into the
    /// engine-free <see cref="PhysicsParams"/> once when a match starts.
    /// </summary>
    [CreateAssetMenu(menuName = "Billiards/Physics Config", fileName = "PhysicsConfig")]
    public sealed class PhysicsConfig : ScriptableObject
    {
        [Header("Cloth")]
        [Range(0.05f, 0.4f)] public float muSlide = 0.20f;
        [Range(0.003f, 0.03f)] public float muRoll = 0.010f;
        [Range(1f, 40f)] public float spinDeceleration = 10f;

        [Header("Balls")]
        [Range(0.85f, 1f)] public float ballRestitution = 0.95f;
        [Tooltip("Scales Alciatore's speed-dependent ball-ball friction (throw). 1 = measured.")]
        [Range(0f, 2f)] public float throwScale = 1f;

        [Header("Cushions")]
        [Range(0.5f, 0.98f)] public float cushionRestitution = 0.85f;
        [Range(0f, 0.5f)] public float cushionFriction = 0.20f;

        [Header("Cue")]
        [Range(0.4f, 0.65f)] public float cueMass = 0.54f;
        [Tooltip("Shaft end mass. Lower = 'low deflection' shaft (less squirt).")]
        [Range(0.003f, 0.03f)] public float cueEndMass = 0.010f;
        [Range(2f, 12f)] public float maxCueSpeed = 8f;

        [Header("Simulation")]
        [Tooltip("Sub-steps per second. Must be identical on all peers for online play.")]
        [Range(600, 2400)] public int stepsPerSecond = 1200;

        public PhysicsParams ToParams()
        {
            var p = new PhysicsParams
            {
                MuSlide = muSlide,
                MuRoll = muRoll,
                SpinDeceleration = spinDeceleration,
                BallRestitution = ballRestitution,
                CushionRestitution = cushionRestitution,
                CushionFriction = cushionFriction,
                CueMass = cueMass,
                CueEndMass = cueEndMass,
                MaxCueSpeed = maxCueSpeed,
                FixedDt = 1.0 / stepsPerSecond,
            };
            p.BallFrictionA *= throwScale;
            p.BallFrictionB *= throwScale;
            return p;
        }
    }
}
