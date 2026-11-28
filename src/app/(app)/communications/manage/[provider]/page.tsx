import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { Capability, roleHasCapability } from "@/core/permissions";
import { requireActiveMembership } from "@/core/tenancy";
import { env } from "@/lib/env";
import { listWidgetSettings, saveWidget, widgetSchema } from "@/modules/inbox/chat";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MailboxSettings } from "../../mailboxes";
import { SmsSettings } from "../../sms-numbers";
import { CopyField } from "../../copy-field";

export default async function ManageIntegration({ params, searchParams }: { params: Promise<{ provider: string }>; searchParams: Promise<{ result?: string; widget?: string }> }) {
  const acting = await requireActiveMembership();
  if (!roleHasCapability(acting.role, Capability.ORG_UPDATE_SETTINGS)) notFound();
  const { provider } = await params;
  if (!["resend", "twilio", "website-chat"].includes(provider)) notFound();
  const { result, widget: selectedWidget } = await searchParams;
  const widgets = provider === "website-chat" ? await listWidgetSettings(acting) : [];
  const widget = widgets.find((item) => item.publicKey === selectedWidget);
  if (provider === "website-chat" && selectedWidget && !widget) notFound();
  async function save(form: FormData) {
    "use server";
    const member = await requireActiveMembership();
    const key = form.has("key") ? z.uuid().parse(form.get("key")) : undefined;
    const input = widgetSchema.safeParse({
      name: form.get("name"), widgetName: form.get("widgetName"), welcome: form.get("welcome"), colour: form.get("colour"),
      origins: String(form.get("origins") ?? "").split(/[\s,]+/).filter(Boolean),
      privacyNotice: form.get("privacy"), position: form.get("position"), enabled: form.has("enabled"),
    });
    const settingsUrl = "/communications/manage/website-chat";
    if (!input.success) redirect(`${settingsUrl}?result=invalid${key ? `&widget=${key}` : ""}`);
    const saved = await saveWidget(member, input.data, key);
    redirect(`${settingsUrl}?result=saved&widget=${saved.publicKey}`);
  }
  const snippet = widget ? `<script defer src="${new URL("/encifone-chat.js", env.APP_URL)}" data-widget="${widget.publicKey}"></script>` : null;
  return (
    <div className="flex max-w-4xl flex-col gap-5 p-4 sm:p-6">
      <Link href="/communications" className="text-sm underline underline-offset-4">Communication Centre</Link>
      <PageHeader title={provider === "resend" ? "Resend" : provider === "twilio" ? "Twilio SMS" : "EncifOne Website Chat"} />
      {provider === "website-chat" && <Card>
        <CardHeader><CardTitle>Website chat</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <nav aria-label="Chat widgets" className="flex flex-wrap gap-3 text-sm">
            <Link className="underline" href="/communications/manage/website-chat" aria-current={!widget ? "page" : undefined}>New widget</Link>
            {widgets.map((item) => <Link key={item.publicKey} aria-current={widget?.publicKey === item.publicKey ? "page" : undefined}
              className="break-all underline" href={`?widget=${item.publicKey}`}>{item.widgetName ?? item.name}{item.enabled ? "" : " (disabled)"}</Link>)}
          </nav>
          {result === "invalid" && <p role="alert">Check the fields and enter complete HTTPS origins without paths.</p>}
          {result === "saved" && <p role="status">Website chat settings saved.</p>}
          <form key={widget?.publicKey ?? "new"} action={save} className="grid gap-3 sm:grid-cols-2">
            {widget && <input type="hidden" name="key" value={widget.publicKey} />}
            <Label className="grid gap-1">Widget name<Input name="widgetName" defaultValue={widget?.widgetName ?? widget?.name} required maxLength={80} /></Label>
            <Label className="grid gap-1">Brand name<Input name="name" defaultValue={widget?.name} required maxLength={80} /></Label>
            <Label className="grid gap-1">Welcome message<Input name="welcome" defaultValue={widget?.welcome} required maxLength={300} /></Label>
            <Label className="grid gap-1">Accent colour<Input type="color" name="colour" defaultValue={widget?.colour ?? "#155e75"} /></Label>
            <Label className="grid gap-1">Position<select name="position" className="rounded-md border bg-background p-2" defaultValue={widget?.position ?? "right"}><option value="right">Right</option><option value="left">Left</option></select></Label>
            <Label className="grid gap-1 sm:col-span-2">Allowed website origins<Input name="origins" defaultValue={widget?.origins.join(", ")} required placeholder="https://example.com" /></Label>
            <Label className="grid gap-1 sm:col-span-2">Privacy notice<textarea name="privacy" defaultValue={widget?.privacyNotice} required maxLength={500} className="rounded-md border bg-background p-2" /></Label>
            <Label><input name="enabled" type="checkbox" defaultChecked={widget?.enabled ?? true} /> Enable website chat</Label>
            <Button type="submit" className="justify-self-start">Save widget</Button>
          </form>
          {widget && snippet && <div className="space-y-3 border-t pt-4">
            <h2 className="font-medium">Widget installation</h2>
            <p className="text-sm text-muted-foreground">Paste the snippet into the footer of a website on your allowed origins. Load the site and refresh this page to confirm detection.</p>
            <CopyField label="Installation snippet" value={snippet} multiline />
            <CopyField label="Widget identifier" value={widget.publicKey} />
            <p className="break-all text-sm" role="status">{widget.lastConnectedAt
              ? `Last detected ${widget.lastConnectedAt.toISOString()} at ${widget.lastConnectedOrigin}`
              : "No website connection detected yet."}</p>
          </div>}
        </CardContent>
      </Card>}
      {provider === "resend" && <MailboxSettings result={result} />}
      {provider === "twilio" && <SmsSettings result={result} />}
    </div>
  );
}
