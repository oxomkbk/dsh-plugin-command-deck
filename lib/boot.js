// Startup animation and HUD overlay, injected into DSH's index.html (see index.js). Plain DOM + CSS so it renders in
// the very first frame, before React or any plugin bundle exists. It reads the console settings from the
// `__CDECK__` global row, sets the DSH skin attributes on <body>, plays the boot sequence and exposes
// `window.__CDECK_BOOT__` = { ready(), play(), skip() } — the browser half calls ready() once DSH is up and play()
// from the console's "Replay" button. Only transform / opacity animate. A failed plugin load cannot strand the
// overlay: it dismisses itself after 8 s.

export const bootCss = () => `
#cdeck-boot { position: fixed; inset: 0; z-index: 2147483600; overflow: hidden; display: grid; place-items: center; cursor: pointer;
  background: radial-gradient(ellipse 70% 60% at 50% 46%, rgba(var(--cdk-accent-rgb), .14), transparent 70%), var(--cdk-bg, #020a12); color: var(--cdk-fg, #d8f6ff);
  font-family: var(--cdk-mono, monospace); transition: opacity .6s ease, transform .7s cubic-bezier(.2,1,.3,1); }
#cdeck-boot.out { opacity: 0; transform: scale(1.06); pointer-events: none; }
#cdeck-boot .cb-floor { position: absolute; left: -50%; right: -50%; bottom: -10%; height: 70%; transform-origin: 50% 0; transform: perspective(520px) rotateX(72deg);
  background: linear-gradient(rgba(var(--cdk-accent-rgb), .55) 1px, transparent 1px) 0 0 / 100% 48px, linear-gradient(90deg, rgba(var(--cdk-accent-rgb), .45) 1px, transparent 1px) 0 0 / 48px 100%;
  mask: linear-gradient(transparent, #000 30%, #000 70%, transparent); -webkit-mask: linear-gradient(transparent, #000 30%, #000 70%, transparent); opacity: .55; }
#cdeck-boot .cb-floor i { position: absolute; inset: -48px 0 0; background: inherit; animation: cbfloor 1.2s linear infinite; }
@keyframes cbfloor { to { transform: translateY(48px); } }
#cdeck-boot .cb-rings { position: absolute; width: min(62vmin, 560px); aspect-ratio: 1; }
#cdeck-boot .cb-rings i { position: absolute; inset: 0; border-radius: 50%; border: 1px solid rgba(var(--cdk-accent-rgb), .55); }
#cdeck-boot .cb-rings i:nth-child(1) { border-style: dashed; animation: cbspin 14s linear infinite; }
#cdeck-boot .cb-rings i:nth-child(2) { inset: 9%; border-width: 2px; border-color: rgba(var(--cdk-accent-rgb), .9) transparent rgba(var(--cdk-accent-rgb), .9) transparent; animation: cbspin 3.2s cubic-bezier(.6,0,.4,1) infinite reverse; }
#cdeck-boot .cb-rings i:nth-child(3) { inset: 19%; border-color: var(--cdk-accent2, #ffb347) transparent transparent; border-width: 3px; animation: cbspin 1.6s linear infinite; }
#cdeck-boot .cb-rings i:nth-child(4) { inset: 30%; border: 0; background: radial-gradient(circle, rgba(var(--cdk-accent-rgb), .35), transparent 62%); animation: cbpulse 1.6s ease-in-out infinite; }
@keyframes cbspin { to { transform: rotate(360deg); } }
@keyframes cbpulse { 50% { transform: scale(1.12); opacity: .5; } }
#cdeck-boot .cb-core { position: relative; text-align: center; padding: 0 24px; }
#cdeck-boot .cb-logo { font: 900 clamp(26px, 5vw, 64px) / 1 var(--cdk-disp, sans-serif); letter-spacing: .28em; margin-right: -.28em; color: #fff;
  text-shadow: 0 0 18px rgba(var(--cdk-accent-rgb), .9), 0 0 48px rgba(var(--cdk-accent-rgb), .5); animation: cbin .9s cubic-bezier(.2,1,.3,1) both; }
#cdeck-boot .cb-x { margin: 14px 0 26px; font: 600 12px var(--cdk-mono, monospace); letter-spacing: .5em; color: var(--cdk-accent2, #ffb347); animation: cbin .9s .25s cubic-bezier(.2,1,.3,1) both; }
@keyframes cbin { from { opacity: 0; transform: translateY(14px) scale(.96); } }
#cdeck-boot .cb-log { min-height: 110px; text-align: left; display: inline-block; font: 13px/1.7 var(--cdk-mono, monospace); color: var(--cdk-dim, #6f97a8); }
#cdeck-boot .cb-log div { animation: cbline .35s ease-out both; white-space: nowrap; }
#cdeck-boot .cb-log div::before { content: '▸ '; color: var(--cdk-accent, #49e6ff); }
#cdeck-boot .cb-log div.ok::after { content: '  [ OK ]'; color: var(--cdk-accent, #49e6ff); }
@keyframes cbline { from { opacity: 0; transform: translateX(-8px); } }
#cdeck-boot .cb-bar { width: min(420px, 70vw); height: 3px; margin: 18px auto 0; background: rgba(var(--cdk-accent-rgb), .15); overflow: hidden; }
#cdeck-boot .cb-bar i { display: block; height: 100%; background: var(--cdk-accent, #49e6ff); box-shadow: 0 0 12px var(--cdk-accent, #49e6ff); transform-origin: 0 50%; transform: scaleX(0); transition: transform .4s ease; }
#cdeck-boot .cb-skip { position: absolute; bottom: 22px; left: 0; right: 0; text-align: center; font: 11px var(--cdk-mono, monospace); letter-spacing: .3em; color: var(--cdk-dim, #6f97a8); opacity: .7; }
#cdeck-boot .cb-scan { position: absolute; inset: 0; pointer-events: none; background: repeating-linear-gradient(0deg, rgba(0, 0, 0, .22) 0 1px, transparent 1px 3px); }
#cdeck-boot.quick .cb-log, #cdeck-boot.quick .cb-floor { display: none; }
#cdeck-boot.still *, #cdeck-boot.still { animation: none !important; transition-duration: .2s !important; }
body[data-cdeck-noscan] #cdeck-boot .cb-scan { display: none; }
/* HUD overlay over DSH: corner brackets, a slow scan line and a vignette — never intercepts input */
#cdeck-hud { position: fixed; inset: 0; z-index: 2147483000; pointer-events: none; display: none; contain: layout paint; }
body[data-cdeck-hud="on"] #cdeck-hud { display: block; }
#cdeck-hud i { position: absolute; width: 26px; height: 26px; border: 0 solid rgba(var(--cdk-accent-rgb), .7); }
#cdeck-hud .h-tl { left: 6px; top: 6px; border-left-width: 2px; border-top-width: 2px; } #cdeck-hud .h-tr { right: 6px; top: 6px; border-right-width: 2px; border-top-width: 2px; }
#cdeck-hud .h-bl { left: 6px; bottom: 6px; border-left-width: 2px; border-bottom-width: 2px; } #cdeck-hud .h-br { right: 6px; bottom: 6px; border-right-width: 2px; border-bottom-width: 2px; }
#cdeck-hud .h-scan { left: 0; right: 0; top: 0; width: auto; height: 48px; border: 0; opacity: 0; background: linear-gradient(transparent, rgba(var(--cdk-accent-rgb), .025) 60%, rgba(var(--cdk-accent-rgb), .09) 97%, transparent);
  animation: hscan 14s linear 3s infinite; }
@keyframes hscan { 0% { transform: translateY(-48px); opacity: 1; } 40% { transform: translateY(100vh); opacity: 1; } 41%, 100% { opacity: 0; } }
#cdeck-hud .h-lines { inset: 0; width: auto; height: auto; border: 0; background: repeating-linear-gradient(0deg, rgba(0, 0, 0, .06) 0 1px, transparent 1px 3px); }
body[data-cdeck-noscan] #cdeck-hud .h-lines { display: none; }
#cdeck-hud .h-vig { inset: 0; width: auto; height: auto; border: 0; background: radial-gradient(ellipse 85% 80% at 50% 50%, transparent 70%, rgba(0, 0, 0, .28) 100%); }
body[data-cdeck-skin="arctic"] #cdeck-hud .h-vig, body[data-cdeck-skin="brutal"] #cdeck-hud .h-vig { display: none; }
@media (prefers-reduced-motion: reduce) { #cdeck-boot *, #cdeck-hud * { animation: none !important; } }
`

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

