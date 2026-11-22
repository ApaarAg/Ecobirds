export type CinematicPhaseId =
  | 'blackness'
  | 'tree_reveal'
  | 'tree_hold'
  | 'leaf_reveal'
  | 'leaf_fall'
  | 'water_contact'
  | 'ripple_expansion'
  | 'water_reflection'
  | 'camera_emergence'
  | 'forest_settled'
  | 'acoustic_emergence'
  | 'identity_reveal';

/** Total duration (seconds) of the automatic opening film before resting on initial water contact */
export const OPENING_DURATION_SEC = 14.8;

/** Timeline progress where the opening auto-play settles on initial leaf-water contact */
export const OPENING_SETTLE_PROGRESS = 0.63;

/** Normalized GL UV coordinate (bottom-left origin) of the alder leafy twig tip on old_growth_opening_4k */
export const TREE_TWIG_TEX_UV = { u: 0.684, v: 0.522 } as const;

/** Local model-space offset (PlaneGeometry 1.48 x 0.84) of the petiole stem tip inside green_forest_leaf */
export const LEAF_STEM_LOCAL_OFFSET = { x: -0.652, y: -0.072 } as const;

/** Normalized world-height span separating the upper tree camera from the lower lake camera */
export const CAMERA_PAN_WORLD_SPAN = 0.68;

export interface TreeRevealState {
  exposure: number; // 0 = pure black, 1 = natural overcast old-growth forest
  trunkReveal: number; // gradual trunk-first emergence
  branchReveal: number; // extending branch structure follows
  windGust: number; // 0..1 natural wind stirring the alder foliage right before detachment
  depthBlur: number; // 0..1 subtle cinema-lens background softness as camera tracks falling leaf
}

export interface LakeStageState {
  visibility: number; // 0 before camera discovers water below -> 1 at lake
  reflectionIntensity: number; // 0 -> 1 subtle forest reflection perceived inside expanding water ripples
}

export interface CameraTransformState {
  rollDeg: number; // calm horizon alignment (never sudden tilt)
  rollRad: number; // radians for Three.js camera.rotation.z
  pitchDeg: number; // gentle observational tilt following leaf onto lake -> moving through reflection -> level waterside
  pitchRad: number; // radians for Three.js camera.rotation.x
  cameraZ: number; // wide tree -> water approach -> smooth glide through water reflection into forest
  panNormY: number; // 1.03 (tree upper canopy) -> 0.0 (dark lake below)
  panOffsetX: number; // subtle horizontal camera follow during leaf drift
  darknessVeilOpacity: number;
}

export interface LeafMotionState {
  attached: number; // 1 while physically connected to branch twig, 0 after detachment
  attachBlend: number; // smooth 1 -> 0 blend for petiole pivot transition
  fallT: number; // 0 on branch -> 1 touching water surface
  xBlendToCenter: number; // 0 at twig X -> 1 centered above lake
  airSwayX: number; // organic multi-harmonic lateral air drift
  y: number; // fallback/test vertical normalized curve (0.34 -> -0.22)
  z: number; // gentle 3D air depth progression
  scale: number; // physically plausible branch leaf scale -> natural water resting scale
  pitchRad: number;
  yawRad: number;
  rollRad: number;
  flutterAmount: number; // 1 while falling -> 0 settled on lake
  heightNorm: number; // 1 aloft/attached -> 0 touching dark water
  opacity: number; // matches tree exposure on branch, 1 through fall/contact, fades softly into reflection glide
  lightFactor: number; // overcast canopy lighting -> ambient air catchlight -> reflected lake light
  colorAging: number; // 0 = muted natural green -> olive -> desaturated ochre -> 1 = damp autumn brown
  subsurface: number; // subtle overcast translucency while attached -> diminishes as leaf ages
  focusSoftness: number; // matches mid-distance branch DoF on tree -> crisp cinema focus during fall
  contactDip: number; // subtle meniscus surface tension cushion at initial water touch
  impactRippleProgress: number; // 0 before touchdown, expands 0 -> 1 across lake
  impactRippleStrength: number; // wave crest envelope peaking on contact & expansion
}

