// Feedback layer: ripples, glyph particles, sweeps — every gesture/click/event gets one.
export class FX {
  constructor(canvas) {
    this.c = canvas; this.g = canvas.getContext('2d'); this.items = []; this.rgb = '0,255,140';
    const rs = () => { this.d = Math.min(devicePixelRatio, 2); this.c.width = innerWidth * this.d; this.c.height = innerHeight * this.d; };
    rs(); addEventListener('resize', rs);
    const tick = () => { this.draw(); requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  }
  ripple(x, y, { max = 60, life = 600, rgb } = {}) { this.items.push({ k: 'ring', x, y, max, life, t: performance.now(), rgb: rgb || this.rgb }); }
  burst(x, y, n = 24, { rgb, speed = 3 } = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random());
      this.items.push({ k: 'p', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 500 + Math.random() * 500, t: performance.now(), rgb: rgb || this.rgb, ch: String.fromCharCode(0x30a0 + ((Math.random() * 96) | 0)) });
    }
  }
  sweep(dir = 1, { rgb } = {}) { this.items.push({ k: 'sweep', dir, life: 550, t: performance.now(), rgb: rgb || this.rgb }); }
  rect(r, { rgb, life = 700 } = {}) { this.items.push({ k: 'rect', r, life, t: performance.now(), rgb: rgb || this.rgb }); }
  draw() {
    const g = this.g, d = this.d, now = performance.now();
    g.clearRect(0, 0, this.c.width, this.c.height);
    if (!this.items.length) return;
    g.font = `${12 * d}px monospace`;
    this.items = this.items.filter((it) => {
      const k = (now - it.t) / it.life; if (k >= 1) return false;
      if (it.k === 'ring') {
        g.strokeStyle = `rgba(${it.rgb},${(1 - k) * 0.9})`; g.lineWidth = (2.5 * (1 - k) + 0.5) * d;
        for (const off of [0, 0.22]) { const kk = Math.max(0, k - off); g.beginPath(); g.arc(it.x * d, it.y * d, it.max * d * Math.sqrt(kk), 0, Math.PI * 2); g.stroke(); }
      } else if (it.k === 'p') {
        it.x += it.vx; it.y += it.vy; it.vy += 0.05; g.fillStyle = `rgba(${it.rgb},${1 - k})`; g.fillText(it.ch, it.x * d, it.y * d);
      } else if (it.k === 'sweep') {
        const x = (it.dir > 0 ? k : 1 - k) * this.c.width, grd = g.createLinearGradient(x - 160 * d, 0, x, 0);
        grd.addColorStop(0, 'transparent'); grd.addColorStop(1, `rgba(${it.rgb},.35)`); g.fillStyle = grd; g.fillRect(x - 160 * d, 0, 160 * d, this.c.height);
      } else if (it.k === 'rect') {
        g.strokeStyle = `rgba(${it.rgb},${1 - k})`; g.lineWidth = 2 * d; const p = 8 * k * d;
        g.strokeRect((it.r.left - p / d) * d, (it.r.top - p / d) * d, (it.r.width + 2 * p / d) * d, (it.r.height + 2 * p / d) * d);
      }
      return true;
    });
  }
}
