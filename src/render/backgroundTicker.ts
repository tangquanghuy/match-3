import { gsap } from 'gsap';

// requestAnimationFrame stops in hidden tabs. A throttled interval keeps GSAP's
// event timelines moving; tab throttling still limits the actual cadence.
let users = 0;
let timer: ReturnType<typeof setInterval> | null = null;

export function startBackgroundTicker(): () => void {
  if (++users === 1) {
    // By default GSAP collapses gaps over 500ms to a single 33ms frame.
    gsap.ticker.lagSmoothing(0);
    timer = setInterval(() => gsap.ticker.tick(), 100);
  }
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    if (--users !== 0) return;
    if (timer !== null) clearInterval(timer);
    timer = null;
    gsap.ticker.lagSmoothing(500, 33);
  };
}
