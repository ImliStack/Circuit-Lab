import { Circuit } from '../sim/circuit.js';
import { colorBands } from '../sim/colorcode.js';
import { CellPack, Resistor, PlugKey } from '../parts/passive.js';
import { Meter } from '../parts/meters.js';
import { fmt } from '../parts/common.js';
import { svg, wire, comp, dot } from '../ui/schematic.js';
import { seg, bandsHtml, el } from './ui.js';

const RESISTORS = [10, 15, 22, 47];

export default {
  id: 'ohms-law',
  num: 1,
  title: "Ohm's law",
  meta: 'Class 10 · Electricity',
  chips: ['NCERT Activity 11.1', 'V = IR', '~10 min'],
  caption: 'Close the key, then change the cells. Watch both needles.',
  intro: 'Does doubling the push double the flow? Repeat NCERT Activity 11.1: change the number of cells, read the ammeter and voltmeter, and find what stays the same.',
  view: { target: [-1, 0, 0.5], fit: [48, 22], az: -0.35 },
  goals: [
    { id: 'predict', text: 'Make a prediction' },
    { id: 'run', text: 'Close the plug key and read both meters' },
    { id: 'table', text: 'Record readings for 1, 2, 3 and 4 cells' },
  ],
  steps: [
    {
      title: 'The set-up',
      text: '<p>Cells push current through a resistor. The <b>ammeter</b> measures the current, the <b>voltmeter</b> measures the voltage across the resistor, and the <b>plug key</b> switches it all on.</p><p>Click any part on the bench to read about it.</p>',
      look: ['pack', 'key', 'ammeter', 'resistor', 'voltmeter'],
    },
    {
      title: 'Cells add up',
      text: '<p>Each dry cell gives 1.5 V. Cells joined in series add: 2 cells → 3 V, 4 cells → 6 V. A copper link fills any empty slot so the chain stays closed.</p>',
      look: ['pack'],
    },
    {
      title: 'Ammeter: in series',
      text: '<p>The ammeter sits <b>in the loop</b>, so every bit of current must pass through it. Current enters at its red (+) terminal.</p>',
      look: ['ammeter'],
    },
    {
      title: 'Voltmeter: in parallel',
      text: '<p>The voltmeter is connected <b>across</b> the resistor, on a side branch. It compares the two ends of the resistor and tells us the potential difference between them.</p>',
      look: ['voltmeter', 'resistor'],
    },
    {
      title: 'Your guess first',
      text: '<p>Suppose two cells (3 V) push current through a 10 Ω resistor.</p><p>What will the ammeter read?</p>',
      predict: {
        options: [{ t: '0.03 A' }, { t: '0.3 A', right: true }, { t: '3 A' }, { t: '30 A' }],
        explain: 'Current = voltage ÷ resistance = 3 V ÷ 10 Ω = 0.3 A. Set 2 cells and 10 Ω, then press Run to check.',
      },
    },
    {
      title: 'Close the key',
      text: '<p>Press <b>Run</b> to push the plug into the key. Watch the needles swing, and the charges start to move all the way round the loop at once.</p><p>Notice: the current is the same in every wire. Nothing is "used up".</p>',
      look: ['key'],
    },
    {
      title: 'Take readings',
      text: '<p>With the circuit on, set 1 cell and press <b>Record reading</b>. Then do 2, 3 and 4 cells. Look at the last column, V ÷ I.</p>',
      look: ['ammeter', 'voltmeter'],
    },
    {
      title: "Ohm's law",
      text: '<p>V ÷ I comes out the same every time — it is the resistance R. So</p><p class="formula">V = I × R</p><p>The V–I graph is a straight line through the origin, and its slope is R. Try another resistor: a steeper line means more resistance.</p>',
    },
  ],

  build(ctx) {
    const S = { cells: 2, ohms: 10, readings: [], result: null };
    const pack = ctx.add(new CellPack('Cells (battery)', { slots: 4, cells: S.cells }).at(-19, 0.12, 3));
    const key = ctx.add(new PlugKey('Plug key').at(-10, 0.12, -6));
    const ammeter = ctx.add(new Meter('Ammeter', { type: 'ammeter', range: 1, ticks: 5 }).at(-0.5, 0.12, -8));
    const resistor = ctx.add(new Resistor('Resistor', { ohms: S.ohms, mount: 'board' }).at(8.5, 0.12, 2.5));
    const voltmeter = ctx.add(new Meter('Voltmeter', { type: 'voltmeter', range: 10, ticks: 5 }).at(18, 0.12, -5.5, -0.4));

    const wires = [
      ctx.wire(pack.term('plus'), key.term('a'), { color: 'red' }),
      ctx.wire(key.term('b'), ammeter.term('plus'), { color: 'red' }),
      ctx.wire(ammeter.term('minus'), resistor.term('a'), { color: 'yellow' }),
      ctx.wire(resistor.term('b'), pack.term('minus'), { color: 'black', sag: 0.9 }),
    ];
    ctx.wire(voltmeter.term('plus'), resistor.term('a'), { color: 'red', radius: 0.1 });
    ctx.wire(voltmeter.term('minus'), resistor.term('b'), { color: 'black', radius: 0.1 });

    let notebookEl = null;

    function solve() {
      return new Circuit()
        .cell('B', 'p', '0', pack.volts)
        .switch('K', 'p', 'k', ctx.running)
        .ammeter('A', 'k', 'x')
        .resistor('R', 'x', '0', S.ohms)
        .solve();
    }

    function update() {
      const r = solve();
      S.result = r;
      const I = r ? r.i.A : 0;
      const V = r ? r.v.x : 0;
      ammeter.set(I);
      voltmeter.set(V);
      pack.current = I;
      resistor.current = I;
      resistor.voltage = V;
      wires.forEach((w) => w.setCurrent(I));
      const on = ctx.running && I > 1e-6;
      ctx.hud([
        { label: 'Ammeter · I', value: fmt.amps(I), tone: on ? 'live' : 'off' },
        { label: 'Voltmeter · V', value: fmt.volts(V), tone: on ? 'live' : 'off' },
        { label: 'V ÷ I', value: on ? `${(V / I).toFixed(1)} Ω` : '—', tone: on ? 'good' : 'off' },
      ]);
      if (on) ctx.goal('run');
      renderNotebook();
    }

    function record() {
      const r = S.result;
      if (!ctx.running || !r) return;
      const row = { cells: pack.count, ohms: S.ohms, V: r.v.x, I: r.i.A, fresh: true };
      S.readings = S.readings.filter((x) => !(x.cells === row.cells && x.ohms === row.ohms));
      S.readings.forEach((x) => { x.fresh = false; });
      S.readings.push(row);
      S.readings.sort((a, b) => a.ohms - b.ohms || a.cells - b.cells);
      const counts = new Set(S.readings.filter((x) => x.ohms === S.ohms).map((x) => x.cells));
      if ([1, 2, 3, 4].every((n) => counts.has(n))) ctx.goal('table');
      renderNotebook();
    }

    function renderNotebook() {
      if (!notebookEl) return;
      const rows = S.readings;
      const btn = `<button class="btn primary small" id="record" type="button" ${ctx.running ? '' : 'disabled'}>Record reading</button>`;
      notebookEl.innerHTML = `
        <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:6px">
          <span style="font-size:12.5px;color:var(--muted)">${ctx.running ? `Now: ${pack.count} cell${pack.count > 1 ? 's' : ''}, ${S.ohms} Ω` : 'Press Run first'}</span>${btn}
        </div>
        ${rows.length ? `<table class="readings">
          <thead><tr><th>R</th><th>Cells</th><th>V (volt)</th><th>I (ampere)</th><th>V ÷ I (Ω)</th></tr></thead>
          <tbody>${rows.map((x) => `<tr class="${x.fresh ? 'new' : ''}"><td>${x.ohms} Ω</td><td>${x.cells}</td><td>${x.V.toFixed(2)}</td><td>${x.I.toFixed(3)}</td><td>${(x.V / x.I).toFixed(1)}</td></tr>`).join('')}</tbody>
        </table>${graph(rows)}` : '<div class="empty">No readings yet.</div>'}`;
      notebookEl.querySelector('#record').onclick = record;
      rows.forEach((x) => { x.fresh = false; });
    }

    return {
      parts: { pack, key, ammeter, resistor, voltmeter },
      callouts: [
        { part: pack, text: 'Each cell pushes 1.5 V. Cells in series add up.', value: () => `${pack.volts.toFixed(1)} V` },
        { part: key, text: 'Plug in to close the circuit.', value: () => (ctx.running ? 'closed' : 'open') },
        { part: ammeter, text: 'In series. Reads the current I.', value: () => (ctx.running ? fmt.amps(S.result?.i.A ?? 0) : '') },
        { part: resistor, text: 'Colour bands give its resistance.', value: () => fmt.ohms(S.ohms) },
        { part: voltmeter, text: 'Across the resistor. Reads V.', value: () => (ctx.running ? fmt.volts(S.result?.v.x ?? 0) : '') },
      ],
      runLabel: ['Run', 'Stop'],
      runNote: 'Change the controls while it runs: the meters follow at once.',
      notebookTitle: 'Readings · V–I graph',
      controls(root) {
        const cells = seg('Cells', [1, 2, 3, 4].map((n) => ({ value: n, html: `${n}` })), S.cells, (n) => {
          S.cells = n; pack.setCells(n); cells.setOutput(`${(n * 1.5).toFixed(1)} V`); ctx.update();
        }, `${(S.cells * 1.5).toFixed(1)} V`);
        const res = seg('Resistor', RESISTORS.map((o) => ({ value: o, html: `${o} Ω` })), S.ohms, (o) => {
          S.ohms = o; resistor.setOhms(o); res.setOutput(''); res.querySelector('output').innerHTML = bandsHtml(colorBands(o)); ctx.update();
        });
        res.querySelector('output').innerHTML = bandsHtml(colorBands(S.ohms));
        root.append(cells, res, el('<div class="note">The voltmeter reads the voltage <i>across the resistor</i>. Here that equals the cells’ voltage, because ideal wires and an ideal ammeter take no voltage.</div>'));
      },
      notebook(root) { notebookEl = root; renderNotebook(); },
      run(on) { key.setClosed(on); },
      update,
      schematic() {
        const I = S.result?.i.A ?? 0;
        const live = ctx.running && I > 1e-6;
        const V = S.result?.v.x ?? 0;
        return svg(340, 196,
          wire([[40, 40], [40, 62]], live) + wire([[40, 138], [40, 160], [250, 160]], live)
          + comp('cell', [40, 62], [40, 138], { n: pack.count, label: `${pack.count} × 1.5 V`, value: `${pack.volts.toFixed(1)} V`, side: -1, live })
          + comp('key', [40, 40], [120, 40], { closed: ctx.running, label: 'K', side: -1, live })
          + comp('meter', [120, 40], [200, 40], { letter: 'A', value: fmt.amps(I), side: -1, live })
          + wire([[200, 40], [250, 40]], live)
          + comp('resistor', [250, 40], [250, 160], { label: 'R', value: fmt.ohms(S.ohms), side: 1, live })
          + wire([[250, 40], [305, 40], [305, 72]]) + wire([[305, 128], [305, 160], [250, 160]])
          + comp('meter', [305, 72], [305, 128], { letter: 'V', value: fmt.volts(V), side: -1 })
          + dot(250, 40) + dot(250, 160),
        ).replace('viewBox="0 0 340 196"', 'viewBox="0 0 396 196"');
      },
    };
  },
};

