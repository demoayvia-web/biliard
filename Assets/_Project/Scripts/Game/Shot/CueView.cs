using Billiards.Physics;
using UnityEngine;

namespace Billiards.Game
{
    /// <summary>
    /// Positions the cue stick model from the current strike parameters: aligned with the
    /// cue axis, tip at the chosen contact point, pulled back with power, and a short
    /// forward stroke animation when the shot is fired.
    ///
    /// Model convention: pivot at the tip, cue pointing along local +Z from butt to tip.
    /// </summary>
    public sealed class CueView : MonoBehaviour
    {
        [SerializeField] private Transform cueModel;
        [Tooltip("Gap between tip and ball at zero power (metres).")]
        [SerializeField] private float restGap = 0.01f;
        [Tooltip("Extra pull-back at full power (metres).")]
        [SerializeField] private float maxPullBack = 0.25f;
        [SerializeField] private float strokeDuration = 0.08f;

        public bool IsStroking => _strokeTimer >= 0f;

        private float _strokeTimer = -1f;
        private float _strokeStartBack;
        private Vector3 _tipTarget;
        private Vector3 _axis = Vector3.forward;

        public void SetVisible(bool visible)
        {
            if (cueModel != null && cueModel.gameObject.activeSelf != visible)
                cueModel.gameObject.SetActive(visible);
        }

        /// <summary>Called every frame while aiming.</summary>
        public void Pose(TableSimulation sim, in CueStrike strike, float power01)
        {
            if (cueModel == null || IsStroking) return;

            var p = sim.World.Params;
            DVec3 d = strike.CueDirection;
            DVec3 right = DVec3.Cross(DVec3.Up, d).Normalized;
            DVec3 upPrime = DVec3.Cross(d, right);
            double a = strike.SideOffset, b = strike.VerticalOffset;
            double c = System.Math.Sqrt(System.Math.Max(0, 1 - a * a - b * b));

            // Same contact point the physics uses (CueStrikeModel), in cloth space.
            DVec3 contact = sim.World.Balls[0].Position + (right * a + upPrime * b - d * c) * p.BallRadius;

            _tipTarget = sim.SimToWorld(contact);
            _axis = sim.Surface.TransformDirection(d.ToUnity()).normalized;
            Place(restGap + maxPullBack * power01);
            _strokeStartBack = restGap + maxPullBack * power01;
        }

        /// <summary>Starts the forward stroke from the current pull-back.</summary>
        public void PlayStroke()
        {
            _strokeTimer = 0f;
        }

        private void Update()
        {
            if (!IsStroking) return;
            _strokeTimer += Time.deltaTime;
            float k = Mathf.Clamp01(_strokeTimer / strokeDuration);
            // Accelerate through the ball and follow through a few centimetres.
            Place(Mathf.Lerp(_strokeStartBack, -0.03f, k * k));
            if (_strokeTimer > strokeDuration + 0.25f) _strokeTimer = -1f; // hold, then hide
        }

        private void Place(float backDistance)
        {
            cueModel.SetPositionAndRotation(
                _tipTarget - _axis * backDistance,
                Quaternion.LookRotation(_axis, Vector3.up));
        }
    }
}
