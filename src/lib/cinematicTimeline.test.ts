import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeCinematicTimeline,
  computeForestResponsiveCropOffset,
  computeHeroWaterCropOffset,
  getPhaseForProgress,
  HERO_WATER_TEX_ASPECT,
} from './cinematicTimeline.ts';

test('getPhaseForProgress maps all opening and post-contact phases monotonically', () => {
  assert.equal(getPhaseForProgress(0.0), 'tree_reveal');
  assert.equal(getPhaseForProgress(0.14), 'tree_hold');
  assert.equal(getPhaseForProgress(0.28), 'leaf_reveal');
  assert.equal(getPhaseForProgress(0.5), 'leaf_fall');
  assert.equal(getPhaseForProgress(0.66), 'water_contact');
  assert.equal(getPhaseForProgress(0.71), 'ripple_expansion');
  assert.equal(getPhaseForProgress(0.77), 'water_reflection');
  assert.equal(getPhaseForProgress(0.84), 'camera_emergence');
  assert.equal(getPhaseForProgress(0.91), 'forest_settled');
  assert.equal(getPhaseForProgress(0.945), 'acoustic_emergence');
  assert.equal(getPhaseForProgress(0.985), 'identity_reveal');
});

test('scroll=0 opens directly into the live forest environment with zero premature UI or floating leaf', () => {
  const start = computeCinematicTimeline(0);
  assert.equal(start.tree.exposure, 1);
  assert.equal(start.tree.openingZoom, 1);
  assert.equal(start.tree.foliagePresence, 0);
  assert.equal(start.leaf.opacity, 0);
  assert.equal(start.lake.visibility, 0);
  assert.equal(start.world.portalProgress, 0);
  assert.equal(start.acoustic.waveOpacity, 0);
  assert.equal(start.typography.quietMarkOpacity, 0);
  assert.equal(start.typography.brandOpacity, 0);
  assert.equal(start.typography.navbarVisible, false);
});

test('continuous scroll progression: persistent forest -> deeper canopy & keyed oak leaf -> stem flex -> camera-followed fall', () => {
  const opening = computeCinematicTimeline(0.04);
  assert.equal(opening.tree.exposure, 1);
  assert.equal(opening.leaf.opacity, 0, 'oak leaf does not appear floating over wide opening forest');
  assert.equal(opening.lake.visibility, 0);

  const attachedLeaf = computeCinematicTimeline(0.34);
  assert.equal(attachedLeaf.tree.exposure, 1, 'leandro-rossi forest remains active behind oak branch');
  assert.ok(attachedLeaf.tree.foliagePresence > 0.95);
  assert.equal(attachedLeaf.leaf.attached, 1);
  assert.ok(attachedLeaf.leaf.opacity > 0.95, 'oak leaf sits physically attached inside oak foliage');
  assert.ok(attachedLeaf.leaf.stemFlex > 0.1, 'stem flex builds gently before abscission');

  const midFall = computeCinematicTimeline(0.5);
  const lateFall = computeCinematicTimeline(0.61);
  assert.equal(midFall.leaf.attached, 0);
  assert.ok(midFall.tree.depthBlur > 0.5, 'background falls out of focus while tracking falling leaf');
  assert.ok(midFall.camera.panNormY < attachedLeaf.camera.panNormY);
  assert.ok(midFall.tree.openingPanV < attachedLeaf.tree.openingPanV, 'leandro-rossi pans downward toward its pond');
  assert.ok(lateFall.lake.visibility > 0.75);
});

