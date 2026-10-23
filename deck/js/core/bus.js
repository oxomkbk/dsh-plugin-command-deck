// Tiny synchronous event bus shared by every module.
export class Bus {
  constructor() { this.m = new Map(); }
  on(t, fn) { if (!this.m.has(t)) this.m.set(t, new Set()); this.m.get(t).add(fn); return () => this.m.get(t).delete(fn); }
  emit(t, p) { for (const fn of [...(this.m.get(t) || [])]) { try { fn(p); } catch (e) { console.error(`[bus:${t}]`, e); } } }
}
export const bus = new Bus();
