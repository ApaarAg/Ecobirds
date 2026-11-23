import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  CAMERA_PAN_WORLD_SPAN,
  computeHeroWaterCropOffset,
  FOLIAGE_BASE_V_CENTER,
  HERO_WATER_TEX_ASPECT,
  LEAF_STEM_LOCAL_OFFSET,
  TREE_MOBILE_CROP_SHIFT_X,
  TREE_TWIG_TEX_UV,
  type CinematicTimelineState,
} from '../../lib/cinematicTimeline';
import {
  CINEMATIC_FRAGMENT_SHADER,
  CINEMATIC_VERTEX_SHADER,
  MOTES_FRAGMENT_SHADER,
  MOTES_VERTEX_SHADER,
} from './cinematicShaders';
import {
  createAcousticSpectrumSample,
  soundscapeController,
} from '../../audio/soundscapeEngine';
import { createPhysicalLeafBundle } from './leafMesh';

const OPENING_FOREST_TEX_URL = '/assets/aistudio/leandro-rossi-HZ77cQ1AtE0-unsplash_c7b58d52.jpg';
const FOLIAGE_TEX_URL = '/assets/aistudio/jason-leem-mopZf0QhPGw-unsplash_d838c284.jpg';
const HERO_WATER_TEX_URL = '/assets/aistudio/donnie-rosie-5z1FylG3Qf0-unsplash_334b210d.jpg';

const OPENING_TEX_ASPECT = 4000 / 6000;
const FOLIAGE_TEX_ASPECT = 4016 / 5015;
const ENV_TEX_ASPECT = 3840 / 2143;

// Pre-allocated math & audio telemetry helpers (zero GC inside render loop)
const _raycaster = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _ndc3 = new THREE.Vector3();
const _projVec = new THREE.Vector3();
const _stemOffset = new THREE.Vector3();
const _leafEuler = new THREE.Euler();
const _sunWarm = new THREE.Color(0xffdf9e);
const _sunCool = new THREE.Color(0x9eb8b4);
const _hemiWarmSky = new THREE.Color(0x5b828a);
const _hemiShadeSky = new THREE.Color(0x465c59);
const _audioSpectrum = createAcousticSpectrumSample();

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function unprojectFoliageTwigToZ0(
  camera: THREE.PerspectiveCamera,
  screenAspect: number,
  texAspect: number,
  panNormY: number,
  panOffsetX: number,
  foliageEntryX: number,
  foliageEntryY: number,
  foliageScale: number,
  foliagePush: number,
  mouseX: number,
  mouseY: number,
  out: THREE.Vector3
): void {
  // Exact algebraic inverse of foliageUv sampling in CINEMATIC_FRAGMENT_SHADER
  let cx = TREE_TWIG_TEX_UV.u - 0.5;
  const cy = TREE_TWIG_TEX_UV.v - FOLIAGE_BASE_V_CENTER;
  if (screenAspect < 1.0) {
    cx -= TREE_MOBILE_CROP_SHIFT_X;
  }

  let fScreenU: number;
  let fScreenV: number;
  if (screenAspect > texAspect) {
    fScreenU = cx + 0.5;
    fScreenV = cy * (screenAspect / texAspect) + 0.5;
  } else {
    fScreenU = cx * (texAspect / screenAspect) + 0.5;
    fScreenV = cy + 0.5;
  }

  const mouseWeight = 0.012 - foliagePush * 0.006;
  const fZoomedU = fScreenU - foliageEntryX - panOffsetX + mouseX * mouseWeight;
  const fZoomedV =
    fScreenV - foliageEntryY + (1.0 - panNormY) * CAMERA_PAN_WORLD_SPAN + mouseY * mouseWeight;

  const safeScale = Math.max(0.8, foliageScale);
  const screenU = (fZoomedU - 0.42) * safeScale + 0.42;
  const screenV = (fZoomedV - 0.44) * safeScale + 0.44;

  _ndc3.set(screenU * 2 - 1, screenV * 2 - 1, 0.5).unproject(camera);
  const dz = _ndc3.z - camera.position.z;
  const t = Math.abs(dz) > 1e-5 ? (0 - camera.position.z) / dz : 1;
  out.set(
    camera.position.x + (_ndc3.x - camera.position.x) * t,
    camera.position.y + (_ndc3.y - camera.position.y) * t,
    0
  );
}

