using UnityEngine;
using UnityEngine.EventSystems;

namespace Billiards.Game
{
    /// <summary>
    /// English control: a picture of the cue ball as seen by the shooter. Drag the dot to
    /// choose where the tip hits (right of centre = right english, low = draw).
    /// The disc maps to the legal tip area (up to PhysicsParams.MaxTipOffset * R).
    /// Double tap resets to centre ball.
    /// </summary>
    public sealed class SpinWidget : MonoBehaviour, IPointerDownHandler, IDragHandler, IPointerClickHandler
    {
        [SerializeField] private ShotController shot;
        [SerializeField] private RectTransform disc;
        [SerializeField] private RectTransform dot;

        public void OnPointerDown(PointerEventData e) => UpdateFromPointer(e);
        public void OnDrag(PointerEventData e) => UpdateFromPointer(e);

        public void OnPointerClick(PointerEventData e)
        {
            if (e.clickCount >= 2) Set(Vector2.zero);
        }

        private void UpdateFromPointer(PointerEventData e)
        {
            if (!RectTransformUtility.ScreenPointToLocalPointInRectangle(disc, e.position, e.pressEventCamera, out Vector2 local))
                return;
            float radius = Mathf.Min(disc.rect.width, disc.rect.height) * 0.5f;
            Set(local / radius);
        }

        private void Set(Vector2 spin)
        {
            shot.SetSpin(spin);
            float radius = Mathf.Min(disc.rect.width, disc.rect.height) * 0.5f;
            dot.anchoredPosition = shot.Spin * radius;
        }
    }
}
