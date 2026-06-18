"use client";
import { useRef, useMemo, useEffect, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

/* A drifting field of ice floes behind the closing CTA — the "layer" itself.
   Deliberately light: low-poly meshes, standard materials, no transmission /
   reflector / postprocessing, so it can share the page with the hero scene. */

const TEAL = "#34e6d6";

function Floe({ seed, reduced }: { seed: number; reduced: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  const data = useMemo(() => {
    const r = (n: number) => ((Math.sin(seed * 99.7 + n * 12.3) + 1) / 2);
    return {
      pos: [(r(1) - 0.5) * 16, (r(2) - 0.5) * 8, (r(3) - 0.5) * 6 - 2] as [number, number, number],
      scale: 0.25 + r(4) * 0.75,
      rot: [r(5) * Math.PI, r(6) * Math.PI, r(7) * Math.PI] as [number, number, number],
      spin: (r(8) - 0.5) * 0.3,
      drift: 0.15 + r(9) * 0.25,
      phase: r(10) * Math.PI * 2,
    };
  }, [seed]);

  useFrame((state) => {
    if (!ref.current || reduced) return;
    const t = state.clock.elapsedTime;
    ref.current.rotation.y += data.spin * 0.01;
    ref.current.rotation.x += data.spin * 0.004;
    ref.current.position.y = data.pos[1] + Math.sin(t * data.drift + data.phase) * 0.5;
  });

  return (
    <mesh ref={ref} position={data.pos} rotation={data.rot} scale={data.scale}>
      <octahedronGeometry args={[1, 0]} />
      <meshStandardMaterial
        color="#bdf3ec" roughness={0.4} metalness={0.1}
        emissive={TEAL} emissiveIntensity={0.12}
        transparent opacity={0.82} flatShading
      />
    </mesh>
  );
}

function Field({ reduced }: { reduced: boolean }) {
  const seeds = useMemo(() => Array.from({ length: 16 }, (_, i) => i + 1), []);
  return (
    <>
      <ambientLight intensity={0.6} />
      <pointLight position={[6, 5, 6]} intensity={50} color="#d4fbf5" />
      <pointLight position={[-6, -2, 2]} intensity={30} color={TEAL} />
      <directionalLight position={[0, 4, 4]} intensity={1.2} color="#9fe9e0" />
      {seeds.map((s) => <Floe key={s} seed={s} reduced={reduced} />)}
    </>
  );
}

export default function FloeField() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(m.matches);
  }, []);
  return (
    <Canvas
      className="ice-canvas"
      dpr={[1, 1.5]}
      gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
      camera={{ position: [0, 0, 9], fov: 42 }}
    >
      <Field reduced={reduced} />
    </Canvas>
  );
}
