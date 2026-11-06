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

// ---------------- characters ----------------
// Smooth-shaded, rounded low-poly figures. The player and every wanderer use
// the same rig with a different Look.
export interface Look {
  skin: string;
  top: string; // tunic / shirt
  bottom: string; // trousers
  hair: string;
  boots?: string;
  hairStyle?: "short" | "long" | "bun" | "bald";
  hat?: { kind: "brim" | "hood" | "cap" | "scarf"; color: string };
  beard?: string;
  robe?: string; // long robe instead of trousers
  apron?: string;
  belt?: string;
  staff?: boolean;
  satchel?: string;
  scale?: number;
  trim?: string; // collar and hem trim
  cape?: string;
  circlet?: boolean;
  tired?: boolean; // shadows under the eyes
}
export const PLAYER_LOOK: Look = { skin: "#c99a72", top: "#3c5a8c", bottom: "#3a3328", hair: "#4a2e18", belt: "#3a2614" };

const smooth = new Map<string, THREE.Material>();
function sm(color: string): THREE.Material {
  let m = smooth.get(color);
  if (!m) {
    // flat-shaded low-segment parts: chunky facets, between boxy and round
    m = new THREE.MeshLambertMaterial({ color, flatShading: true });
    smooth.set(color, m);
  }
  return m;
}
function part(geo: THREE.BufferGeometry, color: string, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, sm(color));
  m.position.set(x, y, z);
  return m;
}

export interface CharacterRig {
  root: THREE.Group;
  body: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  head: THREE.Group;
  /** Held or placed props, all hidden until an action shows them. */
  props: Record<PropId, THREE.Object3D>;
}
export type PropId = "pick" | "mug" | "joint" | "phone" | "treat" | "laptop" | "ledger" | "quill" | "dumbL" | "dumbR" | "book" | "bedroll" | "coinbag" | "dice" | "pan" | "glass";

