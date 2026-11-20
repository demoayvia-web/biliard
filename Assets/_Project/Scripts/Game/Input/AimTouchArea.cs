using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;

namespace Billiards.Game
{
    /// <summary>
    /// Full-screen, invisible UI element behind the HUD that turns touches into aiming:
    ///
    ///  * One finger dragged anywhere: rotates the aim by the angle the finger sweeps
    ///    around the cue ball, measured on the cloth plane. This works identically in the
    ///    3D and the top-down camera because it never uses raw screen deltas.
    ///  * Tap (no drag): aim straight at the tapped point.
    ///  * Two fingers: pinch to zoom, handled by <see cref="CameraRig"/>.
    ///  * <see cref="fineMode"/>: put a second instance on a narrow side strip; vertical
    ///    drags there rotate the aim very slowly for precise cuts.
    ///
    /// Built on EventSystem pointer events, so it works with touch and mouse, with either
    /// the old or the new Input System, and respects UI buttons drawn on top of it.
    /// Requires a Graphic (e.g. an Image with alpha 0) on the same GameObject.
    /// </summary>
    public sealed class AimTouchArea : MonoBehaviour,
        IPointerDownHandler, IPointerUpHandler, IBeginDragHandler, IDragHandler, IPointerClickHandler
    {
        [SerializeField] private ShotController shot;
        [SerializeField] private TableSimulation simulation;
        [SerializeField] private CameraRig cameraRig;

        [Header("Fine aim strip")]
        [SerializeField] private bool fineMode;
        [Tooltip("Degrees of aim per screen height dragged, in fine mode.")]
        [SerializeField] private float fineDegreesPerScreen = 6f;

        [Header("Pinch")]
        [SerializeField] private float pinchSensitivity = 1f;

        private readonly Dictionary<int, Vector2> _pointers = new Dictionary<int, Vector2>();
        private float _lastPinchDistance;
        private bool _dragged;

        public void OnPointerDown(PointerEventData e)
        {
            _pointers[e.pointerId] = e.position;
            _dragged = false;
            if (_pointers.Count == 2) _lastPinchDistance = PinchDistance();
        }

        public void OnPointerUp(PointerEventData e) => _pointers.Remove(e.pointerId);

        public void OnBeginDrag(PointerEventData e) => _dragged = true;

        public void OnDrag(PointerEventData e)
        {
            Vector2 previous = _pointers.TryGetValue(e.pointerId, out var p) ? p : e.position - e.delta;
            _pointers[e.pointerId] = e.position;

            if (_pointers.Count >= 2)
            {
                float dist = PinchDistance();
                if (cameraRig != null && _lastPinchDistance > 0f)
                    cameraRig.Zoom((_lastPinchDistance - dist) / Screen.height * pinchSensitivity);
                _lastPinchDistance = dist;
                return;
            }

            if (fineMode)
            {
                float deg = e.delta.y / Screen.height * fineDegreesPerScreen;
                shot.RotateAim(deg * Mathf.Deg2Rad);
                return;
            }

            // Angle swept around the cue ball on the cloth plane.
            if (!TryProjectToCloth(previous, e.pressEventCamera, out Vector3 a)
                || !TryProjectToCloth(e.position, e.pressEventCamera, out Vector3 b)) return;

            Vector3 cue = simulation.Surface.InverseTransformPoint(simulation.BallWorldPosition(0));
            Vector2 va = new Vector2(a.x - cue.x, a.z - cue.z);
            Vector2 vb = new Vector2(b.x - cue.x, b.z - cue.z);
            // Too close to the ball the angle is unstable: ignore that region.
            if (va.sqrMagnitude < 0.0025f || vb.sqrMagnitude < 0.0025f) return;

            float delta = Mathf.Atan2(vb.y, vb.x) - Mathf.Atan2(va.y, va.x);
            if (delta > Mathf.PI) delta -= 2 * Mathf.PI;
            if (delta < -Mathf.PI) delta += 2 * Mathf.PI;
            shot.RotateAim(delta);
        }

        public void OnPointerClick(PointerEventData e)
        {
            if (_dragged || fineMode) return;
            if (TryProjectToCloth(e.position, e.pressEventCamera, out Vector3 local))
                shot.AimAtWorldPoint(simulation.Surface.TransformPoint(local));
        }

        /// <summary>Screen point -> point on the cloth plane, in cloth (simulation) space.</summary>
        private bool TryProjectToCloth(Vector2 screen, Camera eventCamera, out Vector3 local)
        {
            local = default;
            Camera cam = cameraRig != null ? cameraRig.Camera : Camera.main;
            if (cam == null) return false;

            Transform s = simulation.Surface;
            float ballCentreHeight = (float)simulation.World.Params.BallRadius;
            var plane = new Plane(s.up, s.TransformPoint(new Vector3(0, ballCentreHeight, 0)));
            Ray ray = cam.ScreenPointToRay(screen);
            if (!plane.Raycast(ray, out float t)) return false;
            local = s.InverseTransformPoint(ray.GetPoint(t));
            return true;
        }

        private float PinchDistance()
        {
            using (var it = _pointers.Values.GetEnumerator())
            {
                it.MoveNext(); Vector2 p0 = it.Current;
                it.MoveNext(); Vector2 p1 = it.Current;
                return Vector2.Distance(p0, p1);
            }
        }
    }
}
