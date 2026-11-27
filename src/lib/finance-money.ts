export function formatFinanceMoney(
  minor: number | null | undefined,
  currency: string,
  options?: { locale: string; currencyDisplay: "code" },
): string {
  if (minor === null || minor === undefined) return "—";
  const formatter = new Intl.NumberFormat(options?.locale, { style: "currency", currency, currencyDisplay: options?.currencyDisplay });
  const scale = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  return formatter.format(minor / 10 ** scale);
}
