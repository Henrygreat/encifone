"use client";

import * as React from "react";

/**
 * Catches a WebGL context-creation failure or any render error thrown from
 * inside a <Canvas> subtree and swaps to the caller's static fallback
 * instead of taking the whole page down. React Error Boundaries must be
 * class components — there is no hook equivalent.
 */
export class SceneErrorBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("[3d-scene] render failed, falling back to static content:", error);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}