export interface LightState {
  xNorm: number; // 0..1 across frame
  yNorm: number; // 0..1 across frame
  intensity: number; // 0..1
  radiusNorm: number;
  waterMotion: number; // 0..1 water ripple & gentle wake
}

export interface WorldEmergenceState {
  portalProgress: number; // 0..1 ripple-masked camera emergence out of water reflection into wet forest
  settleScale: number; // subtle continuous camera approach across water surface -> 1.0
  counterRollDeg: number; // subtle horizon settle -> 0
  hazeOpacity: number;
  particlesOpacity: number; // kept 0 (no artificial floating particles)
}

export interface AcousticStructureState {
  waveOpacity: number; // subtle wave patterns emerging from water resonance
  contourProgress: number; // 0..1 harmonic frequency contour lines forming
  spectrumIntensity: number; // subtle spectral structure settling behind EcoSonic identity
}

export interface AudioMixState {
  water: number; // 0..1 water resonance at contact & ripple
  wind: number; // 0..1 breeze entering with shoreline
  birds: number; // 0..1 avian biophony as forest establishes
  insects: number; // 0..1 understory insects in settled ecosystem
}

export interface TypographyState {
  quietMarkOpacity: number; // strictly 0 throughout the entire opening & transition
  brandOpacity: number; // emerged ECOSONIC identity (born after acoustic contours establish)
  taglineOpacity: number; // "Listen deeper."
  descriptionOpacity: number;
  ctaOpacity: number; // Observatory & sound interaction
  navbarVisible: boolean;
}

export interface CinematicTimelineState {
  progress: number;
  phase: CinematicPhaseId;
  tree: TreeRevealState;
  lake: LakeStageState;
  camera: CameraTransformState;
  leaf: LeafMotionState;
  light: LightState;
  world: WorldEmergenceState;
  acoustic: AcousticStructureState;
  audioMix: AudioMixState;
  typography: TypographyState;
}

const DEG_TO_RAD = Math.PI / 180;

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x >= edge1 ? 1 : 0;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function smootherstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x >= edge1 ? 1 : 0;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}

/**
 * Maps elapsed real seconds since page load [0 .. 14.6s] into the opening timeline [0 .. 0.625].
 * Total leaf detachment-to-water journey spans p = 0.30 -> 0.605 (~7.1 seconds).
 */
export function computeOpeningAutoProgress(elapsedSec: number): number {
  if (!Number.isFinite(elapsedSec) || elapsedSec <= 0) return 0;
  return clamp01(elapsedSec / OPENING_DURATION_SEC) * OPENING_SETTLE_PROGRESS;
}

export function getPhaseForProgress(progress: number): CinematicPhaseId {
  const p = clamp01(progress);
  if (p < 0.04) return 'blackness';
  if (p < 0.175) return 'tree_reveal';
  if (p < 0.24) return 'tree_hold';
  if (p < 0.308) return 'leaf_reveal';
  if (p < 0.612) return 'leaf_fall';
  if (p < 0.648) return 'water_contact';
  if (p < 0.705) return 'ripple_expansion';
  if (p < 0.778) return 'water_reflection';
  if (p < 0.865) return 'camera_emergence';
  if (p < 0.905) return 'forest_settled';
  if (p < 0.955) return 'acoustic_emergence';
  return 'identity_reveal';
}

/**
 * Single authoritative cinematic timeline:
 * - 0.00 -> 0.605 (PRESERVED): Complete black -> low-light tree -> hold -> branch leaf -> 7.1s fall + camera follow -> water discovery
 * - 0.605 -> 0.64: Phase 1 Contact — leaf touches dark water, initial realistic ripple begins
 * - 0.64 -> 0.70: Phase 2 Ripple Expansion — expanding ripple dominates the dark surface
 * - 0.70 -> 0.775: Phase 3 Reflection — inverted forest reflections emerge inside the rippling water
 * - 0.775 -> 0.865: Phase 4 Camera Descent/Expansion — camera glides through the reflection as ripple-mask reveals wet shoreline & woods
 * - 0.865 -> 0.905: Phase 5 Environment Established — subdued overcast wet forest waterside (zero UI yet)
 * - 0.905 -> 0.955: Acoustic Emergence — water waves evolve into subtle acoustic contours & frequency strata
 * - 0.955 -> 1.00: Identity Reveal — ECOSONIC identity & interface gradually emerge from the sound structure
 */
