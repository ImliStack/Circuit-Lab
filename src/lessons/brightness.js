import { Circuit } from '../sim/circuit.js';
import { Resistor, LED, LED_COLORS } from '../parts/passive.js';
import { Board, Breadboard } from '../parts/board.js';
import { Potentiometer } from '../parts/extras.js';
import { fmt } from '../parts/common.js';
import { svg, wire, comp, text } from '../ui/schematic.js';
import { el } from './ui.js';
import { between, JUMPER, slider } from './kit.js';

const FIXED = 150; // keeps the LED under 20 mA even with the knob at zero
const TRACK = 1000;
const RATED = 0.02;
const VF = LED_COLORS.blue.vf;

const current = (pos) => Math.max(0, (5 - VF) / (FIXED + TRACK * pos + 10));

export default {
  id: 'brightness',
  num: 6,
  title: 'Brightness vs resistance',
  meta: 'Class 10 · Electricity',
  chips: ['Variable resistor', 'Dimmer', '~6 min'],
  caption: 'Turn the knob. More resistance, less current, dimmer light.',
  intro: 'A potentiometer is a resistor with a knob. Turn it and you choose how much of its 1 kΩ track the current has to cross — the same idea as a fan regulator or a dimmer.',
  view: { target: [0.2, 0.4, 0.3], fit: [19, 9], az: -0.4 },
  goals: [
    { id: 'predict', text: 'Make a prediction' },
    { id: 'bright', text: 'Turn it to the brightest' },
    { id: 'dim', text: 'Turn it to the dimmest' },
  ],
  steps: [
    {
      title: 'Meet the potentiometer',
      text: '<p>Inside is a curved track of resistive carbon, with a contact — the <b>wiper</b> — that slides along it as the knob turns. We use one end and the wiper, so it acts as a variable resistor from 0 to 1 kΩ.</p>',
      look: ['pot'],
    },
    {
      title: 'Your guess first',
      text: '<p>You turn the knob so the track adds <b>more</b> resistance. What happens to the LED?</p>',
      predict: {
        options: [{ t: 'It gets brighter' }, { t: 'It gets dimmer', right: true }, { t: 'No change — it is the same LED' }],
        explain: 'More resistance means less current for the same 5 V: I = (5 − Vf) ÷ R_total. Less current, less light.',
      },
      look: ['pot', 'led'],
    },
    {
      title: 'Turn it',
      text: '<p>Press <b>Power on</b> and drag the knob slider. The graph shows the current for every knob position; the dot is where you are.</p>',
      look: ['pot'],
    },
    {
      title: 'Why the 150 Ω?',
      text: '<p>With the knob at zero the track adds nothing. The fixed 150 Ω resistor still keeps the current at (5 − 3) ÷ 160 ≈ 12.5 mA, safely under 20 mA.</p>',
      look: ['resistor'],
    },
    {
      title: 'What you found',
      text: '<p class="formula">I = V ÷ (R_fixed + R_knob)</p><p>Current falls quickly at first, then slowly — it is a 1/R curve, not a straight line.</p>',
    },
  ],

  build(ctx) {
    const S = { pos: 0.4, result: null };
    const board = ctx.add(new Board('Microcontroller board').at(-4.9, 0.12, 0.2));
    const bb = ctx.add(new Breadboard('Breadboard').at(4.4, 0.12, 0.3));
    const pot = ctx.add(new Potentiometer('Potentiometer (1 kΩ)'));
    pot.total = TRACK;
    pot.setPosition(S.pos);
    const ph = bb.hole(7, 'h');
    pot.group.position.set(ph.x, ph.y, ph.z - 0.95 + 0.508);
    const resistor = ctx.add(new Resistor('Resistor (150 Ω)', { ohms: FIXED, mount: 'breadboard', span: 4 * 0.254 }));
    between(resistor, bb.hole(11, 'c'), bb.hole(15, 'c'));
    const led = ctx.add(new LED('LED', { color: 'blue' }));
    between(led, bb.hole(16, 'e'), bb.hole(15, 'e'));

    const w5 = ctx.wire(board.term('5V'), bb.hole(5, 'j'), { ...JUMPER, color: 'red', lift: 1.4, sag: 0.1 });
    const wWiper = ctx.wire(bb.hole(7, 'f'), bb.hole(11, 'a'), { ...JUMPER, color: 'yellow', lift: 0.5, sag: 0.1 });
    const wCat = ctx.wire(bb.hole(16, 'a'), bb.rail('T-', 14), { ...JUMPER, color: 'black', lift: 0.4, sag: 0.1, floor: 0.9 });
    const wGnd = ctx.wire(bb.rail('T-', 2), board.term('GND'), { ...JUMPER, color: 'black', lift: 0.8 });

    function update() {
      const on = ctx.running;
      const r = new Circuit().cell('V5', 'p', '0', on ? 5 : 0)
        .resistor('POT', 'p', 'w', Math.max(0.01, pot.ohms))
        .resistor('R', 'w', 'a', FIXED)
        .led('D', 'a', '0', VF)
        .solve();
      S.result = r;
      const I = r ? r.i.D : 0;
      pot.current = I;
      led.current = I; led.voltage = r ? r.v.a : 0;
      resistor.current = I; resistor.voltage = I * FIXED;
      led.setBrightness(I / RATED);
      [w5, wWiper, wCat, wGnd].forEach((w) => w.setCurrent(I));
      if (on && S.pos <= 0.02) ctx.goal('bright');
      if (on && S.pos >= 0.98) ctx.goal('dim');
      ctx.hud([
        { label: 'Knob resistance', value: fmt.ohms(Math.round(pot.ohms)), tone: on ? 'live' : 'off' },
        { label: 'LED current', value: fmt.amps(I), tone: I > 1e-4 ? 'good' : 'off' },
        { label: 'Brightness', value: `${Math.round(Math.min(1, I / RATED) * 100)}%`, tone: I > 1e-4 ? 'live' : 'off' },
      ]);
      if (graphEl) graphEl.innerHTML = graph(S.pos, on);
    }

    let graphEl = null;
    return {
      parts: { board, breadboard: bb, pot, resistor, led },
      callouts: [
        { part: board, short: '5V pin', text: 'Steady 5 V.', value: () => (ctx.running ? '5 V' : 'off') },
        { part: pot, text: 'Turn to add resistance.', value: () => fmt.ohms(Math.round(pot.ohms)) },
        { part: resistor, text: 'Fixed 150 Ω keeps it safe.', value: () => '150 Ω' },
        { part: led, text: 'Brightness follows current.', value: () => (led.current > 1e-4 ? fmt.amps(led.current) : '') },
      ],
      runLabel: ['Power on', 'Power off'],
      runNote: 'Drag the slider: the knob on the bench turns with it.',
      controls(root) {
        const knob = slider('Knob', { min: 0, max: 100, value: S.pos * 100, format: (v) => `${v}% · ${fmt.ohms(Math.round((v / 100) * TRACK))}` }, (v) => {
          S.pos = v / 100; pot.setPosition(S.pos); ctx.update();
        });
        graphEl = el('<div class="figure" style="padding:6px 8px"></div>');
        root.append(knob, graphEl);
        update();
      },
      run() {},
      update,
      schematic() {
        const I = led.current;
        const live = I > 1e-6;
        return svg(340, 180,
          text(36, 34, ctx.running ? '5V pin · 5 V' : '5V pin · off', 'val', 'start')
          + '<circle cx="40" cy="50" r="3.5"/>' + wire([[43.5, 50], [60, 50]], live)
          + comp('resistor', [60, 50], [140, 50], { label: 'Pot', value: fmt.ohms(Math.round(pot.ohms)), side: -1, live })
          + '<path d="M86 66 L114 34 M108 34 h6 v6" stroke-width="1.6"/>'
          + comp('resistor', [140, 50], [220, 50], { label: 'R', value: '150 Ω', side: -1, live })
          + wire([[220, 50], [260, 50], [260, 70]], live)
          + comp('led', [260, 70], [260, 130], { label: 'Blue LED', value: fmt.amps(I), side: 1, live })
          + wire([[260, 130], [260, 150], [43.5, 150]], live)
          + '<circle cx="40" cy="150" r="3.5"/>' + text(36, 172, 'GND · 0 V', 'val', 'start'),
        );
      },
    };
  },
};

