// Screen magnifier (gesture zoom).
//   ✊  one fist, held      → the area around the fist zooms in gradually (the point under it stays put)
//   ✊✊ two fists           → back to 1×
//   ✋  open palm at an edge → pans the zoomed screen that way (centre = dead zone: point & pinch as usual)
// Keyboard / mouse: Z zooms in at the mouse, Shift+Z resets, arrow keys pan while zoomed, Esc resets.
//
// Everything that forms the deck “screen” lives in #zoom-root (WebGL scene, HUD, docks, labels); one CSS
// transform scales it. Overlays (modals, settings, palette, toasts, hand cursors, effects) stay outside,
// sharp and at their normal size. Hit-testing (mouse, magnet, pinch) works unchanged because the browser
// maps screen points through the transform; toLayout() converts for the few places that need layout space.
import { bus } from '../core/bus.js';
import { t } from '../core/i18n.js';

export const ZOOM_MAX = 4;

export class Zoom {
  constructor() {
    this.root = document.getElementById('zoom-root');
    this.hud = document.getElementById('zoom-hud');
    this.z = 1; this.tx = 0; this.ty = 0;
    this.hud.innerHTML = '<div class="zh-badge"><b></b><span></span></div><div class="zh-map"><i></i></div><i class="ze l"></i><i class="ze r"></i><i class="ze t"></i><i class="ze b"></i>';
    this.badge = this.hud.querySelector('.zh-badge b'); this.hint = this.hud.querySelector('.zh-badge span'); this.view = this.hud.querySelector('.zh-map i');
    this.edges = Object.fromEntries(['l', 'r', 't', 'b'].map((k) => [k, this.hud.querySelector(`.ze.${k}`)]));
    addEventListener('resize', () => this.apply());
    bus.on('lang:changed', () => this.apply());
  }
  get active() { return this.z > 1.01; }
  /** Screen point → layout (unzoomed) point. */
  toLayout(x, y) { return { x: (x - this.tx) / this.z, y: (y - this.ty) / this.z }; }
  /** Multiply the zoom by f around screen point (cx, cy): the content under it stays under it. */
  zoomAt(cx, cy, f) {
    const z = Math.max(1, Math.min(ZOOM_MAX, this.z * f)); if (z === this.z) return;
    const p = this.toLayout(cx, cy);
    this.z = z; this.tx = cx - p.x * z; this.ty = cy - p.y * z;
    this.apply();
  }
  pan(dx, dy) { if (!this.active) return; this.tx += dx; this.ty += dy; this.apply(); }
  /** Edge-pan velocity indicator (0…1 per edge) — drawn as glowing bars. */
  edge(l, r, tp, b) { for (const [k, v] of Object.entries({ l, r, t: tp, b })) this.edges[k].style.opacity = String(Math.min(1, v)); }
  reset(animated = true) {
    if (!this.active) { this.z = 1; this.tx = this.ty = 0; this.apply(); return; }
    if (!animated) { this.z = 1; this.tx = this.ty = 0; this.apply(); return; }
    const z0 = this.z, x0 = this.tx, y0 = this.ty, t0 = performance.now(), ms = 420;
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      this.z = z0 + (1 - z0) * e; this.tx = x0 * (1 - e); this.ty = y0 * (1 - e); this.apply();
      if (k < 1) requestAnimationFrame(step);
    };
    step();
  }
  apply() {
    const W = innerWidth, H = innerHeight;
    this.tx = Math.min(0, Math.max(W - W * this.z, this.tx)); this.ty = Math.min(0, Math.max(H - H * this.z, this.ty));
    const on = this.active;
    this.root.style.transform = on ? `translate(${this.tx.toFixed(1)}px, ${this.ty.toFixed(1)}px) scale(${this.z.toFixed(4)})` : '';
    document.body.classList.toggle('zoomed', on);
    this.hud.hidden = !on;
    if (on) {
      this.badge.textContent = `${this.z.toFixed(1)}×`;
      this.hint.textContent = t('two fists = reset · open palm at an edge = pan · Shift+Z');
      const v = this.view.style;   // minimap: the visible part of the screen
      v.left = `${(-this.tx / (W * this.z)) * 100}%`; v.top = `${(-this.ty / (H * this.z)) * 100}%`; v.width = `${100 / this.z}%`; v.height = `${100 / this.z}%`;
    } else this.edge(0, 0, 0, 0);
    bus.emit('zoom:changed', this.z);
  }
}
