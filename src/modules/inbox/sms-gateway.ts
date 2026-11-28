import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const smsNumberSchema = z.string().regex(/^\+[1-9][0-9]{6,14}$/);
export const twilioSid = z.string().regex(/^AC[a-fA-F0-9]{32}$/);
export const twilioMessageId = z.string().regex(/^(?:SM|MM)[a-fA-F0-9]{32}$/);

export interface SmsGateway {
  verifyNumber(number: string): Promise<boolean>;
  send(input: { from: string; to: string; body: string; callback: string }): Promise<{ providerId: string }>;
}

export function verifyTwilioForm(token: string, url: string, fields: URLSearchParams, signature: string) {
  if (!/^[A-Za-z0-9+/]{27}=$/.test(signature)) return false;
  const keys = [...new Set(fields.keys())].sort();
  const canonical = url + keys.flatMap((key) => [...new Set(fields.getAll(key))].sort().map((value) => key + value)).join("");
  const hmac = createHmac("sha1", token).update(canonical).digest();
  return timingSafeEqual(hmac, Buffer.from(signature, "base64"));
}

const gsm = new Set("@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà");
const gsmExtension = new Set("\f^{}\\[~]|€");
export function smsSegmentEstimate(body: string) {
  let septets = 0;
  for (const character of body) {
    if (gsm.has(character)) septets++;
    else if (gsmExtension.has(character)) septets += 2;
    else return body.length > 70 ? Math.ceil(body.length / 67) : 1;
  }
  return septets > 160 ? Math.ceil(septets / 153) : 1;
}

export class SmsProviderFailure extends Error {
  constructor(readonly definitive: boolean) { super("Twilio did not confirm the request."); }
}

export function twilioGateway(accountSid: string, token: string): SmsGateway {
  const request = (resource: string, fields?: URLSearchParams) => fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/${resource}`, {
    method: fields ? "POST" : "GET", body: fields,
    headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${token}`).toString("base64")}` },
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000),
  });
  return {
    async verifyNumber(number) {
      const response = await request(`IncomingPhoneNumbers.json?${new URLSearchParams({ PhoneNumber: number, PageSize: "1" })}`);
      if (!response.ok) return false;
      const parsed = z.object({ incoming_phone_numbers: z.array(z.object({ phone_number: z.string(), capabilities: z.object({ sms: z.boolean() }) })) }).parse(await response.json());
      return parsed.incoming_phone_numbers.some((item) => item.phone_number === number && item.capabilities.sms);
    },
    async send(input) {
      const response = await request("Messages.json", new URLSearchParams({
        From: input.from, To: input.to, Body: input.body, StatusCallback: input.callback,
      }));
      if (!response.ok) throw new SmsProviderFailure(response.status >= 400 && response.status < 500 && response.status !== 429);
      return { providerId: z.object({ sid: twilioMessageId }).parse(await response.json()).sid };
    },
  };
}
