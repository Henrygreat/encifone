"use client";

import { useSyncExternalStore } from "react";

/**
 * Client-only WebGL availability probe. Never assume support — some
 * browsers, GPU-blocklisted devices, and headless/CI environments have none.
 * See docs/DESIGN_SYSTEM.md §7 (React Three Fiber) — every 3D surface must
 * degrade to a static fallback rather than crash or blank the page.
 */
function detectWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext("webgl2") || canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
    );
  } catch {
    return false;
  }
}

// WebGL support doesn't change over a page's lifetime, so there is nothing
// to subscribe to — only the client/server snapshot difference matters.
// useSyncExternalStore (rather than useState+useEffect) is the pattern React
// itself recommends for a value that's only knowable on the client, since it
// avoids an extra post-mount render triggered by calling setState from
// inside an effect.
const noopSubscribe = () => () => {};
const getServerWebGLSnapshot = () => null;

/**
 * Resolves to `null` during SSR/first paint (unknown yet), then `true`/`false`
 * once checked client-side. Callers should treat `null` the same as a
 * not-yet-decided state — render the fallback until it resolves, never the
 * 3D scene, to avoid a flash of WebGL content a reduced-motion or
 * WebGL-less visitor never wanted.
 */
export function useWebGLSupport(): boolean | null {
  return useSyncExternalStore(noopSubscribe, detectWebGL, getServerWebGLSnapshot);
}

function getReducedMotionSnapshot(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getServerReducedMotionSnapshot(): boolean {
  return false;
}

function subscribeReducedMotion(callback: () => void): () => void {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, getReducedMotionSnapshot, getServerReducedMotionSnapshot);
}

function getPageVisibleSnapshot(): boolean {
  return document.visibilityState === "visible";
}

function getServerPageVisibleSnapshot(): boolean {
  return true;
}

function subscribePageVisible(callback: () => void): () => void {
  document.addEventListener("visibilitychange", callback);
  return () => document.removeEventListener("visibilitychange", callback);
}

/** Backs every 3D scene's `frameloop="never"` pause when the tab is
 * backgrounded (docs/DESIGN_SYSTEM.md §7's "pause off-screen/hidden"
 * requirement) — a render loop idling on a hidden tab is pure wasted GPU/
 * battery for a purely decorative scene. */
export function usePageVisible(): boolean {
  return useSyncExternalStore(subscribePageVisible, getPageVisibleSnapshot, getServerPageVisibleSnapshot);
}
