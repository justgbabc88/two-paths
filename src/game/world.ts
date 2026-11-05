// The 3D world: low-poly terrain and models (three.js), a camera that orbits
// the player, click-to-walk with raycast picking, and a 2D HUD canvas on top
// (hover text, click markers, XP drops, level-up sparks, minimap + compass).
// Talks to React only through WorldCallbacks.
import * as THREE from "three";
import { SK, type Habit } from "./data";
import { COLS, ROWS, START, STATIONS, blocked, cell, findPath, isWater, stationAt, type Pt, type Station } from "./map";
import { CHIMNEYS, hash, makeBridge, makeCharacter, makeStation, mat, natureGeo, type CharacterRig } from "./models";
import { WANDERERS, type Wanderer } from "./wanderers";

export { STATIONS, habitsAtStation, type Station } from "./map";

/** Logical size of the view; menus are positioned in these coordinates. */
export const VIEW_W = 640,
  VIEW_H = 448;

export interface WorldCallbacks {
  chat(text: string, cls?: string): void;
  /** Player arrived at (or clicked while standing at) a station. pos is in view coordinates. */
  openStation(s: Station, pos: { x: number; y: number }): void;
  /** Right-click on open ground. */
  openGroundMenu(tile: Pt, pos: { x: number; y: number }): void;
  closeMenu(): void;
  /** A rep finished animating. Return how many skills levelled up (one burst each). */
  actionDone(h: Habit): number;
  /** Player reached a wanderer and started talking. */
  openDialogue(w: Wanderer): void;
}

interface Npc {
  w: Wanderer;
  rig: CharacterRig;
  x: number; y: number; px: number; py: number;
  path: Pt[];
  face: number;
  walkT: number;
  wait: number;
  talking: boolean;
  bark: { text: string; t: number } | null;
  nextBark: number;
}

interface Drop { text: string; ico: string; t: number; neg: boolean }
interface Spark { x: number; y: number; vx: number; vy: number; t: number; c: string }
interface Marker { x: number; z: number; t: number; red: boolean }

const FOG = "#6f7f86";
const MM = { r: 56, scale: 3, pad: 10 };
const WATER_Y = -0.12;

// ---------------- terrain heights ----------------
const footprintOf = (x: number, y: number) => stationAt(x, y);
function baseHeight(i: number, j: number) {
  let h = 0.16 * Math.sin(i * 0.33) + 0.14 * Math.cos(j * 0.41) + 0.08 * Math.sin((i + j) * 0.7) + 0.06 * Math.cos(i * 1.3 - j * 0.9);
  const d = Math.min(i, j, COLS - i, ROWS - j);
  if (d < 3) h += (3 - d) * 0.32 * (0.6 + 0.4 * hash(i, j));
  return h + 0.42; // keep dry land above the water plane
}
const stationBase = new Map<string, number>();
STATIONS.forEach((s) => stationBase.set(s.id, 0.42 + (baseHeight(s.x + s.w / 2, s.y + s.h / 2) - 0.42) * 0.5));
const corner: number[][] = [];
for (let j = 0; j <= ROWS; j++) {
  corner.push([]);
  for (let i = 0; i <= COLS; i++) {
    const tiles = [cell(i - 1, j - 1), cell(i, j - 1), cell(i - 1, j), cell(i, j)];
    const wet = tiles.filter(isWater).length;
    let h = baseHeight(i, j);
    if (tiles.some((c) => c === "=" || c === "h" || c === "v")) h = 0.42 + (h - 0.42) * 0.4;
    const st = [footprintOf(i - 1, j - 1), footprintOf(i, j - 1), footprintOf(i - 1, j), footprintOf(i, j)].find(Boolean);
    if (st) h = stationBase.get(st.id)!;
    if (wet === 4) h = -0.55;
    else if (wet > 0) h = -0.22;
    corner[j].push(h);
  }
}
function groundAt(x: number, z: number) {
  const i = Math.max(0, Math.min(COLS - 1e-6, x)),
    j = Math.max(0, Math.min(ROWS - 1e-6, z));
  const i0 = Math.floor(i),
    j0 = Math.floor(j),
    fx = i - i0,
    fz = j - j0;
  const a = corner[j0][i0],
    b = corner[j0][i0 + 1],
    c = corner[j0 + 1][i0],
    d = corner[j0 + 1][i0 + 1];
  return a * (1 - fx) * (1 - fz) + b * fx * (1 - fz) + c * (1 - fx) * fz + d * fx * fz;
}
function standY(x: number, z: number) {
  const c = cell(Math.floor(x), Math.floor(z));
  if (c === "h" || c === "v") return 0.15;
  return Math.max(groundAt(x, z), WATER_Y + 0.02);
}

function tileColor(x: number, y: number): THREE.Color {
  const c = cell(x, y);
  const nearWater = [cell(x + 1, y), cell(x - 1, y), cell(x, y + 1), cell(x, y - 1)].some(isWater);
  const st = stationAt(x, y);
  let base: string;
  if (isWater(c)) base = "#4b4a36";
  else if (c === "=") base = "#86694a";
  else if (st?.id === "health") base = "#7a6143";
  else if (st) base = "#5c6a34";
  else if (nearWater) base = "#9c8a5c";
  else if (c === "T" || c === "P") base = "#475a2b";
  else base = "#566d31";
  const col = new THREE.Color(base);
  const v = (hash(x * 3.1, y * 1.7) - 0.5) * 0.08;
  col.offsetHSL((hash(x, y * 2.3) - 0.5) * 0.02, 0, v);
  return col;
}

