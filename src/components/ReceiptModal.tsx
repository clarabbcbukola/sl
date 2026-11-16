import React from 'react';
import { Printer, X } from 'lucide-react';
import { Company, Sale } from '../types';
import { formatCurrency, formatTimestamp } from '../utils/format';

interface ReceiptModalProps {
  sale: Sale;
  company: Company;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({ sale, company, onClose }) => {
  const cur = company.currency;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 no-print">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Transaction Receipt · {sale.trackingNumber}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 max-h-[75vh] overflow-y-auto text-slate-900 dark:text-slate-100">
          <div className="text-center border-b border-dashed border-slate-300 pb-4 dark:border-slate-700">
            <h4 className="text-base font-bold uppercase tracking-wide">{company.name}</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Branch: {sale.branchName} {company.address ? `· ${company.address}` : ''}
            </p>
            {company.phone && (
              <p className="text-xs text-slate-500 dark:text-slate-400">Tel: {company.phone}</p>
            )}
          </div>

          <div className="py-3 text-xs space-y-1 border-b border-dashed border-slate-300 dark:border-slate-700 font-mono">
            <div className="flex justify-between">
              <span className="text-slate-500">Tracking #:</span>
              <span className="font-semibold">{sale.trackingNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Date:</span>
              <span>{sale.createdAt ? formatTimestamp(sale.createdAt) : sale.dateKey}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Mode / Pay:</span>
              <span className="uppercase">{sale.saleMode} · {sale.paymentMethod}</span>
            </div>
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
          </div>

          <div className="py-3 border-b border-dashed border-slate-300 dark:border-slate-700">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-slate-200 dark:border-slate-800">
                  <th className="py-1.5 text-left font-medium">Item</th>
                  <th className="py-1.5 text-right font-medium">Qty</th>
                  <th className="py-1.5 text-right font-medium">Price</th>
                  <th className="py-1.5 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono tabular-nums">
                {sale.items.map((item, i) => (
                  <tr key={`${item.productId}_${i}`}>
                    <td className="py-2 pr-2 font-sans text-slate-900 dark:text-slate-100">
                      {item.name}
                    </td>
                    <td className="py-2 text-right">{item.qty}</td>
                    <td className="py-2 text-right">{formatCurrency(item.unitPrice, cur)}</td>
                    <td className="py-2 text-right font-semibold">
                      {formatCurrency(item.lineTotal, cur)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="py-3 space-y-1.5 text-xs font-mono tabular-nums border-b border-dashed border-slate-300 dark:border-slate-700">
            <div className="flex justify-between">
              <span className="text-slate-500 font-sans">Subtotal</span>
              <span>{formatCurrency(sale.subtotal, cur)}</span>
            </div>
            {sale.discountAmount > 0 && (
              <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                <span className="font-sans">Discount</span>
                <span>-{formatCurrency(sale.discountAmount, cur)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-500 font-sans">
                Tax ({company.taxRate}% {company.taxInclusive ? 'incl.' : 'excl.'})
              </span>
              <span>{formatCurrency(sale.taxAmount, cur)}</span>
            </div>
            <div className="flex justify-between text-sm font-bold pt-1.5 border-t border-slate-200 dark:border-slate-800">
              <span className="font-sans">Total Paid</span>
              <span>{formatCurrency(sale.total, cur)}</span>
            </div>
            {sale.paymentMethod === 'cash' && (
              <>
                <div className="flex justify-between text-slate-500">
                  <span className="font-sans">Tendered</span>
                  <span>{formatCurrency(sale.amountTendered, cur)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span className="font-sans">Change Due</span>
                  <span>{formatCurrency(sale.changeDue, cur)}</span>
                </div>
              </>
            )}
          </div>

          {company.receiptFooter && (
            <p className="mt-4 text-center text-xs text-slate-500 dark:text-slate-400">
              {company.receiptFooter}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 px-5 py-3.5 border-t border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950 no-print">
          <button
            type="button"
            onClick={() => window.print()}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
          >
            <Printer className="h-3.5 w-3.5" />
            <span>Print Receipt</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-teal-600 dark:hover:bg-teal-700 cursor-pointer"
          >
            Done · New Sale
          </button>
        </div>
      </div>
    </div>
  );
};
