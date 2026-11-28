import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/api";

// Balance and schedule changes share the same organisation lock.
export async function financeTransaction<T>(
  organisationId: string,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Organisation" WHERE id = ${organisationId} FOR NO KEY UPDATE`;
    return operation(tx);
  });
}

export async function assertNoOnlineCheckout(
  tx: Prisma.TransactionClient,
  invoiceId: string,
) {
  const attempt = await tx.invoiceCheckoutAttempt.findFirst({
    where: {
      invoiceId,
      closedAt: null,
      OR: [
        { providerSessionId: { not: null } },
        { expiresAt: { gt: new Date() } },
      ],
    },
    select: { id: true },
  });
  if (attempt)
    throw new ValidationError([
      "An online checkout is awaiting completion or expiry for this invoice.",
    ]);
}
