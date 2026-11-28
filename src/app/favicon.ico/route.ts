import { branding } from "@/config/branding";

export function GET(request: Request) {
  return Response.redirect(new URL(branding.favicon, request.url), 302);
}
