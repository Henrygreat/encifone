import { z } from "zod";
import { NotFoundError } from "@/lib/api";
import { InvalidMailWebhook, receiveMailboxEvent } from "@/modules/inbox/email";

export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!z.uuid().safeParse(key).success) return new Response(null, { status: 404 });
  const reader = request.body?.getReader();
  if (!reader) return new Response(null, { status: 400 });
  const decoder = new TextDecoder();
  let payload = "";
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 100_000) { await reader.cancel(); return new Response(null, { status: 413 }); }
      payload += decoder.decode(value, { stream: true });
    }
    await receiveMailboxEvent(key, payload + decoder.decode(), request.headers);
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof NotFoundError) return new Response(null, { status: 404 });
    if (error instanceof InvalidMailWebhook) return new Response(null, { status: 400 });
    return new Response(null, { status: 503 });
  }
}
