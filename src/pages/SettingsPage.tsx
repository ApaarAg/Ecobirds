import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Check,
  Download,
  Mic,
  MicOff,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { Button, SurfacePanel } from '../components/ui/Primitives';
import { useEcoSonic } from '../context/EcoSonicContext';
import { useMicrophoneDevices } from '../hooks/useMicrophoneDevices';
import { formatTimestampDateTime } from '../lib/acoustics';
import { probeRuntimeCapabilities } from '../lib/diagnostics';
import {
  type BackendFormErrors,
  buildSettingsExportPayload,
  MAX_RECONNECT_INTERVAL_MS,
  MIN_RECONNECT_INTERVAL_MS,
  validateBackendFormInput,
} from '../lib/settingsStorage';
import type { BackendConnectionConfig } from '../types/ecosonic';

function formatMicPermissionLabel(
  state: ReturnType<typeof useMicrophoneDevices>['permissionState'],
  deviceCount: number
): string {
  switch (state) {
    case 'granted':
      return `Permission granted (${deviceCount} ${deviceCount === 1 ? 'input' : 'inputs'})`;
    case 'denied':
      return 'Permission denied';
    case 'prompt':
      return 'Permission required on test';
    case 'unsupported':
      return 'Unsupported in browser';
    default:
      return deviceCount > 0 ? `${deviceCount} audio inputs detected` : 'Availability unknown';
  }
}