export function makeCharacter(look: Look = PLAYER_LOOK): CharacterRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const boots = look.boots ?? "#2b2119";

  const leg = (x: number) => {
    const g = new THREE.Group();
    g.position.set(x, 0.5, 0);
    g.add(part(new THREE.CapsuleGeometry(0.075, 0.3, 1, 4).rotateY(Math.PI / 4), look.bottom, 0, -0.2, 0));
    g.add(part(new THREE.CapsuleGeometry(0.078, 0.07, 1, 4).rotateY(Math.PI / 4).rotateX(Math.PI / 2), boots, 0, -0.43, 0.035));
    body.add(g);
    return g;
  };
  const legL = leg(-0.085),
    legR = leg(0.085);

  // torso: tapered, rounded at the shoulders
  body.add(part(new THREE.CylinderGeometry(0.175, 0.155, 0.4, 6), look.top, 0, 0.7, 0));
  body.add(part(new THREE.SphereGeometry(0.175, 6, 2, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.45, 0.85), look.top, 0, 0.9, 0));
  body.children.slice(-2).forEach((m) => m.scale.set(1, 1, 0.78)); // flatten front-to-back
  if (look.robe) {
    body.add(part(new THREE.CylinderGeometry(0.16, 0.26, 0.5, 6), look.robe, 0, 0.3, 0));
  }
  if (look.apron) body.add(part(new THREE.CylinderGeometry(0.15, 0.2, 0.42, 6, 1, true, -0.9, 1.8), look.apron, 0, 0.45, 0.005));
  if (look.belt) {
    const b = part(new THREE.TorusGeometry(0.155, 0.022, 3, 8).rotateX(Math.PI / 2), look.belt, 0, 0.53, 0);
    b.scale.set(1, 1, 0.8);
    body.add(b);
  }
  if (look.satchel) {
    body.add(part(new THREE.BoxGeometry(0.16, 0.14, 0.07), look.satchel, -0.2, 0.55, 0.06));
    const strap = part(new THREE.TorusGeometry(0.2, 0.012, 3, 8, Math.PI), look.satchel, -0.05, 0.75, 0);
    strap.rotation.set(0, Math.PI / 2, -0.6);
    body.add(strap);
  }

  const arm = (x: number) => {
    const g = new THREE.Group();
    g.position.set(x, 0.86, 0);
    g.add(part(new THREE.CapsuleGeometry(0.063, 0.3, 1, 4).rotateY(Math.PI / 4), look.top, 0, -0.17, 0));
    g.add(part(new THREE.SphereGeometry(0.063, 4, 2), look.skin, 0, -0.39, 0));
    body.add(g);
    return g;
  };
  const armL = arm(-0.225),
    armR = arm(0.225);

  // head
  const head = new THREE.Group();
  head.position.set(0, 1.08, 0);
  body.add(head);
  body.add(part(new THREE.CylinderGeometry(0.05, 0.06, 0.08, 5), look.skin, 0, 0.95, 0));
  head.add(part(new THREE.SphereGeometry(0.148, 6, 4).scale(0.95, 1.05, 0.98), look.skin));
  head.add(part(new THREE.SphereGeometry(0.03, 4, 3), look.skin, 0, -0.01, 0.13)); // nose
  for (const x of [-0.05, 0.05]) head.add(part(new THREE.SphereGeometry(0.017, 6, 4), "#1a1410", x, 0.025, 0.118));
  for (const x of [-0.135, 0.135]) head.add(part(new THREE.SphereGeometry(0.03, 6, 4).scale(0.6, 1, 1), look.skin, x, 0, 0));
  const style = look.hairStyle ?? "short";
  if (style !== "bald") {
    head.add(part(new THREE.SphereGeometry(0.158, 6, 2, 0, Math.PI * 2, 0, Math.PI * 0.55), look.hair, 0, 0.012, -0.012));
    head.add(part(new THREE.SphereGeometry(0.152, 5, 2, Math.PI * 0.15, Math.PI * 0.7, Math.PI * 0.35, Math.PI * 0.45).rotateY(Math.PI), look.hair, 0, 0.0, -0.01));
  }
  if (style === "long") head.add(part(new THREE.CapsuleGeometry(0.12, 0.18, 1, 4).scale(1.05, 1, 0.55), look.hair, 0, -0.14, -0.07));
  if (style === "bun") head.add(part(new THREE.SphereGeometry(0.075, 4, 2), look.hair, 0, 0.1, -0.13));
  if (look.tired) for (const x of [-0.05, 0.05]) head.add(part(new THREE.SphereGeometry(0.022, 6, 4).scale(1, 0.45, 0.4), "#7a5a52", x, 0.0, 0.112));
  if (look.circlet) head.add(part(new THREE.TorusGeometry(0.142, 0.012, 3, 8).rotateX(Math.PI / 2), "#d4a52a", 0, 0.06, 0));
  if (look.trim) {
    body.add(part(new THREE.TorusGeometry(0.1, 0.018, 3, 8).rotateX(Math.PI / 2), look.trim, 0, 0.93, 0));
    const hem = part(new THREE.TorusGeometry(0.152, 0.016, 3, 8).rotateX(Math.PI / 2), look.trim, 0, 0.51, 0);
    hem.scale.set(1, 1, 0.8);
    body.add(hem);
  }
  if (look.cape) {
    const cape = part(new THREE.CylinderGeometry(0.2, 0.3, 0.72, 6, 1, true, Math.PI * 0.6, Math.PI * 0.8), look.cape, 0, 0.56, -0.02);
    cape.scale.set(1, 1, 0.75);
    body.add(cape);
  }
  if (look.beard) head.add(part(new THREE.SphereGeometry(0.12, 5, 2, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55).scale(1, 1.25, 0.9), look.beard, 0, -0.02, 0.035));
  if (look.hat) {
    const c = look.hat.color;
    if (look.hat.kind === "brim") {
      head.add(part(new THREE.CylinderGeometry(0.25, 0.25, 0.025, 6), c, 0, 0.1, 0));
      head.add(part(new THREE.CylinderGeometry(0.11, 0.14, 0.14, 6), c, 0, 0.18, 0));
    } else if (look.hat.kind === "hood") {
      head.add(part(new THREE.SphereGeometry(0.176, 8, 4, Math.PI * 0.85, Math.PI * 1.3) /* opening faces +z (the face) */.scale(1, 1.1, 1.05), c, 0, 0.01, -0.01));
    } else if (look.hat.kind === "cap") {
      head.add(part(new THREE.SphereGeometry(0.157, 6, 2, 0, Math.PI * 2, 0, Math.PI * 0.45), c, 0, 0.03, 0));
      head.add(part(new THREE.CylinderGeometry(0.1, 0.1, 0.015, 6, 1, false, -Math.PI / 2, Math.PI), c, 0, 0.05, 0.11));
    } else {
      head.add(part(new THREE.SphereGeometry(0.157, 6, 3, 0, Math.PI * 2, 0, Math.PI * 0.6), c, 0, 0.015, -0.005));
    }
  }

  // ---- props (hidden until an action uses them) ----
  const props = {} as Record<PropId, THREE.Object3D>;
  const hold = (id: PropId, g: THREE.Object3D, parent: THREE.Object3D) => {
    g.visible = false;
    parent.add(g);
    props[id] = g;
    return g;
  };
  const grp = (...ms: THREE.Object3D[]) => {
    const g = new THREE.Group();
    ms.forEach((m) => g.add(m));
    return g;
  };
  // right hand
  const pick = grp(part(new THREE.CylinderGeometry(0.018, 0.022, 0.55, 6), "#7a5533", 0, 0.18, 0), part(new THREE.CapsuleGeometry(0.03, 0.3, 2, 6).rotateZ(Math.PI / 2), "#8d939a", 0, 0.45, 0));
  pick.position.set(0, -0.4, 0.04);
  pick.rotation.x = Math.PI / 2;
  hold("pick", pick, armR);
  const mug = grp(part(new THREE.CylinderGeometry(0.065, 0.06, 0.15, 10), "#8a6036"), part(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 10), "#efe6cc", 0, 0.075, 0), part(new THREE.TorusGeometry(0.04, 0.012, 4, 8, Math.PI), "#6b4626", 0.065, 0, 0).rotateZ(-Math.PI / 2));
  mug.position.set(0, -0.44, 0.06);
  hold("mug", mug, armR);
  const joint = grp(part(new THREE.CylinderGeometry(0.012, 0.016, 0.12, 6).rotateZ(Math.PI / 2), "#f2ede0"), part(new THREE.SphereGeometry(0.016, 6, 4), "#ff7a2a", 0.065, 0, 0));
  joint.position.set(0, -0.44, 0.04);
  hold("joint", joint, armR);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.065, 0.12), new THREE.MeshBasicMaterial({ color: "#8fb8ff" }));
  screen.position.z = 0.009;
  const phone = grp(part(new THREE.BoxGeometry(0.08, 0.14, 0.015), "#1c1c22"), screen);
  phone.position.set(0, -0.46, 0.07);
  phone.rotation.x = -1.1;
  hold("phone", phone, armR);
  const treat = grp(part(new THREE.TorusGeometry(0.05, 0.026, 6, 10), "#d95f8f"));
  treat.position.set(0, -0.46, 0.06);
  hold("treat", treat, armR);
  const quill = grp(part(new THREE.CylinderGeometry(0.006, 0.01, 0.16, 5), "#2a2a2a", 0, 0.03, 0), part(new THREE.ConeGeometry(0.03, 0.12, 4).scale(0.3, 1, 1), "#f2ede0", 0, 0.12, 0));
  quill.position.set(0, -0.46, 0.04);
  quill.rotation.x = 0.6;
  hold("quill", quill, armR);
  const dumb = () => grp(part(new THREE.CylinderGeometry(0.015, 0.015, 0.22, 6).rotateZ(Math.PI / 2), "#9aa0a6"), part(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 8).rotateZ(Math.PI / 2), "#2c2e31", -0.1, 0, 0), part(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 8).rotateZ(Math.PI / 2), "#2c2e31", 0.1, 0, 0));
  const dR = dumb();
  dR.position.set(0, -0.42, 0.02);
  hold("dumbR", dR, armR);
  const dice = grp(part(new THREE.BoxGeometry(0.05, 0.05, 0.05), "#f4f0e6", -0.02, 0, 0), part(new THREE.BoxGeometry(0.05, 0.05, 0.05), "#c8432f", 0.035, 0.02, 0.01));
  dice.position.set(0, -0.45, 0.04);
  hold("dice", dice, armR);
  const pan = grp(part(new THREE.CylinderGeometry(0.11, 0.09, 0.04, 8), "#2c2e31", 0, 0, 0.13), part(new THREE.BoxGeometry(0.03, 0.02, 0.16), "#5a3a20", 0, 0, 0.0), part(new THREE.SphereGeometry(0.06, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), "#d9a050", 0, 0.01, 0.13));
  pan.position.set(0, -0.44, 0.04);
  pan.rotation.x = -1.4;
  hold("pan", pan, armR);
  const glass = grp(part(new THREE.CylinderGeometry(0.045, 0.04, 0.13, 8), "#bcd8e8"), part(new THREE.CylinderGeometry(0.04, 0.036, 0.1, 8), "#5a9ad0", 0, -0.01, 0));
  glass.position.set(0, -0.45, 0.05);
  hold("glass", glass, armR);
  // left hand
  const dL = dumb();
  dL.position.set(0, -0.42, 0.02);
  hold("dumbL", dL, armL);
  const ledger = grp(part(new THREE.BoxGeometry(0.2, 0.02, 0.15), "#6b2a1e"), part(new THREE.BoxGeometry(0.18, 0.01, 0.13), "#f2ead6", 0, 0.015, 0));
  ledger.position.set(0.05, -0.43, 0.08);
  ledger.rotation.x = 1.2;
  hold("ledger", ledger, armL);
  const bag = grp(part(new THREE.SphereGeometry(0.07, 8, 6).scale(1, 1.1, 1), "#8a6a3a"), part(new THREE.CylinderGeometry(0.025, 0.04, 0.04, 6), "#6b4a2a", 0, 0.08, 0));
  bag.position.set(0, -0.48, 0.03);
  hold("coinbag", bag, armL);
  // on the body / ground
  const lap = new THREE.Group();
  lap.add(part(new THREE.BoxGeometry(0.3, 0.015, 0.2), "#3a3d44"));
  const lid = part(new THREE.BoxGeometry(0.3, 0.2, 0.012), "#3a3d44", 0, 0.1, -0.1);
  lid.rotation.x = -0.25;
  lap.add(lid);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.16), new THREE.MeshBasicMaterial({ color: "#cfe0ff" }));
  glow.position.set(0, 0.1, -0.092);
  glow.rotation.x = -0.25;
  lap.add(glow);
  lap.position.set(0, 0.62, 0.3);
  hold("laptop", lap, body);
  const bk = new THREE.Group();
  for (const s of [-1, 1]) {
    const pg = part(new THREE.BoxGeometry(0.12, 0.16, 0.012), "#f2ead6", s * 0.06, 0, 0);
    pg.rotation.y = -s * 0.35;
    bk.add(pg);
    const cv = part(new THREE.BoxGeometry(0.125, 0.165, 0.008), "#36508a", s * 0.062, 0, -0.01);
    cv.rotation.y = -s * 0.35;
    bk.add(cv);
  }
  bk.position.set(0, 0.8, 0.26);
  bk.rotation.x = -0.5;
  hold("book", bk, body);
  const bed = grp(part(new THREE.BoxGeometry(0.55, 0.06, 1.3), "#6a7a8a", 0, 0.03, -0.45), part(new THREE.BoxGeometry(0.36, 0.08, 0.2), "#e8e0cc", 0, 0.07, -0.98));
  hold("bedroll", bed, root);

  if (look.staff) {
    const st = part(new THREE.CylinderGeometry(0.02, 0.025, 1.3, 6), "#6b4a2a", 0, -0.2, 0.05);
    armL.add(st);
    armL.add(part(new THREE.SphereGeometry(0.045, 8, 6), "#8a6a40", 0, 0.45, 0.05));
  }

  // blob shadow
  const sh = new THREE.Mesh(new THREE.CircleGeometry(0.26, 16), new THREE.MeshBasicMaterial({ color: "#000", transparent: true, opacity: 0.28, depthWrite: false }));
  sh.rotation.x = -Math.PI / 2;
  sh.position.y = 0.02;
  root.add(sh);
  if (look.scale) body.scale.setScalar(look.scale);
  return { root, body, legL, legR, armL, armR, head, props };
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

