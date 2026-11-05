// Generates the game's sprite sheets (original pixel art, authored in code).
//   npm run sprites
// Output: public/sprites/{tiles,player,stations}.png and src/game/atlas.ts
// Art is drawn at 16px per tile; the game renders it at 2x.
import fs from "fs";
import path from "path";
import { Img, rng, type Color } from "./raster";

const OUT = path.resolve("public/sprites");
fs.mkdirSync(OUT, { recursive: true });

// ---------------- palette ----------------
const C = {
  ink: "#1d1710",
  g0: "#2f5420", g1: "#3d6a29", g2: "#4b7d31", g3: "#5d933b", g4: "#78ad4a", g5: "#9cc862",
  d0: "#5c4128", d1: "#7a5a36", d2: "#977449", d3: "#b08e5e", d4: "#c7a978",
  w0: "#173c5e", w1: "#235683", w2: "#2f6c9f", w3: "#4b8ec2", w4: "#8cc4e8", w5: "#d8f0ff",
  sand: "#d2bc85", sand2: "#b89f68",
  wd0: "#3b2414", wd1: "#5a3a20", wd2: "#7a5230", wd3: "#9a6c40", wd4: "#b98a56",
  s0: "#3c3e46", s1: "#585b65", s2: "#777b86", s3: "#9a9fa9", s4: "#c4c8cf",
  r0: "#5a1f18", r1: "#7e2f24", r2: "#a5442f", r3: "#c86246",
  th0: "#6e5020", th1: "#8f6c2e", th2: "#b38e42", th3: "#d4b060",
  au0: "#9a6f12", au1: "#d39f22", au2: "#f3cd48", au3: "#fff1a6",
  sk0: "#9a5f3c", sk1: "#c98a5e", sk2: "#e8b48a",
  cl0: "#1d3460", cl1: "#2f5596", cl2: "#4a78c2", cl3: "#79a3e0",
  hr0: "#2e1b0e", hr1: "#4d2f17", hr2: "#6d4523",
  cr0: "#bfae8a", cr1: "#e3d4b0", cr2: "#f6eedb",
  lt0: "#e09a30", lt1: "#f6cf6a", lt2: "#fff3b8",
  bk: ["#b0413a", "#3f8a55", "#3f62b0", "#c9a43a", "#8a4fb0", "#c9763a"],
  lf0: "#24461b", lf1: "#2f5a22", lf2: "#3e7330", lf3: "#53913d", lf4: "#74b04f",
  pk: "#e88aa8", yl: "#f2d24a", wh: "#f4f0e6", pu: "#a98ae0",
};

const T = 16;

// ---------------- tiles ----------------
function grass(seed: number): Img {
  const im = new Img(T, T);
  const r = rng(seed);
  im.rect(0, 0, T, T, C.g2);
  for (let i = 0; i < 22; i++) im.px(r() * T, r() * T, r() < 0.5 ? C.g1 : C.g3);
  for (let i = 0; i < 5; i++) {
    const x = Math.floor(r() * 15), y = 1 + Math.floor(r() * 14);
    im.px(x, y, C.g4); im.px(x, y - 1, C.g3);
  }
  return im;
}

type Mask = number; // N=1 E=2 S=4 W=8
function maskShape(m: Mask): boolean[][] {
  const N = !!(m & 1), E = !!(m & 2), S = !!(m & 4), W = !!(m & 8);
  const a: boolean[][] = [];
  for (let y = 0; y < T; y++) {
    a.push([]);
    for (let x = 0; x < T; x++) {
      const top = y < 3, bot = y > 12, lef = x < 3, rig = x > 12;
      let v: boolean;
      if (!top && !bot && !lef && !rig) v = true;
      else if (top && !lef && !rig) v = N;
      else if (bot && !lef && !rig) v = S;
      else if (lef && !top && !bot) v = W;
      else if (rig && !top && !bot) v = E;
      else if (top && lef) v = N && W;
      else if (top && rig) v = N && E;
      else if (bot && lef) v = S && W;
      else v = S && E;
      a[y].push(v);
    }
  }
  // round off the exposed corners of the core
  const cut = (x: number, y: number) => (a[y][x] = false);
  if (!N && !W) { cut(3, 3); }
  if (!N && !E) { cut(12, 3); }
  if (!S && !W) { cut(3, 12); }
  if (!S && !E) { cut(12, 12); }
  return a;
}
function maskIn(a: boolean[][], m: Mask, x: number, y: number): boolean {
  if (x >= 0 && y >= 0 && x < T && y < T) return a[y][x];
  // outside the tile: assume the neighbour in that direction is filled if the mask says it is the same terrain
  let ok = true;
  if (y < 0) ok = ok && !!(m & 1);
  if (y >= T) ok = ok && !!(m & 4);
  if (x < 0) ok = ok && !!(m & 8);
  if (x >= T) ok = ok && !!(m & 2);
  return ok;
}
function distToEdge(a: boolean[][], m: Mask, x: number, y: number, max: number): number {
  for (let d = 1; d <= max; d++)
    for (let dy = -d; dy <= d; dy++)
      for (let dx = -d; dx <= d; dx++) {
        if (Math.abs(dx) + Math.abs(dy) !== d) continue;
        if (!maskIn(a, m, x + dx, y + dy)) return d;
      }
  return max + 1;
}

