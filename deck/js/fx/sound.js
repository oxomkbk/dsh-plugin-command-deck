// Tiny synthesized sound kit (WebAudio, no files). Optional: Settings → Sound.
import { settings } from '../core/store.js';

let ac = null, master = null;
function ctx() {
  if (!settings.sound) return null;
  if (!ac) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; ac = new A(); master = ac.createGain(); master.connect(ac.destination); }
  if (ac.state === 'suspended') ac.resume().catch(() => {});
  master.gain.value = settings.volume;
  return ac;
}
function tone(freq, dur, { type = 'sine', gain = 0.25, slide = 0, delay = 0 } = {}) {
  const a = ctx(); if (!a) return;
  const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur, { gain = 0.08, freq = 1800 } = {}) {
  const a = ctx(); if (!a) return;
  const b = a.createBuffer(1, a.sampleRate * dur, a.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = b; f.type = 'bandpass'; f.frequency.value = freq; g.gain.value = gain; s.connect(f).connect(g).connect(master); s.start();
}
export const sfx = {
  click: () => tone(1400, 0.05, { type: 'square', gain: 0.05 }),
  pinch: () => { tone(880, 0.06, { gain: 0.08 }); tone(1320, 0.08, { gain: 0.05, delay: 0.04 }); },
  hover: () => tone(2400, 0.02, { gain: 0.015 }),
  open: () => tone(520, 0.12, { type: 'triangle', gain: 0.08, slide: 380 }),
  close: () => tone(900, 0.1, { type: 'triangle', gain: 0.06, slide: -500 }),
  whoosh: () => noise(0.35, { gain: 0.09, freq: 900 }),
  tool: () => tone(660, 0.07, { type: 'square', gain: 0.03 }),
  toolDone: () => tone(990, 0.06, { gain: 0.04 }),
  complete: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, { type: 'triangle', gain: 0.09, delay: i * 0.08 })),
  error: () => { tone(220, 0.18, { type: 'sawtooth', gain: 0.06 }); tone(180, 0.22, { type: 'sawtooth', gain: 0.06, delay: 0.12 }); },
  callStart: () => [440, 660, 880].forEach((f, i) => tone(f, 0.12, { gain: 0.08, delay: i * 0.09 })),
  callEnd: () => [880, 660, 440].forEach((f, i) => tone(f, 0.12, { gain: 0.08, delay: i * 0.09 })),
  ack: () => { tone(1180, 0.07, { gain: 0.05 }); tone(1770, 0.1, { gain: 0.035, delay: 0.06 }); },   // request accepted (call mode)
  barge: () => tone(300, 0.08, { type: 'square', gain: 0.04 }),
  reset: () => { noise(0.4, { gain: 0.07, freq: 400 }); tone(300, 0.3, { slide: 600, gain: 0.06 }); },
};
