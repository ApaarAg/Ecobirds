import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEMO_DETECTIONS,
  DEMO_DISTURBANCES,
  DEMO_HABITAT_PRESETS,
  DEMO_SESSIONS,
} from '../data/demoFixtures';
import {
  clampInputGainDb,
  computeAnalyserMetrics,
  dbToLinearGain,
  filterRecentDetections,
  formatGainDb,
  formatVisualizerCaption,
  getDisturbancesForSession,
  MAX_INPUT_GAIN_DB,
  MIN_INPUT_GAIN_DB,
  resolveSessionForPreset,
} from './observatory';

test('resolveSessionForPreset dynamically maps presets to actual sessions without hardcoded IDs', () => {
  const rain = resolveSessionForPreset(
    'temperate-rainforest',
    DEMO_SESSIONS,
    DEMO_DETECTIONS,
    DEMO_HABITAT_PRESETS
  );
  assert.equal(rain?.id, 'ses-2026-1121-a');

  const wetland = resolveSessionForPreset(
    'boreal-wetland',
    DEMO_SESSIONS,
    DEMO_DETECTIONS,
    DEMO_HABITAT_PRESETS
  );
  assert.equal(wetland?.id, 'ses-2026-1120-b');

  const ridge = resolveSessionForPreset(
    'subalpine-ridge',
    DEMO_SESSIONS,
    DEMO_DETECTIONS,
    DEMO_HABITAT_PRESETS
  );
  assert.equal(ridge?.id, 'ses-2026-1119-c');
});

test('resolveSessionForPreset falls back cleanly to siteName match or null when sessions are absent', () => {
  // No detections present, resolves via preset label match on session siteName
  const bySite = resolveSessionForPreset(
    'boreal-wetland',
    DEMO_SESSIONS,
    [],
    DEMO_HABITAT_PRESETS
  );
  assert.equal(bySite?.id, 'ses-2026-1120-b');

  // Empty sessions returns null rather than fabricating a session ID
  const empty = resolveSessionForPreset(
    'temperate-rainforest',
    [],
    DEMO_DETECTIONS,
    DEMO_HABITAT_PRESETS
  );
  assert.equal(empty, null);
});

test('filterRecentDetections respects habitatPreset, minConfidenceThreshold, and descending time order', () => {
  const filtered = filterRecentDetections(DEMO_DETECTIONS, 'temperate-rainforest', 0.85, 5);
  assert.ok(filtered.length > 0);
  assert.ok(filtered.every((d) => d.habitatPreset === 'temperate-rainforest'));
  assert.ok(filtered.every((d) => d.confidenceScore >= 0.85));

  for (let i = 1; i < filtered.length; i += 1) {
    assert.ok(Date.parse(filtered[i - 1].timestampIso) >= Date.parse(filtered[i].timestampIso));
  }

  const strict = filterRecentDetections(DEMO_DETECTIONS, 'temperate-rainforest', 0.99, 5);
  assert.equal(strict.length, 0);
});

test('getDisturbancesForSession returns session-scoped disturbances or empty array when sessionId is null', () => {
  const none = getDisturbancesForSession(DEMO_DISTURBANCES, null, 4);
  assert.equal(none.length, 0);

  const wet = getDisturbancesForSession(DEMO_DISTURBANCES, 'ses-2026-1120-b', 4);
  assert.equal(wet.length, 2);
  assert.ok(wet.every((e) => e.sessionId === 'ses-2026-1120-b'));
});

test('input gain clamping, dB-to-linear conversion, and formatting are mathematically accurate', () => {
  assert.equal(clampInputGainDb(-50), MIN_INPUT_GAIN_DB);
  assert.equal(clampInputGainDb(50), MAX_INPUT_GAIN_DB);
  assert.equal(clampInputGainDb(Number.NaN), 0);

  assert.equal(dbToLinearGain(0), 1);
  assert.ok(Math.abs(dbToLinearGain(6) - 1.99526) < 0.001);
  assert.ok(Math.abs(dbToLinearGain(-6) - 0.50118) < 0.001);

  assert.equal(formatGainDb(0), '0.0 dB');
  assert.equal(formatGainDb(6), '+6.0 dB');
  assert.equal(formatGainDb(-6.5), '-6.5 dB');
});

test('formatVisualizerCaption reflects actual sampleRateHz, fftSize, and input mode', () => {
  const demoCap = formatVisualizerCaption({
    sampleRateHz: 44100,
    fftSize: 1024,
    isMicrophoneActive: false,
  });
  assert.match(demoCap, /44\.1 kHz/);
  assert.match(demoCap, /1024-PT FFT/);
  assert.match(demoCap, /DEMO FIXTURE/);

  const micCap = formatVisualizerCaption({
    sampleRateHz: 48000,
    fftSize: 4096,
    isMicrophoneActive: true,
  });
  assert.match(micCap, /48\.0 kHz/);
  assert.match(micCap, /4096-PT FFT/);
  assert.match(micCap, /LOCAL MIC PREVIEW/);
});

test('computeAnalyserMetrics calculates dBFS, activityPct, and peak frequency from DSP buffers', () => {
  const timeDomain = new Float32Array(256).fill(0.5);
  const freqBins = new Uint8Array(128).fill(0);
  freqBins[32] = 220; // 32/128 of Nyquist (24000 Hz) = 6000 Hz

  const metrics = computeAnalyserMetrics(timeDomain, freqBins, 48000);
  assert.ok(Math.abs(metrics.rmsLevelDbfs - -6.0) < 0.2);
  assert.equal(metrics.peakFrequencyHz, 6000);
  assert.equal(metrics.activityPct, 100);

  const silence = computeAnalyserMetrics(new Float32Array(256), new Uint8Array(128), 48000);
  assert.equal(silence.rmsLevelDbfs, -96);
  assert.equal(silence.peakFrequencyHz, 0);
  assert.equal(silence.activityPct, 0);
});
