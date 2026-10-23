// COMMAND//DECK v5 — bootstrap & wiring
//   inputs: text · continuous voice call · fingertip gestures · mouse/touch  (all in parallel, English / 中文)
//        └──► command() ──► understandCommand (deck control, local) ──► done
//                       └──► WebSocket ──► agent (intent → task graph → parallel tools) ──► events ──► agent FSM ─┐
//   voice call engine ──► call FSM ──────────────────────────────────────┴──► global statechart (top bar · KPI)
//   events ──► trace · result panels (docks) · mission HUD (KPI, plan strip, ticker)
//          ──► orbital scene (engine thrust, tool satellites, data streams globe → panel, bursts)
import { bus } from './core/bus.js';
import { t, lang, isZh, locale, applyI18n, setLang } from './core/i18n.js';
import { understandCommand } from './core/command.js';
import { TaskGraphView, intentText } from './cards/taskgraph.js';
import { FSM, RUNNING, CallFSM, CALL_LIVE } from './core/fsm.js';
import { Link } from './core/ws.js';
import { EMBEDDED, ParentLink, notifyHost, VIEW, exitDeck } from './core/host.js';
const PREVIEW = VIEW === 'preview';
import { settings, saveSettings, history, compactDashboard, save, DEFAULT_SETTINGS } from './core/store.js';
import { Space, TOOLS } from './space/space.js';
import { Rain } from './fx/rain.js';
import { FX } from './fx/fx.js';
import { sfx } from './fx/sound.js';
import { Deck, PRESETS } from './dock/dock.js';
import { roll, decode } from './fx/anim.js';
import { DepthRig } from './fx/depth.js';
import { THEMES, THEME_IDS, themeOf } from './core/themes.js';
import { TraceView } from './cards/trace.js';
import { SummaryView, ImagesView, MetricsView, TimelineView, SourcesView, TerminalView, AnalyticsView } from './cards/renderers.js';
import { Notifier } from './ui/notify.js';
import { Palette } from './ui/palette.js';
import { HistoryPanel, exportRun } from './ui/history.js';
import { SettingsConsole } from './ui/settings.js';
import { Lightbox } from './ui/lightbox.js';
import { HelpSystem, Tour } from './ui/help.js';
import { SHORTCUTS, GESTURES } from './ui/guide.js';
import { Welcome, EmptyState, Radial } from './ui/welcome.js';
import { VoiceCall } from './voice/call.js';
import { HandTracker } from './gesture/tracker.js';
import { GestureEngine } from './gesture/engine.js';
import { GestureRouter } from './gesture/router.js';
import { SkeletonLayer } from './gesture/skeleton.js';
import { Zoom } from './ui/zoom.js';
import { copyText } from './core/clipboard.js';
import { SessionsView } from './cards/sessions.js';

const $ = (id) => document.getElementById(id);
/** Top-bar status tile: short caption under the icon, the full status in the tooltip. */
const stat = (el, cap, full) => { el.querySelector('span').textContent = cap; el.title = full; el.setAttribute('aria-label', full); };
const fsm = new FSM();
const callFsm = new CallFSM();
const space = new Space($('stage'));
let rain = null;
if (!space.ok) { $('rain').hidden = false; rain = new Rain($('rain')); }      // graceful fallback without WebGL
const fx = new FX($('fx'));
const notifier = new Notifier();
const deck = new Deck(space, { count: 4 });
const depth = new DepthRig({ space, deck });                   // v5.4 parallax + glass sheen (fx/depth.js)
const lightbox = new Lightbox();
const call = new VoiceCall(callFsm);
const skel = new SkeletonLayer();
const radial = new Radial();
const zoom = new Zoom();
const tour = new Tour();

const views = deck.workspaces.map((ws) => {
  const c = (id) => ws.cards.get(id);
  return { sessions: new SessionsView(c('sessions')), taskgraph: new TaskGraphView(c('taskgraph')), trace: new TraceView(c('trace')), summary: new SummaryView(c('summary')), images: new ImagesView(c('images')), metrics: new MetricsView(c('metrics')),
           timeline: new TimelineView(c('timeline')), sources: new SourcesView(c('sources')), terminal: new TerminalView(c('terminal')), analytics: new AnalyticsView(c('analytics')) };
});
const V = () => views[deck.active];
// the DSH Session directory feeds every workspace's SESSIONS card (the list is global, the cards are not)
const sessionViews = views.map((v) => v.sessions);
const hostSessions = (rows, active) => { for (const v of sessionViews) v.set(rows, active); };
const RESULT_KEYS = ['summary', 'images', 'metrics', 'timeline', 'sources', 'analytics'];
const TOOL_CARD = { web_search: ['sources'], news_search: ['sources', 'timeline'], video_search: ['sources'], image_search: ['images'], image_download: ['images'], wiki_lookup: ['metrics'], fetch_page: ['summary', 'sources'],
  geocode: ['summary'], weather: ['summary', 'analytics'],
  // DeepSeek Harness tool families (embedded): each lands on the panel that shows its output best
  run_code: ['terminal'], workflow: ['taskgraph', 'terminal'], skill: ['taskgraph'], ask_user_question: ['summary'],
  job_list: ['terminal'], job_output: ['terminal'], job_kill: ['terminal'],
  spawn_teammate: ['taskgraph'], list_agents: ['taskgraph'], send_message: ['taskgraph'], wait_agent: ['taskgraph'],
  goal: ['taskgraph'], ralph: ['taskgraph'],
  // DeepSeek Harness tools (embedded mode)
  web_fetch: ['sources'], bash: ['terminal'], pwsh: ['terminal'], read: ['terminal'], write: ['terminal'], edit: ['terminal'], str_replace_editor: ['terminal'], glob: ['terminal'], grep: ['terminal'], todo_write: ['taskgraph'], present: ['summary'], read_image: ['images'], world_time: ['summary'], calculator: ['summary'], unit_convert: ['summary'], currency: ['summary'], memory: ['summary'], reminder: ['summary'] };
const SAMPLE = { en: 'find me images of the Cassini mission to Saturn', zh: '找几张卡西尼号探测土星的图片' };
const sampleTask = () => SAMPLE[lang()];

let run = null, pendingWs = null, lastPrompt = '', lastInterrupted = null, hello = null, sample = null, runT0 = 0, toolCount = 0;
const undoStack = [];

