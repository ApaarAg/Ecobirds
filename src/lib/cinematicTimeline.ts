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

/** Reference duration metadata preserved for compatibility */
export const OPENING_DURATION_SEC = 16.0;

/** Timeline progress where the opening entry arrives on initial leaf-water contact */
export const OPENING_SETTLE_PROGRESS = 0.66;

/**
 * Normalized GL UV coordinate (bottom-left origin) of the bare lower-left oak twig node
 * on jason-leem-mopZf0QhPGw-unsplash_d838c284.jpg (4016x5015).
 */
export const TREE_TWIG_TEX_UV = { u: 0.3897, v: 0.2439 } as const;

/** Vertical GL UV framing center for jason-leem close oak foliage when settled in frame */
export const FOLIAGE_BASE_V_CENTER = 0.275;

/** Horizontal responsive crop shift on portrait mobile for jason-leem & leandro-rossi */
export const TREE_MOBILE_CROP_SHIFT_X = -0.055;

/** Local model-space offset of the 3D oak petiole abscission tip where the leaf joins the twig */
export const LEAF_STEM_LOCAL_OFFSET = LEAF_STEM_TIP_LOCAL;

/** Normalized world-height span separating the upper oak branch camera from the lower lake camera */
export const CAMERA_PAN_WORLD_SPAN = 0.72;

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

export const HERO_WATER_TEX_ASPECT = 6663 / 4444;

/** Preserves the central floating oak leaf, water reflections, and submerged rocks across desktop & mobile aspect ratios */
export function computeHeroWaterCropOffset(
  targetAspect: number,
  texAspect: number = HERO_WATER_TEX_ASPECT
): {
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
      xShift: 0.012 * smoothPortrait,
      yShift: 0,
    };
  }
  if (targetAspect > texAspect) {
    const maxSafe = Math.max(0, 0.5 * (1.0 - texAspect / targetAspect));
    return {
      xShift: 0,
      yShift: -Math.min(maxSafe, 0.015),
    };
  }
  return { xShift: 0, yShift: 0 };
}

export interface TreeRevealState {
  exposure: number; // Always 1 from opening load so leandro-rossi forest is immediately present
  trunkReveal: number; // gradual environmental depth reveal
  branchReveal: number; // extending canopy & foliage follow
  windGust: number; // 0..1 natural breeze stirring oak foliage before detachment
  depthBlur: number; // 0..1 cinema-lens background bokeh softness as camera tracks falling oak leaf
  openingZoom: number; // continuous push into leandro-rossi forest -> gentle pull back down to pond
  openingPanV: number; // vertical GL center inside leandro-rossi: 0.46 (wide) -> 0.66 (canopy) -> 0.20 (pond)
  openingBlur: number; // subtle focus evolution on persistent leandro-rossi backdrop
  foliagePushProgress: number; // 0 = wide opening forest, 1 = oak branch depth plane seated in canopy
  foliagePresence: number; // 0..1 smooth visibility of the keyed oak branch depth plane
  foliageEntryX: number; // parallax glide offset as oak branch enters from upper-right
  foliageEntryY: number; // parallax glide offset as oak branch enters from above
  foliageScale: number; // realistic photographic scaling during focus pull onto oak branch
  foliageBlur: number; // premultiplied DoF softness on keyed oak branch
  occlusionSweep: number; // 0..1 out-of-focus foreground foliage passing edge during camera push/descent
}

export interface LakeStageState {
  visibility: number; // 0 before camera descends to pond -> 1 at dark forest water
  reflectionIntensity: number; // 0 -> 1 subtle forest reflection perceived inside expanding water ripples
}

export interface CameraTransformState {
  rollDeg: number; // calm horizon alignment (never sudden tilt)
  rollRad: number; // radians for Three.js camera.rotation.z
  pitchDeg: number; // gentle observational tilt following leaf onto pond -> moving through reflection -> level waterside
  pitchRad: number; // radians for Three.js camera.rotation.x
  cameraZ: number; // opening -> foliage close-up -> leaf-tracking follow -> water approach -> reflection glide
  panNormY: number; // 1.0 (oak branch) -> 0.0 (pond below)
  panOffsetX: number; // horizontal camera follow tracking leaf lateral drift
  darknessVeilOpacity: number;
}

