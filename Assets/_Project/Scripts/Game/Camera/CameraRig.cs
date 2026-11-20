using UnityEngine;

namespace Billiards.Game
{
    /// <summary>
    /// Two camera modes:
    ///  * Aim (3D): behind the cue ball, looking along the aim, orbit follows the aim heading.
    ///  * TopDown: whole table from above (orthographic-like, via a long lens).
    /// While balls roll, Aim mode pulls back to an overview so the shot can be followed.
    /// All motion is critically damped (SmoothDamp) to avoid motion sickness on phones.
    /// </summary>
    public sealed class CameraRig : MonoBehaviour
    {
        public enum Mode { Aim, TopDown }

        [SerializeField] private Camera cam;
        [SerializeField] private TableSimulation simulation;
        [SerializeField] private ShotController shot;

        [Header("Aim mode")]
        [SerializeField] private float minDistance = 0.5f;
        [SerializeField] private float maxDistance = 2.2f;
        [SerializeField, Range(5f, 60f)] private float pitchDeg = 18f;
        [SerializeField] private float smoothTime = 0.12f;

        [Header("Top-down")]
        [SerializeField] private float topDownHeight = 3.2f;
        [SerializeField] private float topDownFov = 40f;
        [SerializeField] private float aimFov = 50f;

        public Camera Camera => cam;
        public Mode CurrentMode { get; private set; } = Mode.Aim;

        private float _zoom01 = 0.35f;
        private Vector3 _velocity;
        private Vector3 _focus;
        private Vector3 _focusVelocity;

        public void ToggleMode() => CurrentMode = CurrentMode == Mode.Aim ? Mode.TopDown : Mode.Aim;

        /// <summary>Positive = zoom out. Called by pinch and by the mouse wheel in the editor.</summary>
        public void Zoom(float delta) => _zoom01 = Mathf.Clamp01(_zoom01 + delta);

        private void LateUpdate()
        {
            if (simulation == null || cam == null) return;
            Transform surface = simulation.Surface;

#if (UNITY_EDITOR || UNITY_STANDALONE) && ENABLE_LEGACY_INPUT_MANAGER
            float wheel = Input.mouseScrollDelta.y;
            if (Mathf.Abs(wheel) > 0.01f) Zoom(-wheel * 0.05f);
#endif

            bool rolling = simulation.ShotInProgress;
            Vector3 targetPos;
            Vector3 targetFocus;

            if (CurrentMode == Mode.TopDown || rolling)
            {
                targetFocus = surface.position;
                targetPos = surface.position + surface.up * topDownHeight * (rolling && CurrentMode == Mode.Aim ? 0.85f : 1f);
                cam.fieldOfView = Mathf.Lerp(cam.fieldOfView, topDownFov, Time.deltaTime * 6f);
            }
            else
            {
                targetFocus = simulation.BallWorldPosition(0);
                Vector3 aimDir = surface.TransformDirection(PhysicsBridge.DirectionOf(shot.Heading));
                float distance = Mathf.Lerp(minDistance, maxDistance, _zoom01);
                Quaternion pitch = Quaternion.AngleAxis(pitchDeg, Vector3.Cross(surface.up, aimDir));
                targetPos = targetFocus - pitch * aimDir * distance;
                cam.fieldOfView = Mathf.Lerp(cam.fieldOfView, aimFov, Time.deltaTime * 6f);
            }

            _focus = Vector3.SmoothDamp(_focus, targetFocus, ref _focusVelocity, smoothTime);
            cam.transform.position = Vector3.SmoothDamp(cam.transform.position, targetPos, ref _velocity, smoothTime);

            // Keep the long table axis horizontal on screen in top-down view.
            Vector3 up = CurrentMode == Mode.TopDown || rolling ? surface.forward : surface.up;
            cam.transform.rotation = Quaternion.LookRotation(_focus - cam.transform.position, up);
        }
    }
}
