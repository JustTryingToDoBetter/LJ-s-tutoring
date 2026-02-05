import PDFDocument from 'pdfkit';

export type InvoiceLine = {
  description: string;
  minutes: number;
  rate: string;
  amount: string;
};

export type InvoiceDetail = {
  invoiceNumber: string;
  tutorName: string;
  periodStart: string;
  periodEnd: string;
  totalAmount: string;
  lines: InvoiceLine[];
};

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function renderInvoiceHtml(detail: InvoiceDetail) {
  const safeInvoiceNumber = escapeHtml(detail.invoiceNumber);
  const safeTutorName = escapeHtml(detail.tutorName);
  const safePeriodStart = escapeHtml(detail.periodStart);
  const safePeriodEnd = escapeHtml(detail.periodEnd);
  const safeTotalAmount = escapeHtml(detail.totalAmount);

  const rows = detail.lines
    .map(
      (line) => `
      <tr>
        <td>${escapeHtml(line.description)}</td>
        <td>${line.minutes}</td>
        <td>${escapeHtml(line.rate)}</td>
        <td>${escapeHtml(line.amount)}</td>
      </tr>`
    )
    .join('');

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Invoice ${safeInvoiceNumber}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #111827; margin: 24px; }
    h1 { font-size: 20px; margin-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th, td { border-bottom: 1px solid #e5e7eb; padding: 8px; text-align: left; }
    th { background: #f9fafb; }
    .meta { margin-bottom: 12px; }
  </style>
</head>
<body>
  <h1>Invoice ${safeInvoiceNumber}</h1>
  <div class="meta">Tutor: ${safeTutorName}</div>
  <div class="meta">Period: ${safePeriodStart} to ${safePeriodEnd}</div>
  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th>Minutes</th>
        <th>Rate</th>
        <th>Amount</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
  <div class="meta" style="margin-top:16px; font-weight:600;">Total: ${safeTotalAmount}</div>
</body>
</html>`;
}

export function buildInvoicePdf(detail: InvoiceDetail) {
  const doc = new PDFDocument({ margin: 40 });
  doc.fontSize(18).text(`Invoice ${detail.invoiceNumber}`);
  doc.moveDown(0.5);
  doc.fontSize(12).text(`Tutor: ${detail.tutorName}`);
  doc.text(`Period: ${detail.periodStart} to ${detail.periodEnd}`);
  doc.moveDown(1);

  doc.fontSize(12).text('Description', 40, doc.y, { continued: true });
  doc.text('Minutes', 260, doc.y, { continued: true });
  doc.text('Rate', 340, doc.y, { continued: true });
  doc.text('Amount', 420, doc.y);
  doc.moveDown(0.5);

  detail.lines.forEach((line) => {
    doc.text(line.description, 40, doc.y, { continued: true });
    doc.text(String(line.minutes), 260, doc.y, { continued: true });
    doc.text(line.rate, 340, doc.y, { continued: true });
    doc.text(line.amount, 420, doc.y);
  });

  doc.moveDown(1);
  doc.fontSize(12).text(`Total: ${detail.totalAmount}`);

  return doc;
}