test('post-contact transition sequences contact -> ripple -> reflection -> camera emergence without early UI', () => {
  const contact = computeCinematicTimeline(0.655);
  const ripple = computeCinematicTimeline(0.71);
  const reflection = computeCinematicTimeline(0.77);
  const emergence = computeCinematicTimeline(0.84);

  assert.equal(contact.leaf.heightNorm, 0);
  assert.ok(contact.leaf.impactRippleStrength > 0.4);
  assert.equal(contact.world.portalProgress, 0);
  assert.equal(contact.typography.brandOpacity, 0);
  assert.equal(contact.typography.navbarVisible, false);

  assert.ok(ripple.leaf.impactRippleProgress > contact.leaf.impactRippleProgress);
  assert.equal(ripple.world.portalProgress, 0);
  assert.equal(ripple.typography.brandOpacity, 0);

  assert.ok(reflection.lake.reflectionIntensity > 0.4, 'reflection appears inside water ripples');
  assert.equal(reflection.typography.brandOpacity, 0);
  assert.ok(reflection.audioMix.water > 0.5);

  assert.ok(emergence.world.portalProgress > 0.08 && emergence.world.portalProgress < 0.85);
  assert.ok(emergence.audioMix.wind > 0.3);
  assert.equal(emergence.typography.brandOpacity, 0, 'UI must wait until forest & sound settle');
  assert.equal(emergence.typography.navbarVisible, false);
});

test('water resonance -> acoustic topography -> forest settles -> acoustic contours -> staggered EcoSonic identity', () => {
  const preSound = computeCinematicTimeline(0.71);
  const soundInWater = computeCinematicTimeline(0.795);
  const acousticTopo = computeCinematicTimeline(0.84);
  const forestStabilizing = computeCinematicTimeline(0.92);
  const acoustic = computeCinematicTimeline(0.945);
  const end = computeCinematicTimeline(1.0);

  assert.equal(preSound.acoustic.waterResonance, 0);
  assert.ok(soundInWater.acoustic.waterResonance > 0.25, 'sound subtly activates inside water reflection');
  assert.equal(soundInWater.typography.brandOpacity, 0);

  assert.ok(acousticTopo.acoustic.topographyStrength > 0.75, 'forest reflection organizes into acoustic topography');
  assert.ok(acousticTopo.world.portalProgress > 0.12 && acousticTopo.world.portalProgress < 0.85);
  assert.equal(acousticTopo.typography.brandOpacity, 0);

  assert.equal(forestStabilizing.world.portalProgress, 1);
  assert.equal(forestStabilizing.world.particlesOpacity, 0);
  assert.ok(forestStabilizing.acoustic.waveOpacity > 0.5);
  assert.equal(forestStabilizing.typography.brandOpacity, 0, 'UI must remain silent while forest & acoustic structure stabilize');
  assert.equal(forestStabilizing.typography.navbarVisible, false);

  assert.ok(acoustic.acoustic.waveOpacity > 0.85);
  assert.ok(acoustic.acoustic.contourProgress > 0.8);
  assert.ok(acoustic.acoustic.spectrumIntensity > 0.25);
  assert.ok(acoustic.typography.brandOpacity < 0.2, 'acoustic structure forms before EcoSonic mark');

  const brandOnly = computeCinematicTimeline(0.962);
  assert.ok(brandOnly.typography.brandOpacity > brandOnly.typography.taglineOpacity);
  assert.ok(brandOnly.typography.taglineOpacity > brandOnly.typography.descriptionOpacity);

  assert.equal(end.world.portalProgress, 1);
  assert.ok(end.acoustic.waveOpacity >= 0.88);
  assert.equal(end.acoustic.contourProgress, 1);
  assert.equal(end.acoustic.spectrumIntensity, 1);
  assert.equal(end.typography.brandOpacity, 1);
  assert.equal(end.typography.taglineOpacity, 1);
  assert.equal(end.typography.descriptionOpacity, 1);
  assert.equal(end.typography.ctaOpacity, 1);
  assert.equal(end.typography.navbarVisible, true);
  assert.ok(end.audioMix.birds > 0.6 && end.audioMix.insects > 0.35);
});

