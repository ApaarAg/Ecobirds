import { validateEndpointUrl } from './acoustics';
import type {
  AppAppearancePreferences,
  AudioInputPreferences,
  BackendConnectionConfig,
} from '../types/ecosonic';

export const SETTINGS_STORAGE_KEY = 'ecosonic.preferences.v1';
export const SETTINGS_SCHEMA_VERSION = 2;

export const MIN_CONFIDENCE_THRESHOLD = 0.1;
export const MAX_CONFIDENCE_THRESHOLD = 0.95;
export const MIN_RECONNECT_INTERVAL_MS = 500;
export const MAX_RECONNECT_INTERVAL_MS = 60000;

export const DEFAULT_APPEARANCE: AppAppearancePreferences = {
  theme: 'deep-forest',
  reducedMotionOverride: false,
  showScientificNamesFirst: false,
};

export const DEFAULT_AUDIO_PREFS: AudioInputPreferences = {
  preferredDeviceId: 'default',
  sampleRateHz: 48000,
  fftSize: 2048,
  minConfidenceThreshold: 0.65,
  noiseSuppression: false,
  autoGainControl: false,
};

export const DEFAULT_BACKEND_CONFIG: BackendConnectionConfig = {
  apiBaseUrl: 'http://localhost:8000',
  wsStreamUrl: 'ws://localhost:8000/ws/audio',
  reconnectIntervalMs: 3000,
  mode: 'demo',
};

export interface EcoSonicSettingsState {
  appearance: AppAppearancePreferences;
  audioPrefs: AudioInputPreferences;
  backendConfig: BackendConnectionConfig;
}

export interface PersistedSettingsEnvelopeV2 extends EcoSonicSettingsState {
  version: typeof SETTINGS_SCHEMA_VERSION;
  updatedAtIso: string;
}

export interface DeserializeResult {
  settings: EcoSonicSettingsState;
  recoveredFromCorruption: boolean;
  migratedFromVersion: number | null;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface BackendFormErrors {
  apiBaseUrl?: string;
  wsStreamUrl?: string;
  reconnectIntervalMs?: string;
  mode?: string;
}

export interface RangeValidationResult<T = number> {
  valid: boolean;
  value?: T;
  reason?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getDefaultSettings(): EcoSonicSettingsState {
  return {
    appearance: { ...DEFAULT_APPEARANCE },
    audioPrefs: { ...DEFAULT_AUDIO_PREFS },
    backendConfig: { ...DEFAULT_BACKEND_CONFIG },
  };
}

export function validateConfidenceThreshold(value: unknown): RangeValidationResult<number> {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return {
      valid: false,
      reason: `Confidence threshold must be a number between ${MIN_CONFIDENCE_THRESHOLD} and ${MAX_CONFIDENCE_THRESHOLD}.`,
    };
  }
  if (value < MIN_CONFIDENCE_THRESHOLD || value > MAX_CONFIDENCE_THRESHOLD) {
    return {
      valid: false,
      reason: `Confidence threshold must be between ${MIN_CONFIDENCE_THRESHOLD.toFixed(2)} and ${MAX_CONFIDENCE_THRESHOLD.toFixed(2)}.`,
    };
  }
  return { valid: true, value: Math.round(value * 100) / 100 };
}

export function validateReconnectIntervalMs(value: unknown): RangeValidationResult<number> {
  const num = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof num !== 'number' || !Number.isFinite(num) || !Number.isInteger(num)) {
    return {
      valid: false,
      reason: `Reconnection interval must be a whole number in milliseconds (${MIN_RECONNECT_INTERVAL_MS}–${MAX_RECONNECT_INTERVAL_MS}).`,
    };
  }
  if (num < MIN_RECONNECT_INTERVAL_MS || num > MAX_RECONNECT_INTERVAL_MS) {
    return {
      valid: false,
      reason: `Reconnection interval must be between ${MIN_RECONNECT_INTERVAL_MS} ms and ${MAX_RECONNECT_INTERVAL_MS} ms.`,
    };
  }
  return { valid: true, value: num };
}

export function validateBackendMode(
  value: unknown
): RangeValidationResult<BackendConnectionConfig['mode']> {
  if (value === 'demo' || value === 'backend_ready') {
    return { valid: true, value };
  }
  return {
    valid: false,
    reason: 'Mode must be either "demo" or "backend_ready".',
  };
}

