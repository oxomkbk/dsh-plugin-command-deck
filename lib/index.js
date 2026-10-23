// dsh-plugin-command-deck — Host half (Cordis plugin, Node).
//
// 1. CONSOLE SETTINGS: `Config` is the plugin entry's settings namespace (`command-deck`). Every field is volatile,
//    so the browser console edits it live through DSH's own settings service (ctx.configForms on the client),
//    and DSH persists it in the profile's cordis.patch.yml like any built-in setting.
// 2. STARTUP: `webserver/index-inject` rows put the boot animation, the DSH skin stylesheet and the HUD overlay
//    into DSH's index.html itself, so the animation is on screen in the first frame — before any plugin bundle
//    has loaded. The browser half dismisses it once the app is up (a fallback timer covers a failed load).
// 3. THE DECK: the Command Deck web app is served from this package under /command-deck/ on DSH's own web server,
//    behind DSH's own browser admission (same trust fence and signed cookie as /api). The browser half embeds it
//    as a DSH panel and bridges it to DSH Sessions over postMessage; no extra backend or port is involved.
import z from '@deepseek-ai/schemastery'
import { readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { bootCss, bootHtml, bootScript } from './boot.js'
import { skinCss, THEME_IDS } from './skins.js'

export const name = 'command-deck'
export const inject = ['webServer', 'connection']   // the same pair DSH's own static frontend server uses

/** The console's settings (all live). */
export const Config = z.object({
  theme: z.union(THEME_IDS).default('jarvis').description('Design language for the deck and the DSH skin').volatile(),
  skin: z.boolean().default(true).description('Re-skin the DeepSeek Harness interface in the selected design language').volatile(),
  hud: z.boolean().default(true).description('HUD overlay over DSH: corner brackets, scan line and vignette').volatile(),
  boot: z.union(['every', 'session', 'off']).default('session').description('Startup animation: every launch, once per browser session, or off').volatile(),
  bootStyle: z.union(['cinematic', 'quick']).default('cinematic').description('Cinematic (about 2.6 s) or quick (about 1 s) startup').volatile(),
  motion: z.natural().min(0).max(100).default(100).description('Motion intensity in percent (0 = still)').volatile(),
  scanlines: z.boolean().default(true).description('CRT scanlines in the deck and the HUD overlay').volatile(),
  sound: z.boolean().default(true).description('Deck sound effects').volatile(),
  tilt: z.boolean().default(true).description('3D cockpit: the deck side docks curve toward you').volatile(),
  brand: z.boolean().default(true).description('COMMAND//DECK mark in the DSH sidebar').volatile(),
})

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'deck')
const MOUNT = '/command-deck/'
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.task': 'application/octet-stream', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
}

/** Snapshot of the live settings, as the boot script and the browser half read them. */
function snapshot(config) {
  const out = {}
  for (const key of Object.keys(Config.dict ?? {})) {
    const field = config[key]
    out[key] = field && typeof field.get === 'function' ? field.get() : field
  }
  return out
}

/** Map a request path below /command-deck/ to a file inside the deck directory (never outside it). */
function resolveAsset(urlPath) {
  let rel
  try { rel = decodeURIComponent(urlPath.slice(MOUNT.length)) } catch { return null }
  if (rel === '' || rel.endsWith('/')) rel += 'index.html'
  const file = path.resolve(ROOT, rel)
  return file === ROOT || file.startsWith(ROOT + path.sep) ? file : null
}

/** Answers for the deck's own /api calls that DSH owns now (models, search, transcription). */
function deckApi(rel, res) {
  const json = (status, body) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)) }
  if (rel === 'api/asr') return json(200, { enabled: false, ready: false, provider: null, profiles: {}, presets: {}, managedBy: 'deepseek-harness' })
  return json(404, { ok: false, error: 'managed by DeepSeek Harness', managedBy: 'deepseek-harness' })
}

