// Assistant answer widgets (shown at the top of the SUMMARY panel): weather, world clock, calculation,
// unit / currency conversion, notes and reminders — the "personal assistant" half of the deck.
// Data comes from dashboard.widgets (backend/tools/plugins/assistant.py). Clocks and countdowns tick live.
import { t, locale, isZh } from '../core/i18n.js';

const el = (tag, c, txt) => { const e = document.createElement(tag); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; };
// weather glyphs as inline SVG (emoji fonts are not guaranteed on every machine)
const WX = {
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
  part: '<circle cx="8.5" cy="8.5" r="3.2"/><path d="M8.5 2.5v1.6M2.5 8.5h1.6M4.3 4.3l1.1 1.1M12.7 4.3l-1.1 1.1"/><path d="M9 19.5h9a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.6 1.4A2.8 2.8 0 0 0 9 19.5z"/>',
  cloud: '<path d="M7 18.5h10.5a4 4 0 0 0 0-8 6 6 0 0 0-11.4 1.8A3.2 3.2 0 0 0 7 18.5z"/>',
  fog: '<path d="M7 13.5h10.5a4 4 0 0 0 0-8 6 6 0 0 0-11.4 1.8A3.2 3.2 0 0 0 7 13.5z"/><path d="M4 17h16M6 20.5h12"/>',
  rain: '<path d="M7 14.5h10.5a4 4 0 0 0 0-8 6 6 0 0 0-11.4 1.8A3.2 3.2 0 0 0 7 14.5z"/><path d="M8.5 17.5l-1 3M12.5 17.5l-1 3M16.5 17.5l-1 3"/>',
  snow: '<path d="M7 14.5h10.5a4 4 0 0 0 0-8 6 6 0 0 0-11.4 1.8A3.2 3.2 0 0 0 7 14.5z"/><path d="M8 18.5h.01M12 20.5h.01M16 18.5h.01M10 21.5h.01M14 17.5h.01"/>',
  storm: '<path d="M7 14.5h10.5a4 4 0 0 0 0-8 6 6 0 0 0-11.4 1.8A3.2 3.2 0 0 0 7 14.5z"/><path d="m12.5 15.5-2 3.5h3l-2 3.5"/>',
};
export function wxIcon(code) {
  const k = code == null ? 'cloud' : code <= 1 ? 'sun' : code === 2 ? 'part' : code === 3 ? 'cloud' : code < 50 ? 'fog' : code >= 95 ? 'storm' : (code >= 71 && code <= 77) || code === 85 || code === 86 ? 'snow' : 'rain';
  const s = document.createElement('span'); s.className = `wx wx-${k}`;
  s.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${WX[k]}</svg>`;
  return s;
}
const n0 = (x) => (x == null ? '–' : Math.abs(x - Math.round(x)) < 0.05 ? String(Math.round(x)) : x.toFixed(1));

export function renderWidgets(list) {
  const box = el('div', 'widgets');
  for (const w of list || []) {
    const f = BUILD[w.kind]; if (!f) continue;
    const card = el('section', `wdg wdg-${w.kind}`); f(card, w); box.append(card);
  }
  return box.children.length ? box : null;
}

const BUILD = {
  weather(c, w) {
    const n = w.now || {}, top = el('div', 'wdg-top');
    const ico = el('span', 'wdg-ico'); ico.append(wxIcon(n.code));
    top.append(ico, el('b', 'wdg-big', `${n0(n.temp)}°`),
      Object.assign(el('div', 'wdg-txt'), { innerHTML: '' }));
    const txt = top.lastChild; txt.append(el('b', null, w.place), el('span', null, `${isZh() ? n.zh : n.en} · ${t('feels')} ${n0(n.feels)}° · ${t('humidity')} ${n.humidity ?? '–'}% · ${t('wind')} ${n0(n.wind)} km/h`));
    c.append(top);
    const days = w.days || [];
    if (days.length) {
      const lo = Math.min(...days.map((d) => d.min)), hi = Math.max(...days.map((d) => d.max)), span = Math.max(1, hi - lo);
      const g = el('div', 'wdg-days');
      days.forEach((d, i) => {
        const r = el('div', `wd${i === (w.focus_day || 0) && w.focus_day < 7 ? ' on' : ''}`);
        const day = i === 0 ? t('Today') : new Date(`${d.date}T12:00`).toLocaleDateString(locale(), { weekday: 'short' });
        const bar = el('span', 'wd-bar'), fill = el('i'); fill.style.left = `${((d.min - lo) / span) * 100}%`; fill.style.width = `${Math.max(4, ((d.max - d.min) / span) * 100)}%`; bar.append(fill);
        const di = el('span', 'wd-i'); di.append(wxIcon(d.code));
        r.append(el('span', 'wd-d', day), di, el('span', 'wd-lo', `${n0(d.min)}°`), bar, el('span', 'wd-hi', `${n0(d.max)}°`),
          el('span', 'wd-r', d.rain != null ? `☂ ${d.rain}%` : ''));
        r.title = `${d.date} · ${isZh() ? d.zh : d.en} · ${n0(d.min)}–${n0(d.max)}°C · ${t('rain chance')} ${d.rain ?? '–'}%`;
        g.append(r);
      });
      c.append(g);
    }
    c.append(el('div', 'wdg-src', `open-meteo.com · ${w.tz || ''}`));
  },
  time(c, w) {
    const clock = el('b', 'wdg-big w-live'); clock.dataset.tz = w.tz;
    const date = el('span', 'w-live-date'); date.dataset.tz = w.tz;
    const top = el('div', 'wdg-top'), txt = el('div', 'wdg-txt');
    txt.append(el('b', null, w.place), date, el('span', null, `${w.tz} · UTC${w.utc_offset_h >= 0 ? '+' : ''}${w.utc_offset_h}${w.diff_h ? ` · ${t(w.diff_h > 0 ? '{h} h ahead of you' : '{h} h behind you', { h: Math.abs(w.diff_h) })}` : ''}`));
    top.append(el('span', 'wdg-ico', '◷'), clock, txt); c.append(top); tick();
  },
  calc(c, w) { c.append(el('span', 'wdg-expr', `${w.expression} =`), el('b', 'wdg-big', w.display)); },
  convert(c, w) { c.append(el('span', 'wdg-expr', `${w.value} ${w.from} →`), el('b', 'wdg-big', `${fmt(w.result)} ${w.to}`)); },
  currency(c, w) {
    c.append(el('span', 'wdg-expr', `${fmt(w.amount)} ${w.from} →`), el('b', 'wdg-big', `${fmt(w.result, 2)} ${w.to}`),
      el('div', 'wdg-src', `1 ${w.from} = ${w.rate} ${w.to} · ${w.date || ''} · ${w.source}`));
  },
  note(c, w) { c.append(el('span', 'wdg-expr', t('REMEMBERED')), el('b', 'wdg-mid', `“${w.saved}”`), el('div', 'wdg-src', t('{n} notes · stored only on this machine', { n: w.count }))); },
  notes(c, w) {
    c.append(el('span', 'wdg-expr', t('YOUR NOTES · {n}', { n: w.count })));
    const ul = el('ul', 'wdg-notes'); for (const x of w.notes || []) { const li = el('li', null, x.text); li.title = x.at; ul.append(li); }
    if (!w.notes?.length) ul.append(el('li', 'dim', t('nothing saved yet — say “remember that …”')));
    c.append(ul);
  },
  reminder(c, w) {
    const cd = el('b', 'wdg-big w-count'); cd.dataset.due = w.due_ms;
    c.append(el('span', 'wdg-expr', t('REMINDER')), el('b', 'wdg-mid', `“${w.text}”`), cd); tick();
  },
};
const fmt = (x, d = 4) => (x == null ? '–' : Number(x).toLocaleString(locale(), { maximumFractionDigits: Math.abs(x) >= 100 ? 2 : d }));

/** One shared 1 s ticker for every live clock / countdown on screen. */
function tick() {
  for (const e of document.querySelectorAll('.w-live')) {
    try { e.textContent = new Date().toLocaleTimeString(locale(), { timeZone: e.dataset.tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }); } catch { e.textContent = '--:--'; }
  }
  for (const e of document.querySelectorAll('.w-live-date')) {
    try { e.textContent = new Date().toLocaleDateString(locale(), { timeZone: e.dataset.tz, weekday: 'long', month: 'short', day: 'numeric' }); } catch { /* ignore */ }
  }
  for (const e of document.querySelectorAll('.w-count')) {
    const s = Math.max(0, Math.round((+e.dataset.due - Date.now()) / 1000));
    e.textContent = s ? `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : t('DUE');
  }
}
setInterval(tick, 1000);
