import { Circuit } from '../sim/circuit.js';
import { Resistor, LED, LED_COLORS } from '../parts/passive.js';
import { Board, Breadboard } from '../parts/board.js';
import { LDR, DeskLamp } from '../parts/extras.js';
import { fmt } from '../parts/common.js';
import { svg, wire, comp, dot, text } from '../ui/schematic.js';
import { el } from './ui.js';
import { between, JUMPER, slider, sketchHtml, boardRunner } from './kit.js';

const R_DIV = 10000; // fixed resistor under the LDR
const RATED = 0.02;

const SKETCH = [
  ['com', '// Lesson 7 — a street light that turns on at dusk'],
  ['kw', 'int ', '', 'limit = ', 'num', '400', '', ';'],
  ['', ''],
  ['kw', 'void ', 'fn', 'setup', '', '() {'],
  ['', '  ', 'fn', 'pinMode', '', '(', 'num', '13', '', ', OUTPUT);'],
  ['', '  Serial.', 'fn', 'begin', '', '(', 'num', '9600', '', ');'],
  ['', '}'],
  ['', ''],
  ['kw', 'void ', 'fn', 'loop', '', '() {'],
  ['', '  ', 'kw', 'int ', '', 'light = ', 'fn', 'analogRead', '', '(A0);   ', 'com', '// 0 … 1023'],
  ['', '  Serial.', 'fn', 'println', '', '(light);'],
  ['', '  ', 'kw', 'if ', '', '(light < limit) ', 'fn', 'digitalWrite', '', '(', 'num', '13', '', ', HIGH);'],
  ['', '  ', 'kw', 'else ', 'fn', 'digitalWrite', '', '(', 'num', '13', '', ', LOW);'],
  ['', '  ', 'fn', 'delay', '', '(', 'num', '200', '', ');'],
  ['', '}'],
];

