import { useAppReducedMotion } from "@/appearance/reduced-motion";

const SIZE = 12;
const CENTER = SIZE / 2;
const RADIUS = 5;
const STROKE_WIDTH = 1.75;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
// Matches the context meter's ring track.
const TRACK_OPACITY = 0.3;
const ARC = CIRCUMFERENCE * 0.25;

/** A quarter arc spinning clockwise over a faint track. Reduced motion holds it still at the top. */
export function DesktopProgressRing({ color }: { color?: string }) {
  const reducedMotion = useAppReducedMotion();
  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden>
      <circle
        cx={CENTER}
        cy={CENTER}
        r={RADIUS}
        fill="none"
        stroke={color}
        strokeWidth={STROKE_WIDTH}
        opacity={TRACK_OPACITY}
      />
      <circle
        cx={CENTER}
        cy={CENTER}
        r={RADIUS}
        fill="none"
        stroke={color}
        strokeWidth={STROKE_WIDTH}
        strokeLinecap="round"
        strokeDasharray={`${ARC} ${CIRCUMFERENCE}`}
        transform={`rotate(-90 ${CENTER} ${CENTER})`}
      >
        {reducedMotion ? null : (
          <animateTransform
            attributeName="transform"
            type="rotate"
            from={`-90 ${CENTER} ${CENTER}`}
            to={`270 ${CENTER} ${CENTER}`}
            dur="0.8s"
            repeatCount="indefinite"
          />
        )}
      </circle>
    </svg>
  );
}
