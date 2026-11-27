"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Sparkles, MeshDistortMaterial } from "@react-three/drei";
import type { Group, Mesh, Points } from "three";
import type { IntelligenceCoreState } from "@/components/three/ai-orb";

/** Evenly distributes `count` points on a unit sphere (the Fibonacci
 * sphere method) — cheap, deterministic, no RNG-driven clustering. */
function buildParticleSphere(count: number, radius: number): Float32Array {
  const positions = new Float32Array(count * 3);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const theta = goldenAngle * i;
    positions[i * 3] = Math.cos(theta) * r * radius;
    positions[i * 3 + 1] = y * radius;
    positions[i * 3 + 2] = Math.sin(theta) * r * radius;
  }
  return positions;
}

/** A handful of short "neural" connections between nearby particles —
 * built once from the same positions, not recomputed per frame. */
function buildConnections(positions: Float32Array, maxDistance: number, maxLines: number): Float32Array {
  const lines: number[] = [];
  const count = positions.length / 3;
  for (let i = 0; i < count && lines.length / 6 < maxLines; i++) {
    for (let j = i + 1; j < count && lines.length / 6 < maxLines; j++) {
      const dx = positions[i * 3] - positions[j * 3];
      const dy = positions[i * 3 + 1] - positions[j * 3 + 1];
      const dz = positions[i * 3 + 2] - positions[j * 3 + 2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < maxDistance) {
        lines.push(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
        lines.push(positions[j * 3], positions[j * 3 + 1], positions[j * 3 + 2]);
      }
    }
  }
  return new Float32Array(lines);
}

export interface AiOrbSceneProps { state?: IntelligenceCoreState }

/**
 * The EncifOne "Intelligence Core" — a luminous centre, a particle sphere
 * with a sparse set of neural-style connections, three layered orbital
 * rings, a soft glow halo (an enlarged, very-low-opacity emissive sphere —
 * a cheap stand-in for real bloom postprocessing, which this project
 * deliberately doesn't add as a dependency for one decorative scene), and
 * gentle pointer-reactive tilt. Scales to whatever container it's mounted
 * in (src/components/three/ai-orb.tsx) — used both as the dashboard's
 * compact widget and the dashboard hero's larger centrepiece.
 */
const STATE_COLORS: Record<IntelligenceCoreState, { core: string; secondary: string; tertiary: string; pulse: number }> = {
  "not-configured": { core: "#475569", secondary: "#64748b", tertiary: "#334155", pulse: 0.02 },
  ready: { core: "#00E5A0", secondary: "#22D3EE", tertiary: "#A78BFA", pulse: 0.05 },
  processing: { core: "#22D3EE", secondary: "#3B82F6", tertiary: "#00E5A0", pulse: 0.08 },
  degraded: { core: "#FBBF24", secondary: "#A78BFA", tertiary: "#22D3EE", pulse: 0.04 },
  error: { core: "#FB7185", secondary: "#A78BFA", tertiary: "#3B82F6", pulse: 0.03 },
};

export default function AiOrbScene({ state: visualState = "ready" }: AiOrbSceneProps) {
  const coreRef = useRef<Mesh>(null);
  const glowRef = useRef<Mesh>(null);
  const shellARef = useRef<Mesh>(null);
  const shellBRef = useRef<Mesh>(null);
  const innerRingRef = useRef<Group>(null);
  const outerRingRef = useRef<Group>(null);
  const particlesRef = useRef<Points>(null);
  const trailRingRef = useRef<Group>(null);

  const palette = STATE_COLORS[visualState];
  const isActive = visualState === "ready" || visualState === "processing";
  const isDegraded = visualState === "degraded" || visualState === "error";
  const coreColor = palette.core;
  const secondaryColor = palette.secondary;
  const tertiaryColor = palette.tertiary;

  const particlePositions = useMemo(() => buildParticleSphere(90, 1.55), []);
  const connectionPositions = useMemo(
    () => buildConnections(particlePositions, 0.42, 36),
    [particlePositions]
  );

  useFrame((frameState, delta) => {
    if (coreRef.current) {
      const baseSpeed = visualState === "processing" ? 2.8 : 1.8;
      const pulse = 1 + Math.sin(frameState.clock.elapsedTime * baseSpeed) * palette.pulse;
      coreRef.current.scale.setScalar(pulse);
    }
    if (glowRef.current) {
      const breathe = 1 + Math.sin(frameState.clock.elapsedTime * 0.7) * 0.08;
      glowRef.current.scale.setScalar(breathe);
    }
    if (shellARef.current) {
      shellARef.current.rotation.y += delta * (visualState === "processing" ? 0.18 : 0.08);
      shellARef.current.rotation.x += delta * 0.04;
    }
    if (shellBRef.current) {
      shellBRef.current.rotation.y -= delta * (visualState === "processing" ? 0.12 : 0.05);
      shellBRef.current.rotation.z += delta * 0.03;
    }
    if (innerRingRef.current) {
      innerRingRef.current.rotation.z += delta * (isActive ? 0.4 : 0.12);
      innerRingRef.current.rotation.x += delta * (isActive ? 0.15 : 0.05);
      innerRingRef.current.rotation.y += (frameState.pointer.x * 0.3 - innerRingRef.current.rotation.y) * 0.04;
    }
    if (outerRingRef.current) {
      outerRingRef.current.rotation.y -= delta * (isActive ? 0.22 : 0.07);
      outerRingRef.current.rotation.x += (frameState.pointer.y * 0.2 - outerRingRef.current.rotation.x) * 0.03;
    }
    if (trailRingRef.current) {
      trailRingRef.current.rotation.y += delta * (visualState === "processing" ? 0.38 : 0.16);
      trailRingRef.current.rotation.z -= delta * (visualState === "processing" ? 0.22 : 0.09);
    }
    if (particlesRef.current) {
      particlesRef.current.rotation.y += delta * (isActive ? 0.08 : 0.02);
    }
  });

  return (
    <>
      <ambientLight intensity={0.5} />
      <pointLight position={[1.5, 1.5, 1.5]} intensity={30} color={coreColor} />
      <pointLight position={[-1.5, -1, -1.5]} intensity={18} color={secondaryColor} />

      {/* Soft glow halo — a cheap bloom substitute, see component doc. */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[0.95, 24, 24]} />
        <meshBasicMaterial color={coreColor} transparent opacity={0.08} />
      </mesh>

      <mesh ref={coreRef}>
        <icosahedronGeometry args={[0.55, 2]} />
        <MeshDistortMaterial
          color={coreColor}
          emissive={coreColor}
          emissiveIntensity={isActive ? 0.9 : 0.45}
          roughness={0.25}
          metalness={0.2}
          distort={visualState === "processing" ? 0.18 : 0.1}
          speed={visualState === "processing" ? 2.2 : 1.2}
        />
      </mesh>

      <mesh ref={shellARef}>
        <sphereGeometry args={[0.76, 28, 28]} />
        <meshPhysicalMaterial
          color={secondaryColor}
          transparent
          opacity={0.15}
          transmission={0.9}
          roughness={0.1}
          thickness={0.25}
        />
      </mesh>
      <mesh ref={shellBRef}>
        <sphereGeometry args={[0.95, 22, 22]} />
        <meshPhysicalMaterial
          color={tertiaryColor}
          transparent
          opacity={0.08}
          transmission={0.7}
          roughness={0.2}
          thickness={0.2}
        />
      </mesh>

      <group ref={innerRingRef}>
        <mesh rotation={[Math.PI / 2.4, 0, 0]}>
          <torusGeometry args={[0.95, 0.012, 8, 64]} />
          <meshStandardMaterial color={secondaryColor} emissive={secondaryColor} emissiveIntensity={0.6} />
        </mesh>
        <mesh rotation={[Math.PI / 1.8, Math.PI / 5, 0]}>
          <torusGeometry args={[1.15, 0.008, 8, 64]} />
          <meshStandardMaterial color={tertiaryColor} emissive={tertiaryColor} emissiveIntensity={0.5} />
        </mesh>
      </group>

      {/* A third, larger, slower-counter-rotating ring — the "layered
          energy rings" the Aurora UI brief asks for. */}
      <group ref={outerRingRef}>
        <mesh rotation={[Math.PI / 2.1, Math.PI / 7, 0]}>
          <torusGeometry args={[1.42, 0.006, 8, 72]} />
          <meshStandardMaterial color={coreColor} emissive={coreColor} emissiveIntensity={0.35} transparent opacity={0.6} />
        </mesh>
      </group>

      <group ref={trailRingRef}>
        <mesh rotation={[Math.PI / 2.7, Math.PI / 4.2, Math.PI / 5]}>
          <torusGeometry args={[1.24, 0.016, 10, 52, Math.PI * 0.65]} />
          <meshStandardMaterial color={secondaryColor} emissive={secondaryColor} emissiveIntensity={0.7} transparent opacity={0.72} />
        </mesh>
        <mesh rotation={[Math.PI / 1.9, Math.PI / 5.2, Math.PI / 3.8]}>
          <torusGeometry args={[1.56, 0.012, 10, 52, Math.PI * 0.52]} />
          <meshStandardMaterial color={tertiaryColor} emissive={tertiaryColor} emissiveIntensity={0.58} transparent opacity={0.58} />
        </mesh>
      </group>

      {/* Particle sphere with a sparse set of neural-style connections. */}
      <points ref={particlesRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[particlePositions, 3]} />
        </bufferGeometry>
        <pointsMaterial color={secondaryColor} size={0.035} sizeAttenuation transparent opacity={0.85} />
      </points>
      {connectionPositions.length > 0 && (
        <lineSegments>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[connectionPositions, 3]} />
          </bufferGeometry>
          <lineBasicMaterial color={tertiaryColor} transparent opacity={0.22} />
        </lineSegments>
      )}

      <Sparkles count={visualState === "processing" ? 36 : 24} scale={2.6} size={1.5} speed={isActive ? 0.28 : 0.08} color={secondaryColor} />
      {isDegraded && <Sparkles count={12} scale={2.2} size={1.8} speed={0.14} color={coreColor} />}
    </>
  );
}
