import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActiveMembership } from "@/core/tenancy";
import { env } from "@/lib/env";
import { disconnectSmsNumber, listSmsNumbers, saveSmsNumber, smsConfiguration } from "@/modules/inbox/sms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export async function SmsSettings({ result }: { result?: string }) {
  const numbers = await listSmsNumbers(await requireActiveMembership());

  async function connect(form: FormData) {
    "use server";
    const acting = await requireActiveMembership();
    const input = smsConfiguration.safeParse({ number: form.get("number"), accountSid: form.get("account"), token: form.get("token") });
    if (!input.success) redirect("/communications/manage/twilio?result=sms-invalid");
    try {
      await saveSmsNumber(acting, input.data);
    } catch {
      redirect("/communications/manage/twilio?result=sms-invalid");
    }
    redirect("/communications/manage/twilio?result=sms-connected");
  }

  async function disconnect(form: FormData) {
    "use server";
    const acting = await requireActiveMembership();
    await disconnectSmsNumber(acting, z.cuid().parse(form.get("id")));
    redirect("/communications/manage/twilio?result=sms-disconnected");
  }

  return (
    <Card>
      <CardHeader><CardTitle>Twilio SMS numbers</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {result === "sms-invalid" && <p role="alert">The number could not be connected. Check the credentials and confirm it supports SMS.</p>}
        {result === "sms-connected" && <p role="status">Number verified. Configure the incoming message webhook in Twilio.</p>}
        {result === "sms-disconnected" && <p role="status">Number disconnected and stored credentials removed.</p>}
        {numbers.map((number) => (
          <div key={number.id} className="space-y-2 rounded-md border p-3">
            <p>{number.number} · {number.enabled ? "Connected" : "Disconnected"}</p>
            {number.lastSyncAt && <p className="text-sm text-muted-foreground">Last incoming SMS {number.lastSyncAt.toISOString().slice(0, 10)}</p>}
            {number.enabled && <>
              <Label className="grid gap-1">Incoming message webhook URL
                <Input readOnly value={new URL(`/api/v1/webhooks/inbox-sms/${number.publicKey}`, env.APP_URL).toString()} />
              </Label>
              <form action={disconnect}><input type="hidden" name="id" value={number.id} /><Button variant="outline">Disconnect</Button></form>
            </>}
          </div>
        ))}
        <form action={connect} autoComplete="off" className="grid gap-3 sm:grid-cols-2">
          <Label className="grid gap-1">Existing SMS number<Input name="number" type="tel" placeholder="+15551234567" required /></Label>
          <Label className="grid gap-1">Twilio Account SID<Input name="account" required maxLength={34} /></Label>
          <Label className="grid gap-1">Twilio Auth Token<Input name="token" type="password" required maxLength={32} /></Label>
          <Button className="self-end justify-self-start">Verify and connect</Button>
        </form>
      </CardContent>
    </Card>
  );
}
