// Every timing in Circuit Lab lives here, in seconds, so one edit retunes a move.
// A lesson is written as a sequence of events:
//   enter   — parts drop onto the bench one after another and pop to full size
//   wire    — each wire draws itself from one terminal to the other, end caps pop
//   label   — callout cards arrive once the circuit is built
//   fly     — the camera eases to the lesson view
//   run     — the switch closes, meter needles swing (and overshoot a little),
//             charges start to flow, lamps warm up
//   hover   — the part under the cursor lifts slightly
//   reveal  — panel lines arrive one at a time

export const REDUCED =
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const MOTION = {
  enter: { drop: 14, duration: 0.72, stagger: 0.09 }, // drop height (cm), per-part stagger
  wire: { at: 0.25, cap: 0.26, draw: 0.62, stagger: 0.07 },
  label: { at: 0.5, stagger: 0.06 },
  fly: { lesson: 1.2, focus: 1.0, rotate: 0.62, reset: 1.1, zoom: 0.35 },
  hover: { lift: 0.35, duration: 0.22 },
  needle: { stiffness: 70, damping: 9 }, // moving-coil meters overshoot then settle
  glow: { rate: 7 }, // bulbs and LEDs warm up / cool down
  flow: { speed: 14 }, // charge-dot speed in cm/s per √A of current (clamped)
  plug: { stiffness: 160, damping: 16 },
  reveal: { stagger: 0.05 },
  smoke: { life: 2.4 },
  trace: { line: 0.45 }, // seconds each sketch line stays lit while "running"
};

/** Seconds → milliseconds for timers; zero when the user prefers reduced motion. */
export const ms = (s) => (REDUCED ? 0 : s * 1000);

/** Frame-rate independent exponential approach. Snaps under reduced motion. */
export function damp(current, target, rate, dt) {
  if (REDUCED) return target;
  return current + (target - current) * (1 - Math.exp(-rate * Math.min(dt, 1 / 20)));
}

/** Damped spring on a { x, v } state. Snaps when motion is reduced. */
export function spring(state, target, { stiffness, damping }, dt) {
  if (REDUCED) { state.x = target; state.v = 0; return state.x; }
  const h = Math.min(dt, 1 / 30);
  state.v += (-stiffness * (state.x - target) - damping * state.v) * h;
  state.x += state.v * h;
  return state.x;
}

export const EASE = {
  linear: (t) => t,
  outCubic: (t) => 1 - (1 - t) ** 3,
  inCubic: (t) => t * t * t,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outBack: (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2,
  inBack: (t) => 2.70158 * t * t * t - 1.70158 * t * t,
};

/** Tiny tween runner, ticked by the stage every frame. Times in seconds. */
export class Tweens {
  constructor() { this.list = new Set(); this.now = 0; }
  add({ duration = 0.6, delay = 0, ease = EASE.inOutCubic, update, done }) {
    const t = { start: this.now + (REDUCED ? 0 : delay), duration: REDUCED ? 0.0001 : Math.max(0.0001, duration), ease, update, done, cancelled: false };
    t.cancel = () => { t.cancelled = true; this.list.delete(t); };
    this.list.add(t);
    return t;
  }
  tick(now) {
    this.now = now;
    for (const t of [...this.list]) {
      if (now < t.start) continue;
      const k = Math.min(1, (now - t.start) / t.duration);
      t.update?.(t.ease(k), k);
      if (k >= 1) { this.list.delete(t); t.done?.(); }
    }
  }
  get active() { return this.list.size > 0; }
}
