// UI language (English / 中文). One function, t(english, vars), translates every string in the deck:
// the English text is the key, so untranslated strings degrade to English instead of breaking.
// Static markup opts in with data-i18n (text), data-i18n-title, data-i18n-ph (placeholder), data-i18n-aria.
// Switching language re-labels the DOM in place and emits `lang:changed` so views re-render their own text.
// Agent replies follow the language you *ask* in; the UI language is sent with every run as a hint.
import { bus } from './bus.js';
import { settings, saveSettings } from './store.js';
import { ZH } from './i18n-zh.js';

export const LANGS = [['en', 'English'], ['zh', '中文']];
export const lang = () => (settings.lang === 'zh' ? 'zh' : 'en');
export const isZh = () => lang() === 'zh';

/** Translate an English UI string; `{name}` placeholders are filled from vars. */
export function t(s, vars) {
  let out = s;
  if (isZh()) { out = ZH[s]; if (out === undefined) { out = s; if (/[A-Za-z]{2}/.test(s)) (window.__i18nMiss ||= new Set()).add(s); } }
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
  return out;
}
/** Locale for dates / numbers. */
export const locale = () => (isZh() ? 'zh-CN' : 'en-US');
/** Speech recognition language that matches the UI (used when Settings → recognition language is “auto”). */
export const speechLang = () => (isZh() ? 'zh-CN' : 'en-US');

const ATTRS = [['i18nTitle', 'title'], ['i18nPh', 'placeholder'], ['i18nAria', 'aria-label']];
export function applyI18n(root = document) {
  document.documentElement.lang = isZh() ? 'zh-CN' : 'en';
  document.body.dataset.lang = lang();
  for (const el of root.querySelectorAll('[data-i18n]')) {
    if (!el.dataset.i18n) el.dataset.i18n = el.textContent.trim();
    el.textContent = t(el.dataset.i18n);
  }
  for (const [ds, attr] of ATTRS) {
    const sel = `[data-${ds.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}]`;
    for (const el of root.querySelectorAll(sel)) {
      if (!el.dataset[ds]) el.dataset[ds] = el.getAttribute(attr) || '';
      el.setAttribute(attr, t(el.dataset[ds]));
    }
  }
}
export function setLang(l) {
  if (l === settings.lang) return;
  settings.lang = l === 'zh' ? 'zh' : 'en'; saveSettings();
  applyI18n();
  bus.emit('lang:changed', settings.lang);
}