function buildTerrain(): THREE.Mesh {
  const pos: number[] = [],
    col: number[] = [];
  const push = (x: number, z: number, c: THREE.Color) => {
    pos.push(x, corner[z][x], z);
    col.push(c.r, c.g, c.b);
  };
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      const base = tileColor(x, y);
      const c1 = base.clone().offsetHSL(0, 0, (hash(x + 0.5, y) - 0.5) * 0.05);
      const c2 = base.clone().offsetHSL(0, 0, (hash(x, y + 0.5) - 0.5) * 0.05);
      if ((x + y) % 2) {
        push(x, y, c1); push(x, y + 1, c1); push(x + 1, y, c1);
        push(x + 1, y, c2); push(x, y + 1, c2); push(x + 1, y + 1, c2);
      } else {
        push(x, y, c1); push(x, y + 1, c1); push(x + 1, y + 1, c1);
        push(x, y, c2); push(x + 1, y + 1, c2); push(x + 1, y, c2);
      }
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  m.name = "terrain";
  return m;
}

function buildWater(): THREE.Mesh {
  const g = new THREE.PlaneGeometry(COLS, ROWS, COLS, ROWS).toNonIndexed();
  g.rotateX(-Math.PI / 2);
  g.translate(COLS / 2, WATER_Y, ROWS / 2);
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: "#3a6680", flatShading: true, transparent: true, opacity: 0.82 }));
  m.userData.base = Float32Array.from(g.attributes.position.array);
  return m;
}

function instanced(geo: THREE.BufferGeometry, items: { x: number; z: number; s: number; r: number; c: string }[]) {
  const m = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ flatShading: true }), Math.max(1, items.length));
  const o = new THREE.Object3D();
  items.forEach((it, i) => {
    o.position.set(it.x, groundAt(it.x, it.z), it.z);
    o.rotation.set(0, it.r, 0);
    o.scale.setScalar(it.s);
    o.updateMatrix();
    m.setMatrixAt(i, o.matrix);
    m.setColorAt(i, new THREE.Color(it.c));
  });
  m.count = items.length;
  return m;
}

function buildNature(scene: THREE.Scene) {
  const trees: { x: number; z: number; s: number; r: number; c: string }[] = [];
  const pines: typeof trees = [],
    rocks: typeof trees = [],
    bushes: typeof trees = [],
    flowers: typeof trees = [];
  const greens = ["#3f6a2a", "#4a7530", "#36602a", "#557d34"];
  const pineGreens = ["#2f5528", "#2a4d25", "#365e2c"];
  const petals = ["#c75b7a", "#e0c040", "#efe6d0", "#9a7ad0"];
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      const c = cell(x, y),
        h = hash(x, y),
        jx = (hash(x * 7, y) - 0.5) * 0.3,
        jz = (hash(x, y * 7) - 0.5) * 0.3;
      const base = { x: x + 0.5 + jx, z: y + 0.5 + jz, r: h * Math.PI * 2 };
      if (c === "T") trees.push({ ...base, s: 0.85 + h * 0.45, c: greens[Math.floor(h * greens.length)] });
      else if (c === "P") pines.push({ ...base, s: 0.9 + h * 0.5, c: pineGreens[Math.floor(h * pineGreens.length)] });
      else if (c === "r") rocks.push({ ...base, s: 0.9 + h * 0.5, c: h > 0.5 ? "#7d7a72" : "#8a867c" });
      else if (c === "b") bushes.push({ ...base, s: 0.9 + h * 0.4, c: "#47702f" });
      else if (c === ",")
        for (let k = 0; k < 6; k++)
          flowers.push({ x: x + 0.15 + hash(x + k, y) * 0.7, z: y + 0.15 + hash(x, y + k) * 0.7, s: 1, r: 0, c: petals[Math.floor(hash(x * k, y) * petals.length)] });
    }
  const trunk = (list: typeof trees) => list.map((t) => ({ ...t, c: "#4f3520" }));
  scene.add(instanced(natureGeo.trunk, trunk(trees)));
  scene.add(instanced(natureGeo.canopy, trees));
  scene.add(instanced(natureGeo.canopy2, trees.map((t) => ({ ...t, c: new THREE.Color(t.c).offsetHSL(0, 0, 0.05).getStyle() }))));
  scene.add(instanced(natureGeo.trunk, trunk(pines)));
  scene.add(instanced(natureGeo.pineLow, pines));
  scene.add(instanced(natureGeo.pineHigh, pines.map((t) => ({ ...t, c: new THREE.Color(t.c).offsetHSL(0, 0, 0.04).getStyle() }))));
  scene.add(instanced(natureGeo.rock, rocks));
  scene.add(instanced(natureGeo.bush, bushes));
  scene.add(instanced(natureGeo.stem, flowers.map((f) => ({ ...f, c: "#3f6a2a" }))));
  scene.add(instanced(natureGeo.flower, flowers));
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      const c = cell(x, y);
      if (c === "h" || c === "v") {
        const b = makeBridge(c === "h");
        b.position.set(x + 0.5, 0.02, y + 0.5);
        scene.add(b);
      }
    }
}

