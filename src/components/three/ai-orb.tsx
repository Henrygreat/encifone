"use client";

import dynamic from "next/dynamic";
import { SceneCanvas } from "./scene-canvas";

const AiOrbScene = dynamic(() => import("./scenes/ai-orb-scene"), { ssr: false });

export type IntelligenceCoreState = "not-configured" | "ready" | "processing" | "degraded" | "error";

const FALLBACK_GRADIENT: Record<IntelligenceCoreState, string> = {
  "not-configured": "radial-gradient(circle at 35% 35%, #334155 0%, #111c2d 58%, transparent 100%)",
  ready: "radial-gradient(circle at 35% 35%, #00E5A0 0%, #22D3EE 56%, transparent 100%)",
  processing: "radial-gradient(circle at 35% 35%, #22D3EE 0%, #3B82F6 56%, transparent 100%)",
  degraded: "radial-gradient(circle at 35% 35%, #FBBF24 0%, #A78BFA 56%, transparent 100%)",
  error: "radial-gradient(circle at 35% 35%, #FB7185 0%, #A78BFA 56%, transparent 100%)",
};

/** Static fallback for the dashboard AI-orb widget — a CSS radial glow,
 * no motion, no WebGL. */
function StaticOrbFallback({ state }: { state: IntelligenceCoreState }) {
  return (
    <div
      aria-hidden="true"
      className="size-full rounded-full opacity-80"
      style={{
        background: FALLBACK_GRADIENT[state],
      }}
    />
  );
}

/** The EncifOne Intelligence Core — used both as the dashboard hero's
 * centrepiece and (smaller) elsewhere. `active` is a real, data-driven
 * state (whether this org has AI configured and enabled — see
 * src/lib/ai-gateway), never a cosmetic default: the brief is explicit
 * that AI must never appear to be "working" when none is configured. */
export function AiOrb({ className, state = "ready" }: { className?: string; state?: IntelligenceCoreState }) {
  return (
    <SceneCanvas className={className} fallback={<StaticOrbFallback state={state} />} camera={{ position: [0, 0, 3], fov: 40 }}>
      <AiOrbScene state={state} />
    </SceneCanvas>
  );
}
