// TASK GRAPH — live visualisation of how the agent executes your request.
//
//   ◆ UNDERSTOOD (intent node) ──► step ──► step ──► ◆ ANSWER
//                               └─► step ─────────┘          (parallel branches = independent steps)
//
// Built purely from protocol events: `intent` (what the deck understood), `plan` (the DAG, re-published
// when the agent adapts: retries appear as dashed amber edges), `step_update` (node state), tool
// progress, final/error/interrupted. Frameworks that publish only a linear/inferred plan (Pi, Hermes)
// are drawn as a chain and their tool calls are matched to nodes by tool name.
// Orientation follows the panel: left→right when wide (bottom dock / stage), top→down when tall (side docks).
import { t, lang } from '../core/i18n.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const ICON = { pending: '○', running: '◌', done: '✓', failed: '✗', skipped: '⊘', stopped: '■' };
export const INTENT_NAMES = { weather: 'WEATHER', time: 'WORLD CLOCK', calc: 'CALCULATE', convert: 'CONVERT', currency: 'EXCHANGE RATE', place: 'PLACE', remind: 'REMINDER',
  note: 'REMEMBER', recall: 'RECALL NOTES', images: 'IMAGES', videos: 'VIDEOS', news: 'NEWS', data: 'DATA', compare: 'COMPARE', howto: 'HOW-TO', overview: 'OVERVIEW' };
const SHORT = { llm: 'LLM', web_search: 'WEB', news_search: 'NEWS', video_search: 'VIDEO', image_search: 'IMAGES', image_download: 'SAVE IMG', wiki_lookup: 'WIKI', fetch_page: 'READ',
  geocode: 'GEO', weather: 'WEATHER', world_time: 'CLOCK', calculator: 'CALC', unit_convert: 'UNITS', currency: 'FX', memory: 'MEMORY', reminder: 'REMIND' };

export function intentText(intents) {
  return (intents || []).map((i) => {
    const bits = [i.subject, i.slots?.day === 1 ? t('tomorrow') : i.slots?.day === 2 ? t('day after tomorrow') : i.slots?.day === 7 ? t('7 days') : ''].filter(Boolean);
    return `${t(INTENT_NAMES[i.name] || i.name.toUpperCase())}${bits.length ? ` · ${bits.join(' · ')}` : ''}`;
  }).join('  +  ');
}

export class TaskGraphView {
  constructor(card) {
    this.card = card; this.sel = null;
    this.reset();
    new ResizeObserver(() => { if (this.steps.length || this.intents) this.render(); }).observe(card.body);
    card.body.addEventListener('click', (e) => {
      const n = e.target.closest('[data-node]'); if (!n) return;
      this.sel = this.sel === n.dataset.node ? null : n.dataset.node; this.render();
    });
  }
  reset(msg = 'NO TASK YET — ASK ANYTHING') {
    this.steps = []; this.intents = null; this.status = 'idle'; this.t0 = 0; this.t1 = 0; this.sel = null; this.rev = 0; this.prompt = ''; this.msg = msg; this.inferred = false;
    this.card.body.replaceChildren(Object.assign(document.createElement('div'), { className: 'empty', textContent: t(msg) }));
    this.card.meta.textContent = '';
  }
  loading() { this.reset('UNDERSTANDING…'); this.status = 'thinking'; }
  get(id) { return this.steps.find((s) => s.id === id); }

  push(ev) {
    const d = ev.data || {};
    switch (ev.type) {
      case 'agent_start': this.reset('UNDERSTANDING…'); this.status = 'thinking'; this.prompt = d.prompt; this.t0 = performance.now(); break;
      case 'intent': this.intents = d.intents; this.source = d.source; break;
      case 'plan': {
        const prev = new Map(this.steps.map((s) => [s.id, s]));
        this.inferred = d.source === 'inferred' || (d.steps || []).some((s) => !s.id);
        this.rev = d.revision || 0;
        this.steps = (d.steps || []).map((s, i) => {
          const id = s.id || `p${i + 1}`, old = prev.get(id);
          const deps = s.deps || (this.inferred && i ? [`p${i}`] : []);
          return { ...s, id, deps, status: old?.status && old.status !== 'pending' ? old.status : (s.status || 'pending'), summary: old?.summary, ms: old?.ms, call: old?.call,
                   progress: old?.progress, fresh: !old && prev.size > 0 };
        });
        break;
      }
      case 'step_update': {
        const s = this.get(d.id); if (!s) break;
        s.status = d.status; if (d.summary) s.summary = d.summary; if (d.ms != null) s.ms = d.ms; if (d.call_id) s.call = d.call_id;
        if (d.status === 'running') s.started = performance.now();
        break;
      }
      case 'tool_call_start': {
        let s = d.step_id ? this.get(d.step_id) : null;
        if (!s && this.inferred) s = this.steps.find((x) => x.tool === d.tool && x.status === 'pending');
        if (s) { s.call = d.call_id; if (s.status === 'pending') { s.status = 'running'; s.started = performance.now(); } }
        break;
      }
      case 'tool_call_progress': { const s = this.steps.find((x) => x.call === d.call_id); if (s) s.progress = d.message; break; }
      case 'tool_call_result': {
        const s = this.steps.find((x) => x.call === d.call_id);
        if (s && this.inferred) { s.status = d.ok ? 'done' : 'failed'; s.summary = d.summary; s.ms = d.duration_ms; }
        break;
      }
      case 'final': this.status = 'done'; this.t1 = performance.now(); break;
      case 'error': this.status = 'error'; this.t1 = performance.now(); for (const s of this.steps) if (s.status === 'running') s.status = 'failed'; break;
      case 'interrupted': this.status = 'stopped'; this.t1 = performance.now(); for (const s of this.steps) if (s.status === 'running' || s.status === 'pending') s.status = 'stopped'; break;
      default: return;
    }
    this.render();
  }

