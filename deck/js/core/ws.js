// Reconnecting WebSocket transport with RTT measurement and liveness.
// Liveness lives HERE (transport layer), not in the state machine: if pongs stop
// arriving the socket is closed, which produces an explicit `disconnect` event.
export class Link {
  constructor(url, { onEvent, onStatus }) {
    Object.assign(this, { url, onEvent, onStatus });
    this.backoff = 500; this.lastSeq = 0; this.outbox = []; this.rtt = null; this.lastPong = 0;
    this.connect();
    setInterval(() => this.heartbeat(), 4000);
  }
  connect() {
    this.onStatus('connecting');
    const ws = this.ws = new WebSocket(this.url);
    ws.onopen = () => {
      this.backoff = 500; this.lastSeq = 0; this.lastPong = performance.now();
      this.onStatus('open');
      for (const m of this.outbox.splice(0)) ws.send(JSON.stringify(m));
      this.heartbeat();
    };
    ws.onmessage = (e) => {
      let ev; try { ev = JSON.parse(e.data); } catch { return; }
      if (this.lastSeq && ev.seq !== this.lastSeq + 1) console.warn(`[link] seq gap ${this.lastSeq}→${ev.seq}`);
      this.lastSeq = ev.seq;
      this.lastPong = performance.now();          // any traffic proves liveness
      if (ev.type === 'pong' && ev.data?.t) { this.rtt = Math.round(performance.now() - ev.data.t); this.onStatus('open'); }
      this.onEvent(ev);
    };
    ws.onclose = () => { this.onStatus('closed'); setTimeout(() => this.connect(), this.backoff); this.backoff = Math.min(this.backoff * 1.7, 8000); };
    ws.onerror = () => ws.close();
  }
  heartbeat() {
    if (!this.open) return;
    if (performance.now() - this.lastPong > 15000) { this.ws.close(); return; }   // dead link → close → disconnect event
    this.send({ type: 'ping', t: performance.now() });
  }
  send(msg) {
    if (this.open) this.ws.send(JSON.stringify(msg));
    else if (msg.type === 'run' || msg.type === 'set_framework') this.outbox.push(msg);
  }
  get open() { return this.ws && this.ws.readyState === WebSocket.OPEN; }
}
