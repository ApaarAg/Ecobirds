import * as THREE from 'three';
import {
  buildLeafGeometryBuffers,
  evalLeafVeinField,
} from '../../lib/leafGeometry';

export interface PhysicalLeafUniforms {
  uTime: { value: number };
  uFallFlutter: { value: number };
  uOpacity: { value: number };
  uTreeExposure: { value: number };
  uLightIntensity: { value: number };
  uHeightNorm: { value: number };
  uColorAging: { value: number };
  uSubsurface: { value: number };
  uContactDip: { value: number };
  uLeafSoftness: { value: number };
  uCanopyPatchLight: { value: number };
}

export interface PhysicalLeafBundle {
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  material: THREE.MeshPhysicalMaterial;
  uniforms: PhysicalLeafUniforms;
  dispose: () => void;
}

function fract(x: number): number {
  return x - Math.floor(x);
}

function hash2(x: number, y: number): number {
  return fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453123);
}

function valueNoise2D(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm2D(x: number, y: number): number {
  let v = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < 4; i++) {
    v += amp * valueNoise2D(x * freq, y * freq);
    freq *= 2.03;
    amp *= 0.5;
  }
  return v;
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

interface BotanicalCanvases {
  albedoCanvas: HTMLCanvasElement;
  normalCanvas: HTMLCanvasElement;
  roughnessCanvas: HTMLCanvasElement;
}

function createBotanicalCanvases(width = 768, height = 384): BotanicalCanvases {
  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = width;
  albedoCanvas.height = height;
  const normalCanvas = document.createElement('canvas');
  normalCanvas.width = width;
  normalCanvas.height = height;
  const roughnessCanvas = document.createElement('canvas');
  roughnessCanvas.width = width;
  roughnessCanvas.height = height;

  const aCtx = albedoCanvas.getContext('2d')!;
  const nCtx = normalCanvas.getContext('2d')!;
  const rCtx = roughnessCanvas.getContext('2d')!;

  const aImg = aCtx.createImageData(width, height);
  const nImg = nCtx.createImageData(width, height);
  const rImg = rCtx.createImageData(width, height);

  const heightField = new Float32Array(width * height);

  for (let py = 0; py < height; py++) {
    const v = 1 - py / (height - 1);
    for (let px = 0; px < width; px++) {
      const u = px / (width - 1);
      const pIdx = py * width + px;
      const off = pIdx * 4;

      if (u < 0.23) {
        // Petiole stem region (fibrous woody-olive gradient)
        const stemT = Math.max(0, Math.min(1, (u - 0.02) / 0.2));
        const fiber = Math.sin(v * 140 + fbm2D(u * 18, v * 12) * 3.5) * 0.5 + 0.5;
        const grain = fbm2D(u * 32, v * 28);
        const rBase = 58 + stemT * 20 + fiber * 12 + (grain - 0.5) * 14;
        const gBase = 74 + stemT * 28 + fiber * 14 + (grain - 0.5) * 14;
        const bBase = 24 + stemT * 8 + fiber * 5;

        aImg.data[off] = clampByte(rBase);
        aImg.data[off + 1] = clampByte(gBase);
        aImg.data[off + 2] = clampByte(bBase);
        aImg.data[off + 3] = 255;

        heightField[pIdx] = fiber * 0.18 + grain * 0.14;
        rImg.data[off] = rImg.data[off + 1] = rImg.data[off + 2] = clampByte(168 + grain * 30);
        rImg.data[off + 3] = 255;
      } else {
        // Blade lamina region mapped cleanly from s = [0,1], w = [-1,1]
        const s = Math.max(0, Math.min(1, (u - 0.24) / 0.74));
        const w = Math.max(-1, Math.min(1, (v - 0.5) / 0.44));
        const absW = Math.abs(w);

        const { midribFactor, lateralVeinFactor } = evalLeafVeinField(s, w);
        const macroPatch = fbm2D(s * 6.5 + 1.3, w * 5.2 + 4.1);
        const microCell = fbm2D(s * 42.0, w * 36.0);
        const reticWave = Math.abs(
          Math.sin(s * 95 + macroPatch * 4.5) * Math.cos(w * 72 + microCell * 3.5)
        );
        const reticVein = Math.pow(1 - reticWave, 5.0) * 0.35;

        // Calibrated to the rich wet beech/alder leaves on mossy_branch_opening.jpg
        let rCol = 32 + macroPatch * 18 + (microCell - 0.5) * 14;
        let gCol = 58 + macroPatch * 24 + (microCell - 0.5) * 16;
        let bCol = 9 + macroPatch * 6 + (microCell - 0.5) * 6;

        // Subtle warm chlorophyll gradient toward outer margins & apex
        const marginWarm = smoothstep(0.65, 0.98, absW) * (0.6 + 0.4 * s);
        rCol += marginWarm * 11;
        gCol += marginWarm * 9;

        // Slightly paler yellow-green midrib & curved lateral veins with subtle shaded vein furrow edge
        const veinBlend = Math.min(1, midribFactor * 0.92 + lateralVeinFactor * 0.68 + reticVein * 0.22);
        rCol = rCol * (1 - veinBlend) + 74 * veinBlend;
        gCol = gCol * (1 - veinBlend) + 102 * veinBlend;
        bCol = bCol * (1 - veinBlend) + 22 * veinBlend;

        // Occasional tiny organic leaf fleck
        const fleckNoise = fbm2D(s * 24 + 9.2, w * 24 + 3.7);
        if (fleckNoise > 0.78) {
          const fAmt = (fleckNoise - 0.78) * 2.1;
          rCol = rCol * (1 - fAmt * 0.35) + 64 * (fAmt * 0.35);
          gCol = gCol * (1 - fAmt * 0.35) + 56 * (fAmt * 0.35);
        }

        aImg.data[off] = clampByte(rCol);
        aImg.data[off + 1] = clampByte(gCol);
        aImg.data[off + 2] = clampByte(bCol);
        aImg.data[off + 3] = 255;

        // Heightfield for normal map (crisp vein relief + cellular micro-dimples)
        heightField[pIdx] =
          midribFactor * 0.85 +
          lateralVeinFactor * 0.52 +
          reticVein * 0.16 +
          (microCell - 0.5) * 0.15;

        // Roughness: damp glossy cuticle patches ~0.28..0.40 on adaxial top, veins ~0.52
        const rough = 76 + microCell * 24 + (1 - macroPatch) * 16 + veinBlend * 36;
        const rByte = clampByte(rough);
        rImg.data[off] = rByte;
        rImg.data[off + 1] = rByte;
        rImg.data[off + 2] = rByte;
        rImg.data[off + 3] = 255;
      }
    }
  }

  // Convert scalar heightfield to tangent-space normal map
  const strength = 4.6;
  for (let py = 0; py < height; py++) {
    const pyUp = Math.max(0, py - 1);
    const pyDn = Math.min(height - 1, py + 1);
    for (let px = 0; px < width; px++) {
      const pxL = Math.max(0, px - 1);
      const pxR = Math.min(width - 1, px + 1);

      const hL = heightField[py * width + pxL];
      const hR = heightField[py * width + pxR];
      const hU = heightField[pyUp * width + px];
      const hD = heightField[pyDn * width + px];

      const dx = (hL - hR) * strength;
      const dy = (hD - hU) * strength;
      const dz = 1.0;
      const invLen = 1 / Math.hypot(dx, dy, dz);

      const off = (py * width + px) * 4;
      nImg.data[off] = clampByte((dx * invLen * 0.5 + 0.5) * 255);
      nImg.data[off + 1] = clampByte((dy * invLen * 0.5 + 0.5) * 255);
      nImg.data[off + 2] = clampByte((dz * invLen * 0.5 + 0.5) * 255);
      nImg.data[off + 3] = 255;
    }
  }

  aCtx.putImageData(aImg, 0, 0);
  nCtx.putImageData(nImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);

  return { albedoCanvas, normalCanvas, roughnessCanvas };
}

/**
 * Safely blends interior photographic cellular micro-detail from green_forest_leaf into
 * our UV-registered albedo canvas without ever sampling black background pixels.
 */
function blendPhotoMicroDetail(
  albedoCanvas: HTMLCanvasElement,
  img: HTMLImageElement
): boolean {
  const w = albedoCanvas.width;
  const h = albedoCanvas.height;
  const scratch = document.createElement('canvas');
  scratch.width = img.naturalWidth || 512;
  scratch.height = img.naturalHeight || 288;
  const sCtx = scratch.getContext('2d');
  if (!sCtx || scratch.width < 16 || scratch.height < 16) return false;

  sCtx.drawImage(img, 0, 0, scratch.width, scratch.height);
  const srcData = sCtx.getImageData(0, 0, scratch.width, scratch.height).data;

  const aCtx = albedoCanvas.getContext('2d');
  if (!aCtx) return false;
  const dstImg = aCtx.getImageData(0, 0, w, h);
  const dstData = dstImg.data;

  for (let py = 0; py < h; py++) {
    const v = 1 - py / (h - 1);
    for (let px = 0; px < w; px++) {
      const u = px / (w - 1);
      if (u < 0.24) continue;
      const s = Math.max(0, Math.min(1, (u - 0.24) / 0.74));
      const wNorm = Math.max(-1, Math.min(1, (v - 0.5) / 0.44));

      // Map safely inside the interior green blade of green_forest_leaf_1795360418647.jpg
      const srcU = 0.36 + s * 0.48;
      const srcV = 0.50 - wNorm * 0.20 * (1 - Math.abs(s - 0.45) * 0.55);
      const sx = Math.min(scratch.width - 1, Math.max(0, Math.round(srcU * (scratch.width - 1))));
      const sy = Math.min(scratch.height - 1, Math.max(0, Math.round(srcV * (scratch.height - 1))));
      const sOff = (sy * scratch.width + sx) * 4;

      const sr = srcData[sOff];
      const sg = srcData[sOff + 1];
      const sb = srcData[sOff + 2];
      // Strict green-interior guard: skip any dark or border pixel
      if (sg < 55 || sg <= sb * 1.15) continue;

      const lum = (0.299 * sr + 0.587 * sg + 0.114 * sb) / 110;
      const grainFactor = Math.max(0.84, Math.min(1.18, 0.88 + lum * 0.12));

      const dOff = (py * w + px) * 4;
      dstData[dOff] = clampByte(dstData[dOff] * grainFactor);
      dstData[dOff + 1] = clampByte(dstData[dOff + 1] * grainFactor);
      dstData[dOff + 2] = clampByte(dstData[dOff + 2] * grainFactor);
    }
  }

  aCtx.putImageData(dstImg, 0, 0);
  return true;
}

export function createPhysicalLeafBundle(
  maxAnisotropy: number,
  leafPhotoUrl: string,
  onTextureUpdated: () => void
): PhysicalLeafBundle {
  const geoData = buildLeafGeometryBuffers(56, 14);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(geoData.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(geoData.normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(geoData.uvs, 2));
  geometry.setAttribute('aLeafPart', new THREE.BufferAttribute(geoData.leafParts, 1));
  geometry.setAttribute('aThickness', new THREE.BufferAttribute(geoData.thicknesses, 1));
  geometry.setAttribute('aBladeCoord', new THREE.BufferAttribute(geoData.bladeCoords, 2));
  geometry.setIndex(new THREE.BufferAttribute(geoData.indices, 1));
  geometry.computeTangents();
  geometry.computeBoundingSphere();

  const { albedoCanvas, normalCanvas, roughnessCanvas } = createBotanicalCanvases(768, 384);
  const aniso = Math.min(8, Math.max(1, maxAnisotropy));

  const albedoTex = new THREE.CanvasTexture(albedoCanvas);
  albedoTex.colorSpace = THREE.SRGBColorSpace;
  albedoTex.anisotropy = aniso;
  albedoTex.wrapS = THREE.ClampToEdgeWrapping;
  albedoTex.wrapT = THREE.ClampToEdgeWrapping;
  albedoTex.needsUpdate = true;

  const normalTex = new THREE.CanvasTexture(normalCanvas);
  normalTex.colorSpace = THREE.NoColorSpace;
  normalTex.anisotropy = aniso;
  normalTex.wrapS = THREE.ClampToEdgeWrapping;
  normalTex.wrapT = THREE.ClampToEdgeWrapping;
  normalTex.needsUpdate = true;

  const roughnessTex = new THREE.CanvasTexture(roughnessCanvas);
  roughnessTex.colorSpace = THREE.NoColorSpace;
  roughnessTex.anisotropy = aniso;
  roughnessTex.wrapS = THREE.ClampToEdgeWrapping;
  roughnessTex.wrapT = THREE.ClampToEdgeWrapping;
  roughnessTex.needsUpdate = true;

  let cancelled = false;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    if (cancelled) return;
    if (blendPhotoMicroDetail(albedoCanvas, img)) {
      albedoTex.needsUpdate = true;
      onTextureUpdated();
    }
  };
  img.src = leafPhotoUrl;

  const uniforms: PhysicalLeafUniforms = {
    uTime: { value: 0 },
    uFallFlutter: { value: 0.14 },
    uOpacity: { value: 0 },
    uTreeExposure: { value: 0 },
    uLightIntensity: { value: 0.58 },
    uHeightNorm: { value: 1 },
    uColorAging: { value: 0 },
    uSubsurface: { value: 0.22 },
    uContactDip: { value: 0 },
    uLeafSoftness: { value: 0.52 },
    uCanopyPatchLight: { value: 1.0 },
  };

  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: albedoTex,
    normalMap: normalTex,
    normalScale: new THREE.Vector2(1.35, 1.35),
    roughnessMap: roughnessTex,
    roughness: 1.0,
    metalness: 0.0,
    clearcoat: 0.34,
    clearcoatRoughness: 0.32,
    ior: 1.46,
    transparent: true,
    opacity: 1.0,
    depthWrite: true,
    side: THREE.FrontSide,
  });

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aLeafPart;
        attribute float aThickness;
        attribute vec2 aBladeCoord;
        uniform float uTime;
        uniform float uFallFlutter;
        uniform float uContactDip;
        varying float vLeafPart;
        varying float vThickness;
        varying vec2 vBladeCoord;
        varying vec3 vLeafWorldPos;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vLeafPart = aLeafPart;
        vThickness = aThickness;
        vBladeCoord = aBladeCoord;

        float bladeFlex = smoothstep(0.02, 0.28, aBladeCoord.x);
        float flutterWave = sin(uTime * 2.45 + aBladeCoord.x * 5.0 + aBladeCoord.y * 2.5) * 0.015 * uFallFlutter;
        float aeroTorsion = aBladeCoord.y * sin(uTime * 1.9 + aBladeCoord.x * 2.6) * 0.048 * uFallFlutter;
        float meniscusCurve = (0.026 * aBladeCoord.x * aBladeCoord.x - 0.012) * uContactDip;
        transformed.z += (flutterWave + aeroTorsion + meniscusCurve) * bladeFlex;`
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vLeafWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uOpacity;
        uniform float uTreeExposure;
        uniform float uLightIntensity;
        uniform float uHeightNorm;
        uniform float uColorAging;
        uniform float uSubsurface;
        uniform float uLeafSoftness;
        uniform float uCanopyPatchLight;
        varying float vLeafPart;
        varying float vThickness;
        varying vec2 vBladeCoord;
        varying vec3 vLeafWorldPos;`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // Botanical dual-surface contrast: abaxial underside is slightly paler & cooler matte sage
        float undersideMask = smoothstep(0.2, -0.65, vLeafPart);
        vec3 undersideTint = diffuseColor.rgb * vec3(1.18, 1.24, 1.18) + vec3(0.008, 0.012, 0.007);
        diffuseColor.rgb = mix(diffuseColor.rgb, undersideTint, undersideMask * 0.76);

        // Restrained progression: deep forest green -> muted olive -> subtle warm olive-ochre along edges (never bright tan)
        float marginLead = smoothstep(0.28, 0.96, max(abs(vBladeCoord.y), smoothstep(0.55, 1.0, vBladeCoord.x)));
        float age = clamp(uColorAging * (0.82 + 0.18 * marginLead), 0.0, 1.0);
        float baseLuma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        vec3 mutedOlive = mix(diffuseColor.rgb, vec3(baseLuma * 0.95, baseLuma * 0.90, baseLuma * 0.42), 0.54);
        vec3 subtleOchre = mix(mutedOlive, vec3(baseLuma * 1.12, baseLuma * 0.85, baseLuma * 0.34), 0.46 + 0.32 * marginLead);

        vec3 agedAlbedo = mix(diffuseColor.rgb, mutedOlive, smoothstep(0.0, 0.48, age));
        agedAlbedo = mix(agedAlbedo, subtleOchre, smoothstep(0.45, 1.0, age));
        diffuseColor.rgb = agedAlbedo;`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        // Waxy damp adaxial cuticle (~0.32..0.42) vs fibrous matte abaxial underside (~0.82) vs petiole (~0.68)
        float abaxialWeight = smoothstep(0.15, -0.65, vLeafPart);
        float petioleWeight = 1.0 - smoothstep(0.0, 0.35, abs(vLeafPart));
        roughnessFactor = mix(roughnessFactor, 0.82, abaxialWeight * 0.80);
        roughnessFactor = mix(roughnessFactor, 0.68, petioleWeight * 0.85);`
      )
      .replace(
        '#include <lights_physical_fragment>',
        `#include <lights_physical_fragment>
        material.clearcoat *= smoothstep(-0.2, 0.55, vLeafPart) * (1.0 - uColorAging * 0.45);`
      )
      .replace(
        '#include <opaque_fragment>',
        `vec3 sunBackDir = normalize(vec3(0.45, 0.62, -0.64));
        vec3 leafViewDir = normalize(cameraPosition - vLeafWorldPos);
        float backAlign = pow(clamp(dot(-leafViewDir, sunBackDir) * 0.5 + 0.5, 0.0, 1.0), 2.4);
        float thinLamina = clamp(1.0 - vThickness, 0.05, 0.90);
        float canopyReveal = smoothstep(0.0, 0.92, uTreeExposure);
        // Smooth transition from sunlit canopy branch -> open midair -> moody twilight lake atmosphere
        float basinTwilight = smoothstep(0.0, 0.68, uHeightNorm);
        float lakeMoodGain = mix(0.38, 0.96, basinTwilight);
        vec3 atmosphereTint = mix(vec3(0.76, 0.88, 0.94), vec3(1.0, 0.98, 0.93), basinTwilight);
        float envGain = lakeMoodGain * (0.76 + 0.24 * uLightIntensity) * uCanopyPatchLight * canopyReveal;
        envGain *= mix(1.0, 0.94, uLeafSoftness);

        vec3 subTint = mix(vec3(0.28, 0.42, 0.04), vec3(0.32, 0.26, 0.05), uColorAging);
        vec3 backlitGlow = subTint * uSubsurface * thinLamina * (0.10 + 0.90 * backAlign) * (0.20 + 0.80 * basinTwilight) * canopyReveal;

        outgoingLight = outgoingLight * atmosphereTint * envGain + backlitGlow;
        diffuseColor.a *= uOpacity;
        if (diffuseColor.a <= 0.02) discard;
        #include <opaque_fragment>`
      );
  };

  material.customProgramCacheKey = () => 'ecosonic-physical-leaf-v1';

  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 2;

  return {
    mesh,
    geometry,
    material,
    uniforms,
    dispose: () => {
      cancelled = true;
      geometry.dispose();
      material.dispose();
      albedoTex.dispose();
      normalTex.dispose();
      roughnessTex.dispose();
    },
  };
}
