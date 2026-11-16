import React, { useMemo, useState } from 'react';
import { CheckCircle2, RotateCcw, Search, Undo2 } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { RefundMethod, Sale } from '../types';
import { roundMoney } from '../utils/accounting';
import { formatCurrency, formatTimestamp } from '../utils/format';

export const ReturnsView: React.FC = () => {
  const { company, activeBranch, sales, returns, processStockReturn } = useApp();
  const cur = company?.currency || '₦';

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [returnQtyMap, setReturnQtyMap] = useState<Record<string, number>>({});
  const [refundMethod, setRefundMethod] = useState<RefundMethod>('cash');
  const [restockItems, setRestockItems] = useState(true);
  const [reason, setReason] = useState('');
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const matchingSales = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return sales
      .filter((s) => !activeBranch || s.branchId === activeBranch.id)
      .filter((s) => {
        if (!term) return true;
        return (
          s.trackingNumber.toLowerCase().includes(term) ||
          s.customerName.toLowerCase().includes(term) ||
          s.items.some((i) => i.name.toLowerCase().includes(term))
        );
      })
      .slice(0, 40);
  }, [sales, activeBranch, searchTerm]);

  const handleSelectSale = (sale: Sale) => {
    setSelectedSale(sale);
    setReturnQtyMap({});
    setReason('');
    setFeedback('');
  };

  const refundPreview = useMemo(() => {
    if (!selectedSale) return { subtotal: 0, tax: 0, total: 0, count: 0 };
    const saleRatio =
      selectedSale.subtotal > 0
        ? (selectedSale.total - selectedSale.taxAmount) / selectedSale.subtotal
        : 1;
    const taxRatio = selectedSale.total > 0 ? selectedSale.taxAmount / selectedSale.total : 0;

    let subtotal = 0;
    let count = 0;
    for (const item of selectedSale.items) {
      const q = returnQtyMap[item.productId] || 0;
      if (q > 0) {
        count += q;
        subtotal += roundMoney(q * item.unitPrice * saleRatio);
      }
    }
    const total = taxRatio > 0 && taxRatio < 1 ? roundMoney(subtotal / (1 - taxRatio)) : roundMoney(subtotal);
    const tax = roundMoney(Math.max(0, total - subtotal));
    return { subtotal: roundMoney(subtotal), tax, total, count };
  }, [selectedSale, returnQtyMap]);

  const handleSubmitReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSale || refundPreview.count === 0) return;
    setIsSubmitting(true);
    setFeedback('');
    try {
      const itemsToReturn = selectedSale.items
        .map((saleItem) => ({
          saleItem,
          returnQty: returnQtyMap[saleItem.productId] || 0,
        }))
        .filter((x) => x.returnQty > 0);

      const ret = await processStockReturn({
        sale: selectedSale,
        items: itemsToReturn,
        refundMethod,
        restockItems,
        reason: reason || 'Customer item return',
      });
      setFeedback(
        `Return ${ret.trackingNumber} processed. Refunded ${formatCurrency(ret.refundTotal, cur)}${
          restockItems ? ' and restocked inventory.' : ' (written off).'
        }`
      );
      setSelectedSale(null);
      setReturnQtyMap({});
      setReason('');
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Return failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-[1440px] mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Sale Lookup */}
        <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-5 space-y-4 dark:border-slate-800 dark:bg-slate-900">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Lookup Sale for Return
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Search by receipt tracking number (TRX-...), customer, or item name.
            </p>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search TRX-..., customer, or product..."
              className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>

          <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 max-h-[480px] overflow-y-auto dark:divide-slate-800 dark:border-slate-800">
            {matchingSales.length === 0 ? (
              <p className="p-6 text-center text-xs text-slate-500">
                No sales found in {activeBranch?.name || 'this branch'}.
              </p>
            ) : (
              matchingSales.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleSelectSale(s)}
                  className={`w-full p-3.5 text-left transition-colors cursor-pointer ${
                    selectedSale?.id === s.id
                      ? 'bg-teal-50/70 dark:bg-teal-950/40'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                      {s.trackingNumber}
                    </span>
                    <span className="font-mono text-xs font-bold tabular-nums text-slate-900 dark:text-white">
                      {formatCurrency(s.total, cur)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                    <span>
                      {s.items.length} item(s) · {s.saleMode} · {s.paymentMethod}
                    </span>
                    <span
                      className={`font-semibold capitalize ${
                        s.status === 'refunded'
                          ? 'text-red-600'
                          : s.status === 'partial_return'
                          ? 'text-amber-600'
                          : 'text-emerald-600'
                      }`}
                    >
                      {s.status.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {s.customerName ? `${s.customerName} · ` : ''}
                    {formatTimestamp(s.createdAt)}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right: Return Processor */}
        <div className="lg:col-span-7 space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            {!selectedSale ? (
              <div className="py-14 text-center">
                <Undo2 className="mx-auto h-9 w-9 text-slate-300 dark:text-slate-700" />
                <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">
                  Select a Receipt to Process Return
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Returned items automatically adjust branch stock and tax accounting.
                </p>
                {feedback && (
                  <p className="mt-4 text-xs font-semibold text-teal-700 dark:text-teal-400">
                    {feedback}
                  </p>
                )}
              </div>
            ) : (
              <form onSubmit={handleSubmitReturn} className="space-y-5">
                <div className="flex items-start justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      Process Return · {selectedSale.trackingNumber}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Original Total: {formatCurrency(selectedSale.total, cur)} · Already Returned:{' '}
                      {formatCurrency(selectedSale.returnedAmount || 0, cur)}
                    </p>
                  </div>
                  {selectedSale.status === 'refunded' && (
                    <span className="rounded bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 dark:bg-red-950/60 dark:text-red-300">
                      Fully Refunded
                    </span>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800">
                        <th className="py-2 font-semibold">Item</th>
                        <th className="py-2 text-right font-semibold">Sold</th>
                        <th className="py-2 text-right font-semibold">Returned</th>
                        <th className="py-2 text-right font-semibold">Return Qty</th>
                        <th className="py-2 text-right font-semibold">Unit Price</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono tabular-nums">
                      {selectedSale.items.map((item) => {
                        const remaining = Math.max(0, item.qty - (item.returnedQty || 0));
                        const qtyVal = returnQtyMap[item.productId] || 0;
                        return (
                          <tr key={item.productId}>
                            <td className="py-2.5 pr-3 font-sans font-medium text-slate-900 dark:text-white">
                              {item.name}
                            </td>
                            <td className="py-2.5 text-right">{item.qty}</td>
                            <td className="py-2.5 text-right text-slate-400">
                              {item.returnedQty || 0}
                            </td>
                            <td className="py-2.5 text-right">
                              <input
                                type="number"
                                min={0}
                                max={remaining}
                                disabled={remaining === 0}
                                value={qtyVal}
                                onChange={(e) => {
                                  const v = Math.max(
                                    0,
                                    Math.min(remaining, Number.parseFloat(e.target.value) || 0)
                                  );
                                  setReturnQtyMap((prev) => ({ ...prev, [item.productId]: v }));
                                }}
                                className="w-16 rounded border border-slate-300 px-2 py-1 text-right text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                              />
                            </td>
                            <td className="py-2.5 text-right">
                              {formatCurrency(item.unitPrice, cur)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Refund Method
                    </label>
                    <select
                      value={refundMethod}
                      onChange={(e) => setRefundMethod(e.target.value as RefundMethod)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    >
                      <option value="cash">Cash Refund</option>
                      <option value="transfer">Bank Transfer</option>
                      <option value="card">Card Reversal</option>
                      <option value="store_credit">Store Credit</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Return Reason
                    </label>
                    <input
                      type="text"
                      required
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="e.g. Wrong dosage / Damaged seal / Exchange"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2.5 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={restockItems}
                    onChange={(e) => setRestockItems(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-teal-600"
                  />
                  <span>Restock returned items back into {selectedSale.branchName} inventory</span>
                </label>

                <div className="rounded-lg bg-slate-50 p-4 flex flex-wrap items-center justify-between gap-4 border border-slate-200 dark:bg-slate-950 dark:border-slate-800">
                  <div className="text-xs space-y-0.5 font-mono tabular-nums">
                    <p className="text-slate-500">
                      Subtotal Refund: {formatCurrency(refundPreview.subtotal, cur)} · Tax Reversal:{' '}
                      {formatCurrency(refundPreview.tax, cur)}
                    </p>
                    <p className="text-base font-bold text-slate-900 dark:text-white">
                      Total Refund: {formatCurrency(refundPreview.total, cur)}
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting || refundPreview.count === 0}
                    className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-40 cursor-pointer"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span>{isSubmitting ? 'Processing...' : 'Confirm Refund'}</span>
                  </button>
                </div>

                {feedback && (
                  <p className="text-xs font-semibold text-teal-700 dark:text-teal-400">
                    {feedback}
                  </p>
                )}
              </form>
            )}
          </div>

          {/* Recent Returns Log */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
              <RotateCcw className="h-4 w-4 text-slate-500" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Returns &amp; Refunds Ledger ({returns.length})
              </h3>
            </div>
            <div className="mt-3 space-y-2.5 max-h-64 overflow-y-auto">
              {returns.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-500">No returns processed yet.</p>
              ) : (
                returns.map((r) => (
                  <div
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-800"
                  >
                    <div>
                      <p className="font-mono font-bold text-slate-900 dark:text-white">
                        {r.trackingNumber} <span className="font-normal text-slate-400">for {r.saleTrackingNumber}</span>
                      </p>
                      <p className="text-slate-500 dark:text-slate-400">
                        {r.branchName} · {r.reason} · {r.restockItems ? 'Restocked' : 'Written off'}
                      </p>
                    </div>
                    <div className="text-right font-mono tabular-nums">
                      <p className="font-bold text-red-600 dark:text-red-400">
                        -{formatCurrency(r.refundTotal, cur)}
                      </p>
                      <p className="text-[11px] text-slate-400 uppercase">{r.refundMethod}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
