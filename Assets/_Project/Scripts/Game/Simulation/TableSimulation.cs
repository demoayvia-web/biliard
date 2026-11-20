using System;
using System.Collections.Generic;
using Billiards.Physics;
using UnityEngine;

namespace Billiards.Game
{
    /// <summary>
    /// Unity host of the physics world: owns <see cref="PoolPhysicsWorld"/>, advances it
    /// with frame time, mirrors ball states onto <see cref="BallView"/>s and republishes
    /// physics events for audio/haptics/rules.
    ///
    /// The simulation runs in the local space of <see cref="surface"/> (table cloth at
    /// local y = 0), so the table can be placed, rotated or scaled freely in the scene.
    /// Unity's PhysX is not used for balls at all.
    /// </summary>
    [DefaultExecutionOrder(-50)]
    public sealed class TableSimulation : MonoBehaviour
    {
        public const int BallCount = 16; // cue + 15 (9-Ball simply leaves 10..15 off the table)

        [SerializeField] private PhysicsConfig config;
        [Tooltip("Transform whose local XZ plane is the cloth surface.")]
        [SerializeField] private Transform surface;
        [Tooltip("Index = ball number (0 = cue ball).")]
        [SerializeField] private BallView[] ballViews = new BallView[BallCount];
        [Tooltip("Slow motion for debugging / replays.")]
        [SerializeField, Range(0.05f, 2f)] private float timeScale = 1f;

        public PoolPhysicsWorld World { get; private set; }
        public Transform Surface => surface;
        public bool ShotInProgress { get; private set; }

        /// <summary>Every physics event, in simulation order, as it happens.</summary>
        public event Action<PhysicsEvent> PhysicsEventRaised;
        /// <summary>All balls stopped. Payload = full event list of the shot (for the rules).</summary>
        public event Action<IReadOnlyList<PhysicsEvent>> ShotCompleted;

        private int _eventCursor;

        private void Awake()
        {
            if (surface == null) surface = transform;
            var parameters = config != null ? config.ToParams() : new PhysicsParams();
            World = new PoolPhysicsWorld(TableGeometry.CreateStandard(), parameters, BallCount);
        }

        // ---------------------------------------------------------------- setup

        public void RackEightBall(int seed)
        {
            ClearTable();
            foreach (var spot in RackBuilder.EightBall(World.Table, World.Params, seed))
                World.PlaceBall(spot.Ball, spot.X, spot.Z);
            World.PlaceBall(0, World.Table.HeadSpot.X, 0);
            SyncAllViews(0f);
        }

        public void RackNineBall(int seed)
        {
            ClearTable();
            foreach (var spot in RackBuilder.NineBall(World.Table, World.Params, seed))
                World.PlaceBall(spot.Ball, spot.X, spot.Z);
            World.PlaceBall(0, World.Table.HeadSpot.X, 0);
            SyncAllViews(0f);
        }

        /// <summary>Ball in hand: moves the cue ball if the spot is free and on the cloth.</summary>
        public bool TryPlaceCueBall(Vector3 worldPosition, bool kitchenOnly)
        {
            DVec3 local = surface.InverseTransformPoint(worldPosition).ToSim();
            double r = World.Params.BallRadius;
            if (!World.Table.IsInsidePlayArea(local, r)) return false;
            if (kitchenOnly && local.X > World.Table.HeadStringX) return false;

            for (int i = 1; i < World.Balls.Length; i++)
            {
                if (!World.Balls[i].IsOnTable) continue;
                if ((World.Balls[i].Position.Horizontal - local.Horizontal).Length < 2 * r) return false;
            }
            World.PlaceBall(0, local.X, local.Z);
            SyncAllViews(0f);
            return true;
        }

        private void ClearTable()
        {
            for (int i = 0; i < World.Balls.Length; i++) World.RemoveBall(i);
            foreach (var view in ballViews)
                if (view != null) view.ResetView();
        }

        // ---------------------------------------------------------------- shooting

        /// <summary>Strikes the cue ball. Ignored while a shot is still rolling.</summary>
        public void Shoot(in CueStrike strike)
        {
            if (ShotInProgress) return;
            World.ClearEvents();
            _eventCursor = 0;
            World.Strike(0, strike);
            ShotInProgress = true;
        }

        private void Update()
        {
            if (!ShotInProgress) return;

            float dt = Time.deltaTime * timeScale;
            World.Advance(dt);
            DispatchNewEvents();
            SyncAllViews(dt);

            if (World.IsAtRest)
            {
                ShotInProgress = false;
                ShotCompleted?.Invoke(World.Events);
            }
        }

        private void DispatchNewEvents()
        {
            var events = World.Events;
            for (; _eventCursor < events.Count; _eventCursor++)
                PhysicsEventRaised?.Invoke(events[_eventCursor]);
        }

        private void SyncAllViews(float dt)
        {
            for (int i = 0; i < ballViews.Length && i < World.Balls.Length; i++)
                if (ballViews[i] != null) ballViews[i].Sync(World.Balls[i], dt);
        }

        // ---------------------------------------------------------------- helpers

        public Vector3 BallWorldPosition(int index) => surface.TransformPoint(World.Balls[index].Position.ToUnity());

        public Vector3 SimToWorld(DVec3 p) => surface.TransformPoint(p.ToUnity());

#if UNITY_EDITOR
        // Draw cushion noses and pocket capture circles: invaluable when modelling tables.
        private void OnDrawGizmos()
        {
            var table = World?.Table ?? TableGeometry.CreateStandard();
            var t = surface != null ? surface : transform;
            float h = (float)(World?.Params.CushionHeight ?? 0.0363);
            Gizmos.color = Color.cyan;
            foreach (var c in table.Cushions)
                Gizmos.DrawLine(t.TransformPoint(c.A.ToUnity() + Vector3.up * h), t.TransformPoint(c.B.ToUnity() + Vector3.up * h));
            Gizmos.color = Color.yellow;
            foreach (var p in table.Pockets)
                Gizmos.DrawWireSphere(t.TransformPoint(p.Center.ToUnity()), (float)p.CaptureRadius);
        }
#endif
    }
}
