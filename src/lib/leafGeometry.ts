export interface Vec3Tuple {
  x: number;
  y: number;
  z: number;
}

export const LEAF_BLADE_LENGTH = 1.0;
export const LEAF_BLADE_CENTER_OFFSET_X = 0.44;

/**
 * Local model-space coordinates of the petiole abscission tip where the 3D oak leaf
 * physically joins the overhanging twig node (relative to blade center of mass).
 */
export const LEAF_STEM_TIP_LOCAL: Readonly<Vec3Tuple> = {
  x: -0.34 - LEAF_BLADE_CENTER_OFFSET_X,
  y: 0.032,
  z: 0.008,
};

/** Longitudinal anchors of the primary lateral veins feeding each oak lobe */
export const LEAF_VEIN_BASES = [0.18, 0.36, 0.55, 0.74, 0.87] as const;

interface OakLobeSpec {
  center: number;
  width: number;
  amp: number;
  skew: number;
}

const OAK_LOBES_TOP: readonly OakLobeSpec[] = [
  { center: 0.21, width: 0.068, amp: 0.145, skew: 0.22 },
  { center: 0.42, width: 0.076, amp: 0.215, skew: 0.28 },
  { center: 0.62, width: 0.072, amp: 0.195, skew: 0.3 },
  { center: 0.80, width: 0.064, amp: 0.125, skew: 0.32 },
];

const OAK_LOBES_BOTTOM: readonly OakLobeSpec[] = [
  { center: 0.19, width: 0.065, amp: 0.132, skew: 0.2 },
  { center: 0.40, width: 0.074, amp: 0.198, skew: 0.26 },
  { center: 0.60, width: 0.07, amp: 0.182, skew: 0.28 },
  { center: 0.78, width: 0.062, amp: 0.118, skew: 0.3 },
];

export interface LeafOutlineSample {
  x: number;
  midribY: number;
  halfWidthTop: number;
  halfWidthBottom: number;
  serrationTop: number;
  serrationBottom: number;
}

