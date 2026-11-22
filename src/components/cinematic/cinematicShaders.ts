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
  uniform float uTexAspect;
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

  // Falling leaf lake-shadow, meniscus contact & concentric impact ripples
  uniform vec2 uLeafShadowPos;
  uniform float uLeafHeightNorm;
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
      centered.x += 0.17;
    }
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
      vec2 treeUv = coverUvTree(treeScreenUv, screenAspect, uTexAspect);
      // Full-bleed when stationary, wide organic feather during downward camera pan so Image 01 dissolves seamlessly into water
      float panFeather = mix(0.06, 0.38, smoothstep(0.96, 0.42, uCamPanNormY));
      float treeVertBounds =
        smoothstep(0.015, panFeather, treeScreenUv.y) *
        (1.0 - smoothstep(0.985, 1.015, treeScreenUv.y)) *
        smoothstep(0.001, 0.018, treeUv.y) *
        (1.0 - smoothstep(0.988, 0.999, treeUv.y));
      float treeHorizBounds =
        smoothstep(0.002, 0.018, treeUv.x) *
        (1.0 - smoothstep(0.982, 0.998, treeUv.x));

      if (treeVertBounds > 0.001 && treeHorizBounds > 0.001) {
        vec2 safeTreeUv = clamp(treeUv, 0.006, 0.994);

        // Organic forest breeze across the overhanging alder foliage cluster (ramps subtly before leaf detachment)
        float foliageMask =
          smoothstep(0.36, 0.52, safeTreeUv.x) *
          (1.0 - smoothstep(0.88, 0.99, safeTreeUv.x)) *
          smoothstep(0.22, 0.34, safeTreeUv.y) *
          (1.0 - smoothstep(0.68, 0.78, safeTreeUv.y));
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

        // Trunk -> branches & dense foliage -> neighboring forest depth through natural overcast exposure
        float canopySpread = smoothstep(0.16, 0.78, safeTreeUv.x);
        float structuralMask = mix(uTrunkReveal, uBranchReveal, canopySpread);
        float effExp = clamp(uTreeExposure * (0.36 + 0.64 * structuralMask), 0.0, 1.0);

        // Documentary overcast exposure curve preserving bark crevices, moss microdetail, and natural shadow tones
        vec3 treeAdapted = pow(max(treeSample, vec3(0.0)), vec3(mix(1.55, 1.0, effExp)));
        float expGain = smoothstep(0.0, 0.92, effExp) * 1.02;

        // Very gentle peripheral falloff (zero harsh circular spotlight or heavy vignette)
        vec2 darkEdge = (treeScreenUv - vec2(0.48, 0.50)) * vec2(0.68, 0.84);
        float envFalloff = clamp(1.0 - dot(darkEdge, darkEdge) * 0.08, 0.80, 1.0);

        float mistLift = (fbm(safeTreeUv * 2.2 + vec2(uTime * 0.012, 0.0)) - 0.48) * 0.01 * effExp * smoothstep(0.45, 0.9, safeTreeUv.y);

        vec3 treeColor = (treeAdapted * expGain + max(0.0, mistLift)) * envFalloff * treeVertBounds * treeHorizBounds;
        sceneAColor = max(sceneAColor, treeColor);
      }
    }

    // A2. Dark Forest Water Surface (gradually discovered below as camera follows leaf)
    if (uLakeReady > 0.5 && uLakeVisibility > 0.001 && uPortalProgress < 0.995) {
      vec2 lakeScreenUv = screenUv + vec2(uCamPanOffsetX * 0.5, uCamPanNormY * 0.68);
      vec2 lakeUv = coverUv(lakeScreenUv, screenAspect, uTexAspect);
      float lakeVertMask =
        smoothstep(-0.05, 0.0, lakeScreenUv.y) *
        (1.0 - smoothstep(0.88, 0.994, lakeScreenUv.y)) *
        smoothstep(0.002, 0.015, lakeUv.y) *
        (1.0 - smoothstep(0.985, 0.998, lakeUv.y));
      float lakeHorizMask =
        smoothstep(0.002, 0.015, lakeUv.x) *
        (1.0 - smoothstep(0.985, 0.998, lakeUv.x));

      if (lakeVertMask > 0.001 && lakeHorizMask > 0.001) {
        lakeUv = clamp(lakeUv, 0.008, 0.992);

        // Water plane occupies lower & mid dark mirror region
        float waterZone = smoothstep(0.76, 0.40, lakeScreenUv.y);
        float skyNightFade = smoothstep(1.02, 0.64, lakeScreenUv.y);

        float waveSlope = 0.0;
        float ringHighlight = 0.0;
        float impactRippleEnvelope = 0.0;

        // 1. Quiet leaf touchdown meniscus disturbance + concentric ripples expanding outward
        if (uImpactRippleStrength > 0.005) {
          vec2 impVec = lakeScreenUv - uImpactOrigin;
          impVec.x *= screenAspect;
          impVec.y *= 1.34;
          float impDist = length(impVec);
          float distAtten = exp(-impDist * 1.85);

          // Gentle meniscus wave slope without a bright circular hotspot under the leaf
          float localMeniscus = exp(-(impDist * impDist) / 0.0018) * sin(impDist * 110.0 - uTime * 2.6) * uContactDip * 0.22;

          float front = mix(0.035, 0.86, uImpactRippleProgress);
          float band1 = impDist - front;
          float env1 = exp(-(band1 * band1) / 0.0018) * uImpactRippleStrength * distAtten;
          float band2 = impDist - max(0.0, front - 0.085);
          float env2 = exp(-(band2 * band2) / 0.0014) * uImpactRippleStrength * 0.58 * distAtten;
          float band3 = impDist - max(0.0, front - 0.165);
          float env3 = exp(-(band3 * band3) / 0.0011) * uImpactRippleStrength * 0.30 * distAtten;

          float harmonic =
            sin(band1 * 88.0) * env1 +
            sin(band2 * 108.0) * env2 +
            sin(band3 * 128.0) * env3 +
            localMeniscus;

          waveSlope += harmonic * 1.65;
          impactRippleEnvelope = clamp(env1 + env2 * 0.72 + env3 * 0.45, 0.0, 1.0);
          ringHighlight += (
            max(0.0, sin(band1 * 88.0)) * env1 * 0.55 +
            max(0.0, sin(band2 * 108.0)) * env2 * 0.35 +
            max(0.0, sin(band3 * 128.0)) * env3 * 0.20
          ) * waterZone;
        }

        // 2. Subtle water micro-current when stirred
        if (uWaterMotion > 0.01) {
          float micro1 = sin(lakeUv.x * 110.0 + uTime * 1.05 + cos(lakeUv.y * 54.0 - uTime * 0.65) * 1.1);
          float micro2 = sin(lakeUv.y * 145.0 - uTime * 0.85 + sin(lakeUv.x * 68.0 + uTime * 0.5) * 1.0);
          waveSlope += (micro1 * 0.55 + micro2 * 0.45) * 0.18 * uWaterMotion * waterZone;
        }

        // 3. Interactive click ripple anywhere on the water
        if (uRippleActive > 0.5) {
          vec2 rpVec = lakeUv - uRippleCenter;
          rpVec.x *= uTexAspect;
          rpVec.y *= 1.28;
          float rpDist = length(rpVec);
          float rpFront = uRippleAge * 0.24;
          float rpBand = rpDist - rpFront;
          float rpEnv = exp(-(rpBand * rpBand) / 0.0009) * exp(-uRippleAge * 0.85);
          float clickWave = sin(rpBand * 165.0) * rpEnv * 1.65;
          waveSlope += clickWave;
          ringHighlight += max(0.0, clickWave) * 0.28 * waterZone;
        }

        // Refract dark lake reflection strongly along concentric wave crests (physical wave distortion)
        vec2 refractedLakeUv = clamp(
          lakeUv + vec2(waveSlope * 0.0068, waveSlope * 0.0105) * waterZone,
          0.004,
          0.996
        );
        vec3 lakeSample = texture2D(uTexLake, refractedLakeUv).rgb;

        // Broad diffused overcast sky reflection across water (no localized spotlight behind leaf)
        vec2 dLight = lakeScreenUv - uLightPos;
        dLight.x *= screenAspect * 0.65;
        vec2 rLight = rotate2d(dLight, -0.22);
        float sigX = max(0.28, uLightRadius * 2.4);
        float sigY = max(0.18, uLightRadius * 1.6);
        float beam = exp(-(rLight.x * rLight.x) / (sigX * sigX) - (rLight.y * rLight.y) / (sigY * sigY)) * uLightIntensity;

        vec2 vigVec = (lakeScreenUv - vec2(0.5, 0.46)) * vec2(0.72, 0.88);
        float lakeVignette = clamp(1.0 - dot(vigVec, vigVec) * 0.18, 0.58, 1.0);

        // Soft ambient shadow cast onto water right before touchdown (never darkens water around already-settled leaf)
        vec2 shVec = (lakeScreenUv - uLeafShadowPos) * vec2(screenAspect, 1.45);
        float shadowRadius = mix(0.075, 0.20, uLeafHeightNorm);
        float shadowStrength = mix(0.45, 0.12, uLeafHeightNorm) * (1.0 - smoothstep(0.45, 0.68, uPortalProgress));
        float leafShadow = 1.0 - exp(-dot(shVec, shVec) / (shadowRadius * shadowRadius)) * shadowStrength;

        float nightLighting = (0.14 + beam * 0.24) * lakeVignette * skyNightFade * leafShadow;
        vec3 darkMirror = lakeSample * vec3(0.76, 0.86, 0.86) * nightLighting;

        // Phase 3: Forest reflections emerge inside expanding water ripples (water -> ripple -> reflection)
        vec3 rippleReflection = vec3(0.0);
        if (uForestReady > 0.5 && uReflectionIntensity > 0.005) {
          vec2 reflScreenUv = vec2(lakeScreenUv.x, 1.0 - lakeScreenUv.y * 0.85);
          vec2 reflUv = coverUv(clamp(reflScreenUv, 0.01, 0.99), screenAspect, uTexAspect);
          reflUv = clamp(reflUv + vec2(waveSlope * 0.014, waveSlope * 0.020), 0.005, 0.995);
          vec3 reflSample = texture2D(uTexForestMid, reflUv).rgb;
          float reflMask = waterZone * uReflectionIntensity * (0.32 + 0.68 * impactRippleEnvelope + ringHighlight * 0.4);
          rippleReflection = reflSample * vec3(0.72, 0.82, 0.78) * reflMask * 0.68 * lakeVignette;
        }

        // Restrained natural specular shimmer along concentric ripple crests (avoid white painted rings)
        vec3 crestTint = vec3(0.24, 0.30, 0.29);
        vec3 crestGlow = crestTint * ringHighlight * (0.08 + beam * 0.10) * lakeVignette;

        vec3 moonMist = vec3(0.05, 0.07, 0.07) * (0.08 + beam * 0.12) * waterZone * leafShadow;

        vec3 lakeColor = (darkMirror + rippleReflection + crestGlow + moonMist) * uLakeVisibility * lakeVertMask * lakeHorizMask;
        sceneAColor = max(sceneAColor, lakeColor);
      }
    }

    // =========================================================================
    // PHASE 4: RIPPLE-CARRIED CAMERA EMERGENCE (NO FBM BLOB OR GLOWING PORTAL)
    // =========================================================================
    vec2 pVec = screenUv - uImpactOrigin;
    pVec.x *= screenAspect * 0.72;
    pVec.y *= 1.18;
    float radialDist = length(pVec);
    float rippleFrontierMod = sin(radialDist * 34.0 - uPortalProgress * 11.0) * 0.032 * (1.0 - uPortalProgress);
    float frontierDist = radialDist + rippleFrontierMod;

    float threshold = mix(-0.18, 1.18, uPortalProgress);
    float portalMask = 1.0 - smoothstep(threshold - 0.32, threshold + 0.32, frontierDist);
    float rim = smoothstep(0.0, 0.5, portalMask) * (1.0 - smoothstep(0.5, 1.0, portalMask));

    // =========================================================================
    // SCENE B: Documentary Wet Forest Waterside (Continuous Foreground Pool)
    // =========================================================================
    vec3 sceneBColor = vec3(0.0196, 0.0235, 0.0196);

    if (uForestReady > 0.5 && uPortalProgress > 0.005) {
      vec2 glidePivot = vec2(0.5, 0.34);
      vec2 baseB = screenUv - glidePivot;
      baseB = rotate2d(baseB, uSettleRollRad) / max(0.5, uSettleScale) + glidePivot;
      vec2 forestUv = coverUv(baseB, screenAspect, uTexAspect);

      vec3 roughMid = texture2D(uTexForestMid, clamp(forestUv, 0.0, 1.0)).rgb;
      float midLuma = dot(roughMid, vec3(0.299, 0.587, 0.114));
      float estimatedDepth = clamp(forestUv.y * 0.52 + smoothstep(0.14, 0.72, midLuma) * 0.48, 0.0, 1.0);

      // Shallow water continuity strictly in the dark pool region (leaves shoreline mud, ferns & fallen leaves solid)
      float poolSpatial = smoothstep(0.34, 0.10, forestUv.y) * smoothstep(0.76, 0.40, forestUv.x);
      float poolDarkWater = smoothstep(0.22, 0.07, midLuma);
      float lowerPoolMask = poolSpatial * poolDarkWater;
      float poolWave = sin(forestUv.x * 84.0 + uTime * 0.9 + forestUv.y * 32.0) * 0.0016 * lowerPoolMask;
      float frontierPulse = rim * sin(uPortalProgress * 3.14159265);
      vec2 rippleRefraction = normalize(pVec + vec2(0.0001)) * sin(radialDist * 46.0 - uPortalProgress * 12.0) * frontierPulse * 0.014;

      vec2 parallaxOffset = uMouse * (1.0 - estimatedDepth) * 0.018;
      vec2 gentleBreathing = (screenUv - glidePivot) * ((1.0 - uPortalProgress) * 0.024);
      vec2 finalForestUv = clamp(forestUv - parallaxOffset - gentleBreathing + rippleRefraction + vec2(poolWave, poolWave * 1.4), 0.0, 1.0);

      vec3 midColor = texture2D(uTexForestMid, finalForestUv).rgb;
      vec2 farUv = clamp(forestUv - uMouse * 0.005, 0.0, 1.0);
      vec3 farColor = texture2D(uTexForestFar, farUv).rgb;

      // Subtle depth parallax in distant misty canopy without altering coastal color temperature
      float canopyGap = smoothstep(0.55, 0.92, midLuma) * smoothstep(0.58, 0.94, forestUv.y);
      sceneBColor = mix(midColor, farColor, canopyGap * 0.25);

      // Depth-ordered environmental reveal as camera rises out of the water reflection
      float depthLag = smoothstep(estimatedDepth * 0.28, 0.55 + estimatedDepth * 0.45, uPortalProgress);
      sceneBColor *= mix(0.62, 1.0, depthLag);
    }

    vec3 composited = mix(sceneAColor, sceneBColor, portalMask);
    composited *= (1.0 - rim * 0.10 * sin(uPortalProgress * 3.14159265));
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

    // Exact desaturated cool sage-green matching the surrounding alder leaves in old_growth_opening_4k.jpg
    vec3 sageMatch = mix(vec3(cleanLum * 1.18), cleanTex * vec3(1.18, 1.08, 1.88), 0.52) * 1.15;
    vec3 mutedOlive = mix(vec3(cleanLum), cleanTex * vec3(1.10, 0.96, 0.72), 0.48) * 0.92;
    vec3 ochreLeaf = vec3(cleanLum * 0.88, cleanLum * 0.66, cleanLum * 0.34);
    vec3 brownLeaf = vec3(cleanLum * 0.60, cleanLum * 0.38, cleanLum * 0.20);

    vec3 agedAlbedo = mix(sageMatch, mutedOlive, smoothstep(0.0, 0.36, age));
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

    // Subtle cool sky sheen near dark water surface
    float waterBounce = (1.0 - smoothstep(0.0, 0.25, uHeightNorm)) * 0.06;
    vec3 reflectedSheen = vec3(0.30, 0.34, 0.33) * (spec + waterBounce * waxyMicro * 0.20) * canopyReveal;

    vec3 finalColor = agedAlbedo * envLight + reflectedSheen;

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
