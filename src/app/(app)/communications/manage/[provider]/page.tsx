import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Capability, roleHasCapability } from "@/core/permissions";
import { requireActiveMembership } from "@/core/tenancy";
import { env } from "@/lib/env";
import { getWidgetSettings, saveWidget, widgetSchema } from "@/modules/inbox/chat";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MailboxSettings } from "../../mailboxes";
import { SmsSettings } from "../../sms-numbers";

export default async function ManageIntegration({ params, searchParams }: { params: Promise<{ provider: string }>; searchParams: Promise<{ result?: string }> }) {
  const acting = await requireActiveMembership();
  if (!roleHasCapability(acting.role, Capability.ORG_UPDATE_SETTINGS)) notFound();
  const { provider } = await params;
  if (!["resend", "twilio", "website-chat"].includes(provider)) notFound();
  const widget = provider === "website-chat" ? await getWidgetSettings(acting) : null;
  const { result } = await searchParams;
  async function save(form: FormData) {
    "use server";
    const member = await requireActiveMembership();
    const input = widgetSchema.safeParse({
      name: form.get("name"), welcome: form.get("welcome"), colour: form.get("colour"),
      origins: String(form.get("origins") ?? "").split(/[\s,]+/).filter(Boolean),
      privacyNotice: form.get("privacy"), position: form.get("position"), enabled: form.has("enabled"),
    });
    if (!input.success) redirect("/communications/manage/website-chat?result=invalid");
    await saveWidget(member, input.data);
    redirect("/communications/manage/website-chat?result=saved");
  }
  const snippet = widget ? `<script defer src="${new URL("/encifone-chat.js", env.APP_URL)}" data-widget="${widget.publicKey}"></script>` : null;
  return (
    <div className="flex max-w-4xl flex-col gap-5 p-4 sm:p-6">
      <Link href="/communications" className="text-sm underline underline-offset-4">Communication Centre</Link>
      <PageHeader title={provider === "resend" ? "Resend" : provider === "twilio" ? "Twilio SMS" : "EncifOne Website Chat"} />
      {provider === "website-chat" && <Card>
        <CardHeader><CardTitle>Website chat</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {result === "invalid" && <p role="alert">Check the fields and enter complete HTTPS origins without paths.</p>}
          {result === "saved" && <p role="status">Website chat settings saved.</p>}
          <form action={save} className="grid gap-3 sm:grid-cols-2">
            <Label className="grid gap-1">Brand name<Input name="name" defaultValue={widget?.name} required maxLength={80} /></Label>
            <Label className="grid gap-1">Welcome message<Input name="welcome" defaultValue={widget?.welcome} required maxLength={300} /></Label>
            <Label className="grid gap-1">Accent colour<Input type="color" name="colour" defaultValue={widget?.colour ?? "#155e75"} /></Label>
            <Label className="grid gap-1">Position<select name="position" className="rounded-md border bg-background p-2" defaultValue={widget?.position ?? "right"}><option value="right">Right</option><option value="left">Left</option></select></Label>
            <Label className="grid gap-1 sm:col-span-2">Allowed website origins<Input name="origins" defaultValue={widget?.origins.join(", ")} required placeholder="https://example.com" /></Label>
            <Label className="grid gap-1 sm:col-span-2">Privacy notice<textarea name="privacy" defaultValue={widget?.privacyNotice} required maxLength={500} className="rounded-md border bg-background p-2" /></Label>
            <Label><input name="enabled" type="checkbox" defaultChecked={widget?.enabled ?? true} /> Enable website chat</Label>
            <Button type="submit" className="justify-self-start">Save widget</Button>
          </form>
          {snippet && <Label className="grid gap-1">Installation snippet<textarea readOnly className="min-h-20 rounded-md border bg-background p-2 font-mono text-sm" value={snippet} /></Label>}
        </CardContent>
      </Card>}
      {provider === "resend" && <MailboxSettings result={result} />}
      {provider === "twilio" && <SmsSettings result={result} />}
    </div>
  );
}
