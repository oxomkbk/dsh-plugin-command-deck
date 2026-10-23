// Result card renderers. Each update() returns a Promise that resolves when the
// data-arrival animations are finished — main.js uses that to emit the FSM's
// `render_complete` event (an event, not a timer guess).
import { bus } from '../core/bus.js';
import { decode, roll, skeleton } from '../fx/anim.js';
import { t } from '../core/i18n.js';
import { renderWidgets } from './widgets.js';

const el = (t, c, txt) => { const e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; };
const safe = (u) => (typeof u === 'string' && /^(https?:\/\/|\/media\/|assets\/sample\/img\/\d+\.jpg$)/i.test(u) ? u : null);
const link = (text, href, cls) => { const a = el('a', cls, text); const h = safe(href); if (h) { a.href = h; a.target = '_blank'; a.rel = 'noopener noreferrer'; } return a; };
const empty = (msg) => el('div', 'empty', t(msg));
const settle = (nodes) => Promise.all([...nodes].map((n) => (n.getAnimations ? Promise.all(n.getAnimations().map((a) => a.finished.catch(() => {}))) : null)));
const accent = () => getComputedStyle(document.body).getPropertyValue('--accent-rgb').trim() || '0,255,140';

function chips(container, items, active, onPick) {
  container.replaceChildren(...items.map(([k, label]) => { const b = el('button', k === active ? 'on' : '', label); b.onclick = () => onPick(k); return b; }));
}
import { copyText } from '../core/clipboard.js';
function copy(text) { copyText(text).then((ok) => bus.emit('toast', ok ? { text: t('Copied to clipboard') } : { text: t('Clipboard unavailable'), kind: 'warn' })); }

// ─────────────────────────────── summary
export class SummaryView {
  constructor(card) { this.card = card; this.reset(); }
  reset(msg = 'AWAITING COMMAND') { this.card.body.replaceChildren(empty(msg)); this.card.meta.textContent = ''; this.answer = ''; this.widgets = []; }
  metrics(s = {}) {
    const row = el('div', 'metrics-row');
    for (const [k, v] of [['sources', s.results], ['domains', s.domains], ['pages', s.pages_read], ['images', s.downloaded], ['tools', s.tool_calls], ['sec', s.elapsed_ms != null ? (s.elapsed_ms / 1000).toFixed(1) : null]]) {
      if (v == null || (!v && k !== 'tools' && k !== 'sec')) continue; const m = el('span', 'metric'); const b = el('b', null, v); m.append(b, t(k)); row.append(m); if (this.rollNext) roll(b, String(v), 800);
    }
    return row;
  }
  progress(stats, widgets) {
    if (this.answer) return;
    const sig = JSON.stringify(widgets || []);
    if (sig === this.wsig && this.card.body.querySelector('.skel')) { const old = this.card.body.querySelector('.metrics-row'); old?.replaceWith(this.metrics(stats)); return; }
    this.wsig = sig;
    this.card.body.replaceChildren(...[this.metrics(stats), renderWidgets(widgets), skeleton('lines')].filter(Boolean));
  }
  loading() { this.answer = ''; this.wsig = ''; this.card.body.replaceChildren(skeleton('lines')); this.card.meta.textContent = t('receiving…'); }
  show(answer, stats, sources = [], widgets = []) {
    this.widgets = widgets || [];
    this.answer = answer || '';
    const box = el('div', 'answer'), urls = new Map(sources.map((s) => [s.n, s.url]));
    let list = null, inSrc = false; const srcLines = [];
    for (const raw of this.answer.split('\n')) {
      const line = raw.trim();
      if (/^sources?:$/i.test(line) || /^来源[:：]?$/.test(line)) { inSrc = true; continue; }
      const sm = line.match(/^\[(\d+)\]\s+(\S+)/);
      if (inSrc || sm) { if (sm) { urls.set(+sm[1], sm[2]); srcLines.push(sm); } continue; }
      if (!line) { list = null; continue; }
      if (/^[-*•]\s+/.test(line)) { if (!list) { list = el('ul'); box.append(list); } const li = el('li'); inline(li, line.replace(/^[-*•]\s+/, ''), urls); list.append(li); }
      else { list = null; const p = el('p'); inline(p, line.replace(/^#+\s*/, ''), urls); box.append(p); }
    }
    const tools = el('div', 'tools-row');
    for (const [label, fn] of [['⧉ COPY', () => copy(this.answer)], ['◈ SPEAK', () => bus.emit('voice:speak', this.answer)], ['★ FAVORITE', () => bus.emit('history:favorite-current')], ['⇩ EXPORT', () => bus.emit('export:current', 'md')]]) {
      const b = el('button', null, t(label)); b.onclick = fn; tools.append(b);
    }
    this.rollNext = true; const mrow = this.metrics(stats); this.rollNext = false;
    this.card.body.replaceChildren(...[mrow, renderWidgets(this.widgets), box, tools].filter(Boolean));
    [...box.children].forEach((c, i) => c.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 360, delay: 60 * i, fill: 'backwards' }));
    this.card.meta.textContent = `${stats?.framework || ''} · ${((stats?.elapsed_ms || 0) / 1000).toFixed(1)}s`;
    return settle(box.children);
  }
  text() { return this.answer; }
}
function inline(parent, text, urls) {
  const re = /(\*\*[^*]+\*\*|_[^_]+_|\[\d+\])/g; let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) parent.append(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith('**')) parent.append(el('strong', null, t.slice(2, -2)));
    else if (t.startsWith('_')) parent.append(el('em', null, t.slice(1, -1)));
    else { const u = urls.get(+t.slice(1, -1)); parent.append(u ? link(t, u, 'cite') : t); }
    last = m.index + t.length;
  }
  if (last < text.length) parent.append(text.slice(last));
}

