import { LEAF_STEM_TIP_LOCAL } from './leafGeometry';

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

/** Normalized GL UV coordinate (bottom-left origin) of the bare upper-right twig node on mossy_branch_opening */
export const TREE_TWIG_TEX_UV = { u: 0.678, v: 0.684 } as const;

/** Responsive portrait horizontal shift for opening branch framing */
export const TREE_MOBILE_CROP_SHIFT_X = 0.14;

/** Local model-space offset of the 3D petiole abscission tip where the leaf joins the twig */
export const LEAF_STEM_LOCAL_OFFSET = LEAF_STEM_TIP_LOCAL;

/** Normalized world-height span separating the upper tree camera from the lower lake camera */
export const CAMERA_PAN_WORLD_SPAN = 0.68;

/** Computes responsive cover UV anchor for the forest-and-water hero so mobile & tablet preserve lower water reflections */
export function computeForestResponsiveCropOffset(targetAspect: number, texAspect: number): {
  xShift: number;
  yShift: number;
} {
  if (!Number.isFinite(targetAspect) || targetAspect <= 0) {
    return { xShift: 0, yShift: 0 };
  }
  if (targetAspect < 1.0) {
    const portraitAmt = clamp01((1.0 - targetAspect) / (1.0 - 0.45));
    const smoothPortrait = portraitAmt * portraitAmt * (3 - 2 * portraitAmt);
    return {
      xShift: -(0.05 + 0.06 * smoothPortrait),
      yShift: 0,
    };
  }
  if (targetAspect > texAspect) {
    const maxSafe = Math.max(0, 0.5 * (1.0 - texAspect / targetAspect));
    return {
      xShift: 0,
      yShift: -Math.min(maxSafe, 0.04),
    };
  }
  return { xShift: 0, yShift: 0 };
}

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
  waterlineDepth: number; // subtle resting waterline seating once settled on meniscus
  floatDriftX: number; // subtle restrained pond current drift after touchdown
  floatDriftY: number;
  floatDriftZ: number;
  floatPitchOffsetRad: number; // C1 continuous pitch settle onto water plane + damped rock
  floatRollOffsetRad: number; // C1 continuous roll settle onto water plane + damped rock
  floatYawOffsetRad: number; // slow subtle current yaw turn (no spinning)
  waveRockStrength: number; // bounded wave-coupled micro-rock envelope during floating
  impactRippleProgress: number; // 0 before touchdown, expands 0 -> 1 across lake
  impactRippleStrength: number; // wave crest envelope peaking on contact & decaying smoothly
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
  waterResonance: number; // sound subtly oscillating water surface & capillary interference (0.71 -> 0.95)
  topographyStrength: number; // water reflection organizing into acoustic elevation contours (0.76 -> 0.94)
  waveOpacity: number; // subtle shoreline acoustic harmonics stabilizing out of water
  contourProgress: number; // 0..1 harmonic frequency contour lines forming
  spectrumIntensity: number; // subtle spectral strata settling behind EcoSonic identity
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
  if (p < 0.875) return 'camera_emergence';
  if (p < 0.915) return 'forest_settled';
  if (p < 0.952) return 'acoustic_emergence';
  return 'identity_reveal';
}