export function sanitizeAppearancePreferences(raw: unknown): AppAppearancePreferences {
  if (!isRecord(raw)) {
    return { ...DEFAULT_APPEARANCE };
  }
  return {
    theme: raw.theme === 'field-light' || raw.theme === 'deep-forest' ? raw.theme : DEFAULT_APPEARANCE.theme,
    reducedMotionOverride:
      typeof raw.reducedMotionOverride === 'boolean'
        ? raw.reducedMotionOverride
        : DEFAULT_APPEARANCE.reducedMotionOverride,
    showScientificNamesFirst:
      typeof raw.showScientificNamesFirst === 'boolean'
        ? raw.showScientificNamesFirst
        : DEFAULT_APPEARANCE.showScientificNamesFirst,
  };
}

export function sanitizeAudioInputPreferences(raw: unknown): AudioInputPreferences {
  if (!isRecord(raw)) {
    return { ...DEFAULT_AUDIO_PREFS };
  }

  const deviceRaw = typeof raw.preferredDeviceId === 'string' ? raw.preferredDeviceId.trim() : '';
  const preferredDeviceId =
    deviceRaw.length > 0 && deviceRaw.length <= 256
      ? deviceRaw
      : DEFAULT_AUDIO_PREFS.preferredDeviceId;

  const sampleRateHz: AudioInputPreferences['sampleRateHz'] =
    raw.sampleRateHz === 44100 || raw.sampleRateHz === 48000
      ? raw.sampleRateHz
      : DEFAULT_AUDIO_PREFS.sampleRateHz;

  const fftSize: AudioInputPreferences['fftSize'] =
    raw.fftSize === 1024 || raw.fftSize === 2048 || raw.fftSize === 4096
      ? raw.fftSize
      : DEFAULT_AUDIO_PREFS.fftSize;

  const confCheck = validateConfidenceThreshold(raw.minConfidenceThreshold);
  const minConfidenceThreshold = confCheck.valid
    ? confCheck.value!
    : DEFAULT_AUDIO_PREFS.minConfidenceThreshold;

  return {
    preferredDeviceId,
    sampleRateHz,
    fftSize,
    minConfidenceThreshold,
    noiseSuppression:
      typeof raw.noiseSuppression === 'boolean'
        ? raw.noiseSuppression
        : DEFAULT_AUDIO_PREFS.noiseSuppression,
    autoGainControl:
      typeof raw.autoGainControl === 'boolean'
        ? raw.autoGainControl
        : DEFAULT_AUDIO_PREFS.autoGainControl,
  };
}

export function sanitizeBackendConnectionConfig(raw: unknown): BackendConnectionConfig {
  if (!isRecord(raw)) {
    return { ...DEFAULT_BACKEND_CONFIG };
  }

  const apiRaw = typeof raw.apiBaseUrl === 'string' ? raw.apiBaseUrl.trim() : '';
  const apiValid = validateEndpointUrl(apiRaw, ['http:', 'https:']).valid;

  const wsRaw = typeof raw.wsStreamUrl === 'string' ? raw.wsStreamUrl.trim() : '';
  const wsValid = validateEndpointUrl(wsRaw, ['ws:', 'wss:']).valid;

  const reconnectCheck = validateReconnectIntervalMs(raw.reconnectIntervalMs);
  const modeCheck = validateBackendMode(raw.mode);

  return {
    apiBaseUrl: apiValid ? apiRaw : DEFAULT_BACKEND_CONFIG.apiBaseUrl,
    wsStreamUrl: wsValid ? wsRaw : DEFAULT_BACKEND_CONFIG.wsStreamUrl,
    reconnectIntervalMs: reconnectCheck.valid
      ? reconnectCheck.value!
      : DEFAULT_BACKEND_CONFIG.reconnectIntervalMs,
    mode: modeCheck.valid ? modeCheck.value! : DEFAULT_BACKEND_CONFIG.mode,
  };
}

export function validateBackendFormInput(input: {
  apiBaseUrl: string;
  wsStreamUrl: string;
  reconnectIntervalMs: string | number;
  mode: unknown;
}): {
  valid: boolean;
  errors: BackendFormErrors;
  normalized?: BackendConnectionConfig;
} {
  const errors: BackendFormErrors = {};

  const apiCheck = validateEndpointUrl(input.apiBaseUrl, ['http:', 'https:']);
  if (!apiCheck.valid) {
    errors.apiBaseUrl = apiCheck.reason;
  }

  const wsCheck = validateEndpointUrl(input.wsStreamUrl, ['ws:', 'wss:']);
  if (!wsCheck.valid) {
    errors.wsStreamUrl = wsCheck.reason;
  }

  const reconnectCheck = validateReconnectIntervalMs(input.reconnectIntervalMs);
  if (!reconnectCheck.valid) {
    errors.reconnectIntervalMs = reconnectCheck.reason;
  }

  const modeCheck = validateBackendMode(input.mode);
  if (!modeCheck.valid) {
    errors.mode = modeCheck.reason;
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: {},
    normalized: {
      apiBaseUrl: input.apiBaseUrl.trim(),
      wsStreamUrl: input.wsStreamUrl.trim(),
      reconnectIntervalMs: reconnectCheck.value!,
      mode: modeCheck.value!,
    },
  };
}