/** V–I graph: points for each resistor, with a best-fit line through the origin. */
function graph(rows) {
  const W = 320, H = 200, L = 40, B = 30, T = 12, R = 12;
  const maxI = Math.max(0.1, ...rows.map((r) => r.I)) * 1.1;
  const maxV = 6.6;
  const x = (i) => L + (i / maxI) * (W - L - R);
  const y = (v) => H - B - (v / maxV) * (H - B - T);
  const colors = { 10: '#56653f', 15: '#2f62b5', 22: '#c8372d', 47: '#b0561c' };
  let s = `<svg class="graph" viewBox="0 0 ${W} ${H}" role="img" aria-label="V against I graph">`;
  for (let v = 0; v <= 6; v += 1.5) s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L - 6}" y="${y(v) + 3.5}" text-anchor="end">${v}</text>`;
  const step = maxI > 0.4 ? 0.2 : 0.1;
  for (let i = 0; i <= maxI + 1e-9; i += step) s += `<text x="${x(i)}" y="${H - B + 14}" text-anchor="middle">${i.toFixed(1)}</text>`;
  s += `<line x1="${L}" y1="${T}" x2="${L}" y2="${H - B}" stroke="var(--muted)"/><line x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}" stroke="var(--muted)"/>`;
  s += `<text x="${W - R}" y="${H - 4}" text-anchor="end">I (A) →</text><text x="${L + 4}" y="${T + 8}">V (V)</text>`;
  const byR = {};
  rows.forEach((r) => { (byR[r.ohms] ||= []).push(r); });
  for (const [ohms, pts] of Object.entries(byR)) {
    const c = colors[ohms] || 'var(--ink)';
    // Least squares through the origin: slope = Σ(VI) / Σ(I²)
    const slope = pts.reduce((a, p) => a + p.V * p.I, 0) / pts.reduce((a, p) => a + p.I * p.I, 0);
    const iEnd = Math.min(maxI, maxV / slope);
    if (pts.length > 1) s += `<line x1="${x(0)}" y1="${y(0)}" x2="${x(iEnd)}" y2="${y(slope * iEnd)}" stroke="${c}" stroke-width="1.5" stroke-dasharray="4 3"/>`;
    pts.forEach((p) => { s += `<circle cx="${x(p.I)}" cy="${y(p.V)}" r="4" fill="${c}"/>`; });
    const last = pts[pts.length - 1];
    s += `<text x="${x(last.I) + 7}" y="${y(last.V) + 4}" style="fill:${c}">${ohms} Ω</text>`;
  }
  return `${s}</svg>`;
}
