// The 3D world: low-poly terrain and models (three.js), a camera that orbits
// the player, click-to-walk with raycast picking, and a 2D HUD canvas on top
// (hover text, click markers, XP drops, level-up sparks, minimap + compass).
// Talks to React only through WorldCallbacks.
import * as THREE from "three";
import { SK, type Habit } from "./data";
import { COLS, COURT, FERRY, LOUNGERS, onIsland, FORK, GARDEN, isGarden, LANDMARKS, SHOP, isShop, ROWS, START, STATIONS, blocked, cell, findPath, isFork, isWater, landmarkAt, stationAt, stationIcon, type Landmark, type Pt, type Station, type StationId } from "./map";
import { TIER_NAMES, type Mood, type WorldLook } from "./appearance";
import { CHIMNEYS, buildStation, hash, makeBall, makeFerry, makeGuardianStatue, makeLounger, makePalm, makeUmbrella, makeVolleyNet, makeGardenFrame, makeGardenStone, makePet, makeShop, type PetRig, makeBoat, makeBridge, makeCharacter, makeCloud, makeFork, makeLandmark, mat, natureGeo, surroundGeo, type CharacterRig } from "./models";
import { WANDERERS, type Wanderer } from "./wanderers";
import { DEFAULT_GARDEN, drawGarden, leavesFor } from "./garden";
import type { Garden } from "./data";
import { ACTION, actionFor, type ActionId } from "./actions";
import type { PropId } from "./models";

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
  /** Player reached the Fork. */
  openFork(): void;
  /** Player reached the general store. */
  openShop(): void;
  /** Player reached the zen garden gate. */
  openGarden(): void;
  /** Volleyball state changed (null = stopped). */
  volley(v: { rally: number; best: number; window: boolean } | null): void;
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
const GARDEN_BASE = 0.5;
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
    if ([[i - 1, j - 1], [i, j - 1], [i - 1, j], [i, j]].some(([x, y]) => isGarden(x, y))) h = GARDEN_BASE;
    const isle = tiles.filter((c) => "knyL".includes(c)).length;
    if (isle) h = 0.25 + (tiles.filter((c) => c === "k").length * 0.06) + hash(i, j) * 0.04;
    const rock = tiles.filter((c) => c === "M").length;
    if (rock) h += rock * 0.3 + (rock === 4 ? 0.7 + hash(i * 1.7, j * 2.3) * 1.6 + Math.max(0, 6 - j) * 0.18 : 0);
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
  if (c === "M") base = corner[y]?.[x] > 3.0 ? "#a8a59c" : corner[y]?.[x] > 1.8 ? (hash(x, y) > 0.5 ? "#5e5a52" : "#67625a") : hash(x, y) > 0.5 ? "#4e4b44" : "#57534a";
  else if (c === "w") base = "#7a6a3a";
  else if (c === "k") base = "#2e3036";
  else if (c === "n" || c === "L") base = "#ece4cf";
  else if (c === "y") base = "#e0952a";
  else if (isWater(c)) base = "#4b4a36";
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
  // wheat fields and the keep's stone walls
  const stalks: typeof trees = [],
    ears: typeof trees = [];
  const walls: { x: number; z: number; r: number }[] = [];
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      const c = cell(x, y);
      if (c === "w")
        for (let k = 0; k < 9; k++) {
          const it = { x: x + 0.17 + (k % 3) * 0.33 + (hash(x + k, y) - 0.5) * 0.1, z: y + 0.17 + Math.floor(k / 3) * 0.33 + (hash(x, y + k) - 0.5) * 0.1, s: 0.85 + hash(x * k, y) * 0.35, r: hash(k, x) * 3 };
          stalks.push({ ...it, c: "#a89040" });
          ears.push({ ...it, c: hash(x, k) > 0.5 ? "#d9b85a" : "#e2c46a" });
        }
      if (c === "W") walls.push({ x: x + 0.5, z: y + 0.5, r: cell(x - 1, y) === "W" || cell(x + 1, y) === "W" ? 0 : Math.PI / 2 });
    }
  scene.add(instanced(surroundGeo.stalk, stalks));
  scene.add(instanced(surroundGeo.ear, ears));
  scene.add(instanced(surroundGeo.wall, walls.map((w) => ({ ...w, s: 1, c: hash(w.x, w.z) > 0.5 ? "#7d7a72" : "#8a867c" }))));
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
  private landmarkGroups: THREE.Group[] = [];
  private sails: THREE.Object3D[] = [];
  private stationKeys = new Map<StationId, string>();
  private spinners: THREE.Object3D[] = [];
  private boats: THREE.Object3D[] = [];
  private fork!: THREE.Group;
  private shop!: THREE.Group;
  private ferry!: THREE.Group;
  private ferrySide: "mainland" | "island" = "mainland";
  private sail: { t: number; dur: number; pts: THREE.Vector3[]; to: "mainland" | "island" } | null = null;
  private afterSail: (() => void) | null = null;
  private ball!: THREE.Mesh;
  private courtNet!: THREE.Group;
  private kiki!: CharacterRig;
  private loungers: THREE.Group[] = [];
  private lounging: number | null = null;
  private vb: { active: boolean; toYou: boolean; t: number; dur: number; rally: number; best: number; hit: number; kikiJump: number; dropT: number } = { active: false, toYou: false, t: 0, dur: 1.15, rally: 0, best: 0, hit: 0, kikiJump: 0, dropT: 0 };
  private garden!: THREE.Group;
  private gardenStones = new THREE.Group();
  private gardenCanvas = document.createElement("canvas");
  private gardenTex!: THREE.CanvasTexture;
  private gardenKey = "";
  private pet: { rig: PetRig; kind: string; x: number; z: number; face: number; t: number } | null = null;
  private cloud!: THREE.Group;
  private look: WorldLook | null = null;
  private playerKey = "";
  private hemi!: THREE.HemisphereLight;
  private sun!: THREE.DirectionalLight;
  private rig: CharacterRig;
  private npcs: Npc[] = [];
  private smoke: { mesh: THREE.Mesh; t: number; ox: number; oy: number; oz: number }[] = [];
  private hud: CanvasRenderingContext2D;
  private hudCv: HTMLCanvasElement;
  private minimap: HTMLCanvasElement;
  private cb: WorldCallbacks;

  private P = { x: START.x, y: START.y, px: START.x, py: START.y, path: [] as Pt[], face: Math.PI, walkT: 0, action: null as null | { habit: Habit; neg: boolean; id: ActionId }, actionT: 0, fxT: 0, pendingStation: null as Station | null, pendingNpc: null as Npc | null, pendingFork: false, pendingShop: false, pendingGarden: false, pendingArrive: null as null | (() => void) };
  private cam = { yaw: 0, pitch: 0.82, dist: 11, tx: START.x + 0.5, tz: START.y + 0.5 };
  private keys = new Set<string>();
  private drops: Drop[] = [];
  private sparks: Spark[] = [];
  private markers: Marker[] = [];
  private fx: { text: string; t: number; dx: number }[] = [];
  private questGivers = new Set<string>();
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
    sc.fog = new THREE.Fog(FOG, 16, 36);
    this.hemi = new THREE.HemisphereLight("#dfe6ea", "#4d4330", 1.6);
    sc.add(this.hemi);
    this.sun = new THREE.DirectionalLight("#fff0d2", 2.0);
    this.sun.position.set(-6, 10, 4);
    sc.add(this.sun);

    this.terrain = buildTerrain();
    sc.add(this.terrain);
    this.water = buildWater();
    sc.add(this.water);
    buildNature(sc);
    STATIONS.forEach((s) => {
      const g = this.placeStation(s, { tier: 0, neglect: 0, vice: 0 });
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
    LANDMARKS.forEach((l) => {
      const g = makeLandmark(l.id);
      g.position.set(l.x + l.w / 2, groundAt(l.x + l.w / 2, l.y + l.h / 2), l.y + l.h / 2);
      g.userData.landmark = l;
      sc.add(g);
      this.landmarkGroups.push(g);
      g.traverse((o) => o.name === "sails" && this.sails.push(o));
    });
    [[60, 51, 0.4], [63, 49, 2.2], [54, 53, 1.2]].forEach(([x, z, r]) => {
      const b = makeBoat();
      b.position.set(x, WATER_Y + 0.08, z);
      b.rotation.y = r;
      b.name = "boat";
      sc.add(b);
      this.boats.push(b);
    });
    this.shop = makeShop();
    this.shop.position.set(SHOP.x + SHOP.w / 2, groundAt(SHOP.x + SHOP.w / 2, SHOP.y + SHOP.h / 2), SHOP.y + SHOP.h / 2);
    this.shop.rotation.y = Math.PI / 2; // door faces the road to the east
    this.shop.userData.shop = true;
    sc.add(this.shop);
    this.shop.traverse((o) => o.name === "spin" && this.spinners.push(o));
    {
      const w = GARDEN.w - 0.3,
        d = GARDEN.h - 0.3;
      const { group, sand } = makeGardenFrame(w, d);
      group.position.set(GARDEN.x + GARDEN.w / 2, GARDEN_BASE, GARDEN.y + GARDEN.h / 2);
      group.userData.garden = true;
      group.add(this.gardenStones);
      const statue = makeGuardianStatue();
      statue.position.set(0, 0.06, -d / 2 + 0.5);
      statue.scale.setScalar(0.9);
      group.add(statue);
      this.gardenCanvas.width = 768;
      this.gardenCanvas.height = 512;
      this.gardenTex = new THREE.CanvasTexture(this.gardenCanvas);
      this.gardenTex.colorSpace = THREE.SRGBColorSpace;
      this.gardenTex.anisotropy = 4;
      (sand.material as THREE.MeshLambertMaterial).map = this.gardenTex;
      this.garden = group;
      sc.add(group);
    }
    // ---- Pen Gu Island ----
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++)
        if (cell(x, y) === "L") {
          const palm = makePalm(hash(x, y) * 6);
          palm.position.set(x + 0.5, groundAt(x + 0.5, y + 0.5), y + 0.5);
          sc.add(palm);
        }
    {
      const cz = COURT.y + COURT.h / 2,
        cx = COURT.x + COURT.w / 2;
      const net = makeVolleyNet(COURT.w - 0.4);
      net.position.set(cx, groundAt(cx, cz), cz);
      sc.add(net);
      // court lines
      const line = new THREE.MeshBasicMaterial({ color: "#c8b48a" });
      for (const [w, d, x, z] of [[COURT.w, 0.05, cx, COURT.y], [COURT.w, 0.05, cx, COURT.y + COURT.h], [0.05, COURT.h, COURT.x, cz], [0.05, COURT.h, COURT.x + COURT.w, cz]] as const) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), line);
        m.position.set(x, groundAt(x, z) + 0.02, z);
        sc.add(m);
      }
      this.ball = makeBall();
      this.ball.position.set(cx, groundAt(cx, cz) + 0.15, cz + 1.2);
      this.ball.userData.court = true;
      sc.add(this.ball);
      net.userData.court = true;
      this.courtNet = net;
      this.kiki = makeCharacter({ skin: "#b9825a", top: "#e0602a", bottom: "#2f5a8a", hair: "#1e1610", hairStyle: "bun", hat: { kind: "cap", color: "#f2c040" } });
      const kz = COURT.them.y + 0.5;
      this.kiki.root.position.set(COURT.them.x + 0.5, groundAt(COURT.them.x + 0.5, kz), kz);
      this.kiki.root.userData.court = true;
      sc.add(this.kiki.root);
    }
    LOUNGERS.forEach((l, i) => {
      const lg = makeLounger(["#e05a5a", "#3a8ac8", "#f2c040"][i % 3]);
      lg.position.set(l.x + 0.5, groundAt(l.x + 0.5, l.y + 0.5), l.y + 0.5);
      lg.rotation.y = Math.PI; // face the sea to the south
      lg.userData.lounger = i;
      sc.add(lg);
      this.loungers.push(lg);
      const um = makeUmbrella(i % 2 ? ["#3a8ac8", "#f4f0e0"] : ["#e05a5a", "#f4f0e0"]);
      um.position.set(l.x + 1.2, groundAt(l.x + 1.2, l.y + 0.3), l.y + 0.3);
      sc.add(um);
    });
    this.ferry = makeFerry();
    this.ferry.userData.ferry = true;
    sc.add(this.ferry);
    this.parkFerry("mainland");
    this.fork = makeFork();
    this.fork.position.set(FORK.x + FORK.w / 2, groundAt(FORK.x + FORK.w / 2, FORK.y + 0.5), FORK.y + 0.5);
    this.fork.userData.fork = true;
    sc.add(this.fork);
    this.cloud = makeCloud();
    this.cloud.visible = false;
    sc.add(this.cloud);
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

  // ---------------- living village ----------------
  private placeStation(s: Station, a: { tier: number; neglect: number; vice: number }) {
    const g = buildStation(s.id, a, s.w, s.h);
    g.position.set(s.x + s.w / 2, stationBase.get(s.id)!, s.y + s.h / 2);
    g.userData.station = s;
    const i = this.stationGroups.findIndex((x) => x.userData.station === s);
    if (i >= 0) {
      this.scene.remove(this.stationGroups[i]);
      this.stationGroups[i] = g;
    } else this.stationGroups.push(g);
    this.scene.add(g);
    this.spinners = [];
    this.stationGroups.forEach((sg) => sg.traverse((o) => o.name === "spin" && this.spinners.push(o)));
    this.shop?.traverse((o) => o.name === "spin" && this.spinners.push(o));
    return g;
  }
  /** Rebuild whatever changed so the village (and you) match `look`. */
  applyLook(look: WorldLook) {
    this.look = look;
    for (const s of STATIONS) {
      const a = look.stations[s.id];
      const key = `${a.tier}/${a.neglect}/${a.vice}`;
      if (this.stationKeys.get(s.id) === key) continue;
      this.stationKeys.set(s.id, key);
      this.placeStation(s, a);
    }
    const pk = JSON.stringify(look.player.look);
    if (pk !== this.playerKey) {
      this.playerKey = pk;
      const old = this.rig.root;
      const rig = makeCharacter(look.player.look);
      rig.root.position.copy(old.position);
      rig.root.rotation.copy(old.rotation);
      this.scene.remove(old);
      this.scene.add(rig.root);
      this.rig = rig;
    }
    this.cloud.visible = look.player.cloud;
    const kind = look.player.pet ?? "";
    if ((this.pet?.kind ?? "") !== kind) {
      if (this.pet) this.scene.remove(this.pet.rig.root);
      this.pet = null;
      if (kind === "dog" || kind === "cat") {
        const rig = makePet(kind);
        this.scene.add(rig.root);
        const r = this.rig.root.position;
        this.pet = { rig, kind, x: r.x - 0.6, z: r.z + 0.4, face: 0, t: 0 };
      }
    }
    this.setMood(look.mood);
  }
  private mood: Mood = "today";
  private setMood(m: Mood) {
    if (m !== this.mood) {
      // pull the camera back when looking into the future, restore it on return
      if (m !== "today" && this.mood === "today") this.cam.dist = Math.max(this.cam.dist, 15);
      if (m === "today" && this.mood !== "today") this.cam.dist = 11;
      this.mood = m;
    }
    const fog = m === "keep" ? "#a9b6a8" : m === "slide" ? "#4c5256" : FOG;
    (this.scene.background as THREE.Color).set(fog);
    const f = this.scene.fog as THREE.Fog;
    f.color.set(fog);
    f.near = m === "slide" ? 11 : m === "keep" ? 18 : 16;
    f.far = m === "slide" ? 28 : m === "keep" ? 40 : 36;
    this.hemi.intensity = m === "slide" ? 1.0 : m === "keep" ? 1.9 : 1.6;
    this.sun.color.set(m === "keep" ? "#ffe2a8" : m === "slide" ? "#b8bcc4" : "#fff0d2");
    this.sun.intensity = m === "slide" ? 0.9 : m === "keep" ? 2.4 : 2.0;
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
  private pick(vx: number, vy: number): { station?: Station; npc?: Npc; fork?: boolean; shop?: boolean; garden?: boolean; ferry?: boolean; court?: boolean; lounger?: number; landmark?: Landmark; tile?: Pt; point?: THREE.Vector3 } {
    this.ray.setFromCamera(new THREE.Vector2((vx / VIEW_W) * 2 - 1, -(vy / VIEW_H) * 2 + 1), this.camera);
    const hit = this.ray.intersectObjects([...this.npcs.map((n) => n.rig.body), ...this.stationGroups, ...this.landmarkGroups, this.fork, this.shop, this.garden, this.ferry, this.courtNet, this.ball, this.kiki.root, ...this.loungers, this.terrain], true)[0];
    if (!hit) return {};
    let o: THREE.Object3D | null = hit.object;
    while (o && !o.userData.station && !o.userData.npc && !o.userData.fork && !o.userData.landmark && !o.userData.shop && !o.userData.garden && !o.userData.ferry && !o.userData.court && o.userData.lounger === undefined) o = o.parent;
    if (o?.userData.ferry) return { ferry: true, point: hit.point };
    if (o?.userData.court) return { court: true, point: hit.point };
    if (o && o.userData.lounger !== undefined) return { lounger: o.userData.lounger as number, point: hit.point };
    if (o?.userData.garden || isGarden(Math.floor(hit.point.x), Math.floor(hit.point.z))) return { garden: true, point: hit.point };
    if (o?.userData.shop || isShop(Math.floor(hit.point.x), Math.floor(hit.point.z))) return { shop: true, point: hit.point };
    const lm = (o?.userData.landmark as Landmark | undefined) ?? landmarkAt(Math.floor(hit.point.x), Math.floor(hit.point.z));
    if (lm) return { landmark: lm, point: hit.point };
    if (o?.userData.fork || isFork(Math.floor(hit.point.x), Math.floor(hit.point.z))) return { fork: true, point: hit.point };
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
        g.fillStyle = ch === "k" ? "#24262a" : ch === "n" || ch === "L" ? "#f0eadc" : ch === "y" ? "#e0952a" : ch === "~" ? "#2f5672" : ch === "h" || ch === "v" ? "#6b4a2c" : ch === "=" ? "#9b8460" : ch === "T" || ch === "P" ? "#2f4a22" : ch === "r" ? "#77746c" : ch === "M" ? "#5e5a54" : ch === "w" ? "#b39a4a" : ch === "W" ? "#8a867c" : ch === "f" ? "#6b4a2c" : "#4f6a2f";
        g.fillRect(x * MM.scale, y * MM.scale, MM.scale, MM.scale);
      }
    [...STATIONS, ...LANDMARKS].forEach((s) => {
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
      ctx.fillText(stationIcon(s), 0, 4);
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
      const a = this.look?.stations[s.id];
      const name = s.skill && a ? TIER_NAMES[s.skill][a.tier] : s.name;
      const lab = stationIcon(s) + " " + name + (a?.level ? " · " + a.level : "") + (a && a.neglect >= 2 ? " (rusting)" : "");
      const tw = ctx.measureText(lab).width + 8;
      ctx.fillStyle = "rgba(0,0,0,.5)";
      ctx.fillRect(p.x - tw / 2, p.y, tw, 13);
      ctx.fillStyle = "#f2e6c4";
      ctx.fillText(lab, p.x, p.y + 10);
    });
    // the island's name, floating over the penguin
    {
      const p = this.project(52.5, 2.2, 66);
      if (!p.behind && p.x > -60 && p.x < VIEW_W + 60) {
        ctx.font = "13px Silkscreen, monospace";
        const lab = "🐧 Pen Gu Island";
        const tw = ctx.measureText(lab).width + 10;
        ctx.fillStyle = "rgba(0,0,0,.5)";
        ctx.fillRect(p.x - tw / 2, p.y - 12, tw, 16);
        ctx.fillStyle = "#f5e7c3";
        ctx.fillText(lab, p.x, p.y);
        ctx.font = "10px Silkscreen, monospace";
      }
    }
    // the garden's label
    {
      const p = this.project(this.garden.position.x, this.garden.position.y, this.garden.position.z + GARDEN.h / 2 + 0.3);
      if (!p.behind) {
        const lab = "🪷 Zen garden";
        const tw = ctx.measureText(lab).width + 8;
        ctx.fillStyle = "rgba(0,0,0,.5)";
        ctx.fillRect(p.x - tw / 2, p.y, tw, 13);
        ctx.fillStyle = "#f2e6c4";
        ctx.fillText(lab, p.x, p.y + 10);
      }
    }
    // the store's label
    {
      const p = this.project(this.shop.position.x, this.shop.position.y, this.shop.position.z + 1.15);
      if (!p.behind) {
        const lab = "🪙 General store";
        const tw = ctx.measureText(lab).width + 8;
        ctx.fillStyle = "rgba(0,0,0,.5)";
        ctx.fillRect(p.x - tw / 2, p.y, tw, 13);
        ctx.fillStyle = "#f2e6c4";
        ctx.fillText(lab, p.x, p.y + 10);
      }
    }
    // the Fork's label
    {
      const p = this.project(this.fork.position.x, this.fork.position.y + 2.6, this.fork.position.z);
      if (!p.behind) {
        const lab = this.look && this.look.mood !== "today" ? `${this.look.year} · ${this.look.mood === "keep" ? "Kept going" : "Let it slide"}` : "⑂ The Fork";
        const tw = ctx.measureText(lab).width + 8;
        ctx.fillStyle = "rgba(0,0,0,.55)";
        ctx.fillRect(p.x - tw / 2, p.y - 10, tw, 13);
        ctx.fillStyle = this.look?.mood === "slide" ? "#c9cdd2" : "#f5d27a";
        ctx.fillText(lab, p.x, p.y);
      }
    }
    // quest markers
    ctx.font = "bold 18px Silkscreen, monospace";
    ctx.textAlign = "center";
    this.npcs.forEach((n) => {
      if (!this.questGivers.has(n.w.id)) return;
      const r = n.rig.root.position;
      const p = this.project(r.x, r.y + 1.6, r.z);
      if (p.behind || p.x < 0 || p.x > VIEW_W || p.y < 0 || p.y > VIEW_H) return;
      const y = p.y - (n.bark ? 16 : 0) + Math.sin(now / 250) * 2;
      ctx.fillStyle = "#000";
      ctx.fillText("!", p.x + 1, y + 1);
      ctx.fillStyle = "#f5d020";
      ctx.fillText("!", p.x, y);
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
    // action symbols rising from the player
    if (this.fx.length) {
      const r = this.rig.root.position;
      const sleeping = this.P.action?.id === "sleep";
      const base = this.project(r.x, r.y + (sleeping ? 0.4 : 1.35), r.z + (sleeping ? -0.9 : 0));
      ctx.font = "bold 15px 'Alegreya Sans', Georgia, serif";
      ctx.textAlign = "center";
      this.fx.forEach((f) => {
        ctx.globalAlpha = Math.max(0, 1 - f.t / 1.4);
        const x = base.x + f.dx + Math.sin(f.t * 4) * 4,
          y = base.y - f.t * 32;
        ctx.fillStyle = "#000";
        ctx.fillText(f.text, x + 1, y + 1);
        ctx.fillStyle = f.text === "♥" ? "#ff8a9a" : f.text === "z" ? "#cfe0ff" : "#f5e7c3";
        ctx.fillText(f.text, x, y);
      });
      ctx.globalAlpha = 1;
    }
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
        if (p.fork) {
          verb = "Look-through";
          name = " The Fork";
        } else if (p.shop) {
          verb = "Trade";
          name = " General store";
        } else if (p.garden) {
          verb = "Tend";
          name = " Zen garden";
        } else if (p.ferry) {
          verb = "Board";
          name = this.ferrySide === "mainland" ? " Ferry to Pen Gu Island" : " Ferry to the mainland";
        } else if (p.court) {
          verb = "Play";
          name = " Volleyball";
        } else if (p.lounger !== undefined) {
          verb = "Relax-on";
          name = " Sun lounger";
        } else if (p.landmark) {
          verb = "Examine";
          name = " " + p.landmark.name;
        } else if (p.npc) {
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
    const realDt = Math.min(0.5, (now - this.last) / 1000); // wall-clock, so actions take the same time on slow devices
    const dt = Math.min(0.05, realDt);
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
    if (this.sail) this.updateSail(realDt);
    if (this.vb.active) this.updateVolley(dt);
    if (P.path.length && !P.action && !this.sail) {
      walking = true;
      P.walkT += dt;
      const [nx, ny] = P.path[0];
      const speed = 3.0 + (this.look?.player.vigour ?? 0.5) * 1.0 - (this.look?.player.slouch ?? 0) * 0.5;
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
        if (!P.path.length && P.pendingArrive) {
          const f = P.pendingArrive;
          P.pendingArrive = null;
          f();
        }
        if (!P.path.length && P.pendingGarden) {
          P.pendingGarden = false;
          P.face = Math.PI;
          this.cb.openGarden();
        }
        if (!P.path.length && P.pendingShop) {
          P.pendingShop = false;
          P.face = -Math.PI / 2;
          this.cb.openShop();
        }
        if (!P.path.length && P.pendingFork) {
          P.pendingFork = false;
          P.face = Math.PI;
          this.cb.openFork();
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
      P.actionT += realDt;
      const def = ACTION[P.action.id];
      if (def.fx && (P.fxT -= dt) <= 0) {
        this.fx.push({ text: def.fx, t: 0, dx: (Math.random() - 0.5) * 16 });
        P.fxT = 0.45;
      }
      if (P.actionT >= def.secs) this.finishAction();
    }
    this.updateNpcs(dt);
    // character pose
    const wx = P.px + 0.5,
      wz = P.py + 0.5;
    this.pose(rig, wx, wz, P.face, walking, P.walkT, dt, 11);
    this.animateAction(rig, P.action?.id ?? null, P.actionT);
    if (this.sail) {
      rig.root.position.set(this.ferry.position.x, this.ferry.position.y + 0.08, this.ferry.position.z);
      rig.root.rotation.y = this.ferry.rotation.y;
    }
    if (this.lounging !== null && !P.path.length) {
      const l = LOUNGERS[this.lounging];
      rig.root.position.set(l.x + 0.5, groundAt(l.x + 0.5, l.y + 0.5) + 0.27, l.y + 0.5 + 0.35);
      rig.root.rotation.y = 0;
      rig.body.rotation.x = -1.25;
      rig.legL.rotation.x = rig.legR.rotation.x = 1.2;
      rig.armL.rotation.set(-0.2, 0, -0.3);
      rig.armR.rotation.set(-2.9, 0, 0.5); // hand behind the head
    }
    if (this.vb.active && this.vb.hit > 0) {
      const j = Math.sin((this.vb.hit / 0.35) * Math.PI);
      rig.root.position.y += j * 0.25;
      rig.armL.rotation.set(-2.6, 0, 0.25);
      rig.armR.rotation.set(-2.6, 0, -0.25);
    }
    {
      const kr = this.kiki;
      const kz = COURT.them.y + 0.5,
        kx = COURT.them.x + 0.5;
      const j = this.vb.kikiJump > 0 ? Math.sin((this.vb.kikiJump / 0.35) * Math.PI) : 0;
      kr.root.position.set(kx, groundAt(kx, kz) + j * 0.25, kz);
      kr.root.rotation.y = 0;
      kr.armL.rotation.set(j ? -2.6 : -0.3, 0, 0.2);
      kr.armR.rotation.set(j ? -2.6 : -0.3, 0, -0.2);
      kr.head.rotation.y = Math.sin(now / 900) * 0.2;
    }
    const sl = this.look?.player.slouch ?? 0;
    if (sl > 0 && P.action?.id !== "sleep" && P.action?.id !== "meditate") {
      rig.body.rotation.x += sl * 0.22;
      rig.head.rotation.x += sl * 0.35;
      rig.armL.rotation.z -= sl * 0.05;
      rig.armR.rotation.z += sl * 0.05;
    }
    if (this.cloud.visible) {
      const r = rig.root.position;
      this.cloud.position.set(r.x, r.y + 1.75 + Math.sin(now / 700) * 0.04, r.z);
      this.cloud.children.forEach((c, i) => {
        if (c.name !== "drop") return;
        c.position.y = -0.2 - (((now / 600 + i * 0.37) % 1) * 1.2);
      });
    }
    if (this.pet) {
      const pt = this.pet,
        r = rig.root.position;
      // trail a little behind and to the side of the player
      const tx = r.x - Math.sin(rig.root.rotation.y) * 0.7 + Math.cos(rig.root.rotation.y) * 0.35,
        tz = r.z - Math.cos(rig.root.rotation.y) * 0.7 - Math.sin(rig.root.rotation.y) * 0.35;
      const dx = tx - pt.x,
        dz = tz - pt.z,
        dist = Math.hypot(dx, dz);
      const moving = dist > 0.15;
      if (moving) {
        const sp = Math.min(dist * 4, 5) * dt;
        pt.x += (dx / dist) * sp;
        pt.z += (dz / dist) * sp;
        pt.face = Math.atan2(dx, dz);
      }
      pt.t += dt * (moving ? 14 : 2);
      pt.rig.root.position.set(pt.x, standY(pt.x, pt.z), pt.z);
      let df = pt.face - pt.rig.root.rotation.y;
      df = Math.atan2(Math.sin(df), Math.cos(df));
      pt.rig.root.rotation.y += df * Math.min(1, dt * 8);
      pt.rig.legs.forEach((l, i) => (l.rotation.x = moving ? Math.sin(pt.t + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI : 0)) * 0.6 : 0));
      pt.rig.tail.rotation.z = Math.sin(now / (pt.kind === "dog" ? 120 : 600)) * (pt.kind === "dog" ? 0.6 : 0.3);
      pt.rig.head.rotation.y = moving ? 0 : Math.sin(now / 1500) * 0.4;
    }
    this.spinners.forEach((o) => (o.rotation.y += dt * 1.2));
    this.sails.forEach((o) => (o.rotation.z -= dt * 0.8));
    this.boats.forEach((b, i) => {
      b.position.y = WATER_Y + 0.08 + Math.sin(now / 900 + i) * 0.03;
      b.rotation.z = Math.sin(now / 1100 + i * 2) * 0.05;
    });
    this.fork.children.forEach((c, i) => {
      if (c.name === "portal") ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.2 * Math.sin(now / 400 + i);
    });
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
    this.fx.forEach((f) => (f.t += dt));
    this.fx = this.fx.filter((f) => f.t < 1.4);
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
    rig.body.position.set(0, 0, 0);
    rig.body.rotation.set(0, 0, 0);
    rig.legL.rotation.set(sw, 0, 0);
    rig.legR.rotation.set(-sw, 0, 0);
    rig.armL.rotation.set(-sw * 0.7, 0, 0);
    rig.armR.rotation.set(sw * 0.7, 0, 0);
    rig.head.rotation.set(0, walking ? 0 : Math.sin(walkT * 0.7) * 0.25, 0);
    return sw;
  }

  /** Pose the player for the habit being logged, and show only that action's props. */
  private animateAction(rig: CharacterRig, id: ActionId | null, t: number) {
    const show: Partial<Record<PropId, boolean>> = {};
    const { body, legL, legR, armL, armR, head } = rig;
    const s = (f: number) => Math.sin(t * f);
    switch (id) {
      case "swing":
        show.pick = true;
        armR.rotation.x = -1.6 - Math.cos(t * 9) * 1.0;
        break;
      case "call":
        show.phone = true;
        armR.rotation.set(-2.5, 0, -0.55);
        armL.rotation.set(-0.6 - Math.max(0, s(3)) * 0.6, 0, 0.2);
        head.rotation.set(0.1 + s(4) * 0.08, 0.15, 0.12);
        break;
      case "type":
        show.laptop = true;
        armL.rotation.set(-1.15 + s(22) * 0.06, 0, 0.25);
        armR.rotation.set(-1.15 - s(22) * 0.06, 0, -0.25);
        head.rotation.x = 0.3;
        break;
      case "write":
        show.ledger = true;
        show.quill = true;
        armL.rotation.set(-1.2, 0, 0.45);
        armR.rotation.set(-1.0 + s(14) * 0.05, 0, -0.35 + s(9) * 0.08);
        head.rotation.x = 0.35;
        break;
      case "lift": {
        show.dumbL = show.dumbR = true;
        const c = (1 - Math.cos(t * 5)) / 2;
        armL.rotation.x = -c * 2.3;
        armR.rotation.x = -((1 - Math.cos(t * 5 + Math.PI)) / 2) * 2.3;
        body.position.y = -c * 0.02;
        break;
      }
      case "jog": {
        const j = s(15);
        legL.rotation.x = j * 0.9;
        legR.rotation.x = -j * 0.9;
        armL.rotation.set(-0.6 - j * 0.6, 0, 0);
        armR.rotation.set(-0.6 + j * 0.6, 0, 0);
        body.position.y = Math.abs(j) * 0.07;
        break;
      }
      case "sleep":
        show.bedroll = true;
        body.rotation.x = -Math.PI / 2;
        body.position.set(0, 0.13 + s(2) * 0.006, 0.0);
        armL.rotation.set(0, 0, -0.15);
        armR.rotation.set(0, 0, 0.15);
        break;
      case "meditate": {
        body.position.y = -0.4 + s(1.6) * 0.008;
        legL.rotation.set(-1.45, 0, -0.55);
        legR.rotation.set(-1.45, 0, 0.55);
        armL.rotation.set(-0.45, 0, -0.35);
        armR.rotation.set(-0.45, 0, 0.35);
        head.rotation.x = 0.12;
        break;
      }
      case "read":
        show.book = true;
        armL.rotation.set(-1.25, 0, 0.5);
        armR.rotation.set(-1.25, 0, -0.5);
        head.rotation.set(0.4, 0, 0);
        if (Math.floor(t / 0.9) % 2) head.rotation.y = 0.08;
        break;
      case "talk":
        armL.rotation.set(-0.8 - Math.max(0, s(4)) * 0.6, 0, -0.2 - s(4) * 0.2);
        armR.rotation.set(-0.8 - Math.max(0, -s(4)) * 0.6, 0, 0.2 - s(4) * 0.2);
        head.rotation.set(s(2.5) * 0.1, s(1.5) * 0.15, 0);
        break;
      case "coins":
        show.coinbag = true;
        armL.rotation.set(-1.0, 0, 0.3);
        armR.rotation.set(-1.1 + Math.abs(s(6)) * 0.3, 0, -0.35);
        head.rotation.x = 0.3;
        break;
      case "drink":
        show.mug = true;
        armR.rotation.x = -1.2 - Math.max(0, s(4)) * 1.2;
        break;
      case "smoke":
        show.joint = true;
        armR.rotation.set(-1.0 - Math.max(0, s(2.8)) * 1.5, 0, -0.3 * Math.max(0, s(2.8)));
        break;
      case "eat":
        show.treat = true;
        armR.rotation.set(-1.2 - Math.max(0, s(6)) * 1.1, 0, -0.25);
        break;
      case "scroll":
        show.phone = true;
        armR.rotation.set(-1.1, 0, -0.15);
        armL.rotation.set(-1.0, 0, 0.35);
        head.rotation.set(0.45, 0, 0);
        break;
      case "cook":
        show.pan = true;
        armR.rotation.set(-1.2 + Math.sin(t * 7) * 0.12, 0, -0.25 + Math.cos(t * 7) * 0.12);
        armL.rotation.set(-0.9, 0, 0.3);
        head.rotation.x = 0.3;
        break;
      case "water":
        show.glass = true;
        armR.rotation.x = -1.2 - Math.max(0, s(3.5)) * 1.2;
        break;
      case "splurge":
        show.coinbag = true;
        armL.rotation.set(-1.0, 0, 0.3);
        armR.rotation.set(-1.4 + Math.abs(s(5)) * 0.9, 0, -0.4);
        break;
      case "argue":
        armL.rotation.set(-1.0 - Math.max(0, s(9)) * 0.9, 0, -0.3);
        armR.rotation.set(-1.0 - Math.max(0, -s(9)) * 0.9, 0, 0.3);
        head.rotation.set(-0.1, s(12) * 0.25, 0);
        body.position.y = Math.abs(s(9)) * 0.03;
        break;
      case "bet":
        show.dice = true;
        armR.rotation.set(-1.4 + s(30) * 0.15, 0, -0.2);
        break;
    }
    for (const k of Object.keys(rig.props) as PropId[]) rig.props[k].visible = !!show[k];
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
  /** Wanderers who have a quest to offer get a gold ! overhead. */
  setQuestGivers(ids: string[]) {
    this.questGivers = new Set(ids);
  }
  // ---- ferry ----
  private parkFerry(side: "mainland" | "island") {
    this.ferrySide = side;
    if (side === "mainland") {
      this.ferry.position.set(FERRY.mainland.x + 0.5, WATER_Y + 0.05, FERRY.mainland.y + 1.45);
      this.ferry.rotation.y = 0;
    } else {
      this.ferry.position.set(FERRY.island.x + 1.5, WATER_Y + 0.05, FERRY.island.y + 1.2);
      this.ferry.rotation.y = Math.PI;
    }
  }
  /** True when (x,y) is across the water from where the player stands. */
  private acrossWater(x: number, y: number) {
    return onIsland(x, y) !== onIsland(this.P.x, this.P.y);
  }
  /** Walk to the ferry on this side, sail across, then do `next`. */
  private viaFerry(next: () => void) {
    const P = this.P;
    const side = onIsland(P.x, P.y) ? "island" : "mainland";
    if (this.ferrySide !== side) this.parkFerry(side); // the ferry comes back for you
    const dock = FERRY[side];
    const go = () => {
      this.afterSail = next;
      this.startSail();
    };
    if (P.x === dock.x && P.y === dock.y) {
      go();
      return;
    }
    const path = findPath(P.x, P.y, dock.x, dock.y);
    if (!path) {
      this.cb.chat("You can't find a way to the ferry from here.", "sys");
      return;
    }
    P.path = path;
    P.pendingStation = null;
    P.pendingNpc = null;
    P.pendingFork = false;
    P.pendingShop = false;
    P.pendingGarden = false;
    P.pendingArrive = go;
    this.cb.chat(side === "mainland" ? "That's out on Pen Gu Island. You head for the ferry at the end of the fishing pier." : "That's back on the mainland. You head for the ferry.", "hint");
  }
  private startSail() {
    const to = this.ferrySide === "mainland" ? "island" : "mainland";
    const a = new THREE.Vector3(FERRY.mainland.x + 0.5, 0, FERRY.mainland.y + 1.45),
      b = new THREE.Vector3(FERRY.island.x + 1.5, 0, FERRY.island.y + 1.2);
    const mid1 = new THREE.Vector3(63, 0, 55.8),
      mid2 = new THREE.Vector3(64.5, 0, 59.5);
    const pts = to === "island" ? [a, mid1, mid2, b] : [b, mid2, mid1, a];
    this.sail = { t: 0, dur: 6, pts, to };
    this.lounging = null;
    this.cb.chat(to === "island" ? "You climb aboard. The ferry pushes off for Pen Gu Island." : "You climb aboard. Back to the mainland.", "hint");
  }
  private updateSail(dt: number) {
    const s = this.sail!;
    s.t += dt;
    const k = Math.min(1, s.t / s.dur);
    const curve = new THREE.CatmullRomCurve3(s.pts);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    const pos = curve.getPointAt(e),
      tan = curve.getTangentAt(e);
    this.ferry.position.set(pos.x, WATER_Y + 0.05 + Math.sin(s.t * 3) * 0.03, pos.z);
    this.ferry.rotation.y = Math.atan2(tan.x, tan.z);
    this.ferry.rotation.z = Math.sin(s.t * 2) * 0.04;
    const P = this.P;
    P.px = pos.x - 0.5;
    P.py = pos.z - 0.5;
    P.face = this.ferry.rotation.y;
    if (k >= 1) {
      const land = FERRY[s.to];
      P.x = P.px = land.x;
      P.y = P.py = land.y;
      this.parkFerry(s.to);
      this.sail = null;
      this.cb.chat(s.to === "island" ? "Welcome to Pen Gu Island. Warm sand, a net, and nowhere to be." : "You step back onto the pier.", "lvl");
      const next = this.afterSail;
      this.afterSail = null;
      next?.();
    }
  }
  // ---- loungers ----
  private lieDown(i: number) {
    this.lounging = i;
    this.P.face = 0;
    this.cb.chat(["You stretch out in the sun. The waves do the rest.", "You lie back and listen to the sea.", "You close your eyes. Nothing needs you right now."][i % 3], "hint");
  }
  // ---- volleyball ----
  private courtPoint(you: boolean) {
    const t = you ? COURT.you : COURT.them;
    return new THREE.Vector3(t.x + 0.5, groundAt(t.x + 0.5, t.y + 0.5) + 1.25, t.y + 0.5 + (you ? -0.3 : 0.3));
  }
  private startVolley() {
    this.lounging = null;
    this.P.face = Math.PI;
    this.vb = { ...this.vb, active: true, toYou: true, t: -0.8, rally: 0, hit: 0, dropT: 0 };
    this.cb.chat("Kiki tosses you a grin and serves. Click, tap or press space as the ball reaches you.", "hint");
    this.cb.volley({ rally: 0, best: this.vb.best, window: false });
  }
  /** Try to hit the ball (click, tap, space or the Hit button). */
  volleyHit() {
    const v = this.vb;
    if (!v.active) return;
    v.hit = 0.35;
    if (v.toYou && v.t >= v.dur * 0.62 && v.dropT === 0) {
      v.rally++;
      v.toYou = false;
      v.t = 0;
      if (v.rally > v.best) v.best = v.rally;
      this.cb.volley({ rally: v.rally, best: v.best, window: false });
    }
  }
  stopVolley() {
    if (!this.vb.active) return;
    this.vb.active = false;
    this.cb.volley(null);
    this.cb.chat(`You wave to Kiki and step off the court. Best rally: ${this.vb.best}.`, "sys");
  }
  setVolleyBest(n: number) {
    this.vb.best = Math.max(this.vb.best, n);
  }
  private updateVolley(dt: number) {
    const v = this.vb;
    v.hit = Math.max(0, v.hit - dt);
    v.kikiJump = Math.max(0, v.kikiJump - dt);
    if (v.dropT > 0) {
      v.dropT += dt;
      this.ball.position.y = Math.max(groundAt(this.ball.position.x, this.ball.position.z) + 0.15, this.ball.position.y - dt * 4);
      if (v.dropT > 1.4) {
        // Kiki serves again
        v.dropT = 0;
        v.toYou = true;
        v.t = -0.3;
        v.rally = 0;
        this.cb.volley({ rally: 0, best: v.best, window: false });
      }
      return;
    }
    v.t += dt;
    const from = this.courtPoint(!v.toYou),
      to = this.courtPoint(v.toYou);
    const k = Math.max(0, Math.min(1.15, v.t / v.dur));
    const pos = from.clone().lerp(to, Math.min(1, k));
    pos.y += Math.sin(Math.min(1, k) * Math.PI) * 1.9;
    if (k > 1) pos.y -= (k - 1) * 6;
    this.ball.position.copy(pos);
    this.ball.rotation.x += dt * 8;
    const window = v.toYou && v.t >= v.dur * 0.62 && k <= 1.1;
    this.cb.volley({ rally: v.rally, best: v.best, window });
    if (!v.toYou && k >= 1) {
      // Kiki always gets it back
      v.kikiJump = 0.35;
      v.toYou = true;
      v.t = 0;
      v.dur = Math.max(0.75, 1.15 - v.rally * 0.02); // the rally speeds up
    } else if (v.toYou && k > 1.1) {
      v.dropT = 0.01;
      this.cb.chat(v.rally ? `The ball drops. Rally of ${v.rally}!` : "Missed! Kiki laughs and fetches the ball.", v.rally >= 5 ? "lvl" : "sys");
    }
  }

  /** Repaint the sand and re-place the stones to match your garden. */
  setGarden(g: Garden | undefined, created: string) {
    const garden = g ?? DEFAULT_GARDEN;
    const leaves = leavesFor(garden, created);
    const key = JSON.stringify(garden) + leaves.length;
    if (key === this.gardenKey) return;
    this.gardenKey = key;
    drawGarden(this.gardenCanvas.getContext("2d")!, this.gardenCanvas.width, this.gardenCanvas.height, garden, leaves);
    this.gardenTex.needsUpdate = true;
    this.gardenStones.clear();
    const w = GARDEN.w - 0.3,
      d = GARDEN.h - 0.3;
    garden.stones.forEach((s, i) => {
      const m = makeGardenStone(s.s, i + 3);
      m.position.set((s.x - 0.5) * w, 0.1, (s.y - 0.5) * d);
      m.rotation.y = i * 1.7;
      this.gardenStones.add(m);
    });
  }
  /** A gold amount floating up the right side, like the XP drops. */
  moneyDrop(text: string, neg: boolean) {
    this.drops.push({ text, ico: "🪙", t: -0.5, neg });
  }
  /** Fireworks over the player (quest complete). */
  celebrate() {
    const r = this.rig.root.position;
    const p = this.project(r.x, r.y + 1.3, r.z);
    for (let i = 0; i < 3; i++) this.burst(p.x + (i - 1) * 20, p.y - i * 8);
  }
  /** Called by React when a conversation closes. */
  endTalk() {
    this.npcs.forEach((n) => (n.talking = false));
  }
  private goToFork() {
    const P = this.P;
    P.pendingStation = null;
    P.pendingNpc = null;
    if (P.x === FORK.ax && P.y === FORK.ay) {
      P.face = Math.PI;
      this.cb.openFork();
      return;
    }
    const path = findPath(P.x, P.y, FORK.ax, FORK.ay);
    if (!path) return;
    P.path = path;
    P.pendingFork = true;
    this.cb.chat("You walk to the Fork.", "sys");
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
      this.cam.dist = Math.max(6, Math.min(26, this.cam.dist * (this.pinch / d)));
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
    this.cam.dist = Math.max(6, Math.min(26, this.cam.dist * (1 + Math.sign(e.deltaY) * 0.1)));
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
    if (this.sail) return;
    if (this.vb.active) {
      this.volleyHit();
      return;
    }
    this.lounging = null;
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
    if (p.fork) {
      if (p.point) this.markers.push({ x: p.point.x, z: p.point.z, t: 0, red: true });
      this.goToFork();
      return;
    }
    if (p.ferry || p.court || p.lounger !== undefined) {
      if (p.point) this.markers.push({ x: p.point.x, z: p.point.z, t: 0, red: true });
      const P = this.P;
      const dest = p.ferry ? FERRY[this.ferrySide] : p.court ? COURT.you : LOUNGERS[p.lounger!];
      P.pendingStation = null;
      P.pendingNpc = null;
      P.pendingFork = false;
      P.pendingShop = false;
      P.pendingGarden = false;
      const arrive = () => (p.ferry ? this.startSail() : p.court ? this.startVolley() : this.lieDown(p.lounger!));
      if (P.x === dest.x && P.y === dest.y) {
        arrive();
        return;
      }
      const path = findPath(P.x, P.y, dest.x, dest.y);
      if (!path) {
        if (!p.ferry && this.acrossWater(dest.x, dest.y)) {
          this.viaFerry(() => {
            const P2 = this.P;
            const again = findPath(P2.x, P2.y, dest.x, dest.y);
            if (!again) return;
            if (!again.length) arrive();
            else {
              P2.path = again;
              P2.pendingArrive = arrive;
            }
          });
          return;
        }
        if (p.ferry) {
          // the ferry is moored on the other side: call it over
          this.viaFerry(() => {});
          return;
        }
        this.cb.chat("You can't reach that from here.", "sys");
        return;
      }
      P.path = path;
      P.pendingArrive = arrive;
      return;
    }
    if (p.garden) {
      if (p.point) this.markers.push({ x: p.point.x, z: p.point.z, t: 0, red: true });
      const P = this.P;
      P.pendingStation = null;
      P.pendingNpc = null;
      P.pendingFork = false;
      P.pendingShop = false;
      if (P.x === GARDEN.ax && P.y === GARDEN.ay) {
        P.face = Math.PI;
        this.cb.openGarden();
        return;
      }
      const path = findPath(P.x, P.y, GARDEN.ax, GARDEN.ay);
      if (path) {
        P.path = path;
        P.pendingGarden = true;
        this.cb.chat("You walk to the zen garden.", "sys");
      }
      return;
    }
    if (p.shop) {
      if (p.point) this.markers.push({ x: p.point.x, z: p.point.z, t: 0, red: true });
      const P = this.P;
      P.pendingStation = null;
      P.pendingNpc = null;
      P.pendingFork = false;
      if (P.x === SHOP.ax && P.y === SHOP.ay) {
        P.face = -Math.PI / 2;
        this.cb.openShop();
        return;
      }
      const path = findPath(P.x, P.y, SHOP.ax, SHOP.ay);
      if (path) {
        P.path = path;
        P.pendingShop = true;
        this.cb.chat("You walk to the general store.", "sys");
      }
      return;
    }
    if (p.landmark) {
      if (p.point) this.markers.push({ x: p.point.x, z: p.point.z, t: 0, red: true });
      const l = p.landmark;
      const path = findPath(this.P.x, this.P.y, l.ax, l.ay);
      if (path) {
        this.P.path = path;
        this.P.pendingStation = null;
        this.P.pendingNpc = null;
        this.P.pendingFork = false;
      }
      this.cb.chat(l.examine, "sys");
      return;
    }
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
  /** Development aid: jump straight to a tile (only exposed in dev builds). */
  debugTeleport(x: number, y: number) {
    const P = this.P;
    P.path = [];
    P.x = P.px = x;
    P.y = P.py = y;
    this.cam.tx = x + 0.5;
    this.cam.tz = y + 0.5;
  }
  /** Walk to a ground tile (left click, minimap and the "Walk here" menu). */
  walkTo([tx, ty]: Pt) {
    const P = this.P;
    if (P.action) return;
    const path = findPath(P.x, P.y, tx, ty);
    if (!path) {
      if (this.acrossWater(tx, ty)) this.viaFerry(() => this.walkTo([tx, ty]));
      else this.cb.chat("You can't reach that.", "sys");
      return;
    }
    P.path = path;
    P.pendingStation = null;
    P.pendingNpc = null;
    P.pendingFork = false;
    P.pendingShop = false;
    P.pendingGarden = false;
    P.pendingArrive = null;
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
    P.pendingFork = false;
    this.cb.chat("You walk to the " + s.name.toLowerCase() + ".", "sys");
  }
  private onKeyDown = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    if (this.vb.active && (e.key === " " || e.key === "Enter")) {
      e.preventDefault();
      this.volleyHit();
      return;
    }
    if (this.vb.active && e.key === "Escape") {
      this.stopVolley();
      return;
    }
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
    const id = actionFor(h);
    P.action = { habit: h, neg: h.type === "neg", id };
    P.actionT = 0;
    P.fxT = 0.2;
    this.cb.chat(ACTION[id].start.replace("{h}", h.name), "sys");
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