/**
 * Migrate v0 (unversioned) or v1 settings payloads into the canonical v2 shape.
 */
export function migrateSettingsPayload(parsed: unknown): {
  rawSettings: unknown;
  migratedFromVersion: number | null;
} {
  if (!isRecord(parsed)) {
    return { rawSettings: null, migratedFromVersion: null };
  }

  const rawVersion = parsed.version;
  if (rawVersion === SETTINGS_SCHEMA_VERSION) {
    return { rawSettings: parsed, migratedFromVersion: null };
  }

  // Legacy v1 envelope or unversioned v0 payload
  const versionNum = typeof rawVersion === 'number' && Number.isFinite(rawVersion) ? rawVersion : 0;

  if (versionNum === 1 || rawVersion === undefined) {
    // Support legacy keys if present (e.g., `audio`, `backend`, `confidenceThreshold`)
    const legacyAudio = isRecord(parsed.audioPrefs)
      ? parsed.audioPrefs
      : isRecord(parsed.audio)
        ? parsed.audio
        : {};
    const legacyBackend = isRecord(parsed.backendConfig)
      ? parsed.backendConfig
      : isRecord(parsed.backend)
        ? parsed.backend
        : {};
    const legacyAppearance = isRecord(parsed.appearance)
      ? parsed.appearance
      : {
          theme: parsed.theme,
          reducedMotionOverride: parsed.reducedMotionOverride,
          showScientificNamesFirst: parsed.showScientificNamesFirst,
        };

    const migratedAudio: Record<string, unknown> = { ...legacyAudio };
    if (
      migratedAudio.minConfidenceThreshold === undefined &&
      legacyAudio.confidenceThreshold !== undefined
    ) {
      migratedAudio.minConfidenceThreshold = legacyAudio.confidenceThreshold;
    }

    return {
      rawSettings: {
        appearance: legacyAppearance,
        audioPrefs: migratedAudio,
        backendConfig: legacyBackend,
      },
      migratedFromVersion: versionNum,
    };
  }

  // Unsupported future or invalid version -> inspect nested objects defensively
  return {
    rawSettings: {
      appearance: parsed.appearance,
      audioPrefs: parsed.audioPrefs,
      backendConfig: parsed.backendConfig,
    },
    migratedFromVersion: versionNum,
  };
}

export function sanitizeSettings(settings: EcoSonicSettingsState): EcoSonicSettingsState {
  return {
    appearance: sanitizeAppearancePreferences(settings.appearance),
    audioPrefs: sanitizeAudioInputPreferences(settings.audioPrefs),
    backendConfig: sanitizeBackendConnectionConfig(settings.backendConfig),
  };
}

export function areSettingsEqual(a: EcoSonicSettingsState, b: EcoSonicSettingsState): boolean {
  return (
    a.appearance.theme === b.appearance.theme &&
    a.appearance.reducedMotionOverride === b.appearance.reducedMotionOverride &&
    a.appearance.showScientificNamesFirst === b.appearance.showScientificNamesFirst &&
    a.audioPrefs.preferredDeviceId === b.audioPrefs.preferredDeviceId &&
    a.audioPrefs.sampleRateHz === b.audioPrefs.sampleRateHz &&
    a.audioPrefs.fftSize === b.audioPrefs.fftSize &&
    a.audioPrefs.minConfidenceThreshold === b.audioPrefs.minConfidenceThreshold &&
    a.audioPrefs.noiseSuppression === b.audioPrefs.noiseSuppression &&
    a.audioPrefs.autoGainControl === b.audioPrefs.autoGainControl &&
    a.backendConfig.apiBaseUrl === b.backendConfig.apiBaseUrl &&
    a.backendConfig.wsStreamUrl === b.backendConfig.wsStreamUrl &&
    a.backendConfig.reconnectIntervalMs === b.backendConfig.reconnectIntervalMs &&
    a.backendConfig.mode === b.backendConfig.mode
  );
}

/**
 * Serialize only explicitly allowlisted, non-sensitive client preferences.
 */
