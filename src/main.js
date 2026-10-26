import * as THREE from 'three';
import './style.css';
import { createStage, ELEV, BENCH } from './scene/stage.js';
import { Wire } from './scene/wire.js';
import { makeTray } from './parts/extras.js';
import { INFO } from './ui/info.js';
import { symbolFor } from './ui/schematic.js';
import { createPins } from './ui/pins.js';
import { thumb, partThumb } from './ui/thumbs.js';
import { LESSONS } from './lessons/index.js';
import { MOTION, EASE, ms, REDUCED } from './motion.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode or blocked storage */ } },
};

/* ───────── Progress ───────── */

const PROGRESS_KEY = 'circuit-lab:progress:v1';
const progress = {
  done: new Set(store.get(PROGRESS_KEY, { done: [] }).done || []),
  save() { store.set(PROGRESS_KEY, { done: [...this.done] }); },
};

/* ───────── Stage ───────── */

const benchEl = $('#bench');
const stageEl = $('#stage');
if (!(() => { try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; } })()) {
  benchEl.innerHTML = '<div class="note warn" style="margin:90px 24px">This browser cannot show 3D right now (WebGL is turned off or not supported). Try a recent Chrome, Edge, Firefox or Safari.</div>';
  throw new Error('WebGL unavailable');
}
const stage = createStage(benchEl);
const T = stage.tweens;

// Spare parts for later lessons wait in a tray at the back of the bench
const tray = makeTray();
tray.group.position.set(-BENCH.w / 2 + 10, 0, -BENCH.d / 2 + 4.5);
stage.scene.add(tray.group);
tray.parts.forEach((p) => stage.onTick((dt, t) => p.tick(dt, t)));

let flowOn = true;
let current = null; // { def, inst, ctx, step, seen, goals, running, predicted }
let selected = null;
let loadToken = 0;

const pins = createPins({ stage, root: $('#pins'), svg: $('#overlay'), onPick: (p) => select(p) });
stage.onTick(() => pins.update());

/* ───────── Part motion helpers: drop-in, hover lift ───────── */

function applyY(part) {
  const u = part.group.userData;
  part.group.position.y = (u.baseY ?? 0) + (u.dropY ?? 0) + (u.hoverY ?? 0);
}

/** Parts drop onto the bench and pop to size one after another; then wires draw themselves. */
function enter(parts, wires) {
  const e = MOTION.enter;
  parts.forEach((p, i) => {
    const u = p.group.userData;
    u.baseY = p.group.position.y;
    const s0 = u.baseScale = p.group.scale.x;
    const big = p.kind === 'breadboard' || p.kind === 'board';
    const drop = big ? e.drop * 0.5 : e.drop;
    u.dropY = drop;
    p.group.scale.setScalar(0.001);
    applyY(p);
    T.add({
      delay: i * e.stagger, duration: e.duration, ease: EASE.linear,
      update: (_, k) => {
        u.dropY = drop * (1 - EASE.outCubic(k));
        p.group.scale.setScalar(Math.max(0.001, s0 * EASE.outBack(Math.min(1, k * 1.25))));
        applyY(p);
      },
    });
  });
  const w = MOTION.wire;
  const start = parts.length * e.stagger + e.duration * 0.6;
  wires.forEach((wire, j) => {
    wire.reveal(0);
    wire.cap(0, 0); wire.cap(1, 0);
    const d = start + j * w.stagger;
    T.add({ delay: d, duration: w.cap, ease: EASE.outBack, update: (k) => wire.cap(0, k) });
    T.add({ delay: d + w.cap * 0.45, duration: w.draw, ease: EASE.inOutCubic, update: (k) => wire.reveal(k) });
    T.add({ delay: d + w.cap * 0.45 + w.draw, duration: w.cap, ease: EASE.outBack, update: (k) => wire.cap(1, k) });
  });
  return start + wires.length * w.stagger + w.draw + w.cap;
}

