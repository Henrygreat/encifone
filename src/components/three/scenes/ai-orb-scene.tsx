"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Sparkles } from "@react-three/drei";
import type { Group, Mesh } from "three";

/**
 * Compact "AI energy core" for the dashboard's AI insights panel — a
 * glowing core, two thin orbital rings, and a sparse particle halo.
 * Deliberately small and self-contained (see docs/DESIGN_SYSTEM.md §9):
 * everything here is scaled to fit comfortably inside a camera at
 * distance 3 with a 40° FOV (see ai-orb.tsx) with margin to spare, so it
 * reads as a compact accent, never a dominant element competing with the
 * panel's own text.
 */
export default function AiOrbScene() {
  const coreRef = useRef<Mesh>(null);
  const ringsRef = useRef<Group>(null);

  useFrame((state, delta) => {
    if (coreRef.current) {
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 1.8) * 0.05;
      coreRef.current.scale.setScalar(pulse);
    }
    if (ringsRef.current) {
      ringsRef.current.rotation.z += delta * 0.4;
      ringsRef.current.rotation.x += delta * 0.15;
      // Gentle pointer-reactive tilt — R3F's state.pointer is already
      // normalised [-1, 1], no manual listener needed.
      ringsRef.current.rotation.y += (state.pointer.x * 0.3 - ringsRef.current.rotation.y) * 0.04;
    }
  });

  return (
    <>
      <ambientLight intensity={0.5} />
      <pointLight position={[1.5, 1.5, 1.5]} intensity={30} color="#10B981" />
      <pointLight position={[-1.5, -1, -1.5]} intensity={18} color="#22D3EE" />

      <mesh ref={coreRef}>
        <icosahedronGeometry args={[0.55, 2]} />
        <meshStandardMaterial
          color="#10B981"
          emissive="#10B981"
          emissiveIntensity={0.9}
          roughness={0.25}
          metalness={0.2}
        />
      </mesh>

      <group ref={ringsRef}>
        <mesh rotation={[Math.PI / 2.4, 0, 0]}>
          <torusGeometry args={[0.95, 0.012, 8, 64]} />
          <meshStandardMaterial color="#22D3EE" emissive="#22D3EE" emissiveIntensity={0.6} />
        </mesh>
        <mesh rotation={[Math.PI / 1.8, Math.PI / 5, 0]}>
          <torusGeometry args={[1.15, 0.008, 8, 64]} />
          <meshStandardMaterial color="#8B5CF6" emissive="#8B5CF6" emissiveIntensity={0.5} />
        </mesh>
      </group>

      <Sparkles count={24} scale={2.6} size={1.5} speed={0.25} color="#22D3EE" />
    </>
  );
}
