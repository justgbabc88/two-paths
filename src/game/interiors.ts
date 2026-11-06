// Building interiors: a small furnished room per station, entered through its door.
// Local units: 1 = one tile. Floor at y=0, back wall at z=0, open front at z=d
// (the camera looks in from the front, like a doll's house with the front wall off).
import * as THREE from "three";
import { mat, roughen, hash } from "./models";
import type { StationId } from "./map";

export interface Room {
  group: THREE.Group;
  name: string;
  w: number;
  d: number;
  /** Where you stand to work, and which way you face (0 = toward the camera). */
  spot: { x: number; z: number; face: number; label: string };
  door: { x: number; z: number };
  /** Per-frame animation: fires flicker, screens glow, haze drifts. */
  update(t: number): void;
}

type Look = { tier: number; neglect: number; vice: number };

// ---------- primitives ----------
function box(w: number, h: number, d: number, c: string, x: number, y: number, z: number, o: { emissive?: string; opacity?: number } = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c, o));
  m.position.set(x, y + h / 2, z);
  return m;
}
function cyl(rt: number, rb: number, h: number, seg: number, c: string, x: number, y: number, z: number, o: { emissive?: string; opacity?: number } = {}) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(c, o));
  m.position.set(x, y + h / 2, z);
  return m;
}
function ball(r: number, c: string, x: number, y: number, z: number, o: { emissive?: string; opacity?: number } = {}) {
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), mat(c, o));
  m.position.set(x, y, z);
  return m;
}
const grp = (...o: THREE.Object3D[]) => {
  const g = new THREE.Group();
  o.forEach((x) => g.add(x));
  return g;
};
const place = <O extends THREE.Object3D>(o: O, x: number, z: number, ry = 0): O => {
  o.position.x += x;
  o.position.z += z;
  o.rotation.y = ry;
  return o;
};

// ---------- the shell: floor, three walls, door frame ----------
interface Shell { floor: string; floor2: string; wall: string; trim: string; stone?: boolean; rock?: boolean; w?: number; d?: number; h?: number }
function shell(g: THREE.Group, s: Shell) {
  const w = s.w ?? 7,
    d = s.d ?? 5.5,
    h = s.h ?? 2.5;
  // floor boards / flagstones in two tones
  const floor = new THREE.Group();
  floor.userData.floor = true;
  const step = s.stone || s.rock ? 1 : 0.5;
  for (let x = 0; x < w; x += step)
    for (let z = 0; z < d; z += s.stone || s.rock ? 1 : d) {
      const len = s.stone || s.rock ? 1 : d;
      const c = hash(x * 3.1, z * 7.7) > 0.5 ? s.floor : s.floor2;
      const t = box(step - 0.02, 0.08, len - 0.02, c, x + step / 2, -0.08, z + len / 2);
      if (s.rock) (t as THREE.Mesh<THREE.BufferGeometry>).geometry = roughen(t.geometry, 0.05, x * 13 + z);
      floor.add(t);
    }
  g.add(floor);
  // walls
  const wallMat = s.wall;
  if (s.rock) {
    // a rough cave: lumpy rock all round
    for (let i = 0; i < 18; i++) {
      const r = new THREE.Mesh(roughen(new THREE.IcosahedronGeometry(0.9 + hash(i, 2) * 0.5, 1), 0.35, i), mat(hash(i, 5) > 0.5 ? s.wall : s.trim));
      if (i < 8) r.position.set((i / 7) * w, 0.8 + hash(i, 3) * 0.8, -0.4);
      else if (i < 13) r.position.set(-0.4, 0.8 + hash(i, 3) * 0.8, ((i - 8) / 4) * d);
      else r.position.set(w + 0.4, 0.8 + hash(i, 3) * 0.8, ((i - 13) / 4) * d);
      r.scale.y = 1.4;
      g.add(r);
    }
  } else {
    g.add(box(w, h, 0.18, wallMat, w / 2, 0, -0.09));
    g.add(box(0.18, h, d, wallMat, -0.09, 0, d / 2));
    g.add(box(0.18, h, d, wallMat, w + 0.09, 0, d / 2));
    // skirting and a top beam
    g.add(box(w, 0.12, 0.05, s.trim, w / 2, 0, 0.02));
    g.add(box(w + 0.36, 0.18, 0.3, s.trim, w / 2, h, -0.05));
    g.add(box(0.3, 0.18, d, s.trim, -0.05, h, d / 2));
    g.add(box(0.3, 0.18, d, s.trim, w + 0.05, h, d / 2));
    // corner posts
    [0, w].forEach((x) => g.add(box(0.22, h + 0.1, 0.22, s.trim, x, 0, 0)));
    // low front wall stubs so the room reads as a cut-away
    g.add(box(w / 2 - 0.7, 0.35, 0.16, wallMat, (w / 2 - 0.7) / 2, 0, d));
    g.add(box(w / 2 - 0.7, 0.35, 0.16, wallMat, w - (w / 2 - 0.7) / 2, 0, d));
  }
  // the door: frame posts and a mat; clicking it leaves
  // (the front is cut away, so the doorway is just two short posts and a mat)
  const door = grp(box(0.16, 0.5, 0.2, s.trim, -0.66, 0, 0), box(0.16, 0.5, 0.2, s.trim, 0.66, 0, 0), box(1.1, 0.03, 0.6, "#7a3a2a", 0, 0, -0.3), box(0.8, 0.035, 0.4, "#a85a3a", 0, 0, -0.3));
  door.position.set(w / 2, 0, d);
  door.userData.door = true;
  g.add(door);
  return { w, d, h };
}

