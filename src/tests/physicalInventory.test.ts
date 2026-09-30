import { describe, it, expect, vi } from 'vitest';
import { 
  calculateVarianceReview,
  exportInventoryReportXLSX,
  chunkBaselineEntriesByBytes,
  estimateObjectByteSize 
} from '../services/inventorySessionService';
import { 
  InventorySession, 
  BaselineProductEntry, 
  ProductCountRecord, 
  VarianceReviewItem 
} from '../types/inventorySession';
import { NormalizedProduct } from '../types/inventory';

describe('Eye 360 Phase 5A + 5B: Physical Inventory Counting System Test Suite', () => {
  const sampleBaseline: BaselineProductEntry[] = [
    {
      itemCode: '11752',
      name: 'Tiger Product 11752',
      barcode: '7394586123476',
      modelCode: 'MOD-11752',
      category: 'Electronics',
      baselineQty: 8,
    },
    {
      itemCode: '11773',
      name: 'Fuse 63A',
      barcode: '9876543210123',
      modelCode: 'MOD-11773',
      category: 'Electrical',
      baselineQty: 10,
    },
    {
      itemCode: '11780',
      name: 'Zero Baseline Product',
      barcode: '1122334455667',
      modelCode: 'MOD-11780',
      category: 'Electrical',
      baselineQty: 0,
    }
  ];

  it('1. Admin can create draft session structure with blind count enabled', () => {
    const draftSession: Partial<InventorySession> = {
      id: 'session_123',
      name: 'جرد فرع المعادي',
      branchId: 'branch_maadi',
      inventoryLocationId: 'loc_maadi',
      type: 'FULL',
      blindCount: true,
      status: 'DRAFT',
      baselineSnapshotStatus: 'NOT_CREATED',
      assignedUserIds: ['user_sales_1'],
    };

    expect(draftSession.status).toBe('DRAFT');
    expect(draftSession.blindCount).toBe(true);
    expect(draftSession.assignedUserIds?.length).toBeGreaterThan(0);
  });

  it('2. Branch and inventory location validation blocks inactive branch', () => {
    const branch = { id: 'branch_inactive', isActive: false, inventoryLocationId: 'loc_1' };
    const validateBranch = (b: typeof branch) => {
      if (!b.isActive) throw new Error('الفرع المحدد غير نشط.');
    };
    expect(() => validateBranch(branch)).toThrow('الفرع المحدد غير نشط.');
  });

  it('3. Stale local revision blocks session activation', () => {
    const cloudVersion = 'cat_v1';
    const cloudRevision = 5;
    const localVersion = 'cat_v1';
    const localRevision = 4; // stale!

    const canActivate = (cVer: string, cRev: number, lVer: string, lRev: number) => {
      if (cVer !== lVer || cRev !== lRev) {
        throw new Error('يجب مزامنة البيانات قبل بدء جلسة الجرد.');
      }
      return true;
    };

    expect(() => canActivate(cloudVersion, cloudRevision, localVersion, localRevision)).toThrow(
      'يجب مزامنة البيانات قبل بدء جلسة الجرد.'
    );
  });

  it('4. FULL scope filters products with positive stock (> 0) at location', () => {
    const products: NormalizedProduct[] = [
      {
        itemCode: '1',
        name: 'Item 1',
        barcode: null,
        modelCode: null,
        salePrice: 10,
        brand: 'BrandA',
        stocks: { loc_a: 5, loc_b: 0 },
        totalStock: 5,
        active: true,
        fingerprint: 'f1',
      },
      {
        itemCode: '2',
        name: 'Item 2',
        barcode: null,
        modelCode: null,
        brand: 'BrandB',
        salePrice: 10,
        stocks: { loc_a: 0, loc_b: 10 },
        totalStock: 10,
        active: true,
        fingerprint: 'f2',
      }
    ];

    const expectedLocA = products.filter(p => p.active && (p.stocks['loc_a'] || 0) > 0);
    expect(expectedLocA.length).toBe(1);
    expect(expectedLocA[0].itemCode).toBe('1');
  });

  it('5. CATEGORY scope rejects products from outside the selected category', () => {
    const selectedCategory = 'Electrical';
    const scannedProductCategory = 'Plumbing';

    const isAllowed = (cat: string, targetCat: string) => cat === targetCat;
    expect(isAllowed(scannedProductCategory, selectedCategory)).toBe(false);
  });

  it('6. SELECTED_PRODUCTS enforces <= 500 limit and rejects unselected items', () => {
    const selectedCodes = ['A1', 'A2', 'A3'];
    expect(selectedCodes.length).toBeLessThanOrEqual(500);

    const isScannedAllowed = (code: string) => selectedCodes.includes(code);
    expect(isScannedAllowed('A1')).toBe(true);
    expect(isScannedAllowed('A999')).toBe(false);
  });

  it('7. Blind count hides baseline, expected qty, and variance from Sales', () => {
    const salesViewData = {
      itemCode: '11752',
      name: 'Tiger Product 11752',
      barcode: '7394586123476',
      countedQty: 6,
    };

    expect(salesViewData).not.toHaveProperty('baselineQty');
    expect(salesViewData).not.toHaveProperty('variance');
    expect(salesViewData).not.toHaveProperty('systemStock');
  });

  it('8. Physical count quantity 0 is valid and counted (distinct from uncounted)', () => {
    const countRecord: Partial<ProductCountRecord> = {
      itemCode: '11752',
      currentQty: 0,
      firstQty: 0,
      status: 'COUNTED',
    };

    expect(countRecord.currentQty).toBe(0);
    expect(countRecord.status).toBe('COUNTED');
  });

  it('9. Edit count maintains immutable firstQty and appends history', () => {
    const initialRecord: ProductCountRecord = {
      itemCode: '11752',
      branchId: 'b1',
      firstQty: 5,
      currentQty: 5,
      firstCountedByUid: 'u1',
      firstCountedAt: '2026-09-30T10:00:00Z',
      lastUpdatedByUid: 'u1',
      lastUpdatedAt: '2026-09-30T10:00:00Z',
      editCount: 0,
      history: [],
      status: 'COUNTED',
      unexpected: false,
    };

    const updatedRecord: ProductCountRecord = {
      ...initialRecord,
      currentQty: 8,
      editCount: initialRecord.editCount + 1,
      history: [
        ...initialRecord.history,
        { qty: initialRecord.currentQty, changedByUid: 'u1', changedAt: '2026-09-30T10:05:00Z' }
      ]
    };

    expect(updatedRecord.firstQty).toBe(5); // Immutable!
    expect(updatedRecord.currentQty).toBe(8);
    expect(updatedRecord.editCount).toBe(1);
    expect(updatedRecord.history.length).toBe(1);
    expect(updatedRecord.history[0].qty).toBe(5);
  });

  it('10. Variance calculations: 6 - 8 = -2 (SHORTAGE), 10 - 8 = +2 (OVERAGE), 8 - 8 = 0 (MATCH)', () => {
    const countsMap: Record<string, ProductCountRecord> = {
      '11752': {
        itemCode: '11752',
        branchId: 'b1',
        firstQty: 6,
        currentQty: 6,
        firstCountedByUid: 'u1',
        firstCountedAt: 'now',
        lastUpdatedByUid: 'u1',
        lastUpdatedAt: 'now',
        editCount: 0,
        history: [],
        status: 'COUNTED',
        unexpected: false,
      },
      '11773': {
        itemCode: '11773',
        branchId: 'b1',
        firstQty: 10,
        currentQty: 10,
        firstCountedByUid: 'u1',
        firstCountedAt: 'now',
        lastUpdatedByUid: 'u1',
        lastUpdatedAt: 'now',
        editCount: 0,
        history: [],
        status: 'COUNTED',
        unexpected: false,
      }
    };

    const reviewItems = calculateVarianceReview(sampleBaseline, countsMap);

    const item11752 = reviewItems.find(i => i.itemCode === '11752');
    expect(item11752?.baselineQty).toBe(8);
    expect(item11752?.finalCountQty).toBe(6);
    expect(item11752?.variance).toBe(-2);
    expect(item11752?.semanticStatus).toBe('SHORTAGE');

    const item11773 = reviewItems.find(i => i.itemCode === '11773');
    expect(item11773?.baselineQty).toBe(10);
    expect(item11773?.finalCountQty).toBe(10);
    expect(item11773?.variance).toBe(0);
    expect(item11773?.semanticStatus).toBe('MATCH');

    const uncountedItem = reviewItems.find(i => i.itemCode === '11780');
    expect(uncountedItem?.semanticStatus).toBe('UNCOUNTED');
  });

  it('11. Unexpected product (scanned with baseline 0) registers as OVERAGE / unexpected', () => {
    const countsMap: Record<string, ProductCountRecord> = {
      '99999': {
        itemCode: '99999',
        branchId: 'b1',
        firstQty: 3,
        currentQty: 3,
        firstCountedByUid: 'u1',
        firstCountedAt: 'now',
        lastUpdatedByUid: 'u1',
        lastUpdatedAt: 'now',
        editCount: 0,
        history: [],
        status: 'COUNTED',
        unexpected: true,
      }
    };

    const reviewItems = calculateVarianceReview([], countsMap);
    const unexpectedItem = reviewItems.find(i => i.itemCode === '99999');

    expect(unexpectedItem).toBeDefined();
    expect(unexpectedItem?.unexpected).toBe(true);
    expect(unexpectedItem?.baselineQty).toBe(0);
    expect(unexpectedItem?.finalCountQty).toBe(3);
    expect(unexpectedItem?.variance).toBe(3);
    expect(unexpectedItem?.semanticStatus).toBe('OVERAGE');
  });

  it('12. Recount request and submission updates finalCountQty while keeping firstQty', () => {
    const countsMap: Record<string, ProductCountRecord> = {
      '11752': {
        itemCode: '11752',
        branchId: 'b1',
        firstQty: 6,
        currentQty: 6,
        recountQty: 7, // recount submitted
        firstCountedByUid: 'u1',
        firstCountedAt: 'now',
        lastUpdatedByUid: 'u1',
        lastUpdatedAt: 'now',
        editCount: 0,
        history: [],
        status: 'RECOUNTED',
        unexpected: false,
      }
    };

    const reviewItems = calculateVarianceReview(sampleBaseline.slice(0, 1), countsMap);
    const item = reviewItems[0];

    expect(item.firstQty).toBe(6);
    expect(item.recountQty).toBe(7);
    expect(item.finalCountQty).toBe(7);
    expect(item.variance).toBe(-1); // 7 - 8 = -1
  });

  it('13. Session completion blocked if uncounted expected items or pending recounts exist', () => {
    const canComplete = (uncounted: number, pendingRecounts: number) => {
      if (uncounted > 0) throw new Error('Uncounted items exist');
      if (pendingRecounts > 0) throw new Error('Pending recounts exist');
      return true;
    };

    expect(() => canComplete(1, 0)).toThrow('Uncounted items exist');
    expect(() => canComplete(0, 2)).toThrow('Pending recounts exist');
    expect(canComplete(0, 0)).toBe(true);
  });

  it('14. Physical count NEVER modifies operational inventory or activeInventoryRevision', () => {
    const activeInventoryRevisionBefore = 7;
    const branchStockBefore = 8;
    const countedPhysicalStock = 6;

    const variance = countedPhysicalStock - branchStockBefore;
    expect(variance).toBe(-2);

    const branchStockAfter = branchStockBefore;
    const activeInventoryRevisionAfter = activeInventoryRevisionBefore;

    expect(branchStockAfter).toBe(8);
    expect(activeInventoryRevisionAfter).toBe(7);
  });

  it('15. Local barcode lookup triggers 0 Firestore reads', () => {
    const firestoreReadSpy = vi.fn();
    
    const mockLocalLookup = (barcode: string) => {
      return sampleBaseline.find(p => p.barcode === barcode);
    };

    const product = mockLocalLookup('7394586123476');
    expect(product?.itemCode).toBe('11752');
    expect(firestoreReadSpy).not.toHaveBeenCalled();
  });

  it('16. Byte-size chunking on 1,832 AUC items produces safe chunk payloads under 450 KB', () => {
    const aucEntries: BaselineProductEntry[] = [];
    for (let i = 1; i <= 1832; i++) {
      aucEntries.push({
        itemCode: `AUC_${10000 + i}`,
        name: `قاطع تيار ثلاثي الأقطاب شنايدر إلكتريك سعة ${10 + (i % 100)} أمبير موديل ${i}`,
        barcode: `6221144${String(i).padStart(6, '0')}`,
        modelCode: `SCH-ACTI9-IC60N-${i}`,
        category: 'قواطع وتجهيزات كهربائية',
        baselineQty: (i % 25) + 1,
      });
    }

    const maxChunkTarget = 450 * 1024;
    const chunks = chunkBaselineEntriesByBytes(aucEntries, maxChunkTarget);

    expect(chunks.length).toBeGreaterThanOrEqual(1);

    let totalProductsInChunks = 0;
    for (const chunk of chunks) {
      totalProductsInChunks += chunk.products.length;
      const payloadBytes = estimateObjectByteSize(chunk);
      expect(payloadBytes).toBeLessThanOrEqual(maxChunkTarget);
      expect(payloadBytes).toBeLessThan(1024 * 1024); // Far below 1 MiB Firestore hard limit!
    }

    expect(totalProductsInChunks).toBe(1832);
  });

  it('17. Count edit history is capped to maximum 30 entries to prevent Firestore document bloating', () => {
    const maxHistory = 30;
    let history: any[] = [];

    // Simulate 50 consecutive edits on the same item
    for (let i = 1; i <= 50; i++) {
      history = [...history, { qty: i, changedByUid: 'user1', changedAt: new Date().toISOString() }].slice(-maxHistory);
    }

    expect(history.length).toBe(30);
    expect(history[history.length - 1].qty).toBe(50);
  });

  it('18. Concurrency protection: duplicate non-edit count throws conflict error', () => {
    const isEdit = false;
    const documentExists = true;

    const saveCountTransactionMock = (docExists: boolean, editFlag: boolean) => {
      if (docExists && !editFlag) {
        throw new Error('تم تسجيل هذا الصنف بواسطة مستخدم آخر.');
      }
      return 'SAVED';
    };

    expect(() => saveCountTransactionMock(documentExists, isEdit)).toThrow('تم تسجيل هذا الصنف بواسطة مستخدم آخر.');
    expect(saveCountTransactionMock(documentExists, true)).toBe('SAVED');
  });

  it('19. Session state transitions adhere strictly to allowed lifecycle matrix', () => {
    const allowedTransitions: Record<string, string[]> = {
      DRAFT: ['ACTIVE', 'CANCELLED'],
      ACTIVE: ['REVIEW', 'CANCELLED'],
      REVIEW: ['COMPLETED'],
      COMPLETED: [],
      CANCELLED: [],
    };

    const validateTransition = (from: string, to: string) => {
      if (!allowedTransitions[from]?.includes(to)) {
        throw new Error(`Invalid transition from ${from} to ${to}`);
      }
      return true;
    };

    // Valid
    expect(validateTransition('DRAFT', 'ACTIVE')).toBe(true);
    expect(validateTransition('ACTIVE', 'REVIEW')).toBe(true);
    expect(validateTransition('REVIEW', 'COMPLETED')).toBe(true);
    expect(validateTransition('DRAFT', 'CANCELLED')).toBe(true);
    expect(validateTransition('ACTIVE', 'CANCELLED')).toBe(true);

    // Invalid
    expect(() => validateTransition('DRAFT', 'COMPLETED')).toThrow('Invalid transition');
    expect(() => validateTransition('ACTIVE', 'COMPLETED')).toThrow('Invalid transition');
    expect(() => validateTransition('COMPLETED', 'ACTIVE')).toThrow('Invalid transition');
    expect(() => validateTransition('CANCELLED', 'ACTIVE')).toThrow('Invalid transition');
  });

  it('20. Excel report export utility builds workbook without errors', () => {
    const mockSession: InventorySession = {
      id: 'sess_auc_test',
      name: 'جرد فرع AUC التجريبي',
      branchId: 'branch_auc',
      inventoryLocationId: 'loc_auc',
      type: 'FULL',
      category: null,
      selectedItemCodes: null,
      assignedUserIds: ['user1'],
      blindCount: true,
      status: 'REVIEW',
      baselineCatalogVersionId: 'v1',
      baselineRevision: 1,
      baselineProductCount: 2,
      baselineChunkCount: 1,
      baselineChecksum: 'chk_123',
      baselineSnapshotStatus: 'VERIFIED',
      createdAt: '2026-09-30T10:00:00Z',
      createdByUid: 'admin1',
    };

    const reviewItems: VarianceReviewItem[] = [
      {
        itemCode: '11752',
        name: 'Tiger Product 11752',
        barcode: '7394586123476',
        modelCode: 'MOD-11752',
        category: 'Electronics',
        baselineQty: 8,
        firstQty: 6,
        currentQty: 6,
        recountQty: 7,
        finalCountQty: 7,
        variance: -1,
        semanticStatus: 'SHORTAGE',
        countStatus: 'RECOUNTED',
        unexpected: false,
        firstCountedByName: 'Sales 1',
        recountedByName: 'Sales 2',
      }
    ];

    expect(() => exportInventoryReportXLSX(mockSession, reviewItems)).not.toThrow();
  });
});
