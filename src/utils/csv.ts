import { Product } from '../types';
import { inferCategoryFromName } from './format';

export interface ParsedCSVProductRow {
  name: string;
  category: string;
  price: number;
  wholesalePrice: number;
  cost: number;
  qty: number;
  minStock: number;
  branchName: string;
  sku?: string;
  unit?: string;
}

export function parseCSVText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field.trim());
        field = '';
      } else if (ch === '\r' && next === '\n') {
        row.push(field.trim());
        rows.push(row);
        row = [];
        field = '';
        i++;
      } else if (ch === '\n' || ch === '\r') {
        row.push(field.trim());
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += ch;
      }
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell !== ''));
}

export function parseInventoryCSV(
  csvText: string,
  defaultWholesaleDiscountPct = 10
): ParsedCSVProductRow[] {
  const matrix = parseCSVText(csvText);
  if (matrix.length < 2) return [];

  const header = matrix[0].map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const idx = (names: string[]) => header.findIndex((h) => names.includes(h));

  const nameIdx = idx(['name', 'product', 'item', 'productname', 'title']);
  const catIdx = idx(['category', 'cat', 'group']);
  const priceIdx = idx(['price', 'retailprice', 'sellingprice']);
  const wholesaleIdx = idx(['wholesaleprice', 'wholesale', 'bulkprice']);
  const costIdx = idx(['cost', 'costprice', 'unitcost']);
  const qtyIdx = idx(['qty', 'quantity', 'stock', 'instock']);
  const minIdx = idx(['minstock', 'reorderlevel', 'minqty']);
  const branchIdx = idx(['branchname', 'branch', 'store']);
  const skuIdx = idx(['sku', 'code', 'trackingnumber', 'barcode']);
  const unitIdx = idx(['unit', 'uom']);

  if (nameIdx === -1) return [];

  const items: ParsedCSVProductRow[] = [];
  for (let i = 1; i < matrix.length; i++) {
    const cols = matrix[i];
    const rawName = (cols[nameIdx] || '').trim();
    if (!rawName) continue;

    const cleanName = rawName.replace(/^`+/, '').trim().slice(0, 200);
    if (!cleanName) continue;

    const price = Math.max(0, Number.parseFloat(cols[priceIdx] || '0') || 0);
    const cost = Math.max(0, Number.parseFloat(cols[costIdx] || '0') || 0);
    const qty = Number.parseFloat(cols[qtyIdx] || '0') || 0;
    const minStock = Math.max(0, Number.parseFloat(cols[minIdx] || '0') || 0);
    const branchName = (cols[branchIdx] || 'Main').trim().slice(0, 80) || 'Main';
    const rawCat = catIdx >= 0 ? cols[catIdx] : '0';
    const category = inferCategoryFromName(cleanName, rawCat);

    let wholesalePrice =
      wholesaleIdx >= 0 && cols[wholesaleIdx]
        ? Math.max(0, Number.parseFloat(cols[wholesaleIdx]) || 0)
        : 0;
    if (wholesalePrice <= 0 && price > 0) {
      const discounted = Math.round(price * (1 - defaultWholesaleDiscountPct / 100));
      wholesalePrice = cost > 0 ? Math.max(cost, discounted) : discounted;
    }

    items.push({
      name: cleanName,
      category,
      price,
      wholesalePrice,
      cost,
      qty,
      minStock,
      branchName,
      sku: skuIdx >= 0 ? (cols[skuIdx] || '').trim().slice(0, 64) : undefined,
      unit: unitIdx >= 0 ? (cols[unitIdx] || 'pcs').trim().slice(0, 30) : 'pcs',
    });
  }

  return items;
}

export async function fetchPreloadedStockCSV(
  defaultWholesaleDiscountPct = 10
): Promise<ParsedCSVProductRow[]> {
  const rawBase = import.meta.env.BASE_URL || '/';
  const base = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;
  const res = await fetch(`${base}assets/aistudio/inventory_export_2026-11-16_4852fd03.csv`);
  if (!res.ok) {
    throw new Error('Could not load preloaded stock catalog CSV');
  }
  const text = await res.text();
  return parseInventoryCSV(text, defaultWholesaleDiscountPct);
}

function escapeCSV(val: string | number): string {
  const str = String(val ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportProductsToCSV(products: Product[]): string {
  const headers = [
    'name',
    'category',
    'price',
    'wholesalePrice',
    'cost',
    'qty',
    'minStock',
    'branchName',
    'sku',
    'unit',
  ];
  const lines = [headers.join(',')];
  for (const p of products) {
    lines.push(
      [
        escapeCSV(p.name),
        escapeCSV(p.category),
        escapeCSV(p.price),
        escapeCSV(p.wholesalePrice),
        escapeCSV(p.cost),
        escapeCSV(p.qty),
        escapeCSV(p.minStock),
        escapeCSV(p.branchName),
        escapeCSV(p.sku),
        escapeCSV(p.unit),
      ].join(',')
    );
  }
  return lines.join('\n');
}

export function exportRowsToCSV(headers: string[], rows: (string | number)[][]): string {
  const lines = [headers.map(escapeCSV).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCSV).join(','));
  }
  return lines.join('\n');
}

export function downloadCSVFile(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
