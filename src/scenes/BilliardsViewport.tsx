import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  BALL_RADIUS,
  BALL_REST_Y,
  HALF_LENGTH,
  HALF_WIDTH,
  HEAD_STRING_X,
  SLATE_Y,
} from '../game/constants.ts';
import { computePracticeIdealShot } from '../game/rules.ts';
import type {
  BallState,
  CameraPreset,
  CueStyleId,
  EnvironmentId,
  GraphicsQuality,
  ShotReplayData,
  TableClothId,
} from '../game/types.ts';
import { buildAimingVisuals, type AimingVisualsInstance } from './AimingVisuals.ts';
import { buildCueStick, type CueStickInstance } from './CueStickModel.ts';
import { buildEnvironmentRig, type EnvironmentRigInstance } from './EnvironmentRig.ts';
import { buildPoolTable, type PoolTableInstance } from './PoolTableModel.ts';
import { buildReplayTrails, type ReplayTrailsInstance } from './ReplayTrails.ts';
import { buildSpinEffects, type SpinEffectsInstance } from './SpinEffects.ts';
import { createBallTexture } from './textures.ts';
import { TouchCameraController } from './TouchCameraController.ts';
import { useI18n } from '../i18n/I18nContext.tsx';

export interface ViewportControlProps {
  isTitleScreen: boolean;
  ballsRef: React.MutableRefObject<BallState[]>;
  aimAngleRef: React.MutableRefObject<number>;
  shotPowerRef: React.MutableRefObject<number>;
  spinRef: React.MutableRefObject<{ x: number; y: number }>;
  canInteract: boolean;
  isShooting: boolean;
  isBallInHand: boolean;
  behindHeadStringOnly: boolean;
  legalTargetIds: number[];
  cameraPreset: CameraPreset;
  cueStyle: CueStyleId;
  tableCloth: TableClothId;
  environmentId: EnvironmentId;
  graphicsQuality: GraphicsQuality;
  aimAssist: 'full' | 'short' | 'off';
  ghostBallGuide?: boolean;
  cameraSensitivity: number;
  strikePulseCounter: number;
  isReplaying?: boolean;
  replayData?: ShotReplayData | null;
  replayTimeRef?: React.MutableRefObject<number>;
  replaySpeed?: number;
  replayPaused?: boolean;
  showReplayTrails?: boolean;
  showCuePathTracer?: boolean;
  isEditMode?: boolean;
  selectedEditBallId?: number | null;
  showIdealGuide?: boolean;
  onEditSelectBall?: (ballId: number) => void;
  onEditMoveBall?: (ballId: number, x: number, z: number) => void;
  onAimAngleChange: (nextAngle: number) => void;
  onBallInHandMove: (x: number, z: number) => void;
  onBallInHandCommit?: () => void;
}

const _targetCamPos = new THREE.Vector3();
const _targetLookAt = new THREE.Vector3();
const _currentLookAt = new THREE.Vector3(0, SLATE_Y, 0);
const _raycaster = new THREE.Raycaster();
const _pointerNdc = new THREE.Vector2();
const _slatePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -BALL_REST_Y);
const _planeHit = new THREE.Vector3();

