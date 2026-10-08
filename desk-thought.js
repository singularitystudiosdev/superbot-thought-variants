// desk-thought.js: variant B, which is only a thinking bubble (no chat box):
// a vanilla port of superbot-desktop's ThoughtBubble (apps/desktop/src/renderer/src/hub/thought-bubble.tsx on origin/main,
// the folded Spotlight look) and its head row (SonarTrace's label + clock). The
// pacer, the whole-word cut, the clock and the line shift are the
// desktop's functions (reasoning-pacer.ts, step-words.ts formatClock,
// thought-bubble.tsx lineShift), copied as they are.
// The one change is the pacer's knobs: the desktop reveals a thought over ~450 ms
// (PACER, hold 100 / lead 450 / tail 240 ms, 55..1800 chars/s); this one thinks
// extremely fast (FAST): a thought streams in over ~5 frames and the next follows
// BEAT_MS later, about 10 thoughts a second.

const FAST = { holdMs: 0, leadMs: 60, tailMs: 60, minCps: 2500, maxCps: 20000 };
const STEP_SEP = ' · ';
const CLOCK_TICK_MS = 250;

const frameNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** reasoning-pacer.ts pacerStep: advance `shown` toward `target` characters at `now`. */
function pacerStep(state, target, ended, now, knobs) {
  if (target <= 0) return { shown: 0, lastAt: now };
  const firstAt = state.firstAt ?? now;
  if (now - firstAt < knobs.holdMs) return { shown: 0, firstAt, lastAt: now };
  const shown = Math.min(state.shown, target);
  const dt = state.lastAt === undefined ? 0 : Math.max(0, now - state.lastAt);
  const backlog = target - shown;
  if (backlog <= 0) return { shown: target, firstAt, lastAt: now };
  const window = ended ? knobs.tailMs : knobs.leadMs;
  const cps = Math.min(knobs.maxCps, Math.max(knobs.minCps, (backlog / window) * 1000));
  return { shown: Math.min(target, shown + (cps * dt) / 1000), firstAt, lastAt: now };
}

/** reasoning-pacer.ts isSpaceCode. */
function isSpaceCode(code) {
  if (code <= 0x20) return code === 0x20 || (code >= 0x09 && code <= 0x0d);
  if (code < 0xa0) return false;
  return code === 0xa0 || code === 0x1680 || (code >= 0x2000 && code <= 0x200a) || code === 0x2028 || code === 0x2029 || code === 0x202f || code === 0x205f || code === 0x3000 || code === 0xfeff;
}

/** reasoning-pacer.ts revealedEnd: the end of the last whole word at `shown`. */
function revealedEnd(text, shown) {
  if (shown >= text.length) return text.length;
  const cut = Number.isNaN(shown) ? 0 : Math.max(0, Math.floor(shown));
  if (isSpaceCode(text.charCodeAt(cut))) return cut;
  for (let index = cut - 1; index >= 0; index -= 1) {
    if (isSpaceCode(text.charCodeAt(index))) return index;
  }
  return 0;
}

/** reasoning-pacer.ts revealedTrimmedEnd. */
function revealedTrimmedEnd(text, shown) {
  let end = revealedEnd(text, shown);
  while (end > 0 && isSpaceCode(text.charCodeAt(end - 1))) end -= 1;
  return end;
}

