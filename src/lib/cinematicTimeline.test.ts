import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeCinematicTimeline,
  computeForestResponsiveCropOffset,
  computeOpeningAutoProgress,
  getPhaseForProgress,
  OPENING_DURATION_SEC,
  OPENING_SETTLE_PROGRESS,
} from './cinematicTimeline.ts';

test('getPhaseForProgress maps all opening and post-contact phases monotonically', () => {
  assert.equal(getPhaseForProgress(0.0), 'blackness');
  assert.equal(getPhaseForProgress(0.1), 'tree_reveal');
  assert.equal(getPhaseForProgress(0.2), 'tree_hold');
  assert.equal(getPhaseForProgress(0.27), 'leaf_reveal');
  assert.equal(getPhaseForProgress(0.45), 'leaf_fall');
  assert.equal(getPhaseForProgress(0.62), 'water_contact');
  assert.equal(getPhaseForProgress(0.67), 'ripple_expansion');
  assert.equal(getPhaseForProgress(0.74), 'water_reflection');
  assert.equal(getPhaseForProgress(0.82), 'camera_emergence');
  assert.equal(getPhaseForProgress(0.88), 'forest_settled');
  assert.equal(getPhaseForProgress(0.93), 'acoustic_emergence');
  assert.equal(getPhaseForProgress(0.98), 'identity_reveal');
});

test('first frame is 100% black with zero tree, leaf, lake, forest, logo, or text', () => {
  const start = computeCinematicTimeline(0);
  assert.equal(start.tree.exposure, 0);
  assert.equal(start.leaf.opacity, 0);
  assert.equal(start.lake.visibility, 0);
  assert.equal(start.lake.reflectionIntensity, 0);
  assert.equal(start.world.portalProgress, 0);
  assert.equal(start.world.particlesOpacity, 0);
  assert.equal(start.acoustic.waveOpacity, 0);
  assert.equal(start.typography.quietMarkOpacity, 0);
  assert.equal(start.typography.brandOpacity, 0);
  assert.equal(start.typography.navbarVisible, false);
});

test('rebuilt opening: tree reveal -> hold -> living green leaf -> 6-8s fall with gradual color aging & camera follow', () => {
  const hold = computeCinematicTimeline(0.2);
  assert.equal(hold.tree.exposure, 1);
  assert.ok(hold.leaf.opacity > 0.9, 'hero green leaf is already part of canopy foliage');
  assert.equal(hold.leaf.attached, 1);
  assert.equal(hold.leaf.colorAging, 0, 'attached leaf begins fresh green');
  assert.equal(hold.lake.visibility, 0);

  const attachedLeaf = computeCinematicTimeline(0.29);
  assert.equal(attachedLeaf.leaf.attached, 1);
  assert.equal(attachedLeaf.leaf.colorAging, 0);
  assert.ok(attachedLeaf.camera.cameraZ < hold.camera.cameraZ, 'camera gently guides closer to leafy branch');

  const midFall = computeCinematicTimeline(0.46);
  const lateFall = computeCinematicTimeline(0.58);
  assert.equal(midFall.leaf.attached, 0);
  assert.ok(midFall.leaf.colorAging > 0.1 && midFall.leaf.colorAging < 0.75, 'leaf shifts gradually from green through olive');
  assert.ok(lateFall.leaf.colorAging > midFall.leaf.colorAging && lateFall.leaf.colorAging > 0.85, 'leaf reaches warm ochre/brown near water');
  assert.ok(midFall.camera.panNormY < attachedLeaf.camera.panNormY);
  assert.ok(lateFall.lake.visibility > 0.75);

  const detachSec = (0.308 / OPENING_SETTLE_PROGRESS) * OPENING_DURATION_SEC;
  const touchdownSec = (0.614 / OPENING_SETTLE_PROGRESS) * OPENING_DURATION_SEC;
  const fallDurationSec = touchdownSec - detachSec;
  assert.ok(fallDurationSec >= 6.0 && fallDurationSec <= 8.0);
});

