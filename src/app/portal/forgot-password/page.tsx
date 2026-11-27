"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { branding } from "@/config/branding";

const forgotSchema = z.object({
  email: z.string().email("Enter a valid email address"),
});
type ForgotInput = z.infer<typeof forgotSchema>;

export default function PortalForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetUrl, setResetUrl] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotInput>({ resolver: zodResolver(forgotSchema) });

  async function onSubmit(input: ForgotInput) {
    setError(null);
    setResetUrl(null);
    const res = await fetch("/api/portal/auth/request-password-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    if (!res.ok) {
      const result = await res.json().catch(() => null);
      setError(result?.error ?? "Could not process your request.");
      return;
    }

    const result = (await res.json().catch(() => null)) as { resetUrl?: string } | null;
    setSubmitted(true);
    if (result?.resetUrl) {
      setResetUrl(result.resetUrl);
    }
  }

  return (
    <div className="theme-client-portal flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-elevated">
        <p className="text-center text-sm text-muted-foreground">{branding.productName} Client Portal</p>
        <h1 className="mt-1 text-center text-xl font-semibold text-foreground">Reset password</h1>

        {submitted ? (
          <div className="mt-6 space-y-3 text-sm text-muted-foreground">
            <p>
              If an account exists for that email, a reset link has been prepared. Contact your account team if you do
              not receive it.
            </p>
            {resetUrl && (
              <p>
                Development reset link: <a className="underline" href={resetUrl}>{resetUrl}</a>
              </p>
            )}
            <Link href="/portal/login" className="inline-block text-foreground underline underline-offset-2">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" {...register("email")} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Submitting…" : "Send reset instructions"}
            </Button>
            <Link href="/portal/login" className="text-center text-xs text-muted-foreground underline underline-offset-2">
              Back to sign in
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