export function apply(ctx, config) {
  // our own console page replaces the auto-generated settings form
  ctx.inject(['settings'], (child) => { child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)) })

  // 2. startup animation + DSH skin + HUD, inside index.html (first frame, before plugin bundles)
  ctx.on('webserver/index-inject', (table) => {
    const s = snapshot(config)
    // The skin + boot CSS is ~59 KB. Inline style rows travel through DSH's injection table, which has a hard
    // budget: past it the rows are silently truncated and the following ones (the boot script!) never arrive —
    // the skin then stops applying and the page looks half-styled. Serve it as a stylesheet instead: same bytes,
    // same first-paint blocking, 3 % of the row budget.
    table.push(
      { kind: 'global', name: '__CDECK__', value: { config: s, mount: MOUNT } },
      { kind: 'html', placement: 'head', html: `<link rel="stylesheet" href="${MOUNT}skins.css">` },
      { kind: 'html', placement: 'body', html: bootHtml(s) },
      { kind: 'script', placement: 'body', text: bootScript() },
    )
    const inline = bootHtml(s).length + bootScript().length + JSON.stringify({ config: s, mount: MOUNT }).length
    if (inline > 48 * 1024) console.warn('[command-deck] inline boot payload is ' + Math.round(inline / 1024) + ' KB — DSH truncates oversized injection rows, so keep it small or externalise it.')
  })

  // 3. the deck web app under /command-deck/, behind DSH's own browser admission
  const admitted = (req, res) => {
    const verdict = ctx.connection.admit(req)
    if ('peer' in verdict) return true
    res.writeHead(verdict.rejection, { 'content-type': 'text/plain; charset=utf-8' }); res.end('Open DeepSeek Harness first (dsh web) — the deck shares its sign-in.')
    return false
  }
  const handler = async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://local')
    if (url.pathname === MOUNT.slice(0, -1)) { res.writeHead(308, { location: MOUNT + url.search }); res.end(); return }
    if (req.method !== 'GET' && req.method !== 'HEAD' && !url.pathname.startsWith(MOUNT + 'api/')) { res.writeHead(405); res.end(); return }
    if (!admitted(req, res)) return
    const rel = url.pathname.slice(MOUNT.length)
    if (rel.startsWith('api/')) return deckApi(rel, res)
    if (rel === 'skins.css') {                      // generated: every design language's DSH tokens + the boot CSS
      const css = Buffer.from(skinCss(MOUNT) + bootCss(), 'utf8')
      res.writeHead(200, { 'content-type': 'text/css; charset=utf-8', 'content-length': String(css.length), 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' })
      if (req.method === 'HEAD') { res.end(); return }
      res.end(css); return
    }
    const file = resolveAsset(url.pathname)
    if (file === null) { res.writeHead(400); res.end(); return }
    let info
    try { info = await stat(file) } catch { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found'); return }
    if (!info.isFile()) { res.writeHead(404); res.end(); return }
    const ext = path.extname(file).toLowerCase()
    const headers = {
      'content-type': MIME[ext] ?? 'application/octet-stream',
      'content-length': String(info.size),
      // app code must revalidate: a browser that cached the previous release would pair the new index.html
      // with an old main.js (the deck's own assets carry no version query). Vendored libs and media keep the
      // long TTL — they never change between releases.
      'cache-control': ext === '.html' || rel.startsWith('js/') || rel.startsWith('css/') ? 'no-cache' : 'public, max-age=3600',
      'x-content-type-options': 'nosniff',
      'cross-origin-resource-policy': 'same-origin',
    }
    if (ext === '.html') headers['content-security-policy'] = "frame-ancestors 'self'"
    res.writeHead(200, headers)
    if (req.method === 'HEAD') { res.end(); return }
    res.end(await readFile(file))
  }
  // prefix routes match whole path segments: '/command-deck' covers '/command-deck' and everything below it
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: MOUNT.slice(0, -1), handler }))
}
