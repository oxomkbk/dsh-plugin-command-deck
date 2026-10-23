// ─────────────────────────────────────────────────────────────────────────────
// HUD dock: result panels live in three fixed docks around the globe —
//   LEFT column · RIGHT column · BOTTOM strip — so nothing ever has to be panned,
//   zoomed or hunted for. Every panel is reachable with one click / one pinch.
//
// Panel operations (shared by mouse, touch and hand gestures — same methods):
//   focus · expand to the centre stage (3D fly-out) · collapse to its title · close/undo/reopen
//   drag its title to another dock or position (live drop marker) · splitter resize
//   two-hand scale (content zoom when expanded, dock share when docked)
// Multiple workspaces: each has its own panels + results; switching swings the globe.
// The Card-compatible surface (body, meta, el, def, s, arrive…) keeps every renderer unchanged.
// ─────────────────────────────────────────────────────────────────────────────
import { bus } from '../core/bus.js';
import { load, save, settings } from '../core/store.js';
import { t } from '../core/i18n.js';
import { decode, GLYPHS } from '../fx/anim.js';

export const CARD_DEFS = [
  { id: 'sessions', title: 'SESSIONS',       code: 'S-01', icon: 'sessions' },
  { id: 'taskgraph', title: 'TASK GRAPH',    code: 'A-02', icon: 'graph' },
  { id: 'trace',    title: 'AGENT TRACE',    code: 'A-01', icon: 'trace' },
  { id: 'summary',  title: 'ANSWER',         code: 'R-01', icon: 'summary' },
  { id: 'images',   title: 'IMAGE GRID',     code: 'R-02', icon: 'images' },
  { id: 'metrics',  title: 'KEY DATA',       code: 'R-03', icon: 'metrics' },
  { id: 'timeline', title: 'TIMELINE',       code: 'R-04', icon: 'timeline' },
  { id: 'sources',  title: 'SOURCES',        code: 'R-05', icon: 'sources' },
  { id: 'analytics', title: 'ANALYTICS',     code: 'R-06', icon: 'analytics' },
  { id: 'terminal', title: 'TOOL OUTPUT',    code: 'T-01', icon: 'terminal' },
];
// [slot, order, flex, closed?]
export const PRESETS = {
  command:  { sessions: ['left', -1, 0.85], summary: ['left', 0, 1.45], metrics: ['left', 1, 1], sources: ['left', 2, 0.9], taskgraph: ['right', 0, 1.15], trace: ['right', 1, 1.15], images: ['right', 2, 1], timeline: ['bottom', 0, 1], analytics: ['bottom', 1, 1.1], terminal: ['bottom', 2, 1, true] },
  results:  { sessions: ['left', -1, 0.85], summary: ['left', 0, 1.6], sources: ['left', 1, 1], images: ['right', 0, 1.4], metrics: ['right', 1, 1], timeline: ['bottom', 0, 1.2], analytics: ['bottom', 1, 1], taskgraph: ['bottom', 2, 1], trace: ['right', 2, 1, true], terminal: ['right', 3, 1, true] },
  operator: { sessions: ['left', -1, 0.85], taskgraph: ['left', 0, 1.3], trace: ['left', 1, 1.5], terminal: ['left', 2, 1, true], summary: ['right', 0, 1.3], images: ['right', 1, 1], metrics: ['right', 2, 1], analytics: ['bottom', 0, 1], sources: ['bottom', 1, 1], timeline: ['bottom', 2, 1] },
};
export const SLOTS = ['left', 'right', 'bottom'];
const PANEL_ICONS = {
  sessions: '<path d="M4.5 6.5h15M4.5 12h15M4.5 17.5h9"/><circle cx="19.5" cy="17.5" r="1.4"/>',
  trace: '<path d="M3 12h4l2-5 4 10 2-5h6"/>',
  summary: '<path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  images: '<rect x="3.5" y="5" width="17" height="14" rx="1"/><path d="m4 17 5-5 4 4 3-3 4 4"/><circle cx="15.5" cy="9" r="1.4"/>',
  metrics: '<circle cx="12" cy="12" r="8"/><path d="M12 4v8l6 4"/>',
  timeline: '<path d="M3 12h18"/><circle cx="7" cy="12" r="1.8"/><circle cx="13" cy="12" r="1.8"/><circle cx="18" cy="12" r="1.8"/><path d="M7 6v3M13 15v3M18 6v3"/>',
  sources: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  terminal: '<rect x="3" y="4.5" width="18" height="15" rx="1"/><path d="m7 9 3 3-3 3M12.5 15H17"/>',
  analytics: '<path d="M4 20V4M4 20h16"/><path d="M8 16v-4M12 16V8M16 16v-6M20 16v-9"/>',
  graph: '<circle cx="5" cy="12" r="2.2"/><circle cx="12" cy="6" r="2.2"/><circle cx="12" cy="18" r="2.2"/><circle cx="19" cy="12" r="2.2"/><path d="M7 11 10 7M7 13l3 4M14 7l3 4M14 17l3-4"/>',
};
const svg = (d) => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const LKEY = (i) => `dock5.ws${i}`;
/** True for content that scrolls only sideways (e.g. the timeline in the bottom dock). */
export const sidewaysOnly = (b) => b.scrollWidth > b.clientWidth + 4 && (getComputedStyle(b).overflowY === 'hidden' || b.scrollHeight <= b.clientHeight + 4);