function detectSoftwareWebGL(): boolean {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export const BilliardsViewport: React.FC<ViewportControlProps> = (props) => {
  const { t } = useI18n();
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [contextLost, setContextLost] = useState(false);

  // Keep latest props in a mutable ref so the WebGL loop never tears down
  const propsRef = useRef(props);
  propsRef.current = props;

  // Scene sub-system refs for reactive style updates
  const tableRef = useRef<PoolTableInstance | null>(null);
  const cueRef = useRef<CueStickInstance | null>(null);
  const envRef = useRef<EnvironmentRigInstance | null>(null);
  const replayTrailsRef = useRef<ReplayTrailsInstance | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const isSoftwareGlRef = useRef(false);
  const touchCamRef = useRef<TouchCameraController | null>(null);

  // Sync ReplayTrails geometry when replayData updates
  useEffect(() => {
    replayTrailsRef.current?.setReplay(props.replayData ?? null);
  }, [props.replayData]);

  // Reset manual two-finger camera orbit/tilt when switching camera presets
  useEffect(() => {
    touchCamRef.current?.resetOrientation();
  }, [props.cameraPreset]);

  // Reset camera gestures when leaving the title screen
  useEffect(() => {
    if (!props.isTitleScreen) {
      touchCamRef.current?.resetAll();
    }
  }, [props.isTitleScreen]);

  // Strike forward thrust animation timer + snap custom camera orbit back behind shot
  const strikeAnimRef = useRef({ active: false, elapsed: 0 });
  const lastStrikePulseRef = useRef(props.strikePulseCounter);
  useEffect(() => {
    if (props.strikePulseCounter !== lastStrikePulseRef.current) {
      lastStrikePulseRef.current = props.strikePulseCounter;
      strikeAnimRef.current = { active: true, elapsed: 0 };
      touchCamRef.current?.resetOrientation();
    }
  }, [props.strikePulseCounter]);

  const appliedClothRef = useRef<TableClothId | null>(null);

  // Apply table cloth changes (normal, roughness, albedo & wool sheen maps per TableClothId)
  useEffect(() => {
    if (!tableRef.current) return;
    if (appliedClothRef.current === props.tableCloth) return;
    tableRef.current.applyClothStyle(props.tableCloth);
    appliedClothRef.current = props.tableCloth;
  }, [props.tableCloth]);

  // Apply cue stick style changes
  useEffect(() => {
    cueRef.current?.applyStyle(props.cueStyle);
  }, [props.cueStyle]);

  // Apply environment changes
  useEffect(() => {
    envRef.current?.applyEnvironment(props.environmentId);
  }, [props.environmentId]);

  // Apply graphics quality changes
  useEffect(() => {
    const renderer = rendererRef.current;
    const env = envRef.current;
    if (!renderer || !env) return;

    const isSw = isSoftwareGlRef.current;
    const q = props.graphicsQuality;
    let dpr = 1;
    let shadowSize = 1024;
    let shadows = !isSw;

    if (isSw) {
      dpr = 1;
      shadows = false;
    } else if (q === 'low') {
      dpr = 1;
      shadows = false;
      shadowSize = 512;
    } else if (q === 'medium') {
      dpr = Math.min(window.devicePixelRatio, 1.25);
      shadows = true;
      shadowSize = 512;
    } else if (q === 'high') {
      dpr = Math.min(window.devicePixelRatio, 1.5);
      shadows = true;
      shadowSize = 1024;
    } else if (q === 'ultra') {
      dpr = Math.min(window.devicePixelRatio, 2);
      shadows = true;
      shadowSize = 2048;
    } else {
      // Auto
      const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
      dpr = Math.min(window.devicePixelRatio, isMobile ? 1.35 : 1.75);
      shadows = true;
      shadowSize = isMobile ? 1024 : 1536;
    }

    renderer.setPixelRatio(dpr);
    renderer.shadowMap.enabled = shadows;
    env.setShadowQuality(shadowSize, shadows);
  }, [props.graphicsQuality]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    isSoftwareGlRef.current = isSoftwareGl;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    const computeAdaptiveFov = (w: number, h: number) => {
      const aspect = w / Math.max(1, h);
      return aspect < 0.9 ? Math.min(66, 44 / Math.max(0.66, aspect)) : 44;
    };

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      computeAdaptiveFov(width, height),
      width / Math.max(1, height),
      0.08,
      40,
    );
    camera.position.set(-2.35, 1.78, 1.45);
    camera.lookAt(0, SLATE_Y, 0);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 1.75));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.touchAction = 'none';
    container.appendChild(canvas);

    const maxAnisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());

    // Build Environment, Table, Cue Stick, Aiming Visuals
    const envRig = buildEnvironmentRig(scene, renderer, propsRef.current.environmentId, maxAnisotropy);
    envRef.current = envRig;

    const initialCloth = propsRef.current.tableCloth;
    const table = buildPoolTable(initialCloth, maxAnisotropy);
    scene.add(table.group);
    tableRef.current = table;
    appliedClothRef.current = initialCloth;

    const cue = buildCueStick(propsRef.current.cueStyle);
    scene.add(cue.group);
    cueRef.current = cue;

    const aimingVisuals: AimingVisualsInstance = buildAimingVisuals(scene);
    const replayTrails: ReplayTrailsInstance = buildReplayTrails(scene);
    replayTrailsRef.current = replayTrails;
    if (propsRef.current.replayData) {
      replayTrails.setReplay(propsRef.current.replayData);
    }
    const spinEffects: SpinEffectsInstance = buildSpinEffects(scene);
    let lastReplayTimeForFx = 0;
    let wasFxActive = false;

    // Build 16 PBR Billiard Ball Meshes
    const ballGeo = new THREE.SphereGeometry(BALL_RADIUS, 32, 24);
    const ballMeshes = new Map<number, THREE.Mesh>();
    const ballDisposables: Array<{ dispose: () => void }> = [ballGeo];

    for (let id = 0; id <= 15; id++) {
      const tex = createBallTexture(id, maxAnisotropy);
      const mat = new THREE.MeshPhysicalMaterial({
        map: tex,
        roughness: 0.11,
        metalness: 0.02,
        clearcoat: 1.0,
        clearcoatRoughness: 0.06,
        envMapIntensity: 1.2,
      });
      const mesh = new THREE.Mesh(ballGeo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      ballMeshes.set(id, mesh);
      ballDisposables.push(tex, mat);
    }

    // OrbitControls (enabled when in 'orbit' mode or right-drag)
    const orbitControls = new OrbitControls(camera, canvas);
    orbitControls.enableDamping = !isSoftwareGl;
    orbitControls.dampingFactor = 0.08;
    orbitControls.target.set(0, SLATE_Y, 0);
    orbitControls.minDistance = 0.9;
    orbitControls.maxDistance = 4.6;
    orbitControls.minPolarAngle = 0.08;
    orbitControls.maxPolarAngle = Math.PI / 2 - 0.06;
    orbitControls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };
    orbitControls.enablePan = true;
    orbitControls.panSpeed = 0.85;
    orbitControls.zoomSpeed = 1.0;
    orbitControls.enabled = false;

    // Pre-compile shaders on hardware WebGL
    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Touch-sensitive control layer for pinch-to-zoom, 2-finger rotation/tilt, & touch slop
    const touchCam = new TouchCameraController();
    touchCamRef.current = touchCam;
    let titleOrbitAngle = 0.65;

    // Pointer Interaction State (Mouse & Touch)
    let isDraggingAim = false;
    let isDraggingBallInHand = false;
    let draggingEditBallId: number | null = null;
    let precisionHeld = false;

    const updatePointerNdc = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      _pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      _pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    };

    const onPointerDown = (e: PointerEvent) => {
      const p = propsRef.current;
      if (p.isTitleScreen) return;

      // Right button or Orbit camera preset lets OrbitControls handle drag/pinch
      if (e.button === 2 || p.cameraPreset === 'orbit') {
        return;
      }

      const canAimNow =
        p.canInteract &&
        !p.isShooting &&
        !p.isReplaying &&
        !p.isBallInHand &&
        !p.isEditMode;

      const downRes = touchCam.handlePointerDown(
        {
          pointerId: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          pointerType: e.pointerType || 'mouse',
        },
        performance.now(),
        canAimNow ? p.aimAngleRef.current : null,
      );

      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // Ignore capture failures on synthetic/detached pointers
      }

      // Two-finger gesture switches cleanly to pinch-to-zoom & camera rotation
      if (downRes.isTwoFinger) {
        isDraggingAim = false;
        isDraggingBallInHand = false;
        draggingEditBallId = null;
        if (downRes.restoreAimAngle !== undefined) {
          p.onAimAngleChange(downRes.restoreAimAngle);
        }
        return;
      }

      if (p.isShooting || p.isReplaying) return;
      if (!p.canInteract && !p.isEditMode) return;

      if (p.isEditMode) {
        updatePointerNdc(e.clientX, e.clientY);
        _raycaster.setFromCamera(_pointerNdc, camera);
        const visibleMeshes = Array.from(ballMeshes.values()).filter((m) => m.visible);
        const hits = _raycaster.intersectObjects(visibleMeshes, false);
        if (hits.length > 0) {
          const hitMesh = hits[0].object as THREE.Mesh;
          for (const [id, m] of ballMeshes.entries()) {
            if (m === hitMesh) {
              draggingEditBallId = id;
              p.onEditSelectBall?.(id);
              return;
            }
          }
        }
        if (
          p.selectedEditBallId !== null &&
          p.selectedEditBallId !== undefined &&
          _raycaster.ray.intersectPlane(_slatePlane, _planeHit)
        ) {
          const margin = BALL_RADIUS + 0.006;
          const cx = Math.max(-HALF_LENGTH + margin, Math.min(HALF_LENGTH - margin, _planeHit.x));
          const cz = Math.max(-HALF_WIDTH + margin, Math.min(HALF_WIDTH - margin, _planeHit.z));
          draggingEditBallId = p.selectedEditBallId;
          p.onEditMoveBall?.(p.selectedEditBallId, cx, cz);
        }
        return;
      }

      if (p.isBallInHand) {
        isDraggingBallInHand = true;
        updatePointerNdc(e.clientX, e.clientY);
        _raycaster.setFromCamera(_pointerNdc, camera);
        if (_raycaster.ray.intersectPlane(_slatePlane, _planeHit)) {
          const margin = BALL_RADIUS + 0.01;
          const maxX = p.behindHeadStringOnly ? HEAD_STRING_X - 0.01 : HALF_LENGTH - margin;
          const cx = Math.max(-HALF_LENGTH + margin, Math.min(maxX, _planeHit.x));
          const cz = Math.max(-HALF_WIDTH + margin, Math.min(HALF_WIDTH - margin, _planeHit.z));
          p.onBallInHandMove(cx, cz);
        }
        return;
      }

      isDraggingAim = true;
    };

    const onPointerMove = (e: PointerEvent) => {
      const p = propsRef.current;
      if (p.isTitleScreen || p.cameraPreset === 'orbit') return;

      const viewW = canvas.clientWidth || window.innerWidth;
      const viewH = canvas.clientHeight || window.innerHeight;
      const moveRes = touchCam.handlePointerMove(
        {
          pointerId: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          pointerType: e.pointerType || 'mouse',
        },
        performance.now(),
        viewW,
        viewH,
        p.cameraSensitivity,
      );

      if (moveRes.handledByTwoFinger) {
        isDraggingAim = false;
        isDraggingBallInHand = false;
        draggingEditBallId = null;
        return;
      }

      if (p.isShooting || p.isReplaying) return;
      if (!p.canInteract && !p.isEditMode) return;

      if (p.isEditMode) {
        if (draggingEditBallId !== null) {
          updatePointerNdc(e.clientX, e.clientY);
          _raycaster.setFromCamera(_pointerNdc, camera);
          if (_raycaster.ray.intersectPlane(_slatePlane, _planeHit)) {
            const margin = BALL_RADIUS + 0.006;
            const cx = Math.max(-HALF_LENGTH + margin, Math.min(HALF_LENGTH - margin, _planeHit.x));
            const cz = Math.max(-HALF_WIDTH + margin, Math.min(HALF_WIDTH - margin, _planeHit.z));
            p.onEditMoveBall?.(draggingEditBallId, cx, cz);
          }
        }
        return;
      }

      if (isDraggingBallInHand && p.isBallInHand) {
        updatePointerNdc(e.clientX, e.clientY);
        _raycaster.setFromCamera(_pointerNdc, camera);
        if (_raycaster.ray.intersectPlane(_slatePlane, _planeHit)) {
          const margin = BALL_RADIUS + 0.01;
          const maxX = p.behindHeadStringOnly ? HEAD_STRING_X - 0.01 : HALF_LENGTH - margin;
          const cx = Math.max(-HALF_LENGTH + margin, Math.min(maxX, _planeHit.x));
          const cz = Math.max(-HALF_WIDTH + margin, Math.min(HALF_WIDTH - margin, _planeHit.z));
          p.onBallInHandMove(cx, cz);
        }
        return;
      }

      if (isDraggingAim && moveRes.canStartAimDrag) {
        const dx = moveRes.dragDeltaX;
        const dy = moveRes.dragDeltaY;
        const sens = (precisionHeld ? 0.0014 : 0.0048) * p.cameraSensitivity;
        // In overhead view, horizontal & vertical drag can smoothly rotate around cue ball
        const delta = p.cameraPreset === 'overhead' ? (dx + dy * 0.5) * sens : dx * sens;
        if (delta !== 0) {
          p.onAimAngleChange(p.aimAngleRef.current + delta);
        }
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      const p = propsRef.current;
      touchCam.handlePointerUp(
        e.pointerId,
        performance.now(),
        p.cameraPreset !== 'orbit' && !p.isEditMode && !p.isBallInHand,
      );
      draggingEditBallId = null;
      isDraggingBallInHand = false;
      isDraggingAim = false;
      try {
        if (canvas.hasPointerCapture(e.pointerId)) {
          canvas.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Ignore release errors
      }
    };

    const onWheel = (e: WheelEvent) => {
      const p = propsRef.current;
      if (p.isTitleScreen || p.cameraPreset === 'orbit') return;
      e.preventDefault();
      touchCam.applyWheelDelta(e.deltaY);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') precisionHeld = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') precisionHeld = false;
    };
    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const onContextRestored = () => {
      setContextLost(false);
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContextMenu);
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.fov = computeAdaptiveFov(w, h);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    // Animation Loop (60fps GPU / paced afterDraw on software WebGL)
    let disposed = false;
    let frameId = 0;
    const clock = new THREE.Clock();

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (disposed) return;

      const rawDt = clock.getDelta();
      const dt = Math.min(rawDt, 0.05);
      const p = propsRef.current;

      // 1. Sync 16 Ball Meshes from Physics State
      const balls = p.ballsRef.current;
      let cueBall: BallState | undefined;
      for (const b of balls) {
        if (b.id === 0) cueBall = b;
        const mesh = ballMeshes.get(b.id);
        if (!mesh) continue;
        if (b.pocketed) {
          mesh.visible = false;
        } else {
          mesh.visible = true;
          mesh.position.set(b.x, b.y, b.z);
          mesh.quaternion.set(b.qx, b.qy, b.qz, b.qw);
        }
      }

      // 2. Update Cue Stick Transform & Strike Thrust Animation
      if (strikeAnimRef.current.active) {
        strikeAnimRef.current.elapsed += dt;
        if (strikeAnimRef.current.elapsed > 0.24) {
          strikeAnimRef.current.active = false;
        }
      }

      const showCue =
        !p.isTitleScreen &&
        !p.isBallInHand &&
        !p.isEditMode &&
        cueBall &&
        !cueBall.pocketed &&
        ((!p.isShooting && !p.isReplaying) || strikeAnimRef.current.active);

      if (showCue && cueBall) {
        cue.group.visible = true;
        const angle = p.aimAngleRef.current;
        const dirX = Math.cos(angle);
        const dirZ = Math.sin(angle);

        let pullback = 0.025 + p.shotPowerRef.current * 0.34;
        if (strikeAnimRef.current.active) {
          const t = Math.min(1, strikeAnimRef.current.elapsed / 0.1);
          pullback = THREE.MathUtils.lerp(pullback, -0.04, t);
        }

        // Tip offset visually reflects applied sidespin & topspin/backspin
        const perpX = -dirZ;
        const perpZ = dirX;
        const tipSideOffset = p.spinRef.current.x * BALL_RADIUS * 0.5;
        const tipVertOffset = p.spinRef.current.y * BALL_RADIUS * 0.5;

        cue.group.position.set(
          cueBall.x - dirX * (BALL_RADIUS + pullback) + perpX * tipSideOffset,
          cueBall.y + tipVertOffset,
          cueBall.z - dirZ * (BALL_RADIUS + pullback) + perpZ * tipSideOffset,
        );
        cue.group.rotation.y = -angle;
      } else {
        cue.group.visible = false;
      }

      // 3. Update Pro Aiming Visuals (or selected ball ring in Trick Shot Edit Mode)
      if (p.isEditMode) {
        const selectedBall =
          p.selectedEditBallId !== null && p.selectedEditBallId !== undefined
            ? balls.find((b) => b.id === p.selectedEditBallId && !b.pocketed)
            : undefined;
        aimingVisuals.update({
          visible: !p.isTitleScreen && !p.isReplaying && Boolean(selectedBall),
          cueBall: selectedBall,
          balls,
          legalTargetIds: p.legalTargetIds,
          angle: p.aimAngleRef.current,
          aimAssist: p.aimAssist,
          isBallInHand: true,
          ballInHandValid: true,
        });
      } else {
        const idealShot =
          p.showIdealGuide && !p.isTitleScreen && !p.isReplaying && p.canInteract && !p.isShooting && !p.isBallInHand
            ? computePracticeIdealShot(balls, p.aimAngleRef.current)
            : null;
        aimingVisuals.update({
          visible: !p.isTitleScreen && !p.isReplaying && p.canInteract && !p.isShooting,
          cueBall,
          balls,
          legalTargetIds: p.legalTargetIds,
          angle: p.aimAngleRef.current,
          aimAssist: p.aimAssist,
          ghostBallGuide: p.ghostBallGuide ?? true,
          isBallInHand: p.isBallInHand,
          ballInHandValid: true,
          idealShot,
        });
      }

      const currReplayTime = p.replayTimeRef?.current ?? 0;
      replayTrails.updateProgress(
        Boolean(p.isReplaying && p.showReplayTrails),
        currReplayTime,
        Boolean(p.isReplaying && p.showCuePathTracer),
      );

      const spinFxActive = !p.isTitleScreen && Boolean(p.isShooting || p.isReplaying);
      const replayJumped =
        Boolean(p.isReplaying) &&
        (currReplayTime < lastReplayTimeForFx - 0.04 ||
          currReplayTime - lastReplayTimeForFx > 0.25);
      lastReplayTimeForFx = currReplayTime;

      spinEffects.update({
        active: spinFxActive,
        balls,
        dt,
        timeScale: p.isReplaying ? (p.replaySpeed ?? 1) : 1,
        paused: Boolean(p.isReplaying && p.replayPaused),
        resetSignal: replayJumped || (spinFxActive && !wasFxActive),
      });
      wasFxActive = spinFxActive;

      // 4. Damped Camera Choreography + Touch Camera Adjustments
      touchCam.step(dt, isSoftwareGl);
      const dampLambda = isSoftwareGl ? 20 : 6.5;
      if (p.isTitleScreen) {
        orbitControls.enabled = false;
        titleOrbitAngle += dt * 0.14;
        _targetCamPos.set(
          Math.cos(titleOrbitAngle) * 2.45,
          1.62 + Math.sin(titleOrbitAngle * 0.7) * 0.12,
          Math.sin(titleOrbitAngle) * 2.05,
        );
        _targetLookAt.set(0, SLATE_Y + 0.02, 0);
        camera.position.x = THREE.MathUtils.damp(camera.position.x, _targetCamPos.x, 4, dt);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, _targetCamPos.y, 4, dt);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, _targetCamPos.z, 4, dt);
        _currentLookAt.lerp(_targetLookAt, 1 - Math.exp(-4 * dt));
        camera.lookAt(_currentLookAt);
      } else if (p.cameraPreset === 'orbit') {
        orbitControls.enabled = true;
        orbitControls.rotateSpeed = 0.85 * p.cameraSensitivity;
        orbitControls.update();
      } else if (p.cameraPreset === 'overhead') {
        orbitControls.enabled = false;
        const zoomScale = touchCam.zoom / touchCam.defaultZoom;
        const overheadHeight = THREE.MathUtils.clamp(3.05 * zoomScale, 1.55, 4.35);
        const tiltAngle = THREE.MathUtils.clamp(touchCam.pitchOffset, 0, 0.88);
        const orbitRadius = 0.06 + Math.sin(tiltAngle) * overheadHeight * 0.72;
        const camY = SLATE_Y + (overheadHeight - SLATE_Y) * Math.cos(tiltAngle * 0.65);

        _targetCamPos.set(
          Math.sin(touchCam.yawOffset) * orbitRadius,
          camY,
          Math.cos(touchCam.yawOffset) * orbitRadius,
        );
        _targetLookAt.set(0, SLATE_Y, 0);
        camera.position.x = THREE.MathUtils.damp(camera.position.x, _targetCamPos.x, dampLambda, dt);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, _targetCamPos.y, dampLambda, dt);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, _targetCamPos.z, dampLambda, dt);
        _currentLookAt.lerp(_targetLookAt, 1 - Math.exp(-dampLambda * dt));
        camera.lookAt(_currentLookAt);
      } else if (p.cameraPreset === 'follow') {
        orbitControls.enabled = false;
        const fx = cueBall && !cueBall.pocketed ? cueBall.x : 0;
        const fz = cueBall && !cueBall.pocketed ? cueBall.z : 0;
        const ang = p.aimAngleRef.current + touchCam.yawOffset;
        const dirX = Math.cos(ang);
        const dirZ = Math.sin(ang);
        const perpX = -dirZ;
        const perpZ = dirX;
        const zoomScale = touchCam.zoom / touchCam.defaultZoom;
        const pitchLift = touchCam.pitchOffset * 0.85;

        _targetCamPos.set(
          fx * 0.55 - dirX * 1.38 * zoomScale + perpX * 0.78 * zoomScale,
          Math.max(SLATE_Y + 0.28, SLATE_Y + (0.92 + pitchLift) * Math.max(0.72, zoomScale * 0.88)),
          fz * 0.55 - dirZ * 1.38 * zoomScale + perpZ * 0.78 * zoomScale,
        );
        _targetLookAt.set(fx * 0.7, SLATE_Y + 0.04, fz * 0.7);
        camera.position.x = THREE.MathUtils.damp(camera.position.x, _targetCamPos.x, dampLambda, dt);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, _targetCamPos.y, dampLambda, dt);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, _targetCamPos.z, dampLambda, dt);
        _currentLookAt.lerp(_targetLookAt, 1 - Math.exp(-dampLambda * dt));
        camera.lookAt(_currentLookAt);
      } else {
        orbitControls.enabled = false;
        const cx = cueBall && !cueBall.pocketed ? cueBall.x : 0;
        const cz = cueBall && !cueBall.pocketed ? cueBall.z : 0;
        const aimAng = p.aimAngleRef.current;
        const viewAng = aimAng + touchCam.yawOffset;
        const dirX = Math.cos(viewAng);
        const dirZ = Math.sin(viewAng);
        const aimDirX = Math.cos(aimAng);
        const aimDirZ = Math.sin(aimAng);

        const isLow = p.cameraPreset === 'low';
        const dist = isLow ? touchCam.zoom * 0.85 : touchCam.zoom;
        const baseHeight = isLow ? 0.24 : 0.62 * (dist / 1.42);
        const radialTotal = Math.hypot(dist, baseHeight);
        const baseElev = Math.atan2(baseHeight, dist);
        const elev = THREE.MathUtils.clamp(baseElev + touchCam.pitchOffset, 0.08, 1.32);
        const horizDist = radialTotal * Math.cos(elev);
        const heightOffset = radialTotal * Math.sin(elev);

        const yawBlend = Math.min(1, Math.abs(touchCam.yawOffset) / 0.85);
        const lookAhead = THREE.MathUtils.lerp(0.55, 0.16, yawBlend);

        _targetCamPos.set(
          cx - dirX * horizDist,
          SLATE_Y + heightOffset,
          cz - dirZ * horizDist,
        );
        _targetLookAt.set(
          cx + aimDirX * lookAhead,
          SLATE_Y + 0.04,
          cz + aimDirZ * lookAhead,
        );

        camera.position.x = THREE.MathUtils.damp(camera.position.x, _targetCamPos.x, dampLambda, dt);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, _targetCamPos.y, dampLambda, dt);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, _targetCamPos.z, dampLambda, dt);
        _currentLookAt.lerp(_targetLookAt, 1 - Math.exp(-dampLambda * dt));
        camera.lookAt(_currentLookAt);
      }

      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    frameId = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContextMenu);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', onResize);

      touchCam.clearPointers();
      touchCamRef.current = null;
      orbitControls.dispose();
      aimingVisuals.dispose();
      replayTrails.dispose();
      spinEffects.dispose();
      cue.dispose();
      table.dispose();
      envRig.dispose();
      for (const d of ballDisposables) d.dispose();
      renderer.dispose();
      if (canvas.parentElement === container) {
        container.removeChild(canvas);
      }
    };
  }, []);

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#080B0A]">
      <div ref={mountRef} className="w-full h-full" />
      {contextLost && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#080B0A]/90 z-50">
          <div className="p-6 rounded-xl border border-emerald-500/30 bg-[#0E1311] text-center max-w-sm">
            <h2 className="font-display text-lg font-semibold text-white mb-2">
              {t.contextSuspendedTitle}
            </h2>
            <p className="text-sm text-zinc-400">
              {t.contextSuspendedDesc}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
