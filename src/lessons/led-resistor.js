import { Circuit } from '../sim/circuit.js';
import { colorBands } from '../sim/colorcode.js';
import { Resistor, LED, LED_COLORS } from '../parts/passive.js';
import { Board, Breadboard } from '../parts/board.js';
import { fmt } from '../parts/common.js';
import { svg, wire, comp, text } from '../ui/schematic.js';
import { seg, bandsHtml, el } from './ui.js';
import { MOTION, ms } from '../motion.js';

const CHOICES = [0, 47, 100, 220, 330, 1000];
const RATED = 0.02; // 20 mA = full brightness
const BURN = 0.04; // above 40 mA the LED is destroyed
const PIN_V = 5;

const SKETCH = [
  ['com', '// Lesson 3 — light an LED from pin 13'],
  ['', ''],
  ['kw', 'void ', 'fn', 'setup', '', '() {'],
  ['', '  ', 'fn', 'pinMode', '', '(', 'num', '13', '', ', OUTPUT);   ', 'com', '// pin 13 will give out voltage'],
  ['', '}'],
  ['', ''],
  ['kw', 'void ', 'fn', 'loop', '', '() {'],
  ['hl', '  ', 'fn', 'digitalWrite', '', '(', 'num', '13', '', ', HIGH);  ', 'com', '// HIGH = 5 V on pin 13'],
  ['', '}'],
];

