import { getFinanceDocumentOptions } from "@/modules/finance/service";
import { Capability, roleHasCapability } from "@/core/permissions";
import { requireActiveMembership } from "@/core/tenancy";
import { FinanceList } from "./finance-list";

export default async function Page() {
  const acting = await requireActiveMembership();
  const options = roleHasCapability(acting.role, Capability.FINANCE_MANAGE) ? await getFinanceDocumentOptions(acting) : null;
  return <FinanceList options={options} />;
}
