"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Sparkles } from "@react-three/drei";
import type { Group, Mesh, Points } from "three";

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

export interface AiOrbSceneProps {
  /** Data-driven visual state (docs/AURORA_DESIGN_SYSTEM.md §"Intelligence
   * Core") — vibrant emerald when this org has AI configured and enabled,
   * a dimmer slate when it doesn't. Never implies active AI work when none
   * is configured (CLAUDE.md rule: never imply AI is working when it isn't). */
  active?: boolean;
}

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
export default function AiOrbScene({ active = true }: AiOrbSceneProps) {
  const coreRef = useRef<Mesh>(null);
  const glowRef = useRef<Mesh>(null);
  const innerRingRef = useRef<Group>(null);
  const outerRingRef = useRef<Group>(null);
  const particlesRef = useRef<Points>(null);

  const coreColor = active ? "#10B981" : "#64748b";
  const secondaryColor = active ? "#22D3EE" : "#475569";
  const tertiaryColor = active ? "#8B5CF6" : "#334155";

  const particlePositions = useMemo(() => buildParticleSphere(90, 1.55), []);
  const connectionPositions = useMemo(
    () => buildConnections(particlePositions, 0.42, 36),
    [particlePositions]
  );

  useFrame((state, delta) => {
    if (coreRef.current) {
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 1.8) * (active ? 0.06 : 0.02);
      coreRef.current.scale.setScalar(pulse);
    }
    if (glowRef.current) {
      const breathe = 1 + Math.sin(state.clock.elapsedTime * 0.7) * 0.08;
      glowRef.current.scale.setScalar(breathe);
    }
    if (innerRingRef.current) {
      innerRingRef.current.rotation.z += delta * (active ? 0.4 : 0.12);
      innerRingRef.current.rotation.x += delta * (active ? 0.15 : 0.05);
      innerRingRef.current.rotation.y += (state.pointer.x * 0.3 - innerRingRef.current.rotation.y) * 0.04;
    }
    if (outerRingRef.current) {
      outerRingRef.current.rotation.y -= delta * (active ? 0.22 : 0.07);
      outerRingRef.current.rotation.x += (state.pointer.y * 0.2 - outerRingRef.current.rotation.x) * 0.03;
    }
    if (particlesRef.current) {
      particlesRef.current.rotation.y += delta * (active ? 0.06 : 0.02);
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
        <meshStandardMaterial
          color={coreColor}
          emissive={coreColor}
          emissiveIntensity={active ? 0.9 : 0.4}
          roughness={0.25}
          metalness={0.2}
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

      <Sparkles count={24} scale={2.6} size={1.5} speed={active ? 0.25 : 0.08} color={secondaryColor} />
    </>
  );
}