function smokeShack(): THREE.Group {
  const g = new THREE.Group();
  // crooked plank walls, lean-to roof, a haze-stained window
  const walls = box(1.5, 1.0, 1.3, "#6e5a40", 0, 0.5, -0.1);
  walls.rotation.z = 0.03;
  g.add(walls);
  for (let i = 0; i < 6; i++) g.add(box(0.03, 0.95, 0.02, "#4a3a28", -0.65 + i * 0.26, 0.5, 0.56));
  const roof = box(1.8, 0.08, 1.7, "#4c4a3e", 0, 1.12, -0.05);
  roof.rotation.x = -0.18;
  roof.rotation.z = 0.05;
  g.add(roof);
  g.add(box(0.4, 0.72, 0.05, "#2e2418", -0.3, 0.36, 0.57));
  g.add(box(0.36, 0.3, 0.05, "#8fa07a", 0.4, 0.62, 0.57, { emissive: "#2a3a1a" }));
  g.add(box(0.3, 0.05, 0.3, "#5d5a54", 0.65, 0.04, 0.85)); // ashtray stone
  g.add(cyl(0.18, 0.18, 0.3, 8, "#6b4a2a", -0.62, 0.15, 0.8)); // stool
  const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 5), mat("#5e8a3a"));
  leaf.position.set(0.0, 1.0, 0.6);
  leaf.rotation.x = 0.4;
  g.add(leaf);
  return g;
}
function sweetStall(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(1.7, 0.5, 0.5, "#e8d8c0", 0, 0.25, 0.12));
  for (const x of [-0.85, 0.85]) for (const z of [-0.3, 0.36]) g.add(box(0.07, 1.4, 0.07, "#c76a8a", x, 0.7, z));
  for (let i = 0; i < 7; i++) {
    const s = box(0.27, 0.04, 0.95, i % 2 ? "#f4e7f0" : "#d95f8f", -0.81 + i * 0.27, 1.36, 0.05);
    s.rotation.x = 0.32;
    g.add(s);
  }
  const donut = new THREE.TorusGeometry(0.07, 0.035, 6, 10);
  ["#d95f8f", "#7a4a2a", "#f2d24a", "#9ad0e8"].forEach((c, i) => {
    const d = new THREE.Mesh(donut, mat(c));
    d.rotation.x = -Math.PI / 2;
    d.position.set(-0.6 + i * 0.22, 0.56, 0.15);
    g.add(d);
  });
  g.add(cyl(0.12, 0.1, 0.18, 8, "#f4f0e6", 0.55, 0.6, 0.12));
  const swirl = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 0), mat("#f6c6d8"));
  swirl.position.set(0.55, 0.75, 0.12);
  g.add(swirl);
  return g;
}
function den(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(1.6, 1.05, 1.4, "#55505a", 0, 0.52, -0.05));
  g.add(gableX(1.9, 1.75, 0.6, "#3b3644", 1.05));
  g.add(box(0.42, 0.75, 0.05, "#2a2630", 0, 0.38, 0.66));
  // drawn curtains with screen glow leaking through
  for (const x of [-0.5, 0.5]) {
    g.add(box(0.36, 0.34, 0.05, "#5a7ec8", x, 0.66, 0.66, { emissive: "#3a5aa8" }));
    g.add(box(0.12, 0.38, 0.06, "#6a3a4a", x - 0.12, 0.66, 0.68));
    g.add(box(0.12, 0.38, 0.06, "#6a3a4a", x + 0.12, 0.66, 0.68));
  }
  g.add(box(0.05, 0.5, 0.05, "#2a2630", 0.55, 1.6, -0.3)); // aerial
  g.add(box(0.4, 0.04, 0.04, "#2a2630", 0.55, 1.82, -0.3));
  return g;
}

function pawnbroker(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(1.6, 1.25, 1.4, "#5a4a3c", 0, 0.62, -0.05));
  for (const x of [-0.8, 0, 0.8]) g.add(box(0.07, 1.25, 0.05, "#2e241a", x, 0.62, 0.66));
  g.add(gableX(1.9, 1.7, 0.7, "#3a3430", 1.25));
  g.add(box(0.42, 0.8, 0.05, "#2e241a", -0.38, 0.4, 0.66));
  g.add(box(0.5, 0.42, 0.05, "#c9a24a", 0.4, 0.7, 0.66, { emissive: "#4a3410" }));
  for (let i = 0; i < 4; i++) g.add(box(0.08, 0.08, 0.04, ["#d4a52a", "#9aa0a6", "#8a2a22", "#3d6a8a"][i], 0.25 + (i % 2) * 0.2, 0.62 + Math.floor(i / 2) * 0.16, 0.69));
  // three brass balls on a bracket
  g.add(box(0.05, 0.05, 0.5, "#2e241a", 0.8, 1.3, 0.9));
  [[0.8, 1.12, 1.05], [0.7, 0.98, 1.05], [0.9, 0.98, 1.05]].forEach(([x, y, z]) => g.add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), mat("#d4a52a", { emissive: "#3a2a00" }))).children.at(-1)!.position.set(x, y, z));
  g.add(box(0.4, 0.32, 0.3, "#6b4626", -0.75, 0.16, 0.95));
  g.add(cyl(0.05, 0.05, 0.3, 8, "#c9a24a", -0.75, 0.47, 0.95));
  return g;
}
function gossipWell(): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(roughen(new THREE.CylinderGeometry(0.55, 0.6, 0.6, 8, 1, true).toNonIndexed(), 0.03, 71), mat("#7d7a72"))).children.at(-1)!.position.y = 0.3;
  g.add(new THREE.Mesh(new THREE.CircleGeometry(0.52, 8).rotateX(-Math.PI / 2), mat("#1d2a30"))).children.at(-1)!.position.y = 0.22;
  g.add(new THREE.Mesh(new THREE.TorusGeometry(0.57, 0.07, 4, 8).rotateX(Math.PI / 2), mat("#8a867c"))).children.at(-1)!.position.y = 0.6;
  for (const x of [-0.5, 0.5]) g.add(box(0.08, 1.0, 0.08, "#5a3a20", x, 1.0, 0));
  g.add(gableX(1.4, 0.8, 0.4, "#4a3a28", 1.45));
  g.add(cyl(0.04, 0.04, 1.05, 6, "#6b4626", 0, 1.3, 0)).children.at(-1)!.rotation.z = Math.PI / 2;
  g.add(cyl(0.11, 0.09, 0.16, 7, "#6b4626", 0.15, 0.95, 0));
  // benches where people talk
  for (const x of [-0.95, 0.95]) g.add(box(0.2, 0.25, 0.7, "#5a3a20", x, 0.13, 0.35));
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
    case "shack": return smokeShack();
    case "sweets": return sweetStall();
    case "den": return den();
    case "pawn": return pawnbroker();
    case "well": return gossipWell();
  }
}

/** Where chimney smoke comes from, in station-local coordinates. */
export const CHIMNEYS: Partial<Record<StationId, [number, number, number]>> = {
  relationship: [0.75, 2.3, -0.3],
  tavern: [-0.55, 2.9, -0.4],
  shack: [0.0, 1.0, 0.6],
};

// ---------------- living village ----------------
// Extras added on top of each station's base model as its skill climbs through
// the five bands. Cumulative: tier 3 also has tiers 1 and 2's additions.
function lantern(x: number, y: number, z: number) {
  const g = new THREE.Group();
  g.add(box(0.05, y, 0.05, "#3a2614", 0, y / 2, 0));
  g.add(box(0.12, 0.14, 0.12, "#f0c766", 0, y + 0.07, 0, { emissive: "#8a6010" }));
  g.add(box(0.15, 0.03, 0.15, "#3a2614", 0, y + 0.16, 0));
  g.position.set(x, 0, z);
  g.name = "light";
  return g;
}
function banner(x: number, z: number, color: string, h = 1.8) {
  const g = new THREE.Group();
  g.add(cyl(0.025, 0.03, h, 6, "#3a2614", 0, h / 2, 0));
  g.add(box(0.03, 0.4, 0.26, color, 0, h - 0.3, 0.14));
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), mat("#d4a52a"))).position.set(0, h + 0.02, 0);
  g.position.set(x, 0, z);
  return g;
}
function annex(w: number, d: number, h: number, wall: string, roof: string, x: number, z: number) {
  const g = new THREE.Group();
  g.add(box(w, h, d, wall, 0, h / 2, 0));
  g.add(gableX(w + 0.25, d + 0.2, h * 0.6, roof, h));
  g.add(box(0.3, 0.28, 0.04, "#f0c766", 0, h * 0.55, d / 2 + 0.01, { emissive: "#6a4a10" }));
  g.position.set(x, 0, z);
  return g;
}
function flowerBed(x: number, z: number, w: number) {
  const g = new THREE.Group();
  g.add(box(w, 0.08, 0.22, "#5a3a20", 0, 0.04, 0));
  const cols = ["#c75b7a", "#e0c040", "#efe6d0", "#9a7ad0"];
  for (let i = 0; i < Math.round(w * 8); i++) g.add(box(0.06, 0.06, 0.06, cols[i % 4], -w / 2 + 0.06 + i * 0.12, 0.12, (hash(i, w) - 0.5) * 0.12));
  g.position.set(x, 0, z);
  return g;
}

