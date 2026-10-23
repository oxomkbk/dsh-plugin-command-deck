// ─────────────────────────────────────────────────────────────────────────────
// Gesture semantics engine: landmarks in → semantic events out. Consumers never see raw
// coordinate streams, only events such as PINCH_START, SWIPE_LEFT, TWO_HAND_SCALE.
//
// Single hand                         Two hands
//   PALM_MOVE (cursor, every frame)     TWO_HAND_START / TWO_HAND_SCALE / TWO_HAND_ROTATE / TWO_HAND_END (both pinching)
//   PINCH_START / PINCH_MOVE / PINCH_END PUSH_OUT  (both open, moving apart fast)
//   PINCH2_TAP  (thumb on index+middle, HELD ~0.35 s)  PULL_IN (both open, moving together fast)
//   FIST_START / FIST_DEPTH / FIST_END
//   FIST_HOLD   (fist held still)       Anti-misfire
//   OPEN_HOLD   (open palm held still)    • per-hand confidence gate (handedness score × pose agreement)
//   SWIPE_LEFT/RIGHT/UP/DOWN (open hand)  • pose must be stable for N frames (settings.gStable)
//   POINT_SWIPE (index swipes across)     • pinch hysteresis (on < t, off > 1.35t)
//   CIRCLE_ROTATE (index circles, armed after 90°)   • holds require stillness; swipes require speed
//   WAVE (≥3 side-to-side reversals)      • per-gesture cooldowns; two-hand modes suppress one-hand ones
//                                         • gesture lock: cursor only
// Low-effort pointer (v4): the active camera region is centred on where YOUR hand rests
// (auto-calibrated when tracking starts, re-centre any time), default sensitivity needs ~1/3
// less arm travel, the pointer freezes for ~110 ms at pinch onset so a pinch never drags it off
// its target, pinch is recognised in 2 frames, and swipes need a deliberate, fast, open hand.
// Stable windows (v5): a pinch only ends after ≥70 ms of open fingers (a one-frame flicker can't drop a
// dragged panel), the two-finger pinch must be held, and two-hand gestures wait until both hands have
// been tracked for half a second (a hand entering the frame is not a "push").
// Steady pointer (v5.4, settings.gAnchor = 'stable'): the pointer rides on the KNUCKLES + wrist (the most
// stable landmarks — fingertips jitter most and move whenever you pinch or close the hand) plus a slowly
// adapting offset that puts it at your fingertip while the hand is open. Closing the hand (pinch, two-finger
// pinch, fist) therefore never moves the pointer: what you pointed at is what you press, grab or zoom.
// Pose hand-offs: a pinch that turns into a two-finger pinch is CANCELLED (no stray click), a long-held pinch
// (a drag) can't flip into a two-finger pinch, and a dragging hand may vanish for ~0.45 s before the drop is
// cancelled (brief tracking dropouts no longer fling panels home).
// ─────────────────────────────────────────────────────────────────────────────
import { settings } from '../core/store.js';

const TIP = [4, 8, 12, 16, 20], PIP = [3, 6, 10, 14, 18];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

class OneEuro {
  constructor() { this.x = null; this.dx = 0; this.t = 0; }
  a(c, dt) { const tau = 1 / (2 * Math.PI * c); return 1 / (1 + tau / dt); }
  f(v, t, minC, beta) {
    if (this.x === null) { this.x = v; this.t = t; return v; }
    const dt = Math.max(1e-3, (t - this.t) / 1000); this.t = t;
    this.dx += this.a(1, dt) * ((v - this.x) / dt - this.dx);
    this.x += this.a(minC + beta * Math.abs(this.dx), dt) * (v - this.x);
    return this.x;
  }
}

class HandState {
  constructor(i) {
    this.i = i; this.fx = new OneEuro(); this.fy = new OneEuro();
    this.pose = 'none'; this.cand = 'none'; this.candN = 0; this.agree = []; this.hist = []; this.tipHist = [];
    this.pinching = false; this.lastSeen = 0; this.poseSince = 0; this.cool = {};
  }
}

export class GestureEngine {
  constructor(emit) {
    // every event carries the frame timestamp `t`, so timing logic is clock-injectable (tests, replays)
    this.emit = (type, p) => emit(type, { ...p, t: this.now });
    this.hands = [new HandState(0), new HandState(1)];
    this.two = null; this.twoOpen = [];
    this.center = { x: 0.5, y: 0.5 }; this.calib = null;
  }
  /** Re-centre the active region on the hand's current resting position (averaged over ~8 frames). */
  recenter() { this.calib = []; }