export function computeCinematicTimeline(rawProgress: number): CinematicTimelineState {
  const p = clamp01(rawProgress);
  const phase = getPhaseForProgress(p);

  // =========================================================================
  // OPENING SEQUENCE (0.00 -> 0.615): DARKNESS -> REAL TREE -> GREEN LEAF -> 7.1s FALL -> WATER CONTACT
  // =========================================================================
  const treeExposure = smootherstep(0.04, 0.175, p);
  const trunkReveal = smootherstep(0.04, 0.135, p);
  const branchReveal = smootherstep(0.08, 0.175, p);
  const windGust = smootherstep(0.20, 0.295, p) * (1 - smootherstep(0.32, 0.42, p));
  const depthBlur = smootherstep(0.31, 0.46, p) * (1 - smoothstep(0.56, 0.65, p));

  // Leaf is physically part of the tree's leafy twig from the start; small wind tug + hesitation right around p = 0.308
  const attached = p < 0.308 ? 1 : 0;
  const attachBlend = 1 - smoothstep(0.304, 0.34, p);

  // Fall span: p = 0.308 -> 0.614 (~7.18 seconds wall-clock at 14.8s opening)
  const u = clamp01((p - 0.308) / 0.306);
  // Tiny hesitation before gravity & air resistance take over, then soft terminal cushion onto water
  const accel = Math.pow(clamp01((u - 0.045) / 0.955), 1.42);
  const glide = smootherstep(0.045, 1.0, u);
  const fallT = p <= 0.308 ? 0 : lerp(accel, glide, smoothstep(0.32, 0.9, u));
  const heightNorm = clamp01(1 - fallT);

  const flutterDecay = 1 - smoothstep(0.74, 0.98, u);
  const driftEnvelope = Math.sin(u * Math.PI);
  const airSwayX =
    p <= 0.308
      ? 0
      : (Math.sin(u * Math.PI * 2.15) * 0.21 +
          Math.sin(u * Math.PI * 4.25 + 0.85) * 0.065 +
          Math.sin(u * Math.PI * 1.15 - 0.35) * 0.09) *
        driftEnvelope;
  const xBlendToCenter = p <= 0.308 ? 0 : smootherstep(0.05, 0.92, u);

  const leafY = lerp(0.34, -0.22, fallT);
  const leafZ =
    p <= 0.308
      ? 0.0
      : Math.sin(u * Math.PI) * 0.24 + lerp(0.0, 0.02, smoothstep(0.6, 1.0, u));

  // Physically plausible scale: matches surrounding alder leaves on branch (~0.076), grows naturally as it nears foreground water (~0.26)
  const canopyScale = lerp(0.074, 0.082, smootherstep(0.18, 0.3, p));
  const leafScale = p <= 0.308 ? canopyScale : lerp(canopyScale, 0.26, smootherstep(0.14, 0.95, u));

  // Attached orientation hangs naturally inside the downward-right alder foliage cluster
  const attachedRoll = -0.44;
  const attachedPitch = 0.18;
  const attachedYaw = -0.22;

  // Multi-axis aerodynamic banking, wobble, and orientation change during free fall
  const fallRoll =
    Math.sin(u * Math.PI * 2.15 + 0.35) * 0.44 * flutterDecay +
    Math.cos(u * Math.PI * 3.85) * 0.14 * flutterDecay -
    0.08 * (1 - flutterDecay);
  const fallPitch =
    lerp(0.36, 0.04, fallT) + Math.cos(u * Math.PI * 2.75) * 0.24 * flutterDecay;
  const fallYaw =
    lerp(-0.24, 0.05, fallT) + Math.sin(u * Math.PI * 1.9) * 0.28 * flutterDecay;

  const leafRollRad = lerp(fallRoll, attachedRoll, attachBlend);
  const leafPitchRad = lerp(fallPitch, attachedPitch, attachBlend);
  const leafYawRad = lerp(fallYaw, attachedYaw, attachBlend);

  // Leaf appears organically WITH the tree branch foliage (never pasted in after the tree is lit)
  const leafEnter = smootherstep(0.075, 0.175, p);
  const leafExit = 1 - smootherstep(0.715, 0.815, p);
  const leafOpacity = clamp01(leafEnter * leafExit);

  // Lighting obeys overcast environment: muted under canopy, subtle open-air catchlight on fall, subdued over dark water
  const leafLightFactor = lerp(
    0.58,
    0.86,
    smoothstep(0.28, 0.52, p) * (1 - smoothstep(0.56, 0.78, p) * 0.35)
  );

  // Gradual color transformation: muted sage green (0) -> olive -> desaturated ochre -> damp autumn brown (1)
  const colorAging = p <= 0.315 ? 0 : smootherstep(0.08, 0.96, u);
  const subsurface = lerp(0.18, 0.04, colorAging) * (1 - smoothstep(0.56, 0.64, p) * 0.65);

  // Subtle cinema-lens depth of field: matches mid-distance foliage softness on branch, sharpens cleanly as leaf enters foreground focus
  const focusSoftness = lerp(0.52, 0.0, smootherstep(0.30, 0.44, p));

  // Subtle physical meniscus dip right at water contact (0.610 -> 0.648)
  const contactDip = Math.sin(smoothstep(0.61, 0.648, p) * Math.PI) * 0.85;

  // =========================================================================
  // WATER -> RIPPLE -> REFLECTION -> CAMERA EMERGENCE -> WET FOREST
  // =========================================================================
  const lakeVisibility = smootherstep(0.37, 0.57, p);

  // Phase 1 & 2: Concentric ripple begins at leaf touchdown (0.610) and expands smoothly across dark water
  const impactRippleProgress = smootherstep(0.61, 0.865, p);
  const rippleRise = smoothstep(0.606, 0.648, p);
  const rippleFade = 1 - smootherstep(0.815, 0.9, p);
  const impactRippleStrength = clamp01(rippleRise * rippleFade);

  // Phase 3: Subtle reflections of the forest trunks & vegetation appear inside the rippling water (0.69 -> 0.84)
  const reflectionIntensity =
    smootherstep(0.69, 0.77, p) * (1 - smootherstep(0.83, 0.885, p));

  // Smooth cinematographer camera: wide tree -> subtle drift toward leafy branch -> continuous downward follow -> water -> reflection glide
  const treeSettle = lerp(1.03, 1.0, smootherstep(0.04, 0.175, p));
  const branchFocusY = lerp(treeSettle, 0.985, smootherstep(0.18, 0.305, p));
  const panNormY = lerp(branchFocusY, 0.0, smootherstep(0.325, 0.61, p));

  const branchFocusX = lerp(0.0, 0.045, smootherstep(0.18, 0.305, p) * (1 - smoothstep(0.305, 0.44, p)));
  const panOffsetX =
    branchFocusX +
    airSwayX * 0.16 * smoothstep(0.32, 0.45, p) * (1 - smoothstep(0.55, 0.62, p));

  // Camera glides subtly toward the leafy cluster during tree_hold -> leaf_reveal, then widens smoothly to discover the water below
  const wideToBranchZ = lerp(2.68, 2.24, smootherstep(0.16, 0.305, p));
  const branchToFallZ = lerp(wideToBranchZ, 2.42, smootherstep(0.32, 0.56, p));
  const camApproach = lerp(branchToFallZ, 2.34, smootherstep(0.56, 0.64, p));
  const camRippleHold = lerp(camApproach, 2.3, smootherstep(0.64, 0.75, p));
  const cameraZ = lerp(camRippleHold, 2.12, smootherstep(0.75, 0.89, p));

  const treeToBranchPitch = lerp(1.6, 0.4, smootherstep(0.17, 0.305, p));
  const treeToWaterPitch = lerp(treeToBranchPitch, -4.6, smootherstep(0.33, 0.605, p));
  const lookIntoReflectionPitch = lerp(treeToWaterPitch, -5.8, smootherstep(0.66, 0.76, p));
  const pitchDeg = lerp(lookIntoReflectionPitch, 0, smootherstep(0.76, 0.89, p));
  const rollDeg = Math.sin(smoothstep(0.72, 0.89, p) * Math.PI) * 0.75;

  const darknessVeilOpacity = 0;

  // Subtle reflected ambient light on water during discovery, contact, and early ripple
  const lightX = clamp01(0.5 + airSwayX * 0.32);
  const lightY = lerp(0.38, 0.56, smoothstep(0.46, 0.615, p));
  const lightReveal = lerp(0.0, 0.82, smoothstep(0.46, 0.615, p));
  const lightFade = 1 - smootherstep(0.76, 0.88, p);
  const lightIntensity = clamp01(lightReveal * lightFade);
  const radiusNorm = lerp(0.2, 0.36, smoothstep(0.46, 0.72, p));
  const waterMotion = clamp01(
    smoothstep(0.6, 0.65, p) * (1 - smoothstep(0.84, 0.92, p))
  );

  // Phase 4 & 5: Ripple-masked environmental emergence (0.752 -> 0.885), keeping water continuous in foreground
  const portalProgress = smootherstep(0.752, 0.885, p);
  const settleScale = lerp(1.12, 1.0, smootherstep(0.752, 0.905, p));
  const counterRollDeg = lerp(-0.8, 0, smootherstep(0.755, 0.89, p));
  const hazeOpacity = smootherstep(0.81, 0.91, p);
  const particlesOpacity = 0; // Explicitly zero artificial particles

  // =========================================================================
  // SOUND -> ACOUSTIC STRUCTURE -> ECOSONIC IDENTITY (0.905 -> 1.00)
  // =========================================================================
  const waveOpacity = smootherstep(0.902, 0.942, p);
  const contourProgress = smootherstep(0.918, 0.962, p);
  const spectrumIntensity = smootherstep(0.935, 0.978, p);

  // Audio evolution layers (water -> wind -> birds -> insects)
  const audioMix: AudioMixState = {
    water: clamp01(smoothstep(0.60, 0.67, p) * (1 - smoothstep(0.9, 1.0, p) * 0.25)),
    wind: smootherstep(0.72, 0.87, p),
    birds: smootherstep(0.84, 0.95, p),
    insects: smootherstep(0.89, 0.98, p),
  };

  // UI/Identity strictly silent until forest is established AND acoustic structure has formed
  const quietMarkOpacity = 0;
  const brandOpacity = smootherstep(0.952, 0.978, p);
  const taglineOpacity = smootherstep(0.962, 0.986, p);
  const descriptionOpacity = smootherstep(0.97, 0.992, p);
  const ctaOpacity = smootherstep(0.976, 0.996, p);

  return {
    progress: p,
    phase,
    tree: {
      exposure: treeExposure,
      trunkReveal,
      branchReveal,
      windGust,
      depthBlur,
    },
    lake: {
      visibility: lakeVisibility,
      reflectionIntensity,
    },
    camera: {
      rollDeg,
      rollRad: rollDeg * DEG_TO_RAD,
      pitchDeg,
      pitchRad: pitchDeg * DEG_TO_RAD,
      cameraZ,
      panNormY,
      panOffsetX,
      darknessVeilOpacity,
    },
    leaf: {
      attached,
      attachBlend,
      fallT,
      xBlendToCenter,
      airSwayX,
      y: leafY,
      z: leafZ,
      scale: leafScale,
      pitchRad: leafPitchRad,
      yawRad: leafYawRad,
      rollRad: leafRollRad,
      flutterAmount: p <= 0.308 ? 0.14 : flutterDecay,
      heightNorm,
      opacity: leafOpacity,
      lightFactor: leafLightFactor,
      colorAging,
      subsurface,
      focusSoftness,
      contactDip,
      impactRippleProgress,
      impactRippleStrength,
    },
    light: {
      xNorm: lightX,
      yNorm: lightY,
      intensity: lightIntensity,
      radiusNorm,
      waterMotion,
    },
    world: {
      portalProgress,
      settleScale,
      counterRollDeg,
      hazeOpacity,
      particlesOpacity,
    },
    acoustic: {
      waveOpacity,
      contourProgress,
      spectrumIntensity,
    },
    audioMix,
    typography: {
      quietMarkOpacity,
      brandOpacity,
      taglineOpacity,
      descriptionOpacity,
      ctaOpacity,
      navbarVisible: p >= 0.968,
    },
  };
}
