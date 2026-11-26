"use client";

import * as React from "react";
import { Canvas, type CanvasProps } from "@react-three/fiber";
import { useWebGLSupport, usePrefersReducedMotion } from "./use-webgl-support";
import { SceneErrorBoundary } from "./scene-error-boundary";

export interface SceneCanvasProps extends Omit<CanvasProps, "dpr" | "fallback"> {
  /** Static CSS/SVG/image content shown instead of the 3D scene — required,
   * not optional, per docs/DESIGN_SYSTEM.md §7: every 3D surface must work
   * with WebGL disabled and must respect prefers-reduced-motion. */
  fallback: React.ReactNode;
  className?: string;
}

/**
 * The one place every 3D surface in the app should mount a `<Canvas>`
 * through. Handles, in order: reduced-motion opt-out, WebGL-support
 * detection, a capped device pixel ratio (never render at native DPR on a
 * 3x phone — not worth the GPU/battery cost for a decorative scene), and a
 * render-error boundary — so a context-creation failure degrades to the
 * fallback instead of crashing the page. Always a client component; the
 * module itself (and therefore `three`/`@react-three/fiber`) must only ever
 * be reached via a `next/dynamic(..., { ssr: false })` import from a
 * Client Component — see docs/DESIGN_SYSTEM.md §7. Never import this
 * directly into a Server Component or a page that renders on the server.
 */
export function SceneCanvas({ fallback, className, children, ...canvasProps }: SceneCanvasProps) {
  const webglSupported = useWebGLSupport();
  const prefersReducedMotion = usePrefersReducedMotion();

  if (webglSupported !== true || prefersReducedMotion) {
    return <div className={className}>{fallback}</div>;
  }

  return (
    <SceneErrorBoundary fallback={<div className={className}>{fallback}</div>}>
      <Canvas
        className={className}
        dpr={[1, Math.min(typeof window !== "undefined" ? window.devicePixelRatio : 1, 2)]}
        gl={{ antialias: true, powerPreference: "low-power" }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener("webglcontextlost", (event) => {
            event.preventDefault();
            console.warn("[3d-scene] WebGL context lost — scene will stop updating until a reload.");
          });
        }}
        {...canvasProps}
      >
        {children}
      </Canvas>
    </SceneErrorBoundary>
  );
}
