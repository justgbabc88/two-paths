// The canvas world: tile map, stations, BFS pathfinding, procedural pixel art
// and the player. Ported from v1 with drawing and movement unchanged; the
// global functions are wrapped in a class so React can mount/unmount it.
//
// This is the module that sprite sheets and the scrollable map will replace,
// so it talks to the rest of the app only through the WorldCallbacks below.
import { SK, type Habit, type SkillId } from "./data";

export const T = 32,
  COLS = 20,
  ROWS = 14;

// tile map: . grass  = path  ~ water  T tree  F fence  # rock
export const MAP = [
  "TTTTTTTTTTTTTTTTTTTT",
  "T.....T.......T....T",
  "T.......==.........T",
  "T....=====...TT....T",
  "T....=..=...TT.....T",
  "T....=..=..........T",
  "T....=..=====......T",
  "TT...=......=~~~...T",
  "T....=......=~~~..TT",
  "T..........=======.T",
  "T......T..........TT",
  "T...TT.............T",
  "T........T....T....T",
  "TTTTTTTTTTTTTTTTTTTT",
];

export type StationId = SkillId | "tavern";
export interface Station {
  id: StationId;
  skill: SkillId | null;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  ax: number; // approach tile: where the character stands
  ay: number;
  verb: string;
  examine: string;
}

export const STATIONS: Station[] = [
  { id: "wealth", skill: "wealth", name: "Gold mine", x: 2, y: 2, w: 2, h: 2, ax: 3, ay: 4, verb: "mine", examine: "Veins of gold run through the rock. Each swing adds up." },
  { id: "mind", skill: "mind", name: "Standing stone", x: 16, y: 2, w: 2, h: 2, ax: 15, ay: 4, verb: "pray", examine: "An old altar. Quiet here." },
  { id: "business", skill: "business", name: "Market stall", x: 10, y: 4, w: 2, h: 1, ax: 10, ay: 5, verb: "trade", examine: "Your stall. The pipeline is built one conversation at a time." },
  { id: "learning", skill: "learning", name: "Library", x: 1, y: 8, w: 3, h: 2, ax: 2, ay: 10, verb: "study", examine: "Shelves of books. Twenty pages a day, forever." },
  { id: "health", skill: "health", name: "Training yard", x: 15, y: 10, w: 3, h: 2, ax: 14, ay: 11, verb: "train", examine: "A training dummy and some iron. It never gets easier, you get stronger." },
  { id: "relationship", skill: "relationship", name: "Cottage", x: 9, y: 11, w: 3, h: 2, ax: 10, ay: 10, verb: "visit", examine: "Home. The hearth is warm." },
  { id: "tavern", skill: null, name: "Tavern", x: 6, y: 6, w: 2, h: 2, ax: 7, ay: 8, verb: "drink", examine: "The tavern. Everyone ends up here sometimes. Be honest about it." },
];

/** Habits offered at a station (v1 rule). */
export const habitsAtStation = (s: Station, habits: Habit[]): Habit[] =>
  habits.filter((h) => (s.id === "tavern" ? h.type === "neg" : h.type === "pos" && (h.skill === s.skill || h.skill2 === s.skill)));

const blocked: boolean[][] = [];
for (let y = 0; y < ROWS; y++) {
  blocked.push([]);
  for (let x = 0; x < COLS; x++) {
    const c = MAP[y][x];
    blocked[y].push(c === "T" || c === "~" || c === "F" || c === "#");
  }
}
STATIONS.forEach((s) => {
  for (let y = s.y; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++) blocked[y][x] = true;
});
const stationAt = (x: number, y: number) => STATIONS.find((s) => x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h);

type Pt = [number, number];

// ---- pathfinding (BFS, 4-dir) ----
function findPath(sx: number, sy: number, tx: number, ty: number): Pt[] | null {
  if (blocked[ty] && blocked[ty][tx]) return null;
  const key = (x: number, y: number) => y * COLS + x;
  const prev = new Map<number, Pt | null>();
  const q: Pt[] = [[sx, sy]];
  prev.set(key(sx, sy), null);
  while (q.length) {
    const [x, y] = q.shift()!;
    if (x === tx && y === ty) {
      const path: Pt[] = [];
      let cur: Pt | null | undefined = [x, y];
      while (cur) {
        path.push(cur);
        cur = prev.get(key(cur[0], cur[1]));
      }
      return path.reverse().slice(1);
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx,
        ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      if (blocked[ny][nx]) continue;
      const k = key(nx, ny);
      if (prev.has(k)) continue;
      prev.set(k, [x, y]);
      q.push([nx, ny]);
    }
  }
  return null;
}

