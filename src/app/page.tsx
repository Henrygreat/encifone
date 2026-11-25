import Link from "next/link";
import { Button } from "@/components/ui/button";
import { branding } from "@/config/branding";

/**
 * Minimal placeholder landing page. The full marketing site (docs/PRODUCT_REQUIREMENTS.md
 * §6, docs/ROADMAP.md Phase 6+) is explicitly out of scope for Phase 1 — this
 * exists only so the root route isn't the Next.js starter page.
 */
export default function MarketingHome() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 bg-background px-6 py-24 text-center">
      <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
        Building in public — Phase 1
      </span>
      <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
        {branding.productName}
      </h1>
      <p className="max-w-xl text-lg font-medium text-foreground">{branding.tagline}</p>
      <p className="max-w-xl text-lg text-muted-foreground">{branding.secondaryTagline}</p>
      <div className="flex gap-3">
        <Button asChild size="lg">
          <Link href="/register">Get started</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/login">Sign in</Link>
        </Button>
      </div>
    </div>
  );
}