  // ───────────── layout + SVG
  render() {
    if (!this.intents && !this.steps.length) return;
    const body = this.card.body, W = Math.max(220, body.clientWidth - 4), H = Math.max(120, body.clientHeight - 64);
    const depth = new Map(), dep = (s, seen = new Set()) => {
      if (depth.has(s.id)) return depth.get(s.id);
      if (seen.has(s.id)) return 1; seen.add(s.id);
      const ds = s.deps.map((x) => this.get(x)).filter(Boolean), v = ds.length ? 1 + Math.max(...ds.map((x) => dep(x, seen))) : 1;
      depth.set(s.id, v); return v;
    };
    this.steps.forEach((s) => dep(s));
    const maxD = Math.max(1, ...depth.values());
    const cols = Array.from({ length: maxD + 2 }, () => []);
    cols[0].push({ id: '__in', kind: 'intent' });
    for (const s of [...this.steps].sort((a, b) => (a.branch ?? 0) - (b.branch ?? 0) || a.id.localeCompare(b.id, 'en', { numeric: true }))) cols[depth.get(s.id)].push(s);
    cols[maxD + 1].push({ id: '__out', kind: 'answer' });
    const nC = cols.length, rows = Math.max(...cols.map((c) => c.length));
    // left→right when every column fits at a readable width, otherwise top→down (side docks)
    const horiz = W >= H * 1.15 && (W - 16 - 22 * (nC - 1)) / nC >= 112;
    // node box size adapts to the panel; overflow scrolls inside the panel (never resizes the dock)
    const gap = horiz ? 22 : 10;
    const nw = horiz ? Math.max(112, Math.min(186, (W - gap * (nC - 1) - 16) / nC)) : Math.max(96, Math.min(230, (W - 16 - gap * (rows - 1)) / rows));
    const nh = 40;
    const span = horiz ? Math.max(H, rows * (nh + 12)) : Math.max(W, rows * (nw + gap));
    const pos = new Map();
    cols.forEach((col, ci) => col.forEach((n, ri) => {
      if (horiz) { const x = 8 + ci * (nw + gap), y = (span - col.length * (nh + 12)) / 2 + ri * (nh + 12) + 6; pos.set(n.id, { x, y }); }
      else { const y = 8 + ci * (nh + 22), x = (W - col.length * nw - (col.length - 1) * gap) / 2 + ri * (nw + gap); pos.set(n.id, { x: Math.max(8, x), y }); }
    }));
    const vw = horiz ? 16 + nC * nw + (nC - 1) * gap : Math.max(W, rows * (nw + gap));
    const vh = horiz ? span + 6 : 16 + nC * (nh + 22);
    const L = lang();
    const leaves = this.steps.filter((s) => !this.steps.some((o) => o.deps.includes(s.id)));
    const edges = [];
    for (const s of this.steps) {
      const srcs = s.deps.length ? s.deps : ['__in'];
      for (const a of srcs) edges.push([a, s.id, s.retry_of && a !== '__in' ? '' : '']);
      if (s.retry_of && this.get(s.retry_of)) edges.push([s.retry_of, s.id, 'retry']);
    }
    for (const s of leaves) edges.push([s.id, '__out', '']);
    if (!this.steps.length) edges.push(['__in', '__out', '']);
    const st = (id) => (id === '__in' ? (this.intents ? 'done' : 'running') : id === '__out' ? ({ done: 'done', error: 'failed', stopped: 'stopped' }[this.status] || 'pending') : this.get(id)?.status || 'pending');
    const anchor = (id, out) => { const p = pos.get(id); return horiz ? { x: p.x + (out ? nw : 0), y: p.y + nh / 2 } : { x: p.x + nw / 2, y: p.y + (out ? nh : 0) }; };
    const E = edges.map(([a, b, kind]) => {
      if (!pos.has(a) || !pos.has(b)) return '';
      const p = anchor(a, true), q = anchor(b, false), k = horiz ? (q.x - p.x) * 0.5 : (q.y - p.y) * 0.5;
      const d = horiz ? `M${p.x} ${p.y} C${p.x + k} ${p.y} ${q.x - k} ${q.y} ${q.x} ${q.y}` : `M${p.x} ${p.y} C${p.x} ${p.y + k} ${q.x} ${q.y - k} ${q.x} ${q.y}`;
      const cls = kind === 'retry' ? 'retry' : st(b) === 'running' ? 'live' : st(a) === 'done' && st(b) !== 'pending' ? 'done' : '';
      return `<path class="tg-e ${cls}" d="${d}"/>`;
    }).join('');
    const N = [];
    for (const col of cols) for (const n of col) {
      const p = pos.get(n.id); let title, sub, cls, ico;
      if (n.kind === 'intent') {
        title = t('UNDERSTOOD'); sub = this.intents ? intentText(this.intents) : `“${this.prompt}”`; cls = `intent ${this.intents ? 'done' : 'running'}`; ico = '◆';
      } else if (n.kind === 'answer') {
        title = t('ANSWER'); sub = t({ done: 'delivered', error: 'failed', stopped: 'stopped', thinking: 'composing…', idle: '' }[this.status] || 'waiting'); cls = `answer ${st('__out')}`; ico = '◆';
      } else {
        const lbl = n.labels?.[L] || n.label || n.query || n.tool;
        title = t(SHORT[n.tool] || n.tool.toUpperCase()); sub = lbl; cls = `${n.status}${n.retry_of ? ' retry' : ''}${n.fresh ? ' fresh' : ''}${this.sel === n.id ? ' sel' : ''}`; ico = ICON[n.status] || '○';
        if (n.ms != null && n.status !== 'running') title += ` · ${n.ms < 1000 ? `${n.ms} ms` : `${(n.ms / 1000).toFixed(1)} s`}`;
      }
      const tip = n.kind ? sub : [n.label, n.query, n.summary || n.progress, n.why].filter(Boolean).join(' — ');
      N.push(`<g class="tg-n ${cls}" data-node="${esc(n.id)}" transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})"><title>${esc(tip)}</title>
        <rect width="${nw.toFixed(1)}" height="${nh}" rx="3"/><text class="ico" x="12" y="${nh / 2 + 4}">${ico}</text>
        <text class="tt" x="24" y="15">${esc(clip(title, nw - 30, 6.4))}</text><text class="sub" x="24" y="30">${esc(clip(sub, nw - 30, 6.2))}</text>
        ${n.status === 'running' ? `<rect class="bar" x="1" y="${nh - 3}" width="${(nw - 2).toFixed(1)}" height="2"/>` : ''}</g>`);
    }
    const done = this.steps.filter((s) => s.status === 'done').length, run = this.steps.filter((s) => s.status === 'running').length;
    const fail = this.steps.filter((s) => s.status === 'failed').length, el = ((this.t1 || performance.now()) - this.t0) / 1000;
    const par = Math.max(0, ...cols.slice(1, -1).map((c) => c.length));
    const head = `<div class="tg-head"><b>${t('UNDERSTOOD')}</b><span>${esc(this.intents ? intentText(this.intents) : '…')}</span>${this.source === 'llm' ? `<i>LLM</i>` : ''}</div>`;
    const selS = this.sel && this.get(this.sel);
    const foot = selS ? `<div class="tg-foot"><b>${esc(selS.labels?.[L] || selS.label || selS.tool)}</b> · <code>${esc(selS.tool)}</code> · ${esc(t(selS.status.toUpperCase()))}${selS.ms != null ? ` · ${selS.ms} ms` : ''}<br>${esc(selS.summary || selS.progress || selS.why || selS.query || '')}</div>`
      : `<div class="tg-foot dim">${esc(t('{n} steps · up to {p} in parallel · click a node for details', { n: this.steps.length, p: par || 1 }))}${this.rev ? ` · ${esc(t('replanned ×{n}', { n: this.rev }))}` : ''}</div>`;
    body.innerHTML = `${head}<div class="tg-scroll"><svg class="tg ${horiz ? 'h' : 'v'}" width="${vw.toFixed(0)}" height="${vh.toFixed(0)}" viewBox="0 0 ${vw.toFixed(0)} ${vh.toFixed(0)}" role="img" aria-label="${esc(t('TASK GRAPH'))}">${E}${N.join('')}</svg></div>${foot}`;
    this.card.meta.textContent = this.steps.length ? `${done}/${this.steps.length} ✓${run ? ` · ${run} ${t('running')}` : ''}${fail ? ` · ${fail} ✗` : ''} · ${el.toFixed(1)} s` : '';
  }
}
/** Clip to a pixel width (CJK glyphs count double). */
const clip = (s, px, cw) => {
  s = String(s ?? ''); let w = 0, i = 0;
  for (; i < s.length; i++) { w += /[\u2e80-\uffff]/.test(s[i]) ? cw * 1.85 : cw; if (w > px) break; }
  return i < s.length ? `${s.slice(0, Math.max(1, i - 1))}…` : s;
};