function pathTile(m: Mask): Img {
  const im = grass(100 + m);
  const a = maskShape(m);
  const r = rng(200 + m);
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      if (!a[y][x]) continue;
      const d = distToEdge(a, m, x, y, 2);
      im.px(x, y, d === 1 ? C.d1 : d === 2 ? C.d2 : C.d3);
    }
  for (let i = 0; i < 9; i++) {
    const x = Math.floor(r() * T), y = Math.floor(r() * T);
    if (a[y][x] && distToEdge(a, m, x, y, 2) > 2) im.px(x, y, r() < 0.5 ? C.d2 : C.d4);
  }
  // little pebbles
  for (let i = 0; i < 2; i++) {
    const x = 4 + Math.floor(r() * 8), y = 4 + Math.floor(r() * 8);
    if (a[y][x]) { im.px(x, y, C.d4); im.px(x, y + 1, C.d1); }
  }
  // grass tufts along the edge
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++)
      if (!a[y][x] && maskIn(a, m, x, y + 1) && r() < 0.25) im.px(x, y, C.g4);
  return im;
}

function waterTile(m: Mask, frame: number): Img {
  const im = grass(300 + m);
  const a = maskShape(m);
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      if (!a[y][x]) continue;
      const d = distToEdge(a, m, x, y, 3);
      im.px(x, y, d === 1 ? C.sand : d === 2 ? C.w3 : d === 3 ? C.w2 : C.w1);
    }
  // ripples drift right each frame
  const r = rng(400 + m);
  for (let i = 0; i < 4; i++) {
    const bx = Math.floor(r() * T), y = 2 + Math.floor(r() * 12);
    const x0 = (bx + frame * 2) % T;
    for (let k = 0; k < 3; k++) {
      const x = (x0 + k) % T;
      if (a[y][x] && distToEdge(a, m, x, y, 3) > 2) im.px(x, y, k === 1 ? C.w4 : C.w3);
    }
  }
  if (frame === 1) {
    const x = 5 + Math.floor(r() * 6), y = 5 + Math.floor(r() * 6);
    if (a[y][x]) im.px(x, y, C.w5);
  }
  return im;
}

