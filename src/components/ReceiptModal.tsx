import React, { useState } from 'react';
import { CheckCircle2, Printer, RotateCw, X } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { Company, Sale } from '../types';
import { formatCurrency, formatTimestamp } from '../utils/format';
import {
  PAPER_SIZE_META,
  executeReceiptPrint,
  getReceiptPrintCount,
} from '../utils/printer';

interface ReceiptModalProps {
  sale: Sale;
  company: Company;
  onClose: () => void;
  autoPrintedMethod?: string | null;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  sale,
  company,
  onClose,
  autoPrintedMethod,
}) => {
  const { printSettings } = useApp();
  const cur = company.currency;
  const [printCount, setPrintCount] = useState<number>(() => getReceiptPrintCount(sale.id));
  const [isPrinting, setIsPrinting] = useState(false);
  const [lastMethod, setLastMethod] = useState<string | null>(autoPrintedMethod || null);

  const paperMeta = PAPER_SIZE_META[printSettings.paperSize];
  const isReprintMode = printCount > 0;

  const handlePrint = async () => {
    if (isPrinting) return;
    setIsPrinting(true);
    try {
      const result = await executeReceiptPrint(sale, company, printSettings, {
        isReprint: isReprintMode,
      });
      setPrintCount(result.copyNumber);
      setLastMethod(result.method);
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 no-print">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Receipt · {sale.trackingNumber}
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {paperMeta.shortLabel} · {printCount === 0 ? 'Not printed yet' : `Printed (${printCount}×)`}
              {lastMethod === 'usb_escpos'
                ? ' · USB Thermal'
                : lastMethod === 'serial_escpos'
                ? ' · Serial Thermal'
                : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 max-h-[72vh] overflow-y-auto bg-slate-100/70 dark:bg-slate-950/50">
          <div
            style={{ maxWidth: `${paperMeta.previewMaxWidthPx}px` }}
            className={`mx-auto rounded-lg border border-slate-200 bg-white p-5 text-slate-900 shadow-xs dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 ${
              printSettings.fontFamily === 'sans' ? 'font-sans' : 'font-mono'
            } ${
              printSettings.fontSize === 'xs'
                ? 'text-[11px]'
                : printSettings.fontSize === 'md'
                ? 'text-[13px]'
                : 'text-xs'
            }`}
          >
            {printCount > 0 && (
              <div className="mb-2 flex items-center justify-center gap-1.5 text-[11px] font-semibold text-teal-700 dark:text-teal-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Original Printed (1 Copy · Single Page)</span>
              </div>
            )}

            <div className="text-center border-b border-dashed border-slate-300 pb-3 dark:border-slate-700">
              <h4 className="text-sm font-bold uppercase tracking-wide">{company.name}</h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Branch: {sale.branchName} {company.address ? `· ${company.address}` : ''}
              </p>
              {company.phone && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Tel: {company.phone}</p>
              )}
            </div>

            <div className="py-2.5 text-[11px] space-y-1 border-b border-dashed border-slate-300 dark:border-slate-700">
              <div className="flex justify-between">
                <span className="text-slate-500">Tracking #:</span>
                <span className="font-semibold">{sale.trackingNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Date:</span>
                <span>{sale.createdAt ? formatTimestamp(sale.createdAt) : sale.dateKey}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Business Day:</span>
                <span>{sale.dateKey}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Mode / Pay:</span>
                <span className="uppercase">{sale.saleMode} · {sale.paymentMethod}</span>
              </div>
              {printSettings.showCashierAndCustomer && (
                <>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Cashier:</span>
                    <span>{sale.staffName}</span>
                  </div>
                  {sale.customerName && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Customer:</span>
                      <span>{sale.customerName}</span>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="py-2.5 border-b border-dashed border-slate-300 dark:border-slate-700">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-200 dark:border-slate-800">
                    <th className="py-1 text-left font-semibold">Item</th>
                    <th className="py-1 text-right font-semibold">Qty</th>
                    <th className="py-1 text-right font-semibold">Price</th>
                    <th className="py-1 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 tabular-nums">
                  {sale.items.map((item, i) => (
                    <tr key={`${item.productId}_${i}`}>
                      <td className="py-1.5 pr-2 text-slate-900 dark:text-slate-100">
                        <div>{item.name}</div>
                        {printSettings.showItemSku && (
                          <div className="text-[10px] text-slate-400">{item.sku}</div>
                        )}
                      </td>
                      <td className="py-1.5 text-right">{item.qty}</td>
                      <td className="py-1.5 text-right">{formatCurrency(item.unitPrice, cur)}</td>
                      <td className="py-1.5 text-right font-semibold">
                        {formatCurrency(item.lineTotal, cur)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="py-2.5 space-y-1 text-[11px] tabular-nums border-b border-dashed border-slate-300 dark:border-slate-700">
              <div className="flex justify-between">
                <span className="text-slate-500">Subtotal</span>
                <span>{formatCurrency(sale.subtotal, cur)}</span>
              </div>
              {sale.discountAmount > 0 && (
                <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                  <span>Discount</span>
                  <span>-{formatCurrency(sale.discountAmount, cur)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">
                  Tax ({company.taxRate}% {company.taxInclusive ? 'incl.' : 'excl.'})
                </span>
                <span>{formatCurrency(sale.taxAmount, cur)}</span>
              </div>
              <div className="flex justify-between text-xs font-bold pt-1.5 border-t border-slate-200 dark:border-slate-800">
                <span>Total Paid</span>
                <span>{formatCurrency(sale.total, cur)}</span>
              </div>
              {sale.paymentMethod === 'cash' && (
                <>
                  <div className="flex justify-between text-slate-500">
                    <span>Tendered</span>
                    <span>{formatCurrency(sale.amountTendered, cur)}</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Change Due</span>
                    <span>{formatCurrency(sale.changeDue, cur)}</span>
                  </div>
                </>
              )}
            </div>

            {company.receiptFooter && (
              <p className="mt-3 text-center text-[11px] text-slate-500 dark:text-slate-400">
                {company.receiptFooter}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 px-5 py-3.5 border-t border-slate-200 bg-sky-50/40 dark:border-slate-800 dark:bg-slate-950">
          <button
            type="button"
            disabled={isPrinting}
            onClick={handlePrint}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
          >
            {isReprintMode ? <RotateCw className="h-3.5 w-3.5" /> : <Printer className="h-3.5 w-3.5" />}
            <span>
              {isPrinting
                ? 'Printing 1 Copy...'
                : isReprintMode
                ? 'Reprint Receipt'
                : 'Print Receipt (1 Copy)'}
            </span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white shadow-sm shadow-teal-600/20 hover:bg-teal-700 dark:shadow-none cursor-pointer"
          >
            Done · New Sale
          </button>
        </div>
      </div>
    </div>
  );
};
