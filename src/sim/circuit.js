// DC circuit solver using modified nodal analysis (MNA).
//
// Unknowns: the voltage of every node except ground ('0'), plus the current
// through every voltage-like element (cells, ammeters, closed switches).
// LEDs are piecewise-linear: off (open) below their forward voltage, and a
// Vf source in series with a small dynamic resistance above it. We guess every
// LED's state, solve, check the guess, and repeat until nothing flips.

const GMIN = 1e-9; // tiny leak to ground so a floating node never makes the matrix singular

export class Circuit {
  constructor() {
    this.elements = [];
  }

  /** Ideal cell / battery: `plus` is held `volts` above `minus`. */
  cell(name, plus, minus, volts) { return this.add({ type: 'V', name, a: plus, b: minus, volts }); }
  resistor(name, a, b, ohms) { return this.add({ type: 'R', name, a, b, ohms }); }
  /** Ammeter: zero-volt source; reports current flowing a → b through it. */
  ammeter(name, a, b) { return this.add({ type: 'V', name, a, b, volts: 0, meter: true }); }
  switch(name, a, b, closed) { return closed ? this.add({ type: 'V', name, a, b, volts: 0 }) : this.add({ type: 'open', name, a, b }); }
  /** LED from anode `a` to cathode `b`. */
  led(name, a, b, vf, rd = 10) { return this.add({ type: 'D', name, a, b, vf, rd, on: true }); }

  add(e) { this.elements.push(e); return this; }

  solve() {
    const nodes = new Map([['0', -1]]);
    const idx = (n) => {
      if (!nodes.has(n)) nodes.set(n, nodes.size - 1);
      return nodes.get(n);
    };
    this.elements.forEach((e) => { idx(e.a); idx(e.b); });
    const N = nodes.size - 1;
    const diodes = this.elements.filter((e) => e.type === 'D');
    diodes.forEach((d) => { d.on = true; });

    let x = null;
    for (let iter = 0; iter < 30; iter++) {
      // Each LED that is on adds one current unknown (its internal Vf source)
      const vsrc = this.elements.filter((e) => e.type === 'V' || (e.type === 'D' && e.on));
      const M = N + vsrc.length;
      const A = Array.from({ length: M }, () => new Float64Array(M));
      const z = new Float64Array(M);
      for (let i = 0; i < N; i++) A[i][i] += GMIN;

      const stampG = (a, b, g) => {
        if (a >= 0) A[a][a] += g;
        if (b >= 0) A[b][b] += g;
        if (a >= 0 && b >= 0) { A[a][b] -= g; A[b][a] -= g; }
      };
      for (const e of this.elements) {
        if (e.type === 'R') stampG(idx(e.a), idx(e.b), 1 / Math.max(e.ohms, 1e-6));
      }
      vsrc.forEach((e, k) => {
        const a = idx(e.a), b = idx(e.b), row = N + k;
        // LED on: anode → (Vf source) → internal node folded in via rd
        // Modelled as Va - Vb - rd·I = Vf
        if (a >= 0) { A[a][row] += 1; A[row][a] += 1; }
        if (b >= 0) { A[b][row] -= 1; A[row][b] -= 1; }
        if (e.type === 'D') { A[row][row] -= e.rd; z[row] = e.vf; } else z[row] = e.volts;
      });

      x = gauss(A, z);
      if (!x) return null;

      // Store results and check LED guesses
      const volt = (n) => (idx(n) < 0 ? 0 : x[idx(n)]);
      let flipped = false;
      vsrc.forEach((e, k) => { e._i = x[N + k]; });
      for (const d of diodes) {
        if (d.on && d._i < 0) { d.on = false; flipped = true; }
        else if (!d.on && volt(d.a) - volt(d.b) > d.vf + 1e-6) { d.on = true; flipped = true; }
      }
      if (!flipped) {
        const result = { v: {}, i: {}, ok: true };
        for (const [n] of nodes) result.v[n] = volt(n);
        for (const e of this.elements) {
          const dv = volt(e.a) - volt(e.b);
          let i = 0;
          if (e.type === 'R') i = dv / e.ohms;
          else if (e.type === 'V') i = e._i; // a → b through the element
          else if (e.type === 'D') i = e.on ? e._i : 0;
          // Report a cell's current as what it pushes out of its + terminal
          if (e.type === 'V' && !e.meter && e.volts > 0) i = -e._i;
          result.i[e.name] = i;
          result.v[e.name] = dv;
        }
        return result;
      }
    }
    return null;
  }
}

/** Gaussian elimination with partial pivoting. Returns null if singular. */
function gauss(A, b) {
  const n = b.length;
  const M = A.map((row, i) => { const r = Array.from(row); r.push(b[i]); return r; });
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-14) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      if (!f) continue;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Float64Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}