/** step-words.ts formatClock: the live clock, floored whole seconds. */
function formatClock(ms) {
  const total = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
  if (total < 60) return `${total}s`;
  return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, '0')}s`;
}

/** thought-bubble.tsx lineShift: how far the folded text scrolls when it grows. */
function lineShift(before, after, box) {
  return Math.max(0, Math.max(0, after - box) - Math.max(0, before - box));
}

const MARKUP = `
  <div class="sb-thought" data-slot="thought-bubble" data-settled="false" data-look="spotlight" data-live="true">
    <span class="sb-thought-tail" aria-hidden="true">
      <span class="sb-thought-dot" data-size="small"></span>
      <span class="sb-thought-dot"></span>
    </span>
    <div class="sb-thought-bubble" data-open="false">
      <div class="sb-thought-head">
        <span class="sb-sonar-label"><span class="sb-swap-line" data-slot="thinking-line-text">Thinking</span></span>
        <span class="sb-sonar-clock"><span class="sb-sonar-clock-sep">${STEP_SEP}</span><span class="sb-sonar-clock-digits">0s</span></span>
      </div>
      <div class="sb-thought-lines" data-slot="thought-bubble-body" data-clipped="false" hidden>
        <div class="sb-thought-layer"><p class="sb-thought-text" data-slot="thought-bubble-text"></p></div>
      </div>
    </div>
  </div>`;

/** The pause between one thought landing and the next starting. */
const BEAT_MS = 40;
/** How many thoughts stay in the DOM; older ones drop off the (clipped) top. */
const KEEP_THOUGHTS = 6;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function shuffled(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Variant B: the bubble alone, thinking nonstop. `run(thoughts)` streams them
    one after another, forever, each revealed word by word on the FAST pacer. */
export function createThoughtStream(host) {
  host.innerHTML = MARKUP;
  const digits = host.querySelector('.sb-sonar-clock-digits');
  const lines = host.querySelector('.sb-thought-lines');
  const para = host.querySelector('.sb-thought-text');
  let height = 0;
  let startedAt = 0;

  // the folded window: when a new line starts past the last row, the text
  // scrolls up by it (thought-bubble.tsx's ResizeObserver on the paragraph)
  new ResizeObserver((entries) => {
    const entry = entries[entries.length - 1];
    if (!entry) return;
    const before = height;
    const after = Math.round(entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height);
    if (after === before) return;
    height = after;
    const room = lines.clientHeight;
    lines.dataset.clipped = String(after > room);
    const shift = lineShift(before, after, room);
    if (shift > 0 && before > 0) {
      para.style.setProperty('--sb-thought-shift', `${shift}px`);
      para.dataset.scroll = para.dataset.scroll === 'a' ? 'b' : 'a';
    }
  }).observe(para);

  // newly revealed words mount as spans and play the one-shot fade; the
  // whitespace between them stays plain text, as in the desktop's bubbleWords
  function appendWords(into, chunk) {
    const re = /(\s*)(\S+)/g;
    let at = 0;
    for (let match = re.exec(chunk); match !== null; match = re.exec(chunk)) {
      if (match[1]) into.append(match[1]);
      const word = document.createElement('span');
      word.className = 'sb-thought-word';
      word.textContent = match[2];
      into.append(word);
      at = re.lastIndex;
    }
    if (at < chunk.length) into.append(chunk.slice(at));
  }

  /** One thought, revealed on the FAST pacer as its own paragraph. */
  function reveal(text) {
    const block = document.createElement('span');
    // the paragraph gap lands with the first words, never a frame ahead of them
    let gap = para.childElementCount > 0 ? '\n\n' : '';
    para.append(block);
    while (para.childElementCount > KEEP_THOUGHTS) para.firstElementChild.remove();
    // seeded with now, so the very first frame already reveals (the pacer
    // otherwise spends that frame reading its clock)
    let state = { shown: 0, lastAt: frameNow() };
    let drawn = 0;
    return new Promise((resolve) => {
      const step = () => {
        state = pacerStep(state, text.length, true, frameNow(), FAST);
        const count = Math.floor(state.shown);
        const end = count < text.length ? revealedTrimmedEnd(text, count) : text.length;
        if (end > drawn) {
          appendWords(block, gap + text.slice(drawn, end));
          gap = '';
          drawn = end;
        }
        if (drawn < text.length) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  }

  /** Think about `thoughts` forever, in a fresh order each pass, each ask in
      one of its forms picked at random every time it comes round. */
  async function run(thoughts) {
    startedAt = frameNow();
    const tick = () => {
      digits.textContent = formatClock(frameNow() - startedAt);
    };
    tick();
    setInterval(tick, CLOCK_TICK_MS);
    lines.hidden = false;
    for (;;) {
      for (const item of shuffled(thoughts)) {
        await reveal(item.forms[Math.floor(Math.random() * item.forms.length)]);
        await sleep(BEAT_MS);
      }
    }
  }

  return { run };
}
