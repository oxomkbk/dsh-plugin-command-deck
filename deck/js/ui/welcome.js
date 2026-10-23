// First-screen welcome HUD + designed empty state + radial (HUD ring) menu.
import { bus } from '../core/bus.js';
import { ICONS } from './icons.js';
import { sfx } from '../fx/sound.js';
import { t } from '../core/i18n.js';
import { EMBEDDED } from '../core/host.js';
const el = (t, c, txt) => { const e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; };

const RINGS = `<svg class="hud-rings" viewBox="-100 -100 200 200" aria-hidden="true">
  <circle r="94" class="r r1"/><circle r="84" class="r r2"/><circle r="70" class="r r3"/><circle r="56" class="r r4"/>
  <g class="ticks">${Array.from({ length: 60 }, (_, i) => `<line x1="0" y1="-90" x2="0" y2="${i % 5 ? -87 : -83}" transform="rotate(${i * 6})"/>`).join('')}</g>
  <path class="arc a1" d="M0,-78 A78,78 0 0,1 67.5,39"/><path class="arc a2" d="M0,62 A62,62 0 0,1 -53.7,-31"/>
  <polygon class="hex" points="0,-30 26,-15 26,15 0,30 -26,15 -26,-15"/><circle r="6" class="core"/></svg>`;

const BOOT = () => [t('> link: orbital uplink ............ OK'), t('> planetary engines: ignition test ... OK'), t('> agent core: task graph + 15 tools armed .. OK'), t('> language: English / 中文 ........... OK'), t('> privacy: camera frames never drawn / uploaded')];

export class Welcome {
  constructor({ onSample, onCall, onGestures, onType, sampleText = () => '' }) {
    this.m = document.getElementById('welcome'); this.sampleText = sampleText;
    this.build();
    bus.on('lang:changed', () => { this.build(); if (this.open) this.show(); });
    this.m.addEventListener('click', (e) => {
      const b = e.target.closest('[data-w]');
      if (!b) { if (e.target === this.m) this.hide(); return; }
      sfx.click();
      if (b.dataset.w === 'lang') { bus.emit('lang:toggle'); return; }
      ({ call: onCall, gestures: onGestures, type: onType, sample: onSample, enter: () => {} })[b.dataset.w]?.();
      this.hide();
    });
  }
  build() {
    this.m.innerHTML = `<div class="wl-top">
        <div class="wl-kicker">${t('PERSONAL AI · ORBITAL COMMAND')}</div>
        <div class="wl-brand glitch" data-text="COMMAND//DECK">COMMAND//DECK</div>
        <div class="wl-sub">${t('AGENT')} <b id="wl-state">${t('IDLE')}</b> · ${t('VOICE')} <b id="wl-call">${t('OFF')}</b></div></div>
      <div class="wl-boot" id="wl-boot"></div>
      <div class="wl-bottom">
        <div class="wl-inputs">
          <button data-w="call"><i>${ICONS.phone}</i><b>${t('VOICE CALL')}</b><span>${t('talk continuously · interrupt any time')}</span></button>
          <button data-w="gestures"><i>${ICONS.hand}</i><b>${t('GESTURES')}</b><span>${t('point & pinch · pointer snaps to targets')}</span></button>
          <button data-w="type"><i>${ICONS.keys}</i><b>${t('TYPE')}</b><span>${t('any instruction, English or 中文 · Ctrl/⌘K for everything')}</span></button>
        </div>
        ${EMBEDDED ? '' : `<button class="wl-sample" data-w="sample">▶ ${t('RUN SAMPLE TASK')} <span></span></button>`}
        <div class="wl-row"><button class="wl-enter" data-w="enter">${t('ENTER DECK ›')}</button><button class="wl-lang" data-w="lang">${t('中文 / EN')}</button>${EMBEDDED ? '' : `<span class="wl-note">${t('The docks show sample results from a real run — your first task replaces them.')}</span>`}</div></div>`;
    const s0 = this.m.querySelector('.wl-sample span');
    if (s0) s0.textContent = `“${this.sampleText()}”`;
  }
  get open() { return !this.m.hidden; }
  show() {
    this.m.hidden = false; document.body.classList.add('welcoming'); this.m.classList.remove('out');
    const box = this.m.querySelector('#wl-boot'); box.textContent = '';
    let i = 0, j = 0; clearInterval(this.bt); const lines = BOOT();
    this.bt = setInterval(() => {                       // typed boot log
      if (i >= lines.length) { clearInterval(this.bt); return; }
      box.textContent += lines[i][j++] || '';
      if (j > lines[i].length) { box.textContent += '\n'; i++; j = 0; }
    }, 14);
  }
  hide() {
    if (this.m.hidden) return;
    clearInterval(this.bt);
    this.m.classList.add('out'); document.body.classList.remove('welcoming');
    setTimeout(() => { this.m.hidden = true; }, 520);
  }
  setStates(agent, call) {
    const a = document.getElementById('wl-state'), c = document.getElementById('wl-call');
    if (a) a.textContent = t(agent.replace('_', ' ').toUpperCase());
    if (c) c.textContent = t(call.replace('_', ' ').toUpperCase());
  }
}

