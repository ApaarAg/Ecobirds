import { useEffect, useRef } from 'react';
import {
  createAcousticSpectrumSample,
  soundscapeController,
} from '../../audio/soundscapeEngine';
import type {
  AcousticStructureState,
  CinematicTimelineState,
} from '../../lib/cinematicTimeline';

interface AcousticEmergenceLayerProps {
  acoustic: AcousticStructureState;
  timelineRef: React.MutableRefObject<CinematicTimelineState>;
  isInViewport: boolean;
  reducedMotion: boolean;
}

const STRATA_COUNT = 36;
const _spectrumSample = createAcousticSpectrumSample();

/**
 * Restrained, Web Audio FFT-driven bioacoustic contour layer emerging cleanly along
 * the rainforest pool shoreline threshold (strictly above bottom-left typography):
 * - Organic water-harmonic contours undulated by live AnalyserNode low/mid/high frequency bands
 * - Calm interpolated frequency strata breathing softly in forest moss/parchment/ochre tones
 * - Zero neon, zero glow, zero per-frame React re-renders
 */
export function AcousticEmergenceLayer({
  acoustic,
  timelineRef,
  isInViewport,
  reducedMotion,
}: AcousticEmergenceLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const smoothedStrataRef = useRef(new Float32Array(STRATA_COUNT));

  const visible = acoustic.waveOpacity > 0.01 || acoustic.contourProgress > 0.01;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !visible || !isInViewport) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let disposed = false;
    let rafId = 0;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let elapsedSec = 0;
    let lastNow = performance.now();

    const resize = () => {
      const parent = canvas.parentElement;
      width = parent ? parent.clientWidth : window.innerWidth;
      height = parent ? parent.clientHeight : window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
    };

    resize();
    window.addEventListener('resize', resize);

    const draw = () => {
      rafId = 0;
      if (disposed) return;

      const now = performance.now();
      const dt = Math.min(0.1, Math.max(0.001, (now - lastNow) * 0.001));
      lastNow = now;
      if (!reducedMotion) {
        elapsedSec += dt;
      }

      const tl = timelineRef.current;
      const ac = tl.acoustic;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      if (ac.waveOpacity > 0.008 || ac.contourProgress > 0.008) {
        soundscapeController.sampleAcousticSpectrum(elapsedSec, tl.audioMix, _spectrumSample);

        const isCompact = width < 640;
        const leftX = width * (isCompact ? 0.06 : 0.056);
        const rightX = width * (isCompact ? 0.94 : 0.54);
        const spanW = rightX - leftX;
        // Anchored cleanly along the tranquil shoreline water threshold right above bottom-left typography
        const baseY = height * (isCompact ? 0.542 : 0.674);

        const low = _spectrumSample.lowBand;
        const mid = _spectrumSample.midBand;
        const high = _spectrumSample.highBand;
        const amp = _spectrumSample.amplitude;

        // Soft feathered dusk-mist cushion strictly behind the contour datum so thin lines never clash with bright moss/ferns
        const mistRadius = Math.max(spanW * 0.62, 160);
        const mistCenterX = leftX + spanW * 0.48;
        const mistGrad = ctx.createRadialGradient(
          mistCenterX,
          baseY + 4,
          12,
          mistCenterX,
          baseY + 4,
          mistRadius
        );
        const mistOpacity = 0.28 * Math.min(1, ac.waveOpacity * 1.15);
        mistGrad.addColorStop(0, `rgba(11, 15, 12, ${mistOpacity.toFixed(3)})`);
        mistGrad.addColorStop(0.58, `rgba(11, 15, 12, ${(mistOpacity * 0.45).toFixed(3)})`);
        mistGrad.addColorStop(1, 'rgba(11, 15, 12, 0)');
        ctx.fillStyle = mistGrad;
        ctx.fillRect(leftX - 40, baseY - 54, spanW + 80, 112);

        // 1. Subtle shoreline contour waveforms guided by low/mid/high audio harmonics
        const contours = [
          {
            offsetY: -12,
            color: 'rgba(213, 217, 198, ',
            alpha: 0.46,
            width: 1.15,
            freqA: 2.2,
            freqB: 5.0,
            speed: 0.55,
            bandAmp: 4.0 + low * 8.5,
          },
          {
            offsetY: 0,
            color: 'rgba(138, 166, 122, ',
            alpha: 0.62,
            width: 1.3,
            freqA: 3.0,
            freqB: 6.8,
            speed: -0.68,
            bandAmp: 5.0 + mid * 10.0,
          },
          {
            offsetY: 12,
            color: 'rgba(211, 163, 108, ',
            alpha: 0.44,
            width: 1.1,
            freqA: 4.2,
            freqB: 9.4,
            speed: 0.84,
            bandAmp: 3.2 + high * 8.8,
          },
        ];

        const revealLimit = Math.min(1, Math.max(0.05, ac.contourProgress));
        const segments = isCompact ? 56 : 80;

        for (let c = 0; c < contours.length; c++) {
          const cfg = contours[c];
          const lineAlpha = cfg.alpha * Math.min(1, ac.waveOpacity * 1.12);
          if (lineAlpha <= 0.005) continue;

          ctx.beginPath();
          ctx.lineWidth = cfg.width;
          ctx.strokeStyle = `${cfg.color}${lineAlpha.toFixed(3)})`;

          const activeEnd = Math.max(2, Math.floor(segments * revealLimit));
          for (let i = 0; i <= activeEnd; i++) {
            const u = i / segments;
            const x = leftX + spanW * u;
            const edgeTaper = Math.sin(u * Math.PI);
            const tipFade =
              revealLimit < 0.99 ? Math.max(0, 1 - Math.max(0, (u - revealLimit + 0.08) / 0.08)) : 1;
            const wave =
              Math.sin(u * Math.PI * cfg.freqA + elapsedSec * cfg.speed + c * 1.1) * 0.62 +
              Math.cos(u * Math.PI * cfg.freqB - elapsedSec * cfg.speed * 1.35) * 0.38;
            const y =
              baseY +
              cfg.offsetY +
              wave * cfg.bandAmp * edgeTaper * tipFade * (0.72 + 0.45 * amp);

            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }

        // 2. Restrained bioacoustic frequency strata rising softly above the waterline datum
        if (ac.spectrumIntensity > 0.01) {
          const strataAlphaBase = ac.spectrumIntensity * 0.66;
          const smoothed = smoothedStrataRef.current;
          const bands = _spectrumSample.bands;
          const bandMaxIdx = bands.length - 1;
          const datumY = baseY + 23;
          const blend = reducedMotion ? 1 : Math.min(1, dt * 8.5);

          for (let i = 0; i < STRATA_COUNT; i++) {
            const norm = i / (STRATA_COUNT - 1);
            const bandPos = norm * bandMaxIdx;
            const b0 = Math.floor(bandPos);
            const b1 = Math.min(bandMaxIdx, b0 + 1);
            const frac = bandPos - b0;
            const targetBand = bands[b0] * (1 - frac) + bands[b1] * frac;
            smoothed[i] += (targetBand - smoothed[i]) * blend;

            const env = Math.sin(norm * Math.PI);
            const barH = (4 + 26 * smoothed[i] * env) * ac.spectrumIntensity;
            const x = leftX + spanW * (0.03 + norm * 0.94);
            const alpha = strataAlphaBase * (0.40 + env * 0.56);
            const isAvianMidHigh = i >= 14 && i <= 25;

            ctx.beginPath();
            ctx.lineWidth = 1.25;
            ctx.lineCap = 'round';
            ctx.strokeStyle = isAvianMidHigh
              ? `rgba(211, 163, 108, ${alpha.toFixed(3)})`
              : `rgba(142, 168, 126, ${alpha.toFixed(3)})`;
            ctx.moveTo(x, datumY);
            ctx.lineTo(x, datumY - barH);
            ctx.stroke();
          }
        }
      }

      if (!reducedMotion && !disposed) {
        rafId = window.requestAnimationFrame(draw);
      }
    };

    rafId = window.requestAnimationFrame(draw);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, [visible, isInViewport, reducedMotion, timelineRef]);

  if (!visible) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      data-testid="acoustic-emergence-layer"
      className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
    >
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
}
