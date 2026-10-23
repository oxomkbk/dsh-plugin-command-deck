// Task history + favourites drawer: search, star, re-run, restore results without re-running, export, delete.
import { bus } from '../core/bus.js';
import { history } from '../core/store.js';
import { t, locale } from '../core/i18n.js';
const el = (t, c, txt) => { const e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; };

export function exportRun(entry, fmt = 'md') {
  if (!entry) return;
  let blob, name = `deck-${entry.id}`;
  if (fmt === 'json') { blob = new Blob([JSON.stringify(entry, null, 2)], { type: 'application/json' }); name += '.json'; }
  else {
    const d = entry.dashboard || {};
    const md = [`# ${entry.prompt}`, `_${new Date(entry.at).toLocaleString()} · ${entry.framework || ''}_`, '', entry.answer || '', '',
      '## Key data', ...(d.metrics || []).map((m) => `- **${m.display}** — ${m.label} (${m.corroborated ? `${m.sources} sources agree` : 'single source'}) ${m.url}`), '',
      '## Images', ...(d.images || []).filter((i) => i.local_url || i.image_url).slice(0, 12).map((i) => `- ${i.title || ''} — ${i.page_url || i.image_url} (${i.license || 'licence unknown'})`), '',
      '## Sources', ...(d.sources || []).map((s) => `${s.n}. [${s.title}](${s.url})`)].join('\n');
    blob = new Blob([md], { type: 'text/markdown' }); name += '.md';
  }
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export class HistoryPanel {
  constructor({ onRerun, onRestore }) {
    this.d = document.getElementById('drawer-history'); this.q = ''; this.onlyFav = false;
    this.onRerun = onRerun; this.onRestore = onRestore;
    document.getElementById('btn-history').onclick = () => this.toggle();
    bus.on('history:changed', () => { if (!this.d.hidden) this.render(); });
  }
  toggle(force) { const show = force ?? this.d.hidden; this.d.hidden = !show; if (show) this.render(); }
  render() {
    const h = el('div', 'dr-h'); h.append(t('HISTORY'), el('span', 'sp'));
    const fav = el('button', null, t(this.onlyFav ? '★ FAVORITES' : '☆ ALL')); fav.onclick = () => { this.onlyFav = !this.onlyFav; this.render(); };
    const x = el('button', null, '✕'); x.onclick = () => this.toggle(false); h.append(fav, x);
    const s = el('input', 'dr-search'); s.placeholder = t('filter…'); s.value = this.q; s.oninput = () => { this.q = s.value; this.renderList(list); };
    const list = el('div', 'dr-list');
    this.d.replaceChildren(h, s, list); this.renderList(list);
  }
  renderList(list) {
    const q = this.q.toLowerCase();
    const items = history.items.filter((i) => (!this.onlyFav || i.favorite) && (!q || i.prompt.toLowerCase().includes(q)));
    list.replaceChildren(...items.map((it) => {
      const r = el('div', 'h-item');
      r.append(el('div', 'q', it.prompt), el('div', 'm', `${new Date(it.at).toLocaleString(locale())} · ${t(it.status)}${it.stats ? ` · ${t('{r} sources · {i} imgs', { r: it.stats.results, i: it.stats.downloaded || 0 })}` : ''}`));
      const acts = el('div', 'acts');
      const star = el('button', `star${it.favorite ? ' on' : ''}`, it.favorite ? '★' : '☆'); star.onclick = () => { history.update(it.id, { favorite: !it.favorite }); this.render(); };
      const mk = (label, fn) => { const b = el('button', null, label); b.onclick = fn; return b; };
      acts.append(star, mk(t('RE-RUN'), () => this.onRerun(it.prompt)), it.dashboard ? mk(t('RESTORE'), () => this.onRestore(it)) : '', mk('MD', () => exportRun(it, 'md')), mk('JSON', () => exportRun(it, 'json')),
        mk(t('DELETE'), () => { history.remove(it.id); this.render(); }));
      r.append(acts); return r;
    }));
    if (!items.length) list.append(el('div', 'empty', t('NO TASKS YET')));
  }
}
