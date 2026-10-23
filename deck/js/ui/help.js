// Persistent help/feature icon rail + floating, draggable, minimisable help panels + first-run tour.
import { ICONS } from './icons.js';
import { bus } from '../core/bus.js';
import { load, save } from '../core/store.js';
import { GESTURES, SHORTCUTS, shortcutsFor } from './guide.js';
import { sfx } from '../fx/sound.js';
import { t } from '../core/i18n.js';
import { EMBEDDED } from '../core/host.js';

const el = (t, c, txt) => { const e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; };

/** The tools DeepSeek Harness itself provides while the deck runs inside it. */
export const DSH_TOOL_DOCS = [
  ['web_search', 'DSH web search — every hit becomes a SOURCE row.'],
  ['web_fetch', 'Fetch a page as readable text — feeds SOURCES and the answer.'],
  ['bash · pwsh', 'Run a shell command on this machine — TOOL OUTPUT.'],
  ['read · write · edit', 'Read and change workspace files.'],
  ['grep · glob', 'Search file contents and file names.'],
  ['run_code', 'Run a script (PowerShell / Python / Node) inside the harness.'],
  ['read_image', 'Look at an image file — IMAGE GRID.'],
  ['todo_write', 'Publish or update the plan — drives TASK GRAPH.'],
  ['present', 'Hand a deliverable file back to the user.'],
  ['ask_user_question', 'Ask the user and wait for the answer.'],
  ['spawn_teammate · send_message · wait_agent', 'Agent-team collaboration.'],
]

export const TOOL_DOCS = [
  ['declare_plan', 'Agent publishes its plan (2–6 steps) as a structured `plan` event.'],
  ['geocode', 'Open-Meteo gazetteer + encyclopedia coordinates — places, timezones; the globe flies there.'],
  ['weather', 'Open-Meteo: current conditions + 7-day forecast (keyless).'],
  ['world_time', 'Local time in any timezone.'],
  ['calculator', 'Exact, sandboxed arithmetic.'],
  ['unit_convert', 'Length, mass, volume, speed, temperature.'],
  ['currency', 'ECB reference exchange rates (keyless).'],
  ['memory', 'Personal notes, stored only on this machine.'],
  ['reminder', 'Timed reminders — the deck shows and speaks them.'],
  ['web_search', 'General web search (ddgs, keyless; SerpAPI optional).'],
  ['news_search', 'Dated news for “latest” requests — feeds the TIMELINE.'],
  ['video_search', 'Videos with publisher, duration and thumbnail.'],
  ['image_search', 'imgagent: Wikimedia / Openverse / DuckDuckGo candidates with licence metadata.'],
  ['image_download', 'imgagent: saves chosen originals + thumbnails locally (/media).'],
  ['wiki_lookup', 'Encyclopedia baseline — used to cross-validate figures.'],
  ['fetch_page', 'websift: readable page text (PDF aware) with SSRF guard.'],
];