function treeTile(seed: number): Img {
  const im = grass(500 + seed);
  im.ellipse(8, 14, 6, 1.5, C.g1); // shadow
  const t = new Img(T, T);
  t.rect(7, 10, 3, 5, C.wd1); t.vline(7, 10, 14, C.wd2); t.px(6, 14, C.wd1); t.px(10, 14, C.wd1);
  t.ellipse(8, 6.5, 6.5, 5.8, C.lf1);
  t.ellipse(7, 5.5, 5.2, 4.6, C.lf2);
  t.ellipse(6, 4.5, 3.4, 3, C.lf3);
  const r = rng(600 + seed);
  for (let i = 0; i < 6; i++) t.px(3 + r() * 6, 2 + r() * 5, C.lf4);
  for (let i = 0; i < 5; i++) t.px(6 + r() * 7, 7 + r() * 4, C.lf0);
  t.outline(C.ink);
  im.blit(t, 0, 0);
  return im;
}
function pineTile(seed: number): Img {
  const im = grass(700 + seed);
  im.ellipse(8, 14, 5, 1.5, C.g1);
  const t = new Img(T, T);
  t.rect(7, 12, 2, 3, C.wd1);
  const layers: [number, number, number][] = [[2, 3, 2], [5, 5, 3], [8, 7, 4]];
  layers.forEach(([y, h, half]) => {
    for (let j = 0; j < h; j++) {
      const w = Math.round(((j + 1) / h) * (half + 2));
      t.hline(8 - w, 7 + w, y + j, C.lf1);
      t.hline(8 - w, 7, y + j, C.lf2);
      if (j > 0) t.px(8 - w + 1, y + j, C.lf3);
    }
  });
  t.vline(7, 1, 2, C.lf2);
  t.outline(C.ink);
  im.blit(t, 0, 0);
  return im;
}
function rockTile(): Img {
  const im = grass(800);
  im.ellipse(8, 13, 6, 2, C.g1);
  const t = new Img(T, T);
  t.ellipse(8, 9, 6, 4.5, C.s1);
  t.ellipse(7, 8, 4.5, 3.2, C.s2);
  t.ellipse(6, 7, 2.2, 1.5, C.s3);
  t.px(5, 6, C.s4); t.px(10, 11, C.s0); t.px(11, 10, C.s0);
  t.outline(C.ink);
  im.blit(t, 0, 0);
  return im;
}
function flowerTile(seed: number): Img {
  const im = grass(900 + seed);
  const r = rng(950 + seed);
  const cols = [C.pk, C.yl, C.wh, C.pu];
  for (let i = 0; i < 5; i++) {
    const x = 2 + Math.floor(r() * 12), y = 2 + Math.floor(r() * 12);
    const c = cols[Math.floor(r() * cols.length)];
    im.px(x, y + 1, C.g1);
    im.px(x, y, c); im.px(x - 1, y, c); im.px(x + 1, y, c); im.px(x, y - 1, c); im.px(x, y, C.yl === c ? C.au1 : C.yl);
  }
  return im;
}
function bridgeTile(vertical: boolean): Img {
  // transparent overlay drawn over animated water
  const t = new Img(T, T);
  if (!vertical) {
    t.rect(0, 2, T, 12, C.wd2);
    for (let x = 0; x < T; x += 3) { t.vline(x, 2, 13, C.wd1); t.px(x + 1, 3, C.wd4); }
    t.hline(0, 15, 2, C.wd0); t.hline(0, 15, 13, C.wd0);
    t.hline(0, 15, 1, C.wd3); t.hline(0, 15, 14, C.wd1);
    for (const x of [1, 8, 15]) { t.vline(x, 0, 1, C.wd1); t.vline(x, 14, 15, C.wd0); }
  } else {
    t.rect(2, 0, 12, T, C.wd2);
    for (let y = 0; y < T; y += 3) { t.hline(2, 13, y, C.wd1); t.px(3, y + 1, C.wd4); }
    t.vline(2, 0, 15, C.wd0); t.vline(13, 0, 15, C.wd0);
    t.vline(1, 0, 15, C.wd3); t.vline(14, 0, 15, C.wd1);
  }
  return t;
}
function fenceTile(): Img {
  const t = new Img(T, T);
  t.hline(0, 15, 7, C.wd3); t.hline(0, 15, 8, C.wd1);
  t.hline(0, 15, 11, C.wd3); t.hline(0, 15, 12, C.wd1);
  for (const x of [2, 12]) { t.rect(x, 5, 2, 10, C.wd2); t.vline(x, 5, 14, C.wd3); t.px(x, 4, C.wd3); t.px(x + 1, 4, C.wd2); }
  t.outline(C.ink);
  return t;
}
function bushTile(): Img {
  const im = grass(1000);
  const t = new Img(T, T);
  t.ellipse(8, 10, 6, 4, C.lf2); t.ellipse(6, 9, 3.5, 2.5, C.lf3); t.px(5, 8, C.lf4); t.px(9, 8, C.pk); t.px(11, 10, C.pk);
  t.outline(C.ink);
  im.blit(t, 0, 0);
  return im;
}

// ---------------- player ----------------
type Dir = "down" | "left" | "right" | "up";
type Pose = { kind: "walk"; f: number } | { kind: "work" | "vice"; f: number };
const PW = 16, PH = 24;

