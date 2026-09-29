import { doc, getDoc, setDoc, runTransaction, serverTimestamp, collection, getDocs, query, where } from 'firebase/firestore';
import { db, auth } from './firebaseClient';
import { NormalizedProduct, ImportParseResult } from '../types/inventory';
import { saveCatalogToIndexedDB } from './indexedDbService';

export interface CatalogVersionMeta {
  versionId: string;
  status: 'staged' | 'uploading' | 'verified' | 'active' | 'failed' | 'archived';
  createdAt: any;
  createdByUid: string;
  sourceFileName: string;
  sourceFileSize: number;
  productCount: number;
  locationCount: number;
  locationIds: string[];
  chunkCount: number;
  uploadedChunkCount: number;
  verifiedChunkCount: number;
  totalOperationalUnits: number;
  productsWithStock: number;
  zeroStockProducts: number;
  aucPositiveProducts: number;
  aucTotalUnits: number;
  checksum: string;
  schemaVersion: string;
  parserVersion: string;
}

export interface ChunkPayload {
  chunkIndex: number;
  productCount: number;
  checksum: string;
  byteSize: number;
  payloadJson: NormalizedProduct[];
}

export interface ResumableInspectionResult {
  resumableVersionId: string;
  status: string;
  expectedChunkCount: number;
  uploadedChunkCount: number;
  existingChunksMap: Map<number, any>;
  missingOrInvalidChunkIndices: number[];
}

// SHA-256 checksum generator using Web Crypto API
export async function computeSha256Checksum(data: any): Promise<string> {
  const str = typeof data === 'string' ? data : JSON.stringify(data);
  const msgBuffer = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Deterministic sorting of products by itemCode
export function sortProductsDeterministically(products: NormalizedProduct[]): NormalizedProduct[] {
  return [...products].sort((a, b) => a.itemCode.localeCompare(b.itemCode, 'en', { numeric: true }));
}

// UTF-8 byte-size calculation
export function getUtf8ByteSize(str: string): number {
  return new TextEncoder().encode(str).length;
}

// Shared chunk deserializer for uploader and integrity checker
export function deserializeCatalogChunk(payloadJson: any): NormalizedProduct[] {
  if (!payloadJson) return [];
  if (Array.isArray(payloadJson)) {
    return payloadJson;
  }
  if (typeof payloadJson === 'string') {
    try {
      const parsed = JSON.parse(payloadJson);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && Array.isArray(parsed.products)) return parsed.products;
    } catch (e) {
      // expected parse failure for malformed strings
    }
  }
  if (typeof payloadJson === 'object') {
    if (Array.isArray((payloadJson as any).products)) {
      return (payloadJson as any).products;
    }
  }
  return [];
}

// Chunk products ensuring each chunk payload is between 400KB and 600KB UTF-8 bytes
export async function chunkProductsByByteSize(products: NormalizedProduct[]): Promise<ChunkPayload[]> {
  const sorted = sortProductsDeterministically(products);
  const TARGET_MIN_BYTES = 400 * 1024;
  const TARGET_MAX_BYTES = 600 * 1024;

  const chunks: ChunkPayload[] = [];
  let currentBatch: NormalizedProduct[] = [];
  let currentBatchBytes = 2; // for brackets []

  for (const product of sorted) {
    const productStr = JSON.stringify(product);
    const productBytes = getUtf8ByteSize(productStr) + 1; // comma separator

    if (currentBatch.length > 0 && (currentBatchBytes + productBytes > TARGET_MAX_BYTES || (currentBatchBytes >= TARGET_MIN_BYTES && currentBatch.length >= 50))) {
      const payloadJson = [...currentBatch];
      const jsonStr = JSON.stringify(payloadJson);
      const checksum = await computeSha256Checksum(jsonStr);
      chunks.push({
        chunkIndex: chunks.length,
        productCount: payloadJson.length,
        checksum,
        byteSize: getUtf8ByteSize(jsonStr),
        payloadJson,
      });
      currentBatch = [product];
      currentBatchBytes = getUtf8ByteSize(productStr) + 2;
    } else {
      currentBatch.push(product);
      currentBatchBytes += productBytes;
    }
  }

  if (currentBatch.length > 0) {
    const payloadJson = [...currentBatch];
    const jsonStr = JSON.stringify(payloadJson);
    const checksum = await computeSha256Checksum(jsonStr);
    chunks.push({
      chunkIndex: chunks.length,
      productCount: payloadJson.length,
      checksum,
      byteSize: getUtf8ByteSize(jsonStr),
      payloadJson,
    });
  }

  return chunks;
}

