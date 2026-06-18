"use client";
import { useRef, useMemo, useEffect, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  Float, Environment, Lightformer, MeshTransmissionMaterial,
  MeshReflectorMaterial, PerspectiveCamera,
} from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";

/* ---------------------------------------------------------------------------
   The Floe hero: a faceted ice crystal floating on dark, reflective water.
   What sits above the glowing waterline is the soft mark; its mirror image
   below the surface is the proven floor — most of the form lives below the line.
--------------------------------------------------------------------------- */

const TEAL = "#34e6d6";
const TEAL_DEEP = "#15b3a6";

/** A soft radial glow sprite (CanvasTexture) — gives the glass something bright
 *  to refract, and reads as atmospheric light blooming behind the floe. */
function useGlowTexture(color: string) {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, color);
    g.addColorStop(0.4, color + "aa");
    g.addColorStop(1, color + "00");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, [color]);
}

function GlowSprite({ position, scale, color, opacity = 1 }: {
  position: [number, number, number]; scale: number; color: string; opacity?: number;
}) {
  const tex = useGlowTexture(color);
  return (
    <sprite position={position} scale={[scale, scale, 1]}>
      <spriteMaterial map={tex} transparent opacity={opacity} blending={THREE.AdditiveBlending} depthWrite={false} />
    </sprite>
  );
}

/** The signature crystal — an elongated bipyramid (octahedron), faceted like the mark,
 *  with a glowing teal core so it reads as luminous ice rather than a dark silhouette. */
function Crystal() {
  return (
    <group rotation={[0, Math.PI / 4, 0]}>
      {/* inner luminous core (bloom catches this) */}
      <mesh scale={[0.62, 1.0, 0.62]}>
        <octahedronGeometry args={[1.35, 0]} />
        <meshBasicMaterial color={TEAL} toneMapped={false} />
      </mesh>
      {/* refractive ice shell */}
      <mesh scale={[1.18, 1.72, 1.18]} castShadow>
        <octahedronGeometry args={[1.35, 0]} />
        <MeshTransmissionMaterial
          samples={4}
          resolution={256}
          transmission={1}
          thickness={0.9}
          roughness={0.06}
          ior={1.28}
          chromaticAberration={0.1}
          anisotropy={0.25}
          distortion={0.2}
          distortionScale={0.3}
          temporalDistortion={0.06}
          color="#cdf7f1"
          attenuationColor={TEAL}
          attenuationDistance={0.7}
          clearcoat={1}
          clearcoatRoughness={0.08}
          flatShading
        />
      </mesh>
    </group>
  );
}

function Shard({ position, scale, speed }: { position: [number, number, number]; scale: number; speed: number }) {
  return (
    <Float speed={speed} rotationIntensity={1.4} floatIntensity={1.6} position={position}>
      <mesh scale={scale} rotation={[Math.random(), Math.random(), Math.random()]}>
        <octahedronGeometry args={[1, 0]} />
        <meshPhysicalMaterial
          color="#aef0e8" roughness={0.3} metalness={0}
          transmission={0.7} thickness={0.5} transparent opacity={0.7}
          emissive={TEAL} emissiveIntensity={0.25} flatShading
        />
      </mesh>
    </Float>
  );
}

function ParallaxRig({ children, reduced }: { children: React.ReactNode; reduced: boolean }) {
  const group = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!group.current || reduced) return;
    const { x, y } = state.pointer;
    group.current.rotation.y = THREE.MathUtils.lerp(group.current.rotation.y, x * 0.3, 0.04);
    group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, -y * 0.15, 0.04);
  });
  return <group ref={group}>{children}</group>;
}

function Scene({ reduced }: { reduced: boolean }) {
  const shards = useMemo(
    () => [
      { position: [-3.6, 1.7, -1.5], scale: 0.34, speed: 1.1 },
      { position: [3.8, 2.8, -2.4], scale: 0.22, speed: 1.5 },
      { position: [-3.0, 3.9, -2.8], scale: 0.18, speed: 1.8 },
      { position: [3.2, 1.0, -0.6], scale: 0.27, speed: 1.3 },
      { position: [-4.1, 3.2, -3.6], scale: 0.15, speed: 2.0 },
    ] as { position: [number, number, number]; scale: number; speed: number }[],
    []
  );

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 2.5, 8.4]} fov={38} />
      <ambientLight intensity={0.55} />
      <pointLight position={[4, 6, 4]} intensity={45} color="#cdfdf6" />
      <pointLight position={[-5, 2, -2]} intensity={28} color={TEAL} />
      <pointLight position={[0, -1, 2]} intensity={16} color={TEAL_DEEP} />

      <Environment resolution={256}>
        <Lightformer form="rect" intensity={3} color="#dffffb" position={[0, 5, -4]} scale={[10, 7, 1]} />
        <Lightformer form="rect" intensity={4} color={TEAL} position={[-5, 1, 1]} scale={[3, 7, 1]} />
        <Lightformer form="rect" intensity={3} color="#4a90d9" position={[5, 2, 1]} scale={[3, 7, 1]} />
        <Lightformer form="circle" intensity={3} color="#ffffff" position={[0, 4, 7]} scale={[3, 3, 1]} />
      </Environment>

      {/* atmospheric glow behind the floe */}
      <GlowSprite position={[0, 2.6, -3]} scale={9} color="#1c9d92" opacity={0.55} />
      <GlowSprite position={[-1.4, 0.2, -1]} scale={5} color={TEAL} opacity={0.5} />

      <ParallaxRig reduced={reduced}>
        <Float speed={reduced ? 0 : 1.1} rotationIntensity={reduced ? 0 : 0.35} floatIntensity={reduced ? 0 : 0.7}>
          <group position={[0, 2.35, 0]}>
            <Crystal />
          </group>
        </Float>
        {shards.map((s, i) => <Shard key={i} {...s} />)}
      </ParallaxRig>

      {/* glowing waterline where the crystal meets its reflection */}
      <GlowSprite position={[0, 0.05, 0.2]} scale={4.2} color={TEAL} opacity={0.85} />
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.7, 2.0, 64]} />
        <meshBasicMaterial color={TEAL} transparent opacity={0.9} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>

      {/* dark reflective water — mirrors the floe into its proven floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[60, 60]} />
        <MeshReflectorMaterial
          blur={[220, 70]} resolution={256} mixBlur={1} mixStrength={50}
          roughness={0.8} depthScale={1.1} minDepthThreshold={0.4} maxDepthThreshold={1.3}
          color="#060a0d" metalness={0.6} mirror={0.6}
        />
      </mesh>

      <EffectComposer>
        <Bloom mipmapBlur intensity={0.9} luminanceThreshold={0.2} luminanceSmoothing={0.9} radius={0.7} />
      </EffectComposer>
    </>
  );
}

export default function IceScene() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(m.matches);
    const fn = () => setReduced(m.matches);
    m.addEventListener("change", fn);
    return () => m.removeEventListener("change", fn);
  }, []);

  return (
    <Canvas
      className="ice-canvas"
      dpr={[1, 1.75]}
      gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
      camera={{ position: [0, 2.5, 8.4], fov: 38 }}
    >
      <Scene reduced={reduced} />
    </Canvas>
  );
}
