import * as THREE from 'three';
import { MOTION, REDUCED } from '../motion.js';

// Labels pinned to parts. Each label sits away from the middle of the bench and
// is tied to its part by a leader line ending in a dot. With nothing selected the
// labels are small cards with a line of explanation; selecting a part collapses
// them to pills. Labels nudge apart so they never overlap, and glide to their
// new place instead of jumping.

const NS = 'http://www.w3.org/2000/svg';
const MARGIN = { left: 64, right: 16, top: 78, bottom: 104 };

export function createPins({ stage, root, svg, onPick }) {
  let items = [];
  let selected = null;
  const look = new Set();
  let visible = true;
  let narrow = false;
  let enterAt = 0;

  const leaderLayer = document.createElementNS(NS, 'g');
  const ringLayer = document.createElementNS(NS, 'g');
  svg.append(ringLayer, leaderLayer);

  function anchorOf(part) {
    // Top-centre of the part, in its own space, so it follows the part as it moves
    const box = new THREE.Box3();
    part.group.updateWorldMatrix(true, true);
    part.group.traverse((o) => {
      if (!o.isMesh || o.userData.noPick || !o.visible) return;
      o.geometry.computeBoundingBox?.();
      if (!o.geometry.boundingBox) return;
      box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));
    });
    if (box.isEmpty()) box.setFromObject(part.group);
    const top = new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2);
    return { local: part.group.worldToLocal(top.clone()), box: box.clone().applyMatrix4(part.group.matrixWorld.clone().invert()) };
  }

  function set(list) {
    root.innerHTML = '';
    leaderLayer.innerHTML = '';
    ringLayer.innerHTML = '';
    items = list.map((c, i) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'pin';
      el.style.animationDelay = `${REDUCED ? 0 : MOTION.label.at + i * MOTION.label.stagger}s`;
      el.addEventListener('click', (e) => { e.stopPropagation(); onPick(c.part); });
      el.addEventListener('pointerenter', () => el.classList.add('hot'));
      el.addEventListener('pointerleave', () => el.classList.remove('hot'));
      root.append(el);
      const line = document.createElementNS(NS, 'path');
      const dot = document.createElementNS(NS, 'circle');
      const halo = document.createElementNS(NS, 'circle');
      dot.setAttribute('r', 3.6);
      dot.setAttribute('class', 'anchor');
      halo.setAttribute('r', 6);
      halo.setAttribute('class', 'halo');
      halo.style.animationDelay = `${(i * 0.37) % 2.8}s`;
      leaderLayer.append(line, halo, dot);
      return { ...c, el, line, dot, halo, anchor: null, pos: null, mode: '', html: '', valueText: '' };
    });
    enterAt = performance.now() + (REDUCED ? 0 : MOTION.label.at * 1000);
    render();
  }

  /** Recompute anchors once parts have landed (call after the enter animation). */
  function measure() { items.forEach((it) => { it.anchor = anchorOf(it.part); }); }

  function render() {
    const mode = selected || narrow ? 'pill' : 'card';
    for (const it of items) {
      const value = it.value ? it.value() : '';
      const html = mode === 'card'
        ? `<b>${it.part.name}</b><small>${it.text ?? ''}</small>${value ? `<span class="val">${value}</span>` : ''}`
        : `<b>${it.short ?? it.part.name}</b>${value ? `<span class="val">${value}</span>` : ''}`;
      if (html !== it.html || mode !== it.mode) {
        const changed = it.mode === mode && value !== it.valueText && it.valueText !== '';
        it.el.innerHTML = html;
        it.el.className = `pin ${mode === 'card' ? 'card' : ''}`;
        if (changed) it.el.querySelector('.val')?.classList.add('flash');
        it.html = html;
        it.mode = mode;
        it.valueText = value;
        it.size = null;
      }
      it.el.classList.toggle('look', look.has(it.part));
      it.el.classList.toggle('sel', selected === it.part);
    }
  }

  function project(v) { return stage.project(v); }

  function update() {
    const W = root.clientWidth, H = root.clientHeight;
    narrow = W < 640;
    render();
    const show = visible && performance.now() >= enterAt - 200;
    root.style.display = visible ? '' : 'none';
    const centre = project(stage.controls.target.clone());
    const boxes = [];
    for (const it of items) {
      if (!it.anchor) it.anchor = anchorOf(it.part);
      const a3 = it.part.group.localToWorld(it.anchor.local.clone());
      const a = project(a3);
      it.a = a;
      if (!it.size) it.size = { w: it.el.offsetWidth || 120, h: it.el.offsetHeight || 28 };
      const { w, h } = it.size;
      if (it.mode === 'card') {
        // Cards line up in a band above the circuit (or below, for parts low on screen)
        const below = a.y > centre.y + H * 0.06;
        boxes.push({ it, x: a.x - w / 2, y: below ? H - MARGIN.bottom - h : MARGIN.top, w, h, band: below ? 1 : -1 });
        continue;
      }
      // Pills: pushed out from the middle, biased upwards (labels read better above parts)
      let dx = a.x - centre.x, dy = a.y - centre.y - 40;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len; dy /= len;
      dy = Math.min(dy, 0.25) - 0.55;
      const dl = Math.hypot(dx, dy) || 1;
      const dist = it.mode === 'card' ? 92 : 46;
      let x = a.x + (dx / dl) * dist - w / 2;
      let y = a.y + (dy / dl) * dist - h / 2;
      boxes.push({ it, x, y, w, h });
    }
    packBands(boxes, W);
    // Separate overlapping labels
    for (let k = 0; k < 14; k++) {
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const A = boxes[i], B = boxes[j];
          if (A.band && B.band) continue;
          const ox = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x) + 8;
          const oy = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y) + 6;
          if (ox > 0 && oy > 0) {
            if (A.band || B.band) { const sx = A.x < B.x ? -1 : 1; A.x += (sx * ox) / 2; B.x -= (sx * ox) / 2; }
            else if (oy < ox) { const s = A.y < B.y ? -1 : 1; A.y += (s * oy) / 2; B.y -= (s * oy) / 2; }
            else { const s = A.x < B.x ? -1 : 1; A.x += (s * ox) / 2; B.x -= (s * ox) / 2; }
          }
        }
      }
      for (const b of boxes) {
        b.x = Math.max(MARGIN.left, Math.min(W - MARGIN.right - b.w, b.x));
        b.y = Math.max(MARGIN.top, Math.min(H - MARGIN.bottom - b.h, b.y));
      }
    }
    for (const b of boxes) {
      const it = b.it;
      // Glide towards the target spot
      if (!it.pos || REDUCED) it.pos = { x: b.x, y: b.y };
      else { it.pos.x += (b.x - it.pos.x) * 0.22; it.pos.y += (b.y - it.pos.y) * 0.22; }
      const { x, y } = it.pos;
      it.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      // Leader from the anchor to the nearest point on the label's edge
      const ex = Math.max(x, Math.min(x + b.w, it.a.x));
      const ey = Math.max(y, Math.min(y + b.h, it.a.y));
      it.line.setAttribute('d', `M${it.a.x.toFixed(1)},${it.a.y.toFixed(1)}L${ex.toFixed(1)},${ey.toFixed(1)}`);
      it.line.setAttribute('class', `leader ${it.mode} ${look.has(it.part) ? 'look' : ''} ${selected === it.part ? 'sel' : ''}`);
      for (const c of [it.dot, it.halo]) { c.setAttribute('cx', it.a.x.toFixed(1)); c.setAttribute('cy', it.a.y.toFixed(1)); }
      const on = show ? '' : 'none';
      it.line.style.display = visible ? on : 'none';
      it.dot.style.display = visible ? on : 'none';
      it.halo.style.display = visible && !selected ? on : 'none';
    }
    drawRings();
  }

  /**
   * Lay cards out left to right in their band, in the order of their parts on screen.
   * If a band is too full, the card furthest from its band moves to the other one.
   */
  function packBands(boxes, W) {
    const gap = 10, left = MARGIN.left, right = W - MARGIN.right;
    const H = root.clientHeight;
    const bands = { '-1': [], 1: [] };
    boxes.filter((b) => b.band).forEach((b) => bands[b.band].push(b));
    const width = (list) => list.reduce((s, b) => s + b.w + gap, -gap);
    for (const [from, to] of [['-1', '1'], ['1', '-1']]) {
      while (bands[from].length > 1 && width(bands[from]) > right - left && width(bands[to]) + 200 < right - left) {
        // Move the card whose part sits nearest the other band
        const pick = bands[from].reduce((m, b) => (from === '-1' ? (b.it.a.y > m.it.a.y ? b : m) : (b.it.a.y < m.it.a.y ? b : m)));
        bands[from].splice(bands[from].indexOf(pick), 1);
        pick.band = +to;
        pick.y = to === '1' ? H - MARGIN.bottom - pick.h : MARGIN.top;
        bands[to].push(pick);
      }
    }
    for (const list of Object.values(bands)) {
      list.sort((a, b) => a.it.a.x - b.it.a.x);
      let x = left;
      for (const b of list) { b.x = Math.max(b.x, x); x = b.x + b.w + gap; }
      // Slide the whole row back if it ran off the right edge
      let over = x - gap - right;
      for (let i = list.length - 1; i >= 0 && over > 0; i--) {
        const b = list[i];
        const limit = i === 0 ? left : list[i - 1].x + list[i - 1].w + gap;
        const move = Math.min(over, b.x - limit);
        for (let j = i; j < list.length; j++) list[j].x -= move;
        over -= move;
      }
    }
  }

  /** Dashed ellipse around the selected part and any parts a step points at. */
  function drawRings() {
    const want = [];
    if (selected) want.push([selected, 'ring']);
    look.forEach((p) => { if (p !== selected) want.push([p, 'ring look']); });
    while (ringLayer.childNodes.length < want.length) ringLayer.append(document.createElementNS(NS, 'ellipse'));
    while (ringLayer.childNodes.length > want.length) ringLayer.lastChild.remove();
    want.forEach(([part, cls], i) => {
      const e = ringLayer.childNodes[i];
      const it = items.find((x) => x.part === part);
      const box = it?.anchor?.box ?? new THREE.Box3().setFromObject(part.group).applyMatrix4(part.group.matrixWorld.clone().invert());
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let k = 0; k < 8; k++) {
        const v = new THREE.Vector3(k & 1 ? box.max.x : box.min.x, k & 2 ? box.max.y : box.min.y, k & 4 ? box.max.z : box.min.z);
        const p = project(part.group.localToWorld(v));
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      }
      e.setAttribute('cx', ((minX + maxX) / 2).toFixed(1));
      e.setAttribute('cy', ((minY + maxY) / 2).toFixed(1));
      e.setAttribute('rx', ((maxX - minX) / 2 * 1.22 + 8).toFixed(1));
      e.setAttribute('ry', ((maxY - minY) / 2 * 1.22 + 8).toFixed(1));
      e.setAttribute('class', cls);
    });
  }

  return {
    set, measure, update,
    select(p) { selected = p; },
    setLook(parts) { look.clear(); parts.forEach((p) => p && look.add(p)); },
    setVisible(v) { visible = v; },
    clear() { set([]); selected = null; look.clear(); },
  };
}
