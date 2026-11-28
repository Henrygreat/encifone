import { NotFoundError, ValidationError } from "@/lib/api";
import { checkRateLimit, clientIpFrom, RateLimitError } from "@/lib/rate-limit";
import { chatActionSchema, findPublicWidget, runChatAction } from "@/modules/inbox/chat";

type Context = { params: Promise<{ key: string }> };

async function readLimitedJson(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder();
  let size = 0;
  let content = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16_000) {
      await reader.cancel();
      throw new ValidationError(["The message is too large."]);
    }
    content += decoder.decode(value, { stream: true });
  }
  try { return JSON.parse(content + decoder.decode()) as unknown; } catch { return null; }
}

async function handle(request: Request, context: Context) {
  const origin = request.headers.get("origin") ?? "";
  const { key } = await context.params;
  const headers = { Vary: "Origin", "Cache-Control": "private, no-store",
    "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type" };
  try {
    const widget = await findPublicWidget(key, origin);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    await checkRateLimit(`chat:${widget.id}:${clientIpFrom(request)}`, 90, 60, true);
    if (request.method === "GET") return Response.json({
      name: widget.name, welcome: widget.welcome, colour: widget.colour, position: widget.position, privacyNotice: widget.privacyNotice,
    }, { headers });
    if (Number(request.headers.get("content-length")) > 16_000) return new Response(null, { status: 413, headers });
    const parsed = chatActionSchema.safeParse(await readLimitedJson(request));
    if (!parsed.success) throw new ValidationError(["Invalid chat request."]);
    const input = parsed.data;
    if (input.action === "start") await checkRateLimit(`chat-start:${widget.id}:${clientIpFrom(request)}`, 8, 600, true);
    return Response.json(await runChatAction(widget, input), { headers });
  } catch (error) {
    if (error instanceof NotFoundError) return new Response(null, { status: 404, headers: { Vary: "Origin", "Cache-Control": "no-store" } });
    if (error instanceof RateLimitError) return Response.json({ error: error.message }, { headers, status: 429 });
    if (error instanceof ValidationError) return Response.json({ error: error.issues[0] }, { headers, status: 400 });
    return Response.json({ error: "Chat is temporarily unavailable." }, { headers, status: 503 });
  }
}

export const GET = handle;
export const OPTIONS = handle;
export const POST = handle;
