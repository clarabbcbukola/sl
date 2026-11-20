import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Clock, Download, Eye, FileSpreadsheet, Play, Printer } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { Sale, StoreSession } from '../types';
import { calculateAccountingSummary, calculateInventoryValuation } from '../utils/accounting';
import { downloadCSVFile, exportRowsToCSV } from '../utils/csv';
import {
  formatCurrency,
  formatDateTimeMs,
  formatNumber,
  formatTimestamp,
  getDateKeyOffset,
  getTodayDateKey,
} from '../utils/format';
import { ReceiptModal } from './ReceiptModal';
import { SessionModal } from './SessionModal';

type DatePreset = 'active_session' | 'session' | 'today' | 'yesterday' | '7d' | '30d' | 'all' | 'custom';

export const ReportsView: React.FC = () => {
  const {
    company,
    branches,
    activeBranch,
    activeSession,
    sessions,
    products,
    sales,
    returns,
    expenses,
    transfers,
    reconciliations,
  } = useApp();

  const cur = company?.currency || '₦';

  const [datePreset, setDatePreset] = useState<DatePreset>(activeSession ? 'active_session' : 'today');
  const [selectedSessionId, setSelectedSessionId] = useState<string>(
    activeSession?.id || sessions[0]?.id || ''
  );
  const [startDate, setStartDate] = useState(getTodayDateKey());
  const [endDate, setEndDate] = useState(getTodayDateKey());
  const [branchFilter, setBranchFilter] = useState<string>(activeBranch?.id || 'all');
  const [saleModeFilter, setSaleModeFilter] = useState<'all' | 'retail' | 'wholesale'>('all');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [activeReportCard, setActiveReportCard] = useState<
    'default' | 'sales' | 'valuation' | 'tax_expenses' | 'audit'
  >('default');
  const [previewSale, setPreviewSale] = useState<Sale | null>(null);
  const [sessionModalState, setSessionModalState] = useState<{
    mode: 'open' | 'close' | 'eod_report';
    session?: StoreSession | null;
  } | null>(null);

  const effectiveSession = useMemo(() => {
    if (datePreset === 'active_session') return activeSession;
    if (datePreset === 'session') {
      return sessions.find((s) => s.id === selectedSessionId) || sessions[0] || null;
    }
    return null;
  }, [datePreset, activeSession, sessions, selectedSessionId]);

  const effectiveRange = useMemo(() => {
    const today = getTodayDateKey();
    if (datePreset === 'today') return { from: today, to: today };
    if (datePreset === 'yesterday') {
      const y = getDateKeyOffset(-1);
      return { from: y, to: y };
    }
    if (datePreset === '7d') return { from: getDateKeyOffset(-6), to: today };
    if (datePreset === '30d') return { from: getDateKeyOffset(-29), to: today };
    if (datePreset === 'custom') return { from: startDate, to: endDate };
    return { from: '0000-00-00', to: '9999-99-99' };
  }, [datePreset, startDate, endDate]);

  const matchesScope = (item: { dateKey: string; sessionId?: string }) => {
    if (datePreset === 'active_session' || datePreset === 'session') {
      if (!effectiveSession) return false;
      return item.sessionId === effectiveSession.id;
    }
    return item.dateKey >= effectiveRange.from && item.dateKey <= effectiveRange.to;
  };

  const filteredSales = useMemo(() => {
    return sales.filter((s) => {
      if (branchFilter !== 'all' && s.branchId !== branchFilter) return false;
      if (saleModeFilter !== 'all' && s.saleMode !== saleModeFilter) return false;
      if (paymentFilter !== 'all' && s.paymentMethod !== paymentFilter) return false;
      return matchesScope(s);
    });
  }, [sales, branchFilter, saleModeFilter, paymentFilter, effectiveRange, datePreset, effectiveSession]);

  const filteredReturns = useMemo(() => {
    return returns.filter((r) => {
      if (branchFilter !== 'all' && r.branchId !== branchFilter) return false;
      return matchesScope(r);
    });
  }, [returns, branchFilter, effectiveRange, datePreset, effectiveSession]);

  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      if (branchFilter !== 'all' && e.branchId !== branchFilter) return false;
      return matchesScope(e);
    });
  }, [expenses, branchFilter, effectiveRange, datePreset, effectiveSession]);

  const filteredTransfers = useMemo(() => {
    return transfers.filter((t) => {
      if (branchFilter !== 'all' && t.fromBranchId !== branchFilter && t.toBranchId !== branchFilter)
        return false;
      return matchesScope(t);
    });
  }, [transfers, branchFilter, effectiveRange, datePreset, effectiveSession]);

  const filteredRecs = useMemo(() => {
    return reconciliations.filter((r) => {
      if (branchFilter !== 'all' && r.branchId !== branchFilter) return false;
      return matchesScope(r);
    });
  }, [reconciliations, branchFilter, effectiveRange, datePreset, effectiveSession]);

  const summary = useMemo(
    () => calculateAccountingSummary(filteredSales, filteredReturns, filteredExpenses),
    [filteredSales, filteredReturns, filteredExpenses]
  );

  const scopedProducts = useMemo(
    () => (branchFilter === 'all' ? products : products.filter((p) => p.branchId === branchFilter)),
    [products, branchFilter]
  );
  const valuation = useMemo(() => calculateInventoryValuation(scopedProducts), [scopedProducts]);

  // Chart Data grouped by dateKey
  const dailyChartData = useMemo(() => {
    const map = new Map<string, { date: string; sales: number; profit: number; expenses: number }>();
    for (const s of filteredSales) {
      const entry = map.get(s.dateKey) || { date: s.dateKey, sales: 0, profit: 0, expenses: 0 };
      entry.sales += s.total;
      entry.profit += s.total - s.taxAmount - s.totalCost;
      map.set(s.dateKey, entry);
    }
    for (const e of filteredExpenses) {
      const entry = map.get(e.dateKey) || { date: e.dateKey, sales: 0, profit: 0, expenses: 0 };
      entry.expenses += e.totalAmount;
      map.set(e.dateKey, entry);
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredSales, filteredExpenses]);

  // Top Selling Products
  const topProducts = useMemo(() => {
    const map = new Map<string, { name: string; sku: string; qty: number; revenue: number }>();
    for (const s of filteredSales) {
      for (const item of s.items) {
        const netQty = item.qty - (item.returnedQty || 0);
        if (netQty <= 0) continue;
        const curr = map.get(item.name) || { name: item.name, sku: item.sku, qty: 0, revenue: 0 };
        curr.qty += netQty;
        curr.revenue += netQty * item.unitPrice;
        map.set(item.name, curr);
      }
    }
    return Array.from(map.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 12);
  }, [filteredSales]);

  // Branch Comparison
  const branchComparison = useMemo(() => {
    return branches.map((b) => {
      const bSales = filteredSales.filter((s) => s.branchId === b.id);
      const bReturns = filteredReturns.filter((r) => r.branchId === b.id);
      const bExpenses = filteredExpenses.filter((e) => e.branchId === b.id);
      const bProducts = products.filter((p) => p.branchId === b.id);
      const acc = calculateAccountingSummary(bSales, bReturns, bExpenses);
      const val = calculateInventoryValuation(bProducts);
      return {
        branch: b,
        acc,
        val,
      };
    });
  }, [branches, filteredSales, filteredReturns, filteredExpenses, products]);

  const handleExportSalesCSV = () => {
    const csv = exportRowsToCSV(
      ['Tracking #', 'Date', 'Branch', 'Mode', 'Payment', 'Staff', 'Customer', 'Subtotal', 'Tax', 'Total', 'COGS', 'Status'],
      filteredSales.map((s) => [
        s.trackingNumber,
        s.dateKey,
        s.branchName,
        s.saleMode,
        s.paymentMethod,
        s.staffName,
        s.customerName,
        s.subtotal,
        s.taxAmount,
        s.total,
        s.totalCost,
        s.status,
      ])
    );
    downloadCSVFile(`sales_report_${effectiveRange.from}_to_${effectiveRange.to}.csv`, csv);
  };

  return (
    <div className="p-6 space-y-6 max-w-[1440px] mx-auto">
      {/* Filter Toolbar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 dark:border-slate-800 dark:bg-slate-900 no-print">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
            {(
              [
                { id: 'active_session', label: 'Active Session' },
                { id: 'session', label: 'By Session (EOD)' },
                { id: 'today', label: 'Today' },
                { id: 'yesterday', label: 'Yesterday' },
                { id: '7d', label: 'Last 7 Days' },
                { id: '30d', label: 'Last 30 Days' },
                { id: 'all', label: 'All Time' },
                { id: 'custom', label: 'Custom Date' },
              ] as const
            ).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setDatePreset(p.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  datePreset === p.id
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            >
              <option value="all">All Branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>

            <select
              value={saleModeFilter}
              onChange={(e) => setSaleModeFilter(e.target.value as 'all' | 'retail' | 'wholesale')}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            >
              <option value="all">Retail + Wholesale</option>
              <option value="retail">Retail Only</option>
              <option value="wholesale">Wholesale Only</option>
            </select>

            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            >
              <option value="all">All Payments</option>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="transfer">Transfer</option>
              <option value="credit">Credit</option>
            </select>

            <button
              type="button"
              onClick={() =>
                effectiveSession
                  ? setSessionModalState({ mode: 'eod_report', session: effectiveSession })
                  : window.print()
              }
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 cursor-pointer"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>{effectiveSession ? 'EOD Summary' : 'Print'}</span>
            </button>
          </div>
        </div>

        {(datePreset === 'active_session' || datePreset === 'session') && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
            <div className="flex flex-wrap items-center gap-2.5">
              <Clock className="h-3.5 w-3.5 text-teal-600" />
              {datePreset === 'session' ? (
                <select
                  value={effectiveSession?.id || ''}
                  onChange={(e) => setSelectedSessionId(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-mono font-semibold dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                >
                  {sessions.length === 0 ? (
                    <option value="">No recorded sessions yet</option>
                  ) : (
                    sessions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.sessionNumber} · {s.branchName} · {s.businessDateKey} ({s.status.toUpperCase()})
                      </option>
                    ))
                  )}
                </select>
              ) : activeSession ? (
                <span className="font-medium text-slate-700 dark:text-slate-200">
                  Active Session <span className="font-mono font-bold">{activeSession.sessionNumber}</span> · Business Day{' '}
                  <span className="font-mono font-semibold">{activeSession.businessDateKey}</span> · Opened{' '}
                  {formatDateTimeMs(activeSession.openedAtMs)}
                </span>
              ) : (
                <span className="text-amber-700 dark:text-amber-400 font-medium">
                  No open session on {activeBranch?.name || 'active branch'}. Open a session to tag transactions independent of device clock.
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {!activeSession && (
                <button
                  type="button"
                  onClick={() => setSessionModalState({ mode: 'open' })}
                  className="inline-flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 cursor-pointer"
                >
                  <Play className="h-3 w-3" />
                  <span>Open Day Session</span>
                </button>
              )}
              {effectiveSession && effectiveSession.status === 'open' && (
                <button
                  type="button"
                  onClick={() => setSessionModalState({ mode: 'close', session: effectiveSession })}
                  className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 cursor-pointer"
                >
                  Close Session &amp; Run EOD
                </button>
              )}
              {effectiveSession && (
                <button
                  type="button"
                  onClick={() => setSessionModalState({ mode: 'eod_report', session: effectiveSession })}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 cursor-pointer"
                >
                  View / Print EOD Report
                </button>
              )}
            </div>
          </div>
        )}

        {datePreset === 'custom' && (
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
            <span className="font-semibold text-slate-500">From:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
            <span className="font-semibold text-slate-500">To:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>
        )}
      </div>

      {/* Report Cards Selector */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 no-print">
        {(
          [
            {
              id: 'default',
              title: 'Default Executive Report',
              metric: formatCurrency(summary.netSalesRevenue, cur),
              sub: `${summary.salesCount} receipts · ${summary.grossMarginPct}% margin`,
            },
            {
              id: 'sales',
              title: 'Sales & Receipt Ledger',
              metric: `${summary.salesCount} Sales`,
              sub: `Retail ${formatCurrency(summary.retailSales, cur)} · Whs ${formatCurrency(summary.wholesaleSales, cur)}`,
            },
            {
              id: 'valuation',
              title: 'Stock Valuation Card',
              metric: formatCurrency(valuation.costValue, cur),
              sub: `Retail ${formatCurrency(valuation.retailValue, cur)} · ${valuation.outOfStockCount} out`,
            },
            {
              id: 'tax_expenses',
              title: 'Expense & Tax Report',
              metric: formatCurrency(summary.netTaxPayable, cur),
              sub: `Net tax payable · ${formatCurrency(summary.totalExpenses, cur)} spent`,
            },
            {
              id: 'audit',
              title: 'Transfers & Reconcile',
              metric: `${filteredTransfers.length + filteredRecs.length} Logs`,
              sub: `${filteredReturns.length} returns · ${filteredRecs.length} shift closes`,
            },
          ] as const
        ).map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={() => setActiveReportCard(card.id)}
            className={`rounded-xl border p-4 text-left transition-colors cursor-pointer ${
              activeReportCard === card.id
                ? 'border-teal-600 bg-teal-50/50 dark:border-teal-500 dark:bg-teal-950/30'
                : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800/40'
            }`}
          >
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">{card.title}</p>
            <p className="mt-1 text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {card.metric}
            </p>
            <p className="mt-1 text-[11px] text-slate-500 truncate">{card.sub}</p>
          </button>
        ))}
      </div>

      {/* DEFAULT REPORT VIEW */}
      {activeReportCard === 'default' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs font-medium text-slate-500">Net Sales Revenue</p>
              <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                {formatCurrency(summary.netSalesRevenue, cur)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Gross {formatCurrency(summary.grossSales, cur)} · Returns {formatCurrency(summary.totalReturns, cur)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs font-medium text-slate-500">Gross Profit</p>
              <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-teal-700 dark:text-teal-400">
                {formatCurrency(summary.grossProfit, cur)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Margin: {summary.grossMarginPct}% · COGS {formatCurrency(summary.netCogs, cur)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs font-medium text-slate-500">Net Operating Profit</p>
              <p
                className={`mt-1 text-2xl font-bold font-mono tabular-nums ${
                  summary.netOperatingProfit >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                {formatCurrency(summary.netOperatingProfit, cur)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                OpEx: {formatCurrency(summary.operatingExpenses + summary.payrollExpenses + summary.otherExpenses, cur)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs font-medium text-slate-500">Net Tax Payable</p>
              <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                {formatCurrency(summary.netTaxPayable, cur)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Output {formatCurrency(summary.netOutputTax, cur)} · Input {formatCurrency(summary.inputTaxPaid, cur)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4">
                Daily Revenue, Gross Profit &amp; Expenditures
              </h3>
              {dailyChartData.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-xs text-slate-500">
                  No transactions in selected date range.
                </div>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dailyChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="sales" name="Revenue" fill="#0F172A" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="profit" name="Gross Profit" fill="#0D9488" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="expenses" name="Expenses" fill="#D97706" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3">
                Top Selling Items
              </h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {topProducts.length === 0 ? (
                  <p className="text-xs text-slate-500 py-8 text-center">No sales recorded in period.</p>
                ) : (
                  topProducts.map((tp, idx) => (
                    <div
                      key={tp.name}
                      className="flex items-center justify-between text-xs py-1.5 border-b border-slate-100 dark:border-slate-800"
                    >
                      <div className="min-w-0 pr-2">
                        <p className="font-semibold text-slate-900 dark:text-white truncate">
                          {idx + 1}. {tp.name}
                        </p>
                        <p className="text-[11px] font-mono text-slate-400">
                          {tp.sku} · {formatNumber(tp.qty)} sold
                        </p>
                      </div>
                      <span className="font-mono font-bold tabular-nums text-slate-900 dark:text-white shrink-0">
                        {formatCurrency(tp.revenue, cur)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Multi-Branch Comparison */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden dark:border-slate-800 dark:bg-slate-900">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Multi-Branch Performance Matrix
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-[11px] uppercase text-slate-500">
                  <tr>
                    <th className="py-2.5 px-4">Branch</th>
                    <th className="py-2.5 px-4 text-right">Receipts</th>
                    <th className="py-2.5 px-4 text-right">Net Sales</th>
                    <th className="py-2.5 px-4 text-right">Gross Profit</th>
                    <th className="py-2.5 px-4 text-right">Expenses</th>
                    <th className="py-2.5 px-4 text-right">Stock Cost Value</th>
                    <th className="py-2.5 px-4 text-right">Out of Stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono tabular-nums">
                  {branchComparison.map(({ branch, acc, val }) => (
                    <tr key={branch.id}>
                      <td className="py-2.5 px-4 font-sans font-semibold text-slate-900 dark:text-white">
                        {branch.name}
                      </td>
                      <td className="py-2.5 px-4 text-right">{acc.salesCount}</td>
                      <td className="py-2.5 px-4 text-right font-bold">
                        {formatCurrency(acc.netSalesRevenue, cur)}
                      </td>
                      <td className="py-2.5 px-4 text-right text-teal-700 dark:text-teal-400">
                        {formatCurrency(acc.grossProfit, cur)}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        {formatCurrency(acc.totalExpenses, cur)}
                      </td>
                      <td className="py-2.5 px-4 text-right">{formatCurrency(val.costValue, cur)}</td>
                      <td className="py-2.5 px-4 text-right text-red-600">{val.outOfStockCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SALES LEDGER REPORT CARD */}
      {activeReportCard === 'sales' && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Sales &amp; Receipt Ledger ({filteredSales.length})
            </h3>
            <button
              type="button"
              onClick={handleExportSalesCSV}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export Sales CSV</span>
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-[11px] uppercase text-slate-500">
                <tr>
                  <th className="py-2.5 px-4">Tracking #</th>
                  <th className="py-2.5 px-4">Date &amp; Staff</th>
                  <th className="py-2.5 px-4">Branch / Mode</th>
                  <th className="py-2.5 px-4">Payment</th>
                  <th className="py-2.5 px-4 text-right">Tax</th>
                  <th className="py-2.5 px-4 text-right">Total</th>
                  <th className="py-2.5 px-4 text-right">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredSales.map((s) => (
                  <tr key={s.id}>
                    <td className="py-2.5 px-4 font-mono font-bold text-slate-900 dark:text-white">
                      {s.trackingNumber}
                    </td>
                    <td className="py-2.5 px-4">
                      <p className="font-medium text-slate-900 dark:text-white">
                        {formatTimestamp(s.createdAt)}
                      </p>
                      <p className="text-[11px] text-slate-500">{s.staffName}</p>
                    </td>
                    <td className="py-2.5 px-4 capitalize">
                      {s.branchName} · {s.saleMode}
                    </td>
                    <td className="py-2.5 px-4 uppercase font-mono">{s.paymentMethod}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                      {formatCurrency(s.taxAmount, cur)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-bold">
                      {formatCurrency(s.total, cur)}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => setPreviewSale(s)}
                        className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 cursor-pointer"
                      >
                        <Eye className="h-3 w-3" />
                        <span>View</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VALUATION REPORT CARD */}
      {activeReportCard === 'valuation' && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Stock Valuation &amp; Reorder Report
            </h3>
            <FileSpreadsheet className="h-4 w-4 text-teal-600" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono tabular-nums">
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950">
              <p className="text-[11px] font-sans text-slate-500">Total Cost Value</p>
              <p className="text-lg font-bold">{formatCurrency(valuation.costValue, cur)}</p>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950">
              <p className="text-[11px] font-sans text-slate-500">Total Retail Value</p>
              <p className="text-lg font-bold text-teal-700 dark:text-teal-400">
                {formatCurrency(valuation.retailValue, cur)}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950">
              <p className="text-[11px] font-sans text-slate-500">Wholesale Value</p>
              <p className="text-lg font-bold">{formatCurrency(valuation.wholesaleValue, cur)}</p>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950">
              <p className="text-[11px] font-sans text-slate-500">Out / Low Stock SKUs</p>
              <p className="text-lg font-bold text-red-600">
                {valuation.outOfStockCount + valuation.negativeStockCount} / {valuation.lowStockCount}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAX & EXPENSE REPORT CARD */}
      {activeReportCard === 'tax_expenses' && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-3 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Tax &amp; Expenditure Breakdown ({effectiveRange.from} to {effectiveRange.to})
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs font-mono tabular-nums">
            <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800">
              <p className="font-sans text-slate-500">Net Output Tax</p>
              <p className="mt-1 text-base font-bold">{formatCurrency(summary.netOutputTax, cur)}</p>
            </div>
            <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800">
              <p className="font-sans text-slate-500">Input Tax Paid</p>
              <p className="mt-1 text-base font-bold text-emerald-600">
                {formatCurrency(summary.inputTaxPaid, cur)}
              </p>
            </div>
            <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800">
              <p className="font-sans text-slate-500">Net Tax Payable</p>
              <p className="mt-1 text-base font-bold">{formatCurrency(summary.netTaxPayable, cur)}</p>
            </div>
          </div>
        </div>
      )}

      {/* AUDIT & SESSIONS REPORT CARD */}
      {activeReportCard === 'audit' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
              <h4 className="text-xs font-bold uppercase text-slate-600 dark:text-slate-300">
                Business Day Sessions &amp; EOD History ({sessions.length})
              </h4>
              {!activeSession && (
                <button
                  type="button"
                  onClick={() => setSessionModalState({ mode: 'open' })}
                  className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 cursor-pointer"
                >
                  Open New Session
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-[11px] uppercase text-slate-500">
                  <tr>
                    <th className="py-2.5 px-4">Session #</th>
                    <th className="py-2.5 px-4">Branch &amp; Biz Date</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4 text-right">Net Sales</th>
                    <th className="py-2.5 px-4 text-right">Variance</th>
                    <th className="py-2.5 px-4 text-right">EOD Report</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {sessions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500">
                        No sessions opened yet.
                      </td>
                    </tr>
                  ) : (
                    sessions.map((ses) => (
                      <tr key={ses.id}>
                        <td className="py-2.5 px-4 font-mono font-bold text-slate-900 dark:text-white">
                          {ses.sessionNumber}
                        </td>
                        <td className="py-2.5 px-4">
                          {ses.branchName} · <span className="font-mono">{ses.businessDateKey}</span>
                        </td>
                        <td className="py-2.5 px-4">
                          <span
                            className={`font-semibold uppercase text-[11px] ${
                              ses.status === 'open' ? 'text-teal-700 dark:text-teal-400' : 'text-slate-500'
                            }`}
                          >
                            {ses.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                          {ses.status === 'closed' ? formatCurrency(ses.netSalesTotal, cur) : 'In Progress'}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                          {ses.status === 'closed' ? formatCurrency(ses.varianceTotal, cur) : '—'}
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              setSessionModalState({
                                mode: ses.status === 'open' ? 'close' : 'eod_report',
                                session: ses,
                              })
                            }
                            className="inline-flex items-center gap-1 rounded border border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 cursor-pointer"
                          >
                            <span>{ses.status === 'open' ? 'Close & EOD' : 'View / Print EOD'}</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h4 className="text-xs font-bold uppercase text-slate-500 mb-3">
                Transfers ({filteredTransfers.length})
              </h4>
              <div className="space-y-2 text-xs">
                {filteredTransfers.map((t) => (
                  <div key={t.id} className="border-b border-slate-100 pb-2 dark:border-slate-800">
                    <p className="font-mono font-bold">{t.trackingNumber}</p>
                    <p className="text-slate-500">
                      {t.fromBranchName} → {t.toBranchName} ({t.totalQty} units)
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h4 className="text-xs font-bold uppercase text-slate-500 mb-3">
                Returns ({filteredReturns.length})
              </h4>
              <div className="space-y-2 text-xs">
                {filteredReturns.map((r) => (
                  <div key={r.id} className="border-b border-slate-100 pb-2 dark:border-slate-800">
                    <p className="font-mono font-bold">{r.trackingNumber}</p>
                    <p className="text-slate-500">
                      -{formatCurrency(r.refundTotal, cur)} · {r.reason}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h4 className="text-xs font-bold uppercase text-slate-500 mb-3">
                Reconciliations ({filteredRecs.length})
              </h4>
              <div className="space-y-2 text-xs">
                {filteredRecs.map((rec) => (
                  <div key={rec.id} className="border-b border-slate-100 pb-2 dark:border-slate-800">
                    <p className="font-mono font-bold">{rec.trackingNumber}</p>
                    <p className="text-slate-500">
                      {rec.branchName} · Variance: {formatCurrency(rec.varianceTotal, cur)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {previewSale && company && (
        <ReceiptModal sale={previewSale} company={company} onClose={() => setPreviewSale(null)} />
      )}

      {sessionModalState && (
        <SessionModal
          initialMode={sessionModalState.mode}
          inspectSession={sessionModalState.session}
          onClose={() => setSessionModalState(null)}
        />
      )}
    </div>
  );
};