function drawPlayer(dir: Dir, pose: Pose): Img {
  if (dir === "right") {
    const l = drawPlayer("left", pose);
    const m = new Img(PW, PH);
    m.blit(l, 0, 0, true);
    return m;
  }
  const im = new Img(PW, PH);
  const walk = pose.kind === "walk" ? pose.f : 0;
  const step = walk === 1 ? 1 : walk === 3 ? -1 : 0; // +1 left leg forward
  const bob = walk % 2 === 1 ? 1 : 0;
  const act = pose.kind !== "walk";
  const y0 = bob; // whole upper body shifts down 1 on step frames

  if (dir === "down" || dir === "up") {
    // legs
    const ll = step === 1 ? -1 : 0, rl = step === -1 ? -1 : 0;
    im.rect(5, 17 + ll, 3, 5, C.cl0); im.rect(8, 17 + rl, 3, 5, C.cl0);
    im.rect(5, 21 + ll, 3, 2, C.hr0); im.rect(8, 21 + rl, 3, 2, C.hr0);
    // torso
    im.rect(4, 10 + y0, 8, 8, C.cl1);
    im.vline(4, 10 + y0, 17 + y0, C.cl0); im.vline(11, 10 + y0, 17 + y0, C.cl0);
    if (dir === "down") { im.vline(7, 11 + y0, 14 + y0, C.cl2); im.px(6, 11 + y0, C.cl2); im.px(8, 11 + y0, C.cl2); }
    im.hline(4, 11, 15 + y0, C.wd1); im.px(7, 15 + y0, C.au1);
    // arms (swing opposite legs)
    const la = act ? -3 : -step, ra = act ? 0 : step;
    im.rect(2, 11 + y0 + la, 2, 5, C.cl1); im.rect(12, 11 + y0 + ra, 2, 5, C.cl1);
    im.rect(2, 16 + y0 + la, 2, 2, C.sk1); im.rect(12, 16 + y0 + ra, 2, 2, C.sk1);
    // head
    im.rect(4, 2 + y0, 8, 8, C.sk1);
    im.vline(11, 3 + y0, 9 + y0, C.sk0);
    if (dir === "down") {
      im.rect(4, 1 + y0, 8, 3, C.hr1); im.px(4, 4 + y0, C.hr1); im.px(11, 4 + y0, C.hr1); im.px(11, 5 + y0, C.hr1);
      im.hline(5, 9, 1 + y0, C.hr2);
      im.px(6, 6 + y0, C.ink); im.px(9, 6 + y0, C.ink);
      im.px(5, 7 + y0, C.sk2); im.px(10, 7 + y0, C.sk2);
      im.hline(7, 8, 8 + y0, C.sk0);
    } else {
      im.rect(4, 1 + y0, 8, 8, C.hr1); im.hline(5, 10, 1 + y0, C.hr2); im.vline(5, 2 + y0, 5 + y0, C.hr2);
      im.rect(5, 9 + y0, 6, 1, C.sk0);
    }
  } else {
    // left-facing profile
    const front = step === 1 ? 1 : step === -1 ? -1 : 0;
    // back leg then front leg
    im.rect(7 - front, 17, 3, 5, C.cl0); im.rect(6 - front, 21, 4, 2, C.hr0);
    im.rect(7 + front, 17, 3, 5, C.cl1); im.vline(7 + front, 17, 21, C.cl0); im.rect(6 + front, 21, 4, 2, C.hr0);
    // torso
    im.rect(5, 10 + y0, 7, 8, C.cl1); im.vline(11, 10 + y0, 17 + y0, C.cl0); im.vline(5, 11 + y0, 14 + y0, C.cl2);
    im.hline(5, 11, 15 + y0, C.wd1);
    // head
    im.rect(4, 2 + y0, 8, 8, C.sk1);
    im.rect(6, 1 + y0, 6, 4, C.hr1); im.rect(9, 1 + y0, 3, 8, C.hr1); im.hline(6, 10, 1 + y0, C.hr2);
    im.px(5, 6 + y0, C.ink); im.px(3, 7 + y0, C.sk1); im.px(4, 8 + y0, C.sk2); im.hline(5, 6, 9 + y0, C.sk0);
    // arm in front
    if (!act) {
      const sw = -front;
      im.rect(7 + sw, 11 + y0, 3, 5, C.cl2); im.vline(9 + sw, 11 + y0, 15 + y0, C.cl1);
      im.rect(7 + sw, 16 + y0, 3, 2, C.sk1);
    }
  }

  // tool / mug
  if (act) {
    const up = pose.f === 0;
    const hx = dir === "left" ? 3 : 12, hy = up ? 7 + y0 : 13 + y0;
    if (dir === "left") { im.rect(4, hy, 3, 3, C.sk1); im.rect(6, hy + 1, 4, 3, C.cl2); }
    if (pose.kind === "work") {
      // pickaxe-hammer
      if (up) {
        im.line(hx, hy, hx + (dir === "left" ? -2 : 2), hy - 6, C.wd2);
        const tx = hx + (dir === "left" ? -2 : 2), ty = hy - 6;
        im.hline(tx - 2, tx + 2, ty, C.s3); im.hline(tx - 2, tx + 2, ty - 1, C.s2); im.px(tx - 3, ty + 1, C.s2); im.px(tx + 3, ty + 1, C.s2);
      } else {
        const tx = hx + (dir === "left" ? -4 : 4), ty = hy + 3;
        im.line(hx, hy, tx, ty, C.wd2);
        im.vline(tx, ty - 2, ty + 2, C.s3); im.vline(tx + (dir === "left" ? -1 : 1), ty - 2, ty + 2, C.s2);
      }
    } else {
      // tankard
      const tx = dir === "left" ? (up ? 2 : 1) : up ? 11 : 12, ty = up ? 5 + y0 : 12 + y0;
      im.rect(tx, ty, 4, 5, C.wd3); im.hline(tx, tx + 3, ty, C.cr2); im.vline(tx + 1, ty + 1, ty + 4, C.wd4);
      im.vline(dir === "left" ? tx - 1 : tx + 4, ty + 1, ty + 3, C.wd1);
    }
  }
  return im.outline(C.ink);
}