/** Current against knob position, with a dot at the current setting. */
function graph(pos, on) {
  const W = 320, H = 150, L = 38, B = 26, T = 10, R = 10;
  const maxI = current(0) * 1.1;
  const x = (p) => L + p * (W - L - R);
  const y = (i) => H - B - (i / maxI) * (H - B - T);
  let d = '';
  for (let k = 0; k <= 60; k++) { const p = k / 60; d += `${k ? 'L' : 'M'}${x(p).toFixed(1)},${y(current(p)).toFixed(1)}`; }
  let s = `<svg class="graph" viewBox="0 0 ${W} ${H}" role="img" aria-label="Current against knob position">`;
  for (const mA of [0, 5, 10]) s += `<line x1="${L}" x2="${W - R}" y1="${y(mA / 1000)}" y2="${y(mA / 1000)}" stroke="var(--line)"/><text x="${L - 6}" y="${y(mA / 1000) + 3.5}" text-anchor="end">${mA}</text>`;
  s += `<text x="${L}" y="${H - 6}">0 Ω</text><text x="${W - R}" y="${H - 6}" text-anchor="end">1 kΩ knob →</text><text x="${L + 4}" y="${T + 8}">mA</text>`;
  s += `<path d="${d}" fill="none" stroke="var(--accent)" stroke-width="2"/>`;
  s += `<circle cx="${x(pos)}" cy="${y(current(pos))}" r="5.5" fill="${on ? 'var(--live)' : 'var(--muted)'}" stroke="var(--paper)" stroke-width="2"/>`;
  return `${s}</svg>`;
}
