using Billiards.Physics;
using UnityEngine;

namespace Billiards.Game
{
    /// <summary>
    /// Draws the aim assist: cue ball path (with cushion bounces), ghost ball, the object
    /// ball's direction and the cue ball's stun-shot tangent line.
    /// Assist strength is just data: shorter guide lines for higher difficulty.
    /// </summary>
    public sealed class AimLineRenderer : MonoBehaviour
    {
        [SerializeField] private LineRenderer cuePath;
        [SerializeField] private LineRenderer objectBallLine;
        [SerializeField] private LineRenderer cueDeflectionLine;
        [Tooltip("Flat ring/disc showing where the cue ball will be at contact.")]
        [SerializeField] private Transform ghostBall;

        [Header("Assist")]
        [SerializeField, Range(0f, 1f)] private float objectLineLength = 0.35f;
        [SerializeField, Range(0f, 1f)] private float deflectionLineLength = 0.2f;
        [Tooltip("Lift lines slightly above the cloth to avoid z-fighting (metres).")]
        [SerializeField] private float lift = 0.002f;

        private Vector3[] _buffer = new Vector3[8];

        public void SetVisible(bool visible)
        {
            if (cuePath != null) cuePath.enabled = visible;
            if (objectBallLine != null) objectBallLine.enabled = visible && objectBallLine.positionCount > 0;
            if (cueDeflectionLine != null) cueDeflectionLine.enabled = visible && cueDeflectionLine.positionCount > 0;
            if (ghostBall != null) ghostBall.gameObject.SetActive(visible && _hasGhost);
        }

        private bool _hasGhost;

        public void Render(AimPrediction prediction, TableSimulation sim)
        {
            double r = sim.World.Params.BallRadius;
            var path = prediction.CuePath;

            // Lines are drawn just above the cloth: easier to read from a low 3D camera.
            if (_buffer.Length < path.Count) _buffer = new Vector3[path.Count * 2];
            for (int i = 0; i < path.Count; i++)
                _buffer[i] = ToWorld(sim, path[i], r);
            cuePath.positionCount = path.Count;
            cuePath.SetPositions(_buffer);

            _hasGhost = prediction.HitBall >= 0;
            if (!_hasGhost)
            {
                objectBallLine.positionCount = 0;
                cueDeflectionLine.positionCount = 0;
                return;
            }

            DVec3 ghost = prediction.GhostPosition;
            DVec3 objCentre = sim.World.Balls[prediction.HitBall].Position.Horizontal;

            if (ghostBall != null)
                ghostBall.position = sim.SimToWorld(new DVec3(ghost.X, r, ghost.Z)); // ball-centre height

            SetSegment(objectBallLine, sim, objCentre, objCentre + prediction.ObjectDirection * objectLineLength, r);

            // Full-ball hits have no tangent line.
            if (prediction.CueDeflection.LengthSq > 1e-8)
                SetSegment(cueDeflectionLine, sim, ghost, ghost + prediction.CueDeflection * deflectionLineLength, r);
            else
                cueDeflectionLine.positionCount = 0;
        }

        private void SetSegment(LineRenderer line, TableSimulation sim, DVec3 a, DVec3 b, double r)
        {
            line.positionCount = 2;
            line.SetPosition(0, ToWorld(sim, a, r));
            line.SetPosition(1, ToWorld(sim, b, r));
        }

        private Vector3 ToWorld(TableSimulation sim, DVec3 horizontal, double r)
            => sim.SimToWorld(new DVec3(horizontal.X, r * 0.1 + lift, horizontal.Z));
    }
}
