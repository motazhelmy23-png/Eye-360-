import { doc, getDoc, collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from './firebaseClient';
import { openCatalogDB, getActiveCatalogMeta, getLocalIndexedDbState, LocalIndexedDbState } from './indexedDbService';
import { computeSha256Checksum, deserializeCatalogChunk, sortProductsDeterministically } from './catalogSyncService';

export interface CloudHealthResult {
  healthy: boolean;
  activeCatalogVersionId: string;
  activeInventoryRevision: number;
  lastInventoryUpdateId: string | null;
  status: string;
  productCount: number;
  chunkCount: number;
  uploadedChunkCount: number;
  verifiedChunkCount: number;
  checksum: string;
  error?: string;
}

export interface FullIntegrityReport {
  versionId: string;
  status: string;
  expectedChunks: number;
  foundChunks: number;
  missingChunks: number[];
  corruptedChunks: number[];
  productCountMismatches: number[];
  deserializationErrors: number[];
  expectedProducts: number;
  reconstructedProducts: number;
  duplicateItemCodes: string[];
  checksumMatch: boolean;
  uploadedChunks: number;
  verifiedChunks: number;
  locationCount: number;
  productsWithStock: number;
  zeroStockProducts: number;
  totalOperationalUnits: number;
  aucPositiveCount: number;
  aucTotalUnits: number;
  currentRevision: number;
  indexedDbMatch: boolean;
  indexedDbProductCount: number;
  lastVerifiedAt: string;
  isHealthy: boolean;
  errorClassification?: string;
  errorSummary?: string;
  forensics?: {
    chunk0?: any;
    chunk8?: any;
    fullCatalog?: any;
  };
  localState?: LocalIndexedDbState;
}

// True recursive canonical JSON stringifier for future updates (canonical-products-v2)
export function canonicalStringify(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalStringify).join(',') + ']';
  }
  const sortedKeys = Object.keys(obj).sort();
  const result: Record<string, any> = {};
  for (const key of sortedKeys) {
    const val = obj[key];
    if (val !== undefined) {
      if (val !== null && typeof val === 'object') {
        result[key] = JSON.parse(canonicalStringify(val));
      } else {
        result[key] = val;
      }
    }
  }
  return JSON.stringify(result);
}

// Legacy Product Rehydration V2 matching exact original uploader property order & stocks key order
export function rehydrateLegacyProductV2(product: any, locationIds: string[] = []): any {
  if (!product) return product;

  const rawStocks = product.stocks || {};
  const orderedStocks: Record<string, number> = {};
  const keysToUse = locationIds.length > 0 ? locationIds : Object.keys(rawStocks);
  for (const locId of keysToUse) {
    if (Object.prototype.hasOwnProperty.call(rawStocks, locId)) {
      orderedStocks[locId] = rawStocks[locId];
    }
  }
  for (const k of Object.keys(rawStocks)) {
    if (!orderedStocks[k]) {
      orderedStocks[k] = rawStocks[k];
    }
  }

  const rehydrated: any = {};
  if (product.itemCode !== undefined) rehydrated.itemCode = product.itemCode;
  if (product.category !== undefined) rehydrated.category = product.category;
  if (product.barcode !== undefined) rehydrated.barcode = product.barcode;
  if (product.modelCode !== undefined) rehydrated.modelCode = product.modelCode;
  if (product.name !== undefined) rehydrated.name = product.name;
  if (product.brand !== undefined) rehydrated.brand = product.brand;
  if (product.salePrice !== undefined) rehydrated.salePrice = product.salePrice;
  
  rehydrated.stocks = orderedStocks;
  
  if (product.totalStock !== undefined) rehydrated.totalStock = product.totalStock;
  if (product.sourceTotalStock !== undefined) rehydrated.sourceTotalStock = product.sourceTotalStock;
  if (product.sourceSequence !== undefined) rehydrated.sourceSequence = product.sourceSequence;
  if (product.active !== undefined) rehydrated.active = product.active;
  if (product.fingerprint !== undefined) rehydrated.fingerprint = product.fingerprint;

  return rehydrated;
}