export class FloatPanel {
  constructor(id, title, render, { w = 420, h = 520 } = {}) {
    this.id = id; this.titleKey = title; this.render = render;
    const pos = load(`panel.${id}`, null);
    this.el = el('section', 'float-panel'); this.el.hidden = true; this.el.dataset.panel = id;
    this.el.style.width = `${pos?.w || w}px`; this.el.style.height = `${pos?.h || h}px`;
    const k = FloatPanel.count = (FloatPanel.count || 0) + 1;   // cascade default positions so panels never open exactly on top of each other
    this.el.style.left = `${pos?.x ?? Math.max(20, innerWidth - (pos?.w || w) - 90 - (k - 1) * 40)}px`; this.el.style.top = `${pos?.y ?? 64 + (k - 1) * 34}px`;
    const head = el('header', 'fp-h');
    this.tEl = el('span', 'fp-t', t(title)); head.append(this.tEl, el('span', 'sp'));
    const min = el('button', null, '▁'); min.dataset.i18nTitle = 'Minimise'; min.title = t('Minimise'); min.onclick = () => this.el.classList.toggle('min');
    const x = el('button', null, '✕'); x.dataset.i18nTitle = 'Close (Esc)'; x.title = t('Close (Esc)'); x.onclick = () => this.close();
    bus.on('lang:changed', () => { this.tEl.textContent = t(title); min.title = t('Minimise'); x.title = t('Close (Esc)'); if (this.open) this.body.replaceChildren(...[].concat(this.render())); });
    head.append(min, x);
    this.body = el('div', 'fp-b');
    this.el.append(head, this.body, el('div', 'fp-rz'));
    document.getElementById('float-layer').append(this.el);
    this.drag(head, (dx, dy, o) => { this.el.style.left = `${Math.max(0, Math.min(innerWidth - 80, o.x + dx))}px`; this.el.style.top = `${Math.max(40, Math.min(innerHeight - 40, o.y + dy))}px`; });
    this.drag(this.el.querySelector('.fp-rz'), (dx, dy, o) => { this.el.style.width = `${Math.max(280, o.w + dx)}px`; this.el.style.height = `${Math.max(160, o.h + dy)}px`; });
    this.el.addEventListener('pointerdown', () => FloatPanel.front(this));
  }
  drag(handle, fn) {
    handle.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      e.preventDefault();
      const r = this.el.getBoundingClientRect(), o = { x: r.left, y: r.top, w: r.width, h: r.height }, sx = e.clientX, sy = e.clientY, id = e.pointerId;
      const mv = (ev) => { if (ev.pointerId === id) fn(ev.clientX - sx, ev.clientY - sy, o); };
      const up = (ev) => { if (ev.pointerId !== id) return; removeEventListener('pointermove', mv); removeEventListener('pointerup', up); this.persist(); };
      addEventListener('pointermove', mv); addEventListener('pointerup', up);
    });
  }
  persist() { const r = this.el.getBoundingClientRect(); save(`panel.${this.id}`, { x: r.left, y: r.top, w: r.width, h: r.height }); }
  get open() { return !this.el.hidden; }
  show() { this.body.replaceChildren(...[].concat(this.render())); this.el.hidden = false; this.el.classList.remove('min'); FloatPanel.front(this); this.el.animate([{ opacity: 0, transform: 'scale(.96) translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'ease-out' }); sfx.open(); bus.emit('help:changed'); }
  close() { if (this.el.hidden) return; this.el.hidden = true; sfx.close(); bus.emit('help:changed'); }
  toggle() { this.open ? this.close() : this.show(); }
  static front(p) { FloatPanel.z = (FloatPanel.z || 100) + 1; p.el.style.zIndex = FloatPanel.z; FloatPanel.top = p; }
}

function table(rows, cls = 'help-table') {
  const box = el('div', cls);
  for (const [a, b, c, core] of rows) { const r = el('div', `ht-row${core === true ? ' core' : ''}`); r.append(el('b', null, t(a)), el('span', null, t(b))); if (c) r.append(el('i', null, t(c))); box.append(r); }
  return box;
}

export class HelpSystem {
  constructor({ settingsPanel, onTour }) {
    this.panels = {
      gestures: new FloatPanel('gestures', 'GESTURE HELP', () => [el('p', 'fp-note', t('Enable with the GESTURE chip (or H). The pointer is your index fingertip and snaps onto nearby controls — aim roughly, then pinch. The gestures in amber are all you need. Panels only move after a pinch-and-hold on their title, so they never jump by accident. Shift+H re-centres the pointer. Privacy: only 21 landmarks per hand are used — camera images are never shown or uploaded.')), table(GESTURES)], { w: 480, h: 580 }),
      voice: new FloatPanel('voice', 'VOICE HELP', () => [
        el('p', 'fp-note', t('Press CALL (or C). The line stays open like a phone call: just talk, in English or Chinese. A sentence ends when you stop speaking (voice-activity detection) and runs immediately; the next turn starts automatically.')),
        table([['Barge in', 'Start talking while DECK speaks — it stops at once and listens.'], ['“stop” / “停止”', 'Interrupts the running task'], ['“wait” / “暂停”', 'Pauses the agent'],
          ['“continue” / “继续”', 'Resumes (or re-runs an interrupted task)'], ['“reset” · “clear canvas”', 'Reset state · clear results'], ['“hang up” / “挂断”', 'Ends the call'],
          ['Deck commands', '“open the images panel”, “切换到中文”, “矩阵主题”, “lock layout”, “放大地球” run instantly'],
          ['Idle', 'No speech for the idle timeout → warning, then auto hang-up'], ['Typed commands', 'Also get spoken replies while a call is active'], ['Mute (M)', 'Mic muted, call stays connected']]),
        el('p', 'fp-note dim', t('Speech recognition uses the browser’s SpeechRecognition (Chrome/Edge send audio to the vendor’s service). Recognition language follows the UI language unless set in Settings → Voice.'))], { w: 440, h: 500 }),
      shortcuts: new FloatPanel('shortcuts', 'SHORTCUTS', () => [table((EMBEDDED ? shortcutsFor(true) : SHORTCUTS).map(([k, d, g]) => [k, d, g]))], { w: 420, h: 560 }),
      tools: new FloatPanel('tools', 'AGENT TOOLS', () => [el('p', 'fp-note', t(EMBEDDED
        ? 'DeepSeek Harness owns the tools: web_search, web_fetch, bash, pwsh, read, write, edit, grep, glob, todo_write and more. The deck draws what they return and adds none of its own.'
        : 'The assistant understands your request (English / 中文), plans a task graph and runs independent steps in parallel. Tools are plugins (backend/tools/plugins) — add a file to add a source.')), table(EMBEDDED ? DSH_TOOL_DOCS : TOOL_DOCS)], { w: 460, h: 520 }),
      settings: settingsPanel,
    };
    this.rail = document.getElementById('help-rail');
    this.rail.replaceChildren();
    const icons = [['gestures', ICONS.hand, 'GESTURE', 'Gesture help (F1)'], ['voice', ICONS.mic, 'VOICE', 'Voice help'], ['shortcuts', ICONS.keys, 'KEYS', 'Shortcuts (?)'], ['tools', ICONS.tools, 'TOOLS', 'Agent tools'], ['settings', ICONS.gear, 'SETUP', 'Settings'], ['tour', ICONS.tour, 'TOUR', 'Guided tour']];
    for (const [id, ico, label, title] of icons) {
      const b = el('button', 'rail-btn'); b.innerHTML = `${ico}<span></span>`; b.dataset.panel = id;
      const lab = () => { b.querySelector('span').textContent = t(label); b.title = t(title); b.setAttribute('aria-label', t(title)); };
      lab(); bus.on('lang:changed', lab);
      b.onclick = () => (id === 'tour' ? onTour() : this.panels[id].toggle());
      this.rail.append(b);
    }
    bus.on('help:changed', () => this.rail.querySelectorAll('[data-panel]').forEach((b) => b.classList.toggle('on', !!this.panels[b.dataset.panel]?.open)));
  }
  toggle(id) { this.panels[id]?.toggle(); }
  closeTop() {
    const open = Object.values(this.panels).filter((p) => p.open);
    if (!open.length) return false;
    (open.includes(FloatPanel.top) ? FloatPanel.top : open[open.length - 1]).close();
    return true;
  }
  closeAll() { let any = false; for (const p of Object.values(this.panels)) if (p.open) { p.close(); any = true; } return any; }
}

// ───────────── lightweight first-run tour (skippable, “don't show again”)
const STEPS = [
  ['#cmdbar', 'COMMAND BAR', 'Type or say anything, in English or 中文 — weather, time, maths, money, reminders, places, images, research. Deck commands like “open images” run instantly.'],
  ['#dock-right', 'TASK GRAPH', 'Every request becomes a task graph: what was understood, which steps run in parallel, what each tool returned — live.'],
  ['#btn-call', 'VOICE CALL', 'Start a continuous voice call: just talk, interrupt any time, say “stop” or “hang up”.'],
  ['#kpi', 'MISSION STATUS', 'Live counters and the agent state. The globe below reacts: engines burn while tools run, satellites flare per tool.'],
  ['#dock-left', 'RESULT DOCKS', 'Results arrive in fixed docks — nothing to pan or zoom. Drag a title to re-dock, double-click (or X) to put a panel on the centre stage. The lock icon pins the layout.'],
  ['#chip-lang', 'LANGUAGE', 'Switch the interface between English and 中文 (or press L). Replies follow the language you ask in.'],
  ['#chip-gesture', 'HAND GESTURES', 'Optional. Your fingertip is the pointer and snaps onto controls — aim roughly and pinch. Only hand landmarks are used.'],
  ['#help-rail', 'HELP ICONS', 'Gesture, voice, shortcut and tool help live here — open and close them any time.'],
  ['#btn-reset-ui', 'ONE-CLICK RESET', 'Restore the default layout (or everything) — always with undo.'],
];
export class Tour {
  constructor() { this.m = document.getElementById('tour'); }
  get done() { return load('tourDone', false); }
  start() {
    this.i = 0; this.m.hidden = false; this.step();
    this.key = (e) => { if (e.key === 'Escape') this.finish(); if (e.key === 'ArrowRight' || e.key === 'Enter') this.next(); };
    addEventListener('keydown', this.key, true);
  }
  step() {
    const [sel, title, text] = STEPS[this.i];
    const rc = document.querySelector(sel)?.getBoundingClientRect();
    this.m.innerHTML = '';
    const spot = el('div', 'tour-spot'); if (rc) Object.assign(spot.style, { left: `${rc.left - 8}px`, top: `${rc.top - 8}px`, width: `${rc.width + 16}px`, height: `${rc.height + 16}px` });
    const card = el('div', 'tour-card');
    card.append(el('div', 'tour-k', `${this.i + 1} / ${STEPS.length}`), el('b', null, t(title)), el('p', null, t(text)));
    const row = el('div', 'tour-row');
    const lab = el('label'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = true; lab.append(cb, ` ${t('don’t show again')}`); this.cb = cb;
    const skip = el('button', null, t('SKIP')); skip.onclick = () => this.finish();
    const next = el('button', 'primary', t(this.i === STEPS.length - 1 ? 'DONE' : 'NEXT ›')); next.onclick = () => this.next();
    row.append(lab, el('span', 'sp'), skip, next); card.append(row);
    if (rc) { const below = rc.top < innerHeight / 2; card.style.left = `${Math.min(innerWidth - 340, Math.max(12, rc.left))}px`; card.style[below ? 'top' : 'bottom'] = below ? `${rc.bottom + 18}px` : `${innerHeight - rc.top + 18}px`; }
    this.m.append(spot, card);
  }
  next() { if (++this.i >= STEPS.length) return this.finish(); this.step(); }
  finish() { if (this.cb?.checked !== false) save('tourDone', true); this.m.hidden = true; removeEventListener('keydown', this.key, true); bus.emit('tour:done'); }
}
