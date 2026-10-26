import * as THREE from 'three';
import { MAT, toonMat, Part, mesh, glowSprite } from './common.js';
import { makeDecal } from '../scene/label.js';
import { MOTION, damp } from '../motion.js';

const PITCH = 0.254; // 0.1 inch, the standard pin spacing

/* ───────────────────────── Microcontroller board ───────────────────────── */

export class Board extends Part {
  constructor(name) {
    super('board', name);
    this.pin13 = false;
    this.l = 0;
    const Y = 0.3; // PCB bottom (on little rubber feet)
    const T = 0.16;
    const top = Y + T;
    this.group.add(mesh(new THREE.BoxGeometry(6.86, T, 5.33), MAT.pcb, 0, Y + T / 2, 0));
    for (const [x, z] of [[-3, -2.2], [3, -2.2], [-3, 2.2], [3, 2.2]]) {
      this.group.add(mesh(new THREE.CylinderGeometry(0.18, 0.2, Y, 10), MAT.blackPlastic, x, Y / 2, z));
    }
    // Silkscreen: name, logo ring, pin labels (one canvas over the whole top)
    const silk = makeSilk();
    silk.position.y = top + 0.002;
    this.group.add(silk);

    // USB-B socket and DC barrel jack hang off the left edge
    this.group.add(mesh(new THREE.BoxGeometry(1.6, 1.1, 1.2), MAT.steel, -3.0, top + 0.55, -1.2));
    this.group.add(mesh(new THREE.BoxGeometry(1.4, 1.1, 0.9), MAT.blackPlastic, -3.1, top + 0.55, 1.65));
    // DIP-28 microcontroller with instanced pins
    this.group.add(mesh(new THREE.BoxGeometry(3.56, 0.34, 0.74), MAT.chip, 1.0, top + 0.35, 1.05));
    const pinGeo = new THREE.BoxGeometry(0.06, 0.3, 0.05);
    const pins = new THREE.InstancedMesh(pinGeo, MAT.steel, 28);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 28; i++) {
      const side = i < 14 ? -1 : 1;
      m.makeTranslation(1.0 - 1.651 + (i % 14) * PITCH, top + 0.2, 1.05 + side * 0.4);
      pins.setMatrixAt(i, m);
    }
    this.group.add(pins);
    const chipTag = makeDecal('ATmega328P', 2.4, 0.3, { color: '#b9b5ac', font: '500 30px ui-monospace, monospace' });
    chipTag.position.set(1.0, top + 0.525, 1.05);
    this.group.add(chipTag);
    // Crystal, reset button, voltage regulator
    const xtal = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.7, 16), MAT.steel, -0.4, top + 0.2, 0.2);
    xtal.rotation.z = Math.PI / 2;
    xtal.scale.set(1, 1, 0.5);
    this.group.add(xtal);
    this.group.add(mesh(new THREE.BoxGeometry(0.6, 0.25, 0.6), MAT.steel, -2.4, top + 0.12, -2.25));
    this.group.add(mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.12, 14), MAT.redPlastic, -2.4, top + 0.3, -2.25));
    this.group.add(mesh(new THREE.BoxGeometry(0.65, 0.25, 0.9), MAT.chip, -1.9, top + 0.12, 1.75));

    // Female headers: digital along the back edge, power + analog along the front
    this.pinPos = {};
    const hdrH = 0.85;
    const holeTop = top + hdrH;
    const header = (x0, n, z, names) => {
      const len = n * PITCH;
      this.group.add(mesh(new THREE.BoxGeometry(len, hdrH, PITCH), MAT.blackPlastic, x0 + len / 2 - PITCH / 2, top + hdrH / 2, z));
      const holes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.02, 0.1), new THREE.MeshBasicMaterial({ color: 0x050505 }), n);
      for (let i = 0; i < n; i++) {
        const x = x0 + i * PITCH;
        m.makeTranslation(x, holeTop + 0.002, z);
        holes.setMatrixAt(i, m);
        if (names[i]) this.pinPos[names[i]] = new THREE.Vector3(x, holeTop, z);
      }
      this.group.add(holes);
    };
    // Back edge, left to right: [AREF, GND, 13 … 8] gap [7 … 0]
    header(-0.9, 10, -2.45, ['SCL', 'SDA', 'AREF', 'GND', 'D13', 'D12', 'D11', 'D10', 'D9', 'D8']);
    header(-0.9 + 10 * PITCH + 0.16, 8, -2.45, ['D7', 'D6', 'D5', 'D4', 'D3', 'D2', 'D1', 'D0']);
    header(-1.3, 8, 2.45, ['', 'IOREF', 'RST', '3V3', '5V', 'GND2', 'GND3', 'VIN']);
    header(-1.3 + 8 * PITCH + 0.2, 6, 2.45, ['A0', 'A1', 'A2', 'A3', 'A4', 'A5']);
    this.terms = this.pinPos;

    // On-board LEDs: power (always on) and "L" (wired to pin 13)
    const smd = (x, z, color) => {
      const mat = toonMat({ color: 0xf5f0e0, emissive: color, emissiveIntensity: 0, toneMapped: false });
      this.group.add(mesh(new THREE.BoxGeometry(0.16, 0.08, 0.1), mat, x, top + 0.04, z));
      const glow = glowSprite(color);
      glow.position.set(x, top + 0.15, z);
      this.group.add(glow);
      return { mat, glow };
    };
    this.onLed = smd(2.7, 0.2, 0x3cff6a);
    this.lLed = smd(-0.2, -1.65, 0xffa21a);
    this.onLed.mat.emissiveIntensity = 2;
    this.onLed.glow.material.opacity = 0.8;
    this.onLed.glow.scale.setScalar(0.6);
    this.finish();
  }

  setPin13(high) { this.pin13 = high; }

  tick(dt) {
    this.l = damp(this.l, this.pin13 ? 1 : 0, MOTION.glow.rate * 2, dt);
    this.lLed.mat.emissiveIntensity = this.l * 3;
    this.lLed.glow.material.opacity = this.l * 0.9;
    this.lLed.glow.scale.setScalar(0.3 + this.l * 0.5);
  }

  facts() {
    return [
      ['Brain', 'ATmega328P microcontroller, 16 MHz'],
      ['Pin 13', this.pin13 ? 'HIGH — 5 V' : 'LOW — 0 V'],
      ['5V pin', 'Steady 5 V supply for small circuits'],
      ['Pin current limit', 'About 20 mA per pin (40 mA absolute max)'],
    ];
  }
}