export function SettingsPage() {
  const {
    adapter,
    isLoading,
    error: bootstrapError,
    lastSyncIso,
    bootstrapLatencyMs,
    storageAvailable,
    storageWarning,
    appearance,
    audioPrefs,
    backendConfig,
    updateAppearance,
    updateAudioPrefs,
    updateBackendConfig,
    resetAllPreferences,
  } = useEcoSonic();

  const {
    isMediaDevicesSupported,
    devices,
    permissionState,
    isEnumerating,
    isTesting,
    activityLevelPct,
    statusMessage: micStatusMessage,
    errorMessage: micErrorMessage,
    refreshDevices,
    startMicTest,
    stopMicTest,
  } = useMicrophoneDevices();

  const [apiUrlInput, setApiUrlInput] = useState(backendConfig.apiBaseUrl);
  const [wsUrlInput, setWsUrlInput] = useState(backendConfig.wsStreamUrl);
  const [reconnectInput, setReconnectInput] = useState(String(backendConfig.reconnectIntervalMs));
  const [modeInput, setModeInput] = useState<BackendConnectionConfig['mode']>(backendConfig.mode);
  const [fieldErrors, setFieldErrors] = useState<BackendFormErrors>({});
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);

  const savedNoticeTimerRef = useRef<number | null>(null);

  const apiErrorId = useId();
  const wsErrorId = useId();
  const reconnectErrorId = useId();
  const modeErrorId = useId();

  const diagnostics = adapter.getDiagnostics();
  const runtimeCaps = useMemo(() => probeRuntimeCapabilities(), []);

  // Keep draft backend form fields synchronized with context (e.g., after reset)
  useEffect(() => {
    setApiUrlInput(backendConfig.apiBaseUrl);
    setWsUrlInput(backendConfig.wsStreamUrl);
    setReconnectInput(String(backendConfig.reconnectIntervalMs));
    setModeInput(backendConfig.mode);
  }, [backendConfig]);

  // Clean up saved notice timeout on unmount
  useEffect(() => {
    return () => {
      if (savedNoticeTimerRef.current !== null) {
        window.clearTimeout(savedNoticeTimerRef.current);
      }
    };
  }, []);

  const showTemporaryNotice = (message: string) => {
    if (savedNoticeTimerRef.current !== null) {
      window.clearTimeout(savedNoticeTimerRef.current);
    }
    setSavedNotice(message);
    savedNoticeTimerRef.current = window.setTimeout(() => {
      savedNoticeTimerRef.current = null;
      setSavedNotice(null);
    }, 3000);
  };

  const handleSaveBackendConfig = (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateBackendFormInput({
      apiBaseUrl: apiUrlInput,
      wsStreamUrl: wsUrlInput,
      reconnectIntervalMs: reconnectInput,
      mode: modeInput,
    });

    if (!validation.valid || !validation.normalized) {
      setFieldErrors(validation.errors);
      setSavedNotice(null);
      return;
    }

    setFieldErrors({});
    updateBackendConfig(validation.normalized);
    showTemporaryNotice(
      validation.normalized.mode === 'backend_ready'
        ? 'Configuration persisted locally (Stage 2 target prepared; live transport remains inactive).'
        : 'Backend configuration persisted locally.'
    );
  };

  const handleConfirmReset = () => {
    stopMicTest();
    resetAllPreferences();
    setFieldErrors({});
    setIsResetModalOpen(false);
    showTemporaryNotice('All preferences restored to defaults.');
  };

  const handleExportConfig = () => {
    const payload = buildSettingsExportPayload({
      appearance,
      audioPrefs,
      backendConfig,
    });
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ecosonic-config-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showTemporaryNotice('Exported non-secret configuration JSON.');
  };

  const handleToggleMicTest = () => {
    if (isTesting) {
      stopMicTest();
      return;
    }
    void startMicTest({
      preferredDeviceId: audioPrefs.preferredDeviceId,
      sampleRateHz: audioPrefs.sampleRateHz,
      noiseSuppression: audioPrefs.noiseSuppression,
      autoGainControl: audioPrefs.autoGainControl,
    });
  };

  const hasSavedCustomDeviceMissing =
    audioPrefs.preferredDeviceId !== 'default' &&
    !devices.some((d) => d.deviceId === audioPrefs.preferredDeviceId);

  const adapterStatusLabel = bootstrapError
    ? 'Error (Fallback / Retry Available)'
    : isLoading
      ? 'Loading…'
      : diagnostics.adapterStatus === 'ready'
        ? 'Ready'
        : diagnostics.adapterStatus;

  return (
    <AppShell
      title="Settings & Diagnostics"
      subtitle="Appearance, audio input preferences, backend adapter endpoints, and system capabilities"
    >
      {storageWarning && (
        <ErrorBanner
          title="Preference Storage Notice"
          message={storageWarning}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 space-y-6">
          {/* Application Appearance */}
          <SurfacePanel as="section" className="p-6 space-y-5">
            <div className="pb-3 border-b border-[var(--app-border)]">
              <h2 className="font-serif text-2xl font-semibold text-[var(--app-text)]">
                Application Appearance
              </h2>
              <p className="text-xs text-[var(--app-text-muted)] mt-0.5">
                Configure workspace surface contrast and taxonomic display conventions
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <div className="text-xs font-medium text-[var(--app-text-muted)] mb-2">
                  Workspace Surface Theme
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    aria-pressed={appearance.theme === 'deep-forest'}
                    onClick={() => updateAppearance({ theme: 'deep-forest' })}
                    className={`px-4 py-2 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                      appearance.theme === 'deep-forest'
                        ? 'bg-[#788B68] text-[#101C17] font-semibold'
                        : 'bg-[var(--app-bg)] text-[var(--app-text-secondary)] border border-[var(--app-border)]'
                    }`}
                  >
                    Deep Forest (Default)
                  </button>
                  <button
                    type="button"
                    aria-pressed={appearance.theme === 'field-light'}
                    onClick={() => updateAppearance({ theme: 'field-light' })}
                    className={`px-4 py-2 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                      appearance.theme === 'field-light'
                        ? 'bg-[#788B68] text-[#101C17] font-semibold'
                        : 'bg-[var(--app-bg)] text-[var(--app-text-secondary)] border border-[var(--app-border)]'
                    }`}
                  >
                    Warm Ivory Field Light
                  </button>
                </div>
              </div>

              <label className="flex items-center justify-between gap-4 py-2 cursor-pointer">
                <div>
                  <div className="text-sm font-medium text-[var(--app-text)]">
                    Prioritize Scientific Binomial Names
                  </div>
                  <div className="text-xs text-[var(--app-text-muted)]">
                    Display Latin taxonomy ahead of common names in species logs
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={appearance.showScientificNamesFirst}
                  onChange={(e) =>
                    updateAppearance({ showScientificNamesFirst: e.target.checked })
                  }
                  className="w-4 h-4 accent-[#788B68]"
                />
              </label>

              <label className="flex items-center justify-between gap-4 py-2 cursor-pointer">
                <div>
                  <div className="text-sm font-medium text-[var(--app-text)]">
                    Static Visualizer Mode (Reduced Motion)
                  </div>
                  <div className="text-xs text-[var(--app-text-muted)]">
                    Freeze continuous spectrogram scrolling in the Live Observatory
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={appearance.reducedMotionOverride}
                  onChange={(e) =>
                    updateAppearance({ reducedMotionOverride: e.target.checked })
                  }
                  className="w-4 h-4 accent-[#788B68]"
                />
              </label>
            </div>
          </SurfacePanel>

          {/* Audio Input Preferences & Microphone Device Enumeration */}
          <SurfacePanel as="section" className="p-6 space-y-5">
            <div className="pb-3 border-b border-[var(--app-border)] flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-serif text-2xl font-semibold text-[var(--app-text)]">
                  Audio Input Preferences
                </h2>
                <p className="text-xs text-[var(--app-text-muted)] mt-0.5">
                  Microphone selection, permission status, and preferred DSP parameters
                </p>
              </div>
              <span
                data-testid="mic-permission-badge"
                className={`shrink-0 self-start px-2.5 py-1 rounded text-[11px] font-mono border ${
                  permissionState === 'granted'
                    ? 'border-[var(--app-accent)]/45 bg-[var(--app-accent)]/15 text-[var(--app-accent)]'
                    : permissionState === 'denied' || permissionState === 'unsupported'
                      ? 'border-[var(--app-amber)]/45 bg-[var(--app-amber)]/10 text-[var(--app-amber)]'
                      : 'border-[var(--app-border-strong)] bg-[var(--app-bg)] text-[var(--app-text-muted)]'
                }`}
              >
                {formatMicPermissionLabel(permissionState, devices.length)}
              </span>
            </div>

            {/* Preferred Microphone Device & Test */}
            <div className="space-y-3">
              <div>
                <label
                  htmlFor="preferred-mic-select"
                  className="block text-xs font-medium text-[var(--app-text-muted)] mb-1.5"
                >
                  Preferred Audio Input Device
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <select
                    id="preferred-mic-select"
                    value={audioPrefs.preferredDeviceId}
                    disabled={!isMediaDevicesSupported}
                    onChange={(e) => {
                      if (isTesting) {
                        stopMicTest();
                      }
                      updateAudioPrefs({ preferredDeviceId: e.target.value });
                    }}
                    className="flex-1 min-w-0 px-3 py-2 text-sm rounded-md bg-[var(--app-bg)] border border-[var(--app-border-strong)] text-[var(--app-text)] disabled:opacity-60"
                  >
                    <option value="default">System Default Microphone</option>
                    {devices.map((device) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label}
                      </option>
                    ))}
                    {hasSavedCustomDeviceMissing && (
                      <option value={audioPrefs.preferredDeviceId}>
                        Saved Device ({audioPrefs.preferredDeviceId.slice(0, 12)}…) — Not Attached
                      </option>
                    )}
                  </select>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={!isMediaDevicesSupported || isEnumerating}
                      onClick={() => void refreshDevices()}
                      aria-label="Refresh audio input devices"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isEnumerating ? 'animate-spin' : ''}`} />
                      <span>Refresh</span>
                    </Button>
                    <Button
                      type="button"
                      variant={isTesting ? 'ivory' : 'secondary'}
                      size="sm"
                      disabled={!isMediaDevicesSupported}
                      onClick={handleToggleMicTest}
                    >
                      {isTesting ? (
                        <>
                          <MicOff className="w-3.5 h-3.5" />
                          <span>Stop Test</span>
                        </>
                      ) : (
                        <>
                          <Mic className="w-3.5 h-3.5" />
                          <span>Test Microphone</span>
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>

              {isTesting && (
                <div className="p-3 rounded-md bg-[var(--app-bg)] border border-[var(--app-border)] space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[var(--app-text-secondary)]">
                      {micStatusMessage ?? 'Reading microphone input…'}
                    </span>
                    <span className="font-mono tabular-nums text-[var(--app-text-muted)]">
                      {activityLevelPct}%
                    </span>
                  </div>
                  <div
                    role="progressbar"
                    aria-label="Microphone input activity"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={activityLevelPct}
                    className="h-2 w-full rounded-full bg-[var(--app-surface)] overflow-hidden"
                  >
                    <div
                      className="h-full bg-[#788B68] transition-[width] duration-75"
                      style={{ width: `${activityLevelPct}%` }}
                    />
                  </div>
                </div>
              )}

              {micErrorMessage && (
                <p role="alert" className="text-xs text-[var(--app-amber)] leading-relaxed">
                  {micErrorMessage}
                </p>
              )}

              {!micErrorMessage && permissionState === 'denied' && (
                <p role="status" className="text-xs text-[var(--app-amber)] leading-relaxed">
                  Browser microphone permission is blocked. Allow audio input access in site
                  settings, then retry the microphone test.
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="sample-rate-select"
                  className="block text-xs font-medium text-[var(--app-text-muted)] mb-1.5"
                >
                  Target Sample Rate
                </label>
                <select
                  id="sample-rate-select"
                  value={audioPrefs.sampleRateHz}
                  onChange={(e) =>
                    updateAudioPrefs({ sampleRateHz: Number(e.target.value) as 44100 | 48000 })
                  }
                  className="w-full px-3 py-2 text-sm rounded-md bg-[var(--app-bg)] border border-[var(--app-border-strong)] text-[var(--app-text)]"
                >
                  <option value={48000}>48,000 Hz (Bioacoustic Standard)</option>
                  <option value={44100}>44,100 Hz (CD Standard)</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="fft-size-select"
                  className="block text-xs font-medium text-[var(--app-text-muted)] mb-1.5"
                >
                  Visualizer FFT Window Size
                </label>
                <select
                  id="fft-size-select"
                  value={audioPrefs.fftSize}
                  onChange={(e) =>
                    updateAudioPrefs({ fftSize: Number(e.target.value) as 1024 | 2048 | 4096 })
                  }
                  className="w-full px-3 py-2 text-sm rounded-md bg-[var(--app-bg)] border border-[var(--app-border-strong)] text-[var(--app-text)]"
                >
                  <option value={1024}>1024 bins</option>
                  <option value={2048}>2048 bins</option>
                  <option value={4096}>4096 bins</option>
                </select>
              </div>
            </div>

            <div>
              <label
                htmlFor="default-confidence"
                className="flex items-center justify-between text-xs font-medium text-[var(--app-text-muted)] mb-1.5"
              >
                <span>Default Display Confidence Threshold</span>
                <span className="font-mono tabular-nums text-[var(--app-text)]">
                  {audioPrefs.minConfidenceThreshold.toFixed(2)}
                </span>
              </label>
              <input
                id="default-confidence"
                type="range"
                min={0.1}
                max={0.95}
                step={0.05}
                value={audioPrefs.minConfidenceThreshold}
                onChange={(e) =>
                  updateAudioPrefs({ minConfidenceThreshold: Number(e.target.value) })
                }
                className="w-full accent-[#788B68] cursor-pointer"
              />
            </div>

            <div className="space-y-3 pt-1">
              <label className="flex items-center justify-between gap-4 cursor-pointer">
                <div>
                  <div className="text-sm font-medium text-[var(--app-text)]">
                    Disable Browser Noise Suppression
                  </div>
                  <div className="text-xs text-[var(--app-text-muted)]">
                    Recommended off for bioacoustics so bird vocalizations are not attenuated
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={!audioPrefs.noiseSuppression}
                  onChange={(e) => updateAudioPrefs({ noiseSuppression: !e.target.checked })}
                  className="w-4 h-4 accent-[#788B68]"
                />
              </label>

              <label className="flex items-center justify-between gap-4 cursor-pointer">
                <div>
                  <div className="text-sm font-medium text-[var(--app-text)]">
                    Disable Auto Gain Control (AGC)
                  </div>
                  <div className="text-xs text-[var(--app-text-muted)]">
                    Preserves true relative dBFS amplitude ratios across frequencies
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={!audioPrefs.autoGainControl}
                  onChange={(e) => updateAudioPrefs({ autoGainControl: !e.target.checked })}
                  className="w-4 h-4 accent-[#788B68]"
                />
              </label>
            </div>
          </SurfacePanel>

          {/* Backend Connection Endpoints (No secrets stored or exposed) */}
          <SurfacePanel as="section" className="p-6 space-y-5">
            <div className="pb-3 border-b border-[var(--app-border)]">
              <h2 className="font-serif text-2xl font-semibold text-[var(--app-text)]">
                Backend Connection
              </h2>
              <p className="text-xs text-[var(--app-text-muted)] mt-0.5">
                Client configuration for Stage 2 integration. No requests are sent and no secrets
                or credentials are stored in the browser.
              </p>
            </div>

            <form onSubmit={handleSaveBackendConfig} noValidate className="space-y-4">
              <div>
                <label
                  htmlFor="api-base-url"
                  className="block text-xs font-medium text-[var(--app-text-muted)] mb-1.5"
                >
                  REST API Base URL
                </label>
                <input
                  id="api-base-url"
                  type="url"
                  value={apiUrlInput}
                  aria-invalid={Boolean(fieldErrors.apiBaseUrl)}
                  aria-describedby={fieldErrors.apiBaseUrl ? apiErrorId : undefined}
                  onChange={(e) => {
                    setApiUrlInput(e.target.value);
                    if (fieldErrors.apiBaseUrl) {
                      setFieldErrors((prev) => ({ ...prev, apiBaseUrl: undefined }));
                    }
                  }}
                  className="w-full px-3 py-2 text-sm font-mono rounded-md bg-[var(--app-bg)] border border-[var(--app-border-strong)] text-[var(--app-text)] focus:outline-none focus:border-[#788B68]"
                />
                {fieldErrors.apiBaseUrl && (
                  <p id={apiErrorId} role="alert" className="mt-1.5 text-xs text-[var(--app-amber)]">
                    {fieldErrors.apiBaseUrl}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="ws-stream-url"
                  className="block text-xs font-medium text-[var(--app-text-muted)] mb-1.5"
                >
                  WebSocket Stream URL
                </label>
                <input
                  id="ws-stream-url"
                  type="text"
                  value={wsUrlInput}
                  aria-invalid={Boolean(fieldErrors.wsStreamUrl)}
                  aria-describedby={fieldErrors.wsStreamUrl ? wsErrorId : undefined}
                  onChange={(e) => {
                    setWsUrlInput(e.target.value);
                    if (fieldErrors.wsStreamUrl) {
                      setFieldErrors((prev) => ({ ...prev, wsStreamUrl: undefined }));
                    }
                  }}
                  className="w-full px-3 py-2 text-sm font-mono rounded-md bg-[var(--app-bg)] border border-[var(--app-border-strong)] text-[var(--app-text)] focus:outline-none focus:border-[#788B68]"
                />
                {fieldErrors.wsStreamUrl && (
                  <p id={wsErrorId} role="alert" className="mt-1.5 text-xs text-[var(--app-amber)]">
                    {fieldErrors.wsStreamUrl}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="reconnect-interval-ms"
                    className="block text-xs font-medium text-[var(--app-text-muted)] mb-1.5"
                  >
                    Reconnection Interval (ms)
                  </label>
                  <input
                    id="reconnect-interval-ms"
                    type="number"
                    min={MIN_RECONNECT_INTERVAL_MS}
                    max={MAX_RECONNECT_INTERVAL_MS}
                    step={100}
                    value={reconnectInput}
                    aria-invalid={Boolean(fieldErrors.reconnectIntervalMs)}
                    aria-describedby={fieldErrors.reconnectIntervalMs ? reconnectErrorId : undefined}
                    onChange={(e) => {
                      setReconnectInput(e.target.value);
                      if (fieldErrors.reconnectIntervalMs) {
                        setFieldErrors((prev) => ({ ...prev, reconnectIntervalMs: undefined }));
                      }
                    }}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-md bg-[var(--app-bg)] border border-[var(--app-border-strong)] text-[var(--app-text)] focus:outline-none focus:border-[#788B68]"
                  />
                  {fieldErrors.reconnectIntervalMs && (
                    <p
                      id={reconnectErrorId}
                      role="alert"
                      className="mt-1.5 text-xs text-[var(--app-amber)]"
                    >
                      {fieldErrors.reconnectIntervalMs}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="backend-config-mode"
                    className="block text-xs font-medium text-[var(--app-text-muted)] mb-1.5"
                  >
                    Configuration Mode
                  </label>
                  <select
                    id="backend-config-mode"
                    value={modeInput}
                    aria-invalid={Boolean(fieldErrors.mode)}
                    aria-describedby={fieldErrors.mode ? modeErrorId : undefined}
                    onChange={(e) => {
                      setModeInput(e.target.value as BackendConnectionConfig['mode']);
                      if (fieldErrors.mode) {
                        setFieldErrors((prev) => ({ ...prev, mode: undefined }));
                      }
                    }}
                    className="w-full px-3 py-2 text-sm rounded-md bg-[var(--app-bg)] border border-[var(--app-border-strong)] text-[var(--app-text)] focus:outline-none focus:border-[#788B68]"
                  >
                    <option value="demo">demo (Local Fixtures)</option>
                    <option value="backend_ready">backend_ready (Stage 2 Ready)</option>
                  </select>
                  {fieldErrors.mode && (
                    <p id={modeErrorId} role="alert" className="mt-1.5 text-xs text-[var(--app-amber)]">
                      {fieldErrors.mode}
                    </p>
                  )}
                </div>
              </div>

              {modeInput === 'backend_ready' && (
                <p className="text-xs text-[var(--app-text-muted)] leading-relaxed border-l-2 border-[var(--app-amber)]/60 pl-3">
                  Selecting <span className="font-mono text-[var(--app-text)]">backend_ready</span>{' '}
                  records your endpoint target for handoff only. It does not connect to a backend or
                  verify endpoint reachability.
                </p>
              )}

              {savedNotice && (
                <p role="status" className="inline-flex items-center gap-1.5 text-xs text-[#788B68]">
                  <Check className="w-3.5 h-3.5 shrink-0" />
                  <span>{savedNotice}</span>
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Button type="submit" variant="primary" size="sm">
                  Save Configuration
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={handleExportConfig}>
                  <Download className="w-3.5 h-3.5" />
                  <span>Export Config JSON</span>
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsResetModalOpen(true)}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Defaults</span>
                </Button>
              </div>
            </form>
          </SurfacePanel>
        </div>

        {/* Diagnostics Panel */}
        <SurfacePanel as="section" className="lg:col-span-5 p-6 space-y-5">
          <div className="pb-3 border-b border-[var(--app-border)]">
            <h2 className="font-serif text-2xl font-semibold text-[var(--app-text)]">
              Diagnostics
            </h2>
            <p className="text-xs text-[var(--app-text-muted)] mt-0.5">
              Verified runtime capabilities and adapter telemetry
            </p>
          </div>

          <dl className="space-y-3 text-xs">
            <div className="flex items-start justify-between gap-4 py-2 border-b border-[var(--app-border)]">
              <dt className="text-[var(--app-text-muted)] shrink-0">Active Data Adapter</dt>
              <dd className="font-mono text-[var(--app-text)] text-right">
                {diagnostics.adapterName}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4 py-2 border-b border-[var(--app-border)]">
              <dt className="text-[var(--app-text-muted)] shrink-0">Adapter Mode</dt>
              <dd className="font-mono text-[var(--app-amber)] text-right">
                {diagnostics.isDemoMode ? 'DEMO FIXTURE MODE' : 'LIVE'}
                {backendConfig.mode === 'backend_ready' ? ' · CONFIG READY' : ''}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4 py-2 border-b border-[var(--app-border)]">
              <dt className="text-[var(--app-text-muted)] shrink-0">Adapter Status</dt>
              <dd
                data-testid="diag-adapter-status"
                className={`font-mono text-right ${
                  bootstrapError ? 'text-[var(--app-amber)]' : 'text-[var(--app-accent)]'
                }`}
              >
                {adapterStatusLabel}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4 py-2 border-b border-[var(--app-border)]">
              <dt className="text-[var(--app-text-muted)] shrink-0">Dataset Identifier</dt>
              <dd className="font-mono text-[var(--app-text-secondary)] text-right">
                {diagnostics.datasetId ?? 'N/A'}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4 py-2 border-b border-[var(--app-border)]">
              <dt className="text-[var(--app-text-muted)] shrink-0">Bootstrap Latency</dt>
              <dd className="font-mono tabular-nums text-[var(--app-text)] text-right">
                {bootstrapLatencyMs !== null ? `${bootstrapLatencyMs} ms` : 'N/A'}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4 py-2 border-b border-[var(--app-border)]">
              <dt className="text-[var(--app-text-muted)] shrink-0">Last Sync Timestamp</dt>
              <dd className="font-mono tabular-nums text-[var(--app-text-secondary)] text-right">
                {lastSyncIso ? formatTimestampDateTime(lastSyncIso) : 'N/A'}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4 py-2 border-b border-[var(--app-border)]">
              <dt className="text-[var(--app-text-muted)] shrink-0">WebGL Capability</dt>
              <dd
                className={`font-mono text-right ${
                  runtimeCaps.webglSupported ? 'text-[var(--app-accent)]' : 'text-[var(--app-text-muted)]'
                }`}
              >
                {runtimeCaps.webglSupported === true
                  ? 'Supported'
                  : runtimeCaps.webglSupported === false
                    ? 'Unavailable'
                    : 'N/A'}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4 py-2 border-b border-[var(--app-border)]">
              <dt className="text-[var(--app-text-muted)] shrink-0">AudioContext Sample Rate</dt>
              <dd className="font-mono tabular-nums text-[var(--app-text)] text-right">
                {runtimeCaps.audioContextSampleRateHz !== null
                  ? `${runtimeCaps.audioContextSampleRateHz.toLocaleString()} Hz`
                  : 'N/A'}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4 py-2 border-b border-[var(--app-border)]">
              <dt className="text-[var(--app-text-muted)] shrink-0">localStorage Availability</dt>
              <dd
                className={`font-mono text-right ${
                  storageAvailable && runtimeCaps.localStorageAvailable
                    ? 'text-[var(--app-accent)]'
                    : 'text-[var(--app-amber)]'
                }`}
              >
                {storageAvailable && runtimeCaps.localStorageAvailable ? 'Available' : 'Unavailable'}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4 py-2 border-b border-[var(--app-border)]">
              <dt className="text-[var(--app-text-muted)] shrink-0">Adapter Contract</dt>
              <dd className="font-mono text-[var(--app-text-secondary)] text-right">
                {diagnostics.protocolVersion}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4 py-2 border-b border-[var(--app-border)]">
              <dt className="text-[var(--app-text-muted)] shrink-0">MediaDevices.getUserMedia</dt>
              <dd
                className={`font-mono text-right ${
                  diagnostics.mediaDevicesSupported
                    ? 'text-[var(--app-accent)]'
                    : 'text-[var(--app-text-muted)]'
                }`}
              >
                {diagnostics.mediaDevicesSupported ? 'Available' : 'Unavailable'}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4 py-2">
              <dt className="text-[var(--app-text-muted)] shrink-0">WebSocket State</dt>
              <dd className="font-mono text-[var(--app-text-muted)] text-right">
                Not connected (Stage 1 Demo)
              </dd>
            </div>
          </dl>
        </SurfacePanel>
      </div>

      <ConfirmModal
        isOpen={isResetModalOpen}
        title="Reset Workspace Preferences?"
        description="This restores appearance, audio input preferences, and backend connection endpoints to their default values and clears your saved local preferences."
        confirmLabel="Reset Defaults"
        cancelLabel="Cancel"
        onConfirm={handleConfirmReset}
        onCancel={() => setIsResetModalOpen(false)}
      />
    </AppShell>
  );
}
