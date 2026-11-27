"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { branding } from "@/config/branding";

const acceptInviteSchema = z
  .object({
    name: z.string().max(200).optional(),
    password: z.string().min(8, "At least 8 characters"),
    confirmPassword: z.string().min(1, "Confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });
type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

function AcceptInviteForm() {
  const router = useRouter();
  const token = useSearchParams().get("token");
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AcceptInviteInput>({ resolver: zodResolver(acceptInviteSchema) });

  async function onSubmit(input: AcceptInviteInput) {
    if (!token) return;
    setError(null);
    const res = await fetch("/api/portal/auth/accept-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password: input.password, name: input.name || undefined }),
    });
    if (!res.ok) {
      const result = await res.json().catch(() => null);
      setError(result?.error ?? "Could not accept this invite.");
      return;
    }
    router.push("/portal/dashboard");
  }

  if (!token) {
    return (
      <p className="text-center text-sm text-destructive">
        This invite link is missing its token — check the link you were sent.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Your name (optional)</Label>
        <Input id="name" {...register("name")} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Choose a password</Label>
        <Input id="password" type="password" autoComplete="new-password" {...register("password")} />
        {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <Input id="confirmPassword" type="password" autoComplete="new-password" {...register("confirmPassword")} />
        {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={isSubmitting} className="mt-2">
        {isSubmitting ? "Setting up your account…" : "Activate my account"}
      </Button>
    </form>
  );
}

export default function PortalAcceptInvitePage() {
  return (
    <div className="theme-client-portal flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-elevated">
        <p className="text-center text-sm text-muted-foreground">{branding.productName} Client Portal</p>
        <h1 className="mt-1 text-center text-xl font-semibold text-foreground">Activate your account</h1>
        <Suspense>
          <AcceptInviteForm />
        </Suspense>
      </div>
    </div>
  );
}