function presetState(def, name = 'command') {
  const p = PRESETS[name][def.id] || ['right', 9, 1, true];
  return { slot: p[0], order: p[1], flex: p[2], closed: !!p[3], min: false, max: false, zoom: 1 };
}

// ═════════════════════════════════════════════════════════════ panel
export class Panel {
  constructor(ws, def, state) {
    this.ws = ws; this.def = def; this.id = def.id; this.type = def.id;
    const fin = (v, d) => (Number.isFinite(v) ? v : d);
    this.s = { ...presetState(def), ...state, max: false };
    if (!SLOTS.includes(this.s.slot)) this.s.slot = presetState(def).slot;
    this.s.flex = Math.max(0.25, Math.min(6, fin(this.s.flex, 1))); this.s.zoom = Math.max(0.7, Math.min(2.2, fin(this.s.zoom, 1)));
    const el = this.el = document.createElement('section');
    el.className = 'card';
    el.dataset.card = this.id;
    el.innerHTML = `<header class="card-h"><i class="led"></i>${svg(PANEL_ICONS[def.icon] || '')}<span class="title"></span><span class="code">${def.code}</span><span class="meta"></span>
        <div class="card-btns">
          <button data-act="min" data-i18n-title="Collapse / expand">${svg('<path d="M6 12h12"/>')}</button>
          <button data-act="max" data-i18n-title="Focus on the centre stage (double-click title)">${svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>')}</button>
          <button data-act="close" data-i18n-title="Close (undo available)">${svg('<path d="m6 6 12 12M18 6 6 18"/>')}</button>
        </div></header>
      <div class="card-body"></div>
      <div class="split" data-i18n-title="Drag to resize"></div>
      <i class="crn a"></i><i class="crn b"></i><i class="crn c"></i><i class="crn d"></i>
      <div class="sheen" aria-hidden="true"><i></i></div>`;
    this.body = el.querySelector('.card-body');
    this.meta = el.querySelector('.meta');
    this.relabel();
    this.bindMouse();
    this.apply();
  }
  apply() {
    const s = this.s, el = this.el;
    el.hidden = s.closed;
    el.classList.toggle('min', s.min);
    el.style.flexGrow = s.min ? 0 : s.flex;
    el.style.setProperty('--zoom', s.zoom);
    el.dataset.slot = s.slot;
  }
  /** Localised title + button tooltips (called again on language change). */
  relabel() {
    this.el.querySelector('.title').textContent = t(this.def.title);
    for (const b of this.el.querySelectorAll('[data-i18n-title]')) b.title = t(b.dataset.i18nTitle);
  }
  get label() { return t(this.def.title); }
  changed(kind = 'geom') { this.apply(); bus.emit('card:changed', { card: this, kind }); this.el.dispatchEvent(new CustomEvent('card-resize')); }

