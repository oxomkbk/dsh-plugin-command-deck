// DSH skins: each Command Deck design language mapped onto DeepSeek Harness's own design tokens (--dsw-alias-*),
// so the stock DSH chat, sidebar, menus and settings take on the same look as the deck. Applied while
// body[data-cdeck-skin="<theme>"] is set (the boot script sets it from the console settings before first paint).
// Tokens are declared !important so they win over the theme presenter's inline token layer; turning the skin off
// removes the attribute and DSH's own light/dark theme is back untouched.

/** Theme ids, identical to the deck's (frontend js/core/themes.js). */
export const THEME_IDS = ['jarvis', 'aurora', 'synthwave', 'apollo', 'neon', 'mecha', 'blueprint', 'terminal', 'brutal', 'monolith', 'glass', 'helmet', 'arctic']

// bg · layer1 · layer2 · layer3 · text · text2 · text3 · accent · accent2 · on-accent · font (text) · display font · mono · radius · light?
const P = {
  jarvis:    ['#020a12', '#061420', '#0a1d2c', '#0f2738', '#d8f6ff', '#9fc9d9', '#6f97a8', '#49e6ff', '#ffb347', '#001018', "'Rajdhani'", "'Orbitron'", "'JetBrains Mono'", 2],
  aurora:    ['#01060c', '#06141e', '#0a1f2b', '#0f2a38', '#e4fff8', '#a9d9cc', '#78a89c', '#5effc8', '#b388ff', '#022018', "'Exo 2'", "'Exo 2'", "'JetBrains Mono'", 16],
  synthwave: ['#0d0221', '#160535', '#200a45', '#2b1157', '#ffe6ff', '#d3a9d6', '#a57ca9', '#ff6ad5', '#ffd319', '#1a0533', "'Exo 2'", "'Audiowide'", "'JetBrains Mono'", 12],
  apollo:    ['#121410', '#1a1d17', '#22261f', '#2c3128', '#e3f2e0', '#b5c4b0', '#87957f', '#ff8a3d', '#7fd6c2', '#1b1206', "'Exo 2'", "'Michroma'", "'Oxanium'", 8],
  neon:      ['#05000a', '#0e0016', '#170324', '#220733', '#ffe3fa', '#d3a6c9', '#a07796', '#ff2bd6', '#00f0ff', '#12001a', "'Chakra Petch'", "'Tektur'", "'JetBrains Mono'", 2],
  mecha:     ['#050505', '#0d0a17', '#151024', '#1e1733', '#eaffd0', '#bcd7a0', '#8aa673', '#9dff00', '#ff6a00', '#0a0f00', "'Chakra Petch'", "'Chakra Petch'", "'JetBrains Mono'", 0],
  blueprint: ['#0b2d5c', '#0e3569', '#123f78', '#164a88', '#e8f1ff', '#bcd0ec', '#8fa8cc', '#e8f1ff', '#ff6b5b', '#0b2d5c', "'Exo 2'", "'Michroma'", "'Share Tech Mono'", 0],
  terminal:  ['#0a0600', '#120b00', '#1a1100', '#241800', '#ffcc66', '#d6a64a', '#a37c33', '#ffb000', '#ffe8b0', '#0a0600', "'VT323'", "'VT323'", "'VT323'", 0],
  brutal:    ['#f1eee6', '#ffffff', '#e8e4d8', '#dcd7c8', '#111111', '#333333', '#555555', '#111111', '#ff3b00', '#ffe500', "'Helvetica Neue', Arial", "'Arial Black', Arial", "'Courier New'", 0, true],
  monolith:  ['#050505', '#0d0c0a', '#15130f', '#1e1b15', '#f5efe0', '#cfc6b1', '#9c937f', '#e8c574', '#f5efe0', '#0b0905', "'Exo 2'", "'Michroma'", "'JetBrains Mono'", 0],
  glass:     ['#0b0d17', '#141729', '#1b1f36', '#232845', '#eef0ff', '#c2c7e6', '#9096b8', '#a5b4ff', '#ff9ad5', '#0b0d17', "'Exo 2'", "'Exo 2'", "'JetBrains Mono'", 20],
  helmet:    ['#000000', '#020c05', '#041409', '#071d0d', '#c8ffd4', '#8fd9a2', '#62a676', '#6dff8f', '#ffd23f', '#001a07', "'Share Tech Mono'", "'Oxanium'", "'Share Tech Mono'", 2],
  arctic:    ['#eef6fd', '#ffffff', '#e4f0fb', '#d6e7f7', '#0b1d33', '#2c4462', '#5b7290', '#2f7bff', '#ff5a36', '#ffffff', "'Exo 2'", "'Michroma'", "'JetBrains Mono'", 14, true],
}

