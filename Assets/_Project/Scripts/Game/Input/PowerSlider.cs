using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace Billiards.Game
{
    /// <summary>
    /// Vertical "pull back to shoot" power bar (right screen edge, thumb-friendly).
    /// Touch the bar, drag down to pull the cue back, release to shoot.
    /// Drag back up to the top (or outside the cancel threshold) to cancel.
    /// </summary>
    public sealed class PowerSlider : MonoBehaviour, IPointerDownHandler, IDragHandler, IPointerUpHandler
    {
        [SerializeField] private ShotController shot;
        [SerializeField] private RectTransform track;
        [Tooltip("Image with Fill Method = Vertical, Origin = Top.")]
        [SerializeField] private Image fill;
        [Tooltip("Gradient from soft to hard shot, applied to the fill.")]
        [SerializeField] private Gradient fillColor;
        [Tooltip("Power below this on release cancels the shot.")]
        [SerializeField, Range(0f, 0.1f)] private float cancelThreshold = 0.03f;

        private bool _dragging;
        private float _startY;

        public void OnPointerDown(PointerEventData e)
        {
            if (!shot.CanAim) return;
            _dragging = true;
            _startY = e.position.y;
            Apply(0f);
        }

        public void OnDrag(PointerEventData e)
        {
            if (!_dragging) return;
            float height = track.rect.height * track.lossyScale.y; // screen pixels
            Apply(Mathf.Clamp01((_startY - e.position.y) / height));
        }

        public void OnPointerUp(PointerEventData e)
        {
            if (!_dragging) return;
            _dragging = false;
            if (shot.Power01 >= cancelThreshold) shot.Fire();
            Apply(0f);
        }

        private void Apply(float power)
        {
            shot.SetPower(power);
            if (fill != null)
            {
                fill.fillAmount = power;
                if (fillColor != null) fill.color = fillColor.Evaluate(power);
            }
        }
    }
}
