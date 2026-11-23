import { useCallback, useEffect, useRef, useState } from 'react';

export interface AudioInputDeviceInfo {
  deviceId: string;
  label: string;
}

export type MicPermissionState = 'unknown' | 'prompt' | 'granted' | 'denied' | 'unsupported';

interface MicTestOptions {
  preferredDeviceId: string;
  sampleRateHz: 44100 | 48000;
  noiseSuppression: boolean;
  autoGainControl: boolean;
}

export function useMicrophoneDevices() {
  const isMediaDevicesSupported =
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.enumerateDevices) &&
    Boolean(navigator.mediaDevices?.getUserMedia);

  const [devices, setDevices] = useState<AudioInputDeviceInfo[]>([]);
  const [permissionState, setPermissionState] = useState<MicPermissionState>(
    isMediaDevicesSupported ? 'unknown' : 'unsupported'
  );
  const [isEnumerating, setIsEnumerating] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [activityLevelPct, setActivityLevelPct] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  const stopMicTest = useCallback(() => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        try {
          track.stop();
        } catch {
          // Ignore track cleanup errors
        }
      }
      streamRef.current = null;
    }

    if (audioCtxRef.current) {
      const ctx = audioCtxRef.current;
      audioCtxRef.current = null;
      void ctx.close().catch(() => {});
    }

    if (mountedRef.current) {
      setIsTesting(false);
      setActivityLevelPct(0);
    }
  }, []);

  const refreshDevices = useCallback(async () => {
    if (!isMediaDevicesSupported || !navigator.mediaDevices?.enumerateDevices) {
      setPermissionState('unsupported');
      setDevices([]);
      return;
    }

    setIsEnumerating(true);
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      if (!mountedRef.current) return;

      const audioInputs = all
        .filter((d) => d.kind === 'audioinput')
        .map((d, idx) => ({
          deviceId: d.deviceId || `input-${idx + 1}`,
          label: d.label.trim() || `Microphone Input ${idx + 1} (Label hidden until access granted)`,
        }));

      // Deduplicate by deviceId while keeping order
      const seen = new Set<string>();
      const uniqueInputs: AudioInputDeviceInfo[] = [];
      for (const item of audioInputs) {
        if (!seen.has(item.deviceId)) {
          seen.add(item.deviceId);
          uniqueInputs.push(item);
        }
      }

      setDevices(uniqueInputs);
    } catch {
      if (mountedRef.current) {
        setErrorMessage('Unable to enumerate browser audio input devices.');
      }
    } finally {
      if (mountedRef.current) {
        setIsEnumerating(false);
      }
    }
  }, [isMediaDevicesSupported]);

  // Passive permission inspection + device enumeration on mount (never invokes getUserMedia)
  useEffect(() => {
    mountedRef.current = true;

    if (!isMediaDevicesSupported) {
      setPermissionState('unsupported');
      return () => {
        mountedRef.current = false;
        stopMicTest();
      };
    }

    let permStatus: PermissionStatus | null = null;
    const handlePermChange = () => {
      if (!mountedRef.current || !permStatus) return;
      if (permStatus.state === 'granted' || permStatus.state === 'denied' || permStatus.state === 'prompt') {
        setPermissionState(permStatus.state);
      }
      void refreshDevices();
    };

    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'microphone' as PermissionName })
        .then((status) => {
          if (!mountedRef.current) return;
          permStatus = status;
          if (status.state === 'granted' || status.state === 'denied' || status.state === 'prompt') {
            setPermissionState(status.state);
          }
          status.addEventListener('change', handlePermChange);
        })
        .catch(() => {
          // Permissions API for microphone is unsupported in some browsers
        });
    }

    void refreshDevices();

    const mediaDevices = navigator.mediaDevices;
    const handleDeviceChange = () => {
      void refreshDevices();
    };
    mediaDevices.addEventListener?.('devicechange', handleDeviceChange);

    return () => {
      mountedRef.current = false;
      mediaDevices.removeEventListener?.('devicechange', handleDeviceChange);
      if (permStatus) {
        permStatus.removeEventListener('change', handlePermChange);
      }
      stopMicTest();
    };
  }, [isMediaDevicesSupported, refreshDevices, stopMicTest]);

  const startMicTest = useCallback(
    async (options: MicTestOptions) => {
      stopMicTest();
      setErrorMessage(null);
      setStatusMessage(null);

      if (!isMediaDevicesSupported || !navigator.mediaDevices?.getUserMedia) {
        setPermissionState('unsupported');
        setErrorMessage('Audio capture via MediaDevices.getUserMedia is not supported in this browser.');
        return;
      }

      const baseConstraints: MediaTrackConstraints = {
        noiseSuppression: options.noiseSuppression,
        autoGainControl: options.autoGainControl,
        sampleRate: options.sampleRateHz,
      };
      if (options.preferredDeviceId && options.preferredDeviceId !== 'default') {
        baseConstraints.deviceId = { exact: options.preferredDeviceId };
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: baseConstraints });
      } catch (err) {
        const domErr = err as { name?: string };
        // Fallback if specific deviceId or constraint was overconstrained
        if (domErr?.name === 'OverconstrainedError' && baseConstraints.deviceId) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: {
                noiseSuppression: options.noiseSuppression,
                autoGainControl: options.autoGainControl,
              },
            });
          } catch (fallbackErr) {
            const fbErr = fallbackErr as { name?: string };
            if (fbErr?.name === 'NotAllowedError' || fbErr?.name === 'PermissionDeniedError') {
              setPermissionState('denied');
              setErrorMessage(
                'Microphone permission was denied. Enable audio input access in browser site settings to test devices.'
              );
            } else {
              setErrorMessage('No accessible microphone input device could be opened.');
            }
            return;
          }
        } else if (domErr?.name === 'NotAllowedError' || domErr?.name === 'PermissionDeniedError') {
          setPermissionState('denied');
          setErrorMessage(
            'Microphone permission was denied. Enable audio input access in browser site settings to test devices.'
          );
          return;
        } else if (domErr?.name === 'NotFoundError' || domErr?.name === 'DevicesNotFoundError') {
          setErrorMessage('No microphone hardware was detected by the browser.');
          return;
        } else if (domErr?.name === 'NotReadableError') {
          setErrorMessage('Selected microphone is busy or unreadable by the browser.');
          return;
        } else {
          setErrorMessage('Unable to start microphone input test in this browser environment.');
          return;
        }
      }

      if (!mountedRef.current) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }

      streamRef.current = stream;
      setPermissionState('granted');
      const activeTrack = stream.getAudioTracks()[0];
      setStatusMessage(
        activeTrack?.label
          ? `Listening on: ${activeTrack.label}`
          : 'Microphone stream active — reading live input signal'
      );
      setIsTesting(true);

      // Re-enumerate so browser populates real hardware labels after grant
      void refreshDevices();

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

      if (!AudioCtx) {
        return;
      }

      try {
        const ctx = new AudioCtx();
        audioCtxRef.current = ctx;
        if (ctx.state === 'suspended') {
          await ctx.resume().catch(() => {});
        }
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        // Connect source -> analyser only (never destination) to avoid feedback
        source.connect(analyser);

        const buffer = new Uint8Array(analyser.fftSize);
        let lastUiTick = 0;

        const sampleInput = (now: number) => {
          if (!mountedRef.current || !streamRef.current) return;

          if (now - lastUiTick >= 70) {
            lastUiTick = now;
            analyser.getByteTimeDomainData(buffer);
            let sumSquares = 0;
            for (let i = 0; i < buffer.length; i += 1) {
              const normalized = (buffer[i] - 128) / 128;
              sumSquares += normalized * normalized;
            }
            const rms = Math.sqrt(sumSquares / buffer.length);
            const scaledPct = Math.min(100, Math.round(rms * 320));
            setActivityLevelPct(scaledPct);
          }

          rafRef.current = window.requestAnimationFrame(sampleInput);
        };

        rafRef.current = window.requestAnimationFrame(sampleInput);
      } catch {
        setStatusMessage('Microphone stream active (signal meter unavailable in this AudioContext)');
      }
    },
    [isMediaDevicesSupported, refreshDevices, stopMicTest]
  );

  return {
    isMediaDevicesSupported,
    devices,
    permissionState,
    isEnumerating,
    isTesting,
    activityLevelPct,
    statusMessage,
    errorMessage,
    refreshDevices,
    startMicTest,
    stopMicTest,
  };
}
