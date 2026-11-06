// The zen garden: raked sand, stones, and leaves that gather on days you don't tend it.
// Coordinates are 0..1 across the sand (x) and 0..1 down it (y, top = north).
// The same draw function paints the editor and the 3D sand texture in the world.
import type { Garden } from "./data";
import { dayKey, parseKey } from "./logic";

export const GARDEN_ASPECT = 1.5; // width / depth of the sand bed
export const MAX_STROKES = 80;
export const MAX_STONES = 9;

export const DEFAULT_GARDEN: Garden = {
  strokes: [],
  stones: [
    { x: 0.27, y: 0.38, s: 1.0 },
    { x: 0.33, y: 0.47, s: 0.6 },
    { x: 0.72, y: 0.62, s: 0.85 },
  ],
};

function rnd(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Leaf { x: number; y: number; r: number; c: string }
/** Leaves fall a few a day while the garden goes untended (up to a carpet of them). */
export function leavesFor(g: Garden, created: string): Leaf[] {
  const since = g.tended ?? created;
  const days = Math.max(0, Math.round((parseKey(dayKey(new Date())).getTime() - parseKey(since).getTime()) / 864e5));
  const n = Math.min(45, days * 5);
  const r = rnd(parseKey(since).getTime() / 864e5);
  const cols = ["#c8642a", "#d9a03a", "#a8402a", "#b8862a"];
  return Array.from({ length: n }, () => ({ x: 0.04 + r() * 0.92, y: 0.05 + r() * 0.9, r: r() * Math.PI * 2, c: cols[Math.floor(r() * cols.length)] }));
}

/** Paint the garden into a 2D canvas of size w x h. */
export function drawGarden(ctx: CanvasRenderingContext2D, w: number, h: number, g: Garden, leaves: Leaf[]) {
  const S = w / 600; // scale everything from a 600px-wide reference
  // sand with a little grain
  ctx.fillStyle = "#ddd0b2";
  ctx.fillRect(0, 0, w, h);
  const grain = rnd(7);
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = grain() > 0.5 ? "rgba(255,250,235,.35)" : "rgba(150,130,100,.18)";
    ctx.fillRect(grain() * w, grain() * h, 1.5 * S, 1.5 * S);
  }
  // rake grooves: four tines per stroke, each a dark groove with a light ridge beside it
  const tines = [-1.5, -0.5, 0.5, 1.5];
  const gap = 7 * S;
  const groove = (pts: number[], off: number, colour: string, width: number, shift: number) => {
    ctx.beginPath();
    for (let i = 0; i < pts.length; i += 2) {
      const x = pts[i] * w,
        y = pts[i + 1] * h;
      // normal from neighbouring points
      const j = Math.min(pts.length - 2, i + 2),
        k = Math.max(0, i - 2);
      let nx = -(pts[j + 1] - pts[k + 1]) * h,
        ny = (pts[j] - pts[k]) * w;
      const len = Math.hypot(nx, ny) || 1;
      nx /= len;
      ny /= len;
      const px = x + nx * off * gap + shift,
        py = y + ny * off * gap + shift;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  };
  for (const pts of g.strokes) {
    if (pts.length < 4) continue;
    for (const t of tines) groove(pts, t, "rgba(255,252,240,.65)", 3 * S, -1.2 * S);
    for (const t of tines) groove(pts, t, "rgba(120,100,70,.45)", 2.6 * S, 0.8 * S);
  }
  // ripples around each stone, then the stone
  for (const st of g.stones) {
    const x = st.x * w,
      y = st.y * h,
      r = 26 * S * st.s;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.ellipse(x, y, r + i * 9 * S, (r + i * 9 * S) * 0.85, 0, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(120,100,70,.35)";
      ctx.lineWidth = 2.4 * S;
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(x - 1.2 * S, y - 1.2 * S, r + i * 9 * S, (r + i * 9 * S) * 0.85, 0, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,252,240,.5)";
      ctx.lineWidth = 2 * S;
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(60,50,35,.35)";
    ctx.beginPath();
    ctx.ellipse(x + 5 * S, y + 6 * S, r, r * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    const grad = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    grad.addColorStop(0, "#a8a59c");
    grad.addColorStop(1, "#5e5a52");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.82, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(90,120,60,.55)"; // a little moss
    ctx.beginPath();
    ctx.ellipse(x - r * 0.3, y - r * 0.45, r * 0.35, r * 0.18, -0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  // fallen leaves
  for (const l of leaves) {
    ctx.save();
    ctx.translate(l.x * w, l.y * h);
    ctx.rotate(l.r);
    ctx.fillStyle = l.c;
    ctx.beginPath();
    ctx.ellipse(0, 0, 6 * S, 3 * S, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(80,40,10,.5)";
    ctx.lineWidth = 0.8 * S;
    ctx.beginPath();
    ctx.moveTo(-6 * S, 0);
    ctx.lineTo(6 * S, 0);
    ctx.stroke();
    ctx.restore();
  }
  // mossy edge
  ctx.strokeStyle = "rgba(80,110,50,.55)";
  ctx.lineWidth = 6 * S;
  ctx.strokeRect(3 * S, 3 * S, w - 6 * S, h - 6 * S);
}