// ---------------- stations ----------------
// Each station image is (w*16) x (h*16 + 16): the footprint plus 16px of overhang above it.
function goldMine(): Img {
  const im = new Img(32, 48);
  im.ellipse(16, 30, 15, 15, C.s1);
  im.ellipse(13, 26, 11, 11, C.s2);
  im.ellipse(10, 22, 6, 5, C.s3);
  im.px(8, 19, C.s4); im.px(9, 19, C.s4); im.px(22, 22, C.s3);
  // entrance
  im.rect(10, 31, 12, 13, C.ink);
  im.rect(11, 32, 10, 12, "#120d08");
  im.rect(9, 30, 2, 14, C.wd2); im.rect(21, 30, 2, 14, C.wd2); im.rect(8, 29, 16, 2, C.wd3); im.hline(8, 23, 31, C.wd1);
  // rails
  im.hline(11, 20, 42, C.s2); im.hline(12, 19, 44, C.s3);
  // gold
  const r = rng(11);
  for (let i = 0; i < 9; i++) {
    const x = 4 + Math.floor(r() * 24), y = 18 + Math.floor(r() * 22);
    if (x > 8 && x < 24 && y > 28) continue;
    im.px(x, y, C.au2); im.px(x + 1, y, C.au1); im.px(x, y + 1, C.au0);
  }
  im.px(14, 20, C.au3);
  // ore cart
  im.rect(23, 38, 7, 5, C.wd1); im.hline(23, 29, 38, C.wd3); im.rect(24, 36, 5, 2, C.au2); im.px(25, 35, C.au3);
  im.px(24, 43, C.s0); im.px(28, 43, C.s0);
  return im.outline(C.ink);
}
function standingStone(): Img {
  const im = new Img(32, 48);
  im.ellipse(16, 42, 14, 4, C.s1); im.ellipse(16, 41, 12, 3, C.s2);
  im.rect(10, 8, 12, 34, C.s2); im.rect(11, 5, 10, 4, C.s2); im.rect(12, 3, 8, 2, C.s3);
  im.vline(10, 8, 41, C.s1); im.vline(21, 8, 41, C.s1); im.rect(19, 9, 2, 32, C.s1);
  im.vline(12, 6, 38, C.s3); im.px(13, 6, C.s4); im.px(13, 7, C.s4);
  // glyph
  im.vline(15, 14, 30, "#bfe3ff"); im.hline(13, 17, 18, "#bfe3ff"); im.px(14, 22, "#bfe3ff"); im.px(16, 22, "#bfe3ff");
  im.px(13, 26, "#bfe3ff"); im.px(17, 26, "#bfe3ff");
  // moss
  im.px(11, 36, C.lf3); im.px(12, 37, C.lf3); im.px(11, 38, C.lf2); im.px(20, 33, C.lf3);
  // small stones
  im.ellipse(4, 42, 2, 1.5, C.s2); im.ellipse(28, 43, 2.5, 1.5, C.s2);
  return im.outline(C.ink);
}
function marketStall(): Img {
  const im = new Img(32, 32);
  // posts
  im.rect(2, 10, 2, 20, C.wd1); im.rect(28, 10, 2, 20, C.wd1);
  // awning
  for (let x = 0; x < 32; x++) {
    const c = Math.floor(x / 4) % 2 ? C.cr2 : C.r2;
    im.vline(x, 4, 11, c);
    if (x % 4 === 1) im.px(x, 12, c);
    if (x % 4 === 2) im.px(x, 12, c);
  }
  im.hline(0, 31, 4, C.r1); im.hline(0, 31, 3, C.r0);
  im.hline(0, 31, 11, C.r1);
  // counter
  im.rect(1, 20, 30, 10, C.wd2); im.hline(1, 30, 20, C.wd4); im.hline(1, 30, 21, C.wd3); im.hline(1, 30, 29, C.wd0);
  for (let x = 6; x < 30; x += 8) im.vline(x, 22, 28, C.wd1);
  // goods
  im.ellipse(7, 18, 3, 2, C.au1); im.px(6, 17, C.au3); // bread
  im.rect(13, 16, 6, 4, "#5f8f3a"); im.px(14, 16, "#9fd36b"); im.px(16, 15, "#9fd36b"); // greens
  im.ellipse(24, 18, 3, 2, C.r2); im.px(23, 17, C.r3); im.px(26, 18, C.r3); // apples
  // coin pile & ledger
  im.px(20, 19, C.au2); im.px(21, 19, C.au2); im.px(20, 18, C.au3);
  return im.outline(C.ink);
}
function library(): Img {
  const im = new Img(48, 48);
  // walls
  im.rect(2, 20, 44, 26, C.s2);
  for (let y = 21; y < 46; y += 3) for (let x = 2 + ((y / 3) % 2) * 3; x < 46; x += 6) im.hline(x, x + 4, y, C.s3);
  for (let y = 22; y < 46; y += 3) im.hline(2, 45, y, C.s1);
  // roof
  for (let j = 0; j < 14; j++) im.hline(0 + Math.max(0, 6 - j), 47 - Math.max(0, 6 - j), 6 + j, j % 3 === 0 ? C.cl0 : C.cl1);
  im.hline(6, 41, 6, C.cl2); im.hline(3, 44, 9, C.cl2);
  im.hline(0, 47, 20, C.s0);
  // columns
  for (const x of [4, 41]) { im.rect(x, 21, 3, 25, C.s3); im.vline(x, 21, 45, C.s4); }
  // windows with books
  for (const wx of [9, 31]) {
    im.rect(wx, 25, 8, 10, C.ink);
    for (let i = 0; i < 4; i++) im.rect(wx + 1 + i * 2, 27 + (i % 2), 2, 7 - (i % 2), C.bk[(i + wx) % 6]);
    im.hline(wx, wx + 7, 30, C.wd2); im.hline(wx - 1, wx + 8, 35, C.s4);
  }
  // door
  im.rect(19, 30, 10, 16, C.wd1); im.ellipse(23.5, 30, 5, 3, C.wd1); im.vline(23, 28, 45, C.wd0); im.px(26, 38, C.au2);
  // sign
  im.rect(16, 13, 16, 5, C.cr1); im.hline(16, 31, 13, C.cr2);
  im.rect(19, 14, 4, 3, C.r1); im.rect(24, 14, 4, 3, C.cl1); im.vline(23, 14, 16, C.cr0);
  return im.outline(C.ink);
}
function trainingYard(): Img {
  const im = new Img(48, 48);
  // dirt pad
  im.rect(1, 22, 46, 24, C.d2);
  const r = rng(77);
  for (let i = 0; i < 30; i++) im.px(2 + r() * 44, 23 + r() * 22, r() < 0.5 ? C.d1 : C.d3);
  // fence back
  im.hline(1, 46, 21, C.wd3); im.hline(1, 46, 22, C.wd1); im.hline(1, 46, 25, C.wd3);
  for (let x = 1; x < 47; x += 9) { im.rect(x, 18, 2, 9, C.wd2); im.px(x, 17, C.wd3); }
  // dummy
  im.rect(10, 22, 2, 20, C.wd1);
  im.rect(5, 26, 12, 3, C.wd2); im.hline(5, 16, 26, C.wd3);
  im.ellipse(11, 33, 4, 6, C.th2); im.ellipse(10, 31, 2, 3, C.th3);
  im.ellipse(11, 22, 3, 3, C.th2); im.px(10, 21, C.th3);
  im.hline(7, 15, 36, C.wd1); im.hline(8, 14, 30, C.wd1);
  im.ellipse(11, 43, 4, 1.5, C.d1);
  // weight rack
  im.rect(24, 30, 2, 12, C.s1); im.rect(42, 30, 2, 12, C.s1); im.hline(24, 43, 33, C.s3); im.hline(24, 43, 34, C.s1);
  im.rect(22, 29, 3, 9, C.s0); im.rect(43, 29, 3, 9, C.s0); im.vline(22, 29, 37, C.s2); im.vline(43, 29, 37, C.s2);
  // kettlebell + barbell on ground
  im.ellipse(30, 42, 3, 3, C.s0); im.px(29, 41, C.s2); im.rect(29, 37, 3, 2, C.s1);
  im.hline(34, 45, 43, C.s3); im.rect(34, 40, 2, 6, C.s0); im.rect(44, 40, 2, 6, C.s0);
  // water bucket
  im.rect(18, 40, 4, 5, C.wd2); im.hline(18, 21, 40, C.w3);
  return im.outline(C.ink);
}
function cottage(): Img {
  const im = new Img(48, 48);
  // walls
  im.rect(4, 26, 40, 20, C.cr1);
  im.hline(4, 43, 26, C.cr0); im.vline(4, 26, 45, C.cr0);
  for (const x of [4, 23, 43]) im.vline(x, 26, 45, C.wd1);
  im.hline(4, 43, 35, C.wd1);
  // chimney
  im.rect(34, 4, 5, 12, C.s1); im.hline(33, 39, 4, C.s2); im.vline(34, 5, 15, C.s2);
  // thatch roof
  for (let j = 0; j < 18; j++) {
    const inset = Math.max(0, 14 - j);
    im.hline(inset, 47 - inset, 9 + j, j % 4 === 3 ? C.th1 : C.th2);
  }
  const r = rng(5);
  for (let i = 0; i < 40; i++) { const x = 2 + Math.floor(r() * 44), y = 12 + Math.floor(r() * 14); if (im.opaque(x, y)) im.px(x, y, r() < 0.5 ? C.th3 : C.th0); }
  im.hline(0, 47, 26, C.th0); im.hline(14, 33, 9, C.th3);
  // door
  im.rect(19, 33, 9, 13, C.wd2); im.vline(23, 33, 45, C.wd1); im.hline(19, 27, 33, C.wd3); im.px(26, 40, C.au2);
  // windows (warm)
  for (const wx of [8, 32]) {
    im.rect(wx, 29, 8, 8, C.lt1); im.rect(wx + 1, 30, 3, 3, C.lt2);
    im.vline(wx + 4, 29, 36, C.wd1); im.hline(wx, wx + 7, 33, C.wd1);
    im.hline(wx - 1, wx + 8, 37, C.wd2);
    // flower box
    im.hline(wx, wx + 7, 38, C.wd1); for (let k = 0; k < 4; k++) im.px(wx + 1 + k * 2, 37, k % 2 ? C.pk : C.yl);
  }
  // path stones
  im.px(22, 46, C.s3); im.px(25, 47, C.s3);
  return im.outline(C.ink);
}
function tavern(): Img {
  const im = new Img(32, 48);
  // lower storey
  im.rect(1, 28, 30, 18, C.cr1);
  im.hline(1, 30, 28, C.wd1); im.hline(1, 30, 36, C.wd1); for (const x of [1, 10, 21, 30]) im.vline(x, 28, 45, C.wd1);
  im.line(1, 36, 10, 28, C.wd1); im.line(21, 28, 30, 36, C.wd1);
  // upper storey (overhang)
  im.rect(0, 14, 32, 14, C.cr0); im.hline(0, 31, 14, C.wd1); im.hline(0, 31, 27, C.wd0);
  for (const x of [0, 8, 16, 24, 31]) im.vline(x, 14, 27, C.wd1);
  // roof
  for (let j = 0; j < 12; j++) { const inset = Math.max(0, 9 - j); im.hline(inset, 31 - inset, 2 + j, j % 3 === 2 ? C.r0 : C.r1); }
  im.hline(9, 22, 2, C.r2); im.hline(6, 25, 5, C.r2);
  // windows
  for (const wx of [3, 19]) { im.rect(wx, 18, 6, 6, C.lt1); im.rect(wx + 1, 19, 2, 2, C.lt2); im.vline(wx + 3, 18, 23, C.wd1); }
  im.rect(3, 38, 5, 5, C.lt0); im.px(4, 39, C.lt1); im.rect(24, 38, 5, 5, C.lt0); im.px(25, 39, C.lt1);
  // door
  im.rect(12, 33, 8, 13, C.wd1); im.hline(12, 19, 33, C.wd3); im.vline(15, 34, 45, C.wd0); im.px(18, 40, C.au2);
  // hanging sign with tankard
  im.hline(22, 30, 29, C.wd0); im.vline(25, 29, 30, C.ink); im.vline(29, 29, 30, C.ink);
  im.rect(24, 31, 7, 6, C.wd3); im.rect(26, 32, 3, 4, C.au1); im.hline(26, 28, 32, C.cr2); im.vline(29, 33, 34, C.au0);
  // barrel
  im.rect(26, 41, 5, 5, C.wd2); im.hline(26, 30, 42, C.wd0); im.hline(26, 30, 44, C.wd0);
  return im.outline(C.ink);
}

