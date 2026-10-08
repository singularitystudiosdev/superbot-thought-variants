// Confetti on a canvas laid over the 1456x819 stage, drawn in stage pixels.
// Each burst is a cone of paper bits with gravity, drag and a flutter.

const STAGE_W = 1456;
const STAGE_H = 819;
const GRAVITY = 900;
const DRAG = 1.6;
const COLORS = ['#00e5c3', '#c026d3', '#ffffff', '#4d8aff', '#ffd23f'];

const rand = (min, max) => min + Math.random() * (max - min);

export function createConfetti(canvas) {
  const ctx = canvas.getContext('2d');
  let bits = [];
  let raf = 0;
  let last = 0;

  function resize(fit) {
    const scale = fit * (window.devicePixelRatio || 1);
    canvas.width = Math.round(STAGE_W * scale);
    canvas.height = Math.round(STAGE_H * scale);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
  }

  function burst({ x, y, count, angle, spread, speed }) {
    for (let i = 0; i < count; i++) {
      const dir = ((angle + rand(-spread / 2, spread / 2)) * Math.PI) / 180;
      const v = rand(speed * 0.45, speed);
      bits.push({
        x, y,
        vx: Math.cos(dir) * v,
        vy: Math.sin(dir) * v,
        rot: rand(0, Math.PI * 2),
        vr: rand(-12, 12),
        w: rand(7, 13),
        h: rand(4, 8),
        round: Math.random() < 0.25,
        flutter: rand(0, Math.PI * 2),
        color: COLORS[(Math.random() * COLORS.length) | 0],
        age: 0,
        ttl: rand(1.6, 2.6),
      });
    }
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(step);
    }
  }

  function draw(bit) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, Math.max(0, (bit.ttl - bit.age) / (bit.ttl * 0.3)));
    ctx.translate(bit.x, bit.y);
    ctx.rotate(bit.rot);
    ctx.scale(1, Math.cos(bit.flutter));
    ctx.fillStyle = bit.color;
    if (bit.round) {
      ctx.beginPath();
      ctx.arc(0, 0, bit.h * 0.6, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(-bit.w / 2, -bit.h / 2, bit.w, bit.h);
    }
    ctx.restore();
  }

  function step(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    ctx.clearRect(0, 0, STAGE_W, STAGE_H);
    bits = bits.filter((bit) => bit.age < bit.ttl && bit.y < STAGE_H + 40);
    for (const bit of bits) {
      bit.age += dt;
      bit.vy += GRAVITY * dt;
      bit.vx -= bit.vx * DRAG * dt;
      bit.vy -= bit.vy * DRAG * dt;
      bit.x += bit.vx * dt + Math.sin(bit.flutter) * 0.6;
      bit.y += bit.vy * dt;
      bit.rot += bit.vr * dt;
      bit.flutter += dt * 9;
      draw(bit);
    }
    raf = bits.length ? requestAnimationFrame(step) : 0;
  }

  return { resize, burst };
}
