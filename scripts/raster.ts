// Tiny pixel raster used to author the sprite sheets in code.
import { PNG } from "pngjs";

export type Color = string | null; // "#rrggbb" or null (transparent)

const cache = new Map<string, [number, number, number, number]>();
function rgba(c: string): [number, number, number, number] {
  let v = cache.get(c);
  if (!v) {
    const h = c.replace("#", "");
    v = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), h.length === 8 ? parseInt(h.slice(6, 8), 16) : 255];
    cache.set(c, v);
  }
  return v;
}

export class Img {
  readonly w: number;
  readonly h: number;
  readonly data: Uint8Array;
  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.data = new Uint8Array(w * h * 4);
  }
  px(x: number, y: number, c: Color) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    if (c === null) {
      this.data[i + 3] = 0;
      return;
    }
    const [r, g, b, a] = rgba(c);
    if (a === 255) {
      this.data[i] = r; this.data[i + 1] = g; this.data[i + 2] = b; this.data[i + 3] = 255;
    } else {
      const k = a / 255, ia = this.data[i + 3];
      this.data[i] = Math.round(r * k + this.data[i] * (1 - k));
      this.data[i + 1] = Math.round(g * k + this.data[i + 1] * (1 - k));
      this.data[i + 2] = Math.round(b * k + this.data[i + 2] * (1 - k));
      this.data[i + 3] = Math.max(ia, a);
    }
  }
  opaque(x: number, y: number) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return false;
    return this.data[(y * this.w + x) * 4 + 3] > 0;
  }
  rect(x: number, y: number, w: number, h: number, c: Color) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c);
  }
  hline(x0: number, x1: number, y: number, c: Color) { for (let x = x0; x <= x1; x++) this.px(x, y, c); }
  vline(x: number, y0: number, y1: number, c: Color) { for (let y = y0; y <= y1; y++) this.px(x, y, c); }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: Color) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / (rx + 0.5), dy = (y - cy) / (ry + 0.5);
        if (dx * dx + dy * dy <= 1) this.px(x, y, c);
      }
  }
  line(x0: number, y0: number, x1: number, y1: number, c: Color) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
    for (let i = 0; i <= n; i++) this.px(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c);
  }
  /** Copy src onto this at (dx,dy), skipping transparent pixels. flipX mirrors src. */
  blit(src: Img, dx: number, dy: number, flipX = false) {
    for (let y = 0; y < src.h; y++)
      for (let x = 0; x < src.w; x++) {
        const sx = flipX ? src.w - 1 - x : x;
        const i = (y * src.w + sx) * 4;
        if (src.data[i + 3] === 0) continue;
        const tx = dx + x, ty = dy + y;
        if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) continue;
        const o = (ty * this.w + tx) * 4;
        this.data[o] = src.data[i]; this.data[o + 1] = src.data[i + 1]; this.data[o + 2] = src.data[i + 2]; this.data[o + 3] = 255;
      }
  }
  /** Add a 1px outline in `c` around every opaque pixel (on transparent neighbours). */
  outline(c: string): this {
    const add: [number, number][] = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (this.opaque(x, y)) continue;
        if (this.opaque(x - 1, y) || this.opaque(x + 1, y) || this.opaque(x, y - 1) || this.opaque(x, y + 1)) add.push([x, y]);
      }
    add.forEach(([x, y]) => this.px(x, y, c));
    return this;
  }
  savePng(path: string, fs: typeof import("fs")) {
    const png = new PNG({ width: this.w, height: this.h });
    png.data = Buffer.from(this.data);
    fs.writeFileSync(path, PNG.sync.write(png));
  }
}

/** Deterministic PRNG so sheets are reproducible. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
