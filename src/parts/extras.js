import * as THREE from 'three';
import { MAT, toonMat, Part, mesh, leadBetween, leadPath, glowSprite, fmt } from './common.js';
import { LED } from './passive.js';
import { MOTION, damp, spring } from '../motion.js';

// Parts used by later lessons. They sit in a tray at the back of the bench
// from the start, so learners can click them and read what they do.

export class PushButton extends Part {
  constructor(name) {
    super('button', name);
    this.pressed = false;
    this.group.add(mesh(new THREE.BoxGeometry(0.6, 0.35, 0.6), MAT.blackPlastic, 0, 0.18 + 0.25, 0));
    this.group.add(mesh(new THREE.BoxGeometry(0.6, 0.04, 0.6), MAT.steel, 0, 0.62, 0));
    this.cap = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.22, 20), toonMat({ color: 0xc8372d, roughness: 0.5 }), 0, 0.74, 0);
    this.group.add(this.cap);
    for (const [x, z] of [[-0.3, -0.25], [0.3, -0.25], [-0.3, 0.25], [0.3, 0.25]]) {
      this.group.add(leadPath([[x * 0.9, 0.3, z], [x * 1.1, 0.2, z], [x, -0.2, z]], 0.025));
    }
    this.terms = { a: new THREE.Vector3(-0.3, 0, 0.25), b: new THREE.Vector3(0.3, 0, 0.25) };
    this.capState = { x: 0, v: 0 };
    this.closed = false; // what the circuit sees (latching mode can differ from `pressed`)
    this.voltage = 0;
    this.current = 0;
    this.finish();
  }
  setPressed(v) { this.pressed = v; }
  tick(dt) {
    const d = spring(this.capState, this.pressed ? 1 : 0, MOTION.plug, dt);
    this.cap.position.y = 0.74 - 0.11 * d;
  }
  facts() {
    return [
      ['Type', 'Momentary push button'],
      ['Right now', this.closed ? 'Closed — current can flow' : 'Open — a gap in the circuit'],
      ['Voltage across it', fmt.volts(this.voltage)],
      ['Current through it', fmt.amps(this.current)],
      ['Legs', '4 legs, joined in pairs inside'],
    ];
  }
}

export class Potentiometer extends Part {
  constructor(name) {
    super('pot', name);
    this.position = 0.5;
    this.group.add(mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.5, 32), MAT.steel, 0, 0.6, 0));
    this.group.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.4, 16), MAT.brass, 0, 1.05, 0));
    this.knob = new THREE.Group();
    this.knob.position.y = 1.3;
    this.knob.add(mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.55, 24), MAT.blackPlastic));
    this.knob.add(mesh(new THREE.BoxGeometry(0.06, 0.02, 0.4), MAT.creamPlastic, 0, 0.285, 0.18));
    this.group.add(this.knob);
    [-0.4, 0, 0.4].forEach((x) => {
      this.group.add(leadPath([[x, 0.5, 0.75], [x, 0.4, 0.95], [x, -0.2, 0.95]], 0.04, MAT.lead));
    });
    this.terms = { a: new THREE.Vector3(-0.4, 0, 0.95), w: new THREE.Vector3(0, 0, 0.95), b: new THREE.Vector3(0.4, 0, 0.95) };
    this.total = 10000;
    this.shown = this.position;
    this.current = 0;
    this.finish();
  }
  /** 0 = fully anticlockwise, 1 = fully clockwise (270° of travel). */
  setPosition(p) { this.position = Math.max(0, Math.min(1, p)); }
  /** Resistance between end `a` and the wiper. */
  get ohms() { return this.total * this.position; }
  tick(dt) {
    this.shown = damp(this.shown, this.position, 9, dt);
    this.knob.rotation.y = (0.75 - this.shown * 1.5) * Math.PI;
  }
  facts() {
    return [
      ['Type', `Potentiometer, ${fmt.ohms(this.total)} track`],
      ['Knob', `${Math.round(this.position * 100)}% (of 270°)`],
      ['Resistance in use', fmt.ohms(Math.round(this.ohms))],
      ['Current', fmt.amps(this.current)],
      ['Legs', 'Two ends + a middle wiper'],
    ];
  }
}

export class LDR extends Part {
  constructor(name) {
    super('ldr', name);
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#e8e0cc';
    g.beginPath(); g.arc(64, 64, 64, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#c4572a';
    g.lineWidth = 7;
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const y = 22 + i * 12;
      g.moveTo(i % 2 ? 26 : 34, y); g.lineTo(i % 2 ? 94 : 102, y);
      g.lineTo(i % 2 ? 94 : 102, y + 12);
    }
    g.stroke();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const faceMat = toonMat({ map: tex, roughness: 0.3 });
    const head = mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.12, 24), [MAT.ivory, faceMat, MAT.ivory], 0, 0.9, 0);
    head.rotation.x = Math.PI / 2;
    this.group.add(head);
    this.group.add(leadBetween(new THREE.Vector3(-0.1, 0.7, 0), new THREE.Vector3(-0.127, -0.2, 0), 0.022));
    this.group.add(leadBetween(new THREE.Vector3(0.1, 0.7, 0), new THREE.Vector3(0.127, -0.2, 0), 0.022));
    this.terms = { a: new THREE.Vector3(-0.127, 0, 0), b: new THREE.Vector3(0.127, 0, 0) };
    this.light = 0.5;
    this.current = 0;
    this.finish();
  }
  /** Light level 0 (dark) … 1 (bright). */
  setLight(k) { this.light = Math.max(0, Math.min(1, k)); }
  /** Resistance falls about a thousand times from dark to bright: 1 MΩ → 1 kΩ. */
  get ohms() { return 10 ** (6 - 3 * this.light); }
  facts() {
    return [
      ['Type', 'Light-dependent resistor (LDR)'],
      ['Light on it', `${Math.round(this.light * 100)}%`],
      ['Resistance now', fmt.ohms(Math.round(this.ohms))],
      ['Range', 'About 1 MΩ in the dark, 1 kΩ in bright light'],
      ['Made of', 'Cadmium sulphide — light frees more charge carriers'],
    ];
  }
}