/** Reverse of enter: wires retract, parts shrink and lift away. Resolves when done. */
function exit(ctx) {
  if (!ctx || REDUCED) return Promise.resolve();
  return new Promise((resolve) => {
    ctx.wires.forEach((wire) => {
      const r0 = wire.revealed;
      T.add({ duration: 0.3, ease: EASE.inCubic, update: (k) => { wire.reveal(r0 * (1 - k)); wire.cap(0, 1 - k); wire.cap(1, 1 - k); } });
    });
    ctx.parts.forEach((p, i) => {
      const s0 = p.group.scale.x;
      T.add({
        delay: 0.05 + i * 0.03, duration: 0.32, ease: EASE.linear,
        update: (_, k) => { p.group.scale.setScalar(Math.max(0.001, s0 * (1 - EASE.inBack(k)))); p.group.userData.dropY = 6 * EASE.inCubic(k); applyY(p); },
      });
    });
    setTimeout(resolve, 380 + ctx.parts.length * 30);
  });
}

function hoverLift(part, on) {
  if (!part || part.kind === 'breadboard' || part.kind === 'board' || part.noLift) return;
  const u = part.group.userData;
  if (u.baseY == null) return;
  u.hoverAnim?.cancel();
  const from = u.hoverY ?? 0, to = on ? MOTION.hover.lift : 0;
  u.hoverAnim = T.add({ duration: MOTION.hover.duration, ease: EASE.outCubic, update: (k) => { u.hoverY = from + (to - from) * k; applyY(part); } });
}

/* ───────── Picking ───────── */

const raycaster = new THREE.Raycaster();
raycaster.camera = stage.camera;
const pointer = new THREE.Vector2();
const tipEl = $('#tip');
let hovered = null;

function partAt(x, y) {
  const r = stage.renderer.domElement.getBoundingClientRect();
  pointer.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(pointer, stage.camera);
  raycaster.layers.set(0);
  for (const h of raycaster.intersectObjects([stage.lessonRoot, tray.group], true)) {
    let o = h.object;
    if (o.userData.noPick || !o.visible) continue;
    while (o && !o.userData.part) o = o.parent;
    if (o) return o.userData.part;
  }
  return null;
}

const canvas = stage.renderer.domElement;
let down = null;
let pressing = null;
canvas.addEventListener('pointerdown', (e) => {
  down = { x: e.clientX, y: e.clientY };
  const p = e.button === 0 ? partAt(e.clientX, e.clientY) : null;
  if (p?.onPress) {
    // Holding a push button presses it; the bench does not pan meanwhile
    pressing = p;
    p.onPress(true);
    stage.controls.enabled = false;
  }
});
const release = () => {
  if (!pressing) return;
  pressing.onPress(false);
  pressing = null;
  stage.controls.enabled = true;
};
window.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
canvas.addEventListener('pointerup', (e) => {
  if (!down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  down = null;
  if (moved > 6 || e.button === 2) return;
  const p = partAt(e.clientX, e.clientY);
  if (p?.onPress) return; // pressing a button is not a request to inspect it
  select(p);
});
let hoverQueued = false;
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse' || hoverQueued) return;
  hoverQueued = true;
  requestAnimationFrame(() => {
    hoverQueued = false;
    const p = down ? null : partAt(e.clientX, e.clientY);
    if (p !== hovered) { hoverLift(hovered, false); hoverLift(p, true); hovered = p; }
    stageEl.classList.toggle('hovering', !!p);
    if (p) {
      const r = stageEl.getBoundingClientRect();
      tipEl.hidden = false;
      tipEl.textContent = p.name;
      tipEl.style.left = `${e.clientX - r.left}px`;
      tipEl.style.top = `${e.clientY - r.top}px`;
    } else tipEl.hidden = true;
  });
});
canvas.addEventListener('pointerleave', () => { tipEl.hidden = true; hoverLift(hovered, false); hovered = null; stageEl.classList.remove('hovering'); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') select(null); });

function select(part) {
  selected = part;
  pins.select(part);
  document.querySelectorAll('.quick-card').forEach((c) => c.classList.toggle('sel', c.dataset.name === part?.name));
  if (part) {
    const box = new THREE.Box3().setFromObject(part.group);
    const c = box.getCenter(new THREE.Vector3());
    // Small parts get a closer look; big ones only nudge the view towards them
    const fill = 40 / (box.getSize(new THREE.Vector3()).length() * 4);
    const zoom = Math.min(stage.controls.maxZoom, Math.max(stage.camera.zoom, fill));
    stage.focus(stage.controls.target.clone().lerp(c, zoom > stage.camera.zoom * 1.05 ? 0.85 : 0.45), zoom, MOTION.fly.focus);
    setCaption(INFO[part.kind]?.tip ?? part.name);
  } else setCaption(current?.def.caption ?? 'Click any part to see what it does.');
  renderPanel();
}

/* ───────── Tools ───────── */

function toggle(btn, on) { btn.classList.toggle('is-on', on); btn.setAttribute('aria-pressed', String(on)); }
$('#t-zoom-in').onclick = () => stage.zoomBy(1.3);
$('#t-zoom-out').onclick = () => stage.zoomBy(1 / 1.3);
$('#t-fit').onclick = () => stage.resetView();
$('#t-labels').onclick = (e) => { const on = !e.currentTarget.classList.contains('is-on'); toggle(e.currentTarget, on); pins.setVisible(on); };
$('#t-flow').onclick = (e) => {
  flowOn = !flowOn;
  toggle(e.currentTarget, flowOn);
  current?.ctx.wires.forEach((w) => { w.flowOn = flowOn; });
};
$('#t-theme').onclick = () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('circuit-theme', next); } catch { /* ignore */ }
};
$('#t-shot').onclick = () => {
  const a = document.createElement('a');
  a.href = stage.snapshot();
  a.download = `circuit-lab-${current?.def.id ?? 'bench'}.png`;
  a.click();
};
$('#v-left').onclick = () => stage.rotate(Math.PI / 2);
$('#v-right').onclick = () => stage.rotate(-Math.PI / 2);
document.querySelectorAll('[data-view]').forEach((b) => {
  b.onclick = () => {
    const el = ELEV[b.dataset.view];
    const az = b.dataset.view === 'iso' ? current.def.view.az : 0;
    stage.setView({ ...current.def.view, el, az }, MOTION.fly.focus);
    document.querySelectorAll('[data-view]').forEach((x) => x.classList.toggle('is-on', x === b));
  };
});
stage.onTick(() => {
  const deg = Math.round(((((stage.azimuth * 180) / Math.PI) % 360) + 540) % 360 - 180);
  const el = $('#v-deg');
  const txt = `${deg}°`;
  if (el.textContent !== txt) el.textContent = txt;
});
$('#edge-left').onclick = () => $('#app').classList.toggle('no-left');
$('#edge-right').onclick = () => $('#app').classList.toggle('no-right');