const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] }
const rgba = (h, a) => `rgba(${hex(h).join(', ')}, ${a})`

function themeBlock(id) {
  const [bg, l1, l2, l3, fg, fg2, fg3, ac, ac2, onAc, font, disp, mono, radius, light] = P[id]
  const line = light ? '#111111' : ac
  const T = {
    'bg-base': bg, 'bg-layer-1': l1, 'bg-layer-2': l2, 'bg-layer-3': l3, 'bg-module-platform': l1, 'bg-overlay': rgba(bg, 0.72), 'bg-skeleton': rgba(fg, 0.08),
    'label-primary': fg, 'label-secondary': fg2, 'label-tertiary': fg3, 'label-caption': fg3, 'label-dimmed': rgba(fg, 0.45), 'label-primary-dimmed': rgba(fg, 0.6),
    'label-primary-foreground': onAc, 'label-primary-inverted': bg,
    'state-business-primary': ac, 'state-business-tertiary': rgba(ac, 0.14), 'brand-primary': ac, 'link': ac,
    'border-l1': rgba(line, light ? 0.1 : 0.12), 'border-l2': rgba(line, light ? 0.18 : 0.22), 'border-l3': rgba(line, light ? 0.3 : 0.34), 'border-l4': rgba(line, light ? 0.5 : 0.5),
    'interactive-bg-hover': rgba(ac, light ? 0.18 : 0.1), 'interactive-bg-hover-solid': light ? l3 : l2, 'interactive-bg-active': rgba(ac, light ? 0.28 : 0.18),
    'button-primary-fill': id === 'brutal' ? '#111111' : ac, 'button-primary-hover': id === 'brutal' ? '#333333' : rgba(ac, 0.85),
    'button-floating-fill': l2, 'button-floating-hover': l3, 'button-elevated-fill': l2, 'button-contrast-fill': fg,
    'markdown-code-block': light ? l2 : rgba(ac, 0.06), 'settings-card-fill': l1, 'settings-card-stroke': rgba(line, 0.2),
    'tooltip-bg': light ? '#111111' : l3, 'scrollbar-bg-l2': rgba(ac, 0.18), 'scrollbar-hover-l2': rgba(ac, 0.36), 'scrollbar-bg-l1': rgba(ac, 0.12),
    'menu-icon': fg2, 'toast-bg': l3, 'toast-label': fg, 'bg-layer-4': l3,
  }
  // surface-specific tokens (sidebar, composer, bubbles, menus) and the corner radius scale: the design language
  // reshapes DSH's geometry too (BRUTALIST and TERMINAL square, GLASS and AURORA round)
  const S = {
    'sidebar-fill': l1, 'sidebar-nav-item-hover': rgba(ac, light ? 0.14 : 0.08), 'sidebar-nav-item-active': rgba(ac, light ? 0.22 : 0.14), 'sidebar-nav-item-active-accent': id === 'brutal' ? '#111111' : ac,
    'input-major': light ? l1 : l2, 'bubble': light ? l2 : rgba(ac, 0.1), 'bubble-highlight': rgba(ac, 0.18), 'selector': l2, 'menu': l2, 'tip': l3, 'login-input': l2,
  }
  const R = { xs: radius * 0.25, sm: radius * 0.5, md: radius, lg: radius * 1.4, xl: radius * 1.8, panel: radius * 1.4 }
  const vars = Object.entries(T).map(([k, v]) => `--dsw-alias-${k}: ${v} !important;`).join(' ')
    + ' ' + Object.entries(S).map(([k, v]) => `--dsw-specific-${k}: ${v} !important;`).join(' ')
    + ` --dsw-menu-surface-fill: ${l2} !important; ` + Object.entries(R).map(([k, v]) => `--dsw-radius-${k}: ${Math.round(v)}px !important;`).join(' ')
  // the DSH token layer (skin on) — and the theme's own palette for the boot animation and HUD, which follow the
  // selected theme even while the DSH skin is off
  return `body[data-cdeck-skin="${id}"] { ${vars}
  --dsw-font-family: ${font}, system-ui, sans-serif !important; --ds-font-family-code: ${mono}, ui-monospace, monospace !important; color-scheme: ${light ? 'light' : 'dark'}; }
body[data-cdeck-skin="${id}"], [data-cdeck-t="${id}"] { --cdk-bg: ${bg}; --cdk-layer: ${l1}; --cdk-fg: ${fg}; --cdk-dim: ${fg3}; --cdk-accent: ${ac}; --cdk-accent-rgb: ${hex(ac).join(', ')};
  --cdk-accent2: ${ac2}; --cdk-on: ${onAc}; --cdk-disp: ${disp}; --cdk-mono: ${mono}; --cdk-radius: ${radius}px; --cdk-light: ${light ? 1 : 0}; }`
}

