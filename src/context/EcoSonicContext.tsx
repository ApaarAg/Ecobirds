import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { defaultEcoSonicAdapter, type EcoSonicDataAdapter } from '../adapters/ecosonicAdapter';
import { DEMO_HABITAT_PRESETS } from '../data/demoFixtures';
import { resolveSessionForPreset } from '../lib/observatory';
import {
  areSettingsEqual,
  clearSettingsInStorage,
  type EcoSonicSettingsState,
  getBrowserLocalStorage,
  getDefaultSettings,
  loadSettingsFromStorage,
  sanitizeAppearancePreferences,
  sanitizeAudioInputPreferences,
  sanitizeBackendConnectionConfig,
  saveSettingsToStorage,
} from '../lib/settingsStorage';
import type {
  AcousticStreamMetrics,
  AppAppearancePreferences,
  AudioInputPreferences,
  BackendConnectionConfig,
  DisturbanceEvent,
  HabitatPresetId,
  MonitoringSession,
  MonitoringStatus,
  SoundscapeSnapshot,
  SpeciesDetection,
} from '../types/ecosonic';

interface EcoSonicContextValue {
  adapter: EcoSonicDataAdapter;
  isDemoMode: boolean;
  monitoringStatus: MonitoringStatus;
  activePreset: HabitatPresetId;
  elapsedSec: number;
  streamMetrics: AcousticStreamMetrics;
  detections: SpeciesDetection[];
  disturbances: DisturbanceEvent[];
  sessions: MonitoringSession[];
  soundscape: SoundscapeSnapshot | null;
  isLoading: boolean;
  error: string | null;
  lastSyncIso: string | null;
  bootstrapLatencyMs: number | null;
  storageAvailable: boolean;
  storageWarning: string | null;
  appearance: AppAppearancePreferences;
  audioPrefs: AudioInputPreferences;
  backendConfig: BackendConnectionConfig;
  setActivePreset: (preset: HabitatPresetId) => void;
  toggleMonitoringStream: () => void;
  resetDemoSession: () => void;
  retryLoad: () => void;
  updateAppearance: (patch: Partial<AppAppearancePreferences>) => void;
  updateAudioPrefs: (patch: Partial<AudioInputPreferences>) => void;
  updateBackendConfig: (patch: Partial<BackendConnectionConfig>) => void;
  resetAllPreferences: () => void;
}

const EcoSonicContext = createContext<EcoSonicContextValue | null>(null);

