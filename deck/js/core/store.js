// Persistent settings, task history and favourites (localStorage, defensive).
const K = 'cmddeck.v2.';
export const load = (k, d) => { try { const v = localStorage.getItem(K + k); return v === null ? d : JSON.parse(v); } catch { return d; } };
export const save = (k, v) => { try { localStorage.setItem(K + k, JSON.stringify(v)); return true; } catch { return false; } };

const navZh = () => { try { return /^zh/i.test(navigator.language || ''); } catch { return false; } };
export const DEFAULT_SETTINGS = {
  lang: navZh() ? 'zh' : 'en',               // UI language (en | zh); replies follow the language you ask in
  homeCity: '',                              // default place for “weather” / “time” without a place (empty = your timezone's city)
  theme: 'jarvis', scanlines: true, rain: 1, glitch: 1, animations: true, perf: 'auto', sound: true, volume: 0.35,
  voiceLang: 'auto', asrEngine: 'auto', tts: true, ttsRate: 1.05, autoListen: false,
  vadOn: 11, vadBarge: 20, vadHang: 1100, callIdle: 300, bargeIn: true, ack: true, wake: false,   // vadHang = end-of-sentence silence (ms, total) · ack = earcon when a request is accepted
  privacy: 'skeleton',                       // 'skeleton' | 'hidden' — camera pixels are never drawn in either
  gStable: 3, gConfidence: 0.6, gPinch: 0.34, gSwipe: 1.0, gHold: 900, gSens: 1.35, gFollow: 0.55, gJitter: 0.55, gLocked: false,
  gAnchor: 'stable',                         // pointer anchor: 'stable' (knuckles — holds still when the hand closes) | 'tip'
  gMagnet: true, gDwell: 0,                  // target magnetism · dwell-to-click (ms, 0 = off)
  gGrab: 220,                                // pinch-and-hold on a title this long (ms) before a panel lifts — stray pinches never move panels
  gSwipes: false,                            // open-hand swipes (workspace / page scroll) — off: fast pointer moves must never switch screens
  layoutLock: false,                         // pin the layout: gestures can't move, resize or maximise panels
  labels: true,                              // tool satellite / source labels around the globe
  tilt3d: true,                              // 3D cockpit: side docks curve toward you
  _v: 54,
};
// v5.4 retuned some defaults; values saved by older versions for these keys are dropped once so the new ones apply
const SETTINGS_V = 54, RETUNED = ['vadHang', 'gGrab', 'gJitter', 'gFollow', 'gSens', 'gPinch'];
const saved = load('settings4', {});
if ((saved._v || 0) < SETTINGS_V) { for (const k of RETUNED) delete saved[k]; saved._v = SETTINGS_V; }
export const settings = { ...DEFAULT_SETTINGS, ...saved };
export const saveSettings = () => save('settings4', settings);

export const history = {
  items: load('history', []),
  add(entry) {
    this.items.unshift(entry);
    this.items = this.items.slice(0, 60);
    while (!save('history', this.items) && this.items.length > 5) this.items.pop();   // shrink until it fits
  },
  update(id, patch) { const it = this.items.find((x) => x.id === id); if (it) { Object.assign(it, patch); save('history', this.items); } return it; },
  remove(id) { this.items = this.items.filter((x) => x.id !== id); save('history', this.items); },
};

/** Strip heavy fields before persisting a dashboard. */
export function compactDashboard(d) {
  if (!d) return d;
  const c = { ...d };
  c.sources = (d.sources || []).slice(0, 15).map(({ snippet, ...s }) => ({ ...s, snippet: (snippet || '').slice(0, 160) }));
  c.images = (d.images || []).slice(0, 16);
  return c;
}
