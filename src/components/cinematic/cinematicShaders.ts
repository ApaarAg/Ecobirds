export const CINEMATIC_VERTEX_SHADER = /* glsl */ `
  varying vec2 vWorldUv;
  varying vec4 vClipPos;

  void main() {
    vWorldUv = uv;
    vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    vClipPos = clip;
    gl_Position = clip;
  }
`;

export const CINEMATIC_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform sampler2D uTexOpening;
  uniform sampler2D uTexFoliage;
  uniform sampler2D uTexForestMid;
  uniform sampler2D uTexForestFar;
  uniform float uOpeningReady;
  uniform float uFoliageReady;
  uniform float uForestReady;

  uniform vec2 uResolution;
  uniform float uOpeningTexAspect;
  uniform float uFoliageTexAspect;
  uniform float uFoliageBaseVCenter;
  uniform float uTreeCropShiftX;
  uniform float uTexAspect;
  uniform float uForestTexAspect;
  uniform vec2 uForestCropOffset;
  uniform float uTime;
  uniform vec2 uMouse;

  // Persistent opening forest (leandro-rossi) + keyed oak depth plane (jason-leem)
  uniform float uTreeExposure;
  uniform float uTrunkReveal;
  uniform float uBranchReveal;
  uniform float uOpeningZoom;
  uniform float uOpeningPanV;
  uniform float uOpeningBlur;
  uniform float uFoliagePush;
  uniform float uFoliagePresence;
  uniform vec2 uFoliageEntry;
  uniform float uFoliageScale;
  uniform float uFoliageBlur;
  uniform float uOcclusionSweep;
  uniform float uWindGust;
  uniform float uCamPanNormY;
  uniform float uCamPanOffsetX;
  uniform float uLakeVisibility;
  uniform float uReflectionIntensity;

  // Ambient / reflected pond light uniforms
  uniform vec2 uLightPos;
  uniform float uLightIntensity;
  uniform float uLightRadius;
  uniform float uWaterMotion;

  // Falling oak leaf lake-shadow, meniscus contact & dispersive impact ripples
  uniform vec2 uLeafShadowPos;
  uniform float uLeafHeightNorm;
  uniform float uLeafYaw;
  uniform float uLeafOpacity;
  uniform vec2 uImpactOrigin;
  uniform float uImpactRippleProgress;
  uniform float uImpactRippleStrength;
  uniform float uContactDip;

  // Interactive click water ripple uniforms
  uniform vec2 uRippleCenter;
  uniform float uRippleAge;
  uniform float uRippleActive;

  // Ripple-carried camera emergence & depth forest uniforms
  uniform float uPortalProgress;
  uniform float uSettleScale;
  uniform float uSettleRollRad;
  uniform float uHazeOpacity;
  uniform float uDarknessVeil;

  // Web Audio AnalyserNode FFT bands & acoustic emergence uniforms
  uniform float uWaterResonance;
  uniform float uAcousticTopography;
  uniform vec4 uAudioBands; // x=low, y=mid, z=high, w=amplitude

  varying vec2 vWorldUv;
  varying vec4 vClipPos;

  vec2 coverUv(vec2 uv, float targetAspect, float texAspect) {
    vec2 centered = uv - 0.5;
    if (targetAspect > texAspect) {
      centered.y *= texAspect / targetAspect;
    } else {
      centered.x *= targetAspect / texAspect;
    }
    return centered + 0.5;
  }

  vec2 coverUvAnchored(vec2 uv, float targetAspect, float texAspect, float baseVCenter, float mobileShiftX) {
    vec2 centered = uv - 0.5;
    if (targetAspect > texAspect) {
      centered.y *= texAspect / targetAspect;
    } else {
      centered.x *= targetAspect / texAspect;
    }
    if (targetAspect < 1.0) {
      centered.x += mobileShiftX;
    }
    return vec2(centered.x + 0.5, centered.y + baseVCenter);
  }

  vec2 coverUvForest(vec2 uv, float targetAspect, float texAspect, vec2 cropOffset) {
    vec2 centered = uv - 0.5;
    if (targetAspect > texAspect) {
      centered.y *= texAspect / targetAspect;
    } else {
      centered.x *= targetAspect / texAspect;
    }
    centered += cropOffset;
    return centered + 0.5;
  }

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 m = mat2(0.8, 0.6, -0.6, 0.8);
    for (int i = 0; i < 4; i++) {
      v += a * valueNoise(p);
      p = m * p * 2.02;
      a *= 0.5;
    }
    return v;
  }

  vec2 rotate2d(vec2 v, float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return mat2(c, -s, s, c) * v;
  }

  // Authentic optical mipmap-backed disk bokeh + subtle directional push blur (zero multi-tap ghosting)
  vec3 sampleSoftBokeh(sampler2D tex, vec2 uv, vec2 motionDir, float blurAmt, float radialAmt) {
    if (blurAmt <= 0.005 && radialAmt <= 0.005) return texture2D(tex, uv).rgb;

    float lod = blurAmt * 2.5;
    float r = blurAmt * 0.0015;
    vec2 m = motionDir * radialAmt * 0.0045;
    vec3 acc = texture2D(tex, uv, lod).rgb * 0.36;
    acc += texture2D(tex, clamp(uv + vec2(r, 0.0) + m * 0.4, 0.003, 0.997), lod).rgb * 0.16;
    acc += texture2D(tex, clamp(uv - vec2(r, 0.0) - m * 0.4, 0.003, 0.997), lod).rgb * 0.16;
    acc += texture2D(tex, clamp(uv + vec2(0.0, r) + m * 0.7, 0.003, 0.997), lod).rgb * 0.16;
    acc += texture2D(tex, clamp(uv - vec2(0.0, r) - m * 0.7, 0.003, 0.997), lod).rgb * 0.16;
    return acc;
  }

  // Linear-space oak-branch & foliage matte rejecting uniform teal-blue sky & pale grey anti-aliased rims
  float evalOakFoliageAlpha(vec3 c) {
    float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
    float warmDiff = c.r - c.b;
    float skyDist = length((c - vec3(0.178, 0.341, 0.372)) / vec3(0.15, 0.16, 0.17));
    float isSkyColor = 1.0 - smoothstep(0.45, 1.32, skyDist);
    float isCoolOrNeutralBright = smoothstep(-0.04, 0.045, c.b - c.r) * smoothstep(0.045, 0.14, luma);
    float skyMask = clamp(max(isSkyColor, isCoolOrNeutralBright), 0.0, 1.0);
    // Warm oak tissue (strong R>B) and dark woody bark (very low luma) stay crisp; bright pale edges cleanly fade
    float warmLeaf = smoothstep(0.045, 0.13, warmDiff);
    float darkBark = 1.0 - smoothstep(0.022, 0.068, luma);
    float solidProtect = clamp(warmLeaf + darkBark * (1.0 - smoothstep(-0.01, 0.035, c.b - c.r)), 0.0, 1.0);
    return clamp(solidProtect * (1.0 - skyMask * 0.95), 0.0, 1.0);
  }

  vec3 despillOakEdge(vec3 c, float alpha) {
    if (alpha >= 0.97) return c;
    // Strip cool sky contamination & slightly deepen semi-transparent rims so zero bright fringe appears against foliage
    vec3 barkWarm = vec3(c.r * 0.88, min(c.g, c.r * 0.62 + 0.012), min(c.b, c.r * 0.28 + 0.003));
    return mix(barkWarm * 0.58, c, smoothstep(0.28, 0.97, alpha));
  }

  // Smooth premultiplied-alpha optical bokeh blur for keyed oak branch depth plane
  vec4 sampleKeyedOakBokeh(sampler2D tex, vec2 uv, vec2 motionDir, float blurAmt, float motionAmt) {
    float lod = blurAmt * 1.9;
    float r = max(0.00035, blurAmt * 0.0017);
    vec2 m = motionDir * motionAmt * 0.0045;

    vec2 offs[5];
    offs[0] = vec2(0.0, 0.0);
    offs[1] = vec2(r, r * 0.4) + m * 0.4;
    offs[2] = vec2(-r, -r * 0.4) - m * 0.4;
    offs[3] = vec2(-r * 0.4, r) + m * 0.7;
    offs[4] = vec2(r * 0.4, -r) - m * 0.7;

    float weights[5];
    weights[0] = 0.36;
    weights[1] = 0.16;
    weights[2] = 0.16;
    weights[3] = 0.16;
    weights[4] = 0.16;

    vec3 accRgb = vec3(0.0);
    float accAlpha = 0.0;
    for (int i = 0; i < 5; i++) {
      vec2 suv = clamp(uv + offs[i], 0.002, 0.998);
      vec3 c = texture2D(tex, suv, lod).rgb;
      float a = evalOakFoliageAlpha(c);
      vec3 clean = despillOakEdge(c, a);
      accRgb += clean * (a * weights[i]);
      accAlpha += a * weights[i];
    }

    vec3 rgb = accAlpha > 0.004 ? accRgb / accAlpha : vec3(0.0);
    float softAlpha = smoothstep(0.08, 0.88, accAlpha);
    return vec4(rgb, softAlpha);
  }

  float computePondWaterMask(vec2 oUv, vec2 screenUv) {
    float farShoreMask = smoothstep(0.39, 0.30, oUv.y);
    float nearShoreMask = smoothstep(0.002, 0.018, oUv.y);
    float horizEdgeMask = smoothstep(0.004, 0.025, screenUv.x) * (1.0 - smoothstep(0.975, 0.996, screenUv.x));
    return farShoreMask * nearShoreMask * horizEdgeMask;
  }

  float evalPondHeight(vec2 lScreenUv, vec2 lUv, float screenAspect, float waterMask) {
    if (waterMask <= 0.001) return 0.0;

    float perspScale = mix(1.0, 0.58, smoothstep(0.18, 0.56, lUv.y));
    float h = 0.0;

    vec2 pCoord = vec2(lUv.x * uTexAspect, lUv.y * 1.65);
    float ambWave =
      sin(dot(pCoord, vec2(19.0, 11.0)) + uTime * 0.72) * 0.34 +
      sin(dot(pCoord, vec2(-14.0, 23.0)) - uTime * 0.58 + 1.1) * 0.28 +
      sin(dot(pCoord, vec2(29.0, -17.0)) + uTime * 0.94 + 2.4) * 0.22 +
      sin(dot(pCoord, vec2(8.0, 34.0)) - uTime * 0.44 + 0.4) * 0.16;
    float ambAmp = (0.00062 + 0.00058 * uWaterMotion) * perspScale;
    h += ambWave * ambAmp;

    vec2 impDelta = lScreenUv - uImpactOrigin;
    float foreshortenY = mix(1.62, 2.02, smoothstep(0.18, 0.56, lUv.y));
    vec2 pondDelta = vec2(impDelta.x * screenAspect, impDelta.y * foreshortenY);
    float r = length(pondDelta);

    if (uImpactRippleStrength > 0.003 || uContactDip > 0.003) {
      if (uContactDip > 0.003) {
        vec2 bladeLocal = rotate2d(pondDelta, -uLeafYaw * 0.65);
        vec2 menVec = bladeLocal * vec2(0.74, 1.38);
        float mDist = length(menVec);
        float depression = -exp(-(mDist * mDist) / 0.0011) * 0.0095;
        float capRim = exp(-pow(mDist - 0.046, 2.0) / 0.00055) * 0.0048;
        float capRipple = exp(-(mDist * mDist) / 0.0065) * sin(mDist * 118.0 - uTime * 3.0) * 0.0022;
        h += (depression + capRim + capRipple) * uContactDip;
      }

      if (uImpactRippleStrength > 0.003) {
        float ang = atan(pondDelta.y, pondDelta.x);
        float organicWarp =
          1.0 +
          0.048 * sin(ang * 2.0 - uLeafYaw * 1.4 + 0.4) +
          0.024 * cos(ang * 3.0 + r * 8.0) +
          0.016 * sin(ang * 5.0 - 1.1);
        float rEff = r * organicWarp;
        float front = mix(0.044, 0.84, uImpactRippleProgress);
        float originSmooth = smoothstep(0.008, 0.038, r);
        float radialAtten = inversesqrt(1.0 + r * 12.5) * exp(-r * 1.75);

        float b1 = rEff - front;
        float b2 = rEff - max(0.0, front - 0.078);
        float b3 = rEff - max(0.0, front - 0.150);

        float w1 = exp(-(b1 * b1) / 0.0021) * cos(b1 * 62.0);
        float w2 = exp(-(b2 * b2) / 0.0014) * cos(b2 * 88.0) * 0.64;
        float w3 = exp(-(b3 * b3) / 0.0010) * cos(b3 * 116.0) * 0.36;
        float wakeBehind = smoothstep(front + 0.02, front - 0.09, rEff) * exp(-max(0.0, front - rEff) * 3.8) * cos((rEff - front) * 42.0) * 0.24;

        h += (w1 + w2 + w3 + wakeBehind) * 0.0135 * uImpactRippleStrength * originSmooth * radialAtten * perspScale;
      }
    }

    if (uRippleActive > 0.5) {
      vec2 rpDelta = vec2((lUv.x - uRippleCenter.x) * uTexAspect, (lUv.y - uRippleCenter.y) * 1.72);
      float rpDist = length(rpDelta);
      float rpFront = uRippleAge * 0.24;
      float rpBand = rpDist - rpFront;
      float rpBand2 = rpDist - max(0.0, rpFront - 0.045);
      float rpDecay = exp(-uRippleAge * 0.88) * inversesqrt(1.0 + rpDist * 11.0) * smoothstep(0.004, 0.024, rpDist);
      float rpWave =
        exp(-(rpBand * rpBand) / 0.0009) * cos(rpBand * 112.0) +
        exp(-(rpBand2 * rpBand2) / 0.0007) * cos(rpBand2 * 148.0) * 0.58;
      h += rpWave * 0.0105 * rpDecay * perspScale;
    }

    if (uWaterResonance > 0.003) {
      float lowRes = cos(r * 24.0 - uTime * 1.45) * sin(pondDelta.x * 11.0 + uTime * 0.55) * (0.30 + 0.70 * uAudioBands.x);
      float midRes = sin(pondDelta.x * 38.0 + uTime * 1.15) * cos(pondDelta.y * 48.0 - uTime * 0.95) * (0.30 + 0.70 * uAudioBands.y);
      float highRes = sin(r * 78.0 - uTime * 2.55) * exp(-r * 1.9) * (0.25 + 0.75 * uAudioBands.z);
      float audioScale = 0.75 + 0.85 * uAudioBands.w;
      h += (lowRes * 0.0022 + midRes * 0.0014 + highRes * 0.0009) * uWaterResonance * audioScale * perspScale;
    }

    return h * waterMask;
  }

  void main() {
    float screenAspect = max(0.2, uResolution.x / max(1.0, uResolution.y));
    vec2 screenUv = 0.5 + 0.5 * (vClipPos.xy / max(0.0001, vClipPos.w));

    vec3 sceneAColor = vec3(0.0);
    vec2 a0OpenUv = vec2(0.5);
    vec2 a0FinalUv = vec2(0.5);
    float a0BasinShade = 0.0;
    float a0MotionBlur = 0.0;

    // =========================================================================
    // A0. PERSISTENT OPENING FOREST (leandro-rossi): NEVER DISAPPEARS
    // Stays physically continuous from initial load -> canopy push -> leaf fall -> pond arrival
    // =========================================================================
    if (uOpeningReady > 0.5 && uPortalProgress < 0.995) {
      vec2 pushPivot = vec2(0.54, 0.56);
      vec2 zoomedScreen = (screenUv - pushPivot) / max(0.75, uOpeningZoom) + pushPivot;
      // Camera tracks horizontal leaf drift at distant background parallax (0.55x)
      zoomedScreen += vec2(uCamPanOffsetX * 0.55, 0.0);
      // Restrained pointer parallax
      zoomedScreen -= uMouse * vec2(0.011, 0.008);

      vec2 openUv = coverUvAnchored(zoomedScreen, screenAspect, uOpeningTexAspect, uOpeningPanV, -0.02);
      vec2 safeOpenUv = clamp(openUv, 0.004, 0.996);

      // Subtle living forest motion: gentle wind stir on foliage + micro-shimmer on lower pond
      float pondMask = 1.0 - smoothstep(0.22, 0.36, safeOpenUv.y);
      float leafStirMask = smoothstep(0.32, 0.55, safeOpenUv.y);
      vec2 openBreeze = vec2(
        sin(uTime * 0.92 + safeOpenUv.y * 8.5 + safeOpenUv.x * 3.2) * 0.00085,
        cos(uTime * 0.68 + safeOpenUv.x * 7.2) * 0.00052
      ) * leafStirMask;
      vec2 pondShimmer = vec2(
        sin(uTime * 1.15 + safeOpenUv.y * 42.0 + safeOpenUv.x * 16.0) * 0.00045,
        cos(uTime * 0.85 + safeOpenUv.x * 24.0) * 0.00032
      ) * pondMask;

      // Subtle depth separation: foreground dark diagonal branch shifts more than sunlit bokeh canopy
      vec3 probeOpen = texture2D(uTexOpening, safeOpenUv).rgb;
      float openLuma = dot(probeOpen, vec3(0.299, 0.587, 0.114));
      float fgDepth = 1.0 - smoothstep(0.12, 0.54, openLuma);
      vec2 depthParallax = -uMouse * fgDepth * 0.010;

      vec2 finalOpenUv = clamp(safeOpenUv + openBreeze + pondShimmer + depthParallax, 0.004, 0.996);
      vec2 motionDir = mix(
        normalize(screenUv - pushPivot + vec2(0.0001)),
        vec2(0.0, -1.0),
        smoothstep(0.98, 0.45, uCamPanNormY)
      );
      float motionBlurAmt = max(
        uFoliagePush * (1.0 - smoothstep(0.7, 1.0, uFoliagePush)) * 0.45,
        smoothstep(0.98, 0.35, uCamPanNormY) * 0.34
      );
      vec3 openSample = sampleSoftBokeh(uTexOpening, finalOpenUv, motionDir, uOpeningBlur, motionBlurAmt);

      // Subtle golden late-afternoon warmth in upper canopy when oak foliage enters -> shaded woodland pond below
      float warmCanopyGrade = smoothstep(0.15, 0.85, uFoliagePresence) * smoothstep(0.24, 0.72, openLuma);
      openSample *= mix(vec3(1.0), vec3(1.12, 0.94, 0.68), warmCanopyGrade * 0.45);

      float basinShade = smoothstep(0.86, 0.08, uCamPanNormY);
      openSample *= mix(vec3(1.0), vec3(0.42, 0.50, 0.44), basinShade * 0.62);

      a0OpenUv = safeOpenUv;
      a0FinalUv = finalOpenUv;
      a0BasinShade = basinShade;
      a0MotionBlur = motionBlurAmt;
      sceneAColor = openSample * uTreeExposure;
    }

    // =========================================================================
    // A1. KEYED OAK FOLIAGE DEPTH PLANE (jason-leem without blue sky)
    // Glides smoothly inside leandro-rossi's sunlit forest canopy -> exits upward as camera follows falling leaf
    // =========================================================================
    if (uFoliageReady > 0.5 && uFoliagePresence > 0.003 && uCamPanNormY > 0.005 && uPortalProgress < 0.995) {
      vec2 fPivot = vec2(0.42, 0.44);
      vec2 fZoomed = (screenUv - fPivot) / max(0.8, uFoliageScale) + fPivot;
      // Exact coordinate coupling with WebGLCinematicStage.unprojectFoliageTwigToZ0
      vec2 fScreen = fZoomed
        + uFoliageEntry
        + vec2(uCamPanOffsetX, -(1.0 - uCamPanNormY) * 0.72)
        - uMouse * (0.012 - uFoliagePush * 0.006);

      vec2 foliageUv = coverUvAnchored(fScreen, screenAspect, uFoliageTexAspect, uFoliageBaseVCenter, uTreeCropShiftX);

      // Clean bounds mask so oak branch never smears past texture edge
      float edgeMask =
        smoothstep(0.002, 0.025, foliageUv.x) *
        (1.0 - smoothstep(0.975, 0.998, foliageUv.x)) *
        smoothstep(0.002, 0.025, foliageUv.y) *
        (1.0 - smoothstep(0.975, 0.998, foliageUv.y));

      if (edgeMask > 0.002) {
        vec2 safeFoliageUv = clamp(foliageUv, 0.003, 0.997);

        // Gentle breeze on sunlit autumn oak leaves
        vec3 probeF = texture2D(uTexFoliage, safeFoliageUv).rgb;
        float warmOakMask = smoothstep(0.03, 0.16, probeF.r - probeF.b);
        float gustScale = 1.0 + uWindGust * 2.1;
        vec2 foliageWind = vec2(
          sin(uTime * 1.25 + safeFoliageUv.y * 9.5 + safeFoliageUv.x * 4.5) * 0.00072,
          cos(uTime * 0.90 + safeFoliageUv.x * 8.0) * 0.00046
        ) * warmOakMask * gustScale;

        vec2 sampleFUv = clamp(safeFoliageUv + foliageWind, 0.003, 0.997);
        vec2 motionVec = vec2(0.0, -1.0);
        float motionBlur = smoothstep(0.98, 0.40, uCamPanNormY) * 0.35;
        vec4 keyedOak = sampleKeyedOakBokeh(uTexFoliage, sampleFUv, motionVec, uFoliageBlur, motionBlur);

        // Unify branch lighting with underlying forest shadows as camera descends into basin
        float basinCoolFade = smoothstep(0.92, 0.18, uCamPanNormY);
        vec3 oakLit = keyedOak.rgb * mix(vec3(1.0), vec3(0.32, 0.36, 0.34), basinCoolFade * 0.85);
        float oakAlpha = clamp(keyedOak.a * uFoliagePresence * edgeMask, 0.0, 1.0);

        sceneAColor = mix(sceneAColor, oakLit, oakAlpha);
      }
    }

    // =========================================================================
    // FOREGROUND OUT-OF-FOCUS FOLIAGE PASS (depth occlusion during push & descent)
    // =========================================================================
    if (uOcclusionSweep > 0.01 && uOpeningReady > 0.5 && uPortalProgress < 0.995) {
      // Sample dark foreground foliage silhouette from lower-left leaves of leandro-rossi moving at 1.85x parallax
      float fgSweepShift = (1.0 - uCamPanNormY) * 1.15 + uFoliagePush * 0.45;
      vec2 fgUv = clamp(
        vec2(screenUv.x * 0.72 + 0.04, fract(screenUv.y * 0.62 - fgSweepShift * 0.55) * 0.45 + 0.12),
        0.01,
        0.99
      );
      vec3 fgLeafSample = sampleSoftBokeh(uTexOpening, fgUv, vec2(0.0, -1.0), 1.35, 0.5);
      float fgEdgeZone = smoothstep(0.28, 0.0, screenUv.x) + smoothstep(0.76, 1.0, screenUv.x);
      float fgLeafDensity = (1.0 - smoothstep(0.08, 0.24, dot(fgLeafSample, vec3(0.3, 0.59, 0.11)))) * clamp(fgEdgeZone, 0.0, 1.0);
      float occAlpha = clamp(fgLeafDensity * uOcclusionSweep * 0.62, 0.0, 0.58);
      sceneAColor = mix(sceneAColor, fgLeafSample * 0.35, occAlpha);
    }

    // =========================================================================
    // A2. PHYSICAL POND SURFACE RIPPLES & REFLECTION ON OPENING FOREST POND
    // =========================================================================
    if (uOpeningReady > 0.5 && uLakeVisibility > 0.001 && uPortalProgress < 0.995) {
      vec2 lakeScreenUv = screenUv + vec2(uCamPanOffsetX * 0.5, uCamPanNormY * 0.42);
      vec2 lakeUv = clamp(coverUv(lakeScreenUv, screenAspect, uTexAspect), 0.002, 0.998);

      float waterMask = computePondWaterMask(a0OpenUv, screenUv);

      float eps = 0.0022;
      vec2 epsX = vec2(eps / screenAspect, 0.0);
      vec2 epsY = vec2(0.0, eps);

      vec2 lakeUvX = clamp(coverUv(lakeScreenUv + epsX, screenAspect, uTexAspect), 0.004, 0.996);
      vec2 lakeUvY = clamp(coverUv(lakeScreenUv + epsY, screenAspect, uTexAspect), 0.004, 0.996);

      float hC = evalPondHeight(lakeScreenUv, lakeUv, screenAspect, waterMask);
      float hX = evalPondHeight(lakeScreenUv + epsX, lakeUvX, screenAspect, waterMask);
      float hY = evalPondHeight(lakeScreenUv + epsY, lakeUvY, screenAspect, waterMask);

      float slopeScale = 0.54 / eps;
      vec3 waterNormal = normalize(vec3((hC - hX) * slopeScale, (hC - hY) * slopeScale, 1.0));

      vec2 refractShift = waterNormal.xy * vec2(0.036, 0.064) * waterMask;
      vec2 refractedOpenUv = clamp(a0FinalUv + refractShift, 0.004, 0.996);
      vec3 lakeSample = sampleSoftBokeh(
        uTexOpening,
        refractedOpenUv,
        vec2(0.0, -1.0),
        uOpeningBlur * (1.0 - 0.35 * uLakeVisibility),
        a0MotionBlur * 0.4
      );
      lakeSample *= mix(vec3(1.0), vec3(0.42, 0.50, 0.44), a0BasinShade * 0.62) * uTreeExposure;

      vec2 dLight = lakeScreenUv - uLightPos;
      dLight.x *= screenAspect * 0.65;
      vec2 rLight = rotate2d(dLight, -0.22);
      float sigX = max(0.32, uLightRadius * 2.6);
      float sigY = max(0.20, uLightRadius * 1.8);
      float beam = exp(-(rLight.x * rLight.x) / (sigX * sigX) - (rLight.y * rLight.y) / (sigY * sigY)) * uLightIntensity;

      vec2 vigVec = (lakeScreenUv - vec2(0.5, 0.48)) * vec2(0.62, 0.78);
      float lakeVignette = clamp(1.0 - dot(vigVec, vigVec) * 0.12, 0.76, 1.0);

      vec2 shVec = rotate2d(lakeScreenUv - uLeafShadowPos, -uLeafYaw * 0.65);
      shVec.x *= screenAspect * 0.76;
      shVec.y *= 1.85;
      float shadowRadius = mix(0.036, 0.16, uLeafHeightNorm);
      float shadowStrength = mix(0.46 * uLeafOpacity, 0.14, uLeafHeightNorm) * (1.0 - smoothstep(0.45, 0.78, uPortalProgress));
      float leafShadow = 1.0 - exp(-dot(shVec, shVec) / (shadowRadius * shadowRadius)) * shadowStrength;

      // Subtle warm-amber inverted reflection of resting oak leaf directly beneath floating blade
      vec2 leafReflDelta = rotate2d(lakeScreenUv - (uLeafShadowPos - vec2(0.0, 0.022)) + waterNormal.xy * 0.012, -uLeafYaw * 0.65);
      leafReflDelta.x *= screenAspect * 0.72;
      leafReflDelta.y *= 1.95;
      float leafReflMask = exp(-dot(leafReflDelta, leafReflDelta) / (0.042 * 0.042)) * (1.0 - smoothstep(0.0, 0.14, uLeafHeightNorm)) * uLeafOpacity * waterMask;

      float pondExposure = mix(1.0, 0.84 + beam * 0.22, waterMask) * lakeVignette * leafShadow;
      vec3 deepWaterBase = lakeSample * pondExposure;
      deepWaterBase = mix(deepWaterBase, deepWaterBase * 0.64 + vec3(0.038, 0.022, 0.008), leafReflMask * 0.55);

      vec3 viewDir = normalize(vec3(0.0, -0.36, 0.93));
      vec3 reflRay = reflect(-viewDir, waterNormal);
      float ndotv = clamp(dot(waterNormal, viewDir), 0.0, 1.0);
      float fresnel = 0.02 + 0.98 * pow(1.0 - ndotv, 5.0);

      float slopeSkyTilt = clamp(smoothstep(-0.15, 0.58, reflRay.y), 0.0, 1.0);
      float slopeMod = length(waterNormal.xy);
      float lakeLuma = dot(lakeSample, vec3(0.299, 0.587, 0.114));
      float antiMilk = mix(1.0, 0.45, smoothstep(0.18, 0.45, lakeLuma));
      vec3 waveSkyMod = mix(vec3(-0.018, -0.018, -0.016), vec3(0.048, 0.058, 0.052), slopeSkyTilt) * smoothstep(0.025, 0.28, slopeMod) * antiMilk * waterMask * lakeVignette;

      vec3 skyGapDir = normalize(vec3((uLightPos.x - 0.5) * 0.45, 0.62, 0.75));
      vec3 halfVec = normalize(skyGapDir + viewDir);
      float waveSlopeCatch = pow(max(0.0, dot(waterNormal, halfVec)), 42.0);
      vec3 specularGlint = vec3(0.072, 0.084, 0.078) * waveSlopeCatch * smoothstep(0.05, 0.26, slopeMod) * antiMilk * waterMask * (0.24 + beam * 0.30) * lakeVignette;

      vec3 skyFresnelTint = vec3(0.038, 0.050, 0.046) * fresnel * waterMask * (0.40 + beam * 0.50) * lakeVignette * leafShadow;

      vec3 pondReflection = vec3(0.0);
      if (uForestReady > 0.5 && uReflectionIntensity > 0.005) {
        vec2 reflScreenUv = vec2(lakeScreenUv.x, 1.0 - lakeScreenUv.y * 0.85);
        vec2 reflUv = coverUv(clamp(reflScreenUv, 0.02, 0.98), screenAspect, uForestTexAspect);
        reflUv = clamp(reflUv + waterNormal.xy * vec2(0.064, 0.098), 0.015, 0.985);
        vec3 reflSample = texture2D(uTexForestMid, reflUv).rgb;
        float reflLuma = dot(reflSample, vec3(0.299, 0.587, 0.114));
        vec3 valleyRefl = mix(vec3(reflLuma), reflSample, 0.52) * vec3(0.55, 0.62, 0.56);
        float reflFresnel = mix(0.28, 1.0, fresnel);
        float reflMask = waterMask * uReflectionIntensity * reflFresnel * leafShadow;
        pondReflection = valleyRefl * reflMask * 0.48 * lakeVignette;
      }

      vec3 acousticTopoGlow = vec3(0.0);
      if (uAcousticTopography > 0.003) {
        float reflLum = dot(pondReflection + lakeSample * 0.35, vec3(0.299, 0.587, 0.114));
        vec2 waveCenter = lakeScreenUv - uImpactOrigin;
        waveCenter.x *= screenAspect * 0.72;
        waveCenter.y *= 1.65;
        float radialW = length(waveCenter);

        float phaseRing = sin(radialW * 34.0 - uTime * 1.15 + hC * 280.0 + reflLum * 2.4);
        float thinRing = (1.0 - smoothstep(0.0, 0.055, abs(phaseRing))) * exp(-radialW * 1.45);
        float shoreWavePhase = sin((lakeScreenUv.y * 18.0 + sin(lakeScreenUv.x * 7.5 + uTime * 0.38) * 0.35 + hC * 220.0) * 3.14159265);
        float thinShoreLine = (1.0 - smoothstep(0.0, 0.052, abs(shoreWavePhase))) * smoothstep(0.04, 0.24, reflLum);

        float filamentEnergy = (thinRing * 0.58 + thinShoreLine * 0.52) * smoothstep(0.02, 0.16, slopeMod * 0.45 + reflLum);
        vec3 topoTint = mix(vec3(0.48, 0.58, 0.44), vec3(0.76, 0.78, 0.70), clamp(uAudioBands.z, 0.0, 1.0));
        acousticTopoGlow = topoTint * filamentEnergy * waterMask * uAcousticTopography * (0.16 + 0.14 * uAudioBands.w) * lakeVignette;
      }

      vec3 lakeColor = max(vec3(0.0), deepWaterBase + skyFresnelTint + waveSkyMod + specularGlint + pondReflection + acousticTopoGlow);
      sceneAColor = mix(sceneAColor, lakeColor, clamp(uLakeVisibility, 0.0, 1.0));
    }

    // =========================================================================
    // STAGE 3->4: REFLECTION-GUIDED HORIZON & TOPOGRAPHIC EMERGENCE
    // =========================================================================
    vec2 pVec = screenUv - uImpactOrigin;
    pVec.x *= screenAspect * 0.72;
    pVec.y *= 1.18;
    float radialDist = length(pVec);
    float rippleFrontierMod = sin(radialDist * 30.0 - uPortalProgress * 9.5) * 0.026 * (1.0 - uPortalProgress);
    float organicField = fbm(screenUv * 4.2 + vec2(0.0, uPortalProgress * 0.35));
    float bridgeElevation = screenUv.y * 0.34 + organicField * 0.26 + radialDist * 0.24 + rippleFrontierMod;

    float threshold = mix(-0.32, 1.32, uPortalProgress);
    float portalMask = 1.0 - smoothstep(threshold - 0.28, threshold + 0.28, bridgeElevation);
    float rim = smoothstep(0.0, 0.5, portalMask) * (1.0 - smoothstep(0.5, 1.0, portalMask));

    // =========================================================================
    // SCENE B: Settled Woodland Stream Hero (Floating Autumn Oak Leaf on Water)
    // =========================================================================
    vec3 sceneBColor = vec3(0.0196, 0.0235, 0.0196);

    if (uForestReady > 0.5 && uPortalProgress > 0.005) {
      vec2 glidePivot = vec2(0.5, 0.5);
      vec2 baseB = screenUv - glidePivot;
      float settleBreath = 1.0 + sin(uTime * 0.24) * 0.0014 * smoothstep(0.85, 1.0, uPortalProgress);
      baseB = rotate2d(baseB, uSettleRollRad) / max(0.5, uSettleScale * settleBreath) + glidePivot;
      vec2 forestUv = coverUvForest(baseB, screenAspect, uForestTexAspect, uForestCropOffset);

      vec3 roughMid = texture2D(uTexForestMid, clamp(forestUv, 0.0, 1.0)).rgb;
      float midLuma = dot(roughMid, vec3(0.299, 0.587, 0.114));
      float estimatedDepth = clamp(forestUv.y * 0.52 + smoothstep(0.14, 0.72, midLuma) * 0.48, 0.0, 1.0);

      float poolSpatial = smoothstep(0.45, 0.12, forestUv.y) * smoothstep(0.82, 0.36, forestUv.x);
      float poolDarkWater = smoothstep(0.28, 0.06, midLuma);
      float lowerPoolMask = poolSpatial * poolDarkWater;
      float audioPoolAmp = 1.0 + uWaterResonance * (0.35 + 0.55 * uAudioBands.w);
      float poolWave = (
        sin(forestUv.x * 78.0 + uTime * 0.85 + forestUv.y * 28.0) * 0.00028 +
        cos(forestUv.y * 108.0 - uTime * 0.60 + forestUv.x * 24.0) * 0.00014 * (1.0 + uAudioBands.y * 0.45)
      ) * lowerPoolMask * audioPoolAmp;

      float frontierPulse = rim * sin(uPortalProgress * 3.14159265);
      vec2 rippleRefraction = normalize(pVec + vec2(0.0001)) * sin(radialDist * 40.0 - uPortalProgress * 10.0) * frontierPulse * 0.012;

      vec2 parallaxOffset = uMouse * (1.0 - estimatedDepth) * 0.012;
      vec2 gentleBreathing = (screenUv - glidePivot) * ((1.0 - uPortalProgress) * 0.018);
      vec2 finalForestUv = clamp(
        forestUv - parallaxOffset - gentleBreathing + rippleRefraction + vec2(poolWave, poolWave * 1.25),
        0.002,
        0.998
      );

      vec3 rawForest = texture2D(uTexForestMid, finalForestUv).rgb;
      vec3 graded = max(rawForest, vec3(0.0));

      float bottomTextMask = smoothstep(0.42, 0.0, screenUv.y) * mix(1.0, 0.45, smoothstep(0.16, 0.86, screenUv.x));
      float topNavMask = smoothstep(0.84, 1.0, screenUv.y);
      float naturalVignette = 1.0 - bottomTextMask * 0.16 - topNavMask * 0.22;
      graded *= naturalVignette;

      float depthLag = smoothstep(estimatedDepth * 0.28, 0.55 + estimatedDepth * 0.45, uPortalProgress);
      sceneBColor = graded * mix(0.62, 1.0, depthLag);
    }

    vec3 composited = mix(sceneAColor, sceneBColor, portalMask);
    composited *= (1.0 - rim * 0.08 * sin(uPortalProgress * 3.14159265));
    composited = mix(composited, vec3(0.015, 0.019, 0.016), clamp(uDarknessVeil, 0.0, 1.0));

    gl_FragColor = vec4(composited, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export const MOTES_VERTEX_SHADER = /* glsl */ `
  attribute float aPhase;
  attribute float aScale;
  uniform float uTime;
  uniform float uOpacity;
  uniform float uPixelRatio;

  varying float vAlpha;

  void main() {
    vec3 pos = position;
    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPos;
    gl_PointSize = aScale * uPixelRatio;
    vAlpha = 0.0;
  }
`;

export const MOTES_FRAGMENT_SHADER = /* glsl */ `
  precision mediump float;
  varying float vAlpha;

  void main() {
    discard;
  }
`;