function upgrade(id: StationId, g: THREE.Group, tier: number) {
  const T = (n: number) => tier >= n;
  switch (id) {
    case "business":
      if (T(1)) { g.add(lantern(-1.0, 1.0, 0.45)); g.add(box(0.3, 0.3, 0.3, "#7a5533", 1.05, 0.15, 0.25)); g.add(box(0.26, 0.26, 0.26, "#8a6036", 1.05, 0.43, 0.25)); }
      if (T(2)) { g.add(cyl(0.16, 0.16, 0.42, 8, "#6b4626", -1.15, 0.21, -0.1)); g.add(cyl(0.16, 0.16, 0.42, 8, "#6b4626", -1.15, 0.21, 0.25)); }
      if (T(3)) g.add(annex(1.9, 0.9, 1.3, "#d8cba7", "#8a3a2a", 0, -0.95));
      if (T(4)) { g.add(annex(1.5, 0.7, 0.8, "#cbbd98", "#7a3324", 0, -0.95)).children.at(-1)!.position.y = 1.3; g.add(banner(-1.0, -0.6, "#d4a52a", 2.4)); g.add(banner(1.0, -0.6, "#d4a52a", 2.4)); }
      break;
    case "wealth":
      if (T(1)) { g.add(lantern(-0.6, 0.8, 1.0)); g.add(lantern(0.6, 0.8, 1.0)); }
      if (T(2)) {
        const pile = new THREE.Group();
        for (let i = 0; i < 9; i++) pile.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.08, 0), mat("#d4a52a", { emissive: "#3a2a00" }))).children.at(-1)!.position.set((hash(i, 1) - 0.5) * 0.4, 0.06 + (i % 3) * 0.06, (hash(i, 2) - 0.5) * 0.3);
        pile.position.set(-0.75, 0, 0.9);
        g.add(pile);
      }
      if (T(3)) {
        for (const x of [-0.5, 0.5]) { const leg = box(0.08, 1.9, 0.08, C.wood, x, 1.3, -0.3); leg.rotation.z = -x * 0.25; g.add(leg); }
        g.add(box(0.7, 0.08, 0.1, C.woodLt, 0, 2.2, -0.3));
        const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.035, 5, 12), mat("#5d5a54"));
        wheel.position.set(0, 2.2, -0.2);
        wheel.name = "spin";
        g.add(wheel);
      }
      if (T(4)) { const chest = new THREE.Group(); chest.add(box(0.4, 0.26, 0.28, "#6b2a1e", 0, 0.13, 0)); chest.add(box(0.42, 0.04, 0.3, "#d4a52a", 0, 0.27, 0)); chest.add(box(0.4, 0.08, 0.28, "#f3cd48", 0, 0.31, 0, { emissive: "#5a4000" })); chest.position.set(0.0, 0, 1.25); g.add(chest); g.add(banner(-0.95, -0.2, "#d4a52a", 2.2)); }
      break;
    case "relationship":
      if (T(1)) { g.add(flowerBed(-0.75, 0.95, 0.8)); g.add(flowerBed(0.75, 0.95, 0.8)); }
      if (T(2)) {
        for (let i = 0; i < 11; i++) g.add(box(0.05, 0.3, 0.04, "#efe6d0", -1.5 + i * 0.3, 0.15, 1.15));
        g.add(box(3.1, 0.04, 0.03, "#efe6d0", 0, 0.24, 1.15));
        g.add(box(0.6, 0.06, 0.2, C.wood, 1.25, 0.25, 0.75)); g.add(box(0.06, 0.25, 0.18, C.wood, 1.0, 0.12, 0.75)); g.add(box(0.06, 0.25, 0.18, C.wood, 1.5, 0.12, 0.75));
      }
      if (T(3)) g.add(annex(1.0, 1.1, 0.95, C.plaster, C.thatch, -1.85, -0.1));
      if (T(4)) {
        const tree = new THREE.Group();
        tree.add(cyl(0.08, 0.12, 1.4, 6, C.wood, 0, 0.7, 0));
        tree.add(new THREE.Mesh(roughen(new THREE.IcosahedronGeometry(0.65, 0).toNonIndexed(), 0.12, 31), mat("#4a7530"))).children.at(-1)!.position.set(0, 1.6, 0);
        tree.add(box(0.5, 0.03, 0.02, C.woodDk, 0.3, 1.15, 0));
        for (const x of [0.12, 0.48]) tree.add(box(0.01, 0.7, 0.01, "#d9cfb8", x, 0.8, 0));
        tree.add(box(0.4, 0.04, 0.15, C.wood, 0.3, 0.45, 0));
        tree.position.set(1.9, 0, 0.3);
        g.add(tree);
        for (let i = 0; i < 6; i++) g.add(new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), mat("#f0c766", { emissive: "#8a6010" }))).children.at(-1)!.position.set(-1.1 + i * 0.44, 1.05 - Math.sin((i / 5) * Math.PI) * 0.12, 0.75);
      }
      break;
    case "learning":
      if (T(1)) { g.add(lantern(-1.35, 1.0, 0.9)); g.add(lantern(1.35, 1.0, 0.9)); }
      if (T(2)) {
        const cart = new THREE.Group();
        cart.add(box(0.5, 0.3, 0.3, C.wood, 0, 0.3, 0));
        ["#8e3530", "#3d7048", "#36508a", "#a88a2e", "#6a4a8a"].forEach((c, i) => cart.add(box(0.07, 0.2, 0.2, c, -0.18 + i * 0.09, 0.55, 0)));
        cart.position.set(1.0, 0, 1.0);
        g.add(cart);
      }
      if (T(3)) { g.add(new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat("#b9a888"))).children.at(-1)!.position.set(0, 2.15, -0.1); const sc = cyl(0.05, 0.08, 0.6, 6, "#4a4c50", 0.2, 2.6, -0.1); sc.rotation.z = -0.8; g.add(sc); }
      if (T(4)) { const tw = new THREE.Group(); tw.add(cyl(0.38, 0.42, 2.6, 8, C.stone, 0, 1.3, 0)); tw.add(new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.8, 8), mat(C.slate))).children.at(-1)!.position.set(0, 3.0, 0); tw.position.set(-1.55, 0, -0.4); g.add(tw); g.add(banner(1.5, -0.5, "#36508a", 2.4)); }
      break;
    case "health":
      if (T(1)) for (let i = 0; i < 3; i++) g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 0), mat("#2c2e31"))).children.at(-1)!.position.set(0.6 + i * 0.25, 0.1, 0.6);
      if (T(2)) { g.add(box(0.07, 1.4, 0.07, C.wood, -1.2, 0.7, 0.55)); g.add(box(0.07, 1.4, 0.07, C.wood, -0.6, 0.7, 0.55)); g.add(cyl(0.025, 0.025, 0.7, 6, "#9aa0a6", -0.9, 1.35, 0.55)).children.at(-1)!.rotation.set(0, 0, Math.PI / 2); }
      if (T(3)) { for (const x of [-1.35, 1.35]) for (const z of [-0.85, 0.85]) g.add(box(0.08, 1.6, 0.08, C.woodDk, x, 0.8, z)); const roof = box(3.0, 0.08, 1.95, "#7a3324", 0, 1.65, 0); roof.rotation.x = 0.08; g.add(roof); }
      if (T(4)) { const st = new THREE.Group(); st.add(box(0.4, 0.4, 0.4, C.stoneLt, 0, 0.2, 0)); st.add(cyl(0.08, 0.1, 0.5, 8, "#d4a52a", 0, 0.65, 0)); st.add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), mat("#d4a52a", { emissive: "#3a2a00" }))).children.at(-1)!.position.set(0, 0.98, 0); st.add(box(0.5, 0.06, 0.06, "#d4a52a", 0, 0.82, 0)); st.position.set(1.15, 0, 0.6); g.add(st); }
      break;
    case "mind":
      if (T(1)) for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.add(new THREE.Mesh(natureGeo.rock, mat(C.stoneLt))).children.at(-1)!.position.set(Math.cos(a) * 1.0, 0.0, Math.sin(a) * 1.0 + 0.1); g.children.at(-1)!.scale.setScalar(0.35); }
      if (T(2)) { g.add(lantern(-0.9, 0.7, 0.8)); g.add(lantern(0.9, 0.7, 0.8)); g.add(flowerBed(0, 1.05, 0.9)); }
      if (T(3)) for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; const m = box(0.22, 0.9, 0.16, "#8a8c86", Math.cos(a) * 1.3, 0.45, Math.sin(a) * 1.0); m.rotation.y = -a; g.add(m); }
      if (T(4)) { const cr = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), new THREE.MeshLambertMaterial({ color: "#bfe3ff", emissive: "#4a7aa8", flatShading: true })); cr.position.set(0.04, 2.95, 0); cr.name = "spin"; g.add(cr); }
      break;
  }
}

