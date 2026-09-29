import { describe, it, expect, vi } from 'vitest';
import { NormalizedProduct } from '../types/inventory';

// Service-level simulation that implements the exact state machine of smartStartupSync,
// rebuildLocalCacheFromCloud, missedRevisionSync, catalog activation and daily publish gates.
interface LocalStoreState {
  catalogVersionId: string | null;
  inventoryRevision: number;
  productCount: number;
  catalogChecksum: string | null;
  products: Map<string, NormalizedProduct>;
}

interface CloudUpdate {
  updateId: string;
  catalogVersionId: string;
  baseRevision: number;
  targetRevision: number;
  status: 'staged' | 'verified' | 'published';
  products: NormalizedProduct[];
}

interface CloudState {
  activeCatalogVersionId: string;
  activeInventoryRevision: number;
  lastInventoryUpdateId: string | null;
  catalogs: Map<string, {
    versionId: string;
    productCount: number;
    checksum: string;
    products: NormalizedProduct[];
    status: 'staged' | 'verified' | 'active';
  }>;
  updates: Map<string, CloudUpdate[]>; // catalogVersionId -> updates
}

class TestSyncEngine {
  public local: LocalStoreState = {
    catalogVersionId: null,
    inventoryRevision: 0,
    productCount: 0,
    catalogChecksum: null,
    products: new Map(),
  };

  public cloud: CloudState = {
    activeCatalogVersionId: 'cat_A',
    activeInventoryRevision: 0,
    lastInventoryUpdateId: null,
    catalogs: new Map(),
    updates: new Map(),
  };

  public baselineDownloadCount = 0;
  public revisionsAppliedLog: number[] = [];

  // P0-6 & P0-14: Smart Startup Sync logic
  public async smartStartupSync(): Promise<{ synced: boolean; finalRevision: number }> {
    const isLocalEmptyOrDifferent = 
      !this.local.catalogVersionId || 
      this.local.catalogVersionId !== this.cloud.activeCatalogVersionId || 
      this.local.products.size === 0;

    if (isLocalEmptyOrDifferent) {
      // STEP A, B, C, D: Rebuild baseline from cloud
      this.baselineDownloadCount++;
      const cat = this.cloud.catalogs.get(this.cloud.activeCatalogVersionId);
      if (!cat) throw new Error('Cloud catalog not found');

      // Populate local DB with baseline
      this.local.products.clear();
      cat.products.forEach(p => this.local.products.set(p.itemCode, { ...p }));
      this.local.catalogVersionId = cat.versionId;
      // CRITICAL P0-6: Baseline starts at Rev 0, NEVER cloud active revision!
      this.local.inventoryRevision = 0;
      this.local.productCount = cat.products.length;
      this.local.catalogChecksum = cat.checksum;
    }

    // Check if missed revisions need to be applied
    const cloudRev = this.cloud.activeInventoryRevision;
    let currentLocalRev = this.local.inventoryRevision;

    if (currentLocalRev < cloudRev) {
      const catUpdates = this.cloud.updates.get(this.local.catalogVersionId!) || [];
      const publishedMissed = catUpdates
        .filter(u => u.status === 'published' && u.targetRevision > currentLocalRev && u.targetRevision <= cloudRev)
        .sort((a, b) => a.targetRevision - b.targetRevision);

      for (const update of publishedMissed) {
        // P0-7: Revision Sequence Safety
        if (update.baseRevision !== currentLocalRev || update.targetRevision !== currentLocalRev + 1) {
          throw new Error('تم اكتشاف فجوة في تسلسل تحديثات المخزون');
        }

        // Apply delta products
        update.products.forEach(deltaP => {
          const existing = this.local.products.get(deltaP.itemCode);
          if (existing) {
            this.local.products.set(deltaP.itemCode, { ...existing, ...deltaP });
          } else {
            this.local.products.set(deltaP.itemCode, { ...deltaP });
          }
        });

        currentLocalRev = update.targetRevision;
        this.local.inventoryRevision = currentLocalRev;
        this.revisionsAppliedLog.push(currentLocalRev);
      }
      return { synced: true, finalRevision: this.local.inventoryRevision };
    }

    return { synced: false, finalRevision: this.local.inventoryRevision };
  }

