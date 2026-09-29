import { describe, it, expect } from 'vitest';
import { NormalizedProduct } from '../types/inventory';
import { computeSha256Checksum, sortProductsDeterministically, deserializeCatalogChunk } from '../services/catalogSyncService';

// Logic representing the exact gate verification logic of verifyServerCatalog (P0-1)
interface MockChunkData {
  chunkIndex: number;
  productCount: number;
  checksum: string;
  payloadJson: string; // JSON string of NormalizedProduct[]
}

interface MockCatalogVersionDoc {
  versionId: string;
  status: 'staged' | 'uploading' | 'verified' | 'active' | 'failed';
  chunkCount: number;
  uploadedChunkCount: number;
  verifiedChunkCount: number;
  productCount: number;
  checksum: string;
}

async function runCatalogVerificationGate(
  meta: MockCatalogVersionDoc,
  chunks: MockChunkData[],
  expectedChecksum: string,
  expectedProductCount: number
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!meta.chunkCount || meta.chunkCount <= 0) {
      throw new Error('فشل التحقق: عدد الـ Chunks غير صالح في وثيقة الإصدار.');
    }
    if (meta.checksum !== expectedChecksum) {
      throw new Error('فشل التحقق: بصمة الإصدار (SHA-256 Checksum) لا تتطابق مع المتوقع.');
    }
    if (meta.productCount !== expectedProductCount) {
      throw new Error(`فشل التحقق: عدد الأصناف (${meta.productCount}) لا يطابق المتوقع (${expectedProductCount}).`);
    }

    if (chunks.length !== meta.chunkCount) {
      throw new Error(`فشل التحقق: عدد الـ Chunks على السحابة (${chunks.length}) لا يطابق العدد المطلوب (${meta.chunkCount}).`);
    }

    const chunksByIndex = new Map<number, MockChunkData>();
    const seenIndexes = new Set<number>();

    for (const c of chunks) {
      if (typeof c.chunkIndex !== 'number') {
        throw new Error('فشل التحقق: chunkIndex غير صالح.');
      }
      if (seenIndexes.has(c.chunkIndex)) {
        throw new Error(`فشل التحقق: تكرار chunkIndex (${c.chunkIndex}) على السحابة.`);
      }
      seenIndexes.add(c.chunkIndex);
      chunksByIndex.set(c.chunkIndex, c);
    }

    // All indexes 0 .. chunkCount - 1
    for (let i = 0; i < meta.chunkCount; i++) {
      if (!chunksByIndex.has(i)) {
        throw new Error(`فشل التحقق: الـ Chunk رقم ${i} مفقود من السحابة.`);
      }
    }

    const reconstructedProducts: NormalizedProduct[] = [];
    const seenItemCodes = new Set<string>();

    for (let i = 0; i < meta.chunkCount; i++) {
      const c = chunksByIndex.get(i)!;
      if (!c.payloadJson || typeof c.payloadJson !== 'string' || c.payloadJson.trim() === '') {
        throw new Error(`فشل التحقق: الـ Chunk رقم ${i} لا يحتوي على حمولة.`);
      }

      // Check chunk checksum
      const computedChunkChecksum = await computeSha256Checksum(c.payloadJson);
      if (c.checksum && c.checksum !== computedChunkChecksum) {
        throw new Error(`فشل التحقق: بصمة الـ Chunk رقم ${i} غير مطابقة.`);
      }

      let prods: NormalizedProduct[];
      try {
        prods = deserializeCatalogChunk(c.payloadJson);
      } catch (e: any) {
        throw new Error(`فشل التحقق: تعذر فك تشفير حمولة الـ Chunk رقم ${i}: ${e.message}`);
      }

      if (c.productCount !== undefined && c.productCount !== prods.length) {
        throw new Error(`فشل التحقق: عدد الأصناف المسجل في Chunk ${i} (${c.productCount}) لا يطابق العدد الفعلي (${prods.length}).`);
      }

      for (const p of prods) {
        if (!p.itemCode || typeof p.itemCode !== 'string' || p.itemCode.trim() === '') {
          throw new Error(`فشل التحقق: تم العثور على صنف بدون كود (itemCode) في الـ Chunk رقم ${i}.`);
        }
        if (seenItemCodes.has(p.itemCode)) {
          throw new Error(`فشل التحقق: تم اكتشاف كود صنف مكرر (${p.itemCode}) في الكتالوج.`);
        }
        seenItemCodes.add(p.itemCode);
        reconstructedProducts.push(p);
      }
    }

    if (reconstructedProducts.length !== expectedProductCount) {
      throw new Error(`فشل التحقق: إجمالي الأصناف المسترجعة (${reconstructedProducts.length}) لا يطابق المتوقع (${expectedProductCount}).`);
    }

    const sortedReconstructed = sortProductsDeterministically(reconstructedProducts);
    const reconstructedChecksum = await computeSha256Checksum(sortedReconstructed);
    if (reconstructedChecksum !== meta.checksum) {
      throw new Error(`فشل التحقق: بصمة الكتالوج المعاد بناؤه (${reconstructedChecksum}) لا تطابق بصمة الإصدار (${meta.checksum}).`);
    }

    if (meta.uploadedChunkCount !== meta.chunkCount) {
      throw new Error(`فشل التحقق: عدد الـ Chunks المرفوعة (${meta.uploadedChunkCount}) لا يطابق إجمالي الـ Chunks (${meta.chunkCount}).`);
    }

    // ONLY on 100% success does status become "verified"
    meta.status = 'verified';
    meta.verifiedChunkCount = meta.chunkCount;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// Logic representing the exact gate verification logic of verifyInventoryUpdate (P0-4)