// ═══════════════════════════════ transport + offline notice
let offlineT = 0;
// standalone: the deck's own backend over WebSocket · embedded in DeepSeek Harness: the plugin bridge over postMessage (core/host.js)
const link = new (EMBEDDED ? ParentLink : Link)(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`, { onEvent: handle, onStatus: linkStatus });
link.onSessions = hostSessions;                        // embedded: DSH pushes its Session directory here
function linkStatus(s) {
  const chip = $('chip-net');
  chip.className = `chip stat ${s === 'open' ? 'on' : s === 'connecting' ? 'warn' : 'bad'}`;
  linkStatus.s = s;
  stat(chip, s === 'open' ? (link?.rtt != null ? `${link.rtt}ms` : t('LINK')) : s === 'connecting' ? '…' : t('OFF'),
    s === 'open' ? `${t(EMBEDDED ? 'DSH link / round-trip time' : 'Backend link / round-trip time')}: ${link?.rtt ?? '—'} ms` : t(s === 'connecting' ? 'LINKING' : 'OFFLINE'));
  // a pong only clears the banner it raised itself (backend lost); the browser's network-offline banner waits for 'online'
  if (s === 'open') { clearTimeout(offlineT); if (!$('offline').hidden && $('offline').dataset.kind === 'link') { $('offline').hidden = true; bus.emit('toast', { text: t('Back online') }); } }
  if (s === 'closed') {
    if (fsm.running) {
      fsm.dispatch('disconnect', { message: t(EMBEDDED ? 'DSH link lost' : 'backend link lost') });
      bus.emit('notify', { text: t(EMBEDDED ? 'Lost the link to DeepSeek Harness — run aborted' : 'Backend link lost — run aborted'), kind: 'err' });
    }
    run = null;
    clearTimeout(offlineT);
    offlineT = setTimeout(() => {
      $('offline').hidden = false; $('offline').dataset.kind = 'link';
      $('offline-msg').textContent = t(!navigator.onLine ? 'no network connection — reconnecting when back' : EMBEDDED ? 'DeepSeek Harness unreachable — reconnecting…' : 'backend unreachable — reconnecting…');
    }, 1500);
  }
}
$('offline-retry').onclick = () => { try { link.ws.close(); } catch { link.connect(); } };
addEventListener('offline', () => { $('offline').hidden = false; $('offline').dataset.kind = 'net'; $('offline-msg').textContent = t('no network connection — the deck still works locally, searches need the network'); });
addEventListener('online', () => { if ($('offline').dataset.kind === 'net') $('offline').hidden = true; bus.emit('toast', { text: t('Network back') }); });

function handle(ev) {
  const d = ev.data || {};
  const rep = !!ev.replay;                 // replayed history: same visuals, but no sound / history / notification churn
  if (ev.type === 'hello') return onHello(d);
  if (ev.type === 'pong' || ev.type === 'reset_ack') return;
  if (ev.type === 'replay_done') { run = null; fsm.dispatch('reset'); wsTabs(); return; }   // replayed history never leaves the deck live
  // session-level notes from the bridge ("following …", "this Session is gone") arrive outside any run
  if (ev.type === 'observation' && !run) { V().trace.push(ev); return }
  if (ev.type === 'session_open') {                       // one Session at a time: never blend two transcripts
    const v = V(), ws = deck.ws, id = String(d.sessionId || '');
    clearSample(deck.active);
    v.trace.clear(); v.terminal.reset(); v.taskgraph.reset();
    for (const k of RESULT_KEYS) v[k].reset();
    entities([]); places([], false); kpiReset(); planStrip([]);
    ws.data = { prompt: '', dashboard: null, sample: false };
    run = null; fsm.dispatch('reset');
    if (!d.fresh) {
      const short = id.replace(/^session-/, '').slice(0, 6);
      v.trace.sys(t('Following Session {id} — replaying its messages…', { id: short }));
      ticker(t('SESSION {id}', { id: short }));
    }
    wsTabs();
    return;
  }
  if (ev.type === 'framework') { hello = { ...hello, framework: d.framework, describe: d.describe }; modeChip(); return bus.emit('notify', { text: t('Framework → {f}', { f: d.framework }), kind: 'ok' }); }
  if (ev.type === 'agent_start') {
    run = { id: ev.run_id, ws: pendingWs ?? deck.active, prompt: d.prompt };
    pendingWs = null;
    const v = views[run.ws], ws = deck.workspaces[run.ws];
    clearSample(run.ws);
    for (const k of RESULT_KEYS) v[k].loading?.();
    ws.data = { prompt: d.prompt, dashboard: null };
    if (!rep) history.add({ id: ev.run_id, prompt: d.prompt, at: Date.now(), framework: `${d.framework}/${d.model}`, status: 'running' });
    bus.emit('history:changed');
    flowTo(run.ws, ['trace']); if (!rep) { fx.sweep(1); sfx.open(); }
    runT0 = performance.now(); toolCount = 0; kpiReset(); planStrip([]); entities([]); places([], false); ticker(t('TASK ACCEPTED · “{p}”', { p: d.prompt }));
    if (!rep && call.active && settings.ack) sfx.ack();          // an earcon, not speech: a spoken “On it” came back through the mic as a new command
    wsTabs();
  } else if (!run || ev.run_id !== run.id) {
    if (ev.type === 'error' && !ev.run_id) bus.emit('toast', { text: d.message, kind: 'err' });
    return;                                              // stale event from an abandoned run
  }
  const v = views[run.ws];
  v.trace.push(ev); v.terminal.push(ev); v.taskgraph.push(ev);
  if (run.ws === deck.active) hudEvent(ev);
  switch (ev.type) {
    case 'heartbeat': $('sb-state-sub').textContent = `${d.phase} · ${(d.elapsed_ms / 1000).toFixed(0)}s`; return;
    case 'tool_call_start': flowTo(run.ws, TOOL_CARD[d.tool] || ['terminal']); if (!rep) sfx.tool(); if (run.ws === deck.active) space.toolPulse(d.tool); break;
    case 'tool_call_result': if (!rep) sfx.toolDone(); flowTo(run.ws, ['analytics'], 900); break;
    case 'observation': if (d.dashboard) { render(v, d.dashboard, false); flowTo(run.ws, TOOL_CARD[d.source] || [], 900); if (run.ws === deck.active) kpiSet(d.dashboard.summary?.stats); } break;
    case 'plan': if (run.ws === deck.active) flowTo(run.ws, ['taskgraph'], 900); break;
    case 'final': {
      const ws = deck.workspaces[run.ws]; ws.data.dashboard = d.dashboard;
      const done = Promise.all([render(v, d.dashboard, true), v.summary.show(d.answer, d.stats, d.dashboard?.sources || [], d.dashboard?.widgets || []),
        ...RESULT_KEYS.map((k) => ws.cards.get(k).arrive())]);
      if (!rep) history.update(run.id, { status: 'done', answer: d.answer, stats: d.stats, dashboard: compactDashboard(d.dashboard) });
      bus.emit('history:changed');
      if (!rep) bus.emit('notify', { text: t('Done: “{p}” — {r} sources, {i} images', { p: run.prompt, r: d.stats?.results ?? 0, i: d.stats?.downloaded ?? 0 }), kind: 'ok' });
      if (run.ws === deck.active) { kpiSet(d.stats, true); ticker(t('MISSION COMPLETE · {r} sources · {i} images · {s} s', { r: d.stats?.results ?? 0, i: d.stats?.downloaded ?? 0, s: ((d.stats?.elapsed_ms || 0) / 1000).toFixed(1) })); }
      for (const w of d.dashboard?.widgets || []) if (w.kind === 'reminder') reminders.add(w);
      if (!rep) celebrate(run.ws);
      call.runEnded();
      if (!rep && (call.active || settings.tts)) call.speak(d.answer, { brief: true });
      fsm.dispatch('final', d);
      done.then(() => fsm.dispatch('render_complete'));          // event from the renderer, not a timer
      run = null; wsTabs();
      return;
    }
    case 'error':
      if (d.dashboard) render(v, d.dashboard, false);
      unskeleton(v);
      if (!v.summary.answer) v.summary.reset(`${t('RUN FAILED')} — ${d.message}`);
      history.update(run.id, { status: 'error' }); bus.emit('history:changed');
      bus.emit('toast', { text: `${t('Error')}: ${d.message}`, kind: 'err', action: d.retryable !== false ? t('RETRY') : null, run: () => command(lastPrompt, 'retry') });
      bus.emit('notify', { text: `${t('Error')}: ${d.message}`, kind: 'err' });
      sfx.error(); glitch(900); ticker(`${t('FAULT')} · ${d.message}`);
      call.runEnded();
      if (call.active) call.speak(t('Sorry, that failed. Say retry or give me a new instruction.'));
      fsm.dispatch('error', d); run = null; wsTabs();
      return;
    case 'interrupted':
      if (d.reason === 'superseded') {                   // replaced by a newer request (e.g. a voice amendment): quiet
        history.update(run.id, { status: 'superseded' }); bus.emit('history:changed');
        fsm.dispatch('interrupted', d); run = null; wsTabs(); return;
      }
      call.runEnded();
      lastInterrupted = run.prompt;
      unskeleton(v); ticker(t('INTERRUPTED · say “continue” or press Ctrl+Enter to re-run'));
      history.update(run.id, { status: 'interrupted' }); bus.emit('history:changed');
      bus.emit('notify', { text: t('Interrupted ({r}) — say “continue” or press Ctrl+Enter to re-run', { r: d.reason }), kind: 'warn' });
      fsm.dispatch('interrupted', d); run = null; wsTabs();
      return;
    case 'steered': run.prompt = d.prompt; bus.emit('toast', { text: t('Added to the running task: “{p}”', { p: d.text }) }); ticker(t('STEERED · {p}', { p: d.text })); break;
    case 'paused': bus.emit('toast', { text: t('Agent paused — say “continue”, press P or hold an open palm'), kind: 'warn' }); break;
    case 'resumed': bus.emit('toast', { text: t('Agent resumed') }); break;
    default: break;
  }
  fsm.dispatch(ev.type, d);
}
const unskeleton = (v) => { for (const k of RESULT_KEYS) if (v[k].card.body.querySelector('.skel')) v[k].reset(); };

function render(v, dash, final) {
  if (!dash) return Promise.resolve();
  if (!final) v.summary.progress(dash.summary?.stats, dash.widgets);
  const ws = deck.workspaces[views.indexOf(v)];
  if (views.indexOf(v) === deck.active && dash.places?.length) places(dash.places, true);
  if (dash.images?.length && ws.cards.get('images').s.closed) ws.cards.get('images').open();
  const p = [];
  if (dash.images?.length || final) p.push(v.images.update(dash.images));
  if (dash.metrics?.length || dash.facts?.length || dash.widgets?.length || final) p.push(v.metrics.update(dash.metrics, dash.facts, dash.widgets));
  if (dash.timeline?.length || final) p.push(v.timeline.update(dash.timeline));
  if (dash.sources?.length || final) p.push(v.sources.update(dash.sources, dash.videos));
  if (dash.charts) p.push(v.analytics.update(dash.charts));
  if (views.indexOf(v) === deck.active && (final || dash.entities?.length)) entities(dash.entities);
  if (final) for (const k of ['images', 'metrics', 'timeline', 'sources', 'analytics']) if (v[k].card.body.querySelector('.skel')) v[k].reset(k === 'images' && dash.widgets?.length && !dash.images?.length ? 'NOT NEEDED FOR THIS REQUEST' : undefined);
  return Promise.all(p);
}
function flowTo(wsIndex, cardIds, ms = 1400) {
  if (wsIndex !== deck.active) return;
  for (const id of cardIds) {
    const p0 = deck.card(id)?.anchor(); if (!p0) continue;
    const p = zoom.toLayout(p0.x, p0.y);
    space.flow(p, { ms });
    if (space.ok && !space.reduced) setTimeout(() => { const q = deck.card(id)?.anchor(); if (q) { fx.ripple(q.x, q.y, { max: 34, life: 520 }); fx.burst(q.x, q.y, 8, { speed: 2 }); } }, ms * 0.7);
  }
}
function celebrate(wsIndex) {
  sfx.complete();
  if (wsIndex === deck.active) { const p = deck.card('summary')?.anchor(); if (p) space.burst(p); for (const id of ['images', 'metrics', 'sources', 'timeline']) flowTo(wsIndex, [id], 1100); }
  document.body.classList.add('complete'); setTimeout(() => document.body.classList.remove('complete'), 1200);
}

// ═══════════════════════════════ sample first screen (a real recorded run, clearly badged)
async function loadSample(wsIndex = 0) {
  try { sample ||= await (await fetch('assets/sample/sample.json')).json(); } catch { return; }
  const v = views[wsIndex], ws = deck.workspaces[wsIndex];
  if (ws.data.dashboard && !ws.data.sample) return;               // never clobber real results
  render(v, sample.dashboard, true);
  v.summary.show(sample.answer, sample.stats, sample.dashboard.sources);
  v.trace.sys(t('SAMPLE — replay of a real run: “{p}”. Your first task replaces these results.', { p: sample.prompt }));
  for (const ev of sample.trace) { v.trace.push(ev); v.taskgraph.push(ev); }
  ws.data = { prompt: sample.prompt, dashboard: sample.dashboard, sample: true };
  if (wsIndex === deck.active) { kpiReset(); for (const ev of sample.trace) hudEvent(ev, true); kpiSet(sample.stats, true); ticker(t('SAMPLE · replay of a real run — “{p}”', { p: sample.prompt })); }
  for (const c of ws.cards.values()) if (!c.el.querySelector('.sample-badge') && c.id !== 'terminal') { const b = document.createElement('span'); b.className = 'sample-badge'; b.dataset.i18n = 'SAMPLE'; b.textContent = t('SAMPLE'); b.dataset.i18nTitle = 'Sample data from a recorded run — your first task replaces it'; b.title = t(b.dataset.i18nTitle); c.el.querySelector('.card-h .meta').before(b); }
  wsTabs();
}
function clearSample(wsIndex) {
  const ws = deck.workspaces[wsIndex];
  if (!ws.data.sample) return;
  ws.data.sample = false;
  for (const c of ws.cards.values()) c.el.querySelector('.sample-badge')?.remove();
  views[wsIndex].trace.clear();
  views[wsIndex].taskgraph.reset();
}

// ═══════════════════════════════ commands (text, voice, gesture, palette, radial)
function command(text, source = 'text') {
  text = (text || '').trim(); if (!text) return;
  welcome.hide();
  // 1) deck-control language (EN/中文) runs locally; 2) everything else is a task for the agent
  const local = source === 'retry' || source === 'history' ? null : understandCommand(text);
  if (source !== 'voice') V().trace.youFinal(text, { typed: true, note: source === 'text' ? '' : source });
  $('prompt').value = '';
  if (local && runLocal(local)) return;
  lastPrompt = text; pendingWs = deck.active;
  if (!link.open) bus.emit('toast', { text: t(EMBEDDED ? 'Linking to DeepSeek Harness — command queued' : 'Linking to backend — command queued'), kind: 'warn' });
  let tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { /* ignore */ }
  link.send({ type: 'run', prompt: text, lang: lang(), tz, home: settings.homeCity || '' });
}
/** Execute an understood deck-control command; returns false if it does not apply right now. */
function runLocal(c) {
  const card = (id) => deck.card(id), say = (msg) => { V().trace.local(`${t('understood')}: ${msg}`); bus.emit('toast', { text: `⌁ ${msg}` }); fx.ripple(innerWidth / 2, innerHeight - 50, { max: 70 }); };
  const A = {
    lang: () => { setLang(c.arg); say(c.arg === 'zh' ? '界面语言 → 中文' : 'UI language → English'); },
    open: () => { const k = card(c.arg); if (k.s.closed) k.open(); if (k.s.min) k.toggleMin(); k.focus(); k.arrive(); say(t('open {p}', { p: k.label })); },
    close: () => { card(c.arg).close(); say(t('close {p}', { p: card(c.arg).label })); },
    max: () => { const k = card(c.arg); if (k.s.closed) k.open(); if (!k.s.max) k.toggleMax(); say(t('{p} on the centre stage', { p: k.label })); },
    theme: () => { setTheme(c.arg); say(t('theme → {t}', { t: c.arg })); },
    resetLayout: () => { resetLayout(); say(t('layout reset')); },
    resetView: () => { deck.resetView(); say(t('globe view reset')); },
    layoutLock: () => { setLayoutLock(c.arg); say(t(c.arg ? 'layout locked' : 'layout unlocked')); },
    zoom: () => { deck.zoomBy(c.arg); say(t(c.arg > 1 ? 'zoom in' : 'zoom out')); },
    workspace: () => { deck.switchTo(c.arg, c.arg > deck.active ? 1 : -1); say(t('workspace {n}', { n: c.arg + 1 })); },
    workspaceStep: () => { deck.switchTo(deck.active + c.arg, c.arg); say(t('workspace {n}', { n: deck.active + 1 })); },
    interrupt: () => { agent.interrupt('command'); say(t('stop')); },
    pause: () => { agent.pause('command'); say(t('pause')); },
    resume: () => { if (fsm.state === 'paused') agent.resume(); else if (lastInterrupted && !fsm.running) { const p = lastInterrupted; lastInterrupted = null; command(p, 'retry'); } say(t('continue')); },
    clear: () => { clearCanvas(); say(t('results cleared')); },
    help: () => { help.toggle(c.arg); say(t('help')); },
    gestures: () => { if (c.arg !== gestureOn) toggleGestures(); say(t(c.arg ? 'gestures on' : 'gestures off')); },
    call: () => { if (c.arg !== call.active) call.toggle(); say(t(c.arg ? 'voice call' : 'hang up')); },
    history: () => { historyPanel.toggle(true); say(t('history')); },
    palette: () => { palette.show(); say(t('command palette')); },
    tour: () => { tour.start(); say(t('guided tour')); },
  };
  if (!A[c.action]) return false;
  A[c.action](); sfx.click?.();
  return true;
}
function setLayoutLock(on) { settings.layoutLock = !!on; saveSettings(); applySettings(); }
const agent = {
  pause: (reason = 'user') => { if (fsm.running && fsm.state !== 'paused') link.send({ type: 'pause', reason }); },
  resume: () => { if (fsm.state === 'paused') link.send({ type: 'resume' }); },
  interrupt: (reason = 'user') => { call.cancelSpeech(); if (fsm.running) link.send({ type: 'interrupt', reason }); },
  reset: () => { link.send({ type: 'reset' }); call.cancelSpeech(); run = null; fsm.dispatch('reset'); V().trace.sys(t('agent reset — state → idle, memory cleared')); wsTabs(); },
};
function clearCanvas() {
  const v = V(), snap = deck.ws.data.dashboard, summary = v.summary.answer;
  for (const k of RESULT_KEYS) v[k].reset();
  v.trace.clear(); v.terminal.reset(); v.taskgraph.reset(); entities([]); places([], false);
  bus.emit('toast', { text: t('Canvas cleared'), kind: 'warn', action: t('UNDO'), run: () => { if (snap) { render(v, snap, true); if (summary) v.summary.show(summary, snap.summary?.stats, snap.sources, snap.widgets); } } });
}
bus.on('cmd:retry', () => command(lastPrompt, 'retry'));

// ═══════════════════════════════ global statechart → UI
function stateUI() {
  const a = fsm.state, c = callFsm.state;
  document.body.dataset.state = a; document.body.dataset.call = c;
  $('sb-state-label').textContent = t(a.replace('_', ' ').toUpperCase()) + (CALL_LIVE.has(c) ? ` · ${t(c.replace('_', ' ').toUpperCase())}` : '');
  $('kpi-state').textContent = CALL_LIVE.has(c) && ['idle', 'done'].includes(a) && c !== 'listening' ? t(c.replace('_', ' ').toUpperCase()) : t(HERO[a] || a.toUpperCase());
  welcome.setStates(a, c);
}
fsm.on(({ to, event, ctx }) => {
  stateUI();
  $('sb-state-sub').textContent = { tool_running: ctx.detail, error: ctx.detail, paused: ctx.detail, interrupted: ctx.detail, thinking: t('reasoning…'), rendering: t('rendering results…'), done: t('results ready') }[to] || '';
  $('btn-stop').disabled = !RUNNING.has(to);
  $('btn-pause').disabled = !RUNNING.has(to);
  $('btn-pause').textContent = t(to === 'paused' ? 'RESUME' : 'PAUSE');
  space.setAgentState(to); rain?.setState(to);
  if (to === 'error') glitch(700);
  if (event === 'render_complete') fx.sweep(1);
});
const HERO = { idle: 'STANDBY', thinking: 'THINKING', tool_running: 'TOOLS ACTIVE', paused: 'PAUSED', rendering: 'RENDERING', done: 'COMPLETE', error: 'FAULT', interrupted: 'INTERRUPTED' };
function glitch(ms) { if (settings.glitch <= 0) return; document.body.classList.add('glitching'); clearTimeout(glitch.t); glitch.t = setTimeout(() => document.body.classList.remove('glitching'), ms * settings.glitch); }

// ═══════════════════════════════ status bar
function onHello(d) {
  hello = d; modeChip();
  views[deck.active].trace.sys(t('linked · {f} ({m}) · tools: {tools}', { f: d.framework, m: d.describe?.mode, tools: (d.tools || []).filter((x) => x.name).map((x) => x.name).join(', ') || '—' }));
}
function modeChip() {
  const m = hello?.describe; if (!m) return;
  const offline = m.mode === 'offline-planner' || m.mode === 'assistant';
  $('chip-mode').textContent = `· ${hello.framework?.toUpperCase()} · ${offline ? t(m.mode === 'assistant' ? 'TASK GRAPH · OFFLINE NLU' : 'OFFLINE PLANNER') : m.model}`;
  $('chip-mode').title = offline ? t('No LLM key: the deck understands requests with its bilingual grammar and still really searches. Set LLM_API_KEY for an LLM.') : `${m.label} · ${m.model}`;
}
function wsTabs() {
  $('sb-ws').replaceChildren(...deck.workspaces.map((w, i) => {
    const b = document.createElement('button'); b.textContent = `0${i + 1}`;
    b.className = `${i === deck.active ? 'on' : ''}${run?.ws === i ? ' busy' : ''}${w.data.dashboard ? ' has' : ''}`;
    b.title = w.data.prompt ? `${t('workspace {n}', { n: i + 1 })}: ${w.data.prompt}` : t('workspace {n}', { n: i + 1 });
    b.onclick = () => deck.switchTo(i, i > deck.active ? 1 : -1);
    return b;
  }));
}
bus.on('ws:switch', ({ index }) => {
  // embedded: the transcript lives in the DSH bridge, not per view — ask it to replay into this one
  if (EMBEDDED) setTimeout(() => notifyHost('resync', {}), 60);
  wsTabs(); sfx.whoosh(); bus.emit('toast', { text: `${t('workspace {n}', { n: index + 1 })}${deck.ws.data.prompt ? ` — “${deck.ws.data.prompt}”` : ''}` });
  const d = deck.ws.data; kpiReset(); planStrip([]); entities(d.dashboard?.entities || []); places(d.dashboard?.places || [], false); if (d.dashboard) kpiSet(d.dashboard.summary?.stats || (d.sample ? sample?.stats : null), true);
  ticker(d.prompt ? `${t('WORKSPACE')} 0${index + 1} · “${d.prompt}”` : `${t('WORKSPACE')} 0${index + 1} · ${t('EMPTY · AWAITING COMMAND')}`);
});
function privacyChip() { const hid = settings.privacy === 'hidden'; stat($('chip-privacy'), hid ? t('HIDDEN') : t('SKEL'), `${t(hid ? 'CAM · HAND HIDDEN' : 'CAM · SKELETON ONLY')} — ${t('Privacy: camera frames are never drawn or uploaded')}`); $('chip-privacy').className = 'chip stat on'; }
$('chip-privacy').onclick = () => {
  settings.privacy = settings.privacy === 'hidden' ? 'skeleton' : 'hidden'; saveSettings(); privacyChip();
  bus.emit('toast', { text: t(settings.privacy === 'hidden' ? 'Hand skeleton fully hidden (fingertip pointer stays)' : 'Skeleton view: 21 landmarks only, never camera pixels') });
};
$('chip-lang').onclick = () => setLang(isZh() ? 'en' : 'zh');
// full screen (button · Shift+F); the icon flips with the state
function toggleFull() { if (document.fullscreenElement) document.exitFullscreen?.(); else document.documentElement.requestFullscreen?.().catch((e) => bus.emit('toast', { text: `${t('Full screen unavailable')}: ${e.message}`, kind: 'warn' })); }
$('btn-full').onclick = toggleFull;
document.addEventListener('fullscreenchange', () => { const on = !!document.fullscreenElement; $('btn-full').classList.toggle('on', on); $('btn-full').title = t(on ? 'Exit full screen (Shift+F · Esc)' : 'Full screen (Shift+F)'); });
// embedded in DSH: the top bar offers a way out — close the deck panel, hand the screen back to the harness
if (EMBEDDED) {
  const exitBtn = $('btn-exit');
  if (exitBtn) {
    exitBtn.hidden = false;
    exitBtn.onclick = () => { try { sfx.whoosh(); } catch { /* silent in the console preview */ } exitDeck(); };
  }
}
$('btn-lock').onclick = () => { setLayoutLock(!settings.layoutLock); bus.emit('toast', { text: t(settings.layoutLock ? 'Layout locked — gestures and drags can’t move panels' : 'Layout unlocked') }); };
$('sb-state').onclick = () => { if (fsm.state === 'error') fsm.dispatch('dismiss'); };
$('sb-logo').onclick = () => welcome.show();
function perfChip() {
  const c = $('chip-perf'), fps = Math.round(space.fps);
  stat(c, `${fps}`, `${t('Performance mode')}: ${t(space.tier.toUpperCase())}${space.autoPerf ? ` (${t('AUTO')})` : ''} · ${fps} FPS`);
  c.className = `chip stat perf ${fps >= 45 ? 'on' : fps >= 24 ? 'warn' : 'bad'}`; c.dataset.tier = space.tier[0].toUpperCase(); $('ro-fps').textContent = fps;
}
setInterval(perfChip, 1000);
$('chip-perf').onclick = () => help.toggle('settings');
space.onAutoTier = (tier, up) => bus.emit('toast', up ? { text: t('Performance mode → {t} (frame rate has headroom)', { t: t(tier) }) } : { text: t('Performance mode → {t} (frame rate was low)', { t: t(tier) }), kind: 'warn' });

// ═══════════════════════════════ voice call (full duplex, VAD-segmented, barge-in)
call.busy = () => fsm.running;
let callTimer = 0;
const whoLine = (who, text, color) => { const s = document.createElement('span'); s.className = 'who-tag'; if (color) s.style.color = color; s.textContent = who; $('cd-line').replaceChildren(s, text); };
callFsm.on((e) => callUI(e));
function callUI({ to, from }) {
  stateUI();
  const live = CALL_LIVE.has(to);
  $('call-dock').hidden = to === 'off';
  $('btn-call').classList.toggle('on', live || to === 'connecting');
  $('btn-call').textContent = `☎ ${t(live || to === 'connecting' ? 'HANG UP' : 'CALL')}`;
  const chip = $('chip-call');
  chip.className = `chip stat ${to === 'user_speaking' ? 'live' : to === 'agent_speaking' ? 'warn' : live ? 'on' : ''}`;
  stat(chip, to === 'off' ? t('OFF') : { listening: t('LIVE'), user_speaking: t('YOU'), agent_speaking: 'DECK', muted: t('MUTE'), connecting: '…', interrupted: t('LIVE'), ended: t('END') }[to] || t('LIVE'),
    to === 'off' ? `${t('CALL OFF')} — ${t('Voice call (C)')}` : `${t('CALL')} · ${t(to.replace('_', ' ').toUpperCase())}`);
  $('cd-state').textContent = t({ connecting: 'CONNECTING…', listening: 'IN CALL · LISTENING', user_speaking: 'IN CALL · YOU', agent_speaking: 'IN CALL · DECK', interrupted: 'INTERRUPTED', muted: 'MUTED', ended: 'CALL ENDED' }[to] || to.toUpperCase());
  $('who-you').classList.toggle('on', to === 'user_speaking' || to === 'interrupted');
  $('who-deck').classList.toggle('on', to === 'agent_speaking');
  $('cd-mute').classList.toggle('on', to === 'muted'); $('cd-mute').textContent = t(to === 'muted' ? 'UNMUTE' : 'MUTE');
  $('voice-line').textContent = live ? t({ listening: '◉ in call — just talk', user_speaking: '◉ hearing you…', agent_speaking: '◈ DECK speaking — talk to interrupt', interrupted: '■ interrupted — listening', muted: '◌ muted' }[to] || '') : '';
  if (to === 'interrupted' && from === 'agent_speaking') sfx.barge();
  if (to === 'interrupted') setTimeout(() => { if (callFsm.state === 'interrupted' && !call.inSpeech) callFsm.dispatch('settle'); }, 1200);
}
bus.on('call:started', ({ engine, oneshot } = {}) => {
  sfx.callStart();
  $('btn-talk').classList.toggle('on', !!oneshot);
  if (oneshot) bus.emit('toast', { text: t('Listening — say one instruction ({e})', { e: engine === 'server' ? t('server transcription') : t('browser recognition') }) });
  else bus.emit('notify', { text: t('Voice call connected — talk any time, say “hang up” to end'), kind: 'ok' });
  clearInterval(callTimer);
  callTimer = setInterval(() => { const s = Math.floor((performance.now() - call.t0) / 1000); $('cd-timer').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }, 250);
  $('cd-line').textContent = t('Listening — just start talking.');
  welcome.hide();
});
bus.on('call:ended', ({ reason, secs }) => {
  clearInterval(callTimer); sfx.callEnd(); $('btn-talk').classList.remove('on');
  if (reason === 'done') return;                                          // one-shot TALK finished normally
  const tm = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  bus.emit('toast', { text: reason === 'idle' ? t('Call hung up after {s}s of silence · {d}', { s: settings.callIdle, d: tm }) : t('Call ended · {d}', { d: tm }), kind: reason === 'idle' ? 'warn' : '' });
  if (reason === 'idle') bus.emit('notify', { text: t('Voice call auto-ended (idle timeout). Press C to call again.'), kind: 'warn' });
});
bus.on('call:idle_warning', () => bus.emit('toast', { text: t('Still there? The call hangs up soon if it stays quiet.'), kind: 'warn' }));
bus.on('call:interim', (t) => { if (t) { V().trace.youLive(t); whoLine('YOU', t); } });
bus.on('call:noise', () => { const m = $('cd-meter'); m?.classList.remove('flash'); void m?.offsetWidth; m?.classList.add('flash'); });
bus.on('call:utterance', ({ text, echo, empty, control, noise, wake, woke, amend }) => {
  if (empty) { V().trace.youFinal(''); return; }
  V().trace.youFinal(text, { note: echo ? t('ignored: echo of DECK') : noise ? t('ignored: noise / filler') : wake ? t('ignored: no wake word') : woke ? t('listening for your instruction…') : control ? `${t('control')}: ${control}` : amend ? t('continued request') : '' });
});
bus.on('call:command', ({ text, amend, added }) => {
  fx.ripple(innerWidth / 2, innerHeight - 50, { max: 90 });
  // amendment while the agent works: Pi takes it mid-run (steering); other frameworks restart with the whole request
  if (amend && fsm.running && link.open) { link.send({ type: 'steer', text: added, prompt: text, lang: lang() }); return; }
  if (amend) bus.emit('toast', { text: t('Continued — running the whole request') });
  command(text, 'voice');
});
// end-of-turn hold: the call dock shows a draining ring while the deck waits to be sure you have finished
bus.on('call:holding', ({ ms }) => {
  const d = $('call-dock'); d.classList.toggle('holding', ms > 0);
  if (ms > 0) { d.style.setProperty('--hold', `${ms}ms`); const r = d.querySelector('.cd-hold'); r?.classList.remove('run'); void r?.offsetWidth; r?.classList.add('run'); }
});
bus.on('call:control', ({ action }) => {
  if (action === 'resume' && fsm.state !== 'paused') {
    if (lastInterrupted && !fsm.running) { const p = lastInterrupted; lastInterrupted = null; command(p, 'voice'); }
    return;
  }
  ({ hangup: () => call.hangup('user'), interrupt: () => agent.interrupt('voice'), pause: () => agent.pause('voice'), resume: () => agent.resume(), reset: () => agent.reset(), clear: () => clearCanvas() })[action]?.();
  bus.emit('toast', { text: `${t('Voice')}: ${t(action)}` });
});
bus.on('call:agent_start', (text) => { V().trace.say(text); whoLine('DECK', text.slice(0, 140), 'var(--accent2)'); });
bus.on('call:barge', () => bus.emit('toast', { text: t('Barge-in — DECK stopped talking, listening') }));
bus.on('voice:speak', (t) => call.speak(t));
$('btn-call').onclick = () => call.toggle();
$('btn-talk').onclick = () => call.talkOnce();
bus.on('settings:open', (tab) => settingsConsole.show(tab));
bus.on('call:asr', ({ ms, engine }) => { $('voice-line').textContent = `✓ ${engine} · ${ms} ms`; });
$('chip-call').onclick = () => call.toggle();
$('cd-hang').onclick = () => call.hangup('user');
$('cd-mute').onclick = () => call.setMuted(!call.muted);

// ═══════════════════════════════ gestures (fingertip pointer)
const tracker = new HandTracker();
const router = new GestureRouter({
  deck, fx, skel, space, zoom,
  act: {
    resetLayout: () => resetLayout(),
    isRunning: () => fsm.running, isPaused: () => fsm.state === 'paused', pause: agent.pause, resume: agent.resume,
    palette: () => palette.show(), lightboxOpen: () => lightbox.openNow, lightbox: (d) => lightbox.go(d), metrics: () => V().metrics,
    clearCanvas, closeOverlays, radial: (x, y, card) => openRadial(x, y, card || null), radialOpen: () => radial.open,
  },
});
skel.map = (p) => engine.toScreenRaw(p);           // skeleton shares the pointer mapping
const engine = new GestureEngine((type, e) => {
  if (type === 'RECENTERED') { skel.show(t('RE-CENTRED'), t('pointer region centred on your hand'), 1, true); return; }
  router.handle(type, e);
});
let gestureOn = false, lastGesture = '';
bus.on('gesture:fired', ({ name }) => { lastGesture = name; gestureChip(); if (/PINCH|TAP|LIFT|捏|抓/.test(name)) sfx.pinch(); });
function gestureChip(state) {
  const c = $('chip-gesture');
  if (state) c.dataset.state = state;
  const s = c.dataset.state || 'off';
  c.className = `chip stat ${s === 'tracking' ? (settings.gLocked ? 'warn' : 'on') : s === 'loading' ? 'warn' : ''}`;
  stat(c, s === 'off' ? t('OFF') : s === 'loading' ? '…' : t(settings.gLocked ? 'LOCK' : 'ON'),
    s === 'off' ? `${t('GESTURE OFF')} — ${t('Hand gestures (H)')}` : s === 'loading' ? t('LOADING MODEL') : `${t(settings.gLocked ? 'LOCKED' : 'GESTURE')}${lastGesture ? ' · ' + lastGesture : ''}`);
}
function onHands(hands, t) { const out = engine.feed(hands, t ?? performance.now()); skel.draw(out); const h = out.find((o) => o.hand === 0); if (h) depth.point(h.x, h.y); }
async function toggleGestures() {
  if (gestureOn) { await tracker.stop(); gestureOn = false; skel.hideAll(); gestureChip('off'); $('gesture-legend').hidden = true; bus.emit('toast', { text: t('Gestures off — camera released') }); return; }
  if (!(await consent())) return;
  gestureChip('loading'); welcome.hide();
  try {
    await tracker.start((hands) => onHands(hands), (e) => console.warn('tracker', e));
    gestureOn = true; gestureChip('tracking'); engine.recenter(); gestureLegend();
    const audit = HandTracker.privacyAudit();
    bus.emit('notify', { text: t('Gestures on · on-device · video elements in page: {n} · frames uploaded: 0', { n: audit.videoElementsInDom }), kind: 'ok' });
  } catch (e) {
    gestureChip('off'); await tracker.stop();
    bus.emit('toast', { text: `${t('Hand tracking unavailable')}: ${e.name === 'NotAllowedError' ? t('camera permission denied') : e.message}`, kind: 'err' });
  }
}
function consent() {
  if (sessionStorage.getItem('cmddeck.cam')) return Promise.resolve(true);
  const m = $('consent'); m.innerHTML = '';
  const box = document.createElement('div'); box.className = 'modal-box';
  box.innerHTML = `<div class="box-h"></div><div class="consent-box"><p></p><div class="row"><button class="cb-btn run" id="c-yes"></button><button class="cb-btn" id="c-no"></button></div></div>`;
  box.querySelector('.box-h').textContent = t('ENABLE HAND GESTURES?');
  box.querySelector('p').textContent = t('The camera is used only for hand-skeleton tracking, on this device (MediaPipe). Video frames are never drawn on the page and never uploaded — only 21 landmark points per hand are used. Your index fingertip becomes the pointer.');
  box.querySelector('#c-yes').textContent = t('ALLOW CAMERA'); box.querySelector('#c-no').textContent = t('NOT NOW');
  m.append(box); m.hidden = false;
  return new Promise((res) => {
    const done = (ok) => { m.hidden = true; if (ok) sessionStorage.setItem('cmddeck.cam', '1'); res(ok); };
    box.querySelector('#c-yes').onclick = () => done(true);
    box.querySelector('#c-no').onclick = () => done(false);
  });
}
$('chip-gesture').onclick = toggleGestures;
function gestureLegend() {
  const box = $('gesture-legend');
  box.replaceChildren(...GESTURES.filter((g) => g[3]).map(([n, , fx2]) => { const r = document.createElement('div'); const b = document.createElement('b'); b.textContent = t(n); r.append(b, t(fx2).split(/[.—;。；]/)[0]); return r; }));
  box.hidden = false; gestureLegend.on = true;
}
function closeOverlays() {
  let closed = false;
  if (radial.open) { radial.close(); closed = true; }
  if (tour.open) { tour.end?.(); closed = true; }
  for (const p of [palette, lightbox]) if (p.open === true || p.openNow) { p.close(); closed = true; }
  for (const id of ['drawer-history', 'drawer-notify', 'reset-menu']) if (!$(id).hidden) { $(id).hidden = true; closed = true; }
  if (!$('confirm').hidden) { $('confirm').querySelector('#cf-no')?.click(); closed = true; }
  if (!$('consent').hidden) { $('consent').querySelector('#c-no')?.click(); closed = true; }
  if (welcome.open) { welcome.hide(); closed = true; }
  if (!closed) { const mx = [...deck.ws.cards.values()].find((c) => c.s.max); if (mx) { mx.toggleMax(); closed = true; } }
  if (!closed && zoom.active) { zoom.reset(); closed = true; }
  if (!closed && help.closeTop()) closed = true;
  return closed;
}

// ═══════════════════════════════ radial menu (right-click · long-press · pinch-hold on empty space)
function openRadial(x, y, card) {
  sfx.open(); if (palette.open) palette.close();
  if (card) {
    const lock = settings.layoutLock;
    radial.show(x, y, card.label, [
      { icon: '◎', label: t(card.s.max ? 'TO DOCK' : 'CENTRE STAGE'), run: () => card.toggleMax() }, { icon: '▁', label: t(card.s.min ? 'EXPAND' : 'COLLAPSE'), run: () => card.toggleMin() },
      ...(lock ? [] : [{ icon: '◧', label: t('LEFT DOCK'), run: () => deck.dockAt(card, 'left', 0) }, { icon: '◨', label: t('RIGHT DOCK'), run: () => deck.dockAt(card, 'right', 0) },
        { icon: '⬓', label: t('BOTTOM DOCK'), run: () => deck.dockAt(card, 'bottom', 0) }, { icon: '⤢', label: t('GROW'), run: () => card.scaleTo(1.3) }]),
      { icon: '⧉', label: t('COPY'), run: () => bus.emit('card:copy', card) }, { icon: '✕', label: t('CLOSE'), run: () => card.close() },
    ]);
  } else {
    radial.show(x, y, 'DECK', [
      { icon: '⌘', label: t('PALETTE'), run: () => palette.show() }, { icon: '▶', label: t('SAMPLE'), run: () => command(sampleTask(), 'radial') },
      { icon: '☎', label: t(call.active ? 'HANG UP' : 'CALL'), run: () => call.toggle() }, { icon: '⊕', label: t('RESET VIEW'), run: () => deck.resetView() },
      { icon: '⟲', label: t('RESET LAYOUT'), run: () => resetLayout() }, { icon: '‖', label: t(fsm.state === 'paused' ? 'RESUME' : 'PAUSE'), run: () => (fsm.state === 'paused' ? agent.resume() : agent.pause('radial')) },
      { icon: '文', label: isZh() ? 'ENGLISH' : '中文', run: () => setLang(isZh() ? 'en' : 'zh') }, { icon: '?', label: t('HELP'), run: () => help.toggle('gestures') },
    ]);
  }
}
bus.on('radial:open', ({ x, y, card }) => openRadial(x, y, card));

// ═══════════════════════════════ help system, welcome, empty state, tour
const settingsConsole = new SettingsConsole({
  frameworks: () => ({ list: hello?.frameworks || [], current: hello?.framework }),
  setFramework: (name) => link.send({ type: 'set_framework', name }),
  // AI engine changed → the agent re-describes itself (mode chip) on the next framework handshake
  onLLM: (cfg, changed) => { llmCfg = cfg; aiChip(); if (changed && hello?.framework) link.send({ type: 'set_framework', name: hello.framework }); },
});
let llmCfg = null;
function aiChip() {
  const c = $('chip-ai');
  if (EMBEDDED) {                                   // the model belongs to DSH: show that, and send the click there
    c.className = 'chip stat ai on';
    stat(c, 'DSH', `${t('Managed by DeepSeek Harness')} — ${t('AI engine — click to configure')}`);
    return;
  }
  const a = llmCfg?.active, on = a && a.source !== 'none';
  c.className = `chip stat ai ${on ? 'on' : ''}`;
  stat(c, on ? String(a.model).split(/[:/]/).pop().replace(/-(chat|instruct)$/, '').slice(0, 9) : t('OFF'), on ? `AI · ${a.model} — ${t('AI engine — click to configure')}` : `${t('AI · OFFLINE')} — ${t('AI engine — click to configure')}`);
}
$('chip-ai').onclick = () => (EMBEDDED ? notifyHost('open_dsh', { target: 'models' }) : settingsConsole.show('ai'));
bus.on('lang:changed', aiChip);
const help = new HelpSystem({
  settingsPanel: settingsConsole,
  onTour: () => tour.start(),
});
bus.on('lang:toggle', () => setLang(isZh() ? 'en' : 'zh'));
const welcome = new Welcome({ sampleText: () => sampleTask(), onSample: EMBEDDED ? null : () => command(sampleTask(), 'sample'), onCall: () => call.start(), onGestures: () => toggleGestures(), onType: () => setTimeout(() => $('prompt').focus(), 300) });
new EmptyState({ onRestore: () => resetLayout(), onOpen: () => palette.show(isZh() ? '打开' : 'Open '), onSample: EMBEDDED ? null : () => command(sampleTask(), 'sample') });
// first-run onboarding: starts once, after the welcome screen is dismissed; afterwards only via the ◎ icon / palette
let tourShown = false;
new MutationObserver(() => { if ($('welcome').hidden && !tour.done && !tourShown) { tourShown = true; setTimeout(() => tour.start(), 500); } })
  .observe($('welcome'), { attributes: true, attributeFilter: ['hidden'] });

// ═══════════════════════════════ UI reset (two levels, confirm + undo)
function confirmBox(title, text, okLabel) {
  const m = $('confirm'); m.innerHTML = '';
  const box = document.createElement('div'); box.className = 'modal-box confirm';
  box.innerHTML = `<div class="box-h"></div><div class="confirm-body"><p></p><div class="row"><button class="ghost" id="cf-no">CANCEL</button><button class="danger" id="cf-yes"></button></div></div>`;
  box.querySelector('.box-h').textContent = title; box.querySelector('p').textContent = text; box.querySelector('#cf-yes').textContent = okLabel;
  m.append(box); m.hidden = false; setTimeout(() => box.querySelector('#cf-no').focus(), 30);
  return new Promise((res) => { box.querySelector('#cf-yes').onclick = () => { m.hidden = true; res(true); }; box.querySelector('#cf-no').onclick = () => { m.hidden = true; res(false); }; });
}
function resetLayout() {
  const snap = deck.snapshotAll();
  closeOverlays(); help.closeAll();
  deck.resetLayout();
  sfx.reset(); fx.sweep(1);
  const undo = () => deck.restoreAll(snap);
  undoStack.push(undo);
  bus.emit('toast', { text: t('Layout reset to default'), kind: 'warn', action: t('UNDO'), run: () => { undoStack.splice(undoStack.indexOf(undo), 1); undo(); } });
}
async function resetEverything() {
  if (!(await confirmBox(t('RESET EVERYTHING?'), t('Restores the default layout on every workspace, clears results, notifications and temporary state, resets settings, stops the agent, hangs up the call and turns gestures off. Task history and favorites are kept. You can undo for a few seconds.'), t('RESET EVERYTHING')))) return;
  const snap = deck.snapshotAll(), oldSettings = { ...settings }, dash = deck.workspaces.map((w, i) => ({ data: { ...w.data }, answer: views[i].summary.answer }));
  agent.reset(); if (call.active) call.hangup('reset'); if (gestureOn) await toggleGestures();
  closeOverlays(); help.closeAll(); notifier.items = []; notifier.unread = 0; $('notify-count').hidden = true;
  const keepLang = settings.lang;
  Object.assign(settings, DEFAULT_SETTINGS, { lang: keepLang }); saveSettings(); applySettings();
  views.forEach((v) => { for (const k of RESULT_KEYS) v[k].reset(); v.trace.clear(); v.terminal.reset(); v.taskgraph.reset(); }); entities([]); places([], false);
  deck.workspaces.forEach((w) => { w.data = { prompt: '', dashboard: null, sample: false }; });
  if (deck.active) deck.switchTo(0);
  deck.resetLayout();
  if (!EMBEDDED) loadSample(0); wsTabs(); callFsm.dispatch('reset'); fsm.dispatch('reset');
  sfx.reset(); fx.sweep(-1);
  const undo = () => {
    Object.assign(settings, oldSettings); saveSettings(); applySettings(); deck.restoreAll(snap);
    dash.forEach((d, i) => {
      clearSample(i); deck.workspaces[i].data = d.data;
      if (d.data.dashboard) { render(views[i], d.data.dashboard, true); if (d.answer) views[i].summary.show(d.answer, d.data.dashboard.summary?.stats, d.data.dashboard.sources, d.data.dashboard.widgets); }
      if (d.data.sample) loadSample(i);
    });
    wsTabs();
  };
  undoStack.push(undo);
  bus.emit('toast', { text: t('Everything reset (history & favorites kept)'), kind: 'warn', action: t('UNDO'), ms: 8000, run: () => { undoStack.splice(undoStack.indexOf(undo), 1); undo(); } });
}
$('btn-reset-ui').onclick = (e) => { e.stopPropagation(); $('reset-menu').hidden = !$('reset-menu').hidden; };
$('reset-menu').onclick = (e) => { const b = e.target.closest('[data-reset]'); if (!b) return; $('reset-menu').hidden = true; b.dataset.reset === 'all' ? resetEverything() : resetLayout(); };
document.addEventListener('pointerdown', (e) => { if (!e.target.closest('.menu-wrap')) $('reset-menu').hidden = true; });

// ═══════════════════════════════ history / export / undo
const historyPanel = new HistoryPanel({ onRerun: (p) => command(p, 'history'), onRestore: restore });
function restore(entry) {
  const v = V(); clearSample(deck.active);
  for (const k of RESULT_KEYS) v[k].reset();
  render(v, entry.dashboard, true); if (entry.answer) v.summary.show(entry.answer, entry.stats, entry.dashboard?.sources || [], entry.dashboard?.widgets || []);
  deck.ws.data = { prompt: entry.prompt, dashboard: entry.dashboard };
  v.trace.sys(t('restored “{p}” from history ({d})', { p: entry.prompt, d: new Date(entry.at).toLocaleString(locale()) }));
  welcome.hide(); wsTabs();
}
bus.on('history:favorite-current', () => {
  const it = history.items.find((x) => x.prompt === deck.ws.data.prompt);
  if (it) { history.update(it.id, { favorite: true }); bus.emit('toast', { text: t('★ Added to favorites') }); bus.emit('history:changed'); }
  else bus.emit('toast', { text: t('Sample results can’t be favorited — run a task first'), kind: 'warn' });
});
bus.on('export:current', (fmt) => {
  const it = history.items.find((x) => x.prompt === deck.ws.data.prompt);
  if (it) exportRun(it, fmt);
  else if (deck.ws.data.dashboard) exportRun({ id: 'current', prompt: deck.ws.data.prompt, at: Date.now(), answer: V().summary.answer, dashboard: deck.ws.data.dashboard }, fmt);
  else bus.emit('toast', { text: t('Nothing to export yet'), kind: 'warn' });
});
bus.on('card:copy', (card) => { copyText(card.body.innerText).then((ok) => bus.emit('toast', ok ? { text: t('{title} copied', { title: card.label }) } : { text: t('Clipboard unavailable'), kind: 'warn' })); });
bus.on('card:export', (card) => {
  const d = deck.ws.data.dashboard || {}, key = RESULT_KEYS.includes(card.id) ? card.id : null;
  const blob = new Blob([JSON.stringify(key ? d[key] : { text: card.body.innerText }, null, 2)], { type: 'application/json' });
  Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${card.id}.json` }).click();
});
function undo() {
  const fn = undoStack.pop(); if (fn) { fn(); bus.emit('toast', { text: t('Undone') }); return; }
  const c = deck.closed.pop(); if (c) { c.open(); bus.emit('toast', { text: t('{title} reopened', { title: c.label }) }); } else bus.emit('toast', { text: t('Nothing to undo'), kind: 'warn' });
}

