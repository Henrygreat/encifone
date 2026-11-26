/** Minor-unit integer -> display string. Division happens only here, for
 * display — the stored/transmitted value is always the integer (CLAUDE.md
 * rule 3). */
export function formatMoneyMinor(valueMinor: number | null | undefined, currency: string): string {
  if (valueMinor === null || valueMinor === undefined) return "—";
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(valueMinor / 100);
}
