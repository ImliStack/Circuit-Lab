import * as THREE from 'three';
import { MAT, toonMat, fx, Part, mesh, bindingPost, leadPath, leadBetween, glowSprite, baseBoard, fmt } from './common.js';
import { makeDecal } from '../scene/label.js';
import { colorBands, describeBands } from '../sim/colorcode.js';
import { MOTION, damp, spring } from '../motion.js';

/* ───────────────────────── Resistor ───────────────────────── */

// Dog-bone body profile, unit length along y (rotated to lie along x)
const RES_PROFILE = [
  [0, -0.5], [0.1, -0.5], [0.135, -0.46], [0.142, -0.37], [0.122, -0.27],
  [0.118, 0.27], [0.142, 0.37], [0.135, 0.46], [0.1, 0.5], [0, 0.5],
].map(([x, y]) => new THREE.Vector2(x, y));

export class Resistor extends Part {
  /** mount: 'board' (lab board with binding posts) or 'breadboard' (leads into holes `span` apart) */
  constructor(name, { ohms = 220, mount = 'board', span = 1.016 } = {}) {
    super('resistor', name);
    this.ohms = ohms;
    this.current = 0;
    this.voltage = 0;
    const L = mount === 'board' ? 2.2 : 0.64;
    const h = mount === 'board' ? 2.0 : 0.3;
    const body = new THREE.Group();
    const bodyMat = toonMat({ color: 0xd9c29a, roughness: 0.5 });
    const shell = new THREE.Mesh(new THREE.LatheGeometry(RES_PROFILE, 28), bodyMat);
    body.add(shell);
    this.bandMats = [0, 1, 2, 3].map(() => toonMat({ roughness: 0.45 }));
    // Band positions along the unit body (first band sits on the end bulge)
    [[-0.37, 0.146], [-0.2, 0.124], [-0.06, 0.124], [0.37, 0.146]].forEach(([y, r], i) => {
      body.add(mesh(new THREE.CylinderGeometry(r, r, 0.075, 28, 1, true), this.bandMats[i], 0, y, 0));
    });
    body.scale.setScalar(L);
    body.rotation.z = -Math.PI / 2;
    body.position.y = h;
    this.group.add(body);

    if (mount === 'board') {
      this.group.add(baseBoard(5.6, 3.0));
      const posts = [-2.1, 2.1].map((x) => {
        const p = bindingPost('black');
        p.group.position.set(x, 0.5, 0.7);
        this.group.add(p.group);
        return new THREE.Vector3(x, 0.5, 0.7).add(p.top);
      });
      // Leads from body ends down to the post shanks
      this.group.add(leadPath([[-L / 2, h, 0], [-L / 2 - 0.4, h, 0.1], [-2.1, 1.55, 0.6], [-2.1, 1.2, 0.7]], 0.05));
      this.group.add(leadPath([[L / 2, h, 0], [L / 2 + 0.4, h, 0.1], [2.1, 1.55, 0.6], [2.1, 1.2, 0.7]], 0.05));
      this.terms = { a: posts[0], b: posts[1] };
      this.plate = makeDecal(fmt.ohms(ohms), 2.2, 0.55, { color: '#3a2a1a', font: '700 40px system-ui, sans-serif' });
      this.plate.position.set(0, 0.51, -1.05);
      this.group.add(this.plate);
    } else {
      const s = span / 2;
      for (const sx of [-1, 1]) {
        this.group.add(leadPath([[sx * L / 2, h, 0], [sx * (s - 0.06), h, 0], [sx * s, h - 0.08, 0], [sx * s, -0.25, 0]], 0.022));
      }
      this.terms = { a: new THREE.Vector3(-s, 0, 0), b: new THREE.Vector3(s, 0, 0) };
    }
    this.setOhms(ohms);
    this.finish();
  }

  setOhms(ohms) {
    this.ohms = ohms;
    colorBands(ohms).forEach((b, i) => this.bandMats[i].color.set(b.hex));
    if (this.plate) {
      const fresh = makeDecal(fmt.ohms(ohms), 2.2, 0.55, { color: '#3a2a1a', font: '700 40px system-ui, sans-serif' });
      this.plate.material.map.dispose();
      this.plate.material.map = fresh.material.map;
      this.plate.material.needsUpdate = true;
    }
  }

  facts() {
    return [
      ['Resistance', fmt.ohms(this.ohms)],
      ['Colour bands', describeBands(this.ohms)],
      ['Current through it', fmt.amps(this.current)],
      ['Voltage across it', fmt.volts(this.voltage)],
      ['Power turned to heat', fmt.watts(this.current * this.current * this.ohms)],
    ];
  }
}

