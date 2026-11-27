import type { ReactNode } from "react";

/**
 * The header every list/detail page in the app repeats by hand (title +
 * description on the left, actions on the right) — formalised once so
 * every page gets the same spacing/typography automatically, and so a
 * future Aurora UI tweak to this pattern only needs one edit.
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