test('post-contact transition sequences contact -> ripple -> reflection -> camera emergence without early UI', () => {
  const contact = computeCinematicTimeline(0.625);
  const ripple = computeCinematicTimeline(0.67);
  const reflection = computeCinematicTimeline(0.74);
  const emergence = computeCinematicTimeline(0.82);

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
  const preSound = computeCinematicTimeline(0.69);
  const soundInWater = computeCinematicTimeline(0.765);
  const acousticTopo = computeCinematicTimeline(0.825);
  const forestStabilizing = computeCinematicTimeline(0.91);
  const acoustic = computeCinematicTimeline(0.935);
  const end = computeCinematicTimeline(1.0);

  assert.equal(preSound.acoustic.waterResonance, 0);
  assert.ok(soundInWater.acoustic.waterResonance > 0.85, 'sound subtly activates inside water reflection');
  assert.equal(soundInWater.typography.brandOpacity, 0);

  assert.ok(acousticTopo.acoustic.topographyStrength > 0.85, 'forest reflection organizes into acoustic topography');
  assert.ok(acousticTopo.world.portalProgress > 0.12 && acousticTopo.world.portalProgress < 0.85);
  assert.equal(acousticTopo.typography.brandOpacity, 0);

  assert.equal(forestStabilizing.world.portalProgress, 1);
  assert.equal(forestStabilizing.world.particlesOpacity, 0);
  assert.ok(forestStabilizing.acoustic.waveOpacity > 0.8);
  assert.equal(forestStabilizing.typography.brandOpacity, 0, 'UI must remain silent while forest & acoustic structure stabilize');
  assert.equal(forestStabilizing.typography.navbarVisible, false);

  assert.ok(acoustic.acoustic.waveOpacity > 0.9);
  assert.ok(acoustic.acoustic.contourProgress > 0.85);
  assert.ok(acoustic.acoustic.spectrumIntensity > 0.35);
  assert.equal(acoustic.typography.brandOpacity, 0, 'acoustic structure forms before EcoSonic mark');

  const brandOnly = computeCinematicTimeline(0.96);
  assert.ok(brandOnly.typography.brandOpacity > brandOnly.typography.taglineOpacity);
  assert.ok(brandOnly.typography.taglineOpacity > brandOnly.typography.descriptionOpacity);

  assert.equal(end.world.portalProgress, 1);
  assert.equal(end.acoustic.waveOpacity, 1);
  assert.equal(end.acoustic.contourProgress, 1);
  assert.equal(end.acoustic.spectrumIntensity, 1);
  assert.equal(end.typography.brandOpacity, 1);
  assert.equal(end.typography.taglineOpacity, 1);
  assert.equal(end.typography.descriptionOpacity, 1);
  assert.equal(end.typography.ctaOpacity, 1);
  assert.equal(end.typography.navbarVisible, true);
  assert.ok(end.audioMix.birds === 1 && end.audioMix.insects === 1);
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

test('leaf detachment is C0/C1 continuous across p=0.308, descends monotonically, and reverses deterministically', () => {
  const before = computeCinematicTimeline(0.3079);
  const after = computeCinematicTimeline(0.3081);

  assert.equal(before.leaf.attached, 1);
  assert.equal(after.leaf.attached, 0);
  assert.ok(Math.abs(after.leaf.rollRad - before.leaf.rollRad) < 0.005, 'no roll snap at detachment');
  assert.ok(Math.abs(after.leaf.pitchRad - before.leaf.pitchRad) < 0.005, 'no pitch snap at detachment');
  assert.ok(Math.abs(after.leaf.yawRad - before.leaf.yawRad) < 0.005, 'no yaw snap at detachment');
  assert.ok(Math.abs(after.leaf.fallT - before.leaf.fallT) < 0.002, 'no vertical drop snap at detachment');
  assert.ok(Math.abs(after.leaf.airSwayX - before.leaf.airSwayX) < 0.002, 'no lateral snap at detachment');

  let prevFallT = 0;
  for (let p = 0.308; p <= 0.614; p += 0.004) {
    const s = computeCinematicTimeline(p);
    assert.ok(s.leaf.fallT >= prevFallT - 1e-6, `fallT must advance monotonically at p=${p}`);
    prevFallT = s.leaf.fallT;
  }

  const landing = computeCinematicTimeline(0.614);
  assert.equal(landing.leaf.fallT, 1);
  assert.equal(landing.leaf.xBlendToCenter, 1);
  assert.ok(Math.abs(landing.leaf.airSwayX) < 1e-6);
  assert.ok(Math.abs(landing.leaf.y - -0.22) < 1e-6);

  // Reversibility check: evaluating later -> earlier matches exact forward frame
  const _late = computeCinematicTimeline(0.86);
  assert.ok(_late.world.portalProgress > 0.6);
  const reversed = computeCinematicTimeline(0.46);
  const direct = computeCinematicTimeline(0.46);
  assert.deepEqual(reversed, direct);
});

test('water contact p=0.614 is C0/C1 continuous and settles into gentle bounded floating without spinning', () => {
  const beforeTouch = computeCinematicTimeline(0.6139);
  const atTouch = computeCinematicTimeline(0.614);
  const afterTouch = computeCinematicTimeline(0.6141);

  assert.ok(Math.abs(afterTouch.leaf.rollRad - beforeTouch.leaf.rollRad) < 0.002, 'no roll snap at contact');
  assert.ok(Math.abs(afterTouch.leaf.pitchRad - beforeTouch.leaf.pitchRad) < 0.002, 'no pitch snap at contact');
  assert.ok(Math.abs(afterTouch.leaf.yawRad - beforeTouch.leaf.yawRad) < 0.002, 'no yaw snap at contact');
  assert.ok(Math.abs(afterTouch.leaf.floatDriftX - beforeTouch.leaf.floatDriftX) < 0.0005, 'no X drift jump');
  assert.ok(Math.abs(afterTouch.leaf.floatDriftY - beforeTouch.leaf.floatDriftY) < 0.0005, 'no Y drift jump');
  assert.ok(Math.abs(afterTouch.leaf.contactDip - beforeTouch.leaf.contactDip) < 0.02, 'meniscus dip rises smoothly');
  assert.equal(atTouch.leaf.floatDriftX, 0);
  assert.equal(atTouch.leaf.waveRockStrength, 0);

  const meniscusPeak = computeCinematicTimeline(0.625);
  const settled = computeCinematicTimeline(0.665);
  const floatingMid = computeCinematicTimeline(0.71);

  assert.ok(meniscusPeak.leaf.contactDip > 0.65, 'meniscus dip cushions initial contact');
  assert.ok(settled.leaf.contactDip < meniscusPeak.leaf.contactDip, 'meniscus rebounds softly into rest');
  assert.ok(settled.leaf.waterlineDepth > 0.7, 'leaf settles cleanly onto waterline');
  assert.ok(floatingMid.leaf.opacity > 0.9, 'leaf stays visible floating during ripple & reflection start');

  // Verify bounded drift & zero spinning across entire floating window
  for (let p = 0.614; p <= 0.815; p += 0.005) {
    const s = computeCinematicTimeline(p);
    assert.ok(Math.abs(s.leaf.floatDriftX) <= 0.03, `bounded X drift at p=${p}`);
    assert.ok(Math.abs(s.leaf.floatDriftY) <= 0.015, `bounded Y drift at p=${p}`);
    assert.ok(Math.abs(s.leaf.floatYawOffsetRad) <= 0.08, `no spinning at p=${p}`);
    assert.equal(s.leaf.heightNorm, 0);
  }
});

test('dispersive ripple expands from contact, decays smoothly before emergence, and reverses deterministically', () => {
  const preContact = computeCinematicTimeline(0.60);
  const earlyRipple = computeCinematicTimeline(0.625);
  const midRipple = computeCinematicTimeline(0.685);
  const decayingRipple = computeCinematicTimeline(0.785);
  const settledPond = computeCinematicTimeline(0.86);

  assert.equal(preContact.leaf.impactRippleStrength, 0);
  assert.ok(earlyRipple.leaf.impactRippleStrength > 0.4);
  assert.ok(midRipple.leaf.impactRippleStrength > 0.9);
  assert.ok(midRipple.leaf.impactRippleProgress > earlyRipple.leaf.impactRippleProgress);
  assert.ok(decayingRipple.leaf.impactRippleStrength < midRipple.leaf.impactRippleStrength * 0.65, 'ripple decays smoothly');
  assert.equal(settledPond.leaf.impactRippleStrength, 0);

  // Reverse scrub from emergence back to floating contact matches direct evaluation
  const _emerged = computeCinematicTimeline(0.92);
  assert.equal(_emerged.phase, 'acoustic_emergence');
  assert.deepEqual(computeCinematicTimeline(0.685), midRipple);
});