export class Buzzer extends Part {
  constructor(name) {
    super('buzzer', name);
    this.group.add(mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.5, 32), MAT.blackPlastic, 0, 0.55, 0));
    this.group.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 12), new THREE.MeshBasicMaterial({ color: 0x050505 }), 0, 0.81, 0));
    this.group.add(leadBetween(new THREE.Vector3(-0.32, 0.3, 0), new THREE.Vector3(-0.38, -0.2, 0), 0.025));
    this.group.add(leadBetween(new THREE.Vector3(0.32, 0.3, 0), new THREE.Vector3(0.38, -0.2, 0), 0.025));
    this.terms = { plus: new THREE.Vector3(0.38, 0, 0), minus: new THREE.Vector3(-0.38, 0, 0) };
    this.finish();
  }
  facts() {
    return [['Type', 'Piezo buzzer'], ['How it sounds', 'A crystal disc bends back and forth with the voltage'], ['Pitch', 'Set by how fast the signal switches (frequency, Hz)']];
  }
}

/** Desk lamp that shines on the bench; its brightness is the room light in the sensor lesson. */
export class DeskLamp extends Part {
  constructor(name) {
    super('lamp', name);
    this.level = 0.7;
    this.shown = this.level;
    this.group.add(mesh(new THREE.CylinderGeometry(1.6, 1.8, 0.4, 28), MAT.bakelite, 0, 0.2, 0));
    const arm = (a, b) => this.group.add(leadBetween(new THREE.Vector3(...a), new THREE.Vector3(...b), 0.16, MAT.steel));
    arm([0, 0.4, 0], [1.2, 6.5, 0]);
    arm([1.2, 6.5, 0], [4.6, 8.2, 0]);
    this.group.add(mesh(new THREE.SphereGeometry(0.32, 12, 8), MAT.steel, 1.2, 6.5, 0));
    const shade = new THREE.Group();
    shade.position.set(4.6, 8.2, 0);
    shade.rotation.z = -0.9;
    shade.add(mesh(new THREE.CylinderGeometry(0.7, 2.0, 2.4, 28, 1, true), toonMat({ color: 0x3f7f8e, side: THREE.DoubleSide }), 0, -1.0, 0));
    this.bulbMat = toonMat({ color: 0xfff4d6, emissive: 0xffe2a0, emissiveIntensity: 1 });
    shade.add(mesh(new THREE.SphereGeometry(0.62, 18, 12), this.bulbMat, 0, -1.6, 0));
    this.glow = glowSprite(0xffd98a);
    this.glow.position.set(0, -2.2, 0);
    shade.add(this.glow);
    this.group.add(shade);
    this.light = new THREE.SpotLight(0xffe7b8, 0, 40, 0.75, 0.6, 1.2);
    this.light.position.set(5.6, 7, 0);
    this.light.target.position.set(9, 0, 0);
    this.group.add(this.light, this.light.target);
    this.finish();
  }
  setLevel(k) { this.level = Math.max(0, Math.min(1, k)); }
  tick(dt) {
    this.shown = damp(this.shown, this.level, MOTION.glow.rate, dt);
    const k = this.shown;
    this.bulbMat.emissiveIntensity = 0.05 + k * 1.4;
    this.glow.material.opacity = k * 0.9;
    this.glow.scale.setScalar(2 + k * 6);
    this.light.intensity = k * 160;
  }
  facts() {
    return [['Brightness', `${Math.round(this.level * 100)}%`], ['Job here', 'Stands in for daylight falling on the sensor']];
  }
}

/** Wooden tray holding the spare parts. */
export function makeTray() {
  const g = new THREE.Group();
  const wood = MAT.wood;
  g.add(mesh(new THREE.BoxGeometry(14, 0.3, 4.2), wood, 0, 0.15, 0));
  for (const z of [-2, 2]) g.add(mesh(new THREE.BoxGeometry(14, 0.9, 0.2), wood, 0, 0.45, z));
  for (const x of [-6.9, 6.9]) g.add(mesh(new THREE.BoxGeometry(0.2, 0.9, 4.2), wood, x, 0.45, 0));
  for (const x of [-3.5, 0, 3.5]) g.add(mesh(new THREE.BoxGeometry(0.12, 0.6, 4), wood, x, 0.3, 0));
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const parts = [
    new PushButton('Push button').at(-5.2, 0.5, 0),
    new Potentiometer('Potentiometer').at(-1.75, 0.3, -0.3),
    new LDR('LDR (light sensor)').at(1.75, 0.5, 0),
    new Buzzer('Buzzer').at(5.2, 0.5, 0),
  ];
  // Spare LEDs lying in the last bay are decoration; one stands for clicking
  const spare = new LED('Spare LED', { color: 'green' }).at(4, 0.45, 1.2);
  parts.push(spare);
  parts.forEach((p) => g.add(p.group));
  return { group: g, parts };
}