function windowOn(g: THREE.Group, x: number, y: number, z: number, side: "back" | "left" | "right", glow = "#cfe6ff") {
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.7), mat(glow, { emissive: glow }));
  const frame = box(0.95, 0.85, 0.06, "#4a3220", 0, -0.425, 0);
  const cross = grp(box(0.06, 0.7, 0.07, "#4a3220", 0, -0.35, 0.01), box(0.8, 0.06, 0.07, "#4a3220", 0, -0.03, 0.01));
  const w = grp(frame, pane, cross);
  pane.position.z = 0.035;
  w.position.set(x, y, z);
  if (side === "left") w.rotation.y = Math.PI / 2;
  if (side === "right") w.rotation.y = -Math.PI / 2;
  g.add(w);
}
function lamp(g: THREE.Group, x: number, y: number, z: number, c = "#ffcf70") {
  g.add(cyl(0.01, 0.01, 2.5 - y, 3, "#2a2018", x, y + 0.25, z));
  g.add(cyl(0.08, 0.14, 0.22, 6, "#3a2a1a", x, y, z));
  g.add(ball(0.09, c, x, y + 0.02, z, { emissive: c }));
}
function rug(g: THREE.Group, x: number, z: number, w: number, d: number, c: string, c2: string) {
  g.add(box(w, 0.02, d, c, x, 0, z));
  g.add(box(w - 0.3, 0.025, d - 0.3, c2, x, 0, z));
  g.add(box(w - 0.6, 0.03, d - 0.6, c, x, 0, z));
}
function table(x: number, z: number, w: number, d: number, c = "#7a5232", h = 0.72) {
  const t = grp(box(w, 0.08, d, c, 0, h - 0.08, 0));
  [-1, 1].forEach((sx) => [-1, 1].forEach((sz) => t.add(box(0.08, h - 0.08, 0.08, c, sx * (w / 2 - 0.08), 0, sz * (d / 2 - 0.08)))));
  return place(t, x, z);
}
function chair(x: number, z: number, ry: number, c = "#6b4626") {
  const ch = grp(box(0.42, 0.06, 0.42, c, 0, 0.42, 0), box(0.42, 0.5, 0.06, c, 0, 0.45, -0.18));
  [-1, 1].forEach((sx) => [-1, 1].forEach((sz) => ch.add(box(0.05, 0.42, 0.05, c, sx * 0.17, 0, sz * 0.17))));
  return place(ch, x, z, ry);
}
function shelf(x: number, z: number, w: number, h: number, ry: number, fill: (s: THREE.Group, y: number, w: number) => void, c = "#5a3a20") {
  const s = grp(box(w, h, 0.36, c, 0, 0, 0));
  const back = box(w - 0.1, h - 0.1, 0.05, "#3a2614", 0, 0.05, -0.12);
  s.add(back);
  for (let y = 0.1; y < h - 0.2; y += 0.5) {
    s.add(box(w - 0.06, 0.04, 0.34, c, 0, y, 0.02));
    fill(s, y + 0.04, w - 0.14);
  }
  // hollow out the front so the shelves show
  s.children[0].scale.set(1, 1, 0.15);
  s.children[0].position.z = -0.16;
  [-1, 1].forEach((sx) => s.add(box(0.06, h, 0.36, c, sx * (w / 2 - 0.03), 0, 0)));
  return place(s, x, z, ry);
}
const BOOKS = ["#8a2a22", "#2a4a7a", "#3d6a3a", "#a8842a", "#5a3a7a", "#7a5a3a", "#2a2a2a", "#a85a2a"];
const books = (s: THREE.Group, y: number, w: number, seed = 1) => {
  let x = -w / 2;
  let i = 0;
  while (x < w / 2 - 0.08) {
    const bw = 0.06 + hash(i, seed + y) * 0.06,
      bh = 0.3 + hash(i + 3, seed + y) * 0.12;
    if (hash(i, y * 9) > 0.08) s.add(box(bw - 0.01, bh, 0.24, BOOKS[Math.floor(hash(i, seed * 3 + y) * BOOKS.length)], x + bw / 2, y, 0.02));
    x += bw;
    i++;
  }
};
function barrel(x: number, z: number, s = 1) {
  const b = grp(cyl(0.28 * s, 0.28 * s, 0.7 * s, 10, "#7a5232", 0, 0, 0));
  [0.1, 0.55].forEach((y) => b.add(cyl(0.29 * s, 0.29 * s, 0.05, 10, "#3a3530", 0, y * s, 0)));
  return place(b, x, z);
}
function crate(x: number, z: number, s = 0.5, ry = 0) {
  const c = grp(box(s, s, s, "#9a7442", 0, 0, 0), box(s + 0.02, 0.05, s + 0.02, "#6b4a2a", 0, s * 0.45, 0));
  return place(c, x, z, ry);
}
function plant(x: number, z: number) {
  const p = grp(cyl(0.14, 0.1, 0.26, 7, "#9a5a3a", 0, 0, 0));
  for (let i = 0; i < 5; i++) {
    const l = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.5, 4), mat(i % 2 ? "#4a7a3a" : "#3d6a32"));
    l.position.set(Math.cos(i * 1.3) * 0.07, 0.5, Math.sin(i * 1.3) * 0.07);
    l.rotation.set(Math.sin(i) * 0.5, 0, Math.cos(i * 1.3) * 0.5);
    p.add(l);
  }
  return place(p, x, z);
}
function picture(g: THREE.Group, x: number, y: number, c: string, w = 0.6, h = 0.45) {
  g.add(box(w + 0.08, h + 0.08, 0.04, "#6b4a2a", x, y, 0.02));
  g.add(box(w, h, 0.05, c, x, y + 0.04, 0.03));
}
function cobwebs(g: THREE.Group, w: number, n: number) {
  for (let i = 0; i < n; i++) {
    const web = new THREE.Mesh(new THREE.CircleGeometry(0.35, 3), mat("#d8d8d0", { opacity: 0.35 }));
    web.position.set(i % 2 ? w - 0.2 : 0.2, 2.3, 0.2);
    web.rotation.set(0.6, i % 2 ? -0.8 : 0.8, 0.4);
    g.add(web);
  }
}
function dust(g: THREE.Group, w: number, d: number, n: number) {
  for (let i = 0; i < n; i++) g.add(box(0.3 + hash(i, 1) * 0.4, 0.01, 0.2 + hash(i, 2) * 0.3, "#8a8070", 0.5 + hash(i, 3) * (w - 1), 0, 0.5 + hash(i, 4) * (d - 1)));
}
function fireplace(g: THREE.Group, x: number, flames: THREE.Mesh[]) {
  g.add(box(1.5, 1.2, 0.5, "#7a7268", x, 0, 0.25));
  g.add(box(1.7, 0.14, 0.62, "#5a3a20", x, 1.2, 0.28));
  g.add(box(0.9, 0.7, 0.3, "#1a1410", x, 0, 0.42));
  g.add(box(0.7, 1.3, 0.4, "#7a7268", x, 1.3, 0.2));
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.12 - i * 0.02, 0.4 - i * 0.05, 5), mat(i === 1 ? "#ffd04a" : "#ff7a2a", { emissive: i === 1 ? "#ffb02a" : "#e0501a" }));
    f.position.set(x + (i - 1) * 0.18, 0.2, 0.55);
    flames.push(f);
    g.add(f);
  }
  g.add(box(0.6, 0.08, 0.12, "#4a2a14", x, 0.02, 0.55));
}
function haze(g: THREE.Group, w: number, d: number, n: number, out: THREE.Mesh[], c = "#c8d4c0") {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5 + hash(i, 1) * 0.5, 1), mat(c, { opacity: 0.16 }));
    m.position.set(0.5 + hash(i, 2) * (w - 1), 1.2 + hash(i, 3) * 1.0, 0.5 + hash(i, 4) * (d - 1.5));
    m.userData.base = m.position.clone();
    out.push(m);
    g.add(m);
  }
}

