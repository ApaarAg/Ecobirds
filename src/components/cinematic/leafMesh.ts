import * as THREE from 'three';
import {
  buildLeafGeometryBuffers,
  evalLeafVeinField,
} from '../../lib/leafGeometry';

export interface PhysicalLeafUniforms {
  uTime: { value: number };
  uFallFlutter: { value: number };
  uStemFlex: { value: number };
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
        // Slender woody autumn oak petiole matching jason-leem twigs
        const stemT = Math.max(0, Math.min(1, (u - 0.02) / 0.2));
        const fiber = Math.sin(v * 140 + fbm2D(u * 18, v * 12) * 3.5) * 0.5 + 0.5;
        const grain = fbm2D(u * 32, v * 28);
        const rBase = 88 + stemT * 28 + fiber * 14 + (grain - 0.5) * 16;
        const gBase = 48 + stemT * 18 + fiber * 8 + (grain - 0.5) * 10;
        const bBase = 26 + stemT * 8 + fiber * 4;

        aImg.data[off] = clampByte(rBase);
        aImg.data[off + 1] = clampByte(gBase);
        aImg.data[off + 2] = clampByte(bBase);
        aImg.data[off + 3] = 255;

        heightField[pIdx] = fiber * 0.18 + grain * 0.14;
        rImg.data[off] = rImg.data[off + 1] = rImg.data[off + 2] = clampByte(188 + grain * 32);
        rImg.data[off + 3] = 255;
      } else {
        // Blade lamina calibrated directly to the golden-amber / burnt-orange autumn oak leaves in jason-leem
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

        // Warm golden-amber center transitioning to richer burnt sienna toward lobe shoulders
        const sunWarmth = (1 - smoothstep(0.3, 0.92, absW)) * (1 - 0.35 * s);
        let rCol = 192 + macroPatch * 34 + sunWarmth * 24 + (microCell - 0.5) * 18;
        let gCol = 98 + macroPatch * 36 + sunWarmth * 38 + (microCell - 0.5) * 14;
        let bCol = 20 + macroPatch * 10 + sunWarmth * 8 + (microCell - 0.5) * 6;

        // Darker midrib & subtle shaded vein channels matching jason-leem oak venation
        const veinBlend = Math.min(
          1,
          midribFactor * 0.85 + lateralVeinFactor * 0.58 + reticVein * 0.2
        );
        rCol = rCol * (1 - veinBlend * 0.28) + 128 * (veinBlend * 0.28);
        gCol = gCol * (1 - veinBlend * 0.32) + 64 * (veinBlend * 0.32);
        bCol = bCol * (1 - veinBlend * 0.25) + 18 * (veinBlend * 0.25);

        // Authentic dark chestnut autumn speckles/imperfections seen on jason-leem leaves
        const fleckNoise = fbm2D(s * 26 + 9.2, w * 26 + 3.7);
        if (fleckNoise > 0.72) {
          const fAmt = Math.min(1, (fleckNoise - 0.72) * 3.1);
          rCol = rCol * (1 - fAmt * 0.52) + 92 * (fAmt * 0.52);
          gCol = gCol * (1 - fAmt * 0.56) + 42 * (fAmt * 0.56);
          bCol = bCol * (1 - fAmt * 0.45) + 14 * (fAmt * 0.45);
        }

        aImg.data[off] = clampByte(rCol);
        aImg.data[off + 1] = clampByte(gCol);
        aImg.data[off + 2] = clampByte(bCol);
        aImg.data[off + 3] = 255;

        heightField[pIdx] =
          midribFactor * 0.85 +
          lateralVeinFactor * 0.52 +
          reticVein * 0.16 +
          (microCell - 0.5) * 0.15;

        // Autumn oak cuticle roughness: dry-waxy sheen ~0.42..0.56, veins ~0.68
        const rough = 108 + microCell * 28 + (1 - macroPatch) * 20 + veinBlend * 42;
        const rByte = clampByte(rough);
        rImg.data[off] = rByte;
        rImg.data[off + 1] = rByte;
        rImg.data[off + 2] = rByte;
        rImg.data[off + 3] = 255;
      }
    }
  }

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
 * Extracts real photographic oak-leaf color, cellular grain, venation, and autumn mottling
 * directly from the isolated hanging oak leaf in jason-leem-mopZf0QhPGw-unsplash_d838c284.jpg,
 * strictly rejecting any cool teal sky pixels so zero sky fringe ever appears on the 3D blade.
 */