  // ───────────── per-hand features
  features(lm) {
    const w = lm[0], size = dist(w, lm[9]) || 1e-3;
    const ext = [1, 2, 3, 4].map((f) => dist(lm[TIP[f]], w) > dist(lm[PIP[f]], w) * 1.12);
    const palm = [0, 5, 9, 13, 17].reduce((a, i) => ({ x: a.x + lm[i].x / 5, y: a.y + lm[i].y / 5 }), { x: 0, y: 0 });
    const m = (p) => ({ x: 1 - p.x, y: p.y });   // mirror so the screen behaves like a mirror
    const anchor = { x: lm[5].x * 0.5 + lm[9].x * 0.3 + lm[0].x * 0.2, y: lm[5].y * 0.5 + lm[9].y * 0.3 + lm[0].y * 0.2 };
    // where the index fingertip would be with the finger straight (index knuckle + ~1.08 × the palm axis wrist→middle knuckle)
    const tipEst = { x: lm[5].x + (lm[9].x - lm[0].x) * 1.08, y: lm[5].y + (lm[9].y - lm[0].y) * 1.08 };
    return { size, ext, n: ext.filter(Boolean).length, pinch: dist(lm[4], lm[8]) / size, pinch2: dist(lm[4], lm[12]) / size,
      palm: m(palm), tip: m(lm[8]), thumb: m(lm[4]), knuckle: m(lm[5]), anchor: m(anchor), tipEst: m(tipEst) };
  }
  get stable() { return (settings.gAnchor ?? 'stable') === 'stable'; }
  /**
   * Steady pointer: anchor (knuckles + wrist) + an offset that tracks fingertip − anchor only while the hand is
   * open/pointing (and not right after it was closed). Closed poses freeze the offset → the pointer holds still.
   */
  stablePointer(h, f, peek, now) {
    const A = f.anchor, openish = (peek === 'open' || peek === 'point') && f.ext[0];
    const o = { x: f.tip.x - A.x, y: f.tip.y - A.y };
    if (!h.off) h.off = openish ? o : { x: f.tipEst.x - A.x, y: f.tipEst.y - A.y };   // first seen closed: where the fingertip would point
    else if (openish && !(now < (h.offHold || 0))) { h.off.x += (o.x - h.off.x) * 0.14; h.off.y += (o.y - h.off.y) * 0.14; }
    if (!openish) h.offHold = now + 220;                      // fingers re-opening after a pinch: don't follow the release
    return { x: A.x + h.off.x, y: A.y + h.off.y };
  }
  classifyPeek(h, f) { const saved = h.pinching, r = this.classify(h, f); h.pinching = saved; return r; }
  classify(h, f) {
    const t = settings.gPinch;
    const pinchOn = h.pinching ? f.pinch < t * 1.35 : f.pinch < t;
    if (f.n === 0 && f.pinch > t * 0.6) { h.pinching = false; return 'fist'; }
    if (pinchOn && f.pinch2 < t * 1.3 && !f.ext[1]) { h.pinching = true; return 'pinch2'; }
    if (pinchOn) { h.pinching = true; return 'pinch'; }
    h.pinching = false;
    if (f.ext[0] && f.n === 1) return 'point';
    if (f.n >= 4) return 'open';
    return 'none';
  }
  /**
   * POINTER = FINGERTIP. The cursor is the index fingertip; as thumb and index close it blends
   * continuously toward their midpoint, so a pinch clicks/grabs exactly where the fingertips meet
   * (no jump at pinch onset). A closed fist uses the index knuckle (the tip is hidden in the palm).
   */
  pointerOf(f, pose) {
    if (pose === 'fist') return f.knuckle;
    const t = settings.gPinch, k = Math.min(1, Math.max(0, (t * 1.7 - f.pinch) / (t * 1.7 - t * 0.45)));
    const mid = { x: (f.tip.x + f.thumb.x) / 2, y: (f.tip.y + f.thumb.y) / 2 };
    return { x: f.tip.x + (mid.x - f.tip.x) * k, y: f.tip.y + (mid.y - f.tip.y) * k };
  }
  /** Camera space → screen. `gSens` (pointer sensitivity) shrinks the active camera region: higher = less hand travel. */
  toScreen(p) {
    const sens = settings.gSens || 1, rw = 0.72 / sens, rh = 0.64 / sens, x0 = this.center.x - rw / 2, y0 = this.center.y - rh / 2;
    return { x: Math.min(1, Math.max(0, (p.x - x0) / rw)) * innerWidth, y: Math.min(1, Math.max(0, (p.y - y0) / rh)) * innerHeight };
  }
  /** Same mapping without clamping — the skeleton is drawn through it so the fingertip landmark sits exactly on the pointer. */
  toScreenRaw(p) {
    const sens = settings.gSens || 1, rw = 0.72 / sens, rh = 0.64 / sens;
    return { x: (p.x - (this.center.x - rw / 2)) / rw * innerWidth, y: (p.y - (this.center.y - rh / 2)) / rh * innerHeight };
  }
  cooldown(h, key, ms, now) { if ((h.cool[key] || 0) > now) return false; h.cool[key] = now + ms; return true; }

