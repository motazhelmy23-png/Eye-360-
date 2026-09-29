import * as XLSX from 'xlsx';
import { LocationMeta, NormalizedProduct, ImportParseResult, ColumnDiagnostic, ColumnClassification, ProductDebugInspection } from '../types/inventory';
import { normalizeHeader, normalizeCode, normalizeString, parseStock, normalizeProductFromArray } from '../utils/normalization';

export async function parseInventoryExcel(file: File): Promise<ImportParseResult> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellText: true, raw: true });

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return createEmptyResult(file, ['الملف فارغ أو لا يحتوي على ورقة عمل صالحة']);
  }

  const sheet = workbook.Sheets[sheetName];
  const allRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });

  if (allRows.length === 0) {
    return createEmptyResult(file, ['لم يتم العثور على أي صفوف بيانات في ورقة العمل']);
  }

  const headerRowIndex = 0;
  const rawHeaders = allRows[headerRowIndex].map(h => String(h || '').trim());
  const dataRows = allRows.slice(headerRowIndex + 1);

  const rawRowsSample = dataRows.slice(0, 15).map(row => {
    const obj: Record<string, any> = {};
    rawHeaders.forEach((h, idx) => { obj[h] = row[idx]; });
    return obj;
  });

  // Column mapping indexes
  let itemCodeIdx = -1;
  let categoryIdx = -1;
  let nameIdx = -1;
  let brandIdx = -1;
  let modelIdx = -1;
  let priceIdx = -1;
  let sourceTotalIdx = -1;
  let sourceSequenceIdx = -1;

  const locationDescriptors: { id: string; name: string; columnIndex: number; sourceHeader: string }[] = [];
  const columnDiagnostics: ColumnDiagnostic[] = [];

  rawHeaders.forEach((header, index) => {
    if (!header) return;
    const cleanH = header.trim();
    const norm = normalizeHeader(header);

    let classification: ColumnClassification = 'UNKNOWN';

    if (cleanH === 'كود الصنف' || norm === 'كود_الصنف' || norm === 'كودصنف') {
      itemCodeIdx = index;
      classification = 'PRODUCT_FIELD';
    } else if (cleanH === 'التصنيف' || norm === 'التصنيف') {
      categoryIdx = index;
      classification = 'PRODUCT_FIELD';
    } else if (cleanH === 'الصنف' || norm === 'الصنف') {
      nameIdx = index;
      classification = 'PRODUCT_FIELD';
    } else if (cleanH === 'العلامة التجارية' || norm === 'العلامة_التجارية') {
      brandIdx = index;
      classification = 'PRODUCT_FIELD';
    } else if (cleanH === 'كود الموديل' || norm === 'كود_الموديل' || norm === 'كودموديل') {
      modelIdx = index;
      classification = 'PRODUCT_FIELD';
    } else if (cleanH === 'سعر البيع' || norm === 'سعر_البيع' || norm === 'السعر') {
      priceIdx = index;
      classification = 'PRODUCT_FIELD';
    } else if (cleanH === 'الرصيد الكلى' || cleanH === 'الرصيد الكلي' || norm === 'الرصيد_الكلي') {
      sourceTotalIdx = index;
      classification = 'SOURCE_TOTAL';
    } else if (cleanH === 'تسلسل الصنف' || norm === 'تسلسل_الصنف') {
      sourceSequenceIdx = index;
      classification = 'PRODUCT_FIELD';
    } else if (cleanH.startsWith('مخزن_') || cleanH.startsWith('معرض_') || norm.startsWith('مخزن_') || norm.startsWith('معرض_') || norm.includes('مخزن') || norm.includes('معرض')) {
      classification = 'INVENTORY_LOCATION';
      locationDescriptors.push({
        id: `loc_${locationDescriptors.length + 1}_${cleanH.replace(/\s+/g, '_')}`,
        name: cleanH,
        columnIndex: index,
        sourceHeader: cleanH,
      });
    } else {
      classification = 'IGNORED';
    }

    // Column stats for diagnostics
    let nonEmptyCount = 0;
    let numericCount = 0;
    let minVal = Infinity;
    let maxVal = -Infinity;
    const sampleValues: any[] = [];

    dataRows.forEach(row => {
      const val = row[index];
      if (val !== null && val !== undefined && val !== '') {
        nonEmptyCount++;
        if (sampleValues.length < 5) sampleValues.push(val);
        const num = Number(val);
        if (Number.isFinite(num)) {
          numericCount++;
          if (num < minVal) minVal = num;
          if (num > maxVal) maxVal = num;
        }
      }
    });

    const totalScanned = Math.min(dataRows.length, 500);
    const finiteNumericPercentage = totalScanned > 0 ? (numericCount / totalScanned) * 100 : 0;

    columnDiagnostics.push({
      index,
      originalHeader: header,
      normalizedHeader: norm,
      classification,
      nonEmptyCount,
      numericCount,
      finiteNumericPercentage,
      minValue: minVal === Infinity ? 0 : minVal,
      maxValue: maxVal === -Infinity ? 0 : maxVal,
      sampleValues,
    });
  });

  const blockingErrors: string[] = [];
  const warnings: string[] = [];

  if (itemCodeIdx === -1) {
    blockingErrors.push('تعذر العثور على عمود كود الصنف (كود الصنف).');
  }

  if (locationDescriptors.length === 0) {
    blockingErrors.push('تعذر العثور على أي مواقع مخزون تشغيلية تبدأ بـ مخزن_ أو معرض_.');
  }

  const locations: LocationMeta[] = locationDescriptors.map((loc, idx) => ({
    id: loc.id,
    name: loc.name,
    sourceHeader: loc.sourceHeader,
    columnIndex: loc.columnIndex,
    order: idx + 1,
  }));

  const products: NormalizedProduct[] = [];
  const itemCodeCounts = new Map<string, { count: number; names: (string | null)[] }>();
  let productsWithStock = 0;
  let productsWithoutStock = 0;
  let totalOperationalUnits = 0;
  let aucPositiveCount = 0;
  let aucTotalUnits = 0;

  let missingBrandCount = 0;
  let missingModelCount = 0;
  let sourceTotalMismatchCount = 0;

  const aucLoc = locations.find(l => l.name.includes('معرض_التجمع_AUC') || l.name.includes('التجمع_AUC'));
  const debugInspections: ProductDebugInspection[] = [];

  dataRows.forEach((row, rowIndex) => {
    if (!row || row.length === 0) return;
    const rawCode = itemCodeIdx >= 0 ? row[itemCodeIdx] : null;
    const itemCode = normalizeCode(rawCode);

    if (!itemCode) return;

    const { product, warnings: pWarnings } = normalizeProductFromArray(
      row,
      locations,
      {
        itemCodeIdx,
        categoryIdx: categoryIdx >= 0 ? categoryIdx : undefined,
        modelIdx: modelIdx >= 0 ? modelIdx : undefined,
        nameIdx: nameIdx >= 0 ? nameIdx : undefined,
        brandIdx: brandIdx >= 0 ? brandIdx : undefined,
        priceIdx: priceIdx >= 0 ? priceIdx : undefined,
        sourceTotalIdx: sourceTotalIdx >= 0 ? sourceTotalIdx : undefined,
        sourceSequenceIdx: sourceSequenceIdx >= 0 ? sourceSequenceIdx : undefined,
      }
    );

    warnings.push(...pWarnings);

    if (!product.brand) missingBrandCount++;
    if (!product.modelCode) missingModelCount++;
    if (product.sourceTotalStock !== undefined && product.sourceTotalStock !== product.totalStock) {
      sourceTotalMismatchCount++;
    }

    if (itemCodeCounts.has(itemCode)) {
      const entry = itemCodeCounts.get(itemCode)!;
      entry.count += 1;
      entry.names.push(product.name);
    } else {
      itemCodeCounts.set(itemCode, { count: 1, names: [product.name] });
    }

    if (product.totalStock > 0) {
      productsWithStock++;
    } else {
      productsWithoutStock++;
    }

    totalOperationalUnits += product.totalStock;

    if (aucLoc && product.stocks[aucLoc.id] > 0) {
      aucPositiveCount++;
      aucTotalUnits += product.stocks[aucLoc.id];
    }

    // Collect debug inspection for first 5 products
    if (rowIndex < 5) {
      debugInspections.push({
        itemCode: product.itemCode,
        name: product.name,
        locations: locations.map(loc => ({
          columnIndex: loc.columnIndex,
          header: loc.name,
          rawCellValue: row[loc.columnIndex],
          parsedStockValue: product.stocks[loc.id],
        }))
      });
    }

    products.push(product);
  });

  const duplicates: { itemCode: string; count: number; names: (string | null)[] }[] = [];
  itemCodeCounts.forEach((val, key) => {
    if (val.count > 1) {
      duplicates.push({ itemCode: key, count: val.count, names: val.names });
    }
  });

  if (duplicates.length > 0) {
    blockingErrors.push(`تم اكتشاف ${duplicates.length} أكواد أصناف مكررة في الملف.`);
  }

  if (products.length === 0) {
    blockingErrors.push('لا توجد أصناف صالحة مستخرجة من الملف.');
  }

  // Summary warnings
  if (missingBrandCount > 0) {
    warnings.push(`تجميع التحذيرات - أصناف بدون علامة تجارية: ${missingBrandCount} صنف.`);
  }
  if (missingModelCount > 0) {
    warnings.push(`تجميع التحذيرات - أصناف بدون كود موديل/باركود: ${missingModelCount} صنف.`);
  }
  if (sourceTotalMismatchCount > 0) {
    warnings.push(`تجميع التحذيرات - اختلاف الرصيد الكلي بالمصدر عن مجموع مواقع المخزون التشغيلية: ${sourceTotalMismatchCount} صنف.`);
  }

  return {
    success: blockingErrors.length === 0,
    fileName: file.name,
    fileSize: file.size,
    lastModified: file.lastModified,
    sourceRowCount: dataRows.length,
    headerRowIndex: 1,
    rawHeaders,
    rawRowsSample,
    columnDiagnostics,
    products,
    locations,
    debugInspections,
    blockingErrors,
    warnings,
    duplicates,
    stats: {
      totalProducts: products.length,
      productsWithStock,
      productsWithoutStock,
      totalOperationalUnits,
      aucPositiveCount,
      aucTotalUnits,
    },
  };
}

function createEmptyResult(file: File, errors: string[]): ImportParseResult {
  return {
    success: false,
    fileName: file.name,
    fileSize: file.size,
    lastModified: file.lastModified,
    sourceRowCount: 0,
    headerRowIndex: -1,
    rawHeaders: [],
    rawRowsSample: [],
    columnDiagnostics: [],
    products: [],
    locations: [],
    debugInspections: [],
    blockingErrors: errors,
    warnings: [],
    duplicates: [],
    stats: { totalProducts: 0, productsWithStock: 0, productsWithoutStock: 0, totalOperationalUnits: 0 }
  };
}
