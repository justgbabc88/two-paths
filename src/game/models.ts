// Low-poly, flat-shaded models built from primitives. All original designs.
// Units: 1 = one map tile. +z is south (the side most station doors face).
import * as THREE from "three";
import type { StationId } from "./map";

const mats = new Map<string, THREE.Material>();
export function mat(color: string, opts: { emissive?: string; opacity?: number } = {}): THREE.Material {
  const key = color + JSON.stringify(opts);
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({
      color,
      flatShading: true,
      emissive: opts.emissive ?? "#000000",
      transparent: opts.opacity !== undefined,
      opacity: opts.opacity ?? 1,
    });
    mats.set(key, m);
  }
  return m;
}

/** Deterministic noise so models look hand-made but stay stable between loads. */
export function hash(x: number, y: number) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

/** Nudge every vertex a little so primitives read as chiselled rather than perfect. */
export function roughen(g: THREE.BufferGeometry, amt: number, seed = 1): THREE.BufferGeometry {
  const p = g.attributes.position as THREE.BufferAttribute;
  const seen = new Map<string, [number, number, number]>();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let d = seen.get(k);
    if (!d) {
      const s = seen.size + seed * 97;
      d = [(hash(s, 1) - 0.5) * amt, (hash(s, 2) - 0.5) * amt, (hash(s, 3) - 0.5) * amt];
      seen.set(k, d);
    }
    p.setXYZ(i, p.getX(i) + d[0], p.getY(i) + d[1], p.getZ(i) + d[2]);
  }
  g.computeVertexNormals();
  return g;
}

function box(w: number, h: number, d: number, color: string, x = 0, y = 0, z = 0, o: { emissive?: string } = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, o));
  m.position.set(x, y, z);
  return m;
}
function cyl(rt: number, rb: number, h: number, seg: number, color: string, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color));
  m.position.set(x, y, z);
  return m;
}
function at<O extends THREE.Object3D>(o: O, x: number, y: number, z: number): O {
  o.position.set(x, y, z);
  return o;
}
function rotZ<O extends THREE.Object3D>(o: O): O {
  o.rotation.z = Math.PI / 2;
  return o;
}
/** Gable roof: triangle profile across x, ridge running along z. */
function gable(w: number, d: number, h: number, color: string, y: number, z = 0) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(0, h);
  s.lineTo(-w / 2, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
  g.translate(0, 0, -d / 2);
  const m = new THREE.Mesh(roughen(g.toNonIndexed(), 0.04, 7), mat(color));
  m.position.set(0, y, z);
  return m;
}
/** Same roof but ridge running along x (gable ends face east/west). */
function gableX(w: number, d: number, h: number, color: string, y: number) {
  const m = gable(d, w, h, color, y);
  m.rotation.y = Math.PI / 2;
  return m;
}

const C = {
  wood: "#5b3c22", woodLt: "#7a5533", woodDk: "#3a2614",
  stone: "#7d7a72", stoneLt: "#99958b", stoneDk: "#5d5a54",
  cream: "#cbbd98", plaster: "#d8cba7",
  thatch: "#a3803c", slate: "#3f5470", tile: "#7a3324",
  gold: "#d4a52a", lamp: "#f0c766",
  cloth: "#9c3428", linen: "#ddd0b0",
  skin: "#c99a72", tunic: "#3c5a8c", trousers: "#3a3328", hair: "#4a2e18", boot: "#2b2119",
};