/** Vice places swell with recent use (0-3). */
function viceExtras(id: StationId, g: THREE.Group, v: number) {
  if (v <= 0) return;
  switch (id) {
    case "tavern":
      for (let i = 0; i < v * 2; i++) g.add(cyl(0.13, 0.13, 0.3, 8, C.wood, 0.95 - (i % 3) * 0.3, 0.15 + Math.floor(i / 3) * 0.3, 1.05 + (i % 2) * 0.05));
      if (v >= 2) for (let i = 0; i < 5; i++) g.add(cyl(0.03, 0.035, 0.16, 6, "#3d6a3a", -0.9 + i * 0.12, 0.08, 1.0 + hash(i, 3) * 0.2)).children.at(-1)!.rotation.set(i % 2 ? 1.4 : 0, 0, 0);
      break;
    case "shack": {
      const haze = new THREE.Mesh(new THREE.SphereGeometry(0.9 + v * 0.35, 12, 8), new THREE.MeshLambertMaterial({ color: "#9fb08a", transparent: true, opacity: 0.12 + v * 0.06, depthWrite: false }));
      haze.position.set(0, 0.8, 0.1);
      haze.name = "haze";
      g.add(haze);
      break;
    }
    case "sweets":
      for (let i = 0; i < v * 6; i++) { const w = box(0.08, 0.01, 0.06, ["#d95f8f", "#f2d24a", "#9ad0e8", "#efe6d0"][i % 4], (hash(i, 7) - 0.5) * 2.2, 0.01, 0.4 + hash(i, 8) * 0.7); w.rotation.y = hash(i, 9) * 3; g.add(w); }
      break;
    case "den":
      g.add(new THREE.PointLight("#5a8aff", 1.2 + v * 1.2, 3.5)).children.at(-1)!.position.set(0, 0.8, 0.9);
      for (let i = 0; i < v * 3; i++) g.add(cyl(0.035, 0.035, 0.11, 6, ["#c8432f", "#3a6ac8", "#d9d4ca"][i % 3], (hash(i, 4) - 0.5) * 1.6, 0.05, 0.85 + hash(i, 5) * 0.3)).children.at(-1)!.rotation.set(Math.PI / 2, hash(i, 6) * 3, 0);
      break;
  }
}

/** Rust: darker, unlit, weeds around the base and a lean once it's been abandoned a while. */
function neglect(g: THREE.Group, n: number, w: number, d: number) {
  if (n <= 0) return;
  const k = 1 - n * 0.14;
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const src = m.material as THREE.MeshLambertMaterial;
    if (!src || !(src as THREE.MeshLambertMaterial).color) return;
    const nm = src.clone();
    nm.color = src.color.clone().multiplyScalar(k).lerp(new THREE.Color("#6a6a5a"), n * 0.12);
    if ((nm as THREE.MeshLambertMaterial).emissive && n >= 2) (nm as THREE.MeshLambertMaterial).emissive = new THREE.Color("#000");
    m.material = nm;
  });
  const weed = new THREE.ConeGeometry(0.07, 0.3, 4);
  for (let i = 0; i < n * 10; i++) {
    const side = i % 4,
      t = hash(i, n) - 0.5;
    const x = side < 2 ? t * w : (side === 2 ? -1 : 1) * (w / 2 + 0.1);
    const z = side >= 2 ? t * d : (side === 0 ? -1 : 1) * (d / 2 + 0.1);
    const m = new THREE.Mesh(weed, mat(i % 3 ? "#5a6a30" : "#6e6a3a"));
    m.position.set(x, 0.12, z);
    m.rotation.z = (hash(i, 2) - 0.5) * 0.6;
    m.scale.setScalar(0.8 + hash(i, 3) * 0.8);
    g.add(m);
  }
  if (n >= 3) {
    g.rotation.z = 0.035;
    for (let i = 0; i < 3; i++) { const p = box(0.5, 0.04, 0.1, "#4a3a28", (hash(i, 11) - 0.5) * w, 0.03, d / 2 + 0.25); p.rotation.y = hash(i, 12) * 2; g.add(p); }
  }
}

export interface StationAppearance { tier: number; neglect: number; vice: number }
/** A station as it should look right now (or in a projected future). */
export function buildStation(id: StationId, a: StationAppearance, w: number, d: number): THREE.Group {
  const g = makeStation(id);
  upgrade(id, g, a.tier);
  viceExtras(id, g, a.vice);
  neglect(g, a.neglect, w, d);
  return g;
}

/** The Fork: a stone arch whose two halves glow gold (keep going) and grey (let it slide). */
export function makeFork(): THREE.Group {
  const g = new THREE.Group();
  for (const x of [-0.85, 0.85]) {
    g.add(new THREE.Mesh(roughen(new THREE.BoxGeometry(0.32, 2.0, 0.4, 1, 4, 1).toNonIndexed(), 0.04, 41), mat("#8a867c"))).children.at(-1)!.position.set(x, 1.0, 0);
  }
  const arch = new THREE.Mesh(roughen(new THREE.TorusGeometry(0.85, 0.18, 6, 14, Math.PI).toNonIndexed(), 0.03, 42), mat("#8a867c"));
  arch.position.set(0, 2.0, 0);
  g.add(arch);
  g.add(box(2.2, 0.12, 0.6, "#6e6a62", 0, 0.06, 0));
  const half = (x: number, color: string) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 2.4), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
    m.position.set(x, 1.4, 0);
    m.name = "portal";
    return m;
  };
  g.add(half(-0.35, "#f2c860"));
  g.add(half(0.35, "#7d848a"));
  return g;
}

/** Dark rain cloud that follows the player after a heavy week. */
export function makeCloud(): THREE.Group {
  const g = new THREE.Group();
  [[0, 0, 0, 0.28], [0.25, -0.02, 0.05, 0.22], [-0.24, -0.03, -0.04, 0.2], [0.05, 0.12, -0.05, 0.2]].forEach(([x, y, z, r]) => {
    g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), new THREE.MeshLambertMaterial({ color: "#4a4e56", flatShading: true, transparent: true, opacity: 0.92 }))).children.at(-1)!.position.set(x, y, z);
  });
  for (let i = 0; i < 8; i++) {
    const drop = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.09, 0.012), new THREE.MeshBasicMaterial({ color: "#9ab4d0" }));
    drop.position.set((hash(i, 1) - 0.5) * 0.5, -0.2, (hash(i, 2) - 0.5) * 0.3);
    drop.name = "drop";
    g.add(drop);
  }
  return g;
}

// ---------------- surroundings ----------------
export const surroundGeo = {
  stalk: new THREE.BoxGeometry(0.035, 0.42, 0.035).translate(0, 0.21, 0),
  ear: new THREE.BoxGeometry(0.06, 0.12, 0.06).translate(0, 0.46, 0),
  wall: roughen(new THREE.BoxGeometry(1.02, 0.85, 0.42, 2, 2, 1).toNonIndexed(), 0.05, 51).translate(0, 0.42, 0),
};