// ---------- the rooms ----------
function tradingHouse(L: Look): Omit<Room, "group"> & { group: THREE.Group } {
  const g = new THREE.Group();
  const { w, d } = shell(g, { floor: "#8a6440", floor2: "#7a5636", wall: "#c8b48a", trim: "#5a3a20" });
  windowOn(g, 1.6, 2.0, 0.02, "back");
  windowOn(g, 5.4, 2.0, 0.02, "back");
  // a desk with a ledger, scales and a lamp; the work spot is in front of it
  const desk = table(3.5, 1.5, 1.8, 0.8, "#6b4626");
  desk.add(box(0.5, 0.04, 0.36, "#e8dcc0", -0.3, 0.72, 0)); // ledger
  desk.add(cyl(0.02, 0.02, 0.25, 4, "#2a2a2a", 0.5, 0.72, 0.1));
  desk.add(box(0.36, 0.22, 0.02, "#2a3a4a", 0.35, 0.74, -0.15, { emissive: "#1a3a5a" })); // a little screen
  desk.userData.spot = true;
  g.add(desk);
  g.add(chair(3.5, 0.8, 0));
  // shelves of goods, sacks and crates
  g.add(shelf(0.5, 2.3, 1.2, 1.9, Math.PI / 2, (s, y, w) => [-0.4, 0, 0.4].forEach((x, i) => w > 0.8 && s.add(box(0.3, 0.26, 0.26, ["#9a7442", "#c9a84a", "#7a5232"][i], x, y, 0)))));
  g.add(shelf(6.5, 2.3, 1.2, 1.9, -Math.PI / 2, (s, y) => books(s, y, 1.0, 4)));
  [[0.6, 4.6], [1.1, 4.8], [0.8, 4.0]].forEach(([x, z], i) => g.add(crate(x, z, 0.45 + i * 0.05, i)));
  g.add(cyl(0.22, 0.26, 0.5, 7, "#c9b48a", 6.3, 0, 4.5));
  g.add(cyl(0.22, 0.26, 0.45, 7, "#b9a47a", 6.4, 0, 3.9));
  // a map on the wall and a strongbox
  picture(g, 3.5, 1.35, "#d9c89a", 1.4, 0.8);
  g.add(box(0.6, 0.45, 0.4, "#4a3a2a", 5.6, 0, 0.4));
  g.add(box(0.62, 0.05, 0.42, "#c9a84a", 5.6, 0.45, 0.4));
  if (L.tier >= 2) rug(g, 3.5, 3.0, 3, 1.8, "#7a2a22", "#b0802a");
  if (L.tier >= 3) g.add(plant(1.2, 0.5), plant(5.9, 1.4));
  lamp(g, 3.5, 2.0, 2.5);
  return { group: g, name: "Trading house", w, d, spot: { x: 3.5, z: 2.4, face: 0.25, label: "Work at the desk" }, door: { x: w / 2, z: d }, update: () => {} };
}

