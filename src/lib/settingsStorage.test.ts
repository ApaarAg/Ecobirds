import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSettingsExportPayload,
  clearSettingsInStorage,
  DEFAULT_APPEARANCE,
  DEFAULT_AUDIO_PREFS,
  DEFAULT_BACKEND_CONFIG,
  deserializeSettings,
  getDefaultSettings,
  loadSettingsFromStorage,
  saveSettingsToStorage,
  serializeSettings,
  SETTINGS_SCHEMA_VERSION,
  SETTINGS_STORAGE_KEY,
  validateBackendFormInput,
  validateConfidenceThreshold,
  validateReconnectIntervalMs,
  type StorageLike,
} from './settingsStorage';

function createMemoryStorage(initial: Record<string, string> = {}): {
  storage: StorageLike;
  setCalls: number;
  data: Map<string, string>;
} {
  const data = new Map<string, string>(Object.entries(initial));
  const state = {
    setCalls: 0,
    data,
    storage: {
      getItem(key: string) {
        return data.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        state.setCalls += 1;
        data.set(key, value);
      },
      removeItem(key: string) {
        data.delete(key);
      },
    } satisfies StorageLike,
  };
  return state;
}

test('serializeSettings and deserializeSettings round-trip valid v2 settings and strip secrets', () => {
  const input = {
    appearance: {
      theme: 'field-light' as const,
      reducedMotionOverride: true,
      showScientificNamesFirst: true,
    },
    audioPrefs: {
      preferredDeviceId: 'mic-usb-01',
      sampleRateHz: 44100 as const,
      fftSize: 4096 as const,
      minConfidenceThreshold: 0.8,
      noiseSuppression: true,
      autoGainControl: true,
    },
    backendConfig: {
      apiBaseUrl: 'https://api.ecosonic.org/v3',
      wsStreamUrl: 'wss://stream.ecosonic.org/ws',
      reconnectIntervalMs: 5000,
      mode: 'backend_ready' as const,
      apiKey: 'should-be-stripped',
      secretToken: 'never-persisted',
    },
  };

  const raw = serializeSettings(input, '2026-11-23T00:00:00.000Z');
  assert.equal(raw.includes('should-be-stripped'), false);
  assert.equal(raw.includes('never-persisted'), false);

  const parsed = JSON.parse(raw);
  assert.equal(parsed.version, SETTINGS_SCHEMA_VERSION);

  const restored = deserializeSettings(raw);
  assert.equal(restored.recoveredFromCorruption, false);
  assert.equal(restored.migratedFromVersion, null);
  assert.deepEqual(restored.settings.appearance, input.appearance);
  assert.deepEqual(restored.settings.audioPrefs, input.audioPrefs);
  assert.deepEqual(restored.settings.backendConfig, {
    apiBaseUrl: 'https://api.ecosonic.org/v3',
    wsStreamUrl: 'wss://stream.ecosonic.org/ws',
    reconnectIntervalMs: 5000,
    mode: 'backend_ready',
  });
});

test('deserializeSettings safely recovers defaults on corrupted JSON and invalid structures', () => {
  const defaults = getDefaultSettings();

  for (const bad of ['{broken-json', '[]', 'null', '42', '"hello"']) {
    const res = deserializeSettings(bad);
    assert.equal(res.recoveredFromCorruption, true);
    assert.deepEqual(res.settings, defaults);
  }

  const empty = deserializeSettings(null);
  assert.equal(empty.recoveredFromCorruption, false);
  assert.deepEqual(empty.settings, defaults);
});

