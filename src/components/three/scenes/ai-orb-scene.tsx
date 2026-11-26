"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { MeshDistortMaterial } from "@react-three/drei";
import type { Mesh } from "three";

/**
 * Small decorative "AI intelligence" orb for the dashboard's AI insights
 * panel — purely atmospheric, never implies a real insight is behind it
 * (the panel's own text is explicit that no AI provider is configured yet;
 * this widget doesn't contradict that). Deliberately tiny and simple —
 * CLAUDE.md's "don't let 3D distract from business activities," and this
 * sits in a small decorative slot, not full-bleed.
 */
export default function AiOrbScene() {
  const meshRef = useRef<Mesh>(null);

  useFrame((state, delta) => {
    if (!meshRef.current) return;
    meshRef.current.rotation.y += delta * 0.3;
    meshRef.current.rotation.x += delta * 0.15;
    const pulse = 1 + Math.sin(state.clock.elapsedTime * 1.5) * 0.06;
    meshRef.current.scale.setScalar(pulse);
  });

  return (
    <>
      <ambientLight intensity={0.7} />
      <pointLight position={[2, 2, 2]} intensity={40} color="#8B5CF6" />
      <mesh ref={meshRef}>
        <icosahedronGeometry args={[1, 4]} />
        <MeshDistortMaterial color="#8B5CF6" distort={0.4} speed={1.5} roughness={0.15} metalness={0.4} />
      </mesh>
    </>
  );
}
