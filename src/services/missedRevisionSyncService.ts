import { collection, getDocs, query, where, orderBy, doc, getDoc } from 'firebase/firestore';
import { db } from './firebaseClient';
import { openCatalogDB, getActiveCatalogMeta, LocalIndexedDbState, getLocalIndexedDbState } from './indexedDbService';
import { quickCloudHealthCheck } from './dataIntegrityService';
import { NormalizedProduct } from '../types/inventory';
import { computeSha256Checksum, deserializeCatalogChunk } from './catalogSyncService';

export interface SyncDiagnosticsInfo {
  cloudCatalogVersion: string;
  localCatalogVersion: string;
  cloudRevision: number;
  localRevision: number;
  queryFieldUsed: string;
  updatesFound: number;
  updateIds: string[];
  deltaChunksDownloaded: number;
  productsApplied: number;
  finalLocalRevision: number;
  lastSyncError: string | null;
  statusMessage: string;
}

export async function getSyncDiagnostics(): Promise<SyncDiagnosticsInfo> {
  const quick = await quickCloudHealthCheck();
  const localState = await getLocalIndexedDbState();
  const meta = await getActiveCatalogMeta();

  return {
    cloudCatalogVersion: quick.activeCatalogVersionId,
    localCatalogVersion: localState.localCatalogVersionId || 'none',
    cloudRevision: quick.activeInventoryRevision,
    localRevision: localState.localInventoryRevision,
    queryFieldUsed: 'targetRevision',
    updatesFound: 0,
    updateIds: [],
    deltaChunksDownloaded: 0,
    productsApplied: 0,
    finalLocalRevision: localState.localInventoryRevision,
    lastSyncError: null,
    statusMessage: localState.localInventoryRevision === quick.activeInventoryRevision ? 'البيانات محدثة بالفعل' : 'البيانات المحلية تحتاج إلى مزامنة',
  };
}

export async function syncMissedRevisions(onProgress?: (msg: string) => void): Promise<{ updatesApplied: number; finalRevision: number }> {
  if (onProgress) onProgress('جاري فحص حالة المزامنة السحابية والمحلية...');

  const quick = await quickCloudHealthCheck();
  if (!quick.healthy || !quick.activeCatalogVersionId) {
    throw new Error('الكتالوج السحابي غير سليم للمزامنة.');
  }

  const localState = await getLocalIndexedDbState();
  const cloudVersionId = quick.activeCatalogVersionId;
  const cloudRevision = quick.activeInventoryRevision;
  const localRevision = localState.localInventoryRevision;

  if (localState.localCatalogVersionId !== cloudVersionId) {
    throw new Error('إصدار الكتالوج المحلي غير مطابق للإصدار السحابي النشط. يلزم تحديث الكتالوج الأساسي.');
  }

  if (localRevision >= cloudRevision) {
    if (onProgress) onProgress('البيانات محدثة بالفعل.');
    return { updatesApplied: 0, finalRevision: localRevision };
  }

  if (onProgress) onProgress(`جاري البحث عن تحديثات المخزون (المراجعة المحلية ${localRevision} إلى ${cloudRevision})...`);

  // Query published updates where targetRevision > localRevision && targetRevision <= cloudRevision
  const updatesRef = collection(db, 'catalog_versions', cloudVersionId, 'inventory_updates');
  const q = query(
    updatesRef,
    where('status', '==', 'published'),
    where('targetRevision', '>', localRevision),
    where('targetRevision', '<=', cloudRevision),
    orderBy('targetRevision', 'asc')
  );

  const updatesSnap = await getDocs(q);
  const updatesToApply: any[] = [];
  updatesSnap.forEach(d => {
    updatesToApply.push({ id: d.id, ...d.data() });
  });

  if (updatesToApply.length === 0) {
    if (onProgress) onProgress('لا توجد تحديثات جديدة منشورة للتطبيق.');
    return { updatesApplied: 0, finalRevision: localRevision };
  }

  let currentLocalRev = localRevision;
  let totalProductsApplied = 0;
  const updateIds: string[] = [];
  let deltaChunksCount = 0;

  const dbInstance = await openCatalogDB();

  for (const updateDoc of updatesToApply) {
    updateIds.push(updateDoc.id);
    const expectedBaseRev = updateDoc.baseRevision;
    const expectedTargetRev = updateDoc.targetRevision;

    if (expectedBaseRev !== currentLocalRev || expectedTargetRev !== currentLocalRev + 1) {
      throw new Error('تم اكتشاف فجوة في تسلسل تحديثات المخزون');
    }

    if (onProgress) onProgress(`جاري تنزيل دلتا التحديث Revision ${expectedTargetRev} (${updateDoc.id})...`);

    // Fetch chunks for this inventory update
    const chunksColRef = collection(db, 'catalog_versions', cloudVersionId, 'inventory_updates', updateDoc.id, 'chunks');
    const chunksSnap = await getDocs(chunksColRef);

    const deltaProducts: NormalizedProduct[] = [];
    chunksSnap.forEach(chunkDoc => {
      deltaChunksCount++;
      const cData = chunkDoc.data();
      const prods = deserializeCatalogChunk(cData.payloadJson);
      deltaProducts.push(...prods);
    });

    if (deltaProducts.length === 0) {
      throw new Error(`التحديث ${updateDoc.id} لا يحتوي على أصناف دلتا.`);
    }

    if (onProgress) onProgress(`جاري تطبيق ${deltaProducts.length} صنف معدل محلياً في IndexedDB...`);

    // Apply delta products transactionally to IndexedDB
    await new Promise<void>((resolve, reject) => {
      const transaction = dbInstance.transaction(['products', 'metadata'], 'readwrite');
      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => resolve();

      const prodStore = transaction.objectStore('products');

      // Update each product by itemCode
      let appliedCount = 0;
      deltaProducts.forEach(deltaP => {
        // Get existing or put new
        const getReq = prodStore.get(deltaP.itemCode);
        getReq.onsuccess = () => {
          const existing = getReq.result;
          if (existing) {
            // Merge operational state (salePrice, stocks, etc.)
            const merged = { ...existing, ...deltaP };
            prodStore.put(merged);
          } else {
            // Insert new product
            prodStore.put(deltaP);
          }
          appliedCount++;
          if (appliedCount === deltaProducts.length) {
            // Update metadata atomically
            const metaStore = transaction.objectStore('metadata');
            metaStore.put({
              key: 'activeCatalog',
              activeCatalogVersionId: cloudVersionId,
              activeInventoryRevision: expectedTargetRev,
              catalogChecksum: localState.localCatalogChecksum || quick.checksum,
              productCount: localState.localProductCount,
              lastSyncedAt: new Date().toISOString(),
              lastInventoryUpdateId: updateDoc.id,
            });
          }
        };
      });
    });

    currentLocalRev = expectedTargetRev;
    totalProductsApplied += deltaProducts.length;
  }

  if (onProgress) onProgress(`تمت مزامنة المراجعات بنجاح حتى Revision ${currentLocalRev}`);

  return {
    updatesApplied: updatesToApply.length,
    finalRevision: currentLocalRev,
  };
}
