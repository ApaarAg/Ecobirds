import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  CAMERA_PAN_WORLD_SPAN,
  LEAF_STEM_LOCAL_OFFSET,
  TREE_TWIG_TEX_UV,
  type CinematicTimelineState,
} from '../../lib/cinematicTimeline';
import {
  CINEMATIC_FRAGMENT_SHADER,
  CINEMATIC_VERTEX_SHADER,
  LEAF_FRAGMENT_SHADER,
  LEAF_VERTEX_SHADER,
  MOTES_FRAGMENT_SHADER,
  MOTES_VERTEX_SHADER,
} from './cinematicShaders';

const TREE_TEX_URL = '/src/assets/images/old_growth_opening_4k.jpg';
const LAKE_DARK_TEX_URL = '/src/assets/images/still_forest_water_1795328638142.jpg';
const LEAF_TEX_URL = '/src/assets/images/green_forest_leaf_1795360418647.jpg';
const FOREST_MID_TEX_URL = '/src/assets/images/coastal_waterside_forest_4k.jpg';
const FOREST_FAR_TEX_URL = '/src/assets/images/coastal_waterside_forest_4k.jpg';
const ENV_TEX_ASPECT = 3840 / 2143;

// Pre-allocated math helpers (zero GC inside render loop)
const _raycaster = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _ndc3 = new THREE.Vector3();
const _projVec = new THREE.Vector3();
const _stemOffset = new THREE.Vector3();
const _leafEuler = new THREE.Euler();

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