export class World {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(42, VIEW_W / VIEW_H, 0.1, 80);
  private ray = new THREE.Raycaster();
  private terrain: THREE.Mesh;
  private water: THREE.Mesh;
  private stationGroups: THREE.Group[] = [];
  private rig: CharacterRig;
  private npcs: Npc[] = [];
  private smoke: { mesh: THREE.Mesh; t: number; ox: number; oy: number; oz: number }[] = [];
  private hud: CanvasRenderingContext2D;
  private hudCv: HTMLCanvasElement;
  private minimap: HTMLCanvasElement;
  private cb: WorldCallbacks;

  private P = { x: START.x, y: START.y, px: START.x, py: START.y, path: [] as Pt[], face: Math.PI, walkT: 0, action: null as null | { habit: Habit; neg: boolean }, actionT: 0, pendingStation: null as Station | null, pendingNpc: null as Npc | null };
  private cam = { yaw: 0, pitch: 0.82, dist: 11, tx: START.x + 0.5, tz: START.y + 0.5 };
  private keys = new Set<string>();
  private drops: Drop[] = [];
  private sparks: Spark[] = [];
  private markers: Marker[] = [];
  private hover: { x: number; y: number } | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private drag: { id: number; sx: number; sy: number; lx: number; ly: number; moved: boolean } | null = null;
  private pinch: number | null = null;
  private last = performance.now();
  private raf = 0;

