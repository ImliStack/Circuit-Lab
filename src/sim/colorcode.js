// Four-band resistor colour code: digit, digit, multiplier, tolerance.

export const BANDS = [
  { name: 'black', hex: '#1a1a1a' },
  { name: 'brown', hex: '#7a4a24' },
  { name: 'red', hex: '#c62f25' },
  { name: 'orange', hex: '#e8781e' },
  { name: 'yellow', hex: '#f1c92b' },
  { name: 'green', hex: '#3d8f45' },
  { name: 'blue', hex: '#2f5fbf' },
  { name: 'violet', hex: '#7b47b5' },
  { name: 'grey', hex: '#8a8a8a' },
  { name: 'white', hex: '#f4f4f0' },
];
export const GOLD = { name: 'gold', hex: '#c9a04a' };

/** 220 → [red, red, brown, gold] */
export function colorBands(ohms) {
  let exp = 0;
  let v = ohms;
  while (v >= 100) { v /= 10; exp++; }
  while (v < 10 && exp > -2) { v *= 10; exp--; }
  const digits = Math.round(v);
  const d1 = Math.floor(digits / 10);
  const d2 = digits % 10;
  const mult = exp < 0 ? GOLD : BANDS[exp];
  return [BANDS[d1], BANDS[d2], mult, GOLD];
}

export function describeBands(ohms) {
  const [a, b, m] = colorBands(ohms);
  const exp = BANDS.indexOf(m);
  return `${a.name} (${BANDS.indexOf(a)}) · ${b.name} (${BANDS.indexOf(b)}) · ${m.name} (×${exp < 0 ? '0.1' : 10 ** exp}) · gold (±5%)`;
}
