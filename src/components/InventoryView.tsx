import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  ClipboardCheck,
  Download,
  Edit3,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { Product } from '../types';
import { calculateInventoryValuation } from '../utils/accounting';
import {
  ParsedCSVProductRow,
  downloadCSVFile,
  exportProductsToCSV,
  parseInventoryCSV,
} from '../utils/csv';
import { formatCurrency, formatNumber, getStockStatus } from '../utils/format';

export const InventoryView: React.FC = () => {
  const {
    company,
    branches,
    activeBranch,
    products,
    transfers,
    stockTakes,
    saveProduct,
    deleteProduct,
    importCSVProducts,
    reloadPreloadedCSV,
    transferStock,
    commitStockTake,
  } = useApp();

  const cur = company?.currency || '₦';

  const [branchFilter, setBranchFilter] = useState<string>(activeBranch?.id || 'all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'in' | 'low' | 'out' | 'negative'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [pageSize, setPageSize] = useState(50);

  // Sub-tabs: catalog | transfers | stock_take
  const [activeTab, setActiveTab] = useState<'catalog' | 'transfers' | 'stock_take'>('catalog');

  // Add/Edit Modal
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showProductModal, setShowProductModal] = useState(false);
  const [formState, setFormState] = useState({
    name: '',
    sku: '',
    category: 'General Pharmacy',
    price: '',
    wholesalePrice: '',
    cost: '',
    qty: '',
    minStock: '2',
    unit: 'pcs',
    branchId: activeBranch?.id || '',
  });

  // Import/Export Modal
  const [showImportModal, setShowImportModal] = useState(false);
  const [parsedImportRows, setParsedImportRows] = useState<ParsedCSVProductRow[]>([]);
  const [importTargetBranch, setImportTargetBranch] = useState(activeBranch?.id || '');
  const [importMode, setImportMode] = useState<'merge' | 'add_only'>('merge');
  const [importFeedback, setImportFeedback] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  // Stock Transfer Modal
  const [fromBranchId, setFromBranchId] = useState(activeBranch?.id || branches[0]?.id || '');
  const [toBranchId, setToBranchId] = useState(branches[1]?.id || '');
  const [transferSearch, setTransferSearch] = useState('');
  const [transferCart, setTransferCart] = useState<{ product: Product; qty: number }[]>([]);
  const [transferNotes, setTransferNotes] = useState('');
  const [transferFeedback, setTransferFeedback] = useState('');

  // Stock Take State
  const [stockTakeBranchId, setStockTakeBranchId] = useState(activeBranch?.id || branches[0]?.id || '');
  const [countedMap, setCountedMap] = useState<Record<string, number>>({});
  const [stockTakeNotes, setStockTakeNotes] = useState('');
  const [stockTakeFeedback, setStockTakeFeedback] = useState('');

  const scopedProducts = useMemo(() => {
    if (branchFilter === 'all') return products;
    return products.filter((p) => p.branchId === branchFilter);
  }, [products, branchFilter]);

  const valuation = useMemo(() => calculateInventoryValuation(scopedProducts), [scopedProducts]);

  const filteredProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return scopedProducts.filter((p) => {
      const st = getStockStatus(p.qty, p.minStock);
      if (statusFilter !== 'all' && st !== statusFilter) return false;
      if (!term) return true;
      return (
        p.name.toLowerCase().includes(term) ||
        p.sku.toLowerCase().includes(term) ||
        p.category.toLowerCase().includes(term) ||
        p.branchName.toLowerCase().includes(term)
      );
    });
  }, [scopedProducts, statusFilter, searchTerm]);

  const visibleProducts = useMemo(() => filteredProducts.slice(0, pageSize), [filteredProducts, pageSize]);

  const openNewProduct = () => {
    setEditingProduct(null);
    setFormState({
      name: '',
      sku: `SKU-${Math.floor(1000 + Math.random() * 9000)}`,
      category: 'General Pharmacy',
      price: '0',
      wholesalePrice: '0',
      cost: '0',
      qty: '0',
      minStock: '2',
      unit: 'pcs',
      branchId: branchFilter !== 'all' ? branchFilter : activeBranch?.id || branches[0]?.id || '',
    });
    setShowProductModal(true);
  };

  const openEditProduct = (p: Product) => {
    setEditingProduct(p);
    setFormState({
      name: p.name,
      sku: p.sku,
      category: p.category,
      price: String(p.price),
      wholesalePrice: String(p.wholesalePrice),
      cost: String(p.cost),
      qty: String(p.qty),
      minStock: String(p.minStock),
      unit: p.unit,
      branchId: p.branchId,
    });
    setShowProductModal(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetBranch = branches.find((b) => b.id === formState.branchId) || activeBranch || branches[0];
    if (!targetBranch) return;
    const price = Math.max(0, Number.parseFloat(formState.price) || 0);
    const wholesale =
      Number.parseFloat(formState.wholesalePrice) > 0
        ? Number.parseFloat(formState.wholesalePrice)
        : Math.round(price * (1 - (company?.wholesaleDiscountPct || 10) / 100));

    await saveProduct(
      {
        name: formState.name,
        sku: formState.sku,
        category: formState.category,
        price,
        wholesalePrice: wholesale,
        cost: Math.max(0, Number.parseFloat(formState.cost) || 0),
        qty: Number.parseFloat(formState.qty) || 0,
        minStock: Math.max(0, Number.parseFloat(formState.minStock) || 0),
        unit: formState.unit || 'pcs',
        branchId: targetBranch.id,
        branchName: targetBranch.name,
        active: true,
      },
      editingProduct?.id
    );
    setShowProductModal(false);
  };

  const handleExportCSV = () => {
    const csv = exportProductsToCSV(filteredProducts);
    const branchLabel =
      branchFilter === 'all'
        ? 'all_branches'
        : branches.find((b) => b.id === branchFilter)?.name.toLowerCase().replace(/\s+/g, '_') || 'branch';
    downloadCSVFile(`inventory_${branchLabel}_${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const parsed = parseInventoryCSV(text, company?.wholesaleDiscountPct || 10);
      setParsedImportRows(parsed);
      setImportFeedback(`Parsed ${parsed.length} items ready for import.`);
    };
    reader.readAsText(file);
  };

  const handleCommitImport = async () => {
    if (parsedImportRows.length === 0) return;
    setIsImporting(true);
    try {
      const res = await importCSVProducts(
        parsedImportRows,
        importTargetBranch || activeBranch?.id || branches[0].id,
        importMode
      );
      setImportFeedback(`Imported cleanly: ${res.created} created, ${res.updated} updated.`);
      setParsedImportRows([]);
    } catch (err) {
      setImportFeedback(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleReloadPreloaded = async () => {
    setIsImporting(true);
    try {
      const res = await reloadPreloadedCSV(importTargetBranch || activeBranch?.id || branches[0].id);
      setImportFeedback(`Preloaded CSV synced: ${res.created} added, ${res.updated} updated.`);
    } catch (err) {
      setImportFeedback(err instanceof Error ? err.message : 'Failed to reload preloaded CSV.');
    } finally {
      setIsImporting(false);
    }
  };

  // Stock Transfer helpers
  const sourceProducts = useMemo(() => {
    const term = transferSearch.trim().toLowerCase();
    return products
      .filter((p) => p.branchId === fromBranchId && p.qty > 0)
      .filter((p) => !term || p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term))
      .slice(0, 40);
  }, [products, fromBranchId, transferSearch]);

  const handleCommitTransfer = async () => {
    setTransferFeedback('');
    try {
      const created = await transferStock({
        fromBranchId,
        toBranchId,
        items: transferCart,
        notes: transferNotes,
      });
      setTransferCart([]);
      setTransferNotes('');
      setTransferFeedback(`Transfer ${created.trackingNumber} completed (${created.totalQty} units moved).`);
    } catch (err) {
      setTransferFeedback(err instanceof Error ? err.message : 'Transfer failed.');
    }
  };

  // Stock Take helpers
  const stockTakeProducts = useMemo(
    () => products.filter((p) => p.branchId === stockTakeBranchId),
    [products, stockTakeBranchId]
  );

  const stockTakeAdjustments = useMemo(() => {
    return Object.entries(countedMap)
      .map(([productId, newQty]) => {
        const product = stockTakeProducts.find((p) => p.id === productId);
        if (!product || product.qty === newQty) return null;
        return { product, newQty };
      })
      .filter((x): x is { product: Product; newQty: number } => x !== null);
  }, [countedMap, stockTakeProducts]);

  const handleCommitStockTake = async () => {
    setStockTakeFeedback('');
    try {
      const log = await commitStockTake({
        branchId: stockTakeBranchId,
        actionType: 'count_reconcile',
        adjustments: stockTakeAdjustments,
        notes: stockTakeNotes || 'Physical count reconciliation',
      });
      setCountedMap({});
      setStockTakeNotes('');
      setStockTakeFeedback(`Stock take ${log.trackingNumber} reconciled (${log.itemsAdjusted} items adjusted).`);
    } catch (err) {
      setStockTakeFeedback(err instanceof Error ? err.message : 'Failed to commit stock take.');
    }
  };

  const handleResetNegativeStock = async () => {
    const negatives = stockTakeProducts.filter((p) => p.qty < 0);
    if (negatives.length === 0) {
      setStockTakeFeedback('No negative stock quantities found in this branch.');
      return;
    }
    const log = await commitStockTake({
      branchId: stockTakeBranchId,
      actionType: 'reset_negative',
      adjustments: negatives.map((product) => ({ product, newQty: 0 })),
      notes: 'Reset negative inventory balances to 0',
    });
    setStockTakeFeedback(`Reset ${log.itemsAdjusted} negative items to 0 (${log.trackingNumber}).`);
  };

  const handleResetAllZero = async () => {
    const nonZero = stockTakeProducts.filter((p) => p.qty !== 0);
    if (nonZero.length === 0) return;
    const log = await commitStockTake({
      branchId: stockTakeBranchId,
      actionType: 'reset_all_zero',
      adjustments: nonZero.map((product) => ({ product, newQty: 0 })),
      notes: 'Full branch stock reset to 0 before fresh count',
    });
    setStockTakeFeedback(`Branch stock reset to 0 across ${log.itemsAdjusted} items (${log.trackingNumber}).`);
  };

  return (
    <div className="p-6 space-y-6 max-w-[1440px] mx-auto">
      {/* Stock Valuation Summary Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Catalog SKUs</p>
          <p className="mt-1 text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {formatNumber(valuation.totalSkus)}
          </p>
          <p className="mt-1 text-[11px] text-slate-500 font-mono">
            {formatNumber(valuation.totalUnits)} total units
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Stock Cost Value</p>
          <p className="mt-1 text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {formatCurrency(valuation.costValue, cur)}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">Asset valuation at cost</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Retail Stock Value</p>
          <p className="mt-1 text-xl font-bold font-mono tabular-nums text-teal-700 dark:text-teal-400">
            {formatCurrency(valuation.retailValue, cur)}
          </p>
          <p className="mt-1 text-[11px] text-slate-500 font-mono">
            Margin: {formatCurrency(valuation.potentialRetailProfit, cur)}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Wholesale Value</p>
          <p className="mt-1 text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {formatCurrency(valuation.wholesaleValue, cur)}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">Bulk valuation</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Low Stock Alerts</p>
          <p className="mt-1 text-xl font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400">
            {valuation.lowStockCount}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">Needs restock soon</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Out of Stock</p>
          <p className="mt-1 text-xl font-bold font-mono tabular-nums text-red-600 dark:text-red-400">
            {valuation.outOfStockCount + valuation.negativeStockCount}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            {valuation.negativeStockCount} negative balances
          </p>
        </div>
      </div>

      {/* Mode Switcher Tabs + Primary Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-200/70 dark:bg-slate-800">
          {(
            [
              { id: 'catalog', label: 'Stock Catalog & Valuation' },
              { id: 'transfers', label: 'Branch Transfers' },
              { id: 'stock_take', label: 'Stock Take & Reset' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === t.id
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setImportTargetBranch(activeBranch?.id || branches[0]?.id || '');
              setImportFeedback('');
              setShowImportModal(true);
            }}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>Import CSV</span>
          </button>
          <button
            type="button"
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={openNewProduct}
            className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-700 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Item</span>
          </button>
        </div>
      </div>

      {/* TAB 1: STOCK CATALOG */}
      {activeTab === 'catalog' && (
        <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search item name, tracking SKU, category..."
                className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              >
                <option value="all">All Branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
                {(
                  [
                    { id: 'all', label: 'All' },
                    { id: 'in', label: 'In Stock' },
                    { id: 'low', label: 'Low Stock' },
                    { id: 'out', label: 'Out of Stock' },
                    { id: 'negative', label: 'Negative' },
                  ] as const
                ).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setStatusFilter(s.id)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap cursor-pointer ${
                      statusFilter === s.id
                        ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                  <th className="py-3 px-4">Tracking / SKU</th>
                  <th className="py-3 px-4">Item Name</th>
                  <th className="py-3 px-4">Branch</th>
                  <th className="py-3 px-4 text-right">Cost</th>
                  <th className="py-3 px-4 text-right">Retail</th>
                  <th className="py-3 px-4 text-right">Wholesale</th>
                  <th className="py-3 px-4 text-right">Qty</th>
                  <th className="py-3 px-4">Stock Label</th>
                  <th className="py-3 px-4 text-right">Valuation</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
                {visibleProducts.map((p) => {
                  const st = getStockStatus(p.qty, p.minStock);
                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-2.5 px-4 font-mono text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {p.sku}
                      </td>
                      <td className="py-2.5 px-4">
                        <p className="font-semibold text-slate-900 dark:text-white text-xs sm:text-sm">
                          {p.name}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {p.category} · {p.unit}
                        </p>
                      </td>
                      <td className="py-2.5 px-4 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {p.branchName}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-xs text-slate-600 dark:text-slate-300">
                        {formatCurrency(p.cost, cur)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-xs font-semibold text-slate-900 dark:text-white">
                        {formatCurrency(p.price, cur)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-xs text-teal-700 dark:text-teal-400">
                        {formatCurrency(p.wholesalePrice, cur)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-xs font-bold text-slate-900 dark:text-white">
                        {formatNumber(p.qty)}
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        {st === 'out' && (
                          <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-900">
                            Out of Stock
                          </span>
                        )}
                        {st === 'negative' && (
                          <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-900">
                            Overdrawn
                          </span>
                        )}
                        {st === 'low' && (
                          <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900">
                            Low Stock
                          </span>
                        )}
                        {st === 'in' && (
                          <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900">
                            In Stock
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-xs text-slate-700 dark:text-slate-300">
                        {formatCurrency(Math.max(0, p.qty) * p.cost, cur)}
                      </td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openEditProduct(p)}
                          className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer"
                          title="Edit item"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteProduct(p.id)}
                          className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 cursor-pointer"
                          title="Delete item"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filteredProducts.length > visibleProducts.length && (
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 text-center">
              <button
                type="button"
                onClick={() => setPageSize((s) => s + 50)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
              >
                Show 50 More ({filteredProducts.length - visibleProducts.length} left)
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: INTER-BRANCH STOCK TRANSFERS */}
      {activeTab === 'transfers' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-5 space-y-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <ArrowLeftRight className="h-4 w-4 text-teal-600" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  New Inter-Branch Transfer
                </h3>
              </div>
              {branches.length < 2 && (
                <span className="text-xs text-amber-600 font-medium">
                  Create a 2nd branch in Settings to transfer stock
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Source Branch
                </label>
                <select
                  value={fromBranchId}
                  onChange={(e) => {
                    setFromBranchId(e.target.value);
                    setTransferCart([]);
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
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
                  Destination Branch
                </label>
                <select
                  value={toBranchId}
                  onChange={(e) => setToBranchId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                >
                  <option value="">Select target branch...</option>
                  {branches
                    .filter((b) => b.id !== fromBranchId)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div>
              <input
                type="text"
                value={transferSearch}
                onChange={(e) => setTransferSearch(e.target.value)}
                placeholder="Search source branch items to add..."
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
              <div className="mt-2 max-h-48 overflow-y-auto divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                {sourceProducts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() =>
                      setTransferCart((prev) =>
                        prev.some((x) => x.product.id === p.id)
                          ? prev
                          : [...prev, { product: p, qty: 1 }]
                      )
                    }
                    className="w-full flex items-center justify-between px-3 py-2 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <span className="font-medium text-slate-900 dark:text-white truncate pr-2">
                      {p.name}
                    </span>
                    <span className="font-mono text-slate-500 shrink-0">
                      Avail: {p.qty}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {transferCart.length > 0 && (
              <div className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Items to Dispatch ({transferCart.length})
                </h4>
                {transferCart.map((line) => (
                  <div key={line.product.id} className="flex items-center justify-between gap-3 text-xs">
                    <span className="flex-1 truncate font-medium text-slate-900 dark:text-white">
                      {line.product.name}
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={line.product.qty}
                      value={line.qty}
                      onChange={(e) => {
                        const q = Math.max(1, Math.min(line.product.qty, Number(e.target.value) || 1));
                        setTransferCart((prev) =>
                          prev.map((x) => (x.product.id === line.product.id ? { ...x, qty: q } : x))
                        );
                      }}
                      className="w-20 rounded border border-slate-300 px-2 py-1 text-right font-mono dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setTransferCart((prev) => prev.filter((x) => x.product.id !== line.product.id))
                      }
                      className="text-red-500 hover:text-red-700 cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <input
                  type="text"
                  value={transferNotes}
                  onChange={(e) => setTransferNotes(e.target.value)}
                  placeholder="Transfer note or driver ref (optional)"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
                <button
                  type="button"
                  disabled={!toBranchId || transferCart.length === 0}
                  onClick={handleCommitTransfer}
                  className="w-full rounded-lg bg-teal-600 py-2.5 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-40 cursor-pointer"
                >
                  Confirm &amp; Transfer Stock
                </button>
              </div>
            )}

            {transferFeedback && (
              <p className="text-xs font-semibold text-teal-700 dark:text-teal-400">
                {transferFeedback}
              </p>
            )}
          </div>

          <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white border-b border-slate-100 pb-3 dark:border-slate-800">
              Transfer History ({transfers.length})
            </h3>
            <div className="mt-3 space-y-2.5 max-h-[500px] overflow-y-auto">
              {transfers.length === 0 ? (
                <p className="text-xs text-slate-500 py-8 text-center">No inter-branch transfers recorded yet.</p>
              ) : (
                transfers.map((trf) => (
                  <div
                    key={trf.id}
                    className="rounded-lg border border-slate-200 p-3 text-xs space-y-1 dark:border-slate-800"
                  >
                    <div className="flex items-center justify-between font-mono">
                      <span className="font-bold text-slate-900 dark:text-white">{trf.trackingNumber}</span>
                      <span className="text-slate-500">{trf.dateKey}</span>
                    </div>
                    <p className="font-medium text-slate-700 dark:text-slate-300">
                      {trf.fromBranchName} → {trf.toBranchName}
                    </p>
                    <p className="text-slate-500 font-mono">
                      {trf.totalQty} units · Cost Value: {formatCurrency(trf.totalCostValue, cur)} · {trf.staffName}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: STOCK TAKE & RESET */}
      {activeTab === 'stock_take' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-5 flex flex-wrap items-center justify-between gap-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Target Branch
                </label>
                <select
                  value={stockTakeBranchId}
                  onChange={(e) => {
                    setStockTakeBranchId(e.target.value);
                    setCountedMap({});
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Audit Notes
                </label>
                <input
                  type="text"
                  value={stockTakeNotes}
                  onChange={(e) => setStockTakeNotes(e.target.value)}
                  placeholder="e.g. Monthly shelf count"
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleResetNegativeStock}
                className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300 cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Reset Negative Stock to 0</span>
              </button>
              <button
                type="button"
                onClick={handleResetAllZero}
                className="flex items-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300 cursor-pointer"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>Reset Branch Stock to 0</span>
              </button>
              <button
                type="button"
                disabled={stockTakeAdjustments.length === 0}
                onClick={handleCommitStockTake}
                className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-40 cursor-pointer"
              >
                <ClipboardCheck className="h-3.5 w-3.5" />
                <span>Reconcile ({stockTakeAdjustments.length} changed)</span>
              </button>
            </div>
          </div>

          {stockTakeFeedback && (
            <div className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-xs font-semibold text-teal-800 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-300">
              {stockTakeFeedback}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 rounded-xl border border-slate-200 bg-white overflow-hidden dark:border-slate-800 dark:bg-slate-900">
              <div className="max-h-[480px] overflow-y-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold uppercase text-slate-500">
                    <tr>
                      <th className="py-2.5 px-4">Item</th>
                      <th className="py-2.5 px-4 text-right">System Qty</th>
                      <th className="py-2.5 px-4 text-right">Physical Count</th>
                      <th className="py-2.5 px-4 text-right">Variance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs dark:divide-slate-800">
                    {stockTakeProducts.slice(0, 120).map((p) => {
                      const physical = countedMap[p.id] ?? p.qty;
                      const variance = physical - p.qty;
                      return (
                        <tr key={p.id}>
                          <td className="py-2 px-4">
                            <p className="font-semibold text-slate-900 dark:text-white">{p.name}</p>
                            <p className="text-[11px] font-mono text-slate-400">{p.sku}</p>
                          </td>
                          <td className="py-2 px-4 text-right font-mono tabular-nums">{p.qty}</td>
                          <td className="py-2 px-4 text-right">
                            <input
                              type="number"
                              value={physical}
                              onChange={(e) =>
                                setCountedMap((prev) => ({
                                  ...prev,
                                  [p.id]: Number.parseFloat(e.target.value) || 0,
                                }))
                              }
                              className="w-20 rounded border border-slate-300 px-2 py-1 text-right font-mono text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                            />
                          </td>
                          <td
                            className={`py-2 px-4 text-right font-mono font-bold ${
                              variance > 0
                                ? 'text-emerald-600'
                                : variance < 0
                                ? 'text-red-600'
                                : 'text-slate-400'
                            }`}
                          >
                            {variance > 0 ? `+${variance}` : variance}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="lg:col-span-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white border-b border-slate-100 pb-3 dark:border-slate-800">
                Stock Take Audit Log ({stockTakes.length})
              </h3>
              <div className="mt-3 space-y-2.5 max-h-[420px] overflow-y-auto">
                {stockTakes.length === 0 ? (
                  <p className="text-xs text-slate-500 py-8 text-center">No stock takes committed yet.</p>
                ) : (
                  stockTakes.map((st) => (
                    <div
                      key={st.id}
                      className="rounded-lg border border-slate-200 p-3 text-xs space-y-1 dark:border-slate-800"
                    >
                      <div className="flex justify-between font-mono">
                        <span className="font-bold text-slate-900 dark:text-white">
                          {st.trackingNumber}
                        </span>
                        <span className="text-slate-500">{st.dateKey}</span>
                      </div>
                      <p className="text-slate-700 dark:text-slate-300 font-medium capitalize">
                        {st.branchName} · {st.actionType.replace(/_/g, ' ')}
                      </p>
                      <p className="text-slate-500 font-mono">
                        {st.itemsAdjusted} items · Variance: {st.varianceUnits} units (
                        {formatCurrency(st.varianceCostValue, cur)})
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Product Modal */}
      {showProductModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form
            onSubmit={handleSaveProduct}
            className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 space-y-4 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {editingProduct ? 'Edit Inventory Item' : 'Add New Stock Item'}
              </h3>
              <button
                type="button"
                onClick={() => setShowProductModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Item Name
                </label>
                <input
                  type="text"
                  required
                  value={formState.name}
                  onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Tracking / SKU #
                </label>
                <input
                  type="text"
                  required
                  value={formState.sku}
                  onChange={(e) => setFormState({ ...formState, sku: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Category
                </label>
                <input
                  type="text"
                  required
                  value={formState.category}
                  onChange={(e) => setFormState({ ...formState, category: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Cost Price ({cur})
                </label>
                <input
                  type="number"
                  step="any"
                  min={0}
                  required
                  value={formState.cost}
                  onChange={(e) => setFormState({ ...formState, cost: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Retail Price ({cur})
                </label>
                <input
                  type="number"
                  step="any"
                  min={0}
                  required
                  value={formState.price}
                  onChange={(e) => setFormState({ ...formState, price: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Wholesale Price ({cur})
                </label>
                <input
                  type="number"
                  step="any"
                  min={0}
                  value={formState.wholesalePrice}
                  onChange={(e) => setFormState({ ...formState, wholesalePrice: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Quantity in Stock
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  value={formState.qty}
                  onChange={(e) => setFormState({ ...formState, qty: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Low Stock Threshold
                </label>
                <input
                  type="number"
                  min={0}
                  value={formState.minStock}
                  onChange={(e) => setFormState({ ...formState, minStock: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
              {!editingProduct && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Branch
                  </label>
                  <select
                    value={formState.branchId}
                    onChange={(e) => setFormState({ ...formState, branchId: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowProductModal(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-teal-600 px-5 py-2 text-xs font-semibold text-white hover:bg-teal-700 cursor-pointer"
              >
                Save Item
              </button>
            </div>
          </form>
        </div>
      )}

      {/* CSV Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 space-y-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Import / Sync Stock CSV
              </h3>
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Target Branch
                </label>
                <select
                  value={importTargetBranch}
                  onChange={(e) => setImportTargetBranch(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
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
                  Duplicate Handling
                </label>
                <select
                  value={importMode}
                  onChange={(e) => setImportMode(e.target.value as 'merge' | 'add_only')}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                >
                  <option value="merge">Update existing + Add new</option>
                  <option value="add_only">Add new items only</option>
                </select>
              </div>
            </div>

            <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center dark:border-slate-700">
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                className="text-xs text-slate-600 dark:text-slate-300"
              />
              <p className="mt-2 text-[11px] text-slate-400">
                Supports format: name, category, price, cost, qty, minStock, branchName
              </p>
            </div>

            {importFeedback && (
              <p className="text-xs font-semibold text-teal-700 dark:text-teal-400">
                {importFeedback}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                disabled={isImporting}
                onClick={handleReloadPreloaded}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 cursor-pointer"
              >
                Re-sync Preloaded 740+ CSV
              </button>
              <button
                type="button"
                disabled={isImporting || parsedImportRows.length === 0}
                onClick={handleCommitImport}
                className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-40 cursor-pointer"
              >
                {isImporting ? 'Importing...' : `Import ${parsedImportRows.length} Rows`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