export default {
  id: 'light-sensor',
  num: 7,
  title: 'Light sensor',
  meta: 'Class 10 · Electricity',
  chips: ['LDR', 'analogRead()', 'Street light', '~10 min'],
  caption: 'Dim the lamp until the street light comes on.',
  intro: 'Street lights switch themselves on at dusk. Build one: a light-dependent resistor reads the light, the board compares it with a limit, and switches an LED.',
  view: { target: [2, 0.6, 0.3], fit: [26, 12], az: -0.4 },
  goals: [
    { id: 'predict', text: 'Make a prediction' },
    { id: 'dusk', text: 'Make the street light switch on' },
    { id: 'dawn', text: 'Make it switch off again' },
    { id: 'limit', text: 'Change the limit in the sketch' },
  ],
  steps: [
    {
      title: 'A resistor that sees',
      text: '<p>The <b>LDR</b>’s resistance falls as light falls on it: about 1 MΩ in the dark, about 1 kΩ in bright light.</p>',
      look: ['ldr', 'lamp'],
    },
    {
      title: 'Your guess first',
      text: '<p>It gets dark. What happens to the LDR’s resistance?</p>',
      predict: {
        options: [{ t: 'It goes up', right: true }, { t: 'It goes down' }, { t: 'It stays the same' }],
        explain: 'Light frees charge carriers in the cadmium sulphide. Less light, fewer carriers, more resistance — up towards a million ohms.',
      },
      look: ['ldr'],
    },
    {
      title: 'Turning resistance into voltage',
      text: '<p>The board cannot read ohms, only volts. So the LDR sits on top of a fixed <b>10 kΩ</b> resistor: a <b>voltage divider</b>. The voltage at the middle goes to pin <b>A0</b>.</p><p class="formula">V(A0) = 5 × 10k ÷ (R_LDR + 10k)</p>',
      look: ['ldr', 'divider'],
    },
    {
      title: 'Run the sketch',
      text: '<p><b>Upload & run</b>, then slide the room light down. <code>analogRead(A0)</code> turns 0–5 V into 0–1023, and the serial monitor prints it five times a second.</p>',
      look: ['board', 'lamp'],
    },
    {
      title: 'Set the limit',
      text: '<p>Below <code>limit</code> the light comes on. Raise it and the street light switches on earlier in the evening; lower it and it waits for real darkness.</p>',
      look: ['led'],
    },
    {
      title: 'What you found',
      text: '<p>Sensor → number → decision → output. That is the pattern of almost every automatic machine: thermostats, auto-brightness screens, rain-sensing wipers.</p>',
    },
  ],

  build(ctx) {
    const S = { light: 0.75, limit: 400, value: 0, serial: [] };
    const board = ctx.add(new Board('Microcontroller board').at(-5.2, 0.12, 0.2));
    const bb = ctx.add(new Breadboard('Breadboard').at(4.4, 0.12, 0.3));
    const lamp = ctx.add(new DeskLamp('Desk lamp (room light)').at(9, 0.12, -5.5, 0.6));
    lamp.group.scale.setScalar(0.62);
    lamp.setLevel(S.light);

    const ldr = ctx.add(new LDR('LDR'));
    between(ldr, bb.hole(5, 'e'), bb.hole(6, 'e'));
    const divider = ctx.add(new Resistor('Resistor (10 kΩ)', { ohms: R_DIV, mount: 'breadboard', span: 4 * 0.254 }));
    between(divider, bb.hole(6, 'c'), bb.hole(10, 'c'));
    const res220 = ctx.add(new Resistor('Resistor (220 Ω)', { ohms: 220, mount: 'breadboard', span: 4 * 0.254 }));
    between(res220, bb.hole(19, 'c'), bb.hole(23, 'c'));
    const led = ctx.add(new LED('Street light LED', { color: 'red' }));
    between(led, bb.hole(24, 'e'), bb.hole(23, 'e'));

    const w5 = ctx.wire(board.term('5V'), bb.hole(5, 'a'), { ...JUMPER, color: 'red', lift: 1.4, sag: 0.1 });
    const wA0 = ctx.wire(board.term('A0'), bb.hole(6, 'b'), { ...JUMPER, color: 'teal', lift: 1.6, sag: 0.1 });
    const wDivG = ctx.wire(bb.hole(10, 'a'), bb.rail('T-', 8), { ...JUMPER, color: 'black', lift: 0.4, sag: 0.1, floor: 0.9 });
    const wPin = ctx.wire(board.term('D13'), bb.hole(19, 'a'), { ...JUMPER, color: 'orange', lift: 0.9 });
    const wCat = ctx.wire(bb.hole(24, 'a'), bb.rail('T-', 20), { ...JUMPER, color: 'black', lift: 0.4, sag: 0.1, floor: 0.9 });
    const wGnd = ctx.wire(bb.rail('T-', 2), board.term('GND'), { ...JUMPER, color: 'black', lift: 0.8 });

    let serialTick = 0;
    const runner = boardRunner(ctx, {
      setupLines: [3, 4, 5],
      loopLines: [9, 10, 11, 12, 13],
      onLine: (n) => {
        if (n !== 10) return;
        S.serial.push(String(S.value));
        if (S.serial.length > 4) S.serial.shift();
        serialTick++;
      },
    });

    function update() {
      ldr.setLight(S.light);
      lamp.setLevel(S.light);
      ctx.stage.setDaylight(0.25 + 0.75 * S.light);
      const powered = ctx.running;
      // Sensor loop: 5V → LDR → A0 → 10 kΩ → GND
      const rs = new Circuit().cell('V5', 'p', '0', powered ? 5 : 0).resistor('LDR', 'p', 'a0', ldr.ohms).resistor('RD', 'a0', '0', R_DIV).solve();
      const vA0 = rs ? rs.v.a0 : 0;
      S.value = Math.round((vA0 / 5) * 1023);
      const on = runner.high && S.value < S.limit;
      board.setPin13(on);
      // Output loop: pin 13 → 220 Ω → LED → GND
      const ro = new Circuit().cell('PIN', 'q', '0', on ? 5 : 0).resistor('R', 'q', 'k', 220).led('D', 'k', '0', LED_COLORS.red.vf).solve();
      const I = ro ? ro.i.D : 0;
      const Is = rs ? rs.i.LDR : 0;
      ldr.current = Is; divider.current = Is; divider.voltage = vA0;
      led.current = I; led.voltage = ro ? ro.v.k : 0;
      res220.current = I; res220.voltage = I * 220;
      led.setBrightness(I / RATED);
      [w5, wDivG].forEach((w) => w.setCurrent(Is));
      [wPin, wCat].forEach((w) => w.setCurrent(I));
      wGnd.setCurrent(I + Is);
      wA0.setCurrent(0);
      if (runner.high) {
        if (on) { S.wasOn = true; ctx.goal('dusk'); } else if (S.wasOn) ctx.goal('dawn');
      }
      ctx.hud([
        { label: 'analogRead(A0)', value: powered ? String(S.value) : '—', tone: powered ? 'live' : 'off' },
        { label: 'LDR', value: fmt.ohms(Math.round(ldr.ohms)), tone: powered ? 'live' : 'off' },
        { label: 'Street light', value: runner.S.uploading ? 'uploading…' : on ? 'ON' : 'off', tone: on ? 'good' : 'off' },
      ]);
      renderSerial();
    }

    let serialEl = null;
    let lastTick = -1;
    function renderSerial() {
      if (!serialEl || lastTick === serialTick) return;
      lastTick = serialTick;
      serialEl.innerHTML = `<span class="s-head">Serial monitor · 9600 baud</span>${S.serial.map((v) => `<div>${v}</div>`).join('')}`;
    }

    return {
      parts: { board, breadboard: bb, lamp, ldr, divider, resistor: res220, led },
      callouts: [
        { part: lamp, text: 'The room light. Dim it to make dusk.', value: () => `${Math.round(S.light * 100)}%` },
        { part: ldr, text: 'Resistance falls in light.', value: () => fmt.ohms(Math.round(ldr.ohms)) },
        { part: board, short: 'A0', text: 'Reads the divider voltage as 0–1023.', value: () => (ctx.running ? String(S.value) : '') },
        { part: led, text: 'Comes on below the limit.', value: () => (led.current > 1e-4 ? 'ON' : 'off') },
      ],
      runLabel: ['Upload & run', 'Stop'],
      runNote: 'The board checks the light five times a second.',
      controls(root) {
        const light = slider('Room light', { min: 0, max: 100, value: S.light * 100, format: (v) => `${v}%` }, (v) => { S.light = v / 100; ctx.update(); });
        const limit = slider('limit in the sketch', { min: 100, max: 900, step: 10, value: S.limit, format: (v) => String(v) }, (v) => { S.limit = v; ctx.goal('limit'); ctx.update(); });
        serialEl = el('<div class="serial"><span class="s-head">Serial monitor · 9600 baud</span></div>');
        root.append(light, limit, serialEl);
        lastTick = -1;
        update();
      },
      run(on) { runner.run(on); if (!on) S.serial = []; },
      update,
      code() {
        const lines = SKETCH.map((l, i) => (i === 1 ? ['kw', 'int ', '', 'limit = ', 'num', String(S.limit), '', ';'] : l));
        return sketchHtml(lines, runner.S.line);
      },
      schematic() {
        const Is = ldr.current;
        const live = Is > 1e-7;
        const liveOut = led.current > 1e-6;
        return svg(360, 200,
          text(20, 22, ctx.running ? '5V · 5 V' : '5V · off', 'val', 'start')
          + '<circle cx="60" cy="30" r="3.5"/>' + wire([[60, 33.5], [60, 45]], live)
          + comp('resistor', [60, 45], [60, 95], { label: 'LDR', value: fmt.ohms(Math.round(ldr.ohms)), side: 1, live })
          + '<path d="M30 60 l10 6 M30 70 l10 6" stroke-width="1.3"/>'
          + wire([[60, 95], [60, 110]], live) + dot(60, 110) + wire([[60, 110], [120, 110]]) + text(126, 114, `A0 = ${S.value}`, 'val', 'start')
          + comp('resistor', [60, 110], [60, 165], { label: '10 kΩ', side: 1, live })
          + wire([[60, 165], [60, 182]], live) + text(66, 194, 'GND', 'val', 'start')
          + text(200, 22, liveOut ? 'Pin 13 · HIGH' : 'Pin 13 · LOW', 'val', 'start')
          + '<circle cx="250" cy="30" r="3.5"/>' + wire([[250, 33.5], [250, 45]], liveOut)
          + comp('resistor', [250, 45], [250, 95], { label: '220 Ω', side: -1, live: liveOut })
          + wire([[250, 95], [250, 115]], liveOut)
          + comp('led', [250, 115], [250, 165], { label: 'LED', value: fmt.amps(led.current), side: -1, live: liveOut })
          + wire([[250, 165], [250, 182]], liveOut) + text(256, 194, 'GND', 'val', 'start'),
        );
      },
      dispose() { runner.stop(); },
    };
  },
};