function unprojectTwigToZ0(
  camera: THREE.PerspectiveCamera,
  screenAspect: number,
  texAspect: number,
  panNormY: number,
  panOffsetX: number,
  out: THREE.Vector3
): void {
  // Exact inverse of coverUvTree in CINEMATIC_FRAGMENT_SHADER
  let cx = TREE_TWIG_TEX_UV.u - 0.5;
  const cy = TREE_TWIG_TEX_UV.v - 0.5;
  if (screenAspect < 1.0) {
    cx -= 0.17;
  }

  let treeScreenU: number;
  let treeScreenV: number;
  if (screenAspect > texAspect) {
    treeScreenU = cx + 0.5;
    treeScreenV = cy * (screenAspect / texAspect) + 0.5;
  } else {
    treeScreenU = cx * (texAspect / screenAspect) + 0.5;
    treeScreenV = cy + 0.5;
  }

  const screenU = treeScreenU - panOffsetX;
  const screenV = treeScreenV + (1.0 - panNormY) * CAMERA_PAN_WORLD_SPAN;

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
 * - Pure #000000 blackness -> gradual low-light tree & branch reveal -> brief hold
 * - Single photographed alder leaf emerges physically attached to the branch twig
 * - Natural 6-8s aerodynamic descent with smooth cinematographer camera follow down to dark water
 * - Water contact concentric ripples -> fluid portal transition into sunlit multi-depth forest
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
    renderer.toneMappingExposure = 1.06;
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

    const camera = new THREE.PerspectiveCamera(48, width / Math.max(1, height), 0.1, 30);
    camera.position.set(0, 0, 2.5);

    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const loader = new THREE.TextureLoader();

    const configureTex = (tex: THREE.Texture) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = Math.min(8, maxAniso);
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.needsUpdate = true;
    };

    const uniforms = {
      uTexTree: { value: null as THREE.Texture | null },
      uTexLake: { value: null as THREE.Texture | null },
      uTexForestMid: { value: null as THREE.Texture | null },
      uTexForestFar: { value: null as THREE.Texture | null },
      uTreeReady: { value: 0 },
      uLakeReady: { value: 0 },
      uForestReady: { value: 0 },
      uResolution: { value: new THREE.Vector2(width, height) },
      uTexAspect: { value: ENV_TEX_ASPECT },
      uTime: { value: 0 },
      uMouse: { value: new THREE.Vector2(0, 0) },
      uTreeExposure: { value: 0 },
      uTrunkReveal: { value: 0 },
      uBranchReveal: { value: 0 },
      uTreeBlur: { value: 0 },
      uWindGust: { value: 0 },
      uCamPanNormY: { value: 1.03 },
      uCamPanOffsetX: { value: 0 },
      uLakeVisibility: { value: 0 },
      uReflectionIntensity: { value: 0 },
      uLightPos: { value: new THREE.Vector2(0.5, 0.5) },
      uLightIntensity: { value: 0 },
      uLightRadius: { value: 0.2 },
      uWaterMotion: { value: 0 },
      uLeafShadowPos: { value: new THREE.Vector2(0.5, 0.45) },
      uLeafHeightNorm: { value: 1 },
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
    };

    const leafUniforms = {
      uTexLeaf: { value: null as THREE.Texture | null },
      uLeafReady: { value: 0 },
      uTime: { value: 0 },
      uFallFlutter: { value: 0.14 },
      uOpacity: { value: 0 },
      uTreeExposure: { value: 0 },
      uLightIntensity: { value: 0.58 },
      uHeightNorm: { value: 1 },
      uColorAging: { value: 0 },
      uSubsurface: { value: 0.18 },
      uContactDip: { value: 0 },
      uLeafSoftness: { value: 0.52 },
      uCanopyPatchLight: { value: 1.0 },
    };

    const treeTex = loader.load(TREE_TEX_URL, (tex) => {
      configureTex(tex);
      uniforms.uTreeReady.value = 1;
      wakeRenderRef.current?.();
    });
    const lakeTex = loader.load(LAKE_DARK_TEX_URL, (tex) => {
      configureTex(tex);
      uniforms.uLakeReady.value = 1;
      wakeRenderRef.current?.();
    });
    const leafTex = loader.load(LEAF_TEX_URL, (tex) => {
      configureTex(tex);
      leafUniforms.uLeafReady.value = 1;
      wakeRenderRef.current?.();
    });
    const forestMidTex = loader.load(FOREST_MID_TEX_URL, (tex) => {
      configureTex(tex);
      uniforms.uForestReady.value = 1;
      wakeRenderRef.current?.();
    });
    const forestFarTex = loader.load(FOREST_FAR_TEX_URL, (tex) => {
      configureTex(tex);
      wakeRenderRef.current?.();
    });

    uniforms.uTexTree.value = treeTex;
    uniforms.uTexLake.value = lakeTex;
    leafUniforms.uTexLeaf.value = leafTex;
    uniforms.uTexForestMid.value = forestMidTex;
    uniforms.uTexForestFar.value = forestFarTex;

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

    const leafMaterial = new THREE.ShaderMaterial({
      uniforms: leafUniforms,
      vertexShader: LEAF_VERTEX_SHADER,
      fragmentShader: LEAF_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const leafGeometry = new THREE.PlaneGeometry(1.48, 0.84, 32, 18);
    const leafMesh = new THREE.Mesh(leafGeometry, leafMaterial);
    leafMesh.renderOrder = 2;
    scene.add(leafMesh);

    const syncStageDimensions = (w: number, h: number) => {
      const aspect = w / Math.max(1, h);
      const vFovRad = THREE.MathUtils.degToRad(camera.fov);
      const visibleHeight = 2 * Math.tan(vFovRad * 0.5) * 2.5;
      const visibleWidth = visibleHeight * aspect;
      stageMesh.scale.set(visibleWidth * 2.8, visibleHeight * 2.8, 1);
    };
    syncStageDimensions(width, height);

    const moteCount = 72;
    const motePositions = new Float32Array(moteCount * 3);
    const motePhases = new Float32Array(moteCount);
    const moteScales = new Float32Array(moteCount);
    for (let i = 0; i < moteCount; i++) {
      motePositions[i * 3] = (Math.random() - 0.5) * 3.2;
      motePositions[i * 3 + 1] = (Math.random() - 0.35) * 2.0;
      motePositions[i * 3 + 2] = 0.25 + Math.random() * 0.7;
      motePhases[i] = Math.random() * Math.PI * 2;
      moteScales[i] = 2.0 + Math.random() * 3.5;
    }

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
    scene.add(motesPoints);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const pointerCurrent = { x: 0, y: 0 };
    const twigWorld = new THREE.Vector3();
    let rippleStartTime = -10;
    let frameId = 0;
    let timerId = 0;
    let disposed = false;
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
      motesUniforms.uPixelRatio.value = nextDpr;
      syncStageDimensions(w, h);
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

      // Keep pointer parallax quiet until the lake/forest emerge so attached leaf stays rock-steady
      const ptrWeight = Math.max(tl.lake.visibility * 0.5, tl.world.portalProgress);
      pointerCurrent.x = reducedMotionRef.current
        ? 0
        : THREE.MathUtils.damp(pointerCurrent.x, ptrTarget.x * ptrWeight, 4.5, dt);
      pointerCurrent.y = reducedMotionRef.current
        ? 0
        : THREE.MathUtils.damp(pointerCurrent.y, ptrTarget.y * ptrWeight, 4.5, dt);

      camera.rotation.z = tl.camera.rollRad + pointerCurrent.x * 0.006;
      camera.rotation.x = tl.camera.pitchRad - pointerCurrent.y * 0.01;
      camera.position.z = tl.camera.cameraZ;
      camera.position.x = pointerCurrent.x * 0.022;
      camera.position.y = pointerCurrent.y * 0.016;
      camera.updateMatrixWorld();

      // Project exact twig tip from the photographed branch into 3D z=0 space
      unprojectTwigToZ0(
        camera,
        camera.aspect,
        ENV_TEX_ASPECT,
        tl.camera.panNormY,
        tl.camera.panOffsetX,
        twigWorld
      );

      const mobileFit = Math.min(1, Math.max(0.68, camera.aspect * 1.15));
      const effectiveScale = tl.leaf.scale * mobileFit;

      const gustAmp = 0.028 + tl.tree.windGust * 0.068;
      const breezeSway =
        reducedMotionRef.current || tl.leaf.attachBlend < 0.02
          ? 0
          : (Math.sin(elapsedTime * 1.35) * 0.7 + Math.sin(elapsedTime * 2.85 + 0.6) * 0.3) *
            gustAmp *
            tl.leaf.attachBlend;
      const leafRoll = tl.leaf.rollRad + breezeSway;

      _leafEuler.set(tl.leaf.pitchRad, tl.leaf.yawRad, leafRoll);
      _stemOffset
        .set(
          LEAF_STEM_LOCAL_OFFSET.x * effectiveScale,
          LEAF_STEM_LOCAL_OFFSET.y * effectiveScale,
          0
        )
        .applyEuler(_leafEuler);

      // Blend seamlessly from exact stem-anchored twig position -> aerodynamic air path -> lake surface (0, -0.22)
      const attachedCenterX = twigWorld.x - _stemOffset.x;
      const attachedCenterY = twigWorld.y - _stemOffset.y;

      const leafTargetX =
        THREE.MathUtils.lerp(attachedCenterX, 0, tl.leaf.xBlendToCenter) +
        tl.leaf.airSwayX * mobileFit;
      const leafTargetY =
        THREE.MathUtils.lerp(attachedCenterY, -0.22, tl.leaf.fallT) -
        tl.leaf.contactDip * 0.012;
      const buoyantBob =
        reducedMotionRef.current || tl.leaf.heightNorm > 0.05
          ? 0
          : Math.sin(elapsedTime * 1.35) * 0.005;

      leafMesh.visible = tl.leaf.opacity > 0.01;
      leafMesh.position.set(leafTargetX, leafTargetY + buoyantBob, tl.leaf.z);
      leafMesh.rotation.copy(_leafEuler);
      leafMesh.scale.set(effectiveScale, effectiveScale, 1);

      // Subtle dappled forest canopy light variation as leaf drifts across understory openings
      const patchLight =
        tl.leaf.attached > 0.5
          ? 0.92
          : 0.9 +
            0.14 * Math.sin(tl.leaf.fallT * 9.5 + leafTargetX * 3.2) * Math.sin(tl.leaf.heightNorm * Math.PI);

      leafUniforms.uTime.value = elapsedTime;
      leafUniforms.uFallFlutter.value = reducedMotionRef.current ? 0 : tl.leaf.flutterAmount;
      leafUniforms.uOpacity.value = tl.leaf.opacity;
      leafUniforms.uTreeExposure.value = tl.tree.exposure;
      leafUniforms.uLightIntensity.value = tl.leaf.lightFactor;
      leafUniforms.uHeightNorm.value = tl.leaf.heightNorm;
      leafUniforms.uColorAging.value = tl.leaf.colorAging;
      leafUniforms.uSubsurface.value = tl.leaf.subsurface;
      leafUniforms.uContactDip.value = tl.leaf.contactDip;
      leafUniforms.uLeafSoftness.value = tl.leaf.focusSoftness;
      leafUniforms.uCanopyPatchLight.value = patchLight;

      // Project leaf lake shadow & touchdown impact origin into screen UV space
      _projVec.set(leafTargetX, -0.22, 0.02).project(camera);
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
      uniforms.uTreeBlur.value = tl.tree.depthBlur;
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

      motesUniforms.uTime.value = elapsedTime;
      motesUniforms.uOpacity.value = 0;
      motesPoints.visible = false;

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
      leafGeometry.dispose();
      leafMaterial.dispose();
      motesGeometry.dispose();
      motesMaterial.dispose();
      treeTex.dispose();
      lakeTex.dispose();
      leafTex.dispose();
      forestMidTex.dispose();
      forestFarTex.dispose();
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
