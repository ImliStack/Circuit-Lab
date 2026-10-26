import * as THREE from 'three';
import { toonMat, fx } from '../parts/common.js';
import { MOTION, REDUCED } from '../motion.js';

// A hook-up wire: TubeGeometry along a CatmullRomCurve3 that rises out of each
// terminal, then sags under its own weight towards the bench between them.
// Charge dots ride the curve to show conventional current (+ to −).

const WIRE_COLORS = {
  red: 0xe0483a, black: 0x343a4c, blue: 0x3b6fd1, yellow: 0xf2bb3d,
  green: 0x3fa36a, orange: 0xf08a3c, white: 0xf3eee4, teal: 0x1aa3a1,
};

const dotGeo = new THREE.SphereGeometry(1, 10, 8);
const dotMat = new THREE.MeshBasicMaterial({ color: 0xffd35c, toneMapped: false });

export class Wire {
  /**
   * @param {THREE.Vector3} a start (world), current flows a → b when positive
   * @param {THREE.Vector3} b end (world)
   * @param {object} o color, radius, lift (how far it rises out of a terminal),
   *   sag (0..1, how far it droops towards `floor`), floor (lowest y), via (extra points)
   */
  constructor(a, b, o = {}) {
    this.group = new THREE.Group();
    this.group.userData.noPick = true;
    this.radius = o.radius ?? 0.14;
    this.current = 0;
    this.flowOn = true;
    this.offset = Math.random();
    this.build(a, b, o);
  }

  build(a, b, o) {
    const { lift = 1.2, sag = 0.7, floor = 0.35, via = [] } = o;
    const pa = a.clone(), pb = b.clone();
    const up = new THREE.Vector3(0, 1, 0);
    const a1 = pa.clone().addScaledVector(up, lift);
    const b1 = pb.clone().addScaledVector(up, lift);
    const pts = [pa, a1];
    if (via.length) {
      via.forEach((v) => pts.push(new THREE.Vector3(...v)));
    } else {
      // Droop between the two raised points, never through the bench
      const n = 5;
      for (let i = 1; i < n; i++) {
        const t = i / n;
        const p = a1.clone().lerp(b1, t);
        const droop = Math.sin(Math.PI * t) * sag * (p.y - floor);
        p.y = Math.max(floor, p.y - droop);
        pts.push(p);
      }
    }
    pts.push(b1, pb);
    this.curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
    this.length = this.curve.getLength();

    const color = WIRE_COLORS[o.color] ?? o.color ?? WIRE_COLORS.red;
    const mat = toonMat({ color });
    const segs = Math.max(24, Math.round(this.length * 6));
    const tube = new THREE.Mesh(new THREE.TubeGeometry(this.curve, segs, this.radius, 10, false), mat);
    tube.castShadow = true;
    this.group.add(tube);
    this.tube = tube;
    this.indexCount = tube.geometry.index.count;
    this.ringStride = 6 * 10; // indices per tube segment (10 radial segments)

    // Plug sleeves at both ends
    const sleeveGeo = new THREE.CylinderGeometry(this.radius * 1.6, this.radius * 1.6, this.radius * 6, 12);
    this.caps = [[pa, a1], [pb, b1]].map(([p, q]) => {
      const s = new THREE.Mesh(sleeveGeo, mat);
      s.position.copy(p).lerp(q, 0.25);
      s.castShadow = true;
      this.group.add(s);
      return s;
    });
    this.revealed = 1;

    // Charge dots, instanced
    const count = Math.max(3, Math.round(this.length / 1.6));
    this.dots = new THREE.InstancedMesh(dotGeo, dotMat, count);
    this.dots.frustumCulled = false;
    this.dots.visible = false;
    this.dotScale = Math.max(this.radius * 1.35, 0.1);
    this.group.add(fx(this.dots));
    this.layoutDots();
  }

  layoutDots() {
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3(this.dotScale, this.dotScale, this.dotScale);
    const q = new THREE.Quaternion();
    const n = this.dots.count;
    for (let i = 0; i < n; i++) {
      let u = (i / n + this.offset) % 1;
      if (u < 0) u += 1;
      this.curve.getPointAt(u, p);
      m.compose(p, q, s);
      this.dots.setMatrixAt(i, m);
    }
    this.dots.instanceMatrix.needsUpdate = true;
  }

  setCurrent(amps) { this.current = amps; }

  /** Draw-in: 0 = nothing, 1 = whole wire. Caps pop separately via `cap(i, k)`. */
  reveal(k) {
    this.revealed = k;
    const n = Math.ceil((k * this.indexCount) / this.ringStride) * this.ringStride;
    this.tube.geometry.setDrawRange(0, Math.min(this.indexCount, n));
    this.tube.visible = k > 0;
  }
  cap(i, k) { this.caps[i].scale.setScalar(Math.max(0.001, k)); }

  tick(dt) {
    const show = this.flowOn && this.revealed >= 1 && Math.abs(this.current) > 1e-4;
    this.dots.visible = show;
    if (!show || REDUCED) return;
    // Speed grows with current but stays readable: 1 mA crawls, 1 A runs
    const speed = Math.sign(this.current) * Math.min(18, 1.2 + MOTION.flow.speed * Math.sqrt(Math.abs(this.current)));
    this.offset += (speed * dt) / this.length;
    this.layoutDots();
  }

  dispose() {
    this.group.traverse((o) => { if (o.geometry && o.geometry !== dotGeo) o.geometry.dispose(); });
  }
}
