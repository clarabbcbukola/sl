export type StaffRole = 'owner' | 'manager' | 'cashier' | 'accountant';
export type SaleMode = 'retail' | 'wholesale';
export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'credit' | 'split';
export type ExpenseType = 'inventory_purchase' | 'operating' | 'tax_payment' | 'payroll' | 'other';
export type RefundMethod = 'cash' | 'card' | 'transfer' | 'store_credit';
export type StockTakeAction = 'count_reconcile' | 'reset_negative' | 'reset_all_zero';
export type NavSection = 'pos' | 'inventory' | 'returns' | 'accounting' | 'reports' | 'settings';

export type PrintPaperSize = 'thermal_80' | 'thermal_58' | 'a5' | 'a4' | 'letter';
export type PrintEngineMode = 'silent_iframe' | 'escpos_usb' | 'escpos_serial';
export type PrintFontFamily = 'mono' | 'sans';
export type PrintFontSize = 'xs' | 'sm' | 'md';

export interface PrintSettings {
  paperSize: PrintPaperSize;
  engineMode: PrintEngineMode;
  fontFamily: PrintFontFamily;
  fontSize: PrintFontSize;
  autoPrintOnConfirm: boolean;
  showItemSku: boolean;
  showCashierAndCustomer: boolean;
  marginMm: number;
  usbVendorId?: number;
  usbProductId?: number;
  usbDeviceName?: string;
  serialBaudRate: number;
}