test('computeForestResponsiveCropOffset preserves left-center water reflection on portrait mobile/tablet and keeps desktop balanced', () => {
  const texAspect = 3840 / 2143;
  const desktop = computeForestResponsiveCropOffset(1440 / 900, texAspect);
  assert.equal(desktop.xShift, 0);
  assert.equal(desktop.yShift, 0);

  const tablet = computeForestResponsiveCropOffset(768 / 1024, texAspect);
  assert.ok(tablet.xShift < -0.05 && tablet.xShift >= -0.11);
  assert.equal(tablet.yShift, 0);

  const mobile = computeForestResponsiveCropOffset(390 / 844, texAspect);
  assert.ok(mobile.xShift <= -0.105 && mobile.xShift >= -0.12);
  assert.equal(mobile.yShift, 0);

  const ultrawide = computeForestResponsiveCropOffset(2560 / 1080, texAspect);
  assert.equal(ultrawide.xShift, 0);
  assert.ok(ultrawide.yShift < 0 && ultrawide.yShift >= -0.04);
});

test('computeHeroWaterCropOffset preserves the central floating leaf, water reflections, and stones across desktop and mobile', () => {
  const desktop = computeHeroWaterCropOffset(1440 / 900, HERO_WATER_TEX_ASPECT);
  assert.equal(desktop.xShift, 0);
  assert.ok(desktop.yShift <= 0 && desktop.yShift >= -0.015);

  const widescreen = computeHeroWaterCropOffset(1920 / 1080, HERO_WATER_TEX_ASPECT);
  assert.equal(widescreen.xShift, 0);
  assert.ok(widescreen.yShift < 0 && widescreen.yShift >= -0.015);

  const tablet = computeHeroWaterCropOffset(768 / 1024, HERO_WATER_TEX_ASPECT);
  assert.ok(tablet.xShift > 0 && tablet.xShift <= 0.012);
  assert.equal(tablet.yShift, 0);

  const mobile = computeHeroWaterCropOffset(390 / 844, HERO_WATER_TEX_ASPECT);
  assert.ok(mobile.xShift > 0.01 && mobile.xShift <= 0.012);
  assert.equal(mobile.yShift, 0);
});

test('leaf detachment is C0/C1 continuous across p=0.36, descends monotonically, and reverses deterministically', () => {
  const before = computeCinematicTimeline(0.3599);
  const after = computeCinematicTimeline(0.3601);

  assert.equal(before.leaf.attached, 1);
  assert.equal(after.leaf.attached, 0);
  assert.ok(Math.abs(after.leaf.rollRad - before.leaf.rollRad) < 0.008, 'no roll snap at detachment');
  assert.ok(Math.abs(after.leaf.pitchRad - before.leaf.pitchRad) < 0.008, 'no pitch snap at detachment');
  assert.ok(Math.abs(after.leaf.yawRad - before.leaf.yawRad) < 0.008, 'no yaw snap at detachment');
  assert.ok(Math.abs(after.leaf.fallT - before.leaf.fallT) < 0.002, 'no vertical drop snap at detachment');
  assert.ok(Math.abs(after.leaf.airSwayX - before.leaf.airSwayX) < 0.002, 'no lateral snap at detachment');

  let prevFallT = 0;
  for (let p = 0.36; p <= 0.64; p += 0.004) {
    const s = computeCinematicTimeline(p);
    assert.ok(s.leaf.fallT >= prevFallT - 1e-6, `fallT must advance monotonically at p=${p}`);
    prevFallT = s.leaf.fallT;
  }

  const landing = computeCinematicTimeline(0.64);
  assert.equal(landing.leaf.fallT, 1);
  assert.equal(landing.leaf.xBlendToCenter, 1);
  assert.ok(Math.abs(landing.leaf.airSwayX) < 1e-6);
  assert.ok(Math.abs(landing.leaf.y - -0.22) < 1e-6);

  // Reversibility check: scrubbing backward matches forward state deterministically
  const _late = computeCinematicTimeline(0.86);
  assert.ok(_late.world.portalProgress > 0.6);
  const reversed = computeCinematicTimeline(0.46);
  const direct = computeCinematicTimeline(0.46);
  assert.deepEqual(reversed, direct);
});

