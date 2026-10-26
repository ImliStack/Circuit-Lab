import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Tweens, EASE, MOTION } from '../motion.js';
import { createInkPass } from './ink.js';

// Units: 1 world unit = 1 cm. The bench top surface sits at y = 0.
// Look: isometric orthographic camera, cel (toon) shading, ink outlines from a
// screen-space edge pass, soft shadows falling on the cream page behind.

export const ELEV = { iso: THREE.MathUtils.degToRad(34), front: THREE.MathUtils.degToRad(10), top: THREE.MathUtils.degToRad(86) };
export const BENCH = { w: 66, d: 40, h: 1.6 };
export const FX_LAYER = 1; // charge dots, glows, rings, labels: drawn, but never inked or shadow-casting

const FRUSTUM = 40; // base visible height in world units at zoom 1
const ELEVATION = THREE.MathUtils.degToRad(34);

/** Three-tone ramp shared by every toon material. */
export const GRADIENT = (() => {
  const data = new Uint8Array([150, 205, 255]);
  const t = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();

export function createStage(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(0x000000, 0);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 400);
  camera.layers.enable(FX_LAYER);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  controls.minZoom = 0.6;
  controls.maxZoom = 12;
  controls.minPolarAngle = THREE.MathUtils.degToRad(4);
  controls.maxPolarAngle = THREE.MathUtils.degToRad(80);
  controls.screenSpacePanning = true;
  controls.zoomToCursor = true;
  // Left drag pans like a map, right drag orbits; touch: one finger pans, two pinch/rotate
  controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };

  const lights = addLights(scene);
  addBench(scene);
  let daylight = 1, daylightGoal = 1;

  const lessonRoot = new THREE.Group();
  lessonRoot.name = 'lesson';
  scene.add(lessonRoot);

  const ink = createInkPass(renderer);
  const tickers = new Set();
  const timer = new THREE.Timer();
  const tweens = new Tweens();
  let camTween = null;
  let view = { target: [0, 0, 0], fit: [40, 30], az: -0.42, el: ELEVATION };
  let userMoved = false;

  const size = () => ({ w: container.clientWidth || 1, h: container.clientHeight || 1 });

  function frustum() {
    const { w, h } = size();
    const aspect = w / h;
    camera.left = (-FRUSTUM * aspect) / 2;
    camera.right = (FRUSTUM * aspect) / 2;
    camera.top = FRUSTUM / 2;
    camera.bottom = -FRUSTUM / 2;
    camera.updateProjectionMatrix();
  }

  /** Zoom that fits a [width, depth] footprint seen from the iso angle. */
  function zoomFor(fit, el = ELEVATION) {
    const { w, h } = size();
    const aspect = w / h;
    const [fw, fd] = fit;
    const needW = fw * 1.06;
    const needH = (fd * Math.sin(el) + fw * 0.22 * Math.cos(el)) * 1.12 + 2;
    return Math.min((FRUSTUM * aspect) / needW, FRUSTUM / needH);
  }

  function poseFor(v) {
    const t = new THREE.Vector3(...v.target);
    const el = v.el ?? ELEVATION;
    const dir = new THREE.Vector3(Math.sin(v.az) * Math.cos(el), Math.sin(el), Math.cos(v.az) * Math.cos(el));
    return { pos: t.clone().addScaledVector(dir, 150), target: t, zoom: zoomFor(v.fit, el) };
  }

  function animateTo(pose, duration) {
    camTween?.cancel();
    const fromP = camera.position.clone(), fromT = controls.target.clone(), fromZ = camera.zoom;
    // Orbit around the target instead of cutting straight through it
    const fromOff = fromP.clone().sub(fromT), toOff = pose.pos.clone().sub(pose.target);
    const fromS = new THREE.Spherical().setFromVector3(fromOff), toS = new THREE.Spherical().setFromVector3(toOff);
    let dTheta = toS.theta - fromS.theta;
    dTheta = Math.atan2(Math.sin(dTheta), Math.cos(dTheta));
    const s = new THREE.Spherical();
    camTween = tweens.add({
      duration, ease: EASE.inOutCubic,
      update: (k) => {
        controls.target.lerpVectors(fromT, pose.target, k);
        s.set(THREE.MathUtils.lerp(fromS.radius, toS.radius, k), THREE.MathUtils.lerp(fromS.phi, toS.phi, k), fromS.theta + dTheta * k);
        camera.position.setFromSpherical(s).add(controls.target);
        camera.zoom = fromZ * (pose.zoom / fromZ) ** k;
        camera.updateProjectionMatrix();
      },
      done: () => { camTween = null; },
    });
  }

  function resize() {
    const { w, h } = size();
    renderer.setSize(w, h, false);
    const pr = renderer.getPixelRatio();
    ink.setSize(Math.round(w * pr), Math.round(h * pr));
    frustum();
    if (!userMoved && !camTween) {
      camera.zoom = poseFor(view).zoom;
      camera.updateProjectionMatrix();
    }
  }
  new ResizeObserver(resize).observe(container);
  frustum();
  const first = poseFor(view);
  camera.position.copy(first.pos);
  controls.target.copy(first.target);
  camera.zoom = first.zoom;
  resize();

  controls.addEventListener('start', () => { camTween?.cancel(); camTween = null; userMoved = true; });

  // Keyboard: WASD / arrows pan, Q / E turn by 90°, R resets
  const keys = new Set();
  const typing = (e) => /INPUT|TEXTAREA|SELECT/.test(e.target.tagName);
  window.addEventListener('keydown', (e) => {
    if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'q') api.rotate(Math.PI / 2);
    else if (k === 'e') api.rotate(-Math.PI / 2);
    else if (k === 'r') api.resetView();
    else if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { keys.add(k); e.preventDefault(); }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());
  const vel = new THREE.Vector2();
  function keyPan(dt) {
    const want = new THREE.Vector2(
      (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0),
      (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0),
    );
    if (want.lengthSq()) want.normalize().multiplyScalar(26 / camera.zoom);
    vel.lerp(want, 1 - Math.exp(-dt * 14));
    if (vel.lengthSq() < 1e-4) return;
    camTween?.cancel();
    userMoved = true;
    // Pan on the bench plane, relative to where the camera faces
    const fwd = new THREE.Vector3().subVectors(controls.target, camera.position).setY(0).normalize();
    const right = new THREE.Vector3().crossVectors(fwd, camera.up).normalize();
    const d = right.multiplyScalar(vel.x * dt).addScaledVector(fwd, vel.y * dt);
    controls.target.add(d);
    camera.position.add(d);
  }

  renderer.setAnimationLoop((now) => {
    timer.update(now);
    const dt = Math.min(timer.getDelta(), 0.05);
    const time = timer.getElapsed();
    tweens.tick(time);
    if (Math.abs(daylight - daylightGoal) > 1e-3) {
      daylight += (daylightGoal - daylight) * (1 - Math.exp(-dt * 5));
      lights.hemi.intensity = 1.5 * (0.18 + 0.82 * daylight);
      lights.key.intensity = 1.9 * (0.08 + 0.92 * daylight);
    }
    keyPan(dt);
    controls.update();
    for (const fn of tickers) fn(dt, time);
    ink.render(scene, camera);
  });

  const api = {
    renderer, scene, camera, controls, lessonRoot, tweens,
    /** Fly to a lesson view: { target, fit: [w, d], az } */
    setView(v, duration = MOTION.fly.lesson) {
      view = { ...view, ...v };
      userMoved = false;
      animateTo(poseFor(view), duration);
    },
    resetView(duration = MOTION.fly.reset) { api.setView({}, duration); },
    /** Orbit by an angle (radians) around the current target. */
    rotate(step, duration = MOTION.fly.rotate) {
      const offset = camera.position.clone().sub(controls.target);
      offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), step);
      animateTo({ pos: controls.target.clone().add(offset), target: controls.target.clone(), zoom: camera.zoom }, duration);
      userMoved = true;
    },
    zoomBy(f, duration = MOTION.fly.zoom) {
      const z = THREE.MathUtils.clamp(camera.zoom * f, controls.minZoom, controls.maxZoom);
      animateTo({ pos: camera.position.clone(), target: controls.target.clone(), zoom: z }, duration);
      userMoved = true;
    },
    /** Centre on a point and zoom, keeping the viewing angle. */
    focus(point, zoom, duration = MOTION.fly.focus) {
      const offset = camera.position.clone().sub(controls.target);
      animateTo({ pos: point.clone().add(offset), target: point.clone(), zoom: zoom ?? camera.zoom }, duration);
      userMoved = true;
    },
    /** World → CSS pixel position inside the container. */
    project(v) {
      const p = v.clone().project(camera);
      const { w, h } = size();
      return { x: (p.x * 0.5 + 0.5) * w, y: (-p.y * 0.5 + 0.5) * h };
    },
    /** Dim the room: 1 = full daylight, 0 = night (lamps and LEDs still glow). */
    setDaylight(k) { daylightGoal = Math.max(0, Math.min(1, k)); },
    /** Current azimuth (radians) relative to the lesson's home view. */
    get azimuth() {
      const o = camera.position.clone().sub(controls.target);
      return Math.atan2(o.x, o.z) - view.az;
    },
    /** PNG of the current frame (renders first so the drawing buffer is fresh). */
    snapshot() { ink.render(scene, camera); return renderer.domElement.toDataURL('image/png'); },
    onTick(fn) { tickers.add(fn); return () => tickers.delete(fn); },
  };
  return api;
}

