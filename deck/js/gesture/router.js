// Gesture router: semantic gesture events → deck operations, chosen by what is under the pointer.
//
// Low-effort operation (v4):
//   • TARGET MAGNETISM — the fingertip pointer snaps onto the nearest button/link/image within
//     ~44 px and stays latched (hysteresis), so you aim roughly and pinch: no pixel hunting.
//   • CAPTURED CLICKS — a pinch clicks the target that was highlighted when the pinch began,
//     even if the fingers drift a little while closing/opening.
//   • ONE GESTURE, MANY JOBS — pinch = click · pinch+drag = move panel / scroll content (with
//     inertia) / spin the globe; two-hand pinch = zoom. Nothing has to be panned or hunted for.
//   • OPTIONAL DWELL CLICK — hover a control still for N ms to press it (Settings → gestures).
// Stable windows (v5) — panels only move when you clearly mean it:
//   • GRAB = pinch a title and HOLD (~0.3 s ring) before the panel lifts; a pinch that wanders first does nothing
//   • while dragging, a placeholder keeps the dock still; drop targets need to hold ~140 ms (no flicker between docks)
//   • tracking loss / cancel → the panel glides home; one-frame pointer teleports are ignored
//   • centre-stage needs a HELD two-finger pinch; open-palm “back” only fires over open space
//   • swipes (workspace / page) are opt-in; two-hand pull-in never resets the layout; Layout lock pins everything
// Opening windows (v5.4): a QUICK pinch on a panel title (released before the lift ring fills, no drift) opens
// it on the centre stage; the same on the stage panel's title sends it back. Pinch-and-hold still lifts it.
// It calls the same Panel / Deck / Space APIs as the mouse, with its own operation slot per
// hand, so mouse, touch and both hands work at the same time without stealing drags.
import { bus } from '../core/bus.js';
import { settings } from '../core/store.js';
import { sidewaysOnly } from '../dock/dock.js';
import { t } from '../core/i18n.js';

export const CLICKABLE = 'button, a[href], .img-cell, .pal-item, .chip, [data-act], .rad-item, input, select, .rail-btn, .split';
const LABEL = {
  PINCH_START: 'PINCH', PINCH2_TAP: 'TWO-FINGER PINCH', FIST_START: 'FIST', FIST_HOLD: 'FIST HOLD', OPEN_HOLD: 'OPEN PALM HOLD',
  SWIPE_LEFT: 'SWIPE ←', SWIPE_RIGHT: 'SWIPE →', SWIPE_UP: 'SWIPE ↑', SWIPE_DOWN: 'SWIPE ↓', TWO_HAND_START: '2-HAND PINCH', PUSH_OUT: 'PUSH OUT', PULL_IN: 'PULL IN',
};
const MAGNET = 44;
const GRAB_SLOP = 28;          // px a pinch may wander while it is being held to lift a panel
const SETTLE = 140;            // ms a new drop target must hold
const L = (k) => t(LABEL[k] || k);
const isSpace = (t) => !t || t.id === 'stage' || t.id === 'space' || t.id === 'labels' || t.id === 'max-layer';

export class GestureRouter {
  constructor({ deck, fx, skel, act, space, zoom }) {
    Object.assign(this, { deck, fx, skel, act, space, zoom });
    this.zc = [null, null]; this.zt = [0, 0];
    this.ops = [null, null];        // per-hand pinch operation
    this.hover = [null, null];
    this.snapEl = [null, null];
    this.cur = [null, null];        // last assisted pointer per hand {x, y, el}
    this.dwell = [null, null];
  }
  feedback(name, hint, x, y, conf = 1, rgb) {
    this.skel.show(name, hint, conf, true);
    if (x != null) { this.fx.ripple(x, y, { max: 58, rgb }); this.fx.burst(x, y, 16, { rgb }); }
    bus.emit('gesture:fired', { name, hint });
  }
  locked() { return settings.gLocked; }

