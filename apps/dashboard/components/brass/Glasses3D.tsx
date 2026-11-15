"use client";
// 3D glasses for pairing (design.md 13.1 #3). A generic wayfarer-style frame built from simple
// geometry (no Ray-Ban or Meta model or logo, D14), with the tally LED glowing on the temple.
// Lazy loaded: three.js only downloads when the pairing sheet opens. Drag to rotate.
import { useEffect, useRef } from "react";
import * as THREE from "three";

export default function Glasses3D({ live = true }: { live?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const w = el.clientWidth, h = el.clientHeight;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setSize(w, h);
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, w / h, 0.1, 100);
    // Pull the camera back on narrow boxes so the whole frame always fits (about 5.4 units wide).
    const fit = (aspect: number) => { camera.aspect = aspect; camera.position.set(0, 0.25, 6.2 * Math.max(1, 1.75 / aspect)); camera.updateProjectionMatrix(); };
    fit(w / h);
    const ro = new ResizeObserver(() => { const W = el.clientWidth, H = el.clientHeight; if (!W || !H) return; renderer.setSize(W, H); fit(W / H); });
    ro.observe(el);

    scene.add(new THREE.AmbientLight(0x9fb3a8, 0.7));
    const key = new THREE.DirectionalLight(0xe4c382, 2.2); key.position.set(3, 4, 5); scene.add(key);
    const rim = new THREE.DirectionalLight(0x1f5a48, 2); rim.position.set(-4, -1, -3); scene.add(rim);

    const frameMat = new THREE.MeshStandardMaterial({ color: 0x0b1712, roughness: 0.35, metalness: 0.2 });
    const lensMat = new THREE.MeshPhysicalMaterial({ color: 0x12372e, roughness: 0.05, metalness: 0, transmission: 0, opacity: 0.85, transparent: true, clearcoat: 1 });
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xd2a860, roughness: 0.3, metalness: 0.9 });

    // Rounded-trapezoid rim shape, shared by both eyes.
    const rimShape = (inset = 0) => {
      const s = new THREE.Shape();
      const W = 1.05 - inset, T = 0.42 - inset, B = 0.36 - inset, r = 0.16;
      s.moveTo(-W + r, T); s.lineTo(W - r, T); s.quadraticCurveTo(W, T, W, T - r);
      s.lineTo(W * 0.92, -B + r); s.quadraticCurveTo(W * 0.9, -B, W * 0.9 - r, -B);
      s.lineTo(-W * 0.9 + r, -B); s.quadraticCurveTo(-W * 0.9, -B, -W * 0.92, -B + r);
      s.lineTo(-W, T - r); s.quadraticCurveTo(-W, T, -W + r, T);
      return s;
    };
    const ring = rimShape(); ring.holes.push(new THREE.Path(rimShape(0.12).getPoints(32)));
    const rimGeo = new THREE.ExtrudeGeometry(ring, { depth: 0.16, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 3 });
    const lensGeo = new THREE.ShapeGeometry(rimShape(0.1));
    const group = new THREE.Group();
    for (const side of [-1, 1]) {
      const eye = new THREE.Group();
      eye.add(new THREE.Mesh(rimGeo, frameMat));
      const lens = new THREE.Mesh(lensGeo, lensMat); lens.position.z = 0.08; eye.add(lens);
      eye.position.x = side * 1.12; eye.scale.x = side; // mirror for the right eye
      group.add(eye);
      const temple = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 2.6), frameMat);
      temple.position.set(side * 2.12, 0.28, -1.25); group.add(temple);
      const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.16, 16), brassMat);
      hinge.position.set(side * 2.12, 0.28, 0.02); group.add(hinge);
    }
    const bridge = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.06, 12, 24, Math.PI), frameMat);
    bridge.position.set(0, 0.24, 0.08); group.add(bridge);
    // Tally LED on the left temple: the same brass light as the status ring.
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 16), new THREE.MeshBasicMaterial({ color: live ? 0xd2a860 : 0x7f9389 }));
    led.position.set(-2.18, 0.36, -0.2); group.add(led);
    const glow = new THREE.PointLight(0xd2a860, live ? 1.2 : 0, 1.2); glow.position.copy(led.position); group.add(glow);
    group.rotation.set(0.12, -0.5, 0);
    scene.add(group);

    let target = { x: 0.12, y: -0.5 }, dragging: { x: number; y: number; rx: number; ry: number } | null = null;
    const down = (e: PointerEvent) => { dragging = { x: e.clientX, y: e.clientY, rx: target.x, ry: target.y }; el.setPointerCapture(e.pointerId); };
    const move = (e: PointerEvent) => { if (!dragging) return; target = { x: Math.max(-0.5, Math.min(0.6, dragging.rx + (e.clientY - dragging.y) * 0.006)), y: dragging.ry + (e.clientX - dragging.x) * 0.01 }; };
    const up = () => { dragging = null; };
    el.addEventListener("pointerdown", down); el.addEventListener("pointermove", move); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);

    let raf = 0, t = 0;
    const tick = () => {
      t += 1;
      if (!dragging && !reduce) target.y += 0.004;
      group.rotation.x += (target.x - group.rotation.x) * 0.12;
      group.rotation.y += (target.y - group.rotation.y) * 0.12;
      if (live && !reduce) { const k = 0.65 + 0.35 * Math.cos((t / 144) * Math.PI * 2); glow.intensity = 1.2 * k; (led.material as THREE.MeshBasicMaterial).color.setHex(k > 0.5 ? 0xd2a860 : 0xa9843f); }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener("pointerdown", down); el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up);
      renderer.dispose(); scene.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose(); });
      el.removeChild(renderer.domElement);
    };
  }, [live]);
  return <div ref={host} className="size-full cursor-grab touch-none active:cursor-grabbing" aria-label="3D glasses. Drag to turn them." role="img" />;
}
