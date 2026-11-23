import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACOUSTIC_SPECTRUM_BAND_COUNT,
  computeAmbientEcologicalSpectrum,
  createAcousticSpectrumSample,
} from './soundscapeEngine.ts';

test('computeAmbientEcologicalSpectrum writes bounded normalized frequency bands in-place with zero out-of-range spikes', () => {
  const sample = createAcousticSpectrumSample();
  assert.equal(sample.bands.length, ACOUSTIC_SPECTRUM_BAND_COUNT);

  const waterHeavy = computeAmbientEcologicalSpectrum(
    2.4,
    { water: 0.9, wind: 0.2, birds: 0.0, insects: 0.0 },
    sample
  );
  assert.equal(waterHeavy.hasLiveAudio, false);
  assert.ok(waterHeavy.midBand > waterHeavy.highBand, 'water-dominant mix peaks in mid frequencies');
  assert.ok(waterHeavy.amplitude > 0 && waterHeavy.amplitude <= 1);

  for (let i = 0; i < waterHeavy.bands.length; i++) {
    assert.ok(
      Number.isFinite(waterHeavy.bands[i]) && waterHeavy.bands[i] >= 0 && waterHeavy.bands[i] <= 1,
      `band ${i} is bounded in [0, 1]`
    );
  }

  const dawnSample = createAcousticSpectrumSample();
  const dawnChorus = computeAmbientEcologicalSpectrum(
    8.7,
    { water: 0.3, wind: 0.2, birds: 0.95, insects: 0.8 },
    dawnSample
  );
  assert.ok(dawnChorus.highBand > waterHeavy.highBand, 'birds/insects raise high-frequency band energy');
  assert.ok(dawnChorus.peakFreqNorm > waterHeavy.peakFreqNorm, 'spectral centroid shifts upward with dawn chorus');
});