// ─────────────────────────────── image grid
// Keyed: a cell (and its <img>) is created once per image and reused on every update, so images never
// reload or flash while results stream in; a saved local thumbnail replaces the remote one only after it
// has loaded (no empty frame).
export class ImagesView {
  constructor(card) { this.card = card; this.filter = 'all'; this.items = []; this.cells = new Map(); this.reset(); }
  reset() { this.items = []; this.cells.clear(); this.grid = null; this.card.body.replaceChildren(empty('NO IMAGES — ASK “FIND ME IMAGES OF …”')); this.card.meta.textContent = ''; }
  loading() { this.items = []; this.cells.clear(); this.grid = null; this.card.body.replaceChildren(skeleton('grid')); this.card.meta.textContent = t('receiving…'); }
  update(images) {
    if (!images?.length) return Promise.resolve();
    const sig = images.map((im) => `${im.id || im.image_url}:${im.local_thumb || ''}`).join('|');
    if (sig === this.sig && this.grid?.isConnected) return Promise.resolve();
    this.sig = sig; this.items = images;
    return this.render();
  }
  view() {
    const f = this.filter;
    return this.items.filter((i) => f === 'all' || (f === 'saved' ? i.local_thumb : i.provider === f));
  }
  cell(im) {
    const key = im.id || im.image_url;
    let c = this.cells.get(key);
    if (!c) {
      c = el('div', 'img-cell new'); c.dataset.key = key;
      const img = el('img'); img.loading = 'lazy'; img.decoding = 'async'; img.referrerPolicy = 'no-referrer';
      img.onload = () => c.classList.add('loaded');
      img.onerror = () => { if (c.dataset.src && c.dataset.fallback !== '1' && safe(im.thumb_url) && safe(im.thumb_url) !== c.dataset.src) { c.dataset.fallback = '1'; img.src = safe(im.thumb_url); return; } this.cells.delete(key); c.remove(); };
      c.append(img, el('span', 'badge'), el('span', 'tagline'));
      c.onclick = () => { const list = this.view(); bus.emit('lightbox:open', { items: list, index: Math.max(0, list.findIndex((x) => (x.id || x.image_url) === key)) }); };
      this.cells.set(key, c);
    }
    const img = c.firstChild, src = safe(im.local_thumb) || safe(im.thumb_url) || safe(im.image_url) || '';
    if (src && c.dataset.src !== src) {
      if (!c.dataset.src) { img.src = src; }
      else { const pre = new Image(); pre.referrerPolicy = 'no-referrer'; pre.onload = () => { img.src = src; }; pre.src = src; }   // swap only once loaded
      c.dataset.src = src;
    }
    img.alt = im.title || '';
    const b = c.querySelector('.badge'); b.className = `badge${im.local_thumb ? '' : ' remote'}`; b.textContent = im.local_thumb ? t('SAVED') : (im.provider || 'remote').toUpperCase();
    c.querySelector('.tagline').textContent = im.title || '';
    return c;
  }
  render() {
    const providers = [...new Set(this.items.map((i) => i.provider).filter(Boolean))];
    const bar = el('div', 'img-filters');
    chips(bar, [['all', `${t('ALL')} ${this.items.length}`], ['saved', `${t('SAVED')} ${this.items.filter((i) => i.local_thumb).length}`], ...providers.map((p) => [p, p.toUpperCase()])], this.filter, (k) => { this.filter = k; this.render(); });
    if (!this.grid?.isConnected) { this.grid = el('div', 'img-grid'); this.card.body.replaceChildren(bar, this.grid); }
    else this.card.body.querySelector('.img-filters')?.replaceWith(bar);
    const list = this.view().sort((a, b) => !!b.local_thumb - !!a.local_thumb);
    const keep = new Set();
    list.forEach((im, i) => { const c = this.cell(im); keep.add(c); if (this.grid.children[i] !== c) this.grid.insertBefore(c, this.grid.children[i] || null); if (c.classList.contains('new')) c.style.animationDelay = `${Math.min(i, 12) * 35}ms`; });
    for (const c of [...this.grid.children]) if (!keep.has(c)) c.remove();
    const grid = this.grid;                                   // a reset() before the next frame replaces this.grid
    requestAnimationFrame(() => { for (const c of grid.querySelectorAll('.img-cell.new')) setTimeout(() => c.classList.remove('new'), 700); });
    this.card.meta.textContent = t('{n} found · {m} saved', { n: this.items.length, m: this.items.filter((i) => i.local_thumb).length });
    return settle(grid.querySelectorAll('.img-cell.new'));
  }
}

