import * as THREE from 'three';
import { MAT, toonMat, Part, mesh, bindingPost, fmt } from './common.js';
import { MOTION, spring } from '../motion.js';

// Moving-coil lab meter: sloped bakelite case, printed dial, swinging needle,
// red (+) and black (−) binding posts on the front step.

const SWEEP = (100 * Math.PI) / 180; // needle travel, ±50°
const SLOPE = Math.atan2(2.5, 4.6); // angle of the dial face

function dialCanvas(unit, range, ticks) {
  const c = document.createElement('canvas');
  c.width = 768; c.height = 520;
  const g = c.getContext('2d');
  g.fillStyle = '#f6f1e4';
  g.beginPath(); g.roundRect(0, 0, c.width, c.height, 26); g.fill();
  const cx = c.width / 2, cy = c.height * 0.86, R = c.height * 0.66;
  g.strokeStyle = '#1e1b17';
  g.lineWidth = 4;
  g.beginPath(); g.arc(cx, cy, R, -Math.PI / 2 - SWEEP / 2, -Math.PI / 2 + SWEEP / 2); g.stroke();
  // Red over-range band at the top end
  g.strokeStyle = '#c0392b';
  g.lineWidth = 10;
  g.beginPath(); g.arc(cx, cy, R + 10, -Math.PI / 2 + SWEEP / 2 - 0.06, -Math.PI / 2 + SWEEP / 2); g.stroke();
  g.fillStyle = '#1e1b17';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const minor = ticks * 5;
  for (let i = 0; i <= minor; i++) {
    const a = -Math.PI / 2 - SWEEP / 2 + (i / minor) * SWEEP;
    const major = i % 5 === 0;
    const r1 = R - (major ? 34 : 18);
    g.strokeStyle = '#1e1b17';
    g.lineWidth = major ? 4 : 2;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    g.stroke();
    if (major) {
      const v = (range * i) / minor;
      g.font = '600 34px system-ui, sans-serif';
      const label = Number.isInteger(v) ? String(v) : v.toFixed(range < 1 ? 2 : 1);
      g.fillText(label, cx + Math.cos(a) * (R - 64), cy + Math.sin(a) * (R - 64));
    }
  }
  g.font = '400 120px Newsreader, Georgia, serif';
  g.fillText(unit, cx, cy - R * 0.42);
  g.font = '500 26px system-ui, sans-serif';
  g.fillStyle = '#6c665a';
  g.fillText(`0 – ${range} ${unit === 'A' ? 'ampere' : 'volt'} · DC`, cx, cy - R * 0.12);
  return c;
}

export class Meter extends Part {
  /** type: 'ammeter' | 'voltmeter' */
  constructor(name, { type = 'ammeter', range = 1, ticks = 5 } = {}) {
    super(type, name);
    this.type = type;
    this.range = range;
    this.value = 0;
    this.needleState = { x: 0, v: 0 };
    this.unit = type === 'ammeter' ? 'A' : 'V';

    // Side profile in (z, y), extruded along x
    const W = 7.2;
    const shape = new THREE.Shape();
    const prof = [[-3, 0], [3, 0], [3, 1.4], [1.6, 1.4], [1.6, 1.9], [-3, 4.4]];
    shape.moveTo(prof[0][0], prof[0][1]);
    prof.slice(1).forEach(([z, y]) => shape.lineTo(z, y));
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: W, bevelEnabled: true, bevelSize: 0.14, bevelThickness: 0.14, bevelSegments: 3 });
    geo.rotateY(-Math.PI / 2);
    geo.translate(W / 2, 0, 0);
    this.group.add(new THREE.Mesh(geo, MAT.bakelite));

    // Dial face on the slope
    const face = new THREE.Group();
    face.position.set(0, (1.9 + 4.4) / 2, (1.6 + -3) / 2);
    face.rotation.x = -(Math.PI / 2 - SLOPE);
    face.translateZ(0.16);
    this.group.add(face);
    const tex = new THREE.CanvasTexture(dialCanvas(this.unit, range, ticks));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const dialW = 6.2, dialH = 6.2 * (520 / 768);
    face.add(new THREE.Mesh(new THREE.PlaneGeometry(dialW, dialH), toonMat({ map: tex, roughness: 0.5 })));
    // Glass cover
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(dialW, dialH),
      toonMat({ color: 0xffffff, roughness: 0.02, transparent: true, opacity: 0.12, clearcoat: 1, depthWrite: false }),
    );
    glass.position.z = 0.12;
    glass.userData.noShadow = true;
    face.add(glass);
    // Needle pivots near the bottom of the dial
    this.needle = new THREE.Group();
    this.needle.position.set(0, -dialH / 2 + dialH * 0.14, 0.05);
    const nMat = toonMat({ color: 0xb32a20, roughness: 0.4 });
    const needle = mesh(new THREE.BoxGeometry(0.05, dialH * 0.66, 0.02), nMat, 0, dialH * 0.33, 0);
    this.needle.add(needle);
    this.needle.add(mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 16), MAT.bakelite).rotateX(Math.PI / 2));
    face.add(this.needle);

    const plus = bindingPost('red');
    const minus = bindingPost('black');
    plus.group.position.set(-1.8, 1.4, 2.3);
    minus.group.position.set(1.8, 1.4, 2.3);
    this.group.add(plus.group, minus.group);
    this.terms = {
      plus: plus.group.position.clone().add(plus.top),
      minus: minus.group.position.clone().add(minus.top),
    };
    this.finish();
    this.setNeedle(0);
  }

  set(value) { this.value = value; }

  setNeedle(v) {
    const k = Math.max(-0.03, Math.min(1.04, v / this.range));
    this.needle.rotation.z = SWEEP / 2 - k * SWEEP;
  }

  tick(dt, time) {
    // Spring towards the reading (in fractions of full scale): overshoots, then settles
    const shown = spring(this.needleState, this.value / this.range, MOTION.needle, dt) * this.range;
    // Over-range: needle hits the end stop and trembles
    const over = this.value > this.range * 1.04 || this.value < -this.range * 0.03;
    this.setNeedle(shown + (over ? Math.sin(time * 40) * this.range * 0.006 : 0));
  }

  facts() {
    const reading = this.type === 'ammeter' ? fmt.amps(this.value) : fmt.volts(this.value);
    return this.type === 'ammeter'
      ? [['Reading', reading], ['Range', `0 – ${this.range} A`], ['Connected', 'In series — all the current passes through it'], ['Its own resistance', 'Almost zero, so it does not change the current']]
      : [['Reading', reading], ['Range', `0 – ${this.range} V`], ['Connected', 'In parallel — across the part being measured'], ['Its own resistance', 'Very high, so almost no current goes through it']];
  }
}