function libraryRoom(L: Look) {
  const g = new THREE.Group();
  const { w, d } = shell(g, { floor: "#7a5636", floor2: "#6b4a2e", wall: "#a89a7a", trim: "#4a3220" });
  // floor-to-ceiling shelves
  [1.0, 2.6, 4.4, 6.0].forEach((x, i) => g.add(shelf(x, 0.25, 1.4, 2.3, 0, (s, y, w) => books(s, y, w, i + 1))));
  g.add(shelf(0.3, 2.6, 1.6, 2.2, Math.PI / 2, (s, y, w) => books(s, y, w, 7)));
  g.add(shelf(6.7, 2.6, 1.6, 2.2, -Math.PI / 2, (s, y, w) => books(s, y, w, 9)));
  // reading table with an open book and a candle
  const t = table(3.5, 2.2, 1.6, 0.9, "#5a3a20");
  t.add(box(0.42, 0.03, 0.3, "#f2e8d0", -0.2, 0.72, 0.05));
  t.add(cyl(0.04, 0.04, 0.16, 6, "#f2e8d0", 0.5, 0.72, -0.2));
  t.add(ball(0.035, "#ffd04a", 0.5, 0.92, -0.2, { emissive: "#ffb02a" }));
  t.add(box(0.3, 0.12, 0.22, "#2a4a7a", 0.2, 0.72, 0.2));
  t.userData.spot = true;
  g.add(t);
  g.add(chair(2.8, 2.2, Math.PI / 2), chair(4.2, 2.2, -Math.PI / 2));
  // armchair and a globe
  const arm = grp(box(0.8, 0.4, 0.7, "#7a2a22", 0, 0, 0), box(0.8, 0.6, 0.18, "#7a2a22", 0, 0.4, -0.26), box(0.16, 0.25, 0.7, "#6a2018", -0.36, 0.4, 0), box(0.16, 0.25, 0.7, "#6a2018", 0.36, 0.4, 0));
  g.add(place(arm, 1.2, 4.2, 0.5));
  const globe = grp(cyl(0.04, 0.16, 0.6, 6, "#5a3a20", 0, 0, 0), ball(0.24, "#4a7aa0", 0, 0.85, 0), ball(0.12, "#5a8a4a", 0.12, 0.92, 0.12));
  g.add(place(globe, 5.9, 4.2));
  rug(g, 3.5, 3.2, 3.4, 2.2, "#2a4a3a", "#8a6a2a");
  if (L.tier >= 3) {
    const scope = grp(cyl(0.02, 0.02, 0.9, 4, "#3a3a3a", 0, 0, 0), cyl(0.06, 0.09, 0.8, 8, "#b08a3a", 0, 0.9, 0));
    scope.children[1].rotation.x = 0.8;
    g.add(place(scope, 5.8, 3.0));
  }
  lamp(g, 2.2, 2.0, 2.5);
  lamp(g, 4.8, 2.0, 2.5);
  if (L.neglect >= 2) cobwebs(g, w, 2), dust(g, w, d, 6);
  return { group: g, name: "Library", w, d, spot: { x: 3.5, z: 3.0, face: 0.2, label: "Study at the table" }, door: { x: w / 2, z: d }, update: () => {} };
}

function cottageRoom(L: Look) {
  const g = new THREE.Group();
  const flames: THREE.Mesh[] = [];
  const { w, d } = shell(g, { floor: "#8a6440", floor2: "#7a5636", wall: "#e0d0b0", trim: "#6b4626" });
  fireplace(g, 1.6, flames);
  windowOn(g, 4.4, 2.0, 0.02, "back", "#ffe6b0");
  // dinner table for two
  const t = table(4.4, 2.4, 1.4, 0.9, "#7a5232");
  [-0.35, 0.35].forEach((x) => t.add(cyl(0.15, 0.15, 0.02, 10, "#e8e0d0", x, 0.72, 0)));
  t.add(cyl(0.05, 0.06, 0.18, 6, "#8a3a4a", 0, 0.72, 0));
  t.add(ball(0.08, "#d04a5a", 0, 0.95, 0));
  t.userData.spot = true;
  g.add(t);
  g.add(chair(3.6, 2.4, Math.PI / 2), chair(5.2, 2.4, -Math.PI / 2));
  // bed in the corner, a sofa by the fire, family pictures
  const bed = grp(box(1.2, 0.4, 1.9, "#6b4626", 0, 0, 0), box(1.1, 0.14, 1.8, "#e8e0d0", 0, 0.4, 0), box(1.1, 0.12, 1.1, "#5a7aa0", 0, 0.48, 0.35), box(0.9, 0.14, 0.32, "#f2ece0", 0, 0.52, -0.66), box(1.2, 0.8, 0.1, "#6b4626", 0, 0, -0.95));
  g.add(place(bed, 6.2, 1.4));
  const sofa = grp(box(1.4, 0.4, 0.6, "#7a5a8a", 0, 0, 0), box(1.4, 0.45, 0.16, "#6a4a7a", 0, 0.4, -0.22));
  g.add(place(sofa, 1.6, 2.2, 0));
  rug(g, 1.6, 1.6, 2, 1.2, "#8a3a2a", "#c9a84a");
  picture(g, 3.3, 1.6, "#8ab0d0", 0.45, 0.35);
  picture(g, 5.6, 1.7, "#d0a08a", 0.35, 0.45);
  g.add(plant(0.5, 4.6));
  if (L.tier >= 2) g.add(plant(6.6, 4.6));
  if (L.tier >= 3) {
    // a cradle
    g.add(place(grp(box(0.7, 0.35, 0.45, "#c9a87a", 0, 0.12, 0), box(0.6, 0.06, 0.38, "#e8e0f0", 0, 0.42, 0)), 6.0, 3.6));
  }
  lamp(g, 4.4, 2.0, 2.4);
  if (L.neglect >= 2) cobwebs(g, w, 2), dust(g, w, d, 5);
  const update = (t: number) => flames.forEach((f, i) => (f.scale.y = 0.8 + 0.3 * Math.sin(t * 9 + i * 2)));
  return { group: g, name: "Home", w, d, spot: { x: 4.4, z: 3.3, face: 0.3, label: "Spend time at home" }, door: { x: w / 2, z: d }, update };
}