// ═══════════════════════════════ command palette: every feature in one place
const palette = new Palette(() => {
  const C = [], add = (group, label, run, key) => C.push({ group: t(group), label, run, key });
  const tog = (on, a, b) => t(on ? a : b);
  if (!EMBEDDED) add('TASK', t('Run sample task'), () => command(sampleTask(), 'palette'), 'S');   // DSH has no canned task
  add('TASK', t('Retry last command'), () => command(lastPrompt, 'retry'), 'Ctrl+Enter');
  for (const q of SUGGEST[lang()]) add('TASK', `${t('Ask')}: ${q}`, () => command(q, 'palette'));
  if (!EMBEDDED) {                                                                            // DSH has no paused turn
    add('AGENT', t('Pause agent'), () => agent.pause(), 'P'); add('AGENT', t('Resume agent'), agent.resume, 'P');
  }
  add('AGENT', t('Interrupt agent'), () => agent.interrupt(), 'Esc'); add('AGENT', t('Reset agent state'), agent.reset);
  if (EMBEDDED) {
    add('SESSION', t('Open the Session list'), () => { const c = deck.card('sessions'); if (c.s.closed) c.open(); if (c.s.min) c.toggleMin(); c.focus(); });
    add('SESSION', t('Exit the deck — back to DeepSeek Harness'), () => exitDeck());
  } else for (const f of hello?.frameworks || []) if (f.available) add('AGENT', `${t('Framework')}: ${f.name}`, () => link.send({ type: 'set_framework', name: f.name }));
  add('LANGUAGE', 'UI language: English', () => setLang('en'), 'L'); add('LANGUAGE', '界面语言：中文', () => setLang('zh'), 'L');
  add('VOICE', tog(call.active, 'Hang up call', 'Start voice call'), () => call.toggle(), 'C');
  if (call.active) add('VOICE', tog(call.muted, 'Unmute', 'Mute'), () => call.setMuted(!call.muted), 'M');
  add('VOICE', tog(settings.tts, 'Disable spoken replies outside calls', 'Enable spoken replies outside calls'), () => { settings.tts = !settings.tts; saveSettings(); });
  add('VOICE', tog(settings.bargeIn, 'Disable barge-in (talk over DECK)', 'Enable barge-in (talk over DECK)'), () => { settings.bargeIn = !settings.bargeIn; saveSettings(); });
  add('GESTURE', tog(gestureOn, 'Disable gestures', 'Enable gestures'), toggleGestures, 'H');
  add('GESTURE', tog(settings.gLocked, 'Unlock gestures', 'Lock gestures'), () => { settings.gLocked = !settings.gLocked; saveSettings(); gestureChip(); }, 'G');
  add('GESTURE', t('Re-centre hand pointer'), () => engine.recenter(), 'Shift+H');
  add('GESTURE', tog(settings.gMagnet, 'Disable target magnetism', 'Enable target magnetism'), () => { settings.gMagnet = !settings.gMagnet; saveSettings(); });
  add('GESTURE', tog(settings.gDwell, 'Disable dwell click', 'Enable dwell click'), () => { settings.gDwell = settings.gDwell ? 0 : 900; saveSettings(); });
  add('GESTURE', tog(settings.gSwipes, 'Disable swipe gestures', 'Enable swipe gestures (workspace / scroll)'), () => { settings.gSwipes = !settings.gSwipes; saveSettings(); });
  add('GESTURE', settings.privacy === 'hidden' ? t('Privacy → skeleton view') : t('Privacy → fully hidden'), () => $('chip-privacy').click());
  add('LAYOUT', tog(settings.layoutLock, 'Unlock layout', 'Lock layout (panels stay put)'), () => setLayoutLock(!settings.layoutLock), 'Shift+L');
  for (const c of deck.ws.cards.values()) add('PANEL', t(c.s.closed ? 'Open {title}' : 'Focus {title}', { title: c.label }), () => { if (c.s.closed) c.open(); if (c.s.min) c.toggleMin(); c.focus(); c.arrive(); });
  for (const c of deck.ws.cards.values()) if (!c.s.closed) add('PANEL', t(c.s.max ? 'Return {title}' : 'Centre stage: {title}', { title: c.label }), () => c.toggleMax(), c === deck.ws.focused ? 'X' : undefined);
  add('PANEL', t('Undo (close / reset)'), undo, 'Ctrl+Z');
  add('RESET', t('Reset layout'), resetLayout, 'R'); add('RESET', t('Reset everything…'), resetEverything, 'Shift+R');
  for (const p of Object.keys(PRESETS)) add('LAYOUT', `${t('Layout')}: ${t(p)}`, () => deck.ws.applyPreset(p));
  add('LAYOUT', t('Save layout as…'), () => { const n = prompt(t('Layout name')); if (n) { deck.saveLayout(n); bus.emit('toast', { text: t('Layout “{n}” saved', { n }) }); } });
  for (const n of deck.layouts()) add('LAYOUT', `${t('Restore layout')}: ${n}`, () => deck.restoreLayout(n));
  add('VIEW', t('Reset globe view'), () => deck.resetView(), 'F'); add('VIEW', tog(settings.labels, 'Hide satellite labels', 'Show satellite labels'), () => { settings.labels = !settings.labels; saveSettings(); applySettings(); });
  for (let i = 0; i < 4; i++) add('VIEW', t('workspace {n}', { n: i + 1 }), () => deck.switchTo(i, i > deck.active ? 1 : -1), String(i + 1));
  add('VIEW', t('Clear canvas results'), clearCanvas); add('VIEW', t('Welcome screen'), () => welcome.show());
  for (const th of THEME_IDS) add('THEME', `${t('Theme')}: ${isZh() ? THEMES[th].zh : THEMES[th].name}`, () => setTheme(th));
  add('THEME', t('Next theme'), () => cycleTheme(1), 'T');
  add('THEME', tog(settings.tilt3d, '3D cockpit off (flat docks)', '3D cockpit on (curved docks)'), () => { settings.tilt3d = !settings.tilt3d; saveSettings(); applySettings(); });
  for (const pm of ['auto', 'high', 'balanced', 'low']) add('PERFORMANCE', `${t('Performance mode')}: ${t(pm)}`, () => { settings.perf = pm; saveSettings(); applySettings(); });
  add('PERFORMANCE', tog(settings.animations, 'Disable animations', 'Enable animations'), () => { settings.animations = !settings.animations; saveSettings(); applySettings(); });
  add('PERFORMANCE', tog(settings.sound, 'Mute sound effects', 'Enable sound effects'), () => { settings.sound = !settings.sound; saveSettings(); });
  for (const [id, label, key] of [['gestures', 'Gesture help', 'F1'], ['voice', 'Voice help'], ['shortcuts', 'Shortcut list', '?'], ['tools', 'Agent tools'], ['settings', 'Settings']]) add('HELP', t(label), () => help.toggle(id), key);
  add('HELP', t('Guided tour'), () => tour.start());
  add('PANEL', t('Task history & favorites'), () => historyPanel.toggle(true)); add('PANEL', t('Notifications'), () => notifier.toggle(true));
  add('EXPORT', t('Favorite current results'), () => bus.emit('history:favorite-current'));
  add('EXPORT', t('Export current results (Markdown)'), () => bus.emit('export:current', 'md')); add('EXPORT', t('Export current results (JSON)'), () => bus.emit('export:current', 'json'));
  for (const h of history.items.slice(0, 8)) add('HISTORY', `${h.favorite ? '★ ' : ''}${h.prompt}`, () => command(h.prompt, 'history'));
  return C;
}, (q) => command(q, 'palette'));
$('btn-palette').onclick = () => palette.toggle();