/** Mark an object (and children) as an effect: visible, but not inked or shadow-casting. */
export function fx(obj) {
  obj.traverse((o) => { o.layers.set(FX_LAYER); });
  return obj;
}

function addLights(scene) {
  const hemi = new THREE.HemisphereLight(0xffffff, 0xd8c6a6, 1.5);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff6ea, 1.9);
  key.position.set(-26, 60, 30);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 4;
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.03;
  const s = key.shadow.camera;
  s.left = -50; s.right = 50; s.top = 40; s.bottom = -40; s.near = 10; s.far = 180;
  scene.add(key);
  return { hemi, key };
}

function addBench(scene) {
  const { w, d, h } = BENCH;
  // Drafting board: a rounded slab with a faint 1 cm grid, sitting on the page
  const r = 1.8;
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 + r, -d / 2);
  shape.lineTo(w / 2 - r, -d / 2); shape.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r);
  shape.lineTo(w / 2, d / 2 - r); shape.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2);
  shape.lineTo(-w / 2 + r, d / 2); shape.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r);
  shape.lineTo(-w / 2, -d / 2 + r); shape.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 6 });
  // Shape lies in XY; turn it so the slab's top face is at y = 0
  geo.rotateX(Math.PI / 2);
  const uv = geo.attributes.uv;
  const pos = geo.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + w / 2) / w, 1 - (pos.getZ(i) + d / 2) / d);
  const tex = new THREE.CanvasTexture(gridCanvas(w, d));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const top = new THREE.MeshToonMaterial({ color: 0xffffff, map: tex, gradientMap: GRADIENT });
  const side = new THREE.MeshToonMaterial({ color: 0xe3d3b8, gradientMap: GRADIENT });
  const slab = new THREE.Mesh(geo, [top, side]);
  slab.receiveShadow = true;
  slab.castShadow = true;
  scene.add(slab);

  // Shadow catcher: the page shows through, only the shadow is drawn (this is the contact shadow)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.ShadowMaterial({ color: 0x6b5232, opacity: 0.18 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -h - 0.01;
  floor.receiveShadow = true;
  scene.add(fx(floor));
}