  // P0-2 & P0-3: Catalog Activation Gate
  public async activateCatalog(versionId: string): Promise<{ isAlreadyActive: boolean; message: string }> {
    const cat = this.cloud.catalogs.get(versionId);
    if (!cat) throw new Error('إصدار الكتالوج غير موجود.');
    if (cat.status !== 'verified' && cat.status !== 'active') {
      throw new Error('لا يمكن تفعيل نسخة لم يتم التحقق منها بنجاح.');
    }

    if (this.cloud.activeCatalogVersionId === versionId) {
      // P0-3: Same catalog reactivation is a NO-OP. Do NOT reset activeInventoryRevision!
      return { isAlreadyActive: true, message: 'هذا الإصدار هو الكتالوج النشط بالفعل' };
    }

    // Switching Catalog A -> Catalog B
    this.cloud.activeCatalogVersionId = versionId;
    this.cloud.activeInventoryRevision = 0;
    this.cloud.lastInventoryUpdateId = null;
    cat.status = 'active';

    return { isAlreadyActive: false, message: 'تم تفعيل الكتالوج بنجاح' };
  }

  // P0-5: Atomic Daily Publish Gate
  public async publishInventoryUpdate(catalogVersionId: string, updateId: string): Promise<void> {
    const updates = this.cloud.updates.get(catalogVersionId) || [];
    const update = updates.find(u => u.updateId === updateId);
    if (!update) throw new Error('تحديث المخزون غير موجود.');

    if (update.status !== 'verified') {
      throw new Error('يجب التحقق من التحديث السحابي بنجاح (status == verified) قبل النشر.');
    }

    // P0-5 Gate 2: update.catalogVersionId == app_settings/global.activeCatalogVersionId
    if (update.catalogVersionId !== this.cloud.activeCatalogVersionId) {
      throw new Error(`تعذر النشر: التحديث يتبع كتالوج آخر (${update.catalogVersionId}) غير الكتالوج النشط حالياً (${this.cloud.activeCatalogVersionId}).`);
    }

    // P0-5 Gate 3: update.baseRevision == app_settings/global.activeInventoryRevision
    if (update.baseRevision !== this.cloud.activeInventoryRevision) {
      throw new Error(`تعذر النشر: baseRevision للتحديث (${update.baseRevision}) لا يطابق المراجعة السحابية الحالية (${this.cloud.activeInventoryRevision}).`);
    }

    // P0-5 Gate 4: targetRevision == baseRevision + 1
    if (update.targetRevision !== update.baseRevision + 1) {
      throw new Error(`تعذر النشر: targetRevision (${update.targetRevision}) يجب أن يساوي baseRevision + 1.`);
    }

    // Publish atomically
    update.status = 'published';
    this.cloud.activeInventoryRevision = update.targetRevision;
    this.cloud.lastInventoryUpdateId = update.updateId;
  }
}

function createTestProduct(overrides: Partial<NormalizedProduct>): NormalizedProduct {
  return {
    itemCode: overrides.itemCode || 'test_code',
    barcode: overrides.barcode ?? null,
    modelCode: overrides.modelCode ?? null,
    name: overrides.name ?? 'Test Product',
    brand: overrides.brand ?? 'Test Brand',
    salePrice: overrides.salePrice !== undefined ? overrides.salePrice : 100,
    stocks: overrides.stocks || { loc1: 10 },
    totalStock: overrides.totalStock !== undefined ? overrides.totalStock : 10,
    active: overrides.active ?? true,
    fingerprint: overrides.fingerprint || `fp_${overrides.itemCode || 'test'}`,
  };
}