// ═══════════════════════════════ command bar & keyboard (matches ui/guide.js SHORTCUTS)
$('cmd').addEventListener('submit', (e) => { e.preventDefault(); command($('prompt').value); });
$('btn-stop').onclick = () => agent.interrupt('button');
$('btn-pause').onclick = () => (fsm.state === 'paused' ? agent.resume() : agent.pause('button'));
// capture phase: remember whether Esc was aimed at an overlay BEFORE the overlay's own handler closes it,
// so one Esc never both closes a panel and interrupts the agent
let escForOverlay = false;
addEventListener('keydown', (e) => { if (e.key === 'Escape') escForOverlay = palette.open || lightbox.openNow || radial.open || !$('consent').hidden || !$('confirm').hidden; }, true);
addEventListener('keydown', (e) => {
  const typing = e.target.closest?.('input, textarea, select'), k = e.key, mod = e.ctrlKey || e.metaKey;
  if (mod && k.toLowerCase() === 'k') { e.preventDefault(); palette.toggle(); return; }
  if (mod && k === 'Enter') { e.preventDefault(); command(lastPrompt, 'retry'); return; }
  if (mod && k.toLowerCase() === 'z' && !typing) { e.preventDefault(); undo(); return; }
  if (k === 'Escape') { if (!closeOverlays() && !escForOverlay) agent.interrupt('keyboard'); if (typing) e.target.blur(); return; }
  if (k === 'F1') { e.preventDefault(); help.toggle('gestures'); return; }
  if (typing || mod || e.altKey || palette.open || !$('confirm').hidden) return;
  if (k >= '1' && k <= '4') deck.switchTo(+k - 1, +k - 1 > deck.active ? 1 : -1);
  else if (k === '[') deck.switchTo(deck.active - 1, -1); else if (k === ']') deck.switchTo(deck.active + 1, 1);
  else if (k === 'F' && e.shiftKey) toggleFull();
  else if (k === 'f' || k === '0') deck.resetView();
  else if (k === 'p' || k === 'P') $('btn-pause').click();
  else if (k === 'c' || k === 'C') call.toggle();
  else if (k === 'v' || k === 'V') call.talkOnce();
  else if (k === 'z') zoom.zoomAt(mouseXY.x, mouseXY.y, 1.5);
  else if (k === 't' || k === 'T') cycleTheme(e.shiftKey ? -1 : 1);
  else if (k === 'Z') zoom.reset();
  else if (zoom.active && k.startsWith('Arrow')) { e.preventDefault(); const d = 120; zoom.pan(k === 'ArrowLeft' ? d : k === 'ArrowRight' ? -d : 0, k === 'ArrowUp' ? d : k === 'ArrowDown' ? -d : 0); }
  else if ((k === 'm' || k === 'M') && call.active) call.setMuted(!call.muted);
  else if (k === 'H' && e.shiftKey) { engine.recenter(); bus.emit('toast', { text: t('Hand pointer: hold your hand where it rests — re-centring') }); }
  else if (k === 'h') toggleGestures();
  else if (k === 'L' && e.shiftKey) $('btn-lock').click();
  else if (k === 'l') setLang(isZh() ? 'en' : 'zh');
  else if (k === 'g' || k === 'G') { settings.gLocked = !settings.gLocked; saveSettings(); gestureChip(); bus.emit('toast', { text: t(settings.gLocked ? 'Gesture lock ON' : 'Gesture lock OFF') }); }
  else if (!EMBEDDED && (k === 's' || k === 'S')) command(sampleTask(), 'shortcut');
  else if (k === 'R') resetEverything(); else if (k === 'r') resetLayout();
  else if (k === 'x' || k === 'X') (deck.ws.focused && !deck.ws.focused.s.closed ? deck.ws.focused : deck.ws.open()[0])?.toggleMax();
  else if (k === '?') help.toggle('shortcuts');
  else if (k === '/') { e.preventDefault(); $('prompt').focus(); }
});
// click ripples + optional click sound on every real pointer press
document.addEventListener('pointerdown', (e) => { if (e.isTrusted) { fx.ripple(e.clientX, e.clientY, { max: 30, life: 420 }); if (e.target.closest('button')) sfx.click(); } }, true);
// long-press → radial menu (touch equivalent of right-click)
let lp = null;
$('stage').addEventListener('pointerdown', (e) => { if (e.pointerType !== 'touch') return; lp = setTimeout(() => openRadial(e.clientX, e.clientY, deck.cardAt(e.clientX, e.clientY)), 600); });
for (const t of ['pointerup', 'pointermove', 'pointercancel']) $('stage').addEventListener(t, () => clearTimeout(lp));