// ─────────────────────────────── key data metrics (+ rotatable data wheel)
export class MetricsView {
  constructor(card) {
    this.card = card; this.kind = 'all'; this.onlyOk = false; this.rot = 0; this.rows = []; this.facts = [];
    this.reset();
    card.el.addEventListener('card-resize', () => this.drawWheel());
  }
  reset() { this.rows = []; this.facts = []; this.wheel = null; this.card.body.replaceChildren(empty('NO FIGURES YET — TRY “LATEST DATA ON …”')); this.card.meta.textContent = ''; }
  loading() { this.rows = []; this.facts = []; this.wheel = null; this.card.body.replaceChildren(skeleton('metrics')); this.card.meta.textContent = t('receiving…'); }
  update(metrics, facts, widgets) {
    this.facts = facts || [];
    if (!metrics?.length && widgets?.length) metrics = liveFigures(widgets);   // assistant answers: their live readings are the key data
    if (!metrics?.length && !this.facts.length) return Promise.resolve();
    const changed = JSON.stringify(metrics) !== JSON.stringify(this.rows);
    this.rows = metrics || [];
    return changed || !this.wheel ? this.render() : Promise.resolve();
  }
  rotateChart(deg) { this.rot += deg; this.drawWheel(); }
  render() {
    const bar = el('div', 'm-filters');
    const kinds = ['all', ...new Set(this.rows.map((r) => r.kind))];
    chips(bar, [...kinds.map((k) => [k, t(k.toUpperCase())]), ['ok', t(this.onlyOk ? '✓ CORROBORATED' : 'ANY SOURCE COUNT')]], this.onlyOk ? 'ok' : this.kind, (k) => {
      if (k === 'ok') this.onlyOk = !this.onlyOk; else this.kind = k; this.render();
    });
    const rows = this.rows.filter((r) => (this.kind === 'all' || r.kind === this.kind) && (!this.onlyOk || r.corroborated));
    const wrap = el('div', 'm-wrap');
    const cv = this.wheel = el('canvas', 'm-wheel'); cv.title = t('Drag (or circle a finger) to rotate');
    this.bindWheel(cv);
    const list = el('div', 'm-list');
    rows.forEach((r, i) => {
      const it = el('div', `m-item${r.corroborated ? ' ok' : ''}`); it.style.animationDelay = `${i * 40}ms`;
      const num = el('b', null, r.display); roll(num, r.display, 900 + i * 60);
      it.append(num, document.createElement('br'), el('span', 'lbl', r.label));
      const src = el('div', 'src');
      if (r.kind === 'live') src.append(el('span', 'v', t('● live reading')));
      else src.append(el('span', r.corroborated ? 'v' : 'u', r.corroborated ? t('✓ {n} sources agree', { n: r.sources }) : t('△ single source')), ' · ', link(t('context'), r.url));
      src.title = r.context;
      it.append(src); list.append(it);
    });
    if (!rows.length) list.append(empty(this.rows.length ? 'NO FIGURES MATCH FILTER' : 'NO NUMERIC FIGURES IN THESE SOURCES — SEE FACTS BELOW'));
    wrap.append(cv, list);
    const nodes = [bar, wrap];
    if (this.facts.length) {
      const f = el('div', 'facts'); const x = this.facts[0];
      f.append(el('b', null, `${x.title}`), ` — ${x.description || ''}. `, x.extract?.slice(0, 260) || '', ' ', link(t('wikipedia'), x.url));
      nodes.push(f);
    }
    this.card.body.replaceChildren(...nodes);
    this.shown = rows;
    this.card.meta.textContent = t('{n} figures · {m} corroborated', { n: this.rows.length, m: this.rows.filter((r) => r.corroborated).length });
    requestAnimationFrame(() => this.drawWheel());
    return settle(list.children);
  }
  bindWheel(cv) {
    let a0 = null;
    cv.addEventListener('pointerdown', (e) => { e.stopPropagation(); const r = cv.getBoundingClientRect(); a0 = Math.atan2(e.clientY - r.top - r.height / 2, e.clientX - r.left - r.width / 2); cv.setPointerCapture?.(e.pointerId); });
    cv.addEventListener('pointermove', (e) => { if (a0 === null) return; const r = cv.getBoundingClientRect(); const a = Math.atan2(e.clientY - r.top - r.height / 2, e.clientX - r.left - r.width / 2); this.rotateChart((a - a0) * 180 / Math.PI); a0 = a; });
    cv.addEventListener('pointerup', () => { a0 = null; });
  }
  drawWheel() {
    const cv = this.wheel; if (!cv || !cv.isConnected) return;
    const d = Math.min(devicePixelRatio, 2), w = cv.clientWidth || 200, h = cv.clientHeight || 200;
    cv.width = w * d; cv.height = h * d; const g = cv.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0);
    const rows = (this.shown || []).slice(0, 12), c = accent(), cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 8;
    g.clearRect(0, 0, w, h);
    g.strokeStyle = `rgba(${c},.25)`; for (const k of [0.33, 0.66, 1]) { g.beginPath(); g.arc(cx, cy, R * k, 0, Math.PI * 2); g.stroke(); }
    if (!rows.length) return;
    const logs = rows.map((r) => Math.log10(Math.abs(r.value) + 1)), mx = Math.max(...logs, 1);
    const step = (Math.PI * 2) / rows.length, rot = this.rot * Math.PI / 180;
    rows.forEach((r, i) => {
      const a = rot + i * step - Math.PI / 2, len = R * (0.25 + 0.75 * logs[i] / mx);
      g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, len, a + 0.06, a + step - 0.06); g.closePath();
      g.fillStyle = r.corroborated ? `rgba(${c},.75)` : `rgba(${c},.28)`; g.fill();
      g.save(); g.translate(cx + Math.cos(a + step / 2) * (len + 2), cy + Math.sin(a + step / 2) * (len + 2));
      g.fillStyle = `rgba(${c},1)`; g.font = '9px monospace'; g.textAlign = 'center'; g.fillText(r.display.slice(0, 10), 0, 0); g.restore();
    });
    g.fillStyle = '#fff'; g.beginPath(); g.arc(cx, cy, 3, 0, Math.PI * 2); g.fill();
  }
}