function makeSilk() {
  const c = document.createElement('canvas');
  const s = 150; // px per cm
  c.width = Math.round(6.86 * s); c.height = Math.round(5.33 * s);
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(240,248,246,0.9)';
  g.fillStyle = 'rgba(240,248,246,0.92)';
  g.lineWidth = 4;
  g.beginPath(); g.arc(c.width * 0.62, c.height * 0.36, 70, 0, Math.PI * 2); g.stroke();
  g.font = '700 60px system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillText('∞', c.width * 0.62, c.height * 0.36 + 20);
  g.font = '700 56px system-ui, sans-serif';
  g.fillText('CIRCUIT LAB  UNO', c.width * 0.6, c.height * 0.56);
  g.font = '600 26px system-ui, sans-serif';
  const px = (x) => (x + 3.43) * s;
  // Labels under the headers (cm positions match the header layout above)
  const back = ['SCL', 'SDA', 'AREF', 'GND', '13', '12', '~11', '~10', '~9', '8'];
  back.forEach((t, i) => fillRot(g, t, px(-0.9 + i * PITCH), (5.33 / 2 - 2.2) * s, -Math.PI / 2, 'right'));
  ['7', '~6', '~5', '4', '~3', '2', 'TX1', 'RX0'].forEach((t, i) => fillRot(g, t, px(-0.9 + 10 * PITCH + 0.16 + i * PITCH), (5.33 / 2 - 2.2) * s, -Math.PI / 2, 'right'));
  ['', 'IOREF', 'RESET', '3.3V', '5V', 'GND', 'GND', 'Vin'].forEach((t, i) => fillRot(g, t, px(-1.3 + i * PITCH), (5.33 / 2 + 2.2) * s, -Math.PI / 2));
  ['A0', 'A1', 'A2', 'A3', 'A4', 'A5'].forEach((t, i) => fillRot(g, t, px(-1.3 + 8 * PITCH + 0.2 + i * PITCH), (5.33 / 2 + 2.2) * s, -Math.PI / 2));
  g.font = '700 28px system-ui, sans-serif';
  g.fillText('L', px(-0.2), (5.33 / 2 - 1.95) * s);
  g.fillText('ON', px(2.7), (5.33 / 2 + 0.5) * s);
  g.font = '600 30px system-ui, sans-serif';
  g.fillText('DIGITAL (PWM ~)', px(1.2), (5.33 / 2 - 1.55) * s);
  g.fillText('POWER', px(-0.6), (5.33 / 2 + 1.55) * s);
  g.fillText('ANALOG IN', px(1.6), (5.33 / 2 + 1.55) * s);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(6.86, 5.33), toonMat({ map: tex, transparent: true, roughness: 0.6 }));
  m.rotation.x = -Math.PI / 2;
  m.userData.noShadow = true;
  return m;
}

function fillRot(g, text, x, y, a, align = 'left') {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillText(text, 0, 0);
  g.restore();
}

/* ───────────────────────── Breadboard ───────────────────────── */

export const ROWS = 'abcdefghij';

