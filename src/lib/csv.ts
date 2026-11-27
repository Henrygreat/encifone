/**
 * Minimal RFC4180-ish CSV parser/writer — no new dependency for
 * straightforward tabular import/export (quoted fields with escaped "",
 * both CRLF/LF line endings).
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const normalized = text.replace(/\r\n/g, "\n");

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    if (inQuotes) {
      if (char === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

/**
 * Escapes a CSV cell AND neutralises formula injection — a value starting
 * with =, +, -, @, a tab, or a carriage return is exactly what Excel/
 * Google Sheets will interpret as a formula when the file is opened, so
 * it's prefixed with a leading apostrophe (OWASP's standard CSV-injection
 * mitigation) before any further quoting.
 */
export function toCsvValue(value: string): string {
  const needsFormulaGuard = /^[=+\-@\t\r]/.test(value);
  const guarded = needsFormulaGuard ? `'${value}` : value;
  const needsQuoting = /[",\n]/.test(guarded);
  return needsQuoting ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

export function toCsvRow(values: string[]): string {
  return values.map(toCsvValue).join(",");
}