// ---------------- character ----------------
export interface CharacterRig {
  root: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  pick: THREE.Group;
  mug: THREE.Group;
}
export function makeCharacter(): CharacterRig {
  const root = new THREE.Group();
  const limb = (x: number, y: number, w: number, h: number, color: string, end: string) => {
    const g = new THREE.Group();
    g.position.set(x, y, 0);
    g.add(box(w, h, w * 1.1, color, 0, -h / 2, 0));
    g.add(box(w * 1.05, 0.1, w * 1.25, end, 0, -h - 0.02, end === C.boot ? 0.03 : 0));
    root.add(g);
    return g;
  };
  const legL = limb(-0.09, 0.47, 0.14, 0.4, C.trousers, C.boot);
  const legR = limb(0.09, 0.47, 0.14, 0.4, C.trousers, C.boot);
  root.add(box(0.38, 0.44, 0.22, C.tunic, 0, 0.68, 0));
  root.add(box(0.4, 0.06, 0.24, C.woodDk, 0, 0.52, 0)); // belt
  root.add(box(0.06, 0.05, 0.02, C.gold, 0, 0.52, 0.125)); // buckle
  root.add(box(0.3, 0.1, 0.24, "#33507e", 0, 0.88, 0)); // collar
  const armL = limb(-0.25, 0.88, 0.11, 0.4, C.tunic, C.skin);
  const armR = limb(0.25, 0.88, 0.11, 0.4, C.tunic, C.skin);
  // head
  root.add(box(0.26, 0.27, 0.25, C.skin, 0, 1.06, 0));
  root.add(box(0.29, 0.1, 0.28, C.hair, 0, 1.22, -0.01));
  root.add(box(0.29, 0.22, 0.08, C.hair, 0, 1.11, -0.12));
  root.add(box(0.04, 0.04, 0.02, "#1a1410", -0.06, 1.07, 0.127));
  root.add(box(0.04, 0.04, 0.02, "#1a1410", 0.06, 1.07, 0.127));
  root.add(box(0.04, 0.05, 0.04, "#b5845e", 0, 1.02, 0.14));
  // tools, held in the right hand
  const pick = new THREE.Group();
  pick.add(cyl(0.02, 0.02, 0.55, 5, C.woodLt, 0, 0.18, 0));
  const head = box(0.36, 0.06, 0.06, "#8d939a", 0, 0.45, 0);
  pick.add(head);
  pick.position.set(0, -0.45, 0.04);
  pick.rotation.x = Math.PI / 2;
  armR.add(pick);
  const mug = new THREE.Group();
  mug.add(cyl(0.07, 0.065, 0.16, 7, "#8a6036", 0, 0, 0));
  mug.add(cyl(0.065, 0.065, 0.02, 7, "#efe6cc", 0, 0.08, 0));
  mug.add(box(0.03, 0.09, 0.03, "#6b4626", 0.09, 0, 0));
  mug.position.set(0, -0.48, 0.06);
  armR.add(mug);
  pick.visible = mug.visible = false;
  // blob shadow
  const sh = new THREE.Mesh(new THREE.CircleGeometry(0.28, 12), new THREE.MeshBasicMaterial({ color: "#000", transparent: true, opacity: 0.28, depthWrite: false }));
  sh.rotation.x = -Math.PI / 2;
  sh.position.y = 0.02;
  root.add(sh);
  return { root, legL, legR, armL, armR, pick, mug };
}

// ---------------- nature (instanced) ----------------
export const natureGeo = {
  trunk: new THREE.CylinderGeometry(0.07, 0.11, 0.6, 5).translate(0, 0.3, 0),
  canopy: roughen(new THREE.IcosahedronGeometry(0.5, 0).toNonIndexed(), 0.12, 3).translate(0, 0.95, 0),
  canopy2: roughen(new THREE.IcosahedronGeometry(0.34, 0).toNonIndexed(), 0.1, 4).translate(0.12, 1.3, 0.05),
  pineLow: new THREE.ConeGeometry(0.48, 0.75, 6).translate(0, 0.75, 0),
  pineHigh: new THREE.ConeGeometry(0.34, 0.65, 6).translate(0, 1.2, 0),
  rock: roughen(new THREE.DodecahedronGeometry(0.36, 0).toNonIndexed(), 0.12, 5).scale(1, 0.62, 1).translate(0, 0.12, 0),
  bush: roughen(new THREE.IcosahedronGeometry(0.3, 0).toNonIndexed(), 0.08, 6).scale(1.2, 0.8, 1.1).translate(0, 0.2, 0),
  flower: new THREE.BoxGeometry(0.07, 0.07, 0.07).translate(0, 0.08, 0),
  stem: new THREE.BoxGeometry(0.02, 0.08, 0.02).translate(0, 0.04, 0),
};

// ---------------- bridge & fence ----------------
export function makeBridge(alongX: boolean): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const p = box(0.15, 0.06, 0.95, i % 2 ? C.woodLt : C.wood, -0.42 + i * 0.17, 0.12, 0);
    p.rotation.y = (hash(i, 9) - 0.5) * 0.06;
    g.add(p);
  }
  for (const z of [-0.47, 0.47]) {
    g.add(box(1, 0.05, 0.05, C.woodDk, 0, 0.34, z));
    for (const x of [-0.45, 0.45]) g.add(box(0.07, 0.4, 0.07, C.woodDk, x, 0.15, z));
  }
  if (!alongX) g.rotation.y = Math.PI / 2;
  return g;
}

