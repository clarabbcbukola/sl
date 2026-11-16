import { Company, Expense, Product, Sale, StockReturn } from '../types';

export interface CartTotals {
  subtotal: number;
  discountAmount: number;
  taxableAmount: number;
  taxAmount: number;
  total: number;
  totalCost: number;
}

export function calculateCartTotals(
  items: { qty: number; unitPrice: number; unitCost: number }[],
  discountPct: number,
  company: Pick<Company, 'taxRate' | 'taxInclusive'>
): CartTotals {
  const rawSubtotal = items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
  const totalCost = items.reduce((sum, item) => sum + item.qty * item.unitCost, 0);
  const clampedDisc = Math.max(0, Math.min(100, discountPct));
  const discountAmount = rawSubtotal * (clampedDisc / 100);
  const afterDiscount = Math.max(0, rawSubtotal - discountAmount);
  const rate = Math.max(0, company.taxRate) / 100;

  let taxableAmount = afterDiscount;
  let taxAmount = 0;
  let total = afterDiscount;

  if (rate > 0) {
    if (company.taxInclusive) {
      taxableAmount = afterDiscount / (1 + rate);
      taxAmount = afterDiscount - taxableAmount;
      total = afterDiscount;
    } else {
      taxableAmount = afterDiscount;
      taxAmount = afterDiscount * rate;
      total = afterDiscount + taxAmount;
    }
  }

  return {
    subtotal: roundMoney(rawSubtotal),
    discountAmount: roundMoney(discountAmount),
    taxableAmount: roundMoney(taxableAmount),
    taxAmount: roundMoney(taxAmount),
    total: roundMoney(total),
    totalCost: roundMoney(totalCost),
  };
}