/** Key figures from assistant widgets (weather, exchange rate, clock…) in the KEY DATA row format. */
function liveFigures(widgets) {
  const rows = [], add = (display, label, value, url) => rows.push({ display, label: t(label), kind: 'live', value, sources: 1, corroborated: true, url: url || '', context: '' });
  for (const w of widgets) {
    if (w.kind === 'weather') {
      const n = w.now || {}, d = w.days?.[w.focus_day > 0 && w.focus_day < 7 ? w.focus_day : 0] || {};
      add(`${Math.round(n.temp)}°C`, 'temperature now', n.temp, 'https://open-meteo.com'); add(`${Math.round(n.feels)}°C`, 'feels like', n.feels);
      add(`${n.humidity}%`, 'humidity', n.humidity); add(`${Math.round(n.wind)} km/h`, 'wind', n.wind);
      if (d.rain != null) add(`${d.rain}%`, 'rain chance', d.rain); if (d.max != null) add(`${Math.round(d.min)}–${Math.round(d.max)}°C`, 'day range', d.max);
    } else if (w.kind === 'currency') { add(`${w.rate}`, `1 ${w.from} in ${w.to}`, w.rate); add(w.display.split(' = ')[1] || '', `${w.amount} ${w.from}`, w.result); }
    else if (w.kind === 'time') { add(w.iso.slice(11, 16), `${w.place} local time`, 1); add(`UTC${w.utc_offset_h >= 0 ? '+' : ''}${w.utc_offset_h}`, 'UTC offset', Math.abs(w.utc_offset_h) + 1); }
    else if (w.kind === 'calc' || w.kind === 'convert') add(w.display.split(' = ').pop(), w.kind === 'calc' ? w.expression : `${w.value} ${w.from}`, Math.abs(w.result ?? w.value) + 1);
  }
  return rows;
}

