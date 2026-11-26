"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Line, Sparkles } from "@react-three/drei";
import type { Group } from "three";

/**
 * Floating interconnected module nodes orbiting an "AI core" — the visual
 * language for "EncifOne connects CRM, Sales, Projects, Tasks, Finance, and
 * AI into one system" (the brief this was built for). Composed inside
 * SceneCanvas only — never imported outside a next/dynamic(ssr:false) tree.
 * One module key skipped (Administration) to keep the ring at a readable 5
 * nodes rather than crowding it for a purely decorative count.
 */
const MODULE_NODES = [
  { label: "CRM", color: "#F59E0B" },
  { label: "Sales", color: "#10B981" },
  { label: "Work", color: "#2563EB" },
  { label: "Intelligence", color: "#8B5CF6" },
  { label: "Overview", color: "#6366F1" },
] as const;

const RADIUS = 3.2;

function nodePosition(index: number, total: number): [number, number, number] {
  const angle = (index / total) * Math.PI * 2;
  return [Math.cos(angle) * RADIUS, Math.sin(angle * 0.6) * 0.8, Math.sin(angle) * RADIUS];
}

export default function HeroNetworkScene() {
  const groupRef = useRef<Group>(null);
  const positions = useMemo(
    () => MODULE_NODES.map((_, i) => nodePosition(i, MODULE_NODES.length)),
    []
  );

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    // Slow ambient rotation plus a gentle parallax toward the pointer —
    // state.pointer is already normalised [-1, 1] by R3F, no manual
    // mousemove listener needed.
    groupRef.current.rotation.y += delta * 0.08;
    groupRef.current.rotation.x += (state.pointer.y * 0.15 - groupRef.current.rotation.x) * 0.05;
    groupRef.current.rotation.z += (state.pointer.x * -0.08 - groupRef.current.rotation.z) * 0.05;
  });

  return (
    <>
      <ambientLight intensity={0.6} />
      <pointLight position={[4, 4, 4]} intensity={60} color="#8B5CF6" />
      <pointLight position={[-4, -2, -4]} intensity={40} color="#2563EB" />

      <group ref={groupRef}>
        {/* AI intelligence core */}
        <mesh>
          <icosahedronGeometry args={[0.9, 1]} />
          <meshStandardMaterial
            color="#6366F1"
            emissive="#6366F1"
            emissiveIntensity={0.4}
            roughness={0.2}
            metalness={0.3}
            wireframe
          />
        </mesh>

        {MODULE_NODES.map((node, i) => (
          <group key={node.label} position={positions[i]}>
            <mesh>
              <sphereGeometry args={[0.32, 24, 24]} />
              <meshStandardMaterial
                color={node.color}
                emissive={node.color}
                emissiveIntensity={0.5}
                roughness={0.3}
              />
            </mesh>
            <Line points={[[0, 0, 0], [-positions[i][0], -positions[i][1], -positions[i][2]]]} color={node.color} opacity={0.35} transparent lineWidth={1} />
          </group>
        ))}
      </group>

      <Sparkles count={60} scale={9} size={2} speed={0.3} color="#8B5CF6" />
    </>
  );
}