export class EmptyState {
  constructor({ onRestore, onOpen, onSample }) {
    this.m = document.getElementById('empty-state');
    const build = () => { this.m.innerHTML = `<div class="es-box"><div class="es-mark">${RINGS}<div class="es-scan"></div></div>
      <b>${t('NO PANELS IN THIS WORKSPACE')}</b><p>${t('Every panel is closed. Restore the default docks, open a single panel, or launch a task — results always arrive in panels.')}</p>
      <div class="es-row"><button data-e="restore">⟲ ${t('RESTORE DEFAULT PANELS')}</button><button data-e="open">⌘K ${t('OPEN A PANEL')}</button>${EMBEDDED ? '' : `<button data-e="sample">▶ ${t('SAMPLE TASK')}</button>`}</div></div>`; };
    build(); bus.on('lang:changed', build);
    this.m.addEventListener('click', (e) => { const b = e.target.closest('[data-e]'); if (!b) return; ({ restore: onRestore, open: onOpen, sample: onSample })[b.dataset.e]?.(); });
    bus.on('deck:empty', (empty) => { this.m.hidden = !empty; });
  }
}

// Radial menu: actions arranged on a HUD ring around the pointer / fingertip.
export class Radial {
  constructor() {
    this.m = document.getElementById('radial');
    addEventListener('pointerdown', (e) => { if (!this.m.hidden && !this.m.contains(e.target)) this.close(); }, true);
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && !this.m.hidden) { this.close(); e.stopPropagation(); } }, true);
  }
  get open() { return !this.m.hidden; }
  show(x, y, title, items) {
    this.m.innerHTML = '';
    const r = Math.min(110, 60 + items.length * 7);
    const ring = el('div', 'rad-ring'); ring.style.width = ring.style.height = `${r * 2 + 64}px`;
    const c = el('div', 'rad-center', title); this.m.append(ring, c);
    items.forEach((it, i) => {
      const a = -Math.PI / 2 + (i / items.length) * Math.PI * 2;
      const b = el('button', 'rad-item'); b.innerHTML = `<i>${it.icon}</i><span></span>`; b.querySelector('span').textContent = it.label;
      b.style.transform = `translate(${Math.cos(a) * r}px, ${Math.sin(a) * r}px)`;
      b.style.animationDelay = `${i * 25}ms`;
      b.onclick = (e) => { e.stopPropagation(); this.close(); sfx.click(); it.run(); };
      this.m.append(b);
    });
    const pad = r + 50;
    this.m.style.left = `${Math.min(innerWidth - pad, Math.max(pad, x))}px`; this.m.style.top = `${Math.min(innerHeight - pad, Math.max(pad, y))}px`;
    this.m.hidden = false; sfx.open();
  }
  close() { this.m.hidden = true; }
}
