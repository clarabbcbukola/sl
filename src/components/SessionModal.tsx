import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Download,
  Play,
  Printer,
  Square,
  X,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { StoreSession } from '../types';
import { calculateAccountingSummary, roundMoney } from '../utils/accounting';
import { downloadCSVFile, exportRowsToCSV } from '../utils/csv';
import { formatCurrency, formatDateTimeMs, getTodayDateKey } from '../utils/format';
import { executeSessionReportPrint } from '../utils/printer';

interface SessionModalProps {
  initialMode: 'open' | 'close' | 'eod_report';
  inspectSession?: StoreSession | null;
  onClose: () => void;
}

export const SessionModal: React.FC<SessionModalProps> = ({
  initialMode,
  inspectSession,
  onClose,
}) => {
  const {
    company,
    branches,
    activeBranch,
    activeSession,
    sales,
    returns,
    expenses,
    printSettings,
    openSession,
    closeSession,
  } = useApp();

  const cur = company?.currency || '₦';
  const [mode, setMode] = useState<'open' | 'close' | 'eod_report'>(initialMode);
  const [targetSession, setTargetSession] = useState<StoreSession | null>(
    inspectSession || activeSession || null
  );

  // Open Session Form
  const [branchId, setBranchId] = useState(activeBranch?.id || branches[0]?.id || '');
  const [businessDateKey, setBusinessDateKey] = useState(getTodayDateKey());
  const [openingCash, setOpeningCash] = useState('0');
  const [openNotes, setOpenNotes] = useState('');

  // Close Session Form
  const [actualCash, setActualCash] = useState('');
  const [actualCard, setActualCard] = useState('');
  const [actualTransfer, setActualTransfer] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isPrinting, setIsPrinting] = useState(false);

  const sessionForSummary = targetSession || activeSession;

  const sessionData = useMemo(() => {
    if (!sessionForSummary) {
      return {
        sales: [],
        returns: [],
        expenses: [],
        summary: calculateAccountingSummary([], [], []),
        expectedDrawerCash: 0,
      };
    }
    const sSales = sales.filter((s) => s.sessionId === sessionForSummary.id);
    const sReturns = returns.filter((r) => r.sessionId === sessionForSummary.id);
    const sExpenses = expenses.filter((e) => e.sessionId === sessionForSummary.id);
    const summary = calculateAccountingSummary(sSales, sReturns, sExpenses);
    const expectedDrawerCash = roundMoney(
      sessionForSummary.openingCash +
        summary.paymentBreakdown.cash -
        summary.cashOutflows.cashRefunds -
        summary.cashOutflows.cashExpenses
    );
    return { sales: sSales, returns: sReturns, expenses: sExpenses, summary, expectedDrawerCash };
  }, [sessionForSummary, sales, returns, expenses]);

  useEffect(() => {
    if (mode === 'close' && sessionForSummary) {
      setActualCash(String(sessionData.expectedDrawerCash));
      setActualCard(String(sessionData.summary.paymentBreakdown.card));
      setActualTransfer(String(sessionData.summary.paymentBreakdown.transfer));
    }
  }, [
    mode,
    sessionForSummary?.id,
    sessionData.expectedDrawerCash,
    sessionData.summary.paymentBreakdown.card,
    sessionData.summary.paymentBreakdown.transfer,
  ]);

  const liveVariance = useMemo(() => {
    const expTotal =
      sessionData.expectedDrawerCash +
      sessionData.summary.paymentBreakdown.card +
      sessionData.summary.paymentBreakdown.transfer;
    const actTotal =
      (Number.parseFloat(actualCash) || 0) +
      (Number.parseFloat(actualCard) || 0) +
      (Number.parseFloat(actualTransfer) || 0);
    return roundMoney(actTotal - expTotal);
  }, [actualCash, actualCard, actualTransfer, sessionData]);

  const handleStartSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setIsSubmitting(true);
    try {
      await openSession({
        branchId,
        businessDateKey,
        openingCash: Math.max(0, Number.parseFloat(openingCash) || 0),
        notes: openNotes,
      });
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to start session.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionForSummary) return;
    setErrorMsg('');
    setIsSubmitting(true);
    try {
      const closed = await closeSession({
        sessionId: sessionForSummary.id,
        actualCash: Math.max(0, Number.parseFloat(actualCash) || 0),
        actualCard: Math.max(0, Number.parseFloat(actualCard) || 0),
        actualTransfer: Math.max(0, Number.parseFloat(actualTransfer) || 0),
        notes: closeNotes,
      });
      setTargetSession(closed);
      setMode('eod_report');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to close session.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrintEOD = async () => {
    if (!sessionForSummary || !company || isPrinting) return;
    setIsPrinting(true);
    try {
      await executeSessionReportPrint(sessionForSummary, sessionData.summary, company, printSettings);
    } finally {
      setIsPrinting(false);
    }
  };

  const handleExportEODCSV = () => {
    if (!sessionForSummary) return;
    const rows = sessionData.sales.map((s) => [
      sessionForSummary.sessionNumber,
      sessionForSummary.businessDateKey,
      s.trackingNumber,
      s.saleMode,
      s.paymentMethod,
      s.staffName,
      s.subtotal,
      s.taxAmount,
      s.total,
      s.status,
    ]);
    const csv = exportRowsToCSV(
      [
        'Session #',
        'Business Date',
        'Receipt #',
        'Mode',
        'Payment',
        'Cashier',
        'Subtotal',
        'Tax',
        'Total',
        'Status',
      ],
      rows
    );
    downloadCSVFile(
      `EOD_${sessionForSummary.sessionNumber}_${sessionForSummary.businessDateKey}.csv`,
      csv
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 no-print">
      <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden dark:border-slate-800 dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-sky-50/40 dark:bg-slate-950 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-teal-600 text-white flex items-center justify-center">
              <Clock className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {mode === 'open'
                  ? 'Open / Start Business Session'
                  : mode === 'close'
                  ? `Close Session & Run EOD · ${sessionForSummary?.sessionNumber || ''}`
                  : `End-of-Day Session Report · ${sessionForSummary?.sessionNumber || ''}`}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Session-tagged accounting prevents device clock lag or midnight rollover errors
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        {mode === 'open' && (
          <form onSubmit={handleStartSession} className="p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Branch
                </label>
                <select
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                >
                  {branches
                    .filter((b) => b.active)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.code})
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Business Day Date (Overrides Device Clock)
                </label>
                <input
                  type="date"
                  required
                  value={businessDateKey}
                  onChange={(e) => setBusinessDateKey(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Opening Cash Float in Drawer ({cur})
              </label>
              <input
                type="number"
                step="any"
                min={0}
                required
                value={openingCash}
                onChange={(e) => setOpeningCash(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono font-bold dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Shift / Day Notes (Optional)
              </label>
              <input
                type="text"
                value={openNotes}
                onChange={(e) => setOpenNotes(e.target.value)}
                placeholder="e.g. Morning counter shift"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>

            {errorMsg && <p className="text-xs font-semibold text-red-600">{errorMsg}</p>}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-lg border border-slate-300 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-teal-600 py-2.5 text-xs font-semibold text-white shadow-sm shadow-teal-600/20 hover:bg-teal-700 disabled:opacity-50 dark:shadow-none cursor-pointer"
              >
                <Play className="h-3.5 w-3.5" />
                <span>{isSubmitting ? 'Starting...' : 'Open Session & Start Day'}</span>
              </button>
            </div>
          </form>
        )}

        {mode === 'close' && sessionForSummary && (
          <form onSubmit={handleCloseSession} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
            <div className="rounded-lg border border-slate-200 bg-sky-50/40 p-4 space-y-2 text-xs font-mono tabular-nums dark:border-slate-800 dark:bg-slate-950">
              <div className="flex justify-between">
                <span className="font-sans text-slate-500">Session / Business Day</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {sessionForSummary.sessionNumber} · {sessionForSummary.businessDateKey}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-sans text-slate-500">Receipts &amp; Net Sales</span>
                <span>
                  {sessionData.summary.salesCount} sales ·{' '}
                  {formatCurrency(sessionData.summary.netSalesRevenue, cur)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-sans text-slate-500">Opening Cash Float</span>
                <span>{formatCurrency(sessionForSummary.openingCash, cur)}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-sans text-slate-500">+ Cash Sales</span>
                <span>{formatCurrency(sessionData.summary.paymentBreakdown.cash, cur)}</span>
              </div>
              <div className="flex justify-between text-red-600 dark:text-red-400">
                <span className="font-sans">- Cash Refunds &amp; Cash Expenses</span>
                <span>
                  -
                  {formatCurrency(
                    sessionData.summary.cashOutflows.cashRefunds +
                      sessionData.summary.cashOutflows.cashExpenses,
                    cur
                  )}
                </span>
              </div>
              <div className="flex justify-between font-bold text-slate-900 dark:text-white pt-1.5 border-t border-slate-200 dark:border-slate-800">
                <span className="font-sans">Expected Closing Cash</span>
                <span>{formatCurrency(sessionData.expectedDrawerCash, cur)}</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span className="font-sans">Expected Card / Transfer</span>
                <span>
                  {formatCurrency(sessionData.summary.paymentBreakdown.card, cur)} /{' '}
                  {formatCurrency(sessionData.summary.paymentBreakdown.transfer, cur)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Actual Cash Counted
                </label>
                <input
                  type="number"
                  step="any"
                  min={0}
                  required
                  value={actualCash}
                  onChange={(e) => setActualCash(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono font-bold dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Actual Card Batch
                </label>
                <input
                  type="number"
                  step="any"
                  min={0}
                  required
                  value={actualCard}
                  onChange={(e) => setActualCard(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono font-bold dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Actual Bank Transfers
                </label>
                <input
                  type="number"
                  step="any"
                  min={0}
                  required
                  value={actualTransfer}
                  onChange={(e) => setActualTransfer(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono font-bold dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3.5 py-2.5 text-xs dark:border-slate-800">
              <span className="font-semibold text-slate-600 dark:text-slate-400">
                Drawer Variance
              </span>
              <span
                className={`font-mono font-bold ${
                  Math.abs(liveVariance) < 0.01
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-amber-600 dark:text-amber-400'
                }`}
              >
                {Math.abs(liveVariance) < 0.01
                  ? 'Balanced (0)'
                  : formatCurrency(liveVariance, cur)}
              </span>
            </div>

            <input
              type="text"
              value={closeNotes}
              onChange={(e) => setCloseNotes(e.target.value)}
              placeholder="Closing remarks (optional)"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />

            {errorMsg && <p className="text-xs font-semibold text-red-600">{errorMsg}</p>}

            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-lg border border-slate-300 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 cursor-pointer"
              >
                Keep Open
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-teal-600 py-2.5 text-xs font-semibold text-white shadow-sm shadow-teal-600/20 hover:bg-teal-700 disabled:opacity-50 dark:shadow-none cursor-pointer"
              >
                <Square className="h-3.5 w-3.5" />
                <span>{isSubmitting ? 'Closing...' : 'Close Session & Run EOD Report'}</span>
              </button>
            </div>
          </form>
        )}

        {mode === 'eod_report' && sessionForSummary && (
          <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono tabular-nums">
              <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <p className="font-sans text-[11px] text-slate-500">Net Sales</p>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  {formatCurrency(sessionData.summary.netSalesRevenue, cur)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <p className="font-sans text-[11px] text-slate-500">Gross Profit</p>
                <p className="text-sm font-bold text-teal-700 dark:text-teal-400">
                  {formatCurrency(sessionData.summary.grossProfit, cur)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <p className="font-sans text-[11px] text-slate-500">Net Tax</p>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  {formatCurrency(sessionData.summary.netTaxPayable, cur)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <p className="font-sans text-[11px] text-slate-500">Expenses</p>
                <p className="text-sm font-bold text-amber-600">
                  {formatCurrency(sessionData.summary.totalExpenses, cur)}
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-sky-50/35 p-4 space-y-2 text-xs font-mono tabular-nums dark:border-slate-800 dark:bg-slate-950">
              <div className="flex justify-between">
                <span className="font-sans text-slate-500">Business Date</span>
                <span className="font-bold">{sessionForSummary.businessDateKey}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-sans text-slate-500">Opened</span>
                <span>
                  {sessionForSummary.openedByStaffName} ·{' '}
                  {formatDateTimeMs(sessionForSummary.openedAtMs)}
                </span>
              </div>
              {sessionForSummary.status === 'closed' && (
                <div className="flex justify-between">
                  <span className="font-sans text-slate-500">Closed</span>
                  <span>
                    {sessionForSummary.closedByStaffName} ·{' '}
                    {formatDateTimeMs(sessionForSummary.closedAtMs)}
                  </span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-slate-200 dark:border-slate-800">
                <span className="font-sans text-slate-500">Retail / Wholesale</span>
                <span>
                  {formatCurrency(sessionData.summary.retailSales, cur)} /{' '}
                  {formatCurrency(sessionData.summary.wholesaleSales, cur)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-sans text-slate-500">Expected vs Actual Cash</span>
                <span>
                  {formatCurrency(sessionData.expectedDrawerCash, cur)} /{' '}
                  {formatCurrency(
                    sessionForSummary.status === 'closed'
                      ? sessionForSummary.closingCashActual
                      : sessionData.expectedDrawerCash,
                    cur
                  )}
                </span>
              </div>
              {sessionForSummary.status === 'closed' && (
                <div className="flex justify-between font-bold">
                  <span className="font-sans">Total Variance</span>
                  <span
                    className={
                      Math.abs(sessionForSummary.varianceTotal) < 0.01
                        ? 'text-emerald-600'
                        : 'text-amber-600'
                    }
                  >
                    {formatCurrency(sessionForSummary.varianceTotal, cur)}
                  </span>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={handleExportEODCSV}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Export EOD CSV</span>
              </button>
              <button
                type="button"
                onClick={handlePrintEOD}
                disabled={isPrinting}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white shadow-sm shadow-teal-600/20 hover:bg-teal-700 disabled:opacity-50 dark:shadow-none cursor-pointer"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>{isPrinting ? 'Printing...' : 'Print EOD Report (1 Page)'}</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 cursor-pointer"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Done</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
