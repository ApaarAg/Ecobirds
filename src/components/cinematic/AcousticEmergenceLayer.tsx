import type { AcousticStructureState } from '../../lib/cinematicTimeline';

interface AcousticEmergenceLayerProps {
  acoustic: AcousticStructureState;
}

/**
 * Restraint-driven SVG acoustic geometry emerging directly out of the water resonance (0.905 -> 1.00):
 * - Delicate concentric shoreline harmonics -> continuous acoustic contour waveforms -> fine frequency strata
 * - Strict botanical palette (#788B68 sage, #D5D9C6 parchment, #D3A36C ochre); zero neon/glow
 */
export function AcousticEmergenceLayer({ acoustic }: AcousticEmergenceLayerProps) {
  if (acoustic.waveOpacity <= 0.01 && acoustic.contourProgress <= 0.01) {
    return null;
  }

  const waveAlpha = acoustic.waveOpacity;
  const contour = acoustic.contourProgress;
  const spectrum = acoustic.spectrumIntensity;

  // Fine acoustic frequency contour harmonics anchored cleanly in the lower-mid water/shoreline horizon
  const contourLines = [
    { d: 'M 40 538 Q 240 520 420 534 T 800 528 T 1180 536 T 1400 526', stroke: '#D5D9C6', opacity: 0.46, dash: 1400 },
    { d: 'M 40 556 Q 260 572 460 552 T 860 562 T 1220 548 T 1400 558', stroke: '#788B68', opacity: 0.62, dash: 1400 },
    { d: 'M 40 576 Q 210 560 440 580 T 820 570 T 1160 582 T 1400 572', stroke: '#D3A36C', opacity: 0.44, dash: 1400 },
  ];

  // Subtle logarithmic frequency ticks along the lower acoustic baseline
  const strataCount = 36;

  return (
    <div
      aria-hidden="true"
      data-testid="acoustic-emergence-layer"
      className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
    >
      <svg
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        className="w-full h-full"
      >
        {/* Expanding hairline resonance arcs rising gently from the foreground pool */}
        <g opacity={waveAlpha * (1 - spectrum * 0.2)}>
          {[140, 250, 380].map((r, idx) => (
            <ellipse
              key={r}
              cx="720"
              cy="648"
              rx={r * (0.92 + contour * 0.36)}
              ry={r * 0.22 * (0.92 + contour * 0.36)}
              fill="none"
              stroke={idx === 1 ? '#D3A36C' : '#D5D9C6'}
              strokeWidth={idx === 0 ? '1.15' : '0.85'}
              strokeOpacity={0.38 - idx * 0.08}
            />
          ))}
        </g>

        {/* Continuous horizontal acoustic contour waveforms forming across the waterline */}
        <g>
          {contourLines.map((line, i) => {
            const offset = line.dash * (1 - Math.min(1, contour * 1.15 - i * 0.08));
            return (
              <path
                key={i}
                d={line.d}
                fill="none"
                stroke={line.stroke}
                strokeWidth="1.25"
                strokeOpacity={line.opacity * Math.min(1, waveAlpha * 1.1)}
                strokeDasharray={line.dash}
                strokeDashoffset={Math.max(0, offset)}
              />
            );
          })}
        </g>

        {/* Restrained bioacoustic frequency strata bars rising cleanly from the acoustic datum */}
        {spectrum > 0.01 && (
          <g opacity={spectrum * 0.64}>
            {Array.from({ length: strataCount }).map((_, idx) => {
              const x = 140 + idx * 32;
              const norm = idx / (strataCount - 1);
              const envelope = Math.sin(norm * Math.PI);
              const harmonic =
                0.35 +
                0.35 * Math.sin(idx * 0.9 + 0.4) +
                0.3 * Math.cos(idx * 1.7);
              const h = (10 + 30 * envelope * Math.abs(harmonic)) * spectrum;
              const y0 = 604 - h;
              const isWarmBand = idx >= 12 && idx <= 22;
              return (
                <line
                  key={idx}
                  x1={x}
                  y1={604}
                  x2={x}
                  y2={y0}
                  stroke={isWarmBand ? '#D3A36C' : '#788B68'}
                  strokeWidth="1.25"
                  strokeOpacity={0.42 + envelope * 0.38}
                />
              );
            })}
          </g>
        )}
      </svg>
    </div>
  );
}