function blendPhotoOakDetail(
  albedoCanvas: HTMLCanvasElement,
  img: HTMLImageElement
): boolean {
  const natW = img.naturalWidth;
  const natH = img.naturalHeight;
  if (natW < 512 || natH < 512) return false;

  // Crop only the unoccluded hanging amber oak leaf (x: 1680..1900, y: 4110..4450 of 4016x5015)
  const sx = Math.round(natW * 0.418);
  const sy = Math.round(natH * 0.819);
  const sw = Math.max(64, Math.round(natW * 0.056));
  const sh = Math.max(64, Math.round(natH * 0.068));

  const cropW = 192;
  const cropH = 256;
  const scratch = document.createElement('canvas');
  scratch.width = cropW;
  scratch.height = cropH;
  const sCtx = scratch.getContext('2d', { willReadFrequently: true });
  if (!sCtx) return false;

  sCtx.drawImage(img, sx, sy, sw, sh, 0, 0, cropW, cropH);
  const srcData = sCtx.getImageData(0, 0, cropW, cropH).data;

  const w = albedoCanvas.width;
  const h = albedoCanvas.height;
  const aCtx = albedoCanvas.getContext('2d');
  if (!aCtx) return false;
  const dstImg = aCtx.getImageData(0, 0, w, h);
  const dstData = dstImg.data;

  // Build row-wise interior leaf spans so any sinus sample outside the photo's outline pulls safely from interior leaf tissue
  const isWarmOakPixel = (r: number, g: number, b: number) =>
    r > 85 && r > b + 36 && g > b + 12;

  for (let py = 0; py < h; py++) {
    const v = 1 - py / (h - 1);
    for (let px = 0; px < w; px++) {
      const u = px / (w - 1);
      if (u < 0.24) continue;

      const s = Math.max(0, Math.min(1, (u - 0.24) / 0.74));
      const wNorm = Math.max(-1, Math.min(1, (v - 0.5) / 0.44));

      // Leaf in crop runs diagonally from top-left-center (x~0.34, y~0.04) down to tip (x~0.54, y~0.94)
      const photoY = Math.min(cropH - 1, Math.max(0, Math.round((0.06 + s * 0.86) * (cropH - 1))));
      const midX = (0.34 + s * 0.20) * (cropW - 1);
      const sampleX = Math.min(
        cropW - 1,
        Math.max(0, Math.round(midX + wNorm * cropW * 0.16 * (1 - Math.abs(s - 0.5) * 0.35)))
      );

      let chosenX = sampleX;
      let offS = (photoY * cropW + chosenX) * 4;
      let sr = srcData[offS];
      let sg = srcData[offS + 1];
      let sb = srcData[offS + 2];

      // If sample hits a teal sky gap between lobes, step smoothly toward the verified leaf midrib
      if (!isWarmOakPixel(sr, sg, sb)) {
        const midXInt = Math.min(cropW - 1, Math.max(0, Math.round(midX)));
        chosenX = Math.round(sampleX * 0.35 + midXInt * 0.65);
        offS = (photoY * cropW + chosenX) * 4;
        sr = srcData[offS];
        sg = srcData[offS + 1];
        sb = srcData[offS + 2];
        if (!isWarmOakPixel(sr, sg, sb)) {
          offS = (photoY * cropW + midXInt) * 4;
          sr = srcData[offS];
          sg = srcData[offS + 1];
          sb = srcData[offS + 2];
          if (!isWarmOakPixel(sr, sg, sb)) continue;
        }
      }

      // Match natural golden-ochre oak foliage value & autumn mottling directly from jason-leem
      const photoLum = (0.299 * sr + 0.587 * sg + 0.114 * sb) / 255;
      const liftedR = Math.min(255, sr * 1.03 + 4);
      const liftedG = Math.min(255, sg * 1.01 + 2);
      const liftedB = Math.min(255, sb * 0.92);

      const dOff = (py * w + px) * 4;
      const blendW = 0.68;
      dstData[dOff] = clampByte(dstData[dOff] * (1 - blendW) + liftedR * blendW);
      dstData[dOff + 1] = clampByte(dstData[dOff + 1] * (1 - blendW) + liftedG * blendW);
      dstData[dOff + 2] = clampByte(dstData[dOff + 2] * (1 - blendW) + liftedB * blendW);
      // Micro-grain contrast modulation
      const contrastMod = 0.94 + photoLum * 0.12;
      dstData[dOff] = clampByte(dstData[dOff] * contrastMod);
      dstData[dOff + 1] = clampByte(dstData[dOff + 1] * contrastMod);
      dstData[dOff + 2] = clampByte(dstData[dOff + 2] * contrastMod);
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
  const geoData = buildLeafGeometryBuffers(68, 18);

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
    if (blendPhotoOakDetail(albedoCanvas, img)) {
      albedoTex.needsUpdate = true;
      onTextureUpdated();
    }
  };
  img.src = leafPhotoUrl;

  const uniforms: PhysicalLeafUniforms = {
    uTime: { value: 0 },
    uFallFlutter: { value: 0.12 },
    uStemFlex: { value: 0 },
    uOpacity: { value: 0 },
    uTreeExposure: { value: 0 },
    uLightIntensity: { value: 0.85 },
    uHeightNorm: { value: 1 },
    uColorAging: { value: 0 },
    uSubsurface: { value: 0.42 },
    uContactDip: { value: 0 },
    uLeafSoftness: { value: 0.12 },
    uCanopyPatchLight: { value: 1.0 },
  };

  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: albedoTex,
    normalMap: normalTex,
    normalScale: new THREE.Vector2(1.25, 1.25),
    roughnessMap: roughnessTex,
    roughness: 1.0,
    metalness: 0.0,
    clearcoat: 0.16,
    clearcoatRoughness: 0.48,
    ior: 1.44,
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
        uniform float uStemFlex;
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

        // Elastic petiole-to-blade flex under wind tug just before detachment (stem base x=-0.34 stays locked on twig)
        float stemReach = smoothstep(-0.32, 0.72, aBladeCoord.x);
        float flexBendY = -uStemFlex * stemReach * stemReach * 0.16;
        float flexBendZ = uStemFlex * stemReach * (0.055 + 0.035 * aBladeCoord.y);
        transformed.y += flexBendY;
        transformed.z += flexBendZ;

        float bladeFlex = smoothstep(0.02, 0.28, aBladeCoord.x);
        float flutterWave = sin(uTime * 2.35 + aBladeCoord.x * 4.8 + aBladeCoord.y * 2.4) * 0.014 * uFallFlutter;
        float aeroTorsion = aBladeCoord.y * sin(uTime * 1.85 + aBladeCoord.x * 2.5) * 0.046 * uFallFlutter;
        float meniscusCurve = (0.024 * aBladeCoord.x * aBladeCoord.x - 0.011) * uContactDip;
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
        // Abaxial oak underside is slightly paler matte ochre-tan matching jason-leem underside leaves
        float undersideMask = smoothstep(0.2, -0.65, vLeafPart);
        vec3 undersideTint = diffuseColor.rgb * vec3(1.06, 1.02, 0.94) + vec3(0.018, 0.014, 0.008);
        diffuseColor.rgb = mix(diffuseColor.rgb, undersideTint, undersideMask * 0.72);

        // Subtle moisture darkening only when resting damp on dark pond meniscus (uColorAging -> 0.45)
        vec3 dampSienna = diffuseColor.rgb * vec3(0.76, 0.68, 0.58);
        diffuseColor.rgb = mix(diffuseColor.rgb, dampSienna, clamp(uColorAging, 0.0, 1.0));`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        float abaxialWeight = smoothstep(0.15, -0.65, vLeafPart);
        float petioleWeight = 1.0 - smoothstep(0.0, 0.35, abs(vLeafPart));
        roughnessFactor = mix(roughnessFactor, 0.85, abaxialWeight * 0.82);
        roughnessFactor = mix(roughnessFactor, 0.76, petioleWeight * 0.85);`
      )
      .replace(
        '#include <lights_physical_fragment>',
        `#include <lights_physical_fragment>
        material.clearcoat *= smoothstep(-0.2, 0.55, vLeafPart);`
      )
      .replace(
        '#include <opaque_fragment>',
        `// Inherit sunlit golden-hour sky illumination in oak canopy -> cool shaded woodland basin over dark water
        vec3 sunBackDir = normalize(vec3(-0.55, 0.68, -0.48));
        vec3 leafViewDir = normalize(cameraPosition - vLeafWorldPos);
        float backAlign = pow(clamp(dot(-leafViewDir, sunBackDir) * 0.5 + 0.5, 0.0, 1.0), 2.1);
        float thinLamina = clamp(1.0 - vThickness, 0.06, 0.92);
        float canopyReveal = smoothstep(0.0, 0.92, uTreeExposure);

        float basinTwilight = smoothstep(0.02, 0.68, uHeightNorm);
        float envGain = mix(0.56, 1.06, basinTwilight) * (0.76 + 0.24 * uLightIntensity) * uCanopyPatchLight * canopyReveal;
        envGain *= mix(1.0, 0.93, uLeafSoftness);

        // Warm golden-amber sky-lit canopy grade -> warm muted autumnal stream ambient
        vec3 atmosphereTint = mix(vec3(0.95, 0.88, 0.78), vec3(1.04, 0.96, 0.84), basinTwilight);

        // Warm translucent amber sunlight passing through thin autumn oak lamina in upper canopy
        vec3 subTint = vec3(0.86, 0.44, 0.04);
        vec3 backlitGlow = subTint * uSubsurface * thinLamina * (0.22 + 0.78 * backAlign) * (0.18 + 0.82 * basinTwilight) * canopyReveal;

        outgoingLight = outgoingLight * atmosphereTint * envGain + backlitGlow;
        diffuseColor.a *= uOpacity;
        if (diffuseColor.a <= 0.02) discard;
        #include <opaque_fragment>`
      );
  };

  material.customProgramCacheKey = () => 'ecosonic-oak-leaf-v2';

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
