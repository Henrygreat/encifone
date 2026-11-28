import { redirect } from "next/navigation";
import { requireActiveMembership } from "@/core/tenancy";
import { env } from "@/lib/env";
import { configureMailbox, listMailboxes, mailboxSchema, manageMailbox } from "@/modules/inbox/email";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export async function MailboxSettings({ result }: { result?: string }) {
  const mailboxes = await listMailboxes(await requireActiveMembership());
  async function configure(form: FormData) {
    "use server";
    const acting = await requireActiveMembership();
    const input = mailboxSchema.safeParse({ address: form.get("address"), apiKey: form.get("apiKey"), webhook: form.get("webhook") });
    if (!input.success) redirect("/communications/manage/resend?result=mail-invalid");
    await configureMailbox(acting, input.data);
    redirect("/communications/manage/resend?result=mail-saved");
  }
  async function action(form: FormData) {
    "use server";
    const acting = await requireActiveMembership();
    const command = form.get("command");
    if (command !== "test" && command !== "enable" && command !== "disable" && command !== "disconnect") return;
    try { await manageMailbox(acting, String(form.get("id")), command); }
    catch { redirect("/communications/manage/resend?result=mail-failed"); }
    redirect("/communications/manage/resend?result=mail-updated");
  }
  return <Card>
    <CardHeader><CardTitle>Shared Resend mailboxes</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      {result?.startsWith("mail-") && <p role={result === "mail-invalid" || result === "mail-failed" ? "alert" : "status"}>
        {result === "mail-invalid" ? "Enter a mailbox address, Resend API key, and webhook signing secret."
          : result === "mail-failed" ? "The requested mailbox operation failed." : "Mailbox settings updated."}
      </p>}
      <p className="text-sm text-muted-foreground">Use an address configured for receiving and sending in Resend.</p>
      <form action={configure} className="grid gap-3 sm:grid-cols-2">
        <Label className="grid gap-1">Mailbox address<Input name="address" type="email" required /></Label>
        <Label className="grid gap-1">Resend API key<Input name="apiKey" type="password" autoComplete="new-password" required maxLength={300} /></Label>
        <Label className="grid gap-1">Webhook signing secret<Input name="webhook" type="password" autoComplete="new-password" required maxLength={300} /></Label>
        <Button type="submit" className="self-end justify-self-start">Connect or replace credentials</Button>
      </form>
      {mailboxes.map((mailbox) => <div className="space-y-2 rounded-md border p-3" key={mailbox.id}>
        <p className="break-all text-sm">{mailbox.address} · {mailbox.enabled ? "Enabled" : "Disabled"}</p>
        <Label className="grid gap-1">Webhook URL<Input readOnly value={new URL(`/api/v1/webhooks/inbox-email/${mailbox.publicKey}`, env.APP_URL).toString()} /></Label>
        <p className="text-sm text-muted-foreground">Last incoming email: {mailbox.lastSyncAt?.toISOString() ?? "None received"}</p>
        {mailbox.lastError && <p className="text-sm text-destructive">{mailbox.lastError}</p>}
        <form action={action} className="flex flex-wrap gap-2">
          <input type="hidden" name="id" value={mailbox.id} />
          <Button type="submit" name="command" value="test" variant="outline">Test receiving access</Button>
          <Button type="submit" name="command" value={mailbox.enabled ? "disable" : "enable"} variant="outline">{mailbox.enabled ? "Disable" : "Enable"}</Button>
          <Button type="submit" name="command" value="disconnect" variant="outline">Disconnect credentials</Button>
        </form>
      </div>)}
    </CardContent>
  </Card>;
}
