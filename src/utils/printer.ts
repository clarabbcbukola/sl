import { Company, PrintPaperSize, PrintSettings, Sale, StoreSession } from '../types';
import { AccountingSummary } from './accounting';
import { formatCurrency, formatDateTimeMs, formatTimestamp } from './format';

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  paperSize: 'thermal_80',
  engineMode: 'silent_iframe',
  fontFamily: 'mono',
  fontSize: 'sm',
  autoPrintOnConfirm: true,
  showItemSku: true,
  showCashierAndCustomer: true,
  marginMm: 2,
  serialBaudRate: 9600,
};

export const PAPER_SIZE_META: Record<
  PrintPaperSize,
  {
    label: string;
    shortLabel: string;
    cssPageSize: string;
    contentWidthMm: number;
    previewMaxWidthPx: number;
    escPosColumns: number;
  }
> = {
  thermal_80: {
    label: 'Thermal Roll 80mm (POS Standard)',
    shortLabel: '80mm Thermal',
    cssPageSize: '80mm auto',
    contentWidthMm: 74,
    previewMaxWidthPx: 330,
    escPosColumns: 48,
  },
  thermal_58: {
    label: 'Thermal Roll 58mm (Compact)',
    shortLabel: '58mm Thermal',
    cssPageSize: '58mm auto',
    contentWidthMm: 52,
    previewMaxWidthPx: 260,
    escPosColumns: 32,
  },
  a5: {
    label: 'A5 Portrait (148 × 210 mm)',
    shortLabel: 'A5 Sheet',
    cssPageSize: 'A5 portrait',
    contentWidthMm: 132,
    previewMaxWidthPx: 440,
    escPosColumns: 48,
  },
  a4: {
    label: 'A4 Portrait (210 × 297 mm)',
    shortLabel: 'A4 Sheet',
    cssPageSize: 'A4 portrait',
    contentWidthMm: 186,
    previewMaxWidthPx: 500,
    escPosColumns: 48,
  },
  letter: {
    label: 'US Letter (8.5 × 11 in)',
    shortLabel: 'Letter',
    cssPageSize: 'letter portrait',
    contentWidthMm: 190,
    previewMaxWidthPx: 500,
    escPosColumns: 48,
  },
};

const PRINT_SETTINGS_KEY_PREFIX = 'stockledger_print_settings_';
const PRINT_HISTORY_KEY = 'stockledger_printed_receipts_v1';

export function loadPrintSettings(companyId?: string): PrintSettings {
  const key = `${PRINT_SETTINGS_KEY_PREFIX}${companyId || 'default'}`;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { ...DEFAULT_PRINT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<PrintSettings>;
    return {
      ...DEFAULT_PRINT_SETTINGS,
      ...parsed,
      marginMm:
        typeof parsed.marginMm === 'number' && Number.isFinite(parsed.marginMm)
          ? Math.max(0, Math.min(15, parsed.marginMm))
          : DEFAULT_PRINT_SETTINGS.marginMm,
    };
  } catch {
    return { ...DEFAULT_PRINT_SETTINGS };
  }
}

export function savePrintSettings(companyId: string | undefined, settings: PrintSettings): void {
  const key = `${PRINT_SETTINGS_KEY_PREFIX}${companyId || 'default'}`;
  try {
    localStorage.setItem(key, JSON.stringify(settings));
  } catch {
    // Ignore storage quota issues
  }
}