/**
 * Single authoritative cinematic timeline:
 * - 0.00 -> 0.614 (FROZEN): Complete black -> low-light tree -> hold -> branch leaf -> 7.18s fall + camera follow -> water discovery
 * - 0.614 -> 0.648 (FROZEN): Phase 1 Contact — leaf touches dark water, meniscus & initial dispersive ripple begin
 * - 0.648 -> 0.715: Phase 2 Ripple Expansion — expanding dispersive capillary-gravity ripple crosses dark forest pool
 * - 0.715 -> 0.790: Phase 3 Reflection & Sound in Water — forest reflections emerge inside water as subtle frequency oscillations stir the surface
 * - 0.778 -> 0.905: Phase 4 Acoustic Topography & Emergence — reflected tree forms organize into acoustic topography while camera glides smoothly into forest waterside
 * - 0.865 -> 0.952: Phase 5 Acoustic Field Stabilizes — shoreline wave harmonics & spectral strata form organically above the dark pool
 * - 0.942 -> 1.000: Identity Reveal — staggered ECOSONIC -> Listen deeper. -> description -> navbar & CTA emerge smoothly
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

  // Helper for deterministic aerodynamic horizontal glide (C1 zero velocity at u=0 and u=1)
  const evalAirGlideX = (uVal: number): number => {
    const uClamped = clamp01(uVal);
    if (uClamped <= 0 || uClamped >= 1) return 0;
    const launchRamp = smoothstep(0.0, 0.18, uClamped);
    const cushionFade = 1 - smoothstep(0.84, 1.0, uClamped);
    const env = Math.sin(uClamped * Math.PI) * launchRamp * cushionFade;
    const phase = uClamped * Math.PI * 3.15;
    const primary = Math.sin(phase - 0.12) * 0.21;
    const secondary = Math.sin(phase * 1.68 + 0.72) * 0.058;
    const driftSkew = -Math.sin(uClamped * Math.PI * 1.15) * 0.042;
    return (primary + secondary + driftSkew) * env;
  };

  // Leaf is physically part of the tree's leafy twig until p = 0.308; gentle pre-detachment tug before abscission gives way
  const attached = p < 0.308 ? 1 : 0;

  // Fall span: p = 0.308 -> 0.614 (~7.18 seconds wall-clock at 14.8s opening)
  const u = clamp01((p - 0.308) / 0.306);
  // Smooth pivot release over first ~1.0s after detachment so stem tip drops naturally from twig node
  const attachBlend = p <= 0.308 ? 1 : 1 - smootherstep(0.0, 0.15, u);

  // C1 vertical descent: gentle breakaway drop -> subtle stall deceleration at glide turnarounds -> air-cushion landing
  const accel = Math.pow(clamp01(u), 1.38);
  const glide = smootherstep(0.0, 1.0, u);
  const baseFallT = p <= 0.308 ? 0 : lerp(accel, glide, smoothstep(0.24, 0.92, u));
  // Subtle monotonic stall modulation (vertical speed eases slightly at sweep apexes without bouncing upward)
  const stallSlowdown =
    p <= 0.308
      ? 0
      : Math.sin(u * Math.PI * 6.3) * 0.014 * Math.sin(u * Math.PI) * smoothstep(0.12, 0.28, u) * (1 - smoothstep(0.82, 0.96, u));
  const fallT = p <= 0.308 ? 0 : clamp01(baseFallT + stallSlowdown);
  const heightNorm = clamp01(1 - fallT);

  const flutterDecay = 1 - smoothstep(0.76, 0.99, u);
  const airSwayX = p <= 0.308 ? 0 : evalAirGlideX(u);
  const xBlendToCenter = p <= 0.308 ? 0 : smootherstep(0.04, 0.92, u);

  // Instantaneous horizontal airspeed drives physical bank angle and turnaround stall pitch
  const eps = 0.004;
  const vx = p <= 0.308 ? 0 : (evalAirGlideX(u + eps) - evalAirGlideX(u - eps)) / (2 * eps);
  const absVxNorm = clamp01(Math.abs(vx) / 0.62);
  const turnaroundStall = (1 - absVxNorm) * smoothstep(0.14, 0.28, u) * (1 - smoothstep(0.84, 0.98, u));

  const leafY = lerp(0.34, -0.22, fallT);
  // Gentle 3D forward-back depth arc as leaf catches air drafts and settles over foreground water
  const leafZ =
    p <= 0.308
      ? 0.0
      : (Math.sin(u * Math.PI) * 0.22 + Math.sin(u * Math.PI * 2.5) * 0.045 * flutterDecay) +
        lerp(0.0, 0.02, smoothstep(0.62, 1.0, u));

  // Physically plausible scale: blends seamlessly with branch leaves -> approaches foreground focus cleanly over water
  const canopyScale = lerp(0.150, 0.162, smootherstep(0.18, 0.3, p));
  const leafScale = p <= 0.308 ? canopyScale : lerp(canopyScale, 0.26, smootherstep(0.12, 0.95, u));

  // Attached orientation hangs naturally down-right with realistic 3D foreshortening matching neighboring branch leaves
  const preDetachSag = smootherstep(0.24, 0.308, p);
  const attachedRoll = -0.96 - 0.06 * preDetachSag;
  const attachedPitch = -0.38 + 0.06 * preDetachSag;
  const attachedYaw = -0.36 - 0.05 * preDetachSag;

  // Initial release tilts smoothly into horizontal 3D glide attitudes, banking through edge-on & brief underside reveal at stall apexes, then landing flat on water (-1.15 rad)
  const releaseSettle = smootherstep(0.0, 0.26, u);
  const aerodynamicBank = -Math.atan(vx * 0.85) * 0.95 * flutterDecay;
  const targetFallRoll =
    lerp(-0.22, aerodynamicBank, smoothstep(0.12, 0.42, u)) +
    Math.sin(u * Math.PI * 3.15 + 0.45) * 0.22 * flutterDecay -
    0.16 * (1 - flutterDecay);
  const fallRoll = lerp(attachedRoll, targetFallRoll, releaseSettle);

  // Horizontal-plane pitch (-0.86 to -1.78 midair, settling gracefully at -1.15 on dark water surface)
  const baseGlidePitch = lerp(-0.86, -1.15, smoothstep(0.26, 0.98, u));
  const targetFallPitch =
    baseGlidePitch -
    turnaroundStall * 0.68 +
    Math.sin(u * Math.PI * 2.25) * 0.32 * flutterDecay;
  const fallPitch = lerp(attachedPitch, targetFallPitch, releaseSettle);

  // Multi-axis yaw precession lets viewer read serrated edge, midrib arch, and stem in true 3D
  const targetFallYaw =
    lerp(attachedYaw, 0.22, smoothstep(0.55, 0.98, u)) +
    Math.sin(u * Math.PI * 2.15 + 0.3) * 0.52 * flutterDecay;
  const fallYaw = lerp(attachedYaw, targetFallYaw, releaseSettle);

  // Post-contact settling & restrained floating (p > 0.614, C0/C1 continuous at touchdown u = 1)
  const postTouch = clamp01((p - 0.614) / 0.201); // 0.614 -> 0.815
  const settlePhase = clamp01((p - 0.614) / 0.052); // ~0.5-1.0s settling window: 0.614 -> 0.666
  const settleEase = smootherstep(0.0, 1.0, settlePhase);
  const dampedRock =
    p <= 0.614
      ? 0
      : Math.sin(settlePhase * Math.PI * 2.15) *
        Math.exp(-settlePhase * 2.4) *
        smoothstep(0.0, 0.22, settlePhase) *
        (1 - settlePhase);

  const floatPitchOffsetRad = p <= 0.614 ? 0 : settleEase * 0.078 + dampedRock * 0.042;
  const floatRollOffsetRad = p <= 0.614 ? 0 : settleEase * 0.145 - dampedRock * 0.036;
  const floatYawOffsetRad = p <= 0.614 ? 0 : smootherstep(0.06, 0.96, postTouch) * 0.064;

  // Subtle micro-current drift across calm pond center (zero at touchdown, stays small and unhurried)
  const driftEase = smootherstep(0.08, 0.96, postTouch);
  const floatDriftX = p <= 0.614 ? 0 : driftEase * 0.022;
  const floatDriftY = p <= 0.614 ? 0 : -driftEase * 0.007;
  const floatDriftZ = p <= 0.614 ? 0 : driftEase * 0.011;

  // Wave-coupled micro-rock amplitude: rises softly as initial meniscus wave passes under blade, remains gentle while floating
  const waveRockStrength =
    p <= 0.614
      ? 0
      : smoothstep(0.614, 0.632, p) *
        (0.38 + 0.62 * (1 - smoothstep(0.65, 0.74, p))) *
        (1 - smoothstep(0.73, 0.815, p));

  const leafRollRad = (p <= 0.308 ? attachedRoll : fallRoll) + floatRollOffsetRad;
  const leafPitchRad = (p <= 0.308 ? attachedPitch : fallPitch) + floatPitchOffsetRad;
  const leafYawRad = (p <= 0.308 ? attachedYaw : fallYaw) + floatYawOffsetRad;

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

  // Restrained color transformation parameter (0 = fresh forest green -> 0.5 = muted olive -> 1 = subtle warm ochre)
  const colorAging = p <= 0.315 ? 0 : smootherstep(0.08, 0.96, u);
  const subsurface = lerp(0.22, 0.08, colorAging) * (1 - smoothstep(0.56, 0.64, p) * 0.55);

  // Subtle cinema-lens depth of field: matches mid-distance foliage softness on branch, sharpens cleanly as leaf enters foreground focus
  const focusSoftness = lerp(0.52, 0.0, smootherstep(0.30, 0.44, p));

  // Physical meniscus cushion: smooth onset right at first surface kiss (0.608), peaks at ~0.625, cushions into resting meniscus
  const meniscusAttack = smootherstep(0.608, 0.626, p);
  const meniscusRelease = 1 - smootherstep(0.628, 0.672, p) * 0.82;
  const meniscusTail = 1 - smootherstep(0.73, 0.815, p);
  const contactDip = clamp01(meniscusAttack * meniscusRelease * meniscusTail * 0.9);
  const waterlineDepth = smootherstep(0.614, 0.655, p) * (1 - smootherstep(0.73, 0.815, p));

  // =========================================================================
  // WATER -> RIPPLE -> REFLECTION -> CAMERA EMERGENCE -> WET FOREST
  // =========================================================================
  const lakeVisibility = smootherstep(0.37, 0.57, p);

  // Phase 1 & 2: Dispersive capillary-gravity ripple begins at leaf touchdown (0.610), expands over ~2-3s, decays cleanly over ~1-2s
  const impactRippleProgress = smootherstep(0.61, 0.855, p);
  const rippleRise = smoothstep(0.608, 0.642, p);
  const rippleFade = 1 - smootherstep(0.735, 0.848, p);
  const impactRippleStrength = clamp01(rippleRise * rippleFade);

  // Phase 3: Subtle reflections of the forest trunks & vegetation appear inside the rippling water (0.68 -> 0.88)
  const reflectionIntensity =
    smootherstep(0.68, 0.765, p) * (1 - smootherstep(0.845, 0.905, p));

  // Smooth cinematographer camera: wide tree -> subtle drift toward leafy branch -> continuous downward follow -> water -> reflection glide
  const treeSettle = lerp(1.03, 1.0, smootherstep(0.04, 0.175, p));
  const branchFocusY = lerp(treeSettle, 0.985, smootherstep(0.18, 0.305, p));
  const panNormY = lerp(branchFocusY, 0.0, smootherstep(0.325, 0.61, p));

  const branchFocusX = lerp(0.0, 0.045, smootherstep(0.18, 0.305, p) * (1 - smoothstep(0.305, 0.44, p)));
  const panOffsetX =
    branchFocusX +
    airSwayX * 0.18 * smoothstep(0.32, 0.44, p) * (1 - smoothstep(0.55, 0.625, p));

  // Camera glides subtly toward the leafy cluster during tree_hold -> leaf_reveal, then widens smoothly to discover the water below
  const wideToBranchZ = lerp(2.68, 2.24, smootherstep(0.16, 0.305, p));
  const branchToFallZ = lerp(wideToBranchZ, 2.42, smootherstep(0.32, 0.56, p));
  const camApproach = lerp(branchToFallZ, 2.34, smootherstep(0.56, 0.64, p));
  const camRippleHold = lerp(camApproach, 2.3, smootherstep(0.64, 0.76, p));
  const cameraZ = lerp(camRippleHold, 2.12, smootherstep(0.76, 0.905, p));

  const treeToBranchPitch = lerp(1.6, 0.4, smootherstep(0.17, 0.305, p));
  const treeToWaterPitch = lerp(treeToBranchPitch, -4.6, smootherstep(0.33, 0.605, p));
  const lookIntoReflectionPitch = lerp(treeToWaterPitch, -5.6, smootherstep(0.66, 0.77, p));
  const pitchDeg = lerp(lookIntoReflectionPitch, 0, smootherstep(0.775, 0.905, p));
  const rollDeg = Math.sin(smoothstep(0.74, 0.905, p) * Math.PI) * 0.55;

  const darknessVeilOpacity = 0;

  // Subtle reflected ambient light on water during discovery, contact, and early ripple
  const lightX = clamp01(0.5 + airSwayX * 0.32);
  const lightY = lerp(0.38, 0.56, smoothstep(0.46, 0.615, p));
  const lightReveal = lerp(0.0, 0.82, smoothstep(0.46, 0.615, p));
  const lightFade = 1 - smootherstep(0.77, 0.9, p);
  const lightIntensity = clamp01(lightReveal * lightFade);
  const radiusNorm = lerp(0.2, 0.36, smoothstep(0.46, 0.72, p));
  const waterMotion = clamp01(
    smoothstep(0.56, 0.64, p) * (1 - smoothstep(0.86, 0.95, p) * 0.55)
  );

  // Stage 3 -> 4: Reflection-guided horizon emergence (0.790 -> 0.905), continuous horizon into Scene B pool
  const portalProgress = smootherstep(0.790, 0.905, p);
  const settleScale = lerp(1.09, 1.0, smootherstep(0.790, 0.915, p));
  const counterRollDeg = lerp(-0.6, 0, smootherstep(0.790, 0.905, p));
  const hazeOpacity = smootherstep(0.825, 0.92, p);
  const particlesOpacity = 0; // Explicitly zero artificial particles

  // =========================================================================
  // WATER -> SOUND RESONANCE -> ACOUSTIC TOPOGRAPHY -> ECOSONIC IDENTITY (0.695 -> 1.00)
  // =========================================================================
  const waterResonance =
    smootherstep(0.695, 0.760, p) * (1 - smootherstep(0.905, 0.985, p) * 0.45);
  const topographyStrength =
    smootherstep(0.735, 0.802, p) * (1 - smootherstep(0.875, 0.945, p));
  const waveOpacity = smootherstep(0.865, 0.922, p);
  const contourProgress = smootherstep(0.885, 0.942, p);
  const spectrumIntensity = smootherstep(0.905, 0.962, p);

  // Audio evolution layers (water -> wind -> birds -> insects)
  const audioMix: AudioMixState = {
    water: clamp01(smoothstep(0.60, 0.67, p) * (1 - smoothstep(0.9, 1.0, p) * 0.25)),
    wind: smootherstep(0.72, 0.87, p),
    birds: smootherstep(0.84, 0.95, p),
    insects: smootherstep(0.89, 0.98, p),
  };

  // UI/Identity strictly silent until forest stabilizes AND acoustic contours have formed
  const quietMarkOpacity = 0;
  const brandOpacity = smootherstep(0.942, 0.972, p);
  const taglineOpacity = smootherstep(0.954, 0.982, p);
  const descriptionOpacity = smootherstep(0.964, 0.990, p);
  const ctaOpacity = smootherstep(0.972, 0.996, p);

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
      waterlineDepth,
      floatDriftX,
      floatDriftY,
      floatDriftZ,
      floatPitchOffsetRad,
      floatRollOffsetRad,
      floatYawOffsetRad,
      waveRockStrength,
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
      waterResonance,
      topographyStrength,
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
      navbarVisible: p >= 0.964,
    },
  };
}
