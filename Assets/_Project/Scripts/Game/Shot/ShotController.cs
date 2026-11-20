using System;
using Billiards.Physics;
using UnityEngine;

namespace Billiards.Game
{
    /// <summary>
    /// The "cue" in the player's hands: holds aim heading, power, tip offset (english) and
    /// cue elevation, feeds the aim preview and cue visual every frame, and turns the
    /// final input into a <see cref="CueStrike"/>.
    ///
    /// Input widgets (touch area, power slider, spin widget) only call the public methods
    /// here, and the AI drives exactly the same API — so the AI can never do anything a
    /// human can't, and replays/netcode only need the resulting CueStrike.
    /// </summary>
    public sealed class ShotController : MonoBehaviour
    {
        [SerializeField] private TableSimulation simulation;
        [SerializeField] private AimLineRenderer aimLine;
        [SerializeField] private CueView cueView;

        [Header("Feel")]
        [Tooltip("Maps slider position (0..1) to fraction of max cue speed. Ease-in gives fine control of soft shots.")]
        [SerializeField] private AnimationCurve powerCurve = new AnimationCurve(
            new Keyframe(0f, 0f, 0f, 0.4f), new Keyframe(1f, 1f, 2f, 0f));
        [Tooltip("Cushion bounces shown by the aim line (0 = none, assist off for hard mode).")]
        [SerializeField, Range(0, 3)] private int aimCushionBounces = 1;
        [SerializeField, Range(0f, 80f)] private float maxElevationDeg = 75f;

        /// <summary>Raised right after the strike is handed to the simulation.</summary>
        public event Action<CueStrike> ShotFired;

        /// <summary>Set by the game flow: true while a local human may shoot.</summary>
        public bool InputEnabled { get; set; } = true;

        public double Heading { get; private set; }
        public float Power01 { get; private set; }
        /// <summary>Tip offset in the unit disc: x = side (right +), y = vertical (top +).</summary>
        public Vector2 Spin { get; private set; }
        public float ElevationDeg { get; private set; }

        public bool CanAim => InputEnabled && simulation != null && !simulation.ShotInProgress
                              && simulation.World.Balls[0].IsOnTable;

        private readonly AimPrediction _prediction = new AimPrediction();

        // ------------------------------------------------------------------ input API

        public void SetHeading(double radians)
        {
            if (!CanAim) return;
            Heading = NormalizeAngle(radians);
        }

        public void RotateAim(double deltaRadians) => SetHeading(Heading + deltaRadians);

        /// <summary>Aims the cue ball at a point on the cloth (tap-to-aim).</summary>
        public void AimAtWorldPoint(Vector3 worldPoint)
        {
            if (!CanAim) return;
            Vector3 cue = simulation.BallWorldPosition(0);
            Vector3 local = simulation.Surface.InverseTransformDirection(worldPoint - cue);
            local.y = 0;
            if (local.sqrMagnitude > 1e-8f) SetHeading(PhysicsBridge.HeadingOf(local));
        }

        public void SetPower(float power01) => Power01 = Mathf.Clamp01(power01);

        public void SetSpin(Vector2 spin) => Spin = Vector2.ClampMagnitude(spin, 1f);

        public void SetElevation(float degrees) => ElevationDeg = Mathf.Clamp(degrees, 0f, maxElevationDeg);

        /// <summary>Builds the strike for the current input without firing it.</summary>
        public CueStrike BuildStrike()
        {
            var p = simulation.World.Params;
            double speed = p.MaxCueSpeed * Mathf.Clamp01(powerCurve.Evaluate(Power01));
            // Spin widget covers the whole legal tip area: unit disc -> MaxTipOffset * R.
            return new CueStrike(
                heading: Heading,
                speed: speed,
                side: Spin.x * p.MaxTipOffset,
                vertical: Spin.y * p.MaxTipOffset,
                elevation: ElevationDeg * Mathf.Deg2Rad);
        }

        /// <summary>Fires with the current input. Called by the power slider on release.</summary>
        public void Fire()
        {
            if (!CanAim || Power01 <= 0.01f) return;
            Execute(BuildStrike());
        }

        /// <summary>Fires an explicit strike (AI, replay, network). Bypasses InputEnabled.</summary>
        public void Execute(CueStrike strike)
        {
            if (simulation.ShotInProgress) return;
            Heading = strike.Heading;
            if (cueView != null) cueView.PlayStroke();
            simulation.Shoot(strike);
            Power01 = 0f;
            ShotFired?.Invoke(strike);
        }

        // ------------------------------------------------------------------ per frame

        private void LateUpdate()
        {
            bool aiming = simulation != null && !simulation.ShotInProgress && simulation.World.Balls[0].IsOnTable;

            if (aimLine != null)
            {
                if (aiming)
                {
                    AimPredictor.Predict(simulation.World, 0, Heading, aimCushionBounces, _prediction);
                    aimLine.Render(_prediction, simulation);
                }
                aimLine.SetVisible(aiming && InputEnabled);
            }

            if (cueView != null)
            {
                if (aiming) cueView.Pose(simulation, BuildStrike(), Power01);
                cueView.SetVisible(aiming || cueView.IsStroking);
            }
        }

        private static double NormalizeAngle(double a)
        {
            const double twoPi = Math.PI * 2;
            a %= twoPi;
            return a < 0 ? a + twoPi : a;
        }
    }
}
