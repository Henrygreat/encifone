import { requireActivePortalSession } from "@/modules/portal/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export default async function PortalProjectsPage() {
  const session = await requireActivePortalSession();
  const projects = await prisma.project.findMany({
    where: { organisationId: session.organisationId, clientId: session.clientId, isClientVisible: true, archivedAt: null },
    include: { milestones: { where: { isClientVisible: true }, orderBy: { dueDate: "asc" } } },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
      {projects.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No visible projects yet</CardTitle>
            <CardDescription>Your team will publish project updates here as delivery begins.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        projects.map((project) => (
          <Card key={project.id}>
            <CardHeader>
              <CardTitle>{project.name}</CardTitle>
              <CardDescription>Status: {project.status.replaceAll("_", " ")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Progress value={project.progressPercent} />
              <p className="text-sm text-muted-foreground">Progress: {project.progressPercent}%</p>
              {project.milestones.length > 0 && (
                <ul className="space-y-1 text-sm">
                  {project.milestones.slice(0, 5).map((milestone) => (
                    <li key={milestone.id} className="flex items-center justify-between">
                      <span>{milestone.title}</span>
                      <span className="text-muted-foreground">{milestone.status.replaceAll("_", " ")}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
