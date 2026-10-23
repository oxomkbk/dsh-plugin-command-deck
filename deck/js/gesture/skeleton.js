// Hand layer: fingertip pointers (glowing dot + trail + live gesture label & confidence),
// magnet tether (raw fingertip → the control the pointer has latched onto),
// optional 21-landmark skeleton, hold-progress rings, gesture HUD.
// Draws landmark geometry only — never camera pixels. "Fully hidden" hides the skeleton
// but keeps the fingertip pointer so the deck stays operable.
// v5.4: the ring cursor is drawn at DISPLAY rate, interpolated (with a little velocity prediction) between
// tracker frames, so it glides at 60 fps instead of stepping at the camera's 25–30 fps; the canvas glow is
// drawn with layered strokes instead of shadowBlur (which cost several ms per frame on the main thread the
// hand tracker also runs on), and theme colours are cached instead of re-reading styles every frame.
import { settings } from '../core/store.js';
import { t } from '../core/i18n.js';

const BONES = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
const TIPS = new Set([4, 8, 12, 16, 20]);

export class SkeletonLayer {
  constructor() {
    this.c = document.getElementById('skeleton'); this.g = this.c.getContext('2d');
    this.cursors = [0, 1].map((i) => document.getElementById(`hcursor-${i}`));
    this.labels = this.cursors.map((c) => c.querySelector('.lbl'));
    this.trails = [[], []]; this.snap = [null, null];
    this.tgt = [null, null]; this.shown = [null, null]; this.loop = 0; this.cols = null; this.colsAt = 0;
    this.hud = document.getElementById('gesture-hud');
    this.name = document.getElementById('g-name'); this.hint = document.getElementById('g-hint'); this.conf = document.getElementById('g-conf');
    const rs = () => { this.d = Math.min(devicePixelRatio, 2); this.c.width = innerWidth * this.d; this.c.height = innerHeight * this.d; };
    rs(); addEventListener('resize', rs);
  }
  /** hands: [{lm, x, y, pose, conf, name, hand}] — x/y = fingertip pointer in screen px */
  draw(hands) {
    const g = this.g, d = this.d, W = this.c.width, H = this.c.height, now = performance.now();
    g.clearRect(0, 0, W, H);
    if (!this.cols || now - this.colsAt > 1000) {                       // theme colours: re-read once a second, not every frame
      const css = getComputedStyle(document.body); this.colsAt = now;
      this.cols = [css.getPropertyValue('--accent').trim() || '#49e6ff', css.getPropertyValue('--accent2').trim() || '#ffb347'];
    }
    const cols = this.cols;
    const seen = new Set();
    for (const h of hands) {
      const col = cols[h.hand % 2]; seen.add(h.hand);
      if (settings.privacy !== 'hidden') {
        const P = h.lm.map((p) => { const q = this.map ? this.map({ x: 1 - p.x, y: p.y }) : { x: (1 - p.x) * innerWidth, y: p.y * innerHeight }; return [q.x * d, q.y * d]; });
        g.lineCap = 'round'; g.strokeStyle = col;
        const bones = () => { g.beginPath(); for (const [a, b] of BONES) { g.moveTo(...P[a]); g.lineTo(...P[b]); } g.stroke(); };
        g.globalAlpha = 0.12; g.lineWidth = 9 * d; bones();                // soft glow (layered strokes — no shadowBlur)
        g.globalAlpha = 0.55; g.lineWidth = 2.2 * d; bones();
        P.forEach(([x, y], i) => { g.globalAlpha = TIPS.has(i) ? 0.95 : 0.7; g.fillStyle = TIPS.has(i) ? '#fff' : col; g.beginPath(); g.arc(x, y, (TIPS.has(i) ? 3.6 : 2.4) * d, 0, Math.PI * 2); g.fill(); });
        g.globalAlpha = 1;
      }
      // fingertip trail
      const tr = this.trails[h.hand]; tr.push({ x: h.x, y: h.y, t: now });
      while (tr.length && now - tr[0].t > 380) tr.shift();
      for (let i = 1; i < tr.length; i++) {
        const k = i / tr.length; g.strokeStyle = col;
        g.globalAlpha = k * 0.18; g.lineWidth = (4 + k * 10) * d; g.beginPath(); g.moveTo(tr[i - 1].x * d, tr[i - 1].y * d); g.lineTo(tr[i].x * d, tr[i].y * d); g.stroke();
        g.globalAlpha = k * 0.9; g.lineWidth = (1 + k * 4) * d; g.stroke();
      }
      // magnet tether: the ring sits on the latched control, a thin line shows the real fingertip
      const sn = this.snap[h.hand];
      if (sn && Math.hypot(sn.x - h.x, sn.y - h.y) > 3) {
        g.globalAlpha = 0.85; g.strokeStyle = cols[1]; g.lineWidth = 1.2 * d; g.setLineDash([4 * d, 3 * d]);
        g.beginPath(); g.moveTo(h.x * d, h.y * d); g.lineTo(sn.x * d, sn.y * d); g.stroke(); g.setLineDash([]);
      }
      g.fillStyle = col; g.globalAlpha = 0.25; g.beginPath(); g.arc(h.x * d, h.y * d, 11 * d, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1; g.fillStyle = '#fff'; g.beginPath(); g.arc(h.x * d, h.y * d, (h.pose === 'pinch' ? 5 : 4) * d, 0, Math.PI * 2); g.fill();
    }
    for (let i = 0; i < 2; i++) if (!seen.has(i)) this.trails[i] = [];
  }
  /** Ring cursor at the (assisted) pointer; opts.snapped = latched onto a control, opts.label = what a pinch will do. */
  cursor(i, x, y, pose, visible, conf = 1, opts = {}) {
    const el = this.cursors[i]; if (!el) return;
    el.hidden = !visible; if (!visible) { this.snap[i] = null; this.tgt[i] = null; this.shown[i] = null; return; }
    this.target(i, x, y);
    for (const p of ['pinch', 'fist', 'point']) el.classList.toggle(p, pose === p || (p === 'pinch' && pose === 'pinch2'));
    el.classList.toggle('snap', !!opts.snapped);
    this.snap[i] = opts.snapped ? { x, y } : null;
    const name = t(({ open: 'POINTER', pinch: 'PINCH', pinch2: 'TWO-FINGER', fist: 'FIST', point: 'POINT', none: 'TRACKING' })[pose] || pose);
    this.labels[i].textContent = `${opts.label || name} · ${Math.round((conf ?? 1) * 100)}%`;
  }
  /** New tracker sample for cursor i: remember it (with velocity) and let the display-rate loop glide there. */
  target(i, x, y) {
    const now = performance.now(), p = this.tgt[i];
    let vx = 0, vy = 0;
    if (p && now > p.t) { const dt = now - p.t; vx = 0.5 * p.vx + 0.5 * (x - p.x) / dt; vy = 0.5 * p.vy + 0.5 * (y - p.y) / dt; }
    if (p && Math.hypot(x - p.x, y - p.y) > 260) { vx = vy = 0; this.shown[i] = null; }           // re-acquired hand: jump, don't fly
    this.tgt[i] = { x, y, t: now, vx, vy };
    if (!this.shown[i]) { this.shown[i] = { x, y }; this.paint(i); }
    if (!this.loop) this.loop = requestAnimationFrame((ts) => this.tick(ts));
  }
  tick() {
    this.loop = 0; const now = performance.now(); let any = false;
    for (let i = 0; i < 2; i++) {
      const g = this.tgt[i], s = this.shown[i]; if (!g || !s) continue; any = true;
      const ahead = Math.min(45, now - g.t);                                    // predict up to ~1 camera frame ahead
      const px = g.x + g.vx * ahead, py = g.y + g.vy * ahead;
      const k = 1 - Math.exp(-Math.max(1, now - (s.t ?? now - 16)) / 24);      // ~24 ms glide
      s.x += (px - s.x) * k; s.y += (py - s.y) * k; s.t = now;
      this.paint(i);
    }
    if (any) this.loop = requestAnimationFrame(() => this.tick());
  }
  paint(i) { const s = this.shown[i], el = this.cursors[i]; if (s && el) el.style.transform = `translate3d(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px, 0)`; }
  hold(i, p) {
    const c = this.cursors[i]?.querySelector('.hold circle'); if (!c) return;
    c.style.strokeDashoffset = String(163.4 * (1 - Math.max(0, Math.min(1, p))));
  }
  show(name, hint = '', conf = 1, fire = false) {
    this.hud.hidden = false;
    this.name.textContent = name; this.hint.textContent = hint; this.conf.style.width = `${Math.round(conf * 100)}%`;
    if (fire) { this.hud.classList.remove('fire'); void this.hud.offsetWidth; this.hud.classList.add('fire'); }
  }
  hideAll() { this.g.clearRect(0, 0, this.c.width, this.c.height); this.cursors.forEach((c) => { c.hidden = true; }); this.hud.hidden = true; this.trails = [[], []]; this.tgt = [null, null]; this.shown = [null, null]; }
}