function keepRuins(): THREE.Group {
  const g = new THREE.Group();
  const stone = (w: number, h: number, d: number, x: number, y: number, z: number, c = "#7d7a72") => {
    const m = new THREE.Mesh(roughen(new THREE.BoxGeometry(w, h, d, 2, 3, 1).toNonIndexed(), 0.06, Math.round(x * 10 + z)), mat(c));
    m.position.set(x, y, z);
    return m;
  };
  g.add(stone(3.6, 0.2, 2.6, 0, 0.1, 0, "#6e6a62"));
  // two towers, one broken
  const tower = (x: number, h: number, broken: boolean) => {
    const t = new THREE.Group();
    t.add(new THREE.Mesh(roughen(new THREE.CylinderGeometry(0.55, 0.62, h, 8, 3).toNonIndexed(), 0.06, 60 + h), mat("#7d7a72"))).children.at(-1)!.position.y = h / 2;
    if (!broken) for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; if (i % 2) t.add(box(0.2, 0.25, 0.2, "#8a867c", Math.cos(a) * 0.5, h + 0.12, Math.sin(a) * 0.5)); }
    t.add(box(0.14, 0.4, 0.05, "#1a1612", 0, h * 0.6, 0.6));
    t.position.set(x, 0, -0.6);
    return t;
  };
  g.add(tower(-1.3, 3.0, false));
  g.add(tower(1.3, 1.6, true));
  g.add(stone(2.0, 1.8, 0.45, 0, 0.9, -0.8));
  g.add(stone(0.8, 1.0, 0.45, -1.2, 0.5, 0.8));
  g.add(stone(0.5, 0.6, 0.45, 1.3, 0.3, 0.8));
  g.add(box(0.6, 1.0, 0.1, "#3a2a1a", 0, 0.5, -0.56)); // old gate
  for (let i = 0; i < 6; i++) g.add(stone(0.3, 0.2, 0.25, (hash(i, 1) - 0.5) * 3, 0.1, 0.6 + hash(i, 2) * 0.7, "#8a867c"));
  g.add(banner(-1.3, -0.6, "#5a2a22", 3.9));
  return g;
}
function chapel(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(1.4, 1.3, 2.4, "#9a958a", 0, 0.65, 0));
  g.add(gable(1.6, 2.6, 0.9, "#4c4a46", 1.3));
  g.add(box(0.6, 0.9, 0.6, "#9a958a", 0, 1.8, 1.0));
  g.add(new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.9, 4), mat("#4c4a46"))).children.at(-1)!.position.set(0, 2.7, 1.0);
  g.children.at(-1)!.rotation.y = Math.PI / 4;
  g.add(box(0.5, 0.8, 0.05, "#5a3a20", 0, 0.4, 1.21));
  g.add(new THREE.Mesh(new THREE.CircleGeometry(0.18, 10), new THREE.MeshLambertMaterial({ color: "#c9a55a", emissive: "#4a3a10" }))).children.at(-1)!.position.set(0, 1.05, 1.21);
  g.add(flowerBed(0.55, 1.45, 0.4));
  return g;
}
function woodcutter(): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 6; i++) { const log = cyl(0.11, 0.11, 1.6, 7, i % 2 ? "#6b4626" : "#5a3a20", 0, 0.12 + i * 0.2, -0.1); log.rotation.z = Math.PI / 2; g.add(log); }
  for (let i = 0; i < 5; i++) { const log = cyl(0.11, 0.11, 1.3, 7, "#6b4626", -0.75, 0.12 + i * 0.2, -0.1); log.rotation.x = Math.PI / 2; g.add(log); g.add(cyl(0.11, 0.11, 1.3, 7, "#5a3a20", 0.75, 0.12 + i * 0.2, -0.1)).children.at(-1)!.rotation.x = Math.PI / 2; }
  g.add(gableX(1.9, 1.6, 0.7, "#4a3a28", 1.1));
  g.add(box(0.4, 0.7, 0.05, "#3a2614", 0, 0.35, 0.56));
  const pile = new THREE.Group();
  for (let i = 0; i < 9; i++) { const l = cyl(0.08, 0.08, 0.5, 6, "#8a6036", (i % 3) * 0.17 - 0.17, 0.08 + Math.floor(i / 3) * 0.15, 0); l.rotation.x = Math.PI / 2; pile.add(l); }
  pile.position.set(0.95, 0, 0.6);
  g.add(pile);
  const stump = cyl(0.2, 0.24, 0.3, 8, "#6b4626", -0.9, 0.15, 0.75);
  g.add(stump);
  const axe = new THREE.Group();
  axe.add(cyl(0.02, 0.02, 0.5, 5, "#8a6036", 0, 0.25, 0));
  axe.add(box(0.03, 0.12, 0.16, "#9aa0a6", 0, 0.45, 0.06));
  axe.position.set(-0.9, 0.3, 0.75);
  axe.rotation.z = 0.3;
  g.add(axe);
  return g;
}
function windmill(): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(0.55, 0.8, 2.6, 8, "#d8cba7", 0, 1.3, 0));
  g.add(new THREE.Mesh(new THREE.ConeGeometry(0.7, 0.8, 8), mat("#7a3324"))).children.at(-1)!.position.set(0, 3.0, 0);
  g.add(box(0.36, 0.6, 0.05, "#5a3a20", 0, 0.3, 0.78));
  g.add(box(0.2, 0.2, 0.05, "#f0c766", 0, 1.6, 0.62, { emissive: "#6a4a10" }));
  const sails = new THREE.Group();
  sails.add(cyl(0.06, 0.06, 0.3, 6, "#5a3a20", 0, 0, 0)).children.at(-1)!.rotation.x = Math.PI / 2;
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group();
    arm.add(box(0.06, 1.4, 0.04, "#5a3a20", 0, 0.75, 0));
    arm.add(box(0.36, 1.1, 0.02, "#e8e0cc", 0.2, 0.85, 0));
    arm.rotation.z = (i * Math.PI) / 2;
    sails.add(arm);
  }
  sails.position.set(0, 2.5, 0.75);
  sails.name = "sails";
  g.add(sails);
  return g;
}
function farmhouse(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(2.4, 1.1, 1.3, "#8a3a2a", 0, 0.55, -0.1));
  for (const x of [-1.2, 1.2]) g.add(box(0.08, 1.1, 0.06, "#efe6d0", x, 0.55, 0.56));
  g.add(gableX(2.7, 1.6, 0.9, "#4c4a46", 1.1));
  g.add(box(0.7, 0.85, 0.05, "#efe6d0", -0.5, 0.42, 0.56));
  g.add(box(0.6, 0.75, 0.04, "#5a3a20", -0.5, 0.38, 0.58));
  g.add(box(0.36, 0.3, 0.05, "#f0c766", 0.65, 0.7, 0.56, { emissive: "#6a4a10" }));
  for (let i = 0; i < 3; i++) { const bale = cyl(0.26, 0.26, 0.4, 10, "#d4b25a", 1.25 - i * 0.55, 0.26, 0.95); bale.rotation.z = Math.PI / 2; g.add(bale); }
  g.add(cyl(0.18, 0.15, 0.3, 8, "#6b4626", -1.3, 0.15, 0.9));
  return g;
}
function fisherHut(): THREE.Group {
  const g = new THREE.Group();
  for (const x of [-0.7, 0.7]) for (const z of [-0.6, 0.6]) g.add(box(0.08, 0.5, 0.08, "#4a3a28", x, 0.25, z));
  g.add(box(1.6, 0.08, 1.4, "#6b4626", 0, 0.5, 0));
  g.add(box(1.3, 0.9, 1.1, "#7a6a54", 0, 0.98, -0.05));
  g.add(gableX(1.6, 1.4, 0.55, "#4c4a46", 1.42));
  g.add(box(0.36, 0.6, 0.05, "#3a2614", 0, 0.82, 0.51));
  for (let i = 0; i < 6; i++) g.add(box(0.02, 0.5, 0.02, "#c9b48a", -0.75 + i * 0.3, 0.75, 0.75));
  g.add(box(1.7, 0.02, 0.02, "#c9b48a", 0, 1.0, 0.75));
  const net = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.45), new THREE.MeshLambertMaterial({ color: "#b9a888", transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
  net.position.set(0, 0.8, 0.76);
  g.add(net);
  for (const x of [0.95, 1.2]) g.add(cyl(0.14, 0.14, 0.32, 8, "#5a3a20", x, 0.16, 0.3));
  return g;
}
export function makeLandmark(id: string): THREE.Group {
  switch (id) {
    case "keep": return keepRuins();
    case "chapel": return chapel();
    case "woodcutter": return woodcutter();
    case "windmill": return windmill();
    case "farmhouse": return farmhouse();
    default: return fisherHut();
  }
}
export function makeBoat(): THREE.Group {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.22, 1.3, 8, 1, false, Math.PI / 2, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), mat("#6b4626"));
  hull.scale.set(1, 0.7, 1);
  g.add(hull);
  g.add(box(0.5, 0.04, 0.12, "#8a6036", 0, 0.02, 0.1));
  const oar = box(0.03, 0.03, 1.0, "#8a6036", 0.3, 0.05, 0);
  oar.rotation.y = 0.5;
  g.add(oar);
  return g;
}