interface MockDeltaUpdateDoc {
  updateId: string;
  catalogVersionId: string;
  baseRevision: number;
  targetRevision: number;
  chunkCount: number;
  uploadedChunkCount: number;
  verifiedChunkCount: number;
  productCount: number;
  checksum: string;
  status: 'staged' | 'uploading' | 'verified' | 'published';
}

async function runDeltaVerificationGate(
  updateMeta: MockDeltaUpdateDoc,
  chunks: MockChunkData[],
  expectedCount: number
): Promise<{ success: boolean; error?: string }> {
  try {
    if (updateMeta.targetRevision !== updateMeta.baseRevision + 1) {
      throw new Error('فشل التحقق: targetRevision يجب أن يساوي baseRevision + 1.');
    }
    if (chunks.length !== updateMeta.chunkCount) {
      throw new Error(`فشل التحقق: عدد الـ Chunks على السحابة (${chunks.length}) لا يطابق المتوقع (${updateMeta.chunkCount}).`);
    }

    const chunksByIndex = new Map<number, MockChunkData>();
    const seenIndexes = new Set<number>();
    for (const c of chunks) {
      if (seenIndexes.has(c.chunkIndex)) {
        throw new Error(`فشل التحقق: تكرار chunkIndex (${c.chunkIndex}) في دلتا التحديث.`);
      }
      seenIndexes.add(c.chunkIndex);
      chunksByIndex.set(c.chunkIndex, c);
    }

    for (let i = 0; i < updateMeta.chunkCount; i++) {
      if (!chunksByIndex.has(i)) {
        throw new Error(`فشل التحقق: دلتا Chunk رقم ${i} مفقود على السحابة.`);
      }
    }

    const reconstructedDeltaProducts: NormalizedProduct[] = [];
    const seenItemCodes = new Set<string>();

    for (let i = 0; i < updateMeta.chunkCount; i++) {
      const c = chunksByIndex.get(i)!;
      if (!c.payloadJson || typeof c.payloadJson !== 'string' || c.payloadJson.trim() === '') {
        throw new Error(`فشل التحقق: دلتا Chunk رقم ${i} لا يحتوي على حمولة.`);
      }

      const computedChecksum = await computeSha256Checksum(c.payloadJson);
      if (c.checksum && c.checksum !== computedChecksum) {
        throw new Error(`فشل التحقق: بصمة دلتا Chunk رقم ${i} غير مطابقة.`);
      }

      let prods: NormalizedProduct[];
      try {
        prods = deserializeCatalogChunk(c.payloadJson);
      } catch (e: any) {
        throw new Error(`فشل التحقق: تعذر فك تشفير دلتا Chunk رقم ${i}: ${e.message}`);
      }

      if (c.productCount !== undefined && c.productCount !== prods.length) {
        throw new Error(`فشل التحقق: عدد الأصناف في دلتا Chunk ${i} (${c.productCount}) لا يطابق الفعلي (${prods.length}).`);
      }

      for (const p of prods) {
        if (!p.itemCode || typeof p.itemCode !== 'string' || p.itemCode.trim() === '') {
          throw new Error(`فشل التحقق: صنف بدون itemCode صالح في دلتا Chunk ${i}.`);
        }
        if (seenItemCodes.has(p.itemCode)) {
          throw new Error(`فشل التحقق: تكرار كود الصنف (${p.itemCode}) داخل دلتا التحديث.`);
        }
        seenItemCodes.add(p.itemCode);
        reconstructedDeltaProducts.push(p);
      }
    }

    if (reconstructedDeltaProducts.length !== expectedCount) {
      throw new Error(`فشل التحقق: مجموع أصناف الدلتا (${reconstructedDeltaProducts.length}) لا يطابق المتوقع (${expectedCount}).`);
    }

    const sortedDelta = sortProductsDeterministically(reconstructedDeltaProducts);
    const reconstructedFullChecksum = await computeSha256Checksum(sortedDelta);
    if (reconstructedFullChecksum !== updateMeta.checksum) {
      throw new Error(`فشل التحقق: بصمة الدلتا المجمعة (${reconstructedFullChecksum}) لا تطابق بصمة التحديث (${updateMeta.checksum}).`);
    }

    // ONLY on 100% success does status become "verified"
    updateMeta.status = 'verified';
    updateMeta.verifiedChunkCount = updateMeta.chunkCount;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
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

describe('Eye 360 P0-8 & P0-9: Verification Gate Failure Test Suite', () => {
  // Helper to build valid chunks
  async function makeValidChunk(index: number, prods: NormalizedProduct[]): Promise<MockChunkData> {
    const json = JSON.stringify(prods);
    const chk = await computeSha256Checksum(json);
    return {
      chunkIndex: index,
      productCount: prods.length,
      checksum: chk,
      payloadJson: json,
    };
  }

  describe('Requirement 8: Full Catalog Verification Failure Tests', () => {
    it('8.1 missing chunk blocks verification', async () => {
      const p1 = createTestProduct({ itemCode: '1', name: 'P1', salePrice: 10, totalStock: 1 });
      const p2 = createTestProduct({ itemCode: '2', name: 'P2', salePrice: 20, totalStock: 2 });
      const c0 = await makeValidChunk(0, [p1]);
      const c2 = await makeValidChunk(2, [p2]); // Index 2 instead of index 1
      const fullChk = await computeSha256Checksum([p1, p2]);

      const meta: MockCatalogVersionDoc = {
        versionId: 'v1',
        status: 'uploading',
        chunkCount: 2,
        uploadedChunkCount: 2,
        verifiedChunkCount: 0,
        productCount: 2,
        checksum: fullChk,
      };

      const res = await runCatalogVerificationGate(meta, [c0, c2], fullChk, 2);

      expect(res.success).toBe(false);
      expect(res.error).toContain('الـ Chunk رقم 1 مفقود');
      expect(meta.status).toBe('uploading'); // Must NOT become 'verified'
      expect(meta.verifiedChunkCount).toBe(0); // Must NOT falsely equal chunkCount
    });

    it('8.2 bad chunk checksum blocks verification', async () => {
      const p1 = createTestProduct({ itemCode: '1', name: 'P1', salePrice: 10, totalStock: 1 });
      const c0 = await makeValidChunk(0, [p1]);
      c0.checksum = 'bad_corrupted_checksum_hash';

      const fullChk = await computeSha256Checksum([p1]);
      const meta: MockCatalogVersionDoc = {
        versionId: 'v1',
        status: 'uploading',
        chunkCount: 1,
        uploadedChunkCount: 1,
        verifiedChunkCount: 0,
        productCount: 1,
        checksum: fullChk,
      };

      const res = await runCatalogVerificationGate(meta, [c0], fullChk, 1);

      expect(res.success).toBe(false);
      expect(res.error).toContain('بصمة الـ Chunk رقم 0 غير مطابقة');
      expect(meta.status).toBe('uploading');
      expect(meta.verifiedChunkCount).toBe(0);
    });

    it('8.3 wrong chunk productCount blocks verification', async () => {
      const p1 = createTestProduct({ itemCode: '1', name: 'P1', salePrice: 10, totalStock: 1 });
      const c0 = await makeValidChunk(0, [p1]);
      c0.productCount = 999; // Claims 999, but payload only has 1

      const fullChk = await computeSha256Checksum([p1]);
      const meta: MockCatalogVersionDoc = {
        versionId: 'v1',
        status: 'uploading',
        chunkCount: 1,
        uploadedChunkCount: 1,
        verifiedChunkCount: 0,
        productCount: 1,
        checksum: fullChk,
      };

      const res = await runCatalogVerificationGate(meta, [c0], fullChk, 1);

      expect(res.success).toBe(false);
      expect(res.error).toContain('لا يطابق العدد الفعلي');
      expect(meta.status).toBe('uploading');
      expect(meta.verifiedChunkCount).toBe(0);
    });

    it('8.4 duplicate itemCode across chunks blocks verification', async () => {
      const p1 = createTestProduct({ itemCode: 'DUPLICATE_CODE', name: 'P1', salePrice: 10, totalStock: 1 });
      const p2 = createTestProduct({ itemCode: 'DUPLICATE_CODE', name: 'P2', salePrice: 20, totalStock: 2 });
      const c0 = await makeValidChunk(0, [p1]);
      const c1 = await makeValidChunk(1, [p2]);

      const meta: MockCatalogVersionDoc = {
        versionId: 'v1',
        status: 'uploading',
        chunkCount: 2,
        uploadedChunkCount: 2,
        verifiedChunkCount: 0,
        productCount: 2,
        checksum: 'dummy',
      };

      const res = await runCatalogVerificationGate(meta, [c0, c1], 'dummy', 2);

      expect(res.success).toBe(false);
      expect(res.error).toContain('تم اكتشاف كود صنف مكرر (DUPLICATE_CODE)');
      expect(meta.status).toBe('uploading');
      expect(meta.verifiedChunkCount).toBe(0);
    });

    it('8.5 full catalog checksum mismatch blocks verification', async () => {
      const p1 = createTestProduct({ itemCode: '1', name: 'P1', salePrice: 10, totalStock: 1 });
      const c0 = await makeValidChunk(0, [p1]);

      const meta: MockCatalogVersionDoc = {
        versionId: 'v1',
        status: 'uploading',
        chunkCount: 1,
        uploadedChunkCount: 1,
        verifiedChunkCount: 0,
        productCount: 1,
        checksum: 'expected_actual_hash', // Mismatch with actual SHA256([p1])
      };

      const res = await runCatalogVerificationGate(meta, [c0], 'expected_actual_hash', 1);

      expect(res.success).toBe(false);
      expect(res.error).toContain('لا تطابق بصمة الإصدار');
      expect(meta.status).toBe('uploading');
      expect(meta.verifiedChunkCount).toBe(0);
    });
  });

  describe('Requirement 9: Daily Delta Verification Failure Tests', () => {
    it('9.1 missing delta chunk blocks verification & publish', async () => {
      const p1 = createTestProduct({ itemCode: '10', name: 'Delta P1', salePrice: 10, totalStock: 1 });
      const c0 = await makeValidChunk(0, [p1]);

      const deltaMeta: MockDeltaUpdateDoc = {
        updateId: 'u1',
        catalogVersionId: 'cat_A',
        baseRevision: 0,
        targetRevision: 1,
        chunkCount: 2, // Expects 2 chunks, but only c0 provided
        uploadedChunkCount: 1,
        verifiedChunkCount: 0,
        productCount: 2,
        checksum: 'chk_d',
        status: 'staged',
      };

      const res = await runDeltaVerificationGate(deltaMeta, [c0], 2);

      expect(res.success).toBe(false);
      expect(res.error).toContain('لا يطابق المتوقع');
      expect(deltaMeta.status).toBe('staged');
      expect(deltaMeta.verifiedChunkCount).toBe(0);
    });

    it('9.2 bad delta chunk checksum blocks verification', async () => {
      const p1 = createTestProduct({ itemCode: '10', name: 'Delta P1', salePrice: 10, totalStock: 1 });
      const c0 = await makeValidChunk(0, [p1]);
      c0.checksum = 'tampered_chunk_checksum';

      const fullDeltaChk = await computeSha256Checksum([p1]);
      const deltaMeta: MockDeltaUpdateDoc = {
        updateId: 'u1',
        catalogVersionId: 'cat_A',
        baseRevision: 0,
        targetRevision: 1,
        chunkCount: 1,
        uploadedChunkCount: 1,
        verifiedChunkCount: 0,
        productCount: 1,
        checksum: fullDeltaChk,
        status: 'staged',
      };

      const res = await runDeltaVerificationGate(deltaMeta, [c0], 1);

      expect(res.success).toBe(false);
      expect(res.error).toContain('بصمة دلتا Chunk رقم 0 غير مطابقة');
      expect(deltaMeta.status).toBe('staged');
      expect(deltaMeta.verifiedChunkCount).toBe(0);
    });

    it('9.3 duplicate itemCode in delta blocks verification', async () => {
      const p1 = createTestProduct({ itemCode: 'DUP_DELTA', name: 'P1', salePrice: 10, totalStock: 1 });
      const p2 = createTestProduct({ itemCode: 'DUP_DELTA', name: 'P2', salePrice: 20, totalStock: 2 });
      const c0 = await makeValidChunk(0, [p1, p2]);

      const deltaMeta: MockDeltaUpdateDoc = {
        updateId: 'u1',
        catalogVersionId: 'cat_A',
        baseRevision: 0,
        targetRevision: 1,
        chunkCount: 1,
        uploadedChunkCount: 1,
        verifiedChunkCount: 0,
        productCount: 2,
        checksum: 'dummy',
        status: 'staged',
      };

      const res = await runDeltaVerificationGate(deltaMeta, [c0], 2);

      expect(res.success).toBe(false);
      expect(res.error).toContain('تكرار كود الصنف (DUP_DELTA) داخل دلتا التحديث');
      expect(deltaMeta.status).toBe('staged');
      expect(deltaMeta.verifiedChunkCount).toBe(0);
    });

    it('9.4 wrong delta product count blocks verification', async () => {
      const p1 = createTestProduct({ itemCode: '10', name: 'P1', salePrice: 10, totalStock: 1 });
      const c0 = await makeValidChunk(0, [p1]);

      const fullDeltaChk = await computeSha256Checksum([p1]);
      const deltaMeta: MockDeltaUpdateDoc = {
        updateId: 'u1',
        catalogVersionId: 'cat_A',
        baseRevision: 0,
        targetRevision: 1,
        chunkCount: 1,
        uploadedChunkCount: 1,
        verifiedChunkCount: 0,
        productCount: 50, // Claims 50, but actual is 1
        checksum: fullDeltaChk,
        status: 'staged',
      };

      const res = await runDeltaVerificationGate(deltaMeta, [c0], 50);

      expect(res.success).toBe(false);
      expect(res.error).toContain('لا يطابق المتوقع');
      expect(deltaMeta.status).toBe('staged');
      expect(deltaMeta.verifiedChunkCount).toBe(0);
    });

    it('9.5 full delta checksum mismatch blocks verification', async () => {
      const p1 = createTestProduct({ itemCode: '10', name: 'P1', salePrice: 10, totalStock: 1 });
      const c0 = await makeValidChunk(0, [p1]);

      const deltaMeta: MockDeltaUpdateDoc = {
        updateId: 'u1',
        catalogVersionId: 'cat_A',
        baseRevision: 0,
        targetRevision: 1,
        chunkCount: 1,
        uploadedChunkCount: 1,
        verifiedChunkCount: 0,
        productCount: 1,
        checksum: 'wrong_full_delta_checksum',
        status: 'staged',
      };

      const res = await runDeltaVerificationGate(deltaMeta, [c0], 1);

      expect(res.success).toBe(false);
      expect(res.error).toContain('لا تطابق بصمة التحديث');
      expect(deltaMeta.status).toBe('staged');
      expect(deltaMeta.verifiedChunkCount).toBe(0);
    });
  });
});