// ═══════════════════════════════ settings → visuals
/** Switch theme with a light wave across the screen; the 3D world re-tints in step. */
function setTheme(id) {
  id = themeOf(id); if (id === settings.theme) return;
  settings.theme = id; saveSettings(); notifyHost('deck_theme', { theme: id });   // inside DSH the shell's skin follows
  const w = $('theme-wave'); w.classList.remove('run'); void w.offsetWidth; w.classList.add('run'); sfx.whoosh?.();
  setTimeout(applySettings, settings.animations ? 260 : 0);                     // re-tint as the wave passes the middle
  bus.emit('toast', { text: `${t('Theme')} · ${isZh() ? THEMES[id].zh : THEMES[id].name} — ${isZh() ? THEMES[id].tagZh : THEMES[id].tag}` });
}
bus.on('theme:set', (id) => setTheme(id));
bus.on('settings:changed', (k) => { if (k === 'theme' || k === 'all') notifyHost('deck_theme', { theme: settings.theme }); });
// embedded in DeepSeek Harness: the DSH console (dsh-plugin-command-deck) pushes theme / motion / sound choices in
if (EMBEDDED) {
  link.onSettings = (s) => {
    const { theme, ...rest } = s;
    let changed = false;
    for (const [k, v] of Object.entries(rest)) if (k in settings && settings[k] !== v) { settings[k] = v; changed = true; }
    if (changed) { saveSettings(); applySettings(); }
    if (theme && theme !== settings.theme) setTheme(theme);
  };
  link.onCommand = (m) => { if (m.command === 'sample') command(sampleTask()); else if (m.command === 'prompt' && m.text) command(m.text); };
  if (PREVIEW) { settings.sound = false; document.body.classList.add('deck-preview'); }
}
function cycleTheme(dir = 1) { const i = THEME_IDS.indexOf(themeOf(settings.theme)); setTheme(THEME_IDS[(i + dir + THEME_IDS.length) % THEME_IDS.length]); }
function applySettings() {
  settings.theme = themeOf(settings.theme);
  document.body.dataset.theme = settings.theme;
  document.body.classList.toggle('no-tilt', settings.tilt3d === false);
  document.body.classList.toggle('no-scan', !settings.scanlines);
  document.body.classList.toggle('reduce-motion', !settings.animations);
  space.reduced = !settings.animations || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const css = getComputedStyle(document.body);
  // the 3D world takes the theme's own palette when it has one (e.g. BRUTALIST's accent is black ink, its globe is yellow)
  const sc = THEMES[settings.theme].scene, pal = sc.palette || [css.getPropertyValue('--accent').trim() || '#49e6ff', css.getPropertyValue('--accent2').trim() || '#ffb347', css.getPropertyValue('--engine').trim() || '#58c8ff'];
  space.setColors(...pal);
  space.setTheme(sc, pal[0]);
  document.body.dataset.motion = THEMES[settings.theme].motion;
  $('labels').hidden = !settings.labels;
  space.rainLevel = settings.rain;
  if (rain) { rain.setColor(pal[0]); rain.user = settings.rain; rain.glitchLevel = settings.glitch; }
  fx.rgb = css.getPropertyValue('--fx-rgb').trim() || css.getPropertyValue('--accent-rgb').trim();
  space.autoPerf = settings.perf === 'auto';
  if (settings.perf !== 'auto' && space.tier !== settings.perf) space.setTier(settings.perf);
  document.body.classList.toggle('layout-locked', !!settings.layoutLock);
  $('btn-lock').classList.toggle('on', !!settings.layoutLock);
  $('btn-lock').title = t(settings.layoutLock ? 'Layout locked — click to unlock (Shift+L)' : 'Lock layout — panels stay put (Shift+L)');
  privacyChip(); gestureChip(); perfChip();
}
bus.on('settings:changed', () => applySettings());

