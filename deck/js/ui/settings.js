// SYSTEM SETTINGS console — a full-screen holographic console with section navigation:
//   AI ENGINE · LANGUAGE · APPEARANCE · VOICE · GESTURES · PRIVACY · ABOUT
// AI ENGINE configures any OpenAI-compatible LLM provider (OpenAI, DeepSeek, Qwen, Kimi, GLM, SiliconFlow,
// OpenRouter, Ollama, custom): API URL, secret key, model — with live connection test and model discovery.
// The key is posted once to the local deck server (backend/llm_config.py) and never comes back to the page.
import { bus } from '../core/bus.js';
import { settings, saveSettings, DEFAULT_SETTINGS } from '../core/store.js';
import { t, setLang, isZh } from '../core/i18n.js';
import { ICONS } from './icons.js';
import { sfx } from '../fx/sound.js';
import { decode, GLYPHS } from '../fx/anim.js';
import { THEMES, THEME_IDS, FAMILIES } from '../core/themes.js';
import { api, EMBEDDED, notifyHost } from '../core/host.js';

const el = (tag, c, txt) => { const e = document.createElement(tag); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; };
const svg = (d) => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const IC = {
  ai: svg('<rect x="5" y="5" width="14" height="14" rx="2"/><path d="M9 9h6v6H9zM9 2.5V5M15 2.5V5M9 19v2.5M15 19v2.5M2.5 9H5M2.5 15H5M19 9h2.5M19 15h2.5"/>'),
  lang: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z"/>'),
  look: svg('<path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.6-.8 1.6-1.6 0-1.2-1-1.4-1-2.6 0-.9.7-1.6 1.6-1.6H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>'),
  voice: ICONS.mic, hand: ICONS.hand,
  lock: svg('<rect x="5" y="10.5" width="14" height="9.5" rx="1.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5v.5"/>'),
  find: svg('<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5M7.5 10.5h6M10.5 7.5v6"/>'),
  eye: svg('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>'),
  bolt: svg('<path d="M13 2.5 4.5 13.5H11l-1 8 8.5-11H12z"/>'),
  sync: svg('<path d="M20 11a8 8 0 0 0-14.5-4.5M4 13a8 8 0 0 0 14.5 4.5"/><path d="M5.5 2.5v4h4M18.5 21.5v-4h-4"/>'),
};
// brand-neutral monogram tiles (no logos) — a hue per provider for recognisability
const PROV_HUE = { openai: 160, deepseek: 222, qwen: 262, moonshot: 200, zhipu: 236, siliconflow: 280, openrouter: 30, ollama: 0, custom: 190 };
const MONO = { openai: 'OA', deepseek: 'DS', qwen: 'QW', moonshot: 'KM', zhipu: 'GL', siliconflow: 'SF', openrouter: 'OR', ollama: 'OL', custom: '{ }' };

