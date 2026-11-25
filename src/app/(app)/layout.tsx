import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { requireActiveMembership, NoActiveOrganisationError, UnauthenticatedError } from "@/core/tenancy";
import { AppShell } from "@/components/app-shell/app-shell";

async function resolveActiveOrganisationId(): Promise<string | "no-organisation"> {
  try {
    const { organisationId } = await requireActiveMembership();
    return organisationId;
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      redirect("/login");
    }
    if (error instanceof NoActiveOrganisationError) {
      return "no-organisation";
    }
    throw error;
  }
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    redirect("/login");
  }

  const organisationId = await resolveActiveOrganisationId();

  if (organisationId === "no-organisation") {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-center">
        <p className="text-muted-foreground">
          Your account isn&apos;t a member of any organisation yet.
        </p>
      </div>
    );
  }

  return (
    <AppShell activeOrganisationId={organisationId} user={session.user}>
      {children}
    </AppShell>
  );
}
