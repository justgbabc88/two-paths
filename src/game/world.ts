// The canvas world: sprite-sheet rendering, a camera over the scrollable map,
// click/drag/right-click input, player movement and the little effects
// (click markers, XP drops, level-up bursts, minimap).
// Talks to React only through WorldCallbacks.
import { ATLAS } from "./atlas";
import { SK, type Habit } from "./data";
import { COLS, ROWS, START, STATIONS, T, blocked, cell, findPath, isPath, isWater, stationAt, type Pt, type Station } from "./map";

export { STATIONS, habitsAtStation, type Station } from "./map";

export interface WorldCallbacks {
  chat(text: string, cls?: string): void;
  /** Player arrived at (or clicked while standing at) a station. pos is in canvas pixels. */
  openStation(s: Station, pos: { x: number; y: number }): void;
  /** Right-click on open ground. */
  openGroundMenu(tile: Pt, pos: { x: number; y: number }): void;
  closeMenu(): void;
  /** A rep finished animating. Return how many skills levelled up (one burst each). */
  actionDone(h: Habit): number;
}

interface Drop { text: string; ico: string; t: number; neg: boolean }
interface Spark { x: number; y: number; vx: number; vy: number; t: number; c: string }
interface Marker { x: number; y: number; t: number; red: boolean }

const S = 2; // art scale
const MM = { r: 54, scale: 3, pad: 8 }; // minimap: radius, px per tile, margin

function hash(x: number, y: number) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = src;
  });
}

export class World {
  private ctx: CanvasRenderingContext2D;
  private cv: HTMLCanvasElement;
  private cb: WorldCallbacks;
  private img: { tiles?: HTMLImageElement; player?: HTMLImageElement; stations?: HTMLImageElement } = {};
  private minimap: HTMLCanvasElement | null = null;
  private P = { x: START.x, y: START.y, px: START.x, py: START.y, path: [] as Pt[], dir: 0, walkT: 0, action: null as null | { habit: Habit; neg: boolean }, actionT: 0, pendingStation: null as Station | null };
  private cam = { x: 0, y: 0, follow: true };
  private drops: Drop[] = [];
  private sparks: Spark[] = [];
  private markers: Marker[] = [];
  private hover: { tx: number; ty: number; cx: number; cy: number } | null = null;
  private drag: { id: number; sx: number; sy: number; camx: number; camy: number; moved: boolean } | null = null;
  private last = performance.now();
  private raf = 0;

  constructor(cv: HTMLCanvasElement, cb: WorldCallbacks) {
    this.cv = cv;
    this.cb = cb;
    this.ctx = cv.getContext("2d")!;
    this.ctx.imageSmoothingEnabled = false;
    this.snapCamera();
    cv.addEventListener("pointerdown", this.onDown);
    cv.addEventListener("pointermove", this.onMove);
    cv.addEventListener("pointerup", this.onUp);
    cv.addEventListener("pointercancel", this.onCancel);
    cv.addEventListener("pointerleave", this.onLeave);
    cv.addEventListener("contextmenu", this.onContext);
    document.addEventListener("keydown", this.onKey);
    Promise.all([loadImage("/sprites/tiles.png"), loadImage("/sprites/player.png"), loadImage("/sprites/stations.png")]).then(([tiles, player, stations]) => {
      this.img = { tiles, player, stations };
      this.buildMinimap();
    });
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    const cv = this.cv;
    cv.removeEventListener("pointerdown", this.onDown);
    cv.removeEventListener("pointermove", this.onMove);
    cv.removeEventListener("pointerup", this.onUp);
    cv.removeEventListener("pointercancel", this.onCancel);
    cv.removeEventListener("pointerleave", this.onLeave);
    cv.removeEventListener("contextmenu", this.onContext);
    document.removeEventListener("keydown", this.onKey);
  }