export const bootHtml = (s) => `<template id="cdeck-boot-tpl"><div id="cdeck-boot" role="status" aria-live="polite" data-cdeck-t="${esc(s.theme ?? 'jarvis')}">
<div class="cb-floor"><i></i></div><div class="cb-rings"><i></i><i></i><i></i><i></i></div>
<div class="cb-core"><div class="cb-logo">COMMAND//DECK</div><div class="cb-x">× DEEPSEEK HARNESS</div><div class="cb-log"></div><div class="cb-bar"><i></i></div></div>
<div class="cb-scan"></div><div class="cb-skip"></div></div></template>
<div id="cdeck-hud" aria-hidden="true" data-cdeck-t="${esc(s.theme ?? 'jarvis')}"><i class="h-lines"></i><i class="h-vig"></i><i class="h-scan"></i><i class="h-tl"></i><i class="h-tr"></i><i class="h-bl"></i><i class="h-br"></i></div>`

// Classic inline script — must not contain the closing script tag sequence.
export const bootScript = () => `(function () {
  var D = window.__CDECK__ || {}, C = D.config || {}, body = document.body;
  var zh = /^zh/i.test(navigator.language || '');
  // a dark skin keeps DSH in its dark palette (light skins in the light one); the user's own choice comes back with the skin off
  var LIGHT = { brutal: 1, arctic: 1 }, want = null;
  function hold() { if (want !== null && body.hasAttribute('data-ds-dark-theme') !== want) body.toggleAttribute('data-ds-dark-theme', want); }
  if (window.MutationObserver) new MutationObserver(hold).observe(body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] });
  function attrs(c) {
    var t = c.theme || 'jarvis';
    if (c.skin !== false) {
      if (want === null) body.setAttribute('data-cdeck-ds-dark', body.hasAttribute('data-ds-dark-theme') ? '1' : '0');
      want = !LIGHT[t]; hold();
    } else if (want !== null) { want = null; body.toggleAttribute('data-ds-dark-theme', body.getAttribute('data-cdeck-ds-dark') === '1'); }
    if (c.skin !== false) body.setAttribute('data-cdeck-skin', t); else body.removeAttribute('data-cdeck-skin');
    if (c.hud !== false) body.setAttribute('data-cdeck-hud', 'on'); else body.removeAttribute('data-cdeck-hud');
    if (c.scanlines === false) body.setAttribute('data-cdeck-noscan', ''); else body.removeAttribute('data-cdeck-noscan');
    var hud = document.getElementById('cdeck-hud'); if (hud) hud.setAttribute('data-cdeck-t', t);
  }
  attrs(C);
  var LINES = zh ? ['DeepSeek Harness 内核 · 启动', 'Cordis 插件树 · 已挂载', '会话与工具 · 就绪', '指挥台桥接 · 已连接', '全息地球 · 已校准', '全部系统 · 正常']
                 : ['DEEPSEEK HARNESS KERNEL · BOOT', 'CORDIS PLUGIN TREE · MOUNTED', 'SESSIONS & TOOLS · READY', 'COMMAND DECK BRIDGE · LINKED', 'HOLO-GLOBE · CALIBRATED', 'ALL SYSTEMS NOMINAL'];
  var api = { ready: function () {}, play: function () {}, skip: function () {}, attrs: attrs, running: false };
  window.__CDECK_BOOT__ = api;
  function run(cfg, force) {
    var mode = cfg.boot || 'session', key = 'cdeck.boot.seen';
    var seen = false; try { seen = sessionStorage.getItem(key) === '1'; } catch (e) {}
    if (!force && (mode === 'off' || (mode === 'session' && seen))) { api.ready = function () {}; return; }
    try { sessionStorage.setItem(key, '1'); } catch (e) {}
    var tpl = document.getElementById('cdeck-boot-tpl'); if (!tpl) return;
    var old = document.getElementById('cdeck-boot'); if (old) old.remove();
    var el = tpl.content.firstElementChild.cloneNode(true);
    el.setAttribute('data-cdeck-t', cfg.theme || 'jarvis');
    var quick = cfg.bootStyle === 'quick', still = (cfg.motion === 0) || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (quick) el.classList.add('quick'); if (still) el.classList.add('still');
    el.querySelector('.cb-skip').textContent = zh ? '点击或按 Esc 跳过' : 'CLICK OR PRESS ESC TO SKIP';
    body.appendChild(el); api.running = true;
    var t0 = Date.now(), minMs = quick ? 1000 : 2600, isReady = !!force, gone = false, log = el.querySelector('.cb-log'), bar = el.querySelector('.cb-bar i');
    var logo = el.querySelector('.cb-logo'), final = logo.textContent, G = '01<>/\\\\|=+*#%$ABCDEFXZ_[]';
    if (!still) { var k = 0, dec = setInterval(function () { k += 1; var n = Math.floor(final.length * k / 14), s = final.slice(0, n);
      for (var i = n; i < final.length; i++) s += G.charAt(Math.floor(Math.random() * G.length)); logo.textContent = s; if (k >= 14) { clearInterval(dec); logo.textContent = final; } }, 45); }
    var i = 0, step = quick ? 0 : Math.floor(minMs / (LINES.length + 1));
    var tick = setInterval(function () {
      if (i < LINES.length && !quick) { var d = document.createElement('div'); d.textContent = LINES[i]; if (i < LINES.length - 1) d.className = 'ok'; log.appendChild(d); }
      i += 1; bar.style.transform = 'scaleX(' + Math.min(1, (Date.now() - t0) / minMs) + ')';
      if ((isReady && Date.now() - t0 >= minMs) || Date.now() - t0 > 8000) finish();
    }, quick ? 120 : step);
    function finish() {
      if (gone) return; gone = true; clearInterval(tick); bar.style.transform = 'scaleX(1)';
      setTimeout(function () { el.classList.add('out'); setTimeout(function () { el.remove(); api.running = false; }, 750); }, quick ? 80 : 260);
    }
    api.ready = function () { isReady = true; if (Date.now() - t0 >= minMs) finish(); };
    api.skip = finish;
    el.addEventListener('click', finish);
    addEventListener('keydown', function (e) { if (e.key === 'Escape') finish(); }, { once: true });
  }
  api.play = function (cfg) { run(cfg || C, true); };
  if (body) run(C, false);
})();`
