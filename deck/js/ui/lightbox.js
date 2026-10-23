// Click an image → full-size viewer with prev/next, licence, source and download.
import { bus } from '../core/bus.js';
import { t } from '../core/i18n.js';
const el = (t, c, txt) => { const e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; };
const safe = (u) => (typeof u === 'string' && /^(https?:\/\/|\/media\/|assets\/sample\/img\/\d+\.jpg$)/i.test(u) ? u : null);

export class Lightbox {
  constructor() {
    this.m = document.getElementById('lightbox');
    bus.on('lightbox:open', ({ items, index }) => this.open(items, index));
    this.m.addEventListener('click', (e) => { if (e.target === this.m) this.close(); });
    addEventListener('keydown', (e) => { if (this.m.hidden) return; if (e.key === 'ArrowRight') this.go(1); if (e.key === 'ArrowLeft') this.go(-1); if (e.key === 'Escape') this.close(); });
  }
  get openNow() { return !this.m.hidden; }
  open(items, i) { this.items = items; this.i = i; this.m.hidden = false; this.render(); }
  close() { this.m.hidden = true; }
  go(d) { if (!this.items) return; this.i = (this.i + d + this.items.length) % this.items.length; this.render(); }
  render() {
    const im = this.items[this.i];
    const box = el('div', 'lb');
    const img = el('img'); img.referrerPolicy = 'no-referrer'; img.src = safe(im.local_url) || safe(im.image_url) || safe(im.local_thumb) || ''; img.alt = im.title || '';
    const cap = el('div', 'cap'); cap.append(`${im.title || ''}  `, el('span', null, `· ${im.provider || ''} · ${im.width || '?'}×${im.height || '?'} · ${t('licence')}: ${im.license || t('unknown')}${im.creator ? ' · ' + im.creator : ''}`), ' ');
    for (const [label, href] of [['source page', im.page_url], ['original', im.local_url || im.image_url]]) { const h = safe(href); if (h) { const a = el('a', null, t(label)); a.href = h; a.target = '_blank'; a.rel = 'noopener noreferrer'; cap.append(' · ', a); } }
    if (im.local_url) { const a = el('a', null, t('download')); a.href = im.local_url; a.download = ''; cap.append(' · ', a); }
    box.append(img, cap, el('div', 'cap', `${this.i + 1} / ${this.items.length} · ${t('← → or swipe')}`));
    const p = el('button', 'lb-nav prev', '‹'); p.onclick = () => this.go(-1);
    const n = el('button', 'lb-nav next', '›'); n.onclick = () => this.go(1);
    this.m.replaceChildren(box, p, n);
  }
}