function setCaption(text) {
  const c = $('#caption');
  if (c.textContent === text) return;
  c.style.opacity = '0';
  setTimeout(() => { c.textContent = text; c.style.opacity = '1'; }, ms(0.18));
}

let toastTimer = 0;
function toast(msg, tone = '', duration = 3400) {
  const el = $('#toast');
  el.hidden = false;
  el.className = `toast ${tone}`;
  el.textContent = msg;
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, duration);
}

/* ───────── Sidebar ───────── */

let chapter = 'electricity';
document.querySelectorAll('#chapter button').forEach((b) => {
  b.onclick = () => {
    chapter = b.dataset.ch;
    document.querySelectorAll('#chapter button').forEach((x) => x.classList.toggle('is-on', x === b));
    renderSidebar();
  };
});

function lessonThumb(l) { return l.thumb ? thumb(`lesson:${l.id}`, l.thumb, l.thumbView) : ''; }

function renderSidebar() {
  const n = progress.done.size;
  $('#progress').innerHTML = `
    <div class="progress-text"><span>${n} of ${LESSONS.length} lessons</span><span>${Math.round((n / LESSONS.length) * 100)}%</span></div>
    <div class="progress-bar"><i style="width:${(n / LESSONS.length) * 100}%"></i></div>`;
  $('#lessons').innerHTML = LESSONS.filter((l) => (l.chapter ?? 'electricity') === chapter).map((l) => {
    const done = progress.done.has(l.id);
    const cur = current?.def.id === l.id;
    return `<li><button class="nav-row ${cur ? 'is-active' : ''} ${done ? 'done' : ''}" type="button" data-id="${l.id}" ${l.build ? '' : 'disabled'}>
      <span class="nav-thumb">${lessonThumb(l) ? `<img src="${lessonThumb(l)}" alt="" />` : ''}</span>
      <span class="nav-text"><span class="nav-title">${l.num}. ${esc(l.title)}</span><span class="nav-sub">${esc(l.meta)}</span></span>
      ${l.build ? '' : '<span class="badge">Soon</span>'}
    </button></li>`;
  }).join('');
  $('#lessons').querySelectorAll('button:not(:disabled)').forEach((b) => { b.onclick = () => { location.hash = b.dataset.id; }; });
  $('#lessons .is-active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
$('#reset-progress').addEventListener('click', () => {
  progress.done.clear();
  progress.save();
  renderSidebar();
  if (current) renderPanel();
  toast('Progress cleared.');
});

const SWATCH = { battery: '#2f7f8e', plugkey: '#e0b45a', ammeter: '#343a4c', voltmeter: '#343a4c', resistor: '#d9c29a', bulb: '#f2bb3d', led: '#e0483a', board: '#4a5d99', breadboard: '#f5eee0' };
function renderBenchParts() {
  const parts = current ? Object.values(current.inst.parts) : [];
  $('#bench-parts').innerHTML = parts.map((p) => `
    <li><button class="nav-row part-row ${Math.abs(p.current ?? 0) > 1e-6 ? 'is-live' : ''}" type="button" data-name="${esc(p.name)}">
      <span class="swatch" style="background:${SWATCH[p.kind] ?? '#ccc'}"></span>
      <span class="nav-text"><span class="nav-title">${esc(p.name)}</span><span class="nav-sub">${esc(p.facts()[0]?.[1] ?? '')}</span></span>
    </button></li>`).join('');
  $('#bench-parts').querySelectorAll('button').forEach((b) => { b.onclick = () => select(parts.find((p) => p.name === b.dataset.name)); });
}

function renderQuick() {
  const parts = current ? Object.values(current.inst.parts) : [];
  $('#quick').innerHTML = parts.map((p, i) => `
    <button class="quick-card" type="button" data-name="${esc(p.name)}" style="animation-delay:${0.2 + i * 0.05}s">
      <img alt="" data-thumb="${esc(p.name)}" />
      <span><b>${esc(p.name.replace(/\s*\(.*\)$/, ''))}</b><i>${esc(INFO[p.kind]?.latin ?? INFO[p.kind]?.eyebrow ?? '')}</i></span>
    </button>`).join('');
  $('#quick').querySelectorAll('button').forEach((b) => { b.onclick = () => select(parts.find((p) => p.name === b.dataset.name)); });
}
function fillThumbs() {
  // Pictures are rendered once the parts are fully built (after the drop-in)
  if (!current) return;
  const parts = Object.values(current.inst.parts);
  document.querySelectorAll('[data-thumb]').forEach((img) => {
    const p = parts.find((x) => x.name === img.dataset.thumb);
    if (p && !img.src) img.src = partThumb(p);
  });
}

/* ───────── Lesson loading ───────── */

async function loadLesson(id) {
  const def = LESSONS.find((l) => l.id === id && l.build) || LESSONS[0];
  const token = ++loadToken;
  const old = current;
  selected = null;
  pins.clear();
  await exit(old?.ctx);
  if (token !== loadToken) return;
  if (old) { old.inst?.dispose?.(); old.ctx.dispose(); stage.lessonRoot.clear(); }

  stage.setDaylight(1);
  const ctx = makeCtx(def);
  current = { def, ctx, inst: null, step: 0, seen: new Set([0]), goals: new Set(), running: false, predicted: null, tab: 'circuit', hud: [] };
  current.inst = def.build(ctx);
  stage.setView({ ...def.view, el: ELEV.iso }, MOTION.fly.lesson);
  document.querySelectorAll('[data-view]').forEach((x) => x.classList.toggle('is-on', x.dataset.view === 'iso'));
  stage.lessonRoot.updateMatrixWorld(true);
  const built = enter(ctx.parts, ctx.wires);
  pins.set((current.inst.callouts ?? []).filter((c) => c.part));
  setTimeout(() => { if (token === loadToken) { pins.measure(); fillThumbs(); } }, ms(built) + 60);
  setCaption(def.caption ?? 'Click any part to see what it does.');
  renderSidebar();
  renderQuick();
  renderPanel();
  showStep(0);
  ctx.update();
  document.title = `${def.title} · Circuit Lab`;
}

function makeCtx(def) {
  const unsub = [];
  const ctx = {
    def,
    parts: [],
    wires: [],
    add(part) {
      stage.lessonRoot.add(part.group);
      ctx.parts.push(part);
      unsub.push(stage.onTick((dt, t) => part.tick(dt, t)));
      return part;
    },
    wire(a, b, opts) {
      const w = new Wire(a, b, opts);
      w.flowOn = flowOn;
      stage.lessonRoot.add(w.group);
      ctx.wires.push(w);
      return w;
    },
    removeWire(w) {
      stage.lessonRoot.remove(w.group);
      w.dispose();
      ctx.wires.splice(ctx.wires.indexOf(w), 1);
    },
    /** A wire added after the lesson is built (e.g. rewiring) draws itself in. */
    drawIn(w, delay = 0) {
      w.reveal(0); w.cap(0, 0); w.cap(1, 0);
      const m = MOTION.wire;
      T.add({ delay, duration: m.cap, ease: EASE.outBack, update: (k) => w.cap(0, k) });
      T.add({ delay: delay + m.cap * 0.45, duration: m.draw, ease: EASE.inOutCubic, update: (k) => w.reveal(k) });
      T.add({ delay: delay + m.cap * 0.45 + m.draw, duration: m.cap, ease: EASE.outBack, update: (k) => w.cap(1, k) });
    },
    hud(items) { if (current) { current.hud = items; renderStats(); } },
    toast,
    stage,
    get running() { return current?.running ?? false; },
    goal(id) {
      if (!current || current.goals.has(id)) return;
      current.goals.add(id);
      renderGoals();
      if (def.goals.every((g) => current.goals.has(g.id)) && !progress.done.has(def.id)) {
        progress.done.add(def.id);
        progress.save();
        renderSidebar();
        renderGoals();
        $('#progress').classList.remove('celebrate'); void $('#progress').offsetWidth; $('#progress').classList.add('celebrate');
        setTimeout(() => toast(`Lesson ${def.num} complete — well done!`, 'ok'), ms(0.4));
      }
    },
    /** Re-solve the circuit and redraw everything that depends on it. */
    update() {
      current?.inst?.update?.();
      renderFigure();
      renderBenchParts();
    },
    dispose() {
      unsub.forEach((f) => f());
      ctx.wires.forEach((w) => w.dispose());
    },
  };
  unsub.push(stage.onTick((dt) => ctx.wires.forEach((w) => w.tick(dt))));
  return ctx;
}

/* ───────── Panel ───────── */

function renderPanel() {
  if (!current) return;
  const panel = $('#panel');
  if (selected) { renderPartPanel(panel, selected); return; }
  const { def, inst } = current;
  const steps = def.steps.length;
  panel.innerHTML = `
    <div class="card reveal">
      <div class="eyebrow">Lesson ${def.num} · ${esc(def.meta)}</div>
      <h1>${esc(def.title)}</h1>
      <div class="chips">${(def.chips ?? []).map((c) => `<span class="chip">${esc(c)}</span>`).join('')}</div>
      <p class="intro">${def.intro}</p>
    </div>
    <div class="card readings-card"><div class="card-head"><span class="eyebrow">Live readings</span><span class="live-dot" id="live-dot">off</span></div><div class="stats" id="stats"></div></div>
    <div class="card">
      <div class="step-body" id="step-body"></div>
      <div class="step-nav">
        <button class="btn small" id="step-prev" type="button">‹ Back</button>
        <div class="dots" id="step-dots">${def.steps.map((_, i) => `<button type="button" aria-label="Step ${i + 1}" data-i="${i}"></button>`).join('')}</div>
        <button class="btn small" id="step-next" type="button">Next ›</button>
      </div>
    </div>
    <div class="card">
      <div class="try-head">
        <h2>Try it yourself</h2>
        <button class="run" id="run" type="button" aria-pressed="${current.running}"><svg viewBox="0 0 12 12" id="run-ico"></svg><span id="run-label"></span></button>
      </div>
      <div class="controls" id="controls"></div>
      <p class="run-note">${esc(inst.runNote ?? '')}</p>
    </div>
    <div class="card">
      <div class="try-head">
        <h2>${inst.code ? 'Circuit &amp; sketch' : 'Circuit diagram'}</h2>
        ${inst.code ? `<div class="tabs" role="tablist"><button role="tab" type="button" data-tab="circuit">Circuit</button><button role="tab" type="button" data-tab="code">Sketch</button></div>` : ''}
      </div>
      <div class="figure" id="figure"></div>
    </div>
    ${inst.notebook ? `<div class="card"><h2>${esc(inst.notebookTitle ?? 'Notebook')}</h2><div id="notebook"></div></div>` : ''}
    <div class="card">
      <h2>Goals</h2>
      <ul class="goals" id="goals"></ul>
      <div id="done"></div>
    </div>`;
  $('#step-prev').onclick = () => showStep(current.step - 1);
  $('#step-next').onclick = () => showStep(current.step + 1);
  $('#step-dots').querySelectorAll('button').forEach((b) => { b.onclick = () => showStep(+b.dataset.i); });
  panel.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { current.tab = b.dataset.tab; renderFigure(); }; });
  $('#run').onclick = () => setRunning(!current.running);
  renderRunButton();
  inst.controls($('#controls'));
  if (inst.notebook) inst.notebook($('#notebook'));
  renderStats();
  renderGoals();
  renderFigure();
  showStep(current.step, true);
}

