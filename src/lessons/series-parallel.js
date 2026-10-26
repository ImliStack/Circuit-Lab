import { Circuit } from '../sim/circuit.js';
import { CellPack, Bulb, PlugKey } from '../parts/passive.js';
import { Meter } from '../parts/meters.js';
import { fmt } from '../parts/common.js';
import { svg, wire, comp, dot, text } from '../ui/schematic.js';
import { seg, el } from './ui.js';

export default {
  id: 'series-parallel',
  num: 2,
  title: 'Series vs parallel',
  meta: 'Class 10 · Electricity',
  chips: ['Series & parallel', 'House wiring', '~10 min'],
  caption: 'Switch the wiring while it runs, then unscrew a bulb.',
  intro: 'Two identical 6 V torch bulbs, one 6 V battery. Join them one after the other, or side by side — and see which way your house is wired.',
  view: { target: [-2, 0, 0], fit: [50, 26], az: -0.35 },
  goals: [
    { id: 'predict', text: 'Make a prediction' },
    { id: 'series', text: 'Light the bulbs in series' },
    { id: 'parallel', text: 'Light the bulbs in parallel' },
    { id: 'unscrewS', text: 'Unscrew a bulb in series' },
    { id: 'unscrewP', text: 'Unscrew a bulb in parallel' },
  ],
  steps: [
    {
      title: 'Two bulbs, two ammeters',
      text: '<p>The bulbs are rated <b>6 V, 3 W</b>. Ammeter A₁ measures current <i>going into</i> the bulbs, and A₂ measures current <i>coming back</i> to the battery.</p>',
      look: ['bulb1', 'bulb2', 'a1', 'a2'],
    },
    {
      title: 'Series: one path',
      text: '<p>In <b>series</b> the current has only one path: through bulb 1, then bulb 2. The battery’s 6 V is shared between them.</p><p>Choose <b>Series</b> and press Run.</p>',
      look: ['bulb1', 'bulb2'],
    },
    {
      title: 'Is current used up?',
      text: '<p>Compare A₁ and A₂. If the bulbs "used up" current, A₂ would read less. It doesn’t: the same current flows all round. The bulbs use up <i>energy</i>, not charge.</p>',
      look: ['a1', 'a2'],
    },
    {
      title: 'Your guess first',
      text: '<p>The bulbs are in series and both are lit. You unscrew bulb 2.</p><p>What happens to bulb 1?</p>',
      predict: {
        options: [{ t: 'It gets brighter' }, { t: 'It stays the same' }, { t: 'It goes out', right: true }],
        explain: 'Series has only one path. Removing bulb 2 breaks the loop, so no current flows anywhere and bulb 1 goes out too. Try it with the Unscrew button.',
      },
      look: ['bulb2'],
    },
    {
      title: 'Parallel: separate paths',
      text: '<p>In <b>parallel</b> each bulb gets its own path straight across the battery, so each gets the full 6 V and glows at full power.</p><p>The total current is the sum of the branch currents.</p>',
      look: ['bulb1', 'bulb2', 'voltmeter'],
    },
    {
      title: 'Why houses use parallel',
      text: '<p>Unscrew a bulb in parallel: the other stays lit. That is why the lights and fans in your home are in parallel — each gets 220 V and can be switched on its own.</p><p class="formula">Series: R = R₁ + R₂ &nbsp; · &nbsp; Parallel: 1/R = 1/R₁ + 1/R₂</p>',
    },
  ],

  build(ctx) {
    const S = { mode: 'series', result: null };
    const pack = ctx.add(new CellPack('Battery (6 V)', { slots: 4, cells: 4 }).at(-20, 0.12, 6));
    const key = ctx.add(new PlugKey('Plug key').at(-14, 0.12, -7));
    const a1 = ctx.add(new Meter('Ammeter A₁', { type: 'ammeter', range: 2, ticks: 4 }).at(-4.5, 0.12, -8.5));
    const bulb1 = ctx.add(new Bulb('Bulb 1').at(5, 0.12, 0.5));
    const bulb2 = ctx.add(new Bulb('Bulb 2').at(15.5, 0.12, 0.5));
    const voltmeter = ctx.add(new Meter('Voltmeter (across bulb 1)', { type: 'voltmeter', range: 10, ticks: 5 }).at(11, 0.12, -10, -0.15));
    const a2 = ctx.add(new Meter('Ammeter A₂', { type: 'ammeter', range: 2, ticks: 4 }).at(-9, 0.12, 9, 0.2));

    // Fixed wiring
    const w = {
      batKey: ctx.wire(pack.term('plus'), key.term('a'), { color: 'red' }),
      keyA1: ctx.wire(key.term('b'), a1.term('plus'), { color: 'red' }),
      a1B1: ctx.wire(a1.term('minus'), bulb1.term('a'), { color: 'yellow' }),
      a2Bat: ctx.wire(a2.term('minus'), pack.term('minus'), { color: 'black' }),
    };
    ctx.wire(voltmeter.term('plus'), bulb1.term('a'), { color: 'red', radius: 0.1 });
    ctx.wire(voltmeter.term('minus'), bulb1.term('b'), { color: 'black', radius: 0.1 });
    // Mode-dependent wiring, rebuilt on change
    let modeWires = {};
    let built = false;
    function rewire() {
      Object.values(modeWires).forEach((x) => ctx.removeWire(x));
      if (S.mode === 'series') {
        modeWires = {
          b1B2: ctx.wire(bulb1.term('b'), bulb2.term('a'), { color: 'blue', sag: 0.5 }),
          b2A2: ctx.wire(bulb2.term('b'), a2.term('plus'), { color: 'blue' }),
        };
      } else {
        modeWires = {
          aa: ctx.wire(bulb1.term('a'), bulb2.term('a'), { color: 'yellow', lift: 2.2, sag: 0.25 }),
          bb: ctx.wire(bulb1.term('b'), bulb2.term('b'), { color: 'blue', lift: 0.8, sag: 0.4 }),
          b2A2: ctx.wire(bulb2.term('b'), a2.term('plus'), { color: 'blue' }),
        };
      }
      if (built) Object.values(modeWires).forEach((w, i) => ctx.drawIn(w, i * 0.08));
    }
    rewire();
    built = true;

    function solve() {
      const c = new Circuit()
        .cell('B', 'p', '0', pack.volts)
        .switch('K', 'p', 'k', ctx.running)
        .ammeter('A1', 'k', 'x');
      if (S.mode === 'series') {
        if (bulb1.inserted) c.resistor('L1', 'x', 'm', bulb1.ohms);
        if (bulb2.inserted) c.resistor('L2', 'm', 'y', bulb2.ohms);
      } else {
        if (bulb1.inserted) c.resistor('L1', 'x', 'y', bulb1.ohms);
        if (bulb2.inserted) c.resistor('L2', 'x', 'y', bulb2.ohms);
      }
      c.ammeter('A2', 'y', '0');
      return c.solve();
    }

    function update() {
      const r = solve();
      S.result = r;
      const g = (k) => (r && r.i[k] != null ? r.i[k] : 0);
      const I = g('A1'), I1 = g('L1'), I2 = g('L2');
      const series = S.mode === 'series';
      // Voltmeter probes bulb 1's posts; with the bulb out in series those posts float apart
      const Vb1 = r ? (series ? r.v.x - (r.v.m ?? 0) : r.v.x - r.v.y) : 0;
      a1.set(I); a2.set(g('A2')); voltmeter.set(Math.max(0, Vb1));
      pack.current = I;
      bulb1.current = I1; bulb1.voltage = I1 * bulb1.ohms;
      bulb2.current = I2; bulb2.voltage = I2 * bulb2.ohms;
      bulb1.setPower(I1 * I1 * bulb1.ohms);
      bulb2.setPower(I2 * I2 * bulb2.ohms);
      [w.batKey, w.keyA1, w.a1B1, w.a2Bat].forEach((x) => x.setCurrent(I));
      if (series) {
        modeWires.b1B2.setCurrent(I);
        modeWires.b2A2.setCurrent(I);
      } else {
        modeWires.aa.setCurrent(I2);
        modeWires.bb.setCurrent(I1);
        modeWires.b2A2.setCurrent(I);
      }
      const on = ctx.running;
      ctx.hud([
        { label: 'A₁ · in', value: fmt.amps(I), tone: on && I > 1e-6 ? 'live' : 'off' },
        { label: 'A₂ · back', value: fmt.amps(g('A2')), tone: on && I > 1e-6 ? 'live' : 'off' },
        { label: 'V · bulb 1', value: fmt.volts(Math.max(0, Vb1)), tone: on ? 'live' : 'off' },
        { label: 'Bulb 1', value: `${Math.round(Math.min(1, (I1 * I1 * bulb1.ohms) / bulb1.ratedW) * 100)}%`, tone: I1 > 1e-6 ? 'good' : 'off' },
        { label: 'Bulb 2', value: `${Math.round(Math.min(1, (I2 * I2 * bulb2.ohms) / bulb2.ratedW) * 100)}%`, tone: I2 > 1e-6 ? 'good' : 'off' },
      ]);
      if (on && bulb1.inserted && bulb2.inserted && I > 1e-6) ctx.goal(series ? 'series' : 'parallel');
      if (on && (!bulb1.inserted || !bulb2.inserted)) ctx.goal(series ? 'unscrewS' : 'unscrewP');
      renderCallout();
    }

    let calloutEl = null;
    let bulbBtns = [];
    function renderCallout() {
      bulbBtns.forEach(([b, bulb]) => { b.textContent = bulb.inserted ? `Unscrew ${bulb.name.toLowerCase()}` : `Screw in ${bulb.name.toLowerCase()}`; });
      if (!calloutEl) return;
      const r = S.result;
      if (!ctx.running || !r) { calloutEl.className = 'note'; calloutEl.innerHTML = 'Press Run to close the circuit.'; return; }
      const I = r.i.A1;
      const both = bulb1.inserted && bulb2.inserted;
      if (S.mode === 'series') {
        calloutEl.className = 'note';
        calloutEl.innerHTML = both
          ? `Total resistance 12 + 12 = <b>24 Ω</b>, so I = 6 ÷ 24 = <b>${I.toFixed(2)} A</b>. Each bulb gets 3 V and only a quarter of its power.`
          : 'The loop is broken. <b>No current</b> flows anywhere — both bulbs are dark.';
      } else {
        calloutEl.className = 'note good';
        calloutEl.innerHTML = both
          ? `Each branch: 6 ÷ 12 = 0.50 A. Total <b>${I.toFixed(2)} A</b> = 0.50 + 0.50. Each bulb gets the full 6 V.`
          : `One branch is open, but the other still has a full path: <b>${I.toFixed(2)} A</b> flows and its bulb stays lit.`;
      }
    }

    return {
      parts: { pack, key, a1, a2, bulb1, bulb2, voltmeter },
      callouts: [
        { part: pack, text: 'Four cells: 6 V in all.', value: () => '6.0 V' },
        { part: a1, text: 'Current going in to the bulbs.', value: () => (ctx.running ? fmt.amps(S.result?.i.A1 ?? 0) : '') },
        { part: a2, text: 'Current coming back. Same as A₁?', value: () => (ctx.running ? fmt.amps(S.result?.i.A2 ?? 0) : '') },
        { part: bulb1, text: 'Rated 6 V, 3 W.', value: () => (bulb1.inserted ? (ctx.running ? `${Math.round(Math.min(1, bulb1.current ** 2 * bulb1.ohms / 3) * 100)}%` : '') : 'out') },
        { part: bulb2, text: 'Rated 6 V, 3 W.', value: () => (bulb2.inserted ? (ctx.running ? `${Math.round(Math.min(1, bulb2.current ** 2 * bulb2.ohms / 3) * 100)}%` : '') : 'out') },
        { part: voltmeter, text: 'Across bulb 1.', value: () => (ctx.running ? fmt.volts(voltmeter.value) : '') },
      ],
      runLabel: ['Run', 'Stop'],
      runNote: 'Switch the wiring while it runs to compare.',
      controls(root) {
        const mode = seg('Wiring', [{ value: 'series', html: 'Series' }, { value: 'parallel', html: 'Parallel' }], S.mode, (m) => {
          S.mode = m; rewire(); ctx.update();
        });
        const row = el('<div><div class="control-label"><span>Bulbs</span></div><div class="row"></div></div>');
        bulbBtns = [bulb1, bulb2].map((bulb) => {
          const b = el('<button class="btn" type="button"></button>');
          b.onclick = () => { bulb.setInserted(!bulb.inserted); ctx.update(); };
          row.querySelector('.row').append(b);
          return [b, bulb];
        });
        calloutEl = el('<div class="note"></div>');
        root.append(mode, row, calloutEl);
        renderCallout();
      },
      run(on) { key.setClosed(on); },
      update,
      schematic() {
        const r = S.result;
        const I = r?.i.A1 ?? 0;
        const live = ctx.running && I > 1e-6;
        const I1 = r?.i.L1 ?? 0, I2 = r?.i.L2 ?? 0;
        const common = wire([[40, 40], [40, 62]], live) + wire([[40, 138], [40, 160], [110, 160]], live)
          + comp('cell', [40, 62], [40, 138], { n: 4, value: '6 V', side: -1, live })
          + comp('key', [40, 40], [100, 40], { closed: ctx.running, label: 'K', side: -1, live })
          + comp('meter', [100, 40], [160, 40], { letter: 'A', label: 'A₁', value: fmt.amps(I), side: -1, live })
          + comp('meter', [110, 160], [170, 160], { letter: 'A', label: 'A₂', value: fmt.amps(r?.i.A2 ?? 0), side: 1, live });
        if (S.mode === 'series') {
          return svg(372, 200, common
            + comp('bulb', [160, 40], [240, 40], { label: 'Bulb 1', value: fmt.amps(I1), side: -1, live: I1 > 1e-6, dim: !bulb1.inserted })
            + wire([[240, 40], [290, 40], [290, 60]], live)
            + comp('bulb', [290, 60], [290, 140], { label: 'Bulb 2', value: fmt.amps(I2), side: -1, live: I2 > 1e-6, dim: !bulb2.inserted })
            + wire([[290, 140], [290, 160], [170, 160]], live)
            + wire([[172, 40], [172, 84], [182, 84]]) + wire([[218, 84], [228, 84], [228, 40]])
            + comp('meter', [182, 84], [218, 84], { letter: 'V' })
            + dot(172, 40) + dot(228, 40)
            + (!bulb1.inserted || !bulb2.inserted ? text(200, 125, 'loop broken — no current', 'val') : ''));
        }
        return svg(372, 200, common
          + wire([[160, 40], [290, 40]], live)
          + comp('bulb', [210, 40], [210, 160], { label: 'Bulb 1', value: fmt.amps(I1), side: 1, live: I1 > 1e-6, dim: !bulb1.inserted })
          + comp('bulb', [290, 40], [290, 160], { label: 'Bulb 2', value: fmt.amps(I2), side: -1, live: I2 > 1e-6, dim: !bulb2.inserted })
          + wire([[290, 160], [170, 160]], live)
          + wire([[210, 40], [250, 40]]) + comp('meter', [250, 70], [250, 130], { letter: 'V', side: -1 })
          + wire([[250, 40], [250, 70]]) + wire([[250, 130], [250, 160]])
          + dot(210, 40) + dot(210, 160) + dot(250, 40) + dot(250, 160));
      },
    };
  },
};
