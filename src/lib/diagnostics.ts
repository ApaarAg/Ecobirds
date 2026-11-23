export interface RuntimeCapabilities {
  webglSupported: boolean | null;
  audioContextSampleRateHz: number | null;
  localStorageAvailable: boolean;
}

/**
 * Inspect genuine browser runtime capabilities without fabricating unsupported values.
 */
export function probeRuntimeCapabilities(): RuntimeCapabilities {
  let webglSupported: boolean | null = null;
  let audioContextSampleRateHz: number | null = null;
  let localStorageAvailable = false;

  if (typeof document !== 'undefined') {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      webglSupported = Boolean(gl);
      if (gl && 'getExtension' in gl) {
        const loseCtx = gl.getExtension('WEBGL_lose_context');
        loseCtx?.loseContext();
      }
    } catch {
      webglSupported = false;
    }
  }

  if (typeof window !== 'undefined') {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      try {
        const ctx = new AudioCtx();
        if (typeof ctx.sampleRate === 'number' && Number.isFinite(ctx.sampleRate) && ctx.sampleRate > 0) {
          audioContextSampleRateHz = ctx.sampleRate;
        }
        void ctx.close().catch(() => {});
      } catch {
        audioContextSampleRateHz = null;
      }
    }

    try {
      const probeKey = '__ecosonic_diag_probe__';
      window.localStorage.setItem(probeKey, '1');
      window.localStorage.removeItem(probeKey);
      localStorageAvailable = true;
    } catch {
      localStorageAvailable = false;
    }
  }

  return {
    webglSupported,
    audioContextSampleRateHz,
    localStorageAvailable,
  };
}