export class Breadboard extends Part {
  constructor(name, { cols = 30 } = {}) {
    super('breadboard', name);
    this.cols = cols;
    this.H = 0.85;
    const W = cols * PITCH + 0.8;
    const D = 5.5;
    this.group.add(mesh(new THREE.BoxGeometry(W, this.H, D), MAT.ivory, 0, this.H / 2, 0));
    // Centre channel
    this.group.add(mesh(new THREE.BoxGeometry(W - 0.1, 0.02, 0.32), toonMat({ color: 0xcfc8b6 }), 0, this.H + 0.002, 0));

    // Printing: rail stripes, row letters, column numbers
    const print = breadboardPrint(W, D, cols, (c) => this.colX(c), (r) => this.rowZ(r));
    print.position.y = this.H + 0.003;
    this.group.add(print);

    // Instanced holes: 10 rows × cols, plus 4 power rails × 25
    const positions = [];
    for (let c = 1; c <= cols; c++) for (const r of ROWS) positions.push(this.local(c, r));
    for (const rail of ['T-', 'T+', 'B+', 'B-']) for (let i = 0; i < 25; i++) positions.push(this.localRail(rail, i));
    const holes = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.11, 0.03, 0.11),
      toonMat({ color: 0x2b2824, roughness: 0.9 }),
      positions.length,
    );
    const m = new THREE.Matrix4();
    positions.forEach((p, i) => { m.makeTranslation(p.x, this.H - 0.01, p.z); holes.setMatrixAt(i, m); });
    holes.receiveShadow = true;
    this.group.add(holes);
    this.finish();
  }

  colX(c) { return (c - (this.cols + 1) / 2) * PITCH; }
  rowZ(r) {
    const i = ROWS.indexOf(r);
    return i < 5 ? -(0.381 + (4 - i) * PITCH) : 0.381 + (i - 5) * PITCH;
  }
  local(c, r) { return new THREE.Vector3(this.colX(c), this.H, this.rowZ(r)); }
  railZ(rail) { return { 'T-': -2.3, 'T+': -2.046, 'B+': 2.046, 'B-': 2.3 }[rail]; }
  localRail(rail, i) {
    const x = (-(this.cols - 2) / 2 + i + Math.floor(i / 5)) * PITCH;
    return new THREE.Vector3(x, this.H, this.railZ(rail));
  }
  /** World position of hole (column 1..cols, row 'a'..'j') */
  hole(c, r) { this.group.updateWorldMatrix(true, false); return this.group.localToWorld(this.local(c, r)); }
  rail(rail, i) { this.group.updateWorldMatrix(true, false); return this.group.localToWorld(this.localRail(rail, i)); }
  /** Put a part's local origin onto a hole, keeping it on the board's top surface. */
  place(part, c, r, ry = 0) {
    const p = this.local(c, r);
    part.group.position.copy(this.group.position).add(p.applyEuler(this.group.rotation));
    part.group.rotation.y = this.group.rotation.y + ry;
    return part;
  }

  facts() {
    return [
      ['Inside', 'Metal clips join every 5 holes in a column (a–e, f–j)'],
      ['Power rails', 'The long red (+) and blue (−) rows run the full length'],
      ['Hole spacing', '2.54 mm (0.1 inch) — fits chip and LED legs'],
      ['Why use it', 'Build circuits without soldering'],
    ];
  }
}

function breadboardPrint(W, D, cols, colX, rowZ) {
  const s = 120;
  const c = document.createElement('canvas');
  c.width = Math.round(W * s); c.height = Math.round(D * s);
  const g = c.getContext('2d');
  const X = (x) => (x + W / 2) * s;
  const Z = (z) => (z + D / 2) * s;
  g.lineWidth = 4;
  for (const [z, col] of [[-2.55, '#2f62b5'], [-1.79, '#c8372d'], [1.79, '#c8372d'], [2.55, '#2f62b5']]) {
    g.strokeStyle = col;
    g.beginPath(); g.moveTo(X(-W / 2 + 0.4), Z(z)); g.lineTo(X(W / 2 - 0.4), Z(z)); g.stroke();
  }
  g.font = '600 20px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#8a8272';
  for (const r of ROWS) {
    g.fillText(r, X(colX(1) - 0.24), Z(rowZ(r)));
    g.fillText(r, X(colX(cols) + 0.24), Z(rowZ(r)));
  }
  for (let col = 1; col <= cols; col++) {
    if (col === 1 || col % 5 === 0) {
      g.fillText(String(col), X(colX(col)), Z(rowZ('a') - 0.22));
      g.fillText(String(col), X(colX(col)), Z(rowZ('j') + 0.22));
    }
  }
  g.fillStyle = '#c8372d'; g.font = '700 26px system-ui, sans-serif';
  g.fillText('+', X(-W / 2 + 0.22), Z(-1.79)); g.fillText('+', X(-W / 2 + 0.22), Z(1.79));
  g.fillStyle = '#2f62b5';
  g.fillText('−', X(-W / 2 + 0.22), Z(-2.55)); g.fillText('−', X(-W / 2 + 0.22), Z(2.55));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(W, D), toonMat({ map: tex, transparent: true, roughness: 0.6 }));
  m.rotation.x = -Math.PI / 2;
  m.userData.noShadow = true;
  return m;
}