  // ───────────── main entry: hands = [{landmarks:[{x,y,z}], score, handedness}]
  feed(raw, now = performance.now()) {
    this.now = now;
    const hands = raw.filter((h) => (h.score ?? 1) >= settings.gConfidence).slice(0, 2).map((h) => ({ ...h, f: this.features(h.landmarks) }));
    // stable identity: keep each hand on the cursor it drove last frame
    if (hands.length === 2 && this.hands[0].lastSeen) {
      const c0 = this.hands[0], p0 = this.toScreen(hands[0].f.tip), p1 = this.toScreen(hands[1].f.tip);
      if (Math.hypot(p1.x - c0.x, p1.y - c0.y) < Math.hypot(p0.x - c0.x, p0.y - c0.y)) hands.reverse();
    }
    const out = [];
    this.hands.forEach((h, i) => {
      const hd = hands[i];
      if (!hd) {
        if (h.lastSeen && now - h.lastSeen > (h.pose === 'pinch' ? 450 : 220)) this.lost(h, now);   // a dragging hand gets a longer grace
        return;
      }
      const f = hd.f;
      h.lastSeen = now;
      if (i === 0 && this.calib) {
        this.calib.push(f.tip);
        if (this.calib.length >= 8) {
          const cx = this.calib.reduce((a, q) => a + q.x, 0) / this.calib.length, cy = this.calib.reduce((a, q) => a + q.y, 0) / this.calib.length;
          this.center = { x: Math.min(0.72, Math.max(0.28, cx)), y: Math.min(0.72, Math.max(0.28, cy)) }; this.calib = null;
          for (const hh of this.hands) { hh.fx = new OneEuro(); hh.fy = new OneEuro(); hh.rawX = null; hh.off = null; }
          this.emit('RECENTERED', { hand: 0, center: this.center });
        }
      }
      // One-Euro filter: jitter suppression → min cutoff (still = smooth), follow speed → beta (fast = responsive)
      // (v5.4 retune: steadier when still, quicker when moving fast)
      const minC = 1.6 - 1.25 * (settings.gJitter ?? 0.5), beta = 0.006 + 0.05 * (settings.gFollow ?? 0.5);
      const peek = h.pose === 'fist' ? 'fist' : this.classifyPeek(h, f);
      const stable = this.stable;
      if (!stable && peek === 'pinch' && h.lastPeek !== 'pinch' && h.pose !== 'pinch') h.freezeUntil = now + 110;   // fingertip mode: fingers closing → hold the pointer still
      h.lastPeek = peek;
      const p = this.toScreen(stable ? this.stablePointer(h, f, peek, now) : this.pointerOf(f, peek));
      // anti-misfire: a jump of >12 % of the screen in one frame is a re-acquired hand, not motion —
      // reset smoothing + history so stale samples can't be read as a swipe/wave
      if (h.rawX != null && Math.hypot(p.x - h.rawX, p.y - h.rawY) > innerWidth * 0.12) {
        h.fx = new OneEuro(); h.fy = new OneEuro(); h.hist = []; h.tipHist = []; h.cool.swipe = now + 250; h.cool.wave = now + 250;
      }
      h.rawX = p.x; h.rawY = p.y;
      const nx = h.fx.f(p.x, now, minC, beta), ny = h.fy.f(p.y, now, minC, beta);
      // micro dead-zone: sub-pixel tremor never moves the pointer (keeps pinches rock-steady)
      if (h.x == null || (!(now < h.freezeUntil) && Math.hypot(nx - h.x, ny - h.y) > 0.8)) { h.x = nx; h.y = ny; }
      h.f = f;
      // pose stabilisation
      let rawPose = this.classify(h, f);
      if (rawPose === 'pinch2' && h.pose === 'pinch' && now - h.poseSince > 250) { rawPose = 'pinch'; h.pinching = true; }   // a held pinch (a drag) never flips into a two-finger pinch
      h.agree.push(rawPose); if (h.agree.length > 8) h.agree.shift();
      if (rawPose === h.cand) h.candN++; else { h.cand = rawPose; h.candN = 1; h.candSince = now; }
      const prev = h.pose;
      const need = rawPose === 'pinch' || h.pose === 'pinch' ? Math.min(2, settings.gStable) : settings.gStable;   // pinch (click) responds fastest
      const releaseOk = h.pose !== 'pinch' || now - (h.candSince ?? now) >= 70;          // pinch release debounce
      if (h.candN >= need && rawPose !== h.pose && releaseOk) { h.pose = rawPose; h.poseSince = now; }
      h.conf = (hd.score ?? 1) * (h.agree.filter((x) => x === h.pose).length / h.agree.length);
      h.hist.push({ t: now, x: h.x, y: h.y, size: f.size }); h.hist = h.hist.filter((s) => now - s.t < 1300);
      const tip = { x: h.x, y: h.y }; h.tipHist.push({ t: now, x: tip.x, y: tip.y }); h.tipHist = h.tipHist.filter((s) => now - s.t < 1500);
      out.push({ hand: i, x: h.x, y: h.y, pose: h.pose, conf: h.conf, lm: hd.landmarks, name: this.poseName(h) });
      this.emit('PALM_MOVE', { hand: i, x: h.x, y: h.y, pose: h.pose, conf: h.conf });
      if (prev !== h.pose) this.poseChange(h, prev, now);
    });
    const both = hands.length === 2;
    this.bothSince = both ? (this.bothSince ?? now) : null;
    // TWO FISTS (held ~0.18 s) → one TWO_FIST event; while both are fists, single-fist zoom is suppressed
    const twoFists = both && this.hands[0].pose === 'fist' && this.hands[1].pose === 'fist';
    if (twoFists) {
      this.fistPairSince ??= now; this.fistPair = true;
      if (!this.fistPairFired && now - this.fistPairSince >= 180) { this.fistPairFired = true; const [A, B] = this.hands; this.emit('TWO_FIST', { mid: { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 } }); }
    } else if (this.fistPair && !(both && (this.hands[0].pose === 'fist' || this.hands[1].pose === 'fist'))) {
      this.fistPair = false; this.fistPairSince = null; this.fistPairFired = false;   // re-arms once the fists open
    } else if (!twoFists) this.fistPairSince = null;
    if (both) this.twoHand(now); else if (this.two) this.endTwo();
    if (!this.two) this.hands.slice(0, hands.length).forEach((h) => this.single(h, now));
    if (both && !this.two) this.openPair(now);
    return out;
  }