function gymRoom(L: Look) {
  const g = new THREE.Group();
  const { w, d } = shell(g, { floor: "#6a6258", floor2: "#5e564c", wall: "#b0a088", trim: "#4a3a2a", stone: true });
  // mats, a weight rack, a bench with a bar, a hanging bag, a mirror
  rug(g, 3.5, 2.8, 3.0, 2.2, "#3a4a5a", "#2a3a4a");
  const rack = grp(box(1.6, 0.06, 0.4, "#3a3a3a", 0, 0.5, 0), box(1.6, 0.06, 0.4, "#3a3a3a", 0, 1.0, 0), box(0.06, 1.1, 0.4, "#3a3a3a", -0.78, 0, 0), box(0.06, 1.1, 0.4, "#3a3a3a", 0.78, 0, 0));
  for (let i = 0; i < 5; i++) {
    const s = 0.08 + i * 0.015;
    [0.56, 1.06].forEach((y) => rack.add(grp(cyl(s, s, 0.08, 8, "#2a2a2a", -0.6 + i * 0.3, y, -0.08), cyl(s, s, 0.08, 8, "#2a2a2a", -0.6 + i * 0.3, y, 0.08))));
  }
  g.add(place(rack, 1.5, 0.4));
  const bench = grp(box(0.4, 0.42, 1.3, "#2a2a2a", 0, 0, 0), box(0.42, 0.1, 1.3, "#8a2a22", 0, 0.42, 0), box(0.06, 1.1, 0.06, "#3a3a3a", -0.55, 0, -0.5), box(0.06, 1.1, 0.06, "#3a3a3a", 0.55, 0, -0.5));
  const bar = cyl(0.025, 0.025, 1.8, 6, "#9a9a9a", 0, 1.05, -0.5);
  bar.rotation.z = Math.PI / 2;
  bar.position.y = 1.07;
  bench.add(bar, cyl(0.22, 0.22, 0.08, 10, "#2a2a2a", -0.75, 0.85, -0.5), cyl(0.22, 0.22, 0.08, 10, "#2a2a2a", 0.75, 0.85, -0.5));
  bench.children.slice(-2).forEach((p) => (p.rotation.z = Math.PI / 2));
  bench.userData.spot = true;
  g.add(place(bench, 4.2, 1.6));
  const bag = grp(cyl(0.01, 0.01, 0.7, 3, "#2a2a2a", 0, 1.75, 0), cyl(0.22, 0.22, 1.0, 10, "#8a2a22", 0, 0.75, 0));
  const bagPivot = place(bag, 6.0, 3.0);
  g.add(bagPivot);
  g.add(box(1.4, 1.6, 0.05, "#a8c0d0", 6.85, 0.5, 2.2, { emissive: "#2a3a44" }));
  g.children[g.children.length - 1].rotation.y = -Math.PI / 2;
  // kettlebells and a water jug
  [[0.7, 3.6], [1.0, 3.8]].forEach(([x, z]) => g.add(grp(ball(0.14, "#2a2a2a", x, 0.14, z), cyl(0.06, 0.06, 0.02, 6, "#2a2a2a", x, 0.3, z))));
  g.add(cyl(0.12, 0.12, 0.4, 8, "#7ab0d0", 0.6, 0, 4.6, { opacity: 0.7 }));
  windowOn(g, 3.5, 2.1, 0.02, "back");
  if (L.tier >= 2) {
    // a climbing rope
    g.add(cyl(0.03, 0.03, 2.3, 5, "#c9a87a", 2.6, 0.2, 0.6));
  }
  if (L.neglect >= 2) cobwebs(g, w, 2), dust(g, w, d, 6);
  lamp(g, 3.5, 2.0, 2.5, "#fff0c0");
  const update = (t: number) => (bagPivot.rotation.z = Math.sin(t * 1.3) * 0.03);
  return { group: g, name: "Training hall", w, d, spot: { x: 3.3, z: 3.0, face: 0.2, label: "Train here" }, door: { x: w / 2, z: d }, update };
}

function mineRoom(L: Look) {
  const g = new THREE.Group();
  const glints: THREE.Mesh[] = [];
  const { w, d } = shell(g, { floor: "#6a5a48", floor2: "#5e4e3e", wall: "#6a5a4a", trim: "#4e4236", rock: true });
  // timber supports
  [1.2, 5.8].forEach((x) => {
    g.add(box(0.2, 2.4, 0.2, "#6b4a2a", x, 0, 0.6), box(0.2, 2.4, 0.2, "#6b4a2a", x, 0, 3.4));
    g.add(box(0.24, 0.2, 3.1, "#5a3a20", x, 2.3, 2.0));
  });
  // rails and a cart full of ore
  for (let z = 0.3; z < d; z += 0.45) g.add(box(1.2, 0.05, 0.12, "#5a3a20", 3.5, 0, z));
  [-0.4, 0.4].forEach((x) => g.add(box(0.05, 0.06, d, "#7a7a7a", 3.5 + x, 0.05, d / 2)));
  const cart = grp(box(0.9, 0.5, 1.1, "#5a5048", 0, 0.18, 0));
  [-0.42, 0.42].forEach((x) => [-0.35, 0.35].forEach((z) => {
    const wh = cyl(0.12, 0.12, 0.06, 8, "#2a2a2a", x, 0.06, z);
    wh.rotation.z = Math.PI / 2;
    cart.add(wh);
  }));
  for (let i = 0; i < 6; i++) cart.add(ball(0.14, i % 2 ? "#d4a52a" : "#c9952a", -0.25 + (i % 3) * 0.25, 0.72, -0.2 + Math.floor(i / 3) * 0.35, { emissive: "#3a2a00" }));
  g.add(place(cart, 3.5, 1.4));
  // gold veins glinting in the rock
  for (let i = 0; i < 12 + L.tier * 4; i++) {
    const n = ball(0.06 + hash(i, 8) * 0.05, "#ffd04a", 0.3 + hash(i, 1) * (w - 0.6), 0.6 + hash(i, 2) * 1.6, hash(i, 3) > 0.5 ? 0.15 : 0.1, { emissive: "#b08000" });
    if (i % 3 === 1) n.position.set(0.15, n.position.y, 0.6 + hash(i, 4) * 3.5);
    if (i % 3 === 2) n.position.set(w - 0.15, n.position.y, 0.6 + hash(i, 4) * 3.5);
    glints.push(n);
    g.add(n);
  }
  // the rock face you work: a big seam at the back
  const face = grp(new THREE.Mesh(roughen(new THREE.IcosahedronGeometry(0.8, 1), 0.3, 4), mat("#5a4a3a")));
  face.children[0].position.y = 0.7;
  for (let i = 0; i < 7; i++) face.add(ball(0.09, "#ffd04a", -0.4 + hash(i, 6) * 0.8, 0.4 + hash(i, 7) * 0.8, 0.55 + hash(i, 9) * 0.15, { emissive: "#b08000" }));
  face.userData.spot = true;
  g.add(place(face, 5.6, 1.4));
  g.add(place(grp(box(0.06, 0.9, 0.06, "#6b4a2a", 0, 0, 0), box(0.4, 0.08, 0.08, "#8a8a8a", 0, 0.85, 0)), 6.2, 2.4, 0.4)); // a pickaxe leaning
  [[1.2, 0.8], [5.8, 3.2]].forEach(([x, z]) => lamp(g, x, 1.6, z, "#ffb050"));
  [[1.0, 4.4], [1.5, 4.7]].forEach(([x, z]) => g.add(crate(x, z, 0.45)));
  const update = (t: number) => glints.forEach((n, i) => ((n.material as THREE.MeshLambertMaterial).emissive.setRGB(0.55 + 0.25 * Math.sin(t * 2 + i), 0.4 + 0.18 * Math.sin(t * 2 + i), 0)));
  // each glint material is shared; clone them so they can flicker independently
  glints.forEach((n) => (n.material = (n.material as THREE.Material).clone()));
  return { group: g, name: "Gold mine", w, d, spot: { x: 5.0, z: 2.5, face: Math.PI * 0.8, label: "Mine the seam" }, door: { x: w / 2, z: d }, update };
}

