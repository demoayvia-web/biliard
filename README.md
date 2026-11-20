# Pocket Billiards

Open-source 3D pool (8-Ball / 9-Ball) for Android, built with **Unity 6 LTS + URP**.
Realistic custom physics — sliding/rolling, draw, follow, side spin, throw, squirt,
cushion english, jump and massé — not tuned PhysX.

> Status: **pre-alpha.** Physics core + shot system done and tested; table scene, rules,
> AI and UI in progress. See [docs/TDD.md](docs/TDD.md) for the full design and roadmap.

## Why custom physics?

PhysX has no notion of a ball sliding vs rolling, doesn't produce throw or proper cushion
english, and its results depend on frame rate. Billiards needs all of that, so balls are
simulated by `Billiards.Physics` — a small, engine-free C# library:

- per-ball motion regimes with analytic slide→roll transition (the 5/7 rule falls out)
- one impulse-with-friction routine for ball–ball (throw), ball–cushion (english) and slate (jumps)
- cue-tip impact model with tip offset, cue elevation and shaft squirt
- fixed 1200 Hz sub-steps + time-of-impact rewind: no tunnelling, **deterministic** results
- zero allocations per step; the whole table clones with one `Array.Copy` (AI look-ahead)

Every physical behaviour is pinned by a unit test (`Assets/_Project/Tests/EditMode`).

## Getting started

1. Install **Unity 6 LTS** (6000.x) with *Android Build Support* (SDK/NDK + OpenJDK).
2. Create a new **Universal 3D** project, copy `Assets/`, `.gitignore`, `.gitattributes`
   into it (or clone this repo once `ProjectSettings/` is committed).
3. *Window → General → Test Runner → EditMode → Run All* — all physics tests should pass.
4. Scene setup (until the `Match` scene/prefabs are committed):
   - Empty `Table` object → add **TableSimulation**; child `Surface` at cloth height.
   - 16 sphere children of `Surface`, scale 0.05715, each with **BallView**; assign by ball number.
   - **ShotController**, **AimLineRenderer** (3 LineRenderers + ghost ring), **CueView** (cue model, pivot at tip, +Z towards tip).
   - Camera with **CameraRig**; Canvas with **AimTouchArea** (full-screen transparent Image),
     **PowerSlider**, **SpinWidget**.
   - Call `TableSimulation.RackEightBall(seed)` from a small bootstrap script.

### Android build settings

IL2CPP · ARM64 only · target API 36 · Vulkan + GLES3 · AAB · Managed stripping: Medium.

## Project layout

```
Assets/_Project/Scripts/Physics   engine-free simulation (asmdef: noEngineReferences)
Assets/_Project/Scripts/Game      Unity layer: views, input, camera, shot controller
Assets/_Project/Tests/EditMode    NUnit tests
docs/TDD.md                       technical design document + roadmap (Russian)
```

## Contributing

Issues and PRs welcome. Keep the physics assembly free of `UnityEngine`, add a test for any
change in behaviour, and commit only assets you have the right to distribute (own or CC0).

## License

Code: [MIT](LICENSE). Third-party assets keep their own licences (see `docs/CREDITS.md`).