function renderPartPanel(panel, part) {
  const info = INFO[part.kind] || { title: part.name, body: '' };
  const sym = symbolFor(part.kind);
  panel.innerHTML = `
    <div class="card reveal">
      <button class="back" type="button" id="back"><svg viewBox="0 0 24 24"><path d="m14 6-6 6 6 6"/></svg>Back to the lesson</button>
      <div class="eyebrow">${esc(info.eyebrow ?? 'Part')}${info.latin ? ` · ${esc(info.latin)}` : ''}</div>
      <h1>${esc(part.name)}</h1>
      <img class="thumb-hero" alt="" src="${partThumb(part)}" />
      ${sym ? `<div class="sym-box" title="Circuit symbol">${sym}</div>` : ''}
      <p class="intro">${esc(info.body)}</p>
    </div>
    <div class="card reveal">
      <h2>Right now</h2>
      <dl class="facts" id="facts"></dl>
      ${info.tip ? `<p class="caption" style="text-align:left;margin-top:12px">${esc(info.tip)}</p>` : ''}
      <div class="row" style="margin-top:14px"><button class="btn" type="button" id="zoom-to">Zoom to it</button></div>
    </div>`;
  $('#back').onclick = () => select(null);
  $('#zoom-to').onclick = () => {
    const box = new THREE.Box3().setFromObject(part.group);
    const size = box.getSize(new THREE.Vector3()).length();
    stage.focus(box.getCenter(new THREE.Vector3()), Math.min(12, Math.max(stage.camera.zoom, 40 / (size * 1.6))));
  };
  renderFacts();
}
function renderFacts() {
  const dl = document.getElementById('facts');
  if (!dl || !selected) return;
  const html = selected.facts().map(([k, v]) => `<div><span class="i">·</span><dt class="k">${esc(k)}</dt><dd class="v" style="margin:0">${esc(v)}</dd></div>`).join('');
  if (dl.innerHTML !== html) dl.innerHTML = html;
}
setInterval(renderFacts, 300);