function gridCanvas(w, d) {
  const px = 24;
  const c = document.createElement('canvas');
  c.width = w * px; c.height = d * px;
  const g = c.getContext('2d');
  g.fillStyle = '#f4ead9';
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i <= w; i++) {
    g.strokeStyle = i % 5 === 0 ? 'rgba(170,140,100,0.3)' : 'rgba(170,140,100,0.13)';
    g.lineWidth = i % 5 === 0 ? 2 : 1;
    g.beginPath(); g.moveTo(i * px, 0); g.lineTo(i * px, c.height); g.stroke();
  }
  for (let j = 0; j <= d; j++) {
    g.strokeStyle = j % 5 === 0 ? 'rgba(170,140,100,0.3)' : 'rgba(170,140,100,0.13)';
    g.lineWidth = j % 5 === 0 ? 2 : 1;
    g.beginPath(); g.moveTo(0, j * px); g.lineTo(c.width, j * px); g.stroke();
  }
  g.strokeStyle = 'rgba(70,80,100,0.35)';
  g.lineWidth = 3;
  g.strokeRect(px * 1.2, px * 1.2, c.width - px * 2.4, c.height - px * 2.4);
  g.fillStyle = 'rgba(70,80,100,0.5)';
  g.font = `600 ${Math.round(px * 0.7)}px "Barlow Semi Condensed", system-ui, sans-serif`;
  g.fillText('CIRCUIT LAB  ·  WORKBENCH  ·  1 SQUARE = 1 CM', px * 1.6, c.height - px * 0.42);
  return c;
}