test('water contact p=0.64 is C0/C1 continuous and settles into gentle bounded floating without spinning', () => {
  const beforeTouch = computeCinematicTimeline(0.6399);
  const atTouch = computeCinematicTimeline(0.64);
  const afterTouch = computeCinematicTimeline(0.6401);

  assert.ok(Math.abs(afterTouch.leaf.rollRad - beforeTouch.leaf.rollRad) < 0.002, 'no roll snap at contact');
  assert.ok(Math.abs(afterTouch.leaf.pitchRad - beforeTouch.leaf.pitchRad) < 0.002, 'no pitch snap at contact');
  assert.ok(Math.abs(afterTouch.leaf.yawRad - beforeTouch.leaf.yawRad) < 0.002, 'no yaw snap at contact');
  assert.ok(Math.abs(afterTouch.leaf.floatDriftX - beforeTouch.leaf.floatDriftX) < 0.0005, 'no X drift jump');
  assert.ok(Math.abs(afterTouch.leaf.floatDriftY - beforeTouch.leaf.floatDriftY) < 0.0005, 'no Y drift jump');
  assert.ok(Math.abs(afterTouch.leaf.contactDip - beforeTouch.leaf.contactDip) < 0.02, 'meniscus dip rises smoothly');
  assert.equal(atTouch.leaf.floatDriftX, 0);
  assert.equal(atTouch.leaf.waveRockStrength, 0);

  const meniscusPeak = computeCinematicTimeline(0.658);
  const settled = computeCinematicTimeline(0.695);
  const floatingMid = computeCinematicTimeline(0.74);

  assert.ok(meniscusPeak.leaf.contactDip > 0.6, 'meniscus dip cushions initial contact');
  assert.ok(settled.leaf.contactDip < meniscusPeak.leaf.contactDip, 'meniscus rebounds softly into rest');
  assert.ok(settled.leaf.waterlineDepth > 0.7, 'leaf settles cleanly onto waterline');
  assert.ok(floatingMid.leaf.opacity > 0.9, 'leaf stays visible floating during ripple & reflection start');

  // Verify bounded drift & zero spinning across entire floating window
  for (let p = 0.64; p <= 0.815; p += 0.005) {
    const s = computeCinematicTimeline(p);
    assert.ok(Math.abs(s.leaf.floatDriftX) <= 0.03, `bounded X drift at p=${p}`);
    assert.ok(Math.abs(s.leaf.floatDriftY) <= 0.015, `bounded Y drift at p=${p}`);
    assert.ok(Math.abs(s.leaf.floatYawOffsetRad) <= 0.08, `no spinning at p=${p}`);
    assert.equal(s.leaf.heightNorm, 0);
  }
});

test('dispersive ripple expands from contact, decays smoothly before emergence, and reverses deterministically', () => {
  const preContact = computeCinematicTimeline(0.625);
  const earlyRipple = computeCinematicTimeline(0.654);
  const midRipple = computeCinematicTimeline(0.71);
  const decayingRipple = computeCinematicTimeline(0.81);
  const settledPond = computeCinematicTimeline(0.87);

  assert.equal(preContact.leaf.impactRippleStrength, 0);
  assert.ok(earlyRipple.leaf.impactRippleStrength > 0.4);
  assert.ok(midRipple.leaf.impactRippleStrength > 0.9);
  assert.ok(midRipple.leaf.impactRippleProgress > earlyRipple.leaf.impactRippleProgress);
  assert.ok(decayingRipple.leaf.impactRippleStrength < midRipple.leaf.impactRippleStrength * 0.65, 'ripple decays smoothly');
  assert.equal(settledPond.leaf.impactRippleStrength, 0);

  // Reverse scrub from emergence back to floating contact matches direct evaluation
  const _emerged = computeCinematicTimeline(0.945);
  assert.equal(_emerged.phase, 'acoustic_emergence');
  assert.deepEqual(computeCinematicTimeline(0.71), midRipple);
});
