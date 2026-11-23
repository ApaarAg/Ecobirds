export interface Vec3Tuple {
  x: number;
  y: number;
  z: number;
}

export const LEAF_BLADE_LENGTH = 1.0;
export const LEAF_BLADE_CENTER_OFFSET_X = 0.44;

/**
 * Local model-space coordinates of the petiole abscission tip where the 3D leaf
 * physically joins the overhanging tree twig node (relative to blade center of mass).
 */
export const LEAF_STEM_TIP_LOCAL: Readonly<Vec3Tuple> = {
  x: -0.34 - LEAF_BLADE_CENTER_OFFSET_X,
  y: 0.036,
  z: 0.008,
};

/** Normalized longitudinal positions & sweep of the 8 major lateral vein pairs */
export const LEAF_VEIN_BASES = [0.11, 0.21, 0.32, 0.43, 0.54, 0.65, 0.76, 0.86] as const;

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
 * Asymmetric forward-tilted botanical serration wave along the leaf margin.
 */
function evalSerration(s: number, phaseShift: number): number {
  const envelope = smoothstep(0.07, 0.22, s) * (1 - smoothstep(0.90, 0.99, s));
  if (envelope <= 0.0001) return 0;

  // 13 primary teeth + subtle secondary double-serration toothlet
  const cycles = s * 13.0 + phaseShift;
  const frac = cycles - Math.floor(cycles);
  // Sawtooth skewed toward apex: gradual outward ramp (0..0.72), crisp notch drop (0.72..1.0)
  const primaryTooth = frac < 0.72 ? frac / 0.72 : (1.0 - frac) / 0.28;
  const secondaryCycles = s * 26.0 + phaseShift * 2.0 + 0.35;
  const secFrac = secondaryCycles - Math.floor(secondaryCycles);
  const secondaryTooth = secFrac < 0.68 ? secFrac / 0.68 : (1.0 - secFrac) / 0.32;

  return (primaryTooth * 0.78 + secondaryTooth * 0.22 - 0.35) * 0.032 * envelope;
}

/**
 * Evaluates natural ovate-elliptic alder/beech leaf silhouette with subtle organic asymmetry.
 */
export function evalLeafBladeOutline(sRaw: number): LeafOutlineSample {
  const s = clamp01(sRaw);
  const x = s * LEAF_BLADE_LENGTH;

  // Gentle organic midrib S-curve so the blade feels living rather than CAD-symmetrical
  const midribY = Math.sin(s * Math.PI * 1.15) * 0.018 - Math.sin(s * Math.PI * 2.0) * 0.007;

  // Base smoothly widens from petiole collar (0.014) -> broad ovate belly near s=0.42 -> pointed acuminate drip-tip
  const baseBlend = 1 - smoothstep(0.0, 0.07, s);
  const body =
    Math.pow(Math.max(0.0001, Math.sin(Math.pow(s, 0.78) * Math.PI)), 0.74) *
    (1.0 + 0.14 * Math.sin(s * Math.PI * 1.4));
  const tipTaper = 1 - smoothstep(0.84, 1.0, s) * 0.94;
  const baseHalfW = Math.max(0.003, 0.013 * baseBlend + 0.335 * body * tipTaper);

  const serrationTop = evalSerration(s, 0.0);
  const serrationBottom = evalSerration(s, 0.18);

  // Subtle biological asymmetry (~5% wider on one side)
  const asym = 0.048 * Math.sin(s * Math.PI * 0.95);
  const halfWidthTop = Math.max(0.0025, baseHalfW * (1 + asym) + serrationTop);
  const halfWidthBottom = Math.max(0.0025, baseHalfW * (1 - asym) + serrationBottom);

  return {
    x,
    midribY,
    halfWidthTop,
    halfWidthBottom,
    serrationTop,
    serrationBottom,
  };
}

/**
 * Computes lateral vein intensity (0..1) and inter-vein pillow dome (0..1) in parametric blade space.
 */
