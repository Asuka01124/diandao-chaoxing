import { STARTUP_ANIMATION_MS } from './startup-motion';

type FrameClock = {
  requestFrame: (callback: (time: number) => void) => number;
  cancelFrame: (id: number) => void;
};

// Establish the origin on the first presented frame, not on hideAsync resolution.
export function playStartupAnimation(
  clock: FrameClock,
  onFrame: (elapsed: number) => void,
  onFinished: () => void,
): () => void {
  let stopped = false;
  let startedAt: number | undefined;
  let pending: number | undefined;
  const tick = (time: number) => {
    pending = undefined;
    if (stopped) return;
    startedAt ??= time;
    const elapsed = Math.max(0, Math.min(STARTUP_ANIMATION_MS, time - startedAt));
    onFrame(elapsed);
    if (stopped) return;
    if (elapsed === STARTUP_ANIMATION_MS) {
      stopped = true;
      onFinished();
    } else {
      pending = clock.requestFrame(tick);
    }
  };
  pending = clock.requestFrame(tick);
  return () => {
    stopped = true;
    if (pending !== undefined) clock.cancelFrame(pending);
    pending = undefined;
  };
}
