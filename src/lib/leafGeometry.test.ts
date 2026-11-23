import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildLeafGeometryBuffers,
  evalLeafBladeOutline,
  evalLeafBladeVertex,
  LEAF_STEM_TIP_LOCAL,
} from './leafGeometry.ts';

test('evalLeafBladeOutline produces asymmetrical pinnately-lobed oak profile with deep sinuses', () => {
  const base = evalLeafBladeOutline(0.0);
  const lobe = evalLeafBladeOutline(0.42);
  const sinus = evalLeafBladeOutline(0.51);
  const tip = evalLeafBladeOutline(1.0);

  assert.ok(lobe.halfWidthTop > 0.25 && lobe.halfWidthBottom > 0.25);
  assert.ok(lobe.halfWidthTop !== lobe.halfWidthBottom, 'natural left/right botanical asymmetry');
  assert.ok(sinus.halfWidthTop < lobe.halfWidthTop * 0.72, 'deep oak sinus between lobes');
  assert.ok(base.halfWidthTop < 0.04);
  assert.ok(tip.halfWidthTop < 0.02);
});

test('evalLeafBladeVertex preserves strictly positive physical lamina thickness and raised underside midrib', () => {
  for (let i = 0; i <= 20; i++) {
    const s = i / 20;
    for (let j = -5; j <= 5; j++) {
      const w = j / 5;
      const top = evalLeafBladeVertex(s, w, 1);
      const bot = evalLeafBladeVertex(s, w, -1);
      assert.ok(top.z > bot.z, `top z must exceed bottom z at s=${s}, w=${w}`);
      assert.ok(top.z - bot.z >= 0.0025, `physical thickness >= 0.0025 at s=${s}, w=${w}`);
    }
  }

  const midribTop = evalLeafBladeVertex(0.35, 0, 1);
  const midribBot = evalLeafBladeVertex(0.35, 0, -1);
  const laminaTop = evalLeafBladeVertex(0.35, 0.55, 1);
  assert.ok(midribTop.opticalThickness > laminaTop.opticalThickness, 'midrib thicker than inter-vein lamina');
  assert.ok(midribTop.z - midribBot.z > 0.012, 'midrib has volumetric rib thickness');
});

test('buildLeafGeometryBuffers creates closed volumetric mesh with finite unit normals and valid indices', () => {
  const data = buildLeafGeometryBuffers(56, 14);
  assert.ok(data.vertexCount > 1500);
  assert.ok(data.triangleCount > 3000);
  assert.equal(data.indices.length, data.triangleCount * 3);

  for (let i = 0; i < data.indices.length; i++) {
    assert.ok(data.indices[i] < data.vertexCount, 'all indices within vertex bounds');
  }

  let topNormalZSum = 0;
  let topCount = 0;
  let botNormalZSum = 0;
  let botCount = 0;
  let minStemX = Infinity;

  for (let v = 0; v < data.vertexCount; v++) {
    const x = data.positions[v * 3];
    const y = data.positions[v * 3 + 1];
    const z = data.positions[v * 3 + 2];
    const nx = data.normals[v * 3];
    const ny = data.normals[v * 3 + 1];
    const nz = data.normals[v * 3 + 2];
    assert.ok(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z));
    assert.ok(Number.isFinite(nx) && Number.isFinite(ny) && Number.isFinite(nz));

    const len = Math.hypot(nx, ny, nz);
    assert.ok(Math.abs(len - 1) < 1e-4, `normal length should be ~1, got ${len}`);

    if (data.leafParts[v] > 0.8) {
      topNormalZSum += nz;
      topCount++;
    } else if (data.leafParts[v] < -0.8) {
      botNormalZSum += nz;
      botCount++;
    } else if (data.leafParts[v] === 0) {
      minStemX = Math.min(minStemX, x);
    }
  }

  assert.ok(topNormalZSum / topCount > 0.75, 'adaxial surface normals face +Z');
  assert.ok(botNormalZSum / botCount < -0.75, 'abaxial surface normals face -Z');
  assert.ok(Math.abs(minStemX - LEAF_STEM_TIP_LOCAL.x) < 0.02, 'petiole reaches abscission tip');
});
