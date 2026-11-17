import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Clock,
  CreditCard,
  Minus,
  PauseCircle,
  Play,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
  X,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { PaymentMethod, Product, Sale } from '../types';
import { calculateCartTotals } from '../utils/accounting';
import { formatCurrency, formatNumber, formatTimestamp, getStockStatus } from '../utils/format';
import { ReceiptModal } from './ReceiptModal';

export const POSView: React.FC = () => {
  const {
    company,
    activeBranch,
    products,
    heldCarts,
    cart,
    saleMode,
    setSaleMode,
    cartDiscountPct,
    setCartDiscountPct,
    addToCart,
    updateCartQty,
    updateCartCustomPrice,
    removeFromCart,
    clearCart,
    checkoutCart,
    holdCurrentCart,
    resumeHeldCart,
    deleteHeldCart,
  } = useApp();

  const searchRef = useRef<HTMLInputElement>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'in' | 'low' | 'out'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [visibleLimit, setVisibleLimit] = useState(60);

  // Modals / Drawers
  const [showHoldModal, setShowHoldModal] = useState(false);
  const [holdReference, setHoldReference] = useState('');
  const [showHeldDrawer, setShowHeldDrawer] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);

  // Checkout fields
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [amountTendered, setAmountTendered] = useState<string>('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');

  const cur = company?.currency || '₦';

  // Keyboard shortcut '/' to focus search
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const branchProducts = useMemo(() => {
    if (!activeBranch) return [];
    return products.filter((p) => p.branchId === activeBranch.id && p.active);
  }, [products, activeBranch]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    branchProducts.forEach((p) => set.add(p.category));
    return Array.from(set).sort();
  }, [branchProducts]);

  const filteredProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return branchProducts.filter((p) => {
      if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
      const st = getStockStatus(p.qty, p.minStock);
      if (stockFilter === 'in' && st !== 'in') return false;
      if (stockFilter === 'low' && st !== 'low') return false;
      if (stockFilter === 'out' && st !== 'out' && st !== 'negative') return false;
      if (!term) return true;
      return (
        p.name.toLowerCase().includes(term) ||
        p.sku.toLowerCase().includes(term) ||
        p.category.toLowerCase().includes(term)
      );
    });
  }, [branchProducts, categoryFilter, stockFilter, searchTerm]);

  const displayedProducts = useMemo(
    () => filteredProducts.slice(0, visibleLimit),
    [filteredProducts, visibleLimit]
  );

  const branchHeldCarts = useMemo(
    () => heldCarts.filter((h) => !activeBranch || h.branchId === activeBranch.id),
    [heldCarts, activeBranch]
  );

  const cartTotals = useMemo(() => {
    if (!company) return { subtotal: 0, discountAmount: 0, taxableAmount: 0, taxAmount: 0, total: 0, totalCost: 0 };
    return calculateCartTotals(
      cart.map((c) => ({
        qty: c.qty,
        unitPrice:
          c.customUnitPrice !== undefined
            ? c.customUnitPrice
            : saleMode === 'wholesale'
            ? c.wholesalePrice
            : c.retailPrice,
        unitCost: c.unitCost,
      })),
      cartDiscountPct,
      company
    );
  }, [cart, saleMode, cartDiscountPct, company]);

  const cartItemCount = useMemo(() => cart.reduce((s, c) => s + c.qty, 0), [cart]);

  const handleOpenCheckout = () => {
    if (cart.length === 0) return;
    setAmountTendered(String(cartTotals.total));
    setCheckoutError('');
    setShowCheckoutModal(true);
  };

  const handleConfirmCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setCheckoutError('');
    const tendered = Number.parseFloat(amountTendered) || 0;
    if (paymentMethod === 'cash' && tendered < cartTotals.total) {
      setCheckoutError('Cash tendered cannot be less than total due.');
      return;
    }

    setIsCheckingOut(true);
    try {
      const created = await checkoutCart({
        paymentMethod,
        amountTendered: tendered,
        customerName,
        customerPhone,
        notes,
      });
      setShowCheckoutModal(false);
      setMobileCartOpen(false);
      setCustomerName('');
      setCustomerPhone('');
      setNotes('');
      setCompletedSale(created);
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'Checkout failed.');
    } finally {
      setIsCheckingOut(false);
    }
  };

  const handleHoldSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await holdCurrentCart(holdReference || `Counter Hold (${cartItemCount} items)`);
    setHoldReference('');
    setShowHoldModal(false);
  };

  const getProductLiveQty = (productId: string, fallback: number) => {
    const p = branchProducts.find((item) => item.id === productId);
    return p ? p.qty : fallback;
  };

  const renderStockTag = (product: Product) => {
    const st = getStockStatus(product.qty, product.minStock);
    if (st === 'out') {
      return (
        <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-900">
          <AlertTriangle className="h-3 w-3" />
          Out of Stock · 0
        </span>
      );
    }
    if (st === 'negative') {
      return (
        <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-900">
          <AlertTriangle className="h-3 w-3" />
          Overdrawn · {formatNumber(product.qty)}
        </span>
      );
    }
    if (st === 'low') {
      return (
        <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-900">
          Low Stock · {formatNumber(product.qty)}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-900">
        In Stock · {formatNumber(product.qty)}
      </span>
    );
  };

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Left/Center: Catalog & Search */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#F4F8FB] dark:bg-slate-950">
        {/* POS Toolbar */}
        <div className="p-4 border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                ref={searchRef}
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setVisibleLimit(60);
                }}
                placeholder="Search by item name, SKU tracking #, or category (Press /)"
                className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-9 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Retail / Wholesale Mode Toggle */}
            <div className="flex items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => setSaleMode('retail')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  saleMode === 'retail'
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                Retail Mode
              </button>
              <button
                type="button"
                onClick={() => setSaleMode('wholesale')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  saleMode === 'wholesale'
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                Wholesale Mode
              </button>
            </div>

            {/* Held Carts Trigger */}
            <button
              type="button"
              onClick={() => setShowHeldDrawer(true)}
              className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Clock className="h-3.5 w-3.5 text-amber-600" />
              <span>Held ({branchHeldCarts.length})</span>
            </button>
          </div>

          {/* Filter Strip */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800 overflow-x-auto">
              {(
                [
                  { id: 'all', label: `All (${branchProducts.length})` },
                  {
                    id: 'in',
                    label: `In Stock (${branchProducts.filter((p) => getStockStatus(p.qty, p.minStock) === 'in').length})`,
                  },
                  {
                    id: 'low',
                    label: `Low Stock (${branchProducts.filter((p) => getStockStatus(p.qty, p.minStock) === 'low').length})`,
                  },
                  {
                    id: 'out',
                    label: `Out of Stock (${
                      branchProducts.filter((p) => {
                        const s = getStockStatus(p.qty, p.minStock);
                        return s === 'out' || s === 'negative';
                      }).length
                    })`,
                  },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStockFilter(tab.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    stockFilter === tab.id
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <option value="all">All Categories</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Product Grid */}
        <div className="flex-1 overflow-y-auto p-4 pb-24 lg:pb-4">
          {displayedProducts.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
              <Archive className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
              <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">
                No matching items in {activeBranch?.name || 'this branch'}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Try clearing your search filter or switching stock status tabs.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
                {displayedProducts.map((product) => {
                  const unitPrice = saleMode === 'wholesale' ? product.wholesalePrice : product.price;
                  const inCart = cart.find((c) => c.productId === product.id);
                  const isOut = product.qty <= 0 && !company?.allowNegativeStock;

                  return (
                    <button
                      key={product.id}
                      type="button"
                      disabled={isOut}
                      onClick={() => addToCart(product, 1)}
                      className={`group flex flex-col justify-between rounded-xl border p-3.5 text-left transition-all ${
                        isOut
                          ? 'border-slate-200 bg-slate-100/70 opacity-75 cursor-not-allowed dark:border-slate-800 dark:bg-slate-900/40'
                          : inCart
                          ? 'border-teal-500 bg-white shadow-sm shadow-teal-600/10 hover:bg-teal-50/40 cursor-pointer dark:border-teal-500 dark:bg-slate-900 dark:shadow-none'
                          : 'border-slate-200/90 bg-white shadow-2xs hover:border-teal-300 hover:shadow-sm cursor-pointer dark:border-slate-800 dark:bg-slate-900 dark:shadow-none dark:hover:border-slate-700'
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                            {product.sku}
                          </span>
                          {inCart && (
                            <span className="rounded bg-teal-600 px-1.5 py-0.5 text-[11px] font-mono font-bold text-white">
                              ×{inCart.qty}
                            </span>
                          )}
                        </div>
                        <h3 className="mt-1.5 text-sm font-semibold text-slate-900 dark:text-white line-clamp-2 leading-snug">
                          {product.name}
                        </h3>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 truncate">
                          {product.category}
                        </p>
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                        <div>
                          <span className="text-base font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                            {formatCurrency(unitPrice, cur)}
                          </span>
                          {saleMode === 'wholesale' && product.price > product.wholesalePrice && (
                            <span className="ml-1.5 text-[11px] font-mono line-through text-slate-400">
                              {formatCurrency(product.price, cur)}
                            </span>
                          )}
                        </div>
                        {renderStockTag(product)}
                      </div>
                    </button>
                  );
                })}
              </div>

              {filteredProducts.length > displayedProducts.length && (
                <div className="mt-5 text-center">
                  <button
                    type="button"
                    onClick={() => setVisibleLimit((prev) => prev + 60)}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
                  >
                    Load More ({filteredProducts.length - displayedProducts.length} remaining)
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Mobile Sticky Cart Summary Bar */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-slate-200 bg-white px-4 py-3 flex items-center justify-between dark:border-slate-800 dark:bg-slate-900">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {cartItemCount} {cartItemCount === 1 ? 'item' : 'items'} · {saleMode}
          </p>
          <p className="text-base font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {formatCurrency(cartTotals.total, cur)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setMobileCartOpen(true)}
          className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-teal-700 cursor-pointer"
        >
          <ShoppingBag className="h-4 w-4" />
          <span>View Cart ({cart.length})</span>
        </button>
      </div>

      {/* Right Pane: Cart System */}
      <aside
        className={`${
          mobileCartOpen ? 'fixed inset-0 z-40 flex' : 'hidden lg:flex'
        } lg:static lg:w-[400px] xl:w-[430px] flex-col border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shrink-0`}
      >
        {/* Cart Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-4 w-4 text-teal-600" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Active Cart ({cartItemCount})
            </h2>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              · {saleMode === 'wholesale' ? 'Wholesale' : 'Retail'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {cart.length > 0 && (
              <button
                type="button"
                onClick={() => setShowClearConfirm(true)}
                className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40 cursor-pointer"
              >
                Clear Cart
              </button>
            )}
            <button
              type="button"
              onClick={() => setMobileCartOpen(false)}
              className="lg:hidden rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Cart Line Items */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
          {cart.length === 0 ? (
            <div className="p-10 text-center">
              <ShoppingBag className="mx-auto h-9 w-9 text-slate-300 dark:text-slate-700" />
              <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
                Cart is empty
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Tap any in-stock item from the catalog or resume a held cart.
              </p>
              {branchHeldCarts.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowHeldDrawer(true)}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  <Clock className="h-3.5 w-3.5 text-amber-600" />
                  <span>Resume {branchHeldCarts.length} Held Cart(s)</span>
                </button>
              )}
            </div>
          ) : (
            cart.map((item) => {
              const liveStock = getProductLiveQty(item.productId, item.inStockAtAdd);
              const basePrice = saleMode === 'wholesale' ? item.wholesalePrice : item.retailPrice;
              const unitPrice = item.customUnitPrice !== undefined ? item.customUnitPrice : basePrice;
              const exceedsStock = !company?.allowNegativeStock && item.qty > liveStock;

              return (
                <div key={item.productId} className="p-3.5 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white leading-snug">
                        {item.name}
                      </p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500 dark:text-slate-400 font-mono">
                        <span>{item.sku}</span>
                        <span>·</span>
                        <span
                          className={
                            exceedsStock
                              ? 'text-red-600 font-semibold'
                              : liveStock <= 3
                              ? 'text-amber-600 font-semibold'
                              : 'text-emerald-700 dark:text-emerald-400 font-semibold'
                          }
                        >
                          In Stock: {formatNumber(liveStock)}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFromCart(item.productId)}
                      aria-label={`Remove ${item.name}`}
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    {/* Qty Stepper */}
                    <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-700">
                      <button
                        type="button"
                        onClick={() => updateCartQty(item.productId, item.qty - 1)}
                        className="px-2 py-1 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <input
                        type="number"
                        min={1}
                        max={company?.allowNegativeStock ? undefined : Math.max(1, liveStock)}
                        value={item.qty}
                        onChange={(e) => {
                          const val = Number.parseFloat(e.target.value) || 0;
                          if (!company?.allowNegativeStock && liveStock > 0 && val > liveStock) {
                            updateCartQty(item.productId, liveStock);
                          } else {
                            updateCartQty(item.productId, val);
                          }
                        }}
                        className="w-12 text-center text-xs font-mono font-semibold text-slate-900 bg-transparent focus:outline-none dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!company?.allowNegativeStock && item.qty >= liveStock) return;
                          updateCartQty(item.productId, item.qty + 1);
                        }}
                        className="px-2 py-1 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Editable Unit Price */}
                    <div className="flex items-center gap-1 text-xs">
                      <span className="text-slate-400">@</span>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={unitPrice}
                        onChange={(e) => {
                          const val = Number.parseFloat(e.target.value);
                          updateCartCustomPrice(
                            item.productId,
                            Number.isFinite(val) ? Math.max(0, val) : undefined
                          );
                        }}
                        className="w-20 rounded border border-slate-200 px-1.5 py-1 text-right font-mono text-xs text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                      />
                    </div>

                    {/* Line Total */}
                    <span className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white min-w-[78px] text-right">
                      {formatCurrency(item.qty * unitPrice, cur)}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Cart Footer & Totals */}
        <div className="border-t border-slate-200 bg-sky-50/40 p-4 space-y-3 dark:border-slate-800 dark:bg-slate-950">
          {/* Discount Input */}
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-600 dark:text-slate-400">Cart Discount (%)</span>
            <input
              type="number"
              min={0}
              max={100}
              step="0.5"
              value={cartDiscountPct}
              onChange={(e) => setCartDiscountPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
              className="w-20 rounded-md border border-slate-300 bg-white px-2 py-1 text-right font-mono text-xs text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </div>

          <div className="space-y-1.5 text-xs font-mono tabular-nums pt-1 border-t border-slate-200 dark:border-slate-800">
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span className="font-sans">Subtotal</span>
              <span>{formatCurrency(cartTotals.subtotal, cur)}</span>
            </div>
            {cartTotals.discountAmount > 0 && (
              <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                <span className="font-sans">Discount ({cartDiscountPct}%)</span>
                <span>-{formatCurrency(cartTotals.discountAmount, cur)}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span className="font-sans">
                Tax ({company?.taxRate || 0}% {company?.taxInclusive ? 'incl.' : 'excl.'})
              </span>
              <span>{formatCurrency(cartTotals.taxAmount, cur)}</span>
            </div>
            <div className="flex justify-between text-base font-bold text-slate-900 dark:text-white pt-1.5 border-t border-slate-200 dark:border-slate-800">
              <span className="font-sans">Total Due</span>
              <span>{formatCurrency(cartTotals.total, cur)}</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1">
            <button
              type="button"
              disabled={cart.length === 0}
              onClick={() => setShowHoldModal(true)}
              className="col-span-1 flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
            >
              <PauseCircle className="h-4 w-4 text-amber-600" />
              <span>Hold</span>
            </button>
            <button
              type="button"
              disabled={cart.length === 0}
              onClick={handleOpenCheckout}
              className="col-span-2 flex items-center justify-center gap-2 rounded-lg bg-teal-600 py-2.5 text-sm font-semibold text-white shadow-sm shadow-teal-600/20 hover:bg-teal-700 disabled:opacity-40 dark:shadow-none transition-colors cursor-pointer"
            >
              <CreditCard className="h-4 w-4" />
              <span>Charge {formatCurrency(cartTotals.total, cur)}</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Clear Cart Confirmation Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Clear Active Cart?</h3>
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
              This will remove all {cartItemCount} items from your current cart. You can also Hold the cart to resume later.
            </p>
            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 rounded-lg border border-slate-300 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  clearCart();
                  setShowClearConfirm(false);
                }}
                className="flex-1 rounded-lg bg-red-600 py-2 text-xs font-semibold text-white hover:bg-red-700 cursor-pointer"
              >
                Clear Cart
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hold Cart Modal */}
      {showHoldModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form
            onSubmit={handleHoldSubmit}
            className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 space-y-4 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Hold Current Cart</h3>
              <button
                type="button"
                onClick={() => setShowHoldModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Save this cart to Firebase so you or another cashier can resume it from any device.
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Customer or Reference Label
              </label>
              <input
                type="text"
                autoFocus
                value={holdReference}
                onChange={(e) => setHoldReference(e.target.value)}
                placeholder="e.g. Walk-in Mrs. Bello or Ward 2"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowHoldModal(false)}
                className="flex-1 rounded-lg border border-slate-300 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 rounded-lg bg-amber-600 py-2 text-xs font-semibold text-white hover:bg-amber-700 cursor-pointer"
              >
                Hold Cart
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Held Carts Drawer */}
      {showHeldDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/60">
          <div className="w-full max-w-md bg-white h-full flex flex-col border-l border-slate-200 dark:bg-slate-900 dark:border-slate-800">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Held Carts ({branchHeldCarts.length})
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Synced across all branch terminals
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowHeldDrawer(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {branchHeldCarts.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                  No held carts in this branch.
                </div>
              ) : (
                branchHeldCarts.map((hc) => (
                  <div
                    key={hc.id}
                    className="rounded-xl border border-slate-200 p-4 space-y-3 dark:border-slate-800"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-slate-900 dark:text-white">
                          {hc.reference}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {hc.items.length} line(s) · {hc.saleMode} · {hc.staffName} ·{' '}
                          {formatTimestamp(hc.createdAt)}
                        </p>
                      </div>
                      <span className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                        {formatCurrency(hc.total, cur)}
                      </span>
                    </div>

                    <div className="text-xs text-slate-600 dark:text-slate-300 space-y-0.5 border-t border-slate-100 pt-2 dark:border-slate-800">
                      {hc.items.slice(0, 3).map((item, idx) => (
                        <div key={idx} className="flex justify-between">
                          <span className="truncate pr-2">{item.name}</span>
                          <span className="font-mono shrink-0">×{item.qty}</span>
                        </div>
                      ))}
                      {hc.items.length > 3 && (
                        <p className="text-[11px] text-slate-400">
                          +{hc.items.length - 3} more items
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={async () => {
                          await resumeHeldCart(hc.id);
                          setShowHeldDrawer(false);
                        }}
                        className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-teal-600 py-2 text-xs font-semibold text-white hover:bg-teal-700 cursor-pointer"
                      >
                        <Play className="h-3.5 w-3.5" />
                        <span>Resume to Cart</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteHeldCart(hc.id)}
                        className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:border-slate-700 dark:hover:bg-red-950/40 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Checkout Modal */}
      {showCheckoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form
            onSubmit={handleConfirmCheckout}
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 space-y-5 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Complete {saleMode === 'wholesale' ? 'Wholesale' : 'Retail'} Sale
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {cartItemCount} items · Branch: {activeBranch?.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCheckoutModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded-lg bg-slate-50 p-4 text-center dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Amount Due</p>
              <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                {formatCurrency(cartTotals.total, cur)}
              </p>
              <p className="mt-1 text-[11px] text-slate-500 font-mono">
                Incl. Tax: {formatCurrency(cartTotals.taxAmount, cur)}
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Payment Method
              </label>
              <div className="grid grid-cols-5 gap-1.5">
                {(['cash', 'card', 'transfer', 'credit', 'split'] as PaymentMethod[]).map((method) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setPaymentMethod(method)}
                    className={`rounded-lg border py-2 text-xs font-semibold capitalize transition-colors cursor-pointer ${
                      paymentMethod === method
                        ? 'border-teal-600 bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {method}
                  </button>
                ))}
              </div>
            </div>

            {paymentMethod === 'cash' && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Cash Tendered
                  </label>
                  <span className="text-xs font-mono text-emerald-700 dark:text-emerald-400 font-semibold">
                    Change: {formatCurrency(Math.max(0, (Number.parseFloat(amountTendered) || 0) - cartTotals.total), cur)}
                  </span>
                </div>
                <input
                  type="number"
                  step="any"
                  min={0}
                  value={amountTendered}
                  onChange={(e) => setAmountTendered(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-mono font-bold text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Customer Name (Optional)
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Walk-in / Client"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Phone (Optional)
                </label>
                <input
                  type="text"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="080..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
            </div>

            {checkoutError && (
              <p className="text-xs font-medium text-red-600 dark:text-red-400">{checkoutError}</p>
            )}

            <button
              type="submit"
              disabled={isCheckingOut}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-teal-600 py-3 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50 cursor-pointer"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>{isCheckingOut ? 'Processing Sale...' : 'Confirm & Issue Receipt'}</span>
            </button>
          </form>
        </div>
      )}

      {/* Printable Receipt Modal */}
      {completedSale && company && (
        <ReceiptModal
          sale={completedSale}
          company={company}
          onClose={() => setCompletedSale(null)}
        />
      )}
    </div>
  );
};