// ---------------- zen garden ----------------
/** Walled sand bed (texture supplied by the world), plus a lantern, a small pine and a bench. */
export function makeGardenFrame(w: number, d: number): { group: THREE.Group; sand: THREE.Mesh } {
  const g = new THREE.Group();
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: "#ffffff" }));
  sand.position.y = 0.06;
  g.add(sand);
  // low stone curb, with a gap for the gate on the south side
  const curb = (x: number, z: number, lw: number, ld: number) => g.add(new THREE.Mesh(roughen(new THREE.BoxGeometry(lw, 0.18, ld, Math.max(1, Math.round(lw * 2)), 1, Math.max(1, Math.round(ld * 2))).toNonIndexed(), 0.03, Math.round(x * 7 + z * 3)), mat("#8a867c"))).children.at(-1)!.position.set(x, 0.09, z);
  curb(0, -d / 2 - 0.08, w + 0.32, 0.16);
  curb(-w / 2 - 0.08, 0, 0.16, d);
  curb(w / 2 + 0.08, 0, 0.16, d);
  curb(-w / 4 - 0.25, d / 2 + 0.08, w / 2 - 0.5 + 0.16, 0.16);
  curb(w / 4 + 0.25, d / 2 + 0.08, w / 2 - 0.5 + 0.16, 0.16);
  // bamboo fence behind
  for (let i = 0; i <= 18; i++) g.add(cyl(0.035, 0.035, 0.9, 6, i % 3 ? "#a89a5a" : "#8a7c42", -w / 2 + (i / 18) * w, 0.45, -d / 2 - 0.3));
  for (const y of [0.35, 0.75]) g.add(cyl(0.02, 0.02, w, 5, "#6b5a2a", 0, y, -d / 2 - 0.27)).children.at(-1)!.rotation.z = Math.PI / 2;
  // stone lantern in the north-east corner
  const lan = new THREE.Group();
  lan.add(cyl(0.16, 0.2, 0.12, 6, "#8a867c", 0, 0.06, 0));
  lan.add(cyl(0.06, 0.07, 0.5, 6, "#8a867c", 0, 0.37, 0));
  lan.add(box(0.26, 0.2, 0.26, "#8a867c", 0, 0.72, 0));
  lan.add(box(0.14, 0.1, 0.27, "#f0c766", 0, 0.72, 0, { emissive: "#8a6010" }));
  lan.add(new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.2, 6), mat("#7d7a72"))).children.at(-1)!.position.y = 0.92;
  lan.position.set(w / 2 - 0.35, 0.06, -d / 2 + 0.35);
  g.add(lan);
  // a small windswept pine on a moss mound, north-west corner
  const pine = new THREE.Group();
  pine.add(new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2), mat("#4f6a2f"))).children.at(-1)!.scale.set(1, 0.4, 1);
  const trunk = cyl(0.04, 0.07, 0.8, 5, "#5a3a20", 0.08, 0.4, 0);
  trunk.rotation.z = -0.35;
  pine.add(trunk);
  [[0.25, 0.75, 0, 0.26], [-0.05, 0.95, 0.05, 0.2], [0.35, 0.55, -0.05, 0.18]].forEach(([x, y, z, r]) => pine.add(new THREE.Mesh(roughen(new THREE.IcosahedronGeometry(r, 0).toNonIndexed(), 0.06, Math.round(x * 50)), mat("#2f5528"))).children.at(-1)!.position.set(x, y, z));
  pine.children.slice(-3).forEach((m) => m.scale.set(1.3, 0.55, 1));
  pine.position.set(-w / 2 + 0.4, 0.06, -d / 2 + 0.4);
  g.add(pine);
  // bench just outside the gate
  g.add(box(0.7, 0.06, 0.24, "#6b4626", 0.9, 0.32, d / 2 + 0.55));
  for (const x of [0.62, 1.18]) g.add(box(0.06, 0.3, 0.2, "#5a3a20", x, 0.15, d / 2 + 0.55));
  return { group: g, sand };
}
export function makeGardenStone(scale: number, seed: number): THREE.Mesh {
  const m = new THREE.Mesh(roughen(new THREE.DodecahedronGeometry(0.22, 0).toNonIndexed(), 0.07, seed), mat("#7a766c"));
  m.scale.set(scale, scale * 0.7, scale * 0.85);
  return m;
}

// ---------------- shop & pets ----------------
export function makeShop(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(1.7, 1.2, 1.5, "#cbbd98", 0, 0.6, -0.05));
  for (const x of [-0.85, 0.85]) g.add(box(0.08, 1.2, 0.06, C.woodDk, x, 0.6, 0.71));
  g.add(box(1.75, 0.08, 0.06, C.woodDk, 0, 1.18, 0.71));
  g.add(gableX(2.0, 1.8, 0.8, "#2f5a3a", 1.2));
  g.add(box(0.45, 0.85, 0.05, C.wood, -0.35, 0.42, 0.71));
  g.add(box(0.5, 0.42, 0.05, C.lamp, 0.4, 0.68, 0.71, { emissive: "#6a4a10" }));
  g.add(box(0.6, 0.08, 0.5, "#2f5a3a", 0.4, 1.0, 0.95)).children.at(-1)!.rotation.set(0.35, 0, 0);
  // hanging coin sign
  g.add(box(0.05, 0.05, 0.45, C.woodDk, 0.85, 1.25, 0.95));
  const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.04, 14), mat("#d4a52a", { emissive: "#3a2a00" }));
  coin.rotation.z = Math.PI / 2;
  coin.position.set(0.85, 1.0, 1.12);
  coin.name = "spin";
  g.add(coin);
  // wares outside
  g.add(box(0.36, 0.3, 0.3, "#7a5533", -0.6, 0.15, 1.05));
  g.add(box(0.26, 0.04, 0.2, "#8a2a22", -0.6, 0.32, 1.05));
  g.add(cyl(0.15, 0.15, 0.4, 8, "#6b4626", 0.0, 0.2, 1.1));
  return g;
}

export interface PetRig { root: THREE.Group; legs: THREE.Object3D[]; tail: THREE.Object3D; head: THREE.Object3D }
export function makePet(kind: "dog" | "cat"): PetRig {
  const root = new THREE.Group();
  const fur = kind === "dog" ? "#9a6a3a" : "#5a5a62";
  const fur2 = kind === "dog" ? "#e8d8b8" : "#d9d4ca";
  const s = kind === "dog" ? 1 : 0.8;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.1 * s, 0.26 * s, 4, 8).rotateX(Math.PI / 2), sm(fur));
  body.position.set(0, 0.24 * s, 0);
  root.add(body);
  const head = new THREE.Group();
  head.add(new THREE.Mesh(new THREE.SphereGeometry(0.1 * s, 10, 8), sm(fur)));
  if (kind === "dog") {
    head.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.06, 3, 6).rotateX(Math.PI / 2), sm(fur2))).children.at(-1)!.position.set(0, -0.025, 0.09);
    head.add(new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 4), sm("#1a1410"))).children.at(-1)!.position.set(0, -0.01, 0.15);
    for (const x of [-0.07, 0.07]) { const ear = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 4).scale(0.5, 1.1, 0.8), sm("#6b4626")); ear.position.set(x, 0.02, -0.01); head.add(ear); }
  } else {
    for (const x of [-0.05, 0.05]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.07, 4), sm(fur)); ear.position.set(x, 0.09, 0); head.add(ear); }
    head.add(new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), sm(fur2))).children.at(-1)!.position.set(0, -0.025, 0.07);
  }
  for (const x of [-0.035, 0.035]) head.add(new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 4), sm("#1a1410"))).children.at(-1)!.position.set(x * s * 1.2, 0.025, 0.085 * s);
  head.position.set(0, 0.36 * s, 0.2 * s);
  root.add(head);
  const legs: THREE.Object3D[] = [];
  for (const [x, z] of [[-0.06, 0.12], [0.06, 0.12], [-0.06, -0.12], [0.06, -0.12]]) {
    const leg = new THREE.Group();
    leg.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.028 * s, 0.12 * s, 3, 6), sm(fur))).children.at(-1)!.position.y = -0.08 * s;
    leg.position.set(x * s, 0.19 * s, z * s);
    root.add(leg);
    legs.push(leg);
  }
  const tail = new THREE.Group();
  tail.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.022 * s, (kind === "cat" ? 0.22 : 0.14) * s, 3, 6), sm(fur))).children.at(-1)!.position.y = 0.1 * s;
  tail.position.set(0, 0.28 * s, -0.2 * s);
  tail.rotation.x = -0.6;
  root.add(tail);
  const sh = new THREE.Mesh(new THREE.CircleGeometry(0.16, 12), new THREE.MeshBasicMaterial({ color: "#000", transparent: true, opacity: 0.25, depthWrite: false }));
  sh.rotation.x = -Math.PI / 2;
  sh.position.y = 0.02;
  root.add(sh);
  return { root, legs, tail, head };
}

// ---------------- the garden's guardian statue (original design) ----------------
/** A weathered bronze robot sentinel, seated cross-legged in meditation on a stone plinth. */
export function makeGuardianStatue(): THREE.Group {
  const g = new THREE.Group();
  const bronze = "#6e5a3a",
    dark = "#4e3f2a",
    patina = "#5f7a62";
  const add = (geo: THREE.BufferGeometry, color: string, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat(color));
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    g.add(m);
    return m;
  };
  // plinth
  add(new THREE.CylinderGeometry(0.62, 0.7, 0.3, 8), "#8a867c", 0, 0.15, 0);
  add(new THREE.CylinderGeometry(0.55, 0.62, 0.08, 8), "#9a958a", 0, 0.34, 0);
  // crossed legs: thick segmented plates
  add(new THREE.BoxGeometry(0.62, 0.16, 0.3), bronze, -0.12, 0.48, 0.12, 0, 0.5, 0);
  add(new THREE.BoxGeometry(0.62, 0.16, 0.3), dark, 0.12, 0.5, 0.14, 0, -0.5, 0);
  for (const x of [-0.34, 0.34]) add(new THREE.CylinderGeometry(0.09, 0.09, 0.2, 8), dark, x, 0.5, 0.26, Math.PI / 2, 0, 0); // knee joints
  // torso: a broad chest plate over a narrow waist
  add(new THREE.CylinderGeometry(0.17, 0.2, 0.22, 8), dark, 0, 0.66, 0);
  add(new THREE.BoxGeometry(0.56, 0.42, 0.3), bronze, 0, 0.96, 0);
  add(new THREE.BoxGeometry(0.4, 0.14, 0.04), patina, 0, 1.02, 0.16); // chest vent
  for (let i = 0; i < 3; i++) add(new THREE.BoxGeometry(0.34, 0.02, 0.05), dark, 0, 0.98 + i * 0.04 - 0.04, 0.17);
  add(new THREE.SphereGeometry(0.06, 8, 6), "#9fd8d0", 0, 0.86, 0.16).material = new THREE.MeshLambertMaterial({ color: "#9fd8d0", emissive: "#2a6a64" }); // a soft core light
  // shoulders and arms resting on the knees, hands in a meditation mudra
  for (const s of [-1, 1]) {
    add(new THREE.SphereGeometry(0.13, 8, 6), patina, s * 0.36, 1.12, 0);
    add(new THREE.BoxGeometry(0.12, 0.3, 0.12), bronze, s * 0.42, 0.92, 0.05, 0.3, 0, s * 0.15);
    add(new THREE.BoxGeometry(0.11, 0.11, 0.26), dark, s * 0.4, 0.74, 0.2, 0, 0, 0);
    add(new THREE.SphereGeometry(0.07, 6, 4), bronze, s * 0.36, 0.7, 0.34);
  }
  // head: rounded helm with a single glowing visor slit and a short antenna
  add(new THREE.CylinderGeometry(0.07, 0.08, 0.08, 6), dark, 0, 1.21, 0);
  const helm = add(new THREE.SphereGeometry(0.17, 8, 6), bronze, 0, 1.36, 0);
  helm.scale.set(1, 0.95, 1.05);
  const visor = add(new THREE.BoxGeometry(0.22, 0.045, 0.05), "#9fd8d0", 0, 1.37, 0.16);
  visor.material = new THREE.MeshLambertMaterial({ color: "#9fd8d0", emissive: "#2a6a64" });
  visor.name = "visor";
  add(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 5), dark, 0.08, 1.58, -0.02, 0, 0, -0.2);
  add(new THREE.SphereGeometry(0.025, 6, 4), patina, 0.1, 1.69, -0.02);
  // moss on the shoulders and a few leaves at its feet
  for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.08, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), "#4f6a2f", s * 0.36, 1.2, -0.02).scale.set(1.2, 0.5, 1.2);
  return g;
}