/* ───────────────────────── LED ───────────────────────── */

export const LED_COLORS = {
  red: { hex: 0xff2a1a, vf: 2.0, label: 'Red' },
  green: { hex: 0x2aff5a, vf: 2.2, label: 'Green' },
  blue: { hex: 0x3a7aff, vf: 3.0, label: 'Blue' },
};

let smokeTex = null;
function getSmokeTex() {
  if (smokeTex) return smokeTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(90,86,80,0.8)');
  grad.addColorStop(1, 'rgba(90,86,80,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  smokeTex = new THREE.CanvasTexture(c);
  return smokeTex;
}

export class LED extends Part {
  constructor(name, { color = 'red' } = {}) {
    super('led', name);
    this.current = 0;
    this.voltage = 0;
    this.burnt = false;
    this.level = 0; // displayed brightness 0..1 (damped)
    this.target = 0;
    this.smoke = [];
    const y0 = 0.85; // body base height above the board

    this.bodyMat = toonMat({
      roughness: 0.12, transmission: 0, transparent: true, opacity: 0.82, clearcoat: 1, clearcoatRoughness: 0.1,
    });
    this.group.add(mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.1, 24), this.bodyMat, 0, y0 + 0.05, 0));
    this.group.add(mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.48, 24), this.bodyMat, 0, y0 + 0.34, 0));
    const dome = mesh(new THREE.SphereGeometry(0.25, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), this.bodyMat, 0, y0 + 0.58, 0);
    this.group.add(dome);
    // Die + anvil inside
    this.dieMat = toonMat({ color: 0x333333, emissive: 0x000000 });
    this.group.add(mesh(new THREE.BoxGeometry(0.08, 0.05, 0.08), this.dieMat, 0.04, y0 + 0.36, 0));
    // Legs: anode (+) longer and slightly bent, cathode (−) straight, next to the flat side
    this.group.add(leadPath([[0.07, y0 + 0.3, 0], [0.07, y0 - 0.1, 0], [0.127, y0 - 0.35, 0], [0.127, -0.25, 0]], 0.022));
    this.group.add(leadBetween(new THREE.Vector3(-0.08, y0 + 0.3, 0), new THREE.Vector3(-0.127, -0.25, 0), 0.022));
    this.terms = { anode: new THREE.Vector3(0.127, 0, 0), cathode: new THREE.Vector3(-0.127, 0, 0) };

    this.glow = glowSprite(0xffffff);
    this.glow.position.y = y0 + 0.4;
    this.group.add(this.glow);
    this.light = new THREE.PointLight(0xffffff, 0, 7, 2);
    this.light.position.y = y0 + 0.5;
    this.group.add(this.light);
    this.setColor(color);
    this.finish();
  }

  setColor(color) {
    this.color = color;
    const c = LED_COLORS[color];
    this.vf = c.vf;
    if (!this.burnt) {
      this.bodyMat.color.set(c.hex).lerp(new THREE.Color(0xffffff), 0.15);
      this.bodyMat.emissive.set(c.hex);
    }
    this.glow.material.color.set(c.hex);
    this.light.color.set(c.hex);
  }

  /** brightness: 0..1 (1 at rated 20 mA). */
  setBrightness(b) { this.target = this.burnt ? 0 : Math.max(0, Math.min(1.4, b)); }

  burnOut() {
    if (this.burnt) return;
    this.burnt = true;
    this.target = 0;
    this.level = 0;
    this.bodyMat.color.set(0x4a3a30);
    this.bodyMat.emissive.set(0x000000);
    this.bodyMat.opacity = 0.95;
    this.dieMat.color.set(0x111111);
    for (let i = 0; i < 14; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: getSmokeTex(), transparent: true, depthWrite: false, opacity: 0 }));
      s.userData.noPick = true;
      fx(s);
      s.userData.t = -i * 0.12;
      s.userData.dx = (Math.random() - 0.5) * 0.6;
      this.group.add(s);
      this.smoke.push(s);
    }
  }

  replace() {
    this.burnt = false;
    this.bodyMat.opacity = 0.82;
    this.dieMat.color.set(0x333333);
    this.smoke.forEach((s) => this.group.remove(s));
    this.smoke = [];
    this.setColor(this.color);
  }

  tick(dt) {
    this.level = damp(this.level, this.target, MOTION.glow.rate * 1.6, dt);
    const k = this.level;
    this.bodyMat.emissiveIntensity = this.burnt ? 0 : 0.15 + k * 2.6;
    if (!this.burnt && k < 0.01) this.bodyMat.emissiveIntensity = 0.08;
    this.dieMat.emissive.copy(this.bodyMat.emissive).multiplyScalar(k * 3);
    this.glow.material.opacity = Math.min(1, k * 0.9);
    this.glow.scale.setScalar(0.6 + k * 2.2);
    this.light.intensity = k * 0.9;
    const life = MOTION.smoke.life;
    for (const s of this.smoke) {
      s.userData.t += dt;
      const t = s.userData.t;
      if (t < 0) continue;
      const u = (t % life) / life;
      s.position.set(s.userData.dx * u, 1.4 + u * 3, 0);
      s.scale.setScalar(0.3 + u * 1.4);
      // Puffs fade out over the first two cycles, then stop
      const cycles = Math.floor(t / life);
      s.material.opacity = cycles >= 2 ? 0 : (1 - u) * 0.55 * (cycles ? 0.5 : 1);
    }
  }

  facts() {
    return [
      ['Colour', LED_COLORS[this.color].label],
      ['Forward voltage (Vf)', `${this.vf.toFixed(1)} V`],
      ['Current', fmt.amps(this.current)],
      ['Safe current', 'about 20 mA (max 30 mA)'],
      ['State', this.burnt ? 'Burnt out — replace it' : this.current > 1e-4 ? 'Glowing' : 'Off'],
    ];
  }
}

