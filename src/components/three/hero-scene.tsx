"use client";

import dynamic from "next/dynamic";
import { SceneCanvas } from "./scene-canvas";

const HeroNetworkScene = dynamic(() => import("./scenes/hero-network-scene"), { ssr: false });

/**
 * Static CSS/SVG network graphic — shown instead of the 3D scene when
 * WebGL is unavailable or prefers-reduced-motion is set (docs/DESIGN_SYSTEM.md
 * §9). Same visual idea (module nodes orbiting a core), zero motion, zero
 * WebGL, so it degrades gracefully rather than leaving a blank area.
 */
function StaticHeroFallback() {
  const nodes = [
    { x: 50, y: 12, color: "#6366F1" },
    { x: 85, y: 35, color: "#F59E0B" },
    { x: 78, y: 75, color: "#10B981" },
    { x: 22, y: 75, color: "#2563EB" },
    { x: 15, y: 35, color: "#8B5CF6" },
  ];
  return (
    <svg viewBox="0 0 100 100" className="size-full opacity-70" aria-hidden="true">
      <defs>
        <radialGradient id="hero-fallback-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#6366F1" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#6366F1" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="30" fill="url(#hero-fallback-core)" />
      {nodes.map((node, i) => (
        <line
          key={`line-${i}`}
          x1="50"
          y1="50"
          x2={node.x}
          y2={node.y}
          stroke={node.color}
          strokeOpacity="0.35"
          strokeWidth="0.4"
        />
      ))}
      <circle cx="50" cy="50" r="5" fill="#6366F1" />
      {nodes.map((node, i) => (
        <circle key={`node-${i}`} cx={node.x} cy={node.y} r="3" fill={node.color} />
      ))}
    </svg>
  );
}

/** The one entry point for the landing-page hero visual. Always a Client
 * Component boundary — `dynamic(..., { ssr: false })` must be called from
 * one, and three/@react-three/fiber must never reach a server render. */
export function HeroScene({ className }: { className?: string }) {
  return (
    <SceneCanvas className={className} fallback={<StaticHeroFallback />} camera={{ position: [0, 0, 7], fov: 45 }}>
      <HeroNetworkScene />
    </SceneCanvas>
  );
}
