import { readFileSync } from "node:fs";
import { join } from "node:path";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { formatFinanceMoney } from "@/lib/finance-money";

export const documentTemplates = [
  "modern",
  "corporate",
  "executive",
  "contemporary",
] as const;
export type DocumentTemplate = (typeof documentTemplates)[number];

export interface DocumentLine {
  description: string;
  quantity: number;
  unitPriceMinor: number;
  discountMinor: number;
  taxRateBps: number;
  lineTotalMinor: number;
}

export interface FinancialDocument {
  title: string;
  reference?: string;
  status?: string;
  draft?: boolean;
  sample?: boolean;
  currency: string;
  locale?: string;
  seller: string[];
  customer?: string[];
  details: { label: string; value: string }[];
  lines: DocumentLine[];
  summary: { label: string; minor: number }[];
  notes?: string[];
  footer?: string;
  onlineUrl?: string;
  payOnline?: boolean;
  paymentQr?: boolean;
  logo?: Buffer;
  template: DocumentTemplate;
  primary?: string;
  secondary?: string;
  font?: "sans" | "serif";
}

const layouts = {
  modern: {
    primary: "#155E75",
    secondary: "#ECFEFF",
    masthead: 108,
    font: "sans",
  },
  corporate: {
    primary: "#18365D",
    secondary: "#EAF1FA",
    masthead: 128,
    font: "sans",
  },
  executive: {
    primary: "#312345",
    secondary: "#F2EDF7",
    masthead: 151,
    font: "serif",
  },
  contemporary: {
    primary: "#115E59",
    secondary: "#E6F5F2",
    masthead: 116,
    font: "sans",
  },
} as const;

const fontFiles = {
  sans: ["inter-latin-400-normal.woff", "inter-latin-700-normal.woff"],
  serif: [
    "source-serif-4-latin-400-normal.woff",
    "source-serif-4-latin-700-normal.woff",
  ],
};

