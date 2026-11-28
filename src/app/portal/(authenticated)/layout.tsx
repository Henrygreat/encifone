import { redirect } from "next/navigation";
import { getPortalProfile, PortalUnauthenticatedError, requireActivePortalSession } from "@/modules/portal/auth";
import { PortalShell } from "@/components/portal/portal-shell";
import { resolvePortalBranding } from "@/config/branding";

export default async function PortalAuthenticatedLayout({ children }: { children: React.ReactNode }) {
  let session;
  try {
    session = await requireActivePortalSession();
  } catch (error) {
    if (error instanceof PortalUnauthenticatedError) {
      redirect("/portal/login");
    }
    throw error;
  }

  const profile = await getPortalProfile(session);

  return (
    <PortalShell identity={resolvePortalBranding(profile.organisation.name, profile.organisation.branding)} clientName={profile.client.name}>
      {children}
    </PortalShell>
  );
}
