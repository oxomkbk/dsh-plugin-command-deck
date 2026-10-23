// Single source of truth for gesture + shortcut documentation (help panels, legend, palette hints, tour).
// [name, how, effect, core?] — core gestures are the only ones you need; they are shown in the on-screen legend.
export const GESTURES = [
  ['POINT', 'raise your index finger', 'The pointer is your fingertip. It snaps onto the nearest button, link or image (magnet) and shows what a pinch will do', true],
  ['PINCH', 'touch thumb to index and release', 'Presses the highlighted control — the one latched when the pinch began', true],
  ['PINCH + DRAG · CONTENT', 'pinch inside a panel and move up/down', 'Scrolls the panel; let go while moving to fling it', true],
  ['PINCH-HOLD + DRAG · TITLE', 'pinch a panel title, hold until the ring fills, then move', 'Lifts the panel (the dock stays still) — drop it on a dock; let go near home and it stays. Layout lock (Shift+L) pins all panels', true],
  ['PINCH + DRAG · SPACE', 'pinch empty space and move', 'Spins the globe (left/right) and tilts the view (up/down)', true],
  ['OPEN PALM HOLD', 'hold an open palm still ~1 s over open space', 'Back: closes the top overlay or returns the stage panel · resumes a paused agent (ignored over panels and menus)', true],
  ['PINCH-HOLD · SPACE', 'pinch empty space and hold still ~0.7 s', 'Radial menu at your fingertip — pinch an item'],
  ['TWO-FINGER PINCH (HOLD)', 'thumb touches index + middle over a panel, hold ~0.4 s', 'Puts the panel on the centre stage / back in its dock'],
  ['TWO-HAND PINCH · SPREAD', 'both hands pinch, move apart / together', 'Zooms the globe · on the stage panel: zooms its content · on a docked panel: grows it'],
  ['FIST · ZOOM IN', 'make a fist and hold it', 'Magnifies the screen around your fist, gradually (up to 4×); open the hand to stop', true],
  ['TWO FISTS · RESET ZOOM', 'make a fist with both hands', 'Back to normal size'],
  ['OPEN PALM AT AN EDGE (ZOOMED)', 'while zoomed, move the open hand to a screen edge', 'Pans the magnified screen up / down / left / right; the centre is a dead zone for pointing'],
  ['SWIPE ← →', 'fast sideways open-hand swipe', 'Next image in the viewer · switches workspace only if swipes are enabled in Settings (off by default)'],
  ['SWIPE ↑ ↓', 'fast vertical open-hand swipe', 'Scrolls the panel under the pointer by a page (when swipes are enabled)'],
  ['FINGER CIRCLE', 'draw circles with the index finger', 'Rotates the KEY DATA wheel, or spins the globe'],
  ['PUSH OUT', 'both open hands push apart quickly', 'Opens the command palette'],
  ['PULL IN', 'both open hands come together quickly', 'Resets the globe view (never the layout)'],
];
// [keys, description, group] — the keyboard handler in main.js implements exactly these
/** Keys that do nothing inside DSH: no sample task, and DSH has no paused turn. */
const EMBEDDED_HIDDEN = new Set(['S', 'P'])
export const shortcutsFor = (embedded) => (embedded ? SHORTCUTS.filter(([k]) => !EMBEDDED_HIDDEN.has(k)) : SHORTCUTS)

export const SHORTCUTS = [
  ['Ctrl/⌘ K', 'Command palette — every feature', 'GLOBAL'], ['Esc', 'Close overlay / stage panel · else stop agent', 'GLOBAL'], ['/', 'Focus command bar', 'GLOBAL'],
  ['S', 'Run the sample task', 'GLOBAL'], ['F1', 'Gesture help', 'HELP'], ['?', 'Shortcut list', 'HELP'],
  ['P', 'Pause / resume agent', 'AGENT'], ['Ctrl/⌘ Enter', 'Retry last command', 'AGENT'],
  ['V', 'Talk: one spoken instruction', 'VOICE'], ['C', 'Start / hang up voice call', 'VOICE'], ['M', 'Mute / unmute call', 'VOICE'],
  ['L', 'UI language English / 中文', 'GLOBAL'], ['Shift+L', 'Lock / unlock the layout', 'PANELS'],
  ['H', 'Gestures on / off', 'GESTURE'], ['Shift+H', 'Re-centre the hand pointer', 'GESTURE'], ['G', 'Gesture lock (pointer only)', 'GESTURE'],
  ['1–4 · [ ]', 'Switch workspace', 'VIEW'], ['Z · Shift+Z', 'Zoom in at the mouse · Shift+Z reset', 'VIEW'], ['F · 0', 'Reset the globe view', 'VIEW'], ['Drag · wheel', 'Spin the globe · zoom (open space)', 'VIEW'],
  ['X', 'Focused panel → centre stage / back', 'PANELS'], ['Ctrl/⌘ Z', 'Undo close / undo reset', 'PANELS'], ['Right-click', 'Radial menu', 'PANELS'],
  ['T · Shift+T', 'Next / previous theme', 'VIEW'], ['Shift+F', 'Full screen', 'VIEW'],
  ['R', 'Reset layout (undo available)', 'RESET'], ['Shift+R', 'Reset everything (confirm)', 'RESET'],
];