  poseName(h) { return ({ open: 'POINTER', pinch: this.two ? '2× PINCH' : 'PINCH', pinch2: 'TWO-FINGER', fist: 'FIST', point: 'POINT', none: 'TRACKING' })[h.pose] || h.pose.toUpperCase(); }
  lost(h, now) {
    if (h.pose === 'pinch') this.emit('PINCH_END', { hand: h.i, x: h.x, y: h.y, cancelled: true });
    if (h.pose === 'fist') this.emit('FIST_END', { hand: h.i });
    h.pose = 'none'; h.cand = 'none'; h.lastSeen = 0; h.fx = new OneEuro(); h.fy = new OneEuro(); h.hist = []; h.tipHist = []; h.rawX = null; h.x = null; h.off = null; h.p2Latch = false;
    this.emit('HAND_LOST', { hand: h.i });
  }

  poseChange(h, prev, now) {
    const i = h.i;
    // a pinch that becomes a two-finger pinch was the start of the two-finger gesture: cancel it (no stray click)
    if (prev === 'pinch') this.emit('PINCH_END', { hand: i, x: h.x, y: h.y, cancelled: h.pose === 'pinch2' });
    if (prev === 'fist') this.emit('FIST_END', { hand: i });
    if (h.pose === 'pinch2') h.p2Latch = true;                         // …and releasing it through a plain pinch is not a click either
    if (h.pose === 'open' || h.pose === 'point') h.p2Latch = false;
    if (this.two) return;
    if (h.pose === 'pinch' && h.p2Latch) return;
    if (h.pose === 'pinch') { h.pinchStart = { x: h.x, y: h.y }; this.emit('PINCH_START', { hand: i, x: h.x, y: h.y, conf: h.conf }); }
    if (h.pose === 'pinch2') h.p2Fired = false;                       // fires from single() once it has been held
    if (h.pose === 'fist') { h.fistSize = h.f.size; h.fistFired = false; this.emit('FIST_START', { hand: i, x: h.x, y: h.y, conf: h.conf }); }
    if (h.pose === 'open') h.openFired = false;
    if (h.pose === 'point') { h.circ = 0; h.circArmed = false; }
  }