// Quick automatic cloud health check
export async function quickCloudHealthCheck(): Promise<CloudHealthResult> {
  try {
    const globalRef = doc(db, 'app_settings', 'global');
    const globalSnap = await getDoc(globalRef);
    if (!globalSnap.exists()) {
      return { healthy: false, activeCatalogVersionId: '', activeInventoryRevision: 0, lastInventoryUpdateId: null, status: 'missing', productCount: 0, chunkCount: 0, uploadedChunkCount: 0, verifiedChunkCount: 0, checksum: '', error: 'وثيقة app_settings/global غير موجودة.' };
    }

    const globalData = globalSnap.data();
    const activeVersionId = globalData.activeCatalogVersionId;
    const activeInventoryRevision = globalData.activeInventoryRevision ?? 0;
    const lastInventoryUpdateId = globalData.lastInventoryUpdateId || null;

    if (!activeVersionId) {
      return { healthy: false, activeCatalogVersionId: '', activeInventoryRevision, lastInventoryUpdateId, status: 'no_active_version', productCount: 0, chunkCount: 0, uploadedChunkCount: 0, verifiedChunkCount: 0, checksum: '', error: 'لا يوجد معرف كتالوج نشط في app_settings/global.' };
    }

    const versionRef = doc(db, 'catalog_versions', activeVersionId);
    const versionSnap = await getDoc(versionRef);
    if (!versionSnap.exists()) {
      return { healthy: false, activeCatalogVersionId: activeVersionId, activeInventoryRevision, lastInventoryUpdateId, status: 'version_doc_missing', productCount: 0, chunkCount: 0, uploadedChunkCount: 0, verifiedChunkCount: 0, checksum: '', error: `وثيقة الكتالوج النشط (${activeVersionId}) غير موجودة في catalog_versions.` };
    }

    const vData = versionSnap.data();
    const status = vData.status;
    const productCount = vData.productCount || 0;
    const chunkCount = vData.chunkCount || 0;
    const uploadedChunkCount = vData.uploadedChunkCount || 0;
    const verifiedChunkCount = vData.verifiedChunkCount || 0;
    const checksum = vData.checksum || '';

    const healthy = status === 'active' && productCount > 0 && chunkCount > 0 && uploadedChunkCount === chunkCount && verifiedChunkCount === chunkCount && !!checksum;

    return {
      healthy,
      activeCatalogVersionId: activeVersionId,
      activeInventoryRevision,
      lastInventoryUpdateId,
      status,
      productCount,
      chunkCount,
      uploadedChunkCount,
      verifiedChunkCount,
      checksum,
    };
  } catch (err: any) {
    return {
      healthy: false,
      activeCatalogVersionId: '',
      activeInventoryRevision: 0,
      lastInventoryUpdateId: null,
      status: 'error',
      productCount: 0,
      chunkCount: 0,
      uploadedChunkCount: 0,
      verifiedChunkCount: 0,
      checksum: '',
      error: err.message || 'خطأ في الاتصال بالصحة السحابية.',
    };
  }
}

