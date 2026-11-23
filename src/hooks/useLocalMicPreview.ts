import { useCallback, useEffect, useRef, useState } from 'react';
import { computeAnalyserMetrics, dbToLinearGain } from '../lib/observatory';
import type { AudioInputPreferences } from '../types/ecosonic';

export type MicPreviewStatus = 'idle' | 'starting' | 'active' | 'error';

export interface MicLiveTelemetry {
  rmsLevelDbfs: number;
  peakFrequencyHz: number;
  activityPct: number;
}

export function useLocalMicPreview(audioPrefs: AudioInputPreferences, inputGainDb: number) {
  const isSupported =
    typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

  const [status, setStatus] = useState<MicPreviewStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeDeviceLabel, setActiveDeviceLabel] = useState<string | null>(null);
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);
  const [liveTelemetry, setLiveTelemetry] = useState<MicLiveTelemetry>({
    rmsLevelDbfs: -96,
    peakFrequencyHz: 0,
    activityPct: 0,
  });

  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const metricRafRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const gainDbRef = useRef(inputGainDb);
  gainDbRef.current = inputGainDb;

  const stopPreview = useCallback(() => {
    if (metricRafRef.current !== null) {
      window.cancelAnimationFrame(metricRafRef.current);
      metricRafRef.current = null;
    }

    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.disconnect();
      } catch {
        // Ignore disconnect error
      }
      sourceNodeRef.current = null;
    }

    if (gainNodeRef.current) {
      try {
        gainNodeRef.current.disconnect();
      } catch {
        // Ignore disconnect error
      }
      gainNodeRef.current = null;
    }

    if (analyserRef.current) {
      try {
        analyserRef.current.disconnect();
      } catch {
        // Ignore disconnect error
      }
      analyserRef.current = null;
    }

    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        try {
          track.onended = null;
          track.stop();
        } catch {
          // Ignore track stop errors
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
      setAnalyserNode(null);
      setActiveDeviceLabel(null);
      setStatus((prev) => (prev === 'error' ? prev : 'idle'));
      setLiveTelemetry({ rmsLevelDbfs: -96, peakFrequencyHz: 0, activityPct: 0 });
    }
  }, []);

  // Dynamically apply gain slider changes to active GainNode
  useEffect(() => {
    const gainNode = gainNodeRef.current;
    const ctx = audioCtxRef.current;
    if (!gainNode || !ctx) return;

    const linear = dbToLinearGain(inputGainDb);
    try {
      gainNode.gain.setTargetAtTime(linear, ctx.currentTime, 0.02);
    } catch {
      gainNode.gain.value = linear;
    }
  }, [inputGainDb]);

  // Dynamically propagate FFT window preference changes to active AnalyserNode
  useEffect(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    try {
      analyser.fftSize = audioPrefs.fftSize;
    } catch {
      // Fallback safely if browser limits FFT size
    }
  }, [audioPrefs.fftSize]);

  // Clean up on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopPreview();
    };
  }, [stopPreview]);

  const startPreview = useCallback(async () => {
    stopPreview();
    setErrorMessage(null);

    if (!isSupported || !navigator.mediaDevices?.getUserMedia) {
      setStatus('error');
      setErrorMessage(
        'Browser microphone capture (MediaDevices.getUserMedia) is unavailable in this environment.'
      );
      return;
    }

    setStatus('starting');

    const constraints: MediaTrackConstraints = {
      noiseSuppression: audioPrefs.noiseSuppression,
      autoGainControl: audioPrefs.autoGainControl,
      sampleRate: audioPrefs.sampleRateHz,
    };
    if (audioPrefs.preferredDeviceId && audioPrefs.preferredDeviceId !== 'default') {
      constraints.deviceId = { exact: audioPrefs.preferredDeviceId };
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: constraints });
    } catch (err) {
      const domErr = err as { name?: string };
      if (domErr?.name === 'OverconstrainedError' && constraints.deviceId) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              noiseSuppression: audioPrefs.noiseSuppression,
              autoGainControl: audioPrefs.autoGainControl,
            },
          });
        } catch (fallbackErr) {
          if (!mountedRef.current) return;
          const fb = fallbackErr as { name?: string };
          setStatus('error');
          setErrorMessage(mapMediaError(fb?.name));
          return;
        }
      } else {
        if (!mountedRef.current) return;
        setStatus('error');
        setErrorMessage(mapMediaError(domErr?.name));
        return;
      }
    }

    if (!mountedRef.current) {
      for (const t of stream.getTracks()) t.stop();
      return;
    }

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioCtx) {
      for (const t of stream.getTracks()) t.stop();
      setStatus('error');
      setErrorMessage('Web Audio API AudioContext is unsupported in this browser.');
      return;
    }

    try {
      const ctx = new AudioCtx({ sampleRate: audioPrefs.sampleRateHz });
      if (ctx.state === 'suspended') {
        await ctx.resume().catch(() => {});
      }

      const source = ctx.createMediaStreamSource(stream);
      const gainNode = ctx.createGain();
      gainNode.gain.value = dbToLinearGain(gainDbRef.current);

      const analyser = ctx.createAnalyser();
      analyser.fftSize = audioPrefs.fftSize;
      analyser.smoothingTimeConstant = 0.72;

      // Browser-local visualization chain only: NEVER connect to ctx.destination
      source.connect(gainNode);
      gainNode.connect(analyser);

      streamRef.current = stream;
      audioCtxRef.current = ctx;
      sourceNodeRef.current = source;
      gainNodeRef.current = gainNode;
      analyserRef.current = analyser;

      const primaryTrack = stream.getAudioTracks()[0];
      if (primaryTrack) {
        setActiveDeviceLabel(primaryTrack.label || 'System Default Microphone');
        primaryTrack.onended = () => {
          stopPreview();
        };
      }

      setAnalyserNode(analyser);
      setStatus('active');

      const timeBuf = new Float32Array(analyser.fftSize);
      const freqBuf = new Uint8Array(analyser.frequencyBinCount);
      let lastMeterTick = 0;

      const updateMeter = (now: number) => {
        if (!mountedRef.current || !analyserRef.current) return;

        if (now - lastMeterTick >= 100) {
          lastMeterTick = now;
          const activeAnalyser = analyserRef.current;
          const currentTimeBuf =
            timeBuf.length === activeAnalyser.fftSize
              ? timeBuf
              : new Float32Array(activeAnalyser.fftSize);
          const currentFreqBuf =
            freqBuf.length === activeAnalyser.frequencyBinCount
              ? freqBuf
              : new Uint8Array(activeAnalyser.frequencyBinCount);

          activeAnalyser.getFloatTimeDomainData(currentTimeBuf);
          activeAnalyser.getByteFrequencyData(currentFreqBuf);

          const measured = computeAnalyserMetrics(
            currentTimeBuf,
            currentFreqBuf,
            ctx.sampleRate || audioPrefs.sampleRateHz
          );
          setLiveTelemetry(measured);
        }

        metricRafRef.current = window.requestAnimationFrame(updateMeter);
      };

      metricRafRef.current = window.requestAnimationFrame(updateMeter);
    } catch {
      for (const t of stream.getTracks()) t.stop();
      stopPreview();
      setStatus('error');
      setErrorMessage('Failed to initialize local Web Audio preview processing chain.');
    }
  }, [
    audioPrefs.autoGainControl,
    audioPrefs.fftSize,
    audioPrefs.noiseSuppression,
    audioPrefs.preferredDeviceId,
    audioPrefs.sampleRateHz,
    isSupported,
    stopPreview,
  ]);

  return {
    isSupported,
    status,
    errorMessage,
    activeDeviceLabel,
    analyserNode,
    liveTelemetry,
    startPreview,
    stopPreview,
  };
}

function mapMediaError(errorName?: string): string {
  switch (errorName) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'Microphone permission was denied. Allow audio input in browser site settings to run local preview.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No microphone hardware was detected by the browser.';
    case 'NotReadableError':
      return 'Microphone input is busy or could not be opened by the browser.';
    default:
      return 'Unable to start browser-local microphone preview.';
  }
}