/* ───────────────────────── Bulb on holder ───────────────────────── */

export class Bulb extends Part {
  constructor(name, { ratedV = 6, ratedW = 3 } = {}) {
    super('bulb', name);
    this.ratedV = ratedV;
    this.ratedW = ratedW;
    this.ohms = (ratedV * ratedV) / ratedW; // hot filament resistance
    this.current = 0;
    this.voltage = 0;
    this.level = 0;
    this.target = 0;
    this.inserted = true;
    this.lift = 0;

    this.group.add(baseBoard(4.6, 3.4));
    this.group.add(mesh(new THREE.CylinderGeometry(0.75, 0.85, 1.0, 24), MAT.bakelite, 0, 1.0, -0.3));

    // The bulb itself (moves when unscrewed)
    this.bulb = new THREE.Group();
    this.bulb.position.set(0, 1.5, -0.3);
    const screwPts = [];
    for (let i = 0; i <= 16; i++) {
      const y = (i / 16) * 0.75;
      screwPts.push(new THREE.Vector2(0.42 + 0.04 * Math.sin(i * Math.PI * 0.5), y));
    }
    screwPts.unshift(new THREE.Vector2(0.18, -0.05), new THREE.Vector2(0.38, 0));
    this.bulb.add(new THREE.Mesh(new THREE.LatheGeometry(screwPts, 24), MAT.steel));
    // Glass envelope: neck then sphere
    const glassPts = [];
    glassPts.push(new THREE.Vector2(0.44, 0.75), new THREE.Vector2(0.48, 0.95));
    for (let i = 0; i <= 20; i++) {
      const a = -Math.PI * 0.42 + (i / 20) * Math.PI * 0.92;
      glassPts.push(new THREE.Vector2(Math.max(0.001, Math.cos(a) * 0.95), 1.75 + Math.sin(a) * 0.95));
    }
    this.glassMat = toonMat({
      color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.28, emissive: 0xffc070, emissiveIntensity: 0,
      clearcoat: 1, depthWrite: false, side: THREE.DoubleSide,
    });
    const glass = new THREE.Mesh(new THREE.LatheGeometry(glassPts, 32), this.glassMat);
    glass.userData.noShadow = true;
    glass.renderOrder = 2;
    this.bulb.add(glass);
    // Support wires + coiled filament
    this.bulb.add(leadBetween(new THREE.Vector3(-0.12, 0.8, 0), new THREE.Vector3(-0.32, 1.75, 0), 0.018));
    this.bulb.add(leadBetween(new THREE.Vector3(0.12, 0.8, 0), new THREE.Vector3(0.32, 1.75, 0), 0.018));
    const coil = [];
    for (let i = 0; i <= 120; i++) {
      const t = i / 120;
      const a = t * Math.PI * 2 * 9;
      coil.push(new THREE.Vector3(-0.32 + t * 0.64, 1.78 + Math.sin(a) * 0.045, Math.cos(a) * 0.045));
    }
    this.filMat = toonMat({ color: 0x555049, emissive: 0xff7a1a, emissiveIntensity: 0, toneMapped: false });
    this.bulb.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coil), 240, 0.014, 5), this.filMat));
    this.glow = glowSprite(0xffd28a);
    this.glow.position.y = 1.75;
    this.bulb.add(this.glow);
    this.light = new THREE.PointLight(0xffc77a, 0, 18, 2);
    this.light.position.y = 1.8;
    this.bulb.add(this.light);
    this.group.add(this.bulb);

    const posts = [-1.55, 1.55].map((x) => {
      const p = bindingPost('black');
      p.group.position.set(x, 0.5, 1.0);
      this.group.add(p.group);
      return new THREE.Vector3(x, 0.5, 1.0).add(p.top);
    });
    this.group.add(leadPath([[-1.55, 0.6, 1.0], [-0.9, 0.55, 0.4], [-0.5, 0.7, -0.3]], 0.035, MAT.copper));
    this.group.add(leadPath([[1.55, 0.6, 1.0], [0.9, 0.55, 0.4], [0.5, 0.7, -0.3]], 0.035, MAT.copper));
    this.terms = { a: posts[0], b: posts[1] };
    this.finish();
  }

  /** Brightness from electrical power, relative to the rating. */
  setPower(p) { this.target = this.inserted ? Math.max(0, Math.min(1.3, p / this.ratedW)) : 0; }

  setInserted(v) { this.inserted = v; if (!v) this.target = 0; }

  tick(dt) {
    this.level = damp(this.level, this.target, MOTION.glow.rate, dt);
    this.lift = damp(this.lift, this.inserted ? 0 : 1, 6, dt);
    this.bulb.position.y = 1.5 + this.lift * 1.6;
    this.bulb.rotation.z = this.lift * 0.35;
    this.bulb.rotation.y = this.lift * 2.4;
    const k = this.level;
    // Colour temperature: dull orange when dim, yellow-white at full power
    this.filMat.emissive.setRGB(1, 0.35 + 0.55 * Math.min(1, k), 0.08 + 0.5 * Math.min(1, k) ** 2);
    this.filMat.emissiveIntensity = k < 0.02 ? 0 : 0.6 + k * 5;
    this.glassMat.emissiveIntensity = k * 0.9;
    this.glow.material.opacity = Math.min(1, k * 1.1);
    this.glow.scale.setScalar(1 + k * 5.5);
    this.light.intensity = k * 14;
  }

  facts() {
    return [
      ['Rating', `${this.ratedV} V, ${this.ratedW} W`],
      ['Filament resistance', `${this.ohms.toFixed(0)} Ω (R = V²/P)`],
      ['Current', fmt.amps(this.current)],
      ['Voltage across it', fmt.volts(this.voltage)],
      ['Power', `${fmt.watts(this.current * this.current * this.ohms)} (${Math.round(this.level * 100)}% bright)`],
      ['In holder', this.inserted ? 'Yes' : 'No — unscrewed'],
    ];
  }
}

