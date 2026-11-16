import React, { useMemo, useState } from 'react';
import {
  Calculator,
  CheckCircle2,
  Download,
  PackagePlus,
  Plus,
  Receipt,
  Scale,
  X,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { ExpenseType, Product } from '../types';
import { calculateAccountingSummary, roundMoney } from '../utils/accounting';
import { downloadCSVFile, exportRowsToCSV } from '../utils/csv';
import { formatCurrency, getTodayDateKey } from '../utils/format';

export const AccountingExpensesView: React.FC = () => {
  const {
    company,
    branches,
    activeBranch,
    products,
    sales,
    returns,
    expenses,
    reconciliations,
    recordExpense,
    commitReconciliation,
  } = useApp();

  const cur = company?.currency || '₦';
  const [subTab, setSubTab] = useState<'expenses' | 'ledger' | 'reconciliation'>('expenses');
  const [branchFilter, setBranchFilter] = useState<string>(activeBranch?.id || 'all');

  // Expense Form State
  const [expBranchId, setExpBranchId] = useState<string>(activeBranch?.id || branches[0]?.id || '');
  const [expenseType, setExpenseType] = useState<ExpenseType>('inventory_purchase');
  const [category, setCategory] = useState('Stock Restock');
  const [vendor, setVendor] = useState('');
  const [description, setDescription] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'transfer' | 'credit'>('transfer');
  const [manualAmount, setManualAmount] = useState('');
  const [inputTax, setInputTax] = useState('0');
  const [purchaseSearch, setPurchaseSearch] = useState('');
  const [purchaseItems, setPurchaseItems] = useState<{ product: Product; qty: number; unitCost: number }[]>([]);
  const [expenseFeedback, setExpenseFeedback] = useState('');
  const [isSavingExp, setIsSavingExp] = useState(false);

  // Reconciliation State
  const [recBranchId, setRecBranchId] = useState<string>(activeBranch?.id || branches[0]?.id || '');
  const [recDateKey, setRecDateKey] = useState<string>(getTodayDateKey());
  const [actualCash, setActualCash] = useState('');
  const [actualCard, setActualCard] = useState('');
  const [actualTransfer, setActualTransfer] = useState('');
  const [recNotes, setRecNotes] = useState('');
  const [recFeedback, setRecFeedback] = useState('');

  const scopedSales = useMemo(
    () => (branchFilter === 'all' ? sales : sales.filter((s) => s.branchId === branchFilter)),
    [sales, branchFilter]
  );
  const scopedReturns = useMemo(
    () => (branchFilter === 'all' ? returns : returns.filter((r) => r.branchId === branchFilter)),
    [returns, branchFilter]
  );
  const scopedExpenses = useMemo(
    () => (branchFilter === 'all' ? expenses : expenses.filter((e) => e.branchId === branchFilter)),
    [expenses, branchFilter]
  );

  const accounting = useMemo(
    () => calculateAccountingSummary(scopedSales, scopedReturns, scopedExpenses),
    [scopedSales, scopedReturns, scopedExpenses]
  );

  const purchaseCatalogMatches = useMemo(() => {
    const term = purchaseSearch.trim().toLowerCase();
    return products
      .filter((p) => p.branchId === expBranchId)
      .filter((p) => !term || p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term))
      .slice(0, 30);
  }, [products, expBranchId, purchaseSearch]);

  const purchaseComputedTotal = useMemo(
    () => roundMoney(purchaseItems.reduce((sum, item) => sum + item.qty * item.unitCost, 0)),
    [purchaseItems]
  );

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setExpenseFeedback('');
    const amount =
      expenseType === 'inventory_purchase' && purchaseItems.length > 0
        ? purchaseComputedTotal
        : Math.max(0, Number.parseFloat(manualAmount) || 0);

    if (amount <= 0) {
      setExpenseFeedback('Enter a valid amount or add purchase items.');
      return;
    }

    setIsSavingExp(true);
    try {
      const created = await recordExpense({
        branchId: expBranchId,
        expenseType,
        category:
          expenseType === 'inventory_purchase' ? 'Inventory Purchase' : category || 'Operating',
        vendor,
        description:
          description ||
          (expenseType === 'inventory_purchase'
            ? `Stock purchase (${purchaseItems.length} SKUs)`
            : category),
        paymentMethod,
        amount,
        taxAmount: Math.max(0, Number.parseFloat(inputTax) || 0),
        purchaseItems: expenseType === 'inventory_purchase' ? purchaseItems : undefined,
      });

      setPurchaseItems([]);
      setManualAmount('');
      setInputTax('0');
      setVendor('');
      setDescription('');
      setExpenseFeedback(
        `Expense ${created.trackingNumber} recorded (${formatCurrency(created.totalAmount, cur)}).`
      );
    } catch (err) {
      setExpenseFeedback(err instanceof Error ? err.message : 'Failed to save expense.');
    } finally {
      setIsSavingExp(false);
    }
  };

  // Reconciliation Calculation for selected branch + date
  const recDaySummary = useMemo(() => {
    const daySales = sales.filter((s) => s.branchId === recBranchId && s.dateKey === recDateKey);
    const dayReturns = returns.filter((r) => r.branchId === recBranchId && r.dateKey === recDateKey);
    const dayExpenses = expenses.filter((e) => e.branchId === recBranchId && e.dateKey === recDateKey);
    return calculateAccountingSummary(daySales, dayReturns, dayExpenses);
  }, [sales, returns, expenses, recBranchId, recDateKey]);

  const handleCommitReconciliation = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecFeedback('');
    const aCash = Number.parseFloat(actualCash) || 0;
    const aCard = Number.parseFloat(actualCard) || 0;
    const aTransfer = Number.parseFloat(actualTransfer) || 0;

    try {
      const rec = await commitReconciliation({
        branchId: recBranchId,
        dateKey: recDateKey,
        expectedCash: recDaySummary.cashOutflows.expectedNetCash,
        actualCash: aCash,
        expectedCard: recDaySummary.paymentBreakdown.card,
        actualCard: aCard,
        expectedTransfer: recDaySummary.paymentBreakdown.transfer,
        actualTransfer: aTransfer,
        cashRefunds: recDaySummary.cashOutflows.cashRefunds,
        cashExpenses: recDaySummary.cashOutflows.cashExpenses,
        notes: recNotes,
      });
      setRecFeedback(
        `Reconciliation ${rec.trackingNumber} locked (${
          rec.status === 'balanced'
            ? 'Balanced'
            : `Variance: ${formatCurrency(rec.varianceTotal, cur)}`
        }).`
      );
      setRecNotes('');
    } catch (err) {
      setRecFeedback(err instanceof Error ? err.message : 'Failed to save reconciliation.');
    }
  };

  const handleExportExpenses = () => {
    const csv = exportRowsToCSV(
      ['Tracking', 'Date', 'Branch', 'Type', 'Category', 'Vendor', 'Description', 'Payment', 'Net Amount', 'Input Tax', 'Total'],
      scopedExpenses.map((e) => [
        e.trackingNumber,
        e.dateKey,
        e.branchName,
        e.expenseType,
        e.category,
        e.vendor,
        e.description,
        e.paymentMethod,
        e.amount,
        e.taxAmount,
        e.totalAmount,
      ])
    );
    downloadCSVFile(`expenses_ledger_${getTodayDateKey()}.csv`, csv);
  };

  return (
    <div className="p-6 space-y-6 max-w-[1440px] mx-auto">
      {/* Top Sub-Navigation & Branch Scope */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-200/70 dark:bg-slate-800">
          {(
            [
              { id: 'expenses', label: 'Expenses & Stock Purchases' },
              { id: 'ledger', label: 'P&L and Tax Accounting' },
              { id: 'reconciliation', label: 'Daily Reconciliation' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubTab(tab.id)}
              className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                subTab === tab.id
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <select
          value={branchFilter}
          onChange={(e) => setBranchFilter(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          <option value="all">Consolidated (All Branches)</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      {/* TAB 1: EXPENSES & INVENTORY PURCHASES */}
      {subTab === 'expenses' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleSaveExpense}
            className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-5 space-y-4 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <PackagePlus className="h-4 w-4 text-teal-600" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Record Expense / Purchase
                </h3>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Branch
                </label>
                <select
                  value={expBranchId}
                  onChange={(e) => {
                    setExpBranchId(e.target.value);
                    setPurchaseItems([]);
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Expenditure Type
                </label>
                <select
                  value={expenseType}
                  onChange={(e) => {
                    const next = e.target.value as ExpenseType;
                    setExpenseType(next);
                    if (next === 'inventory_purchase') setCategory('Stock Restock');
                    else if (next === 'operating') setCategory('Utilities & Rent');
                    else if (next === 'payroll') setCategory('Staff Salaries');
                    else if (next === 'tax_payment') setCategory('VAT / Tax Remittance');
                    else setCategory('Miscellaneous');
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                >
                  <option value="inventory_purchase">Inventory Purchase (Updates Stock)</option>
                  <option value="operating">Operating Expense (Rent, Power, etc.)</option>
                  <option value="payroll">Payroll &amp; Staff Wages</option>
                  <option value="tax_payment">Tax Remittance</option>
                  <option value="other">Other Expenditure</option>
                </select>
              </div>
            </div>

            {expenseType === 'inventory_purchase' ? (
              <div className="space-y-3 rounded-lg border border-slate-200 p-3 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-950">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Add Stock Items Purchased (Increments Branch Inventory)
                </label>
                <input
                  type="text"
                  value={purchaseSearch}
                  onChange={(e) => setPurchaseSearch(e.target.value)}
                  placeholder="Search item to restock..."
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
                {purchaseSearch && (
                  <div className="max-h-36 overflow-y-auto divide-y divide-slate-100 rounded border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                    {purchaseCatalogMatches.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setPurchaseItems((prev) =>
                            prev.some((x) => x.product.id === p.id)
                              ? prev
                              : [...prev, { product: p, qty: 10, unitCost: p.cost }]
                          );
                          setPurchaseSearch('');
                        }}
                        className="w-full flex items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <span className="truncate pr-2 font-medium text-slate-900 dark:text-white">
                          {p.name}
                        </span>
                        <span className="font-mono text-slate-500 shrink-0">
                          Stock: {p.qty}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {purchaseItems.length > 0 && (
                  <div className="space-y-2 pt-1">
                    {purchaseItems.map((line) => (
                      <div key={line.product.id} className="flex items-center gap-2 text-xs">
                        <span className="flex-1 truncate font-medium text-slate-900 dark:text-white">
                          {line.product.name}
                        </span>
                        <input
                          type="number"
                          min={1}
                          value={line.qty}
                          onChange={(e) => {
                            const q = Math.max(1, Number.parseFloat(e.target.value) || 1);
                            setPurchaseItems((prev) =>
                              prev.map((x) => (x.product.id === line.product.id ? { ...x, qty: q } : x))
                            );
                          }}
                          title="Purchase Qty"
                          className="w-16 rounded border border-slate-300 bg-white px-1.5 py-1 text-right font-mono dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                        />
                        <span className="text-slate-400">×</span>
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={line.unitCost}
                          onChange={(e) => {
                            const c = Math.max(0, Number.parseFloat(e.target.value) || 0);
                            setPurchaseItems((prev) =>
                              prev.map((x) =>
                                x.product.id === line.product.id ? { ...x, unitCost: c } : x
                              )
                            );
                          }}
                          title="Unit Cost"
                          className="w-20 rounded border border-slate-300 bg-white px-1.5 py-1 text-right font-mono dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setPurchaseItems((prev) =>
                              prev.filter((x) => x.product.id !== line.product.id)
                            )
                          }
                          className="text-red-500 cursor-pointer"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    <div className="flex justify-between pt-2 border-t border-slate-200 dark:border-slate-800 text-xs font-mono font-bold">
                      <span className="font-sans">Computed Stock Cost:</span>
                      <span>{formatCurrency(purchaseComputedTotal, cur)}</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Category
                </label>
                <input
                  type="text"
                  required
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g. Electricity, Rent, Fuel, Logistics"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Supplier / Vendor
                </label>
                <input
                  type="text"
                  value={vendor}
                  onChange={(e) => setVendor(e.target.value)}
                  placeholder="e.g. Fidson Dist. / Landlord"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Payment Method
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) =>
                    setPaymentMethod(e.target.value as 'cash' | 'card' | 'transfer' | 'credit')
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                >
                  <option value="transfer">Bank Transfer</option>
                  <option value="cash">Cash from Drawer</option>
                  <option value="card">Card</option>
                  <option value="credit">On Credit (Payable)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Net Amount ({cur})
                </label>
                <input
                  type="number"
                  step="any"
                  min={0}
                  disabled={expenseType === 'inventory_purchase' && purchaseItems.length > 0}
                  value={
                    expenseType === 'inventory_purchase' && purchaseItems.length > 0
                      ? purchaseComputedTotal
                      : manualAmount
                  }
                  onChange={(e) => setManualAmount(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Input Tax / VAT ({cur})
                </label>
                <input
                  type="number"
                  step="any"
                  min={0}
                  value={inputTax}
                  onChange={(e) => setInputTax(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Description / Invoice Reference
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Invoice # or expense details"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>

            {expenseFeedback && (
              <p className="text-xs font-semibold text-teal-700 dark:text-teal-400">
                {expenseFeedback}
              </p>
            )}

            <button
              type="submit"
              disabled={isSavingExp}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-teal-600 py-2.5 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>{isSavingExp ? 'Recording...' : 'Post Expenditure to Ledger'}</span>
            </button>
          </form>

          {/* Expense Ledger Table */}
          <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white overflow-hidden dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Expenditure Ledger ({scopedExpenses.length})
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Total Posted: {formatCurrency(accounting.totalExpenses, cur)} · Input Tax:{' '}
                  {formatCurrency(accounting.inputTaxPaid, cur)}
                </p>
              </div>
              <button
                type="button"
                onClick={handleExportExpenses}
                className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Export CSV</span>
              </button>
            </div>

            <div className="overflow-x-auto max-h-[540px]">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-[11px] uppercase text-slate-500">
                  <tr>
                    <th className="py-2.5 px-4">Tracking / Date</th>
                    <th className="py-2.5 px-4">Description</th>
                    <th className="py-2.5 px-4">Type</th>
                    <th className="py-2.5 px-4 text-right">Tax</th>
                    <th className="py-2.5 px-4 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {scopedExpenses.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-slate-500">
                        No expenses recorded yet.
                      </td>
                    </tr>
                  ) : (
                    scopedExpenses.map((exp) => (
                      <tr key={exp.id}>
                        <td className="py-2.5 px-4 font-mono whitespace-nowrap">
                          <p className="font-semibold text-slate-900 dark:text-white">
                            {exp.trackingNumber}
                          </p>
                          <p className="text-[11px] text-slate-400">{exp.dateKey}</p>
                        </td>
                        <td className="py-2.5 px-4">
                          <p className="font-semibold text-slate-900 dark:text-white">
                            {exp.description}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {exp.branchName} · {exp.vendor || exp.category} · {exp.paymentMethod}
                          </p>
                        </td>
                        <td className="py-2.5 px-4 capitalize text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {exp.expenseType.replace('_', ' ')}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-500">
                          {formatCurrency(exp.taxAmount, cur)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                          {formatCurrency(exp.totalAmount, cur)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: P&L AND TAX ACCOUNTING STATEMENT */}
      {subTab === 'ledger' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-6 space-y-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Calculator className="h-5 w-5 text-teal-600" />
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Income Statement &amp; Automated Tax Ledger
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Real-time double-entry summary across sales, COGS, returns, and expenditures
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3 text-sm font-mono tabular-nums">
              <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="font-sans text-slate-600 dark:text-slate-300">
                  Retail Sales Revenue ({accounting.salesCount} total receipts)
                </span>
                <span className="font-semibold">{formatCurrency(accounting.retailSales, cur)}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="font-sans text-slate-600 dark:text-slate-300">
                  Wholesale Sales Revenue
                </span>
                <span className="font-semibold">{formatCurrency(accounting.wholesaleSales, cur)}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800 text-red-600 dark:text-red-400">
                <span className="font-sans">
                  Less: Sales Returns &amp; Refunds ({accounting.returnsCount})
                </span>
                <span>-{formatCurrency(accounting.totalReturns, cur)}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-200 dark:border-slate-700 font-bold text-slate-900 dark:text-white">
                <span className="font-sans">Net Sales Revenue (Incl. Tax)</span>
                <span>{formatCurrency(accounting.netSalesRevenue, cur)}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800 text-slate-500">
                <span className="font-sans">Less: Net Output Tax Collected</span>
                <span>-{formatCurrency(accounting.netOutputTax, cur)}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                <span className="font-sans">Less: Cost of Goods Sold (Net COGS)</span>
                <span>-{formatCurrency(accounting.netCogs, cur)}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-200 dark:border-slate-700 font-bold text-teal-700 dark:text-teal-400">
                <span className="font-sans">Gross Profit ({accounting.grossMarginPct}% margin)</span>
                <span>{formatCurrency(accounting.grossProfit, cur)}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                <span className="font-sans">Less: Operating, Payroll &amp; Other Expenses</span>
                <span>
                  -{formatCurrency(accounting.operatingExpenses + accounting.payrollExpenses + accounting.otherExpenses, cur)}
                </span>
              </div>
              <div className="flex justify-between py-3 text-base font-bold text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-950 px-3 rounded-lg">
                <span className="font-sans">Net Operating Profit</span>
                <span className={accounting.netOperatingProfit < 0 ? 'text-red-600' : 'text-emerald-600'}>
                  {formatCurrency(accounting.netOperatingProfit, cur)}
                </span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 space-y-6">
            <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                <Receipt className="h-4 w-4 text-teal-600" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  VAT / Sales Tax Position
                </h3>
              </div>
              <div className="space-y-2.5 text-xs font-mono tabular-nums">
                <div className="flex justify-between">
                  <span className="font-sans text-slate-500">Output Tax on Sales</span>
                  <span>{formatCurrency(accounting.outputTaxCollected, cur)}</span>
                </div>
                <div className="flex justify-between text-red-600">
                  <span className="font-sans">Tax Reversed on Returns</span>
                  <span>-{formatCurrency(accounting.returnTaxReversed, cur)}</span>
                </div>
                <div className="flex justify-between text-emerald-600">
                  <span className="font-sans">Less: Input Tax on Purchases &amp; Expenses</span>
                  <span>-{formatCurrency(accounting.inputTaxPaid, cur)}</span>
                </div>
                <div className="flex justify-between text-emerald-600">
                  <span className="font-sans">Less: Tax Remittances Paid</span>
                  <span>-{formatCurrency(accounting.taxPaymentsMade, cur)}</span>
                </div>
                <div className="flex justify-between pt-2.5 border-t border-slate-200 dark:border-slate-800 text-sm font-bold text-slate-900 dark:text-white">
                  <span className="font-sans">Net Tax Payable</span>
                  <span>{formatCurrency(accounting.netTaxPayable, cur)}</span>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-3 dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Payment Channel Breakdown
              </h3>
              <div className="space-y-2 text-xs font-mono tabular-nums">
                <div className="flex justify-between">
                  <span className="font-sans text-slate-500">Cash Sales</span>
                  <span>{formatCurrency(accounting.paymentBreakdown.cash, cur)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-sans text-slate-500">Card / POS Terminal</span>
                  <span>{formatCurrency(accounting.paymentBreakdown.card, cur)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-sans text-slate-500">Bank Transfer</span>
                  <span>{formatCurrency(accounting.paymentBreakdown.transfer, cur)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-sans text-slate-500">Credit / On Account</span>
                  <span>{formatCurrency(accounting.paymentBreakdown.credit, cur)}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                  <span className="font-sans text-slate-500">Inventory Restock Outflow</span>
                  <span>{formatCurrency(accounting.inventoryPurchases, cur)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: ACCURATE DAILY RECONCILIATION */}
      {subTab === 'reconciliation' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleCommitReconciliation}
            className="lg:col-span-6 rounded-xl border border-slate-200 bg-white p-6 space-y-4 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
              <Scale className="h-4 w-4 text-teal-600" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Close &amp; Reconcile Shift / Day
              </h3>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Branch
                </label>
                <select
                  value={recBranchId}
                  onChange={(e) => setRecBranchId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={recDateKey}
                  onChange={(e) => setRecDateKey(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2 text-xs font-mono tabular-nums dark:border-slate-800 dark:bg-slate-950">
              <div className="flex justify-between">
                <span className="font-sans text-slate-500">Cash Sales</span>
                <span>{formatCurrency(recDaySummary.paymentBreakdown.cash, cur)}</span>
              </div>
              <div className="flex justify-between text-red-600">
                <span className="font-sans">Less Cash Refunds &amp; Cash Expenses</span>
                <span>
                  -
                  {formatCurrency(
                    recDaySummary.cashOutflows.cashRefunds + recDaySummary.cashOutflows.cashExpenses,
                    cur
                  )}
                </span>
              </div>
              <div className="flex justify-between font-bold text-slate-900 dark:text-white pt-1 border-t border-slate-200 dark:border-slate-800">
                <span className="font-sans">Expected Net Cash in Drawer</span>
                <span>{formatCurrency(recDaySummary.cashOutflows.expectedNetCash, cur)}</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span className="font-sans">Expected Card Settlement</span>
                <span>{formatCurrency(recDaySummary.paymentBreakdown.card, cur)}</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span className="font-sans">Expected Bank Transfers</span>
                <span>{formatCurrency(recDaySummary.paymentBreakdown.transfer, cur)}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Actual Counted Cash
                </label>
                <input
                  type="number"
                  step="any"
                  min={0}
                  required
                  value={actualCash}
                  onChange={(e) => setActualCash(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono dark:border-slate-700 dark:bg-slate-950 dark:text-white"
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
                  placeholder="0"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Actual Transfers
                </label>
                <input
                  type="number"
                  step="any"
                  min={0}
                  required
                  value={actualTransfer}
                  onChange={(e) => setActualTransfer(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
            </div>

            <input
              type="text"
              value={recNotes}
              onChange={(e) => setRecNotes(e.target.value)}
              placeholder="Reconciliation remarks (optional)"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />

            {recFeedback && (
              <p className="text-xs font-semibold text-teal-700 dark:text-teal-400">{recFeedback}</p>
            )}

            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-slate-900 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-teal-600 dark:hover:bg-teal-700 cursor-pointer"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>Commit Daily Reconciliation</span>
            </button>
          </form>

          <div className="lg:col-span-6 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white border-b border-slate-100 pb-3 dark:border-slate-800">
              Reconciliation Audit History ({reconciliations.length})
            </h3>
            <div className="mt-3 space-y-2.5 max-h-[480px] overflow-y-auto">
              {reconciliations.length === 0 ? (
                <p className="py-10 text-center text-xs text-slate-500">
                  No daily reconciliations committed yet.
                </p>
              ) : (
                reconciliations.map((rec) => (
                  <div
                    key={rec.id}
                    className="rounded-lg border border-slate-200 p-3.5 text-xs space-y-1.5 dark:border-slate-800"
                  >
                    <div className="flex items-center justify-between font-mono">
                      <span className="font-bold text-slate-900 dark:text-white">
                        {rec.trackingNumber} · {rec.dateKey}
                      </span>
                      <span
                        className={`font-semibold ${
                          rec.status === 'balanced' ? 'text-emerald-600' : 'text-amber-600'
                        }`}
                      >
                        {rec.status === 'balanced'
                          ? 'Balanced'
                          : `Variance: ${formatCurrency(rec.varianceTotal, cur)}`}
                      </span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-300">
                      {rec.branchName} · Closed by {rec.staffName}
                    </p>
                    <p className="text-slate-500 font-mono">
                      Cash: {formatCurrency(rec.actualCash, cur)}/{formatCurrency(rec.expectedCash, cur)} · Card:{' '}
                      {formatCurrency(rec.actualCard, cur)}/{formatCurrency(rec.expectedCard, cur)} · Transfer:{' '}
                      {formatCurrency(rec.actualTransfer, cur)}/{formatCurrency(rec.expectedTransfer, cur)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
