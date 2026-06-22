"use client";
import { useMemo, useRef, useEffect, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Line } from "@react-three/drei";
import * as THREE from "three";
import type { VolSurface } from "@floe/sdk/browser";

/* ---------------------------------------------------------------------------
   The Floe vol surface: a live SVI implied-vol surface rendered in 3D.
   x = log-moneyness, z = tenor (√time spacing), y = implied vol.
   Surface is colored teal (calm) → amber → coral (stressed) by IV. The selected
   expiry is drawn as a bright teal ribbon, tying the 3D view to the 2D smile.
--------------------------------------------------------------------------- */

const GRID_X = 1.5; // half-width  (log-moneyness axis)
const GRID_Z = 1.2; // half-depth  (tenor axis)
const HEIGHT = 0.95; // peak surface height (IV axis)
const ROWS = 56; // interpolated tenor resolution

/** teal → amber → coral colormap, t in [0,1]. */
function colorFor(t: number, out: THREE.Color) {
  const c0 = [52, 230, 214]; // teal  (low vol)
  const c1 = [236, 180, 90]; // amber (mid)
  const c2 = [242, 118, 110]; // coral (high vol)
  let a, b, f;
  if (t < 0.5) { a = c0; b = c1; f = t / 0.5; }
  else { a = c1; b = c2; f = (t - 0.5) / 0.5; }
  out.setRGB(
    (a[0] + (b[0] - a[0]) * f) / 255,
    (a[1] + (b[1] - a[1]) * f) / 255,
    (a[2] + (b[2] - a[2]) * f) / 255,
  );
}

interface Grid {
  rows: number;
  cols: number;
  /** interpolated IV grid [row][col] (percent) */
  iv: number[][];
  /** normalized √-time position per row, 0..1 */
  uRows: number[];
  ivMin: number;
  ivMax: number;
}

/** Interpolate the real oracle slices onto a finer, evenly-√time-spaced grid for a smooth mesh. */
function useGrid(surface: VolSurface): Grid {
  return useMemo(() => {
    const { slices, iv, ks, ivMin, ivMax } = surface;
    const cols = ks.length;
    if (slices.length < 2) {
      // single slice → flat ribbon, duplicate the row
      const row = iv[0] ?? new Array(cols).fill(0);
      return { rows: 2, cols, iv: [row, row], uRows: [0, 1], ivMin, ivMax };
    }
    const us = slices.map((s) => Math.sqrt(Math.max(s.tteMs, 0)));
    const uMin = us[0];
    const uMax = us[us.length - 1];
    const span = uMax - uMin || 1;
    const out: number[][] = [];
    const uRows: number[] = [];
    for (let r = 0; r < ROWS; r++) {
      const u = uMin + (span * r) / (ROWS - 1);
      uRows.push((u - uMin) / span);
      // find bracketing real slices
      let j = 0;
      while (j < us.length - 2 && us[j + 1] < u) j++;
      const t = (u - us[j]) / (us[j + 1] - us[j] || 1);
      const a = iv[j];
      const b = iv[j + 1];
      out.push(a.map((v, c) => v + (b[c] - v) * t));
    }
    return { rows: ROWS, cols, iv: out, uRows, ivMin, ivMax };
  }, [surface]);
}

function SurfaceMesh({ grid }: { grid: Grid }) {
  const { geometry, wire } = useMemo(() => {
    const { rows, cols, iv, uRows, ivMin, ivMax } = grid;
    const span = ivMax - ivMin || 1;
    const positions = new Float32Array(rows * cols * 3);
    const colors = new Float32Array(rows * cols * 3);
    const col = new THREE.Color();
    for (let r = 0; r < rows; r++) {
      const z = (uRows[r] * 2 - 1) * GRID_Z;
      for (let c = 0; c < cols; c++) {
        const i = (r * cols + c) * 3;
        const x = ((c / (cols - 1)) * 2 - 1) * GRID_X;
        const t = (iv[r][c] - ivMin) / span;
        positions[i] = x;
        positions[i + 1] = t * HEIGHT;
        positions[i + 2] = z;
        colorFor(THREE.MathUtils.clamp(t, 0, 1), col);
        colors[i] = col.r; colors[i + 1] = col.g; colors[i + 2] = col.b;
      }
    }
    const indices: number[] = [];
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const a = r * cols + c;
        const b = a + 1;
        const d = a + cols;
        const e = d + 1;
        indices.push(a, d, b, b, d, e);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return { geometry: geo, wire: new THREE.WireframeGeometry(geo) };
  }, [grid]);

  useEffect(() => () => { geometry.dispose(); wire.dispose(); }, [geometry, wire]);

  return (
    <group>
      <mesh geometry={geometry}>
        <meshStandardMaterial
          vertexColors
          side={THREE.DoubleSide}
          roughness={0.42}
          metalness={0.12}
          emissive="#0a1418"
          emissiveIntensity={0.45}
          flatShading={false}
        />
      </mesh>
      <lineSegments geometry={wire}>
        <lineBasicMaterial color="#0b0f14" transparent opacity={0.16} />
      </lineSegments>
    </group>
  );
}