let lastStats = {};
function renderStats() {
  const el = document.getElementById('stats');
  if (!el || !current) return;
  const dot = document.getElementById('live-dot');
  if (dot) { dot.textContent = current.running ? 'live' : 'off'; dot.classList.toggle('on', current.running); }
  el.innerHTML = current.hud.slice(0, 3).map((r) => {
    const [num, unit] = splitUnit(r.value);
    const changed = lastStats[r.label] != null && lastStats[r.label] !== r.value;
    lastStats[r.label] = r.value;
    const word = !/^-?[\d.,]+$/.test(num);
    const long = !word && num.length + unit.length > 6;
    return `<div class="stat ${r.tone || ''} ${changed ? 'flash' : ''} ${word ? 'word' : ''} ${long ? 'long' : ''}"><b>${esc(num)}${unit ? `<small>${esc(unit)}</small>` : ''}</b><span>${esc(r.label)}</span></div>`;
  }).join('');
}
function splitUnit(v) {
  const m = String(v).match(/^(-?[\d.,]+)\s*(.*)$/);
  return m ? [m[1], m[2]] : [v, ''];
}

function renderRunButton() {
  const btn = $('#run');
  if (!btn) return;
  const labels = current.inst.runLabel ?? ['Run', 'Stop'];
  btn.setAttribute('aria-pressed', String(current.running));
  $('#run-label').textContent = current.running ? labels[1] : labels[0];
  $('#run-ico').innerHTML = current.running ? '<rect x="2" y="2" width="8" height="8" rx="1"/>' : '<path d="M3 1.5v9l8-4.5z"/>';
}

