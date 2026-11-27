import { requireActivePortalSession } from "@/modules/portal/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function PortalKnowledgePage() {
  const session = await requireActivePortalSession();
  const articles = await prisma.knowledgeArticle.findMany({
    where: { organisationId: session.organisationId, status: "PUBLISHED", isClientVisible: true },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Knowledge base</h1>
      {articles.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No published articles</CardTitle>
            <CardDescription>Client-facing guides will appear here once published.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        articles.map((article) => (
          <Card key={article.id}>
            <CardHeader>
              <CardTitle>{article.title}</CardTitle>
              <CardDescription>Updated {article.updatedAt.toLocaleDateString()}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="line-clamp-4 whitespace-pre-wrap text-sm text-muted-foreground">{article.content}</p>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
