// ─────────────────────────────────────────────────────────────────────────────
// Deck state machine — explicit, table-driven, event-driven only.
//
//  idle|done|error|interrupted ─agent_start→ thinking
//  thinking ─tool_call_start→ tool_running ─tool_call_result(no pending)→ thinking
//  thinking|tool_running ─paused→ paused ─resumed→ thinking|tool_running
//  thinking|tool_running ─final→ rendering ─render_complete→ done
//  busy|paused ─error|disconnect→ error          busy|paused ─interrupted→ interrupted
//  ANY ─reset→ idle                               error ─dismiss→ idle
//
// No transition is triggered by a timer guess:
//   • render_complete fires when the result cards' arrival animations finish
//     (Web Animations `finished` promises) — an event from the renderer;
//   • backend liveness is the transport's job (ws.js): a dead link produces a
//     `disconnect` event, never a silent timeout inside the FSM;
//   • `reset` is accepted in every state, so the user can always get back to idle.
// Irrelevant events are ignored (never thrown), so out-of-order noise can't wedge it.
// ─────────────────────────────────────────────────────────────────────────────
export const STATES = ['idle', 'thinking', 'tool_running', 'paused', 'rendering', 'done', 'error', 'interrupted'];
export const BUSY = new Set(['thinking', 'tool_running', 'paused', 'rendering']);
export const RUNNING = new Set(['thinking', 'tool_running', 'paused']);

const afterTool = (c) => (c.pending.size ? 'tool_running' : 'thinking');
const resting = { agent_start: 'thinking', error: 'error' };
const working = {
  agent_start: 'thinking', plan: null, thought_delta: null, observation: null, tool_call_progress: null,
  tool_call_start: 'tool_running', tool_call_result: afterTool,
  paused: 'paused', final: 'rendering', error: 'error', disconnect: 'error', interrupted: 'interrupted',
};
const TABLE = {
  idle: { ...resting },
  done: { ...resting },
  error: { ...resting, dismiss: 'idle' },
  interrupted: { ...resting },
  thinking: { ...working },
  tool_running: { ...working, thought_delta: afterTool },
  paused: { resumed: afterTool, interrupted: 'interrupted', error: 'error', disconnect: 'error', agent_start: 'thinking',
            tool_call_result: 'paused', observation: null, final: 'rendering' },
  rendering: { render_complete: 'done', agent_start: 'thinking', error: 'error' },
};
for (const s of STATES) TABLE[s].reset = 'idle';

export class FSM {
  constructor() {
    this.state = 'idle';
    this.ctx = { pending: new Set(), detail: '', since: performance.now(), runStarted: 0 };
    this.log = [];
    this.subs = new Set();
  }
  on(fn) { this.subs.add(fn); return () => this.subs.delete(fn); }
  get busy() { return BUSY.has(this.state); }
  get running() { return RUNNING.has(this.state); }

  dispatch(type, data = {}) {
    const c = this.ctx;
    if (type === 'agent_start') { c.pending.clear(); c.runStarted = performance.now(); c.detail = ''; }
    if (type === 'tool_call_start') { c.pending.add(data.call_id); c.detail = data.tool || ''; }
    if (type === 'tool_call_result') c.pending.delete(data.call_id);
    if (['final', 'error', 'interrupted', 'reset', 'disconnect'].includes(type)) c.pending.clear();
    if (['error', 'disconnect'].includes(type)) c.detail = data.message || type;
    if (type === 'interrupted') c.detail = `by ${data.reason || 'user'}`;
    if (type === 'paused') c.detail = `by ${data.reason || 'user'}`;
    const rule = TABLE[this.state][type];
    if (rule === undefined || rule === null) return false;           // irrelevant / no-op here
    const next = typeof rule === 'function' ? rule(c, data) : rule;
    if (next === this.state) return false;
    const from = this.state;
    this.state = next;
    c.since = performance.now();
    this.log.unshift({ at: new Date(), from, to: next, event: type });
    this.log.length = Math.min(this.log.length, 40);
    for (const fn of this.subs) { try { fn({ from, to: next, event: type, ctx: c }); } catch (e) { console.error('[fsm]', e); } }
    return true;
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// Voice-call region (orthogonal to the agent region above — together they form the
// global statechart shown in the status bar). Driven only by events from the call engine:
//   call_start → connecting ─connected→ listening
//   listening ─vad_start→ user_speaking ─vad_end→ listening
//   listening|user_speaking ─tts_start→ agent_speaking ─tts_end→ listening
//   agent_speaking ─vad_start (barge-in) / voice_stop→ interrupted ─vad_end→ listening
//   any live state ─mute→ muted ─unmute→ listening
//   any live state ─hangup / idle_timeout→ ended ─clear→ off         ANY ─reset→ off
// ─────────────────────────────────────────────────────────────────────────────
export const CALL_STATES = ['off', 'connecting', 'listening', 'user_speaking', 'agent_speaking', 'interrupted', 'muted', 'ended'];
export const CALL_LIVE = new Set(['listening', 'user_speaking', 'agent_speaking', 'interrupted', 'muted']);
const end = { hangup: 'ended', idle_timeout: 'ended' };
const CALL_TABLE = {
  off: { call_start: 'connecting' },
  connecting: { connected: 'listening', fail: 'off', hangup: 'off' },
  listening: { vad_start: 'user_speaking', tts_start: 'agent_speaking', mute: 'muted', voice_stop: 'interrupted', ...end },
  user_speaking: { vad_end: 'listening', tts_start: 'agent_speaking', mute: 'muted', voice_stop: 'interrupted', ...end },
  agent_speaking: { tts_end: 'listening', vad_start: 'interrupted', voice_stop: 'interrupted', mute: 'muted', ...end },
  interrupted: { vad_end: 'listening', vad_start: 'user_speaking', settle: 'listening', tts_start: 'agent_speaking', mute: 'muted', ...end },
  muted: { unmute: 'listening', ...end },
  ended: { call_start: 'connecting', clear: 'off' },
};
for (const st of CALL_STATES) CALL_TABLE[st].reset = 'off';

export class CallFSM {
  constructor() { this.state = 'off'; this.log = []; this.subs = new Set(); }
  on(fn) { this.subs.add(fn); return () => this.subs.delete(fn); }
  get live() { return CALL_LIVE.has(this.state); }
  dispatch(type, data = {}) {
    const next = CALL_TABLE[this.state][type];
    if (!next || next === this.state) return false;
    const from = this.state; this.state = next;
    this.log.unshift({ at: new Date(), from, to: next, event: type }); this.log.length = Math.min(this.log.length, 40);
    for (const fn of this.subs) { try { fn({ from, to: next, event: type, data }); } catch (e) { console.error('[callfsm]', e); } }
    return true;
  }
}