export function evalLeafVeinField(s: number, w: number): {
  midribFactor: number;
  lateralVeinFactor: number;
  interVeinPillow: number;
} {
  const absW = Math.abs(w);
  const midribHalfSpan = 0.042 * (1 - 0.58 * s) + 0.012;
  const midribFactor = Math.exp(-(absW * absW) / (midribHalfSpan * midribHalfSpan)) * (1 - 0.45 * s);

  // Lateral veins curve forward as they travel from midrib (w=0) toward margin (|w|=1)
  const sideOffset = w >= 0 ? 0.0 : 0.022;
  const veinStartS = s - 0.165 * Math.pow(absW, 1.12) - sideOffset;

  let lateralMax = 0;
  let nearestDelta = 1.0;
  for (let i = 0; i < LEAF_VEIN_BASES.length; i++) {
    const d = Math.abs(veinStartS - LEAF_VEIN_BASES[i]);
    if (d < nearestDelta) nearestDelta = d;
    const width = 0.014 * (1 - 0.35 * absW);
    const g = Math.exp(-(d * d) / (width * width));
    if (g > lateralMax) lateralMax = g;
  }

  const lateralMask = smoothstep(0.03, 0.14, absW) * (1 - smoothstep(0.86, 0.99, absW));
  const lateralVeinFactor = lateralMax * lateralMask;

  // Soft pillowing strictly between lateral veins so grazing forest sunbeams catch each lamina rib
  const interVeinPillow =
    smoothstep(0.012, 0.045, nearestDelta) *
    smoothstep(0.05, 0.24, absW) *
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

  // Slight forward sweep on lateral margin serration tips for natural venation tension
  const serrationSweep = (w >= 0 ? outline.serrationTop : outline.serrationBottom) * absW * 0.45;
  const x = outline.x + serrationSweep - LEAF_BLADE_CENTER_OFFSET_X;

  // Natural 3D midrib arch + graceful acuminate tip droop (gives unmistakable 3D silhouette from all angles)
  const midribArch = Math.sin(s * Math.PI) * 0.058 - Math.pow(s, 2.35) * 0.118;
  // Botanical V-cupping along midrib + subtle downward margin curl (S-camber)
  const vFold = (0.068 * absW - 0.048 * absW * absW) * (1 - 0.48 * Math.pow(s, 2.0));
  // Subtle organic undulation along the blade edge
  const edgeWave =
    Math.sin(s * Math.PI * 3.1 + (w >= 0 ? 0.2 : 1.7)) * 0.015 * smoothstep(0.35, 1.0, absW) * Math.sin(s * Math.PI);
  // Subtle natural roll/twist across lamina
  const naturalTwist = w * Math.sin(s * Math.PI * 1.2) * 0.028;

  const { midribFactor, lateralVeinFactor, interVeinPillow } = evalLeafVeinField(s, w);

  // Sculpted botanical anatomy:
  // Adaxial (+1): crisp sunken central midrib groove, gentle inter-vein dome pillows, sunken lateral veins
  // Abaxial (-1): prominent raised rounded midrib rib and raised lateral vein ribs underneath
  const midSurfaceZ = midribArch + vFold + edgeWave + naturalTwist;
  const halfLaminaThick =
    (0.0022 +
      0.0026 * (1 - absW) * (1 - 0.55 * s) +
      0.0072 * midribFactor +
      0.0028 * lateralVeinFactor) *
    (0.75 + 0.25 * (1 - Math.pow(s, 3.0)));

  const adaxialRelief = -0.0038 * midribFactor - 0.0020 * lateralVeinFactor + 0.0046 * interVeinPillow;
  const abaxialRib = -0.0075 * midribFactor - 0.0032 * lateralVeinFactor;

  const z =
    faceSign > 0
      ? midSurfaceZ + halfLaminaThick + adaxialRelief
      : midSurfaceZ - halfLaminaThick + abaxialRib;

  const opticalThickness = clamp01(0.14 + 0.72 * midribFactor + 0.34 * lateralVeinFactor + 0.12 * (1 - absW));

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
  const p1 = { x: -0.22 - LEAF_BLADE_CENTER_OFFSET_X, y: 0.014, z: 0.012 };
  const p2 = { x: -0.09 - LEAF_BLADE_CENTER_OFFSET_X, y: -0.004, z: -0.002 };
  const p3 = { x: 0.045 - LEAF_BLADE_CENTER_OFFSET_X, y: 0.001, z: -0.005 };

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
 * Generates a closed dual-surface volumetric 3D serrated leaf mesh with sculpted midrib,
 * raised lateral veins, beveled margin rim, and curved 3D petiole stem.
 */
export function buildLeafGeometryBuffers(nu = 56, nv = 14): LeafGeometryData {
  const cols = nv + 1;
  const rows = nu + 1;
  const gridVerts = rows * cols;

  // Separate top, bottom, and perimeter rim vertex banks so margin bevel normals stay crisp
  const rimCount = 4 * rows + 4 * cols;
  const stemSegs = 14;
  const stemSides = 8;
  const stemVerts = (stemSegs + 1) * (stemSides + 1) + 2; // +2 end caps

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

  // 1. Top Adaxial & Bottom Abaxial Surfaces
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

  // 2. Closed Beveled Perimeter Rim stitching Top & Bottom edges
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

  // Top margin w = +1 (outward normal +Y)
  const wPlusPairs: Array<[number, number]> = [];
  for (let i = 0; i <= nu; i++) {
    wPlusPairs.push(pushRimPair(i / nu, 1));
  }
  for (let i = 0; i < nu; i++) {
    const [t0, b0] = wPlusPairs[i];
    const [t1, b1] = wPlusPairs[i + 1];
    indices.push(t0, t1, b1, t0, b1, b0);
  }

  // Bottom margin w = -1 (outward normal -Y)
  const wMinusPairs: Array<[number, number]> = [];
  for (let i = 0; i <= nu; i++) {
    wMinusPairs.push(pushRimPair(i / nu, -1));
  }
  for (let i = 0; i < nu; i++) {
    const [t0, b0] = wMinusPairs[i];
    const [t1, b1] = wMinusPairs[i + 1];
    indices.push(b0, b1, t1, b0, t1, t0);
  }

  // Base closure s = 0 (outward normal -X)
  const basePairs: Array<[number, number]> = [];
  for (let j = 0; j <= nv; j++) {
    basePairs.push(pushRimPair(0, (j / nv) * 2 - 1));
  }
  for (let j = 0; j < nv; j++) {
    const [t0, b0] = basePairs[j];
    const [t1, b1] = basePairs[j + 1];
    indices.push(t0, t1, b1, t0, b1, b0);
  }

  // Tip closure s = 1 (outward normal +X)
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

  // 3. 3D Curved Petiole Stem with abscission collar & seamless midrib taper
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

    // Frame normal/binormal around tangent
    let nx = -ty;
    let ny = tx;
    let nz = 0;
    const nLen = Math.hypot(nx, ny, nz) || 1;
    nx /= nLen;
    ny /= nLen;

    const bx = ty * nz - tz * ny;
    const by = tz * nx - tx * nz;
    const bz = tx * ny - ty * nx;

    // Slight abscission collar thickening at t=0, slender petiole waist, widening smoothly into blade base
    const collar = 0.0038 * Math.exp(-t * t * 32.0);
    const baseFlare = 0.0052 * smoothstep(0.75, 1.0, t);
    const radius = 0.0082 + collar + baseFlare;

    for (let j = 0; j <= stemSides; j++) {
      const ang = (j / stemSides) * Math.PI * 2;
      const cosA = Math.cos(ang);
      const sinA = Math.sin(ang);
      // Slightly oval cross-section (flatter on top, rounder underside)
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

  // Cap abscission base at t=0 so closeups of the broken stem end look solid
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

  // Compute clean area-weighted vertex normals separately per surface group
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
