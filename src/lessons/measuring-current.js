import * as THREE from 'three';
import { Circuit } from '../sim/circuit.js';
import { CellPack, Bulb, Resistor, PlugKey } from '../parts/passive.js';
import { Meter } from '../parts/meters.js';
import { fmt } from '../parts/common.js';
import { svg, wire, comp, dot, text } from '../ui/schematic.js';
import { seg, el } from './ui.js';
import { EASE, MOTION } from '../motion.js';

// Where the ammeter can go: three gaps in the loop, or (wrongly) across the bulb
const SLOTS = {
  A: { label: 'A · after the cells', at: [-17, -6.5], ry: 0.25, gap: 0 },
  B: { label: 'B · after the key', at: [-1.5, -10.5], ry: 0, gap: 1 },
  C: { label: 'C · after the bulb', at: [15.5, -3.5], ry: -0.55, gap: 2 },
  across: { label: 'Across the bulb (wrong)', at: [7, -14], ry: 0.1, gap: -1 },
};

export default {
  id: 'measuring-current',
  num: 5,
  title: 'Measuring current',
  meta: 'Class 10 · Electricity',
  chips: ['Ammeter in series', 'Same current everywhere', '~8 min'],
  caption: 'Move the ammeter round the loop. Does the reading change?',
  intro: 'Put the ammeter in three different places in one loop: after the cells, after the key, after the bulb. Then make the two mistakes everyone makes once — and see why they are mistakes.',
  view: { target: [-1, 0, -1.5], fit: [44, 26], az: -0.3 },
  goals: [
    { id: 'predict', text: 'Make a prediction' },
    { id: 'all3', text: 'Measure the current at A, B and C' },
    { id: 'across', text: 'Connect the ammeter across the bulb' },
    { id: 'reverse', text: 'Connect it the wrong way round' },
  ],
  steps: [
    {
      title: 'One loop, three places',
      text: '<p>Cells (4.5 V) → plug key → bulb (12 Ω) → resistor (10 Ω) → back to the cells. The ammeter can be fitted into any gap in the loop: <b>A</b>, <b>B</b> or <b>C</b>.</p>',
      look: ['ammeter'],
    },
    {
      title: 'Your guess first',
      text: '<p>The bulb uses energy. So is the current at <b>C</b> (after the bulb) less than at <b>A</b> (before it)?</p>',
      predict: {
        options: [{ t: 'Yes — the bulb uses some of it up' }, { t: 'No — it is the same at A, B and C', right: true }, { t: 'It is bigger at C' }],
        explain: 'Charge is not used up, it only passes through. In a single loop the same current flows through every part: 4.5 ÷ (12 + 10) ≈ 0.20 A at A, B and C. What the bulb uses is energy.',
      },
    },
    {
      title: 'Measure at A, B, C',
      text: '<p>Press <b>Run</b>, then move the ammeter between the three gaps. Each reading goes into the notebook.</p>',
      look: ['ammeter', 'key', 'bulb'],
    },
    {
      title: 'Mistake 1: across the bulb',
      text: '<p>An ammeter has almost no resistance. Put it <b>across</b> the bulb and nearly all the current takes that easy path: the bulb goes dark and the current jumps.</p><p>With a bigger supply this can burn out the meter.</p>',
      look: ['bulb'],
    },
    {
      title: 'Mistake 2: wrong way round',
      text: '<p>Current must go <b>in at red (+)</b>. Fit it the other way and a moving-coil meter tries to swing below zero — the needle bangs against the stop.</p>',
      look: ['ammeter'],
    },
    {
      title: 'What you found',
      text: '<p>An ammeter always goes <b>in series</b>, + towards the cells’ +. In one loop it reads the same wherever you put it.</p>',
    },
  ],

  build(ctx) {
    const S = { slot: 'A', reversed: false, result: null, readings: {}, moving: false };
    const pack = ctx.add(new CellPack('Cells (4.5 V)', { slots: 4, cells: 3 }).at(-19, 0.12, 4));
    const key = ctx.add(new PlugKey('Plug key').at(-9, 0.12, -6));
    const bulb = ctx.add(new Bulb('Bulb (6 V, 3 W)').at(6, 0.12, -6));
    const resistor = ctx.add(new Resistor('Resistor (10 Ω)', { ohms: 10, mount: 'board' }).at(12, 0.12, 6, -0.3));
    const ammeter = ctx.add(new Meter('Ammeter', { type: 'ammeter', range: 0.5, ticks: 5 }));
    place(ammeter, SLOTS.A);

    function place(m, slot) {
      m.group.position.set(slot.at[0], 0.12, slot.at[1]);
      m.group.rotation.y = slot.ry;
    }

    // The loop in order; the ammeter takes the place of one of these links
    const links = () => [[pack.term('plus'), key.term('a')], [key.term('b'), bulb.term('a')], [bulb.term('b'), resistor.term('a')], [resistor.term('b'), pack.term('minus')]];
    let wires = [];
    function rewire(drawIn) {
      wires.forEach((w) => ctx.removeWire(w));
      const slot = SLOTS[S.slot];
      const inT = S.reversed ? 'minus' : 'plus', outT = S.reversed ? 'plus' : 'minus';
      const list = [];
      links().forEach(([a, b], i) => {
        const color = i === 3 ? 'black' : i === 0 ? 'red' : 'yellow';
        if (i === slot.gap) {
          list.push(ctx.wire(a, ammeter.term(inT), { color }));
          list.push(ctx.wire(ammeter.term(outT), b, { color }));
        } else list.push(ctx.wire(a, b, { color, sag: i === 3 ? 0.9 : 0.7 }));
      });
      if (slot.gap < 0) {
        list.push(ctx.wire(bulb.term('a'), ammeter.term(inT), { color: 'blue', radius: 0.11 }));
        list.push(ctx.wire(ammeter.term(outT), bulb.term('b'), { color: 'blue', radius: 0.11 }));
      }
      wires = list;
      if (drawIn) wires.forEach((w, i) => ctx.drawIn(w, i * 0.06));
    }
    rewire(false);

    /** Lift the meter off, carry it to the new gap in an arc, set it down, then re-wire. */
    function moveTo(slotKey) {
      if (S.moving || slotKey === S.slot) return;
      S.moving = true;
      wires.forEach((w) => ctx.removeWire(w));
      wires = [];
      S.slot = slotKey;
      ctx.update();
      const from = ammeter.group.position.clone(), r0 = ammeter.group.rotation.y;
      const to = SLOTS[slotKey];
      const target = new THREE.Vector3(to.at[0], 0.12, to.at[1]);
      ctx.stage.tweens.add({
        duration: 0.8, ease: EASE.inOutCubic,
        update: (k) => {
          ammeter.group.position.lerpVectors(from, target, k);
          ammeter.group.position.y = 0.12 + Math.sin(Math.PI * k) * 5;
          ammeter.group.rotation.y = r0 + (to.ry - r0) * k;
          ammeter.group.userData.baseY = 0.12;
        },
        done: () => { S.moving = false; rewire(true); ctx.update(); },
      });
    }

    function solve() {
      const c = new Circuit().cell('B', 'p', '0', pack.volts);
      // Node names along the loop: p → k → b → r → 0, with the meter splitting one link
      const nodes = ['p', 'k', 'b', 'r', '0'];
      const gap = S.moving ? -2 : SLOTS[S.slot].gap;
      const linkEnd = (i) => (i === gap ? `${nodes[i]}m` : nodes[i]);
      c.switch('K', linkEnd(0), 'k', ctx.running);
      c.resistor('L', linkEnd(1), 'b', bulb.ohms);
      c.resistor('R', linkEnd(2), 'r', 10);
      c.resistor('W', linkEnd(3), '0', 1e-6); // the return wire
      if (gap >= 0) {
        // Meter sits between the link's start node and a new node `${start}m`
        const a = nodes[gap], b = `${nodes[gap]}m`;
        S.reversed ? c.ammeter('A', b, a) : c.ammeter('A', a, b);
      } else if (gap === -1) {
        S.reversed ? c.ammeter('A', 'b', 'k') : c.ammeter('A', 'k', 'b');
      }
      // Join the dangling halves of links that have no meter in them
      for (let i = 0; i < 4; i++) if (i !== gap) c.resistor(`J${i}`, nodes[i], `${nodes[i]}m`, 1e-6);
      return c.solve();
    }

    function update() {
      const r = solve();
      S.result = r;
      const I = r ? r.i.B : 0; // current pushed out by the cells
      const Ia = r && r.i.A != null ? r.i.A : 0;
      const Ib = r ? r.i.L : 0;
      ammeter.set(S.moving ? 0 : Ia);
      pack.current = I;
      bulb.current = Ib; bulb.voltage = Ib * bulb.ohms;
      bulb.setPower(Ib * Ib * bulb.ohms);
      resistor.current = I; resistor.voltage = I * 10;
      const across = S.slot === 'across';
      wires.forEach((w, i) => {
        if (across && i >= 4) w.setCurrent(i === 4 ? Ia : Ia);
        else if (across && i === 1) w.setCurrent(I);
        else w.setCurrent(I);
      });
      const on = ctx.running && !S.moving;
      if (on && !S.reversed && !across) {
        S.readings[S.slot] = Ia;
        if (['A', 'B', 'C'].every((k) => S.readings[k] != null)) ctx.goal('all3');
      }
      if (on && across) ctx.goal('across');
      if (on && S.reversed && Math.abs(Ia) > 1e-3) ctx.goal('reverse');
      ctx.hud([
        { label: `Ammeter at ${S.slot === 'across' ? 'bulb' : S.slot}`, value: fmt.amps(on ? Ia : 0), tone: !on ? 'off' : S.reversed || across ? 'warn' : 'good' },
        { label: 'From the cells', value: fmt.amps(I), tone: on ? 'live' : 'off' },
        { label: 'Bulb', value: `${Math.round(Math.min(1, (Ib * Ib * bulb.ohms) / bulb.ratedW) * 100)}%`, tone: Ib > 1e-3 ? 'live' : 'off' },
      ]);
      renderNote(on, Ia);
      renderNotebook();
    }

    let noteEl = null, bookEl = null, posSeg = null;
    function renderNote(on, Ia) {
      if (!noteEl) return;
      const across = S.slot === 'across';
      if (!on) { noteEl.className = 'note'; noteEl.innerHTML = S.moving ? 'Moving the ammeter…' : 'Press <b>Run</b> to close the key.'; return; }
      if (across) { noteEl.className = 'note warn'; noteEl.innerHTML = `The ammeter is a short cut round the bulb: the bulb goes dark and <b>${fmt.amps(Math.abs(Ia))}</b> rushes through the meter.`; return; }
      if (S.reversed) { noteEl.className = 'note warn'; noteEl.innerHTML = 'Wrong way round: current enters at black (−). The needle is pinned below zero.'; return; }
      noteEl.className = 'note good';
      noteEl.innerHTML = `At ${S.slot}: <b>${fmt.amps(Ia)}</b>. I = 4.5 ÷ (12 + 10) = 0.20 A — the same wherever the meter sits.`;
    }
    function renderNotebook() {
      if (!bookEl) return;
      const rows = ['A', 'B', 'C'].map((k) => `<tr><td>${SLOTS[k].label}</td><td>${S.readings[k] != null ? S.readings[k].toFixed(3) : '—'}</td></tr>`).join('');
      bookEl.innerHTML = `<table class="readings"><thead><tr><th>Ammeter position</th><th>I (ampere)</th></tr></thead><tbody>${rows}</tbody></table>`;
    }

    return {
      parts: { pack, key, bulb, resistor, ammeter },
      callouts: [
        { part: pack, text: 'Three cells: 4.5 V.', value: () => '4.5 V' },
        { part: key, text: 'Plug in to close the loop.', value: () => (ctx.running ? 'closed' : 'open') },
        { part: ammeter, text: 'Red (+) towards the cells’ +.', value: () => (ctx.running && !S.moving ? fmt.amps(S.result?.i.A ?? 0) : '') },
        { part: bulb, text: '12 Ω filament.', value: () => (ctx.running ? fmt.amps(bulb.current) : '') },
        { part: resistor, text: '10 Ω in series.', value: () => '10 Ω' },
      ],
      runLabel: ['Run', 'Stop'],
      runNote: 'Move the ammeter while it runs: each reading is recorded.',
      notebookTitle: 'Readings',
      controls(root) {
        posSeg = seg('Ammeter position', Object.entries(SLOTS).map(([k, v]) => ({ value: k, html: k === 'across' ? 'Across bulb' : k })), S.slot, (k) => moveTo(k));
        const pol = seg('Connected', [{ value: false, html: 'Red to + (right)' }, { value: true, html: 'Reversed' }], S.reversed, (v) => {
          S.reversed = v; rewire(true); ctx.update();
        });
        noteEl = el('<div class="note"></div>');
        root.append(posSeg, pol, noteEl);
        update();
      },
      notebook(root) { bookEl = root; renderNotebook(); },
      run() {},
      update,
      schematic() {
        const r = S.result;
        const I = r?.i.B ?? 0;
        const live = ctx.running && I > 1e-6;
        const meter = (p1, p2, side = -1) => comp('meter', p1, p2, { letter: 'A', value: fmt.amps(r?.i.A ?? 0), side, live });
        const slot = S.moving ? '' : S.slot;
        const seg2 = (k, p1, p2, other) => (slot === k ? meter(p1, p2) : wire([p1, p2], live) + text((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2 - 8, k, 'val') + (other ?? ''));
        return svg(360, 190,
          wire([[40, 40], [40, 62]], live) + comp('cell', [40, 62], [40, 138], { n: 3, value: '4.5 V', side: -1, live }) + wire([[40, 138], [40, 160], [320, 160], [320, 140]], live)
          + seg2('A', [40, 40], [90, 40])
          + comp('key', [90, 40], [140, 40], { closed: ctx.running, label: 'K', side: -1, live })
          + seg2('B', [140, 40], [190, 40])
          + comp('bulb', [190, 40], [250, 40], { label: 'Bulb 12 Ω', side: -1, live: (bulb.current ?? 0) > 1e-4 })
          + seg2('C', [250, 40], [320, 40]) + wire([[320, 40], [320, 60]], live)
          + comp('resistor', [320, 60], [320, 140], { label: '10 Ω', side: 1, live })
          + (slot === 'across' ? wire([[190, 40], [190, 90]]) + meter([190, 90], [250, 90], 1) + wire([[250, 90], [250, 40]]) + dot(190, 40) + dot(250, 40) : ''),
        );
      },
    };
  },
};