function tavernRoom(L: Look) {
  const g = new THREE.Group();
  const flames: THREE.Mesh[] = [];
  const { w, d } = shell(g, { floor: "#6b4a2e", floor2: "#5e4028", wall: "#8a6a48", trim: "#3a2614" });
  // the bar with taps and a back shelf of bottles
  const bar = grp(box(3.2, 1.0, 0.6, "#5a3a20", 0, 0, 0), box(3.3, 0.08, 0.7, "#3a2614", 0, 1.0, 0));
  [-0.6, 0, 0.6].forEach((x) => bar.add(cyl(0.03, 0.03, 0.3, 5, "#c9a84a", x, 1.08, -0.15)));
  [-1.1, 0.9].forEach((x) => bar.add(cyl(0.07, 0.06, 0.18, 7, "#e8d8a0", x, 1.08, 0.15, { opacity: 0.85 })));
  bar.userData.spot = true;
  g.add(place(bar, 2.4, 1.6));
  g.add(shelf(2.4, 0.25, 2.6, 1.6, 0, (s, y, ww) => {
    for (let x = -ww / 2 + 0.1; x < ww / 2; x += 0.22) s.add(cyl(0.05, 0.05, 0.28, 6, ["#3a6a3a", "#6a3a2a", "#c9a84a", "#2a2a3a"][Math.floor(hash(x * 9, y) * 4)], x, y, 0));
  }));
  [1.4, 2.4, 3.4].forEach((x) => g.add(grp(cyl(0.18, 0.18, 0.06, 8, "#6b4626", x, 0.6, 2.3), cyl(0.04, 0.04, 0.6, 5, "#3a2614", x, 0, 2.3))));
  // tables with mugs
  const t1 = table(5.5, 3.6, 1.0, 1.0, "#6b4626");
  t1.add(cyl(0.07, 0.06, 0.16, 7, "#9a7442", 0.2, 0.72, 0), cyl(0.07, 0.06, 0.16, 7, "#9a7442", -0.2, 0.72, 0.15));
  g.add(t1, chair(4.8, 3.6, Math.PI / 2), chair(6.2, 3.6, -Math.PI / 2));
  g.add(barrel(6.4, 0.6), barrel(5.8, 0.5, 0.9), barrel(6.5, 1.3, 0.85));
  fireplace(g, 4.9, flames);
  g.add(cyl(0.22, 0.22, 0.03, 12, "#e8e0c8", 0.1, 1.5, 3.2)); // dartboard
  g.children[g.children.length - 1].rotation.z = Math.PI / 2;
  // empties pile up the more you've been here this week
  for (let i = 0; i < L.vice * 3; i++) g.add(cyl(0.05, 0.05, 0.26, 6, "#3a6a3a", 1 + hash(i, 1) * 5, 0, 3 + hash(i, 2) * 1.8));
  lamp(g, 2.4, 2.0, 2.0, "#ffb050");
  const update = (t: number) => flames.forEach((f, i) => (f.scale.y = 0.8 + 0.3 * Math.sin(t * 9 + i * 2)));
  return { group: g, name: "Tavern", w, d, spot: { x: 2.4, z: 2.5, face: 0.3, label: "Order at the bar" }, door: { x: w / 2, z: d }, update };
}

