import { useCallback, useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import {
  soundscapeController,
  type SoundscapeMixerSnapshot,
} from '../../audio/soundscapeEngine';
import {
  computeCinematicTimeline,
  computeOpeningAutoProgress,
  OPENING_DURATION_SEC,
  OPENING_SETTLE_PROGRESS,
  type AcousticStructureState,
  type CinematicTimelineState,
  type TypographyState,
} from '../../lib/cinematicTimeline';
import { CinematicTypography } from './CinematicTypography';
import { DarkWaterScene } from './DarkWaterScene';
import { EmergingWorld } from './EmergingWorld';
import { WebGLCinematicStage } from './WebGLCinematicStage';
import { WorldTransition } from './WorldTransition';

gsap.registerPlugin(ScrollTrigger);

interface CinematicHeroProps {
  onNavbarVisibilityChange?: (visible: boolean) => void;
}

function typographyDiffers(a: TypographyState, b: TypographyState): boolean {
  return (
    a.navbarVisible !== b.navbarVisible ||
    Math.abs(a.quietMarkOpacity - b.quietMarkOpacity) > 0.015 ||
    Math.abs(a.brandOpacity - b.brandOpacity) > 0.015 ||
    Math.abs(a.taglineOpacity - b.taglineOpacity) > 0.015 ||
    Math.abs(a.descriptionOpacity - b.descriptionOpacity) > 0.015 ||
    Math.abs(a.ctaOpacity - b.ctaOpacity) > 0.015
  );
}

function acousticDiffers(a: AcousticStructureState, b: AcousticStructureState): boolean {
  return (
    Math.abs(a.waterResonance - b.waterResonance) > 0.02 ||
    Math.abs(a.topographyStrength - b.topographyStrength) > 0.02 ||
    Math.abs(a.waveOpacity - b.waveOpacity) > 0.015 ||
    Math.abs(a.contourProgress - b.contourProgress) > 0.015 ||
    Math.abs(a.spectrumIntensity - b.spectrumIntensity) > 0.015
  );
}

/**
 * Authoritative cinematic opening sequence:
 * Auto-playing opening film (blackness -> low-light tree -> hold -> attached leaf -> 7s fall -> water contact)
 * seamlessly bridged into Lenis + GSAP ScrollTrigger for the ripple -> forest -> identity reveal.
 */
export function CinematicHero({ onNavbarVisibilityChange }: CinematicHeroProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const timelineRef = useRef<CinematicTimelineState>(computeCinematicTimeline(0));
  const pointerTargetRef = useRef({ x: 0, y: 0 });
  const scrollProgressRef = useRef(0);
  const openingElapsedRef = useRef(0);
  const openingBaseRef = useRef(0);
  const scrollCapturedRef = useRef(false);
  const lastTickMsRef = useRef<number | null>(null);

  const [webglAvailable, setWebglAvailable] = useState(true);
  const [fallbackState, setFallbackState] = useState<CinematicTimelineState>(() =>
    computeCinematicTimeline(0)
  );
  const [typography, setTypography] = useState<TypographyState>(
    () => timelineRef.current.typography
  );
  const [acoustic, setAcoustic] = useState<AcousticStructureState>(
    () => timelineRef.current.acoustic
  );
  const [renderVersion, setRenderVersion] = useState(0);
  const [reducedProgress, setReducedProgress] = useState(OPENING_SETTLE_PROGRESS);

  const [isInViewport, setIsInViewport] = useState(true);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  );
  const [fallbackPointer, setFallbackPointer] = useState({ x: 0, y: 0 });
  const [mixerState, setMixerState] = useState<SoundscapeMixerSnapshot>(() =>
    soundscapeController.getSnapshot()
  );

  // Sync centralized Web Audio controller (always muted initially, stops offscreen/unmount)
  useEffect(() => {
    const unsub = soundscapeController.subscribe(setMixerState);
    return () => {
      unsub();
      soundscapeController.stopAll();
    };
  }, []);

  // Responsive breakpoint & reduced-motion media listener
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMotion = () => setReducedMotion(mq.matches);

    window.addEventListener('resize', onResize);
    mq.addEventListener('change', onMotion);
    return () => {
      window.removeEventListener('resize', onResize);
      mq.removeEventListener('change', onMotion);
    };
  }, []);

  useEffect(() => {
    ScrollTrigger.refresh();
  }, [isMobile]);

  // Pause GPU/audio work when visitor scrolls below the cinematic opening
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const visible = entry.isIntersecting;
        setIsInViewport(visible);
        if (!visible) {
          soundscapeController.stopAll();
        }
      },
      { threshold: 0.02 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Single Scroll & Opening-Clock Authority: Lenis + GSAP ScrollTrigger driving timelineRef with zero React churn
  useEffect(() => {
    if (reducedMotion) {
      const next = computeCinematicTimeline(reducedProgress);
      timelineRef.current = next;
      setTypography(next.typography);
      setAcoustic(next.acoustic);
      if (!webglAvailable) setFallbackState(next);
      setRenderVersion((v) => v + 1);
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    const lenis = new Lenis({
      lerp: 0.075,
      wheelMultiplier: 0.9,
      touchMultiplier: 1.4,
      smoothWheel: true,
    });

    const onLenisScroll = () => ScrollTrigger.update();
    lenis.on('scroll', onLenisScroll);

    const trigger = ScrollTrigger.create({
      trigger: container,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 0.42,
      onUpdate: (self) => {
        scrollProgressRef.current = self.progress;
      },
    });

    scrollProgressRef.current = trigger.progress;
    if (trigger.progress > 0.015) {
      scrollCapturedRef.current = true;
    }

    const syncTimeline = (dt: number) => {
      const sp = scrollProgressRef.current;
      if (!scrollCapturedRef.current && sp <= 0.015) {
        openingElapsedRef.current = Math.min(
          OPENING_DURATION_SEC,
          openingElapsedRef.current + dt
        );
        openingBaseRef.current = computeOpeningAutoProgress(openingElapsedRef.current);
      } else if (sp > 0.015) {
        scrollCapturedRef.current = true;
      }

      const base = openingBaseRef.current;
      const effective = base + sp * (1 - base);
      const next = computeCinematicTimeline(effective);
      timelineRef.current = next;

      container.dataset.phase = next.phase;
      container.dataset.progress = next.progress.toFixed(3);

      if (!webglAvailable) {
        setFallbackState(next);
      }
      soundscapeController.syncCinematicMix(next.audioMix);
      setTypography((prev) =>
        typographyDiffers(prev, next.typography) ? next.typography : prev
      );
      setAcoustic((prev) =>
        acousticDiffers(prev, next.acoustic) ? next.acoustic : prev
      );
    };

    lastTickMsRef.current = performance.now();
    syncTimeline(0);

    const tickerFn = (time: number) => {
      const nowMs = performance.now();
      const lastMs = lastTickMsRef.current ?? nowMs;
      lastTickMsRef.current = nowMs;
      const dt = Math.min(0.2, Math.max(0, (nowMs - lastMs) * 0.001));

      lenis.raf(time * 1000);
      syncTimeline(dt);
    };
    gsap.ticker.add(tickerFn);
    gsap.ticker.lagSmoothing(0);

    return () => {
      trigger.kill();
      lenis.off('scroll', onLenisScroll);
      gsap.ticker.remove(tickerFn);
      lenis.destroy();
    };
  }, [reducedMotion, reducedProgress, webglAvailable]);

  // Notify landing header visibility smoothly
  useEffect(() => {
    onNavbarVisibilityChange?.(
      reducedMotion ? true : typography.navbarVisible || !isInViewport
    );
  }, [onNavbarVisibilityChange, reducedMotion, typography.navbarVisible, isInViewport]);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (reducedMotion || isMobile || !isInViewport) return;
      const nx = (e.clientX / window.innerWidth - 0.5) * 2;
      const ny = (e.clientY / window.innerHeight - 0.5) * 2;
      pointerTargetRef.current = { x: nx, y: ny };
      if (!webglAvailable) {
        setFallbackPointer({ x: nx, y: ny });
      }
    },
    [reducedMotion, isMobile, isInViewport, webglAvailable]
  );

  const handleWebGLUnavailable = useCallback(() => {
    setWebglAvailable(false);
  }, []);

  const handleToggleSound = useCallback(() => {
    if (!mixerState.isPlaying) {
      soundscapeController.setMasterVolume(0.45);
      soundscapeController.setLayerEnabled('water', true);
      soundscapeController.setLayerEnabled('wind', true);
      soundscapeController.setLayerEnabled('birds', true);
      soundscapeController.setLayerEnabled('insects', false);
      soundscapeController.togglePlay();
    } else {
      soundscapeController.toggleMute();
    }
  }, [mixerState.isPlaying]);

  const handleWaterRipple = useCallback(() => {
    soundscapeController.triggerWaterDropImpact();
  }, []);

  return (
    <section
      ref={containerRef}
      data-phase={timelineRef.current.phase}
      data-progress={timelineRef.current.progress.toFixed(3)}
      aria-label="EcoSonic Cinematic Opening"
      onPointerMove={handlePointerMove}
      className={
        reducedMotion
          ? 'relative min-h-[92vh] bg-[#000000] text-[#EEEBDD]'
          : 'relative h-[520vh] md:h-[620vh] bg-[#000000] text-[#EEEBDD]'
      }
    >
      <div
        className={
          reducedMotion
            ? 'relative h-[92vh] overflow-hidden bg-[#000000]'
            : 'sticky top-0 h-screen w-full overflow-hidden bg-[#000000]'
        }
      >
        {webglAvailable ? (
          <WebGLCinematicStage
            timelineRef={timelineRef}
            pointerTargetRef={pointerTargetRef}
            renderVersion={renderVersion}
            isInViewport={isInViewport}
            isMobile={isMobile}
            reducedMotion={reducedMotion}
            onWebGLUnavailable={handleWebGLUnavailable}
            onWaterRipple={handleWaterRipple}
          />
        ) : (
          <>
            <EmergingWorld
              world={{
                visibility: fallbackState.world.portalProgress,
                scale: fallbackState.world.settleScale,
                counterRollDeg: fallbackState.world.counterRollDeg,
                farLayerOpacity: fallbackState.world.portalProgress,
                midLayerOpacity: fallbackState.world.portalProgress,
                nearLayerOpacity: fallbackState.world.portalProgress,
                hazeOpacity: fallbackState.world.hazeOpacity,
              }}
              pointerOffset={fallbackPointer}
              isMobile={isMobile}
              reducedMotion={reducedMotion}
              isInViewport={isInViewport}
            />
            {fallbackState.lake.visibility > 0.01 && (
              <div
                className="absolute inset-0"
                style={{ opacity: fallbackState.lake.visibility }}
              >
                <WorldTransition camera={fallbackState.camera} progress={fallbackState.progress}>
                  <DarkWaterScene
                    light={fallbackState.light}
                    pointerOffset={fallbackPointer}
                    isInViewport={isInViewport}
                    isMobile={isMobile}
                    reducedMotion={reducedMotion}
                  />
                </WorldTransition>
              </div>
            )}
          </>
        )}

        {/* Restrained Acoustic Emergence & Editorial Identity (post-forest only) */}
        <CinematicTypography
          typography={typography}
          acoustic={acoustic}
          timelineRef={timelineRef}
          isInViewport={isInViewport}
          reducedMotion={reducedMotion}
          soundPlaying={mixerState.isPlaying}
          soundMuted={mixerState.isMuted}
          onToggleSound={handleToggleSound}
        />

        {/* Reduced-motion accessible scene switcher */}
        {reducedMotion && (
          <div className="absolute bottom-6 right-6 z-40 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setReducedProgress(OPENING_SETTLE_PROGRESS)}
              className={`px-3 py-1.5 text-[11px] font-mono tracking-wider border cursor-pointer ${
                reducedProgress < 0.7
                  ? 'border-[#D5D9C6]/60 bg-[#101C17]/90 text-[#EEEBDD]'
                  : 'border-[#D5D9C6]/20 bg-[#050605]/70 text-[#A5AC9C]'
              }`}
            >
              Dark Lake
            </button>
            <button
              type="button"
              onClick={() => setReducedProgress(1)}
              className={`px-3 py-1.5 text-[11px] font-mono tracking-wider border cursor-pointer ${
                reducedProgress >= 0.7
                  ? 'border-[#D5D9C6]/60 bg-[#101C17]/90 text-[#EEEBDD]'
                  : 'border-[#D5D9C6]/20 bg-[#050605]/70 text-[#A5AC9C]'
              }`}
            >
              Living Forest
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