  focus() {
    for (const c of this.ws.cards.values()) c.el.classList.toggle('focus', c === this);
    this.ws.focused = this;
  }
  toFront() { this.focus(); }
  toggleMin() { if (this.s.max) this.toggleMax(); this.s.min = !this.s.min; this.changed('min'); }
  /** Expand to the centre stage (FLIP fly-out from the dock) / return to the dock. */
  toggleMax() {
    const el = this.el, layer = document.getElementById('max-layer'), from = el.getBoundingClientRect();
    this.s.max = !this.s.max;
    if (this.s.max) {
      for (const c of this.ws.cards.values()) if (c !== this && c.s.max) c.toggleMax();
      this.s.min = false; this.apply();
      this.ghost = document.createElement('div'); this.ghost.className = 'ghost-slot'; this.ghost.textContent = t('{title} · ON STAGE', { title: this.label });
      this.ghost.style.flexGrow = this.s.flex; el.replaceWith(this.ghost);
      layer.append(el); el.classList.add('max'); layer.classList.add('on');
      this.focus();
    } else {
      el.classList.remove('max');
      if (this.ghost?.isConnected) this.ghost.replaceWith(el); else this.ws.deck.mount();
      this.ghost = null;
      if (!layer.querySelector('.card')) layer.classList.remove('on');
    }
    const to = el.getBoundingClientRect();
    if (from.width && to.width) {
      const dx = from.left - to.left, dy = from.top - to.top, sx = from.width / to.width, sy = from.height / to.height;
      el.animate([{ transformOrigin: '0 0', transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 0.6 },
        { transformOrigin: '0 0', transform: 'none', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.2,1,.3,1)' });
    }
    this.changed('max');
  }
  close() {
    if (this.s.max) this.toggleMax();
    this.s.closed = true; this.changed('close');
    bus.emit('card:closed', this);
  }
  open() { this.s.closed = false; this.changed('open'); this.focus(); this.materialize(); this.arrive(); }
  /** Holographic power-on: a bright line opens into the panel (transform/opacity only), the title decodes,
   *  a scan sweeps the body. `dir` = side it slides in from (-1 left, 1 right, 0 none). */
  materialize(delay = 0, dir = 0) {
    if (!settings.animations || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const [frames, opts] = (MOTION[document.body.dataset.motion] || MOTION.holo)(dir);
    this.el.animate(frames, { delay, fill: 'backwards', ...opts });
    setTimeout(() => {
      if (this.s.closed) return;
      const el = this.el.querySelector('.title');
      decode(el, t(this.def.title), 520, GLYPHS);
      this.el.classList.remove('scan'); void this.el.offsetWidth; this.el.classList.add('scan');
    }, delay + 260);
  }
  resetSize() { this.s.flex = presetState(this.def).flex; this.s.zoom = 1; this.changed(); }

  // ── drag the title: the panel floats under the pointer, a placeholder keeps its place in the dock (nothing
  //    else moves while you drag), a marker shows where it will dock. The drop target only changes after the
  //    pointer has rested on it for a moment, and releasing near home (or cancelling) glides it back unchanged.
  beginMove(sx, sy) {
    if (this.s.max || this.op || settings.layoutLock || document.body.classList.contains('zoomed')) return false;   // no re-docking while magnified
    this.focus();
    this.flatDock = this.el.closest('.dock'); this.flatDock?.classList.add('flat');   // the 3D-tilted dock lies flat while a panel is lifted out of it
    const r = this.el.getBoundingClientRect();
    this.op = { kind: 'move', sx, sy, r, drop: null, cand: null, since: 0 };
    this.hold = document.createElement('div'); this.hold.className = 'slot-hold';
    this.hold.style.flexGrow = this.s.min ? 0 : this.s.flex;
    if (this.ws.deck.docks[this.s.slot]?.classList.contains('row')) this.hold.style.minWidth = `${r.width}px`; else this.hold.style.minHeight = `${r.height}px`;
    this.el.before(this.hold);
    this.el.classList.add('grabbed', 'floating');
    Object.assign(this.el.style, { width: `${r.width}px`, height: `${Math.min(r.height, 320)}px`, left: `${r.left}px`, top: `${r.top}px` });
    return true;
  }
  /** `settle` (ms): how long a new drop target must hold before it is taken — hands use ~140 ms, the mouse 0. */
  moveTo(dx, dy, { settle = 0, now = performance.now() } = {}) {
    if (this.op?.kind !== 'move') return;
    const op = this.op; op.px = op.sx + dx; op.py = op.sy + dy;
    this.el.style.transform = `translate(${dx}px, ${dy}px)`;
    const home = op.r, nearHome = op.px > home.left - 30 && op.px < home.right + 30 && op.py > home.top - 30 && op.py < home.top + Math.min(home.height, 320) + 30;
    const cand = nearHome ? null : this.ws.deck.dropTarget(op.px, op.py, this);
    const key = cand ? `${cand.slot}:${cand.index}` : '';
    if (!op.cand || key !== op.cand.key) { op.cand = { key, drop: cand }; op.since = now; }
    if (now - op.since >= settle && op.drop !== op.cand.drop) { op.drop = op.cand.drop; this.ws.deck.showDrop(op.drop); }
  }
  /** Commit the drop (or glide home when there is no target / `cancel`). */
  endMove(cancel = false) {
    const op = this.op; this.op = null; if (!op || op.kind !== 'move') return;
    this.ws.deck.showDrop(null);
    const from = this.el.getBoundingClientRect();
    const drop = cancel ? null : op.drop;
    const hold = this.hold; this.hold = null;
    this.el.classList.remove('grabbed', 'floating');
    for (const k of ['width', 'height', 'left', 'top', 'transform']) this.el.style[k] = '';
    this.flatDock?.classList.remove('flat'); this.flatDock = null;                 // after the panel stopped floating (fixed inside a 3D dock would jump)
    const same = drop && drop.slot === this.s.slot && drop.index === this.ws.inSlot(this.s.slot).filter((c) => !c.s.closed).indexOf(this);
    if (drop && !same) { hold?.remove(); this.ws.deck.dockAt(this, drop.slot, drop.index); return; }
    hold?.replaceWith(this.el);
    const to = this.el.getBoundingClientRect();
    if (to.width && from.width) this.el.animate([{ transform: `translate(${from.left - to.left}px, ${from.top - to.top}px)`, opacity: 0.85 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.2,1,.3,1)' });
    this.changed('snap');
  }
  // ── splitter: resize against the next panel in the same dock
  beginResize(dir, sx, sy) {
    if (this.s.max || this.s.min || this.op || settings.layoutLock) return false;
    const next = this.ws.deck.neighbour(this); if (!next) return false;
    const horiz = this.s.slot === 'bottom', r = this.el.getBoundingClientRect(), rn = next.el.getBoundingClientRect();
    this.op = { kind: 'resize', sx, sy, horiz, next, a: horiz ? r.width : r.height, b: horiz ? rn.width : rn.height, fa: this.s.flex, fb: next.s.flex };
    this.el.classList.add('resizing');
    return true;
  }
  resizeTo(dx, dy) {
    if (this.op?.kind !== 'resize') return;
    const o = this.op, d = o.horiz ? dx : dy, tot = o.a + o.b, a = Math.max(90, Math.min(tot - 90, o.a + d));
    const ft = o.fa + o.fb; this.s.flex = ft * a / tot; o.next.s.flex = ft - this.s.flex;
    this.apply(); o.next.apply();
    this.el.dispatchEvent(new CustomEvent('card-resize')); o.next.el.dispatchEvent(new CustomEvent('card-resize'));
  }
  endResize() { const o = this.op; this.op = null; this.el.classList.remove('resizing'); if (o) { o.next.changed('snap'); this.changed('snap'); } }

  /** Two-hand spread / eased command: content zoom when on stage, dock share when docked. */
  scaleBy(f) {
    if (this.s.max) this.s.zoom = Math.max(0.7, Math.min(2.2, this.s.zoom * f));
    else this.s.flex = Math.max(0.25, Math.min(6, this.s.flex * f));
    this.changed();
  }
  scaleAbout(f) { this.scaleBy(f); }
  scaleTo(f, ms = 260) {
    const t0 = performance.now(); let last = 1;
    const step = () => { const k = Math.min(1, (performance.now() - t0) / ms), cur = 1 + (f - 1) * (1 - Math.pow(1 - k, 3)); this.scaleBy(cur / last); last = cur; if (k < 1) requestAnimationFrame(step); };
    step();
  }
  rotateBy() {}
  setRotation() {}

  /** Data-arrival flash; resolves when the animation finishes (used for render_complete). */
  arrive() {
    if (this.s.closed) return Promise.resolve();
    this.el.classList.remove('scan'); void this.el.offsetWidth; this.el.classList.add('scan');
    const a = this.el.animate([{ boxShadow: '0 0 0 1px #fff, 0 0 50px rgba(var(--accent-rgb),.85)' }, { boxShadow: '0 0 0 0 transparent' }], { duration: 700, easing: 'ease-out' });
    return a.finished.catch(() => {});
  }
  /** Screen point where data streams from the globe enter this panel (edge facing the globe). */
  anchor() {
    const r = (this.s.max || this.s.closed ? null : this.el.getBoundingClientRect());
    if (!r || !r.width) return null;
    if (this.s.slot === 'left') return { x: r.right, y: r.top + Math.min(r.height / 2, 120) };
    if (this.s.slot === 'right') return { x: r.left, y: r.top + Math.min(r.height / 2, 120) };
    return { x: r.left + r.width / 2, y: r.top };
  }
  center() { const r = this.el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
  rect() { const r = this.el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }
  zone(x, y) {
    const t = document.elementFromPoint(x, y);
    if (!t || !this.el.contains(t)) return null;
    if (t.closest('.split')) return { zone: 'edge', dir: this.s.slot === 'bottom' ? 'e' : 's' };
    if (t.closest('.card-btns')) return { zone: 'control', el: t };
    if (t.closest('.card-h')) return { zone: 'title' };
    return { zone: 'body', el: t };
  }

  bindMouse() {
    const el = this.el, head = el.querySelector('.card-h');
    el.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'hand') this.focus(); }, true);
    head.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('button')) return;
      const sx = e.clientX, sy = e.clientY, id = e.pointerId; let started = false;
      // only becomes a drag after 6 px, so a plain click / double-click on the title stays a click
      const mv = (ev) => {
        if (ev.pointerId !== id) return;
        if (!started && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 6) started = this.beginMove(sx, sy);
        if (started) this.moveTo(ev.clientX - sx, ev.clientY - sy);
      };
      const up = (ev) => { if (ev.pointerId !== id) return; removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); if (started) this.endMove(ev.type === 'pointercancel'); };
      addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
    });
    el.querySelector('.split').addEventListener('pointerdown', (e) => {
      if (!this.beginResize('s', e.clientX, e.clientY)) return;
      this.track(e, (dx, dy) => this.resizeTo(dx, dy), () => this.endResize());
    });
    head.addEventListener('dblclick', (e) => { if (!e.target.closest('button')) this.toggleMax(); });
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]'); if (!b || !el.contains(b) || b.closest('.card-body')) return;
      ({ min: () => this.toggleMin(), max: () => this.toggleMax(), close: () => this.close() })[b.dataset.act]?.();
    });
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); bus.emit('radial:open', { x: e.clientX, y: e.clientY, card: this }); });
    this.body.addEventListener('wheel', (e) => {
      e.stopPropagation();
      const b = this.body;   // content that only scrolls sideways (the bottom-dock timeline) takes the vertical wheel as horizontal
      if (!e.shiftKey && Math.abs(e.deltaY) > Math.abs(e.deltaX) && sidewaysOnly(b)) { b.scrollLeft += e.deltaY; e.preventDefault(); }
    }, { passive: false });
  }
  track(e, onMove, onEnd) {
    e.preventDefault(); e.stopPropagation();
    const id = e.pointerId, sx = e.clientX, sy = e.clientY;
    const mv = (ev) => { if (ev.pointerId === id) onMove(ev.clientX - sx, ev.clientY - sy); };
    const up = (ev) => { if (ev.pointerId !== id) return; removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); onEnd(); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  }
  serialize() { const { slot, order, flex, closed, min, zoom } = this.s; return { slot, order, flex, closed, min, zoom }; }
}