/* ───────────────────────── Cell pack ───────────────────────── */

export class CellPack extends Part {
  constructor(name, { slots = 4, cells = 2 } = {}) {
    super('battery', name);
    this.slots = slots;
    this.current = 0;
    const pitch = 1.6;
    const depth = slots * pitch + 0.5;
    this.group.add(mesh(new THREE.BoxGeometry(6.4, 0.5, depth), MAT.blackPlastic, 0, 0.25, 0));
    // Low walls
    this.group.add(mesh(new THREE.BoxGeometry(0.3, 1.2, depth), MAT.blackPlastic, -3.05, 0.6, 0));
    this.group.add(mesh(new THREE.BoxGeometry(0.3, 1.2, depth), MAT.blackPlastic, 3.05, 0.6, 0));
    const wrap = toonMat({ color: 0x2f7f8e });
    const band = toonMat({ color: 0xd9b24a, roughness: 0.3, metalness: 0.6 });
    this.cells = [];
    this.links = [];
    for (let i = 0; i < slots; i++) {
      const z = -depth / 2 + 0.25 + pitch * (i + 0.5);
      const cell = new THREE.Group();
      const body = mesh(new THREE.CylinderGeometry(0.72, 0.72, 5.0, 28), wrap);
      body.rotation.z = Math.PI / 2;
      cell.add(body);
      const b = mesh(new THREE.CylinderGeometry(0.73, 0.73, 1.0, 28, 1, true), band, 1.6, 0, 0);
      b.rotation.z = Math.PI / 2;
      cell.add(b);
      // Alternate orientation, as in a real series holder
      const nub = mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.18, 16), MAT.steel, 2.58, 0, 0);
      nub.rotation.z = Math.PI / 2;
      cell.add(nub);
      const tag = makeDecal('1.5 V', 1.6, 0.6, { color: '#f4ecd8', font: '700 52px system-ui, sans-serif' });
      tag.position.set(-0.6, 0.73, 0);
      cell.add(tag);
      cell.position.set(0, 1.25, z);
      if (i % 2) cell.rotation.y = Math.PI;
      this.group.add(cell);
      this.cells.push(cell);
      // Dummy link shown in an empty slot so the series chain stays closed
      const link = mesh(new THREE.BoxGeometry(5.4, 0.08, 0.5), MAT.copper, 0, 0.55, z);
      this.group.add(link);
      this.links.push(link);
    }
    const plus = bindingPost('red');
    const minus = bindingPost('black');
    plus.group.position.set(3.9, 0, -depth / 4);
    minus.group.position.set(3.9, 0, depth / 4);
    this.group.add(mesh(new THREE.BoxGeometry(1.6, 0.5, depth), MAT.blackPlastic, 3.9, 0.25, 0));
    plus.group.position.y = 0.5;
    minus.group.position.y = 0.5;
    this.group.add(plus.group, minus.group);
    this.terms = {
      plus: plus.group.position.clone().add(plus.top),
      minus: minus.group.position.clone().add(minus.top),
    };
    const lbl = makeDecal('+', 0.6, 0.6, { color: '#e05a4a' });
    lbl.position.set(3.4, 0.51, -depth / 4);
    this.group.add(lbl);
    const lbl2 = makeDecal('−', 0.6, 0.6, { color: '#f4ecd8' });
    lbl2.position.set(3.4, 0.51, depth / 4);
    this.group.add(lbl2);
    this.setCells(cells);
    this.finish();
  }

  setCells(n) {
    this.count = n;
    this.cells.forEach((c, i) => { c.visible = i < n; });
    this.links.forEach((l, i) => { l.visible = i >= n; });
  }

  get volts() { return this.count * 1.5; }

  facts() {
    return [
      ['Cells in series', `${this.count} × 1.5 V`],
      ['Total voltage (EMF)', `${this.volts.toFixed(1)} V`],
      ['Current supplied', fmt.amps(this.current)],
      ['Power supplied', fmt.watts(this.current * this.volts)],
    ];
  }
}