export default {
  id: 'led-resistor',
  num: 3,
  title: 'LED + resistor',
  meta: 'Class 8–10 · Electricity',
  chips: ['Arduino-style board', 'Breadboard', '~8 min'],
  caption: 'Pick a resistor, run the sketch, keep the LED under 20 mA.',
  intro: 'An LED needs only about 2 V and 20 mA. A board pin gives 5 V. Choose the resistor that keeps the LED bright but safe — and see what happens if you don’t.',
  view: { target: [0, 0.3, 0.3], fit: [19, 9], az: -0.4 },
  goals: [
    { id: 'predict', text: 'Make a prediction' },
    { id: 'tried', text: 'Try three different resistors' },
    { id: 'safe', text: 'Light the LED safely (5–20 mA)' },
  ],
  steps: [
    {
      title: 'Board and breadboard',
      text: '<p>The <b>board</b> runs a tiny program that sets pin 13 to 5 V. Jumper wires carry that to the <b>breadboard</b>, where the parts plug in.</p><p>Columns of five holes are joined inside, so the resistor and the LED’s long leg share a column — they are connected.</p>',
      look: ['board', 'breadboard'],
    },
    {
      title: 'The LED has a direction',
      text: '<p>Current goes in the <b>long leg</b> (anode, +) and out of the <b>short leg</b> (cathode, −). Backwards, it stays dark.</p><p>About 2 V is "used" just to make a red LED glow. That is its forward voltage, Vf.</p>',
      look: ['led'],
    },
    {
      title: 'Your guess first',
      text: '<p>What happens if we connect the LED straight to 5 V with <b>no resistor</b>?</p>',
      predict: {
        options: [{ t: 'It glows a little brighter' }, { t: 'It glows normally' }, { t: 'Far too much current — it burns out', right: true }],
        explain: 'Only the LED’s tiny internal resistance (≈10 Ω) limits the current: (5 − 2) ÷ 10 = 0.3 A — fifteen times too much. Choose “None” and press Run to see.',
      },
      look: ['led'],
    },
    {
      title: 'Work out the resistor',
      text: '<p>The resistor takes the voltage the LED doesn’t need: 5 − 2 = 3 V. For 15 mA:</p><p class="formula">R = V ÷ I = 3 ÷ 0.015 = 200 Ω</p><p>The nearest standard value above is <b>220 Ω</b> (red-red-brown).</p>',
      look: ['resistor'],
    },
    {
      title: 'Run the sketch',
      text: '<p>Press <b>Run</b> to upload the code. Pin 13 goes HIGH and the small “L” LED on the board lights too. Then try each resistor — bigger resistance, dimmer LED.</p>',
      look: ['board', 'led'],
    },
    {
      title: 'What you found',
      text: '<p>Current through the LED = (5 V − Vf) ÷ (R + 10 Ω). Below about 75 Ω the current passes 40 mA and the LED is destroyed.</p><p>Every LED in a circuit needs its own series resistor.</p>',
    },
  ],

  build(ctx) {
    const S = { ohms: 220, color: 'red', result: null, tried: new Set(), uploading: false, warnShown: false };
    const board = ctx.add(new Board('Microcontroller board').at(-4.9, 0.12, 0.2));
    const bb = ctx.add(new Breadboard('Breadboard').at(4.4, 0.12, 0.3));

    // Parts straddle holes, so place them at the midpoint of their two legs
    const between = (part, p1, p2) => {
      part.group.position.copy(p1).add(p2).multiplyScalar(0.5);
      part.group.rotation.y = -Math.atan2(p2.z - p1.z, p2.x - p1.x);
      return part;
    };
    const resistor = ctx.add(new Resistor('Resistor', { ohms: S.ohms, mount: 'breadboard', span: 4 * 0.254 }));
    between(resistor, bb.hole(14, 'c'), bb.hole(18, 'c'));
    const led = ctx.add(new LED('LED', { color: S.color }));
    // Cathode in column 19, anode (long leg) in column 18 with the resistor
    between(led, bb.hole(19, 'e'), bb.hole(18, 'e'));
    // A short jumper stands in for "no resistor"
    const bridge = ctx.wire(bb.hole(14, 'b'), bb.hole(18, 'b'), { color: 'white', radius: 0.04, lift: 0.35, sag: 0.1, floor: bb.H + 0.05 });
    bridge.group.visible = false;

    const jumper = { radius: 0.045, lift: 0.6, sag: 0.25, floor: 0.95 };
    const wPin = ctx.wire(board.term('D13'), bb.hole(14, 'a'), { ...jumper, color: 'orange', lift: 0.8 });
    const wCat = ctx.wire(bb.hole(19, 'a'), bb.rail('T-', 15), { ...jumper, color: 'black', lift: 0.4, sag: 0.1, floor: 0.9 });
    const wGnd = ctx.wire(bb.rail('T-', 2), board.term('GND'), { ...jumper, color: 'black', lift: 0.8 });

    function solve() {
      const high = ctx.running && !S.uploading;
      const c = new Circuit().cell('PIN', 'p', '0', high ? PIN_V : 0);
      if (S.ohms > 0) c.resistor('R', 'p', 'a', S.ohms); else c.resistor('R', 'p', 'a', 0.01);
      if (!led.burnt) c.led('D', 'a', '0', LED_COLORS[S.color].vf);
      return c.solve();
    }

    function update() {
      const r = solve();
      S.result = r;
      const I = r && !led.burnt ? r.i.D : 0;
      const high = ctx.running && !S.uploading;
      board.setPin13(high);
      if (high && I > BURN && !led.burnt) {
        led.burnOut();
        ctx.toast(`Pop! ${fmt.amps(I)} is far above the LED’s limit. It burnt out — choose a bigger resistor and replace it.`, 'danger', 6000);
        S.burnI = I;
        ctx.update();
        return;
      }
      led.current = I;
      led.voltage = r ? r.v.a : 0;
      resistor.current = I;
      resistor.voltage = r ? r.v.p - r.v.a : 0;
      led.setBrightness(I / RATED);
      [wPin, wCat, wGnd, bridge].forEach((w) => w.setCurrent(I));
      if (high && !led.burnt) {
        S.tried.add(S.ohms);
        if (S.tried.size >= 3) ctx.goal('tried');
        if (I >= 0.005 && I <= RATED + 1e-9) ctx.goal('safe');
      }
      const tone = led.burnt ? 'warn' : I > RATED + 1e-9 ? 'warn' : I >= 0.005 ? 'good' : high ? 'live' : 'off';
      ctx.hud([
        { label: 'Pin 13', value: S.uploading ? 'uploading…' : high ? 'HIGH · 5 V' : 'LOW · 0 V', tone: high ? 'live' : 'off' },
        { label: 'LED current', value: led.burnt ? 'burnt out' : fmt.amps(I), tone },
        { label: 'Across resistor', value: fmt.volts(resistor.voltage), tone: high ? 'live' : 'off' },
        { label: 'Across LED', value: fmt.volts(led.voltage), tone: high ? 'live' : 'off' },
      ]);
      renderStatus();
    }

    let statusEl = null;
    let replaceBtn = null;
    function renderStatus() {
      if (replaceBtn) replaceBtn.hidden = !led.burnt;
      if (!statusEl) return;
      const I = led.current;
      const R = S.ohms;
      const vf = LED_COLORS[S.color].vf;
      const calc = `I = (5 − ${vf.toFixed(1)}) ÷ (${R} + 10) = <b>${fmt.amps((5 - vf) / (R + 10))}</b>`;
      if (led.burnt) { statusEl.className = 'note warn'; statusEl.innerHTML = `Burnt out at ${fmt.amps(S.burnI ?? 0)}. A dead LED is an open gap: no current, and the full 5 V now sits across its legs. Pick at least 100 Ω, then press <b>Replace LED</b>.`; return; }
      if (!ctx.running) { statusEl.className = 'note'; statusEl.innerHTML = `${calc} — press Run to test it.`; return; }
      if (S.uploading) { statusEl.className = 'note'; statusEl.innerHTML = 'Uploading sketch to the board…'; return; }
      if (I > RATED + 1e-9) { statusEl.className = 'note warn'; statusEl.innerHTML = `${calc}. Too bright: above 20 mA the LED runs hot and wears out fast.`; return; }
      if (I >= 0.005) { statusEl.className = 'note good'; statusEl.innerHTML = `${calc}. Bright and safe.`; return; }
      statusEl.className = 'note'; statusEl.innerHTML = `${calc}. Safe, but dim.`;
    }

    let uploadTimer = 0;
    let traceTimer = 0;
    return {
      parts: { board, breadboard: bb, resistor, led },
      callouts: [
        { part: board, short: 'Pin 13', text: 'Gives 5 V when the sketch sets it HIGH.', value: () => (ctx.running && !S.uploading ? 'HIGH' : 'LOW') },
        { part: resistor, text: 'Takes the voltage the LED does not need.', value: () => (S.ohms ? fmt.ohms(S.ohms) : 'none!') },
        { part: led, text: 'Long leg (+) to the resistor.', value: () => (led.burnt ? 'burnt' : ctx.running && !S.uploading ? fmt.amps(led.current) : '') },
        { part: bb, text: 'Five holes in a column are joined.' },
      ],
      runLabel: ['Upload & run', 'Stop'],
      runNote: 'Uploading takes a moment, like a real board.',
      controls(root) {
        const res = seg('Resistor', CHOICES.map((o) => ({ value: o, html: o ? fmt.ohms(o) : 'None' })), S.ohms, (o) => {
          S.ohms = o;
          if (o) resistor.setOhms(o);
          resistor.group.visible = o > 0;
          bridge.group.visible = o === 0;
          res.querySelector('output').innerHTML = o ? bandsHtml(colorBands(o)) : 'wire only';
          ctx.update();
        });
        res.querySelector('output').innerHTML = bandsHtml(colorBands(S.ohms));
        const color = seg('LED colour', Object.entries(LED_COLORS).map(([k, v]) => ({
          value: k, html: `<span class="swatch" style="background:#${v.hex.toString(16).padStart(6, '0')}"></span>${v.label}`,
        })), S.color, (k) => {
          S.color = k; led.setColor(k); color.setOutput(`Vf ≈ ${LED_COLORS[k].vf.toFixed(1)} V`); ctx.update();
        }, `Vf ≈ ${LED_COLORS[S.color].vf.toFixed(1)} V`);
        statusEl = el('<div class="note"></div>');
        replaceBtn = el('<button class="btn" type="button" hidden>Replace LED</button>');
        replaceBtn.onclick = () => { led.replace(); ctx.toast('Fresh LED fitted.'); ctx.update(); };
        root.append(res, color, statusEl, replaceBtn);
        renderStatus();
      },
      run(on) {
        clearTimeout(uploadTimer);
        clearInterval(traceTimer);
        S.uploading = on;
        S.traceLine = -1;
        if (on) {
          uploadTimer = setTimeout(() => {
            S.uploading = false;
            // Step through the sketch like the board does: setup() once, then loop() for ever
            const order = [2, 3, 6, 7];
            let k = 0;
            S.traceLine = order[k];
            traceTimer = setInterval(() => {
              k = k < 3 ? k + 1 : 3;
              S.traceLine = order[k];
              if (k === 3) clearInterval(traceTimer);
              ctx.update();
            }, ms(MOTION.trace.line) || 1);
            ctx.update();
          }, ms(0.9));
        }
      },
      update,
      code() {
        const html = SKETCH.map((parts, n) => {
          let line = '';
          for (let i = 0; i < parts.length; i += 2) {
            const cls = parts[i] === 'hl' ? '' : parts[i], t = parts[i + 1] ?? '';
            line += cls ? `<span class="${cls}">${t}</span>` : t;
          }
          return `<span class="ln ${n === S.traceLine ? 'hl' : ''}">${line || ' '}</span>`;
        }).join('');
        return `<pre class="code">${html}</pre>`;
      },
      schematic() {
        const I = led.current;
        const live = I > 1e-6;
        const high = ctx.running && !S.uploading;
        return svg(340, 180,
          text(36, 34, high ? 'Pin 13 · 5 V' : 'Pin 13 · 0 V', 'val', 'start')
          + `<circle cx="40" cy="50" r="3.5"/>` + wire([[43.5, 50], [80, 50]], live)
          + (S.ohms ? comp('resistor', [80, 50], [200, 50], { label: 'R', value: fmt.ohms(S.ohms), side: -1, live }) : wire([[80, 50], [200, 50]], live) + text(140, 40, 'no resistor!', 'val'))
          + wire([[200, 50], [260, 50], [260, 70]], live)
          + comp('led', [260, 70], [260, 130], { label: led.burnt ? 'LED (burnt)' : `${LED_COLORS[S.color].label} LED`, value: fmt.amps(I), side: 1, live, dim: led.burnt })
          + wire([[260, 130], [260, 150], [43.5, 150]], live)
          + `<circle cx="40" cy="150" r="3.5"/>` + text(36, 172, 'GND · 0 V', 'val', 'start'),
        );
      },
    };
  },
};

