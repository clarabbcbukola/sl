export function formatCurrency(amount: number, currency = '₦'): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const abs = Math.abs(safe);
  const formatted = abs.toLocaleString('en-US', {
    minimumFractionDigits: abs % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return safe < 0 ? `-${currency}${formatted}` : `${currency}${formatted}`;
}

export function formatNumber(val: number): string {
  const safe = Number.isFinite(val) ? val : 0;
  return safe.toLocaleString('en-US', {
    maximumFractionDigits: 2,
  });
}

export function getTodayDateKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getDateKeyOffset(daysOffset: number): string {
  const dt = new Date();
  dt.setDate(dt.getDate() + daysOffset);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function generateId(prefix = 'id'): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

export function generateTrackingNumber(prefix: 'TRX' | 'TRF' | 'RET' | 'EXP' | 'STK' | 'REC'): string {
  const now = new Date();
  const y = String(now.getFullYear()).slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${y}${m}${d}-${rand}`;
}

export async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(`stockledger_pin_v1:${pin}`);
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Deterministic 64-char hex fallback if subtle crypto unavailable in non-secure context
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < data.length; i++) {
    h1 ^= data[i];
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= data[i];
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  const part = ((h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0')).repeat(4);
  return part.slice(0, 64);
}

export function inferCategoryFromName(name: string, rawCategory?: string): string {
  if (rawCategory && rawCategory.trim() !== '' && rawCategory.trim() !== '0') {
    return rawCategory.trim().slice(0, 80);
  }
  const lower = name.toLowerCase();
  if (/(syr|syrup|susp|suspension|tonic|linctus|drops|drop|mix)/.test(lower)) {
    return 'Syrups & Liquids';
  }
  if (/(inj|amp|vial|infusion|saline|dextrose|canular|needle|syringe|scalp vein|catheter|giving set)/.test(lower)) {
    return 'Injections & IV';
  }
  if (/(cream|ointment|gel|lotion|balm|rub|powder|dusting)/.test(lower)) {
    return 'Creams & Topicals';
  }
  if (/(soap|paste|toothpaste|brush|wipe|diaper|pad|pampers|spray|perfume|roll|detergent|bleach|tissue|sponge|vaseline|butter|oil)/.test(lower)) {
    return 'Personal & Home Care';
  }
  if (/(tea|milk|milo|bournvita|ovaltine|cornflakes|golden morn|sugar|water|drink|yoghurt|sweet|candy|gum|cracker|cerelac|nutribom|nan|sma|oat|cocoa|coffee|nescafe)/.test(lower)) {
    return 'Food & Beverages';
  }
  if (/(test|strip|thermometer|cotton|gauze|bandage|glove|plaster|facemask|lancet|cord clamp)/.test(lower)) {
    return 'Medical Supplies & Tests';
  }
  if (/(vitamin|vit |multivit|iron|ferrous|folic|calcium|zinc|omega|asty|daravit|pregatab|pregnatab|fratone|prolife|cod liver|supplement|yeast)/.test(lower)) {
    return 'Vitamins & Supplements';
  }
  if (/(tab|cap|sachet|mg|p-alaxin|palaxin|lonart|amatem|art|amox|cipro|azith|metro|loxagyl|pcm|para|ibu|diclo|omeprazole|amlodipine|losartan|lisinopril)/.test(lower)) {
    return 'Tablets & Capsules';
  }
  return 'General Pharmacy';
}

export function getStockStatus(qty: number, minStock: number): 'out' | 'low' | 'in' | 'negative' {
  if (qty < 0) return 'negative';
  if (qty === 0) return 'out';
  if (qty <= Math.max(minStock, 3)) return 'low';
  return 'in';
}

export function clampStr(val: string, maxLen: number): string {
  return (val ?? '').trim().slice(0, maxLen);
}

export function formatTimestamp(ts: unknown): string {
  if (!ts) return 'Just now';
  try {
    const d =
      typeof ts === 'object' && ts !== null && 'toDate' in ts && typeof (ts as { toDate: () => Date }).toDate === 'function'
        ? (ts as { toDate: () => Date }).toDate()
        : new Date(ts as string | number);
    if (Number.isNaN(d.getTime())) return 'Recent';
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'Recent';
  }
}
