const MID_FOREST_IMG = '/src/assets/images/coastal_waterside_forest_4k.jpg';

export interface FallbackWorldState {
  visibility: number;
  scale: number;
  counterRollDeg: number;
  farLayerOpacity: number;
  midLayerOpacity: number;
  nearLayerOpacity: number;
  hazeOpacity: number;
}

interface EmergingWorldProps {
  world: FallbackWorldState;
  pointerOffset: { x: number; y: number };
  isMobile: boolean;
  reducedMotion: boolean;
  isInViewport: boolean;
}

/**
 * Multi-layered documentary wet forest waterside environment revealed after ripple reflection emergence.
 */
export function EmergingWorld({
  world,
  pointerOffset,
  isMobile,
  reducedMotion,
}: EmergingWorldProps) {
  if (world.visibility <= 0.005) {
    return null;
  }

  const px = reducedMotion || isMobile ? 0 : pointerOffset.x;
  const py = reducedMotion || isMobile ? 0 : pointerOffset.y;

  const aperturePct = world.visibility * 140;

  return (
    <div
      className="absolute inset-0 overflow-hidden bg-[#060907]"
      style={{
        opacity: Math.min(1, world.visibility * 1.15),
        transform: `scale(${world.scale}) rotateZ(${world.counterRollDeg}deg)`,
        WebkitMaskImage:
          world.visibility >= 0.96
            ? undefined
            : `radial-gradient(ellipse ${aperturePct}% ${aperturePct * 0.85}% at 50% 48%, rgba(0,0,0,1) 46%, rgba(0,0,0,0.4) 76%, rgba(0,0,0,0) 100%)`,
        maskImage:
          world.visibility >= 0.96
            ? undefined
            : `radial-gradient(ellipse ${aperturePct}% ${aperturePct * 0.85}% at 50% 48%, rgba(0,0,0,1) 46%, rgba(0,0,0,0.4) 76%, rgba(0,0,0,0) 100%)`,
      }}
    >
      <div
        className="absolute inset-[-3%] will-change-transform transition-transform duration-300 ease-out"
        style={{
          opacity: world.midLayerOpacity,
          transform: `translate3d(${px * -10}px, ${py * -6}px, 0) scale(1.03)`,
        }}
      >
        <img
          src={MID_FOREST_IMG}
          alt="Overcast temperate coastal old-growth forest waterside with mossy shoreline, ferns, and dark mirror pool"
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover object-center"
        />
      </div>
    </div>
  );
}
