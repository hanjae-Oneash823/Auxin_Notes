const FRAME_COUNT = 6;
const FRAME_PX = 36;
const STROKE_PX = 2.4;
const HALO_PX = 2;
/** Limb lengths in frame units, and the hip's resting spot in a 34-unit frame. */
const TORSO = 9;
/** The arms hang from just below the top of the torso, leaving room for the neck. */
const SHOULDER_FRACTION = 0.82;
const THIGH = 6.5;
const SHIN = 6.5;
const UPPER_ARM = 4.6;
const FOREARM = 4.6;
const HEAD_RADIUS = 3.4;
const HIP = { x: 14, y: 20 };
const LEAN_DEG = 14;
const THIGH_SWING_DEG = 45;
const FAR_SIDE_OPACITY = 0.45;
const KNEE_BEND_MIN_DEG = 10;
const KNEE_BEND_SWING_DEG = 80;
const ARM_SWING_DEG = 55;
const ELBOW_BEND_DEG = 90;

type Point = { x: number; y: number };
const rad = (deg: number): number => (deg * Math.PI) / 180;
/** `angle` is measured from straight down, positive toward the direction of travel. */
const reach = (from: Point, length: number, angleDeg: number): Point => ({ x: from.x + length * Math.sin(rad(angleDeg)), y: from.y + length * Math.cos(rad(angleDeg)) });
const line = (...points: Point[]): string => `M${points.map((point) => `${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' L')}`;

function leg(phase: number, hip: Point): string {
  const thigh = THIGH_SWING_DEG * Math.sin(phase);
  const knee = reach(hip, THIGH, thigh);
  const foot = reach(knee, SHIN, thigh - (KNEE_BEND_MIN_DEG + KNEE_BEND_SWING_DEG * Math.max(0, Math.cos(phase))));
  return line(hip, knee, foot);
}

/** One frame of the run cycle at `index`. */
function frame(index: number): { near: string[]; far: string[]; torso: string; head: Point } {
  const phase = (2 * Math.PI * index) / FRAME_COUNT;
  const bounce = -Math.abs(Math.sin(phase)) * 1.8;
  const hip = { x: HIP.x, y: HIP.y + bounce };
  const shoulder = reach(hip, -TORSO * SHOULDER_FRACTION, -LEAN_DEG);
  const arm = (swing: number): string => {
    const upper = ARM_SWING_DEG * swing;
    const elbow = reach(shoulder, UPPER_ARM, upper);
    return line(shoulder, elbow, reach(elbow, FOREARM, upper + ELBOW_BEND_DEG));
  };
  const neck = reach(hip, -TORSO, -LEAN_DEG);
  const head = reach(neck, -(HEAD_RADIUS + 1.4), -LEAN_DEG);
  return { near: [leg(phase, hip), arm(-Math.sin(phase))], far: [leg(phase + Math.PI, hip), arm(Math.sin(phase))], torso: line(hip, neck), head };
}

const FRAMES = Array.from({ length: FRAME_COUNT }, (_, index) => frame(index));

/** A stick figure's six-frame run cycle laid out as a sprite sheet; the sheet slides one frame at a time (`.sprint-runner`) so it runs in place. `cycleSeconds` is one full stride. */
export function RunnerFigure({ color, cycleSeconds }: { color: string; cycleSeconds: number }) {
  return (
    <span aria-hidden className="shrink-0 self-center overflow-hidden" style={{ width: FRAME_PX, height: FRAME_PX, color }}>
      <svg
        className="sprint-runner block"
        width={FRAME_PX * FRAME_COUNT}
        height={FRAME_PX}
        viewBox={`0 0 ${FRAME_PX * FRAME_COUNT} ${FRAME_PX}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={STROKE_PX}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ animationDuration: `${cycleSeconds}s` }}
      >
        {FRAMES.map((pose, index) => (
          <g key={index} transform={`translate(${index * FRAME_PX} 0)`}>
            <g opacity={FAR_SIDE_OPACITY}>{pose.far.map((d, pathIndex) => <path key={pathIndex} d={d} />)}</g>
            <path d={pose.torso} />
            <circle cx={pose.head.x} cy={pose.head.y} r={HEAD_RADIUS} fill="currentColor" stroke="none" />
            {/* The near arm gets a background-colored halo first, so the arm reads as separate where it crosses the torso. */}
            <path d={pose.near[1]} stroke="var(--color-bg)" strokeWidth={STROKE_PX + HALO_PX} />
            {pose.near.map((d, pathIndex) => <path key={pathIndex} d={d} />)}
          </g>
        ))}
      </svg>
    </span>
  );
}