function shackRoom(L: Look) {
  const g = new THREE.Group();
  const puffs: THREE.Mesh[] = [];
  const { w, d } = shell(g, { floor: "#6a5a40", floor2: "#5e5038", wall: "#7a6a4a", trim: "#4a3a24", w: 6, d: 5 });
  // beanbags, a low table, a lava lamp, a tapestry, curtains
  const low = table(3.0, 2.2, 1.2, 0.7, "#5a3a20", 0.4);
  low.add(cyl(0.08, 0.1, 0.25, 7, "#7a9a8a", 0.25, 0.4, 0, { opacity: 0.6 }));
  low.add(box(0.2, 0.02, 0.12, "#e8e0c8", -0.2, 0.4, 0.1));
  low.userData.spot = true;
  g.add(low);
  [[1.6, 2.4, "#6a3a8a"], [4.4, 2.0, "#3a7a5a"], [3.0, 3.6, "#a85a2a"]].forEach(([x, z, c]) => {
    const b = ball(0.45, c as string, x as number, 0.3, z as number);
    b.scale.y = 0.6;
    g.add(b);
  });
  const lava = grp(cyl(0.1, 0.14, 0.12, 6, "#2a2a2a", 0, 0, 0), cyl(0.07, 0.11, 0.42, 8, "#ff5a8a", 0, 0.12, 0, { emissive: "#a02a5a", opacity: 0.85 }));
  g.add(place(lava, 0.6, 0.6));
  g.add(box(2.4, 1.4, 0.04, "#5a2a6a", 3.0, 0.7, 0.03), box(2.0, 1.0, 0.05, "#2a7a6a", 3.0, 0.9, 0.04));
  g.add(ball(0.3, "#e0c040", 3.0, 1.4, 0.08, { emissive: "#6a5a10" }));
  [[0.04, 1.6], [w - 0.04, 1.6]].forEach(([x, z]) => g.add(box(0.05, 1.8, 1.2, "#6a2a2a", x, 0.4, z)));
  for (let i = 0; i < 2 + L.vice; i++) g.add(box(0.3, 0.05, 0.3, ["#c84a2a", "#e0c040", "#3a6a9a"][i % 3], 0.8 + hash(i, 1) * 4.4, 0, 3.6 + hash(i, 2) * 1));
  g.add(plant(5.4, 0.6));
  haze(g, w, d, 7 + L.vice * 3, puffs);
  lamp(g, 3.0, 1.9, 2.0, "#ff9a5a");
  const update = (t: number) =>
    puffs.forEach((p, i) => {
      const b = p.userData.base as THREE.Vector3;
      p.position.set(b.x + Math.sin(t * 0.3 + i) * 0.3, b.y + Math.sin(t * 0.5 + i * 2) * 0.12, b.z + Math.cos(t * 0.25 + i) * 0.2);
    });
  return { group: g, name: "Smoke shack", w, d, spot: { x: 3.0, z: 2.9, face: 0.2, label: "Sit by the table" }, door: { x: w / 2, z: d }, update };
}

function sweetsRoom(L: Look) {
  const g = new THREE.Group();
  const { w, d } = shell(g, { floor: "#e8d8d0", floor2: "#c8a0a8", wall: "#f0c8d0", trim: "#c84a6a", stone: true, w: 6, d: 5 });
  // striped wallpaper
  for (let x = 0.25; x < w; x += 0.5) g.add(box(0.2, 2.4, 0.02, "#fff0f2", x, 0, 0.01));
  // the counter of jars and cakes
  const counter = grp(box(3.4, 0.9, 0.7, "#e8e0d8", 0, 0, 0), box(3.5, 0.06, 0.8, "#c84a6a", 0, 0.9, 0));
  const JAR = ["#ff6a8a", "#ffd04a", "#6ad0ff", "#8aff6a", "#c86aff"];
  JAR.forEach((c, i) => {
    const x = -1.4 + i * 0.55;
    counter.add(cyl(0.16, 0.16, 0.42, 10, "#e8f4ff", x, 0.96, -0.1, { opacity: 0.35 }));
    for (let k = 0; k < 6; k++) counter.add(ball(0.05, c, x - 0.07 + (k % 3) * 0.07, 1.02 + Math.floor(k / 3) * 0.08, -0.1 + ((k % 2) - 0.5) * 0.08, { emissive: "#201010" }));
  });
  counter.add(cyl(0.28, 0.28, 0.2, 12, "#f2ece0", 1.3, 0.96, 0.15), cyl(0.27, 0.27, 0.06, 12, "#ff6a8a", 1.3, 1.16, 0.15));
  counter.userData.spot = true;
  g.add(place(counter, 3.0, 1.4));
  g.add(shelf(3.0, 0.25, 3.6, 1.6, 0, (s, y, ww) => {
    for (let x = -ww / 2 + 0.15; x < ww / 2; x += 0.3) s.add(box(0.22, 0.2, 0.18, JAR[Math.floor(hash(x * 5, y * 3) * JAR.length)], x, y, 0));
  }, "#e8e0d8"));
  // a lollipop display and a little table
  const pop = grp(cyl(0.02, 0.02, 1.2, 4, "#f2f2f2", 0, 0, 0), cyl(0.2, 0.2, 0.05, 12, "#ff6a8a", 0, 1.3, 0));
  pop.children[1].rotation.x = Math.PI / 2;
  g.add(place(pop, 0.6, 3.8));
  g.add(table(4.8, 3.6, 0.8, 0.8, "#f2ece0"), chair(4.2, 3.6, Math.PI / 2, "#c84a6a"));
  for (let i = 0; i < L.vice * 2; i++) g.add(box(0.14, 0.01, 0.1, JAR[i % 5], 1 + hash(i, 3) * 4, 0, 3 + hash(i, 4) * 1.5));
  lamp(g, 3.0, 1.9, 2.2, "#fff0e0");
  return { group: g, name: "Sweet shop", w, d, spot: { x: 3.0, z: 2.4, face: 0.25, label: "Order at the counter" }, door: { x: w / 2, z: d }, update: () => {} };
}

