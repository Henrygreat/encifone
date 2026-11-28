import { getFinanceDocumentOptions } from "@/modules/finance/service";
import { Capability, roleHasCapability } from "@/core/permissions";
import { requireActiveMembership } from "@/core/tenancy";
import { FinanceList } from "./finance-list";

export default async function Page() {
  const acting = await requireActiveMembership();
  const options = roleHasCapability(acting.role, Capability.FINANCE_MANAGE) ? await getFinanceDocumentOptions(acting) : null;
  return <>
    {roleHasCapability(acting.role, Capability.ORG_UPDATE_SETTINGS) && (
      <Link href="/finance-settings" className="mx-6 mt-4 self-start text-sm underline">Finance &amp; Billing settings</Link>
    )}
    <FinanceList options={options} />
  </>;
}
import Link from "next/link";