// ---------------- stations ----------------
// Each returns a group centred on the footprint, base at y=0, front facing +z.
function goldMine(): THREE.Group {
  const g = new THREE.Group();
  const mound = new THREE.Mesh(roughen(new THREE.IcosahedronGeometry(1.1, 1).toNonIndexed(), 0.25, 11), mat(C.stoneDk));
  mound.scale.set(1.0, 0.8, 0.9);
  mound.position.set(0, 0.25, -0.2);
  g.add(mound);
  const cap = new THREE.Mesh(roughen(new THREE.IcosahedronGeometry(0.55, 0).toNonIndexed(), 0.15, 12), mat(C.stone));
  cap.position.set(-0.35, 1.0, -0.35);
  g.add(cap);
  g.add(box(0.62, 0.72, 0.4, "#0e0b08", 0, 0.36, 0.62));
  for (const x of [-0.38, 0.38]) g.add(box(0.1, 0.86, 0.12, C.wood, x, 0.43, 0.82));
  g.add(box(0.92, 0.12, 0.16, C.woodLt, 0, 0.88, 0.82));
  for (const x of [-0.12, 0.12]) g.add(box(0.04, 0.03, 0.9, "#6f7378", x, 0.02, 1.15));
  const nug = new THREE.OctahedronGeometry(0.07, 0);
  [[-0.6, 0.7, 0.25], [0.55, 0.55, 0.35], [0.2, 1.0, 0.05], [-0.25, 0.45, 0.6], [0.75, 0.25, 0.5], [-0.8, 0.3, 0.3]].forEach(([x, y, z]) => {
    const m = new THREE.Mesh(nug, mat(C.gold, { emissive: "#3a2a00" }));
    m.position.set(x, y, z);
    g.add(m);
  });
  const cart = new THREE.Group();
  cart.add(box(0.42, 0.22, 0.3, C.woodLt, 0, 0.2, 0));
  cart.add(box(0.36, 0.06, 0.24, C.gold, 0, 0.33, 0, { emissive: "#2a1e00" }));
  for (const x of [-0.15, 0.15]) {
    const w = cyl(0.07, 0.07, 0.34, 7, "#2a2522", x, 0.08, 0);
    w.rotation.x = Math.PI / 2;
    cart.add(w);
  }
  cart.position.set(0.72, 0, 0.85);
  g.add(cart);
  return g;
}
function standingStone(): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(0.95, 1.05, 0.14, 8, C.stoneDk, 0, 0.07, 0.1));
  const slab = new THREE.Mesh(roughen(new THREE.BoxGeometry(0.55, 2.1, 0.36, 1, 3, 1).toNonIndexed(), 0.06, 13), mat("#8a8c86"));
  slab.position.set(0, 1.1, 0);
  slab.rotation.z = 0.04;
  g.add(slab);
  const top = new THREE.Mesh(roughen(new THREE.ConeGeometry(0.3, 0.35, 4).toNonIndexed(), 0.04, 14), mat("#8a8c86"));
  top.position.set(0.04, 2.3, 0);
  top.rotation.y = Math.PI / 4;
  g.add(top);
  const glyph = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.9), new THREE.MeshBasicMaterial({ color: "#bfe3ff", transparent: true, opacity: 0.8 }));
  glyph.position.set(0.03, 1.2, 0.19);
  glyph.name = "glyph";
  g.add(glyph);
  const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.08), glyph.material);
  bar.position.set(0.03, 1.4, 0.19);
  g.add(bar);
  [[-0.75, 0.5], [0.8, 0.35], [0.6, -0.6], [-0.6, -0.55]].forEach(([x, z], i) => {
    const r = new THREE.Mesh(natureGeo.rock, mat(i % 2 ? C.stone : C.stoneLt));
    r.position.set(x, 0.05, z);
    r.scale.setScalar(0.6);
    g.add(r);
  });
  return g;
}
function marketStall(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(1.75, 0.5, 0.5, C.wood, 0, 0.25, 0.12));
  g.add(box(1.8, 0.05, 0.56, C.woodLt, 0, 0.52, 0.12));
  for (const x of [-0.85, 0.85]) for (const z of [-0.3, 0.36]) g.add(box(0.08, 1.45, 0.08, C.woodDk, x, 0.72, z));
  for (let i = 0; i < 7; i++) {
    const s = box(0.27, 0.04, 0.95, i % 2 ? C.linen : C.cloth, -0.81 + i * 0.27, 1.38, 0.05);
    s.rotation.x = 0.32;
    g.add(s);
  }
  // goods
  const ap = new THREE.IcosahedronGeometry(0.06, 0);
  for (let i = 0; i < 6; i++) {
    const a = new THREE.Mesh(ap, mat("#a5312a"));
    a.position.set(0.45 + (i % 3) * 0.11, 0.6, 0.05 + Math.floor(i / 3) * 0.12);
    g.add(a);
  }
  g.add(box(0.3, 0.1, 0.16, "#c39550", -0.5, 0.6, 0.1));
  g.add(box(0.26, 0.12, 0.2, "#4f7a32", -0.05, 0.61, 0.12));
  g.add(box(0.12, 0.04, 0.12, C.gold, 0.2, 0.57, 0.25, { emissive: "#2a1e00" }));
  return g;
}
function library(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(2.6, 1.35, 1.5, C.stone, 0, 0.67, -0.05));
  g.add(box(2.7, 0.12, 1.6, C.stoneDk, 0, 0.06, -0.05));
  g.add(gableX(2.9, 1.8, 0.85, C.slate, 1.35));
  for (const x of [-1.05, 1.05]) g.add(cyl(0.09, 0.1, 1.3, 6, C.stoneLt, x, 0.65, 0.78));
  g.add(box(2.4, 0.14, 0.2, C.stoneLt, 0, 1.32, 0.78));
  g.add(box(0.46, 0.82, 0.06, C.woodDk, 0, 0.41, 0.72));
  g.add(box(0.05, 0.05, 0.03, C.gold, 0.15, 0.42, 0.76));
  for (const x of [-0.75, 0.75]) {
    g.add(box(0.46, 0.5, 0.05, "#2a2016", x, 0.75, 0.71));
    ["#8e3530", "#3d7048", "#36508a", "#a88a2e"].forEach((c, i) => g.add(box(0.08, 0.32 + (i % 2) * 0.06, 0.03, c, x - 0.15 + i * 0.1, 0.72, 0.735)));
  }
  g.add(box(0.8, 0.22, 0.05, C.linen, 0, 1.12, 0.71));
  return g;
}
function trainingYard(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(2.85, 0.04, 1.85, "#7a6143", 0, 0.02, 0));
  // fence on three sides
  const post = (x: number, z: number) => g.add(box(0.08, 0.55, 0.08, C.wood, x, 0.27, z));
  for (let i = 0; i <= 6; i++) post(-1.4 + i * 0.466, -0.9);
  for (let i = 1; i <= 3; i++) { post(-1.4, -0.9 + i * 0.45); post(1.4, -0.9 + i * 0.45); }
  g.add(box(2.85, 0.05, 0.05, C.woodLt, 0, 0.42, -0.9));
  g.add(box(2.85, 0.05, 0.05, C.woodLt, 0, 0.22, -0.9));
  for (const x of [-1.4, 1.4]) { g.add(box(0.05, 0.05, 1.4, C.woodLt, x, 0.42, -0.2)); g.add(box(0.05, 0.05, 1.4, C.woodLt, x, 0.22, -0.2)); }
  // straw dummy
  const d = new THREE.Group();
  d.add(cyl(0.04, 0.05, 1.2, 5, C.wood, 0, 0.6, 0));
  d.add(at(new THREE.Mesh(roughen(new THREE.CylinderGeometry(0.17, 0.2, 0.5, 7).toNonIndexed(), 0.04, 21), mat("#b8924c")), 0, 0.85, 0));
  d.add(at(new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 0), mat("#c9a35c")), 0, 1.25, 0));
  d.add(box(0.75, 0.06, 0.06, C.wood, 0, 1.0, 0));
  d.add(box(0.26, 0.04, 0.22, "#6d4e2c", 0, 0.62, 0));
  d.position.set(-0.75, 0, 0.05);
  g.add(d);
  // weight rack + plates
  for (const x of [0.25, 1.15]) g.add(box(0.07, 0.75, 0.07, "#4a4c50", x, 0.37, -0.3));
  g.add(rotZ(cyl(0.025, 0.025, 1.25, 6, "#9aa0a6", 0.7, 0.68, -0.3)));
  for (const x of [0.12, 1.28]) g.add(rotZ(cyl(0.19, 0.19, 0.08, 9, "#2c2e31", x, 0.68, -0.3)));
  // kettlebell + bucket
  g.add(at(new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), mat("#2c2e31")), 0.35, 0.12, 0.45));
  g.add(cyl(0.12, 0.1, 0.22, 7, C.woodLt, 0.95, 0.12, 0.5));
  g.add(cyl(0.11, 0.11, 0.01, 7, "#3c6a8c", 0.95, 0.23, 0.5));
  return g;
}
function cottage(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(2.45, 1.05, 1.4, C.plaster, 0, 0.52, -0.05));
  for (const x of [-1.2, 0, 1.2]) g.add(box(0.08, 1.05, 0.06, C.woodDk, x, 0.52, 0.67));
  g.add(box(2.45, 0.08, 0.06, C.woodDk, 0, 1.02, 0.67));
  g.add(gableX(2.95, 1.9, 1.05, C.thatch, 1.05));
  g.add(box(0.32, 0.9, 0.32, C.stoneDk, 0.75, 1.75, -0.3));
  g.add(box(0.36, 0.08, 0.36, C.stone, 0.75, 2.2, -0.3));
  g.add(box(0.44, 0.78, 0.06, C.wood, 0, 0.39, 0.66));
  g.add(box(0.05, 0.05, 0.03, C.gold, 0.14, 0.4, 0.7));
  for (const x of [-0.72, 0.72]) {
    g.add(box(0.42, 0.36, 0.05, C.lamp, x, 0.62, 0.66, { emissive: "#6a4a10" }));
    g.add(box(0.46, 0.04, 0.06, C.woodDk, x, 0.62, 0.69));
    g.add(box(0.04, 0.4, 0.06, C.woodDk, x, 0.62, 0.69));
    g.add(box(0.5, 0.1, 0.14, C.wood, x, 0.4, 0.72));
    ["#c75b7a", "#e0c040", "#c75b7a", "#efe6d0"].forEach((c, i) => g.add(box(0.07, 0.07, 0.07, c, x - 0.17 + i * 0.11, 0.48, 0.72)));
  }
  return g;
}
function tavern(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(1.7, 1.0, 1.5, C.cream, 0, 0.5, -0.05));
  g.add(box(1.92, 0.95, 1.72, C.plaster, 0, 1.47, -0.05));
  g.add(box(1.96, 0.08, 1.76, C.woodDk, 0, 1.0, -0.05));
  for (const x of [-0.85, -0.28, 0.28, 0.85]) g.add(box(0.07, 1.0, 0.04, C.woodDk, x, 0.5, 0.71));
  for (const x of [-0.95, 0, 0.95]) g.add(box(0.07, 0.95, 0.04, C.woodDk, x, 1.47, 0.82));
  const brace = box(0.06, 0.9, 0.03, C.woodDk, -0.48, 1.47, 0.83);
  brace.rotation.z = 0.7;
  g.add(brace);
  g.add(gable(2.1, 1.95, 0.85, C.tile, 1.94, -0.05));
  g.add(box(0.28, 0.6, 0.28, C.stoneDk, -0.55, 2.55, -0.4));
  g.add(box(0.46, 0.8, 0.06, C.woodDk, 0, 0.4, 0.71));
  for (const x of [-0.6, 0.6]) g.add(box(0.3, 0.3, 0.05, C.lamp, x, 0.6, 0.71, { emissive: "#6a4a10" }));
  for (const x of [-0.5, 0.5]) g.add(box(0.36, 0.36, 0.05, C.lamp, x, 1.5, 0.82, { emissive: "#6a4a10" }));
  // hanging sign
  g.add(box(0.05, 0.05, 0.5, C.woodDk, 0.9, 1.15, 0.95));
  const sign = new THREE.Group();
  sign.add(box(0.05, 0.36, 0.4, C.woodLt, 0, 0, 0));
  sign.add(box(0.06, 0.16, 0.12, C.gold, 0, 0, 0));
  sign.position.set(0.9, 0.92, 1.05);
  g.add(sign);
  g.add(cyl(0.16, 0.16, 0.36, 8, C.wood, -0.7, 0.18, 0.95));
  return g;
}

export function makeStation(id: StationId): THREE.Group {
  switch (id) {
    case "wealth": return goldMine();
    case "mind": return standingStone();
    case "business": return marketStall();
    case "learning": return library();
    case "health": return trainingYard();
    case "relationship": return cottage();
    case "tavern": return tavern();
  }
}

/** Where chimney smoke comes from, in station-local coordinates. */
export const CHIMNEYS: Partial<Record<StationId, [number, number, number]>> = {
  relationship: [0.75, 2.3, -0.3],
  tavern: [-0.55, 2.9, -0.4],
};