  handle(type, e) {
    if (!['PALM_MOVE', 'HOLD_PROGRESS', 'PINCH_MOVE', 'FIST_DEPTH', 'CIRCLE_ROTATE', 'TWO_HAND_SCALE', 'TWO_HAND_ROTATE'].includes(type)) {
      (this.log ||= []).push({ t: Math.round(performance.now()), type, hand: e.hand, x: Math.round(e.x ?? e.mid?.x ?? 0), y: Math.round(e.y ?? e.mid?.y ?? 0) });
      if (this.log.length > 300) this.log.shift();
    }
    if (type === 'PALM_MOVE') return this.move(e);
    if (type === 'HOLD_PROGRESS') { if (!this.dwell[e.hand]?.p && this.ops[e.hand]?.kind !== 'grab') this.skel.hold(e.hand, e.p); return; }
    if (type === 'HAND_LOST') {
      this.release(e.hand, true); this.setHover(e.hand, null); this.setSnap(e.hand, null); this.cur[e.hand] = null; this.skel.cursor(e.hand, 0, 0, 'none', false);
      if (!this.cur.some(Boolean)) this.skel.hud.hidden = true;                 // no hands in view → no gesture HUD
      return;
    }
    if (this.locked() && !['PINCH_END', 'FIST_END', 'TWO_HAND_END'].includes(type)) { this.skel.show(t('LOCKED'), t('{g} ignored — gesture lock on', { g: L(type) }), e.conf ?? 1); return; }
    const fn = this[type]; if (fn) fn.call(this, e);
  }