// ─────────────────────────────── timeline
export class TimelineView {
  constructor(card) { this.card = card; this.reset(); }
  reset() { this.card.body.replaceChildren(empty('NO DATED EVENTS YET')); this.card.meta.textContent = ''; this.sig = ''; }
  loading() { this.sig = ''; this.card.body.replaceChildren(skeleton('lines')); this.card.meta.textContent = t('receiving…'); }
  update(items) {
    if (!items?.length) return Promise.resolve();
    const sig = items.map((i) => i.date + i.label).join('|'); if (sig === this.sig) return Promise.resolve(); this.sig = sig;
    const tl = el('div', 'tl');
    items.slice().reverse().forEach((e, i) => {
      const it = el('div', 'tl-item'); it.style.animationDelay = `${i * 35}ms`;
      const dt = el('div', 'tl-date', ''); decode(dt, e.precision === 'year' ? e.date.slice(0, 4) : e.date, 500 + i * 50);
      it.append(dt, e.url ? link(e.label, e.url) : el('div', null, e.label));
      if (e.source) it.append(el('div', 'tl-src', e.source));
      tl.append(it);
    });
    this.card.body.replaceChildren(tl);
    this.card.meta.textContent = `${t('{n} events', { n: items.length })} · ${items[0].date.slice(0, 4)}–${items.at(-1).date.slice(0, 4)}`;
    return settle(tl.children);
  }
}

// ─────────────────────────────── sources (web / news / video / wiki)
export class SourcesView {
  constructor(card) { this.card = card; this.kind = 'all'; this.list = []; this.videos = []; this.reset(); }
  reset() { this.list = []; this.videos = []; this.card.body.replaceChildren(empty('NO SOURCES YET')); this.card.meta.textContent = ''; this.sig = ''; }
  loading() { this.list = []; this.sig = ''; this.card.body.replaceChildren(skeleton('lines')); this.card.meta.textContent = t('receiving…'); }
  update(sources, videos) {
    const sig = (sources || []).map((s) => s.url).join('|') + (videos || []).length; if (!sources?.length || sig === this.sig) return Promise.resolve();
    this.sig = sig; this.list = sources; this.videos = videos || [];
    return this.render();
  }
  render() {
    const bar = el('div', 'src-filters');
    const kinds = ['all', ...new Set(this.list.map((s) => s.kind))];
    chips(bar, kinds.map((k) => [k, `${t(k.toUpperCase())} ${k === 'all' ? this.list.length : this.list.filter((s) => s.kind === k).length}`]), this.kind, (k) => { this.kind = k; this.render(); });
    const rows = this.list.filter((s) => this.kind === 'all' || s.kind === this.kind).map((s, i) => {
      const r = el('div', 'src'); r.style.animationDelay = `${i * 25}ms`;
      r.append(el('span', 'src-n', String(s.n).padStart(2, '0')), link(s.title || s.url, s.url));
      const act = el('div', 'src-act');
      const o = el('button', null, t('OPEN')); o.onclick = () => { const u = safe(s.url); if (u) window.open(u, '_blank', 'noopener'); };
      const c = el('button', null, t('COPY')); c.onclick = () => copy(s.url);
      act.append(o, c); r.append(act);
      const meta = el('div', 'src-meta'); meta.append(el('span', null, s.domain));
      if (s.date) meta.append(el('span', null, s.date));
      if (s.kind !== 'web') meta.append(el('span', `pill ${s.kind}`, t(s.kind.toUpperCase())));
      if (s.read) meta.append(el('span', 'pill read', t('READ')));
      const b = el('span', 'bar'); const f = el('i'); f.style.width = `${Math.round(Math.min(1, s.score) * 100)}%`; b.append(f); meta.append(b);
      r.append(meta);
      const v = s.kind === 'videos' ? this.videos.find((x) => x.url === s.url) : null;
      if (v?.thumb) { const im = el('img', 'vthumb'); im.src = safe(v.thumb) || ''; im.referrerPolicy = 'no-referrer'; im.loading = 'lazy'; r.append(im); }
      r.append(el('div', 'src-snip', s.snippet));
      return r;
    });
    this.card.body.replaceChildren(bar, ...rows);
    this.card.meta.textContent = t('{n} ranked', { n: this.list.length });
    return settle(rows);
  }
}

