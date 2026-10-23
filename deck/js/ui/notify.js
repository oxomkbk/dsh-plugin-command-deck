// Toasts (transient, optional action such as UNDO) + notification center (persistent list).
import { bus } from '../core/bus.js';
import { t, locale } from '../core/i18n.js';
const el = (t, c, txt) => { const e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; };

export class Notifier {
  constructor() {
    this.items = []; this.unread = 0;
    this.box = document.getElementById('toasts');
    this.drawer = document.getElementById('drawer-notify');
    this.badge = document.getElementById('notify-count');
    bus.on('toast', (t) => this.toast(t));
    bus.on('notify', (n) => this.notify(n));
    document.getElementById('btn-notify').onclick = () => this.toggle();
  }
  toast({ text, kind = '', action, run, ms = 3200 }) {
    const t = el('div', `toast ${kind}`); t.append(el('span', null, text));
    if (action) { const b = el('button', null, action); b.onclick = () => { run?.(); t.remove(); }; t.append(b); ms = Math.max(ms, 6000); }
    this.box.append(t);
    while (this.box.children.length > 4) this.box.firstElementChild.remove();
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 320); }, ms);
  }
  notify({ text, kind = '' }) {
    this.items.unshift({ text, kind, at: new Date() });
    this.items.length = Math.min(this.items.length, 100);
    if (this.drawer.hidden) { this.unread++; this.badge.hidden = false; this.badge.textContent = this.unread; }
    else this.render();
  }
  toggle(force) {
    const show = force ?? this.drawer.hidden;
    this.drawer.hidden = !show;
    if (show) { this.unread = 0; this.badge.hidden = true; this.render(); }
  }
  render() {
    const h = el('div', 'dr-h'); h.append(t('NOTIFICATIONS'), el('span', 'sp'));
    const clr = el('button', null, t('CLEAR')); clr.onclick = () => { this.items = []; this.render(); };
    const x = el('button', null, '✕'); x.onclick = () => this.toggle(false); h.append(clr, x);
    const list = el('div', 'dr-list');
    for (const n of this.items) { const r = el('div', `n-item ${n.kind}`); r.append(el('div', 'tm', n.at.toLocaleTimeString(locale())), n.text); list.append(r); }
    if (!this.items.length) list.append(el('div', 'empty', t('NOTHING YET')));
    this.drawer.replaceChildren(h, list);
  }
}
