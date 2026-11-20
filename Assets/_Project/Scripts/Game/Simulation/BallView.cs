using Billiards.Physics;
using UnityEngine;

namespace Billiards.Game
{
    /// <summary>
    /// Visual of one ball. Pure presentation: it never feeds anything back into physics.
    /// Must be a child of TableSimulation.Surface (positions are local to the cloth).
    ///
    /// Orientation is integrated from the simulated angular velocity, so the number on the
    /// ball visibly shows draw, follow, side spin and the slide-to-roll transition.
    /// </summary>
    public sealed class BallView : MonoBehaviour
    {
        [Tooltip("Seconds of the 'drop into pocket' animation.")]
        [SerializeField] private float pocketDropTime = 0.25f;

        private bool _pocketed;
        private float _dropTimer;
        private Vector3 _dropStart;

        public void ResetView()
        {
            _pocketed = false;
            _dropTimer = 0f;
            gameObject.SetActive(false);
        }

        public void Sync(in BallState state, float dt)
        {
            if (state.Motion == BallMotion.Pocketed || state.Motion == BallMotion.OffTable)
            {
                AnimatePocketed(dt);
                return;
            }

            if (!gameObject.activeSelf) gameObject.SetActive(true);
            _pocketed = false;

            transform.localPosition = state.Position.ToUnity();

            // Integrate orientation: rotate by |w| * dt around the spin axis.
            Vector3 w = state.AngularVelocity.ToUnity();
            float speed = w.magnitude;
            if (speed > 1e-4f && dt > 0f)
            {
                var delta = Quaternion.AngleAxis(speed * dt * Mathf.Rad2Deg, w / speed);
                transform.localRotation = delta * transform.localRotation;
            }
        }

        private void AnimatePocketed(float dt)
        {
            if (!gameObject.activeSelf) return;
            if (!_pocketed)
            {
                _pocketed = true;
                _dropTimer = 0f;
                _dropStart = transform.localPosition;
            }

            _dropTimer += dt;
            float k = Mathf.Clamp01(_dropTimer / pocketDropTime);
            // Simple fall + shrink. Replace with a pocket "return chute" later if desired.
            transform.localPosition = _dropStart + Vector3.down * (0.08f * k * k);
            if (k >= 1f) gameObject.SetActive(false);
        }
    }
}