test('deserializeSettings restores field-level defaults when individual values are invalid', () => {
  const partialBad = JSON.stringify({
    version: SETTINGS_SCHEMA_VERSION,
    appearance: {
      theme: 'neon-pink',
      reducedMotionOverride: 'yes',
      showScientificNamesFirst: true,
    },
    audioPrefs: {
      preferredDeviceId: '   ',
      sampleRateHz: 96000,
      fftSize: 512,
      minConfidenceThreshold: 1.75,
      noiseSuppression: true,
      autoGainControl: 'nope',
    },
    backendConfig: {
      apiBaseUrl: 'ftp://invalid.example.com',
      wsStreamUrl: 'https://wrong-protocol.example.com',
      reconnectIntervalMs: 150,
      mode: 'invalid_mode',
    },
  });

  const res = deserializeSettings(partialBad);
  assert.equal(res.settings.appearance.theme, DEFAULT_APPEARANCE.theme);
  assert.equal(res.settings.appearance.reducedMotionOverride, DEFAULT_APPEARANCE.reducedMotionOverride);
  assert.equal(res.settings.appearance.showScientificNamesFirst, true);

  assert.equal(res.settings.audioPrefs.preferredDeviceId, DEFAULT_AUDIO_PREFS.preferredDeviceId);
  assert.equal(res.settings.audioPrefs.sampleRateHz, DEFAULT_AUDIO_PREFS.sampleRateHz);
  assert.equal(res.settings.audioPrefs.fftSize, DEFAULT_AUDIO_PREFS.fftSize);
  assert.equal(res.settings.audioPrefs.minConfidenceThreshold, DEFAULT_AUDIO_PREFS.minConfidenceThreshold);
  assert.equal(res.settings.audioPrefs.noiseSuppression, true);
  assert.equal(res.settings.audioPrefs.autoGainControl, DEFAULT_AUDIO_PREFS.autoGainControl);

  assert.equal(res.settings.backendConfig.apiBaseUrl, DEFAULT_BACKEND_CONFIG.apiBaseUrl);
  assert.equal(res.settings.backendConfig.wsStreamUrl, DEFAULT_BACKEND_CONFIG.wsStreamUrl);
  assert.equal(res.settings.backendConfig.reconnectIntervalMs, DEFAULT_BACKEND_CONFIG.reconnectIntervalMs);
  assert.equal(res.settings.backendConfig.mode, DEFAULT_BACKEND_CONFIG.mode);
});

test('deserializeSettings migrates v0/v1 schemas cleanly to v2', () => {
  const legacyV0 = JSON.stringify({
    theme: 'field-light',
    showScientificNamesFirst: true,
    audio: {
      sampleRateHz: 44100,
      confidenceThreshold: 0.85,
    },
    backend: {
      apiBaseUrl: 'https://legacy.ecosonic.org',
      mode: 'backend_ready',
    },
  });

  const resV0 = deserializeSettings(legacyV0);
  assert.equal(resV0.migratedFromVersion, 0);
  assert.equal(resV0.settings.appearance.theme, 'field-light');
  assert.equal(resV0.settings.appearance.showScientificNamesFirst, true);
  assert.equal(resV0.settings.audioPrefs.sampleRateHz, 44100);
  assert.equal(resV0.settings.audioPrefs.minConfidenceThreshold, 0.85);
  assert.equal(resV0.settings.backendConfig.apiBaseUrl, 'https://legacy.ecosonic.org');
  assert.equal(resV0.settings.backendConfig.mode, 'backend_ready');

  const legacyV1 = JSON.stringify({
    version: 1,
    appearance: { theme: 'field-light' },
    audioPrefs: { fftSize: 1024 },
    backendConfig: { reconnectIntervalMs: 8000 },
  });

  const resV1 = deserializeSettings(legacyV1);
  assert.equal(resV1.migratedFromVersion, 1);
  assert.equal(resV1.settings.appearance.theme, 'field-light');
  assert.equal(resV1.settings.audioPrefs.fftSize, 1024);
  assert.equal(resV1.settings.backendConfig.reconnectIntervalMs, 8000);
});