function renderFigure() {
  const fig = document.getElementById('figure');
  if (!fig || !current) return;
  const { inst } = current;
  const tab = inst.code ? current.tab : 'circuit';
  document.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  fig.innerHTML = tab === 'code' ? inst.code() : inst.schematic();
}

function renderGoals() {
  const ul = document.getElementById('goals');
  if (!ul || !current) return;
  const { def, goals } = current;
  ul.innerHTML = def.goals.map((g) => `<li class="${goals.has(g.id) ? 'met' : ''}"><span class="box"></span><span>${esc(g.text)}</span></li>`).join('');
  const done = progress.done.has(def.id);
  const next = LESSONS.find((l) => l.num === def.num + 1);
  $('#done').innerHTML = done ? `
    <div class="done-banner"><div><div class="eyebrow">Complete</div><b>Lesson ${def.num} done</b></div>
    ${next?.build ? `<a class="btn primary" href="#${next.id}">Next lesson ›</a>` : '<span class="chip">More lessons soon</span>'}</div>` : '';
}

function showStep(i, quiet = false) {
  if (!current || !document.getElementById('step-body')) return;
  const { def, inst } = current;
  i = Math.max(0, Math.min(def.steps.length - 1, i));
  const changed = i !== current.step;
  current.step = i;
  current.seen.add(i);
  const s = def.steps[i];
  const body = $('#step-body');
  body.innerHTML = `
    <div class="eyebrow">Step ${i + 1} of ${def.steps.length}${s.predict ? ' · Predict first' : ''}</div>
    <h3>${esc(s.title)}</h3>
    ${s.text}
    ${s.predict ? `<div class="predict" id="predict">${s.predict.options.map((o, k) => `<button type="button" data-k="${k}">${esc(o.t)}</button>`).join('')}</div><div id="predict-fb"></div>` : ''}`;
  if (changed || !quiet) { body.classList.remove('reveal'); void body.offsetWidth; body.classList.add('reveal'); }
  if (s.predict) {
    body.querySelectorAll('#predict button').forEach((b) => { b.onclick = () => answerPredict(s.predict, +b.dataset.k); });
    if (current.predicted != null) answerPredict(s.predict, current.predicted, true);
  }
  $('#step-prev').disabled = i === 0;
  $('#step-next').disabled = i === def.steps.length - 1;
  $('#step-dots').querySelectorAll('button').forEach((b, k) => {
    b.setAttribute('aria-current', String(k === i));
    b.classList.toggle('seen', current.seen.has(k));
  });
  inst.onStep?.(i, s);
  pins.setLook((s.look || []).map((k) => inst.parts[k]));
  if (i === def.steps.length - 1) current.ctx.goal('steps');
}