export interface StoreSession {
  id: string;
  companyId: string;
  ownerUid: string;
  memberUids: string[];
  sessionNumber: string;
  branchId: string;
  branchName: string;
  businessDateKey: string;
  status: 'open' | 'closed';
  openedByStaffId: string;
  openedByStaffName: string;
  openedAtMs: number;
  openingCash: number;
  closedByStaffId: string;
  closedByStaffName: string;
  closedAtMs: number;
  expectedCash: number;
  closingCashActual: number;
  expectedCard: number;
  actualCard: number;
  expectedTransfer: number;
  actualTransfer: number;
  varianceTotal: number;
  salesCount: number;
  netSalesTotal: number;
  grossProfitTotal: number;
  expensesTotal: number;
  returnsTotal: number;
  netTaxPayable: number;
  reconciliationId: string;
  notes: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Company {
  id: string;
  name: string;
  currency: string;
  taxRate: number;
  taxInclusive: boolean;
  wholesaleDiscountPct: number;
  address: string;
  phone: string;
  email: string;
  receiptFooter: string;
  allowNegativeStock: boolean;
  ownerUid: string;
  memberUids: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Branch {
  id: string;
  companyId: string;
  ownerUid: string;
  memberUids: string[];
  name: string;
  code: string;
  address: string;
  phone: string;
  isMain: boolean;
  active: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface StaffUser {
  id: string;
  companyId: string;
  ownerUid: string;
  memberUids: string[];
  name: string;
  role: StaffRole;
  branchId: string;
  pinHash: string;
  active: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Product {
  id: string;
  companyId: string;
  ownerUid: string;
  memberUids: string[];
  sku: string;
  name: string;
  category: string;
  price: number;
  wholesalePrice: number;
  cost: number;
  qty: number;
  minStock: number;
  branchId: string;
  branchName: string;
  unit: string;
  active: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SaleLineItem {
  productId: string;
  sku: string;
  name: string;
  qty: number;
  returnedQty: number;
  unitPrice: number;
  unitCost: number;
  lineTotal: number;
}

export interface Sale {
  id: string;
  companyId: string;
  ownerUid: string;
  memberUids: string[];
  trackingNumber: string;
  branchId: string;
  branchName: string;
  staffId: string;
  staffName: string;
  sessionId?: string;
  saleMode: SaleMode;
  customerName: string;
  customerPhone: string;
  paymentMethod: PaymentMethod;
  items: SaleLineItem[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  totalCost: number;
  amountTendered: number;
  changeDue: number;
  returnedAmount: number;
  status: 'completed' | 'partial_return' | 'refunded';
  notes: string;
  dateKey: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface CartItem {
  productId: string;
  sku: string;
  name: string;
  qty: number;
  retailPrice: number;
  wholesalePrice: number;
  customUnitPrice?: number;
  unitCost: number;
  inStockAtAdd: number;
}

export interface HeldCartLineItem {
  productId: string;
  sku: string;
  name: string;
  qty: number;
  retailPrice: number;
  wholesalePrice: number;
  unitCost: number;
}

export interface HeldCart {
  id: string;
  companyId: string;
  ownerUid: string;
  memberUids: string[];
  reference: string;
  branchId: string;
  branchName: string;
  staffId: string;
  staffName: string;
  saleMode: SaleMode;
  items: HeldCartLineItem[];
  discountPct: number;
  total: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ExpenseLineItem {
  productId: string;
  sku: string;
  name: string;
  qty: number;
  unitCost: number;
  lineTotal: number;
}

export interface Expense {
  id: string;
  companyId: string;
  ownerUid: string;
  memberUids: string[];
  trackingNumber: string;
  branchId: string;
  branchName: string;
  staffId: string;
  staffName: string;
  sessionId?: string;
  expenseType: ExpenseType;
  category: string;
  vendor: string;
  description: string;
  paymentMethod: 'cash' | 'card' | 'transfer' | 'credit';
  amount: number;
  taxAmount: number;
  totalAmount: number;
  items: ExpenseLineItem[];
  dateKey: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface TransferLineItem {
  productId: string;
  sku: string;
  name: string;
  qty: number;
  unitCost: number;
}

export interface StockTransfer {
  id: string;
  companyId: string;
  ownerUid: string;
  memberUids: string[];
  trackingNumber: string;
  fromBranchId: string;
  fromBranchName: string;
  toBranchId: string;
  toBranchName: string;
  staffId: string;
  staffName: string;
  sessionId?: string;
  items: TransferLineItem[];
  totalQty: number;
  totalCostValue: number;
  status: 'completed' | 'cancelled';
  notes: string;
  dateKey: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ReturnLineItem {
  productId: string;
  sku: string;
  name: string;
  qty: number;
  unitPrice: number;
  unitCost: number;
  lineTotal: number;
}

export interface StockReturn {
  id: string;
  companyId: string;
  ownerUid: string;
  memberUids: string[];
  trackingNumber: string;
  saleId: string;
  saleTrackingNumber: string;
  branchId: string;
  branchName: string;
  staffId: string;
  staffName: string;
  sessionId?: string;
  items: ReturnLineItem[];
  refundMethod: RefundMethod;
  refundSubtotal: number;
  refundTax: number;
  refundTotal: number;
  refundCost: number;
  restockItems: boolean;
  reason: string;
  dateKey: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface StockTake {
  id: string;
  companyId: string;
  ownerUid: string;
  memberUids: string[];
  trackingNumber: string;
  branchId: string;
  branchName: string;
  staffId: string;
  staffName: string;
  sessionId?: string;
  actionType: StockTakeAction;
  itemsAdjusted: number;
  varianceUnits: number;
  varianceCostValue: number;
  notes: string;
  dateKey: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Reconciliation {
  id: string;
  companyId: string;
  ownerUid: string;
  memberUids: string[];
  trackingNumber: string;
  branchId: string;
  branchName: string;
  staffId: string;
  staffName: string;
  sessionId?: string;
  dateKey: string;
  expectedCash: number;
  actualCash: number;
  expectedCard: number;
  actualCard: number;
  expectedTransfer: number;
  actualTransfer: number;
  cashRefunds: number;
  cashExpenses: number;
  varianceTotal: number;
  status: 'balanced' | 'variance_noted';
  notes: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}
