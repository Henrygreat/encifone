import { z } from "zod";
import { NotFoundError } from "@/lib/api";
import { InvalidSmsWebhook, recordTwilioWebhook } from "@/modules/inbox/sms";

export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!z.uuid().safeParse(key).success) return new Response(null, { status: 404 });
  if (request.headers.get("content-type")?.split(";")[0] !== "application/x-www-form-urlencoded") {
    return new Response(null, { status: 415 });
  }
  const signature = request.headers.get("x-twilio-signature");
  const message = new URL(request.url).searchParams.get("message") ?? undefined;
  const reader = request.body?.getReader();
  if (!signature || !reader || (message && !z.cuid().safeParse(message).success)) return new Response(null, { status: 400 });
  const decoder = new TextDecoder();
  let payload = "";
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 32_768) { await reader.cancel(); return new Response(null, { status: 413 }); }
      payload += decoder.decode(value, { stream: true });
    }
    await recordTwilioWebhook(key, new URLSearchParams(payload + decoder.decode()), signature, message);
    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response/>', {
      headers: { "Content-Type": "text/xml; charset=utf-8" },
    });
  } catch (error) {
    if (error instanceof NotFoundError) return new Response(null, { status: 404 });
    if (error instanceof InvalidSmsWebhook) return new Response(null, { status: 400 });
    return new Response(null, { status: 503 });
  }
}