// ═══════════════════════════════ mission HUD: KPI strip, plan strip, ticker, clock, readouts, satellite labels, bezel
const KPI_MAX = { results: 12, domains: 8, downloaded: 12, elapsed: 60 };
function kpiReset() { for (const k of Object.keys(KPI_MAX)) kpiOne(k, k === 'elapsed' ? '0.0' : '0', 0, false); $('ro-tools').textContent = '0'; }
function kpiOne(k, val, p, animate) {
  const t = document.querySelector(`.kpi[data-k="${k}"]`); if (!t) return;
  const b = t.querySelector('b'), str = String(val);
  if (b.textContent === str) return;
  if (animate) { roll(b, str, 900); t.classList.remove('bump'); void t.offsetWidth; t.classList.add('bump'); } else b.textContent = str;
  t.style.setProperty('--p', `${Math.round(Math.min(1, p) * 100)}%`);
}
function kpiSet(st, animate = false) {
  if (!st) return;
  for (const k of ['results', 'domains', 'downloaded']) if (st[k] != null) kpiOne(k, st[k], st[k] / KPI_MAX[k], animate);
  if (st.elapsed_ms != null) kpiOne('elapsed', (st.elapsed_ms / 1000).toFixed(1), st.elapsed_ms / 1000 / KPI_MAX.elapsed, animate);
  if (st.tool_calls != null) $('ro-tools').textContent = st.tool_calls;
}
setInterval(() => { if (fsm.running && runT0) { const s2 = (performance.now() - runT0) / 1000; kpiOne('elapsed', s2.toFixed(1), s2 / KPI_MAX.elapsed, false); } }, 200);
let stripState = { steps: [], intents: null };
function planStrip(steps, intents) {
  stripState = { steps, intents };
  const L = lang(), chips = [];
  if (intents?.length) { const c = document.createElement('span'); c.className = 'plan-chip intent'; const b = document.createElement('b'); b.textContent = '◆'; c.append(b, intentText(intents)); c.title = t('what the deck understood'); chips.push(c); }
  chips.push(...steps.map((st, i) => {
    const c = document.createElement('span'); c.className = 'plan-chip'; c.dataset.tool = st.tool; if (st.id) c.dataset.id = st.id;
    if (st.status && st.status !== 'pending') c.classList.add({ running: 'run', done: 'ok', failed: 'bad', skipped: 'skip' }[st.status] || '');
    const b = document.createElement('b'); b.textContent = String(i + 1).padStart(2, '0'); c.append(b, st.labels?.[L] || st.tool.replace(/_/g, ' ').toUpperCase());
    c.title = [st.tool, st.query, st.why].filter(Boolean).join(' — '); return c;
  }));
  $('plan-strip').replaceChildren(...chips);
}
function planMarkId(id, status) {
  const st = stripState.steps.find((x) => x.id === id); if (st) st.status = status;
  const c = $('plan-strip').querySelector(`[data-id="${id}"]`); if (!c) return false;
  c.classList.remove('run', 'ok', 'bad', 'skip'); c.classList.add({ running: 'run', done: 'ok', failed: 'bad', skipped: 'skip' }[status] || 'run'); return true;
}
function planMark(tool, state) {
  const strip = $('plan-strip'), chips = [...strip.querySelectorAll('.plan-chip:not(.intent)')];
  const c = chips.find((x) => x.dataset.tool === tool && !x.classList.contains('ok') && !(state === 'run' && x.classList.contains('run')))
    || (state === 'run' ? null : chips.find((x) => x.dataset.tool === tool && x.classList.contains('run')));
  if (c) { c.classList.remove('run'); c.classList.add(state); }
}
let lastIntents = null;
let tickT = 0, tickBuf = '';
function ticker(text) { const el = $('ticker-text'); tickBuf = ''; text = String(text || '').replace(/\s+/g, ' ').trim(); if (text.length < 120) decode(el, text, 420); else el.textContent = text; }
function hudEvent(ev, replay = false) {
  const d = ev.data || {};
  if (ev.type === 'agent_start') lastIntents = null;
  else if (ev.type === 'intent') { lastIntents = d.intents; planStrip([], d.intents); if (!replay) ticker(`${t('UNDERSTOOD')} · ${intentText(d.intents)}`); }
  else if (ev.type === 'plan') planStrip(d.steps || [], lastIntents);
  else if (ev.type === 'step_update') planMarkId(d.id, d.status);
  else if (ev.type === 'tool_call_start') { if (!d.step_id) planMark(d.tool, 'run'); if (!replay) { toolCount++; $('ro-tools').textContent = toolCount; ticker(`${(d.tool || '').replace(/_/g, ' ').toUpperCase()} · ${JSON.stringify(d.args || {}).slice(0, 90)}`); } }
  else if (ev.type === 'tool_call_result') { if (!$('plan-strip').querySelector('[data-id]')) planMark(d.tool || [...$('plan-strip').children].find((x) => x.classList.contains('run'))?.dataset.tool, d.ok ? 'ok' : 'bad'); if (!replay) ticker(`${d.ok ? '✓' : '✗'} ${d.summary || ''}`); }
  else if (ev.type === 'observation' && !replay) ticker(`${t('OBSERVE')} · ${d.text || ''}`);
  else if (ev.type === 'thought_delta' && !replay) {
    tickBuf = (tickBuf + (d.text || '')).slice(-160);
    if (performance.now() - tickT > 250) { tickT = performance.now(); $('ticker-text').textContent = tickBuf.replace(/\s+/g, ' ').trim().slice(-110); }
  }
}
// clock, mission timer, readouts
const bootT = performance.now();
function clock() {
  const n = new Date(), p2 = (v) => String(v).padStart(2, '0');
  $('clock').textContent = `${p2(n.getHours())}:${p2(n.getMinutes())}:${p2(n.getSeconds())}`;
  $('date').textContent = `${n.getFullYear()}.${p2(n.getMonth() + 1)}.${p2(n.getDate())} · ${n.toLocaleDateString(locale(), { weekday: 'short' }).toUpperCase()}`;
  const s2 = Math.floor((performance.now() - bootT) / 1000); $('mission').textContent = `${p2(Math.floor(s2 / 3600))}:${p2(Math.floor(s2 / 60) % 60)}:${p2(s2 % 60)}`;
  $('ro-link').textContent = link.open ? `${link.rtt ?? '—'}ms` : 'DOWN';
}
setInterval(clock, 1000); clock();
space.tickers.add(() => {
  if (!space.ok) return;
  const rot = space.globe.spin.rotation.y, lon = ((((-rot * 180 / Math.PI) + 90) % 360) + 540) % 360 - 180;
  $('ro-lon').textContent = lon.toFixed(1); $('ro-lat').textContent = (space.view.pitch * 57.3).toFixed(1);
  $('ro-thrust').textContent = `${Math.round(space.globe.power * 100)}%`;
  for (const s2 of space.sats) s2.labelEl?.classList.toggle('hot', s2.hot > 0.15);
});
// satellite labels (projected every frame by the scene)
if (space.ok) for (const s2 of space.sats) {
  const el = document.createElement('div'); el.className = 'sat-label'; const sp = document.createElement('span'); sp.dataset.i18n = s2.label; sp.textContent = t(s2.label); el.append(sp);
  $('labels').append(el); s2.labelEl = el; const v = s2.sat.position.clone();
  space.addLabel(() => s2.sat.getWorldPosition(v), el);
}
// key entities of the current results orbit the globe as labelled nodes (real data, not decoration)
let entLabels = [];
function entities(list) {
  for (const l of entLabels) { space.removeLabel(l); l.el.remove(); }
  entLabels = [];
  if (!space.ok) return;
  const top = (list || []).filter((e) => e?.name).slice(0, 6);
  space.setEntities(top);
  top.forEach((e, i) => {
    const el = document.createElement('div'); el.className = 'sat-label ent'; const sp = document.createElement('span');
    sp.textContent = e.name; sp.title = `${e.name} · ${t('{n} mentions', { n: e.count ?? '?' })}${e.query_term ? ` · ${t('in your query')}` : ''}`; el.append(sp); el.style.setProperty('--d', `${i * 90}ms`);
    $('labels').append(el); entLabels.push(space.addLabel(() => space.entityPos(i), el));
  });
}
// geocoded places: beacons on the globe; a new place makes the globe fly there
let placeLabels = [], placeSig = '';
function places(list, fly) {
  const sig = (list || []).map((p) => `${p.lat},${p.lon}`).join('|');
  if (sig === placeSig) return; const prev = placeSig; placeSig = sig;
  for (const l of placeLabels) { space.removeLabel(l); l.el.remove(); }
  placeLabels = [];
  if (!space.ok) return;
  space.setPlaces(list || []);
  (list || []).slice(0, 6).forEach((p, i) => {
    const el = document.createElement('div'); el.className = 'sat-label ent place'; const sp = document.createElement('span');
    sp.textContent = p.name; sp.title = [p.name, p.where, p.tz, `${p.lat.toFixed(2)}, ${p.lon.toFixed(2)}`].filter(Boolean).join(' · ');
    el.append(sp); $('labels').append(el); placeLabels.push(space.addLabel(() => space.markerPos(i), el));
  });
  const last = list?.at(-1);
  if (fly && last && !prev.includes(`${last.lat},${last.lon}`)) { space.flyTo(last.lat, last.lon); ticker(`◆ ${last.name}${last.where ? ` · ${last.where}` : ''}`); }
}
// reminders set by the agent fire here (toast + notification + voice), persisted across reloads
const reminders = {
  items: (() => { try { return JSON.parse(localStorage.getItem('cmddeck.v2.reminders') || '[]'); } catch { return []; } })(),
  save() { try { localStorage.setItem('cmddeck.v2.reminders', JSON.stringify(this.items)); } catch { /* ignore */ } },
  add(w) { if (this.items.some((x) => x.due_ms === w.due_ms && x.text === w.text)) return; this.items.push({ text: w.text, due_ms: w.due_ms }); this.save(); this.arm(this.items.at(-1)); },
  arm(r) { setTimeout(() => this.fire(r), Math.max(0, r.due_ms - Date.now())); },
  fire(r) {
    if (!this.items.includes(r)) return;
    this.items = this.items.filter((x) => x !== r); this.save();
    sfx.complete(); fx.sweep(1);
    bus.emit('toast', { text: `⏰ ${t('Reminder')}: ${r.text}`, kind: 'warn', ms: 15000 });
    bus.emit('notify', { text: `⏰ ${t('Reminder')}: ${r.text}`, kind: 'warn' });
    call.speak(`${t('Reminder')}: ${r.text}`);
  },
};
reminders.items.forEach((r) => reminders.arm(r));
// screen bezel
function drawFrame() {
  const W = innerWidth, H = innerHeight, m = 5, c = 22, f = $('frame');
  f.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const P = [
    `M${m} ${m + c + 46} V${m + c} L${m + c} ${m} H${m + c + 96}`, `M${W - m} ${m + c + 46} V${m + c} L${W - m - c} ${m} H${W - m - c - 96}`,
    `M${m} ${H - m - c - 46} V${H - m - c} L${m + c} ${H - m} H${m + c + 96}`, `M${W - m} ${H - m - c - 46} V${H - m - c} L${W - m - c} ${H - m} H${W - m - c - 96}`,
  ].map((d) => `<path d="${d}"/>`);
  for (let i = 0, y = H * 0.32; y < H * 0.68; y += 10, i++) { const l = i % 5 ? 4 : 9; P.push(`<line class="thin" x1="${m}" y1="${y}" x2="${m + l}" y2="${y}"/><line class="thin" x1="${W - m}" y1="${y}" x2="${W - m - l}" y2="${y}"/>`); }
  P.push(`<line class="warm" x1="${m + c + 104}" y1="${m}" x2="${m + c + 140}" y2="${m}"/><line class="warm" x1="${W - m - c - 104}" y1="${H - m}" x2="${W - m - c - 140}" y2="${H - m}"/>`);
  f.innerHTML = P.join('');
}
// the globe is framed inside the free centre area; the welcome vignette follows it
function frameGlobe() {
  const s0 = $('globe-zone').getBoundingClientRect(), a = zoom.toLayout(s0.left, s0.top);          // layout space: the canvas is inside the magnified root
  const r = { left: a.x, top: a.y, width: s0.width / zoom.z, height: s0.height / zoom.z };
  if (r.width > 40 && r.height > 40) space.setFocusRect({ x: r.left, y: r.top, w: r.width, h: r.height });
  const g = space.globeScreen(); document.body.style.setProperty('--gx', `${g.x}px`); document.body.style.setProperty('--gy', `${g.y}px`);
}
bus.on('layout:changed', frameGlobe);
addEventListener('resize', () => { drawFrame(); frameGlobe(); });
new ResizeObserver(() => frameGlobe()).observe($('globe-zone'));
$('hud').addEventListener('transitionend', (e) => { if (e.target.id === 'hud') frameGlobe(); });
// one-click example tasks (no typing needed)
const SUGGEST = {
  en: ['weather in Tokyo tomorrow', 'find me images of the Cassini mission to Saturn', 'latest data on global EV sales', '100 USD to CNY and 30 C to F', 'where is Machu Picchu', 'remind me in 10 minutes to stretch'],
  zh: ['北京明天天气怎么样，再找几张故宫的图片', '找几张詹姆斯·韦布望远镜的图片', '全球电动车销量最新数据', '100美元换成人民币', '东京现在几点', '10分钟后提醒我喝水'],
};
function suggestions() {
  const box = $('suggest'), lab = document.createElement('span'); lab.textContent = t('TRY');
  box.replaceChildren(lab, ...SUGGEST[lang()].slice(0, 4).map((q) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = q.replace(/^find me /, ''); b.title = `${t('Run')}: ${q}`; b.onclick = () => command(q, 'suggestion'); return b; }));
}
suggestions();
// language switch: everything that is not static markup re-renders its own text
bus.on('lang:changed', () => {
  suggestions(); wsTabs(); stateUI(); modeChip(); applySettings(); gestureLegend.on && gestureLegend();
  planStrip(stripState.steps, stripState.intents); callUI({ to: callFsm.state });
  $('sb-state-sub').textContent = { thinking: t('reasoning…'), rendering: t('rendering results…'), done: t('results ready') }[fsm.state] || $('sb-state-sub').textContent;
  $('btn-pause').textContent = t(fsm.state === 'paused' ? 'RESUME' : 'PAUSE');
  // results re-render in the new language (images are keyed, so nothing reloads)
  views.forEach((v, i) => {
    const d = deck.workspaces[i].data; if (!d.dashboard) return;
    for (const k of ['timeline', 'sources', 'analytics']) v[k].sig = '';
    v.metrics.rows = null; v.images.sig = '';
    render(v, d.dashboard, true);
    if (v.summary.answer) v.summary.show(v.summary.answer, d.dashboard.summary?.stats || (d.sample ? sample?.stats : null), d.dashboard.sources || [], d.dashboard.widgets || []);
  });
  for (const v of views) v.taskgraph.render();
  linkStatus(linkStatus.s || 'connecting');
  $('ticker-text').textContent = t('DECK ONLINE · AWAITING COMMAND');
  call.relang?.();
  bus.emit('toast', { text: isZh() ? '界面语言：中文 · 用中文或英文提问都可以' : 'UI language: English · ask in English or Chinese' });
});