const FONTS = [
  ['Rajdhani', 'rajdhani-500.woff2', 500], ['Rajdhani', 'rajdhani-600.woff2', 600], ['Rajdhani', 'rajdhani-700.woff2', 700],
  ['Orbitron', 'orbitron-500.woff2', 500], ['Orbitron', 'orbitron-700.woff2', 700], ['Orbitron', 'orbitron-900.woff2', 900],
  ['Share Tech Mono', 'share-tech-mono-400.woff2', 400], ['JetBrains Mono', 'jetbrains-mono-400.woff2', 400],
  ['Audiowide', 'audiowide-400.woff2', 400], ['Chakra Petch', 'chakra-petch-500.woff2', 500], ['Chakra Petch', 'chakra-petch-700.woff2', '600 900'],
  ['Exo 2', 'exo-2-var.woff2', '100 900'], ['Michroma', 'michroma-400.woff2', 400], ['Oxanium', 'oxanium-var.woff2', '200 800'],
  ['Tektur', 'tektur-var.woff2', '400 900'], ['VT323', 'vt323-400.woff2', 400],
]

/** The complete skin stylesheet: deck fonts (served by this plugin), every theme's token block, and the skin's few structural accents. */
export function skinCss(mount) {
  const faces = FONTS.map(([f, file, w]) => `@font-face { font-family: '${f}'; src: url('${mount}vendor/fonts/${file}') format('woff2'); font-weight: ${w}; font-display: swap; }`).join('\n')
  const accents = `
/* skin accents: the accent glows on focus, headings take the display face, scrollbars and selection follow the theme */
body[data-cdeck-skin] ::selection { background: rgba(var(--cdk-accent-rgb), .32); }
/* the focus ring belongs to controls only — a ring drawn on a layout container reads as a stray box */
body[data-cdeck-skin]:not([data-cdeck-skin="brutal"]):not([data-cdeck-skin="arctic"]):not([data-cdeck-skin="monolith"]):not([data-cdeck-skin="blueprint"])
  :is(a, button, input, select, textarea, summary, [tabindex]):focus-visible { box-shadow: 0 0 0 1px var(--cdk-accent), 0 0 14px rgba(var(--cdk-accent-rgb), .45); }
body[data-cdeck-skin] h1, body[data-cdeck-skin] h2 { font-family: var(--cdk-disp), var(--dsw-font-family) !important; }
/* no global type scale: it would re-flow third-party pages too */
body[data-cdeck-skin="terminal"] { text-shadow: 0 0 5px rgba(255, 176, 0, .35); }
body[data-cdeck-skin="brutal"] button { border-radius: 0 !important; }
body[data-cdeck-skin="helmet"] { text-shadow: 0 0 6px rgba(109, 255, 143, .4); }
`
  return `${faces}\n${THEME_IDS.map(themeBlock).join('\n')}\n${accents}`
}
