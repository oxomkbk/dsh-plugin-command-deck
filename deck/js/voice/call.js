// ─────────────────────────────────────────────────────────────────────────────
// Phone-call-style voice channel (full duplex, continuous).
//
//   mic ─► AnalyserNode ─► VAD (adaptive noise floor, attack/hangover) ──► vad_start / vad_end
//    └──► SpeechRecognition (continuous, interim) ──► utterance buffer ──┘
//                         vad_end ─► commit utterance ─► command | control word
//   speechSynthesis ─► tts_start / tts_end;  vad_start while the agent speaks ─► BARGE-IN
//
// • The END of a sentence is decided by our VAD (energy above an adaptive noise floor,
//   ended by a configurable hangover of silence) — not by a button and not by the
//   recognizer's own timeout. After a commit the next turn starts automatically.
// • Barge-in: speech detected while the agent talks cancels TTS immediately (before any
//   transcript exists) and the new sentence becomes the next instruction. During agent speech
//   the start threshold is raised and the transcript is compared with what the agent was
//   saying (echo guard), so the deck can't interrupt itself.
// • Control words: "stop/cancel" interrupt, "wait/pause/hold on" pause, "continue/resume"
//   resume (or re-run an interrupted task), "reset", "clear canvas", "hang up" (+ Chinese).
// • Idle timeout: with no user speech and no agent activity for N s the call warns, then
//   hangs up with a notice.
// All state changes go through the CallFSM region of the global statechart.
//
// Reliability (v5.2) — an utterance ALWAYS ends and ALWAYS gets committed:
//   • end of speech = level falls back toward the noise floor RELATIVE to the speech peak (works in noisy rooms),
//     or the recognizer has delivered words and then stays quiet for 1.3 s, or 15 s of continuous speech;
//   • interim-only transcripts (no “final” from the recognizer) are committed after 1.2 s of silence;
//   • TRANSCRIPTION ENGINE: browser Web Speech, or SERVER (any OpenAI-compatible /audio/transcriptions —
//     SiliconFlow SenseVoice, OpenAI, Groq, local speaches). The deck records each VAD-cut utterance
//     (with 0.5 s pre-roll) as 16 kHz WAV and sends it to /api/asr. “auto” switches to the server engine by
//     itself when the browser recognizer is missing or its cloud is unreachable;
//   • TALK (one-shot): press, say one instruction, it runs and the mic closes.
//
// Turn-taking (v5.4) — ONE spoken request = ONE run, however you pause while saying it:
//   • END OF TURN is two-stage: the VAD notices silence (~0.45 s), then the turn is HELD open a little longer
//     (Settings → VOICE “end of sentence”, default 1.1 s in total). The hold is longer when the words so far end
//     like an unfinished sentence (“…and”, “…for”, “然后…”, “还有…”) or are very short. Speaking again during
//     the hold CONTINUES the same utterance — a thinking pause never splits a request any more.
//   • AMEND: if you carry on within ~3 s after a request was sent and the deck has not answered yet, the new
//     words are appended and the run restarts with the whole request (the half-request is superseded).
//   • ECHO-PROOF BARGE-IN: the deck's own voice coming back through the speakers no longer interrupts it.
//     While it talks, speech only barges in once the recognizer hears words the deck did not say (or a
//     control word), or — without live words — after a sustained 0.7–1.5 s of voice. Echo is filtered always.
//   • FAR-FIELD GUARD: words the recognizer picks up while the mic heard no near voice (TV, people across
//     the room) are not executed.
//   • The “On it” acknowledgement is an earcon, not speech (speech fed back into the mic as a new command).
//   • An answer that arrives while you are talking waits; it is dropped if you were giving a new request.
// ─────────────────────────────────────────────────────────────────────────────
import { bus } from '../core/bus.js';
import { settings } from '../core/store.js';
import { t, speechLang } from '../core/i18n.js';
import { api, EMBEDDED } from '../core/host.js';