// ─────────────────────────────── terminal / code output (raw tool I/O)
export class TerminalView {
  constructor(card) {
    this.card = card; this.lines = [];
    const tools = el('div', 'term-tools'); const c = el('button', null, t('COPY')); c.onclick = () => copy(this.out.innerText); const x = el('button', null, t('CLEAR')); x.onclick = () => this.reset();
    tools.append(c, x); this.out = el('div', 'term'); card.body.replaceChildren(tools, this.out);
  }
  reset() { this.out.replaceChildren(); this.card.meta.textContent = ''; }
  push(ev) {
    const d = ev.data || {}; let node = null;
    if (ev.type === 'tool_call_start') node = el('div', 'cmd', `$ ${d.tool} ${JSON.stringify(d.args || {})}`);
    else if (ev.type === 'tool_call_progress') node = el('div', null, `  ${d.message}`);
    else if (ev.type === 'tool_call_result') { node = el('div', d.ok ? 'ok' : 'bad', `  → [${d.ok ? 'ok' : 'fail'}] ${d.summary} (${d.duration_ms} ms)`); if (d.preview) node.append(el('div', null, `  ${JSON.stringify(d.preview).slice(0, 400)}`)); }
    else if (ev.type === 'agent_start') node = el('div', 'cmd', `\n# run ${ev.run_id}: ${d.prompt}`);
    if (!node) return;
    this.out.append(node);
    this.card.body.scrollTop = this.card.body.scrollHeight;
    this.card.meta.textContent = t('{n} lines', { n: this.out.children.length });
  }
}

