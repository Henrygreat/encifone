import { Capability, roleHasCapability } from "@/core/permissions";
import { requireActiveMembership } from "@/core/tenancy";
import { FinanceList } from "./finance-list";

export default async function Page() {
  const acting = await requireActiveMembership();
  return <FinanceList canManage={roleHasCapability(acting.role, Capability.FINANCE_MANAGE)} />;
}