function seedRand(x: number, y: number) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

export interface WorldCallbacks {
  chat(text: string, cls?: string): void;
  /** Player arrived at (or tapped while standing at) a station. pos is in canvas pixels. */
  openStation(s: Station, pos: { x: number; y: number }): void;
  closeMenu(): void;
  /** A rep finished animating. Return how many skills levelled up (one burst each). */
  actionDone(h: Habit): number;
}

interface Float { text: string; x: number; y: number; t: number; color: string }
interface Spark { x: number; y: number; vx: number; vy: number; t: number; c: string }

export class World {
  private ctx: CanvasRenderingContext2D;
  private P = { x: 10, y: 7, px: 10, py: 7, path: [] as Pt[], dir: "down", frame: 0, walkT: 0, action: null as null | { habit: Habit; neg: boolean }, actionT: 0, target: null as Pt | null, pendingStation: null as Station | null };
  private floats: Float[] = [];
  private sparks: Spark[] = [];
  private menuPos = { x: 20, y: 20 };
  private last = performance.now();
  private raf = 0;
  private cv: HTMLCanvasElement;
  private cb: WorldCallbacks;

  constructor(cv: HTMLCanvasElement, cb: WorldCallbacks) {
    this.cv = cv;
    this.cb = cb;
    this.ctx = cv.getContext("2d")!;
    this.ctx.imageSmoothingEnabled = false;
    cv.addEventListener("click", this.onClick);
    document.addEventListener("keydown", this.onKey);
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.cv.removeEventListener("click", this.onClick);
    document.removeEventListener("keydown", this.onKey);
  }

