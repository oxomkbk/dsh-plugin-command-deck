// Result animations: decode (text scramble → final), number rolling, skeleton loaders.
import { settings } from '../core/store.js';
const CH = '01アイウエオカキクケコサシスセソ<>/\\|=+*#%$';
export const GLYPHS = '01<>/\\|=+*#%$ABCDEFXZ_[]';   // Latin-only scramble set (no font fallback, no tofu)
const animOn = () => settings.animations && !matchMedia('(prefers-reduced-motion: reduce)').matches;

export function decode(el, finalText, ms = 650, chars = CH) {
  finalText = String(finalText ?? '');
  if (!animOn() || finalText.length > 160) { el.textContent = finalText; return Promise.resolve(); }
  const t0 = performance.now();
  let mine = null;
  return new Promise((res) => {
    const step = () => {
      if (mine !== null && el.textContent !== mine) { res(); return; }   // text replaced meanwhile (language switch): stop
      const k = Math.min(1, (performance.now() - t0) / ms), n = Math.floor(finalText.length * k);
      mine = el.textContent = finalText.slice(0, n) + [...finalText.slice(n)].map((c) => (c === ' ' ? ' ' : chars[(Math.random() * chars.length) | 0])).join('').slice(0, Math.max(0, finalText.length - n));
      if (k < 1) requestAnimationFrame(step); else { el.textContent = finalText; res(); }
    };
    step();
  });
}

/** Roll the leading number of a string (e.g. "2.5 million km") from 0 to its value. */
export function roll(el, text, ms = 900) {
  text = String(text ?? '');
  const m = text.match(/^([^\d]*)(\d[\d,，]*(?:\.\d+)?)(.*)$/s);
  if (!animOn() || !m) { el.textContent = text; return Promise.resolve(); }
  const [, pre, num, post] = m, target = parseFloat(num.replace(/[,，]/g, '')), dec = (num.split('.')[1] || '').length, comma = /[,，]/.test(num);
  const t0 = performance.now();
  return new Promise((res) => {
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / ms), e = 1 - Math.pow(1 - k, 4), v = target * e;
      let s = v.toFixed(dec); if (comma) s = Number(s).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
      el.textContent = pre + s + post;
      if (k < 1) requestAnimationFrame(step); else { el.textContent = text; res(); }
    };
    step();
  });
}

export function skeleton(kind = 'lines') {
  const box = document.createElement('div'); box.className = `skel skel-${kind}`;
  const n = kind === 'grid' ? 6 : kind === 'metrics' ? 4 : 5;
  for (let i = 0; i < n; i++) { const b = document.createElement('i'); b.style.animationDelay = `${i * 90}ms`; box.append(b); }
  const lbl = document.createElement('span'); lbl.className = 'skel-label'; lbl.textContent = 'RECEIVING DATA…'; box.append(lbl);
  return box;
}