export function roundMoney(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

export interface InventoryValuationSummary {
  totalSkus: number;
  totalUnits: number;
  costValue: number;
  retailValue: number;
  wholesaleValue: number;
  potentialRetailProfit: number;
  outOfStockCount: number;
  lowStockCount: number;
  negativeStockCount: number;
}

export function calculateInventoryValuation(products: Product[]): InventoryValuationSummary {
  let totalUnits = 0;
  let costValue = 0;
  let retailValue = 0;
  let wholesaleValue = 0;
  let outOfStockCount = 0;
  let lowStockCount = 0;
  let negativeStockCount = 0;

  for (const p of products) {
    if (p.qty < 0) {
      negativeStockCount++;
    } else if (p.qty === 0) {
      outOfStockCount++;
    } else if (p.qty <= Math.max(p.minStock, 3)) {
      lowStockCount++;
    }

    const positiveQty = Math.max(0, p.qty);
    totalUnits += positiveQty;
    costValue += positiveQty * p.cost;
    retailValue += positiveQty * p.price;
    wholesaleValue += positiveQty * p.wholesalePrice;
  }

  return {
    totalSkus: products.length,
    totalUnits: roundMoney(totalUnits),
    costValue: roundMoney(costValue),
    retailValue: roundMoney(retailValue),
    wholesaleValue: roundMoney(wholesaleValue),
    potentialRetailProfit: roundMoney(retailValue - costValue),
    outOfStockCount,
    lowStockCount,
    negativeStockCount,
  };
}

export interface AccountingSummary {
  grossSales: number;
  retailSales: number;
  wholesaleSales: number;
  salesCount: number;
  totalReturns: number;
  returnsCount: number;
  netSalesRevenue: number;
  outputTaxCollected: number;
  returnTaxReversed: number;
  netOutputTax: number;
  grossCogs: number;
  returnedCogs: number;
  netCogs: number;
  grossProfit: number;
  grossMarginPct: number;
  inventoryPurchases: number;
  operatingExpenses: number;
  payrollExpenses: number;
  taxPaymentsMade: number;
  otherExpenses: number;
  totalExpenses: number;
  inputTaxPaid: number;
  netTaxPayable: number;
  netOperatingProfit: number;
  paymentBreakdown: {
    cash: number;
    card: number;
    transfer: number;
    credit: number;
    split: number;
  };
  cashOutflows: {
    cashRefunds: number;
    cashExpenses: number;
    expectedNetCash: number;
  };
}

export function calculateAccountingSummary(
  sales: Sale[],
  returns: StockReturn[],
  expenses: Expense[]
): AccountingSummary {
  let grossSales = 0;
  let retailSales = 0;
  let wholesaleSales = 0;
  let outputTaxCollected = 0;
  let grossCogs = 0;
  const paymentBreakdown = {
    cash: 0,
    card: 0,
    transfer: 0,
    credit: 0,
    split: 0,
  };

  for (const s of sales) {
    grossSales += s.total;
    if (s.saleMode === 'wholesale') {
      wholesaleSales += s.total;
    } else {
      retailSales += s.total;
    }
    outputTaxCollected += s.taxAmount;
    grossCogs += s.totalCost;
    paymentBreakdown[s.paymentMethod] = (paymentBreakdown[s.paymentMethod] || 0) + s.total;
  }

  let totalReturns = 0;
  let returnTaxReversed = 0;
  let returnedCogs = 0;
  let cashRefunds = 0;

  for (const r of returns) {
    totalReturns += r.refundTotal;
    returnTaxReversed += r.refundTax;
    returnedCogs += r.refundCost;
    if (r.refundMethod === 'cash') {
      cashRefunds += r.refundTotal;
    }
  }

  let inventoryPurchases = 0;
  let operatingExpenses = 0;
  let payrollExpenses = 0;
  let taxPaymentsMade = 0;
  let otherExpenses = 0;
  let inputTaxPaid = 0;
  let cashExpenses = 0;

  for (const e of expenses) {
    inputTaxPaid += e.taxAmount;
    if (e.paymentMethod === 'cash') {
      cashExpenses += e.totalAmount;
    }
    if (e.expenseType === 'inventory_purchase') {
      inventoryPurchases += e.totalAmount;
    } else if (e.expenseType === 'operating') {
      operatingExpenses += e.totalAmount;
    } else if (e.expenseType === 'payroll') {
      payrollExpenses += e.totalAmount;
    } else if (e.expenseType === 'tax_payment') {
      taxPaymentsMade += e.totalAmount;
    } else {
      otherExpenses += e.totalAmount;
    }
  }

  const netSalesRevenue = roundMoney(grossSales - totalReturns);
  const netOutputTax = roundMoney(Math.max(0, outputTaxCollected - returnTaxReversed));
  const netCogs = roundMoney(Math.max(0, grossCogs - returnedCogs));
  // Revenue ex-tax for accurate P&L
  const netSalesExTax = roundMoney(netSalesRevenue - netOutputTax);
  const grossProfit = roundMoney(netSalesExTax - netCogs);
  const grossMarginPct = netSalesExTax > 0 ? roundMoney((grossProfit / netSalesExTax) * 100) : 0;

  // Operating expense total (ex-input tax, excluding inventory purchases which are capitalized until sold as COGS)
  const opexTotal = operatingExpenses + payrollExpenses + otherExpenses;
  const totalExpenses = roundMoney(inventoryPurchases + opexTotal + taxPaymentsMade);
  const netTaxPayable = roundMoney(netOutputTax - inputTaxPaid - taxPaymentsMade);
  const netOperatingProfit = roundMoney(grossProfit - (opexTotal - Math.min(inputTaxPaid, opexTotal)));

  return {
    grossSales: roundMoney(grossSales),
    retailSales: roundMoney(retailSales),
    wholesaleSales: roundMoney(wholesaleSales),
    salesCount: sales.length,
    totalReturns: roundMoney(totalReturns),
    returnsCount: returns.length,
    netSalesRevenue,
    outputTaxCollected: roundMoney(outputTaxCollected),
    returnTaxReversed: roundMoney(returnTaxReversed),
    netOutputTax,
    grossCogs: roundMoney(grossCogs),
    returnedCogs: roundMoney(returnedCogs),
    netCogs,
    grossProfit,
    grossMarginPct,
    inventoryPurchases: roundMoney(inventoryPurchases),
    operatingExpenses: roundMoney(operatingExpenses),
    payrollExpenses: roundMoney(payrollExpenses),
    taxPaymentsMade: roundMoney(taxPaymentsMade),
    otherExpenses: roundMoney(otherExpenses),
    totalExpenses,
    inputTaxPaid: roundMoney(inputTaxPaid),
    netTaxPayable,
    netOperatingProfit,
    paymentBreakdown: {
      cash: roundMoney(paymentBreakdown.cash),
      card: roundMoney(paymentBreakdown.card),
      transfer: roundMoney(paymentBreakdown.transfer),
      credit: roundMoney(paymentBreakdown.credit),
      split: roundMoney(paymentBreakdown.split),
    },
    cashOutflows: {
      cashRefunds: roundMoney(cashRefunds),
      cashExpenses: roundMoney(cashExpenses),
      expectedNetCash: roundMoney(paymentBreakdown.cash - cashRefunds - cashExpenses),
    },
  };
}