function contrastingText(hex: string) {
  const rgb = [1, 3, 5].map(
    (offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255,
  );
  const luminance = rgb.reduce(
    (sum, value, i) =>
      sum +
      [0.2126, 0.7152, 0.0722][i] *
        (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4),
    0,
  );
  return luminance > 0.179 ? "#111827" : "#FFFFFF";
}

export async function renderFinancialDocument(
  input: FinancialDocument,
): Promise<Buffer> {
  const style = layouts[input.template];
  const primary = input.primary ?? style.primary;
  const secondary = input.secondary ?? style.secondary;
  const doc = new PDFDocument({
    size: "A4",
    margin: 0,
    autoFirstPage: false,
    bufferPages: true,
    info: { Title: input.title },
  });
  const chunks: Buffer[] = [];
  const qr =
    input.onlineUrl && input.payOnline && input.paymentQr
      ? await QRCode.toBuffer(input.onlineUrl, {
          width: 330,
          errorCorrectionLevel: "M",
        })
      : null;
  const result = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const [regular, bold] = fontFiles[input.font ?? style.font];
  doc.registerFont(
    "Regular",
    readFileSync(join(process.cwd(), "src/modules/finance/fonts", regular)),
  );
  doc.registerFont(
    "Bold",
    readFileSync(join(process.cwd(), "src/modules/finance/fonts", bold)),
  );
  const left = 43;
  const width = 509;
  const bottom = 772;
  const money = (value: number) =>
    formatFinanceMoney(value, input.currency, {
      locale: input.locale ?? "en-GB",
      currencyDisplay: "code",
    });
  const dateDetails = input.details.map(
    ({ label, value }) => `${label}: ${value}`,
  );
  const reference = [
    input.reference,
    input.draft ? "DRAFT" : input.status,
    input.sample ? "SAMPLE" : "",
  ]
    .filter(Boolean)
    .join("  /  ");
  const title = input.title;
  let y = 0;

  const text = (
    value: string,
    x: number,
    top: number,
    size: number,
    options: PDFKit.Mixins.TextOptions,
    colour = "#172132",
    font = "Regular",
  ) => {
    doc
      .font(font)
      .fontSize(size)
      .fillColor(colour)
      .text(value, x, top, options);
  };

  function page(first = false) {
    doc.addPage();
    if (!first) {
      text(title, left, 40, 13, { width }, primary, "Bold");
      if (reference) text(reference, left, 62, 9, { width });
      y = 87;
      return;
    }
    const full =
      input.template === "corporate" || input.template === "executive";
    if (full) doc.rect(0, 0, doc.page.width, style.masthead).fill(primary);
    else {
      doc.rect(0, 0, doc.page.width, 6).fill(primary);
      if (input.template === "contemporary")
        doc.roundedRect(382, 40, 170, 67, 8).fill(secondary);
    }
    const ink = full ? contrastingText(primary) : "#172132";
    text(
      title,
      left,
      40,
      input.template === "executive" ? 33 : 27,
      { width: 315 },
      ink,
      "Bold",
    );
    if (reference) text(reference, left, 82, 10, { width: 315 }, ink, "Bold");
    if (input.logo)
      doc.image(input.logo, 395, input.template === "contemporary" ? 118 : 38, {
        fit: [150, 60],
        align: "right",
      });
    if (input.template === "contemporary" && input.summary.length) {
      const due = input.summary[input.summary.length - 1];
      const cardInk = contrastingText(secondary);
      text(due.label, 396, 52, 9, { width: 143 }, cardInk);
      text(money(due.minor), 396, 73, 15, { width: 143 }, cardInk, "Bold");
    }
    y = style.masthead + 25;
  }

  function block(lines: string[], x: number, start: number, maxWidth: number) {
    return lines.filter(Boolean).reduce((top, line) => {
      text(line, x, top, 10, { width: maxWidth, lineGap: 2 });
      return doc.y + 2;
    }, start);
  }

  const columns = [
    { label: "Description", width: 214 },
    { label: "Qty", width: 35 },
    { label: "Unit price", width: 73 },
    { label: "Discount", width: 64 },
    { label: "Tax", width: 41 },
    { label: "Amount", width: 82 },
  ];
  function row(values: string[], isHeader: boolean, rowHeight: number) {
    if (isHeader) doc.rect(left, y, width, rowHeight).fill(secondary);
    let x = left;
    values.forEach((value, index) => {
      const span = columns[index].width;
      text(
        value,
        x + 5,
        y + 7,
        9,
        { width: span - 10, align: index ? "right" : "left" },
        isHeader ? contrastingText(secondary) : "#172132",
        isHeader ? "Bold" : "Regular",
      );
      x += span;
    });
    y += rowHeight;
    if (!isHeader)
      doc
        .moveTo(left, y)
        .lineTo(left + width, y)
        .lineWidth(0.4)
        .stroke("#D4DBE4");
  }

  page(true);
  const sellerEnd = block(input.seller, left, y, 230);
  const customerEnd = block(
    input.customer?.length ? ["Billed to", ...input.customer] : [],
    302,
    y,
    240,
  );
  const infoStart =
    Math.max(
      sellerEnd,
      customerEnd,
      input.template === "contemporary" && input.logo ? 180 : 0,
    ) + 16;
  y = block(dateDetails, left, infoStart, width) + 16;
  if (input.lines.length) {
    if (y + 50 > bottom) page();
    row(
      columns.map(({ label }) => label),
      true,
      25,
    );
  }
  for (const line of input.lines) {
    const values = [
      line.description,
      String(line.quantity),
      money(line.unitPriceMinor),
      line.discountMinor ? money(line.discountMinor) : "—",
      `${line.taxRateBps / 100}%`,
      money(line.lineTotalMinor),
    ];
    doc.font("Regular").fontSize(9);
    const height =
      Math.max(
        ...values.map((value, index) =>
          doc.heightOfString(value, { width: columns[index].width - 10 }),
        ),
      ) + 16;
    if (y + height > bottom) {
      page();
      row(
        columns.map(({ label }) => label),
        true,
        25,
      );
    }
    row(values, false, height);
  }
  y += 18;
  if (y + input.summary.length * 24 > bottom) page();
  input.summary.forEach(({ label, minor }, index) => {
    const last = index === input.summary.length - 1;
    if (last) doc.roundedRect(281, y, 271, 24, 4).fill(primary);
    const ink = last ? contrastingText(primary) : "#172132";
    text(label, 290, y + 6, 10, { width: 126 }, ink, last ? "Bold" : "Regular");
    text(
      money(minor),
      417,
      y + 6,
      10,
      { width: 125, align: "right" },
      ink,
      "Bold",
    );
    y += 24;
  });
  if (input.onlineUrl && !input.draft) {
    const actionHeight = qr ? 105 : 42;
    if (y + actionHeight > bottom) page();
    doc.roundedRect(left, y + 9, 118, 25, 4).fill(primary);
    text(
      input.payOnline ? "Pay Now" : "View invoice online",
      left,
      y + 16,
      10,
      { width: 118, align: "center" },
      contrastingText(primary),
      "Bold",
    );
    doc.link(left, y + 9, 118, 25, input.onlineUrl);
    if (qr) {
      doc.image(qr, left + 130, y, { width: 94 });
      doc.link(left + 130, y, 94, 94, input.onlineUrl);
    }
    y += actionHeight;
  }
  for (const note of input.notes ?? []) {
    if (!note) continue;
    doc.font("Regular").fontSize(10);
    if (y + doc.heightOfString(note, { width }) + 14 > bottom) page();
    y = block([note], left, y + 9, width);
  }
  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index++) {
    doc.switchToPage(index);
    doc
      .moveTo(left, 790)
      .lineTo(left + width, 790)
      .lineWidth(0.5)
      .stroke("#D4DBE4");
    if (input.footer)
      text(input.footer, left, 800, 8, {
        width: 405,
        height: 24,
        ellipsis: true,
      });
    text(`${index + 1} / ${range.count}`, 463, 800, 8, {
      width: 89,
      align: "right",
    });
  }
  doc.end();
  return result;
}
