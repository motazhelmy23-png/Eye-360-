export type ColumnClassification = 'PRODUCT_FIELD' | 'INVENTORY_LOCATION' | 'SOURCE_TOTAL' | 'IGNORED' | 'UNKNOWN';

export interface ColumnDiagnostic {
  index: number;
  originalHeader: string;
  normalizedHeader: string;
  classification: ColumnClassification;
  nonEmptyCount: number;
  numericCount: number;
  finiteNumericPercentage: number;
  minValue?: number;
  maxValue?: number;
  sampleValues: any[];
}

export interface LocationMeta {
  id: string;
  name: string;
  sourceHeader: string;
  columnIndex: number;
  order: number;
  diagnostic?: ColumnDiagnostic;
}

export interface NormalizedProduct {
  itemCode: string;
  category?: string | null;
  barcode: string | null;
  modelCode: string | null;
  name: string | null;
  brand: string | null;
  salePrice: number | null;
  stocks: Record<string, number>;
  totalStock: number;
  sourceTotalStock?: number;
  sourceSequence?: string | null;
  active: boolean;
  fingerprint: string;
}

export interface ProductDebugInspection {
  itemCode: string;
  name: string | null;
  locations: {
    columnIndex: number;
    header: string;
    rawCellValue: any;
    parsedStockValue: number;
  }[];
}

export interface ImportParseResult {
  success: boolean;
  fileName: string;
  fileSize: number;
  lastModified: number;
  sourceRowCount: number;
  headerRowIndex: number;
  rawHeaders: string[];
  rawRowsSample: Record<string, any>[];
  columnDiagnostics: ColumnDiagnostic[];
  products: NormalizedProduct[];
  locations: LocationMeta[];
  debugInspections: ProductDebugInspection[];
  blockingErrors: string[];
  warnings: string[];
  duplicates: { itemCode: string; count: number; names: (string | null)[] }[];
  stats: {
    totalProducts: number;
    productsWithStock: number;
    productsWithoutStock: number;
    totalOperationalUnits: number;
    aucPositiveCount?: number;
    aucTotalUnits?: number;
  };
}
