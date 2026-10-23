// Depth rig (v5.4): the deck reads as a 3D cockpit instead of flat panels on a backdrop.
//   • PARALLAX — the pointer (mouse, or the hand cursor) tilts your point of view: the globe camera orbits a
//     little, the side docks slide against it, the bottom dock and the KPI strip less — near layers move
//     more than far ones, so the HUD floats in front of the planet.
//   • SPECULAR SHEEN — a soft light follows the pointer across the glass of the panel under / near it.
// Everything is written as `translate` / `transform` on a handful of elements (compositor-only, no layout,
// no repaint of the WebGL canvas), only while the pointer moves, and is off with animations off, reduced
// motion, the Low tier, while magnified, or while a panel is being dragged.
import { settings } from '../core/store.js';

const DEPTH = { left: [9, 5], right: [9, 5], bottom: [6, 3] };   // px of travel at the screen edge (x, y) per dock
const SHEEN = 520;                                                // sheen diameter (px)

export class DepthRig {
  constructor({ space, deck }) {
    Object.assign(this, { space, deck });
    this.goal = { x: 0, y: 0 }; this.cur = { x: 0, y: 0 }; this.ptr = null; this.raf = 0; this.idle = true;
    this.kpi = document.getElementById('kpi');
    addEventListener('mousemove', (e) => this.point(e.clientX, e.clientY), { passive: true });
    document.addEventListener('mouseleave', () => this.point(innerWidth / 2, innerHeight / 2));
  }
  get on() {
    return settings.animations && this.space?.tier !== 'low' && !document.body.classList.contains('zoomed')
      && !document.body.classList.contains('reduce-motion') && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  /** Pointer in screen px (mouse or hand). */
  point(x, y) {
    this.ptr = { x, y };
    this.goal = { x: Math.max(-1, Math.min(1, (x / innerWidth) * 2 - 1)), y: Math.max(-1, Math.min(1, (y / innerHeight) * 2 - 1)) };
    if (!this.raf) this.raf = requestAnimationFrame(() => this.step());
  }
  step() {
    this.raf = 0;
    if (document.querySelector('.card.floating')) return;          // a panel is being dragged: hold the view still
    const live = this.on, g = live ? this.goal : { x: 0, y: 0 };
    const k = 0.12;                                                  // ~0.15 s ease: weighty, not twitchy
    this.cur.x += (g.x - this.cur.x) * k; this.cur.y += (g.y - this.cur.y) * k;
    const settled = Math.abs(g.x - this.cur.x) < 0.002 && Math.abs(g.y - this.cur.y) < 0.002;
    if (settled) { this.cur.x = g.x; this.cur.y = g.y; }
    this.apply(live);
    if (!settled) this.raf = requestAnimationFrame(() => this.step());
  }
  apply(live) {
    const { x, y } = this.cur;
    if (this.space) this.space.parallax = { x: x * 0.9, y: y * 0.9 };
    const cards = [];
    for (const slot of Object.keys(DEPTH)) {
      const dock = document.getElementById(`dock-${slot}`); if (!dock) continue;
      const [dx, dy] = DEPTH[slot];
      for (const el of dock.children) if (el.classList.contains('card')) { el.style.translate = live || x || y ? `${(-x * dx).toFixed(2)}px ${(-y * dy).toFixed(2)}px` : ''; cards.push(el); }
    }
    if (this.kpi) this.kpi.style.translate = live || x || y ? `${(-x * 3).toFixed(2)}px ${(-y * 2).toFixed(2)}px` : '';
    // specular sheen: read every rect first, then write (no layout thrash)
    const p = this.ptr, rects = p && live ? cards.map((el) => el.getBoundingClientRect()) : null;
    cards.forEach((el, i) => {
      const sh = el.querySelector(':scope > .sheen > i'); if (!sh) return;
      if (!rects) { sh.style.opacity = '0'; return; }
      const r = rects[i], dist = Math.hypot(Math.max(r.left - p.x, 0, p.x - r.right), Math.max(r.top - p.y, 0, p.y - r.bottom));
      sh.style.opacity = String(Math.max(0, 1 - dist / 160).toFixed(2));
      sh.style.transform = `translate(${(p.x - r.left - SHEEN / 2).toFixed(0)}px, ${(p.y - r.top - SHEEN / 2).toFixed(0)}px)`;
    });
  }
}
