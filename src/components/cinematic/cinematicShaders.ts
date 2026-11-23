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

  uniform sampler2D uTexTree;
  uniform sampler2D uTexLake;
  uniform sampler2D uTexForestMid;
  uniform sampler2D uTexForestFar;
  uniform float uTreeReady;
  uniform float uLakeReady;
  uniform float uForestReady;

  uniform vec2 uResolution;
  uniform float uTreeTexAspect;
  uniform float uTreeCropShiftX;
  uniform float uTexAspect;
  uniform vec2 uForestCropOffset;
  uniform float uTime;
  uniform vec2 uMouse;

  // Opening Tree exposure & camera pan uniforms
  uniform float uTreeExposure;
  uniform float uTrunkReveal;
  uniform float uBranchReveal;
  uniform float uTreeBlur;
  uniform float uWindGust;
  uniform float uCamPanNormY;
  uniform float uCamPanOffsetX;
  uniform float uLakeVisibility;
  uniform float uReflectionIntensity;

  // Moving physical ambient/moonlight uniforms
  uniform vec2 uLightPos;
  uniform float uLightIntensity;
  uniform float uLightRadius;
  uniform float uWaterMotion;

  // Falling leaf lake-shadow, meniscus contact & dispersive impact ripples
  uniform vec2 uLeafShadowPos;
  uniform float uLeafHeightNorm;
  uniform float uLeafYaw;
  uniform float uLeafOpacity;
  uniform vec2 uImpactOrigin;
  uniform float uImpactRippleProgress;
  uniform float uImpactRippleStrength;
  uniform float uContactDip;

  // Click water ripple uniforms
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

  vec2 coverUvTree(vec2 uv, float targetAspect, float texAspect) {
    vec2 centered = uv - 0.5;
    if (targetAspect > texAspect) {
      centered.y *= texAspect / targetAspect;
    } else {
      centered.x *= targetAspect / texAspect;
    }
    if (targetAspect < 1.0) {
      centered.x += uTreeCropShiftX;
    }
    return centered + 0.5;
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

  float computePondWaterMask(vec2 lUv) {
    // Far shoreline edge where wet mossy bank & roots meet calm dark pool (~0.50-0.57 in rainforest_dark_pool_doc)
    float farShoreY = 0.562 - 0.048 * smoothstep(0.58, 0.96, lUv.x) - 0.024 * (1.0 - smoothstep(0.04, 0.34, lUv.x));
    float farShoreMask = smoothstep(farShoreY + 0.016, farShoreY - 0.042, lUv.y);
    // Feather bottom & horizontal borders smoothly so UV refraction never hits ClampToEdge
    float nearShoreMask = smoothstep(0.008, 0.036, lUv.y);
    float horizEdgeMask = smoothstep(0.012, 0.055, lUv.x) * (1.0 - smoothstep(0.945, 0.988, lUv.x));
    return farShoreMask * nearShoreMask * horizEdgeMask;
  }

  float evalPondHeight(vec2 lScreenUv, vec2 lUv, float screenAspect, float waterMask) {
    if (waterMask <= 0.001) return 0.0;

    // Perspective distance softening near far misty shore
    float perspScale = mix(1.0, 0.58, smoothstep(0.18, 0.56, lUv.y));
    float h = 0.0;

    // 1. Continuous ambient forest pond surface micro-undulation (four crossed wavelets)
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

    // 2. Leaf touchdown meniscus depression & dispersive capillary-gravity wave packet
    if (uImpactRippleStrength > 0.003 || uContactDip > 0.003) {
      // Leaf-aligned anisotropic meniscus depression & capillary rim directly around blade footprint
      if (uContactDip > 0.003) {
        vec2 bladeLocal = rotate2d(pondDelta, -uLeafYaw * 0.65);
        vec2 menVec = bladeLocal * vec2(0.74, 1.38);
        float mDist = length(menVec);
        float depression = -exp(-(mDist * mDist) / 0.0011) * 0.0095;
        float capRim = exp(-pow(mDist - 0.046, 2.0) / 0.00055) * 0.0048;
        float capRipple = exp(-(mDist * mDist) / 0.0065) * sin(mDist * 118.0 - uTime * 3.0) * 0.0022;
        h += (depression + capRim + capRipple) * uContactDip;
      }

      // Dispersive expanding wave packet (organic directional irregularity + cylindrical/viscous damping)
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

    // 3. Interactive click ripple (same physical dispersive wave heightfield)
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

    // 4. Stage 2: Sound becomes subtly visible inside water via coherent harmonic standing-wave interference
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

    // =========================================================================
    // SCENE A: Pure Black -> Mature Living Forest Tree -> Dark Reflective Pool
    // =========================================================================
    vec3 sceneAColor = vec3(0.0);

    // A1. Mature Living Forest Tree in Deep Evening Twilight (natural exposure progression)
    if (uTreeReady > 0.5 && uTreeExposure > 0.001 && uCamPanNormY > 0.015 && uPortalProgress < 0.995) {
      vec2 treeScreenUv = screenUv + vec2(uCamPanOffsetX, -(1.0 - uCamPanNormY) * 0.68);
      vec2 treeUv = coverUvTree(treeScreenUv, screenAspect, uTreeTexAspect);
      // Full-bleed when stationary, wide organic feather during downward camera pan so Image 01 dissolves seamlessly into water
      float panFeather = mix(0.002, 0.38, smoothstep(0.96, 0.42, uCamPanNormY));
      float treeVertBounds =
        smoothstep(0.0, panFeather, treeScreenUv.y) *
        (1.0 - smoothstep(0.996, 1.004, treeScreenUv.y)) *
        smoothstep(0.001, 0.012, treeUv.y) *
        (1.0 - smoothstep(0.988, 0.999, treeUv.y));
      float treeHorizBounds =
        smoothstep(0.002, 0.018, treeUv.x) *
        (1.0 - smoothstep(0.982, 0.998, treeUv.x));

      if (treeVertBounds > 0.001 && treeHorizBounds > 0.001) {
        vec2 safeTreeUv = clamp(treeUv, 0.006, 0.994);

        // Organic forest breeze across the overhanging leafy branch cluster (ramps subtly before leaf detachment)
        float foliageMask =
          smoothstep(0.36, 0.52, safeTreeUv.x) *
          (1.0 - smoothstep(0.92, 0.99, safeTreeUv.x)) *
          smoothstep(0.42, 0.56, safeTreeUv.y) *
          (1.0 - smoothstep(0.92, 0.99, safeTreeUv.y));
        float gustScale = 1.0 + uWindGust * 2.2;
        vec2 breezeShift = vec2(
          sin(uTime * 1.15 + safeTreeUv.y * 11.0 + safeTreeUv.x * 4.0) * 0.00085,
          cos(uTime * 0.85 + safeTreeUv.x * 9.0) * 0.00055
        ) * foliageMask * gustScale;
        vec2 sampleUv = clamp(safeTreeUv + breezeShift, 0.006, 0.994);

        vec3 treeSample = texture2D(uTexTree, sampleUv).rgb;
        if (uTreeBlur > 0.01) {
          float blurR = uTreeBlur * 0.00135;
          vec3 blurTap = (
            texture2D(uTexTree, clamp(sampleUv + vec2(blurR, 0.0), 0.006, 0.994)).rgb +
            texture2D(uTexTree, clamp(sampleUv - vec2(blurR, 0.0), 0.006, 0.994)).rgb +
            texture2D(uTexTree, clamp(sampleUv + vec2(0.0, blurR), 0.006, 0.994)).rgb +
            texture2D(uTexTree, clamp(sampleUv - vec2(0.0, blurR), 0.006, 0.994)).rgb
          ) * 0.25;
          treeSample = mix(treeSample, blurTap, 0.72);
        }

        // Trunk -> extending mossy branch & foliage -> neighboring deep forest mist
        float canopySpread = smoothstep(0.18, 0.76, safeTreeUv.x);
        float structuralMask = mix(uTrunkReveal, uBranchReveal, canopySpread);
        float effExp = clamp(uTreeExposure * (0.36 + 0.64 * structuralMask), 0.0, 1.0);

        // Documentary exposure curve preserving bark crevices, moss microdetail, and soft canopy sunbeam
        vec3 treeAdapted = pow(max(treeSample, vec3(0.0)), vec3(mix(1.45, 1.0, effExp)));
        float expGain = smoothstep(0.0, 0.92, effExp) * 0.98;

        // Very gentle peripheral falloff (zero harsh circular spotlight or heavy vignette)
        vec2 darkEdge = (treeScreenUv - vec2(0.48, 0.50)) * vec2(0.68, 0.84);
        float envFalloff = clamp(1.0 - dot(darkEdge, darkEdge) * 0.08, 0.82, 1.0);

        float mistLift = (fbm(safeTreeUv * 2.2 + vec2(uTime * 0.012, 0.0)) - 0.48) * 0.008 * effExp * smoothstep(0.45, 0.9, safeTreeUv.y);

        vec3 treeColor = (treeAdapted * expGain + max(0.0, mistLift)) * envFalloff * treeVertBounds * treeHorizBounds;
        sceneAColor = max(sceneAColor, treeColor);
      }
    }

    // A2. Physical Dark Forest Water Surface (heightfield -> finite-difference normal -> Fresnel & refraction)
    if (uLakeReady > 0.5 && uLakeVisibility > 0.001 && uPortalProgress < 0.995) {
      vec2 lakeScreenUv = screenUv + vec2(uCamPanOffsetX * 0.5, uCamPanNormY * 0.68);
      vec2 lakeUv = coverUv(lakeScreenUv, screenAspect, uTexAspect);
      float topSeamFeather = mix(0.001, 0.22, smoothstep(0.02, 0.25, uCamPanNormY));
      float lakeVertMask =
        smoothstep(-0.05, 0.0, lakeScreenUv.y) *
        (1.0 - smoothstep(1.0 - topSeamFeather, 1.005, lakeScreenUv.y)) *
        smoothstep(0.001, 0.008, lakeUv.y) *
        (1.0 - smoothstep(0.998, 1.004, lakeUv.y));
      float lakeHorizMask =
        smoothstep(0.001, 0.008, lakeUv.x) *
        (1.0 - smoothstep(0.992, 1.002, lakeUv.x));

      if (lakeVertMask > 0.001 && lakeHorizMask > 0.001) {
        lakeUv = clamp(lakeUv, 0.004, 0.996);

        float waterMask = computePondWaterMask(lakeUv);
        float skyNightFade = mix(1.0, smoothstep(1.08, 0.78, lakeScreenUv.y), smoothstep(0.02, 0.25, uCamPanNormY));

        // Compute 2D heightfield & finite-difference surface normal on the water plane
        float eps = 0.0022;
        vec2 epsX = vec2(eps / screenAspect, 0.0);
        vec2 epsY = vec2(0.0, eps);

        vec2 lakeUvX = clamp(coverUv(lakeScreenUv + epsX, screenAspect, uTexAspect), 0.004, 0.996);
        vec2 lakeUvY = clamp(coverUv(lakeScreenUv + epsY, screenAspect, uTexAspect), 0.004, 0.996);

        float hC = evalPondHeight(lakeScreenUv, lakeUv, screenAspect, waterMask);
        float hX = evalPondHeight(lakeScreenUv + epsX, lakeUvX, screenAspect, computePondWaterMask(lakeUvX));
        float hY = evalPondHeight(lakeScreenUv + epsY, lakeUvY, screenAspect, computePondWaterMask(lakeUvY));

        float slopeScale = 0.54 / eps;
        vec3 waterNormal = normalize(vec3((hC - hX) * slopeScale, (hC - hY) * slopeScale, 1.0));

        // Refract and reflect dark lake image strictly from computed surface normal N.xy
        vec2 refractShift = waterNormal.xy * vec2(0.044, 0.074) * waterMask;
        vec2 refractedLakeUv = clamp(lakeUv + refractShift, 0.004, 0.996);
        vec3 lakeSample = texture2D(uTexLake, refractedLakeUv).rgb;

        // Broad diffused overcast twilight sky field across pond basin
        vec2 dLight = lakeScreenUv - uLightPos;
        dLight.x *= screenAspect * 0.65;
        vec2 rLight = rotate2d(dLight, -0.22);
        float sigX = max(0.32, uLightRadius * 2.6);
        float sigY = max(0.20, uLightRadius * 1.8);
        float beam = exp(-(rLight.x * rLight.x) / (sigX * sigX) - (rLight.y * rLight.y) / (sigY * sigY)) * uLightIntensity;

        vec2 vigVec = (lakeScreenUv - vec2(0.5, 0.48)) * vec2(0.62, 0.78);
        float lakeVignette = clamp(1.0 - dot(vigVec, vigVec) * 0.12, 0.76, 1.0);

        // Smooth leaf shadow in approach -> tight meniscus contact occlusion directly beneath floating leaf
        vec2 shVec = rotate2d(lakeScreenUv - uLeafShadowPos, -uLeafYaw * 0.65);
        shVec.x *= screenAspect * 0.76;
        shVec.y *= 1.85;
        float shadowRadius = mix(0.036, 0.16, uLeafHeightNorm);
        float shadowStrength = mix(0.42 * uLeafOpacity, 0.14, uLeafHeightNorm) * (1.0 - smoothstep(0.45, 0.78, uPortalProgress));
        float leafShadow = 1.0 - exp(-dot(shVec, shVec) / (shadowRadius * shadowRadius)) * shadowStrength;

        // Subtle inverted water reflection of the resting leaf silhouette directly underneath the floating blade
        vec2 leafReflDelta = rotate2d(lakeScreenUv - (uLeafShadowPos - vec2(0.0, 0.022)) + waterNormal.xy * 0.012, -uLeafYaw * 0.65);
        leafReflDelta.x *= screenAspect * 0.72;
        leafReflDelta.y *= 1.95;
        float leafReflMask = exp(-dot(leafReflDelta, leafReflDelta) / (0.042 * 0.042)) * (1.0 - smoothstep(0.0, 0.14, uLeafHeightNorm)) * uLeafOpacity * waterMask;

        // Preserve natural dark tannin-rich rainforest pool shadows without crushing shore bark & ferns
        float pondExposure = mix(0.88, 0.72 + beam * 0.26, waterMask) * lakeVignette * skyNightFade * leafShadow;
        vec3 deepWaterBase = lakeSample * vec3(0.92, 0.96, 0.94) * pondExposure;
        deepWaterBase = mix(deepWaterBase, deepWaterBase * 0.58 + vec3(0.016, 0.015, 0.008), leafReflMask * 0.55);

        // Schlick Fresnel + reflected ray vertical sky tilt (refraction dominates; Fresnel gives restrained slope contrast without milky rings)
        vec3 viewDir = normalize(vec3(0.0, -0.36, 0.93));
        vec3 reflRay = reflect(-viewDir, waterNormal);
        float ndotv = clamp(dot(waterNormal, viewDir), 0.0, 1.0);
        float fresnel = 0.02 + 0.98 * pow(1.0 - ndotv, 5.0);

        float slopeSkyTilt = clamp(smoothstep(-0.15, 0.58, reflRay.y), 0.0, 1.0);
        float slopeMod = length(waterNormal.xy);
        float lakeLuma = dot(lakeSample, vec3(0.299, 0.587, 0.114));
        // Subtle contrast proportional to ambient sky/water darkness (never milky chalk rings)
        float antiMilk = mix(1.0, 0.35, smoothstep(0.08, 0.28, lakeLuma));
        vec3 waveSkyMod = mix(vec3(-0.012, -0.012, -0.012), vec3(0.032, 0.040, 0.038), slopeSkyTilt) * smoothstep(0.03, 0.30, slopeMod) * antiMilk * waterMask * lakeVignette;

        // Restrained directional sky-gap specular catchlight strictly on steepest wave facets
        vec3 skyGapDir = normalize(vec3((uLightPos.x - 0.5) * 0.45, 0.62, 0.75));
        vec3 halfVec = normalize(skyGapDir + viewDir);
        float waveSlopeCatch = pow(max(0.0, dot(waterNormal, halfVec)), 42.0);
        vec3 specularGlint = vec3(0.056, 0.068, 0.066) * waveSlopeCatch * smoothstep(0.06, 0.28, slopeMod) * antiMilk * waterMask * (0.20 + beam * 0.28) * lakeVignette;

        // Subtle cool misty overcast reflection lift modulated physically by Fresnel
        vec3 skyFresnelTint = vec3(0.042, 0.054, 0.052) * fresnel * waterMask * (0.45 + beam * 0.55) * lakeVignette * leafShadow;

        // Stage 2-3: Coherent inverted rainforest reflections emerge inside pond water & distort unifiedly with waterNormal
        vec3 pondReflection = vec3(0.0);
        if (uForestReady > 0.5 && uReflectionIntensity > 0.005) {
          vec2 reflScreenUv = vec2(lakeScreenUv.x, 1.0 - lakeScreenUv.y * 0.85);
          vec2 reflUv = coverUv(clamp(reflScreenUv, 0.02, 0.98), screenAspect, uTexAspect);
          reflUv = clamp(reflUv + waterNormal.xy * vec2(0.064, 0.098), 0.015, 0.985);
          vec3 reflSample = texture2D(uTexForestMid, reflUv).rgb;
          // Tone-match to damp mossy coastal forest pool so reflection feels physically inside the same valley
          float reflLuma = dot(reflSample, vec3(0.299, 0.587, 0.114));
          vec3 valleyRefl = mix(vec3(reflLuma), reflSample, 0.52) * vec3(0.50, 0.60, 0.52);
          float lakeOpenMask = smoothstep(0.03, 0.22, lakeLuma);
          float reflFresnel = mix(0.28, 1.0, fresnel);
          float reflMask = waterMask * uReflectionIntensity * reflFresnel * mix(0.35, 1.0, lakeOpenMask) * leafShadow;
          pondReflection = valleyRefl * reflMask * 0.54 * lakeVignette;
        }

        // Stage 3: Reflected forest organizes gently into crisp hydrological interference filaments (zero blurry blobs)
        vec3 acousticTopoGlow = vec3(0.0);
        if (uAcousticTopography > 0.003) {
          float reflLum = dot(pondReflection + lakeSample * 0.35, vec3(0.299, 0.587, 0.114));
          vec2 waveCenter = lakeScreenUv - uImpactOrigin;
          waveCenter.x *= screenAspect * 0.72;
          waveCenter.y *= 1.65;
          float radialW = length(waveCenter);

          // Razor-fine concentric & cross-shoreline iso-phase filaments locked to physical pond surface height hC
          float phaseRing = sin(radialW * 34.0 - uTime * 1.15 + hC * 280.0 + reflLum * 2.4);
          float thinRing = (1.0 - smoothstep(0.0, 0.055, abs(phaseRing))) * exp(-radialW * 1.45);
          float shoreWavePhase = sin((lakeScreenUv.y * 18.0 + sin(lakeScreenUv.x * 7.5 + uTime * 0.38) * 0.35 + hC * 220.0) * 3.14159265);
          float thinShoreLine = (1.0 - smoothstep(0.0, 0.052, abs(shoreWavePhase))) * smoothstep(0.04, 0.24, reflLum);

          float filamentEnergy = (thinRing * 0.58 + thinShoreLine * 0.52) * smoothstep(0.02, 0.16, slopeMod * 0.45 + reflLum);
          vec3 topoTint = mix(vec3(0.48, 0.58, 0.44), vec3(0.76, 0.78, 0.70), clamp(uAudioBands.z, 0.0, 1.0));
          acousticTopoGlow = topoTint * filamentEnergy * waterMask * uAcousticTopography * (0.16 + 0.14 * uAudioBands.w) * lakeVignette;
        }

        vec3 lakeColor = max(vec3(0.0), deepWaterBase + skyFresnelTint + waveSkyMod + specularGlint + pondReflection + acousticTopoGlow) * uLakeVisibility * lakeVertMask * lakeHorizMask;
        sceneAColor = max(sceneAColor, lakeColor);
      }
    }

    // =========================================================================
    // STAGE 3->4: REFLECTION-GUIDED HORIZON & TOPOGRAPHIC EMERGENCE (ZERO PORTAL BLOB)
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
    // SCENE B: Documentary Wet Forest Waterside (Continuous Foreground Pool)
    // =========================================================================
    vec3 sceneBColor = vec3(0.0196, 0.0235, 0.0196);

    if (uForestReady > 0.5 && uPortalProgress > 0.005) {
      vec2 glidePivot = vec2(0.5, 0.34);
      vec2 baseB = screenUv - glidePivot;
      float settleBreath = 1.0 + sin(uTime * 0.24) * 0.0018 * smoothstep(0.85, 1.0, uPortalProgress);
      baseB = rotate2d(baseB, uSettleRollRad) / max(0.5, uSettleScale * settleBreath) + glidePivot;
      vec2 forestUv = coverUvForest(baseB, screenAspect, uTexAspect, uForestCropOffset);

      vec3 roughMid = texture2D(uTexForestMid, clamp(forestUv, 0.0, 1.0)).rgb;
      float midLuma = dot(roughMid, vec3(0.299, 0.587, 0.114));
      float estimatedDepth = clamp(forestUv.y * 0.52 + smoothstep(0.14, 0.72, midLuma) * 0.48, 0.0, 1.0);

      // Shallow water continuity strictly in the dark pool region (leaves shoreline mud, ferns & fallen leaves solid)
      float poolSpatial = smoothstep(0.35, 0.08, forestUv.y) * smoothstep(0.76, 0.36, forestUv.x);
      float poolDarkWater = smoothstep(0.23, 0.06, midLuma);
      float lowerPoolMask = poolSpatial * poolDarkWater;
      float audioPoolAmp = 1.0 + uWaterResonance * (0.45 + 0.85 * uAudioBands.w);
      float poolWave = (
        sin(forestUv.x * 84.0 + uTime * 0.85 + forestUv.y * 32.0) * 0.0014 +
        cos(forestUv.y * 120.0 - uTime * 0.60 + forestUv.x * 26.0) * 0.00055 * (1.0 + uAudioBands.y * 0.65)
      ) * lowerPoolMask * audioPoolAmp;
      float mistDriftMask = smoothstep(0.55, 0.92, forestUv.y) * smoothstep(0.35, 0.78, midLuma);
      vec2 mistBreath = vec2(
        sin(uTime * 0.42 + forestUv.y * 4.5) * 0.00045,
        cos(uTime * 0.31 + forestUv.x * 3.8) * 0.00025
      ) * mistDriftMask;

      float frontierPulse = rim * sin(uPortalProgress * 3.14159265);
      vec2 rippleRefraction = normalize(pVec + vec2(0.0001)) * sin(radialDist * 40.0 - uPortalProgress * 10.0) * frontierPulse * 0.012;

      vec2 parallaxOffset = uMouse * (1.0 - estimatedDepth) * 0.016;
      vec2 gentleBreathing = (screenUv - glidePivot) * ((1.0 - uPortalProgress) * 0.024);
      vec2 finalForestUv = clamp(
        forestUv - parallaxOffset - gentleBreathing + rippleRefraction + mistBreath + vec2(poolWave, poolWave * 1.35),
        0.002,
        0.998
      );

      vec3 midColor = texture2D(uTexForestMid, finalForestUv).rgb;
      vec2 farUv = clamp(forestUv - uMouse * 0.005 + mistBreath * 1.4, 0.002, 0.998);
      vec3 farColor = texture2D(uTexForestFar, farUv).rgb;

      // Subtle depth parallax in distant misty canopy without altering coastal ecosystem realism
      float canopyGap = smoothstep(0.55, 0.92, midLuma) * smoothstep(0.58, 0.94, forestUv.y);
      vec3 rawForest = mix(midColor, farColor, canopyGap * 0.25);

      // Restrained cinematic exposure & tonal grade:
      // Deeper, cooler-balanced temperate forest & water continuity for EcoSonic without crushing shadow bark/moss/water detail.
      vec3 graded = max(rawForest, vec3(0.0));
      graded = graded / (vec3(1.0) + graded * 0.34);
      graded *= vec3(0.84, 0.90, 0.89);
      graded = pow(graded, vec3(1.10)) * 0.85 + vec3(0.007, 0.010, 0.008);

      // Clean undulating dark water pool (no artificial static contour loops behind foreground typography)
      graded += vec3(0.016, 0.022, 0.018) * max(0.0, poolWave * 180.0) * lowerPoolMask * uWaterResonance;

      // Localized exposure falloff where UI typography & header sit (forest & water stay rich and clearly visible)
      float bottomTextMask = smoothstep(0.46, 0.0, screenUv.y) * mix(1.0, 0.42, smoothstep(0.16, 0.86, screenUv.x));
      float topNavMask = smoothstep(0.82, 1.0, screenUv.y);
      float naturalVignette = 1.0 - bottomTextMask * 0.22 - topNavMask * 0.28;
      graded *= naturalVignette;

      // Depth-ordered environmental reveal as camera rises out of the water reflection
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

export const LEAF_VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uFallFlutter;
  uniform float uHeightNorm;
  uniform float uContactDip;

  varying vec2 vUv;
  varying vec3 vModelPos;
  varying vec3 vWorldNormal;

  void main() {
    vUv = uv;
    vec3 pos = position;

    // 3D botanical leaf camber along midrib & margins, plus gentle aerodynamic flex in air (relaxes on water)
    float dx = uv.x - 0.5;
    float dy = uv.y - 0.5;
    float airWeight = 0.18 + 0.82 * clamp(uHeightNorm, 0.0, 1.0);
    float camber = (0.048 * cos(dx * 3.14159265) - 0.056 * (dy * dy * 4.0)) * airWeight;
    float twist = (uv.x - 0.1) * dy * sin(uTime * 2.1 + uv.x * 3.4) * 0.14 * uFallFlutter;
    float flutter = sin(uTime * 2.6 + uv.x * 5.8 + uv.y * 2.8) * 0.018 * uFallFlutter;
    // Slight elastic flex downward at the water meniscus touch
    float meniscusFlex = (0.025 * (dx * dx * 4.0) - 0.015) * uContactDip;

    pos.z += camber + twist + flutter + meniscusFlex;

    // Analytical local normal from camber + flex so turning away from overhead canopy light darkens naturally
    float dzdx = -0.048 * 3.14159265 * sin(dx * 3.14159265) * airWeight +
                 dy * sin(uTime * 2.1 + uv.x * 3.4) * 0.14 * uFallFlutter;
    float dzdy = -0.448 * dy * airWeight +
                 (uv.x - 0.1) * sin(uTime * 2.1 + uv.x * 3.4) * 0.14 * uFallFlutter;
    vec3 localNormal = normalize(vec3(-dzdx, -dzdy, 1.0));
    vWorldNormal = normalize(normalMatrix * localNormal);

    vModelPos = pos;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

export const LEAF_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform sampler2D uTexLeaf;
  uniform float uLeafReady;
  uniform float uOpacity;
  uniform float uTreeExposure;
  uniform float uLightIntensity;
  uniform float uHeightNorm;
  uniform float uColorAging;
  uniform float uSubsurface;
  uniform float uLeafSoftness;
  uniform float uCanopyPatchLight;

  varying vec2 vUv;
  varying vec3 vModelPos;
  varying vec3 vWorldNormal;

  void main() {
    if (uLeafReady < 0.5 || uOpacity <= 0.005) discard;

    vec2 texStep = vec2(1.0 / 960.0, 1.0 / 540.0);
    vec3 texelSharp = texture2D(uTexLeaf, vUv).rgb;

    // Clean botanical silhouette keying against matte black without leaving a dark outline halo
    float channelMax = max(texelSharp.g, max(texelSharp.r, texelSharp.b));
    float greenEnergy = texelSharp.g * 1.12 + texelSharp.r * 0.58;
    float edgeCov = smoothstep(0.075, 0.165, max(channelMax, greenEnergy * 0.62));
    float alpha = edgeCov * uOpacity;
    if (alpha <= 0.02) discard;

    vec3 tapL = texture2D(uTexLeaf, clamp(vUv - vec2(texStep.x * 1.3, 0.0), 0.0, 1.0)).rgb;
    vec3 tapR = texture2D(uTexLeaf, clamp(vUv + vec2(texStep.x * 1.3, 0.0), 0.0, 1.0)).rgb;
    vec3 tapD = texture2D(uTexLeaf, clamp(vUv - vec2(0.0, texStep.y * 1.3), 0.0, 1.0)).rgb;
    vec3 tapU = texture2D(uTexLeaf, clamp(vUv + vec2(0.0, texStep.y * 1.3), 0.0, 1.0)).rgb;

    float wL = step(0.08, max(tapL.g, tapL.r));
    float wR = step(0.08, max(tapR.g, tapR.r));
    float wD = step(0.08, max(tapD.g, tapD.r));
    float wU = step(0.08, max(tapU.g, tapU.r));
    float wSum = 1.0 + (wL + wR + wD + wU) * 0.45;
    vec3 texelSoft = (texelSharp + (tapL * wL + tapR * wR + tapD * wD + tapU * wU) * 0.45) / wSum;

    // Match mid-distance branch optical softness on attachment, then enter crisp cinema focus during fall
    vec3 texel = mix(texelSharp, texelSoft, clamp(uLeafSoftness, 0.0, 1.0));
    // Un-premultiply edge pixels so serrated borders never show a black halo
    vec3 cleanTex = texel / mix(1.0, max(0.55, edgeCov), 0.78);
    float cleanLum = dot(cleanTex, vec3(0.299, 0.587, 0.114));

    float lumC = dot(texelSharp, vec3(0.299, 0.587, 0.114));
    float lumL = wL > 0.5 ? dot(tapL, vec3(0.299, 0.587, 0.114)) : lumC;
    float lumR = wR > 0.5 ? dot(tapR, vec3(0.299, 0.587, 0.114)) : lumC;
    float lumD = wD > 0.5 ? dot(tapD, vec3(0.299, 0.587, 0.114)) : lumC;
    float lumU = wU > 0.5 ? dot(tapU, vec3(0.299, 0.587, 0.114)) : lumC;

    // Gradual botanical color transformation:
    // Cool muted alder sage-green (matches old_growth_opening_4k foliage) -> olive -> desaturated ochre -> damp autumn brown
    float marginBias = smoothstep(0.16, 0.58, length((vUv - vec2(0.52, 0.50)) * vec2(0.82, 1.18)));
    float age = clamp(uColorAging * (0.90 + 0.20 * marginBias), 0.0, 1.0);

    // Vein relief preserves natural botanical microdetail without oversharpening
    float avgNeighbor = (lumL + lumR + lumD + lumU) * 0.25;
    float veinCrevice = clamp((avgNeighbor - lumC) * 6.5, 0.0, 0.22);

    // Exact natural mossy-branch sunlit green matching the surrounding wet foliage on mossy_branch_opening
    vec3 branchGreen = mix(vec3(cleanLum * 0.90), cleanTex * vec3(0.92, 1.04, 0.44), 0.72) * 0.92;
    vec3 mutedOlive = mix(vec3(cleanLum), cleanTex * vec3(1.06, 0.96, 0.64), 0.52) * 0.88;
    vec3 ochreLeaf = vec3(cleanLum * 0.88, cleanLum * 0.66, cleanLum * 0.34);
    vec3 brownLeaf = vec3(cleanLum * 0.60, cleanLum * 0.38, cleanLum * 0.20);

    vec3 agedAlbedo = mix(branchGreen, mutedOlive, smoothstep(0.0, 0.36, age));
    agedAlbedo = mix(agedAlbedo, ochreLeaf, smoothstep(0.32, 0.72, age));
    agedAlbedo = mix(agedAlbedo, brownLeaf, smoothstep(0.68, 1.0, age));
    agedAlbedo *= (1.0 - veinCrevice * (0.36 - uLeafSoftness * 0.16));

    // 3D orientation + relief normal obeying overhead overcast forest lighting
    vec3 microN = normalize(vec3((lumL - lumR) * 4.5, (lumD - lumU) * 4.5, 1.0));
    vec3 surfN = normalize(mix(normalize(vWorldNormal), microN, 0.28));
    vec3 skyLightDir = normalize(vec3(0.06, 0.84, 0.54));
    float ndotl = dot(surfN, skyLightDir);
    // While attached on branch, matches ambient overcast canopy brightness; during fall, turning away from sky darkens naturally
    float fallMotion = 1.0 - smoothstep(0.65, 1.0, uHeightNorm);
    float directional = mix(1.0, clamp(0.46 + 0.54 * max(0.0, ndotl), 0.30, 1.08), fallMotion * 0.85);

    vec3 halfVec = normalize(skyLightDir + vec3(0.0, 0.0, 1.0));
    float waxyMicro = smoothstep(0.18, 0.50, cleanLum);
    float spec = pow(max(0.0, dot(surfN, halfVec)), 22.0) * waxyMicro * (0.04 + uLightIntensity * 0.10);

    // Obey tree reveal exposure at start, then ambient canopy lighting & dappled canopy openings during fall
    float canopyReveal = smoothstep(0.0, 0.92, uTreeExposure);
    float baseAmb = mix(1.0, 0.55 + 0.45 * uLightIntensity, fallMotion);
    float envLight = baseAmb * directional * uCanopyPatchLight * canopyReveal;

    // Subtle warm backlit translucency on the sunlit branch + cool sky sheen near dark water surface
    float waterBounce = (1.0 - smoothstep(0.0, 0.25, uHeightNorm)) * 0.06;
    vec3 sunTranslucency = vec3(0.24, 0.32, 0.04) * uSubsurface * (0.45 + 0.55 * waxyMicro) * canopyReveal;
    vec3 reflectedSheen = vec3(0.30, 0.34, 0.32) * (spec + waterBounce * waxyMicro * 0.20) * canopyReveal;

    vec3 finalColor = agedAlbedo * envLight + sunTranslucency + reflectedSheen;

    gl_FragColor = vec4(finalColor, alpha);
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
