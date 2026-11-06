// Moving parts on store gear (halo, flames, jetpack, orb, wings, flaming blade)
// and the particle auras. Shared by the world and the store's preview.
import * as THREE from "three";

/** Animate every object named "fx:*" on a character. */
export function animateGear(objs: THREE.Object3D[], t: number) {
  for (const o of objs) {
    if (o.name === "fx:halo") {
      o.position.y = 0.24 + Math.sin(t * 2) * 0.012;
      o.rotation.y = t * 0.6;
    } else if (o.name === "fx:flame") {
      const k = 0.8 + 0.35 * Math.sin(t * 14 + (o.userData.phase as number) * 1.7);
      o.scale.set(1, k, 1);
    } else if (o.name === "fx:thrust") o.scale.set(1, 0.7 + Math.random() * 0.6, 1);
    else if (o.name === "fx:orb") o.position.set(Math.cos(t * 1.5) * 0.38, 1.25 + Math.sin(t * 3) * 0.05, Math.sin(t * 1.5) * 0.38);
    else if (o.name === "fx:wingL" || o.name === "fx:wingR") o.rotation.y = (o.name === "fx:wingL" ? -1 : 1) * (0.55 + Math.sin(t * 2.2) * 0.3);
    else if (o.name === "fx:blade") ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.3 + 0.25 * Math.sin(t * 9) * Math.sin(t * 3.7);
  }
}
export const gearParts = (root: THREE.Object3D) => {
  const out: THREE.Object3D[] = [];
  root.traverse((o) => o.name.startsWith("fx:") && out.push(o));
  return out;
};

const GEO = {
  petal: new THREE.CircleGeometry(0.05, 5),
  flake: new THREE.OctahedronGeometry(0.03),
  ember: new THREE.TetrahedronGeometry(0.035),
  bolt: new THREE.BoxGeometry(0.02, 0.22, 0.02),
  coin: new THREE.CylinderGeometry(0.05, 0.05, 0.012, 8),
};

/** Particles that follow a character around (the store's aura slot). */
export class AuraEmitter {
  private t = 0;
  private parts: { m: THREE.Mesh; v: THREE.Vector3; life: number; max: number; spin: number; gravity: boolean; floor: number }[] = [];
  private parent: THREE.Object3D;
  constructor(parent: THREE.Object3D) {
    this.parent = parent;
  }
  update(dt: number, at: THREE.Vector3, kind: string | null, walking: boolean) {
    if (kind) {
      const rate = ({ petals: walking ? 14 : 3, snow: 10, embers: 12, lightning: 5, midas: walking ? 16 : 6 } as Record<string, number>)[kind] ?? 0;
      this.t += dt * rate;
      while (this.t >= 1) {
        this.t -= 1;
        this.spawn(kind, at);
      }
    }
    for (const p of this.parts) {
      p.life += dt;
      if (p.gravity) p.v.y -= 4 * dt;
      p.m.position.addScaledVector(p.v, dt);
      if (p.gravity && p.m.position.y < p.floor) {
        p.m.position.y = p.floor;
        p.v.set(0, 0, 0);
      }
      p.m.rotation.y += p.spin * dt;
      p.m.rotation.x += p.spin * 0.5 * dt;
      const k = p.life / p.max;
      (p.m.material as THREE.MeshBasicMaterial).opacity = k < 0.7 ? 1 : Math.max(0, 1 - (k - 0.7) / 0.3);
    }
    if (this.parts.some((p) => p.life >= p.max)) {
      this.parts = this.parts.filter((p) => {
        if (p.life < p.max) return true;
        this.parent.remove(p.m);
        (p.m.material as THREE.Material).dispose();
        return false;
      });
    }
  }
  clear() {
    this.parts.forEach((p) => {
      this.parent.remove(p.m);
      (p.m.material as THREE.Material).dispose();
    });
    this.parts = [];
  }
  private spawn(kind: string, r: THREE.Vector3) {
    const rnd = (a: number) => (Math.random() - 0.5) * a;
    const mk = (g: THREE.BufferGeometry, color: string) => new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide }));
    let m: THREE.Mesh,
      v = new THREE.Vector3(),
      max = 1,
      gravity = false;
    if (kind === "petals") {
      m = mk(GEO.petal, Math.random() < 0.5 ? "#ff9ac0" : "#fff0f6");
      m.position.set(r.x + rnd(0.5), r.y + 0.04, r.z + rnd(0.5));
      m.rotation.x = -Math.PI / 2;
      max = 2.2;
    } else if (kind === "snow") {
      m = mk(GEO.flake, "#ffffff");
      m.position.set(r.x + rnd(1.0), r.y + 2.1, r.z + rnd(1.0));
      v.set(rnd(0.1), -0.6, rnd(0.1));
      max = 3.2;
    } else if (kind === "embers") {
      m = mk(GEO.ember, Math.random() < 0.5 ? "#ff7a1a" : "#ffd04a");
      m.position.set(r.x + rnd(0.5), r.y + 0.2 + Math.random() * 0.6, r.z + rnd(0.5));
      v.set(rnd(0.2), 0.7 + Math.random() * 0.4, rnd(0.2));
      max = 1.3;
    } else if (kind === "lightning") {
      m = mk(GEO.bolt, Math.random() < 0.5 ? "#9ad8ff" : "#ffffff");
      const a = Math.random() * Math.PI * 2;
      m.position.set(r.x + Math.cos(a) * 0.35, r.y + 0.3 + Math.random() * 1.1, r.z + Math.sin(a) * 0.35);
      m.rotation.set(rnd(2), rnd(2), rnd(2));
      max = 0.18;
    } else {
      // midas: gold coins hop up around you and settle on the ground
      m = mk(GEO.coin, "#f0c040");
      m.position.set(r.x + rnd(0.5), r.y + 0.05, r.z + rnd(0.5));
      v.set(rnd(0.6), 1.4 + Math.random() * 0.6, rnd(0.6));
      max = 1.4;
      gravity = true;
    }
    this.parent.add(m);
    this.parts.push({ m, v, life: 0, max, spin: rnd(8), gravity, floor: r.y + 0.02 });
  }
}
