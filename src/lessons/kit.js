import { MOTION, ms } from '../motion.js';

/** Put a two-legged part at the midpoint of two holes, turned to face along them. */
export function between(part, p1, p2) {
  part.group.position.copy(p1).add(p2).multiplyScalar(0.5);
  part.group.rotation.y = -Math.atan2(p2.z - p1.z, p2.x - p1.x);
  return part;
}

/** Jumper-wire look for breadboard lessons. */
export const JUMPER = { radius: 0.045, lift: 0.6, sag: 0.25, floor: 0.95 };

/**
 * Sketch source as rows of [class, text, class, text, …] pairs → numbered, coloured lines.
 * `hl` is the index of the line the board is "running" right now.
 */
export function sketchHtml(lines, hl = -1) {
  const html = lines.map((parts, n) => {
    let line = '';
    for (let i = 0; i < parts.length; i += 2) {
      const cls = parts[i], t = parts[i + 1] ?? '';
      line += cls ? `<span class="${cls}">${t}</span>` : t;
    }
    return `<span class="ln ${n === hl ? 'hl' : ''}">${line || ' '}</span>`;
  }).join('');
  return `<pre class="code">${html}</pre>`;
}

/**
 * Upload-then-run behaviour shared by the board lessons: a short "uploading" pause,
 * then the trace steps through `setupLines` once and loops over `loopLines`.
 */
export function boardRunner(ctx, { setupLines, loopLines, onLine }) {
  const S = { uploading: false, line: -1 };
  let t1 = 0, t2 = 0;
  function stop() { clearTimeout(t1); clearInterval(t2); S.line = -1; }
  return {
    S,
    get high() { return ctx.running && !S.uploading; },
    run(on) {
      stop();
      S.uploading = on;
      if (!on) return;
      t1 = setTimeout(() => {
        S.uploading = false;
        const order = [...setupLines, ...loopLines];
        let k = 0;
        S.line = order[0];
        t2 = setInterval(() => {
          k = k + 1 < order.length ? k + 1 : setupLines.length; // loop() repeats for ever
          S.line = order[k];
          onLine?.(S.line);
          ctx.update();
        }, ms(MOTION.trace.line) || 16);
        ctx.update();
      }, ms(0.9));
    },
    stop,
  };
}

/** Range slider with a filled track. */
export function slider(label, { min = 0, max = 100, step = 1, value = 50, format = (v) => v }, onInput) {
  const wrap = document.createElement('div');
  wrap.innerHTML = `<div class="control-label"><span>${label}</span><output></output></div><input type="range" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${label}" />`;
  const input = wrap.querySelector('input');
  const out = wrap.querySelector('output');
  const paint = () => {
    const v = +input.value;
    input.style.setProperty('--fill', `${((v - min) / (max - min)) * 100}%`);
    out.textContent = format(v);
  };
  input.addEventListener('input', () => { paint(); onInput(+input.value); });
  paint();
  wrap.set = (v) => { input.value = v; paint(); };
  return wrap;
}
