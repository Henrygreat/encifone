"use client";

import dynamic from "next/dynamic";
import { SceneCanvas } from "./scene-canvas";

const AiOrbScene = dynamic(() => import("./scenes/ai-orb-scene"), { ssr: false });

/** Static fallback for the dashboard AI-orb widget — a CSS radial glow,
 * no motion, no WebGL. */
function StaticOrbFallback() {
  return (
    <div
      aria-hidden="true"
      className="size-full rounded-full opacity-80"
      style={{
        background: "radial-gradient(circle at 35% 35%, #6ee7c4 0%, #10B981 55%, transparent 100%)",
      }}
    />
  );
}

/** Small decorative widget for the dashboard's AI insights panel — see
 * src/components/three/scenes/ai-orb-scene.tsx for why it's intentionally
 * tiny and purely atmospheric. */
export function AiOrb({ className }: { className?: string }) {
  return (
    <SceneCanvas className={className} fallback={<StaticOrbFallback />} camera={{ position: [0, 0, 3], fov: 40 }}>
      <AiOrbScene />
    </SceneCanvas>
  );
}