  single(h, now) {
    if (!h.lastSeen) return;
    const i = h.i, held = now - h.poseSince;
    const still = (ms, px) => { const r = h.hist.filter((s) => now - s.t < ms); return r.length >= 2 && Math.max(...r.map((s) => Math.hypot(s.x - h.x, s.y - h.y))) < px; };
    if (h.pose === 'pinch') this.emit('PINCH_MOVE', { hand: i, x: h.x, y: h.y, dx: h.x - h.pinchStart.x, dy: h.y - h.pinchStart.y });
    if (h.pose === 'fist') {
      const ratio = h.f.size / h.fistSize;
      this.emit('FIST_DEPTH', { hand: i, ratio, x: h.x, y: h.y, held, pair: !!this.fistPair });
      const p = held / settings.gHold;
      this.emit('HOLD_PROGRESS', { hand: i, kind: 'fist', p: still(500, 60) ? p : 0, x: h.x, y: h.y });
      if (!h.fistFired && held >= settings.gHold && still(settings.gHold * 0.8, 70)) { h.fistFired = true; this.emit('FIST_HOLD', { hand: i, x: h.x, y: h.y, conf: h.conf }); }
    }
    if (h.pose === 'open') {
      if (this.wave(h, now)) return;
      if (held > 160 && this.swipe(h, now)) { h.openFired = true; return; }
      const isStill = still(400, 28);
      this.emit('HOLD_PROGRESS', { hand: i, kind: 'open', p: isStill && !h.openFired ? held / settings.gHold : 0, x: h.x, y: h.y });
      if (!h.openFired && held >= settings.gHold && still(settings.gHold * 0.8, 30)) { h.openFired = true; this.emit('OPEN_HOLD', { hand: i, x: h.x, y: h.y, conf: h.conf }); }
    }
    if (h.pose === 'point') { this.pointSwipe(h, now) || this.circle(h, now); }
    if (h.pose === 'pinch2') {
      const p = held / 350;
      this.emit('HOLD_PROGRESS', { hand: i, kind: 'pinch2', p: h.p2Fired ? 0 : Math.min(1, p), x: h.x, y: h.y });
      if (!h.p2Fired && p >= 1 && still(300, 40) && this.cooldown(h, 'pinch2', 1200, now)) { h.p2Fired = true; this.emit('PINCH2_TAP', { hand: i, x: h.x, y: h.y, conf: h.conf }); }
      return;
    }
    if (h.pose !== 'fist' && h.pose !== 'open') this.emit('HOLD_PROGRESS', { hand: i, kind: 'none', p: 0 });
  }

