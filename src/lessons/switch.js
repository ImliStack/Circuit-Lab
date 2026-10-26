import { Circuit } from '../sim/circuit.js';
import { Resistor, LED, LED_COLORS } from '../parts/passive.js';
import { Board, Breadboard } from '../parts/board.js';
import { PushButton } from '../parts/extras.js';
import { fmt } from '../parts/common.js';
import { svg, wire, comp, text } from '../ui/schematic.js';
import { seg, el } from './ui.js';
import { between, JUMPER } from './kit.js';

const RATED = 0.02;

export default {
  id: 'switch',
  num: 4,
  title: 'A switch',
  meta: 'Class 8 · Electricity',
  chips: ['Open & closed', 'Push button', '~6 min'],
  caption: 'Hold the red button to close the gap.',
  intro: 'A switch is just a gap you can close. Press the button and the gap closes, current flows and the LED lights. Let go and the gap opens again.',
  view: { target: [0, 0.3, 0.3], fit: [19, 9], az: -0.4 },
  goals: [
    { id: 'predict', text: 'Make a prediction' },
    { id: 'press', text: 'Light the LED with the button' },
    { id: 'presses', text: 'Press it five times' },
    { id: 'toggle', text: 'Try a toggle switch' },
  ],
  steps: [
    {
      title: 'An open circuit',
      text: '<p>Power comes from the board’s <b>5V</b> pin, through the <b>push button</b>, a 220 Ω resistor and the LED, then back to <b>GND</b>.</p><p>Right now the button is not pressed: there is a gap, so no current flows anywhere in the loop.</p>',
      look: ['button'],
    },
    {
      title: 'Your guess first',
      text: '<p>The board is on and the button is <b>not</b> pressed. What voltage would a voltmeter read across the button’s two legs?</p>',
      predict: {
        options: [{ t: '0 V — nothing is flowing' }, { t: '2.5 V — half of it' }, { t: '5 V — all of it', right: true }],
        explain: 'With no current, the resistor and LED take no voltage, so the whole 5 V appears across the gap. That is why an open switch in a mains circuit can still give you a shock.',
      },
      look: ['button'],
    },
    {
      title: 'Close the gap',
      text: '<p>Press <b>Power on</b>, then hold the button. Inside it a metal dome snaps down and joins the two legs: the circuit is <b>closed</b>.</p><p>Watch the voltage across the button drop to 0 V while the LED takes the current.</p>',
      look: ['button', 'led'],
    },
    {
      title: 'Push vs toggle',
      text: '<p>A <b>push button</b> is momentary: it only stays closed while you hold it. A <b>toggle</b> switch, like a light switch, stays where you leave it.</p><p>Switch the type and press again.</p>',
    },
    {
      title: 'What you found',
      text: '<p>A switch controls the whole loop, wherever it sits in it. Open anywhere means off everywhere.</p><p class="formula">open: I = 0 · closed: I = (5 − 2) ÷ 230 ≈ 13 mA</p>',
    },
  ],

  build(ctx) {
    const S = { mode: 'push', latched: false, held: false, presses: 0, result: null };
    const board = ctx.add(new Board('Microcontroller board').at(-4.9, 0.12, 0.2));
    const bb = ctx.add(new Breadboard('Breadboard').at(4.4, 0.12, 0.3));
    const button = ctx.add(new PushButton('Push button'));
    between(button, bb.hole(8, 'e'), bb.hole(10, 'e'));
    button.group.position.z += 0.3; // straddles the centre channel like a real tactile switch
    const resistor = ctx.add(new Resistor('Resistor', { ohms: 220, mount: 'breadboard', span: 4 * 0.254 }));
    between(resistor, bb.hole(10, 'c'), bb.hole(14, 'c'));
    const led = ctx.add(new LED('LED', { color: 'green' }));
    between(led, bb.hole(15, 'e'), bb.hole(14, 'e'));

    const w5 = ctx.wire(board.term('5V'), bb.hole(8, 'a'), { ...JUMPER, color: 'red', lift: 1.2, sag: 0.1 });
    const wCat = ctx.wire(bb.hole(15, 'a'), bb.rail('T-', 13), { ...JUMPER, color: 'black', lift: 0.4, sag: 0.1, floor: 0.9 });
    const wGnd = ctx.wire(bb.rail('T-', 2), board.term('GND'), { ...JUMPER, color: 'black', lift: 0.8 });

    const closed = () => (S.mode === 'push' ? S.held : S.latched);
    button.onPress = (down) => press(down);

    function press(down) {
      if (down === S.held) return;
      S.held = down;
      if (down) {
        if (S.mode === 'toggle') S.latched = !S.latched;
        S.presses++;
        if (S.presses >= 5) ctx.goal('presses');
        if (S.mode === 'toggle') ctx.goal('toggle');
      }
      button.setPressed(S.mode === 'push' ? down : S.latched || down);
      holdBtn?.classList.toggle('down', down);
      ctx.update();
    }

    function update() {
      const on = ctx.running;
      const c = new Circuit().cell('V5', 'p', '0', on ? 5 : 0)
        .switch('SW', 'p', 's', closed())
        .resistor('R', 's', 'a', 220)
        .led('D', 'a', '0', LED_COLORS.green.vf);
      const r = c.solve();
      S.result = r;
      const I = r ? r.i.D : 0;
      // Across an open switch the solver's two nodes float apart: p at 5 V, s pulled to 0 through R and the LED
      const Vsw = r ? r.v.p - r.v.s : 0;
      button.closed = closed();
      button.voltage = Vsw;
      button.current = I;
      led.current = I;
      led.voltage = r ? r.v.a : 0;
      resistor.current = I;
      resistor.voltage = I * 220;
      led.setBrightness(I / RATED);
      [w5, wCat, wGnd].forEach((w) => w.setCurrent(I));
      if (on && I > 1e-4) ctx.goal('press');
      ctx.hud([
        { label: 'Switch', value: closed() ? 'closed' : 'open', tone: closed() ? 'good' : on ? 'live' : 'off' },
        { label: 'Across button', value: fmt.volts(Vsw), tone: on ? 'live' : 'off' },
        { label: 'LED current', value: fmt.amps(I), tone: I > 1e-4 ? 'good' : 'off' },
      ]);
      if (noteEl) {
        noteEl.className = `note ${I > 1e-4 ? 'good' : ''}`;
        noteEl.innerHTML = !on ? 'Press <b>Power on</b> first — the board supplies the 5 V.'
          : closed() ? `Closed. The full loop conducts: <b>${fmt.amps(I)}</b>, and the button itself takes <b>0 V</b>.`
          : 'Open. No current flows, so all <b>5 V</b> sits across the gap in the button.';
      }
      if (countEl) countEl.textContent = `${S.presses} press${S.presses === 1 ? '' : 'es'}`;
    }

    let noteEl = null, holdBtn = null, countEl = null;
    return {
      parts: { board, breadboard: bb, button, resistor, led },
      callouts: [
        { part: board, short: '5V pin', text: 'Steady 5 V while the board is powered.', value: () => (ctx.running ? '5 V' : 'off') },
        { part: button, text: 'Hold to close the gap.', value: () => (closed() ? 'closed' : 'open') },
        { part: resistor, text: '220 Ω keeps the LED safe.', value: () => '220 Ω' },
        { part: led, text: 'Lights only when the loop is closed.', value: () => (led.current > 1e-4 ? fmt.amps(led.current) : '') },
      ],
      runLabel: ['Power on', 'Power off'],
      runNote: 'You can also hold the red button on the bench with the mouse.',
      controls(root) {
        const type = seg('Switch type', [{ value: 'push', html: 'Push (momentary)' }, { value: 'toggle', html: 'Toggle (stays)' }], S.mode, (m) => {
          S.mode = m; S.latched = false; button.setPressed(false); ctx.update();
        });
        holdBtn = el('<button class="hold" type="button">Hold to press the button</button>');
        const down = (e) => { e.preventDefault(); holdBtn.setPointerCapture?.(e.pointerId); press(true); };
        const up = () => press(false);
        holdBtn.addEventListener('pointerdown', down);
        holdBtn.addEventListener('pointerup', up);
        holdBtn.addEventListener('pointercancel', up);
        holdBtn.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); press(true); } });
        holdBtn.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') press(false); });
        countEl = el('<div class="run-note" style="margin:0;text-align:right"></div>');
        noteEl = el('<div class="note"></div>');
        root.append(type, holdBtn, countEl, noteEl);
        update();
      },
      run() { if (!ctx.running) { S.latched = false; button.setPressed(false); } },
      update,
      schematic() {
        const I = led.current;
        const live = I > 1e-6;
        return svg(340, 180,
          text(36, 34, ctx.running ? '5V pin · 5 V' : '5V pin · off', 'val', 'start')
          + '<circle cx="40" cy="50" r="3.5"/>' + wire([[43.5, 50], [70, 50]], live)
          + comp('key', [70, 50], [130, 50], { closed: closed(), label: 'Button', value: closed() ? 'closed' : 'open', side: -1, live })
          + comp('resistor', [130, 50], [220, 50], { label: 'R', value: '220 Ω', side: -1, live })
          + wire([[220, 50], [260, 50], [260, 70]], live)
          + comp('led', [260, 70], [260, 130], { label: 'Green LED', value: fmt.amps(I), side: 1, live })
          + wire([[260, 130], [260, 150], [43.5, 150]], live)
          + '<circle cx="40" cy="150" r="3.5"/>' + text(36, 172, 'GND · 0 V', 'val', 'start'),
        );
      },
    };
  },
};