  // ---------------- camera ----------------
  private camTarget() {
    const W = this.cv.width,
      H = this.cv.height;
    const x = Math.max(0, Math.min(COLS * T - W, (this.P.px + 0.5) * T - W / 2));
    const y = Math.max(0, Math.min(ROWS * T - H, (this.P.py + 0.5) * T - H / 2));
    return { x, y };
  }
  private snapCamera() {
    const t = this.camTarget();
    this.cam.x = t.x;
    this.cam.y = t.y;
  }
  private clampCam() {
    this.cam.x = Math.max(0, Math.min(COLS * T - this.cv.width, this.cam.x));
    this.cam.y = Math.max(0, Math.min(ROWS * T - this.cv.height, this.cam.y));
  }

  // ---------------- drawing ----------------
  private tileSrc(x: number, y: number, now: number): { base: [number, number]; over?: [number, number] } {
    const c = cell(x, y);
    const g = ATLAS.tiles.grass as unknown as [number, number][];
    const grass = g[Math.floor(hash(x, y) * g.length)];
    const mask = (pred: (c: string) => boolean) => (pred(cell(x, y - 1)) ? 1 : 0) | (pred(cell(x + 1, y)) ? 2 : 0) | (pred(cell(x, y + 1)) ? 4 : 0) | (pred(cell(x - 1, y)) ? 8 : 0);
    switch (c) {
      case "=":
        return { base: (ATLAS.tiles.path as unknown as [number, number][])[mask(isPath)] };
      case "~":
      case "h":
      case "v": {
        const f = Math.floor(now / 450 + hash(x, y) * 3) % 3;
        const base = (ATLAS.water as unknown as [number, number][][])[f][mask(isWater)];
        if (c === "h") return { base, over: ATLAS.tiles.bridgeH as unknown as [number, number] };
        if (c === "v") return { base, over: ATLAS.tiles.bridgeV as unknown as [number, number] };
        return { base };
      }
      case "T": {
        const t = ATLAS.tiles.tree as unknown as [number, number][];
        return { base: t[Math.floor(hash(y, x) * t.length)] };
      }
      case "P":
        return { base: (ATLAS.tiles.pine as unknown as [number, number][])[0] };
      case "r":
        return { base: ATLAS.tiles.rock as unknown as [number, number] };
      case "b":
        return { base: ATLAS.tiles.bush as unknown as [number, number] };
      case "f":
        return { base: grass, over: ATLAS.tiles.fence as unknown as [number, number] };
      case ",": {
        const f = ATLAS.tiles.flowers as unknown as [number, number][];
        return { base: f[Math.floor(hash(x + 3, y) * f.length)] };
      }
      default:
        return { base: grass };
    }
  }
  private drawTiles(now: number) {
    const ctx = this.ctx,
      im = this.img.tiles!,
      A = ATLAS.tile;
    const x0 = Math.floor(this.cam.x / T),
      y0 = Math.floor(this.cam.y / T);
    const x1 = Math.min(COLS - 1, Math.ceil((this.cam.x + this.cv.width) / T)),
      y1 = Math.min(ROWS - 1, Math.ceil((this.cam.y + this.cv.height) / T));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const { base, over } = this.tileSrc(x, y, now);
        const dx = Math.round(x * T - this.cam.x),
          dy = Math.round(y * T - this.cam.y);
        ctx.drawImage(im, base[0], base[1], A, A, dx, dy, T, T);
        if (over) ctx.drawImage(im, over[0], over[1], A, A, dx, dy, T, T);
      }
  }
  private drawStation(s: Station, now: number) {
    const ctx = this.ctx,
      a = ATLAS.stations[s.id];
    const dx = Math.round(s.x * T - this.cam.x),
      dy = Math.round((s.y + s.h) * T - a.h * S - this.cam.y);
    ctx.drawImage(this.img.stations!, a.sx, a.sy, a.w, a.h, dx, dy, a.w * S, a.h * S);
    if (s.id === "mind") {
      const gl = 0.5 + 0.5 * Math.sin(now / 500);
      ctx.fillStyle = `rgba(190,225,255,${0.18 * gl})`;
      ctx.fillRect(dx + 16, dy + 4, 32, 80);
    }
    if (s.id === "relationship" || s.id === "tavern") {
      const cx = s.id === "relationship" ? dx + 72 : dx + 48,
        cy = s.id === "relationship" ? dy + 6 : dy + 2;
      for (let i = 0; i < 3; i++) {
        const t = (now / 1400 + i / 3) % 1;
        ctx.fillStyle = `rgba(210,210,210,${0.55 * (1 - t)})`;
        const r = 3 + t * 5;
        ctx.fillRect(Math.round(cx + Math.sin(t * 6 + i) * 4 - r / 2), Math.round(cy - t * 30), r, r);
      }
    }
  }
  private drawPlayer(now: number) {
    const ctx = this.ctx,
      P = this.P,
      pa = ATLAS.player;
    const x = Math.round(P.px * T - this.cam.x),
      y = Math.round(P.py * T - this.cam.y);
    ctx.fillStyle = "rgba(0,0,0,.28)";
    ctx.beginPath();
    ctx.ellipse(x + 16, y + 28, 11, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    let col: number;
    if (P.action) col = (P.action.neg ? pa.vice : pa.work)[Math.floor(now / 220) % 2];
    else if (P.path.length) col = pa.walk[Math.floor(P.walkT * 8) % 4];
    else col = 0;
    ctx.drawImage(this.img.player!, col * pa.w, P.dir * pa.h, pa.w, pa.h, x, y + T - pa.h * S + 2, pa.w * S, pa.h * S);
  }
  private drawLabels() {
    const ctx = this.ctx;
    ctx.font = "10px Silkscreen, monospace";
    ctx.textAlign = "center";
    STATIONS.forEach((s) => {
      const sk = s.skill ? SK[s.skill] : null;
      const lab = (sk ? sk.ico : "🍺") + " " + s.name;
      const cx = Math.round((s.x + s.w / 2) * T - this.cam.x),
        cy = Math.round((s.y + s.h) * T - this.cam.y);
      const tw = ctx.measureText(lab).width + 8;
      ctx.fillStyle = "rgba(0,0,0,.55)";
      ctx.fillRect(cx - tw / 2, cy + 2, tw, 13);
      ctx.fillStyle = "#f5e7c3";
      ctx.fillText(lab, cx, cy + 12);
    });
  }
  private drawMarkers() {
    const ctx = this.ctx;
    this.markers.forEach((m) => {
      const k = Math.min(1, m.t / 0.5);
      const r = 7 - k * 3;
      const x = m.x - this.cam.x,
        y = m.y - this.cam.y;
      ctx.globalAlpha = 1 - k * 0.6;
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#000";
      ctx.beginPath();
      ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r); ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = m.red ? "#ff3b2f" : "#ffe14a";
      ctx.stroke();
      ctx.globalAlpha = 1;
    });
  }
  private drawDrops() {
    const ctx = this.ctx,
      W = this.cv.width;
    ctx.font = "bold 13px Silkscreen, monospace";
    ctx.textAlign = "right";
    this.drops.forEach((d) => {
      if (d.t < 0) return;
      const y = 220 - d.t * 60;
      ctx.globalAlpha = Math.max(0, Math.min(1, (1.8 - d.t) / 0.4));
      const txt = d.ico + " " + d.text;
      ctx.fillStyle = "#000";
      ctx.fillText(txt, W - 13, y + 1);
      ctx.fillStyle = d.neg ? "#ff7b66" : "#f5f5f5";
      ctx.fillText(txt, W - 14, y);
    });
    ctx.globalAlpha = 1;
  }
  private drawHoverText() {
    if (!this.hover || this.drag?.moved) return;
    const { tx, ty } = this.hover;
    const s = stationAt(tx, ty);
    const ctx = this.ctx;
    ctx.font = "bold 12px 'Alegreya Sans', Georgia, serif";
    ctx.textAlign = "left";
    let verb = "Walk here",
      name = "";
    if (s) {
      verb = s.verb[0].toUpperCase() + s.verb.slice(1);
      name = " " + s.name;
    } else if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS || blocked[ty][tx]) return;
    const draw = (t: string, x: number, c: string) => {
      ctx.fillStyle = "#000";
      ctx.fillText(t, x + 1, 17);
      ctx.fillStyle = c;
      ctx.fillText(t, x, 16);
    };
    draw(verb, 6, "#ffffff");
    if (name) draw(name, 6 + ctx.measureText(verb).width, "#5fe0e0");
  }
  private buildMinimap() {
    const c = document.createElement("canvas");
    c.width = COLS * MM.scale;
    c.height = ROWS * MM.scale;
    const g = c.getContext("2d")!;
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) {
        const ch = cell(x, y);
        g.fillStyle = ch === "~" ? "#2f6c9f" : ch === "h" || ch === "v" ? "#7a5230" : ch === "=" ? "#a88a5a" : ch === "T" || ch === "P" ? "#2c5a22" : ch === "r" ? "#777b86" : "#4b7d31";
        g.fillRect(x * MM.scale, y * MM.scale, MM.scale, MM.scale);
      }
    STATIONS.forEach((s) => {
      g.fillStyle = "#c8b28a";
      g.fillRect(s.x * MM.scale, s.y * MM.scale, s.w * MM.scale, s.h * MM.scale);
    });
    this.minimap = c;
  }
  private mmCenter() {
    return { x: this.cv.width - MM.r - MM.pad, y: MM.r + MM.pad };
  }
  private drawMinimap() {
    if (!this.minimap) return;
    const ctx = this.ctx,
      { x: cx, y: cy } = this.mmCenter(),
      P = this.P;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, MM.r, 0, Math.PI * 2);
    ctx.fillStyle = "#111";
    ctx.fill();
    ctx.clip();
    const ox = cx - (P.px + 0.5) * MM.scale,
      oy = cy - (P.py + 0.5) * MM.scale;
    ctx.drawImage(this.minimap, Math.round(ox), Math.round(oy));
    // station icons
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    STATIONS.forEach((s) => {
      const sk = s.skill ? SK[s.skill] : null;
      ctx.fillText(sk ? sk.ico : "🍺", ox + (s.x + s.w / 2) * MM.scale, oy + (s.y + s.h / 2) * MM.scale + 4);
    });
    // destination flag
    if (P.path.length) {
      const [tx, ty] = P.path[P.path.length - 1];
      ctx.fillStyle = "#ff3b2f";
      ctx.fillRect(ox + tx * MM.scale, oy + ty * MM.scale - 4, 2, 6);
    }
    ctx.restore();
    // player dot
    ctx.fillStyle = "#fff";
    ctx.fillRect(cx - 2, cy - 2, 4, 4);
    // frame
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#3b2b1d";
    ctx.beginPath();
    ctx.arc(cx, cy, MM.r + 1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#a88a5a";
    ctx.beginPath();
    ctx.arc(cx, cy, MM.r + 3, 0, Math.PI * 2);
    ctx.stroke();
  }

  private render(now: number) {
    const ctx = this.ctx;
    ctx.fillStyle = "#101a0c";
    ctx.fillRect(0, 0, this.cv.width, this.cv.height);
    if (!this.img.tiles) return;
    this.drawTiles(now);
    this.drawMarkers();
    const items = STATIONS.map((s) => ({ y: s.y + s.h, f: () => this.drawStation(s, now) }))
      .concat([{ y: this.P.py + 1, f: () => this.drawPlayer(now) }])
      .sort((a, b) => a.y - b.y);
    items.forEach((i) => i.f());
    this.drawLabels();
    this.sparks.forEach((s) => {
      ctx.fillStyle = s.c;
      ctx.globalAlpha = Math.max(0, 1 - s.t / 1.2);
      ctx.fillRect(s.x - this.cam.x, s.y - this.cam.y, 3, 3);
    });
    ctx.globalAlpha = 1;
    this.drawDrops();
    this.drawMinimap();
    this.drawHoverText();
  }

  private loop = (now: number) => {
    const P = this.P;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (P.path.length && !P.action) {
      P.walkT += dt;
      const [nx, ny] = P.path[0];
      const speed = 5.5;
      const dx = nx - P.px,
        dy = ny - P.py;
      const dist = Math.hypot(dx, dy);
      // sheet rows: 0 down, 1 left, 2 right, 3 up
      if (dx > 0.01) P.dir = 2;
      else if (dx < -0.01) P.dir = 1;
      else if (dy > 0.01) P.dir = 0;
      else if (dy < -0.01) P.dir = 3;
      if (dist <= speed * dt) {
        P.px = nx; P.py = ny; P.x = nx; P.y = ny;
        P.path.shift();
        if (!P.path.length && P.pendingStation) {
          const s = P.pendingStation;
          P.pendingStation = null;
          this.faceStation(s);
          this.cb.openStation(s, this.menuPosFor(s));
        }
      } else {
        P.px += (dx / dist) * speed * dt;
        P.py += (dy / dist) * speed * dt;
      }
    }
    if (P.action) {
      P.actionT += dt;
      if (P.actionT >= 1.1) this.finishAction();
    }
    if (this.cam.follow) {
      const t = this.camTarget();
      const k = 1 - Math.pow(0.0005, dt);
      this.cam.x += (t.x - this.cam.x) * k;
      this.cam.y += (t.y - this.cam.y) * k;
    }
    this.markers.forEach((m) => (m.t += dt));
    this.markers = this.markers.filter((m) => m.t < 0.5);
    this.drops.forEach((d) => (d.t += dt));
    this.drops = this.drops.filter((d) => d.t < 1.8);
    this.sparks.forEach((s) => {
      s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 120 * dt;
    });
    this.sparks = this.sparks.filter((s) => s.t < 1.2);
    this.render(now);
    this.raf = requestAnimationFrame(this.loop);
  };

  // ---------------- input ----------------
  private canvasPos(e: { clientX: number; clientY: number }) {
    const r = this.cv.getBoundingClientRect();
    const cx = ((e.clientX - r.left) * this.cv.width) / r.width,
      cy = ((e.clientY - r.top) * this.cv.height) / r.height;
    return { cx, cy, tx: Math.floor((cx + this.cam.x) / T), ty: Math.floor((cy + this.cam.y) / T) };
  }
  private inMinimap(cx: number, cy: number) {
    const c = this.mmCenter();
    return Math.hypot(cx - c.x, cy - c.y) <= MM.r;
  }
  private onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    this.drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, camx: this.cam.x, camy: this.cam.y, moved: false };
    this.cv.setPointerCapture(e.pointerId);
  };
  private onMove = (e: PointerEvent) => {
    const p = this.canvasPos(e);
    this.hover = { tx: p.tx, ty: p.ty, cx: p.cx, cy: p.cy };
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    const r = this.cv.getBoundingClientRect();
    const k = this.cv.width / r.width;
    const mx = (e.clientX - d.sx) * k,
      my = (e.clientY - d.sy) * k;
    if (!d.moved && Math.hypot(mx, my) > 8) {
      d.moved = true;
      this.cam.follow = false;
      this.cb.closeMenu();
    }
    if (d.moved) {
      this.cam.x = d.camx - mx;
      this.cam.y = d.camy - my;
      this.clampCam();
    }
  };
  private onUp = (e: PointerEvent) => {
    const d = this.drag;
    this.drag = null;
    if (!d || d.id !== e.pointerId || d.moved) return;
    this.leftClick(this.canvasPos(e));
  };
  private onCancel = () => {
    this.drag = null;
  };
  private onLeave = () => {
    this.hover = null;
  };
  private onContext = (e: MouseEvent) => {
    e.preventDefault();
    const p = this.canvasPos(e);
    if (this.P.action || this.inMinimap(p.cx, p.cy)) return;
    if (p.tx < 0 || p.ty < 0 || p.tx >= COLS || p.ty >= ROWS) return;
    const s = stationAt(p.tx, p.ty);
    if (s) {
      this.goToStation(s, p.cx, p.cy);
      return;
    }
    if (blocked[p.ty][p.tx]) return;
    this.cb.openGroundMenu([p.tx, p.ty], { x: p.cx, y: p.cy });
  };
  private leftClick({ cx, cy, tx, ty }: { cx: number; cy: number; tx: number; ty: number }) {
    this.cb.closeMenu();
    if (this.P.action) return;
    if (this.inMinimap(cx, cy)) {
      const c = this.mmCenter();
      const mx = Math.floor(this.P.px + 0.5 + (cx - c.x) / MM.scale),
        my = Math.floor(this.P.py + 0.5 + (cy - c.y) / MM.scale);
      if (mx >= 0 && my >= 0 && mx < COLS && my < ROWS && !blocked[my][mx]) this.walkTo([mx, my]);
      return;
    }
    if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return;
    const s = stationAt(tx, ty);
    if (s) {
      this.markers.push({ x: cx + this.cam.x, y: cy + this.cam.y, t: 0, red: true });
      this.goToStation(s, cx, cy);
      return;
    }
    if (blocked[ty][tx]) {
      this.cb.chat("You can't walk there.", "sys");
      return;
    }
    this.markers.push({ x: cx + this.cam.x, y: cy + this.cam.y, t: 0, red: false });
    this.walkTo([tx, ty]);
  }
  /** Walk to a ground tile (used by left click, minimap and the "Walk here" menu). */
  walkTo([tx, ty]: Pt) {
    const P = this.P;
    if (P.action) return;
    const path = findPath(P.x, P.y, tx, ty);
    if (!path) {
      this.cb.chat("You can't reach that.", "sys");
      return;
    }
    P.path = path;
    P.pendingStation = null;
    this.cam.follow = true;
  }
  private menuPosFor(s: Station) {
    return { x: (s.x + s.w / 2) * T - this.cam.x, y: s.y * T - this.cam.y };
  }
  private faceStation(s: Station) {
    const P = this.P;
    const cx = s.x + s.w / 2 - 0.5,
      cy = s.y + s.h / 2 - 0.5;
    if (Math.abs(cx - P.x) > Math.abs(cy - P.y)) P.dir = cx > P.x ? 2 : 1;
    else P.dir = cy > P.y ? 0 : 3;
  }
  private goToStation(s: Station, _cx: number, _cy: number) {
    const P = this.P;
    this.cam.follow = true;
    if (P.x === s.ax && P.y === s.ay) {
      this.faceStation(s);
      this.cb.openStation(s, this.menuPosFor(s));
      return;
    }
    const path = findPath(P.x, P.y, s.ax, s.ay);
    if (!path) {
      this.cb.chat("You can't reach the " + s.name.toLowerCase() + ".", "sys");
      return;
    }
    P.path = path;
    P.pendingStation = s;
    this.cb.chat("You walk to the " + s.name.toLowerCase() + ".", "sys");
  }
  private onKey = (e: KeyboardEvent) => {
    const P = this.P;
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    const k = ({ ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] } as Record<string, Pt>)[e.key];
    if (!k || P.action) return;
    e.preventDefault();
    if (P.path.length) return;
    const nx = P.x + k[0],
      ny = P.y + k[1];
    if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) return;
    const st = stationAt(nx, ny);
    if (st) {
      this.goToStation(st, 0, 0);
      return;
    }
    if (blocked[ny][nx]) return;
    P.path = [[nx, ny]];
    this.cam.follow = true;
  };

  // ---------------- actions ----------------
  /** Called when the player picks a habit from a station menu. */
  startAction(h: Habit) {
    const P = this.P;
    P.action = { habit: h, neg: h.type === "neg" };
    P.actionT = 0;
    this.cb.chat(`You ${h.type === "neg" ? "give in and" : "start to"} ${h.type === "neg" ? "log" : "work on"}: ${h.name}.`, "sys");
  }
  private finishAction() {
    const P = this.P;
    const h = P.action!.habit;
    P.action = null;
    const leveled = this.cb.actionDone(h);
    const neg = h.type === "neg";
    const sign = neg ? "-" : "+";
    const primary = h.skill2 ? 0.8 : 1;
    this.drops.push({ text: sign + Math.round(h.xp * primary), ico: SK[h.skill].ico, t: 0, neg });
    if (h.skill2) this.drops.push({ text: sign + Math.round(h.xp * 0.2), ico: SK[h.skill2].ico, t: -0.25, neg });
    const x = P.px * T + 16,
      y = P.py * T - 4;
    for (let i = 0; i < leveled; i++) this.burst(x, y);
  }
  private burst(x: number, y: number) {
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2,
        v = 40 + Math.random() * 90;
      this.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, t: 0, c: ["#f5cd6a", "#ff7b66", "#8fd06a", "#79b7d8", "#fff"][i % 5] });
    }
  }
}