export interface LeafMotionState {
  attached: number; // 1 while physically connected to oak twig, 0 after detachment
  attachBlend: number; // smooth 1 -> 0 blend for petiole pivot transition
  stemFlex: number; // 0..1 elastic petiole-to-blade wind bend just before abscission
  fallT: number; // 0 on branch -> 1 touching water surface (monotonically advancing)
  xBlendToCenter: number; // 0 at twig X -> 1 centered above water
  airSwayX: number; // physics-integrated lateral air drift with air-catch swoops
  y: number; // fallback/test vertical normalized curve (0.34 -> -0.22)
  z: number; // gentle 3D air depth progression
  scale: number; // physically matched to neighboring oak leaves -> foreground tracking focus scale
  pitchRad: number;
  yawRad: number;
  rollRad: number;
  flutterAmount: number; // 1 while falling -> 0 settled on lake
  heightNorm: number; // 1 aloft/attached -> 0 touching dark water
  opacity: number; // enters attached inside oak foliage, 1 through fall/contact, fades softly into reflection glide
  lightFactor: number; // warm golden oak canopy sun -> shaded woodland air -> twilight lake basin
  colorAging: number; // 0 = sunlit dry-waxy golden amber oak -> subtle damp saturation on water contact
  subsurface: number; // warm golden-amber backlit translucency in oak canopy -> eases in shaded basin
  focusSoftness: number; // subtle branch-plane focus -> razor-sharp foreground tracking focus during fall
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
  waterResonance: number; // sound subtly oscillating water surface & capillary interference
  topographyStrength: number; // water reflection organizing into acoustic elevation contours
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
  quietMarkOpacity: number;
  brandOpacity: number;
  taglineOpacity: number;
  descriptionOpacity: number;
  ctaOpacity: number;
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

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
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

/**
 * Deterministic 6-DOF aerodynamic oak-leaf flight simulator pre-integrated across 240 micro-steps.
 * Models:
 * - Initial wind carry & slight inertia upon abscission
 * - Gravity acceleration balanced by nonlinear quadratic aerodynamic drag
 * - Angle-of-attack lift swoops ("catching the air")
 * - Irregular multi-frequency flutter, pitch/roll tilting & lateral drift (never circular spin or constant speed)
 * - C1 ground-effect air cushion into calm water contact at u = 1
 */
interface FlightSample {
  fallT: number;
  airX: number;
  airZ: number;
  pitch: number;
  roll: number;
  yaw: number;
}

const FLIGHT_STEPS = 240;

const OAK_FLIGHT_TABLE: FlightSample[] = (() => {
  const table: FlightSample[] = [];
  const dt = 1 / FLIGHT_STEPS;

  let yPos = 0; // 0 (twig) -> 1 (water)
  let vy = 0.025; // tiny wind-release initial velocity for C1 continuity
  let xPos = 0;
  let vx = -0.055; // initial wind carry left-ward
  let zPos = 0;

  let pitch = -0.5;
  let roll = -1.06;
  let yaw = -0.42;

  for (let i = 0; i <= FLIGHT_STEPS; i++) {
    const u = i * dt;

    // Ground-effect air cushion & glide flattening near water surface
    const airCushion = 1 - smoothstep(0.76, 0.995, u);
    const windGustPulse =
      Math.sin(u * 13.7 + 0.4) * 0.55 +
      Math.sin(u * 23.1 + 1.9) * 0.3 +
      Math.cos(u * 8.3 - 0.6) * 0.35;

    // Angle-of-attack lift slows descent momentarily whenever blade catches an updraft
    const tiltFactor = Math.cos(pitch * 0.85) * Math.cos(roll * 0.45);
    const airCatchLift =
      Math.max(0, Math.sin(u * Math.PI * 2.8 + 0.35)) * 0.52 * airCushion * Math.abs(tiltFactor);

    const gravity = 2.08;
    const dragY = vy * Math.abs(vy) * 1.12;
    const ay = (gravity - dragY - airCatchLift * 1.35) * (0.28 + 0.72 * airCushion);

    vy = Math.max(0.02, vy + ay * dt);
    yPos += vy * dt;

    // Coupled lateral aerodynamic slip from blade tilt + subtle irregular cross-breeze
    const sideLift = -Math.sin(roll * 0.75) * 0.44 + Math.sin(yaw * 0.9) * 0.2;
    const ax = (sideLift + windGustPulse * 0.36 - vx * 2.65) * airCushion;
    vx += ax * dt;
    xPos += vx * dt;

    // Depth breathing as leaf curves gently toward/away from documentary long lens
    zPos =
      (Math.sin(u * 4.9 + 0.3) * 0.14 + Math.sin(u * 10.6 + 1.4) * 0.045) *
      Math.sin(u * Math.PI) *
      airCushion;

    // Irregular incommensurate aerodynamic pitch/roll/yaw (avoids repetitive circular spin)
    const flutterEnv = smoothstep(0.0, 0.16, u) * (1 - smoothstep(0.78, 0.995, u));
    const targetPitch =
      lerp(-0.52, 0.94, smootherstep(0.08, 0.92, u)) +
      (Math.sin(u * 11.4 + 0.7) * 0.19 + Math.cos(u * 17.8 + 2.1) * 0.09) * flutterEnv;
    const targetRoll =
      lerp(-1.04, 0.12, smootherstep(0.06, 0.94, u)) +
      (Math.sin(u * 9.1 - 0.3) * 0.24 + Math.sin(u * 15.7 + 1.2) * 0.11) * flutterEnv;
    const targetYaw =
      lerp(-0.42, 0.24, smootherstep(0.04, 0.95, u)) +
      (Math.cos(u * 7.6 + 0.9) * 0.22 + Math.sin(u * 14.3 + 2.5) * 0.1) * flutterEnv;

    const torqueRate = 5.4;
    pitch += (targetPitch - pitch) * Math.min(1, torqueRate * dt);
    roll += (targetRoll - roll) * Math.min(1, torqueRate * dt);
    yaw += (targetYaw - yaw) * Math.min(1, torqueRate * 0.85 * dt);

    table.push({
      fallT: yPos,
      airX: xPos * 0.26,
      airZ: zPos,
      pitch,
      roll,
      yaw,
    });
  }

  // Normalize vertical descent strictly to [0, 1] with smooth air-cushion arrival at u = 1
  const totalY = Math.max(0.0001, table[table.length - 1].fallT);
  const endAirX = table[table.length - 1].airX;
  for (let i = 0; i < table.length; i++) {
    const u = i * dt;
    const rawNorm = table[i].fallT / totalY;
    const shaped = rawNorm * (1 - smoothstep(0.84, 1.0, u)) + 1.0 * smoothstep(0.84, 1.0, u);
    table[i].fallT = clamp01(shaped);
    // Gently center lateral drift onto pond landing spot at u = 1
    table[i].airX -= endAirX * smoothstep(0.68, 1.0, u);
  }
  return table;
})();

function sampleOakFlight(uRaw: number): FlightSample {
  const u = clamp01(uRaw);
  const fIdx = u * FLIGHT_STEPS;
  const i0 = Math.min(FLIGHT_STEPS - 1, Math.floor(fIdx));
  const i1 = i0 + 1;
  const frac = fIdx - i0;
  const s = frac * frac * (3 - 2 * frac);
  const a = OAK_FLIGHT_TABLE[i0];
  const b = OAK_FLIGHT_TABLE[i1];
  return {
    fallT: a.fallT + (b.fallT - a.fallT) * frac,
    airX: a.airX + (b.airX - a.airX) * s,
    airZ: a.airZ + (b.airZ - a.airZ) * s,
    pitch: a.pitch + (b.pitch - a.pitch) * s,
    roll: a.roll + (b.roll - a.roll) * s,
    yaw: a.yaw + (b.yaw - a.yaw) * s,
  };
}

/** Compatibility helper (unused when scroll-driven, kept for existing module exports) */
export function computeOpeningAutoProgress(elapsedSec: number): number {
  if (!Number.isFinite(elapsedSec) || elapsedSec <= 0) return 0;
  return clamp01(elapsedSec / OPENING_DURATION_SEC) * OPENING_SETTLE_PROGRESS;
}

export function getPhaseForProgress(progress: number): CinematicPhaseId {
  const p = clamp01(progress);
  if (p < 0.08) return 'tree_reveal';
  if (p < 0.22) return 'tree_hold';
  if (p < 0.36) return 'leaf_reveal';
  if (p < 0.64) return 'leaf_fall';
  if (p < 0.685) return 'water_contact';
  if (p < 0.745) return 'ripple_expansion';
  if (p < 0.805) return 'water_reflection';
  if (p < 0.895) return 'camera_emergence';
  if (p < 0.93) return 'forest_settled';
  if (p < 0.962) return 'acoustic_emergence';
  return 'identity_reveal';
}

/**
 * Single authoritative scroll-driven cinematic timeline:
 * - 0.000 -> 0.080: State A — Wide Opening Forest (leandro-rossi already present: sunlit canopy + green branch + pond)
 * - 0.080 -> 0.240: State B — Moving Deeper into Forest (push into leandro-rossi canopy + keyed oak foliage depth plane gliding into focus; NO flat sky swap!)
 * - 0.220 -> 0.360: State C — Leaf Discovery & Tension (attached 3D oak leaf sways on branch, wind builds, petiole flexes)
 * - 0.360 -> 0.640: State D & E — Detachment & Camera-Followed Fall (leaf falls with 6-DOF physics while camera pans down through leandro-rossi right to its pond)
 * - 0.640 -> 1.000: State F & Downstream — Water Contact -> Dispersive Ripples -> Reflections -> Forest Emergence -> Acoustic Contours -> Identity Reveal
 */
export function computeCinematicTimeline(rawProgress: number): CinematicTimelineState {
  const p = clamp01(rawProgress);
  const phase = getPhaseForProgress(p);

  const DETACH_P = 0.36;
  const TOUCH_P = 0.64;

  // =========================================================================
  // 1. PERSISTENT FOREST (leandro-rossi) + KEYED OAK FOLIAGE DEPTH PLANE
  // =========================================================================
  const treeExposure = 1.0; // Forest is ALREADY visible at scroll = 0
  const trunkReveal = 1.0;
  const branchReveal = 1.0;

  // Scroll 0 -> 0.26 pushes inward & high into leandro-rossi's sunlit upper canopy bokeh; scroll 0.36 -> 0.64 tracks downward to pond
  const pushIn = smootherstep(0.02, 0.26, p);
  const fallFollow = smootherstep(DETACH_P, TOUCH_P, p);

  const openingZoom = 1.0 + pushIn * 1.12 - fallFollow * 0.88;
  // Vertical GL center in leandro-rossi: 0.45 (wide branch+pond) -> 0.77 (high sunlit bokeh canopy) -> 0.19 (calm pond)
  const openingPanV = 0.45 + pushIn * 0.32 - fallFollow * 0.58;

  // Natural depth-of-field evolution on persistent leandro-rossi backdrop (silky mipmap bokeh behind foreground oak branch)
  const fallDof = smootherstep(0.365, 0.49, p) * (1 - smootherstep(0.57, 0.655, p));
  const openingBlur = clamp01(pushIn * 0.92 + fallDof * 0.38);
  const depthBlur = clamp01(smootherstep(0.16, 0.34, p) * 0.42 + fallDof * 0.56);

  // Keyed oak branch depth plane (jason-leem without blue sky) glides smoothly into foreground focus
  const foliagePushProgress = smootherstep(0.08, 0.25, p);
  const foliagePresence =
    smootherstep(0.09, 0.22, p) * (1 - smootherstep(0.50, 0.62, p));
  const foliageEntryX = -0.10 * (1 - foliagePushProgress);
  const foliageEntryY = -0.20 * (1 - foliagePushProgress);
  const foliageScale = lerp(1.26, 0.94, smootherstep(0.10, 0.27, p));

  const foliageEntryBlur = (1 - smootherstep(0.16, 0.255, p)) * 0.78;
  const foliageBlur = clamp01(Math.max(foliageEntryBlur, fallDof * 0.88));

  // Foreground out-of-focus foliage silhouette sweeping edge during push-in & camera descent
  const pushOcc = Math.sin(clamp01((p - 0.08) / 0.14) * Math.PI) * 0.72;
  const fallOcc = Math.sin(clamp01((p - 0.38) / 0.20) * Math.PI) * 0.88;
  const occlusionSweep = clamp01(Math.max(pushOcc, fallOcc));

  // Natural breeze stirring oak branch right before stem flex & detachment
  const windGust = smootherstep(0.24, 0.35, p) * (1 - smootherstep(0.365, 0.44, p));

  // =========================================================================
  // 2. ATTACHED OAK LEAF -> STEM FLEX -> DETACHMENT (p=0.36) -> CAMERA-FOLLOWED FALL
  // =========================================================================
  const attached = p < DETACH_P ? 1 : 0;
  const u = clamp01((p - DETACH_P) / (TOUCH_P - DETACH_P));

  // Leaf enters ALREADY attached onto the oak twiglet as the oak branch glides into view
  const leafAppear = smootherstep(0.135, 0.215, p);

  // Smooth pivot release over initial descent
  const attachBlend = p <= DETACH_P ? 1 : 1 - smootherstep(0.0, 0.14, u);

  // Elastic petiole-to-blade strain right before abscission
  const stemFlex =
    p <= DETACH_P
      ? smootherstep(0.305, DETACH_P, p)
      : 1 - smootherstep(0.0, 0.11, u);

  const flight = sampleOakFlight(u);
  const fallT = p <= DETACH_P ? 0 : flight.fallT;
  const heightNorm = clamp01(1 - fallT);

  const flutterDecay = 1 - smoothstep(0.76, 0.99, u);
  const airSwayX = p <= DETACH_P ? 0 : flight.airX;
  const xBlendToCenter = p <= DETACH_P ? 0 : smootherstep(0.05, 0.9, u);

  const leafY = lerp(0.34, -0.22, fallT);
  const leafZ = p <= DETACH_P ? 0.0 : flight.airZ;

  // Attached scale matches neighboring real oak leaves on jason-leem; grows subtly into foreground focus
  const canopyScale = lerp(0.142, 0.158, smootherstep(0.18, DETACH_P, p));
  const leafScale =
    p <= DETACH_P ? canopyScale : lerp(canopyScale, 0.215, smootherstep(0.08, 0.94, u));

  // Attached orientation hangs naturally down-left from the bare oak twiglet tip (u=0.3897, v=0.2439)
  const preDetachSag = smootherstep(0.30, DETACH_P, p);
  const attachedRoll = -1.04 - 0.06 * preDetachSag;
  const attachedPitch = -0.52 + 0.05 * preDetachSag;
  const attachedYaw = -0.42 - 0.04 * preDetachSag;

  const releaseBlend = smootherstep(0.0, 0.18, u);
  const fallRoll = lerp(attachedRoll, flight.roll, releaseBlend);
  const fallPitch = lerp(attachedPitch, flight.pitch, releaseBlend);
  const fallYaw = lerp(attachedYaw, flight.yaw, releaseBlend);

  // Post-contact settling & restrained floating (p > 0.64, C0/C1 continuous at touchdown u = 1)
  const postTouch = clamp01((p - TOUCH_P) / 0.185);
  const settlePhase = clamp01((p - TOUCH_P) / 0.052);
  const settleEase = smootherstep(0.0, 1.0, settlePhase);
  const dampedRock =
    p <= TOUCH_P
      ? 0
      : Math.sin(settlePhase * Math.PI * 2.15) *
        Math.exp(-settlePhase * 2.4) *
        smoothstep(0.0, 0.22, settlePhase) *
        (1 - settlePhase);

  const floatPitchOffsetRad = p <= TOUCH_P ? 0 : settleEase * 0.078 + dampedRock * 0.042;
  const floatRollOffsetRad = p <= TOUCH_P ? 0 : settleEase * 0.145 - dampedRock * 0.036;
  const floatYawOffsetRad = p <= TOUCH_P ? 0 : smootherstep(0.06, 0.96, postTouch) * 0.064;

  const driftEase = smootherstep(0.08, 0.96, postTouch);
  const floatDriftX = p <= TOUCH_P ? 0 : driftEase * 0.022;
  const floatDriftY = p <= TOUCH_P ? 0 : -driftEase * 0.007;
  const floatDriftZ = p <= TOUCH_P ? 0 : driftEase * 0.011;

  const waveRockStrength =
    p <= TOUCH_P
      ? 0
      : smoothstep(TOUCH_P, 0.658, p) *
        (0.38 + 0.62 * (1 - smoothstep(0.675, 0.76, p))) *
        (1 - smoothstep(0.75, 0.835, p));

  const leafRollRad = (p <= DETACH_P ? attachedRoll : fallRoll) + floatRollOffsetRad;
  const leafPitchRad = (p <= DETACH_P ? attachedPitch : fallPitch) + floatPitchOffsetRad;
  const leafYawRad = (p <= DETACH_P ? attachedYaw : fallYaw) + floatYawOffsetRad;

  const leafOpacity = leafAppear * (1 - smootherstep(0.81, 0.895, p));
  const leafSubsurface = lerp(0.18, 0.62, smootherstep(0.16, 0.44, heightNorm));
  const leafColorAging = smootherstep(0.635, 0.76, p) * 0.45;
  const leafLightFactor = lerp(0.54, 1.06, smootherstep(0.05, 0.62, heightNorm));
  const focusSoftness = lerp(0.16, 0.03, smootherstep(0.18, 0.34, p));

  const contactDip =
    p <= TOUCH_P
      ? 0
      : Math.sin(clamp01((p - TOUCH_P) / 0.055) * Math.PI) *
        Math.exp(-(p - TOUCH_P) * 16.0);
  const waterlineDepth = p <= TOUCH_P ? 0 : smootherstep(0.006, 0.048, p - TOUCH_P);

  const impactRippleProgress = clamp01((p - TOUCH_P) / 0.16);
  const impactRippleStrength =
    p <= TOUCH_P
      ? 0
      : smoothstep(TOUCH_P, TOUCH_P + 0.014, p) * (1 - smootherstep(0.71, 0.85, p));

  // =========================================================================
  // 3. WATER APPROACH & CAMERA TRACKING FOLLOW
  // =========================================================================
  // Dark forest pond rises seamlessly over leandro-rossi's own lower pond during final descent
  const lakeVisibility = smootherstep(0.545, 0.642, p);
  const reflectionIntensity =
    smootherstep(0.70, 0.785, p) * (1 - smootherstep(0.855, 0.925, p));

  // Camera pans downward from oak branch (1.0) down to pond (0.0) strictly synchronized with fall
  const panNormY = 1.0 - smootherstep(DETACH_P, TOUCH_P, p);
  const panOffsetX = -airSwayX * 0.24 * (1 - smoothstep(0.84, 0.99, u));

  const cameraZ =
    2.52 -
    smootherstep(0.04, 0.24, p) * 0.16 +
    smootherstep(0.36, 0.50, p) * 0.08 -
    smootherstep(0.58, 0.72, p) * 0.09 -
    smootherstep(0.78, 0.92, p) * 0.14;

  const pitchDeg =
    2.4 * pushIn -
    4.6 * smootherstep(0.36, 0.58, p) +
    2.2 * smootherstep(0.68, 0.89, p);
  const rollDeg =
    1.1 * Math.sin(smootherstep(0.36, 0.64, p) * Math.PI) -
    0.8 * smootherstep(0.74, 0.91, p);

  const darknessVeilOpacity = 0.0;

  // =========================================================================
  // 4. WATER LIGHT, REFLECTION-CARRIED FOREST EMERGENCE & ACOUSTIC IDENTITY
  // =========================================================================
  const lightXNorm = lerp(0.5, 0.48, smootherstep(0.60, 0.80, p));
  const lightYNorm = lerp(0.34, 0.44, smootherstep(0.60, 0.80, p));
  const lightIntensity =
    smootherstep(0.56, 0.66, p) * 0.72 * (1 - smootherstep(0.83, 0.93, p));
  const lightRadiusNorm = lerp(0.18, 0.44, smootherstep(0.60, 0.82, p));
  const waterMotion = clamp01(
    0.16 * lakeVisibility +
      impactRippleStrength * 0.88 +
      smootherstep(0.78, 0.95, p) * 0.22
  );

  const portalProgress = smootherstep(0.785, 0.895, p);
  const settleScale = lerp(1.06, 1.0, smootherstep(0.785, 0.94, p));
  const counterRollDeg = lerp(-1.2, 0.0, smootherstep(0.80, 0.93, p));
  const hazeOpacity =
    Math.sin(smootherstep(0.785, 0.905, p) * Math.PI) * 0.22;

  const waterResonance =
    smootherstep(0.72, 0.85, p) * (0.45 + 0.55 * smootherstep(0.85, 0.96, p));
  const topographyStrength =
    smootherstep(0.74, 0.86, p) * (1 - smootherstep(0.89, 0.96, p));
  const waveOpacity = smootherstep(0.875, 0.945, p) * 0.88;
  const contourProgress = smootherstep(0.89, 0.96, p);
  const spectrumIntensity = smootherstep(0.91, 0.975, p);

  const audioMix: AudioMixState = {
    water: clamp01(
      smootherstep(0.60, 0.68, p) * 0.82 - smootherstep(0.88, 1.0, p) * 0.34
    ),
    wind: clamp01(
      0.16 +
        windGust * 0.42 +
        smootherstep(0.36, 0.58, p) * 0.28 +
        smootherstep(0.80, 0.95, p) * 0.25
    ),
    birds: clamp01(smootherstep(0.82, 0.96, p) * 0.65),
    insects: clamp01(smootherstep(0.88, 1.0, p) * 0.42),
  };

  const brandOpacity = smootherstep(0.935, 0.97, p);
  const taglineOpacity = smootherstep(0.948, 0.982, p);
  const descriptionOpacity = smootherstep(0.96, 0.992, p);
  const ctaOpacity = smootherstep(0.972, 0.998, p);
  const navbarVisible = p >= 0.95;

  return {
    progress: p,
    phase,
    tree: {
      exposure: treeExposure,
      trunkReveal,
      branchReveal,
      windGust,
      depthBlur,
      openingZoom,
      openingPanV,
      openingBlur,
      foliagePushProgress,
      foliagePresence,
      foliageEntryX,
      foliageEntryY,
      foliageScale,
      foliageBlur,
      occlusionSweep,
    },
    lake: {
      visibility: lakeVisibility,
      reflectionIntensity,
    },
    camera: {
      rollDeg,
      rollRad: (rollDeg * Math.PI) / 180,
      pitchDeg,
      pitchRad: (pitchDeg * Math.PI) / 180,
      cameraZ,
      panNormY,
      panOffsetX,
      darknessVeilOpacity,
    },
    leaf: {
      attached,
      attachBlend,
      stemFlex,
      fallT,
      xBlendToCenter,
      airSwayX,
      y: leafY,
      z: leafZ,
      scale: leafScale,
      pitchRad: leafPitchRad,
      yawRad: leafYawRad,
      rollRad: leafRollRad,
      flutterAmount:
        p <= DETACH_P ? 0.14 + windGust * 0.32 : clamp01(0.96 * flutterDecay),
      heightNorm,
      opacity: leafOpacity,
      lightFactor: leafLightFactor,
      colorAging: leafColorAging,
      subsurface: leafSubsurface,
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
      xNorm: lightXNorm,
      yNorm: lightYNorm,
      intensity: lightIntensity,
      radiusNorm: lightRadiusNorm,
      waterMotion,
    },
    world: {
      portalProgress,
      settleScale,
      counterRollDeg,
      hazeOpacity,
      particlesOpacity: 0,
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
      quietMarkOpacity: 0,
      brandOpacity,
      taglineOpacity,
      descriptionOpacity,
      ctaOpacity,
      navbarVisible,
    },
  };
}