// ---------------- pack sheets ----------------
const tilesSheet = new Img(16 * T, 5 * T);
const tileIdx: Record<string, [number, number] | [number, number][]> = {};
const put = (im: Img, col: number, row: number) => { tilesSheet.blit(im, col * T, row * T); return [col * T, row * T] as [number, number]; };
tileIdx.grass = [0, 1, 2, 3].map((i) => put(grass(i + 1), i, 0));
tileIdx.flowers = [0, 1].map((i) => put(flowerTile(i), 4 + i, 0));
tileIdx.tree = [0, 1].map((i) => put(treeTile(i), 6 + i, 0));
tileIdx.pine = [put(pineTile(0), 8, 0)];
tileIdx.rock = put(rockTile(), 9, 0);
tileIdx.bridgeH = put(bridgeTile(false), 10, 0);
tileIdx.bridgeV = put(bridgeTile(true), 11, 0);
tileIdx.fence = put(fenceTile(), 12, 0);
tileIdx.bush = put(bushTile(), 13, 0);
tileIdx.path = Array.from({ length: 16 }, (_, m) => put(pathTile(m), m, 1));
const waterFrames = [0, 1, 2].map((f) => Array.from({ length: 16 }, (_, m) => put(waterTile(m, f), m, 2 + f)));
tilesSheet.savePng(path.join(OUT, "tiles.png"), fs);