export function serializeSettings(
  settings: EcoSonicSettingsState,
  updatedAtIso: string = new Date().toISOString()
): string {
  const clean = sanitizeSettings(settings);
  const envelope: PersistedSettingsEnvelopeV2 = {
    version: SETTINGS_SCHEMA_VERSION,
    updatedAtIso,
    appearance: clean.appearance,
    audioPrefs: clean.audioPrefs,
    backendConfig: clean.backendConfig,
  };
  return JSON.stringify(envelope);
}

export function deserializeSettings(rawJson: string | null): DeserializeResult {
  if (rawJson === null || rawJson.trim() === '') {
    return {
      settings: getDefaultSettings(),
      recoveredFromCorruption: false,
      migratedFromVersion: null,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return {
      settings: getDefaultSettings(),
      recoveredFromCorruption: true,
      migratedFromVersion: null,
    };
  }

  if (!isRecord(parsed)) {
    return {
      settings: getDefaultSettings(),
      recoveredFromCorruption: true,
      migratedFromVersion: null,
    };
  }

  const { rawSettings, migratedFromVersion } = migrateSettingsPayload(parsed);
  if (!isRecord(rawSettings)) {
    return {
      settings: getDefaultSettings(),
      recoveredFromCorruption: true,
      migratedFromVersion,
    };
  }

  return {
    settings: {
      appearance: sanitizeAppearancePreferences(rawSettings.appearance),
      audioPrefs: sanitizeAudioInputPreferences(rawSettings.audioPrefs),
      backendConfig: sanitizeBackendConnectionConfig(rawSettings.backendConfig),
    },
    recoveredFromCorruption: false,
    migratedFromVersion,
  };
}

export function getBrowserLocalStorage(): StorageLike | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null;
    }
    const probeKey = '__ecosonic_storage_probe__';
    window.localStorage.setItem(probeKey, '1');
    window.localStorage.removeItem(probeKey);
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadSettingsFromStorage(storage: StorageLike | null): DeserializeResult & {
  storageAvailable: boolean;
} {
  if (!storage) {
    return {
      settings: getDefaultSettings(),
      recoveredFromCorruption: false,
      migratedFromVersion: null,
      storageAvailable: false,
    };
  }

  try {
    const raw = storage.getItem(SETTINGS_STORAGE_KEY);
    const result = deserializeSettings(raw);

    // If migrated or recovered from corruption, rewrite canonical v2 payload cleanly
    if (result.recoveredFromCorruption || result.migratedFromVersion !== null) {
      try {
        storage.setItem(SETTINGS_STORAGE_KEY, serializeSettings(result.settings));
      } catch {
        // Non-fatal: return sanitized in-memory settings
      }
    }

    return {
      ...result,
      storageAvailable: true,
    };
  } catch {
    return {
      settings: getDefaultSettings(),
      recoveredFromCorruption: true,
      migratedFromVersion: null,
      storageAvailable: false,
    };
  }
}

export function saveSettingsToStorage(
  storage: StorageLike | null,
  settings: EcoSonicSettingsState
): { saved: boolean; skippedUnchanged: boolean; error?: string } {
  const clean = sanitizeSettings(settings);
  if (!storage) {
    return {
      saved: false,
      skippedUnchanged: false,
      error: 'Browser localStorage is unavailable; changes apply to this session only.',
    };
  }

  try {
    const existingRaw = storage.getItem(SETTINGS_STORAGE_KEY);
    if (existingRaw) {
      const existingParsed = deserializeSettings(existingRaw);
      if (
        !existingParsed.recoveredFromCorruption &&
        existingParsed.migratedFromVersion === null &&
        areSettingsEqual(existingParsed.settings, clean)
      ) {
        return { saved: true, skippedUnchanged: true };
      }
    }

    storage.setItem(SETTINGS_STORAGE_KEY, serializeSettings(clean));
    return { saved: true, skippedUnchanged: false };
  } catch {
    return {
      saved: false,
      skippedUnchanged: false,
      error: 'Unable to persist preferences to localStorage (storage quota or privacy mode).',
    };
  }
}

export function clearSettingsInStorage(storage: StorageLike | null): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(SETTINGS_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function buildSettingsExportPayload(
  settings: EcoSonicSettingsState,
  exportedAtIso: string = new Date().toISOString()
): string {
  const clean = sanitizeSettings(settings);
  return JSON.stringify(
    {
      application: 'EcoSonic 3.0 Observatory',
      schemaVersion: SETTINGS_SCHEMA_VERSION,
      exportedAtIso,
      containsCredentials: false,
      appearance: clean.appearance,
      audioPrefs: clean.audioPrefs,
      backendConfig: clean.backendConfig,
    },
    null,
    2
  );
}
