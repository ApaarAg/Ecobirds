export type SoundLayerId = 'birds' | 'wind' | 'water' | 'insects';

export interface SoundLayerMeta {
  id: SoundLayerId;
  label: string;
  speciesOrSource: string;
  category: string;
  description: string;
  licenseNotice: string;
}

export const SOUNDSCAPE_LAYERS: Record<SoundLayerId, SoundLayerMeta> = {
  birds: {
    id: 'birds',
    label: 'Birds',
    speciesOrSource: 'Woodland Songbird Chorus (Illustrative Synthesis)',
    category: 'Biophony · Avian Vocalization',
    description:
      'High-canopy harmonic whistles and modulated dawn calls propagating between 2.2 kHz and 5.4 kHz.',
    licenseNotice:
      'Original procedural Web Audio synthesis authored for EcoSonic 3.0 (CC0 1.0 Universal Public Domain).',
  },
  wind: {
    id: 'wind',
    label: 'Wind',
    speciesOrSource: 'Evergreen Canopy Breeze',
    category: 'Geophony · Atmospheric Turbulence',
    description:
      'Slowly swelling bandpass-filtered air movement brushing through Sitka spruce and cedar needles.',
    licenseNotice:
      'Original procedural Web Audio synthesis authored for EcoSonic 3.0 (CC0 1.0 Universal Public Domain).',
  },
  water: {
    id: 'water',
    label: 'Water',
    speciesOrSource: 'Forest Pond Margin & Brook',
    category: 'Geophony · Hydrological Flow',
    description:
      'Soft broadband stream shimmer and occasional water-drop resonance along mossy shoreline stones.',
    licenseNotice:
      'Original procedural Web Audio synthesis authored for EcoSonic 3.0 (CC0 1.0 Universal Public Domain).',
  },
  insects: {
    id: 'insects',
    label: 'Insects',
    speciesOrSource: 'Understory Fern Stridulation',
    category: 'Biophony · Orthoptera Envelope',
    description:
      'Subtle rhythmic high-frequency pulses nestled within the damp forest floor fern layer.',
    licenseNotice:
      'Original procedural Web Audio synthesis authored for EcoSonic 3.0 (CC0 1.0 Universal Public Domain).',
  },
};

export interface SoundscapeMixerSnapshot {
  isPlaying: boolean;
  isMuted: boolean;
  masterVolume: number;
  layers: Record<SoundLayerId, { enabled: boolean; volume: number }>;
  activeSpotlight: SoundLayerId | null;
}

type Listener = (snapshot: SoundscapeMixerSnapshot) => void;

export interface AcousticSpectrumSample {
  hasLiveAudio: boolean;
  amplitude: number;
  lowBand: number;
  midBand: number;
  highBand: number;
  peakFreqNorm: number;
  bands: Float32Array;
}

export const ACOUSTIC_SPECTRUM_BAND_COUNT = 16;

export function createAcousticSpectrumSample(): AcousticSpectrumSample {
  return {
    hasLiveAudio: false,
    amplitude: 0,
    lowBand: 0,
    midBand: 0,
    highBand: 0,
    peakFreqNorm: 0.35,
    bands: new Float32Array(ACOUSTIC_SPECTRUM_BAND_COUNT),
  };
}

/**
 * Calm, deterministic bioacoustic spectrum curve derived from current habitat audio mix
 * when user has not yet unmuted live Web Audio playback. Zero allocations when writing into `out`.
 */