const CONTROL = [
  [/^(hang ?up|end (the )?call|goodbye|bye|挂断|结束通话|再见)\b/i, 'hangup'],
  [/^(stop|cancel|abort|halt|enough|停止|停下|取消|别说了|停)\b/i, 'interrupt'],
  [/^(wait|hold on|pause|one (sec|second|moment)|等一下|等等|暂停)\b/i, 'pause'],
  [/^(continue|resume|go on|carry on|keep going|继续|恢复)\b/i, 'resume'],
  [/^(reset|start over|重置|重新开始)\b/i, 'reset'],
  [/^(clear (the )?(canvas|screen|board)|清空|清屏)/i, 'clear'],
];
// tokens: Latin words, and single CJK characters (Chinese has no spaces — a whole sentence must not be one “word”)
const words = (s) => (String(s).toLowerCase().match(/[\u3400-\u9fff]|[\p{L}\p{N}]+/gu) || []).flatMap((w) => /[\u3400-\u9fff]/.test(w) ? [...w] : [w]);
// the words so far end like an unfinished sentence → hold the turn open longer
const CONT_EN = /\b(and|or|but|so|then|the|a|an|to|of|in|on|at|for|with|about|from|into|like|because|plus|also|is|are|what|which|how|my|your|um+|uh+|er+)\s*$/i;
const CONT_ZH = /(和|跟|与|及|以及|还有|然后|并且|而且|或者|还是|就是|那个|这个|嗯+|呃+|的|把|给|在|帮我|我想|请|再|对|关于|比如|因为|所以|但是|如果)\s*$/;
const isCJK = (s) => /[\u3400-\u9fff]/.test(s);
// noise robustness: fillers and well-known speech-to-text hallucinations on noise are never executed
const FILLER = /^(嗯+|啊+|呃+|哦+|噢+|唔+|额+|诶+|uh+|um+|hmm+|mm+|ah+|oh+|eh+|er+|huh)[\s.,!?。，！？…]*$/i;
const HALLU = /^(thank you( (very|so) much)?|thanks( for watching)?|bye|you|okay|請不吝點贊.*|请不吝点赞.*|字幕由.*|谢谢观看|謝謝觀看|感谢观看|谢谢大家|订阅.*|ご視聴ありがとうございました)[\s.,!?。，！？…]*$/i;
const WAKE = /^\s*(hey |hi |ok |okay )?(deck|dek|desk|dec)\b[\s,，.:]*|^\s*(嘿|喂|你好)?[\s,，]*(助手|小德|德克|指挥台)[\s,，.:：]*/i;

export class VoiceCall {
  constructor(fsm) {
    this.fsm = fsm;
    this.SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.active = false; this.muted = false; this.speaking = false; this.inSpeech = false;
    this.floor = -58; this.level = -100; this.utter = null; this.pending = null;
    this.buf = new Uint8Array(1024);
    this.waves = [...document.querySelectorAll('canvas[data-wave]')];
    this.voiceprint = 0;
    this.srBroken = false; this.asrReady = false; this.oneshot = false; this.ring = []; this.capture = null;
    this.onset = 0; this.voicedMs = 0; this.window = 0; this.spec = { ratio: 0, flat: 1 };
    this.lastCmd = null; this.answered = true; this.deferred = null; this.lastVoicedAt = 0; this.bargeCand = false;
    this.checkASR();
    bus.on('asr:changed', () => this.checkASR());
    fsm.on(({ to }) => bus.emit('voice:state', to));
    requestAnimationFrame(() => this.draw());
  }
  get state() { return this.fsm.state; }
  get enabled() { return this.active; }
  lang() { return settings.voiceLang === 'auto' ? speechLang() : settings.voiceLang; }
  /** UI language changed mid-call: restart recognition in the new language. */
  relang() { if (this.active && this.rec) { const r = this.rec; this.rec = null; try { r.abort(); } catch { /* ignore */ } setTimeout(() => this.listen(), 200); } }
  activity() { this.lastActivity = performance.now(); this.warned = false; }
  async checkASR() {
    if (EMBEDDED) { this.asr = null; this.asrReady = false; return }   // DSH owns transcription; the deck uses the browser recogniser
    try { const r = await fetch(api('/api/asr')); this.asr = r.ok ? await r.json() : null; this.asrReady = !!this.asr?.ready; } catch { this.asrReady = false; } return this.asrReady; }
  /** Which transcription engine is in charge right now. */
  get engine() {
    const e = settings.asrEngine || 'auto';
    if (e === 'server') return 'server';
    if (e === 'browser') return this.SR ? 'browser' : 'none';
    return this.SR && !this.srBroken ? 'browser' : this.asrReady ? 'server' : this.SR ? 'browser' : 'none';
  }
  /** One-shot: listen for a single instruction, run it, close the mic. */
  async talkOnce() {
    if (this.active) { this.hangup('user'); return false; }
    this.oneshot = true;
    const ok = await this.start();
    if (!ok) this.oneshot = false;
    return ok;
  }

  async toggle() { this.active ? this.hangup('user') : await this.start(); }