  // ---- drawing helpers (original pixel art, all procedural) ----
  private rect(x: number, y: number, w: number, h: number, c: string) {
    this.ctx.fillStyle = c;
    this.ctx.fillRect(Math.round(x), Math.round(y), w, h);
  }
  private drawTile(x: number, y: number) {
    const rect = this.rect.bind(this);
    const c = MAP[y][x],
      px = x * T,
      py = y * T;
    if (c === "~") {
      rect(px, py, T, T, "#2d5f8a");
      const t = performance.now() / 600;
      for (let i = 0; i < 3; i++) {
        const r = seedRand(x + i, y);
        const ox = (r * T + t * 8 + i * 9) % T;
        rect(px + ox, py + 6 + i * 9, 6, 2, "#5a93c0");
      }
      return;
    }
    const g = seedRand(x, y);
    rect(px, py, T, T, c === "=" ? "#9b7b4e" : g > 0.5 ? "#4c7a32" : "#467230");
    if (c === "=") {
      rect((px + g * 20) | 0, py + ((g * 7) | 0) * 3, 3, 2, "#86683f");
      rect((px + (1 - g) * 24) | 0, py + 18, 2, 2, "#b3936a");
    } else {
      for (let i = 0; i < 3; i++) {
        const r = seedRand(x * 3 + i, y * 7 + i);
        rect((px + r * 28) | 0, py + (((r * 97) % 28) | 0), 2, 2, "#5d9140");
      }
    }
    if (c === "T") this.drawTree(px, py, g);
  }
  private drawTree(px: number, py: number, g: number) {
    const rect = this.rect.bind(this);
    rect(px + 13, py + 18, 6, 12, "#5b3a1e");
    const sh = g > 0.5 ? "#2f6b2a" : "#2a5f27";
    rect(px + 4, py + 10, 24, 12, sh);
    rect(px + 7, py + 4, 18, 10, sh);
    rect(px + 10, py, 12, 6, "#3b7f33");
    rect(px + 8, py + 8, 6, 4, "#4a9a3d");
    rect(px + 18, py + 12, 4, 4, "#4a9a3d");
  }
  private drawStation(s: Station) {
    const rect = this.rect.bind(this);
    const ctx = this.ctx;
    const px = s.x * T,
      py = s.y * T;
    switch (s.id) {
      case "wealth":
        rect(px + 2, py + 10, 28, 22, "#6b6b6b"); rect(px + 8, py + 2, 20, 14, "#7d7d7d"); rect(px + 36, py + 14, 26, 20, "#6b6b6b"); rect(px + 40, py + 6, 18, 12, "#7d7d7d"); rect(px + 6, py + 34, 26, 24, "#666"); rect(px + 36, py + 36, 24, 22, "#777");
        [[12, 14], [46, 12], [14, 42], [44, 44], [22, 30], [50, 30]].forEach(([a, b]) => rect(px + a, py + b, 4, 4, "#f0c43a"));
        break;
      case "mind": {
        rect(px + 20, py + 6, 24, 50, "#8a8f99"); rect(px + 24, py + 2, 16, 8, "#a3a8b3"); rect(px + 4, py + 52, 56, 10, "#6f737c"); rect(px + 30, py + 16, 4, 4, "#dfe3ea"); rect(px + 26, py + 28, 12, 2, "#dfe3ea"); rect(px + 30, py + 22, 4, 14, "#dfe3ea");
        const gl = 0.5 + 0.5 * Math.sin(performance.now() / 500);
        ctx.fillStyle = `rgba(190,220,255,${0.15 * gl})`;
        ctx.fillRect(px + 10, py + 0, 44, 60);
        break;
      }
      case "business":
        rect(px + 2, py + 8, 60, 20, "#b23a2e");
        for (let i = 0; i < 4; i++) rect(px + 2 + i * 16, py + 8, 8, 20, "#e9d9b8");
        rect(px + 4, py + 26, 56, 4, "#7a4a26"); rect(px + 6, py + 28, 4, 4, "#5b3a1e"); rect(px + 54, py + 28, 4, 4, "#5b3a1e"); rect(px + 10, py + 2, 4, 8, "#5b3a1e"); rect(px + 50, py + 2, 4, 8, "#5b3a1e"); rect(px + 14, py + 20, 8, 6, "#e3b44c"); rect(px + 30, py + 20, 10, 6, "#9fd36b");
        break;
      case "learning":
        rect(px, py + 14, 96, 50, "#8a6a44"); rect(px + 2, py + 2, 92, 16, "#6a3f2a"); rect(px + 6, py + 22, 20, 20, "#2a1e14"); rect(px + 70, py + 22, 20, 20, "#2a1e14");
        for (let i = 0; i < 3; i++) {
          rect(px + 8 + i * 6, py + 24, 4, 16, ["#c44", "#4a7", "#47c"][i]);
          rect(px + 72 + i * 6, py + 24, 4, 16, ["#cc4", "#a4c", "#c84"][i]);
        }
        rect(px + 36, py + 36, 24, 28, "#4a2e18"); rect(px + 56, py + 50, 3, 3, "#e3b44c"); rect(px + 30, py + 6, 36, 8, "#e9d9b8");
        break;
      case "health":
        rect(px, py + 56, 96, 8, "#7a6a52"); rect(px + 16, py + 10, 8, 44, "#5b3a1e"); rect(px + 6, py + 6, 28, 10, "#8b5a2b"); rect(px + 10, py + 16, 20, 22, "#c9a27a"); rect(px + 14, py + 40, 12, 14, "#8b5a2b"); rect(px + 46, py + 40, 40, 8, "#333"); rect(px + 42, py + 34, 10, 20, "#444"); rect(px + 80, py + 34, 10, 20, "#444"); rect(px + 60, py + 8, 24, 20, "#555"); rect(px + 62, py + 10, 20, 16, "#666"); rect(px + 68, py + 2, 8, 8, "#444");
        break;
      case "relationship": {
        rect(px + 4, py + 24, 88, 40, "#c9b48f"); rect(px, py + 4, 96, 24, "#8b3a2a"); rect(px + 40, py + 36, 16, 28, "#5b3a1e"); rect(px + 50, py + 50, 3, 3, "#e3b44c"); rect(px + 12, py + 34, 16, 14, "#f6d77a"); rect(px + 68, py + 34, 16, 14, "#f6d77a"); rect(px + 19, py + 34, 2, 14, "#5b3a1e"); rect(px + 12, py + 40, 16, 2, "#5b3a1e"); rect(px + 75, py + 34, 2, 14, "#5b3a1e"); rect(px + 68, py + 40, 16, 2, "#5b3a1e"); rect(px + 70, py - 4, 10, 14, "#555");
        const t = performance.now() / 400;
        rect(px + 72, py - 10 - ((Math.sin(t) * 2) | 0), 6, 4, "rgba(200,200,200,.5)");
        break;
      }
      case "tavern":
        rect(px + 2, py + 20, 60, 44, "#6e4a2c"); rect(px, py + 2, 64, 22, "#3f2a18"); rect(px + 24, py + 36, 16, 28, "#2a1e14"); rect(px + 6, py + 30, 12, 10, "#f3b24a"); rect(px + 46, py + 30, 12, 10, "#f3b24a"); rect(px + 20, py + 4, 24, 12, "#e9d9b8"); rect(px + 24, py + 7, 6, 6, "#b23a2e"); rect(px + 34, py + 7, 6, 6, "#b23a2e");
        break;
    }
  }
  private drawPlayer() {
    const rect = this.rect.bind(this);
    const ctx = this.ctx;
    const P = this.P;
    const x = P.px * T,
      y = P.py * T;
    const bob = P.action ? Math.sin(performance.now() / 90) * 2 : P.path.length ? Math.sin(P.walkT * 12) * 1.5 : 0;
    // shadow
    ctx.fillStyle = "rgba(0,0,0,.3)";
    ctx.fillRect(Math.round(x + 8), Math.round(y + 26), 16, 4);
    const oy = y - 6 + bob;
    rect(x + 10, oy + 20, 5, 8, "#2b2b55"); rect(x + 17, oy + 20, 5, 8, "#2b2b55"); // legs
    rect(x + 8, oy + 8, 16, 13, "#3d6fb5"); // tunic
    rect(x + 8, oy + 14, 16, 2, "#5b3a1e"); // belt
    rect(x + 5, oy + 9, 3, 9, "#3d6fb5"); rect(x + 24, oy + 9, 3, 9, "#3d6fb5"); // arms
    rect(x + 5, oy + 17, 3, 3, "#d9a877"); rect(x + 24, oy + 17, 3, 3, "#d9a877"); // hands
    rect(x + 10, oy - 2, 12, 11, "#d9a877"); // head
    rect(x + 9, oy - 4, 14, 4, "#5b3a1e"); rect(x + 9, oy - 1, 3, 4, "#5b3a1e"); rect(x + 20, oy - 1, 3, 4, "#5b3a1e"); // hair
    if (P.dir !== "up") {
      rect(x + 12, oy + 2, 2, 2, "#222");
      rect(x + 18, oy + 2, 2, 2, "#222");
    }
    if (P.action) {
      // tool swing
      const sw = Math.sin(performance.now() / 90);
      const tx = P.dir === "left" ? x - 4 : x + 26;
      rect(tx, oy + 6 + sw * 6, 4, 14, "#8b5a2b");
      rect(tx - 2, oy + 4 + sw * 6, 8, 4, P.action.neg ? "#b23a2e" : "#9aa2aa");
    }
  }
  private render() {
    const ctx = this.ctx,
      cv = this.cv,
      P = this.P;
    ctx.clearRect(0, 0, cv.width, cv.height);
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) this.drawTile(x, y);
    // hover/target marker
    if (P.target) {
      const [tx, ty] = P.target;
      ctx.strokeStyle = "#f5cd6a";
      ctx.lineWidth = 2;
      ctx.strokeRect(tx * T + 4, ty * T + 4, T - 8, T - 8);
    }
    // draw stations and player sorted by y for overlap
    const items = STATIONS.map((s) => ({ y: s.y + s.h, f: () => this.drawStation(s) }))
      .concat([{ y: P.py + 1, f: () => this.drawPlayer() }])
      .sort((a, b) => a.y - b.y);
    items.forEach((i) => i.f());
    // station labels
    ctx.font = "10px Silkscreen, monospace";
    ctx.textAlign = "center";
    STATIONS.forEach((s) => {
      const sk = s.skill ? SK[s.skill] : null;
      const lab = sk ? sk.ico + " " + s.name : "🍺 " + s.name;
      ctx.fillStyle = "rgba(0,0,0,.55)";
      const tw = ctx.measureText(lab).width + 8;
      const cx = (s.x + s.w / 2) * T;
      ctx.fillRect(cx - tw / 2, (s.y + s.h) * T + 2, tw, 13);
      ctx.fillStyle = "#f5e7c3";
      ctx.fillText(lab, cx, (s.y + s.h) * T + 12);
    });
    // floats
    ctx.font = "bold 13px Silkscreen, monospace";
    this.floats.forEach((f) => {
      ctx.globalAlpha = Math.max(0, 1 - f.t / 1.4);
      ctx.fillStyle = "#000";
      ctx.fillText(f.text, f.x + 1, f.y - f.t * 28 + 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y - f.t * 28);
    });
    ctx.globalAlpha = 1;
    this.sparks.forEach((s) => {
      ctx.fillStyle = s.c;
      ctx.globalAlpha = Math.max(0, 1 - s.t / 1.2);
      ctx.fillRect(s.x, s.y, 3, 3);
    });
    ctx.globalAlpha = 1;
  }
  private loop = (now: number) => {
    const P = this.P;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    // movement
    if (P.path.length && !P.action) {
      P.walkT += dt;
      const [nx, ny] = P.path[0];
      const speed = 5.5;
      const dx = nx - P.px,
        dy = ny - P.py;
      const dist = Math.hypot(dx, dy);
      if (dx > 0.01) P.dir = "right";
      else if (dx < -0.01) P.dir = "left";
      else if (dy > 0.01) P.dir = "down";
      else if (dy < -0.01) P.dir = "up";
      if (dist <= speed * dt) {
        P.px = nx; P.py = ny; P.x = nx; P.y = ny;
        P.path.shift();
        if (!P.path.length) {
          P.target = null;
          if (P.pendingStation) {
            const s = P.pendingStation;
            P.pendingStation = null;
            this.cb.openStation(s, this.menuPos);
          }
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
    this.floats.forEach((f) => (f.t += dt));
    for (let i = this.floats.length - 1; i >= 0; i--) if (this.floats[i].t > 1.4) this.floats.splice(i, 1);
    this.sparks.forEach((s) => {
      s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 120 * dt;
    });
    for (let i = this.sparks.length - 1; i >= 0; i--) if (this.sparks[i].t > 1.2) this.sparks.splice(i, 1);
    this.render();
    this.raf = requestAnimationFrame(this.loop);
  };

  // ---- interaction ----
  private canvasPos(e: MouseEvent) {
    const r = this.cv.getBoundingClientRect();
    const sx = this.cv.width / r.width,
      sy = this.cv.height / r.height;
    const cx = (e.clientX - r.left) * sx,
      cy = (e.clientY - r.top) * sy;
    return { cx, cy, tx: Math.floor(cx / T), ty: Math.floor(cy / T) };
  }
  private onClick = (e: MouseEvent) => {
    const P = this.P;
    this.cb.closeMenu();
    if (P.action) return;
    const { cx, cy, tx, ty } = this.canvasPos(e);
    if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return;
    const s = stationAt(tx, ty);
    if (s) {
      this.goToStation(s, cx, cy);
      return;
    }
    if (blocked[ty][tx]) {
      this.cb.chat("You can't walk there.", "sys");
      return;
    }
    const path = findPath(P.x, P.y, tx, ty);
    if (!path) {
      this.cb.chat("You can't reach that.", "sys");
      return;
    }
    P.path = path;
    P.target = [tx, ty];
    P.pendingStation = null;
  };
  private goToStation(s: Station, cx: number, cy: number) {
    const P = this.P;
    this.menuPos = { x: cx, y: cy };
    if (P.x === s.ax && P.y === s.ay) {
      this.cb.openStation(s, this.menuPos);
      return;
    }
    const path = findPath(P.x, P.y, s.ax, s.ay);
    if (!path) {
      this.cb.chat("You can't reach the " + s.name.toLowerCase() + ".", "sys");
      return;
    }
    P.path = path;
    P.target = [s.ax, s.ay];
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
      this.menuPos = { x: (st.x + st.w / 2) * T, y: st.y * T };
      this.goToStation(st, this.menuPos.x, this.menuPos.y);
      return;
    }
    if (blocked[ny][nx]) return;
    P.path = [[nx, ny]];
    P.target = null;
  };

  /** Called when the player picks a habit from a station menu. */
  startAction(h: Habit) {
    const P = this.P;
    const s = STATIONS.find((st) => st.skill === h.skill) || STATIONS[0];
    P.action = { habit: h, neg: h.type === "neg" };
    P.actionT = 0;
    P.dir = s.x + s.w / 2 > P.x + 0.5 ? "right" : "left";
    this.cb.chat(`You ${h.type === "neg" ? "give in and" : "start to"} ${h.type === "neg" ? "log" : "work on"}: ${h.name}.`, "sys");
  }
  private finishAction() {
    const P = this.P;
    const h = P.action!.habit;
    P.action = null;
    const leveled = this.cb.actionDone(h);
    const x = P.px * T + 16,
      y = P.py * T - 4;
    const sign = h.type === "neg" ? -1 : 1;
    const primary = h.skill2 ? 0.8 : 1;
    this.floats.push({ text: (sign > 0 ? "+" : "-") + Math.round(h.xp * primary) + " " + SK[h.skill].name, x, y, t: 0, color: sign > 0 ? "#f5cd6a" : "#ff7b66" });
    if (h.skill2) this.floats.push({ text: (sign > 0 ? "+" : "-") + Math.round(h.xp * 0.2) + " " + SK[h.skill2].name, x, y: y + 14, t: -0.25, color: sign > 0 ? "#f5cd6a" : "#ff7b66" });
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
