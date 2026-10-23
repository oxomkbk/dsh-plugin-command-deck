// AGENT TRACE — the central structured timeline (not a chat log).
// Colour/icon-coded per event type; plan as a live checklist; tool calls with
// progress bars + durations; errors with RETRY; filters; arrival order preserved.
import { bus } from '../core/bus.js';
import { t, lang } from '../core/i18n.js';
import { intentText } from './taskgraph.js';

const el = (t, c, txt) => { const e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; };
const FILTERS = [['think', 'THOUGHT'], ['tool', 'TOOLS'], ['obs', 'OBSERVE'], ['plan', 'PLAN'], ['ctl', 'CONTROL'], ['err', 'ERRORS']];

const c0 = (view, d) => { const c = view.calls.get(d.call_id); if (c) c.step = d.step_id || null; };

export class TraceView {
  constructor(card) {
    this.card = card; this.box = card.body;
    this.hidden = new Set(); this.follow = true; this.calls = new Map(); this.live = null; this.t0 = performance.now(); this.planEl = null; this.counts = {};
    this.bar = el('div', 'trace-bar');
    for (const [k, label] of FILTERS) {
      const b = el('button', 'on', t(label)); b.dataset.f = k;
      b.onclick = () => { this.hidden.has(k) ? this.hidden.delete(k) : this.hidden.add(k); b.classList.toggle('on'); for (const r of this.box.querySelectorAll('.tr')) r.hidden = this.hidden.has(r.dataset.f); };
      this.bar.append(b);
    }
    const sp = el('span', 'sp'); const cnt = this.cnt = el('span', null, '');
    const clear = el('button', null, t('CLEAR')); clear.onclick = () => this.clear();
    this.bar.append(sp, cnt, clear);
    this.box.append(this.bar);
    this.box.addEventListener('scroll', () => { this.follow = this.box.scrollTop + this.box.clientHeight >= this.box.scrollHeight - 40; });
    this.row('ctl', '◇', 'SYSTEM', t('Deck online. Speak, type or gesture a command.'));
    bus.on('lang:changed', () => { for (const b of this.bar.querySelectorAll('[data-f]')) b.textContent = t(FILTERS.find((f) => f[0] === b.dataset.f)[1]); clear.textContent = t('CLEAR'); });
  }
  clear() { for (const r of [...this.box.querySelectorAll('.tr')]) r.remove(); this.live = null; this.planEl = null; this.calls.clear(); }
  stamp() { return `+${((performance.now() - this.t0) / 1000).toFixed(1)}s`; }
  scroll() { if (this.follow) this.box.scrollTop = this.box.scrollHeight; }
  scrollBy(dy) { this.box.scrollBy({ top: dy, behavior: 'smooth' }); this.follow = false; }

