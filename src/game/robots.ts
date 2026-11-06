// The Frostwardens: the Penguin King's robot crew in the Glacier Court. Original designs:
// ice-white armour, steel joints, a single glowing visor slit and orange hazard trim.
// Shifters fold down into snow-crawlers and unfold into robots.
import * as THREE from "three";
import { mat } from "./models";

const WHITE = "#e6edf4",
  STEEL = "#7d8a9c",
  DARK = "#3a4250",
  ICE = "#5ad0f0",
  ORANGE = "#e0782a";

const glow = (c: string) => new THREE.MeshBasicMaterial({ color: c });
function bx(w: number, h: number, d: number, c: string | THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof c === "string" ? mat(c) : c);
  m.position.set(x, y, z);
  return m;
}
function cy(r: number, h: number, c: string | THREE.Material, x = 0, y = 0, z = 0, seg = 8) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), typeof c === "string" ? mat(c) : c);
  m.position.set(x, y, z);
  return m;
}
const pivot = (x: number, y: number, z: number, ...kids: THREE.Object3D[]) => {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  kids.forEach((k) => g.add(k));
  return g;
};

/** A helmet with a single visor slit (and two fins), shared by every Frostwarden. */
function helmet(s: number, visor: THREE.Material) {
  const h = new THREE.Group();
  h.add(bx(0.34 * s, 0.3 * s, 0.32 * s, WHITE, 0, 0.15 * s, 0));
  h.add(bx(0.36 * s, 0.08 * s, 0.34 * s, STEEL, 0, 0.32 * s, -0.01 * s)); // brow ridge
  h.add(bx(0.28 * s, 0.05 * s, 0.02 * s, visor, 0, 0.17 * s, 0.165 * s)); // the visor slit
  h.add(bx(0.2 * s, 0.07 * s, 0.03 * s, DARK, 0, 0.06 * s, 0.16 * s)); // jaw grille
  for (const x of [-1, 1]) {
    const fin = bx(0.03 * s, 0.22 * s, 0.14 * s, ORANGE, x * 0.19 * s, 0.3 * s, -0.04 * s);
    fin.rotation.z = -x * 0.35;
    h.add(fin);
  }
  return h;
}

export interface Bot {
  group: THREE.Group;
  update(t: number, dt: number): void;
}

/** A tall throne guard: broad pauldrons, a glowing chest core, a slow scanning head. */
export function makeSentinel(): Bot {
  const g = new THREE.Group();
  const visor = glow(ICE);
  const core = glow(ICE);
  // legs with big feet
  for (const x of [-0.24, 0.24]) {
    g.add(bx(0.3, 0.12, 0.44, STEEL, x, 0.06, 0.04));
    g.add(bx(0.22, 0.55, 0.24, WHITE, x, 0.4, 0));
    g.add(bx(0.2, 0.12, 0.2, DARK, x, 0.72, 0)); // knee
    g.add(bx(0.26, 0.5, 0.28, WHITE, x, 1.02, 0));
    g.add(bx(0.27, 0.05, 0.29, ORANGE, x, 0.9, 0));
  }
  g.add(bx(0.62, 0.22, 0.34, DARK, 0, 1.32, 0)); // hips
  const torso = new THREE.Group();
  torso.position.y = 1.45;
  torso.add(bx(0.78, 0.62, 0.44, WHITE, 0, 0.31, 0));
  torso.add(bx(0.5, 0.3, 0.06, STEEL, 0, 0.36, 0.23));
  const coreM = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), core);
  coreM.position.set(0, 0.38, 0.27);
  torso.add(coreM);
  torso.add(bx(0.8, 0.06, 0.46, ORANGE, 0, 0.02, 0));
  for (const x of [-1, 1]) {
    const pa = bx(0.3, 0.16, 0.5, STEEL, x * 0.5, 0.62, 0);
    pa.rotation.z = -x * 0.25;
    torso.add(pa);
    const arm = pivot(x * 0.5, 0.52, 0, bx(0.2, 0.42, 0.22, WHITE, 0, -0.24, 0), bx(0.16, 0.1, 0.16, DARK, 0, -0.48, 0), bx(0.26, 0.42, 0.28, WHITE, 0, -0.74, 0.02), bx(0.2, 0.14, 0.2, STEEL, 0, -1.0, 0.03));
    arm.rotation.z = x * 0.12;
    arm.name = x < 0 ? "armL" : "armR";
    torso.add(arm);
  }
  // back fins / exhaust
  for (const x of [-0.18, 0.18]) torso.add(bx(0.08, 0.5, 0.14, STEEL, x, 0.55, -0.28));
  const head = helmet(1.25, visor);
  head.position.y = 0.66;
  torso.add(head);
  g.add(torso);
  return {
    group: g,
    update: (t) => {
      head.rotation.y = Math.sin(t * 0.4) * 0.6;
      torso.position.y = 1.45 + Math.sin(t * 1.2) * 0.01;
      const k = 0.6 + 0.4 * Math.sin(t * 2.4);
      core.color.setRGB(0.35 * k, 0.82 * k, 0.95 * k);
      visor.color.setRGB(0.35 + 0.1 * k, 0.82, 0.95);
    },
  };
}