/** Bright ribbon tracing the selected expiry across the surface (ties to the 2D smile). */
function SelectedRibbon({ surface, index }: { surface: VolSurface; index: number }) {
  const points = useMemo(() => {
    const { iv, ks, slices, ivMin, ivMax } = surface;
    if (!slices.length) return [];
    const span = ivMax - ivMin || 1;
    // map the selected slice's real √time onto the normalized z axis
    const us = slices.map((s) => Math.sqrt(Math.max(s.tteMs, 0)));
    const uMin = us[0];
    const uSpan = (us[us.length - 1] - uMin) || 1;
    const z = (((us[index] - uMin) / uSpan) * 2 - 1) * GRID_Z;
    const row = iv[index] ?? [];
    return row.map((v, c) => {
      const x = ((c / (ks.length - 1)) * 2 - 1) * GRID_X;
      const y = ((v - ivMin) / span) * HEIGHT + 0.012;
      return new THREE.Vector3(x, y, z);
    });
  }, [surface, index]);
  if (points.length < 2) return null;
  return <Line points={points} color="#eafffb" lineWidth={3} />;
}

function Ground() {
  return (
    <group position={[0, -0.02, 0]}>
      <gridHelper args={[GRID_X * 2.4, 16, "#1d2630", "#141a21"]} position={[0, -0.001, 0]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[GRID_X * 2.4, GRID_Z * 2.4]} />
        <meshBasicMaterial color="#0a0d11" transparent opacity={0.55} />
      </mesh>
    </group>
  );
}

function Scene({ surface, index, reduced }: { surface: VolSurface; index: number; reduced: boolean }) {
  const grid = useGrid(surface);
  const rig = useRef<THREE.Group>(null);
  // gentle idle sway when motion is allowed (OrbitControls autoRotate handles the spin)
  useFrame((s) => {
    if (rig.current && !reduced) {
      rig.current.position.y = Math.sin(s.clock.elapsedTime * 0.6) * 0.015;
    }
  });
  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 6, 4]} intensity={1.5} color="#dffbf6" />
      <directionalLight position={[-4, 3, -2]} intensity={0.7} color="#34e6d6" />
      <pointLight position={[0, 4, 3]} intensity={18} color="#9fe9ff" />
      <group ref={rig}>
        <Ground />
        <SurfaceMesh grid={grid} />
        <SelectedRibbon surface={surface} index={index} />
      </group>
      <OrbitControls
        enablePan={false}
        enableZoom
        minDistance={3.2}
        maxDistance={8}
        minPolarAngle={0.2}
        maxPolarAngle={Math.PI / 2.15}
        autoRotate={!reduced}
        autoRotateSpeed={0.5}
        target={[0, 0.35, 0]}
      />
    </>
  );
}

export default function VolSurface3D({ surface, index }: { surface: VolSurface; index: number }) {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(m.matches);
    const fn = () => setReduced(m.matches);
    m.addEventListener("change", fn);
    return () => m.removeEventListener("change", fn);
  }, []);

  return (
    <div className="vol-surface3d">
      <Canvas
        dpr={[1, 1.75]}
        gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
        camera={{ position: [3.6, 3.0, 4.4], fov: 42 }}
      >
        <Scene surface={surface} index={index} reduced={reduced} />
      </Canvas>
      {/* axis legends (HTML overlay — robust, no in-scene font fetch) */}
      <span className="vol-axis vol-axis--x">log-moneyness ln(K/F) →</span>
      <span className="vol-axis vol-axis--z">← tenor (√t)</span>
      <span className="vol-axis vol-axis--y">implied vol ↑</span>
      <span className="vol-hint">drag to orbit · scroll to zoom</span>
    </div>
  );
}