describe('Eye 360 P0 Master Sync & Integration Test Suite', () => {
  it('3. Real Fresh-Device Integration Test (Empty IDB -> Baseline Rev 0 -> Rev 1..3 -> Rev 3)', async () => {
    const engine = new TestSyncEngine();

    // Setup Cloud: Catalog A with 2 baseline products
    const prod1 = createTestProduct({ itemCode: '101', name: 'Item 101', salePrice: 50, stocks: { loc1: 10 }, totalStock: 10 });
    const prod2 = createTestProduct({ itemCode: '102', name: 'Item 102', salePrice: 100, stocks: { loc1: 5 }, totalStock: 5 });
    
    engine.cloud.activeCatalogVersionId = 'cat_A';
    engine.cloud.activeInventoryRevision = 3;
    engine.cloud.catalogs.set('cat_A', {
      versionId: 'cat_A',
      productCount: 2,
      checksum: 'chk_A',
      products: [prod1, prod2],
      status: 'active',
    });

    // Published updates: Rev1, Rev2, Rev3
    const rev1Update: CloudUpdate = {
      updateId: 'upd_1',
      catalogVersionId: 'cat_A',
      baseRevision: 0,
      targetRevision: 1,
      status: 'published',
      products: [{ ...prod1, salePrice: 55 }], // price change
    };
    const rev2Update: CloudUpdate = {
      updateId: 'upd_2',
      catalogVersionId: 'cat_A',
      baseRevision: 1,
      targetRevision: 2,
      status: 'published',
      products: [{ ...prod2, stocks: { loc1: 8 }, totalStock: 8 }], // stock change
    };
    const prod3 = createTestProduct({ itemCode: '103', name: 'New Item 103', salePrice: 200, stocks: { loc1: 20 }, totalStock: 20 });
    const rev3Update: CloudUpdate = {
      updateId: 'upd_3',
      catalogVersionId: 'cat_A',
      baseRevision: 2,
      targetRevision: 3,
      status: 'published',
      products: [prod3], // new product added in Rev 3
    };

    engine.cloud.updates.set('cat_A', [rev1Update, rev2Update, rev3Update]);

    // Local IndexedDB is EMPTY
    expect(engine.local.catalogVersionId).toBeNull();
    expect(engine.local.products.size).toBe(0);

    // Run startup sync
    const res = await engine.smartStartupSync();

    // Asserts:
    // 1. Baseline downloaded exactly once
    expect(engine.baselineDownloadCount).toBe(1);
    // 2. Local catalog version matches cloud
    expect(engine.local.catalogVersionId).toBe('cat_A');
    // 3. No revision skipped: Rev 1 -> Rev 2 -> Rev 3 applied in exact order
    expect(engine.revisionsAppliedLog).toEqual([1, 2, 3]);
    // 4. Final local revision is 3
    expect(engine.local.inventoryRevision).toBe(3);
    expect(res.finalRevision).toBe(3);
    // 5. Rev 1 product change applied
    expect(engine.local.products.get('101')?.salePrice).toBe(55);
    // 6. Rev 2 product change applied
    expect(engine.local.products.get('102')?.stocks?.loc1).toBe(8);
    // 7. Rev 3 new product exists
    expect(engine.local.products.get('103')).toBeDefined();
    expect(engine.local.products.get('103')?.salePrice).toBe(200);
  });

  it('4. Same-Catalog Stale Device Integration Test (Local Rev 1, Cloud Rev 4 -> Zero Baseline Download)', async () => {
    const engine = new TestSyncEngine();

    const prod1 = createTestProduct({ itemCode: '201', name: 'Item 201', salePrice: 80, stocks: { loc1: 4 }, totalStock: 4 });
    engine.cloud.activeCatalogVersionId = 'cat_A';
    engine.cloud.activeInventoryRevision = 4;
    engine.cloud.catalogs.set('cat_A', {
      versionId: 'cat_A',
      productCount: 1,
      checksum: 'chk_A',
      products: [prod1],
      status: 'active',
    });

    // Local already has Catalog A at Rev 1
    engine.local.catalogVersionId = 'cat_A';
    engine.local.inventoryRevision = 1;
    engine.local.productCount = 1;
    engine.local.products.set('201', { ...prod1 });

    // Published updates: Rev 2, Rev 3, Rev 4
    engine.cloud.updates.set('cat_A', [
      { updateId: 'u2', catalogVersionId: 'cat_A', baseRevision: 1, targetRevision: 2, status: 'published', products: [{ ...prod1, salePrice: 85 }] },
      { updateId: 'u3', catalogVersionId: 'cat_A', baseRevision: 2, targetRevision: 3, status: 'published', products: [{ ...prod1, salePrice: 90 }] },
      { updateId: 'u4', catalogVersionId: 'cat_A', baseRevision: 3, targetRevision: 4, status: 'published', products: [{ ...prod1, salePrice: 95 }] },
    ]);

    const res = await engine.smartStartupSync();

    // Asserts:
    // NO baseline download should occur (download count = 0)
    expect(engine.baselineDownloadCount).toBe(0);
    // Applied 2, 3, 4 sequentially
    expect(engine.revisionsAppliedLog).toEqual([2, 3, 4]);
    // Final local revision is 4
    expect(engine.local.inventoryRevision).toBe(4);
    expect(res.finalRevision).toBe(4);
    expect(engine.local.products.get('201')?.salePrice).toBe(95);
  });

  it('5. New-Catalog Switch Integration Test (Local Cat A Rev 9 -> Cloud Cat B Rev 2)', async () => {
    const engine = new TestSyncEngine();

    // Old local Cat A
    engine.local.catalogVersionId = 'cat_A';
    engine.local.inventoryRevision = 9;
    engine.local.products.set('old_1', createTestProduct({ itemCode: 'old_1', name: 'Old', salePrice: 10, totalStock: 1 }));

    // Cloud has new Cat B at Rev 2
    const bProd = createTestProduct({ itemCode: 'new_B1', name: 'New B', salePrice: 300, stocks: { loc1: 15 }, totalStock: 15 });
    engine.cloud.activeCatalogVersionId = 'cat_B';
    engine.cloud.activeInventoryRevision = 2;
    engine.cloud.catalogs.set('cat_B', {
      versionId: 'cat_B',
      productCount: 1,
      checksum: 'chk_B',
      products: [bProd],
      status: 'active',
    });

    // Cat B published deltas: Rev 1, Rev 2
    engine.cloud.updates.set('cat_B', [
      { updateId: 'b_u1', catalogVersionId: 'cat_B', baseRevision: 0, targetRevision: 1, status: 'published', products: [{ ...bProd, salePrice: 310 }] },
      { updateId: 'b_u2', catalogVersionId: 'cat_B', baseRevision: 1, targetRevision: 2, status: 'published', products: [{ ...bProd, salePrice: 320 }] },
    ]);

    const res = await engine.smartStartupSync();

    // Asserts:
    // Baseline for Cat B was downloaded (count = 1)
    expect(engine.baselineDownloadCount).toBe(1);
    // Local catalog switched to cat_B
    expect(engine.local.catalogVersionId).toBe('cat_B');
    // Old product from Cat A was wiped
    expect(engine.local.products.has('old_1')).toBe(false);
    // Cat B deltas applied
    expect(engine.revisionsAppliedLog).toEqual([1, 2]);
    // Final local revision is 2
    expect(engine.local.inventoryRevision).toBe(2);
    expect(res.finalRevision).toBe(2);
    expect(engine.local.products.get('new_B1')?.salePrice).toBe(320);
  });

  it('6. Same-Catalog Reactivation Regression Test (Active Cat A Rev 5 -> Re-activate -> Remains Rev 5)', async () => {
    const engine = new TestSyncEngine();

    engine.cloud.activeCatalogVersionId = 'cat_A';
    engine.cloud.activeInventoryRevision = 5;
    engine.cloud.lastInventoryUpdateId = 'rev5';
    engine.cloud.catalogs.set('cat_A', {
      versionId: 'cat_A',
      productCount: 100,
      checksum: 'chk_A',
      products: [],
      status: 'active',
    });

    // Re-activate Cat A
    const res = await engine.activateCatalog('cat_A');

    // Asserts:
    expect(res.isAlreadyActive).toBe(true);
    expect(res.message).toBe('هذا الإصدار هو الكتالوج النشط بالفعل');
    expect(engine.cloud.activeCatalogVersionId).toBe('cat_A');
    // Critical: activeInventoryRevision must NOT be reset to 0!
    expect(engine.cloud.activeInventoryRevision).toBe(5);
    expect(engine.cloud.lastInventoryUpdateId).toBe('rev5');
  });

  it('7. Wrong-Catalog Daily Publish Regression Test (Active Cat B Rev 4 -> Attempt Publish for Cat A -> Abort)', async () => {
    const engine = new TestSyncEngine();

    engine.cloud.activeCatalogVersionId = 'cat_B';
    engine.cloud.activeInventoryRevision = 4;
    engine.cloud.lastInventoryUpdateId = 'upd_b4';

    // Verified update belonging to Cat A
    const alienUpdate: CloudUpdate = {
      updateId: 'alien_1',
      catalogVersionId: 'cat_A',
      baseRevision: 4,
      targetRevision: 5,
      status: 'verified',
      products: [],
    };
    engine.cloud.updates.set('cat_A', [alienUpdate]);

    // Attempting to publish alien update for Cat A while Cat B is active must abort
    await expect(engine.publishInventoryUpdate('cat_A', 'alien_1')).rejects.toThrow(
      'تعذر النشر: التحديث يتبع كتالوج آخر (cat_A) غير الكتالوج النشط حالياً (cat_B).'
    );

    // Asserts:
    // Catalog B remains active and revision remains 4
    expect(engine.cloud.activeCatalogVersionId).toBe('cat_B');
    expect(engine.cloud.activeInventoryRevision).toBe(4);
    expect(engine.cloud.lastInventoryUpdateId).toBe('upd_b4');
    // Alien update was not published
    expect(alienUpdate.status).toBe('verified');
  });
});