/**
 * A Shifter: drives about as a low snow-crawler (headlights, treads, a plough),
 * stops, unfolds into a robot, looks round, folds back down and drives on.
 */
export function makeShifter(lane: { x: number; z0: number; z1: number }, phase = 0): Bot {
  const g = new THREE.Group();
  const visor = glow("#ff9a4a");
  const lamps = glow("#fff4c0");
  const torso = new THREE.Group();
  g.add(torso);
  torso.add(bx(0.6, 0.42, 0.7, WHITE, 0, 0, 0));
  torso.add(bx(0.62, 0.08, 0.72, ORANGE, 0, -0.17, 0));
  torso.add(bx(0.4, 0.2, 0.04, STEEL, 0, 0.05, 0.36));
  for (const x of [-0.18, 0.18]) torso.add(bx(0.1, 0.06, 0.03, lamps, x, -0.08, 0.37)); // headlights (the chest lights when standing)
  const plough = pivot(0, -0.12, 0.38, bx(0.7, 0.32, 0.05, STEEL, 0, -0.16, 0));
  torso.add(plough);
  const head = helmet(0.9, visor);
  head.position.set(0, 0.2, 0);
  torso.add(head);
  // treads that become legs
  const legs = [-0.27, 0.27].map((x) => {
    const leg = pivot(x, 0, 0, bx(0.18, 0.86, 0.32, DARK, 0, -0.43, 0), bx(0.2, 0.1, 0.34, STEEL, 0, -0.84, 0.04));
    for (let i = 0; i < 5; i++) leg.add(bx(0.2, 0.03, 0.34, STEEL, 0, -0.1 - i * 0.17, 0));
    g.add(leg);
    return leg;
  });
  // arms that fold flat along the sides
  const arms = [-1, 1].map((x) => {
    const a = pivot(x * 0.36, 0, 0, bx(0.14, 0.5, 0.16, WHITE, 0, -0.25, 0), bx(0.18, 0.14, 0.2, ORANGE, 0, -0.52, 0));
    torso.add(a);
    return a;
  });
  // the cycle: drive (4s), unfold (1.2s), stand and look (3s), fold (1.2s), turn (0.8s)
  const CYCLE = 10.2;
  let dir = 1;
  let z = lane.z0;
  let lastCycle = -1;
  const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
  const set = (k: number) => {
    // k = 0 crawler, 1 robot
    const hip = 0.2 + 0.68 * k;
    torso.position.y = hip + 0.2 + 0.1 * k;
    legs.forEach((l) => {
      l.position.y = hip;
      l.rotation.x = -(Math.PI / 2) * (1 - k);
      l.position.z = -0.4 * (1 - k);
    });
    arms.forEach((a, i) => {
      a.position.y = 0.12;
      a.rotation.x = (Math.PI / 2) * (1 - k) * 0.95;
      a.rotation.z = (i ? 1 : -1) * 0.12 * k;
    });
    head.scale.setScalar(0.05 + 0.95 * k);
    head.position.y = 0.2 + 0.02 * k;
    plough.rotation.x = -1.2 * (1 - k);
    torso.rotation.x = -0.05 * (1 - k);
  };
  g.position.set(lane.x, 0, z);
  g.scale.setScalar(1.35);
  return {
    group: g,
    update: (t, dt) => {
      const c = (t + phase) % CYCLE;
      const n = Math.floor((t + phase) / CYCLE);
      if (n !== lastCycle) {
        if (lastCycle >= 0) dir = -dir;
        lastCycle = n;
      }
      let k = 0;
      if (c < 4) {
        z += dir * dt * ((lane.z1 - lane.z0) / 4);
        z = Math.max(lane.z0, Math.min(lane.z1, z));
        g.rotation.y = dir > 0 ? 0 : Math.PI;
        g.position.y = Math.abs(Math.sin(t * 18)) * 0.01;
      } else if (c < 5.2) k = ease((c - 4) / 1.2);
      else if (c < 8.2) {
        k = 1;
        head.rotation.y = Math.sin((c - 5.2) * 1.4) * 0.7;
        // turn to face the middle of the hall while standing
        g.rotation.y += ((lane.x < 6 ? Math.PI / 2 : -Math.PI / 2) - g.rotation.y) * Math.min(1, dt * 3);
      } else if (c < 9.4) {
        k = 1 - ease((c - 8.2) / 1.2);
        head.rotation.y *= 0.9;
      } else g.rotation.y += ((dir > 0 ? Math.PI : 0) - g.rotation.y) * Math.min(1, dt * 4);
      g.position.z = z;
      set(k);
    },
  };
}