// ── generic settings rows: [key, label, type, options, hint]
const SECTIONS = {
  language: [
    ['LANGUAGE', [
      ['lang', 'Interface language', 'seg', [['en', 'English'], ['zh', '中文']]],
      ['voiceLang', 'Recognition language', 'select', ['auto', 'en-US', 'zh-CN', 'en-GB', 'ja-JP', 'de-DE', 'fr-FR', 'es-ES'], 'auto = follows the interface language'],
    ]],
    ['ASSISTANT', [
      ['homeCity', 'Home city (weather / time without a place)', 'text', 'empty = your timezone’s city'],
      ['tts', 'Spoken replies (speechSynthesis)', 'switch'],
      ['ttsRate', 'Speech rate', 'range', [0.7, 1.6, 0.05]],
    ]],
  ],
  appearance: [
    ['THEME', [['theme', 'Theme', 'themes', THEME_IDS]]],
    ['SPACE', [['tilt3d', '3D cockpit — side docks curve toward you', 'switch']]],
    ['RENDER QUALITY', [
      ['perf', 'Performance mode', 'seg', ['auto', 'high', 'balanced', 'low']],
      ['animations', 'Animations', 'switch'],
      ['rain', 'Digital rain density', 'range', [0, 1.5, 0.05]],
      ['glitch', 'Glitch intensity', 'range', [0, 2, 0.1]],
      ['scanlines', 'Scanlines', 'switch'],
      ['labels', 'Tool satellites & source labels', 'switch'],
    ]],
    ['SOUND', [['sound', 'Sound effects', 'switch'], ['volume', 'Sound volume', 'range', [0, 1, 0.05]]]],
  ],
  voice: [
    ['SPEECH RECOGNITION', [
      ['asrEngine', 'Transcription engine', 'seg', [['auto', 'Auto'], ['browser', 'Browser'], ['server', 'Server']], 'auto = browser Web Speech, switching to server transcription when the browser service is unreachable'],
    ]],
    ['VOICE CALL', [
      ['vadOn', 'Speech start threshold (dB above noise)', 'range', [5, 25, 1]],
      ['vadHang', 'End-of-sentence silence (ms) — longer = pauses never split a request', 'range', [600, 2500, 50]],
      ['bargeIn', 'Barge-in (interrupt DECK by talking)', 'switch'],
      ['vadBarge', 'Barge-in threshold (dB above noise)', 'range', [10, 35, 1]],
      ['callIdle', 'Idle hang-up after (s, 0 = never)', 'range', [0, 900, 30]],
      ['wake', 'Wake word in noisy places — start with “Deck …” / “助手…”; follow-ups within 20 s need none', 'switch'],
      ['ack', 'Acknowledge accepted requests with a chime', 'switch'],
    ]],
  ],
  gestures: [
    ['STABLE WINDOWS', [
      ['layoutLock', 'Layout lock — panels can’t be moved, resized or maximised by gestures or drags', 'switch'],
      ['gGrab', 'Pinch-and-hold before a panel lifts (ms) — a quicker pinch on the title opens it on the centre stage', 'range', [150, 900, 50]],
      ['gSwipes', 'Swipe gestures switch workspace / scroll pages', 'switch'],
    ]],
    ['POINTER', [
      ['gAnchor', 'Pointer anchor', 'seg', [['stable', 'Steady (knuckles)'], ['tip', 'Fingertip']], 'steady = the pointer holds still when you pinch or close the hand; fingertip = follows the fingertip exactly'],
      ['gSens', 'Pointer sensitivity (less hand travel →)', 'range', [0.6, 2.2, 0.05]],
      ['gFollow', 'Pointer follow speed', 'range', [0, 1, 0.05]],
      ['gJitter', 'Jitter suppression', 'range', [0, 1, 0.05]],
      ['gMagnet', 'Target magnetism (pointer snaps onto controls)', 'switch'],
      ['gDwell', 'Dwell click — hover still to press (ms, 0 = off)', 'range', [0, 2000, 100]],
    ]],
    ['ANTI-MISFIRE', [
      ['gStable', 'Stable frames before a pose counts', 'range', [1, 8, 1]],
      ['gConfidence', 'Minimum hand confidence', 'range', [0.4, 0.95, 0.05]],
      ['gPinch', 'Pinch threshold (thumb–index / palm)', 'range', [0.2, 0.45, 0.01]],
      ['gSwipe', 'Swipe speed required (×)', 'range', [0.5, 2, 0.1]],
      ['gHold', 'Hold duration for fist/palm (ms)', 'range', [400, 2000, 50]],
      ['gLocked', 'Gesture lock (cursor only, no actions)', 'switch'],
    ]],
  ],
  privacy: [
    ['PRIVACY', [['privacy', 'Hand layer (camera pixels are never drawn)', 'seg', ['skeleton', 'hidden']]]],
  ],
};
const NAV = [
  ['ai', 'AI ENGINE', IC.ai], ['search', 'SEARCH', IC.find], ['language', 'LANGUAGE', IC.lang], ['appearance', 'APPEARANCE', IC.look],
  ['voice', 'VOICE', IC.voice], ['gestures', 'GESTURES', IC.hand], ['privacy', 'PRIVACY', IC.lock], ['about', 'ABOUT', IC.info],
];

const set = (key, v) => {
  if (key === 'lang') { setLang(v); return; }
  if (key === 'theme') { bus.emit('theme:set', v); return; }          // main.js: light-wave transition + 3D world
  settings[key] = v; saveSettings(); bus.emit('settings:changed', key);
};

function control(key, type, opt) {
  if (type === 'switch') {
    const b = el('button', `sw${settings[key] ? ' on' : ''}`); b.type = 'button'; b.setAttribute('role', 'switch'); b.setAttribute('aria-checked', String(!!settings[key]));
    b.innerHTML = '<i></i>';
    b.onclick = () => { const v = !settings[key]; set(key, v); b.classList.toggle('on', v); b.setAttribute('aria-checked', String(v)); sfx.click?.(); };
    return b;
  }
  if (type === 'themes') {                       // v5.5 gallery: a miniature of each world (sky, grid, globe, panel) + name + mood
    const g = el('div', 'theme-gallery'), zh = isZh();
    let fam = null;
    for (const v of [...opt].sort((x, y) => Object.keys(FAMILIES).indexOf(THEMES[x].family) - Object.keys(FAMILIES).indexOf(THEMES[y].family))) {
      const th = THEMES[v], [c1, c2, c3] = th.sw;
      if (th.family !== fam) { fam = th.family; g.append(el('div', 'theme-family', FAMILIES[fam][zh ? 1 : 0])); }
      const b = el('button', `theme-card${settings[key] === v ? ' on' : ''}`); b.type = 'button'; b.dataset.v = v; b.dataset.t = v;
      b.style.cssText = `--c1:${c1};--c2:${c2};--c3:${c3}`;
      b.innerHTML = '<i class="tc-sky"></i><i class="tc-grid"></i><i class="tc-panel"></i><i class="tc-orb"></i><b></b><small></small><i class="tc-check">✓</i>';
      b.querySelector('b').textContent = zh ? th.zh : th.name; b.querySelector('small').textContent = zh ? th.tagZh : th.tag;
      b.onclick = () => { set(key, v); for (const x of g.querySelectorAll('.theme-card')) x.classList.toggle('on', x === b); sfx.click?.(); };
      g.append(b);
    }
    return g;
  }
  if (type === 'seg') {
    const g = el('div', 'seg');
    for (const o of opt) {
      const [v, txt] = Array.isArray(o) ? o : [o, t(o)];
      const b = el('button', settings[key] === v ? 'on' : ''); b.type = 'button'; b.dataset.v = v;
      b.textContent = txt;
      b.onclick = () => { set(key, v); for (const x of g.querySelectorAll('.theme-card')) x.classList.toggle('on', x === b); sfx.click?.(); };
      g.append(b);
    }
    return g;
  }
  if (type === 'select') {
    const s = el('select', 'sel'); for (const o of opt) { const op = el('option', null, t(o)); op.value = o; s.append(op); } s.value = settings[key];
    s.onchange = () => set(key, s.value); return s;
  }
  if (type === 'text') {
    const i = el('input', 'txt'); i.type = 'text'; i.value = settings[key] || ''; i.placeholder = t(opt); i.maxLength = 80; i.spellcheck = false;
    i.onchange = () => set(key, i.value.trim()); return i;
  }
  const [mn, mx, st] = opt, w = el('div', 'rng'), r = el('input'), out = el('output');
  r.type = 'range'; r.min = mn; r.max = mx; r.step = st; r.value = settings[key];
  const paint = () => { w.style.setProperty('--p', `${((r.value - mn) / (mx - mn)) * 100}%`); out.textContent = r.value; };
  r.oninput = () => { set(key, +r.value); paint(); }; paint();
  w.append(r, out); return w;
}

