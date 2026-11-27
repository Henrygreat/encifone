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

/** The EncifOne Intelligence Core — used both as the dashboard hero's
 * centrepiece and (smaller) elsewhere. `active` is a real, data-driven
 * state (whether this org has AI configured and enabled — see
 * src/lib/ai-gateway), never a cosmetic default: the brief is explicit
 * that AI must never appear to be "working" when none is configured. */
export function AiOrb({ className, active = true }: { className?: string; active?: boolean }) {
  return (
    <SceneCanvas className={className} fallback={<StaticOrbFallback />} camera={{ position: [0, 0, 3], fov: 40 }}>
      <AiOrbScene active={active} />
    </SceneCanvas>
  );
}