/** A little worker carrying an ice block back and forth. */
export function makeWorker(from: THREE.Vector3, to: THREE.Vector3, phase = 0): Bot {
  const g = new THREE.Group();
  const eye = glow(ICE);
  const body = new THREE.Group();
  body.add(bx(0.36, 0.34, 0.3, WHITE, 0, 0.4, 0));
  body.add(bx(0.37, 0.05, 0.31, ORANGE, 0, 0.27, 0));
  body.add(cy(0.06, 0.04, eye, 0, 0.47, 0.16).rotateX(Math.PI / 2));
  body.add(bx(0.02, 0.18, 0.02, STEEL, 0.1, 0.66, 0));
  body.add(new THREE.Mesh(new THREE.SphereGeometry(0.03, 5, 4), glow("#ff9a4a")).translateX(0.1).translateY(0.76));
  const block = bx(0.34, 0.26, 0.3, new THREE.MeshLambertMaterial({ color: "#bfe8fa", transparent: true, opacity: 0.85 }), 0, 0.74, 0.12);
  body.add(block);
  for (const x of [-0.15, 0.15]) body.add(bx(0.06, 0.24, 0.06, STEEL, x, 0.62, 0.14));
  g.add(body);
  const feet = [-0.1, 0.1].map((x) => {
    const f = bx(0.1, 0.22, 0.14, STEEL, x, 0.11, 0);
    g.add(f);
    return f;
  });
  return {
    group: g,
    update: (t) => {
      const T = 9;
      const c = ((t + phase) % T) / T;
      const there = c < 0.5;
      const k = there ? c * 2 : (1 - c) * 2;
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      g.position.lerpVectors(from, to, e);
      g.rotation.y = Math.atan2((to.x - from.x) * (there ? 1 : -1), (to.z - from.z) * (there ? 1 : -1));
      block.visible = there;
      const walk = Math.sin(t * 12);
      feet[0].position.y = 0.11 + Math.max(0, walk) * 0.05;
      feet[1].position.y = 0.11 + Math.max(0, -walk) * 0.05;
      body.position.y = Math.abs(walk) * 0.02;
    },
  };
}

/** A hovering drone that circles the hall. */
export function makeDrone(center: THREE.Vector3, r: number, phase = 0): Bot {
  const g = new THREE.Group();
  const eye = glow(ICE);
  g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 1), mat(WHITE)));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.025, 4, 14), mat(STEEL));
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), eye).translateZ(0.14));
  for (const x of [-1, 1]) g.add(bx(0.14, 0.02, 0.08, ORANGE, x * 0.3, 0, 0));
  const beam = new THREE.Mesh(new THREE.ConeGeometry(0.25, 1.2, 8, 1, true), new THREE.MeshBasicMaterial({ color: ICE, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
  beam.position.y = -0.7;
  g.add(beam);
  return {
    group: g,
    update: (t) => {
      const a = t * 0.35 + phase;
      g.position.set(center.x + Math.cos(a) * r, center.y + Math.sin(t * 1.3 + phase) * 0.15, center.z + Math.sin(a) * r * 0.6);
      g.rotation.y = -a;
      ring.rotation.z = t * 3;
    },
  };
}
