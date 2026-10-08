// Keeps the chat bar one line tall: the text shrinks to fit instead of the bar
// growing. It stays on one line at image 1's size while it fits, gets smaller,
// then wraps to two lines (the most the bar shows); past the floor size it
// scrolls, and app.js fades the edge that has text hidden behind it.

const FONT_MAX = 69.2; // image 1's placeholder size
const FONT_MIN = 30;
const LINE = 83 / 69.2; // image 1's rhythm: 83px lines, 11px pads in the 105px bar
const BOX_H = 105;
const ROOM_H = 93; // the text block keeps 6px clear of the bar's top and bottom
const MAX_LINES = 2;
const STEPS = 12;

function linesAt(field, size) {
  field.style.fontSize = `${size}px`;
  field.style.lineHeight = `${size * LINE}px`;
  field.style.padding = '0';
  field.style.height = '0px';
  return Math.max(1, Math.round(field.scrollHeight / (size * LINE)));
}

const fits = (lines, size) => lines <= MAX_LINES && lines * size * LINE <= ROOM_H;

/** Size `field`'s text to the bar and return the vertical padding it got. */
export function fitText(field) {
  let size = FONT_MAX;
  if (field.value && !fits(linesAt(field, FONT_MAX), FONT_MAX)) {
    let lo = FONT_MIN;
    let hi = FONT_MAX;
    for (let i = 0; i < STEPS; i++) {
      const mid = (lo + hi) / 2;
      if (fits(linesAt(field, mid), mid)) lo = mid;
      else hi = mid;
    }
    size = lo;
  }
  const lineH = size * LINE;
  const lines = Math.min(MAX_LINES, linesAt(field, size));
  const pad = (BOX_H - lines * lineH) / 2;
  field.style.padding = `${pad}px 0`;
  field.style.height = `${BOX_H}px`;
  field.style.setProperty('--fade-len', `${pad + lineH * 0.5}px`);
  return pad;
}