function loadPrintHistoryMap(): Record<string, number> {
  try {
    const raw = localStorage.getItem(PRINT_HISTORY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export function getReceiptPrintCount(saleId: string): number {
  const map = loadPrintHistoryMap();
  return map[saleId] || 0;
}

export function recordReceiptPrint(saleId: string): number {
  const map = loadPrintHistoryMap();
  const next = (map[saleId] || 0) + 1;
  map[saleId] = next;
  // Keep latest 500 receipt IDs to prevent unbounded localStorage growth
  const keys = Object.keys(map);
  if (keys.length > 500) {
    for (const k of keys.slice(0, keys.length - 500)) {
      delete map[k];
    }
  }
  try {
    localStorage.setItem(PRINT_HISTORY_KEY, JSON.stringify(map));
  } catch {
    // Ignore
  }
  return next;
}

function escapeHtml(text: string): string {
  return (text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getFontMetrics(settings: PrintSettings): {
  fontStack: string;
  basePx: number;
  titlePx: number;
  totalPx: number;
  smallPx: number;
} {
  const is58 = settings.paperSize === 'thermal_58';
  const isSheet = settings.paperSize === 'a4' || settings.paperSize === 'a5' || settings.paperSize === 'letter';

  let basePx = is58 ? 10 : isSheet ? 12 : 11;
  if (settings.fontSize === 'xs') basePx -= 1;
  if (settings.fontSize === 'md') basePx += 1.5;

  const fontStack =
    settings.fontFamily === 'sans'
      ? "'Public Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
      : "'JetBrains Mono', 'SFMono-Regular', 'Consolas', 'Courier New', monospace";

  return {
    fontStack,
    basePx,
    titlePx: Math.round(basePx * 1.35),
    totalPx: Math.round(basePx * 1.25),
    smallPx: Math.max(8, Math.round(basePx * 0.86)),
  };
}

export function buildReceiptHTMLDocument(
  sale: Sale,
  company: Company,
  settings: PrintSettings,
  options?: { isReprint?: boolean; copyNumber?: number }
): string {
  const meta = PAPER_SIZE_META[settings.paperSize];
  const fonts = getFontMetrics(settings);
  const cur = company.currency;
  const isReprint = Boolean(options?.isReprint);
  const isCompact = settings.paperSize === 'thermal_58' || settings.paperSize === 'thermal_80';

  const rowsHtml = sale.items
    .map((item) => {
      const skuLine =
        settings.showItemSku && item.sku
          ? `<div class="sku">${escapeHtml(item.sku)}</div>`
          : '';
      return `
        <tr>
          <td class="col-item">
            <div class="item-name">${escapeHtml(item.name)}</div>
            ${skuLine}
          </td>
          <td class="col-qty">${item.qty}</td>
          <td class="col-price">${escapeHtml(formatCurrency(item.unitPrice, cur))}</td>
          <td class="col-total">${escapeHtml(formatCurrency(item.lineTotal, cur))}</td>
        </tr>
      `;
    })
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Receipt ${escapeHtml(sale.trackingNumber)}</title>
<style>
  @page {
    size: ${meta.cssPageSize};
    margin: ${settings.marginMm}mm;
  }
  * {
    box-sizing: border-box;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  html, body {
    margin: 0;
    padding: 0;
    width: 100%;
    height: auto !important;
    overflow: visible !important;
    background: #ffffff;
    color: #000000;
    font-family: ${fonts.fontStack};
    font-size: ${fonts.basePx}px;
    line-height: 1.35;
    font-variant-numeric: tabular-nums;
  }
  .receipt-sheet {
    width: 100%;
    max-width: ${meta.contentWidthMm}mm;
    margin: 0 auto;
    padding: ${isCompact ? '2mm 1.5mm' : '6mm 5mm'};
    page-break-inside: avoid;
    break-inside: avoid;
    page-break-after: avoid;
    break-after: avoid;
  }
  .center { text-align: center; }
  .right { text-align: right; }
  .bold { font-weight: 700; }
  .reprint-tag {
    display: inline-block;
    border: 1px solid #000;
    padding: 1px 6px;
    font-size: ${fonts.smallPx}px;
    font-weight: 700;
    letter-spacing: 0.08em;
    margin-bottom: 4px;
  }
  .company-name {
    font-size: ${fonts.titlePx}px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin: 0;
  }
  .muted {
    font-size: ${fonts.smallPx}px;
    color: #1e293b;
    margin: 2px 0 0;
  }
  .divider {
    border: 0;
    border-top: 1px dashed #334155;
    margin: 6px 0;
  }
  .meta-row {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    font-size: ${fonts.smallPx}px;
    margin: 2px 0;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 4px 0;
  }
  th {
    text-align: left;
    font-size: ${fonts.smallPx}px;
    font-weight: 700;
    border-bottom: 1px solid #000;
    padding: 3px 0;
  }
  td {
    padding: 3px 0;
    vertical-align: top;
    border-bottom: 1px dotted #cbd5e1;
    font-size: ${fonts.basePx}px;
  }
  tr:last-child td {
    border-bottom: 0;
  }
  .col-item { width: 46%; padding-right: 4px; word-break: break-word; }
  .col-qty { width: 12%; text-align: right; white-space: nowrap; }
  .col-price { width: 20%; text-align: right; white-space: nowrap; }
  .col-total { width: 22%; text-align: right; font-weight: 700; white-space: nowrap; }
  .item-name { font-weight: 600; }
  .sku { font-size: ${Math.max(7.5, fonts.smallPx - 1)}px; color: #334155; }
  .sum-row {
    display: flex;
    justify-content: space-between;
    margin: 2px 0;
    font-size: ${fonts.basePx}px;
  }
  .grand-total {
    display: flex;
    justify-content: space-between;
    font-size: ${fonts.totalPx}px;
    font-weight: 700;
    border-top: 1px solid #000;
    border-bottom: 1px solid #000;
    padding: 4px 0;
    margin: 5px 0;
  }
  .footer {
    text-align: center;
    font-size: ${fonts.smallPx}px;
    margin-top: 6px;
  }
</style>
</head>
<body>
  <div class="receipt-sheet">
    <div class="center">
      ${isReprint ? `<div class="reprint-tag">REPRINT COPY #${options?.copyNumber || 2}</div>` : ''}
      <h1 class="company-name">${escapeHtml(company.name)}</h1>
      <p class="muted">Branch: ${escapeHtml(sale.branchName)}${company.address ? ` · ${escapeHtml(company.address)}` : ''}</p>
      ${company.phone ? `<p class="muted">Tel: ${escapeHtml(company.phone)}</p>` : ''}
    </div>

    <hr class="divider" />

    <div class="meta-row"><span>Receipt #</span><span class="bold">${escapeHtml(sale.trackingNumber)}</span></div>
    <div class="meta-row"><span>Date</span><span>${escapeHtml(sale.createdAt ? formatTimestamp(sale.createdAt) : sale.dateKey)}</span></div>
    <div class="meta-row"><span>Business Day</span><span>${escapeHtml(sale.dateKey)}</span></div>
    <div class="meta-row"><span>Mode / Pay</span><span style="text-transform:uppercase">${escapeHtml(sale.saleMode)} · ${escapeHtml(sale.paymentMethod)}</span></div>
    ${
      settings.showCashierAndCustomer
        ? `<div class="meta-row"><span>Cashier</span><span>${escapeHtml(sale.staffName)}</span></div>
           ${sale.customerName ? `<div class="meta-row"><span>Customer</span><span>${escapeHtml(sale.customerName)}</span></div>` : ''}`
        : ''
    }

    <hr class="divider" />

    <table>
      <thead>
        <tr>
          <th class="col-item">Item</th>
          <th class="col-qty">Qty</th>
          <th class="col-price">Price</th>
          <th class="col-total">Amt</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>

    <hr class="divider" />

    <div class="sum-row"><span>Subtotal</span><span>${escapeHtml(formatCurrency(sale.subtotal, cur))}</span></div>
    ${
      sale.discountAmount > 0
        ? `<div class="sum-row"><span>Discount</span><span>-${escapeHtml(formatCurrency(sale.discountAmount, cur))}</span></div>`
        : ''
    }
    <div class="sum-row">
      <span>Tax (${company.taxRate}% ${company.taxInclusive ? 'incl.' : 'excl.'})</span>
      <span>${escapeHtml(formatCurrency(sale.taxAmount, cur))}</span>
    </div>

    <div class="grand-total">
      <span>TOTAL PAID</span>
      <span>${escapeHtml(formatCurrency(sale.total, cur))}</span>
    </div>

    ${
      sale.paymentMethod === 'cash'
        ? `<div class="sum-row muted"><span>Tendered</span><span>${escapeHtml(formatCurrency(sale.amountTendered, cur))}</span></div>
           <div class="sum-row muted"><span>Change Due</span><span>${escapeHtml(formatCurrency(sale.changeDue, cur))}</span></div>`
        : ''
    }

    ${company.receiptFooter ? `<p class="footer">${escapeHtml(company.receiptFooter)}</p>` : ''}
    <p class="footer muted">Powered by StockLedger · Single Page Original</p>
  </div>
</body>
</html>`;
}

export function buildSessionReportHTMLDocument(
  session: StoreSession,
  summary: AccountingSummary,
  company: Company,
  settings: PrintSettings
): string {
  const meta = PAPER_SIZE_META[settings.paperSize];
  const fonts = getFontMetrics(settings);
  const cur = company.currency;
  const isCompact = settings.paperSize === 'thermal_58' || settings.paperSize === 'thermal_80';

  const expectedCashDrawer =
    session.openingCash +
    summary.paymentBreakdown.cash -
    summary.cashOutflows.cashRefunds -
    summary.cashOutflows.cashExpenses;

  const actualCash = session.status === 'closed' ? session.closingCashActual : expectedCashDrawer;
  const variance = session.status === 'closed' ? session.varianceTotal : 0;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>EOD Session ${escapeHtml(session.sessionNumber)}</title>
<style>
  @page { size: ${meta.cssPageSize}; margin: ${settings.marginMm}mm; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0; width: 100%; height: auto !important; overflow: visible !important;
    background: #fff; color: #000;
    font-family: ${fonts.fontStack}; font-size: ${fonts.basePx}px; line-height: 1.38;
    font-variant-numeric: tabular-nums;
  }
  .sheet {
    width: 100%; max-width: ${meta.contentWidthMm}mm; margin: 0 auto;
    padding: ${isCompact ? '2mm 1.5mm' : '6mm 5mm'};
    page-break-inside: avoid; break-inside: avoid;
  }
  .center { text-align: center; }
  .bold { font-weight: 700; }
  .title { font-size: ${fonts.titlePx}px; font-weight: 700; text-transform: uppercase; margin: 0; }
  .muted { font-size: ${fonts.smallPx}px; color: #334155; margin: 2px 0 0; }
  .divider { border: 0; border-top: 1px dashed #334155; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; gap: 8px; margin: 2.5px 0; }
  .section { font-size: ${fonts.smallPx}px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin: 6px 0 3px; border-bottom: 1px solid #000; padding-bottom: 2px; }
  .total-box { border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 4px 0; margin: 5px 0; font-weight: 700; font-size: ${fonts.totalPx}px; display: flex; justify-content: space-between; }
</style>
</head>
<body>
  <div class="sheet">
    <div class="center">
      <h1 class="title">${escapeHtml(company.name)}</h1>
      <p class="muted bold">END-OF-DAY SESSION REPORT (${escapeHtml(session.status.toUpperCase())})</p>
      <p class="muted">${escapeHtml(session.branchName)} · ${escapeHtml(session.sessionNumber)}</p>
    </div>

    <hr class="divider" />
    <div class="row"><span>Business Date</span><span class="bold">${escapeHtml(session.businessDateKey)}</span></div>
    <div class="row"><span>Opened By</span><span>${escapeHtml(session.openedByStaffName)}</span></div>
    <div class="row"><span>Opened At</span><span>${escapeHtml(formatDateTimeMs(session.openedAtMs))}</span></div>
    ${
      session.status === 'closed'
        ? `<div class="row"><span>Closed By</span><span>${escapeHtml(session.closedByStaffName)}</span></div>
           <div class="row"><span>Closed At</span><span>${escapeHtml(formatDateTimeMs(session.closedAtMs))}</span></div>`
        : ''
    }

    <div class="section">Sales &amp; Profit Summary</div>
    <div class="row"><span>Receipts Count</span><span class="bold">${summary.salesCount}</span></div>
    <div class="row"><span>Retail Sales</span><span>${escapeHtml(formatCurrency(summary.retailSales, cur))}</span></div>
    <div class="row"><span>Wholesale Sales</span><span>${escapeHtml(formatCurrency(summary.wholesaleSales, cur))}</span></div>
    <div class="row"><span>Returns (${summary.returnsCount})</span><span>-${escapeHtml(formatCurrency(summary.totalReturns, cur))}</span></div>
    <div class="total-box"><span>NET SALES</span><span>${escapeHtml(formatCurrency(summary.netSalesRevenue, cur))}</span></div>
    <div class="row"><span>COGS (Net)</span><span>${escapeHtml(formatCurrency(summary.netCogs, cur))}</span></div>
    <div class="row bold"><span>Gross Profit (${summary.grossMarginPct}%)</span><span>${escapeHtml(formatCurrency(summary.grossProfit, cur))}</span></div>
    <div class="row"><span>Net Tax Payable</span><span>${escapeHtml(formatCurrency(summary.netTaxPayable, cur))}</span></div>
    <div class="row"><span>Session Expenses</span><span>${escapeHtml(formatCurrency(summary.totalExpenses, cur))}</span></div>

    <div class="section">Payment Channels &amp; Drawer</div>
    <div class="row"><span>Opening Cash Float</span><span>${escapeHtml(formatCurrency(session.openingCash, cur))}</span></div>
    <div class="row"><span>Cash Sales</span><span>${escapeHtml(formatCurrency(summary.paymentBreakdown.cash, cur))}</span></div>
    <div class="row"><span>Cash Refunds &amp; Cash Exp.</span><span>-${escapeHtml(formatCurrency(summary.cashOutflows.cashRefunds + summary.cashOutflows.cashExpenses, cur))}</span></div>
    <div class="row bold"><span>Expected Closing Cash</span><span>${escapeHtml(formatCurrency(expectedCashDrawer, cur))}</span></div>
    ${
      session.status === 'closed'
        ? `<div class="row"><span>Actual Counted Cash</span><span>${escapeHtml(formatCurrency(actualCash, cur))}</span></div>`
        : ''
    }
    <div class="row"><span>Card Terminal Sales</span><span>${escapeHtml(formatCurrency(summary.paymentBreakdown.card, cur))}</span></div>
    <div class="row"><span>Bank Transfers</span><span>${escapeHtml(formatCurrency(summary.paymentBreakdown.transfer, cur))}</span></div>
    <div class="row"><span>Credit Sales</span><span>${escapeHtml(formatCurrency(summary.paymentBreakdown.credit, cur))}</span></div>
    ${
      session.status === 'closed'
        ? `<div class="total-box"><span>TOTAL VARIANCE</span><span>${escapeHtml(formatCurrency(variance, cur))}</span></div>`
        : ''
    }
    ${session.notes ? `<p class="muted" style="margin-top:6px;">Notes: ${escapeHtml(session.notes)}</p>` : ''}
  </div>
</body>
</html>`;
}

// -----------------------------------------------------------------------------
// Isolated Single-Page Iframe Print Mutex (Prevents 5-copy / multi-page spill)
// -----------------------------------------------------------------------------
let activePrintLock = false;

export function printHtmlDocumentSilently(html: string): Promise<void> {
  if (activePrintLock) {
    return Promise.resolve();
  }
  activePrintLock = true;

  return new Promise((resolve) => {
    const existing = document.getElementById('stockledger-silent-print-frame');
    if (existing) existing.remove();

    const iframe = document.createElement('iframe');
    iframe.id = 'stockledger-silent-print-frame';
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '1px';
    iframe.style.height = '1px';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';
    iframe.style.border = '0';

    let finished = false;
    const cleanup = () => {
      if (finished) return;
      finished = true;
      setTimeout(() => {
        iframe.remove();
        activePrintLock = false;
        resolve();
      }, 300);
    };

    iframe.onload = () => {
      const win = iframe.contentWindow;
      if (!win) {
        cleanup();
        return;
      }
      win.onafterprint = cleanup;
      // Trigger single isolated print call once layout settles
      setTimeout(() => {
        try {
          win.focus();
          win.print();
        } catch {
          // Ignore print blocker errors
        }
        // Fallback cleanup if browser doesn't fire onafterprint reliably
        setTimeout(cleanup, 1500);
      }, 60);
    };

    document.body.appendChild(iframe);
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();
    } else {
      cleanup();
    }
  });
}

// -----------------------------------------------------------------------------
// Direct Hardware ESC/POS Support (WebUSB & Web Serial)
// -----------------------------------------------------------------------------
interface UsbDeviceLike {
  vendorId: number;
  productId: number;
  productName?: string;
  opened: boolean;
  configuration?: {
    interfaces: {
      interfaceNumber: number;
      alternates: {
        endpoints: { direction: string; endpointNumber: number }[];
      }[];
    }[];
  } | null;
  open: () => Promise<void>;
  selectConfiguration: (num: number) => Promise<void>;
  claimInterface: (num: number) => Promise<void>;
  transferOut: (endpointNumber: number, data: BufferSource) => Promise<unknown>;
  close: () => Promise<void>;
}

interface NavigatorWithHardware extends Navigator {
  usb?: {
    requestDevice: (opts: { filters: Record<string, never>[] }) => Promise<UsbDeviceLike>;
    getDevices: () => Promise<UsbDeviceLike[]>;
  };
  serial?: {
    requestPort: () => Promise<{
      open: (opts: { baudRate: number }) => Promise<void>;
      writable: WritableStream<Uint8Array> | null;
      close: () => Promise<void>;
    }>;
  };
}

function padLine(left: string, right: string, width: number): string {
  const cleanLeft = left.slice(0, Math.max(1, width - right.length - 1));
  const spaces = Math.max(1, width - cleanLeft.length - right.length);
  return `${cleanLeft}${' '.repeat(spaces)}${right}`;
}

function centerLine(text: string, width: number): string {
  if (text.length >= width) return text.slice(0, width);
  const pad = Math.floor((width - text.length) / 2);
  return `${' '.repeat(pad)}${text}`;
}

export function buildEscPosReceiptBytes(
  sale: Sale,
  company: Company,
  settings: PrintSettings,
  options?: { isReprint?: boolean; copyNumber?: number }
): Uint8Array {
  const cols = PAPER_SIZE_META[settings.paperSize].escPosColumns;
  const cur = company.currency;
  const sep = '-'.repeat(cols);

  const lines: string[] = [];
  if (options?.isReprint) {
    lines.push(centerLine(`*** REPRINT COPY #${options.copyNumber || 2} ***`, cols));
  }
  lines.push(centerLine(company.name.toUpperCase(), cols));
  lines.push(centerLine(`Branch: ${sale.branchName}`, cols));
  if (company.address) lines.push(centerLine(company.address, cols));
  if (company.phone) lines.push(centerLine(`Tel: ${company.phone}`, cols));
  lines.push(sep);
  lines.push(padLine('Receipt #:', sale.trackingNumber, cols));
  lines.push(padLine('Date:', sale.createdAt ? formatTimestamp(sale.createdAt) : sale.dateKey, cols));
  lines.push(padLine('Biz Day:', sale.dateKey, cols));
  lines.push(padLine('Mode/Pay:', `${sale.saleMode}/${sale.paymentMethod}`.toUpperCase(), cols));
  if (settings.showCashierAndCustomer) {
    lines.push(padLine('Cashier:', sale.staffName, cols));
    if (sale.customerName) lines.push(padLine('Customer:', sale.customerName, cols));
  }
  lines.push(sep);
  for (const item of sale.items) {
    lines.push(item.name.slice(0, cols));
    lines.push(
      padLine(
        `  ${item.qty} x ${formatCurrency(item.unitPrice, cur)}`,
        formatCurrency(item.lineTotal, cur),
        cols
      )
    );
  }
  lines.push(sep);
  lines.push(padLine('Subtotal', formatCurrency(sale.subtotal, cur), cols));
  if (sale.discountAmount > 0) {
    lines.push(padLine('Discount', `-${formatCurrency(sale.discountAmount, cur)}`, cols));
  }
  lines.push(padLine(`Tax (${company.taxRate}%)`, formatCurrency(sale.taxAmount, cur), cols));
  lines.push(padLine('TOTAL PAID', formatCurrency(sale.total, cur), cols));
  if (sale.paymentMethod === 'cash') {
    lines.push(padLine('Tendered', formatCurrency(sale.amountTendered, cur), cols));
    lines.push(padLine('Change Due', formatCurrency(sale.changeDue, cur), cols));
  }
  lines.push(sep);
  if (company.receiptFooter) {
    lines.push(centerLine(company.receiptFooter, cols));
  }
  lines.push('\n\n\n');

  const encoder = new TextEncoder();
  const body = encoder.encode(lines.join('\n'));
  const initCmd = new Uint8Array([0x1b, 0x40]); // ESC @
  const cutCmd = new Uint8Array([0x1d, 0x56, 0x42, 0x00]); // GS V 66 0

  const merged = new Uint8Array(initCmd.length + body.length + cutCmd.length);
  merged.set(initCmd, 0);
  merged.set(body, initCmd.length);
  merged.set(cutCmd, initCmd.length + body.length);
  return merged;
}

export async function pairUsbThermalPrinter(): Promise<{
  vendorId: number;
  productId: number;
  deviceName: string;
}> {
  const nav = navigator as NavigatorWithHardware;
  if (!nav.usb) {
    throw new Error('WebUSB is not supported in this browser. Use Chromium/Edge over HTTPS.');
  }
  const device = await nav.usb.requestDevice({ filters: [] });
  return {
    vendorId: device.vendorId,
    productId: device.productId,
    deviceName: device.productName || `USB Printer (${device.vendorId}:${device.productId})`,
  };
}

async function tryPrintEscPosUsb(bytes: Uint8Array, settings: PrintSettings): Promise<boolean> {
  const nav = navigator as NavigatorWithHardware;
  if (!nav.usb || !settings.usbVendorId || !settings.usbProductId) return false;

  try {
    const devices = await nav.usb.getDevices();
    const target = devices.find(
      (d) => d.vendorId === settings.usbVendorId && d.productId === settings.usbProductId
    );
    if (!target) return false;

    if (!target.opened) await target.open();
    if (!target.configuration) await target.selectConfiguration(1);
    const iface = target.configuration?.interfaces[0];
    if (!iface) return false;
    await target.claimInterface(iface.interfaceNumber);
    const outEp = iface.alternates[0]?.endpoints.find((ep) => ep.direction === 'out');
    if (!outEp) return false;
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    await target.transferOut(outEp.endpointNumber, new Uint8Array(buffer));
    return true;
  } catch {
    return false;
  }
}

async function tryPrintEscPosSerial(bytes: Uint8Array, settings: PrintSettings): Promise<boolean> {
  const nav = navigator as NavigatorWithHardware;
  if (!nav.serial) return false;
  try {
    const port = await nav.serial.requestPort();
    await port.open({ baudRate: settings.serialBaudRate || 9600 });
    const writer = port.writable?.getWriter();
    if (!writer) {
      await port.close();
      return false;
    }
    await writer.write(bytes);
    writer.releaseLock();
    await port.close();
    return true;
  } catch {
    return false;
  }
}

export async function executeReceiptPrint(
  sale: Sale,
  company: Company,
  settings: PrintSettings,
  options?: { isReprint?: boolean }
): Promise<{ copyNumber: number; method: 'usb_escpos' | 'serial_escpos' | 'silent_iframe' }> {
  const prevCount = getReceiptPrintCount(sale.id);
  const isReprint = options?.isReprint ?? prevCount > 0;
  const copyNumber = recordReceiptPrint(sale.id);

  if (settings.engineMode === 'escpos_usb') {
    const bytes = buildEscPosReceiptBytes(sale, company, settings, { isReprint, copyNumber });
    const ok = await tryPrintEscPosUsb(bytes, settings);
    if (ok) return { copyNumber, method: 'usb_escpos' };
  }

  if (settings.engineMode === 'escpos_serial') {
    const bytes = buildEscPosReceiptBytes(sale, company, settings, { isReprint, copyNumber });
    const ok = await tryPrintEscPosSerial(bytes, settings);
    if (ok) return { copyNumber, method: 'serial_escpos' };
  }

  const html = buildReceiptHTMLDocument(sale, company, settings, { isReprint, copyNumber });
  await printHtmlDocumentSilently(html);
  return { copyNumber, method: 'silent_iframe' };
}

export async function executeSessionReportPrint(
  session: StoreSession,
  summary: AccountingSummary,
  company: Company,
  settings: PrintSettings
): Promise<void> {
  const html = buildSessionReportHTMLDocument(session, summary, company, settings);
  await printHtmlDocumentSilently(html);
}