function denRoom(L: Look) {
  const g = new THREE.Group();
  const { w, d } = shell(g, { floor: "#4a4048", floor2: "#423840", wall: "#3a3448", trim: "#2a2430", w: 6, d: 5 });
  // a big glowing screen, a sofa, a coffee table with snacks, drawn curtains
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.15), new THREE.MeshBasicMaterial({ color: "#5aa0ff" }));
  screen.position.set(3.0, 1.35, 0.09);
  g.add(box(2.15, 1.3, 0.08, "#121218", 3.0, 0.7, 0.03), screen);
  g.add(box(1.8, 0.45, 0.4, "#2a2430", 3.0, 0, 0.3));
  g.add(box(0.3, 0.06, 0.2, "#3a3a44", 2.6, 0.45, 0.3), box(0.1, 0.06, 0.06, "#8a8a9a", 3.4, 0.45, 0.35));
  const sofa = grp(box(2.2, 0.45, 0.8, "#5a4a6a", 0, 0, 0), box(2.2, 0.55, 0.2, "#4a3a5a", 0, 0.42, 0.32), box(0.2, 0.35, 0.8, "#4a3a5a", -1.0, 0.42, 0), box(0.2, 0.35, 0.8, "#4a3a5a", 1.0, 0.42, 0));
  sofa.userData.spot = true;
  g.add(place(sofa, 3.0, 3.5));
  const ct = table(3.0, 2.3, 1.0, 0.5, "#3a2a24", 0.4);
  ct.add(box(0.45, 0.04, 0.45, "#c8a06a", -0.2, 0.4, 0)); // pizza box
  ct.add(cyl(0.04, 0.04, 0.12, 6, "#c82a2a", 0.3, 0.4, 0.05));
  g.add(ct);
  [[0.04, 1.8], [w - 0.04, 1.8]].forEach(([x, z]) => g.add(box(0.06, 2.1, 1.6, "#2a1e2e", x, 0.2, z)));
  // the clutter grows with how much you've been in here
  for (let i = 0; i < 2 + L.vice * 3; i++) g.add(box(0.12 + hash(i, 1) * 0.2, 0.04, 0.12 + hash(i, 2) * 0.2, ["#c8a06a", "#c82a2a", "#e8e0d0", "#3a6a9a"][i % 4], 0.6 + hash(i, 3) * 4.8, 0, 1.2 + hash(i, 4) * 3.4));
  const glow = new THREE.PointLight("#5aa0ff", 6, 6, 1.5);
  glow.position.set(3.0, 1.3, 1.0);
  g.add(glow);
  const update = (t: number) => {
    const k = 0.75 + 0.25 * Math.sin(t * 7) * Math.sin(t * 2.3);
    (screen.material as THREE.MeshBasicMaterial).color.setRGB(0.3 * k, 0.55 * k + 0.1 * Math.sin(t * 3), 1.0 * k);
    glow.intensity = 4 + 3 * k;
  };
  return { group: g, name: "The den", w, d, spot: { x: 3.0, z: 3.0, face: Math.PI, label: "Sink into the sofa" }, door: { x: w / 2, z: d }, update };
}

function pawnRoom(L: Look) {
  const g = new THREE.Group();
  const { w, d } = shell(g, { floor: "#5a4a3a", floor2: "#4e4032", wall: "#6a5a3a", trim: "#3a2a1a", w: 6, d: 5 });
  // glass counter of watches and rings, guitars and clocks on the walls, a safe
  const counter = grp(box(3.0, 0.9, 0.7, "#3a2a1a", 0, 0, 0), box(3.0, 0.3, 0.7, "#c8e0f0", 0, 0.9, 0, { opacity: 0.3 }));
  for (let i = 0; i < 9; i++) counter.add(ball(0.05, i % 3 ? "#d4a52a" : "#c0c8d0", -1.2 + i * 0.3, 0.98, (hash(i, 2) - 0.5) * 0.3, { emissive: "#3a2a00" }));
  counter.userData.spot = true;
  g.add(place(counter, 3.0, 1.5));
  [1.0, 1.8].forEach((x, i) => {
    const gt = grp(ball(0.22, i ? "#8a2a22" : "#c9952a", 0, 0.9, 0), box(0.06, 0.7, 0.04, "#3a2614", 0, 1.1, 0));
    gt.children[0].scale.z = 0.3;
    g.add(place(gt, x, 0.1));
  });
  [4.2, 4.8, 5.4].forEach((x, i) => g.add(cyl(0.16, 0.16, 0.04, 10, ["#e8e0c8", "#d4a52a", "#c0c8d0"][i], x, 1.7 - i * 0.1, 0.05)));
  g.children.slice(-3).forEach((c) => (c.rotation.x = Math.PI / 2));
  g.add(box(0.8, 0.9, 0.7, "#3a3a3a", 5.3, 0, 3.8), cyl(0.12, 0.12, 0.04, 8, "#c0c0c0", 5.3, 0.45, 4.17));
  g.children[g.children.length - 1].rotation.x = Math.PI / 2;
  // the three brass balls inside the window, and a SALE board
  [-0.2, 0.2, 0].forEach((x, i) => g.add(ball(0.12, "#d4a52a", 3 + x, 2.1 - (i === 2 ? 0.3 : 0), 0.15, { emissive: "#3a2a00" })));
  g.add(box(1.0, 0.4, 0.04, "#c82a2a", 0.05, 1.5, 3.0));
  g.children[g.children.length - 1].rotation.y = Math.PI / 2;
  // shopping bags pile up with recent splurges
  for (let i = 0; i < L.vice * 2; i++) g.add(box(0.3, 0.35, 0.15, ["#c84a6a", "#3a6a9a", "#e0c040"][i % 3], 0.6 + hash(i, 5) * 1.6, 0, 3.4 + hash(i, 6) * 1.2));
  lamp(g, 3.0, 1.9, 2.0, "#ffd890");
  return { group: g, name: "Pawnbroker", w, d, spot: { x: 3.0, z: 2.4, face: 0.25, label: "Browse the counter" }, door: { x: w / 2, z: d }, update: () => {} };
}

const BUILDERS: Partial<Record<StationId, (l: Look) => Omit<Room, "group"> & { group: THREE.Group }>> = {
  business: tradingHouse,
  learning: libraryRoom,
  relationship: cottageRoom,
  health: gymRoom,
  wealth: mineRoom,
  tavern: tavernRoom,
  shack: shackRoom,
  sweets: sweetsRoom,
  den: denRoom,
  pawn: pawnRoom,
};
export const hasInterior = (id: StationId) => !!BUILDERS[id];

export function buildInterior(id: StationId, look: Look): Room | null {
  const b = BUILDERS[id];
  if (!b) return null;
  const r = b(look);
  // warm light from above, plus a soft fill so nothing is pitch black
  const key = new THREE.PointLight(id === "den" ? "#8a90c0" : id === "wealth" ? "#ffb060" : "#ffe0b0", id === "den" ? 3 : 9, 10, 1.2);
  key.position.set(r.w / 2, 2.3, r.d / 2);
  r.group.add(key);
  return r as Room;
}

export function disposeRoom(r: Room) {
  r.group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
  });
}
