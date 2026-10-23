// Global command palette (Ctrl/Cmd+K): fuzzy search over every deck command + history.
import { t } from '../core/i18n.js';
const el = (t, c, txt) => { const e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; };

function score(q, s) {
  if (!q) return 1;
  q = q.toLowerCase(); s = s.toLowerCase();
  if (s.includes(q)) return 100 - s.indexOf(q);
  let i = 0, sc = 0;
  for (const ch of s) { if (ch === q[i]) { i++; sc += 2; } if (i === q.length) return sc; }
  return 0;
}

export class Palette {
  constructor(getCommands, onRun) {
    this.getCommands = getCommands; this.onRun = onRun; this.m = document.getElementById('palette'); this.sel = 0;
    this.m.addEventListener('click', (e) => { if (e.target === this.m) this.close(); });
  }
  get open() { return !this.m.hidden; }
  toggle() { this.open ? this.close() : this.show(); }
  close() { this.m.hidden = true; }
  show(prefill = '') {
    const box = el('div', 'modal-box');
    const inp = this.inp = el('input', 'pal-input'); inp.placeholder = t('Type a command or a question for the agent…'); inp.value = prefill;
    this.list = el('div', 'pal-list');
    box.append(inp, this.list);
    this.m.replaceChildren(box); this.m.hidden = false;
    inp.oninput = () => { this.sel = 0; this.render(); };
    inp.onkeydown = (e) => {
      if (e.key === 'ArrowDown') { this.sel = Math.min(this.sel + 1, this.items.length - 1); this.render(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { this.sel = Math.max(this.sel - 1, 0); this.render(); e.preventDefault(); }
      else if (e.key === 'Enter') { this.pick(this.items[this.sel]); e.preventDefault(); }
      else if (e.key === 'Escape') { this.close(); e.stopPropagation(); }
    };
    this.render(); setTimeout(() => inp.focus(), 20);
  }
  render() {
    const q = this.inp.value.trim();
    const cmds = this.getCommands().map((c) => ({ ...c, s: score(q, `${c.group} ${c.label}`) })).filter((c) => c.s > 0).sort((a, b) => b.s - a.s).slice(0, 14);
    if (q) cmds.unshift({ group: t('AGENT'), label: `${t('Run')}: “${q}”`, run: () => this.onRun(q), s: 999 });
    this.items = cmds;
    this.list.replaceChildren(...cmds.map((c, i) => {
      const r = el('div', `pal-item${i === this.sel ? ' sel' : ''}`); r.append(el('span', 'g', c.group), el('span', null, c.label));
      if (c.key) r.append(el('span', 'k', c.key));
      r.onclick = () => this.pick(c); r.onmouseenter = () => { this.sel = i; };
      return r;
    }));
  }
  pick(c) { if (!c) return; this.close(); c.run(); }
}
