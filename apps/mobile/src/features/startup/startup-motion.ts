export const STARTUP_ANIMATION_MS = 3000;

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const lerp = (from: number, to: number, progress: number) => from + (to - from) * progress;
const smooth = (value: number) => {
  const t = clamp(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
};

// Closed-form step response: frame seeking never accumulates simulation error.
function spring(seconds: number, frequency = 36, damping = 0.97): number {
  if (seconds <= 0) return 0;
  const damped = frequency * Math.sqrt(1 - damping * damping);
  return 1 - Math.exp(-damping * frequency * seconds) * (
    Math.cos(damped * seconds) + damping * frequency / damped * Math.sin(damped * seconds)
  );
}

function steps(
  time: number,
  initial: number,
  changes: readonly (readonly [number, number])[],
  frequency = 36,
  damping = 0.97,
): number {
  let value = initial;
  let previous = initial;
  for (const [at, target] of changes) {
    value += (target - previous) * spring(time - at, frequency, damping);
    previous = target;
  }
  const rounded = Math.round(value * 1e6) / 1e6;
  return rounded === 0 ? 0 : rounded;
}

function visibility(time: number, start: number, enter: number, end: number, exit: number): number {
  return smooth((time - start) / enter) * (1 - smooth((time - end) / exit));
}

export function getStartupFrame(elapsedMs: number) {
  const time = Math.max(0, Math.min(
    STARTUP_ANIMATION_MS,
    Number.isFinite(elapsedMs) ? elapsedMs : 0,
  )) / 1000;
  const checkProgress = clamp(spring(time - 1, 30, 0.99));
  const phase = (Math.min(time, 1) - 0.5) * Math.PI * 2;
  const vertices: string[] = [];
  for (let i = 0; i <= 32; i++) {
    const position = i / 32;
    const angle = -Math.PI / 2 + position * Math.PI * 1.52 + phase;
    const arcX = 17 * Math.cos(angle);
    const arcY = 17 * Math.sin(angle);
    const progress = position < 0.36 ? position / 0.36 : (position - 0.36) / 0.64;
    const checkX = position < 0.36 ? lerp(-15, -4, progress) : lerp(-4, 17, progress);
    const checkY = position < 0.36 ? lerp(0, 11, progress) : lerp(11, -12, progress);
    vertices.push(`${lerp(arcX, checkX, checkProgress).toFixed(4)},${lerp(arcY, checkY, checkProgress).toFixed(4)}`);
  }

  return {
    time,
    width: steps(time, 364, [[0.5, 560], [2, 364]]),
    height: steps(time, 364, [[0.5, 164], [2, 364]]),
    radius: steps(time, 94, [[0.5, 82], [2, 94]]),
    camera: steps(time, 1.8, [[0.5, 1.9], [2, 1.8]], 27, 0.99),
    handSize: steps(time, 364, [[0.5, 144], [2, 364]], 33, 0.99),
    handX: steps(time, 0, [[0.25, 13], [0.45, 22], [0.5, -180], [2, 0]], 36, 0.99),
    handY: steps(time, 0, [[0.25, 4], [0.45, 7], [0.5, 0], [2, 0]], 36, 0.99),
    handAngle: steps(time, 0, [[0.25, -3.2], [0.45, 1.3], [0.5, 0], [2, 0]], 31, 0.99),
    handPress: 1 - 0.045 * (spring(time - 0.45, 64, 0.99) - spring(time - 0.56, 64, 0.99)),
    targetOpacity: visibility(time, 0.12, 0.1, 0.46, 0.08),
    symbolOpacity: visibility(time, 0.61, 0.13, 1.91, 0.08),
    symbolPath: `M${vertices.join('L')}`,
    waitingOpacity: visibility(time, 0.63, 0.13, 0.88, 0.1),
    brandOpacity: visibility(time, 1.08, 0.15, 1.89, 0.1),
    brandY: steps(time, 0, [[1.48, -12], [1.9, 0]], 34, 0.99),
    taglineOpacity: visibility(time, 1.47, 0.15, 1.87, 0.1),
  };
}

// Match the native splash's 160 dp image on regular phones; keep narrow screens safe.
export function getStartupScale(width: number, height: number): number {
  return Math.max(0.01, Math.min(160 / (364 * 1.8), (width - 32) / 1100, (height - 32) / 1100));
}