/* ───────────────────────── Plug key (switch) ───────────────────────── */

export class PlugKey extends Part {
  constructor(name) {
    super('plugkey', name);
    this.closed = false;
    this.liftState = { x: 1, v: 0 };
    this.group.add(baseBoard(4.4, 2.8, 0.45));
    for (const x of [-0.85, 0.85]) {
      this.group.add(mesh(new THREE.BoxGeometry(1.3, 0.8, 1.5), MAT.brass, x, 0.85, 0));
    }
    this.plug = new THREE.Group();
    const pin = mesh(new THREE.CylinderGeometry(0.2, 0.12, 0.9, 16), MAT.brass, 0, 0.45, 0);
    this.plug.add(pin);
    this.plug.add(mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.2, 16), MAT.brass, 0, 0.95, 0));
    this.plug.add(mesh(new THREE.CylinderGeometry(0.38, 0.3, 0.9, 16), MAT.bakelite, 0, 1.5, 0));
    this.plug.add(mesh(new THREE.SphereGeometry(0.38, 16, 10), MAT.bakelite, 0, 1.95, 0));
    this.group.add(this.plug);
    const posts = [-1.75, 1.75].map((x) => {
      const p = bindingPost('black');
      p.group.position.set(x, 0.45, 0.6);
      this.group.add(p.group);
      return new THREE.Vector3(x, 0.45, 0.6).add(p.top);
    });
    this.terms = { a: posts[0], b: posts[1] };
    this.finish();
  }

  setClosed(v) { this.closed = v; }

  tick(dt) {
    const lift = Math.max(-0.04, spring(this.liftState, this.closed ? 0 : 1, MOTION.plug, dt));
    this.plug.position.set(lift * 0.2, 0.75 + lift * 1.3, -lift * 0.6);
    this.plug.rotation.x = -lift * 0.5;
  }

  facts() {
    return [
      ['Type', 'Plug key — a simple on/off switch'],
      ['State', this.closed ? 'Plug in: circuit closed' : 'Plug out: circuit open'],
    ];
  }
}