// ═════════════════════════════════════════════════════════════ workspace
/** Panel entrances, one per design language (themes.js → motion). Transform/opacity only. dir: -1 left dock, 1 right, 0 bottom. */
const MOTION = {
  holo: (dir) => [[{ opacity: 0, transform: `translateX(${dir * 46}px) scale(.92, .015)` }, { opacity: 1, transform: `translateX(${dir * 12}px) scale(1, .015)`, offset: 0.3 },
    { opacity: 0.55, offset: 0.42 }, { opacity: 1, transform: 'none', offset: 0.75 }, { opacity: 0.85, offset: 0.82 }, { opacity: 1, transform: 'none' }], { duration: 760, easing: 'cubic-bezier(.2,1,.3,1)' }],
  // BLUEPRINT: the outline is drawn first (a thin line grows across), then the sheet unfolds downward
  draw: () => [[{ opacity: 0, transform: 'scale(0, .006)', transformOrigin: '0 0' }, { opacity: 1, transform: 'scale(1, .006)', transformOrigin: '0 0', offset: 0.45 },
    { opacity: 1, transform: 'none', transformOrigin: '0 0' }], { duration: 820, easing: 'cubic-bezier(.65,0,.35,1)' }],
  // TERMINAL: the pane prints line by line (stepped reveal from the top)
  type: () => [[{ opacity: 0, transform: 'scaleY(0)', transformOrigin: '50% 0' }, { opacity: 1, transform: 'none', transformOrigin: '50% 0' }], { duration: 520, easing: 'steps(9, end)' }],
  // BRUTALIST: drops in and slams with a hard overshoot — no fade
  snap: () => [[{ transform: 'translate(10px, -26px)' }, { transform: 'translate(-3px, 4px)', offset: 0.7 }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.3,1.6,.6,1)' }],
  // APOLLO: hardware slides out of the console on a rail
  mech: (dir) => [[{ opacity: 0, transform: dir ? `translateX(${dir * 110}%)` : 'translateY(110%)' }, { opacity: 1, transform: 'none' }], { duration: 640, easing: 'cubic-bezier(.16,1,.3,1)' }],
  // MECHA / NEON: slashes in sideways at an angle, overshoots, locks
  slam: (dir) => [[{ opacity: 0, transform: `translateX(${(dir || -1) * 70}px) skewX(${(dir || -1) * -14}deg)` }, { opacity: 1, transform: `translateX(${(dir || -1) * -8}px) skewX(${(dir || -1) * 3}deg)`, offset: 0.6 },
    { opacity: 1, transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.2,1,.3,1)' }],
  // GLASS / AURORA / ARCTIC: floats up from depth on a soft spring
  float: () => [[{ opacity: 0, transform: 'translateY(34px) scale(.9)' }, { opacity: 1, transform: 'translateY(-4px) scale(1.01)', offset: 0.7 }, { opacity: 1, transform: 'none' }], { duration: 760, easing: 'cubic-bezier(.2,.9,.25,1)' }],
  // MONOLITH / VISOR: a slow, quiet fade with a slight settle
  fade: () => [[{ opacity: 0, transform: 'scale(1.02)' }, { opacity: 1, transform: 'none' }], { duration: 1100, easing: 'cubic-bezier(.25,.1,.25,1)' }],
};

class Workspace {
  constructor(deck, index) {
    this.deck = deck; this.index = index;
    const saved = load(LKEY(index), null);
    this.cards = new Map();
    for (const def of CARD_DEFS) this.cards.set(def.id, new Panel(this, def, saved?.cards?.[def.id] || presetState(def)));
    this.focused = null;
    this.data = { dashboard: null, prompt: '', sample: false };
  }
  open() { return [...this.cards.values()].filter((c) => !c.s.closed); }
  inSlot(slot) { return [...this.cards.values()].filter((c) => c.s.slot === slot).sort((a, b) => a.s.order - b.s.order); }
  applyPreset(name, { reopen = true } = {}) {
    if (!PRESETS[name]) return;
    for (const c of this.cards.values()) {
      if (c.s.max) c.toggleMax();
      const st = presetState(c.def, name);
      Object.assign(c.s, st, reopen ? {} : { closed: c.s.closed });
      c.apply();
    }
    if (this === this.deck.ws) { this.deck.mount(); this.deck.emergeAll({ stagger: 50 }); }
    this.persist();
    for (const c of this.cards.values()) c.el.dispatchEvent(new CustomEvent('card-resize'));
  }
  snapshot() { return { cards: Object.fromEntries([...this.cards].map(([id, c]) => [id, c.serialize()])) }; }
  restore(snap) {
    for (const [id, s] of Object.entries(snap.cards || {})) { const c = this.cards.get(id); if (c) { if (c.s.max) c.toggleMax(); Object.assign(c.s, s, { max: false }); c.apply(); } }
    if (this === this.deck.ws) this.deck.mount();
    this.persist();
  }
  persist() { save(LKEY(this.index), this.snapshot()); }
}

// ═════════════════════════════════════════════════════════════ deck (dock manager)
export class Deck {
  constructor(space, { count = 4 } = {}) {
    this.space = space;
    this.stage = document.getElementById('stage');
    this.docks = Object.fromEntries(SLOTS.map((s) => [s, document.getElementById(`dock-${s}`)]));
    this.marker = document.createElement('div'); this.marker.className = 'drop-marker'; this.marker.hidden = true; document.body.append(this.marker);
    this.workspaces = Array.from({ length: count }, (_, i) => new Workspace(this, i));
    this.active = 0;
    this.closed = [];
    this.mount();
    this.bindStage();
    bus.on('card:changed', ({ card, kind }) => {
      clearTimeout(this._p); this._p = setTimeout(() => card.ws.persist(), 300);
      if (['close', 'open', 'min', 'max'].includes(kind) && card.ws === this.ws) { this.syncDocks(); this.emptyCheck(); }
    });
    bus.on('card:closed', (card) => {
      this.closed.push(card);
      bus.emit('toast', { text: t('{title} closed', { title: card.label }), action: t('UNDO'), run: () => card.open(), kind: 'warn' });
    });
    bus.on('lang:changed', () => { for (const w of this.workspaces) for (const c of w.cards.values()) c.relabel(); });
    addEventListener('resize', () => this.layoutChanged());
  }
  get ws() { return this.workspaces[this.active]; }
  get view() { return { z: this.space.zoom }; }
  card(id) { return this.ws.cards.get(id); }
  tick() {}

  /** Put the active workspace's panels into their docks (in order). */
  mount() {
    for (const slot of SLOTS) {
      const list = this.ws.inSlot(slot);
      list.forEach((c, i) => { c.s.order = i; });
      const els = list.map((c) => (c.s.max && c.ghost ? c.ghost : c.el)).filter((e) => !e.closest?.('#max-layer'));
      this.docks[slot].replaceChildren(...els);
    }
    this.syncDocks();
  }
  /** Docks with nothing visible collapse, giving the globe the room. */
  syncDocks() {
    for (const slot of SLOTS) {
      const vis = this.ws.inSlot(slot).filter((c) => !c.s.closed).length;
      this.docks[slot].classList.toggle('empty', !vis);
      document.body.classList.toggle(`no-${slot}`, !vis);
    }
    this.layoutChanged();
  }
  layoutChanged() { cancelAnimationFrame(this._lr); this._lr = requestAnimationFrame(() => bus.emit('layout:changed')); }
  neighbour(card) { const list = this.ws.inSlot(card.s.slot).filter((c) => !c.s.closed && !c.s.min); const i = list.indexOf(card); return list[i + 1] || null; }

  // ── drag & drop between docks
  dropTarget(x, y, moving) {
    let best = null;
    for (const slot of SLOTS) {
      const d = this.docks[slot].getBoundingClientRect();
      const r = d.width && d.height ? d : this.dockFallback(slot);
      const dist = Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
      if (dist < 140 && (!best || dist < best.dist)) best = { slot, dist, r };
    }
    if (!best) return null;
    const horiz = best.slot === 'bottom';
    const list = this.ws.inSlot(best.slot).filter((c) => c !== moving && !c.s.closed);
    let index = list.length;
    for (let i = 0; i < list.length; i++) { const r = list[i].el.getBoundingClientRect(); if (horiz ? x < r.left + r.width / 2 : y < r.top + r.height / 2) { index = i; break; } }
    let mark;
    if (!list.length) mark = { x: best.r.left, y: best.r.top, w: best.r.width, h: best.r.height, full: true };
    else if (index < list.length) { const r = list[index].el.getBoundingClientRect(); mark = horiz ? { x: r.left - 4, y: r.top, w: 3, h: r.height } : { x: r.left, y: r.top - 4, w: r.width, h: 3 }; }
    else { const r = list[list.length - 1].el.getBoundingClientRect(); mark = horiz ? { x: r.right + 2, y: r.top, w: 3, h: r.height } : { x: r.left, y: r.bottom + 2, w: r.width, h: 3 }; }
    return { slot: best.slot, index, mark };
  }
  dockFallback(slot) {
    const W = innerWidth, H = innerHeight, cw = Math.min(460, Math.max(300, W * 0.25));
    return slot === 'left' ? { left: 0, right: cw, top: 70, bottom: H - 70 } : slot === 'right' ? { left: W - cw, right: W, top: 70, bottom: H - 70 } : { left: cw, right: W - cw, top: H - 260, bottom: H - 70 };
  }
  showDrop(drop) {
    const m = this.marker; m.hidden = !drop;
    for (const s of SLOTS) this.docks[s].classList.toggle('drop-hot', !!drop && s === drop.slot);
    if (!drop) return;
    Object.assign(m.style, { left: `${drop.mark.x}px`, top: `${drop.mark.y}px`, width: `${drop.mark.w}px`, height: `${drop.mark.h}px` });
    m.classList.toggle('full', !!drop.mark.full);
  }
  dockAt(card, slot, index) {
    for (const s of SLOTS) this.docks[s].classList.remove('drop-hot');
    const list = this.ws.inSlot(slot).filter((c) => c !== card);
    list.splice(Math.min(index, list.length), 0, card);
    card.s.slot = slot; card.s.closed = false; card.s.min = false;
    list.forEach((c, i) => { c.s.order = i; c.apply(); });
    // keep hidden panels of the old dock in order too
    this.mount();
    card.changed('dock'); this.emptyCheck();
    card.el.animate([{ opacity: 0.4, transform: 'scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'ease-out' });
  }

  // ── camera (the globe)
  pan(dx, dy) { this.space.rotateBy(dx, dy); }
  zoomAt(px, py, f) { this.space.zoomBy(f); bus.emit('view:zoom', this.space.zoom); }
  zoomBy(f) { this.zoomAt(innerWidth / 2, innerHeight / 2, f); }
  centerOn() {}
  resetView() { this.space.resetView(); }
  fit() { this.space.resetView(); return Promise.resolve(); }
  fitTarget() { return {}; }

  /** Entrance: panels fly in from the globe side, staggered. */
  emergeAll({ stagger = 70 } = {}) {
    const cards = this.ws.open();
    cards.forEach((c, i) => c.materialize(120 + i * stagger, c.s.slot === 'left' ? -1 : c.s.slot === 'right' ? 1 : 0));
  }

  // ── workspaces: docks fold away, the globe swings, the next set unfolds
  switchTo(i, dir = 1) {
    i = (i + this.workspaces.length) % this.workspaces.length;
    if (i === this.active) return;
    const old = this.ws; old.persist();
    for (const c of old.cards.values()) if (c.s.max) c.toggleMax();
    const docks = Object.values(this.docks);
    docks.forEach((d) => d.animate([{ opacity: 1, transform: 'translateX(0)' }, { opacity: 0, transform: `translateX(${-dir * 40}px) scale(.98)` }], { duration: 220, easing: 'ease-in', composite: 'add' }));   // add: keeps the 3D cockpit tilt
    this.space.swing(dir);
    this.active = i;
    setTimeout(() => {
      this.mount(); this.emptyCheck();
      docks.forEach((d) => d.animate([{ opacity: 0, transform: `translateX(${dir * 40}px) scale(.98)` }, { opacity: 1, transform: 'translateX(0)' }], { duration: 380, easing: 'cubic-bezier(.2,1,.3,1)', composite: 'add' }));
    }, 200);
    bus.emit('ws:switch', { index: i, dir });
  }

  cardAt(x, y) {
    const el = document.elementFromPoint(x, y)?.closest?.('.card');
    if (!el) return null;
    for (const ws of this.workspaces) { const c = ws.cards.get(el.dataset.card); if (c && c.el === el) return c; }
    return null;
  }
  emptyCheck() { bus.emit('deck:empty', this.ws.open().length === 0); }

  // ── layouts / snapshots (UI reset + undo)
  snapshotAll() { return this.workspaces.map((w) => w.snapshot()); }
  restoreAll(snaps) { snaps.forEach((s, i) => this.workspaces[i].restore(s)); this.mount(); this.emptyCheck(); }
  resetLayout() {
    for (const w of this.workspaces) {
      for (const c of w.cards.values()) { if (c.s.max) c.toggleMax(); Object.assign(c.s, presetState(c.def, 'command')); c.apply(); }
      w.focused = null; w.persist();
    }
    this.closed = [];
    this.space.resetView();
    this.mount(); this.emergeAll({ stagger: 50 }); this.emptyCheck();
    for (const c of this.ws.cards.values()) c.el.dispatchEvent(new CustomEvent('card-resize'));
  }
  saveLayout(name) { const all = load('layouts4', {}); all[name] = this.ws.snapshot().cards; save('layouts4', all); }
  restoreLayout(name) { const st = load('layouts4', {})[name]; if (!st) return false; this.ws.restore({ cards: st }); return true; }
  layouts() { return Object.keys(load('layouts4', {})); }

  // ── mouse / touch on the open space: drag = spin globe / tilt, wheel = zoom, right-click = radial
  bindStage() {
    const st = this.stage, ptrs = new Map(), sp = this.space;
    let pinch = null;
    st.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'hand') return;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, right: e.button === 2, travel: 0 });
      try { st.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
      st.classList.add('panning'); sp.orbiting = true;
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) }; }
    });
    addEventListener('pointermove', (e) => { sp.parallax.x = e.clientX / innerWidth * 2 - 1; sp.parallax.y = e.clientY / innerHeight * 2 - 1; }, { passive: true });
    st.addEventListener('pointermove', (e) => {
      const p = ptrs.get(e.pointerId); if (!p) return;
      if (ptrs.size === 2 && pinch) {
        p.x = e.clientX; p.y = e.clientY;
        const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
        this.zoomBy(d / pinch.d); pinch.d = d; return;
      }
      p.travel += Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y);
      this.pan(e.clientX - p.x, e.clientY - p.y);
      p.x = e.clientX; p.y = e.clientY;
    });
    const up = (e) => { const p = ptrs.get(e.pointerId); if (p?.right && p.travel < 6) bus.emit('radial:open', { x: e.clientX, y: e.clientY }); ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; if (!ptrs.size) { st.classList.remove('panning'); sp.orbiting = false; } };
    st.addEventListener('pointerup', up); st.addEventListener('pointercancel', up);
    st.addEventListener('contextmenu', (e) => e.preventDefault());
    st.addEventListener('wheel', (e) => { e.preventDefault(); this.zoomBy(Math.exp(-e.deltaY * 0.0012)); }, { passive: false });
    st.addEventListener('dblclick', () => this.resetView());
  }
}