// ---------------- Pen Gu Island ----------------
export const palmGeo = {
  trunk: (() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 6; i++) pts.push(new THREE.Vector3(Math.sin(i / 6) * 0.35, (i / 6) * 1.7, 0));
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 6, 0.07, 5);
  })(),
  frond: new THREE.ConeGeometry(0.16, 0.95, 4).rotateZ(Math.PI / 2).translate(0.47, 0, 0).scale(1, 0.25, 1),
};
export function makePalm(seed: number): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(palmGeo.trunk, mat("#8a6a44")));
  for (let i = 0; i < 7; i++) {
    const f = new THREE.Mesh(palmGeo.frond, mat(i % 2 ? "#3f8a3a" : "#4f9a42"));
    f.position.set(0.3, 1.7, 0);
    f.rotation.set(0, (i / 7) * Math.PI * 2 + seed, -0.45 - (i % 3) * 0.12);
    g.add(f);
  }
  for (let i = 0; i < 3; i++) g.add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), mat("#5a3a20"))).children.at(-1)!.position.set(0.3 + Math.cos(i * 2) * 0.08, 1.6, Math.sin(i * 2) * 0.08);
  g.rotation.y = seed;
  return g;
}
export function makeLounger(color: string): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.5, 0.05, 1.0, "#c9a878", 0, 0.22, 0.15));
  const back = box(0.5, 0.05, 0.6, "#c9a878", 0, 0.42, -0.5);
  back.rotation.x = 0.85;
  g.add(back);
  g.add(box(0.46, 0.02, 0.96, color, 0, 0.255, 0.15));
  for (const x of [-0.22, 0.22]) for (const z of [-0.2, 0.6]) g.add(box(0.04, 0.22, 0.04, "#a88a5a", x, 0.11, z));
  return g;
}
export function makeUmbrella(colors: [string, string]): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(0.025, 0.025, 1.7, 5, "#efe6d0", 0, 0.85, 0));
  for (let i = 0; i < 8; i++) {
    const seg = new THREE.Mesh(new THREE.ConeGeometry(0.85, 0.35, 8, 1, true, (i / 8) * Math.PI * 2, Math.PI / 4), new THREE.MeshLambertMaterial({ color: colors[i % 2], side: THREE.DoubleSide, flatShading: true }));
    seg.position.y = 1.75;
    g.add(seg);
  }
  return g;
}
export function makeVolleyNet(width: number): THREE.Group {
  const g = new THREE.Group();
  for (const x of [-width / 2, width / 2]) g.add(cyl(0.04, 0.05, 1.5, 6, "#efe6d0", x, 0.75, 0));
  const net = new THREE.Mesh(new THREE.PlaneGeometry(width, 0.45, 12, 3), new THREE.MeshBasicMaterial({ color: "#2a2a2a", wireframe: true }));
  net.position.y = 1.2;
  g.add(net);
  g.add(box(width, 0.04, 0.02, "#efe6d0", 0, 1.43, 0));
  return g;
}
export function makeBall(): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 1), new THREE.MeshLambertMaterial({ color: "#f4f0e0", flatShading: true }));
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.142, 0.018, 4, 12), mat("#2f7ac8"));
  m.add(band);
  const band2 = new THREE.Mesh(new THREE.TorusGeometry(0.142, 0.018, 4, 12).rotateY(Math.PI / 2), mat("#f2c040"));
  m.add(band2);
  return m;
}
export function makeFerry(): THREE.Group {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.38, 2.2, 8, 1, false, Math.PI / 2, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), mat("#7a3324"));
  hull.scale.set(1, 0.6, 1);
  g.add(hull);
  g.add(box(0.95, 0.05, 1.9, "#a8743e", 0, 0.02, 0));
  g.add(cyl(0.035, 0.04, 2.0, 6, "#5a3a20", 0, 1.0, 0.2));
  const sail = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.3), new THREE.MeshLambertMaterial({ color: "#efe6d0", side: THREE.DoubleSide }));
  sail.position.set(0, 1.15, 0.05);
  sail.rotation.y = Math.PI / 2;
  g.add(sail);
  g.add(box(0.5, 0.18, 0.04, "#2a2a2a", 0, 1.25, 0.06)).children.at(-1)!.visible = false;
  return g;
}

/** Banana plant or fern for the island's jungle. */
export function makeTropicalPlant(seed: number): THREE.Group {
  const g = new THREE.Group();
  const banana = hash(seed, 3) > 0.45;
  if (banana) {
    g.add(cyl(0.05, 0.07, 0.7, 5, "#6a8a3a", 0, 0.35, 0));
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.9, 4).rotateZ(Math.PI / 2).translate(0.45, 0, 0).scale(1, 0.18, 1), mat(i % 2 ? "#4f9a3a" : "#5fae44"));
      leaf.position.y = 0.7;
      leaf.rotation.set(0, (i / 6) * Math.PI * 2 + seed, -0.25 - hash(i, seed) * 0.5);
      g.add(leaf);
    }
  } else {
    for (let i = 0; i < 8; i++) {
      const frond = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.6, 3).rotateZ(Math.PI / 2).translate(0.3, 0, 0).scale(1, 0.25, 1), mat(i % 2 ? "#2f7a34" : "#3a8a3c"));
      frond.position.y = 0.12;
      frond.rotation.set(0, (i / 8) * Math.PI * 2 + seed, -0.5 - hash(seed, i) * 0.4);
      g.add(frond);
    }
    if (hash(seed, 9) > 0.5) for (let i = 0; i < 3; i++) g.add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), mat(["#e0405a", "#f2803a", "#f25aa0"][i]))).children.at(-1)!.position.set(Math.cos(i * 2.1) * 0.22, 0.25, Math.sin(i * 2.1) * 0.22);
  }
  g.rotation.y = seed;
  return g;
}

/** Palm-roofed TV stand for the beach; the screen texture is supplied by the world. */
export function makeBeachTV(screen: THREE.Texture): THREE.Group {
  const g = new THREE.Group();
  for (const x of [-0.55, 0.55]) g.add(cyl(0.05, 0.06, 1.7, 5, "#8a6a44", x, 0.85, -0.25));
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.0, 0.45, 6), mat("#b89a4a"));
  roof.position.set(0, 1.85, -0.1);
  g.add(roof);
  g.add(box(1.0, 0.5, 0.45, "#7a5533", 0, 0.25, -0.15)); // cabinet
  g.add(box(1.0, 0.68, 0.38, "#2a2a2e", 0, 0.86, -0.12)); // set
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.54), new THREE.MeshBasicMaterial({ map: screen }));
  scr.position.set(0, 0.87, 0.075);
  g.add(scr);
  g.add(cyl(0.012, 0.012, 0.35, 4, "#9aa0a6", 0.25, 1.33, -0.12)).children.at(-1)!.rotation.z = -0.5;
  g.add(cyl(0.012, 0.012, 0.35, 4, "#9aa0a6", -0.25, 1.33, -0.12)).children.at(-1)!.rotation.z = 0.5;
  return g;
}