export function computeAmbientEcologicalSpectrum(
  elapsedSec: number,
  mix: Partial<Record<SoundLayerId, number>>,
  out: AcousticSpectrumSample
): AcousticSpectrumSample {
  const water = Math.min(1, Math.max(0, mix.water ?? 0.55));
  const wind = Math.min(1, Math.max(0, mix.wind ?? 0.45));
  const birds = Math.min(1, Math.max(0, mix.birds ?? 0.25));
  const insects = Math.min(1, Math.max(0, mix.insects ?? 0.15));

  const t = Number.isFinite(elapsedSec) ? elapsedSec : 0;
  const low = Math.min(
    1,
    Math.max(0.05, wind * (0.34 + 0.14 * Math.sin(t * 0.52)) + water * 0.18)
  );
  const mid = Math.min(
    1,
    Math.max(0.06, water * (0.42 + 0.12 * Math.sin(t * 0.94 + 0.7)) + wind * 0.14)
  );
  const high = Math.min(
    1,
    Math.max(
      0.04,
      birds * (0.32 + 0.18 * Math.max(0, Math.sin(t * 1.45 + 0.3))) +
        insects * (0.24 + 0.1 * Math.sin(t * 2.3))
    )
  );

  let sum = 0;
  let weightedIdx = 0;
  for (let i = 0; i < ACOUSTIC_SPECTRUM_BAND_COUNT; i++) {
    const norm = i / (ACOUSTIC_SPECTRUM_BAND_COUNT - 1);
    const lowW = Math.exp(-Math.pow(norm / 0.28, 2)) * low;
    const midW = Math.exp(-Math.pow((norm - 0.44) / 0.26, 2)) * mid;
    const highW = Math.exp(-Math.pow((norm - 0.78) / 0.22, 2)) * high;
    const ripple =
      0.78 +
      0.22 * Math.sin(t * (1.1 + norm * 1.7) + i * 0.85) * Math.cos(t * 0.65 - i * 0.4);
    const v = Math.min(1, Math.max(0, (lowW + midW + highW) * ripple));
    out.bands[i] = v;
    sum += v;
    weightedIdx += v * norm;
  }

  out.hasLiveAudio = false;
  out.lowBand = low;
  out.midBand = mid;
  out.highBand = high;
  out.amplitude = Math.min(1, Math.max(0, (low * 0.32 + mid * 0.42 + high * 0.26) * 1.05));
  out.peakFreqNorm = sum > 0.001 ? weightedIdx / sum : 0.42;
  return out;
}

/**
 * Centralized Web Audio API soundscape controller.
 * - Starts muted and never autoplays on page load.
 * - Creates/resumes AudioContext only upon explicit user interaction.
 * - Exposes zero-allocation AnalyserNode FFT spectrum data for visual shaders & canvas contours.
 * - Cleans up all oscillators, buffers, timers, and AudioContext on dispose().
 */
class SoundscapeAudioController {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private freqBins: Uint8Array<ArrayBuffer> | null = null;
  private layerGains: Partial<Record<SoundLayerId, GainNode>> = {};
  private timers: number[] = [];
  private sourceNodes: AudioNode[] = [];
  private listeners = new Set<Listener>();

  private state: SoundscapeMixerSnapshot = {
    isPlaying: false,
    isMuted: true,
    masterVolume: 0.7,
    layers: {
      birds: { enabled: true, volume: 0.72 },
      wind: { enabled: true, volume: 0.55 },
      water: { enabled: true, volume: 0.6 },
      insects: { enabled: false, volume: 0.45 },
    },
    activeSpotlight: null,
  };

  public getSnapshot(): SoundscapeMixerSnapshot {
    return {
      ...this.state,
      layers: {
        birds: { ...this.state.layers.birds },
        wind: { ...this.state.layers.wind },
        water: { ...this.state.layers.water },
        insects: { ...this.state.layers.insects },
      },
    };
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit() {
    const snap = this.getSnapshot();
    for (const fn of this.listeners) {
      fn(snap);
    }
  }

  private ensureAudioGraph(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;

    if (!this.ctx) {
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.0001, this.ctx.currentTime);

      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.84;
      this.freqBins = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));