// ═══════════════════════════════ boot: layered entrance (camera dives in, engines ignite, docks unfold, HUD slides in)
applyI18n();
applySettings();
aiChip();                        // embedded: the AI chip reports that DSH owns the model
wsTabs(); stateUI(); drawFrame();
requestAnimationFrame(frameGlobe);
if (settings.animations && space.ok) { Object.assign(space.view, { zoom: 0.28, pitch: 0.7, yaw: -0.5 }); space.globe.thrust(0.22, true); }
deck.emergeAll({ stagger: 90 });
requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove('booting')));
// Embedded in DSH the deck starts EMPTY: the sample replay is stand-alone demo content, and a canned task on
// every open is exactly what a harness panel must not do. In DSH the content is the real Session.
if (!EMBEDDED) loadSample(0);
if (EMBEDDED) { const lab = document.querySelector('.ws-wrap [data-i18n]'); if (lab) { lab.dataset.i18n = 'VIEWS'; lab.textContent = t('VIEWS'); } }
const q = new URLSearchParams(location.search);
if (q.has('notour')) save('tourDone', true);
if (q.get('q')) command(q.get('q'), 'link');
else if (!EMBEDDED && !q.has('nowelcome')) setTimeout(() => welcome.show(), settings.animations ? 900 : 0);   // a DSH panel opens straight into the deck

// test/debug handle (drive the gesture pipeline with synthetic landmarks, the VAD with levels, etc.)
const mouseXY = { x: innerWidth / 2, y: innerHeight / 2 };
addEventListener('pointermove', (e) => { mouseXY.x = e.clientX; mouseXY.y = e.clientY; }, { passive: true });
window.DECK = { zoom, space, fsm, callFsm, call, deck, views, link, engine, router, skel, tracker, history, command, agent, settings, help, welcome, radial, tour, palette,
  depth, resetLayout, resetEverything, undo, openRadial, closeOverlays, feed: (hands, ts) => onHands(hands, ts), shortcuts: SHORTCUTS, tools: TOOLS,
  setLang, t, understandCommand, runLocal, places, reminders, setLayoutLock };