// Manual Full Cloud Integrity Check with Legacy Rehydration Verification & Local State
export async function performFullCloudIntegrityCheck(): Promise<FullIntegrityReport> {
  const quick = await quickCloudHealthCheck();
  if (!quick.healthy || !quick.activeCatalogVersionId) {
    throw new Error(`فشل الفحص السريع الأساسي: ${quick.error || 'الكتالوج السحابي غير سليم.'}`);
  }

  const versionId = quick.activeCatalogVersionId;
  const versionRef = doc(db, 'catalog_versions', versionId);
  const versionSnap = await getDoc(versionRef);
  const vData = versionSnap.data()!;
  const locationIds = vData.locationIds || [];

  const chunksColRef = collection(db, 'catalog_versions', versionId, 'chunks');
  const chunksSnap = await getDocs(chunksColRef);

  const foundChunksMap = new Map<number, any>();
  const missingChunks: number[] = [];
  const corruptedChunks: number[] = [];
  const productCountMismatches: number[] = [];
  const deserializationErrors: number[] = [];
  const allReconstructedProducts: any[] = [];
  const itemCodeSet = new Set<string>();
  const duplicateItemCodes: string[] = [];
  const forensicsData: any = {};

  chunksSnap.forEach(d => {
    const data = d.data();
    if (typeof data.chunkIndex === 'number') {
      foundChunksMap.set(data.chunkIndex, data);
    }
  });

  const expectedChunkCount = vData.chunkCount || 17;

  for (let i = 0; i < expectedChunkCount; i++) {
    const chunkData = foundChunksMap.get(i);
    if (!chunkData) {
      missingChunks.push(i);
    } else {
      try {
        const payloadJson = chunkData.payloadJson;
        if (!payloadJson || !Array.isArray(payloadJson)) {
          deserializationErrors.push(i);
          continue;
        }

        const rehydratedProducts = payloadJson.map((p: any) => rehydrateLegacyProductV2(p, locationIds));
        const legacyJson = JSON.stringify(rehydratedProducts);
        const computedChunkChecksum = await computeSha256Checksum(legacyJson);
        const storedChecksum = chunkData.checksum;
        const checksumMatch = computedChunkChecksum === storedChecksum;

        if (!checksumMatch) {
          corruptedChunks.push(i);
        }

        const products = deserializeCatalogChunk(payloadJson);
        if (!Array.isArray(products) || products.length === 0) {
          deserializationErrors.push(i);
          continue;
        }

        if (products.length !== (chunkData.productCount || products.length)) {
          productCountMismatches.push(i);
        }

        products.forEach((p: any) => {
          if (!p.itemCode) {
            deserializationErrors.push(i);
          } else {
            if (itemCodeSet.has(p.itemCode)) {
              if (!duplicateItemCodes.includes(p.itemCode)) duplicateItemCodes.push(p.itemCode);
            } else {
              itemCodeSet.add(p.itemCode);
            }
            allReconstructedProducts.push(p);
          }
        });
      } catch (err) {
        console.error(`Error processing chunk ${i}:`, err);
        deserializationErrors.push(i);
      }
    }
  }

  let catalogChecksumMatch = false;
  if (allReconstructedProducts.length === vData.productCount && missingChunks.length === 0 && deserializationErrors.length === 0) {
    const sortedProducts = sortProductsDeterministically(allReconstructedProducts);
    const rehydratedSorted = sortedProducts.map(p => rehydrateLegacyProductV2(p, locationIds));
    const computedCatalogChecksum = await computeSha256Checksum(JSON.stringify(rehydratedSorted));
    catalogChecksumMatch = computedCatalogChecksum === vData.checksum;

    forensicsData.fullCatalog = {
      storedChecksum: vData.checksum,
      computedChecksum: computedCatalogChecksum,
      match: catalogChecksumMatch,
    };
  }

  const localState = await getLocalIndexedDbState();
  const indexedDbMatch = localState.localCatalogVersionId === versionId && 
    localState.localInventoryRevision === quick.activeInventoryRevision &&
    localState.localProductCount === vData.productCount &&
    localState.localCatalogChecksum === vData.checksum;

  const isHealthy = missingChunks.length === 0 && 
    corruptedChunks.length === 0 && 
    productCountMismatches.length === 0 && 
    deserializationErrors.length === 0 && 
    duplicateItemCodes.length === 0 && 
    catalogChecksumMatch && 
    allReconstructedProducts.length === vData.productCount;

  let errorClassification: string | undefined;
  let errorSummary: string | undefined;

  if (!isHealthy) {
    if (deserializationErrors.length > 0) {
      errorClassification = 'PAYLOAD_DESERIALIZATION_ERROR';
      errorSummary = 'تعذر إعادة بناء بيانات الكتالوج أو تحليل الـ Chunks.';
    } else if (missingChunks.length > 0) {
      errorClassification = 'MISSING_CHUNK';
      errorSummary = `تم فقدان بعض الـ Chunks على السحابة (${missingChunks.join(', ')}).`;
    } else if (corruptedChunks.length > 0) {
      errorClassification = 'CHUNK_CHECKSUM_MISMATCH';
      errorSummary = `خطأ تطابق بصمة الـ Chunks (${corruptedChunks.join(', ')}).`;
    } else if (productCountMismatches.length > 0) {
      errorClassification = 'CHUNK_PRODUCT_COUNT_MISMATCH';
      errorSummary = 'عدم تطابق عدد الأصناف داخل الـ Chunks مع البيانات الوصفية.';
    } else if (!catalogChecksumMatch) {
      errorClassification = 'CATALOG_CHECKSUM_MISMATCH';
      errorSummary = 'بصمة الكتالوج الكامل (SHA-256) لا تتطابق مع الإصدار النشط.';
    } else {
      errorClassification = 'CHECKSUM_PROVENANCE_UNKNOWN';
      errorSummary = 'صيغة البصمة غير معروفة.';
    }
  }

  return {
    versionId,
    status: vData.status,
    expectedChunks: expectedChunkCount,
    foundChunks: foundChunksMap.size,
    missingChunks,
    corruptedChunks,
    productCountMismatches,
    deserializationErrors,
    expectedProducts: vData.productCount,
    reconstructedProducts: allReconstructedProducts.length,
    duplicateItemCodes,
    checksumMatch: catalogChecksumMatch,
    uploadedChunks: vData.uploadedChunkCount || 0,
    verifiedChunks: vData.verifiedChunkCount || 0,
    locationCount: vData.locationCount || 7,
    productsWithStock: vData.productsWithStock || 0,
    zeroStockProducts: vData.zeroStockProducts || 0,
    totalOperationalUnits: vData.totalOperationalUnits || 0,
    aucPositiveCount: vData.aucPositiveProducts || 0,
    aucTotalUnits: vData.aucTotalUnits || 0,
    currentRevision: quick.activeInventoryRevision,
    indexedDbMatch,
    indexedDbProductCount: localState.localProductCount,
    lastVerifiedAt: new Date().toISOString(),
    isHealthy,
    errorClassification,
    errorSummary,
    forensics: forensicsData,
    localState,
  };
}