  row(cls, icon, tag, text, nodes) {
    const r = el('div', `tr ${cls}`); r.dataset.f = cls === 'write' ? 'think' : ['start', 'final', 'you', 'you live', 'say'].includes(cls) ? 'ctl' : cls;
    r.hidden = this.hidden.has(r.dataset.f);
    const x = el('div', 'x'); x.append(el('span', 'tag', t(tag)));
    if (text) x.append(text);
    if (nodes) x.append(...nodes);
    r.append(el('span', 't', this.stamp()), el('span', 'i', icon), x);
    this.box.append(r);
    const rows = this.box.querySelectorAll('.tr'); if (rows.length > 900) rows[0].remove();
    this.counts[cls] = (this.counts[cls] || 0) + 1;
    this.cnt.textContent = t('{n} tools · {m} rows', { n: this.counts.tool || 0, m: this.box.querySelectorAll('.tr').length });
    this.scroll();
    return r;
  }
  endLive() {
    if (!this.live) return;
    const { r, cls, x } = this.live; r.classList.remove('live'); this.live = null;
    // the streamed answer is markdown: once complete, show it as clean text (no **, _, #, ``` noise)
    if (cls === 'write') {
      const tag = x.querySelector('.tag'), raw = [...x.childNodes].filter((n) => n !== tag).map((n) => n.textContent).join('');
      const clean = raw.replace(/```[a-z]*\n?/gi, '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/(^|\s)_(\S.*?\S|\S)_(?=\s|$|[.,;:!?])/gm, '$1$2')
        .replace(/^#{1,6}\s+/gm, '').replace(/^\s*[-*]\s+/gm, '• ').replace(/`([^`]+)`/g, '$1');
      x.replaceChildren(...(tag ? [tag] : []), clean);
    }
  }

  push(ev) {
    const d = ev.data || {};
    switch (ev.type) {
      case 'agent_start':
        this.endLive(); this.t0 = performance.now(); this.counts = {};
        this.startRow = this.row('start', '▶', 'START', `“${d.prompt}”  ·  ${d.framework}/${d.model} (${d.mode})`);
        this.card.el.classList.add('live');
        break;
      case 'intent': this.endLive(); this.row('plan', '◆', 'UNDERSTOOD', `${intentText(d.intents)}${d.source === 'llm' ? '  (LLM)' : ''}`); break;
      case 'plan': {
        this.endLive();
        const ol = el('ol', 'plan-steps'), L = lang();
        for (const s of d.steps || []) {
          const deps = s.deps?.length ? `  ⟵ ${s.deps.join(', ')}` : '';
          const li = el('li', null, `${s.id ? s.id + ' · ' : ''}${s.tool}  ${s.labels?.[L] || (s.query ? '“' + s.query + '”' : '')}${deps}${s.why ? '  — ' + s.why : ''}`);
          li.dataset.tool = s.tool; if (s.id) li.dataset.id = s.id; if (s.status && s.status !== 'pending') li.classList.add({ running: 'run', done: 'ok', failed: 'bad', skipped: 'bad' }[s.status] || ''); ol.append(li);
        }
        const note = d.source === 'inferred' ? t('(inferred from tool calls)') : d.revision ? t('revision {n} — the agent adapted its plan', { n: d.revision }) : t('task graph — independent steps run in parallel');
        const tag = d.revision ? 'REPLAN' : 'PLAN';
        if (this.planEl && (d.source === 'inferred' || d.revision)) this.planEl.replaceWith(this.planEl = this.row('plan', '☰', tag, note, [ol]));
        else this.planEl = this.row('plan', '☰', tag, note, [ol]);
        break;
      }
      case 'step_update': {
        const li = this.planEl?.querySelector(`li[data-id="${d.id}"]`);
        if (li) { li.classList.remove('run', 'ok', 'bad'); li.classList.add({ running: 'run', done: 'ok', failed: 'bad', skipped: 'bad' }[d.status] || 'run'); }
        if (d.status === 'skipped') this.row('obs', '⊘', 'SKIPPED', `${d.id} · ${d.tool} — ${d.summary || ''}`);
        break;
      }
      case 'thought_delta': {
        const cls = d.channel === 'text' ? 'write' : 'think';
        if (!this.live || this.live.cls !== cls) {
          this.endLive();
          const r = this.row(`${cls === 'write' ? 'think write' : 'think'}`, cls === 'write' ? '✎' : '…', cls === 'write' ? 'WRITE' : 'THINK', '');
          r.classList.add('live'); this.live = { r, cls, x: r.querySelector('.x') };
        }
        this.live.x.append(d.text);
        this.scroll();
        break;
      }
      case 'tool_call_start': {
        this.endLive();
        const code = el('code', null, `${d.tool}(${JSON.stringify(d.args || {})})`);
        const prog = el('div', 'prog', '');
        const bar = el('div', 'bar'); bar.append(el('i'));
        const res = el('div', 'res', '');
        const r = this.row('tool', '⚙', 'CALL', '', [code, prog, bar, res]);
        this.calls.set(d.call_id, { r, prog, res, tool: d.tool });
        if (!d.step_id) this.markPlan(d.tool, 'run');
        c0(this, d);
        break;
      }
      case 'tool_call_progress': { const c = this.calls.get(d.call_id); if (c) { c.prog.textContent = `↳ ${d.message}`; this.scroll(); } break; }
      case 'tool_call_result': {
        const c = this.calls.get(d.call_id); if (!c) break;
        c.r.classList.add(d.ok ? 'done' : 'fail');
        c.r.querySelector('.tag').textContent = t(d.ok ? 'DONE' : 'FAIL');
        c.res.textContent = `${d.ok ? '✓' : '✗'} ${d.summary}  ·  ${d.duration_ms} ms${d.preview ? '  ▸' : ''}`;
        if (d.preview) c.res.onclick = () => { const p = c.res.querySelector('pre'); if (p) return p.remove(); const pre = el('pre', null, JSON.stringify(d.preview, null, 2)); c.res.append(pre); };
        if (!c.step) this.markPlan(c.tool, d.ok ? 'ok' : 'bad');
        break;
      }
      case 'you': this.endLive(); this.youFinal(d.text, { typed: true }); break;
      case 'turn_prompt': this.setStartPrompt(d.text); break;
      case 'observation': this.endLive(); this.row('obs', '◉', 'OBSERVE', d.text); break;
      case 'paused': this.endLive(); this.row('ctl', '‖', 'PAUSED', t('agent holding at next step ({r})', { r: d.reason })); break;
      case 'resumed': this.row('ctl', '▶', 'RESUMED', t('agent continuing')); break;
      case 'steered': this.endLive(); this.row('you', '↪', 'STEER', `“${d.text}” — ${t('added to the running agent')}`); break;
      case 'interrupted': this.endLive(); this.card.el.classList.remove('live'); for (const c of this.calls.values()) if (!c.r.classList.contains('done')) c.r.classList.add('fail'); this.row('ctl', '■', 'INTERRUPTED', t('stopped by {r}; state cleaned up', { r: d.reason })); break;
      case 'final': this.endLive(); this.card.el.classList.remove('live'); this.row('final', '◆', 'FINAL', t('done in {s}s · {n} tool calls · {r} sources · {i} images saved', { s: ((d.stats?.elapsed_ms || 0) / 1000).toFixed(1), n: d.stats?.tool_calls ?? 0, r: d.stats?.results ?? 0, i: d.stats?.downloaded ?? 0 })); break;
      case 'error': {
        this.endLive(); this.card.el.classList.remove('live');
        const retry = el('button', 'retry', t('RETRY')); retry.onclick = () => bus.emit('cmd:retry');
        this.row('err', '✖', 'ERROR', d.message, d.retryable !== false ? [retry] : []);
        break;
      }
      default: break;
    }
  }
  markPlan(tool, state) {
    if (!this.planEl) return;
    const li = [...this.planEl.querySelectorAll('li')].find((x) => x.dataset.tool === tool && !x.classList.contains('ok') && !(state === 'run' && x.classList.contains('run')));
    if (li) { li.classList.remove('run'); li.classList.add(state); }
  }
  sys(text) { this.endLive(); this.row('ctl', '◇', 'SYSTEM', text); }
  // ── conversation stream (dual channel): what the user said/typed and what DECK spoke
  youLive(text) {
    if (!this.you) { this.endLive(); this.you = this.row('you live', '◉', 'YOU', ''); this.youX = this.you.querySelector('.x'); this.youX.append(el('span', 'yt', '')); }
    this.youX.querySelector('.yt').textContent = text || '…';
    this.scroll();
  }
  youFinal(text, { typed = false, note = '' } = {}) {
    if (!this.you) { this.endLive(); this.you = this.row('you', typed ? '›' : '◉', 'YOU', ''); this.youX = this.you.querySelector('.x'); this.youX.append(el('span', 'yt', '')); }
    if (!text) { this.you.remove(); this.you = null; return; }
    this.you.classList.remove('live'); this.youX.querySelector('.yt').textContent = text + (note ? `  (${note})` : '');
    this.you = null; this.scroll();
  }
  /** The prompt a turn answered to, once DSH has persisted it (it lands after the turn marker). */
  setStartPrompt(text) {
    const r = this.startRow
    if (!r || !r.isConnected || !text) return
    const tag = r.querySelector('.tag'), x = r.querySelector('.x')
    if (!x) return
    const shown = text.length > 240 ? `${text.slice(0, 240)}…` : text
    x.replaceChildren(...(tag ? [tag] : []), `“${shown}”`)
  }
  say(text) { this.endLive(); this.row('say', '◈', 'DECK SAYS', text); }
  local(text) { this.endLive(); this.row('final', '⌁', 'LOCAL', text); }
  text() { return [...this.box.querySelectorAll('.tr')].map((r) => r.innerText.replace(/\n/g, ' ')).join('\n'); }
}