      this.masterGain.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);

      const ids: SoundLayerId[] = ['birds', 'wind', 'water', 'insects'];
      for (const id of ids) {
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
        gain.connect(this.masterGain);
        this.layerGains[id] = gain;
      }

      this.buildAmbientBed(this.ctx);
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private buildAmbientBed(ctx: AudioContext) {
    // Shared procedural pink/brown noise buffer (4 seconds seamless loop)
    const length = ctx.sampleRate * 4;
    const noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + white * 0.029;
      b1 = 0.985 * b1 + white * 0.032;
      b2 = 0.95 * b2 + white * 0.048;
      data[i] = (b0 + b1 + b2 + white * 0.08) * 0.35;
    }

    // 1. WIND LAYER: Low-mid sweeping bandpass noise modulated by slow LFO
    const windSrc = ctx.createBufferSource();
    windSrc.buffer = noiseBuffer;
    windSrc.loop = true;

    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.setValueAtTime(420, ctx.currentTime);
    windFilter.Q.setValueAtTime(1.4, ctx.currentTime);

    const windLfo = ctx.createOscillator();
    windLfo.frequency.setValueAtTime(0.11, ctx.currentTime);
    const windLfoGain = ctx.createGain();
    windLfoGain.gain.setValueAtTime(190, ctx.currentTime);
    windLfo.connect(windLfoGain);
    windLfoGain.connect(windFilter.frequency);

    windSrc.connect(windFilter);
    windFilter.connect(this.layerGains.wind!);
    windSrc.start();
    windLfo.start();
    this.sourceNodes.push(windSrc, windLfo);

    // 2. WATER LAYER: Gentle stream shimmer (higher bandpass + soft low body)
    const waterSrc = ctx.createBufferSource();
    waterSrc.buffer = noiseBuffer;
    waterSrc.loop = true;

    const waterFilter = ctx.createBiquadFilter();
    waterFilter.type = 'bandpass';
    waterFilter.frequency.setValueAtTime(1350, ctx.currentTime);
    waterFilter.Q.setValueAtTime(0.75, ctx.currentTime);

    waterSrc.connect(waterFilter);
    waterFilter.connect(this.layerGains.water!);
    waterSrc.start();
    this.sourceNodes.push(waterSrc);

    // 3. BIRDS LAYER: Scheduled melodic woodland phrases when playing & enabled
    const birdTimer = window.setInterval(() => {
      if (!this.ctx || !this.state.isPlaying || this.state.isMuted) return;
      if (!this.state.layers.birds.enabled) return;
      this.triggerBirdPhrase(this.ctx);
    }, 2400);
    this.timers.push(birdTimer);

    // 4. INSECTS LAYER: Subtle rhythmic high-frequency understory pulse
    const insectTimer = window.setInterval(() => {
      if (!this.ctx || !this.state.isPlaying || this.state.isMuted) return;
      if (!this.state.layers.insects.enabled) return;
      this.triggerInsectPulse(this.ctx);
    }, 1150);
    this.timers.push(insectTimer);
  }

  private triggerBirdPhrase(ctx: AudioContext) {
    const dest = this.layerGains.birds;
    if (!dest) return;
    const now = ctx.currentTime;
    const notes = [2480, 3120, 2790, 3520];
    const startNote = Math.floor(Math.random() * 2);

    for (let i = 0; i < 3; i++) {
      const t = now + i * 0.14;
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = 'sine';
      const baseFreq = notes[(startNote + i) % notes.length] + (Math.random() * 140 - 70);
      osc.frequency.setValueAtTime(baseFreq, t);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * (i === 2 ? 1.18 : 0.92), t + 0.1);

      env.gain.setValueAtTime(0.0001, t);
      env.gain.linearRampToValueAtTime(0.09, t + 0.02);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);

      osc.connect(env);
      env.connect(dest);
      osc.start(t);
      osc.stop(t + 0.13);
    }
  }

  private triggerInsectPulse(ctx: AudioContext) {
    const dest = this.layerGains.insects;
    if (!dest) return;
    const now = ctx.currentTime;
    for (let i = 0; i < 4; i++) {
      const t = now + i * 0.085;
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(4850, t);

      env.gain.setValueAtTime(0.0001, t);
      env.gain.linearRampToValueAtTime(0.035, t + 0.015);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);

      osc.connect(env);
      env.connect(dest);
      osc.start(t);
      osc.stop(t + 0.06);
    }
  }

  private syncGains() {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const targetMaster =
      this.state.isPlaying && !this.state.isMuted
        ? Math.max(0.0001, this.state.masterVolume * 0.65)
        : 0.0001;

    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setTargetAtTime(targetMaster, now, 0.12);

    (Object.keys(this.state.layers) as SoundLayerId[]).forEach((id) => {
      const node = this.layerGains[id];
      if (!node) return;
      const layer = this.state.layers[id];
      const target = layer.enabled ? Math.max(0.0001, layer.volume * 0.5) : 0.0001;
      node.gain.cancelScheduledValues(now);
      node.gain.setTargetAtTime(target, now, 0.12);
    });
  }

  public togglePlay(): void {
    this.ensureAudioGraph();
    const nextPlaying = !this.state.isPlaying;
    this.state.isPlaying = nextPlaying;
    if (nextPlaying && this.state.isMuted) {
      this.state.isMuted = false;
    }
    this.syncGains();
    if (nextPlaying && this.ctx && this.state.layers.birds.enabled) {
      this.triggerBirdPhrase(this.ctx);
    }
    this.emit();
  }

  public setMuted(muted: boolean): void {
    if (!muted) {
      this.ensureAudioGraph();
    }
    this.state.isMuted = muted;
    this.syncGains();
    this.emit();
  }

  public toggleMute(): void {
    this.setMuted(!this.state.isMuted);
  }

  public setMasterVolume(volume: number): void {
    this.state.masterVolume = Math.min(1, Math.max(0, volume));
    this.syncGains();
    this.emit();
  }

  public setLayerEnabled(id: SoundLayerId, enabled: boolean): void {
    this.state.layers[id].enabled = enabled;
    this.syncGains();
    this.emit();
  }

  public setLayerVolume(id: SoundLayerId, volume: number): void {
    this.state.layers[id].volume = Math.min(1, Math.max(0, volume));
    this.syncGains();
    this.emit();
  }

  /**
   * Explicit user interaction on a forest acoustic marker:
   * Highlights the marker, enables its layer, unmutes/starts audio, and triggers immediate feedback.
   */
  public activatePoint(id: SoundLayerId): void {
    const ctx = this.ensureAudioGraph();
    this.state.activeSpotlight = id;
    this.state.layers[id].enabled = true;
    this.state.isPlaying = true;
    this.state.isMuted = false;
    this.syncGains();

    if (ctx) {
      if (id === 'birds') this.triggerBirdPhrase(ctx);
      if (id === 'insects') this.triggerInsectPulse(ctx);
    }
    this.emit();
  }

  /**
   * Plays a subtle water-drop acoustic resonance when user clicks the water surface.
   * Also starts playback gently if not yet started.
   */
  public triggerWaterDropImpact(): void {
    const ctx = this.ensureAudioGraph();
    if (!ctx) return;

    if (!this.state.isPlaying) {
      this.state.isPlaying = true;
      this.state.isMuted = false;
      this.syncGains();
      this.emit();
    }

    if (this.state.isMuted) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(1180, now + 0.055);
    osc.frequency.exponentialRampToValueAtTime(440, now + 0.16);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(840, now);
    filter.Q.setValueAtTime(2.4, now);

    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(0.085, now + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);

    osc.connect(filter);
    filter.connect(env);
    env.connect(this.layerGains.water ?? this.masterGain!);
    osc.start(now);
    osc.stop(now + 0.26);
  }

  /**
   * Smoothly adapts layer gains along the scroll timeline when user has enabled audio.
   */
  public syncCinematicMix(mix: Record<SoundLayerId, number>): void {
    if (!this.ctx || !this.state.isPlaying || this.state.isMuted) return;
    const now = this.ctx.currentTime;
    (Object.keys(mix) as SoundLayerId[]).forEach((id) => {
      const node = this.layerGains[id];
      if (!node) return;
      const clamped = Math.min(1, Math.max(0, mix[id]));
      this.state.layers[id].enabled = clamped > 0.03;
      this.state.layers[id].volume = clamped;
      const target = clamped > 0.03 ? Math.max(0.0001, clamped * 0.5) : 0.0001;
      node.gain.setTargetAtTime(target, now, 0.22);
    });
  }

  /**
   * Samples live Web Audio AnalyserNode FFT spectrum data when active, or blends cleanly into
   * deterministic ambient ecological harmonics when muted. Zero heap allocations per frame.
   */
  public sampleAcousticSpectrum(
    elapsedSec: number,
    mix: Partial<Record<SoundLayerId, number>>,
    out: AcousticSpectrumSample
  ): AcousticSpectrumSample {
    const analyser = this.analyser;
    const bins = this.freqBins;
    if (
      analyser &&
      bins &&
      this.ctx?.state === 'running' &&
      this.state.isPlaying &&
      !this.state.isMuted
    ) {
      analyser.getByteFrequencyData(bins);
      const usefulCount = Math.min(bins.length, 44);
      let lowSum = 0;
      let midSum = 0;
      let highSum = 0;
      let total = 0;
      let weightedFreq = 0;

      for (let i = 0; i < usefulCount; i++) {
        const val = bins[i] / 255;
        total += val;
        weightedFreq += val * (i / Math.max(1, usefulCount - 1));
        if (i < 4) lowSum += val;
        else if (i < 13) midSum += val;
        else highSum += val;
      }

      const liveLow = Math.min(1, (lowSum / 4) * 1.85);
      const liveMid = Math.min(1, (midSum / 9) * 2.1);
      const liveHigh = Math.min(1, (highSum / Math.max(1, usefulCount - 13)) * 3.1);
      const liveAmp = Math.min(1, (total / usefulCount) * 2.6);

      if (liveAmp > 0.008) {
        for (let b = 0; b < ACOUSTIC_SPECTRUM_BAND_COUNT; b++) {
          const norm = b / (ACOUSTIC_SPECTRUM_BAND_COUNT - 1);
          const idxFloat = Math.pow(norm, 1.35) * (usefulCount - 1);
          const i0 = Math.floor(idxFloat);
          const i1 = Math.min(usefulCount - 1, i0 + 1);
          const frac = idxFloat - i0;
          const interp = (bins[i0] * (1 - frac) + bins[i1] * frac) / 255;
          out.bands[b] = Math.min(1, interp * (1.85 + norm * 1.1));
        }
        out.hasLiveAudio = true;
        out.lowBand = liveLow;
        out.midBand = liveMid;
        out.highBand = liveHigh;
        out.amplitude = liveAmp;
        out.peakFreqNorm = total > 0.001 ? weightedFreq / total : 0.42;
        return out;
      }
    }

    return computeAmbientEcologicalSpectrum(elapsedSec, mix, out);
  }

  public setSpotlight(id: SoundLayerId | null): void {
    this.state.activeSpotlight = id;
    this.emit();
  }

  public stopAll(): void {
    this.state.isPlaying = false;
    this.state.isMuted = true;
    this.syncGains();
    this.emit();
  }

  public dispose(): void {
    this.stopAll();
    for (const timer of this.timers) {
      window.clearInterval(timer);
    }
    this.timers = [];
    for (const node of this.sourceNodes) {
      try {
        if ('stop' in node && typeof (node as AudioScheduledSourceNode).stop === 'function') {
          (node as AudioScheduledSourceNode).stop();
        }
        node.disconnect();
      } catch {
        // Ignore already-stopped source nodes
      }
    }
    this.sourceNodes = [];
    if (this.analyser) {
      try {
        this.analyser.disconnect();
      } catch {
        // Ignore already disconnected node
      }
      this.analyser = null;
    }
    this.freqBins = null;
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
    this.masterGain = null;
    this.layerGains = {};
  }
}

export const soundscapeController = new SoundscapeAudioController();
