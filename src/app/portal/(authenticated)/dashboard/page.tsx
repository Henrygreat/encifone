import Link from "next/link";
import { requireActivePortalSession, getPortalProfile } from "@/modules/portal/auth";
import { getPortalOnboarding } from "@/modules/onboarding/service";
import { listNotificationsForPortalUser } from "@/modules/notifications/service";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";

function greeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function PortalDashboardPage() {
  const session = await requireActivePortalSession();
  const [profile, onboarding, notifications] = await Promise.all([
    getPortalProfile(session),
    getPortalOnboarding(session),
    listNotificationsForPortalUser(session, true),
  ]);

  const mandatorySteps = onboarding?.steps.filter((s) => s.isMandatory) ?? [];
  const completedMandatory = mandatorySteps.filter((s) => s.status === "COMPLETED").length;
  const progressPercent = mandatorySteps.length ? Math.round((completedMandatory / mandatorySteps.length) * 100) : 0;
  const nextStep = onboarding?.steps.find(
    (s) => s.assignedTo === "CLIENT" && (s.status === "PENDING" || s.status === "IN_PROGRESS")
  );

  return (
    <>
      <div>
        <p className="text-sm text-muted-foreground">
          {greeting(new Date().getHours())}, {profile.name ?? profile.email}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{profile.client.name}</h1>
      </div>

      <Button asChild variant="outline" className="self-start"><Link href="/portal/finance">Invoices and estimates</Link></Button>

      {onboarding ? (
        <Card>
          <CardHeader>
            <CardTitle>Onboarding progress</CardTitle>
            <CardDescription>
              {onboarding.status === "COMPLETED"
                ? "All done — your onboarding is complete."
                : `${completedMandatory} of ${mandatorySteps.length} required steps complete.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Progress value={progressPercent} />
            {nextStep ? (
              <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
                <div>
                  <p className="text-sm font-medium">Next up: {nextStep.label}</p>
                  {nextStep.description && <p className="text-sm text-muted-foreground">{nextStep.description}</p>}
                </div>
                <Button asChild size="sm">
                  <Link href="/portal/onboarding">Continue</Link>
                </Button>
              </div>
            ) : onboarding.status !== "COMPLETED" ? (
              <p className="text-sm text-muted-foreground">
                Nothing needs your attention right now — we&apos;ll notify you when the next step is ready.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Welcome</CardTitle>
            <CardDescription>Your onboarding hasn&apos;t started yet — check back soon.</CardDescription>
          </CardHeader>
        </Card>
      )}

      {notifications.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent updates</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {notifications.slice(0, 5).map((n) => (
              <div key={n.id} className="text-sm">
                <p className="font-medium">{n.title}</p>
                {n.body && <p className="text-muted-foreground">{n.body}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="flex gap-3">
        <Button asChild variant="outline">
          <Link href="/portal/documents">View documents</Link>
        </Button>
      </div>
    </>
  );
}