export async function recordAuditLog(action: string, versionId: string, details: any = {}) {
  try {
    const uid = auth.currentUser?.uid || 'anonymous';
    const logId = `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const auditRef = doc(db, 'audit_logs', logId);
    await setDoc(auditRef, {
      action,
      entityType: 'catalog_version',
      versionId,
      uid,
      timestamp: serverTimestamp(),
      details,
    });
  } catch (err) {
    console.warn('Audit log write warning:', err);
  }
}

// Check duplicate across ALL catalog versions
export async function checkExistingCatalogVersionsByChecksum(checksum: string): Promise<any[]> {
  try {
    const versionsRef = collection(db, 'catalog_versions');
    const q = query(versionsRef, where('checksum', '==', checksum));
    const snap = await getDocs(q);
    const existing: any[] = [];
    snap.forEach(d => {
      existing.push({ id: d.id, ...d.data() });
    });
    return existing;
  } catch (err) {
    console.warn('Duplicate version check warning:', err);
    return [];
  }
}

// Inspect resumable catalog version if exists (staged, uploading, failed)
export async function inspectResumableCatalogVersion(catalogChecksum: string): Promise<ResumableInspectionResult | null> {
  const duplicates = await checkExistingCatalogVersionsByChecksum(catalogChecksum);
  const incomplete = duplicates.find(d => ['staged', 'uploading', 'failed'].includes(d.status));
  if (!incomplete) return null;

  const versionId = incomplete.id;
  const chunksColRef = collection(db, 'catalog_versions', versionId, 'chunks');
  const chunksSnap = await getDocs(chunksColRef);
  const existingChunksMap = new Map<number, any>();

  chunksSnap.forEach(d => {
    const data = d.data();
    if (typeof data.chunkIndex === 'number') {
      existingChunksMap.set(data.chunkIndex, data);
    }
  });

  return {
    resumableVersionId: versionId,
    status: incomplete.status,
    expectedChunkCount: incomplete.chunkCount || 17,
    uploadedChunkCount: existingChunksMap.size,
    existingChunksMap,
    missingOrInvalidChunkIndices: [],
  };
}

export async function stageAndUploadCatalog(
  parseResult: ImportParseResult,
  file: File,
  onProgress?: (progress: {
    stage: string;
    uploadedChunks: number;
    totalChunks: number;
    uploadedProducts: number;
    totalProducts: number;
    bytesUploaded: number;
    currentChunk: number;
    retryCount: number;
  }) => void,
  forceOverwrite: boolean = false
): Promise<{ versionId: string; catalogChecksum: string }> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('عملية الرفع مرفوضة: يجب تسجيل الدخول كمسؤول (Admin) لرفع الكتالوج.');
  }
  const uid = currentUser.uid;

  const sortedProducts = sortProductsDeterministically(parseResult.products);
  const catalogChecksum = await computeSha256Checksum(sortedProducts);

  if (parseResult.products.length === 0 || parseResult.locations.length === 0) {
    throw new Error('خطأ: الكتالوج فارغ أو لا يحتوي على مواقع مخزون صالحة.');
  }

  const chunks = await chunkProductsByByteSize(sortedProducts);

  // Check for resumable existing uploading/staged/failed version with matching checksum
  let resumableInfo = await inspectResumableCatalogVersion(catalogChecksum);
  let versionId: string;

  if (resumableInfo && !forceOverwrite) {
    versionId = resumableInfo.resumableVersionId;
  } else if (!forceOverwrite) {
    const duplicates = await checkExistingCatalogVersionsByChecksum(catalogChecksum);
    // If verified or active exists, treat as fatal duplicate unless forceOverwrite
    const verifiedOrActive = duplicates.find(d => ['verified', 'active'].includes(d.status));
    if (verifiedOrActive) {
      throw new Error(`WARNING_DUPLICATE_CATALOG: تم العثور على إصدارات سابقة معتمدة مطابقة تماماً لهذا الكتالوج: [${verifiedOrActive.versionId} (${verifiedOrActive.status})].`);
    }
  }

  if (resumableInfo && !forceOverwrite) {
    versionId = resumableInfo.resumableVersionId;
  } else {
    versionId = `v_${Date.now()}_${catalogChecksum.substring(0, 8)}`;
    const meta: CatalogVersionMeta = {
      versionId,
      status: 'uploading',
      createdAt: serverTimestamp(),
      createdByUid: uid,
      sourceFileName: file.name,
      sourceFileSize: file.size,
      productCount: sortedProducts.length,
      locationCount: parseResult.locations.length,
      locationIds: parseResult.locations.map(l => l.id),
      chunkCount: chunks.length,
      uploadedChunkCount: resumableInfo ? resumableInfo.uploadedChunkCount : 0,
      verifiedChunkCount: 0,
      totalOperationalUnits: parseResult.stats.totalOperationalUnits,
      productsWithStock: parseResult.stats.productsWithStock,
      zeroStockProducts: parseResult.stats.productsWithoutStock,
      aucPositiveProducts: parseResult.stats.aucPositiveCount || 0,
      aucTotalUnits: parseResult.stats.aucTotalUnits || 0,
      checksum: catalogChecksum,
      schemaVersion: '2.0',
      parserVersion: 'eye360-v2-sha256',
    };

    const versionRef = doc(db, 'catalog_versions', versionId);
    await setDoc(versionRef, meta, { merge: true });
    await recordAuditLog('catalog_upload_started', versionId, { productCount: meta.productCount, chunkCount: meta.chunkCount, fileName: file.name });
  }

  const versionRef = doc(db, 'catalog_versions', versionId);
  await setDoc(versionRef, { status: 'uploading' }, { merge: true });

  let uploadedProductsCount = 0;
  let bytesUploadedCount = 0;
  let retryCount = 0;
  let successfullyUploadedOrSkippedCount = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkId = `chunk_${String(chunk.chunkIndex).padStart(3, '0')}`;
    const chunkRef = doc(db, 'catalog_versions', versionId, 'chunks', chunkId);

    // Check if remote chunk exists and matches expected checksum & product count
    let skipChunk = false;
    if (resumableInfo && !forceOverwrite) {
      const existingRemote = resumableInfo.existingChunksMap.get(chunk.chunkIndex);
      if (existingRemote && existingRemote.checksum === chunk.checksum && existingRemote.productCount === chunk.productCount) {
        skipChunk = true;
      }
    }

    if (skipChunk) {
      successfullyUploadedOrSkippedCount++;
      uploadedProductsCount += chunk.productCount;
      bytesUploadedCount += chunk.byteSize;
    } else {
      let success = false;
      let attempts = 0;
      while (!success && attempts < 3) {
        try {
          attempts++;
          await setDoc(chunkRef, {
            chunkIndex: chunk.chunkIndex,
            productCount: chunk.productCount,
            checksum: chunk.checksum,
            byteSize: chunk.byteSize,
            payloadJson: chunk.payloadJson,
          });
          success = true;
        } catch (err) {
          retryCount++;
          if (attempts >= 3) throw err;
          await new Promise(r => setTimeout(r, 1000 * attempts));
        }
      }

      successfullyUploadedOrSkippedCount++;
      uploadedProductsCount += chunk.productCount;
      bytesUploadedCount += chunk.byteSize;
    }

    await setDoc(versionRef, { uploadedChunkCount: successfullyUploadedOrSkippedCount }, { merge: true });

    if (onProgress) {
      onProgress({
        stage: 'uploading',
        uploadedChunks: successfullyUploadedOrSkippedCount,
        totalChunks: chunks.length,
        uploadedProducts: uploadedProductsCount,
        totalProducts: sortedProducts.length,
        bytesUploaded: bytesUploadedCount,
        currentChunk: i + 1,
        retryCount,
      });
    }
  }

  await recordAuditLog('catalog_upload_resumed', versionId, { uploadedChunkCount: successfullyUploadedOrSkippedCount });
  return { versionId, catalogChecksum };
}

export async function verifyServerCatalog(versionId: string, expectedChecksum: string, expectedProductCount: number): Promise<boolean> {
  const versionRef = doc(db, 'catalog_versions', versionId);
  const versionSnap = await getDoc(versionRef);
  if (!versionSnap.exists()) {
    throw new Error('فشل التحقق: وثيقة الإصدار غير موجودة على السحابة.');
  }

  const data = versionSnap.data() as CatalogVersionMeta;
  if (!data.chunkCount || data.chunkCount <= 0) {
    throw new Error('فشل التحقق: عدد الـ Chunks غير صالح في وثيقة الإصدار.');
  }
  if (data.checksum !== expectedChecksum) {
    throw new Error('فشل التحقق: بصمة الإصدار (SHA-256 Checksum) لا تتطابق مع المتوقع.');
  }
  if (data.productCount !== expectedProductCount) {
    throw new Error(`فشل التحقق: عدد الأصناف (${data.productCount}) لا يطابق المتوقع (${expectedProductCount}).`);
  }

  const chunksColRef = collection(db, 'catalog_versions', versionId, 'chunks');
  const chunksSnap = await getDocs(chunksColRef);
  if (chunksSnap.size !== data.chunkCount) {
    throw new Error(`فشل التحقق: عدد الـ Chunks على السحابة (${chunksSnap.size}) لا يطابق العدد المطلوب (${data.chunkCount}).`);
  }

  const chunksByIndex = new Map<number, any>();
  const seenIndexes = new Set<number>();

  chunksSnap.forEach(docSnap => {
    const chunkData = docSnap.data();
    const idx = chunkData.chunkIndex;
    if (typeof idx !== 'number') {
      throw new Error(`فشل التحقق: chunkIndex غير صالح في الوثيقة ${docSnap.id}.`);
    }
    if (seenIndexes.has(idx)) {
      throw new Error(`فشل التحقق: تكرار chunkIndex (${idx}) على السحابة.`);
    }
    seenIndexes.add(idx);
    chunksByIndex.set(idx, chunkData);
  });

  // Verify all expected indexes exist from 0 to chunkCount - 1
  for (let i = 0; i < data.chunkCount; i++) {
    if (!chunksByIndex.has(i)) {
      throw new Error(`فشل التحقق: الـ Chunk رقم ${i} مفقود من السحابة.`);
    }
  }

  const reconstructedProducts: NormalizedProduct[] = [];
  const seenItemCodes = new Set<string>();

  for (let i = 0; i < data.chunkCount; i++) {
    const chunkData = chunksByIndex.get(i)!;
    if (!chunkData.payloadJson || typeof chunkData.payloadJson !== 'string' || chunkData.payloadJson.trim() === '') {
      throw new Error(`فشل التحقق: الـ Chunk رقم ${i} لا يحتوي على حمولة (payloadJson).`);
    }

    // Verify chunk checksum
    const computedChunkChecksum = await computeSha256Checksum(chunkData.payloadJson);
    if (chunkData.checksum && chunkData.checksum !== computedChunkChecksum) {
      throw new Error(`فشل التحقق: بصمة الـ Chunk رقم ${i} غير مطابقة.`);
    }

    let prods: NormalizedProduct[];
    try {
      prods = deserializeCatalogChunk(chunkData.payloadJson);
    } catch (e: any) {
      throw new Error(`فشل التحقق: تعذر فك تشفير حمولة الـ Chunk رقم ${i}: ${e.message}`);
    }

    if (chunkData.productCount !== undefined && chunkData.productCount !== prods.length) {
      throw new Error(`فشل التحقق: عدد الأصناف المسجل في Chunk ${i} (${chunkData.productCount}) لا يطابق العدد الفعلي (${prods.length}).`);
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

  // Verify full reconstructed catalog checksum matches version.checksum
  const sortedReconstructed = sortProductsDeterministically(reconstructedProducts);
  const reconstructedChecksum = await computeSha256Checksum(sortedReconstructed);
  if (reconstructedChecksum !== data.checksum) {
    throw new Error(`فشل التحقق: بصمة الكتالوج المعاد بناؤه (${reconstructedChecksum}) لا تطابق بصمة الإصدار (${data.checksum}).`);
  }

  if (data.uploadedChunkCount !== data.chunkCount) {
    throw new Error(`فشل التحقق: عدد الـ Chunks المرفوعة (${data.uploadedChunkCount}) لا يطابق إجمالي الـ Chunks (${data.chunkCount}).`);
  }

  await setDoc(versionRef, { status: 'verified', verifiedChunkCount: data.chunkCount }, { merge: true });
  await recordAuditLog('catalog_verified', versionId, { verifiedChunks: data.chunkCount, productCount: reconstructedProducts.length });

  return true;
}

export async function activateCatalogVersion(versionId: string, parseResult: ImportParseResult, catalogChecksum: string): Promise<{ isAlreadyActive: boolean; message: string }> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('عملية التفعيل مرفوضة: يجب تسجيل الدخول كمسؤول.');
  }
  const uid = currentUser.uid;

  const versionRef = doc(db, 'catalog_versions', versionId);
  const appSettingsRef = doc(db, 'app_settings', 'global');

  let alreadyActive = false;

  await runTransaction(db, async (transaction) => {
    const versionSnap = await transaction.get(versionRef);
    if (!versionSnap.exists()) {
      throw new Error('إصدار الكتالوج غير موجود.');
    }
    const verData = versionSnap.data();

    // P0-2 Activation Gate:
    if (verData.status !== 'verified' && verData.status !== 'active') {
      throw new Error('لا يمكن تفعيل نسخة لم يتم التحقق منها بنجاح.');
    }
    if (verData.status === 'verified') {
      if (
        verData.verifiedChunkCount !== verData.chunkCount ||
        verData.uploadedChunkCount !== verData.chunkCount ||
        !verData.productCount || verData.productCount <= 0 ||
        !verData.checksum
      ) {
        throw new Error('فشل بوابة التفعيل: لم تكتمل متطلبات التحقق من الـ Chunks وسلامة الكتالوج.');
      }
    }

    const appSettingsSnap = await transaction.get(appSettingsRef);
    const appSettingsData = appSettingsSnap.exists() ? appSettingsSnap.data() : null;
    const currentActiveVersionId = appSettingsData?.activeCatalogVersionId;

    if (currentActiveVersionId === versionId) {
      // P0-3: Same catalog reactivation is a NO-OP / already active. DO NOT reset activeInventoryRevision!
      alreadyActive = true;
      transaction.update(versionRef, {
        status: 'active',
        activatedAt: serverTimestamp(),
      });
      return;
    }

    // Switching Catalog A -> Catalog B:
    transaction.set(appSettingsRef, {
      activeCatalogVersionId: versionId,
      activeInventoryRevision: 0,
      lastInventoryUpdateId: null,
      updatedAt: serverTimestamp(),
      updatedByUid: uid,
    }, { merge: true });

    transaction.update(versionRef, {
      status: 'active',
      activatedAt: serverTimestamp(),
    });
  });

  if (alreadyActive) {
    return { isAlreadyActive: true, message: 'هذا الإصدار هو الكتالوج النشط بالفعل' };
  }

  const sorted = sortProductsDeterministically(parseResult.products);
  await saveCatalogToIndexedDB(versionId, catalogChecksum, parseResult.products.length, sorted);

  await recordAuditLog('catalog_activated', versionId, { productCount: parseResult.products.length, activatedBy: uid });
  return { isAlreadyActive: false, message: 'تم تفعيل الكتالوج بنجاح' };
}
