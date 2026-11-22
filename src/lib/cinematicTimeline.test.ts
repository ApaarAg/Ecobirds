import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeCinematicTimeline,
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

  assert.ok(emergence.world.portalProgress > 0.25 && emergence.world.portalProgress < 0.85);
  assert.ok(emergence.audioMix.wind > 0.3);
  assert.equal(emergence.typography.brandOpacity, 0, 'UI must wait until forest & sound settle');
  assert.equal(emergence.typography.navbarVisible, false);
});

test('forest settles -> acoustic contours form -> EcoSonic identity and UI emerge last', () => {
  const forestOnly = computeCinematicTimeline(0.885);
  const acoustic = computeCinematicTimeline(0.94);
  const end = computeCinematicTimeline(1.0);

  assert.equal(forestOnly.world.portalProgress, 1);
  assert.equal(forestOnly.world.particlesOpacity, 0);
  assert.equal(forestOnly.acoustic.waveOpacity, 0);
  assert.equal(forestOnly.typography.brandOpacity, 0);
  assert.equal(forestOnly.typography.navbarVisible, false);

  assert.ok(acoustic.acoustic.waveOpacity > 0.7);
  assert.ok(acoustic.acoustic.contourProgress > 0.4);
  assert.equal(acoustic.typography.brandOpacity, 0, 'acoustic structure forms before EcoSonic mark');

  assert.equal(end.world.portalProgress, 1);
  assert.equal(end.acoustic.waveOpacity, 1);
  assert.equal(end.acoustic.contourProgress, 1);
  assert.equal(end.acoustic.spectrumIntensity, 1);
  assert.equal(end.typography.brandOpacity, 1);
  assert.equal(end.typography.taglineOpacity, 1);
  assert.equal(end.typography.ctaOpacity, 1);
  assert.equal(end.typography.navbarVisible, true);
  assert.ok(end.audioMix.birds === 1 && end.audioMix.insects === 1);
});