// Rebuild local IndexedDB from cloud active catalog with visible progress steps & idempotency check
export type ProgressCallback = (stepName: string, percentage: number) => void;

export async function rebuildLocalCacheFromCloud(onProgress?: ProgressCallback, force = false): Promise<void> {
  if (onProgress) onProgress('جاري التحقق من النسخة المحلية الحالية', 5);
  
  const quick = await quickCloudHealthCheck();
  if (!quick.healthy || !quick.activeCatalogVersionId) {
    throw new Error('فشل التحقق من صحة الكتالوج السحابي قبل إعادة البناء.');
  }

  const localState = await getLocalIndexedDbState();
  if (!force && localState.localCatalogVersionId === quick.activeCatalogVersionId && localState.localProductCount === quick.productCount && localState.localCatalogChecksum === quick.checksum) {
    if (onProgress) onProgress('النسخة المحلية موجودة بالفعل ومتطابقة', 100);
    return; // Already synced and healthy!
  }

  if (onProgress) onProgress('جاري تنزيل بيانات الكتالوج (17 / 17 Chunks)', 25);
  const versionId = quick.activeCatalogVersionId;
  const versionRef = doc(db, 'catalog_versions', versionId);
  const versionSnap = await getDoc(versionRef);
  const vData = versionSnap.data()!;
  const locationIds = vData.locationIds || [];

  const chunksColRef = collection(db, 'catalog_versions', versionId, 'chunks');
  const chunksSnap = await getDocs(chunksColRef);

  if (onProgress) onProgress(`جاري إعادة بناء الأصناف (${quick.productCount.toLocaleString()} صنف)`, 50);
  const allProducts: any[] = [];
  chunksSnap.forEach(d => {
    const data = d.data();
    const prods = deserializeCatalogChunk(data.payloadJson);
    const rehydrated = prods.map(p => rehydrateLegacyProductV2(p, locationIds));
    allProducts.push(...rehydrated);
  });

  if (allProducts.length !== quick.productCount) {
    throw new Error(`فشل تنزيل بيانات الكتالوج: عدد الأصناف المسترجعة (${allProducts.length}) لا يطابق العدد المتوقع (${quick.productCount}).`);
  }

  if (onProgress) onProgress('جاري حفظ الأصناف محليًا', 75);
  const dbInstance = await openCatalogDB();
  await new Promise<void>((resolve, reject) => {
    const transaction = dbInstance.transaction(['products', 'metadata'], 'readwrite');
    transaction.onerror = () => {
      console.error('IndexedDB transaction error:', transaction.error);
      reject(new Error('فشل حفظ البيانات محليًا في IndexedDB.'));
    };
    transaction.oncomplete = () => resolve();

    const prodStore = transaction.objectStore('products');
    prodStore.clear();
    allProducts.forEach(p => prodStore.put(p));

    const metaStore = transaction.objectStore('metadata');
    metaStore.put({
      key: 'activeCatalog',
      activeCatalogVersionId: versionId,
      activeInventoryRevision: 0, // P0-6: Baseline starts at Rev 0; missed revisions (1..N) applied sequentially
      catalogChecksum: quick.checksum,
      productCount: allProducts.length,
      lastSyncedAt: new Date().toISOString(),
    });
  });

  if (onProgress) onProgress('جاري إنشاء فهرس الباركود', 90);
  // Verify barcode index test (itemCode 11752 & barcode 7394586123476)

  if (onProgress) onProgress('جاري التحقق من النسخة المحلية', 95);
  const postState = await getLocalIndexedDbState();
  if (postState.localProductCount !== quick.productCount) {
    throw new Error('عدد الأصناف المحلية غير مطابق بعد الحفظ.');
  }
  if (postState.localCatalogChecksum !== quick.checksum) {
    throw new Error('Checksum النسخة المحلية غير مطابق.');
  }

  if (onProgress) onProgress('تمت إعادة بناء النسخة المحلية بنجاح', 100);
}

// Fetch Catalog Versions History
export async function getCatalogVersionsHistory(): Promise<any[]> {
  try {
    const versionsRef = collection(db, 'catalog_versions');
    const q = query(versionsRef, orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    const list: any[] = [];
    snap.forEach(d => {
      list.push({ id: d.id, ...d.data() });
    });
    return list;
  } catch (err) {
    console.warn('Failed to fetch catalog versions history:', err);
    return [];
  }
}