  async start() {
    if (this.active) return true;
    this.fsm.dispatch('call_start');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      const ac = this.ac = new (window.AudioContext || window.webkitAudioContext)();
      await ac.resume?.();
      const src = ac.createMediaStreamSource(this.stream);
      this.an = ac.createAnalyser(); this.an.fftSize = 1024; this.an.smoothingTimeConstant = 0.2; src.connect(this.an);   // analysed only, never played
      // recorder tap for server transcription: keeps a 0.5 s pre-roll ring, captures while the VAD says “speech”
      const proc = this.proc = ac.createScriptProcessor(4096, 1, 1), mute = ac.createGain(); mute.gain.value = 0;
      src.connect(proc); proc.connect(mute); mute.connect(ac.destination);
      proc.onaudioprocess = (e) => {
        const d = new Float32Array(e.inputBuffer.getChannelData(0));
        if (this.capture) this.capture.push(d);
        this.ring.push(d); let n = this.ring.reduce((a, x) => a + x.length, 0);
        while (n > ac.sampleRate * 0.5 && this.ring.length > 1) n -= this.ring.shift().length;
      };
    } catch (e) {
      this.fsm.dispatch('fail');
      bus.emit('toast', { text: `${t('Microphone unavailable')}: ${e.name === 'NotAllowedError' ? t('permission denied') : e.message}`, kind: 'err' });
      return false;
    }
    this.active = true; this.muted = false; this.t0 = performance.now(); this.activity();
    this.calibUntil = performance.now() + 900; this.onset = 0; this.window = performance.now() + 20000;
    this.fsm.dispatch('connected');
    this.vadTimer = setInterval(() => this.vad(), 20);
    this.idleTimer = setInterval(() => this.idleCheck(), 1000);
    await this.checkASR();
    if (this.engine === 'browser') this.listen();
    else if (this.engine === 'none') bus.emit('toast', { text: t('No speech recognition available — set up server transcription in Settings → VOICE.'), kind: 'warn', action: t('SETUP'), run: () => bus.emit('settings:open', 'voice') });
    bus.emit('call:started', { engine: this.engine, oneshot: this.oneshot });
    return true;
  }

  hangup(reason = 'user') {
    if (!this.active) return;
    this.active = false;
    clearInterval(this.vadTimer); clearInterval(this.idleTimer); clearTimeout(this.pending?.timer); this.pending = null;
    this.utter = null; this.deferred = null; this.lastCmd = null; this.bargeCand = false; this.bargedIn = false; this.inSpeech = false;
    try { this.rec?.abort(); } catch { /* ignore */ }
    this.rec = null;
    this.stream?.getTracks().forEach((t) => t.stop()); this.stream = null; this.an = null; this.capture = null; this.ring = [];
    try { this.proc?.disconnect(); } catch { /* ignore */ } this.proc = null; this.oneshot = false;
    this.ac?.close?.(); this.ac = null;
    this.cancelSpeech();
    const secs = Math.round((performance.now() - this.t0) / 1000);
    this.fsm.dispatch(reason === 'idle' ? 'idle_timeout' : 'hangup');
    bus.emit('call:ended', { reason, secs });
    setTimeout(() => this.fsm.dispatch('clear'), 2600);
  }

  setMuted(m) {
    if (!this.active || m === this.muted) return;
    this.muted = m;
    if (m) { try { this.rec?.abort(); } catch { /* ignore */ } if (this.inSpeech) { this.inSpeech = false; this.utter = null; } this.fsm.dispatch('mute'); }
    else { this.activity(); this.fsm.dispatch('unmute'); if (this.SR && !this.rec) this.listen(); }
    bus.emit('call:muted', m);
  }

  // ───────────── speech recognition (transcripts only — sentence ends come from the VAD)
  listen() {
    if (!this.active || this.muted || !this.SR) return;
    const r = this.rec = new this.SR();
    r.lang = this.lang(); r.continuous = true; r.interimResults = true; r.maxAlternatives = 1;
    r.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i], text = res[0].transcript.trim();
        if (!text) continue;
        if (res.isFinal) this.onFinal(text); else interim += text + ' ';
      }
      if (interim.trim()) this.onInterim(interim.trim());
    };
    r.onerror = (e) => {
      if (['network', 'not-allowed', 'service-not-allowed', 'language-not-supported', 'audio-capture'].includes(e.error)) {
        if (e.error === 'not-allowed' && !this.stream) return;
        const first = !this.srBroken; this.srBroken = true;    // the browser recognizer can't work here → don't keep restarting it
        if (!first) return;                                    // warn once per session, not on every restart
        if (this.asrReady && (settings.asrEngine || 'auto') === 'auto') bus.emit('toast', { text: t('Browser speech recognition unavailable ({e}) — switched to server transcription', { e: e.error }), kind: 'warn' });
        else bus.emit('toast', { text: t('Browser speech recognition unavailable ({e}). Set up server transcription in Settings → VOICE.', { e: e.error }), kind: 'err', action: t('SETUP'), run: () => bus.emit('settings:open', 'voice') });
      }
    };
    r.onend = () => {
      if (this.rec === r) this.rec = null;
      const again = () => this.active && !this.muted && !this.rec && this.engine === 'browser';
      if (again()) setTimeout(() => { if (again()) try { this.listen(); } catch { /* ignore */ } }, this.srBroken ? 3000 : 150);   // broken service: retry slowly
    };
    try { r.start(); } catch { /* already running */ }
  }
  ensureUtter() { if (!this.utter) this.utter = { finals: '', interim: '', t0: performance.now(), segs: 0 }; return this.utter; }
  /** Text of the current utterance so far. */
  sofar() { const u = this.utter; return u ? `${u.finals} ${u.interim}`.trim() : ''; }
  /** Was a near voice heard recently? (guards against far-field words: TV, people across the room) */
  nearVoice(ms = 1800) { return this.inSpeech || performance.now() - this.lastVoicedAt < ms; }
  onInterim(text) {
    if (this.muted) return;
    if (!this.inSpeech && !this.pending && !this.nearVoice()) return;          // far-field words: not for us
    const u = this.ensureUtter(); u.interim = text; u.lastText = performance.now();
    if (this.bargeCand && !this.bargedIn && (CONTROL.some(([re]) => re.test(text)) || this.novel(text))) this.confirmBarge('words');
    // words arrived but the VAD never heard speech (quiet voice / auto-gain): hold the turn like any other
    if (!this.inSpeech && !this.pending?.asr) this.hold();
    if (!this.speaking || this.bargedIn) bus.emit('call:interim', `${u.finals} ${text}`.trim());
  }
  onFinal(text) {
    if (this.muted) return;
    if (!this.inSpeech && !this.pending && !this.nearVoice()) return;
    const u = this.ensureUtter(); u.finals = `${u.finals} ${text}`.trim(); u.interim = ''; u.lastText = performance.now();
    if (this.bargeCand && !this.bargedIn && (CONTROL.some(([re]) => re.test(text)) || this.novel(text))) this.confirmBarge('words');
    if (!this.speaking || this.bargedIn) bus.emit('call:interim', u.finals);
    if (!this.inSpeech && !this.pending?.asr) this.hold();          // re-arm with the final text (cue-aware gap)
  }
  /** Words the deck did NOT just say (a real interruption, not its own echo). */
  novel(text) {
    const said = new Set(words(this.lastSaid || '')), w = words(text);
    const fresh = w.filter((x) => !said.has(x)).length;
    return isCJK(text) ? fresh >= 3 : fresh >= 2;
  }

  // ───────────── voice activity detection (end-of-sentence decision)
  vad() {
    if (!this.an) return;
    this.an.getByteTimeDomainData(this.buf);
    let sum = 0; for (const v of this.buf) { const x = (v - 128) / 128; sum += x * x; }
    this.fbuf ||= new Float32Array(this.an.frequencyBinCount);
    this.an.getFloatFrequencyData(this.fbuf);
    this.feedLevel(10 * Math.log10(sum / this.buf.length + 1e-10), performance.now(), this.voicedFrame(this.fbuf, this.ac?.sampleRate || 48000));
  }
  /**
   * Does this spectrum look like a voice? Speech puts most of its energy in 250–3500 Hz and is harmonic
   * (low spectral flatness); fans, traffic and air-con are low-frequency or flat/hissy. Music and TV voices
   * do pass — that is what the wake word is for.
   */
  voicedFrame(f, rate) {
    const hzPer = rate / (2 * f.length);
    let tot = 0, band = 0, sumLog = 0, sumLin = 0, n = 0;
    for (let i = 1; i < f.length; i++) {
      const hz = i * hzPer; if (hz < 80 || hz > 8000 || !Number.isFinite(f[i])) continue;
      const p = Math.pow(10, f[i] / 10); tot += p;
      if (hz >= 250 && hz <= 3500) { band += p; sumLog += Math.log(p + 1e-14); sumLin += p; n++; }
    }
    const ratio = band / (tot + 1e-14), flat = n ? Math.exp(sumLog / n) / (sumLin / n + 1e-14) : 1;
    this.spec = { ratio, flat };
    return ratio > 0.45 && flat < 0.5;
  }
  /** One VAD step for a level in dBFS (exposed so tests can drive the detector deterministically; `voiced` defaults to true). */
  feedLevel(db, now = performance.now(), voiced = true) {
    this.level = db; this.isVoiced = voiced;
    if (this.muted) return;
    const dt = this.lastNow != null ? Math.min(100, Math.max(0, now - this.lastNow)) : 20; this.lastNow = now;
    if (this.calibUntil && performance.now() < this.calibUntil) {        // first second of a call: learn the room
      this.floor = this.floor * 0.85 + Math.max(-80, Math.min(-30, db)) * 0.15; return;
    }
    const barge = this.speaking;
    const onTh = this.floor + (barge ? settings.vadBarge : settings.vadOn);
    // end-of-speech threshold relative to this utterance's peak: in a noisy room the level never returns to floor+5
    const offTh = Math.max(this.floor + 5, this.floor + ((this.peak ?? onTh) - this.floor) * 0.35);
    if (voiced && db > this.floor + settings.vadOn * 0.5) this.lastVoicedAt = performance.now();   // a near voice, even a quiet one
    if (!this.inSpeech) {
      // adaptive noise floor: follow quiet levels, recover slowly upward
      this.floor = db < this.floor ? this.floor * 0.9 + db * 0.1 : this.floor * 0.998 + db * 0.002;
      this.floor = Math.min(-30, Math.max(-80, this.floor));
      // onset = leaky integral of LOUD *and* VOICED time: a door slam, a cough or a fan never adds up to speech
      const loud = db > onTh;
      this.onset = loud && voiced ? this.onset + dt : Math.max(0, this.onset - dt * (loud ? 0.5 : 1));
      this.noisy = loud && !voiced;
      if (this.onset >= (barge ? 280 : 180)) this.speechStart(barge, now);
    } else {
      this.peak = Math.max(this.peak ?? db, db);
      if (db > offTh && voiced) this.voicedMs += dt;
      // barge-in without live words (server engine / silent recognizer): only a sustained voice interrupts the deck
      if (this.bargeCand && !this.bargedIn && this.voicedMs >= (this.engine === 'server' ? 700 : 1500)) this.confirmBarge('voice');
      const u = this.utter;
      const forced = now - this.speechT0 > 25000 ? 'max'                                               // runaway: never record forever
        : this.engine === 'browser' && u?.lastText && performance.now() - u.lastText > 2200 && now - this.speechT0 > 800 ? 'words' : null;   // recognizer went quiet (real-time stamps)
      if (forced) { this.floor = Math.min(-30, Math.max(this.floor, db - 1)); return this.speechEnd(forced); }   // the steady level is noise → new floor   // the recognizer has gone quiet
      if (db < offTh || !voiced) {                                   // quiet, or loud but not a voice (noise) → counts toward the end
        this.below = this.below ?? now;
        if (now - this.below >= Math.min(450, settings.vadHang)) {        // stage 1: the VAD notices silence; the turn is then HELD (hold())
          // ended over steady background noise: that noise is the new floor, so it can't re-trigger “speech”
          if (db > this.floor + 5) this.floor = Math.min(-30, db - 1);
          this.speechEnd('silence');
        }
      } else this.below = null;
    }
  }
  speechStart(barge, now = performance.now()) {
    // speaking again while the turn is HELD continues the same utterance (a pause never splits a request)
    const cont = !!(this.pending?.hold && this.utter);
    if (cont) { clearTimeout(this.pending.timer); this.pending = null; bus.emit('call:holding', { ms: 0 }); }
    this.inSpeech = true; this.above = null; this.below = null; this.activity(); this.peak = null; this.speechT0 = now; this.onset = 0; this.voicedMs = 0;
    if (this.engine === 'server' && !(cont && this.capture)) this.capture = [...this.ring];   // record with 0.5 s pre-roll (a continuation keeps recording)
    const u = this.ensureUtter(); u.segs++;
    // barge-in is only a CANDIDATE until words the deck didn't say (or a sustained voice) confirm it
    if (barge && settings.bargeIn) { this.bargeCand = true; return; }
    this.fsm.dispatch('vad_start');
    bus.emit('call:user_start', { cont });
  }
  confirmBarge(why) {
    if (!this.bargeCand || this.bargedIn) return;
    this.bargedIn = true; this.bargeCand = false;
    this.cancelSpeech();                     // stop talking now
    this.fsm.dispatch('vad_start');
    bus.emit('call:barge', { why });
    bus.emit('call:user_start', { cont: false });
  }
  speechEnd(why = 'silence') {
    this.inSpeech = false; this.below = null; this.endWhy = why; this.lastVoicedMs = this.voicedMs;
    const cand = this.bargeCand; this.bargeCand = false;
    this.fsm.dispatch('vad_end');
    bus.emit('call:user_end', { why });
    // speech during the deck's own voice that never proved to be the user: its echo → drop silently
    if (cand && !this.bargedIn && !(this.sofar() && !this.isEcho(this.sofar()) && this.novel(this.sofar()))) {
      this.capture = null; this.utter = null; bus.emit('call:noise', { ms: Math.round(this.voicedMs), echo: true }); return;
    }
    // too little actual voice and no words → noise. Mid-turn noise just re-arms the hold; a lone noise is dropped.
    if (this.voicedMs < 220 && !this.sofar()) {
      if (this.utter && this.utter.segs > 1 && this.capture) { this.hold(); return; }
      this.capture = null; this.utter = null; bus.emit('call:noise', { ms: Math.round(this.voicedMs) }); this.flushDeferred(); return;
    }
    this.hold();
  }
  /** Stage 2 of end-of-turn: keep the turn open a little longer — longer when the sentence sounds unfinished. */
  turnGap() {
    const base = Math.max(300, settings.vadHang - Math.min(450, settings.vadHang)), text = this.sofar();
    const unfinished = CONT_EN.test(text) || CONT_ZH.test(text);
    const short = text && (isCJK(text) ? text.replace(/\s/g, '').length < 3 : words(text).length < 2);
    // the browser recognizer lags the VAD: with no words yet, wait for them a little
    const waitWords = this.engine === 'browser' && !text ? 500 : 0;
    return Math.min(2600, base * (unfinished ? 2.2 : 1) + (short ? 400 : 0) + waitWords);
  }
  hold(ms = this.turnGap()) {
    clearTimeout(this.pending?.timer);
    this.pending = { hold: true, until: performance.now() + ms, timer: setTimeout(() => this.finishTurn(), ms) };
    bus.emit('call:holding', { ms });
  }
  finishTurn() {
    if (this.inSpeech) return;
    bus.emit('call:holding', { ms: 0 });
    if (this.engine === 'server' && this.capture) { const chunks = this.capture; this.capture = null; this.pending = null; this.transcribe(chunks); return; }
    this.commit();
  }
  /** Server engine: encode the utterance as 16 kHz WAV and transcribe it on the deck server. */
  async transcribe(chunks) {
    if ((this.lastVoicedMs ?? 9999) < 300 && (this.utter?.segs || 1) < 2) { this.utter = null; bus.emit('call:noise', { ms: Math.round(this.lastVoicedMs) }); this.flushDeferred(); return; }   // not worth a transcription
    const rate = this.ac?.sampleRate || 48000, wav = toWav(chunks, rate, 16000);
    if (wav.byteLength < 9000) { bus.emit('call:utterance', { text: '', empty: true }); return; }   // < ~0.25 s: a click, not speech
    const u = this.ensureUtter(); bus.emit('call:interim', t('transcribing…'));
    this.pending = { timer: setTimeout(() => {}, 0), asr: true };
    try {
      const r = await (await fetch(api(`/api/asr?lang=${this.lang().slice(0, 2)}`), { method: 'POST', headers: { 'content-type': 'audio/wav' }, body: wav })).json();
      if (r.ok) { u.finals = r.text || ''; bus.emit('call:asr', { ms: r.ms, engine: r.engine }); }
      else bus.emit('toast', { text: `${t('Transcription failed')}: ${r.error}`, kind: 'err' });
    } catch (e) { bus.emit('toast', { text: `${t('Transcription failed')}: ${e.message}`, kind: 'err' }); }
    this.commit();
  }
  commit() {
    clearTimeout(this.pending?.timer); this.pending = null;
    const u = this.utter; this.utter = null;
    const barged = this.bargedIn; this.bargedIn = false;
    // finals plus any interim tail the recognizer had not finalised yet (a continued utterance can have both)
    let text = u ? `${u.finals} ${u.interim}`.trim() : '';
    bus.emit('call:interim', '');
    if (u && u.interim && this.rec) { try { this.rec.abort(); } catch { /* restarts via onend */ } }   // flush so the interim isn't re-delivered as a final
    if (!text) { bus.emit('call:utterance', { text: '', empty: true }); this.flushDeferred(); if (this.oneshot && performance.now() - this.t0 > 8000) this.hangup('done'); return; }
    if (this.isEcho(text) && !(barged && this.novel(text))) { bus.emit('call:utterance', { text, echo: true }); this.flushDeferred(); return; }
    if (this.isJunk(text)) { bus.emit('call:utterance', { text, noise: true }); this.flushDeferred(); return; }
    // wake word (optional, Settings → VOICE): outside the follow-up window an instruction must start with it
    let said = text;
    const w = said.match(WAKE);
    if (w) said = said.slice(w[0].length).trim();
    if (settings.wake && !w && performance.now() > this.window && !CONTROL.some(([re]) => re.test(text))) { bus.emit('call:utterance', { text, wake: true }); this.flushDeferred(); return; }
    if (w && !said) { this.window = performance.now() + 20000; bus.emit('call:utterance', { text, woke: true }); return; }   // just the name: listen for the instruction
    text = said; this.window = performance.now() + 20000;              // follow-ups within 20 s need no wake word
    if (this.oneshot) setTimeout(() => this.hangup('done'), 50);            // one instruction per TALK (after the noise / wake filters)
    const ctl = CONTROL.find(([re]) => re.test(text));
    if (ctl) {
      bus.emit('call:utterance', { text, control: ctl[1] });
      this.flushDeferred();
      if (ctl[1] === 'interrupt' || ctl[1] === 'pause') this.fsm.dispatch('voice_stop');
      bus.emit('call:control', { action: ctl[1], text }); return;
    }
    // AMEND: carrying on within ~3 s of the last request, before the deck answered → one request, not two
    const prev = this.lastCmd, amend = !!(prev && !this.answered && !this.oneshot && u && u.t0 - prev.at < 3000);
    const added = text;
    if (amend) text = `${prev.text}${isCJK(prev.text) && isCJK(text) ? '，' : ' '}${text}`;
    this.lastCmd = { text, at: performance.now() }; this.answered = false; this.deferred = null;   // an answer to the old request is moot
    bus.emit('call:utterance', { text, amend });
    bus.emit('call:command', { text, amend, added });
  }
  /** The agent finished (answer / error / interrupt): later speech is a new request, not an amendment. */
  runEnded() { this.answered = true; }
  flushDeferred() { const d = this.deferred; this.deferred = null; if (d) this.speak(d.raw, d.opts); }
  isJunk(text) {
    if (!/[\p{L}\p{N}]/u.test(text)) return true;
    if (FILLER.test(text.trim())) return true;
    return HALLU.test(text.trim()) && (this.lastVoicedMs ?? 9999) < 1800;   // e.g. Whisper's “Thank you.” on a short noise burst
  }
  isEcho(text) {
    if (!this.lastSaid || (!this.speaking && performance.now() - this.lastSaidEnd > 4000)) return false;
    const said = new Set(words(this.lastSaid)), w = words(text);
    if (!w.length) return false;
    return w.length >= 2 && w.filter((x) => said.has(x)).length / w.length >= 0.8;   // real echo ≈ the deck's own words; a new command that merely shares some words is not echo
  }

  idleCheck() {
    if (!this.active) return;
    const idle = (performance.now() - this.lastActivity) / 1000, lim = settings.callIdle;
    if (!lim) return;                                                  // 0 = never hang up on silence
    if (this.speaking || this.inSpeech || this.busy?.()) { this.activity(); return; }
    if (!this.warned && idle > lim - 10) {
      this.warned = true;
      bus.emit('toast', { text: t('Call idle — hanging up in 10 s. Say anything to stay connected.'), kind: 'warn' });
      bus.emit('call:idle_warning');
    }
    if (idle > lim) { bus.emit('notify', { text: t('Call ended after {s} s of silence', { s: Math.round(lim) }), kind: 'warn' }); this.hangup('idle'); }
  }

  // ───────────── speaking (dual channel)
  speak(raw, { brief = false } = {}) {
    if (!('speechSynthesis' in window) || !raw) return;
    if (!this.active && !settings.tts) return;
    let text = String(raw).split(/\n\s*Sources?:/i)[0].replace(/\[\d+\]/g, '').replace(/[*_#>`]/g, '').replace(/https?:\/\/\S+/g, '')
      .split('\n').map((l) => l.replace(/^[-•]\s*/, '').trim()).filter(Boolean).join('. ');
    if (brief) text = text.split(/(?<=[.!?。！？])\s+/).slice(0, 2).join(' ');
    text = text.slice(0, 420);
    // never talk over the user: an answer arriving mid-sentence waits for the turn to end
    if (this.active && ((this.inSpeech && !this.bargeCand) || this.pending?.hold)) { this.deferred = { raw, opts: { brief } }; return; }
    this.cancelSpeech();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = /[一-鿿]/.test(text) ? 'zh-CN' : 'en-US'; u.rate = settings.ttsRate;
    const v = speechSynthesis.getVoices().find((x) => x.lang?.startsWith(u.lang.slice(0, 2))); if (v) u.voice = v;
    u.onstart = () => { this.speaking = true; this.lastSaid = text; this.activity(); this.fsm.dispatch('tts_start'); bus.emit('call:agent_start', text); };
    u.onboundary = () => { this.voiceprint = 1; };
    u.onend = u.onerror = () => {
      if (this.utterance !== u) return; this.speaking = false; this.lastSaidEnd = performance.now(); this.window = performance.now() + 20000; this.activity(); this.fsm.dispatch('tts_end'); bus.emit('call:agent_end');
      // the deck stopped on its own while a barge candidate was still talking: that is just the user speaking now
      if (this.inSpeech && this.bargeCand) { this.bargeCand = false; this.fsm.dispatch('vad_start'); bus.emit('call:user_start', { cont: false }); }
    };
    this.utterance = u;
    speechSynthesis.speak(u);
  }
  cancelSpeech() {
    const was = this.speaking; this.utterance = null;
    try { speechSynthesis.cancel(); } catch { /* ignore */ }
    this.speaking = false;
    if (was) { this.lastSaidEnd = performance.now(); bus.emit('call:agent_end'); }
  }

  // ───────────── waveform / voiceprint (command bar + call dock)
  /** Call-dock meter: live level, noise floor and speech threshold — shows why noise is (not) heard. */
  meter() {
    const m = this.meterEl ||= document.getElementById('cd-meter'); if (!m || !this.active) return;
    const pos = (db) => `${Math.max(0, Math.min(100, (db + 80) / 70 * 100))}%`;
    m.style.setProperty('--lv', pos(this.level)); m.style.setProperty('--fl', pos(this.floor)); m.style.setProperty('--th', pos(this.floor + (this.speaking ? settings.vadBarge : settings.vadOn)));
    m.dataset.state = this.inSpeech ? 'speech' : this.noisy ? 'noise' : 'quiet';
  }
  draw() {
    this.meter();
    const css = getComputedStyle(document.body), user = css.getPropertyValue('--accent').trim() || '#49e6ff', agent = css.getPropertyValue('--accent2').trim() || '#ffb347';
    const t = performance.now() / 1000;
    if (this.an) this.an.getByteTimeDomainData(this.buf);
    this.voiceprint = Math.max(this.speaking ? 0.3 : 0, this.voiceprint * 0.92);
    for (const c of this.waves) {
      if (!c.isConnected || c.offsetParent === null) continue;
      const d = Math.min(devicePixelRatio, 2), w = c.clientWidth, h = c.clientHeight;
      if (c.width !== Math.round(w * d)) { c.width = w * d; c.height = h * d; }
      const g = c.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, w, h);
      if (this.speaking) {
        g.fillStyle = agent; g.shadowColor = agent; g.shadowBlur = 6;
        const n = Math.max(24, Math.floor(w / 6));
        for (let i = 0; i < n; i++) { const x = (i + 0.5) * (w / n), amp = (Math.sin(t * 9 + i * 0.7) * 0.5 + 0.5) * this.voiceprint * (h * 0.42) * (1 - Math.abs(i - n / 2) / (n * 0.6)); g.fillRect(x - 1.2, h / 2 - amp, 2.4, amp * 2 + 1); }
        g.shadowBlur = 0;
      }
      if (this.an && !this.muted) {
        g.strokeStyle = user; g.lineWidth = this.inSpeech ? 2 : 1.1; g.shadowColor = user; g.shadowBlur = this.inSpeech ? 8 : 0; g.globalAlpha = this.speaking ? 0.55 : 1;
        g.beginPath();
        for (let i = 0; i < this.buf.length; i += 8) { const x = (i / this.buf.length) * w, y = h / 2 + ((this.buf[i] - 128) / 128) * h * 1.7; i ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.stroke(); g.globalAlpha = 1; g.shadowBlur = 0;
      } else if (!this.speaking) {
        g.strokeStyle = 'rgba(128,128,128,.35)'; g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
      }
    }
    requestAnimationFrame(() => this.draw());
  }
}

/** Float32 chunks @ rate → 16-bit PCM mono WAV @ outRate (linear resampling). */
export function toWav(chunks, rate, outRate = 16000) {
  const len = chunks.reduce((a, c) => a + c.length, 0), all = new Float32Array(len);
  let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; }
  const n = Math.floor(len * outRate / rate), pcm = new Int16Array(n), k = rate / outRate;
  for (let i = 0; i < n; i++) { const x = i * k, j = Math.floor(x), f = x - j, v = (all[j] || 0) * (1 - f) + (all[j + 1] || 0) * f; pcm[i] = Math.max(-1, Math.min(1, v)) * 0x7fff; }
  const buf = new ArrayBuffer(44 + n * 2), dv = new DataView(buf), w = (p, str) => { for (let i = 0; i < str.length; i++) dv.setUint8(p + i, str.charCodeAt(i)); };
  w(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, outRate, true); dv.setUint32(28, outRate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, n * 2, true);
  new Int16Array(buf, 44).set(pcm);
  return new Uint8Array(buf);
}