test('numerical range and backend form validators enforce independent field errors', () => {
  assert.equal(validateConfidenceThreshold(0.1).valid, true);
  assert.equal(validateConfidenceThreshold(0.95).valid, true);
  assert.equal(validateConfidenceThreshold(0.05).valid, false);
  assert.equal(validateConfidenceThreshold(1.0).valid, false);
  assert.equal(validateConfidenceThreshold(Number.NaN).valid, false);

  assert.equal(validateReconnectIntervalMs(500).valid, true);
  assert.equal(validateReconnectIntervalMs('3000').valid, true);
  assert.equal(validateReconnectIntervalMs(499).valid, false);
  assert.equal(validateReconnectIntervalMs(60001).valid, false);
  assert.equal(validateReconnectIntervalMs(1500.5).valid, false);
  assert.equal(validateReconnectIntervalMs('abc').valid, false);

  const formInvalid = validateBackendFormInput({
    apiBaseUrl: 'ws://wrong-for-http',
    wsStreamUrl: 'http://wrong-for-ws',
    reconnectIntervalMs: '100',
    mode: 'live',
  });
  assert.equal(formInvalid.valid, false);
  assert.ok(formInvalid.errors.apiBaseUrl);
  assert.ok(formInvalid.errors.wsStreamUrl);
  assert.ok(formInvalid.errors.reconnectIntervalMs);
  assert.ok(formInvalid.errors.mode);

  const formValid = validateBackendFormInput({
    apiBaseUrl: ' https://api.ecosonic.dev ',
    wsStreamUrl: ' wss://ws.ecosonic.dev/stream ',
    reconnectIntervalMs: '4500',
    mode: 'backend_ready',
  });
  assert.equal(formValid.valid, true);
  assert.deepEqual(formValid.normalized, {
    apiBaseUrl: 'https://api.ecosonic.dev',
    wsStreamUrl: 'wss://ws.ecosonic.dev/stream',
    reconnectIntervalMs: 4500,
    mode: 'backend_ready',
  });
});

test('loadSettingsFromStorage, saveSettingsToStorage, and clearSettingsInStorage avoid redundant writes and handle failures', () => {
  const mem = createMemoryStorage();
  const defaults = getDefaultSettings();

  const firstSave = saveSettingsToStorage(mem.storage, defaults);
  assert.equal(firstSave.saved, true);
  assert.equal(firstSave.skippedUnchanged, false);
  assert.equal(mem.setCalls, 1);

  const redundantSave = saveSettingsToStorage(mem.storage, defaults);
  assert.equal(redundantSave.saved, true);
  assert.equal(redundantSave.skippedUnchanged, true);
  assert.equal(mem.setCalls, 1);

  const loaded = loadSettingsFromStorage(mem.storage);
  assert.equal(loaded.storageAvailable, true);
  assert.deepEqual(loaded.settings, defaults);

  assert.equal(clearSettingsInStorage(mem.storage), true);
  assert.equal(mem.data.has(SETTINGS_STORAGE_KEY), false);

  // Corrupted storage rewrites canonical v2 defaults on load
  const corruptMem = createMemoryStorage({ [SETTINGS_STORAGE_KEY]: '{not-json' });
  const recovered = loadSettingsFromStorage(corruptMem.storage);
  assert.equal(recovered.recoveredFromCorruption, true);
  assert.deepEqual(recovered.settings, defaults);
  assert.equal(corruptMem.setCalls, 1);

  // Null / unavailable storage
  const noStoreSave = saveSettingsToStorage(null, defaults);
  assert.equal(noStoreSave.saved, false);
  assert.ok(noStoreSave.error);
});

test('buildSettingsExportPayload emits formatted non-secret JSON', () => {
  const json = buildSettingsExportPayload(getDefaultSettings(), '2026-11-23T04:00:00.000Z');
  const parsed = JSON.parse(json);
  assert.equal(parsed.schemaVersion, SETTINGS_SCHEMA_VERSION);
  assert.equal(parsed.containsCredentials, false);
  assert.equal(parsed.exportedAtIso, '2026-11-23T04:00:00.000Z');
  assert.equal(parsed.backendConfig.mode, 'demo');
});
