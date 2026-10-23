// Theme registry (v5.6). A theme is a whole DESIGN LANGUAGE, not a palette: it decides the layout of the HUD grid,
// the anatomy of a panel (where the title sits, how a button looks and presses), the typography, the motion
// (how panels arrive), the overlay texture, and the 3D world behind it (sky, sun / aurora, floor, bloom, globe
// colours). CSS lives in css/themes.css under body[data-theme=…]; this file holds what JavaScript needs.
//
//   family     — the design language, used to group the gallery
//   motion     — panel entrance: holo · draw · type · snap · mech · slam · float · fade (dock.js → materialize)
//   scene      — the 3D world (space.setTheme); `palette` = [globe, warm, engine] overrides the CSS accent for it
export const FAMILIES = {
  holo: ['HOLOGRAPHIC', '全息'], retro: ['RETRO-FUTURE', '复古未来'], street: ['STREET · EDGE', '街头 · 锐利'],
  technical: ['TECHNICAL', '工程技术'], editorial: ['EDITORIAL · RAW', '编辑 · 原生'], spatial: ['SPATIAL · MINIMAL', '空间 · 极简'],
};
export const THEMES = {
  jarvis: {
    family: 'holo', motion: 'holo', name: 'ORBITAL', zh: '轨道指挥', tag: 'Holo-cyan command bridge, chamfered glass', tagZh: '全息青 · 指挥舰桥',
    sw: ['#49e6ff', '#ffb347', '#00101c'],
    scene: { sky: ['#000308', '#03182a'], horizon: 0.55, sun: 0, aurora: 0, dust: 0, caustics: 0, floor: 1, floorTint: null, bloom: 0.72, stars: 1, motes: 1 },
  },
  aurora: {
    family: 'holo', motion: 'float', name: 'AURORA', zh: '极光', tag: 'Polar night, ribbons of light, frosted glass', tagZh: '极夜 · 光带 · 磨砂玻璃',
    sw: ['#5effc8', '#b388ff', '#021018'],
    scene: { sky: ['#01060c', '#06243a'], horizon: 0.7, sun: 0, aurora: 1, dust: 0, caustics: 0.4, floor: 0.7, floorTint: '#5effc8', bloom: 0.8, stars: 1.3, motes: 0.6 },
  },
  synthwave: {
    family: 'retro', motion: 'holo', name: 'OUTRUN', zh: '合成浪潮', tag: 'Chrome sunset over an endless grid', tagZh: '铬色落日 · 无尽网格',
    sw: ['#ff6ad5', '#ffd319', '#1a0533'],
    scene: { sky: ['#0b0120', '#a3186a'], horizon: 1.2, sun: 1, sunColor: ['#ffd319', '#ff2975'], aurora: 0, dust: 0, caustics: 0, floor: 2.2, floorTint: '#c936ff', bloom: 0.9, stars: 0.8, motes: 0.4 },
  },
  apollo: {
    family: 'retro', motion: 'mech', name: "APOLLO '69", zh: '阿波罗 69', tag: 'Mission-control consoles: bezels, keycaps, nixie digits', tagZh: '任务控制台 · 实体按键 · 辉光管数字',
    sw: ['#ff8a3d', '#c9bfa5', '#1b1d1a'],
    scene: { sky: ['#050504', '#2a2418'], horizon: 0.8, sun: 0, aurora: 0, dust: 0.35, caustics: 0, floor: 0.7, floorTint: '#ff8a3d', bloom: 0.6, stars: 1, motes: 0.4, palette: ['#9fe8c8', '#ff8a3d', '#ffb066'] },
  },
  neon: {
    family: 'street', motion: 'slam', name: 'NEON NOIR', zh: '霓虹黑夜', tag: 'Rain-slick megacity, magenta & electric cyan', tagZh: '雨夜都市 · 品红与电光青',
    sw: ['#ff2bd6', '#00f0ff', '#0b0012'],
    scene: { sky: ['#020006', '#3a0a5c'], horizon: 1.0, sun: 0, aurora: 0, dust: 0, caustics: 0, floor: 1.5, floorTint: '#00f0ff', bloom: 0.95, stars: 0.25, motes: 1.4 },
  },
  mecha: {
    family: 'street', motion: 'slam', name: 'MECHA', zh: '机甲', tag: 'Battle-unit interface: vertical tabs, hazard tape, hex armour', tagZh: '战斗机甲界面 · 竖排标签 · 警示条',
    sw: ['#9dff00', '#8f4bff', '#050505'],
    scene: { sky: ['#020202', '#1a0a33'], horizon: 0.9, sun: 0, aurora: 0, dust: 0, caustics: 0, floor: 1.4, floorTint: '#8f4bff', bloom: 0.85, stars: 0.3, motes: 0.8, palette: ['#9dff00', '#ff6a00', '#8f4bff'] },
  },
  blueprint: {
    family: 'technical', motion: 'draw', name: 'BLUEPRINT', zh: '蓝图', tag: 'Engineering drawing: hairlines, title blocks, dimension marks', tagZh: '工程图纸 · 细线 · 图框标题栏',
    sw: ['#e8f1ff', '#ff6b5b', '#0b2d5c'],
    scene: { sky: ['#06183a', '#0f3b73'], horizon: 0.5, sun: 0, aurora: 0, dust: 0, caustics: 0, floor: 0.9, floorTint: '#cfe2ff', bloom: 0.35, stars: 0, motes: 0.2, palette: ['#e8f1ff', '#ff6b5b', '#cfe2ff'] },
  },
  terminal: {
    family: 'technical', motion: 'type', name: 'TERMINAL', zh: '终端', tag: 'Amber VT220: tmux panes, box-drawing borders, status line', tagZh: '琥珀终端 · 分屏窗格 · 状态栏',
    sw: ['#ffb000', '#ffe8b0', '#0a0600'],
    scene: { sky: ['#020100', '#140b00'], horizon: 0.4, sun: 0, aurora: 0, dust: 0, caustics: 0, floor: 0.7, floorTint: '#ffb000', bloom: 0.6, stars: 0, motes: 0.2, palette: ['#ffb000', '#ffe8b0', '#ff8c00'] },
  },
  brutal: {
    family: 'editorial', motion: 'snap', name: 'BRUTALIST', zh: '粗野主义', tag: 'Raw blocks, hard shadows, giant type, zero glow', tagZh: '粗粝色块 · 硬阴影 · 巨型字体',
    sw: ['#ffe500', '#111111', '#f1eee6'],
    scene: { sky: ['#050505', '#151515'], horizon: 0.4, sun: 0, aurora: 0, dust: 0, caustics: 0, floor: 0.8, floorTint: '#f1eee6', bloom: 0.25, stars: 0.5, motes: 0.2, palette: ['#ffe500', '#ff3b00', '#f1eee6'] },
  },
  monolith: {
    family: 'editorial', motion: 'fade', name: 'MONOLITH', zh: '黑金', tag: 'Obsidian and gold, quiet luxury', tagZh: '黑曜石与金 · 静奢',
    sw: ['#e8c574', '#f5efe0', '#050505'],
    scene: { sky: ['#020202', '#14110b'], horizon: 0.5, sun: 0, aurora: 0, dust: 0, caustics: 0, floor: 0.6, floorTint: '#e8c574', bloom: 0.45, stars: 0.6, motes: 0.3 },
  },
  glass: {
    family: 'spatial', motion: 'float', name: 'GLASS', zh: '空间玻璃', tag: 'Spatial computing: floating glass, pills, sentence case', tagZh: '空间计算 · 漂浮玻璃 · 胶囊控件',
    sw: ['#a5b4ff', '#ff9ad5', '#0b0d17'],
    scene: { sky: ['#05060d', '#262b55'], horizon: 0.8, sun: 0, aurora: 0.25, dust: 0, caustics: 0, floor: 0.45, floorTint: '#a5b4ff', bloom: 0.55, stars: 0.8, motes: 0.5 },
  },
  helmet: {
    family: 'spatial', motion: 'fade', name: 'VISOR', zh: '头盔视窗', tag: 'Pilot visor HUD: no panels, only light on glass', tagZh: '飞行员头盔 · 无面板 · 光投在面罩上',
    sw: ['#6dff8f', '#ffd23f', '#000a04'],
    scene: { sky: ['#000000', '#04140a'], horizon: 0.6, sun: 0, aurora: 0, dust: 0, caustics: 0, floor: 1.1, floorTint: '#6dff8f', bloom: 0.9, stars: 0.6, motes: 0.3, palette: ['#6dff8f', '#ffd23f', '#6dff8f'] },
  },
  arctic: {
    family: 'spatial', motion: 'float', name: 'ARCTIC', zh: '冰原', tag: 'White ice-glass panels over a polar night', tagZh: '冰白玻璃面板 · 极地夜空',
    sw: ['#e9f6ff', '#2f7bff', '#0a1a2e'],
    scene: { sky: ['#030a14', '#16304d'], horizon: 1.0, sun: 0, aurora: 0.45, dust: 0, caustics: 0, floor: 0.9, floorTint: '#bfe6ff', bloom: 0.6, stars: 1.2, motes: 1.8, palette: ['#6fb0ff', '#ff5a36', '#bfe6ff'] },
  },
};
export const THEME_IDS = Object.keys(THEMES);
// retired theme ids → their closest current theme
export const LEGACY = { cyan: 'aurora', abyss: 'aurora', amber: 'apollo', mars: 'apollo', matrix: 'terminal', crimson: 'mecha' };
export const themeOf = (id) => THEMES[LEGACY[id] || id] ? (LEGACY[id] || id) : 'jarvis';
