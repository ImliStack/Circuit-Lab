import * as THREE from 'three';
import { createInkPass } from '../scene/ink.js';
import { toonMat, MAT, mesh } from '../parts/common.js';

// Small inked pictures of parts for the lesson list and quick-pick cards.
// One offscreen renderer draws each object once from the bench angle; results are cached.

const W = 240, H = 180;
let renderer = null, ink = null, scene = null, camera = null;
const cache = new Map();

function init() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(2);
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.setClearColor(0x000000, 0);
  ink = createInkPass(renderer);
  ink.setSize(W * 2, H * 2);
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8c6a6, 1.6));
  const key = new THREE.DirectionalLight(0xfff6ea, 1.8);
  key.position.set(-3, 6, 4);
  scene.add(key);
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
}

/**
 * Render `object` (a THREE.Object3D, not added anywhere else) to a PNG data URL.
 * `key` caches the result; `az` turns the view.
 */
export function thumb(key, makeObject, { az = -0.5, el = 0.55 } = {}) {
  if (cache.has(key)) return cache.get(key);
  try {
    init();
    const obj = makeObject();
    obj.position.set(0, 0, 0);
    obj.scale.setScalar(1);
    scene.add(obj);
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj, true);
    const c = box.getCenter(new THREE.Vector3());
    const r = box.getSize(new THREE.Vector3()).length() / 2;
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    camera.position.copy(c).addScaledVector(dir, r * 6 + 20);
    camera.lookAt(c);
    const aspect = W / H;
    camera.top = r * 0.92; camera.bottom = -r * 0.92;
    camera.left = -r * 0.92 * aspect; camera.right = r * 0.92 * aspect;
    camera.near = 0.1; camera.far = r * 12 + 60;
    camera.updateProjectionMatrix();
    ink.render(scene, camera);
    const url = renderer.domElement.toDataURL('image/png');
    scene.remove(obj);
    cache.set(key, url);
    return url;
  } catch {
    return '';
  }
}

/** Copy of a part's model for a picture (materials and geometry are shared, not duplicated). */
export function partThumb(part) {
  return thumb(`part:${part.kind}:${part.name}`, () => {
    // clone() copies userData through JSON, so set aside the back-link to the part (and live tweens)
    const keep = part.group.userData;
    part.group.userData = {};
    try { return part.group.clone(true); } finally { part.group.userData = keep; }
  });
}

/* Simple models for lessons that have no bench part yet */

export function coilModel() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.35, 0.35, 5, 16), MAT.steel, 0, 0, 0).rotateZ(Math.PI / 2));
  g.add(mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.3, 6), MAT.steel, -2.6, 0, 0).rotateZ(Math.PI / 2));
  const pts = [];
  for (let i = 0; i <= 400; i++) {
    const t = i / 400, a = t * Math.PI * 2 * 22;
    pts.push(new THREE.Vector3(-1.9 + t * 3.8, Math.cos(a) * 0.48, Math.sin(a) * 0.48));
  }
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 800, 0.07, 6), MAT.copper));
  for (let i = 0; i < 3; i++) g.add(mesh(new THREE.BoxGeometry(0.5, 0.12, 0.2), MAT.steel, 2.9 + i * 0.25, -0.2, (i - 1) * 0.35).rotateY(i * 0.7));
  return g;
}

export function trafficModel() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 4, 12), MAT.bakelite, 0, 2, 0));
  g.add(mesh(new THREE.BoxGeometry(1.4, 3.6, 1.1), MAT.blackPlastic, 0, 5.6, 0));
  [[0xe0483a, 6.75], [0xf2bb3d, 5.6], [0x3fa36a, 4.45]].forEach(([c, y], i) => {
    g.add(mesh(new THREE.SphereGeometry(0.44, 18, 12), toonMat({ color: c, emissive: c, emissiveIntensity: i === 2 ? 0.9 : 0.15 }), 0, y, 0.45));
    g.add(mesh(new THREE.BoxGeometry(1.1, 0.12, 0.5), MAT.blackPlastic, 0, y + 0.55, 0.7));
  });
  g.add(mesh(new THREE.CylinderGeometry(1, 1.1, 0.3, 20), MAT.bakelite, 0, 0.15, 0));
  return g;
}
