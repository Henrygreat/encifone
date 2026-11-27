"use client";

import { useTheme } from "next-themes";
import { Sparkles, Moon, Sun, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const THEME_OPTIONS = [
  {
    value: "aurora",
    label: "Aurora",
    description: "Atmospheric, animated, premium",
    icon: Sparkles,
  },
  {
    value: "professional-dark",
    label: "Professional Dark",
    description: "Restrained, high-density, no glow",
    icon: Moon,
  },
  {
    value: "professional-light",
    label: "Professional Light",
    description: "Clean, corporate-friendly",
    icon: Sun,
  },
] as const;

/**
 * Three complete, named themes (docs/AURORA_DESIGN_SYSTEM.md) — not a
 * light/dark binary toggle. Persistence and no-flash hydration are both
 * handled by next-themes itself (src/components/providers.tsx); this
 * component only reads/writes the current theme name.
 */
export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  // next-themes itself returns `theme: undefined` on the server and on
  // first client render before it reads localStorage — using that
  // directly (rather than a separate mounted-state effect) avoids both
  // the hydration mismatch and a synchronous setState-in-effect.
  const mounted = theme !== undefined;
  const current = THEME_OPTIONS.find((o) => o.value === theme) ?? THEME_OPTIONS[0];
  const CurrentIcon = current.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Change theme">
          {mounted ? <CurrentIcon className="size-4" /> : <Sparkles className="size-4 opacity-0" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Appearance</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {THEME_OPTIONS.map((option) => {
          const Icon = option.icon;
          const selected = mounted && theme === option.value;
          return (
            <DropdownMenuItem
              key={option.value}
              onClick={() => setTheme(option.value)}
              className="flex items-start gap-3 py-2.5"
            >
              <Icon className="mt-0.5 size-4 shrink-0" />
              <span className="flex flex-1 flex-col">
                <span className="text-sm font-medium text-foreground">{option.label}</span>
                <span className="text-xs text-muted-foreground">{option.description}</span>
              </span>
              {selected && <Check className="mt-0.5 size-4 shrink-0 text-primary" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