// ─────────────────────────────── analytics (real run data: tool latency, source domains, keywords, relevance)
// Four single-series horizontal bar charts: one accent hue, value at every bar tip in text ink (tooltips only enhance),
// status (ok/fail) carried by icon + label, thin bars with a rounded data-end. Two columns when the panel is wide.
const compact = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}K` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(Math.round(n * 100) / 100));
export class AnalyticsView {
  constructor(card) { this.card = card; this.reset(); }
  reset() { this.data = null; this.sig = ''; this.card.body.replaceChildren(empty('NO RUN ANALYTICS YET')); this.card.meta.textContent = ''; }
  loading() { this.sig = ''; this.card.body.replaceChildren(skeleton('lines')); this.card.meta.textContent = t('receiving…'); }
  update(charts) {
    if (!charts) return Promise.resolve();
    const sig = JSON.stringify(charts); if (sig === this.sig) return Promise.resolve(); this.sig = sig; this.data = charts;
    const lat = (charts.latency || []).map((x) => ({ label: x.tool.replace(/_/g, ' '), value: x.ms / 1000, text: `${(x.ms / 1000).toFixed(2)} s`, bad: x.ok === false, tip: `${x.tool} · ${x.ms} ms · ${t(x.ok === false ? 'failed' : 'ok')}` }));
    const dom = (charts.domains || []).slice(0, 6).map((d) => ({ label: d.domain, value: d.count, text: String(d.count), tip: `${d.domain} · ${t('{n} sources', { n: d.count })}` }));
    const kw = (charts.keywords || []).slice(0, 8).map((k) => ({ label: k.term, value: k.count, text: compact(k.count), tip: `“${k.term}” · ${t('{n} mentions', { n: k.count })}` }));
    const rel = (charts.relevance || []).slice(0, 10).map((r, i) => ({ label: `${t('source')} ${String(i + 1).padStart(2, '0')}`, value: r, text: r.toFixed(2), tip: `${t('source')} ${i + 1} · ${t('relevance')} ${r.toFixed(3)}` }));
    const grid = el('div', 'an-grid');
    const wx = charts.series?.weather;
    const blocks = [];
    if (wx?.length) blocks.push(this.range(t('7-DAY TEMPERATURE'), t('daily low – high, °C'), wx));
    blocks.push(...[['TOOL LATENCY', 'seconds per call', lat], ['SOURCE DOMAINS', 'sources per domain', dom], ['TOP TERMS', 'mentions across sources', kw], ['SOURCE RELEVANCE', 'ranking score 0–1', rel, 1]]
      .filter(([, , rows]) => rows.length).map(([title, sub, rows, max]) => this.bars(t(title), t(sub), rows, max)));
    if (!blocks.length) { this.card.body.replaceChildren(empty('NO ANALYTICS IN THIS RUN')); return Promise.resolve(); }
    grid.append(...blocks);
    this.card.body.replaceChildren(grid);
    const total = (charts.latency || []).reduce((a, x) => a + x.ms, 0);
    this.card.meta.textContent = t('{n} calls · {s} s tool time', { n: lat.length, s: (total / 1000).toFixed(1) });
    return settle(grid.querySelectorAll('.an-bar i'));
  }
  bars(title, sub, rows, max) {
    const box = el('figure', 'an-chart'), cap = el('figcaption');
    cap.append(el('b', null, title), el('span', null, sub)); box.append(cap);
    const top = max || Math.max(...rows.map((r) => r.value), 1e-9);
    rows.forEach((r, i) => {
      const row = el('div', `an-row${r.bad ? ' bad' : ''}`); row.tabIndex = 0; row.dataset.tip = r.tip; row.setAttribute('aria-label', r.tip);
      const bar = el('span', 'an-bar'), fill = el('i'); bar.append(fill);
      const val = el('span', 'an-val', r.bad ? `✗ ${r.text} · ${t('failed')}` : r.text);
      row.append(el('span', 'an-lbl', r.label), bar, val); box.append(row);
      const w = `${Math.max(2, (r.value / top) * 100)}%`;
      fill.animate([{ width: '0%' }, { width: w }], { duration: 700, delay: 40 * i, easing: 'cubic-bezier(.2,1,.3,1)', fill: 'forwards' });
    });
    return box;
  }
  /** Floating range bars (one row per day: low → high), values labelled at both ends. */
  range(title, sub, rows) {
    const box = el('figure', 'an-chart an-range'), cap = el('figcaption');
    cap.append(el('b', null, title), el('span', null, sub)); box.append(cap);
    const lo = Math.min(...rows.map((r) => r.min)), hi = Math.max(...rows.map((r) => r.max)), span = Math.max(1, hi - lo);
    rows.forEach((r, i) => {
      const tip = `${r.label} · ${r.min}–${r.max} °C${r.rain != null ? ` · ${t('rain chance')} ${r.rain}%` : ''}`;
      const row = el('div', 'an-row'); row.tabIndex = 0; row.dataset.tip = tip; row.setAttribute('aria-label', tip);
      const bar = el('span', 'an-bar'), fill = el('i'); bar.append(fill);
      row.append(el('span', 'an-lbl', r.label), bar, el('span', 'an-val', `${Math.round(r.min)}° – ${Math.round(r.max)}°`)); box.append(row);
      fill.style.marginLeft = `${((r.min - lo) / span) * 100}%`;
      fill.animate([{ width: '0%' }, { width: `${Math.max(3, ((r.max - r.min) / span) * 100)}%` }], { duration: 700, delay: 40 * i, easing: 'cubic-bezier(.2,1,.3,1)', fill: 'forwards' });
    });
    return box;
  }
}