function answerPredict(pred, k, quiet = false) {
  current.predicted = k;
  const buttons = document.querySelectorAll('#predict button');
  buttons.forEach((b, j) => {
    b.disabled = true;
    b.classList.toggle('right', !!pred.options[j].right);
    b.classList.toggle('wrong', j === k && !pred.options[j].right);
  });
  const right = pred.options[k].right;
  $('#predict-fb').innerHTML = `<div class="feedback"><b>${right ? 'Right.' : 'Not quite.'}</b> ${pred.explain}</div>`;
  if (!quiet) current.ctx.goal('predict');
}

function setRunning(on) {
  if (!current) return;
  current.running = on;
  renderRunButton();
  current.inst.run(on);
  current.ctx.update();
}

/* ───────── Routing ───────── */

function route() {
  const id = location.hash.slice(1);
  if (current && current.def.id === id) return;
  loadLesson(id || LESSONS[0].id);
}
window.addEventListener('hashchange', route);
route();
// Lesson pictures in the sidebar are drawn after the first frame, so the bench shows first
requestAnimationFrame(() => setTimeout(renderSidebar, 50));
// For scripted screenshots and debugging
window.__circuit = { stage, select: (name) => select(Object.values(current.inst.parts).find((p) => p.name === name) ?? null), get current() { return current; }, setRunning };
