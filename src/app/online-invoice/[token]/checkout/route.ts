import { env } from "@/lib/env";
import { startInvoiceCheckout } from "@/modules/finance/invoice-checkout";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  if (
    request.headers.get("sec-fetch-site") !== "same-origin" &&
    request.headers.get("origin") !== new URL(env.APP_URL).origin
  ) {
    return new Response(null, { status: 403 });
  }
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/.test(token))
    return new Response(null, { status: 404 });
  let url: string;
  try {
    url = await startInvoiceCheckout(token);
  } catch {
    url = new URL(
      `/online-invoice/${token}?checkout=unavailable`,
      env.APP_URL,
    ).toString();
  }
  return new Response(null, {
    status: 303,
    headers: {
      Location: url,
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "no-store",
    },
  });
}
