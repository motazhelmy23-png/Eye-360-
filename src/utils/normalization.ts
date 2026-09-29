import { NormalizedProduct } from '../types/inventory';

export function normalizeHeader(str: unknown): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/[\u064b-\u0652]/g, '') // remove Arabic diacritics / tashkeel
    .replace(/[إأآا]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ي/g, 'ي')
    .replace(/[أإآء]/g, 'ا')
    .replace(/[\s\-_.,\/\\()]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function normalizeString(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  const str = String(val).trim().replace(/\s+/g, ' ');
  if (!str || str.toLowerCase() === 'nan' || str.toLowerCase() === 'undefined' || str === '---' || str === 'blank') return null;
  return str;
}

export function normalizeCode(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  const str = String(val).trim();
  if (!str || str.toLowerCase() === 'nan' || str === 'undefined' || str === '---' || str === 'blank') return null;
  return str;
}

export function parseStock(value: unknown): number {
  if (value === null || value === undefined || value === '') {
    return 0;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  const cleaned = String(value)
    .trim()
    .replace(/,/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function safeFiniteNumber(val: unknown): { value: number; isFinite: boolean } {
  if (val === null || val === undefined || val === '') return { value: 0, isFinite: true };
  if (typeof val === 'number') {
    if (Number.isFinite(val)) return { value: val, isFinite: true };
    return { value: 0, isFinite: false };
  }
  const cleaned = String(val).replace(/,/g, '').trim();
  const num = parseFloat(cleaned);
  if (Number.isFinite(num)) return { value: num, isFinite: true };
  return { value: 0, isFinite: false };
}

export function computeFingerprint(p: Omit<NormalizedProduct, 'fingerprint'>): string {
  const canonical = {
    itemCode: p.itemCode,
    category: p.category,
    modelCode: p.modelCode,
    barcode: p.barcode,
    name: p.name,
    brand: p.brand,
    salePrice: p.salePrice,
    stocks: p.stocks,
    totalStock: p.totalStock,
    sourceTotalStock: p.sourceTotalStock,
  };
  const str = JSON.stringify(canonical);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

export function normalizeProductFromArray(
  rowArray: any[],
  locationDescriptors: { id: string; columnIndex: number }[],
  mapping: {
    itemCodeIdx: number;
    categoryIdx?: number;
    modelIdx?: number;
    nameIdx?: number;
    brandIdx?: number;
    priceIdx?: number;
    sourceTotalIdx?: number;
    sourceSequenceIdx?: number;
  }
): { product: NormalizedProduct; warnings: string[] } {
  const warnings: string[] = [];

  const rawItemCode = mapping.itemCodeIdx >= 0 ? rowArray[mapping.itemCodeIdx] : null;
  const itemCode = normalizeCode(rawItemCode);

  const category = mapping.categoryIdx !== undefined && mapping.categoryIdx >= 0 ? normalizeString(rowArray[mapping.categoryIdx]) : null;
  const rawModel = mapping.modelIdx !== undefined && mapping.modelIdx >= 0 ? normalizeCode(rowArray[mapping.modelIdx]) : null;
  
  // Business Rule: كود الموديل maps to both modelCode AND barcode as string, preserving leading zeros
  const modelCode = rawModel;
  const barcode = rawModel;

  const name = mapping.nameIdx !== undefined && mapping.nameIdx >= 0 ? normalizeString(rowArray[mapping.nameIdx]) : null;
  const brand = mapping.brandIdx !== undefined && mapping.brandIdx >= 0 ? normalizeCode(rowArray[mapping.brandIdx]) : null;
  const sourceSequence = mapping.sourceSequenceIdx !== undefined && mapping.sourceSequenceIdx >= 0 ? normalizeCode(rowArray[mapping.sourceSequenceIdx]) : undefined;

  const rawPrice = mapping.priceIdx !== undefined && mapping.priceIdx >= 0 ? rowArray[mapping.priceIdx] : undefined;
  let salePrice: number | null = null;
  if (rawPrice !== undefined && rawPrice !== null && rawPrice !== '') {
    const pRes = safeFiniteNumber(rawPrice);
    if (pRes.isFinite) {
      salePrice = pRes.value;
    }
  }

  const stocks: Record<string, number> = {};
  let computedTotal = 0;

  for (const loc of locationDescriptors) {
    const rawVal = rowArray[loc.columnIndex];
    const qty = parseStock(rawVal);
    stocks[loc.id] = qty;
    computedTotal += qty;
  }

  let sourceTotalStock: number | undefined = undefined;
  if (mapping.sourceTotalIdx !== undefined && mapping.sourceTotalIdx >= 0) {
    const rawSt = rowArray[mapping.sourceTotalIdx];
    if (rawSt !== undefined && rawSt !== null && rawSt !== '') {
      const stRes = safeFiniteNumber(rawSt);
      if (stRes.isFinite) {
        sourceTotalStock = stRes.value;
      }
    }
  }

  const totalStock = computedTotal;

  const partialProduct: Omit<NormalizedProduct, 'fingerprint'> = {
    itemCode: itemCode || '',
    category,
    barcode,
    modelCode,
    name,
    brand,
    salePrice,
    stocks,
    totalStock,
    sourceTotalStock,
    sourceSequence,
    active: true,
  };

  const fingerprint = computeFingerprint(partialProduct);

  return {
    product: {
      ...partialProduct,
      fingerprint,
    },
    warnings,
  };
}