  swipe(h, now) {
    const win = h.hist.filter((s) => now - s.t < 260); if (win.length < 4) return false;
    const a = win[0], dx = (h.x - a.x) / innerWidth, dy = (h.y - a.y) / innerHeight, th = 0.24 * settings.gSwipe;
    let type = null;
    if (Math.abs(dx) > th && Math.abs(dx) > Math.abs(dy) * 1.6) type = dx > 0 ? 'SWIPE_RIGHT' : 'SWIPE_LEFT';
    else if (Math.abs(dy) > th * 0.9 && Math.abs(dy) > Math.abs(dx) * 1.6) type = dy > 0 ? 'SWIPE_DOWN' : 'SWIPE_UP';
    if (!type || !this.cooldown(h, 'swipe', 900, now)) return false;
    h.hist = [];
    this.emit(type, { hand: h.i, x: h.x, y: h.y, from: { x: a.x, y: a.y }, conf: h.conf });
    return true;
  }
  wave(h, now) {
    const win = h.hist.filter((s) => now - s.t < 1200); if (win.length < 8) return false;
    let rev = 0, dir = 0, ext = win[0].x;
    for (const s of win) { const d = s.x - ext; if (Math.abs(d) > innerWidth * 0.035) { const nd = Math.sign(d); if (dir && nd !== dir) rev++; dir = nd; ext = s.x; } }
    if (rev < 3 || !this.cooldown(h, 'wave', 2200, now)) return false;
    h.cool.swipe = now + 900; h.hist = [];
    this.emit('WAVE', { hand: h.i, x: h.x, y: h.y, conf: h.conf });
    return true;
  }
  pointSwipe(h, now) {
    const win = h.tipHist.filter((s) => now - s.t < 260); if (win.length < 4) return false;
    const a = win[0], b = win[win.length - 1], dx = (b.x - a.x) / innerWidth, dy = (b.y - a.y) / innerHeight;
    if (Math.abs(dx) < 0.17 * settings.gSwipe || Math.abs(dx) < Math.abs(dy) * 2 || !this.cooldown(h, 'pswipe', 1200, now)) return false;
    h.tipHist = []; h.circ = 0;
    // targets are resolved with the PALM cursor the user sees, not the fingertip
    const pa = h.hist.find((s) => s.t >= a.t) || h.hist[0] || { x: h.x, y: h.y };
    this.emit('POINT_SWIPE', { hand: h.i, from: { x: pa.x, y: pa.y }, to: { x: h.x, y: h.y }, conf: h.conf });
    return true;
  }
  circle(h, now) {
    const pts = h.tipHist; if (pts.length < 10) return;
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length, cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const p = pts[pts.length - 1], q = pts[pts.length - 2];
    const r = Math.hypot(p.x - cx, p.y - cy); if (r < 22) return;
    let da = Math.atan2(p.y - cy, p.x - cx) - Math.atan2(q.y - cy, q.x - cx);
    if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
    const deg = da * 180 / Math.PI;
    if (Math.abs(deg) > 40) return;   // jitter / teleport guard
    h.circ = (h.circ || 0) + deg;
    if (!h.circArmed && Math.abs(h.circ) > 90) { h.circArmed = true; this.emit('CIRCLE_START', { hand: h.i, x: h.x, y: h.y, conf: h.conf }); }
    if (h.circArmed) this.emit('CIRCLE_ROTATE', { hand: h.i, deg, x: h.x, y: h.y });
  }

  twoHand(now) {
    const [A, B] = this.hands;
    if (A.pose === 'pinch' && B.pose === 'pinch') {
      const d = Math.hypot(B.x - A.x, B.y - A.y), ang = Math.atan2(B.y - A.y, B.x - A.x) * 180 / Math.PI;
      if (!this.two) {
        this.two = { d, ang };
        this.emit('PINCH_END', { hand: 0, x: A.x, y: A.y, cancelled: true }); this.emit('PINCH_END', { hand: 1, x: B.x, y: B.y, cancelled: true });
        this.emit('TWO_HAND_START', { a: { x: A.x, y: A.y }, b: { x: B.x, y: B.y } });
        return;
      }
      let da = ang - this.two.ang; if (da > 180) da -= 360; if (da < -180) da += 360;
      const f = d / Math.max(30, this.two.d);
      const mid = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
      if (Math.abs(f - 1) > 0.004) this.emit('TWO_HAND_SCALE', { factor: f, mid, a: { x: A.x, y: A.y }, b: { x: B.x, y: B.y } });
      if (Math.abs(da) > 0.3) this.emit('TWO_HAND_ROTATE', { deg: da, mid });
      this.two = { d, ang };
    } else if (this.two) this.endTwo();
  }
  endTwo() { this.two = null; this.emit('TWO_HAND_END', {}); }
  openPair(now) {
    const [A, B] = this.hands;
    if (A.pose !== 'open' || B.pose !== 'open' || now - (this.bothSince ?? now) < 500) { this.twoOpen = []; return; }
    this.twoOpen.push({ t: now, d: Math.hypot(B.x - A.x, B.y - A.y) / innerWidth });
    this.twoOpen = this.twoOpen.filter((s) => now - s.t < 400);
    if (this.twoOpen.length < 4) return;
    const delta = this.twoOpen[this.twoOpen.length - 1].d - this.twoOpen[0].d;
    if (Math.abs(delta) > 0.28 && this.cooldown(A, 'pair', 1500, now)) {
      A.cool.swipe = B.cool.swipe = now + 900; this.twoOpen = [];
      this.emit(delta > 0 ? 'PUSH_OUT' : 'PULL_IN', { mid: { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 } });
    }
  }
}