const DIRS: Dir[] = ["down", "left", "right", "up"];
const POSES: Pose[] = [0, 1, 2, 3].map((f) => ({ kind: "walk", f }) as Pose).concat([{ kind: "work", f: 0 }, { kind: "work", f: 1 }, { kind: "vice", f: 0 }, { kind: "vice", f: 1 }]);
const playerSheet = new Img(PW * POSES.length, PH * DIRS.length);
DIRS.forEach((d, row) => POSES.forEach((p, col) => playerSheet.blit(drawPlayer(d, p), col * PW, row * PH)));
playerSheet.savePng(path.join(OUT, "player.png"), fs);

const stationArt: Record<string, Img> = {
  wealth: goldMine(), mind: standingStone(), business: marketStall(), learning: library(),
  health: trainingYard(), relationship: cottage(), tavern: tavern(),
};
let sx = 0;
const stIdx: Record<string, { sx: number; sy: number; w: number; h: number }> = {};
const sw = Object.values(stationArt).reduce((a, im) => a + im.w, 0);
const stationSheet = new Img(sw, 48);
for (const [id, im] of Object.entries(stationArt)) {
  stationSheet.blit(im, sx, 48 - im.h);
  stIdx[id] = { sx, sy: 48 - im.h, w: im.w, h: im.h };
  sx += im.w;
}
stationSheet.savePng(path.join(OUT, "stations.png"), fs);

const atlas = {
  tile: T,
  tiles: tileIdx,
  water: waterFrames,
  player: { w: PW, h: PH, dirs: DIRS, walk: [0, 1, 2, 3], work: [4, 5], vice: [6, 7] },
  stations: stIdx,
};
fs.writeFileSync(
  path.resolve("src/game/atlas.ts"),
  "// Generated by scripts/build-sprites.ts. Do not edit by hand.\n/* eslint-disable */\nexport const ATLAS = " + JSON.stringify(atlas) + " as const;\n",
);
console.log("sprites written to", OUT);