function card(title, rows, hint) {
  const c = el('section', 'sc-card');
  c.append(el('h4', null, t(title)));
  if (hint) c.append(el('p', 'sc-hint', t(hint)));
  for (const [key, label, type, opt, note] of rows) {
    const r = el('div', `sc-row${type === 'range' ? ' wide' : ''}${type === 'themes' ? ' col' : ''}`);
    const l = el('div', 'sc-l'); l.append(el('span', null, t(label))); if (note || (type === 'text' && opt)) l.append(el('small', null, t(note || '')));
    r.append(l, control(key, type, opt)); c.append(r);
  }
  return c;
}

export class SettingsConsole {
  constructor({ frameworks, setFramework, onLLM } = {}) {
    this.frameworks = frameworks; this.setFramework = setFramework; this.onLLM = onLLM;
    this.m = document.getElementById('settings-console'); this.tab = 'ai'; this.llm = null;
    this.m.addEventListener('pointerdown', (e) => { if (e.target === this.m) this.close(); });
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.open) { this.close(); e.stopImmediatePropagation(); e.preventDefault(); } }, true);
    bus.on('lang:changed', () => { if (this.open) this.render(); });
    bus.on('settings:changed', (k) => { if (k === 'all' && this.open) this.render(); });
    this.refreshLLM();
  }
  get open() { return !this.m.hidden; }
  show(tab) {
    if (tab) this.tab = tab; this.m.hidden = false; this.render(); sfx.open?.();
    Promise.all([this.refreshLLM(), this.refreshSearch(), this.refreshASR()]).then(() => { if (this.open && ['ai', 'search', 'voice'].includes(this.tab)) this.renderBody(); });
    bus.emit('help:changed');
  }
  close() { if (this.m.hidden) return; this.m.hidden = true; sfx.close?.(); bus.emit('help:changed'); }
  toggle(tab) { this.open && (!tab || tab === this.tab) ? this.close() : this.show(tab); }

  async refreshSearch() {
    if (EMBEDDED) return null;                       // search providers are DSH's here
    try { const r = await fetch(api('/api/search')); if (r.ok) this.search = await r.json(); } catch { /* backend offline */ }
    return this.search;
  }
  async refreshASR() { if (EMBEDDED) return null; try { const r = await fetch(api('/api/asr')); if (r.ok) this.asr = await r.json(); } catch { /* offline */ } return this.asr; }
  async refreshLLM() {
    if (EMBEDDED) return null;                       // models are DSH's here
    try { const r = await fetch(api('/api/llm')); if (r.ok) { this.llm = await r.json(); this.onLLM?.(this.llm); } } catch { /* backend offline */ }
    return this.llm;
  }

  render() {
    const box = el('div', 'sc');
    const head = el('header', 'sc-h');
    head.innerHTML = `<b>${t('SYSTEM SETTINGS')}</b><span>COMMAND//DECK v5.6</span><i class="sp"></i>`;
    const rst = el('button', 'sc-reset', t('RESTORE DEFAULT SETTINGS')); rst.type = 'button';
    rst.onclick = () => { const l = settings.lang; Object.assign(settings, DEFAULT_SETTINGS, { lang: l }); saveSettings(); bus.emit('settings:changed', 'all'); this.render(); };
    const x = el('button', 'sc-x'); x.type = 'button'; x.innerHTML = svg('<path d="m6 6 12 12M18 6 6 18"/>'); x.title = t('Close (Esc)'); x.onclick = () => this.close();
    head.append(rst, x);
    const nav = el('nav', 'sc-nav');
    for (const [id, label, ico] of NAV) {
      const b = el('button', id === this.tab ? 'on' : ''); b.type = 'button'; b.dataset.tab = id;
      b.innerHTML = `${ico}<span><b></b><small></small></span>`;
      b.querySelector('b').textContent = t(label);
      b.querySelector('small').textContent = this.navSub(id);
      b.onclick = () => { this.tab = id; for (const n of nav.children) n.classList.toggle('on', n === b); this.renderBody(); sfx.click?.(); };
      nav.append(b);
    }
    this.body = el('div', 'sc-body');
    box.append(head, nav, this.body);
    this.m.replaceChildren(box);
    this.renderBody();
  }
  navSub(id) {
    if (EMBEDDED && (id === 'ai' || id === 'search')) return 'DeepSeek Harness';
    const L = this.llm;
    if (id === 'ai') return L?.active?.source === 'ui' ? `${L.presets[L.provider]?.label || L.provider} · ${L.active.model}` : L?.active?.source === 'env' ? `.env · ${L.active.model}` : t('offline grammar');
    if (id === 'search') { const S = this.search; if (!S) return t('metasearch'); const api = Object.values(S.providers).filter((p) => p.enabled).length; return `${S.free.on.length} ${t('engines')}${api ? ` + ${api} API` : ''}`; }
    if (id === 'language') return settings.lang === 'zh' ? '中文' : 'English';
    if (id === 'appearance') return `${(isZh() ? THEMES[settings.theme]?.zh : THEMES[settings.theme]?.name) || settings.theme} · ${t(settings.perf)}`;
    if (id === 'voice') return settings.bargeIn ? t('barge-in on') : t('barge-in off');
    if (id === 'gestures') return settings.layoutLock ? t('layout locked') : t('stable windows');
    if (id === 'privacy') return t(settings.privacy === 'hidden' ? 'CAM · HAND HIDDEN' : 'CAM · SKELETON ONLY');
    return 'v5.6';
  }
  renderBody() {
    const b = this.body; if (!b) return;
    const titles = { search: ['SEARCH', 'Every query fans out to several engines in parallel; results are merged, de-duplicated and ranked by agreement, relevance and freshness. Add an API provider for the most reliable, fresh results.'],
      ai: ['AI ENGINE', 'Connect a large language model. The deck understands and plans on its own; an LLM adds smarter understanding and written answers.'],
      language: ['LANGUAGE', 'Interface and speech language. Replies follow the language you ask in.'], appearance: ['APPEARANCE', 'Theme, rendering quality and sound.'],
      voice: ['VOICE', 'Phone-call style voice: detection thresholds and barge-in.'], gestures: ['GESTURES', 'Fingertip pointer, stable windows and anti-misfire.'],
      privacy: ['PRIVACY', 'What the deck may show and store.'], about: ['ABOUT', 'Agent framework and system information.'] };
    const [tt, sub] = titles[this.tab];
    const top = el('div', 'sc-title'), h = el('h3', null, t(tt)); top.append(h, el('p', null, t(sub))); decode(h, t(tt), 420, GLYPHS);
    const nodes = [top];
    if (this.tab === 'ai') nodes.push(...this.aiSection());
    else if (this.tab === 'search') nodes.push(...this.searchSection());
    else if (this.tab === 'about') nodes.push(...this.aboutSection());
    else for (const [title, rows] of SECTIONS[this.tab]) nodes.push(card(title, rows));
    if (this.tab === 'voice') nodes.splice(2, 0, this.asrCard());
    if (this.tab === 'privacy') nodes.push(this.privacyFacts());
    b.replaceChildren(...nodes);
    b.scrollTop = 0;
    b.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'ease-out' });
  }

  // ───────────── AI ENGINE
  /** Embedded in DeepSeek Harness: models, web search and transcription belong to DSH — say so and link there. */
  managedCard(what, target) {
    const c = el('section', 'sc-card sc-managed');
    c.append(el('h4', null, t('MANAGED BY DEEPSEEK HARNESS')), el('p', 'sc-hint', t('{what} come from DeepSeek Harness while the deck runs inside it: the agent, its models and tools are DSH’s, the deck visualises them.', { what: t(what) })));
    const b = el('button', 'btn ghost', t('Open DSH settings')); b.type = 'button';
    b.onclick = () => notifyHost('open_dsh', { target }); c.append(b);
    return c;
  }
  aiSection() {
    if (EMBEDDED) return [this.managedCard('Models and providers', 'models')];
    const L = this.llm;
    if (!L) { const c = el('section', 'sc-card'); c.append(el('p', 'sc-hint', t('Backend offline — AI settings are stored by the local deck server.'))); return [c]; }
    const state = { provider: L.provider, enabled: L.enabled, understand: L.understand, answer: L.answer };
    const prof = () => L.profiles[state.provider];
    const preset = () => L.presets[state.provider];
    // status hero
    const hero = el('section', 'sc-hero');
    const online = L.active?.source !== 'none';
    hero.classList.toggle('on', online);
    hero.innerHTML = `<div class="core"><i></i><i></i><i></i>${IC.ai}</div><div class="st"><small></small><b></b><span></span></div>`;
    hero.querySelector('small').textContent = t('AI ENGINE STATUS');
    hero.querySelector('b').textContent = online ? `${L.active.source === 'env' ? '.env' : (isZh() ? preset()?.zh : preset()?.label)} · ${L.active.model}` : t('OFFLINE · BILINGUAL GRAMMAR');
    hero.querySelector('span').textContent = online ? `${L.active.base_url} · ${t(L.active.source === 'ui' ? 'configured here' : 'from environment variables')}` : t('No LLM connected — the deck still understands, plans and searches on its own.');
    // provider grid
    const grid = el('div', 'prov-grid');
    for (const [id, p] of Object.entries(L.presets)) {
      const b = el('button', `prov${id === state.provider ? ' on' : ''}`); b.type = 'button'; b.dataset.p = id; b.style.setProperty('--h', PROV_HUE[id] ?? 190);
      b.innerHTML = `<i class="mono"></i><span><b></b><small></small></span><em></em>`;
      b.querySelector('.mono').textContent = MONO[id] || id.slice(0, 2).toUpperCase();
      b.querySelector('b').textContent = isZh() ? p.zh : p.label;
      b.querySelector('small').textContent = { cn: t('China'), global: t('Global'), local: t('Local'), any: t('Any OpenAI-compatible') }[p.region] || '';
      if (L.profiles[id]?.has_key) b.querySelector('em').textContent = '●';
      b.onclick = () => { state.provider = id; for (const x of grid.children) x.classList.toggle('on', x === b); fill(); sfx.click?.(); };
      grid.append(b);
    }
    const provCard = el('section', 'sc-card'); provCard.append(el('h4', null, t('PROVIDER')), grid);
    // connection form
    const form = el('section', 'sc-card sc-ai');
    form.append(el('h4', null, t('CONNECTION')));
    const row = (label, input, extra) => { const r = el('label', 'fld'); r.append(el('span', null, t(label)), input); if (extra) r.append(extra); form.append(r); return r; };
    const url = el('input', 'txt'); url.type = 'url'; url.spellcheck = false; url.placeholder = 'https://…/v1';
    const key = el('input', 'txt'); key.type = 'password'; key.autocomplete = 'off'; key.spellcheck = false;
    const eye = el('button', 'ib'); eye.type = 'button'; eye.innerHTML = IC.eye; eye.title = t('Show / hide'); eye.onclick = () => { key.type = key.type === 'password' ? 'text' : 'password'; };
    const keyWrap = el('div', 'inl'); keyWrap.append(key, eye);
    const model = el('input', 'txt'); model.spellcheck = false; model.setAttribute('list', 'sc-models');
    const dl = el('datalist'); dl.id = 'sc-models';
    const fetchBtn = el('button', 'ib'); fetchBtn.type = 'button'; fetchBtn.innerHTML = IC.sync; fetchBtn.title = t('Fetch the provider’s model list');
    const modelWrap = el('div', 'inl'); modelWrap.append(model, fetchBtn, dl);
    row('API URL', url);
    const keyRow = row('Secret key', keyWrap, el('small', 'kh'));
    row('Model', modelWrap);
    // behaviour
    const beh = el('div', 'beh');
    const sw = (on, label, fn) => { const w = el('div', 'sc-row'); const l = el('div', 'sc-l'); l.append(el('span', null, t(label))); const b = el('button', `sw${on ? ' on' : ''}`); b.type = 'button'; b.setAttribute('role', 'switch'); b.innerHTML = '<i></i>'; b.onclick = () => { const v = !b.classList.contains('on'); b.classList.toggle('on', v); fn(v); }; w.append(l, b); return w; };
    beh.append(sw(state.enabled, 'Use this LLM', (v) => { state.enabled = v; }));
    const und = el('div', 'sc-row'); const ul = el('div', 'sc-l'); ul.append(el('span', null, t('Understanding')), el('small', null, t('auto = grammar first, LLM for vague requests')));
    const seg = el('div', 'seg');
    for (const [v, lbl] of [['auto', 'Auto'], ['llm', 'LLM first'], ['off', 'Grammar only']]) { const b = el('button', state.understand === v ? 'on' : '', t(lbl)); b.type = 'button'; b.onclick = () => { state.understand = v; for (const x of seg.children) x.classList.toggle('on', x === b); }; seg.append(b); }
    und.append(ul, seg); beh.append(und);
    beh.append(sw(state.answer, 'LLM writes research answers', (v) => { state.answer = v; }));
    form.append(beh);
    // actions
    const acts = el('div', 'sc-acts');
    const testB = el('button', 'btn ghost'); testB.type = 'button'; testB.innerHTML = `${IC.bolt}<span>${t('TEST CONNECTION')}</span>`;
    const saveB = el('button', 'btn primary'); saveB.type = 'button'; saveB.innerHTML = `<span>${t('SAVE & APPLY')}</span>`;
    const clearB = el('button', 'btn danger'); clearB.type = 'button'; clearB.textContent = t('FORGET KEY');
    const res = el('div', 'sc-res');
    acts.append(testB, saveB, clearB); form.append(acts, res);
    const note = el('p', 'sc-note'); note.innerHTML = `${IC.lock}<span></span>`;
    note.querySelector('span').textContent = t('Your key is sent once to the deck server on this computer and stored in data/llm.json (readable only by you). It is never sent back to the page and never leaves this machine except to the provider you choose.');
    form.append(note);

    const body = () => ({ provider: state.provider, base_url: url.value.trim(), model: model.value.trim(), api_key: key.value.trim() || undefined });
    const fill = () => {
      const p = prof(), ps = preset();
      url.value = p.base_url; model.value = p.model; key.value = '';
      key.placeholder = state.provider === 'custom' ? (p.has_key ? `${t('saved')} ${p.key_hint} — ${t('type to replace')}` : t('optional — only if your endpoint needs one')) : ps.keyless ? t('not required for this provider') : p.has_key ? `${t('saved')} ${p.key_hint} — ${t('type to replace')}` : 'sk-…';
      keyRow.querySelector('.kh').textContent = p.has_key ? `${t('stored on this computer')} · ${p.key_hint}` : '';
      dl.replaceChildren(...(ps.models || []).map((m) => Object.assign(el('option'), { value: m })));
      clearB.hidden = !p.has_key; res.className = 'sc-res'; res.textContent = '';
    };
    const say = (ok, html) => { res.className = `sc-res ${ok ? 'ok' : 'bad'}`; res.innerHTML = html; };
    const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    const post = async (path, data) => { const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) }); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || r.statusText); return r.json(); };
    testB.onclick = async () => {
      testB.disabled = true; res.className = 'sc-res run'; res.textContent = t('contacting {p}…', { p: url.value || state.provider });
      try { const r = await post(api('/api/llm/test'), body()); r.ok ? say(true, `✓ <b>${r.ms} ms</b> · ${esc(r.model)} · “${esc(r.reply)}”`) : say(false, `✗ ${esc(r.error)}`); }
      catch (e) { say(false, `✗ ${esc(e.message)}`); }
      testB.disabled = false;
    };
    fetchBtn.onclick = async () => {
      fetchBtn.classList.add('spin');
      try { const r = await post(api('/api/llm/models'), body()); if (r.ok) { dl.replaceChildren(...r.models.map((m) => Object.assign(el('option'), { value: m }))); say(true, t('{n} models available — pick one in the Model field', { n: r.models.length })); } else say(false, `✗ ${esc(r.error)}`); }
      catch (e) { say(false, `✗ ${esc(e.message)}`); }
      fetchBtn.classList.remove('spin');
    };
    saveB.onclick = async () => {
      try {
        this.llm = await post(api('/api/llm'), { ...body(), enabled: state.enabled, understand: state.understand, answer: state.answer });
        key.value = ''; this.onLLM?.(this.llm, true); this.render(); sfx.complete?.();
        bus.emit('toast', { text: this.llm.active.source === 'ui' ? t('AI engine → {m}', { m: this.llm.active.model }) : t('AI engine off — bilingual grammar') });
      } catch (e) { say(false, `✗ ${esc(e.message)}`); }
    };
    clearB.onclick = async () => { try { this.llm = await post(api('/api/llm'), { provider: state.provider, api_key: '__clear__' }); this.onLLM?.(this.llm, true); this.render(); } catch (e) { say(false, `✗ ${esc(e.message)}`); } };
    fill();
    const fw = this.frameworkCard();
    return [hero, provCard, form, fw].filter(Boolean);
  }
  // ───────────── SEARCH
  searchSection() {
    if (EMBEDDED) return [this.managedCard('Web search providers', 'web-search')];
    const S = this.search;
    if (!S) { const c = el('section', 'sc-card'); c.append(el('p', 'sc-hint', t('Backend offline — AI settings are stored by the local deck server.'))); return [c]; }
    const esc = (x) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    const post = async (path, data) => { const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) }); return r.json(); };
    const on = new Set(S.free.on);
    // free engines
    const free = el('section', 'sc-card'); free.append(el('h4', null, t('FREE ENGINES (NO KEY)')), el('p', 'sc-hint', t('Queried together; any that are blocked or rate-limited are simply skipped. Test shows which ones answer from your network.')));
    const grid = el('div', 'eng-grid');
    for (const e of S.free.all) {
      const b = el('div', `eng${on.has(e) ? ' on' : ''}`);
      const tg = el('button', `sw${on.has(e) ? ' on' : ''}`); tg.type = 'button'; tg.innerHTML = '<i></i>';
      const st = el('small', 'st', '');
      tg.onclick = () => { on.has(e) ? on.delete(e) : on.add(e); tg.classList.toggle('on', on.has(e)); b.classList.toggle('on', on.has(e)); };
      const ping = el('button', 'ib'); ping.type = 'button'; ping.innerHTML = IC.bolt; ping.title = t('TEST CONNECTION');
      ping.onclick = async () => { ping.classList.add('spin'); st.className = 'st run'; st.textContent = '…'; const r = await post(api('/api/search/test'), { name: e, query: isZh() ? '人工智能 最新' : 'artificial intelligence news' }).catch((x) => ({ ok: false, error: x.message })); ping.classList.remove('spin'); st.className = `st ${r.ok ? 'ok' : 'bad'}`; st.textContent = r.ok ? `✓ ${r.count} · ${r.ms} ms` : `✗ ${String(r.error || '').slice(0, 40)}`; st.title = r.ok ? r.top : r.error; };
      b.append(el('b', null, e), st, ping, tg); grid.append(b);
    }
    free.append(grid);
    // API providers
    const apis = el('section', 'sc-card'); apis.append(el('h4', null, t('API PROVIDERS')), el('p', 'sc-hint', t('Optional. Keys are stored only on this computer. SearXNG (open source, self-hosted) or Bocha work well in mainland China.')));
    const vals = {};
    for (const [name, p] of Object.entries(S.providers)) {
      const row = el('div', `api${p.enabled ? ' on' : ''}`);
      const head = el('div', 'api-h');
      const tg = el('button', `sw${p.enabled || (!p.configured) ? (p.enabled ? ' on' : '') : ''}`); tg.type = 'button'; tg.innerHTML = '<i></i>';
      vals[name] = { enabled: p.enabled };
      tg.onclick = () => { vals[name].enabled = !vals[name].enabled; tg.classList.toggle('on', vals[name].enabled); row.classList.toggle('on', vals[name].enabled); };
      head.append(el('b', null, isZh() ? p.zh : p.label), el('span', 'reg', { cn: t('China'), global: t('Global'), any: t('Any network') }[p.region] || ''), el('i', 'sp'), tg);
      const inp = el('input', 'txt'); inp.type = p.field === 'key' ? 'password' : 'url'; inp.spellcheck = false; inp.autocomplete = 'off';
      inp.value = p.field === 'url' ? p.value || '' : '';
      inp.placeholder = p.field === 'key' ? (p.configured ? `${t('saved')} ${p.hint_tail || ''} ${p.from_env ? '(.env)' : ''} — ${t('type to replace')}` : p.hint) : p.hint;
      inp.oninput = () => { vals[name].value = inp.value; };
      const test = el('button', 'btn ghost sm'); test.type = 'button'; test.innerHTML = `${IC.bolt}<span>${t('TEST')}</span>`;
      const res = el('small', 'st', p.configured ? t('configured') : '');
      test.onclick = async () => { res.className = 'st run'; res.textContent = t('searching…'); const r = await post(api('/api/search/test'), { name, value: inp.value.trim() || undefined }).catch((x) => ({ ok: false, error: x.message })); res.className = `st ${r.ok ? 'ok' : 'bad'}`; res.innerHTML = r.ok ? `✓ ${r.count} · ${r.ms} ms · “${esc(r.top)}”` : `✗ ${esc(r.error)}`; };
      const line = el('div', 'inl'); line.append(inp, test);
      row.append(head, el('p', 'sc-hint', t(p.note)), line, res);
      apis.append(row);
    }
    const acts = el('div', 'sc-acts');
    const save = el('button', 'btn primary'); save.type = 'button'; save.innerHTML = `<span>${t('SAVE & APPLY')}</span>`;
    const out = el('div', 'sc-res');
    save.onclick = async () => {
      const providers = {}; for (const [n, v] of Object.entries(vals)) providers[n] = { enabled: v.enabled, ...(v.value?.trim() ? { value: v.value.trim() } : {}) };
      try { this.search = await post(api('/api/search'), { free: [...on], providers }); this.render(); bus.emit('toast', { text: t('Search engines updated') }); }
      catch (x) { out.className = 'sc-res bad'; out.textContent = `✗ ${x.message}`; }
    };
    acts.append(save); apis.append(acts, out);
    return [free, apis];
  }

  /** Server speech-to-text (OpenAI-compatible /audio/transcriptions). */
  asrCard() {
    if (EMBEDDED) return this.managedCard('Server speech-to-text settings', 'general');
    const A = this.asr, c = el('section', 'sc-card sc-ai');
    c.append(el('h4', null, t('SERVER TRANSCRIPTION')), el('p', 'sc-hint', t('Used when the browser recognizer is unavailable (e.g. its cloud is blocked on your network), or always with engine = Server. Each finished sentence is sent as audio to the provider you choose.')));
    if (!A) { c.append(el('p', 'sc-hint', t('Backend offline — AI settings are stored by the local deck server.'))); return c; }
    const st = { provider: A.provider, enabled: A.enabled };
    const grid = el('div', 'prov-grid');
    const hue = { siliconflow: 280, openai: 160, groq: 20, local: 0, custom: 190 }, mono = { siliconflow: 'SF', openai: 'OA', groq: 'GQ', local: 'LC', custom: '{ }' };
    const url = el('input', 'txt'), model = el('input', 'txt'), key = el('input', 'txt'); key.type = 'password'; key.autocomplete = 'off'; url.spellcheck = model.spellcheck = key.spellcheck = false;
    const dl = el('datalist'); dl.id = 'asr-models'; model.setAttribute('list', 'asr-models');
    const fill = () => { const p = A.profiles[st.provider], ps = A.presets[st.provider]; url.value = p.base_url; model.value = p.model; key.value = '';
      key.placeholder = p.reuses_ai_key ? t('uses the key from AI ENGINE') : p.has_key ? `${t('saved')} ${p.key_hint} — ${t('type to replace')}` : ps.keyless ? t('not required for this provider') : 'sk-…';
      dl.replaceChildren(...(ps.models || []).map((m) => Object.assign(el('option'), { value: m }))); };
    for (const [id, p] of Object.entries(A.presets)) {
      const b = el('button', `prov${id === st.provider ? ' on' : ''}`); b.type = 'button'; b.style.setProperty('--h', hue[id] ?? 190);
      b.innerHTML = '<i class="mono"></i><span><b></b><small></small></span>'; b.querySelector('.mono').textContent = mono[id] || '··';
      b.querySelector('b').textContent = isZh() ? p.zh : p.label; b.querySelector('small').textContent = { cn: t('China'), global: t('Global'), local: t('Local'), any: t('Any OpenAI-compatible') }[p.region] || '';
      b.onclick = () => { st.provider = id; for (const x of grid.children) x.classList.toggle('on', x === b); fill(); };
      grid.append(b);
    }
    c.append(grid);
    for (const [lbl, inp] of [['API URL', url], ['Secret key', key], ['Model', model]]) { const r = el('label', 'fld'); r.append(el('span', null, t(lbl)), inp); c.append(r); }
    c.append(dl);
    const sw = el('div', 'sc-row'), sl = el('div', 'sc-l'); sl.append(el('span', null, t('Enable server transcription')));
    const tg = el('button', `sw${st.enabled ? ' on' : ''}`); tg.type = 'button'; tg.innerHTML = '<i></i>'; tg.onclick = () => { st.enabled = !st.enabled; tg.classList.toggle('on', st.enabled); };
    sw.append(sl, tg); c.append(sw);
    const acts = el('div', 'sc-acts'), res = el('div', 'sc-res');
    const body = () => ({ provider: st.provider, base_url: url.value.trim(), model: model.value.trim(), api_key: key.value.trim() || undefined });
    const post = async (path, data) => (await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })).json();
    const test = el('button', 'btn ghost'); test.type = 'button'; test.innerHTML = `${IC.bolt}<span>${t('TEST CONNECTION')}</span>`;
    test.onclick = async () => { res.className = 'sc-res run'; res.textContent = '…'; const r = await post(api('/api/asr/test'), body()).catch((x) => ({ ok: false, error: x.message })); res.className = `sc-res ${r.ok ? 'ok' : 'bad'}`; res.textContent = r.ok ? `✓ ${r.engine} · ${r.ms} ms` : `✗ ${r.error}`; };
    const save = el('button', 'btn primary'); save.type = 'button'; save.innerHTML = `<span>${t('SAVE & APPLY')}</span>`;
    save.onclick = async () => { this.asr = await post(api('/api/asr/config'), { ...body(), enabled: st.enabled }); bus.emit('asr:changed'); this.renderBody(); bus.emit('toast', { text: this.asr.ready ? t('Server transcription ready') : t('Server transcription off') }); };
    acts.append(test, save); c.append(acts, res);
    fill();
    return c;
  }

  frameworkCard() {
    if (EMBEDDED) return this.managedCard('The agent, its framework and its tools', 'models');
    const f = this.frameworks?.(); if (!f?.list?.length) return null;
    const c = el('section', 'sc-card'); c.append(el('h4', null, t('AGENT FRAMEWORK')), el('p', 'sc-hint', t('agents = LLM research agent on the OpenAI Agents SDK (falls back to the offline assistant without an LLM); assistant = offline task-graph planner; Pi / Hermes = alternative agent loops.')));
    const g = el('div', 'seg');
    for (const x of f.list) { const b = el('button', x.name === f.current ? 'on' : '', x.name); b.type = 'button'; b.disabled = !x.available; b.title = x.reason || ''; b.onclick = () => { this.setFramework?.(x.name); for (const y of g.children) y.classList.toggle('on', y === b); }; g.append(b); }
    c.append(g); return c;
  }
  aboutSection() {
    const c = el('section', 'sc-card');
    c.append(el('h4', null, 'COMMAND//DECK v5.6'));
    const f = this.frameworks?.();
    const head = EMBEDDED
      ? [[t('Agent'), 'DeepSeek Harness'], [t('AI engine'), t('Managed by DeepSeek Harness')]]
      : [[t('Agent framework'), f?.current || '—'], [t('AI engine'), this.navSub('ai')]];
    for (const [k, v] of [...head, [t('Renderer'), document.body.dataset.perf || '—'], [t('Interface language'), settings.lang === 'zh' ? '中文' : 'English']]) {
      const r = el('div', 'sc-row'); r.append(el('div', 'sc-l', k), el('b', 'val', v)); c.append(r);
    }
    return [c, this.frameworkCard()].filter(Boolean);
  }
  privacyFacts() {
    const c = el('section', 'sc-card');
    c.append(el('h4', null, t('GUARANTEES')));
    const ul = el('ul', 'facts');
    for (const s of ['Camera frames are never drawn on the page and never uploaded — only 21 hand landmarks are used, on this device.',
      'Notes and reminders are stored only on this computer.', 'API keys stay on the local deck server; the page never receives them.',
      'Speech recognition uses the browser vendor’s service (Chrome / Edge).']) ul.append(el('li', null, t(s)));
    c.append(ul); return c;
  }
}
