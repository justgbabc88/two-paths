import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { PlayerAppearance } from "../game/appearance";
import { makeCharacter, makePet } from "../game/models";

// A small turntable that shows your character close up. Drag to spin.
export function CharacterPreview({ appearance, label }: { appearance: PlayerAppearance; label?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<{ scene: THREE.Scene; holder: THREE.Group; render: () => void } | null>(null);
  const spin = useRef({ angle: 0.5, drag: null as null | number, idle: 0 });

  // one renderer for the life of the panel
  useEffect(() => {
    const cv = canvasRef.current!;
    const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
    camera.position.set(0, 1.0, 3.3);
    camera.lookAt(0, 0.72, 0);
    scene.add(new THREE.HemisphereLight("#f2ece0", "#4d4330", 1.8));
    const key = new THREE.DirectionalLight("#fff0d2", 2.2);
    key.position.set(-2, 3, 3);
    scene.add(key);
    const rim = new THREE.DirectionalLight("#9fb8d8", 0.8);
    rim.position.set(2, 2, -3);
    scene.add(rim);
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.8, 0.06, 8), new THREE.MeshLambertMaterial({ color: "#4f6a2f", flatShading: true }));
    floor.position.y = -0.03;
    scene.add(floor);
    const holder = new THREE.Group();
    scene.add(holder);
    const resize = () => {
      const r = cv.getBoundingClientRect();
      renderer.setSize(r.width, r.height, false);
      camera.aspect = r.width / Math.max(1, r.height);
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(cv);
    let raf = 0,
      last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const s = spin.current;
      if (s.drag === null && (s.idle += dt) > 1.5) s.angle += dt * 0.5; // slow turn when left alone
      holder.rotation.y = s.angle;
      const body = holder.children[0]?.children[0];
      if (body) body.position.y = Math.sin(now / 700) * 0.006; // breathing
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    ctxRef.current = { scene, holder, render: () => renderer.render(scene, camera) };
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
      ctxRef.current = null;
    };
  }, []);

  // rebuild the model whenever the look changes
  const key = JSON.stringify(appearance.look) + (appearance.pet ?? "");
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    ctx.holder.clear();
    const rig = makeCharacter(appearance.look);
    rig.root.children.forEach((c) => {
      if ((c as THREE.Mesh).isMesh) c.visible = false; // hide the blob shadow, the plinth is enough
    });
    ctx.holder.add(rig.root);
    if (appearance.pet) {
      const pet = makePet(appearance.pet);
      pet.root.position.set(0.48, 0, 0.18);
      pet.root.rotation.y = -0.5;
      pet.root.scale.setScalar(1.15);
      ctx.holder.add(pet.root);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <div className="preview">
      <canvas
        ref={canvasRef}
        onPointerDown={(e) => {
          spin.current.drag = e.clientX;
          (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const s = spin.current;
          if (s.drag === null) return;
          s.angle += (e.clientX - s.drag) * 0.012;
          s.drag = e.clientX;
          s.idle = 0;
        }}
        onPointerUp={() => {
          spin.current.drag = null;
          spin.current.idle = 0;
        }}
      />
      <div className="pv-label">{label ?? "You"}</div>
    </div>
  );
}
