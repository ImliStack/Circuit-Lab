import * as THREE from 'three';
import { GRADIENT, fx } from '../scene/stage.js';

const TOON_KEYS = ['color', 'map', 'emissive', 'emissiveIntensity', 'transparent', 'opacity', 'side', 'depthWrite', 'toneMapped'];

/** Cel-shaded material. Accepts MeshStandardMaterial-style params and drops the PBR-only ones. */
export function toonMat(params = {}) {
  const p = { gradientMap: GRADIENT };
  for (const k of TOON_KEYS) if (params[k] !== undefined) p[k] = params[k];
  return new THREE.MeshToonMaterial(p);
}
export { fx };

// Shared materials and building blocks for every procedural part.

// Flat illustration palette (cream page, navy ink, teal accents)
export const MAT = {
  lead: toonMat({ color: 0xc9ced6 }),
  brass: toonMat({ color: 0xe0b45a }),
  copper: toonMat({ color: 0xd98a52 }),
  steel: toonMat({ color: 0xc8ccd3 }),
  blackPlastic: toonMat({ color: 0x2f3442 }),
  bakelite: toonMat({ color: 0x343a4c }),
  redPlastic: toonMat({ color: 0xd9483b }),
  creamPlastic: toonMat({ color: 0xf6efe2 }),
  ivory: toonMat({ color: 0xf5eee0 }),
  wood: toonMat({ color: 0xe7c48f }),
  pcb: toonMat({ color: 0x4a5d99 }),
  chip: toonMat({ color: 0x2b3040 }),
  gold: toonMat({ color: 0xe8c05a }),
};

/** Base for every bench part. `group.userData.part` links meshes back to it for picking. */
export class Part {
  constructor(kind, name) {
    this.kind = kind;
    this.name = name;
    this.group = new THREE.Group();
    this.group.name = name;
    this.group.userData.part = this;
    this.terms = {};
  }
  /** World position of a named terminal (where a wire end goes). */
  term(n) {
    this.group.updateWorldMatrix(true, true);
    return this.group.localToWorld(this.terms[n].clone());
  }
  at(x, y, z, ry = 0) {
    this.group.position.set(x, y, z);
    this.group.rotation.y = ry;
    return this;
  }
  facts() { return []; }
  tick() {}
  finish() {
    this.group.traverse((o) => { if (o.isMesh && !o.userData.noShadow) { o.castShadow = true; o.receiveShadow = true; } });
    return this;
  }
}

export function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

/** Laboratory binding post: coloured insulator + knurled brass nut. Wire enters at the top. */
export function bindingPost(color = 'red') {
  const g = new THREE.Group();
  const ins = color === 'red' ? MAT.redPlastic : MAT.blackPlastic;
  g.add(mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.5, 20), ins, 0, 0.25, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.9, 12), MAT.brass, 0, 0.8, 0));
  const nut = mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.32, 16), MAT.brass, 0, 0.78, 0);
  g.add(nut);
  g.add(mesh(new THREE.SphereGeometry(0.18, 12, 8), MAT.brass, 0, 1.25, 0));
  return { group: g, top: new THREE.Vector3(0, 1.3, 0) };
}

/** Thin straight lead between two local points. */
export function leadBetween(a, b, r = 0.028, mat = MAT.lead) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), mat);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}

/** Bent lead through a list of points (TubeGeometry along a polyline). */
export function leadPath(points, r = 0.028, mat = MAT.lead) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'catmullrom', 0.05);
  return new THREE.Mesh(new THREE.TubeGeometry(curve, points.length * 8, r, 6, false), mat);
}

let glowTex = null;
/** Additive soft sprite that fakes bloom around lit bulbs and LEDs. */
export function glowSprite(color) {
  if (!glowTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    glowTex = new THREE.CanvasTexture(c);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0, toneMapped: false,
  }));
  s.userData.noPick = true;
  return fx(s);
}

/** Small wooden board that lab components are mounted on. */
export function baseBoard(w, d, h = 0.5) {
  const m = mesh(new THREE.BoxGeometry(w, h, d), MAT.wood, 0, h / 2, 0);
  return m;
}

export const fmt = {
  amps(i) {
    const a = Math.abs(i);
    if (a < 1e-6) return '0 mA';
    if (a < 1) return `${(i * 1000).toFixed(a < 0.01 ? 2 : 1)} mA`;
    return `${i.toFixed(2)} A`;
  },
  volts(v) { return `${Math.abs(v) < 0.005 ? '0.00' : v.toFixed(2)} V`; },
  ohms(r) { return r >= 1000 ? `${(r / 1000).toFixed(r % 1000 ? 1 : 0)} kΩ` : `${r} Ω`; },
  watts(p) { return p < 1 ? `${(p * 1000).toFixed(0)} mW` : `${p.toFixed(2)} W`; },
};
