import * as THREE from 'three';
import { toonMat, fx } from '../parts/common.js';

// Text drawn into a CanvasTexture. `makeLabel` returns a camera-facing sprite;
// `makeDecal` returns a flat plane for printing text onto a part's surface.

function drawText(canvas, text, opts) {
  const { font = '600 44px system-ui, sans-serif', color = '#1f1a14', bg = 'rgba(255,252,245,0.92)', pad = 18, radius = 18, border } = opts;
  const g = canvas.getContext('2d');
  g.font = font;
  const lines = String(text).split('\n');
  const lineH = parseInt(font.match(/(\d+)px/)[1], 10) * 1.2;
  const w = Math.ceil(Math.max(...lines.map((l) => g.measureText(l).width)) + pad * 2);
  const h = Math.ceil(lineH * lines.length + pad * 1.4);
  canvas.width = w; canvas.height = h;
  g.font = font; // resizing the canvas resets context state
  if (bg) {
    g.fillStyle = bg;
    g.beginPath(); g.roundRect(1, 1, w - 2, h - 2, radius); g.fill();
    if (border) { g.strokeStyle = border; g.lineWidth = 3; g.stroke(); }
  }
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  lines.forEach((l, i) => g.fillText(l, w / 2, pad * 0.7 + lineH * (i + 0.5)));
  return { w, h };
}

export function makeLabel(text, opts = {}) {
  const canvas = document.createElement('canvas');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: opts.depthTest ?? true, transparent: true }));
  const height = opts.height ?? 1.4; // world cm
  sprite.renderOrder = 10;
  sprite.userData.noPick = true;
  fx(sprite);
  let current = null;
  sprite.setText = (t) => {
    if (t === current) return;
    current = t;
    const { w, h } = drawText(canvas, t, opts);
    tex.needsUpdate = true;
    sprite.scale.set((height * w) / h, height, 1);
  };
  sprite.setText(text);
  return sprite;
}

export function makeDecal(text, width, height, opts = {}) {
  const canvas = document.createElement('canvas');
  const scale = 128;
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const g = canvas.getContext('2d');
  if (opts.bg) { g.fillStyle = opts.bg; g.fillRect(0, 0, canvas.width, canvas.height); }
  g.fillStyle = opts.color ?? '#f5f0e6';
  g.font = opts.font ?? `700 ${Math.round(canvas.height * 0.5)}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, canvas.width / 2, canvas.height / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    toonMat({ map: tex, transparent: !opts.bg, roughness: 0.6 }),
  );
  mesh.rotation.x = -Math.PI / 2;
  return fx(mesh);
}