export function EcoSonicProvider({
  children,
  adapter = defaultEcoSonicAdapter,
}: {
  children: React.ReactNode;
  adapter?: EcoSonicDataAdapter;
}) {
  const [monitoringStatus, setMonitoringStatus] = useState<MonitoringStatus>('streaming');
  const [activePreset, setActivePreset] = useState<HabitatPresetId>('temperate-rainforest');
  const [elapsedSec, setElapsedSec] = useState<number>(2140);
  const [streamMetrics, setStreamMetrics] = useState<AcousticStreamMetrics>(() =>
    adapter.getInitialStreamMetrics()
  );

  const [detections, setDetections] = useState<SpeciesDetection[]>([]);
  const [disturbances, setDisturbances] = useState<DisturbanceEvent[]>([]);
  const [sessions, setSessions] = useState<MonitoringSession[]>([]);
  const [soundscape, setSoundscape] = useState<SoundscapeSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncIso, setLastSyncIso] = useState<string | null>(null);
  const [bootstrapLatencyMs, setBootstrapLatencyMs] = useState<number | null>(null);
  const [reloadNonce, setReloadNonce] = useState<number>(0);

  const initialStorageRef = useRef<ReturnType<typeof loadSettingsFromStorage> | null>(null);
  if (initialStorageRef.current === null) {
    initialStorageRef.current = loadSettingsFromStorage(getBrowserLocalStorage());
  }

  const [settings, setSettings] = useState<EcoSonicSettingsState>(
    () => initialStorageRef.current!.settings
  );
  const [storageAvailable] = useState<boolean>(
    () => initialStorageRef.current!.storageAvailable
  );
  const [storageWarning, setStorageWarning] = useState<string | null>(() => {
    if (!initialStorageRef.current!.storageAvailable) {
      return 'Browser localStorage is unavailable; preference changes apply to this session only.';
    }
    if (initialStorageRef.current!.recoveredFromCorruption) {
      return 'Corrupted saved preferences were detected and restored safely to defaults.';
    }
    return null;
  });

  const lastPersistedRef = useRef<EcoSonicSettingsState>(settings);

  // Sync theme attribute on documentElement for /app/* workspace
  useEffect(() => {
    if (settings.appearance.theme === 'field-light') {
      document.documentElement.setAttribute('data-theme', 'field-light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }, [settings.appearance.theme]);

  // Persist validated settings to localStorage only when settings change
  useEffect(() => {
    if (areSettingsEqual(lastPersistedRef.current, settings)) {
      return;
    }
    const result = saveSettingsToStorage(getBrowserLocalStorage(), settings);
    if (result.saved) {
      lastPersistedRef.current = settings;
      setStorageWarning(null);
    } else if (result.error) {
      setStorageWarning(result.error);
    }
  }, [settings]);

  // Initial load & retryable bootstrap from adapter
  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError(null);

    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();

    const runBootstrap = async () => {
      try {
        if (
          typeof window !== 'undefined' &&
          window.sessionStorage?.getItem('ecosonic.test.bootstrapFault') === 'once'
        ) {
          window.sessionStorage.removeItem('ecosonic.test.bootstrapFault');
          throw new Error('Bootstrap load interrupted');
        }
      } catch (faultCheckErr) {
        if (faultCheckErr instanceof Error && faultCheckErr.message === 'Bootstrap load interrupted') {
          throw faultCheckErr;
        }
        // Ignore sessionStorage SecurityError in restricted contexts
      }

      return Promise.all([
        adapter.fetchDetections(),
        adapter.fetchDisturbances(),
        adapter.fetchSessions(),
        adapter.fetchSoundscapeSnapshot(activePreset),
      ]);
    };

    runBootstrap()
      .then(([det, dist, ses, snd]) => {
        if (!active) return;
        const finishedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
        setDetections(det);
        setDisturbances(dist);
        setSessions(ses);
        setSoundscape(snd);
        setLastSyncIso(new Date().toISOString());
        setBootstrapLatencyMs(Math.max(0, Math.round(finishedAt - startedAt)));
        setError(null);
        setIsLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        console.error(
          'EcoSonic workspace bootstrap failed:',
          err instanceof Error ? err.message : 'Unknown error'
        );
        setError(
          'Unable to load acoustic workspace data from the active adapter. Verify settings or retry loading.'
        );
        setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [adapter, activePreset, reloadNonce]);

  // Subtle deterministic telemetry progression while demo stream is active
  useEffect(() => {
    if (monitoringStatus !== 'streaming') return;
    const interval = window.setInterval(() => {
      setElapsedSec((prev) => prev + 1);
      setStreamMetrics((prev) => {
        const phase = (prev.framesProcessed % 20) / 20;
        const rmsJitter = Math.sin(phase * Math.PI * 2) * 1.4;
        const baseFreq =
          activePreset === 'temperate-rainforest'
            ? 3420
            : activePreset === 'boreal-wetland'
              ? 2180
              : 1640;
        return {
          ...prev,
          framesProcessed: prev.framesProcessed + 1,
          rmsLevelDbfs: Number((-37.6 + rmsJitter).toFixed(1)),
          peakFrequencyHz: Math.round(baseFreq + Math.cos(phase * Math.PI * 2) * 380),
        };
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [monitoringStatus, activePreset]);

  const handleSetActivePreset = useCallback(
    (preset: HabitatPresetId) => {
      setActivePreset(preset);
      const matched = resolveSessionForPreset(
        preset,
        sessions,
        detections,
        DEMO_HABITAT_PRESETS
      );
      setElapsedSec(matched?.durationSec ?? 0);
      const baseFreq =
        preset === 'temperate-rainforest' ? 3420 : preset === 'boreal-wetland' ? 2180 : 1640;
      setStreamMetrics((prev) => ({
        ...prev,
        peakFrequencyHz: baseFreq,
      }));
    },
    [detections, sessions]
  );

  const retryLoad = useCallback(() => {
    setReloadNonce((n) => n + 1);
  }, []);

  const toggleMonitoringStream = useCallback(() => {
    setMonitoringStatus((prev) => (prev === 'streaming' ? 'paused' : 'streaming'));
  }, []);

  const resetDemoSession = useCallback(() => {
    setElapsedSec(0);
    setStreamMetrics({
      ...adapter.getInitialStreamMetrics(),
      framesProcessed: 0,
      sampleRateHz: settings.audioPrefs.sampleRateHz,
    });
  }, [adapter, settings.audioPrefs.sampleRateHz]);

  const updateAppearance = useCallback((patch: Partial<AppAppearancePreferences>) => {
    setSettings((prev) => {
      const nextAppearance = sanitizeAppearancePreferences({ ...prev.appearance, ...patch });
      const next = { ...prev, appearance: nextAppearance };
      return areSettingsEqual(prev, next) ? prev : next;
    });
  }, []);

  const updateAudioPrefs = useCallback((patch: Partial<AudioInputPreferences>) => {
    setSettings((prev) => {
      const nextAudio = sanitizeAudioInputPreferences({ ...prev.audioPrefs, ...patch });
      const next = { ...prev, audioPrefs: nextAudio };
      return areSettingsEqual(prev, next) ? prev : next;
    });
  }, []);

  const updateBackendConfig = useCallback((patch: Partial<BackendConnectionConfig>) => {
    setSettings((prev) => {
      const nextBackend = sanitizeBackendConnectionConfig({ ...prev.backendConfig, ...patch });
      const next = { ...prev, backendConfig: nextBackend };
      return areSettingsEqual(prev, next) ? prev : next;
    });
  }, []);

  const resetAllPreferences = useCallback(() => {
    const defaults = getDefaultSettings();
    clearSettingsInStorage(getBrowserLocalStorage());
    lastPersistedRef.current = defaults;
    setStorageWarning(
      storageAvailable
        ? null
        : 'Browser localStorage is unavailable; preference changes apply to this session only.'
    );
    setSettings((prev) => (areSettingsEqual(prev, defaults) ? prev : defaults));
  }, [storageAvailable]);

  const value = useMemo<EcoSonicContextValue>(
    () => ({
      adapter,
      isDemoMode: adapter.isDemoMode,
      monitoringStatus,
      activePreset,
      elapsedSec,
      streamMetrics,
      detections,
      disturbances,
      sessions,
      soundscape,
      isLoading,
      error,
      lastSyncIso,
      bootstrapLatencyMs,
      storageAvailable,
      storageWarning,
      appearance: settings.appearance,
      audioPrefs: settings.audioPrefs,
      backendConfig: settings.backendConfig,
      setActivePreset: handleSetActivePreset,
      toggleMonitoringStream,
      resetDemoSession,
      retryLoad,
      updateAppearance,
      updateAudioPrefs,
      updateBackendConfig,
      resetAllPreferences,
    }),
    [
      adapter,
      monitoringStatus,
      activePreset,
      elapsedSec,
      streamMetrics,
      detections,
      disturbances,
      sessions,
      soundscape,
      isLoading,
      error,
      lastSyncIso,
      bootstrapLatencyMs,
      storageAvailable,
      storageWarning,
      settings,
      handleSetActivePreset,
      toggleMonitoringStream,
      resetDemoSession,
      retryLoad,
      updateAppearance,
      updateAudioPrefs,
      updateBackendConfig,
      resetAllPreferences,
    ]
  );

  return <EcoSonicContext.Provider value={value}>{children}</EcoSonicContext.Provider>;
}

export function useEcoSonic(): EcoSonicContextValue {
  const ctx = useContext(EcoSonicContext);
  if (!ctx) {
    throw new Error('useEcoSonic must be used inside an EcoSonicProvider');
  }
  return ctx;
}