export interface LeafGeometryData {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  leafParts: Float32Array; // +1 adaxial top, -1 abaxial underside, 0.5 beveled margin rim, 0 petiole
  thicknesses: Float32Array; // 0..1 normalized physical optical thickness (0 = thin lamina, 1 = dense midrib/petiole)
  bladeCoords: Float32Array; // [s (0..1 blade, <=0 petiole), w (-1..1)]
  indices: Uint16Array;
  vertexCount: number;
  triangleCount: number;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/**
 * Evaluates a single forward-tilted oak lobe with subtle secondary shoulder contour.
 */
function evalOakLobes(s: number, lobes: readonly OakLobeSpec[]): number {
  let sum = 0;
  for (let i = 0; i < lobes.length; i++) {
    const lobe = lobes[i];
    const d = (s - lobe.center) / lobe.width;
    // Skew forward slightly toward the apex so sinuses sweep forward naturally like Quercus leaves
    const skewed = d - lobe.skew * Math.exp(-d * d * 0.65);
    const primary = Math.exp(-Math.pow(Math.abs(skewed), 2.15) * 1.45);
    // Subtle secondary toothlet on outer lobe shoulder
    const shoulder = Math.exp(-Math.pow(skewed - 0.52, 2.0) * 5.2) * 0.22;
    sum += (primary + shoulder) * lobe.amp;
  }
  return sum;
}

/**
 * Evaluates natural pinnately-lobed autumn Oak leaf (Quercus) silhouette matching jason-leem.
 */
export function evalLeafBladeOutline(sRaw: number): LeafOutlineSample {
  const s = clamp01(sRaw);
  const x = s * LEAF_BLADE_LENGTH;

  // Subtle organic midrib curve so the blade never looks rigidly symmetrical
  const midribY = Math.sin(s * Math.PI * 1.1) * 0.015 - Math.sin(s * Math.PI * 2.1) * 0.006;

  // Slender cuneate base -> core lamina spine between deep sinuses -> rounded-subacute apex lobe
  const baseBlend = 1 - smoothstep(0.0, 0.08, s);
  const coreSpan =
    smoothstep(0.03, 0.16, s) *
    (1 - smoothstep(0.84, 1.0, s)) *
    (0.112 + 0.036 * Math.sin(s * Math.PI));
  const apexLobe =
    Math.exp(-Math.pow((s - 0.925) / 0.055, 2.0)) * 0.072 * (1 - smoothstep(0.955, 1.0, s));
  const baseHalfW = Math.max(0.003, 0.013 * baseBlend + coreSpan + apexLobe);

  const lobesTop = evalOakLobes(s, OAK_LOBES_TOP);
  const lobesBottom = evalOakLobes(s, OAK_LOBES_BOTTOM);

  // Subtle biological asymmetry (~4% wider on one side)
  const asym = 0.042 * Math.sin(s * Math.PI * 0.92 + 0.2);
  const halfWidthTop = Math.max(0.0028, baseHalfW * (1 + asym) + lobesTop);
  const halfWidthBottom = Math.max(0.0028, baseHalfW * (1 - asym) + lobesBottom);

  return {
    x,
    midribY,
    halfWidthTop,
    halfWidthBottom,
    serrationTop: lobesTop,
    serrationBottom: lobesBottom,
  };
}

/**
 * Computes midrib, primary lobe-aligned lateral veins, and subtle inter-vein pillowing.
 */
export function evalLeafVeinField(s: number, w: number): {
  midribFactor: number;
  lateralVeinFactor: number;
  interVeinPillow: number;
} {
  const absW = Math.abs(w);
  const midribHalfSpan = 0.044 * (1 - 0.60 * s) + 0.012;
  const midribFactor =
    Math.exp(-(absW * absW) / (midribHalfSpan * midribHalfSpan)) * (1 - 0.42 * s);

  // Lateral veins originate along midrib and sweep forward toward each oak lobe
  const sideOffset = w >= 0 ? 0.0 : 0.02;
  const veinStartS = s - 0.125 * Math.pow(absW, 1.08) - sideOffset;

  let lateralMax = 0;
  let nearestDelta = 1.0;
  for (let i = 0; i < LEAF_VEIN_BASES.length; i++) {
    const d = Math.abs(veinStartS - LEAF_VEIN_BASES[i]);
    if (d < nearestDelta) nearestDelta = d;
    const width = 0.016 * (1 - 0.3 * absW);
    const g = Math.exp(-(d * d) / (width * width));
    if (g > lateralMax) lateralMax = g;
  }

  const lateralMask = smoothstep(0.03, 0.14, absW) * (1 - smoothstep(0.86, 0.99, absW));
  const lateralVeinFactor = lateralMax * lateralMask;

  const interVeinPillow =
    smoothstep(0.014, 0.048, nearestDelta) *
    smoothstep(0.06, 0.24, absW) *
    (1 - smoothstep(0.82, 0.99, absW));

  return { midribFactor, lateralVeinFactor, interVeinPillow };
}

/**
 * Evaluates 3D surface position, physical thickness, and optical thickness at (s, w, faceSign).
 */
export function evalLeafBladeVertex(
  sRaw: number,
  wRaw: number,
  faceSign: 1 | -1
): {
  x: number;
  y: number;
  z: number;
  uvU: number;
  uvV: number;
  thickness: number;
  opticalThickness: number;
} {
  const s = clamp01(sRaw);
  const w = Math.max(-1, Math.min(1, wRaw));
  const absW = Math.abs(w);

  const outline = evalLeafBladeOutline(s);
  const halfW = w >= 0 ? outline.halfWidthTop : outline.halfWidthBottom;
  const y = outline.midribY + w * halfW;

  // Subtle forward sweep on outer lobe tips
  const lobeExt = w >= 0 ? outline.serrationTop : outline.serrationBottom;
  const x = outline.x + lobeExt * absW * 0.18 - LEAF_BLADE_CENTER_OFFSET_X;

  // Natural 3D oak midrib arch + gentle apex droop + autumn lobe margin curl
  const midribArch = Math.sin(s * Math.PI) * 0.052 - Math.pow(s, 2.3) * 0.098;
  const vFold = (0.058 * absW - 0.044 * absW * absW) * (1 - 0.42 * Math.pow(s, 2.0));
  const lobeCurl =
    Math.sin(s * Math.PI * 4.4 + (w >= 0 ? 0.35 : 1.55)) *
    0.02 *
    smoothstep(0.32, 1.0, absW) *
    Math.sin(s * Math.PI);
  const naturalTwist = w * Math.sin(s * Math.PI * 1.15) * 0.032;

  const { midribFactor, lateralVeinFactor, interVeinPillow } = evalLeafVeinField(s, w);

  const midSurfaceZ = midribArch + vFold + lobeCurl + naturalTwist;
  const halfLaminaThick =
    (0.0022 +
      0.0024 * (1 - absW) * (1 - 0.55 * s) +
      0.0074 * midribFactor +
      0.0028 * lateralVeinFactor) *
    (0.76 + 0.24 * (1 - Math.pow(s, 3.0)));

  const adaxialRelief =
    -0.0034 * midribFactor - 0.0018 * lateralVeinFactor + 0.0042 * interVeinPillow;
  const abaxialRib = -0.0078 * midribFactor - 0.0032 * lateralVeinFactor;

  const z =
    faceSign > 0
      ? midSurfaceZ + halfLaminaThick + adaxialRelief
      : midSurfaceZ - halfLaminaThick + abaxialRib;

  const opticalThickness = clamp01(
    0.12 + 0.74 * midribFactor + 0.34 * lateralVeinFactor + 0.1 * (1 - absW)
  );

  // UV mapped cleanly inside [0.24..0.98, 0.06..0.94] so margin mipmapping never touches border
  const uvU = 0.24 + 0.74 * s;
  const uvV = 0.5 + 0.44 * w;

  return {
    x,
    y,
    z,
    uvU,
    uvV,
    thickness: halfLaminaThick * 2,
    opticalThickness,
  };
}

/**
 * Evaluates cubic Bezier petiole centerline from abscission tip -> blade base midrib.
 */
function evalPetiolePoint(t: number): Vec3Tuple {
  const p0 = LEAF_STEM_TIP_LOCAL;
  const p1 = { x: -0.22 - LEAF_BLADE_CENTER_OFFSET_X, y: 0.012, z: 0.011 };
  const p2 = { x: -0.09 - LEAF_BLADE_CENTER_OFFSET_X, y: -0.003, z: -0.002 };
  const p3 = { x: 0.045 - LEAF_BLADE_CENTER_OFFSET_X, y: 0.001, z: -0.004 };

  const omt = 1 - t;
  const omt2 = omt * omt;
  const t2 = t * t;
  return {
    x: omt2 * omt * p0.x + 3 * omt2 * t * p1.x + 3 * omt * t2 * p2.x + t2 * t * p3.x,
    y: omt2 * omt * p0.y + 3 * omt2 * t * p1.y + 3 * omt * t2 * p2.y + t2 * t * p3.y,
    z: omt2 * omt * p0.z + 3 * omt2 * t * p1.z + 3 * omt * t2 * p2.z + t2 * t * p3.z,
  };
}

function normalize3(arr: Float32Array, idx3: number): void {
  const x = arr[idx3];
  const y = arr[idx3 + 1];
  const z = arr[idx3 + 2];
  const len = Math.hypot(x, y, z);
  if (len > 1e-7) {
    arr[idx3] = x / len;
    arr[idx3 + 1] = y / len;
    arr[idx3 + 2] = z / len;
  } else {
    arr[idx3] = 0;
    arr[idx3 + 1] = 0;
    arr[idx3 + 2] = 1;
  }
}

function accumulateSmoothNormals(
  positions: Float32Array,
  normals: Float32Array,
  indices: number[],
  startTriOffset: number,
  triCount: number
): void {
  for (let t = 0; t < triCount; t++) {
    const base = startTriOffset + t * 3;
    const i0 = indices[base] * 3;
    const i1 = indices[base + 1] * 3;
    const i2 = indices[base + 2] * 3;

    const ax = positions[i1] - positions[i0];
    const ay = positions[i1 + 1] - positions[i0 + 1];
    const az = positions[i1 + 2] - positions[i0 + 2];

    const bx = positions[i2] - positions[i0];
    const by = positions[i2 + 1] - positions[i0 + 1];
    const bz = positions[i2 + 2] - positions[i0 + 2];

    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;

    normals[i0] += nx;
    normals[i0 + 1] += ny;
    normals[i0 + 2] += nz;
    normals[i1] += nx;
    normals[i1 + 1] += ny;
    normals[i1 + 2] += nz;
    normals[i2] += nx;
    normals[i2 + 1] += ny;
    normals[i2 + 2] += nz;
  }
}

/**
 * Generates a closed dual-surface volumetric 3D pinnately-lobed oak leaf mesh
 * with sculpted midrib, lateral veins, beveled margin rim, and curved 3D petiole stem.
 */
export function buildLeafGeometryBuffers(nu = 68, nv = 18): LeafGeometryData {
  const cols = nv + 1;
  const rows = nu + 1;
  const gridVerts = rows * cols;

  const rimCount = 4 * rows + 4 * cols;
  const stemSegs = 14;
  const stemSides = 8;
  const stemVerts = (stemSegs + 1) * (stemSides + 1) + 2;

  const totalVerts = gridVerts * 2 + rimCount + stemVerts;
  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const leafParts = new Float32Array(totalVerts);
  const thicknesses = new Float32Array(totalVerts);
  const bladeCoords = new Float32Array(totalVerts * 2);

  const indices: number[] = [];

  const writeVert = (
    idx: number,
    x: number,
    y: number,
    z: number,
    u: number,
    v: number,
    part: number,
    thick: number,
    sCoord: number,
    wCoord: number
  ) => {
    positions[idx * 3] = x;
    positions[idx * 3 + 1] = y;
    positions[idx * 3 + 2] = z;
    uvs[idx * 2] = u;
    uvs[idx * 2 + 1] = v;
    leafParts[idx] = part;
    thicknesses[idx] = thick;
    bladeCoords[idx * 2] = sCoord;
    bladeCoords[idx * 2 + 1] = wCoord;
  };

  const topOffset = 0;
  const botOffset = gridVerts;

  for (let i = 0; i <= nu; i++) {
    const s = i / nu;
    for (let j = 0; j <= nv; j++) {
      const w = (j / nv) * 2 - 1;
      const localIdx = i * cols + j;

      const topSample = evalLeafBladeVertex(s, w, 1);
      writeVert(
        topOffset + localIdx,
        topSample.x,
        topSample.y,
        topSample.z,
        topSample.uvU,
        topSample.uvV,
        1.0,
        topSample.opticalThickness,
        s,
        w
      );

      const botSample = evalLeafBladeVertex(s, w, -1);
      writeVert(
        botOffset + localIdx,
        botSample.x,
        botSample.y,
        botSample.z,
        botSample.uvU,
        botSample.uvV,
        -1.0,
        botSample.opticalThickness,
        s,
        w
      );
    }
  }

  const topTriStart = 0;
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const a = topOffset + i * cols + j;
      const b = topOffset + (i + 1) * cols + j;
      const c = topOffset + (i + 1) * cols + (j + 1);
      const d = topOffset + i * cols + (j + 1);
      indices.push(a, b, c, a, c, d);
    }
  }
  const topTriCount = nu * nv * 2;

  const botTriStart = indices.length;
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const a = botOffset + i * cols + j;
      const b = botOffset + (i + 1) * cols + j;
      const c = botOffset + (i + 1) * cols + (j + 1);
      const d = botOffset + i * cols + (j + 1);
      indices.push(a, c, b, a, d, c);
    }
  }
  const botTriCount = nu * nv * 2;

  const rimOffset = gridVerts * 2;
  let rimCursor = rimOffset;

  const pushRimPair = (s: number, w: number): [number, number] => {
    const topV = evalLeafBladeVertex(s, w, 1);
    const botV = evalLeafBladeVertex(s, w, -1);
    const idxTop = rimCursor++;
    const idxBot = rimCursor++;
    writeVert(idxTop, topV.x, topV.y, topV.z, topV.uvU, topV.uvV, 0.5, topV.opticalThickness, s, w);
    writeVert(idxBot, botV.x, botV.y, botV.z, botV.uvU, botV.uvV, 0.5, botV.opticalThickness, s, w);
    return [idxTop, idxBot];
  };

  const rimTriStart = indices.length;

  const wPlusPairs: Array<[number, number]> = [];
  for (let i = 0; i <= nu; i++) {
    wPlusPairs.push(pushRimPair(i / nu, 1));
  }
  for (let i = 0; i < nu; i++) {
    const [t0, b0] = wPlusPairs[i];
    const [t1, b1] = wPlusPairs[i + 1];
    indices.push(t0, t1, b1, t0, b1, b0);
  }

  const wMinusPairs: Array<[number, number]> = [];
  for (let i = 0; i <= nu; i++) {
    wMinusPairs.push(pushRimPair(i / nu, -1));
  }
  for (let i = 0; i < nu; i++) {
    const [t0, b0] = wMinusPairs[i];
    const [t1, b1] = wMinusPairs[i + 1];
    indices.push(b0, b1, t1, b0, t1, t0);
  }

  const basePairs: Array<[number, number]> = [];
  for (let j = 0; j <= nv; j++) {
    basePairs.push(pushRimPair(0, (j / nv) * 2 - 1));
  }
  for (let j = 0; j < nv; j++) {
    const [t0, b0] = basePairs[j];
    const [t1, b1] = basePairs[j + 1];
    indices.push(t0, t1, b1, t0, b1, b0);
  }

  const tipPairs: Array<[number, number]> = [];
  for (let j = 0; j <= nv; j++) {
    tipPairs.push(pushRimPair(1, (j / nv) * 2 - 1));
  }
  for (let j = 0; j < nv; j++) {
    const [t0, b0] = tipPairs[j];
    const [t1, b1] = tipPairs[j + 1];
    indices.push(t0, b1, t1, t0, b0, b1);
  }
  const rimTriCount = (indices.length - rimTriStart) / 3;

  const stemOffset = rimCursor;
  const stemTriStart = indices.length;

  for (let i = 0; i <= stemSegs; i++) {
    const t = i / stemSegs;
    const p = evalPetiolePoint(t);
    const pNext = evalPetiolePoint(Math.min(1, t + 0.015));
    const pPrev = evalPetiolePoint(Math.max(0, t - 0.015));

    let tx = pNext.x - pPrev.x;
    let ty = pNext.y - pPrev.y;
    let tz = pNext.z - pPrev.z;
    const tLen = Math.hypot(tx, ty, tz) || 1;
    tx /= tLen;
    ty /= tLen;
    tz /= tLen;

    let nx = -ty;
    let ny = tx;
    let nz = 0;
    const nLen = Math.hypot(nx, ny, nz) || 1;
    nx /= nLen;
    ny /= nLen;

    const bx = ty * nz - tz * ny;
    const by = tz * nx - tx * nz;
    const bz = tx * ny - ty * nx;

    const collar = 0.0036 * Math.exp(-t * t * 32.0);
    const baseFlare = 0.0046 * smoothstep(0.75, 1.0, t);
    const radius = 0.0074 + collar + baseFlare;

    for (let j = 0; j <= stemSides; j++) {
      const ang = (j / stemSides) * Math.PI * 2;
      const cosA = Math.cos(ang);
      const sinA = Math.sin(ang);
      const ry = radius * 1.08;
      const rz = radius * 0.88;

      const vx = p.x + nx * cosA * ry + bx * sinA * rz;
      const vy = p.y + ny * cosA * ry + by * sinA * rz;
      const vz = p.z + nz * cosA * ry + bz * sinA * rz;

      const vIdx = stemOffset + i * (stemSides + 1) + j;
      writeVert(
        vIdx,
        vx,
        vy,
        vz,
        0.02 + 0.2 * t,
        0.44 + 0.12 * (j / stemSides),
        0.0,
        0.92,
        -0.34 * (1 - t),
        0
      );
    }
  }

  for (let i = 0; i < stemSegs; i++) {
    for (let j = 0; j < stemSides; j++) {
      const a = stemOffset + i * (stemSides + 1) + j;
      const b = stemOffset + (i + 1) * (stemSides + 1) + j;
      const c = stemOffset + (i + 1) * (stemSides + 1) + (j + 1);
      const d = stemOffset + i * (stemSides + 1) + (j + 1);
      indices.push(a, c, b, a, d, c);
    }
  }

  const capStartIdx = stemOffset + (stemSegs + 1) * (stemSides + 1);
  const pCap0 = evalPetiolePoint(0);
  writeVert(capStartIdx, pCap0.x - 0.002, pCap0.y, pCap0.z, 0.02, 0.5, 0.0, 0.95, -0.34, 0);
  for (let j = 0; j < stemSides; j++) {
    const a = stemOffset + j;
    const b = stemOffset + j + 1;
    indices.push(capStartIdx, b, a);
  }

  const pCap1 = evalPetiolePoint(1);
  const capEndIdx = capStartIdx + 1;
  writeVert(capEndIdx, pCap1.x, pCap1.y, pCap1.z, 0.22, 0.5, 0.0, 0.95, 0, 0);
  const lastRingOffset = stemOffset + stemSegs * (stemSides + 1);
  for (let j = 0; j < stemSides; j++) {
    const a = lastRingOffset + j;
    const b = lastRingOffset + j + 1;
    indices.push(capEndIdx, a, b);
  }

  const stemTriCount = (indices.length - stemTriStart) / 3;

  accumulateSmoothNormals(positions, normals, indices, topTriStart, topTriCount);
  accumulateSmoothNormals(positions, normals, indices, botTriStart, botTriCount);
  accumulateSmoothNormals(positions, normals, indices, rimTriStart, rimTriCount);
  accumulateSmoothNormals(positions, normals, indices, stemTriStart, stemTriCount);

  for (let v = 0; v < totalVerts; v++) {
    normalize3(normals, v * 3);
  }

  return {
    positions,
    normals,
    uvs,
    leafParts,
    thicknesses,
    bladeCoords,
    indices: new Uint16Array(indices),
    vertexCount: totalVerts,
    triangleCount: indices.length / 3,
  };
}