  // ───────────── pointer, magnetism, hover, dwell
  /** Snap the pointer onto the nearest clickable within MAGNET px (sticky while it stays near). */
  assist(hand, x, y) {
    if (!settings.gMagnet || this.ops[hand]) return { x, y, el: null };
    const dist = (el) => { const r = el.getBoundingClientRect(); if (!r.width || !r.height) return Infinity; return Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom)); };
    const ok = (el) => el && !el.disabled && el.getClientRects().length && !el.closest('[hidden], .card.floating');
    // never latch across panels/zones, and splitters only count when the pointer is right on them
    // zones: a panel title only latches onto its own buttons, panel content onto its own controls, open space onto HUD controls
    const ZONE = '.card-h, .card-body, .card', here = document.elementFromPoint(x, y), home = here?.closest?.(ZONE) || null;
    let best = null, bd = Infinity;
    const consider = (el) => {
      el = el?.closest?.(CLICKABLE); if (!ok(el) || el === best || (el.closest(ZONE) || null) !== home) return;
      const d = dist(el); if (el.matches('.split') && d > 0) return;
      if (d < bd) { bd = d; best = el; }
    };
    consider(here);
    if (bd > 0) for (const r of [14, 28, 44]) for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + (r === 28 ? Math.PI / 8 : 0); consider(document.elementFromPoint(x + Math.cos(a) * r, y + Math.sin(a) * r)); }
    const prev = this.snapEl[hand];
    if (prev && ok(prev) && prev.isConnected && (prev.closest(ZONE) || null) === home && !prev.matches('.split')) { const dp = dist(prev); if (dp < MAGNET * 1.35 && dp <= bd + 12) { best = prev; bd = dp; } }
    if (!best || bd > MAGNET) { this.setSnap(hand, null); return { x, y, el: null }; }
    this.setSnap(hand, best);
    const r = best.getBoundingClientRect(), ins = Math.min(8, r.width / 3, r.height / 3);
    return { x: Math.min(r.right - ins, Math.max(r.left + ins, x)), y: Math.min(r.bottom - ins, Math.max(r.top + ins, y)), el: best, snapped: bd > 0 };
  }
  setSnap(hand, el) {
    if (this.snapEl[hand] === el) return;
    this.snapEl[hand]?.classList.remove('hand-target');
    this.snapEl[hand] = el; el?.classList.add('hand-target');
  }
  move(e) {
    const a = this.assist(e.hand, e.x, e.y);
    this.cur[e.hand] = a;
    const under = a.el || document.elementFromPoint(a.x, a.y);
    const hint = this.hintFor(under, a, e);
    this.skel.cursor(e.hand, a.x, a.y, e.pose, true, e.conf, { snapped: !!a.el, label: hint.short, raw: { x: e.x, y: e.y } });
    if (!this.ops[e.hand]) this.setHover(e.hand, under);
    this.dwellStep(e.hand, a, e);
    this.edgePan(e);
    if (e.hand === 0 && !this.ops[0]) this.skel.show(t(e.pose === 'none' ? 'TRACKING' : ({ open: 'POINTER', pinch: 'PINCH', fist: 'FIST', point: 'POINT', pinch2: 'TWO-FINGER' }[e.pose] || e.pose.toUpperCase())), hint.long, e.conf);
  }
  /** Zoomed: an open palm near a screen edge pans that way (speed grows toward the edge); the centre is a dead zone. */
  edgePan(e) {
    const z = this.zoom; if (!z?.active || e.pose !== 'open' || this.ops[e.hand] || e.hand !== 0) { if (z?.active && e.hand === 0) z.edge(0, 0, 0, 0); return; }
    const now = e.t ?? performance.now(), dt = Math.min(80, Math.max(0, now - (this.panT || now))); this.panT = now;
    const W = innerWidth, H = innerHeight, bx = W * 0.16, by = H * 0.16;
    const l = Math.max(0, (bx - e.x) / bx), r = Math.max(0, (e.x - (W - bx)) / bx), tp = Math.max(0, (by - e.y) / by), b = Math.max(0, (e.y - (H - by)) / by);
    z.edge(l, r, tp, b);
    const sp = 1100 * dt / 1000;                               // px per frame at full depth
    if (l + r + tp + b > 0) z.pan((l * l - r * r) * sp, (tp * tp - b * b) * sp);
  }
  hintFor(el, a, e) {
    const name = (el) => (el.getAttribute('aria-label') || el.title || el.textContent || '').trim().replace(/\s+/g, ' ').split(/[(—·]/)[0].slice(0, 22).toUpperCase();
    if (a.el) { const n = name(a.el) || t('TARGET'); return { short: t('PINCH ▸ {n}', { n }), long: t('pinch to press {n}', { n }) }; }
    const card = el?.closest?.('.card');
    if (card) {
      const title = card.querySelector('.title')?.textContent || t('PANEL');
      if (el.closest('.card-h')) return settings.layoutLock ? { short: t('LAYOUT LOCKED'), long: t('{title} · layout lock is on — panels stay put', { title }) }
        : card.classList.contains('max') ? { short: t('PINCH ▸ BACK TO DOCK'), long: t('{title} · quick pinch = back to its dock', { title }) }
          : { short: t('PINCH ▸ OPEN · HOLD ▸ LIFT'), long: t('{title} · quick pinch = open on the centre stage · pinch & hold = lift and move', { title }) };
      return { short: t('PINCH ▸ SCROLL'), long: t('{title} · pinch & drag to scroll', { title }) };
    }
    if (isSpace(el)) return { short: t('PINCH ▸ SPIN GLOBE'), long: t('pinch & drag = spin globe · pinch & hold = radial menu · two hands = zoom') };
    return { short: `${t(({ open: 'POINTER', pinch: 'PINCH', fist: 'FIST', point: 'POINT' })[e.pose] || 'TRACKING')} ${Math.round((e.conf ?? 1) * 100)}%`, long: '' };
  }
  setHover(hand, t) {
    const target = t?.closest?.(`${CLICKABLE}, .card, #minimap`) || null;
    if (target === this.hover[hand]) return;
    this.hover[hand]?.classList.remove('hand-hover');
    this.hover[hand]?.closest?.('.card')?.classList.remove('hand-hover');
    this.hover[hand] = target;
    target?.classList.add('hand-hover');
    target?.closest?.('.card')?.classList.add('hand-hover');
  }
  /** Optional dwell click: a still pointer over a control presses it after settings.gDwell ms. */
  dwellStep(hand, a, e) {
    const ms = settings.gDwell || 0;
    if (!ms || this.ops[hand] || e.pose === 'pinch' || !a.el || a.el.matches('input, select, .split')) { if (this.dwell[hand]) { this.dwell[hand] = null; this.skel.hold(hand, 0); } return; }
    const now = e.t ?? performance.now(), d = this.dwell[hand];
    if (!d || d.el !== a.el || Math.hypot(e.x - d.x, e.y - d.y) > 22) { this.dwell[hand] = { el: a.el, x: e.x, y: e.y, t0: now, fired: false, p: 0 }; return; }
    if (d.fired) return;
    d.p = Math.min(1, (now - d.t0) / ms); this.skel.hold(hand, d.p);
    if (d.p >= 1) { d.fired = true; this.skel.hold(hand, 0); this.tap(a.x, a.y, a.el); this.feedback(t('DWELL'), t('pressed'), a.x, a.y, e.conf); }
  }

  // ───────────── pinch: click / move panel / resize / scroll / spin globe
  PINCH_START(e) {
    const a = this.cur[e.hand] || { x: e.x, y: e.y, el: null }, x = a.x, y = a.y;
    const t0 = e.t ?? performance.now();
    const target = a.el || document.elementFromPoint(x, y);
    const card = this.deck.cardAt(x, y);
    let op = { x0: x, y0: y, rx: e.x, ry: e.y, t0, target, kind: 'tap', lx: e.x, ly: e.y, vy: 0, travel: 0 };
    if (card && !a.el?.closest('.card-btns, .card-body')) {
      const z = card.zone(x, y) || { zone: 'body' };
      card.focus();
      // a title pinch only ARMS a grab; the panel lifts after the hold (see PINCH_MOVE)
      if (z.zone === 'title' && !settings.layoutLock && !card.s.max && !this.zoom?.active) op = { ...op, kind: 'grab', card };
      else if (z.zone === 'title' && card.s.max && !settings.layoutLock) op = { ...op, kind: 'stage', card };
      else if (z.zone === 'edge' && !settings.layoutLock && card.beginResize(z.dir, x, y)) op = { ...op, kind: 'resize', card };
      else if (z.zone === 'body') op = { ...op, kind: 'tap', card, scroll: card.body, st0: card.body.scrollTop };
    } else if (card && a.el?.closest('.card-body')) op = { ...op, card, scroll: card.body, st0: card.body.scrollTop };
    else if (!a.el && isSpace(target)) op.kind = 'globe';
    this.ops[e.hand] = op;
    this.setSnap(e.hand, a.el || null);
    this.feedback(t('PINCH'), t({ grab: 'release = open on stage · hold = lift the panel', stage: 'release = back to its dock', resize: 'resize panel', globe: 'spin globe · hold = radial menu', tap: a.el ? 'press' : 'tap / scroll' }[op.kind]), x, y, e.conf);
  }
  PINCH_MOVE(e) {
    const op = this.ops[e.hand]; if (!op) return;
    const now = e.t ?? performance.now();
    // teleport guard: a one-frame jump (re-acquired / swapped hand) is absorbed, never applied to a panel
    const jump = Math.hypot(e.x - op.lx, e.y - op.ly);
    if (jump > innerWidth * 0.15) { op.rx += e.x - op.lx; op.ry += e.y - op.ly; op.lx = e.x; op.ly = e.y; op.lt = now; return; }
    op.travel += jump;
    let dx = e.x - op.rx, dy = e.y - op.ry;
    if (op.kind === 'grab') {
      const p = Math.min(1, (now - op.t0) / (settings.gGrab || 300));
      if (Math.hypot(dx, dy) > GRAB_SLOP) { op.kind = 'none'; this.skel.hold(e.hand, 0); this.skel.show(t('PINCH'), t('moved before the ring filled — panel stays put'), e.conf ?? 1); }
      else if (p >= 1 && op.card.beginMove(op.x0, op.y0)) {
        op.kind = 'move'; op.rx = e.x; op.ry = e.y; dx = dy = 0; this.skel.hold(e.hand, 0);
        this.feedback(t('LIFTED'), t('move to a dock and let go · let go here = stays'), op.x0, op.y0, e.conf);
      } else this.skel.hold(e.hand, p);
    }
    this.skel.cursor(e.hand, op.x0 + (e.x - op.rx), op.y0 + (e.y - op.ry), 'pinch', true, e.conf ?? 1,
      { label: t({ grab: 'OPEN · HOLD = LIFT', stage: 'RELEASE ▸ DOCK', move: 'MOVING PANEL', resize: 'RESIZING', globe: 'SPINNING GLOBE', none: 'PINCH', tap: op.scrolled ? 'SCROLLING' : op.target ? 'RELEASE ▸ PRESS' : 'PINCH' }[op.kind]) });
    if (op.kind === 'move') op.card.moveTo(dx, dy, { settle: SETTLE, now });
    else if (op.kind === 'resize') op.card.resizeTo(dx, dy);
    else if (op.kind === 'globe') {
      if (!op.radial && op.travel < 14 && now - op.t0 > 650) { op.radial = true; this.act.radial?.(op.x0, op.y0); this.feedback(t('PINCH HOLD'), t('radial menu — pinch an item'), op.x0, op.y0, e.conf); }
      if (!op.radial) this.deck.pan(e.x - op.lx, e.y - op.ly);
    } else if (op.kind === 'tap' && op.scroll) {
      // content that only scrolls sideways (bottom-dock timeline) scrolls with horizontal hand motion
      const sc = op.scroll, hz = op.hz ??= sidewaysOnly(sc), d = hz ? dx : dy;
      if (op.scrolled || Math.abs(d) > 18) {
        if (!op.scrolled) { op.scrolled = true; op.r2 = hz ? e.x : e.y; op.st0 = hz ? sc.scrollLeft : sc.scrollTop; this.setSnap(e.hand, null); }
        const dt = Math.max(1, now - (op.lt ?? op.t0)), p = hz ? e.x : e.y; op.vy = 0.7 * op.vy + 0.3 * ((p - (hz ? op.lx : op.ly)) / dt);
        sc[hz ? 'scrollLeft' : 'scrollTop'] = op.st0 - (p - op.r2) * 1.4;
      }
    }
    op.lx = e.x; op.ly = e.y; op.lt = now;
  }
  PINCH_END(e) { this.release(e.hand, e.cancelled, e); }
  release(hand, cancelled, e) {
    const op = this.ops[hand]; this.ops[hand] = null; if (!op) return;
    this.skel.hold(hand, 0);
    if (op.kind === 'move') op.card.endMove(!!cancelled);           // lost hand → glides home, nothing re-docks
    else if (op.kind === 'resize') op.card.endResize();
    else if (op.kind === 'tap' && op.scrolled) this.glide(op.scroll, -op.vy * 1.4 * 16, op.hz);
    else if ((op.kind === 'tap' || op.kind === 'grab' || op.kind === 'stage') && !cancelled && e) {
      const moved = Math.hypot(e.x - op.rx, e.y - op.ry), dt = (e.t ?? performance.now()) - op.t0;
      this.lastTap = { moved: Math.round(moved), dt: Math.round(dt), fired: moved < 40 && dt < 1500 };
      if (this.lastTap.fired && op.kind === 'tap') this.tap(op.x0, op.y0, op.target);
      // quick title pinch (the lift ring never filled) = open on the centre stage / back to the dock
      if ((op.kind === 'grab' || op.kind === 'stage') && moved < 30 && dt < 900 && !settings.layoutLock) {
        op.card.toggleMax();
        this.feedback(t('PINCH'), t(op.card.s.max ? '{title} on the centre stage' : '{title} back in its dock', { title: op.card.label }), op.x0, op.y0, e.conf ?? 1);
      }
    }
  }
  /** Scroll inertia after a pinch-drag fling. */
  glide(el, v, hz = false) {
    if (!el || Math.abs(v) < 2) return;
    const step = () => { el[hz ? 'scrollLeft' : 'scrollTop'] += v; v *= 0.92; if (Math.abs(v) > 0.5) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  tap(x, y, captured) {
    const t = captured?.isConnected ? captured : document.elementFromPoint(x, y);
    const clickable = t?.closest?.('button, a, .img-cell, .pal-item, .chip, label, input, select, [data-act], .rad-item') || t;
    if (!clickable || isSpace(clickable)) return;
    if (clickable.matches('input, select')) clickable.focus();
    clickable.click();
    this.fx.ripple(x, y, { max: 30, life: 380 });
  }

  // ───────────── panels
  PINCH2_TAP(e) {
    if (this.ops[e.hand] || this.ops[1 - e.hand]) return;                      // never while a pinch operation is live
    if (settings.layoutLock) { this.skel.show(t('LAYOUT LOCKED'), t('two-finger pinch ignored — layout lock on'), e.conf); return; }
    const card = this.deck.cardAt(e.x, e.y) || [...this.deck.ws.cards.values()].find((c) => c.s.max); if (!card) return;
    card.toggleMax();
    this.feedback(t('TWO-FINGER PINCH'), t(card.s.max ? '{title} on the centre stage' : '{title} back in its dock', { title: card.label }), e.x, e.y, e.conf);
  }
  // ───────────── magnifier: ✊ zooms around the fist · ✊✊ resets · ✋ at an edge pans (edgePan)
  FIST_START(e) { this.skel.show(t('FIST'), t('hold to zoom in around your fist'), e.conf); this.zc[e.hand] = null; }
  FIST_DEPTH(e) {
    if (!this.zoom || e.pair || this.ops[e.hand] || (e.held ?? 0) < 300) return;          // a brief fist (or the start of ✊✊) does nothing
    const now = e.t ?? performance.now();
    if (!this.zc[e.hand]) { this.zc[e.hand] = { x: e.x, y: e.y }; this.zt[e.hand] = now; this.skel.cursors[e.hand]?.classList.add('zooming'); }
    const dt = Math.min(80, now - this.zt[e.hand]); this.zt[e.hand] = now;
    const c = this.zc[e.hand];
    this.zoom.zoomAt(c.x, c.y, Math.exp(0.6 * dt / 1000));                                   // ≈ ×1.8 per second, up to 4×
    this.skel.show(t('ZOOM'), `${this.zoom.z.toFixed(1)}× · ${t('open the hand to stop · two fists = reset')}`, e.conf);
  }
  FIST_END(e) { this.zc[e?.hand ?? 0] = null; this.skel.cursors.forEach((c) => c?.classList.remove('zooming')); }
  FIST_HOLD() {}
  TWO_FIST(e) {
    this.zc = [null, null]; this.skel.cursors.forEach((c) => c?.classList.remove('zooming'));
    if (!this.zoom?.active) { this.skel.show(t('TWO FISTS'), t('already at normal size'), 1); return; }
    this.zoom.reset(); this.feedback(t('TWO FISTS'), t('zoom reset to 1×'), e.mid.x, e.mid.y, 1, '255,179,71');
  }
  OPEN_HOLD(e) {
    if (this.act.isPaused()) { this.act.resume(); this.feedback(t('OPEN PALM HOLD'), t('agent resumed'), e.x, e.y, e.conf); return; }
    if (this.zoom?.active) return;                                    // zoomed: the open palm is the pan hand, holding still just looks
    // “back” only over open space: resting your hand on a panel or a menu while reading must never close it
    const a = this.cur[e.hand], under = a?.el || document.elementFromPoint(a?.x ?? e.x, a?.y ?? e.y);
    if (a?.el || !isSpace(under)) return;
    const closed = this.act.closeOverlays();
    for (let h = 0; h < 2; h++) this.release(h, true);
    this.feedback(t('OPEN PALM HOLD'), t(closed ? 'back — closed the top overlay' : 'nothing to close'), e.x, e.y, e.conf);
  }
  CIRCLE_ROTATE(e) {
    const card = this.deck.cardAt(e.x, e.y);
    if (card?.id === 'metrics' && this.act.metrics()) this.act.metrics().rotateChart(e.deg * 1.4);
    else if (card) return;                       // circling over a panel does nothing (no surprise globe spins)
    else this.deck.pan(e.deg * 2, 0);
  }

  // ───────────── switching & scrolling
  SWIPE_LEFT(e) { this.swipeX(-1, e); }
  SWIPE_RIGHT(e) { this.swipeX(1, e); }
  swipeX(dir, e) {
    if (this.act.lightboxOpen()) { this.act.lightbox(dir); this.feedback(L(dir > 0 ? 'SWIPE_RIGHT' : 'SWIPE_LEFT'), t('next image'), e.x, e.y, e.conf); return; }
    if (!settings.gSwipes) return;                       // opt-in: a fast pointer move must never switch the screen
    const next = this.deck.active - dir;
    this.deck.switchTo(next, -dir);
    this.fx.sweep(-dir);
    this.feedback(L(dir > 0 ? 'SWIPE_RIGHT' : 'SWIPE_LEFT'), t('workspace {n}', { n: this.deck.active + 1 }), e.x, e.y, e.conf);
  }
  SWIPE_UP(e) { this.scroll(e, 1); }
  SWIPE_DOWN(e) { this.scroll(e, -1); }
  scroll(e, dir) {
    if (!settings.gSwipes) return;
    const card = this.deck.cardAt(e.from.x, e.from.y) || this.deck.ws.focused || this.deck.card('trace');
    card.body.scrollBy({ top: dir * card.body.clientHeight * 0.8, behavior: 'smooth' });
    this.feedback(L(dir > 0 ? 'SWIPE_UP' : 'SWIPE_DOWN'), t('scroll {title}', { title: card.label }), e.x, e.y, e.conf);
  }

  // ───────────── two hands: zoom the stage panel's content / a panel's dock share / the globe
  TWO_HAND_START(e) {
    const mid = { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 };
    this.twoCard = [...this.deck.ws.cards.values()].find((c) => c.s.max) || this.deck.cardAt(mid.x, mid.y) || null;
    if (this.twoCard?.s.closed || (settings.layoutLock && !this.twoCard?.s.max)) this.twoCard = null;
    this.twoAcc = 1; this.twoLive = false;
    document.getElementById('two-hand').hidden = false;
    this.feedback(L('TWO_HAND_START'), this.twoCard ? t(this.twoCard.s.max ? 'zoom {title} content' : 'grow/shrink {title}', { title: this.twoCard.label }) : t('zoom the globe'), mid.x, mid.y);
  }
  TWO_HAND_SCALE(e) {
    // dead-zone: two pinching hands must spread/close by 6 % before anything resizes (holding still = nothing moves)
    if (!this.twoLive) { this.twoAcc *= e.factor; if (Math.abs(this.twoAcc - 1) < 0.06) return; this.twoLive = true; e = { ...e, factor: this.twoAcc }; }
    if (this.twoCard) this.twoCard.scaleAbout(e.factor, e.mid.x, e.mid.y); else this.deck.zoomAt(e.mid.x, e.mid.y, e.factor);
    const line = document.getElementById('th-line');
    line.setAttribute('x1', e.a.x); line.setAttribute('y1', e.a.y); line.setAttribute('x2', e.b.x); line.setAttribute('y2', e.b.y);
    const ro = document.getElementById('th-readout'); ro.style.left = `${e.mid.x}px`; ro.style.top = `${e.mid.y}px`;
    ro.textContent = this.twoCard ? `${this.twoCard.label} · ${this.twoCard.s.max ? `${Math.round(this.twoCard.s.zoom * 100)}%` : `×${this.twoCard.s.flex.toFixed(2)}`}` : `${t('ZOOM')} ${Math.round(this.deck.view.z * 100)}%`;
  }
  TWO_HAND_ROTATE(e) { if (!this.twoCard) this.deck.pan(e.deg * 3, 0); }
  TWO_HAND_END() { document.getElementById('two-hand').hidden = true; this.twoCard?.changed('snap'); this.twoCard = null; }
  PUSH_OUT(e) { this.act.palette(); this.feedback(L('PUSH_OUT'), t('command palette'), e.mid.x, e.mid.y); }
  PULL_IN(e) {                                    // view only — a gesture never resets the layout (use R / the RESET menu)
    this.deck.resetView();
    this.feedback(L('PULL_IN'), t('globe view reset'), e.mid.x, e.mid.y);
  }
}
