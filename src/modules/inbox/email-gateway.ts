import { Webhook } from "svix";
import { z } from "zod";

export interface MailGateway {
  receive(id: string): Promise<ReceivedEmail>;
  send(input: { from: string; to: string; subject: string; body: string; requestKey: string; inReplyTo?: string }): Promise<string>;
  test(): Promise<void>;
}

const replyId = z.string().regex(/^<[^\s<>]{1,250}>$/);
const received = z.object({
  id: z.uuid(), from: z.string().max(500), to: z.array(z.string().max(500)).max(100),
  subject: z.string().max(1000).nullable().optional(),
  text: z.string().nullable().optional(), message_id: z.string().optional(),
  headers: z.record(z.string(), z.unknown()).nullable().optional(),
});
type ReceivedEmail = z.infer<typeof received>;

export const mailEventSchema = z.object({
  type: z.string(),
  data: z.object({ email_id: z.uuid() }),
});

export function verifyMailEvent(raw: string, headers: Headers, secret: string) {
  new Webhook(secret).verify(raw, {
    "svix-id": headers.get("svix-id") ?? "",
    "svix-timestamp": headers.get("svix-timestamp") ?? "",
    "svix-signature": headers.get("svix-signature") ?? "",
  });
  return mailEventSchema.safeParse(JSON.parse(raw)).data;
}

export class MailProviderError extends Error {
  constructor(readonly definitive: boolean) {
    super("The email provider did not confirm the request.");
  }
}

async function getJson(response: Response) {
  if (!response.ok) throw new MailProviderError(response.status >= 400 && response.status < 500 && response.status !== 429);
  const reader = response.body?.getReader();
  if (!reader) throw new MailProviderError(false);
  const decoder = new TextDecoder();
  let text = "";
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 1_500_000) {
      await reader.cancel();
      throw new MailProviderError(true);
    }
    text += decoder.decode(value, { stream: true });
  }
  return JSON.parse(text + decoder.decode()) as unknown;
}

export function resendMailbox(apiKey: string): MailGateway {
  const request = (path: string, options?: RequestInit) => fetch(`https://api.resend.com${path}`, {
    ...options, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(8000),
    headers: { Authorization: `Bearer ${apiKey}`, ...options?.headers },
  });
  return {
    async receive(id) {
      return received.parse(await getJson(await request(`/emails/receiving/${encodeURIComponent(id)}`)));
    },
    async send(input) {
      const inReplyTo = replyId.safeParse(input.inReplyTo).data;
      const result = await getJson(await request("/emails", { method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": input.requestKey },
        body: JSON.stringify({ from: input.from, to: [input.to], subject: input.subject, text: input.body,
          ...(inReplyTo ? { headers: { "In-Reply-To": inReplyTo, References: inReplyTo } } : {}) }),
      }));
      return z.object({ id: z.uuid() }).parse(result).id;
    },
    async test() { await getJson(await request("/emails/receiving?limit=1")); },
  };
}
