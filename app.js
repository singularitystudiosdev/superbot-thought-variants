// Page states: idle (empty bar, no thumb) -> typing (no thumb, mascot thinks)
// -> judging (sent to Jev) -> accepted (thumbs up, laugh, confetti) or refused
// (thumbs down, head shake). Editing the text after a verdict goes back to typing.
//
// Two variants: A ("/") is image 1's chat bar with the thought-dots bubble and a
// 0.1-0.6 s think. B ("/b") has no chat box at all: superbot-desktop's thinking
// bubble sits where the bar was and Jev's thoughts stream through it nonstop,
// super fast (desk-thought.js).
import { createMascot } from './mascot.js';
import { createConfetti } from './confetti.js';
import { fitText } from './fit-text.js';
import { createThoughtStream } from './desk-thought.js';
import { THOUGHTS } from './thoughts.js';

const STAGE_W = 1456;
const STAGE_H = 819;
const THINK_MIN_MS = 100;
const THINK_MAX_MS = 600;
const THINK_SHORT_CHARS = 10;
const THINK_LONG_CHARS = 120;

// B by the page's own attribute (the GitHub Pages build ships b/index.html with
// data-variant="b"), the local server's /b route, or ?variant=b
const VARIANT =
  document.documentElement.dataset.variant === 'b' || /^\/b\/?$/.test(location.pathname) || new URLSearchParams(location.search).get('variant') === 'b'
    ? 'b'
    : 'a';
// variant A's one call, on send: the local server, or on GitHub Pages (no server)
// the Cloudflare relay in worker/, which holds the Jev key
const JUDGE_URL = location.hostname.endsWith('github.io')
  ? 'https://superbot-thumb-judge.click-the-button-website.workers.dev/api/judge'
  : '/api/judge';
document.documentElement.dataset.variant = VARIANT;

const stage = document.getElementById('stage');
const form = document.getElementById('ask-form');
const input = document.getElementById('ask');
const send = document.getElementById('send');
const thumb = document.getElementById('thumb');
const note = document.getElementById('verdict-note');
const mascot = createMascot(document.getElementById('mascot'));
const confetti = createConfetti(document.getElementById('confetti'));

let state = 'idle';
let requestId = 0;
let textPad = 11;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 0.1 s of "thinking" for a short ask, up to 0.6 s for a long one. */
function thinkMs(text) {
  const p = (text.length - THINK_SHORT_CHARS) / (THINK_LONG_CHARS - THINK_SHORT_CHARS);
  return THINK_MIN_MS + (THINK_MAX_MS - THINK_MIN_MS) * Math.min(1, Math.max(0, p));
}

// the client area, not innerWidth/innerHeight, so a scrollbar or a docked
// panel never pushes the stage off centre
function fit() {
  const { clientWidth, clientHeight } = document.documentElement;
  const scale = Math.min(clientWidth / STAGE_W, clientHeight / STAGE_H);
  stage.style.setProperty('--fit', String(scale));
  confetti.resize(scale);
}

// the bar never grows: the text shrinks to fit it (fit-text.js); while typing at
// the end, the newest line stays in view
function resizeText() {
  textPad = fitText(input);
  if (input.selectionEnd === input.value.length) input.scrollTop = input.scrollHeight;
  updateFade();
}

// fade the text out on whichever edge has text scrolled out of sight (only the
// padding being hidden does not count)
function updateFade() {
  const below = input.scrollHeight - input.clientHeight - input.scrollTop;
  input.classList.toggle('fade-top', input.scrollTop > textPad + 1);
  input.classList.toggle('fade-bottom', below > textPad + 1);
}

function setState(next) {
  state = next;
  stage.dataset.state = next;
  send.disabled = next === 'judging' || input.value.trim() === '';
}

function showThumb(direction) {
  thumb.classList.remove('is-shown', 'is-up', 'is-down');
  void thumb.offsetWidth; // restart the pop animation
  thumb.classList.add('is-shown', direction === 'up' ? 'is-up' : 'is-down');
}

function hideThumb() {
  thumb.classList.remove('is-shown');
}

function toIdle() {
  hideThumb();
  mascot.setMode('idle');
  note.textContent = '';
  setState('idle');
}

function toTyping() {
  hideThumb();
  mascot.setMode('thinking');
  note.textContent = '';
  setState('typing');
}

function celebrate() {
  confetti.burst({ x: 262, y: 236, count: 130, angle: -60, spread: 110, speed: 1050 });
  confetti.burst({ x: 1356, y: 177, count: 70, angle: -120, spread: 90, speed: 900 });
}

function showVerdict(result) {
  if (result.verdict === 'refuse') {
    showThumb('down');
    mascot.setMode('refuse');
    note.textContent = "Superbot won't do that.";
    setState('refused');
    return;
  }
  showThumb('up');
  mascot.setMode('laugh');
  celebrate();
  note.textContent = 'Superbot can do that.';
  setState('accepted');
}

async function requestVerdict(text) {
  const res = await fetch(JUDGE_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  const body = await res.json().catch((err) => {
    console.error('judge: reply was not JSON', err);
    return {};
  });
  if (!res.ok) throw new Error(`judge HTTP ${res.status}: ${body.error ?? 'no detail'}`);
  return body;
}

// the verdict lands no sooner than the think time, and no later than Jev
async function thinkQuietly(text) {
  const [result] = await Promise.all([requestVerdict(text), sleep(thinkMs(text))]);
  return result;
}

async function judge(text) {
  const id = ++requestId;
  hideThumb();
  mascot.setMode('thinking');
  setState('judging');
  try {
    const result = await thinkQuietly(text);
    if (result && id === requestId) showVerdict(result);
  } catch (err) {
    console.error('judge failed', err);
    if (id !== requestId) return;
    mascot.setMode('idle');
    note.textContent = "Jev couldn't check that one. Send it again.";
    setState('error');
  }
}

input.addEventListener('input', () => {
  requestId += 1; // a reply for text that has since changed is dropped
  resizeText();
  if (input.value.trim() === '') toIdle();
  else toTyping();
});

input.addEventListener('scroll', updateFade, { passive: true });
// moving the caret can scroll the field without an input event
input.addEventListener('keyup', updateFade);
input.addEventListener('click', updateFade);

// Enter sends, Shift+Enter starts a new line
input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    form.requestSubmit();
  }
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (text && state !== 'judging') judge(text);
});

// the whole bar is the text field's hit area, as in the reference
form.addEventListener('pointerdown', (event) => {
  if (event.target === form) {
    event.preventDefault();
    input.focus();
  }
});

document.getElementById('email-form').addEventListener('submit', (event) => event.preventDefault());
for (const link of document.querySelectorAll('a[href="#"]')) link.addEventListener('click', (event) => event.preventDefault());

// B: no chat box; the mascot just thinks, nonstop, from the static
// thoughts.js (no network calls)
function streamThoughts() {
  mascot.setMode('thinking');
  createThoughtStream(document.getElementById('desk-thought'))
    .run(THOUGHTS)
    .catch((err) => console.error('thought stream failed', err));
}

window.addEventListener('resize', fit);
new ResizeObserver(fit).observe(document.documentElement);
resizeText();
setState('idle');
if (VARIANT === 'b') streamThoughts();
