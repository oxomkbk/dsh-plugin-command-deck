// Line icons as inline SVG (stroke = currentColor) — no emoji, so they render identically everywhere.
const svg = (d) => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

export const ICONS = {
  hand: svg('<path d="M8 12V5.5a1.5 1.5 0 0 1 3 0V11"/><path d="M11 10V4a1.5 1.5 0 0 1 3 0v6"/><path d="M14 10.5V5.5a1.5 1.5 0 0 1 3 0V13"/><path d="M8 11.5 6.6 10a1.6 1.6 0 0 0-2.4 2.1L7.5 17c1.4 2.2 3 3.5 6 3.5 3.2 0 5-2.2 5-5.5v-4a1.5 1.5 0 0 0-1.5-1.5"/>'),
  mic: svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0"/><path d="M12 17.5V21M8.5 21h7"/>'),
  keys: svg('<rect x="2.5" y="6" width="19" height="12" rx="1.5"/><path d="M6 9.5h1M9.5 9.5h1M13 9.5h1M16.5 9.5h1M6 12.5h1M9.5 12.5h1M13 12.5h1M16.5 12.5h1M7.5 15.5h9"/>'),
  tools: svg('<path d="M14.5 6.5a4 4 0 0 0 5 5L21 13l-2 2-1.5-1.5a4 4 0 0 0-5-5"/><path d="m12.5 8.5-9 9a1.4 1.4 0 0 0 2 2l9-9"/><path d="M9 4.5 6.5 2 3 5.5 5.5 8"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/><circle cx="12" cy="12" r="6.5"/>'),
  tour: svg('<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/><circle cx="12" cy="12" r=".6" fill="currentColor"/>'),
  phone: svg('<path d="M5 3.5h3.2l1.6 4.3-2 1.3a11 11 0 0 0 7.1 7.1l1.3-2 4.3 1.6V19a1.5 1.5 0 0 1-1.6 1.5A16.5 16.5 0 0 1 3.5 5.1 1.5 1.5 0 0 1 5 3.5z"/>'),
  speaker: svg('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>'),
};
