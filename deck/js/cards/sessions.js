// SESSIONS — DeepSeek Harness' own conversation list, inside the deck.
// Embedded (?host=dsh), the plugin's browser half pushes the Session directory over postMessage
// (kind: 'sessions'); clicking a row asks it to follow that Session, and the bridge replays the
// conversation into the deck's own transcript. Standalone the deck has no Session directory: the
// card says who owns it instead of pretending.
import { bus } from '../core/bus.js';
import { t, locale } from '../core/i18n.js';
import { EMBEDDED, openSession, newSession } from '../core/host.js';

const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const T_NEW = 'NEW';
const T_NEW_TIP = 'Start a fresh DeepSeek Harness Session on the next command';

/** 'just now · 4m · 3h · 2d' — the deck's own clock, not DSH's copy. */
function ago(at, now = Date.now()) {
  if (!at) return '';
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return t('just now');
  if (s < 3600) return Math.round(s / 60) + 'm';
  if (s < 86400) return Math.round(s / 3600) + 'h';
  if (s < 86400 * 30) return Math.round(s / 86400) + 'd';
  try { return new Date(at).toLocaleDateString(locale(), { month: 'short', day: 'numeric' }); } catch { return '' }
}

export class SessionsView {
  constructor(card) {
    this.card = card; this.box = card.body; this.rows = []; this.active = null; this.host = EMBEDDED;
    this.bar = el('div', 'sess-bar');
    this.count = el('span', 'cnt', '');
    this.neu = el('button', 'sess-new', t(T_NEW));
    this.neu.title = t(T_NEW_TIP);
    this.neu.onclick = () => {
      if (!this.host) return;
      newSession(); this.active = null; this.mark();
      bus.emit('toast', { text: t('New Session — your next command starts it') });
    };
    this.bar.append(el('span', 'sp'), this.count, this.neu);
    this.list = el('div', 'sess-list');
    this.box.append(this.bar, this.list);
    this.note();
    bus.on('lang:changed', () => {
      this.neu.textContent = t(T_NEW); this.neu.title = t(T_NEW_TIP);
      if (!this.host) { this.list.replaceChildren(); this.note(); return; }
      this.render();
    });
  }
  /** Standalone: there is no directory to show — say who owns it. */
  note() {
    const key = this.host
      ? 'No conversations yet — the next command starts one.'
      : 'Sessions are managed by DeepSeek Harness — open the deck from DSH to see them here.';
    this.list.append(el('div', 'sess-empty', t(key)));
  }
  /** The bridge's push: [{ id, title, at, running }] plus the followed id. */
  set(rows, active) {
    if (!this.host) return;
    this.rows = Array.isArray(rows) ? rows : [];
    if (active !== undefined) this.active = active;
    this.render();
  }
  mark() { for (const b of this.list.querySelectorAll('.sess')) b.dataset.active = String(b.dataset.id === this.active); }
  render() {
    const now = Date.now();
    const frag = document.createDocumentFragment();
    for (const row of this.rows) {
      const title = row.title || t('Untitled session');
      const b = el('button', 'sess');
      b.dataset.id = row.id;
      b.dataset.active = String(row.id === this.active);
      b.dataset.running = String(!!row.running);
      b.title = title;
      b.append(el('i', 'dot'), el('b', null, title), el('small', null, ago(row.at, now)));
      if (row.shown) { const tag = el('em', 'sh', 'DSH'); tag.title = t('This is the conversation DeepSeek Harness is showing'); b.append(tag); }
      b.onclick = () => {
        if (row.id === this.active) return;
        this.active = row.id; this.mark();
        openSession(row.id);
        bus.emit('toast', { text: t('Following “{p}” in the deck', { p: title }) });
      };
      frag.append(b);
    }
    this.list.replaceChildren(frag);
    if (!this.rows.length) this.note();
    this.count.textContent = this.host ? String(this.rows.length) : '';
    if (this.card && this.card.meta) this.card.meta.textContent = this.host ? t('DSH') : '';
  }
  reset() { this.rows = []; this.active = null; this.list.replaceChildren(); this.count.textContent = ''; this.note(); }
}