interface WebGLCinematicStageProps {
  timelineRef: React.MutableRefObject<CinematicTimelineState>;
  pointerTargetRef: React.MutableRefObject<{ x: number; y: number }>;
  renderVersion: number;
  isInViewport: boolean;
  isMobile: boolean;
  reducedMotion: boolean;
  onWebGLUnavailable: () => void;
  onWaterRipple?: () => void;
}

/**
 * Isolated Three.js WebGL stage with zero React re-renders per frame.
 * Choreography:
 * - #000000 -> Opening forest (leandro-rossi) with restrained push & parallax
 * - Continuous camera push through sunlit foliage + foreground occlusion -> focus pull into oak branch (jason-leem)
 * - Oak leaf physically attached on twig -> wind -> stem flex -> 6-DOF aerodynamic fall -> water contact
 * - Dispersive ripples -> water reflections -> forest emergence -> acoustic identity reveal
 */
export function WebGLCinematicStage({
  timelineRef,
  pointerTargetRef,
  renderVersion,
  isInViewport,
  isMobile,
  reducedMotion,
  onWebGLUnavailable,
  onWaterRipple,
}: WebGLCinematicStageProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const inViewportRef = useRef(isInViewport);
  const reducedMotionRef = useRef(reducedMotion);
  const isMobileRef = useRef(isMobile);
  const wakeRenderRef = useRef<(() => void) | null>(null);

  inViewportRef.current = isInViewport;
  reducedMotionRef.current = reducedMotion;
  isMobileRef.current = isMobile;

  useEffect(() => {
    if (isInViewport) {
      wakeRenderRef.current?.();
    }
  }, [isInViewport, renderVersion, reducedMotion]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
        alpha: false,
        preserveDrawingBuffer: isSoftwareGl,
      });
    } catch {
      onWebGLUnavailable();
      return;
    }

    const dpr = isSoftwareGl
      ? 1
      : Math.min(window.devicePixelRatio || 1, isMobileRef.current ? 1.5 : 2);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.04;
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(0x000000, 1);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    renderer.setSize(width, height);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.cursor = 'pointer';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envRenderTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    roomEnv.dispose();
    pmremGenerator.dispose();
    scene.environment = envRenderTarget.texture;
    scene.environmentIntensity = 0.22;

    // Warm golden-hour directional sunlight from upper-left matching jason-leem + cool sky fill
    const sunKeyLight = new THREE.DirectionalLight(0xffdf9e, 2.55);
    sunKeyLight.position.set(-1.6, 2.2, 1.3);
    scene.add(sunKeyLight);

    const forestHemiLight = new THREE.HemisphereLight(0x5b828a, 0x22170e, 0.56);
    scene.add(forestHemiLight);

    const canopyBackLight = new THREE.DirectionalLight(0xffb95e, 0.65);
    canopyBackLight.position.set(-0.8, 0.9, -1.5);
    scene.add(canopyBackLight);

    const camera = new THREE.PerspectiveCamera(48, width / Math.max(1, height), 0.1, 30);
    camera.position.set(0, 0, 2.5);

    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const maxGpuTexDim = isSoftwareGl
      ? 1536
      : Math.min(2560, renderer.capabilities.maxTextureSize || 4096);

    const configureTex = (tex: THREE.Texture) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = Math.min(8, maxAniso);
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.needsUpdate = true;
    };

    const initialAspect = width / Math.max(1, height);
    const initialCrop = computeHeroWaterCropOffset(initialAspect, HERO_WATER_TEX_ASPECT);

    const uniforms = {
      uTexOpening: { value: null as THREE.Texture | null },
      uTexFoliage: { value: null as THREE.Texture | null },
      uTexForestMid: { value: null as THREE.Texture | null },
      uTexForestFar: { value: null as THREE.Texture | null },
      uOpeningReady: { value: 0 },
      uFoliageReady: { value: 0 },
      uForestReady: { value: 0 },
      uResolution: { value: new THREE.Vector2(width, height) },
      uOpeningTexAspect: { value: OPENING_TEX_ASPECT },
      uFoliageTexAspect: { value: FOLIAGE_TEX_ASPECT },
      uFoliageBaseVCenter: { value: FOLIAGE_BASE_V_CENTER },
      uTreeCropShiftX: { value: TREE_MOBILE_CROP_SHIFT_X },
      uTexAspect: { value: ENV_TEX_ASPECT },
      uForestTexAspect: { value: HERO_WATER_TEX_ASPECT },
      uForestCropOffset: { value: new THREE.Vector2(initialCrop.xShift, initialCrop.yShift) },
      uTime: { value: 0 },
      uMouse: { value: new THREE.Vector2(0, 0) },
      uTreeExposure: { value: 1 },
      uTrunkReveal: { value: 1 },
      uBranchReveal: { value: 1 },
      uOpeningZoom: { value: 1.0 },
      uOpeningPanV: { value: 0.45 },
      uOpeningBlur: { value: 0 },
      uFoliagePush: { value: 0 },
      uFoliagePresence: { value: 0 },
      uFoliageEntry: { value: new THREE.Vector2(-0.11, -0.22) },
      uFoliageScale: { value: 1.22 },
      uFoliageBlur: { value: 0.72 },
      uOcclusionSweep: { value: 0 },
      uWindGust: { value: 0 },
      uCamPanNormY: { value: 1.0 },
      uCamPanOffsetX: { value: 0 },
      uLakeVisibility: { value: 0 },
      uReflectionIntensity: { value: 0 },
      uLightPos: { value: new THREE.Vector2(0.5, 0.5) },
      uLightIntensity: { value: 0 },
      uLightRadius: { value: 0.2 },
      uWaterMotion: { value: 0 },
      uLeafShadowPos: { value: new THREE.Vector2(0.5, 0.45) },
      uLeafHeightNorm: { value: 1 },
      uLeafYaw: { value: 0.22 },
      uLeafOpacity: { value: 0 },
      uImpactOrigin: { value: new THREE.Vector2(0.5, 0.45) },
      uImpactRippleProgress: { value: 0 },
      uImpactRippleStrength: { value: 0 },
      uContactDip: { value: 0 },
      uRippleCenter: { value: new THREE.Vector2(0.5, 0.5) },
      uRippleAge: { value: 10 },
      uRippleActive: { value: 0 },
      uPortalProgress: { value: 0 },
      uSettleScale: { value: 1.06 },
      uSettleRollRad: { value: 0 },
      uHazeOpacity: { value: 0 },
      uDarknessVeil: { value: 0 },
      uWaterResonance: { value: 0 },
      uAcousticTopography: { value: 0 },
      uAudioBands: { value: new THREE.Vector4(0.18, 0.24, 0.14, 0.2) },
    };

    let disposed = false;
    let openingTex: THREE.Texture | null = null;
    let foliageTex: THREE.Texture | null = null;
    let forestTex: THREE.Texture | null = null;

    // Safely downsize ultra-high-res photos to GPU max dimension so WebGL never hits MAX_TEXTURE_SIZE
    const loadCappedPhotoTexture = (
      url: string,
      onReady: (tex: THREE.Texture) => void
    ) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (disposed) return;
        const maxSide = Math.max(img.naturalWidth, img.naturalHeight);
        let tex: THREE.Texture;
        if (maxSide > maxGpuTexDim) {
          const scale = maxGpuTexDim / maxSide;
          const cw = Math.max(2, Math.round(img.naturalWidth * scale));
          const ch = Math.max(2, Math.round(img.naturalHeight * scale));
          const off = document.createElement('canvas');
          off.width = cw;
          off.height = ch;
          const ctx = off.getContext('2d');
          if (ctx) {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, cw, ch);
            tex = new THREE.CanvasTexture(off);
          } else {
            tex = new THREE.Texture(img);
          }
        } else {
          tex = new THREE.Texture(img);
        }
        configureTex(tex);
        onReady(tex);
        wakeRenderRef.current?.();
      };
      img.src = url;
    };

    loadCappedPhotoTexture(OPENING_FOREST_TEX_URL, (tex) => {
      openingTex = tex;
      uniforms.uTexOpening.value = tex;
      uniforms.uOpeningReady.value = 1;
    });

    loadCappedPhotoTexture(FOLIAGE_TEX_URL, (tex) => {
      foliageTex = tex;
      uniforms.uTexFoliage.value = tex;
      uniforms.uFoliageReady.value = 1;
    });

    loadCappedPhotoTexture(HERO_WATER_TEX_URL, (tex) => {
      forestTex = tex;
      uniforms.uTexForestMid.value = tex;
      uniforms.uTexForestFar.value = tex;
      uniforms.uForestReady.value = 1;
    });

    const stageMaterial = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: CINEMATIC_VERTEX_SHADER,
      fragmentShader: CINEMATIC_FRAGMENT_SHADER,
      depthWrite: false,
    });

    const stageGeometry = new THREE.PlaneGeometry(1, 1, 1, 1);
    const stageMesh = new THREE.Mesh(stageGeometry, stageMaterial);
    stageMesh.renderOrder = 0;
    scene.add(stageMesh);

    const leafBundle = createPhysicalLeafBundle(maxAniso, FOLIAGE_TEX_URL, () => {
      wakeRenderRef.current?.();
    });
    const leafMesh = leafBundle.mesh;
    const leafUniforms = leafBundle.uniforms;
    scene.add(leafMesh);

    const syncStageDimensions = (w: number, h: number) => {
      const aspect = w / Math.max(1, h);
      const vFovRad = THREE.MathUtils.degToRad(camera.fov);
      const visibleHeight = 2 * Math.tan(vFovRad * 0.5) * 2.5;
      const visibleWidth = visibleHeight * aspect;
      stageMesh.scale.set(visibleWidth * 2.8, visibleHeight * 2.8, 1);
    };
    syncStageDimensions(width, height);

    const moteCount = 16;
    const motePositions = new Float32Array(moteCount * 3);
    const motePhases = new Float32Array(moteCount);
    const moteScales = new Float32Array(moteCount);
    const motesGeometry = new THREE.BufferGeometry();
    motesGeometry.setAttribute('position', new THREE.BufferAttribute(motePositions, 3));
    motesGeometry.setAttribute('aPhase', new THREE.BufferAttribute(motePhases, 1));
    motesGeometry.setAttribute('aScale', new THREE.BufferAttribute(moteScales, 1));

    const motesUniforms = {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uPixelRatio: { value: dpr },
    };

    const motesMaterial = new THREE.ShaderMaterial({
      uniforms: motesUniforms,
      vertexShader: MOTES_VERTEX_SHADER,
      fragmentShader: MOTES_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    const motesPoints = new THREE.Points(motesGeometry, motesMaterial);
    motesPoints.renderOrder = 3;
    motesPoints.frustumCulled = false;
    motesPoints.visible = false;
    scene.add(motesPoints);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const pointerCurrent = { x: 0, y: 0 };
    const twigWorld = new THREE.Vector3();
    let rippleStartTime = -10;
    let frameId = 0;
    let timerId = 0;
    let lastNow = performance.now();
    let elapsedTime = 0;

    const handleCanvasClick = (e: MouseEvent) => {
      if (timelineRef.current.lake.visibility < 0.35) return;
      const rect = renderer.domElement.getBoundingClientRect();
      _ndc.set(
        ((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
        -((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1
      );
      _raycaster.setFromCamera(_ndc, camera);
      const hits = _raycaster.intersectObject(stageMesh);
      if (hits.length > 0 && hits[0].uv) {
        const uv = hits[0].uv;
        const screenAspect = rect.width / Math.max(1, rect.height);
        const texAspect = ENV_TEX_ASPECT;
        let cx = (uv.x - 0.5) * 2.8;
        let cy = (uv.y - 0.5) * 2.8;
        if (screenAspect > texAspect) {
          cy *= texAspect / screenAspect;
        } else {
          cx *= screenAspect / texAspect;
        }
        uniforms.uRippleCenter.value.set(cx + 0.5, cy + 0.5);
        rippleStartTime = elapsedTime;
        uniforms.uRippleActive.value = 1;
        wakeRenderRef.current?.();
        onWaterRipple?.();
      }
    };
    renderer.domElement.addEventListener('click', handleCanvasClick);

    const handleResize = () => {
      if (disposed || !container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      const nextDpr = isSoftwareGl
        ? 1
        : Math.min(window.devicePixelRatio || 1, w < 768 ? 1.5 : 2);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(nextDpr);
      renderer.setSize(w, h);
      uniforms.uResolution.value.set(w, h);
      const nextCrop = computeHeroWaterCropOffset(w / Math.max(1, h), HERO_WATER_TEX_ASPECT);
      uniforms.uForestCropOffset.value.set(nextCrop.xShift, nextCrop.yShift);
      motesUniforms.uPixelRatio.value = nextDpr;
      syncStageDimensions(w, h);
      renderer.render(scene, camera);
      wakeRenderRef.current?.();
    };
    window.addEventListener('resize', handleResize);

    const afterDraw = (cb: () => void) => {
      if (disposed) return;
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (gl && typeof gl.fenceSync === 'function') {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (disposed) {
            if (sync) gl.deleteSync(sync);
            return;
          }
          const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
          if (state === gl.UNSIGNALED) {
            timerId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            timerId = window.setTimeout(cb, 45);
          }
        };
        timerId = window.setTimeout(poll, 5);
      } else {
        timerId = window.setTimeout(cb, 50);
      }
    };

    const tick = () => {
      frameId = 0;
      timerId = 0;
      if (disposed || !inViewportRef.current) {
        return;
      }

      const now = performance.now();
      const dt = Math.min(0.2, Math.max(0.001, (now - lastNow) * 0.001));
      lastNow = now;
      if (!reducedMotionRef.current) {
        elapsedTime += dt;
      }

      const tl = timelineRef.current;
      const ptrTarget = pointerTargetRef.current;

      // Restrained parallax throughout forest -> foliage -> lake -> emerged world
      const ptrWeight = Math.max(0.32, tl.lake.visibility * 0.5, tl.world.portalProgress);
      pointerCurrent.x = reducedMotionRef.current
        ? 0
        : THREE.MathUtils.damp(pointerCurrent.x, ptrTarget.x * ptrWeight, 4.2, dt);
      pointerCurrent.y = reducedMotionRef.current
        ? 0
        : THREE.MathUtils.damp(pointerCurrent.y, ptrTarget.y * ptrWeight, 4.2, dt);

      camera.rotation.z = tl.camera.rollRad + pointerCurrent.x * 0.005;
      camera.rotation.x = tl.camera.pitchRad - pointerCurrent.y * 0.008;
      camera.position.z = tl.camera.cameraZ;
      camera.position.x = pointerCurrent.x * 0.018;
      camera.position.y = pointerCurrent.y * 0.014;
      camera.updateMatrixWorld();

      // Exact algebraic inverse projection of the bare oak twiglet tip in jason-leem into 3D z=0
      unprojectFoliageTwigToZ0(
        camera,
        camera.aspect,
        FOLIAGE_TEX_ASPECT,
        tl.camera.panNormY,
        tl.camera.panOffsetX,
        tl.tree.foliageEntryX,
        tl.tree.foliageEntryY,
        tl.tree.foliageScale,
        tl.tree.foliagePushProgress,
        pointerCurrent.x,
        pointerCurrent.y,
        twigWorld
      );

      const mobileFit = Math.min(1, Math.max(0.72, camera.aspect * 1.15));
      const effectiveScale = tl.leaf.scale * mobileFit;

      const gustAmp = 0.024 + tl.tree.windGust * 0.088;
      const breezeSway =
        reducedMotionRef.current || tl.leaf.attachBlend < 0.02
          ? 0
          : (Math.sin(elapsedTime * 1.45) * 0.65 + Math.sin(elapsedTime * 3.1 + 0.5) * 0.35) *
            gustAmp *
            tl.leaf.attachBlend;

      const rockAmp = reducedMotionRef.current ? 0 : tl.leaf.waveRockStrength;
      const waveHeave = rockAmp * Math.sin(elapsedTime * 1.45) * 0.0018;
      const wavePitchRock = rockAmp * Math.sin(elapsedTime * 1.15 + 0.4) * 0.015;
      const waveRollRock = rockAmp * Math.cos(elapsedTime * 1.32 + 0.9) * 0.018;

      const leafRoll = tl.leaf.rollRad + breezeSway + waveRollRock;
      const leafPitch = tl.leaf.pitchRad + wavePitchRock;

      _leafEuler.set(leafPitch, tl.leaf.yawRad, leafRoll);
      _stemOffset
        .set(
          LEAF_STEM_LOCAL_OFFSET.x * effectiveScale,
          LEAF_STEM_LOCAL_OFFSET.y * effectiveScale,
          LEAF_STEM_LOCAL_OFFSET.z * effectiveScale
        )
        .applyEuler(_leafEuler);

      const attachedCenterX = twigWorld.x - _stemOffset.x;
      const attachedCenterY = twigWorld.y - _stemOffset.y;

      const leafTargetX =
        THREE.MathUtils.lerp(attachedCenterX, 0, tl.leaf.xBlendToCenter) +
        tl.leaf.airSwayX * mobileFit +
        tl.leaf.floatDriftX * mobileFit;
      // Camera tracks the falling leaf near center-lower frame while forest depth planes rise upward past lens
      const trackLift = Math.sin(tl.leaf.fallT * Math.PI) * 0.085;
      const leafTargetY =
        THREE.MathUtils.lerp(attachedCenterY, -0.22, tl.leaf.fallT) +
        trackLift -
        tl.leaf.contactDip * 0.011 -
        tl.leaf.waterlineDepth * 0.004 +
        tl.leaf.floatDriftY +
        waveHeave;
      const leafTargetZ = tl.leaf.z + tl.leaf.floatDriftZ;

      leafMesh.visible = tl.leaf.opacity > 0.01;
      leafMesh.position.set(leafTargetX, leafTargetY, leafTargetZ);
      leafMesh.rotation.copy(_leafEuler);
      leafMesh.scale.setScalar(effectiveScale);

      // Inherit exact environment illumination: warm golden-hour oak sun -> shaded woodland pond basin
      const canopyLightWeight = THREE.MathUtils.smoothstep(tl.leaf.heightNorm, 0.14, 0.82);
      sunKeyLight.color.lerpColors(_sunCool, _sunWarm, canopyLightWeight);
      sunKeyLight.intensity = THREE.MathUtils.lerp(0.62, 2.55, canopyLightWeight);
      forestHemiLight.color.lerpColors(_hemiShadeSky, _hemiWarmSky, canopyLightWeight);
      canopyBackLight.intensity = THREE.MathUtils.lerp(0.14, 0.68, canopyLightWeight);

      const patchLight =
        tl.leaf.attached > 0.5
          ? 0.96
          : 0.92 +
            0.12 * Math.sin(tl.leaf.fallT * 8.5 + leafTargetX * 2.8) * Math.sin(tl.leaf.heightNorm * Math.PI);

      leafUniforms.uTime.value = elapsedTime;
      leafUniforms.uFallFlutter.value = reducedMotionRef.current ? 0 : tl.leaf.flutterAmount;
      leafUniforms.uStemFlex.value = reducedMotionRef.current ? 0 : tl.leaf.stemFlex;
      leafUniforms.uOpacity.value = tl.leaf.opacity;
      leafUniforms.uTreeExposure.value = tl.tree.exposure;
      leafUniforms.uLightIntensity.value = tl.leaf.lightFactor;
      leafUniforms.uHeightNorm.value = tl.leaf.heightNorm;
      leafUniforms.uColorAging.value = tl.leaf.colorAging;
      leafUniforms.uSubsurface.value = tl.leaf.subsurface;
      leafUniforms.uContactDip.value = tl.leaf.contactDip;
      leafUniforms.uLeafSoftness.value = tl.leaf.focusSoftness;
      leafUniforms.uCanopyPatchLight.value = patchLight;

      _projVec.set(leafTargetX, -0.22 + tl.leaf.floatDriftY, leafTargetZ).project(camera);
      uniforms.uLeafShadowPos.value.set(
        THREE.MathUtils.clamp(_projVec.x * 0.5 + 0.5, 0.15, 0.85),
        THREE.MathUtils.clamp(_projVec.y * 0.5 + 0.5, 0.15, 0.85)
      );

      _projVec.set(0, -0.22, 0.02).project(camera);
      uniforms.uImpactOrigin.value.set(
        THREE.MathUtils.clamp(_projVec.x * 0.5 + 0.5, 0.25, 0.75),
        THREE.MathUtils.clamp(_projVec.y * 0.5 + 0.5, 0.2, 0.75)
      );

      const swayX = reducedMotionRef.current ? 0 : Math.sin(elapsedTime * 0.36) * 0.022;
      const swayY = reducedMotionRef.current ? 0 : Math.cos(elapsedTime * 0.28) * 0.016;

      uniforms.uTime.value = elapsedTime;
      uniforms.uMouse.value.set(pointerCurrent.x, pointerCurrent.y);
      uniforms.uTreeExposure.value = tl.tree.exposure;
      uniforms.uTrunkReveal.value = tl.tree.trunkReveal;
      uniforms.uBranchReveal.value = tl.tree.branchReveal;
      uniforms.uOpeningZoom.value = tl.tree.openingZoom;
      uniforms.uOpeningPanV.value = tl.tree.openingPanV;
      uniforms.uOpeningBlur.value = tl.tree.openingBlur;
      uniforms.uFoliagePush.value = tl.tree.foliagePushProgress;
      uniforms.uFoliagePresence.value = tl.tree.foliagePresence;
      uniforms.uFoliageEntry.value.set(tl.tree.foliageEntryX, tl.tree.foliageEntryY);
      uniforms.uFoliageScale.value = tl.tree.foliageScale;
      uniforms.uFoliageBlur.value = tl.tree.foliageBlur;
      uniforms.uOcclusionSweep.value = tl.tree.occlusionSweep;
      uniforms.uWindGust.value = tl.tree.windGust;
      uniforms.uCamPanNormY.value = tl.camera.panNormY;
      uniforms.uCamPanOffsetX.value = tl.camera.panOffsetX;
      uniforms.uLakeVisibility.value = tl.lake.visibility;
      uniforms.uReflectionIntensity.value = tl.lake.reflectionIntensity;

      uniforms.uLightPos.value.set(
        tl.light.xNorm + swayX + pointerCurrent.x * 0.036,
        1.0 - tl.light.yNorm + swayY - pointerCurrent.y * 0.026
      );
      uniforms.uLightIntensity.value = tl.light.intensity;
      uniforms.uLightRadius.value = tl.light.radiusNorm;
      uniforms.uWaterMotion.value = tl.light.waterMotion;
      uniforms.uLeafHeightNorm.value = tl.leaf.heightNorm;
      uniforms.uLeafYaw.value = tl.leaf.yawRad;
      uniforms.uLeafOpacity.value = tl.leaf.opacity;
      uniforms.uImpactRippleProgress.value = tl.leaf.impactRippleProgress;
      uniforms.uImpactRippleStrength.value = tl.leaf.impactRippleStrength;
      uniforms.uContactDip.value = tl.leaf.contactDip;

      if (uniforms.uRippleActive.value > 0.5) {
        const age = elapsedTime - rippleStartTime;
        uniforms.uRippleAge.value = age;
        if (age > 4.2) {
          uniforms.uRippleActive.value = 0;
        }
      }

      uniforms.uPortalProgress.value = tl.world.portalProgress;
      uniforms.uSettleScale.value = tl.world.settleScale;
      uniforms.uSettleRollRad.value = THREE.MathUtils.degToRad(tl.world.counterRollDeg);
      uniforms.uHazeOpacity.value = tl.world.hazeOpacity;
      uniforms.uDarknessVeil.value = tl.camera.darknessVeilOpacity;

      soundscapeController.sampleAcousticSpectrum(elapsedTime, tl.audioMix, _audioSpectrum);
      uniforms.uWaterResonance.value = tl.acoustic.waterResonance;
      uniforms.uAcousticTopography.value = tl.acoustic.topographyStrength;
      uniforms.uAudioBands.value.set(
        _audioSpectrum.lowBand,
        _audioSpectrum.midBand,
        _audioSpectrum.highBand,
        _audioSpectrum.amplitude
      );

      motesUniforms.uTime.value = elapsedTime;
      motesUniforms.uOpacity.value = 0;

      renderer.render(scene, camera);

      if (reducedMotionRef.current && uniforms.uRippleActive.value < 0.5) {
        return;
      }

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = window.requestAnimationFrame(tick);
      }
    };

    wakeRenderRef.current = () => {
      if (disposed || frameId || timerId) return;
      lastNow = performance.now();
      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timerId);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('click', handleCanvasClick);

      stageGeometry.dispose();
      stageMaterial.dispose();
      leafBundle.dispose();
      motesGeometry.dispose();
      motesMaterial.dispose();
      envRenderTarget.dispose();
      openingTex?.dispose();
      foliageTex?.dispose();
      forestTex?.dispose();
      renderer.dispose();

      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [onWaterRipple, onWebGLUnavailable, pointerTargetRef, timelineRef]);

  return (
    <div
      ref={mountRef}
      data-testid="cinematic-webgl-stage"
      aria-label="EcoSonic cinematic opening sequence"
      className="absolute inset-0 bg-[#000000]"
    />
  );
}