  constructor(glCanvas: HTMLCanvasElement, hudCanvas: HTMLCanvasElement, cb: WorldCallbacks) {
    this.cb = cb;
    this.renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(VIEW_W, VIEW_H, false);
    this.hudCv = hudCanvas;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    hudCanvas.width = VIEW_W * dpr;
    hudCanvas.height = VIEW_H * dpr;
    this.hud = hudCanvas.getContext("2d")!;
    this.hud.scale(dpr, dpr);

    const sc = this.scene;
    sc.background = new THREE.Color(FOG);
    sc.fog = new THREE.Fog(FOG, 13, 30);
    sc.add(new THREE.HemisphereLight("#dfe6ea", "#4d4330", 1.6));
    const sun = new THREE.DirectionalLight("#fff0d2", 2.0);
    sun.position.set(-6, 10, 4);
    sc.add(sun);

    this.terrain = buildTerrain();
    sc.add(this.terrain);
    this.water = buildWater();
    sc.add(this.water);
    buildNature(sc);
    STATIONS.forEach((s) => {
      const g = makeStation(s.id);
      g.position.set(s.x + s.w / 2, stationBase.get(s.id)!, s.y + s.h / 2);
      g.userData.station = s;
      sc.add(g);
      this.stationGroups.push(g);
      const ch = CHIMNEYS[s.id];
      if (ch)
        for (let i = 0; i < 4; i++) {
          const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), mat("#c8c8c4", { opacity: 0.6 }));
          sc.add(m);
          this.smoke.push({ mesh: m, t: i / 4, ox: g.position.x + ch[0], oy: g.position.y + ch[1], oz: g.position.z + ch[2] });
        }
    });
    this.rig = makeCharacter();
    sc.add(this.rig.root);
    WANDERERS.forEach((w, i) => {
      const rig = makeCharacter(w.look);
      rig.root.userData.npc = w.id;
      sc.add(rig.root);
      const [hx, hy] = w.home;
      this.npcs.push({ w, rig, x: hx, y: hy, px: hx, py: hy, path: [], face: hash(i, 3) * 6.28, walkT: 0, wait: 1 + hash(i, 5) * 4, talking: false, bark: null, nextBark: 6 + hash(i, 8) * 20 });
    });
    this.minimap = this.buildMinimap();

    hudCanvas.addEventListener("pointerdown", this.onDown);
    hudCanvas.addEventListener("pointermove", this.onMove);
    hudCanvas.addEventListener("pointerup", this.onUp);
    hudCanvas.addEventListener("pointercancel", this.onCancel);
    hudCanvas.addEventListener("pointerleave", this.onLeave);
    hudCanvas.addEventListener("contextmenu", this.onContext);
    hudCanvas.addEventListener("wheel", this.onWheel, { passive: false });
    document.addEventListener("keydown", this.onKeyDown);
    document.addEventListener("keyup", this.onKeyUp);
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    const h = this.hudCv;
    h.removeEventListener("pointerdown", this.onDown);
    h.removeEventListener("pointermove", this.onMove);
    h.removeEventListener("pointerup", this.onUp);
    h.removeEventListener("pointercancel", this.onCancel);
    h.removeEventListener("pointerleave", this.onLeave);
    h.removeEventListener("contextmenu", this.onContext);
    h.removeEventListener("wheel", this.onWheel);
    document.removeEventListener("keydown", this.onKeyDown);
    document.removeEventListener("keyup", this.onKeyUp);
    this.renderer.dispose();
  }

  // ---------------- helpers ----------------
  private project(x: number, y: number, z: number) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return { x: ((v.x + 1) / 2) * VIEW_W, y: ((1 - v.y) / 2) * VIEW_H, behind: v.z > 1 };
  }
  private viewPos(e: { clientX: number; clientY: number }) {
    const r = this.hudCv.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * VIEW_W) / r.width, y: ((e.clientY - r.top) * VIEW_H) / r.height };
  }
  /** What is under a point in view coordinates: a station, or a ground tile. */
  private pick(vx: number, vy: number): { station?: Station; npc?: Npc; tile?: Pt; point?: THREE.Vector3 } {
    this.ray.setFromCamera(new THREE.Vector2((vx / VIEW_W) * 2 - 1, -(vy / VIEW_H) * 2 + 1), this.camera);
    const hit = this.ray.intersectObjects([...this.npcs.map((n) => n.rig.body), ...this.stationGroups, this.terrain], true)[0];
    if (!hit) return {};
    let o: THREE.Object3D | null = hit.object;
    while (o && !o.userData.station && !o.userData.npc) o = o.parent;
    if (o?.userData.npc) return { npc: this.npcs.find((n) => n.w.id === o!.userData.npc), point: hit.point };
    if (o) return { station: o.userData.station as Station, point: hit.point };
    const tx = Math.floor(hit.point.x),
      ty = Math.floor(hit.point.z);
    const s = stationAt(tx, ty);
    if (s) return { station: s, point: hit.point };
    return { tile: [tx, ty], point: hit.point };
  }
  private stationScreenPos(s: Station) {
    const g = this.stationGroups.find((g) => g.userData.station === s)!;
    const p = this.project(g.position.x, g.position.y + 1.4, g.position.z);
    return { x: p.x, y: p.y };
  }

  // ---------------- minimap ----------------
  private buildMinimap() {
    const c = document.createElement("canvas");
    c.width = COLS * MM.scale;
    c.height = ROWS * MM.scale;
    const g = c.getContext("2d")!;
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) {
        const ch = cell(x, y);
        g.fillStyle = ch === "~" ? "#2f5672" : ch === "h" || ch === "v" ? "#6b4a2c" : ch === "=" ? "#9b8460" : ch === "T" || ch === "P" ? "#2f4a22" : ch === "r" ? "#77746c" : "#4f6a2f";
        g.fillRect(x * MM.scale, y * MM.scale, MM.scale, MM.scale);
      }
    STATIONS.forEach((s) => {
      g.fillStyle = "#b9a888";
      g.fillRect(s.x * MM.scale, s.y * MM.scale, s.w * MM.scale, s.h * MM.scale);
    });
    return c;
  }
  private mmCenter() {
    return { x: VIEW_W - MM.r - MM.pad, y: MM.r + MM.pad };
  }
  private compassCenter() {
    const c = this.mmCenter();
    return { x: c.x - MM.r - 4, y: c.y - MM.r + 12 };
  }
  private drawMinimap() {
    const ctx = this.hud,
      { x: cx, y: cy } = this.mmCenter(),
      P = this.P,
      yaw = this.cam.yaw;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, MM.r, 0, Math.PI * 2);
    ctx.fillStyle = "#0b0a08";
    ctx.fill();
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(yaw);
    const ox = -(P.px + 0.5) * MM.scale,
      oy = -(P.py + 0.5) * MM.scale;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.minimap, ox, oy);
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    STATIONS.forEach((s) => {
      ctx.save();
      ctx.translate(ox + (s.x + s.w / 2) * MM.scale, oy + (s.y + s.h / 2) * MM.scale);
      ctx.rotate(-yaw);
      ctx.fillText(s.skill ? SK[s.skill].ico : "🍺", 0, 4);
      ctx.restore();
    });
    if (P.path.length) {
      const [tx, ty] = P.path[P.path.length - 1];
      ctx.fillStyle = "#e0402f";
      ctx.fillRect(ox + tx * MM.scale + 1, oy + ty * MM.scale - 3, 2, 6);
    }
    ctx.restore();
    ctx.fillStyle = "#fff";
    ctx.fillRect(cx - 2, cy - 2, 4, 4);
    // frame
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#2e2318";
    ctx.beginPath();
    ctx.arc(cx, cy, MM.r + 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#8c7650";
    ctx.beginPath();
    ctx.arc(cx, cy, MM.r + 5, 0, Math.PI * 2);
    ctx.stroke();
    // compass: needle points to north as seen by the camera
    const k = this.compassCenter();
    ctx.beginPath();
    ctx.arc(k.x, k.y, 14, 0, Math.PI * 2);
    ctx.fillStyle = "#2e2318";
    ctx.fill();
    ctx.strokeStyle = "#8c7650";
    ctx.stroke();
    ctx.save();
    ctx.translate(k.x, k.y);
    ctx.rotate(yaw);
    ctx.fillStyle = "#c8432f";
    ctx.beginPath();
    ctx.moveTo(0, -11); ctx.lineTo(4, 0); ctx.lineTo(-4, 0); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#d9cfb8";
    ctx.beginPath();
    ctx.moveTo(0, 11); ctx.lineTo(4, 0); ctx.lineTo(-4, 0); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#f2e8cf";
    ctx.font = "bold 8px sans-serif";
    ctx.fillText("N", 0, -12);
    ctx.restore();
  }
  private inMinimap(x: number, y: number) {
    const c = this.mmCenter();
    return Math.hypot(x - c.x, y - c.y) <= MM.r;
  }
  private inCompass(x: number, y: number) {
    const c = this.compassCenter();
    return Math.hypot(x - c.x, y - c.y) <= 15;
  }

  // ---------------- HUD ----------------
  private drawHud(now: number) {
    const ctx = this.hud;
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    // station labels at the foot of each building
    ctx.font = "10px Silkscreen, monospace";
    ctx.textAlign = "center";
    STATIONS.forEach((s) => {
      const g = this.stationGroups.find((g) => g.userData.station === s)!;
      const p = this.project(g.position.x, g.position.y, g.position.z + s.h / 2 + 0.15);
      if (p.behind || p.x < -40 || p.x > VIEW_W + 40 || p.y < -20 || p.y > VIEW_H + 20) return;
      const lab = (s.skill ? SK[s.skill].ico : "🍺") + " " + s.name;
      const tw = ctx.measureText(lab).width + 8;
      ctx.fillStyle = "rgba(0,0,0,.5)";
      ctx.fillRect(p.x - tw / 2, p.y, tw, 13);
      ctx.fillStyle = "#f2e6c4";
      ctx.fillText(lab, p.x, p.y + 10);
    });
    // overhead lines from wanderers
    ctx.font = "bold 12px 'Alegreya Sans', Georgia, serif";
    ctx.textAlign = "center";
    this.npcs.forEach((n) => {
      if (!n.bark) return;
      const r = n.rig.root.position;
      const p = this.project(r.x, r.y + 1.45, r.z);
      if (p.behind || p.x < 0 || p.x > VIEW_W || p.y < 0 || p.y > VIEW_H) return;
      ctx.globalAlpha = Math.min(1, (4 - n.bark.t) / 0.5);
      ctx.fillStyle = "#000";
      ctx.fillText(n.bark.text, p.x + 1, p.y + 1);
      ctx.fillStyle = "#f2e04a";
      ctx.fillText(n.bark.text, p.x, p.y);
      ctx.globalAlpha = 1;
    });
    // click markers
    this.markers.forEach((m) => {
      const p = this.project(m.x, groundAt(m.x, m.z) + 0.05, m.z);
      const k = Math.min(1, m.t / 0.5),
        r = 7 - k * 3;
      ctx.globalAlpha = 1 - k * 0.6;
      ctx.beginPath();
      ctx.moveTo(p.x - r, p.y - r); ctx.lineTo(p.x + r, p.y + r); ctx.moveTo(p.x + r, p.y - r); ctx.lineTo(p.x - r, p.y + r);
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#000";
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = m.red ? "#ff3b2f" : "#ffe14a";
      ctx.stroke();
      ctx.globalAlpha = 1;
    });
    // sparks
    this.sparks.forEach((s) => {
      ctx.globalAlpha = Math.max(0, 1 - s.t / 1.2);
      ctx.fillStyle = s.c;
      ctx.fillRect(s.x, s.y, 3, 3);
    });
    ctx.globalAlpha = 1;
    // XP drops
    ctx.font = "bold 13px Silkscreen, monospace";
    ctx.textAlign = "right";
    this.drops.forEach((d) => {
      if (d.t < 0) return;
      const y = 230 - d.t * 60;
      ctx.globalAlpha = Math.max(0, Math.min(1, (1.8 - d.t) / 0.4));
      const txt = d.ico + " " + d.text;
      ctx.fillStyle = "#000";
      ctx.fillText(txt, VIEW_W - 13, y + 1);
      ctx.fillStyle = d.neg ? "#ff7b66" : "#f5f5f5";
      ctx.fillText(txt, VIEW_W - 14, y);
    });
    ctx.globalAlpha = 1;
    this.drawMinimap();
    // hover text
    if (this.hover && !this.drag?.moved && !this.inMinimap(this.hover.x, this.hover.y)) {
      let verb = "",
        name = "";
      if (this.inCompass(this.hover.x, this.hover.y)) verb = "Face North";
      else {
        const p = this.pick(this.hover.x, this.hover.y);
        if (p.npc) {
          verb = "Talk-to";
          name = " " + p.npc.w.name;
        } else if (p.station) {
          verb = p.station.verb[0].toUpperCase() + p.station.verb.slice(1);
          name = " " + p.station.name;
        } else if (p.tile && !blocked[p.tile[1]]?.[p.tile[0]]) verb = "Walk here";
      }
      if (verb) {
        ctx.font = "bold 13px 'Alegreya Sans', Georgia, serif";
        ctx.textAlign = "left";
        const t = (s: string, x: number, c: string) => {
          ctx.fillStyle = "#000";
          ctx.fillText(s, x + 1, 19);
          ctx.fillStyle = c;
          ctx.fillText(s, x, 18);
        };
        t(verb, 8, "#ffffff");
        if (name) t(name, 8 + ctx.measureText(verb).width, verb === "Talk-to" ? "#f2e04a" : "#5fe0e0");
      }
    }
    void now;
  }

  // ---------------- frame ----------------
  private loop = (now: number) => {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const P = this.P,
      rig = this.rig;
    // keyboard camera
    if (this.keys.has("ArrowLeft")) this.cam.yaw -= dt * 1.8;
    if (this.keys.has("ArrowRight")) this.cam.yaw += dt * 1.8;
    if (this.keys.has("ArrowUp")) this.cam.pitch = Math.min(1.3, this.cam.pitch + dt * 1.2);
    if (this.keys.has("ArrowDown")) this.cam.pitch = Math.max(0.42, this.cam.pitch - dt * 1.2);
    // movement
    let walking = false;
    if (P.path.length && !P.action) {
      walking = true;
      P.walkT += dt;
      const [nx, ny] = P.path[0];
      const speed = 3.6;
      const dx = nx - P.px,
        dy = ny - P.py;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.001) P.face = Math.atan2(dx, dy);
      if (dist <= speed * dt) {
        P.px = nx; P.py = ny; P.x = nx; P.y = ny;
        P.path.shift();
        if (!P.path.length && P.pendingStation) {
          const s = P.pendingStation;
          P.pendingStation = null;
          this.faceStation(s);
          this.cb.openStation(s, this.stationScreenPos(s));
        }
        if (!P.path.length && P.pendingNpc) {
          const n = P.pendingNpc;
          P.pendingNpc = null;
          P.face = Math.atan2(n.px - P.x, n.py - P.y);
          n.face = Math.atan2(P.x - n.px, P.y - n.py);
          this.cb.openDialogue(n.w);
        }
      } else {
        P.px += (dx / dist) * speed * dt;
        P.py += (dy / dist) * speed * dt;
      }
    }
    if (P.action) {
      P.actionT += dt;
      if (P.actionT >= 1.4) this.finishAction();
    }
    this.updateNpcs(dt);
    // character pose
    const wx = P.px + 0.5,
      wz = P.py + 0.5;
    const sw = this.pose(rig, wx, wz, P.face, walking, P.walkT, dt, 11);
    rig.pick.visible = !!P.action && !P.action.neg;
    rig.mug.visible = !!P.action && P.action.neg;
    if (P.action && !P.action.neg) rig.armR.rotation.x = -1.6 - Math.cos(P.actionT * 9) * 1.0;
    else if (P.action) rig.armR.rotation.x = -1.2 - Math.max(0, Math.sin(P.actionT * 4)) * 1.2;
    else rig.armR.rotation.x = sw * 0.8;
    // camera follows the player
    const k = 1 - Math.pow(0.002, dt);
    this.cam.tx += (wx - this.cam.tx) * k;
    this.cam.tz += (wz - this.cam.tz) * k;
    const ty = standY(this.cam.tx, this.cam.tz) + 0.7;
    const { yaw, pitch, dist } = this.cam;
    this.camera.position.set(this.cam.tx + Math.sin(yaw) * Math.cos(pitch) * dist, ty + Math.sin(pitch) * dist, this.cam.tz + Math.cos(yaw) * Math.cos(pitch) * dist);
    this.camera.lookAt(this.cam.tx, ty, this.cam.tz);
    // water ripples
    const wpos = this.water.geometry.attributes.position as THREE.BufferAttribute;
    const base = this.water.userData.base as Float32Array;
    const t = now / 1000;
    for (let i = 0; i < wpos.count; i++) {
      const x = base[i * 3],
        z = base[i * 3 + 2];
      wpos.setY(i, WATER_Y + Math.sin(x * 1.7 + t * 1.3) * 0.025 + Math.cos(z * 2.1 + t * 1.1) * 0.025);
    }
    wpos.needsUpdate = true;
    this.water.geometry.computeVertexNormals();
    // standing-stone glyph pulse, chimney smoke
    const stone = this.stationGroups.find((g) => (g.userData.station as Station).id === "mind");
    const glyph = stone?.getObjectByName("glyph") as THREE.Mesh | undefined;
    if (glyph) (glyph.material as THREE.MeshBasicMaterial).opacity = 0.55 + 0.4 * Math.sin(now / 500);
    this.smoke.forEach((s) => {
      s.t = (s.t + dt * 0.35) % 1;
      s.mesh.position.set(s.ox + Math.sin(s.t * 5) * 0.12, s.oy + s.t * 1.4, s.oz);
      s.mesh.scale.setScalar(0.6 + s.t * 1.6);
      ((s.mesh.material as THREE.MeshLambertMaterial).opacity = 0.55 * (1 - s.t));
    });
    // effects
    this.markers.forEach((m) => (m.t += dt));
    this.markers = this.markers.filter((m) => m.t < 0.5);
    this.drops.forEach((d) => (d.t += dt));
    this.drops = this.drops.filter((d) => d.t < 1.8);
    this.sparks.forEach((s) => {
      s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 120 * dt;
    });
    this.sparks = this.sparks.filter((s) => s.t < 1.2);

    this.renderer.render(this.scene, this.camera);
    this.drawHud(now);
    this.raf = requestAnimationFrame(this.loop);
  };

  /** Place a rig, turn it toward `face`, and swing its limbs. Returns the swing value. */
  private pose(rig: CharacterRig, wx: number, wz: number, face: number, walking: boolean, walkT: number, dt: number, cadence: number) {
    rig.root.position.set(wx, standY(wx, wz) + (walking ? Math.abs(Math.sin(walkT * cadence)) * 0.025 : 0), wz);
    let d = face - rig.root.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    rig.root.rotation.y += d * Math.min(1, dt * 10);
    const sw = walking ? Math.sin(walkT * cadence) * 0.6 : 0;
    rig.legL.rotation.x = sw;
    rig.legR.rotation.x = -sw;
    rig.armL.rotation.x = -sw * 0.7;
    rig.armR.rotation.x = sw * 0.7;
    rig.head.rotation.y = walking ? 0 : Math.sin(walkT * 0.7) * 0.25;
    return sw;
  }
  private updateNpcs(dt: number) {
    for (const n of this.npcs) {
      let walking = false;
      if (!n.talking) {
        if (n.path.length) {
          walking = true;
          n.walkT += dt;
          const [nx, ny] = n.path[0];
          const dx = nx - n.px,
            dy = ny - n.py,
            dist = Math.hypot(dx, dy),
            speed = 1.7;
          if (dist > 0.001) n.face = Math.atan2(dx, dy);
          if (dist <= speed * dt) {
            n.px = nx; n.py = ny; n.x = nx; n.y = ny;
            n.path.shift();
            if (!n.path.length) n.wait = 2 + Math.random() * 5;
          } else {
            n.px += (dx / dist) * speed * dt;
            n.py += (dy / dist) * speed * dt;
          }
        } else if ((n.wait -= dt) <= 0) {
          const [hx, hy] = n.w.home;
          for (let tries = 0; tries < 8; tries++) {
            const tx = hx + Math.round((Math.random() * 2 - 1) * n.w.radius),
              ty = hy + Math.round((Math.random() * 2 - 1) * n.w.radius);
            if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS || blocked[ty][tx]) continue;
            const path = findPath(n.x, n.y, tx, ty);
            if (path && path.length && path.length <= n.w.radius * 3) {
              n.path = path;
              break;
            }
          }
          n.wait = 1.5;
        }
      } else n.walkT += dt;
      if (n.bark) {
        n.bark.t += dt;
        if (n.bark.t > 4) n.bark = null;
      } else if ((n.nextBark -= dt) <= 0) {
        n.bark = { text: n.w.barks[Math.floor(Math.random() * n.w.barks.length)], t: 0 };
        n.nextBark = 18 + Math.random() * 25;
      }
      this.pose(n.rig, n.px + 0.5, n.py + 0.5, n.face, walking, n.walkT, dt, 8);
    }
  }
  /** Called by React when a conversation closes. */
  endTalk() {
    this.npcs.forEach((n) => (n.talking = false));
  }
  private goToNpc(n: Npc) {
    const P = this.P;
    n.path = [];
    n.talking = true;
    const opts: Pt[] = [[n.x, n.y + 1], [n.x, n.y - 1], [n.x + 1, n.y], [n.x - 1, n.y]];
    let best: Pt[] | null = null;
    for (const [tx, ty] of opts) {
      if (tx === P.x && ty === P.y) { best = []; break; }
      if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS || blocked[ty][tx]) continue;
      const path = findPath(P.x, P.y, tx, ty);
      if (path && (!best || path.length < best.length)) best = path;
    }
    if (!best) {
      n.talking = false;
      this.cb.chat(`You can't reach ${n.w.name}.`, "sys");
      return;
    }
    P.path = best;
    P.pendingStation = null;
    P.pendingNpc = n;
    if (!best.length) {
      P.pendingNpc = null;
      P.face = Math.atan2(n.px - P.x, n.py - P.y);
      n.face = Math.atan2(P.x - n.px, P.y - n.py);
      this.cb.openDialogue(n.w);
    }
  }

  // ---------------- input ----------------
  private onDown = (e: PointerEvent) => {
    this.pointers.set(e.pointerId, this.viewPos(e));
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = Math.hypot(a.x - b.x, a.y - b.y);
      this.drag = null;
      return;
    }
    if (e.button !== 0) return;
    const p = this.viewPos(e);
    this.drag = { id: e.pointerId, sx: p.x, sy: p.y, lx: p.x, ly: p.y, moved: false };
    this.hudCv.setPointerCapture(e.pointerId);
  };
  private onMove = (e: PointerEvent) => {
    const p = this.viewPos(e);
    this.hover = p;
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, p);
    if (this.pinch !== null && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      this.cam.dist = Math.max(6, Math.min(20, this.cam.dist * (this.pinch / d)));
      this.pinch = d;
      return;
    }
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    if (!d.moved && Math.hypot(p.x - d.sx, p.y - d.sy) > 7) {
      d.moved = true;
      this.cb.closeMenu();
    }
    if (d.moved) {
      this.cam.yaw -= (p.x - d.lx) * 0.01;
      this.cam.pitch = Math.max(0.42, Math.min(1.3, this.cam.pitch + (p.y - d.ly) * 0.006));
    }
    d.lx = p.x;
    d.ly = p.y;
  };
  private onUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    const d = this.drag;
    this.drag = null;
    if (!d || d.id !== e.pointerId || d.moved) return;
    this.leftClick(this.viewPos(e));
  };
  private onCancel = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    this.pinch = null;
    this.drag = null;
  };
  private onLeave = () => {
    this.hover = null;
  };
  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.cam.dist = Math.max(6, Math.min(20, this.cam.dist * (1 + Math.sign(e.deltaY) * 0.1)));
  };
  private onContext = (e: MouseEvent) => {
    e.preventDefault();
    const v = this.viewPos(e);
    if (this.P.action || this.inMinimap(v.x, v.y)) return;
    const p = this.pick(v.x, v.y);
    if (p.npc) {
      this.goToNpc(p.npc);
      return;
    }
    if (p.station) {
      this.goToStation(p.station);
      return;
    }
    if (!p.tile) return;
    const [tx, ty] = p.tile;
    if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS || blocked[ty][tx]) return;
    this.cb.openGroundMenu(p.tile, v);
  };
  private leftClick(v: { x: number; y: number }) {
    this.cb.closeMenu();
    if (this.inCompass(v.x, v.y)) {
      this.cam.yaw = 0;
      return;
    }
    if (this.P.action) return;
    if (this.inMinimap(v.x, v.y)) {
      const c = this.mmCenter();
      const dx = v.x - c.x,
        dy = v.y - c.y,
        yaw = this.cam.yaw;
      const wx = dx * Math.cos(-yaw) - dy * Math.sin(-yaw),
        wy = dx * Math.sin(-yaw) + dy * Math.cos(-yaw);
      const mx = Math.floor(this.P.px + 0.5 + wx / MM.scale),
        my = Math.floor(this.P.py + 0.5 + wy / MM.scale);
      if (mx >= 0 && my >= 0 && mx < COLS && my < ROWS && !blocked[my][mx]) this.walkTo([mx, my]);
      return;
    }
    const p = this.pick(v.x, v.y);
    this.endTalk();
    if (p.npc) {
      if (p.point) this.markers.push({ x: p.point.x, z: p.point.z, t: 0, red: true });
      this.goToNpc(p.npc);
      return;
    }
    if (p.station) {
      if (p.point) this.markers.push({ x: p.point.x, z: p.point.z, t: 0, red: true });
      this.goToStation(p.station);
      return;
    }
    if (!p.tile) return;
    const [tx, ty] = p.tile;
    if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return;
    if (blocked[ty][tx]) {
      this.cb.chat("You can't walk there.", "sys");
      return;
    }
    this.markers.push({ x: p.point!.x, z: p.point!.z, t: 0, red: false });
    this.walkTo([tx, ty]);
  }
  /** Walk to a ground tile (left click, minimap and the "Walk here" menu). */
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
    P.pendingNpc = null;
  }
  private faceStation(s: Station) {
    const P = this.P;
    P.face = Math.atan2(s.x + s.w / 2 - (P.x + 0.5), s.y + s.h / 2 - (P.y + 0.5));
  }
  private goToStation(s: Station) {
    const P = this.P;
    if (P.x === s.ax && P.y === s.ay) {
      this.faceStation(s);
      this.cb.openStation(s, this.stationScreenPos(s));
      return;
    }
    const path = findPath(P.x, P.y, s.ax, s.ay);
    if (!path) {
      this.cb.chat("You can't reach the " + s.name.toLowerCase() + ".", "sys");
      return;
    }
    P.path = path;
    P.pendingStation = s;
    P.pendingNpc = null;
    this.cb.chat("You walk to the " + s.name.toLowerCase() + ".", "sys");
  }
  private onKeyDown = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    if (e.key.startsWith("Arrow")) {
      e.preventDefault();
      this.keys.add(e.key);
      return;
    }
    // WASD steps one tile, relative to where the camera is looking
    const k = ({ w: 0, d: 1, s: 2, a: 3 } as Record<string, number>)[e.key.toLowerCase()];
    const P = this.P;
    if (k === undefined || P.action || P.path.length) return;
    e.preventDefault();
    const ang = -this.cam.yaw + (k * Math.PI) / 2;
    const fx = Math.round(Math.sin(ang)),
      fy = -Math.round(Math.cos(ang));
    const nx = P.x + fx,
      ny = P.y + fy;
    if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) return;
    const st = stationAt(nx, ny);
    if (st) {
      this.goToStation(st);
      return;
    }
    if (blocked[ny][nx]) return;
    P.path = [[nx, ny]];
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key);
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
    const r = this.rig.root.position;
    const p = this.project(r.x, r.y + 1.3, r.z);
    for (let i = 0; i < leveled; i++) this.burst(p.x, p.y);
  }
  private burst(x: number, y: number) {
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2,
        v = 40 + Math.random() * 90;
      this.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, t: 0, c: ["#f5cd6a", "#ff7b66", "#8fd06a", "#79b7d8", "#fff"][i % 5] });
    }
  }
}
