// The mascot's moods. Thinking and refusing move the mark's own parts
// (the eye holes in the face mask, the body group); the laugh is superbot.gg's
// own click effect, copied from superbot/site/assets/mascot-mark.js
// mountMascotMark (deployed as https://superbot.gg/site/assets/mascot-mark.js?v=3)
// with its CSS from hero.css .sb-glitch.is-happy: the eye holes give way to the
// ^_^ arcs while the mark takes a quick double bob, for HAPPY_MS.

const EYES = [{ cx: 35, cy: 58 }, { cx: 65, cy: 58 }];
const EYE_RY = 11;
const HAPPY_MS = 600;
const REFUSE_MS = 950;
const BLINK_MS = 120;

const NEUTRAL = { eyeDx: 0, eyeDy: 0, eyeRy: EYE_RY, x: 0, y: 0, rot: 0, scale: 1 };

const easeOut = (p) => 1 - (1 - Math.min(1, Math.max(0, p))) ** 3;

function thinkingPose(t, blink) {
  const s = t / 1000;
  const e = easeOut(t / 260);
  return {
    ...NEUTRAL,
    // eyes drift up and to the side, the way a person looks off to think
    eyeDx: e * (3 + Math.sin(s * 1.3) * 1.2),
    eyeDy: e * (-4 + Math.sin(s * 0.9) * 0.8),
    eyeRy: blink ? 1 : EYE_RY - e,
    rot: e * Math.sin(s * 2.4) * 3,
    y: e * Math.sin(s * 4.8) * 1.2,
  };
}

function refusePose(t) {
  const p = t / REFUSE_MS;
  if (p >= 1) return { ...NEUTRAL, done: true };
  const fade = 1 - p;
  const shakeHead = Math.sin((t / 1000) * Math.PI * 2 * 4.5) * 3.5 * fade;
  return { ...NEUTRAL, eyeRy: 6, eyeDy: 1.5, x: shakeHead, rot: shakeHead * 0.8 };
}

export function createMascot(root) {
  const svg = root.querySelector('.mark');
  const body = root.querySelector('.mark-body');
  const eyes = [...root.querySelectorAll('.mark-eye')];

  let mode = 'idle';
  let since = performance.now();
  let raf = 0;
  let nextBlink = 0;
  let happy = 0;

  function apply(pose) {
    eyes.forEach((eye, i) => {
      eye.setAttribute('cx', EYES[i].cx + pose.eyeDx);
      eye.setAttribute('cy', EYES[i].cy + pose.eyeDy);
      eye.setAttribute('ry', pose.eyeRy);
    });
    body.setAttribute('transform', `translate(${pose.x} ${pose.y}) rotate(${pose.rot} 50 86) translate(50 59) scale(${pose.scale}) translate(-50 -59)`);
  }

  function blinking(now) {
    if (now < nextBlink) return false;
    if (now < nextBlink + BLINK_MS) return true;
    nextBlink = now + 2200 + Math.random() * 1800;
    return false;
  }

  function poseFor(now) {
    const t = now - since;
    if (mode === 'thinking') return thinkingPose(t, blinking(now));
    if (mode === 'refuse') return refusePose(t);
    return { ...NEUTRAL, done: true };
  }

  function tick(now) {
    const pose = poseFor(now);
    apply(pose);
    if (pose.done) {
      mode = 'idle';
      root.dataset.mood = 'idle';
      raf = 0;
      return;
    }
    raf = requestAnimationFrame(tick);
  }

  // superbot.gg's click: the happy beat (mountMascotMark, verbatim but for the
  // trigger, which here is an accepted request instead of a click)
  function laugh() {
    if (happy) return;
    svg.classList.add('is-happy');
    happy = setTimeout(() => { svg.classList.remove('is-happy'); happy = 0; }, HAPPY_MS);
  }

  function setMode(next) {
    if (next === 'laugh') {
      setMode('idle');
      laugh();
      return;
    }
    if (next === mode && next !== 'refuse') return;
    mode = next;
    since = performance.now();
    nextBlink = since + 1800;
    root.dataset.mood = next;
    if (!raf) raf = requestAnimationFrame(tick);
  }

  return { setMode };
}
