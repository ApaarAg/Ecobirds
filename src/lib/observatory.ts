import type { HabitatPresetMeta } from '../data/demoFixtures';
import type {
  DisturbanceEvent,
  HabitatPresetId,
  MonitoringSession,
  SpeciesDetection,
} from '../types/ecosonic';

export const MIN_INPUT_GAIN_DB = -18;
export const MAX_INPUT_GAIN_DB = 24;
export const DEFAULT_INPUT_GAIN_DB = 0;

/**
 * Clamp browser-local input gain slider value into [-18, +24] dB.
 */
export function clampInputGainDb(gainDb: number): number {
  if (!Number.isFinite(gainDb)) return DEFAULT_INPUT_GAIN_DB;
  const clamped = Math.min(MAX_INPUT_GAIN_DB, Math.max(MIN_INPUT_GAIN_DB, gainDb));
  return Math.round(clamped * 10) / 10;
}

/**
 * Convert decibels to linear Web Audio GainNode factor (10^(dB / 20)).
 */
export function dbToLinearGain(gainDb: number): number {
  const safeDb = clampInputGainDb(gainDb);
  return Math.pow(10, safeDb / 20);
}

export function formatGainDb(gainDb: number): string {
  const safe = clampInputGainDb(gainDb);
  const sign = safe > 0 ? '+' : '';
  return `${sign}${safe.toFixed(1)} dB`;
}

/**
 * Dynamically resolve the MonitoringSession associated with a habitat preset
 * from actual available sessions and detections without hardcoded session IDs.
 */
export function resolveSessionForPreset(
  presetId: HabitatPresetId,
  sessions: readonly MonitoringSession[],
  detections: readonly SpeciesDetection[],
  presets: readonly HabitatPresetMeta[] = []
): MonitoringSession | null {
  if (sessions.length === 0) return null;

  const sortByPriority = (list: MonitoringSession[]) =>
    [...list].sort((a, b) => {
      const aActive = a.status === 'streaming' || a.status === 'paused' ? 1 : 0;
      const bActive = b.status === 'streaming' || b.status === 'paused' ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;
      return Date.parse(b.startedAtIso) - Date.parse(a.startedAtIso);
    });

  // 1. Direct match via detection telemetry linked to both habitatPreset and sessionId
  const candidateSessionIds = new Set<string>();
  for (const det of detections) {
    if (det.habitatPreset === presetId && det.sessionId) {
      candidateSessionIds.add(det.sessionId);
    }
  }

  if (candidateSessionIds.size > 0) {
    const matchedByDetections = sessions.filter((s) => candidateSessionIds.has(s.id));
    if (matchedByDetections.length > 0) {
      return sortByPriority(matchedByDetections)[0];
    }
  }

  // 2. Fallback match via preset station label inside session siteName
  const presetMeta = presets.find((p) => p.id === presetId);
  if (presetMeta) {
    const labelNeedle = presetMeta.label.trim().toLowerCase();
    const matchedBySite = sessions.filter((s) =>
      s.siteName.toLowerCase().includes(labelNeedle)
    );
    if (matchedBySite.length > 0) {
      return sortByPriority(matchedBySite)[0];
    }
  }

  return null;
}

/**
 * Filter recent species detections by habitat preset and persisted minimum confidence threshold.
 */
export function filterRecentDetections(
  detections: readonly SpeciesDetection[],
  presetId: HabitatPresetId,
  minConfidenceThreshold: number,
  limit: number = 5
): SpeciesDetection[] {
  const threshold = Number.isFinite(minConfidenceThreshold) ? minConfidenceThreshold : 0;
  return detections
    .filter((d) => d.habitatPreset === presetId && d.confidenceScore >= threshold)
    .sort((a, b) => Date.parse(b.timestampIso) - Date.parse(a.timestampIso))
    .slice(0, Math.max(0, limit));
}

/**
 * Filter recent disturbance events belonging to a resolved session.
 */
export function getDisturbancesForSession(
  disturbances: readonly DisturbanceEvent[],
  sessionId: string | null,
  limit: number = 4
): DisturbanceEvent[] {
  if (!sessionId) return [];
  return disturbances
    .filter((ev) => ev.sessionId === sessionId)
    .sort((a, b) => Date.parse(b.timestampIso) - Date.parse(a.timestampIso))
    .slice(0, Math.max(0, limit));
}

/**
 * Format AcousticVisualizer footer caption with genuine sample rate, FFT size, and source mode.
 */
export function formatVisualizerCaption(options: {
  sampleRateHz: number;
  fftSize: number;
  isMicrophoneActive: boolean;
  compact?: boolean;
}): string {
  const khz = (options.sampleRateHz / 1000).toFixed(options.compact ? 0 : 1);
  if (options.isMicrophoneActive) {
    return options.compact
      ? `MIC PREVIEW · ${khz} kHz / ${options.fftSize} FFT`
      : `LOCAL MIC PREVIEW · ${khz} kHz / ${options.fftSize}-PT FFT (BROWSER AUDIO ONLY)`;
  }
  return options.compact
    ? `TIME ENVELOPE · ${khz} kHz / ${options.fftSize} FFT (DEMO)`
    : `TIME-DOMAIN ENVELOPE · ${khz} kHz / ${options.fftSize}-PT FFT (DEMO FIXTURE)`;
}

/**
 * Compute genuine RMS level (dBFS), normalized activity percentage, and dominant peak frequency (Hz)
 * from Web Audio AnalyserNode time-domain and byte-frequency buffers.
 */
export function computeAnalyserMetrics(
  timeDomain: Float32Array,
  frequencyBins: Uint8Array,
  sampleRateHz: number
): {
  rmsLevelDbfs: number;
  peakFrequencyHz: number;
  activityPct: number;
} {
  let sumSq = 0;
  if (timeDomain.length > 0) {
    for (let i = 0; i < timeDomain.length; i += 1) {
      const s = timeDomain[i];
      sumSq += s * s;
    }
  }
  const rms = timeDomain.length > 0 ? Math.sqrt(sumSq / timeDomain.length) : 0;
  const rmsLevelDbfs =
    rms > 0.00001 ? Math.max(-96, Math.min(0, 20 * Math.log10(rms))) : -96;
  const activityPct = Math.min(100, Math.max(0, Math.round(rms * 320)));

  let maxMag = -1;
  let maxIdx = 0;
  for (let i = 1; i < frequencyBins.length; i += 1) {
    if (frequencyBins[i] > maxMag) {
      maxMag = frequencyBins[i];
      maxIdx = i;
    }
  }

  const nyquist = Math.max(1, sampleRateHz) / 2;
  const peakFrequencyHz =
    frequencyBins.length > 0 && maxMag > 0
      ? Math.round((maxIdx / frequencyBins.length) * nyquist)
      : 0;

  return {
    rmsLevelDbfs: Math.round(rmsLevelDbfs * 10) / 10,
    peakFrequencyHz,
    activityPct,
  };
}
