// Tiny SVG schematic kit using the symbols in NCERT Class 10 Ch. 11 (Table 11.1).
// Components are drawn between two points; leads fill the gap to the body.

const BODY = 40;

export function svg(w, h, body) {
  return `<svg class="schematic" viewBox="0 0 ${w} ${h}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Circuit diagram">${body}</svg>`;
}

export function wire(points, live = false) {
  return `<polyline class="${live ? 'live' : ''}" points="${points.map((p) => p.join(',')).join(' ')}"/>`;
}

export function dot(x, y) {
  return `<circle cx="${x}" cy="${y}" r="3" fill="currentColor" stroke="none"/>`;
}

export function text(x, y, s, cls = '', anchor = 'middle') {
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" class="${cls}" stroke="none">${s}</text>`;
}

const SYMBOLS = {
  resistor: () => {
    const pts = [[-20, 0]];
    for (let i = 0; i < 6; i++) pts.push([-17 + i * 6.6, i % 2 ? 7 : -7]);
    pts.push([20, 0]);
    return { w: 40, d: `<polyline points="${pts.map((p) => p.join(',')).join(' ')}"/>` };
  },
  cell: (n = 1) => {
    const w = n * 12 - 4;
    let d = '';
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + i * 12;
      d += `<line x1="${x}" y1="-12" x2="${x}" y2="12"/><line x1="${x + 6}" y1="-6" x2="${x + 6}" y2="6" stroke-width="4"/>`;
      if (i < n - 1) d += `<line x1="${x + 6}" y1="0" x2="${x + 12}" y2="0" stroke-dasharray="1.5 2.5"/>`;
    }
    return { w, d };
  },
  key: (closed) => ({
    w: 30,
    d: `<circle cx="-12" cy="0" r="2.6"/><circle cx="12" cy="0" r="2.6"/>${closed
      ? '<line x1="-9.5" y1="0" x2="9.5" y2="0"/>'
      : '<line x1="-9.5" y1="-1" x2="9" y2="-10"/>'}`,
  }),
  meter: (letter) => ({ w: 28, d: '<circle r="13"/>', letter }),
  bulb: () => ({ w: 24, d: '<circle r="11"/><line x1="-7.8" y1="-7.8" x2="7.8" y2="7.8"/><line x1="-7.8" y1="7.8" x2="7.8" y2="-7.8"/>' }),
  led: () => ({
    w: 20,
    d: '<path d="M-9 -9 L9 0 L-9 9 Z"/><line x1="9" y1="-9" x2="9" y2="9"/>'
      + '<path d="M2 -12 l7 -7 M6 -19 h3 v3 M8 -9 l7 -7 M12 -16 h3 v3" stroke-width="1.3"/>',
  }),
  jumper: () => ({ w: 0, d: '' }),
};

/**
 * Draw a component between p1 and p2.
 * opts: { n, closed, label, value, live, dim, side (-1 | 1 label side), letter }
 */
export function comp(kind, p1, p2, opts = {}) {
  const [x1, y1] = p1, [x2, y2] = p2;
  const dx = x2 - x1, dy = y2 - y1;
  const L = Math.hypot(dx, dy);
  const ux = dx / L, uy = dy / L;
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const sym = kind === 'meter' ? SYMBOLS.meter(opts.letter)
    : kind === 'cell' ? SYMBOLS.cell(opts.n)
    : kind === 'key' ? SYMBOLS.key(opts.closed)
    : SYMBOLS[kind]();
  const half = sym.w / 2;
  const cls = `${opts.live ? 'live' : ''} ${opts.dim ? 'dim' : ''}`;
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  let out = `<g class="${opts.dim ? 'dim' : ''}">`;
  out += `<line class="${cls}" x1="${x1}" y1="${y1}" x2="${mx - ux * half}" y2="${my - uy * half}"/>`;
  out += `<line class="${cls}" x1="${mx + ux * half}" y1="${my + uy * half}" x2="${x2}" y2="${y2}"/>`;
  out += `<g transform="translate(${mx} ${my}) rotate(${ang})">${sym.d}</g>`;
  if (sym.letter) out += `<text x="${mx}" y="${my + 4.5}" text-anchor="middle" stroke="none" fill="currentColor" style="font:600 14px var(--serif)">${sym.letter}</text>`;
  // Labels sit beside the body, never rotated
  const side = opts.side ?? 1;
  const nx = -uy * side, ny = ux * side;
  const off = kind === 'cell' ? 20 : kind === 'meter' ? 27 : 22;
  const lx = mx + nx * off * (Math.abs(nx) > 0.5 ? 1.25 : 1), ly = my + ny * off + 4;
  const anchor = Math.abs(nx) > 0.5 ? (nx > 0 ? 'start' : 'end') : 'middle';
  if (opts.label) out += text(lx, ly - (opts.value ? 7 : 0), opts.label, '', anchor);
  if (opts.value) out += text(lx, ly + (opts.label ? 7 : 0), opts.value, 'val', anchor);
  out += '</g>';
  return out;
}

/** Inline SVG for the part card. */
export function symbolFor(kind, extra = {}) {
  const map = {
    resistor: ['resistor'], led: ['led'], bulb: ['bulb'], battery: ['cell', { n: 2 }], plugkey: ['key', { closed: false }],
    ammeter: ['meter', { letter: 'A' }], voltmeter: ['meter', { letter: 'V' }],
  };
  const m = map[kind];
  if (!m) return '';
  return svg(96, 44, comp(m[0], [8, 22], [88, 22], { ...(m[1] || {}), ...extra }));
}
