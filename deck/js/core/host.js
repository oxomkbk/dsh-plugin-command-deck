// Host adapter: the deck runs either STANDALONE (its own Python backend on /ws and /api) or EMBEDDED in
// DeepSeek Harness (`dsh web`), served by the dsh-plugin-command-deck bundle under /command-deck/ and opened
// in an <iframe> with ?host=dsh. Embedded, the agent is DSH's: commands and events travel over postMessage
// to the plugin's browser half, which drives real DSH Sessions and answers in the deck's own event protocol.
// Everything else (scene, panels, gestures, voice, themes, workspaces, history) is unchanged.

const params = new URLSearchParams(location.search);
/** 'dsh' when embedded in DeepSeek Harness, 'deck' when standalone. */
export const HOST = params.get('host') === 'dsh' && window.parent !== window ? 'dsh' : 'deck';
export const EMBEDDED = HOST === 'dsh';
/** Compact embedding (the DSH right-hand HUD tab and the console preview): fewer chrome elements. */
export const COMPACT = EMBEDDED && (params.get('view') === 'hud' || params.get('view') === 'preview');
export const VIEW = params.get('view') || 'full';

/** Base-relative URL for the deck's own HTTP API: `/api/x` standalone, `/command-deck/api/x` inside DSH. */
export const api = (path) => path.replace(/^\//, '');

/**
 * Same surface as core/ws.js `Link` (send / open / rtt / connect / ws.close), carried over postMessage to the
 * DSH plugin bridge in the parent page. Messages are origin-checked in both directions: the iframe is served by
 * the DSH host itself, so parent and child share one origin.
 */
export class ParentLink {
  constructor(_url, { onEvent, onStatus }) {
    Object.assign(this, { onEvent, onStatus });
    this.rtt = null; this.lastSeq = 0; this.outbox = []; this.ready = false;
    this.ws = { close: () => this.connect() };                       // the offline banner's "retry" calls ws.close()
    addEventListener('message', (e) => {
      if (e.source !== window.parent || e.origin !== location.origin) return;
      const m = e.data;
      if (!m || m.source !== 'dsh-bridge') return;
      if (m.kind === 'ready') {
        const first = !this.ready; this.ready = true; this.onStatus('open');
        if (first) for (const msg of this.outbox.splice(0)) this.post(msg);
        return;
      }
      if (m.kind === 'settings') { this.onSettings?.(m.settings || {}); return; }   // the DSH console drives the deck's look
      if (m.kind === 'command') { this.onCommand?.(m); return; }                  // e.g. replay / open a workspace from the DSH page
      if (m.kind === 'sessions') { this.onSessions?.(m.sessions || [], m.active || null); return; }   // DSH's Session directory
      if (m.kind !== 'event' || !m.event) return;
      const ev = m.event;
      this.lastSeq = ev.seq;
      if (ev.type === 'pong' && ev.data?.t) { this.rtt = Math.max(0, Math.round(performance.now() - ev.data.t)); this.onStatus('open'); }
      this.onEvent(ev);
    });
    this.connect();
    setInterval(() => { if (this.ready) this.send({ type: 'ping', t: performance.now() }); }, 4000);
  }
  connect() {
    this.ready = false; this.onStatus('connecting');
    this.post({ type: 'hello', view: VIEW });
    clearTimeout(this.retry);
    this.retry = setTimeout(() => { if (!this.ready) this.connect(); }, 1500);   // the bridge may still be mounting
  }
  post(msg) { window.parent.postMessage({ source: 'command-deck', ...msg }, location.origin); }
  send(msg) {
    if (this.ready) this.post(msg);
    else if (msg.type === 'run' || msg.type === 'steer') this.outbox.push(msg);
  }
  get open() { return this.ready; }
}

/** Tell the DSH page about deck-side preferences (theme) so the shell can follow. */
export function notifyHost(type, data) {
  if (EMBEDDED) window.parent.postMessage({ source: 'command-deck', type, ...data }, location.origin);
}

/**
 * Embedded in DeepSeek Harness: hand the screen back. The plugin's browser half answers `exit_deck` by asking
 * DSH's layout service to select the conversation interface, so this panel closes and DSH's own sidebar, session
 * list and chat are in front again. Standalone it is a no-op — there is nothing to leave.
 */
export function exitDeck() {
  if (!EMBEDDED) return;
  notifyHost('exit_deck', {});
}

/** Embedded: follow one of DSH's Sessions — the bridge replays its conversation into the deck. */
export function openSession(id) {
  if (!EMBEDDED || !id) return;
  notifyHost('open_session', { id: String(id) });
}

/** Embedded: drop the followed Session; the next command opens a fresh one on the DSH side. */
export function newSession() {
  if (!EMBEDDED) return;
  notifyHost('new_session', {});
}
