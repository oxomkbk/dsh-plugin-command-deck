// dsh-plugin-command-deck — browser half, in DSH's client module format (window.__ModuleLoader__, lazy CJS factory).
// Hand-written ES2020; React comes from the shell's shared module table.
//
//   • STARTUP   tells the pre-plugin boot animation (lib/boot.js, injected into index.html) that DSH is up.
//   • PANEL     "Command Deck" in the sidebar → the full 3D deck, embedded from /command-deck/ (served by the Host half).
//   • BRIDGE    deck ⇄ DSH Sessions over postMessage: the deck's prompts become prompts in a real DSH Session; that
//               Session's events (turns, streamed text and reasoning, tool calls and results, turn end) come back
//               as the deck's own protocol (agent_start · plan · step_update · thought_delta · tool_call_start /
//               result · observation · final / interrupted / error), so every deck view animates live DSH work.
//   • FOLLOW    a "Visualise in Command Deck" button in every conversation header attaches the deck to that Session.
//   • CONSOLE   Settings → Command Deck (and the bundle's page in Plugins): a visual control console — live preview,
//               design-language gallery, DSH skin / HUD / startup / motion controls — writing DSH settings.
window.__ModuleLoader__.load({
  id: 'dsh-plugin-command-deck',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    const React = require('react')
    const h = React.createElement
    const { useEffect, useRef, useState, useSyncExternalStore, useMemo } = React

    const NS = 'command-deck'
    const ENTRY = 'command-deck'                       // Host plugin entry id = settings namespace
    const BUNDLE = 'dsh-plugin-command-deck'
    const PANEL = 'command-deck'
    const MOUNT = (window.__CDECK__ && window.__CDECK__.mount) || '/command-deck/'
    const VERSION = '1.0.0'

    // ── design languages (mirror of the deck's js/core/themes.js)
    const FAMILIES = { holo: ['HOLOGRAPHIC', '全息'], retro: ['RETRO-FUTURE', '复古未来'], street: ['STREET · EDGE', '街头 · 锐利'], technical: ['TECHNICAL', '工程技术'], editorial: ['EDITORIAL · RAW', '编辑 · 原生'], spatial: ['SPATIAL · MINIMAL', '空间 · 极简'] }
    const THEMES = [
      ['jarvis', 'holo', 'ORBITAL', '轨道指挥', 'Holo-cyan command bridge', '全息青 · 指挥舰桥', ['#49e6ff', '#ffb347', '#00101c']],
      ['aurora', 'holo', 'AURORA', '极光', 'Polar night, frosted glass', '极夜 · 磨砂玻璃', ['#5effc8', '#b388ff', '#021018']],
      ['synthwave', 'retro', 'OUTRUN', '合成浪潮', 'Chrome sunset, endless grid', '铬色落日 · 无尽网格', ['#ff6ad5', '#ffd319', '#1a0533']],
      ['apollo', 'retro', "APOLLO '69", '阿波罗 69', 'Mission-control hardware', '任务控制台硬件', ['#ff8a3d', '#c9bfa5', '#1b1d1a']],
      ['neon', 'street', 'NEON NOIR', '霓虹黑夜', 'Magenta & electric cyan', '品红与电光青', ['#ff2bd6', '#00f0ff', '#0b0012']],
      ['mecha', 'street', 'MECHA', '机甲', 'Vertical tabs, hazard tape', '竖排标签 · 警示条', ['#9dff00', '#8f4bff', '#050505']],
      ['blueprint', 'technical', 'BLUEPRINT', '蓝图', 'Engineering drawing', '工程图纸', ['#e8f1ff', '#ff6b5b', '#0b2d5c']],
      ['terminal', 'technical', 'TERMINAL', '终端', 'Amber VT220, tmux panes', '琥珀终端 · 分屏', ['#ffb000', '#ffe8b0', '#0a0600']],
      ['brutal', 'editorial', 'BRUTALIST', '粗野主义', 'Raw blocks, hard shadows', '粗粝色块 · 硬阴影', ['#ffe500', '#111111', '#f1eee6']],
      ['monolith', 'editorial', 'MONOLITH', '黑金', 'Obsidian and gold', '黑曜石与金', ['#e8c574', '#f5efe0', '#050505']],
      ['glass', 'spatial', 'GLASS', '空间玻璃', 'Floating glass, pills', '漂浮玻璃 · 胶囊', ['#a5b4ff', '#ff9ad5', '#0b0d17']],
      ['helmet', 'spatial', 'VISOR', '头盔视窗', 'Pilot visor, no panels', '飞行员面罩 · 无面板', ['#6dff8f', '#ffd23f', '#000a04']],
      ['arctic', 'spatial', 'ARCTIC', '冰原', 'White ice-glass panels', '冰白玻璃面板', ['#e9f6ff', '#2f7bff', '#0a1a2e']],
    ]
    const DEFAULTS = { theme: 'jarvis', skin: true, hud: true, boot: 'session', bootStyle: 'cinematic', motion: 100, scanlines: true, sound: true, tilt: true, brand: true }

    // ── dictionaries
    const en = {
      panel: 'Command Deck', console: 'Command Deck', visualize: 'Visualise in Command Deck',
      'c.title': 'COMMAND//DECK CONSOLE', 'c.sub': 'Mission-control layer for DeepSeek Harness: startup, panels, skin and motion.',
      'c.preview': 'LIVE PREVIEW', 'c.replay': 'Replay startup', 'c.open': 'Open Command Deck', 'c.sample': 'Run sample in deck',
      'c.language': 'DESIGN LANGUAGE', 'c.integration': 'DEEPSEEK HARNESS INTEGRATION', 'c.startup': 'STARTUP SEQUENCE', 'c.motion': 'MOTION & EFFECTS',
      'c.skin': 'Re-skin DeepSeek Harness', 'c.skin.h': 'Chat, sidebar, menus and settings take on the selected design language.',
      'c.hud': 'HUD overlay', 'c.hud.h': 'Corner brackets, a slow scan line and a vignette over DSH. Never blocks input.',
      'c.brand': 'Deck mark in the sidebar', 'c.brand.h': 'Shows the COMMAND//DECK mark next to DSH’s own.',
      'c.boot': 'Play the startup animation', 'c.boot.every': 'Every launch', 'c.boot.session': 'Once per session', 'c.boot.off': 'Off',
      'c.style': 'Style', 'c.style.cinematic': 'Cinematic', 'c.style.quick': 'Quick',
      'c.motionLevel': 'Motion intensity', 'c.scan': 'Scanlines', 'c.sound': 'Deck sound effects', 'c.tilt': '3D cockpit (curved docks)',
      'c.reset': 'Reset console', 'c.saved': 'Saved in your DSH profile (cordis.patch.yml) — the same place as DSH’s own settings.',
      'c.status.idle': 'Bridge idle', 'c.status.follow': 'Following session {id}', 'c.status.frames': '{n} deck view(s) open',
      'c.loading': 'Loading settings…', 'c.readonly': 'These settings are pinned by a home or command-line patch and cannot be changed here.',
      'pause.unsupported': 'DeepSeek Harness has no pause — use STOP to cancel the turn, then continue.', 'follow.note': 'Command Deck is following DSH session {id}.',
      'session.gone': 'This Session is no longer in DeepSeek Harness (archived or deleted) — pick another one from the SESSIONS list.',
      'open.dsh': 'Open DSH Settings from the sidebar (gear icon) to change {what}.',
    }
    const zh = {
      panel: '指挥台', console: '指挥台', visualize: '在指挥台中可视化',
      'c.title': 'COMMAND//DECK 控制台', 'c.sub': 'DeepSeek Harness 的任务控制层：启动、面板、皮肤与动效。',
      'c.preview': '实时预览', 'c.replay': '重播启动动画', 'c.open': '打开指挥台', 'c.sample': '在指挥台运行示例',
      'c.language': '设计语言', 'c.integration': 'DEEPSEEK HARNESS 集成', 'c.startup': '启动序列', 'c.motion': '动效与特效',
      'c.skin': '为 DeepSeek Harness 换肤', 'c.skin.h': '对话、侧栏、菜单与设置采用所选设计语言。',
      'c.hud': 'HUD 叠加层', 'c.hud.h': '角标、缓慢扫描线与暗角覆盖在 DSH 之上，从不拦截操作。',
      'c.brand': '侧栏显示指挥台标识', 'c.brand.h': '在 DSH 标识旁显示 COMMAND//DECK 标志。',
      'c.boot': '播放启动动画', 'c.boot.every': '每次启动', 'c.boot.session': '每个会话一次', 'c.boot.off': '关闭',
      'c.style': '风格', 'c.style.cinematic': '电影感', 'c.style.quick': '快速',
      'c.motionLevel': '动效强度', 'c.scan': '扫描线', 'c.sound': '指挥台音效', 'c.tilt': '3D 座舱（弯曲停靠区）',
      'c.reset': '重置控制台', 'c.saved': '保存在你的 DSH 配置（cordis.patch.yml）中，与 DSH 自身设置同处。',
      'c.status.idle': '桥接空闲', 'c.status.follow': '正在跟随会话 {id}', 'c.status.frames': '已打开 {n} 个指挥台视图',
      'c.loading': '正在加载设置…', 'c.readonly': '这些设置被主目录或命令行补丁固定，无法在此修改。',
      'pause.unsupported': 'DeepSeek Harness 不支持暂停 —— 请用“停止”取消本轮，再继续。', 'follow.note': '指挥台正在跟随 DSH 会话 {id}。',
      'session.gone': '这个会话已不在 DeepSeek Harness 中（归档或删除）—— 请在“会话”列表里另选一个。',
      'open.dsh': '请从侧栏打开 DSH 设置（齿轮图标）以修改{what}。',
    }
    const fill = (s, vars) => String(s).replace(/\{(\w+)\}/g, (_, k) => (vars && k in vars ? vars[k] : `{${k}}`))
    const isZh = () => /^zh/i.test(document.documentElement.lang || navigator.language || '')

    // ── deck settings derived from the console (the deck's own store keys)
    const deckSettings = (c) => ({ theme: c.theme, animations: (c.motion ?? 100) > 0, glitch: Math.round((c.motion ?? 100) / 50 * 10) / 10, scanlines: c.scanlines !== false, sound: c.sound !== false, tilt3d: c.tilt !== false })

    // ── text helpers for DSH content blocks
    const blocksText = (blocks, kind = 'text') => (Array.isArray(blocks) ? blocks : []).filter((b) => b && b.type === kind && typeof b.text === 'string').map((b) => b.text).join('')
    const parseArgs = (s) => { try { const v = JSON.parse(s || '{}'); return v && typeof v === 'object' ? v : { input: v } } catch { return { input: String(s || '').slice(0, 200) } } }
    const URL_RX = /\bhttps?:\/\/[^\s<>()"'\]]+/g
    /** Short, human form of a Session id ("session-ab12cd…" -> "ab12cd"). */
const shortId = (id) => String(id || '').replace(/^session-/, '').slice(0, 6)
const domainOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, '') } catch { return '' } }
/** DSH appends harness-only reminders to a prompt; the deck's transcript shows what the user actually said. */
const withoutReminders = (s) => String(s || '').replace(/<system-reminder>[\s\S]*?(<\/system-reminder>|$)/gi, '').trim()
/** Harness-injected context travels as a user message; it is not something the user said. */
const HARNESS_NOISE = /^(<system-reminder>|Current runtime context\.|\[system\]|<dsh-)/i

    /** Live DSH-Session → deck-protocol translator. One Bridge per page; any number of deck iframes attach. */
    class Bridge {
      constructor(ctx) {
        this.ctx = ctx; this.frames = new Map(); this.seq = 0; this.sessionId = null; this.turn = null; this.cursor = -1
        this.config = { ...DEFAULTS }; this.listeners = new Set(); this.streamed = new Map()
        this.replaying = false; this.listSub = null; this.lastUser = null; this.pendingEcho = null
        this.log = []                                  // the followed Session's transcript, for re-attaching decks
        this.onMessage = (e) => this.message(e)
        addEventListener('message', this.onMessage)
      }
      dispose() { removeEventListener('message', this.onMessage); this.unfollow(); try { this.listSub?.() } catch { /* ignore */ } this.listSub = null }
      // status for the console
      subscribe = (fn) => { this.listeners.add(fn); return () => this.listeners.delete(fn) }
      getSnapshot = () => this.snap ??= { sessionId: this.sessionId, frames: this.frames.size, running: !!this.turn }
      changed() { this.snap = undefined; for (const fn of this.listeners) fn() }
      // transport
      isOurFrame(win) { return [...document.querySelectorAll('iframe[data-cdeck]')].some((f) => f.contentWindow === win) }
      post(win, msg) { try { win.postMessage({ source: 'dsh-bridge', ...msg }, location.origin) } catch { this.frames.delete(win) } }
      prune() { for (const win of [...this.frames.keys()]) if (win.closed || !this.isOurFrame(win)) this.frames.delete(win); this.changed() }
      event(type, data, runId) { return { v: 3, seq: ++this.seq, ts: Date.now(), replay: this.replaying, run_id: runId === undefined ? (this.turn ? this.turn.runId : null) : runId, type, data } }
      emit(type, data, runId) { const ev = this.event(type, data, runId); this.record(ev); for (const win of this.frames.keys()) this.post(win, { kind: 'event', event: ev }) }
      /** Keep the transcript so a deck that (re)mounts — panel switch, exit mid-run, DSH tab change — is whole again. */
      record(ev) {
        if (ev.type === 'pong' || ev.type === 'heartbeat') return
        this.log.push(ev)
        const cap = 900
        if (this.log.length > cap) this.log.splice(0, this.log.length - cap)
      }
      emitTo(win, type, data) { this.post(win, { kind: 'event', event: this.event(type, data, null) }) }
      settings(cfg) { this.config = { ...DEFAULTS, ...cfg }; for (const win of this.frames.keys()) this.post(win, { kind: 'settings', settings: deckSettings(this.config) }) }
      command(cmd) { for (const win of this.frames.keys()) this.post(win, { kind: 'command', ...cmd }) }
      describe() { return { name: 'dsh', label: 'DeepSeek Harness', model: 'DeepSeek Harness', mode: 'dsh', tools: [] } }
      hello() { return { frameworks: [{ name: 'dsh', label: 'DeepSeek Harness', available: true, reason: 'host' }], framework: 'dsh', describe: this.describe(), search_backend: 'dsh', tools: [], llm_configured: true, limits: {} } }

      message(e) {
        if (e.origin !== location.origin) return
        const m = e.data
        if (!m || m.source !== 'command-deck') return
        const win = e.source
        if (!this.frames.has(win)) {
          if (m.type !== 'hello' || !this.isOurFrame(win)) return
          this.frames.set(win, m.view || 'full'); this.changed()
        }
        switch (m.type) {
          case 'hello':
            this.post(win, { kind: 'ready' }); this.post(win, { kind: 'settings', settings: deckSettings(this.config) }); this.emitTo(win, 'hello', this.hello())
            this.pushSessions(win)
            // RE-ATTACH: this frame is new (the panel was closed and reopened, or DSH re-rendered it). Replay the
            // followed Session's transcript into it — marked replay so the deck stays quiet — then live events continue.
            if ((this.frames.get(win) || 'full') !== 'preview') for (const ev of this.log) this.post(win, { kind: 'event', event: { ...ev, replay: true } })
            break
          case 'ping': this.emitTo(win, 'pong', { t: m.t }); break
          case 'run': this.run(String(m.prompt || '')); break
          case 'steer': this.steer(String(m.text || '')); break
          case 'interrupt': this.interrupt(); break
          case 'pause': case 'resume': this.emitTo(win, 'observation', { text: this.t('pause.unsupported'), source: 'dsh' }); break
          case 'reset': this.unfollow(); this.sessionId = null; this.changed(); this.emitTo(win, 'reset_ack', {}); break
          case 'set_framework': this.emitTo(win, 'framework', { framework: 'dsh', describe: this.describe() }); break
          case 'deck_theme': if (m.theme && m.theme !== this.config.theme) this.onTheme?.(m.theme); break
          case 'open_dsh': this.openDsh(m.target); break
          case 'exit_deck': this.exitDeck(); break
          case 'open_session': this.openSession(String(m.id || '')); break
          case 'resync': this.replayTo(win); break                  // a deck view was switched: rebuild its transcript
          case 'new_session': this.newSession(); break
          default: break
        }
      }
      t(key) { return (isZh() ? zh : en)[key] || key }
      openDsh(target) {
        // DSH has no public "open settings at section" call: use its own Settings control when present
        const btn = [...document.querySelectorAll('button, [role="button"]')].find((b) => /^(settings|设置)$/i.test((b.getAttribute('aria-label') || b.title || '').trim()))
        if (btn) btn.click()
        else this.emit('observation', { text: fill(this.t('open.dsh'), { what: target }), source: 'dsh' })
      }
      /** Close the deck panel: DSH's layout service selects the conversation interface when the panel id is null. */
      exitDeck() {
        try { this.ctx.layout.selectPanel(null); return true } catch (error) {
          try { this.ctx.layout.selectPanel('conversation'); return true } catch { /* fall through to the report */ }
          this.lastError = String(error?.message || error)
          console.warn('[command-deck] could not hand the screen back to DSH', error)
          return false
        }
      }

      // ── the Session directory (deck: SESSIONS card · DSH: ctx.sessions.list)
      /** Rows for the deck's list: id, title, last activity, running — newest activity first. */
      sessionRows() {
        let snap
        try { snap = this.ctx.sessions.list.getSnapshot() } catch { return [] }
        const rows = Object.values(snap?.byId || {})
        return rows
          .filter((row) => row && row.id)
          .map((row) => ({
            id: row.id,
            title: String(row.blank ? '' : row.title || '').trim(),
            at: Number(row.updatedAt || row.createdAt || 0),
            running: row.running === true || (row.runningSubagentCount || 0) > 0,
            shown: ((row.retainedBy || {}).mainView || 0) > 0,
          }))
          .sort((a, b) => b.at - a.at)
          .slice(0, 40)
      }
      /** Re-emit the followed Session's transcript to one frame (panel re-mount, deck view switch). */
      replayTo(win) {
        if (!win || !this.log.length) return
        this.post(win, { kind: 'event', event: this.event('session_open', { sessionId: this.sessionId, fresh: false }, null) })
        for (const ev of this.log) this.post(win, { kind: 'event', event: { ...ev, replay: true } })
        this.post(win, { kind: 'event', event: this.event('replay_done', { sessionId: this.sessionId, events: this.cursor }, null) })
      }
      /** Push the directory to one deck (on hello) or to every attached deck (on change). */
      pushSessions(only) {
        const sessions = this.sessionRows()
        const active = this.sessionId
        if (active && sessions.length && !sessions.some((row) => row.id === active) && !this.goneNotified) {
          this.goneNotified = true                                   // the deck must not keep a ghost Session
          this.emit('observation', { text: this.t('session.gone'), source: 'dsh' }, null)
          this.unfollow(); this.sessionId = null; this.log = []; this.changed()
        }
        if (!active) this.goneNotified = false
        for (const win of only ? [only] : [...this.frames.keys()]) this.post(win, { kind: 'sessions', sessions, active: this.sessionId })
      }
      /** Watch the directory so the deck follows renames, new Sessions and activity. */
      watchSessions() {
        if (this.listSub) return
        try { this.listSub = this.ctx.sessions.list.subscribe(() => this.pushSessions()) } catch { this.listSub = null }
      }
      /** Panel opened with nothing followed yet: attach to the conversation DSH is showing, so the entry is never empty. */
      autoFollow() {
        if (this.sessionId) return
        let rows = []
        try { rows = Object.values(this.ctx.sessions.list.getSnapshot().byId || {}) } catch { return }
        const shown = rows.find((row) => ((row.retainedBy || {}).mainView || 0) > 0)
        if (shown && shown.id) this.follow(shown.id).catch((error) => console.warn('[command-deck] auto-follow failed', error))
      }
      /** The deck asked for a Session: follow it (the follow replays its conversation). */
      openSession(id) {
        if (!id) return
        this.follow(id).then(() => this.pushSessions()).catch((error) => console.warn('[command-deck] could not follow', id, error))
      }
      /** The deck asked for a clean slate: detach; the next command creates a fresh Session. */
      newSession() {
        this.unfollow(); this.sessionId = null; this.log = []; this.changed(); this.pushSessions()
      }

      // ── DSH Sessions (client sessions service: create → id, retain → reference.binding {session, eventSource})
      binding(id = this.sessionId) { try { return id ? this.ctx.sessions.binding(id) : undefined } catch { return undefined } }
      async ensureSession() {
        if (this.sessionId && this.binding()) return this.sessionId
        let id
        try { id = await this.ctx.sessions.create({}) } catch (error) {
          this.lastError = String(error?.rpcError?.message || error?.message || error)
          this.emit('error', { message: `DeepSeek Harness could not start a session: ${this.lastError}`, retryable: true }, null)
          return null
        }
        await this.follow(id, { fresh: true })
        return this.binding(id) ? id : null
      }
      async follow(sessionId, { fresh = false } = {}) {
        if (this.sessionId === sessionId && this.unsub) return
        this.unfollow()
        this.sessionId = sessionId; this.synced = false; this.cursor = -1; this.streamed.clear(); this.log = []; this.changed()
        this.emit('session_open', { sessionId, fresh: !!fresh })   // the deck clears its transcript before the replay
        try { this.ref = this.ctx.sessions.retain(sessionId, { source: 'command-deck' }) } catch (error) { this.ref = null; this.lastError = String(error?.message || error); return }
        // the shared initial open() settles the history window; a slow Host does not block the deck for long
        await Promise.race([this.ref.ready.catch(() => {}), new Promise((r) => setTimeout(r, 4000))])
        const b = this.binding(sessionId)
        if (!b || this.sessionId !== sessionId) return
        // REPLAY: the retained window is a real conversation, so translate it instead of skipping it — that is
        // what makes a followed Session show up in the deck as its own transcript. Replayed events carry
        // `replay: true` so the deck can stay quiet (no sound, no history churn, no notifications).
        this.replaying = !fresh
        this.cursor = -1
        for (const entry of b.eventSource.getSnapshot().entries) {
          const ev = entry && entry.event
          if (!ev) continue
          if (entry.type === 'transient') { this.streamed.set(`${ev.data?.attemptId}:${ev.seq}`, true); continue }
          this.cursor = Math.max(this.cursor, ev.seq)
          if (fresh) continue
          try { this.handle(ev) } catch (error) { console.warn('[command-deck] history replay failed', ev.type, error) }
        }
        this.replaying = false
        // live from here: subscribe, then sweep once for anything the replay window did not cover
        const pump = () => this.pump(b)
        const offEvents = b.eventSource.subscribe(pump)
        const offSnap = b.session.subscribe(pump)
        this.unsub = () => { offEvents(); offSnap() }
        this.synced = true
        pump()
        if (fresh) return
        // the transcript is in the deck; settle its FSM so a history that ended mid-run does not look live
        this.emit('replay_done', { sessionId, events: this.cursor })
        this.emit('observation', { text: fill(this.t('follow.note'), { id: shortId(sessionId) }), source: 'dsh' }, null)
        if (b.session.getSnapshot().running && !this.turn) this.startTurn('(DSH turn in progress)')
      }
      unfollow() { this.unsub?.(); this.unsub = null; try { this.ref?.release?.() } catch { /* ignore */ } this.ref = null; this.turn = null }
      async run(prompt) {
        if (!prompt.trim()) return
        if (this.turn) return this.steer(prompt)
        this.pendingEcho = prompt.trim()
        this.startTurn(prompt)                         // the deck reacts at once; the session may take a moment to come up
        const T = this.turn
        const id = await this.ensureSession()
        if (!id) { this.turn = null; this.changed(); return }
        this.turn = T
        const r = await this.binding(id).session.prompt([{ type: 'text', text: prompt }], 'queue').catch((error) => ({ ok: false, error }))
        if (r && r.ok === false) {
          this.lastError = String(r.error?.message || r.error)
          this.emit('error', { message: this.lastError, retryable: true }); this.turn = null; this.changed()
        }
      }
      async steer(text) {
        const b = this.binding()
        if (!text.trim() || !b) return this.run(text)
        this.pendingEcho = text.trim()
        const r = await b.session.prompt([{ type: 'text', text }], 'steer').catch((error) => ({ ok: false, error }))
        if (r && r.ok !== false) this.emit('steered', { text, prompt: text })
      }
      async interrupt() {
        const b = this.binding()
        if (b) await b.session.cancel().catch(() => {})
      }

      // ── translation: DSH Session events → deck protocol
      startTurn(prompt) {
        const runId = 'dsh_' + Math.random().toString(36).slice(2, 8)
        this.turn = { runId, prompt, t0: Date.now(), steps: [], calls: new Map(), prev: ['s0'], cur: [], rev: 0, answer: '', tools: [], sources: new Map(), images: [], fetched: 0, streamedSteps: new Set(), step: 0 }
        this.emit('agent_start', { prompt, framework: 'dsh', model: 'DeepSeek Harness', mode: 'dsh', lang: isZh() ? 'zh' : 'en', label: 'DeepSeek Harness' }, runId)
        this.turn.steps.push({ id: 's0', tool: 'llm', query: 'DeepSeek Harness', why: '', label: 'DSH · think', labels: { en: 'DSH · think', zh: 'DSH · 思考' }, deps: [], branch: 0, status: 'running' })
        this.publishPlan(); this.changed()
      }
      publishPlan() { const T = this.turn; T.rev += 1; this.emit('plan', { steps: T.steps.map((s) => ({ ...s })), source: 'agent', revision: T.rev }) }
      stepDone(id, status = 'done') { const s = this.turn?.steps.find((x) => x.id === id); if (s && s.status === 'running') { s.status = status; this.emit('step_update', { id, status, tool: s.tool }) } }
      pump(session) {
        if (!this.synced) return
        const snap = session.eventSource.getSnapshot()
        for (const entry of snap.entries) {
          const ev = entry && entry.event; if (!ev) continue
          if (entry.type === 'transient') { this.stream(ev); continue }
          if (ev.seq <= this.cursor) continue
          this.cursor = ev.seq
          try { this.handle(ev) } catch (error) { console.warn('[command-deck] event translation failed', ev.type, error) }
        }
      }
      stream(ev) {
        // assistant/live-chunk: one token delta per transient entry ({ chunk: { type, index, text } }), keyed by attempt + seq
        if (!this.turn || ev.type !== 'assistant/live-chunk') return
        const d = ev.data || {}, c = d.chunk || {}, key = `${d.attemptId}:${ev.seq}`
        if (this.streamed.has(key)) return
        this.streamed.set(key, true)
        if ((c.type === 'text-delta' || c.type === 'reasoning-delta') && c.text) {
          this.emit('thought_delta', { text: c.text, channel: c.type === 'text-delta' ? 'text' : 'reasoning' })
          this.turn.streamedSteps.add(`${d.turn}:${d.step}`)
        }
      }
      handle(ev) {
        const d = ev.data || {}
        switch (ev.type) {
          case 'user/message': {
            const txt = withoutReminders(blocksText(d.content) || blocksText(d.message?.content) || '')
            if (!txt || HARNESS_NOISE.test(txt)) break                            // injected context: not a user turn
            this.lastUser = txt
            if (this.turn && (!this.turn.prompt || this.turn.prompt === '…')) {   // DSH persists the prompt after the turn marker
              this.turn.prompt = txt
              this.emit('turn_prompt', { text: txt })
            }
            if (this.pendingEcho === txt) this.pendingEcho = null                  // the deck printed this one itself
            else this.emit('you', { text: txt, source: 'dsh' })                    // typed in DSH, or replayed history
            break
          }
          case 'turn/start': if (!this.turn) this.startTurn(this.lastUser || '…'); break
          case 'step/start': if (this.turn) { this.turn.step = d.step; if (this.turn.cur.length) { this.turn.prev = this.turn.cur; this.turn.cur = [] } } break
          case 'assistant/message': {
            if (!this.turn) this.startTurn(this.lastUser || '…')
            const text = blocksText(d.message?.content), thinking = blocksText(d.message?.content, 'thinking')
            if (!this.turn.streamedSteps.has(`${d.turn}:${d.step}`)) {
              if (thinking) this.emit('thought_delta', { text: thinking, channel: 'reasoning' })
              if (text) this.emit('thought_delta', { text, channel: 'text' })
            }
            if (text.trim()) this.turn.answer = text
            break
          }
          case 'tool/call': {
            if (!this.turn) this.startTurn(this.lastUser || '…')
            const T = this.turn, args = parseArgs(d.arguments), sid = `s${T.steps.length}`
            this.stepDone('s0')
            const q = String((Array.isArray(args.queries) ? args.queries.join(' · ') : null) ?? args.query ?? args.url ?? args.command ?? args.path ?? args.pattern ?? args.file_path ?? '').slice(0, 80)
            T.steps.push({ id: sid, tool: d.name, query: q, why: '', label: q ? `${d.name}: ${q}` : d.name, labels: { en: q ? `${d.name}: ${q}` : d.name, zh: q ? `${d.name}：${q}` : d.name }, deps: [...T.prev], branch: T.step, status: 'running' })
            T.cur.push(sid); T.calls.set(d.callId, { sid, tool: d.name, t0: ev.time || Date.now(), args })
            this.publishPlan()
            this.emit('step_update', { id: sid, status: 'running', tool: d.name })
            this.emit('tool_call_start', { call_id: d.callId, tool: d.name, args, step_id: sid, kind: 'dsh' })
            if (d.name === 'web_fetch' && args.url) this.addSource(args.url, args.url, '', true)
            break
          }
          case 'tool/result': {
            const T = this.turn; if (!T) break
            const msg = d.message || {}, call = T.calls.get(msg.toolCallId) || { sid: null, tool: 'tool', t0: ev.time || Date.now() }
            const ok = !msg.isError && !d.error, text = blocksText(msg.content) || (d.error ? `${d.error.name}: ${d.error.reason || d.error.code}` : '')
            const ms = Math.max(0, (ev.time || Date.now()) - call.t0)
            T.tools.push({ tool: call.tool, ms, ok })
            if (call.sid) this.stepDone(call.sid, ok ? 'done' : 'failed')
            const summary = text.replace(/\s+/g, ' ').trim().slice(0, 160) || (ok ? 'ok' : 'failed')
            this.emit('tool_call_result', { call_id: msg.toolCallId, tool: call.tool, ok, summary, duration_ms: ms, preview: text ? text.slice(0, 1200) : null })
            if (ok) this.harvest(call.tool, text)
            this.emit('observation', { text: `${call.tool} → ${summary}`, source: call.tool, dashboard: this.dashboard() })
            break
          }
          case 'turn/end': {
            const T = this.turn; if (!T) break
            const reason = d.reason?.kind || 'completed'
            this.stepDone('s0')
            if (reason === 'completed' || reason === 'max-tokens' || reason === 'blocked') {
              this.harvest('answer', T.answer)            // links the answer cites count as sources too
              const stats = this.stats()
              this.emit('final', { answer: T.answer || '(DSH finished without a written answer)', dashboard: this.dashboard(T.answer), stats })
            } else if (reason === 'aborted' || reason === 'interrupted') this.emit('interrupted', { reason: 'user' })
            else if (reason === 'error') this.emit('error', { message: d.reason?.error?.message || 'model error', retryable: true })
            else this.emit('interrupted', { reason })
            this.turn = null; this.streamed.clear(); this.changed()
            break
          }
          default: break
        }
      }
      addSource(url, title, snippet, read = false) {
        const T = this.turn; if (!T || !/^https?:/i.test(url)) return
        url = url.replace(/[.,;:]+$/, '')
        const cur = T.sources.get(url)
        if (cur) { if (read) cur.read = true; return }
        T.sources.set(url, { title: title || domainOf(url), url, domain: domainOf(url), snippet: snippet || '', date: null, kind: 'web', score: 1 / (T.sources.size + 1), read })
        if (read) T.fetched += 1
        if (/\.(png|jpe?g|webp|gif)(\?|$)/i.test(url) && T.images.length < 24) T.images.push({ id: url, image_url: url, thumb_url: url, provider: 'dsh', title: title || domainOf(url) })
      }
      harvest(tool, text) {
        // DSH's web_search lists sources as `- [title](url) — snippet (date)`; other tools leave bare URLs on a line
        for (const line of text.split('\n')) {
          const links = [...line.matchAll(/\[([^\]]{1,160})\]\((https?:\/\/[^)\s]+)\)/g)]
          if (links.length) {
            const rest = line.slice(links[links.length - 1].index + links[links.length - 1][0].length).replace(/^\s*[—–-]\s*/, '').trim()
            for (const m of links) this.addSource(m[2], m[1], links.length === 1 ? rest.slice(0, 240) : '')
            continue
          }
          for (const u of line.match(URL_RX) || []) this.addSource(u, line.replace(URL_RX, '').replace(/^[\s\d.\-*#>|:]+/, '').trim().slice(0, 120), line.trim().slice(0, 240))
        }
      }
      dashboard(answer) {
        const T = this.turn || { sources: new Map(), tools: [], images: [] }
        const sources = [...T.sources.values()].slice(0, 20).map((s, i) => ({ n: i + 1, ...s }))
        const doms = new Map(); for (const s of sources) doms.set(s.domain, (doms.get(s.domain) || 0) + 1)
        return { query: T.prompt || '', summary: { answer: answer ?? null, stats: this.stats() }, entities: [], timeline: [],
          charts: { domains: [...doms].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([domain, count]) => ({ domain, count })), keywords: [], relevance: sources.map((s) => s.score), latency: T.tools.slice(-12) },
          sources, images: T.images, videos: [], metrics: [], widgets: [] }
      }
      stats() {
        const T = this.turn || { sources: new Map(), tools: [], t0: Date.now(), fetched: 0 }
        return { results: T.sources.size, pages_read: T.fetched, domains: new Set([...T.sources.values()].map((s) => s.domain)).size, tool_calls: T.tools.length,
          tool_ms: T.tools.reduce((a, x) => a + x.ms, 0), elapsed_ms: Date.now() - T.t0, framework: 'dsh', images: T.images.length, downloaded: 0 }
      }
    }

    // ── shared styles for the panel, header button and console (DSH tokens + the selected deck palette)
    const CSS = `
.cdk-panel { position: absolute; inset: 0; background: #000; }
.cdk-panel iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; display: block; }
.cdk-ico { display: block; }
.cdk-vis { display: inline-grid; place-items: center; width: 28px; height: 28px; border: 0; border-radius: 6px; background: none; color: var(--dsw-alias-label-secondary); cursor: pointer; }
.cdk-vis:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-state-business-primary); }
.cdk-mark { display: inline-flex; align-items: baseline; gap: 5px; min-width: 0; overflow: hidden; font: 700 11.5px var(--cdk-disp, sans-serif); letter-spacing: .13em; color: var(--cdk-accent, var(--dsw-alias-state-business-primary)); white-space: nowrap; }
.cdk-mark small { font: 600 10px var(--dsw-font-family); letter-spacing: .12em; color: var(--dsw-alias-label-tertiary); }
.cdk-console { --pad: 18px; color: var(--dsw-alias-label-primary); font-family: var(--dsw-font-family); max-width: 1180px; container-type: inline-size; }
.cdk-hero { position: relative; overflow: hidden; display: flex; align-items: center; gap: 18px; padding: 18px 20px; margin-bottom: 16px; border-radius: max(var(--cdk-radius, 0px), 6px);
  background: radial-gradient(ellipse 60% 120% at 0% 50%, rgba(var(--cdk-accent-rgb), .22), transparent 60%), linear-gradient(120deg, var(--cdk-bg), var(--cdk-layer)); border: 1px solid rgba(var(--cdk-accent-rgb), .35); color: var(--cdk-fg); }
.cdk-hero .rings { position: relative; flex: none; width: 58px; height: 58px; }
.cdk-hero .rings i { position: absolute; inset: 0; border-radius: 50%; border: 1px dashed rgba(var(--cdk-accent-rgb), .7); animation: cdkspin 9s linear infinite; }
.cdk-hero .rings i + i { inset: 10px; border: 2px solid; border-color: var(--cdk-accent) transparent var(--cdk-accent) transparent; animation-duration: 2.4s; animation-direction: reverse; }
.cdk-hero .rings i + i + i { inset: 22px; border: 0; background: radial-gradient(circle, var(--cdk-accent), transparent 70%); animation: cdkpulse 1.8s ease-in-out infinite; }
@keyframes cdkspin { to { transform: rotate(360deg); } } @keyframes cdkpulse { 50% { opacity: .4; transform: scale(.8); } }
.cdk-hero b { display: block; font: 700 18px var(--cdk-disp, sans-serif); letter-spacing: .24em; color: #fff; text-shadow: 0 0 14px rgba(var(--cdk-accent-rgb), .7); }
.cdk-hero[data-cdeck-t="brutal"] b, .cdk-hero[data-cdeck-t="arctic"] b { color: var(--cdk-fg); text-shadow: none; }
.cdk-hero p { margin: 4px 0 0; font-size: 13px; color: var(--cdk-dim); }
.cdk-hero .st { margin-left: auto; text-align: right; font: 12px var(--cdk-mono, monospace); color: var(--cdk-dim); white-space: nowrap; }
@container (max-width: 560px) { .cdk-hero { flex-wrap: wrap; } .cdk-hero .st { margin-left: 76px; text-align: left; } }
.cdk-hero .st i { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; background: var(--cdk-accent); box-shadow: 0 0 8px var(--cdk-accent); }
/* one column in the Settings dialog, two on the wide Plugins page: the console follows its own width, not the window */
.cdk-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0 16px; align-items: start; }
@container (min-width: 860px) { .cdk-grid { grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); } }
@media (max-width: 980px) { .cdk-grid { grid-template-columns: 1fr; } }
.cdk-card { border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; background: var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-1)); padding: 14px 16px; margin-bottom: 14px; }
.cdk-card h4 { margin: 0 0 12px; font: 700 11px var(--dsw-font-family); letter-spacing: .24em; color: var(--dsw-alias-label-tertiary); }
.cdk-prev { position: relative; width: 100%; aspect-ratio: 16 / 9; overflow: hidden; border-radius: 8px; background: #000; border: 1px solid rgba(var(--cdk-accent-rgb), .4); box-shadow: 0 0 0 1px rgba(0, 0, 0, .3), 0 18px 40px -18px rgba(var(--cdk-accent-rgb), .5); }
.cdk-prev iframe { position: absolute; left: 0; top: 0; width: 1600px; height: 900px; border: 0; transform-origin: 0 0; pointer-events: none; }
.cdk-prev .tag { position: absolute; left: 10px; top: 8px; font: 700 10px var(--cdk-mono, monospace); letter-spacing: .2em; color: var(--cdk-accent); text-shadow: 0 0 6px #000; }
.cdk-btns { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.cdk-btn { height: 32px; padding: 0 14px; white-space: nowrap; border-radius: 6px; border: 1px solid var(--dsw-alias-border-l3); background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); font: 600 12.5px var(--dsw-font-family); cursor: pointer; }
.cdk-btn:hover { border-color: var(--dsw-alias-state-business-primary); color: var(--dsw-alias-state-business-primary); }
.cdk-btn.pri { background: var(--dsw-alias-state-business-primary); border-color: transparent; color: var(--dsw-alias-label-primary-foreground, #fff); }
.cdk-fam { grid-column: 1 / -1; margin: 6px 0 -2px; font: 700 10px var(--dsw-font-family); letter-spacing: .26em; color: var(--dsw-alias-label-tertiary); }
.cdk-themes { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 9px; }
.cdk-th { position: relative; height: 84px; padding: 0; overflow: hidden; text-align: left; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2); background: var(--c3); cursor: pointer; transition: transform .2s, box-shadow .2s, border-color .2s; }
.cdk-th:hover { transform: translateY(-2px); border-color: var(--c1); }
.cdk-th.on { border-color: var(--c1); box-shadow: 0 0 0 1px var(--c1), 0 0 18px color-mix(in srgb, var(--c1) 45%, transparent); }
.cdk-th .sky { position: absolute; inset: 0; background: radial-gradient(110% 70% at 50% 125%, color-mix(in srgb, var(--c1) 50%, transparent), transparent 62%); }
.cdk-th .pan { position: absolute; left: 9px; top: 9px; width: 52px; height: 32px; border: 1px solid color-mix(in srgb, var(--c1) 70%, transparent); border-top: 3px solid var(--c2); background: color-mix(in srgb, var(--c3) 75%, transparent); }
/* a miniature panel: a heading bar and three lines of copy in the theme's own colours */
.cdk-th .pan::before { content: ''; position: absolute; left: 5px; top: 5px; width: 60%; height: 2px; background: var(--c1); box-shadow: 0 6px 0 color-mix(in srgb, var(--c1) 45%, transparent), 0 11px 0 color-mix(in srgb, var(--c1) 30%, transparent), 0 16px 0 color-mix(in srgb, var(--c1) 30%, transparent); }
.cdk-th .pan::after { content: ''; position: absolute; right: 4px; bottom: 4px; width: 10px; height: 10px; border-radius: 50%; border: 1px solid var(--c2); }
.cdk-th .orb { position: absolute; right: 12px; top: 11px; width: 22px; height: 22px; border-radius: 50%; border: 1px solid var(--c1); background: radial-gradient(circle at 35% 35%, color-mix(in srgb, var(--c1) 70%, #fff), transparent 62%); box-shadow: 0 0 12px var(--c1); }
.cdk-th b { position: absolute; left: 9px; bottom: 20px; font: 700 11.5px var(--dsw-font-family); letter-spacing: .12em; color: #fff; text-shadow: 0 0 8px var(--c1); }
.cdk-th small { position: absolute; left: 9px; right: 6px; bottom: 6px; font: 10px var(--dsw-font-family); color: rgba(255, 255, 255, .7); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cdk-th[data-t="brutal"] b, .cdk-th[data-t="brutal"] small { color: #111; text-shadow: none; } .cdk-th[data-t="brutal"] .pan { background: #ffe500; border: 2px solid #111; box-shadow: 3px 3px 0 #111; }
.cdk-th[data-t="arctic"] .pan { background: #fff; border: 0; border-radius: 4px; } .cdk-th[data-t="terminal"] .pan { border: 3px double #ffb000; background: #0a0600; }
.cdk-th[data-t="blueprint"] .sky { background: linear-gradient(rgba(232, 241, 255, .12) 1px, transparent 1px) 0 0 / 10px 10px, linear-gradient(90deg, rgba(232, 241, 255, .12) 1px, transparent 1px) 0 0 / 10px 10px; }
.cdk-th[data-t="apollo"] .pan { border: 4px solid #c9bfa5; border-top-width: 6px; border-radius: 5px; background: #0e140f; }
.cdk-th[data-t="mecha"] .pan { border-left: 8px solid #5b2bd6; } .cdk-th[data-t="glass"] .pan { border-radius: 10px; background: rgba(255, 255, 255, .14); border: 1px solid rgba(255, 255, 255, .3); }
.cdk-row { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px 12px; align-items: center; padding: 9px 0; border-top: 1px solid var(--dsw-alias-border-l1); }
.cdk-row > :first-child { flex: 1 1 180px; min-width: 0; }
.cdk-row:first-of-type { border-top: 0; }
.cdk-row b { display: block; font-weight: 600; font-size: 13.5px; } .cdk-row small { display: block; margin-top: 2px; font-size: 12px; color: var(--dsw-alias-label-tertiary); }
.cdk-sw { position: relative; width: 40px; height: 22px; border-radius: 11px; border: 0; padding: 0; cursor: pointer; background: var(--dsw-alias-border-l3); transition: background .2s; }
.cdk-sw::after { content: ''; position: absolute; left: 3px; top: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: transform .2s cubic-bezier(.2,1,.3,1); box-shadow: 0 1px 3px rgba(0, 0, 0, .3); }
.cdk-sw.on { background: var(--dsw-alias-state-business-primary); } .cdk-sw.on::after { transform: translateX(18px); }
.cdk-seg { display: inline-flex; border: 1px solid var(--dsw-alias-border-l2); border-radius: 7px; overflow: hidden; }
.cdk-seg button { height: 28px; padding: 0 11px; border: 0; background: none; color: var(--dsw-alias-label-secondary); font: 600 12px var(--dsw-font-family); cursor: pointer; }
.cdk-seg button + button { border-left: 1px solid var(--dsw-alias-border-l2); }
.cdk-seg button.on { background: var(--dsw-alias-state-business-primary); color: var(--dsw-alias-label-primary-foreground, #fff); }
.cdk-range { display: flex; align-items: center; gap: 10px; } .cdk-range input { width: 140px; accent-color: var(--dsw-alias-state-business-primary); } .cdk-range output { width: 38px; text-align: right; font: 12px var(--dsw-font-family-code, monospace); color: var(--dsw-alias-label-secondary); }
.cdk-foot { display: flex; align-items: center; gap: 12px; margin-top: 4px; font-size: 12px; color: var(--dsw-alias-label-tertiary); }
.cdk-note { padding: 10px 12px; border-radius: 8px; background: var(--dsw-alias-state-warn-tertiary, rgba(255, 180, 0, .12)); font-size: 12.5px; margin-bottom: 12px; }
`
    function useStyles() { useEffect(() => { if (document.getElementById('cdk-styles')) return; const s = document.createElement('style'); s.id = 'cdk-styles'; s.textContent = CSS; document.head.append(s) }, []) }

    // ── icons
    const DeckIcon = ({ size = 18 }) => h('svg', { className: 'cdk-ico', width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', 'aria-hidden': true },
      h('circle', { cx: 12, cy: 12, r: 8.5, strokeDasharray: '3 2.2' }), h('circle', { cx: 12, cy: 12, r: 4.2 }), h('path', { d: 'M12 1.8v3M12 19.2v3M1.8 12h3M19.2 12h3' }))

    // ── the full Command Deck panel
    //
    // GEOMETRY: DSH's `main` slot is mounted inside the centre column, but that column is not a positioning
    // context, so `position: absolute; inset: 0` resolves against the whole app frame instead. The deck then
    // covers the sidebar and — in the desktop app — the window-titlebar row the frame reserves on top, which
    // hides the deck's own top bar. Fill the centre column explicitly and follow it (sidebar drags, window
    // resize, right bar open/close) through a ResizeObserver.
    function DeckPanel({ bridge }) {
      useStyles()
      const ref = useRef(null)
      const box = useRef(null)
      useEffect(() => { bridge.autoFollow() }, [])          // opening the deck never lands on an empty transcript
      useEffect(() => {
        const el = box.current
        if (!el) return
        const host = () => el.parentElement?.closest('[class*="centerCol"]') || el.parentElement?.closest('[class*="center"]') || null
        const fit = () => {
          const col = host()
          if (!col) return
          const r = col.getBoundingClientRect()
          const parent = el.offsetParent
          const p = parent ? parent.getBoundingClientRect() : { left: 0, top: 0 }
          // macOS keeps the window chrome floating above the frame instead of reserving a row for it
          const chrome = document.documentElement.dataset.platform === 'darwin'
            ? (Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dsh-frame-top-clearance')) || 0)
            : 0
          el.style.left = Math.round(r.left - p.left) + 'px'
          el.style.top = Math.round(r.top - p.top + chrome) + 'px'
          el.style.right = 'auto'; el.style.bottom = 'auto'
          el.style.width = Math.max(0, Math.round(r.width)) + 'px'
          el.style.height = Math.max(0, Math.round(r.height - chrome)) + 'px'
        }
        fit()
        const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null
        const col = host()
        if (ro && col) ro.observe(col)
        if (ro && el.offsetParent) ro.observe(el.offsetParent)
        addEventListener('resize', fit)
        return () => { ro?.disconnect(); removeEventListener('resize', fit) }
      }, [])
      useEffect(() => () => bridge.prune(), [])
      return h('div', { className: 'cdk-panel', ref: box }, h('iframe', { ref, 'data-cdeck': 'full', title: 'Command Deck', src: `${MOUNT}index.html?host=dsh&notour`, allow: 'fullscreen; microphone; camera; autoplay; clipboard-write; clipboard-read; popups; popups-to-escape-sandbox; downloads; presentation' }))
    }

    // ── conversation header: visualise this Session in the deck
    function VisualizeButton({ onOpen, t }) {
      useStyles()
      return h('button', { type: 'button', className: 'cdk-vis', title: t ? t('visualize') : en.visualize, 'aria-label': t ? t('visualize') : en.visualize, onClick: onOpen }, h(DeckIcon, { size: 17 }))
    }
    function BrandName() { useStyles(); return h('span', { className: 'cdk-mark' }, 'COMMAND//DECK', h('small', null, '· DSH')) }

    // ── console building blocks
    const Switch = ({ on, onChange, disabled }) => h('button', { type: 'button', role: 'switch', 'aria-checked': !!on, disabled, className: `cdk-sw${on ? ' on' : ''}`, onClick: () => onChange(!on) })
    const Seg = ({ value, options, onChange, disabled }) => h('div', { className: 'cdk-seg', role: 'radiogroup' },
      ...options.map(([v, label]) => h('button', { key: v, type: 'button', role: 'radio', 'aria-checked': value === v, disabled, className: value === v ? 'on' : '', onClick: () => onChange(v) }, label)))
    const Row = (title, hint, control) => h('div', { className: 'cdk-row' }, h('div', null, h('b', null, title), hint ? h('small', null, hint) : null), control)

    function Preview({ bridge }) {
      const box = useRef(null), frame = useRef(null)
      useEffect(() => {
        const fit = () => { if (box.current && frame.current) frame.current.style.transform = `scale(${box.current.clientWidth / 1600})` }
        fit(); const ro = new ResizeObserver(fit); if (box.current) ro.observe(box.current)
        return () => { ro.disconnect(); bridge.prune() }
      }, [])
      return h('div', { className: 'cdk-prev', ref: box },
        h('iframe', { ref: frame, 'data-cdeck': 'preview', title: 'Command Deck preview', tabIndex: -1, src: `${MOUNT}index.html?host=dsh&view=preview&notour&nowelcome`, allow: 'autoplay' }),
        h('span', { className: 'tag' }, '● LIVE'))
    }

    /** Settings → Command Deck (and the bundle's page in Plugins). */
    function ConsolePage({ form, bridge, openDeck, t: tt }) {
      useStyles()
      const t = tt || ((k) => en[k] || k)
      const snap = useSyncExternalStore(form.subscribe.bind(form), form.getSnapshot.bind(form))
      const status = useSyncExternalStore(bridge.subscribe, bridge.getSnapshot)
      const zhUI = isZh()
      const v = { ...DEFAULTS, ...(snap.value || {}) }
      const ro = snap.status === 'ready' && snap.writable === false
      const set = (k, val) => { if (!ro) form.set(k, val) }
      const loading = snap.status !== 'ready' && !snap.value
      let fam = null
      const cards = []
      for (const [id, family, name, nzh, tag, tagZh, [c1, c2, c3]] of THEMES) {
        if (family !== fam) { fam = family; cards.push(h('div', { key: 'f-' + family, className: 'cdk-fam' }, FAMILIES[family][zhUI ? 1 : 0])) }
        cards.push(h('button', { key: id, type: 'button', className: `cdk-th${v.theme === id ? ' on' : ''}`, 'data-t': id, style: { '--c1': c1, '--c2': c2, '--c3': c3 }, onClick: () => set('theme', id), disabled: ro },
          h('i', { className: 'sky' }), h('i', { className: 'pan' }), h('i', { className: 'orb' }), h('b', null, zhUI ? nzh : name), h('small', null, zhUI ? tagZh : tag)))
      }
      const statusText = status.sessionId ? fill(t('c.status.follow'), { id: shortId(status.sessionId) }) : t('c.status.idle')
      return h('div', { className: 'cdk-console' },
        h('div', { className: 'cdk-hero', 'data-cdeck-t': v.theme },
          h('div', { className: 'rings' }, h('i'), h('i'), h('i')),
          h('div', null, h('b', null, t('c.title')), h('p', null, t('c.sub'))),
          h('div', { className: 'st' }, h('div', null, h('i'), statusText), h('div', null, fill(t('c.status.frames'), { n: status.frames })), h('div', null, `v${VERSION}`))),
        ro ? h('div', { className: 'cdk-note' }, t('c.readonly')) : null,
        loading ? h('div', { className: 'cdk-note' }, t('c.loading')) : null,
        h('div', { className: 'cdk-grid' },
          h('div', null,
            h('section', { className: 'cdk-card' }, h('h4', null, t('c.preview')), h(Preview, { bridge }),
              h('div', { className: 'cdk-btns' },
                h('button', { type: 'button', className: 'cdk-btn pri', onClick: openDeck }, t('c.open')),
                h('button', { type: 'button', className: 'cdk-btn', onClick: () => window.__CDECK_BOOT__?.play?.({ ...v }) }, t('c.replay')))),
            h('section', { className: 'cdk-card' }, h('h4', null, t('c.startup')),
              Row(t('c.boot'), null, h(Seg, { value: v.boot, disabled: ro, onChange: (x) => set('boot', x), options: [['every', t('c.boot.every')], ['session', t('c.boot.session')], ['off', t('c.boot.off')]] })),
              Row(t('c.style'), null, h(Seg, { value: v.bootStyle, disabled: ro, onChange: (x) => set('bootStyle', x), options: [['cinematic', t('c.style.cinematic')], ['quick', t('c.style.quick')]] })))),
          h('div', null,
            h('section', { className: 'cdk-card' }, h('h4', null, t('c.language')), h('div', { className: 'cdk-themes' }, ...cards)),
            h('section', { className: 'cdk-card' }, h('h4', null, t('c.integration')),
              Row(t('c.skin'), t('c.skin.h'), h(Switch, { on: v.skin, disabled: ro, onChange: (x) => set('skin', x) })),
              Row(t('c.hud'), t('c.hud.h'), h(Switch, { on: v.hud, disabled: ro, onChange: (x) => set('hud', x) })),
              Row(t('c.brand'), t('c.brand.h'), h(Switch, { on: v.brand, disabled: ro, onChange: (x) => set('brand', x) }))),
            h('section', { className: 'cdk-card' }, h('h4', null, t('c.motion')),
              Row(t('c.motionLevel'), null, h('div', { className: 'cdk-range' }, h('input', { type: 'range', min: 0, max: 100, step: 10, value: v.motion, disabled: ro, onChange: (e) => set('motion', Number(e.target.value)) }), h('output', null, `${v.motion}%`))),
              Row(t('c.scan'), null, h(Switch, { on: v.scanlines, disabled: ro, onChange: (x) => set('scanlines', x) })),
              Row(t('c.sound'), null, h(Switch, { on: v.sound, disabled: ro, onChange: (x) => set('sound', x) })),
              Row(t('c.tilt'), null, h(Switch, { on: v.tilt, disabled: ro, onChange: (x) => set('tilt', x) }))),
            h('div', { className: 'cdk-foot' },
              h('button', { type: 'button', className: 'cdk-btn', disabled: ro, onClick: () => form.mutate(Object.keys(DEFAULTS).map((k) => ({ op: 'unset', path: [k] }))) }, t('c.reset')),
              h('span', null, t('c.saved'))))))
    }

    // ── plugin entry
    const inject = ['slots', 'locale', 'configForms', 'sessions', 'layout']
    function apply(ctx) {
      let brandOn = false, brandOff = null
      ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'command-deck: dictionaries')
      const bridge = new Bridge(ctx)
      window.__CDECK_BRIDGE__ = bridge                 // diagnostics: inspect the bridge from DevTools
      bridge.watchSessions()                          // the deck's SESSIONS card mirrors DSH's directory
      ctx.effect(() => () => bridge.dispose(), 'command-deck: bridge')
      const form = ctx.configForms.get(ENTRY)
      const openDeck = () => { try { ctx.layout.selectPanel(PANEL) } catch (error) { console.warn('[command-deck] panel unavailable', error) } }

      // ── SCOPE: the skin + HUD belong to DSH's own surfaces (conversation, settings, the deck). When another
      // plugin's panel owns the centre column we suspend both, so its page renders exactly as its author wrote it:
      // no palette swap, no font-metric change, no overlay. Coming back to a session or to the deck restores it.
      const panelIsOurs = () => {
        try { const id = ctx.layout.panelInfo.getSnapshot()?.activePanelId ?? null; return id === null || id === PANEL } catch { return true }
      }
      const scope = () => {
        const body = document.body, ours = panelIsOurs()
        const v = { ...DEFAULTS, ...(form.getSnapshot().value || {}) }
        body.toggleAttribute('data-cdeck-skin-paused', !ours)
        if (ours) {
          body.setAttribute('data-cdeck-skin', v.theme ?? DEFAULTS.theme)
          if (v.hud !== false) body.setAttribute('data-cdeck-hud', 'on'); else body.removeAttribute('data-cdeck-hud')
        } else {
          body.removeAttribute('data-cdeck-skin')
          body.removeAttribute('data-cdeck-hud')
        }
      }

      // live settings → body skin attributes, deck iframes
      const sync = () => {
        const v = { ...DEFAULTS, ...(form.getSnapshot().value || {}) }
        window.__CDECK_BOOT__?.attrs?.(v)
        bridge.settings(v)
        if (v.brand !== brandOn) setBrand(v.brand)
        scope()
      }
      ctx.effect(() => {
        scope()
        const off = ctx.layout.panelInfo.subscribe(() => scope())
        return () => { try { off?.() } catch { /* layout gone */ } }
      }, 'command-deck: skin scope')
      bridge.onTheme = (theme) => {
        const snap = form.getSnapshot()
        if (snap.writable !== false && THEMES.some((x) => x[0] === theme) && theme !== (snap.value?.theme ?? DEFAULTS.theme)) form.set('theme', theme)
      }
      ctx.effect(() => form.subscribe(sync), 'command-deck: settings')

      // startup: DSH is up → let the boot animation finish
      requestAnimationFrame(() => requestAnimationFrame(() => window.__CDECK_BOOT__?.ready?.()))

      // the panel + its sidebar entry
      ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL, locale: NS, inject: () => ({ bridge }) }, DeckPanel))
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: PANEL, order: 5, locale: NS, label: () => ctx.locale.bind(NS)('panel') }, DeckIcon))
      // follow any conversation
      ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
        name: 'conversation.session.header.utilities', id: 'command-deck.visualize', order: -10, locale: NS,
        inject: (sessionId) => ({ onOpen: () => { bridge.follow(sessionId); openDeck() } }),
      }, VisualizeButton))
      // the visual console: its own Settings section and the bundle's page in Plugins
      const consoleInject = () => ({ form, bridge, openDeck })
      ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'command-deck', order: 90, locale: NS, label: () => ctx.locale.bind(NS)('console'), inject: consoleInject }, ConsolePage))
      ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({ name: 'plugins.bundle.config', key: BUNDLE, locale: NS, inject: consoleInject }, ConsolePage))
      // optional deck mark beside DSH's own in the sidebar (a single-occupant seat: never fatal if taken)
      function setBrand(on) {
        brandOn = on; brandOff?.(); brandOff = null
        if (!on) return
        // a single-occupant seat: a lower priority shadows DSH's own name (lowest renders) and withdraws cleanly
        try { brandOff = ctx.slots.inject('sidebar.brand.name', () => ctx.slots.register({ name: 'sidebar.brand.name', priority: -10, locale: NS }, BrandName)) } catch (error) { console.info('[command-deck] brand seat unavailable', error?.message) }
      }
      ctx.effect(() => () => brandOff?.(), 'command-deck: brand')
      sync()
    }
    exports.apply = apply
    exports.Bridge = Bridge                          // the Session → deck translator, exported for the package's tests
    exports.inject = inject
    return module.exports
  },
})
