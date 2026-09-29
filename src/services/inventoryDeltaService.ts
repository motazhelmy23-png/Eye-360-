import { doc, getDoc, setDoc, runTransaction, serverTimestamp, collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db, auth } from './firebaseClient';
import { NormalizedProduct, ImportParseResult } from '../types/inventory';
import { openCatalogDB, getActiveCatalogMeta } from './indexedDbService';
import { computeSha256Checksum, sortProductsDeterministically, chunkProductsByByteSize, ChunkPayload, getUtf8ByteSize, recordAuditLog, deserializeCatalogChunk } from './catalogSyncService';

export type ChangeClassification = 
  | 'UNCHANGED'
  | 'STOCK_CHANGED'
  | 'PRICE_CHANGED'
  | 'PRICE_AND_STOCK_CHANGED'
  | 'NEW_PRODUCT'
  | 'MISSING_FROM_NEW_FILE';

export interface ProductDeltaItem {
  itemCode: string;
  classification: ChangeClassification;
  oldProduct?: NormalizedProduct;
  newProduct: NormalizedProduct;
  stockChanges?: {
    locationId: string;
    locationName: string;
    oldQty: number;
    newQty: number;
    diff: number;
  }[];
  priceChange?: {
    oldPrice: number | null;
    newPrice: number | null;
  };
  metadataChanges?: {
    nameChanged: boolean;
    brandChanged: boolean;
    barcodeChanged: boolean;
    categoryChanged: boolean;
  };
}

export interface InventoryComparisonResult {
  activeCatalogVersionId: string;
  baseRevision: number;
  targetRevision: number;
  sourceFileName: string;
  totalNewProductsCount: number;
  unchangedCount: number;
  stockChangedCount: number;
  priceChangedCount: number;
  priceAndStockChangedCount: number;
  newProductCount: number;
  missingProductCount: number;
  metadataChangedCount: number;
  totalChangedProductsCount: number;
  deltas: ProductDeltaItem[];
  missingProducts: NormalizedProduct[];
  deltaProducts: NormalizedProduct[];
  deltaBytes: number;
  checksum: string;
}

export interface InventoryUpdateMeta {
  updateId: string;
  catalogVersionId: string;
  baseRevision: number;
  targetRevision: number;
  status: 'staged' | 'uploading' | 'verified' | 'published' | 'failed';
  createdAt: any;
  createdByUid: string;
  sourceFileName: string;
  sourceFileSize: number;
  changedProductCount: number;
  newProductCount: number;
  missingProductCount: number;
  unchangedCount?: number;
  chunkCount: number;
  uploadedChunkCount: number;
  verifiedChunkCount: number;
  checksum: string;
  schemaVersion: string;
}

// 1. Fetch all products from IndexedDB active catalog
export async function getAllLocalProducts(): Promise<NormalizedProduct[]> {
  const dbInstance = await openCatalogDB();
  return new Promise((resolve, reject) => {
    const transaction = dbInstance.transaction(['products'], 'readonly');
    const store = transaction.objectStore('products');
    const req = store.getAll();
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result || []);
  });
}

// 2. Compare parsed today's inventory file against active IndexedDB catalog with exclusive primary classifications and unique itemCode delta deduplication
export async function compareCatalogWithActive(parseResult: ImportParseResult): Promise<InventoryComparisonResult> {
  const meta = await getActiveCatalogMeta();
  if (!meta || !meta.activeCatalogVersionId) {
    throw new Error('لا يوجد كتالوج نشط في قاعدة البيانات المحلية (IndexedDB). يرجى مزامنة الكتالوج الأساسي أولاً.');
  }

  const globalSettingsRef = doc(db, 'app_settings', 'global');
  const globalSnap = await getDoc(globalSettingsRef);
  const globalData = globalSnap.exists() ? globalSnap.data() : { activeCatalogVersionId: meta.activeCatalogVersionId, activeInventoryRevision: meta.activeInventoryRevision || 0 };

  if (globalData.activeCatalogVersionId !== meta.activeCatalogVersionId) {
    throw new Error('الكتالوج المحلي غير مطابق للكتالوج النشط على السحابة. يلزم تحديث الكتالوج الأساسي أولاً.');
  }

  const baseRevision = globalData.activeInventoryRevision ?? 0;
  const targetRevision = baseRevision + 1;

  const localProducts = await getAllLocalProducts();
  const localMap = new Map<string, NormalizedProduct>();
  localProducts.forEach(p => localMap.set(p.itemCode, p));

  const newProductsMap = new Map<string, NormalizedProduct>();
  parseResult.products.forEach(p => newProductsMap.set(p.itemCode, p));

  const deltas: ProductDeltaItem[] = [];
  const missingProducts: NormalizedProduct[] = [];
  const deltaProductsMap = new Map<string, NormalizedProduct>();

  let unchangedCount = 0;
  let stockChangedCount = 0;
  let priceChangedCount = 0;
  let priceAndStockChangedCount = 0;
  let newProductCount = 0;
  let metadataChangedCount = 0;

  for (const [itemCode, newP] of newProductsMap.entries()) {
    const oldP = localMap.get(itemCode);

    if (!oldP) {
      newProductCount++;
      deltas.push({
        itemCode,
        classification: 'NEW_PRODUCT',
        newProduct: newP,
      });
      deltaProductsMap.set(itemCode, newP);
      continue;
    }

    const priceChanged = oldP.salePrice !== newP.salePrice;

    const stockChanges: { locationId: string; locationName: string; oldQty: number; newQty: number; diff: number; }[] = [];
    const allLocIds = new Set([...Object.keys(oldP.stocks || {}), ...Object.keys(newP.stocks || {})]);
    
    for (const locId of allLocIds) {
      const oldQty = oldP.stocks?.[locId] || 0;
      const newQty = newP.stocks?.[locId] || 0;
      if (oldQty !== newQty) {
        stockChanges.push({
          locationId: locId,
          locationName: locId,
          oldQty,
          newQty,
          diff: newQty - oldQty,
        });
      }
    }

    const stockChanged = stockChanges.length > 0 || oldP.totalStock !== newP.totalStock;

    const nameChanged = oldP.name !== newP.name;
    const brandChanged = oldP.brand !== newP.brand;
    const barcodeChanged = oldP.barcode !== newP.barcode || oldP.modelCode !== newP.modelCode;
    const categoryChanged = oldP.category !== newP.category;
    const hasMetadataChange = nameChanged || brandChanged || barcodeChanged || categoryChanged;
    if (hasMetadataChange) metadataChangedCount++;

    let classification: ChangeClassification = 'UNCHANGED';
    if (stockChanged && priceChanged) {
      classification = 'PRICE_AND_STOCK_CHANGED';
      priceAndStockChangedCount++;
    } else if (stockChanged) {
      classification = 'STOCK_CHANGED';
      stockChangedCount++;
    } else if (priceChanged) {
      classification = 'PRICE_CHANGED';
      priceChangedCount++;
    } else {
      classification = 'UNCHANGED';
      unchangedCount++;
    }

    const deltaItem: ProductDeltaItem = {
      itemCode,
      classification,
      oldProduct: oldP,
      newProduct: newP,
      stockChanges: stockChanged ? stockChanges : undefined,
      priceChange: priceChanged ? { oldPrice: oldP.salePrice, newPrice: newP.salePrice } : undefined,
      metadataChanges: hasMetadataChange ? { nameChanged, brandChanged, barcodeChanged, categoryChanged } : undefined,
    };

    deltas.push(deltaItem);

    if (classification !== 'UNCHANGED') {
      deltaProductsMap.set(itemCode, newP);
    }
  }

  // Evaluate MISSING_FROM_NEW_FILE
  for (const [itemCode, oldP] of localMap.entries()) {
    if (!newProductsMap.has(itemCode)) {
      missingProducts.push(oldP);
      deltas.push({
        itemCode,
        classification: 'MISSING_FROM_NEW_FILE',
        oldProduct: oldP,
        newProduct: oldP,
      });
    }
  }

  const missingProductCount = missingProducts.length;
  const deltaProducts = Array.from(deltaProductsMap.values());
  const totalChangedProductsCount = deltaProducts.length;
  const sortedDelta = sortProductsDeterministically(deltaProducts);
  const deltaJsonStr = JSON.stringify(sortedDelta);
  const deltaBytes = getUtf8ByteSize(deltaJsonStr);
  const checksum = await computeSha256Checksum(sortedDelta);

  return {
    activeCatalogVersionId: meta.activeCatalogVersionId,
    baseRevision,
    targetRevision,
    sourceFileName: parseResult.fileName,
    totalNewProductsCount: parseResult.products.length,
    unchangedCount,
    stockChangedCount,
    priceChangedCount,
    priceAndStockChangedCount,
    newProductCount,
    missingProductCount,
    metadataChangedCount,
    totalChangedProductsCount,
    deltas,
    missingProducts,
    deltaProducts: sortedDelta,
    deltaBytes,
    checksum,
  };
}

// 3. Stage and upload inventory delta update to Firestore
export async function stageAndUploadInventoryUpdate(
  comparison: InventoryComparisonResult,
  onProgress?: (progress: { uploadedChunks: number; totalChunks: number; bytesUploaded: number }) => void
): Promise<{ updateId: string; checksum: string }> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('يجب تسجيل الدخول كمسؤول.');
  const uid = currentUser.uid;

  const chunks = await chunkProductsByByteSize(comparison.deltaProducts);
  const updateId = `upd_${Date.now()}_rev${comparison.targetRevision}_${comparison.checksum.substring(0, 8)}`;

  const meta: InventoryUpdateMeta = {
    updateId,
    catalogVersionId: comparison.activeCatalogVersionId,
    baseRevision: comparison.baseRevision,
    targetRevision: comparison.targetRevision,
    status: 'uploading',
    createdAt: serverTimestamp(),
    createdByUid: uid,
    sourceFileName: comparison.sourceFileName,
    sourceFileSize: comparison.deltaBytes,
    changedProductCount: comparison.totalChangedProductsCount,
    newProductCount: comparison.newProductCount,
    missingProductCount: comparison.missingProductCount,
    unchangedCount: comparison.unchangedCount,
    chunkCount: chunks.length,
    uploadedChunkCount: 0,
    verifiedChunkCount: 0,
    checksum: comparison.checksum,
    schemaVersion: '2.0',
  };

  const updateRef = doc(db, 'catalog_versions', comparison.activeCatalogVersionId, 'inventory_updates', updateId);
  await setDoc(updateRef, meta);
  await recordAuditLog('inventory_update_started', comparison.activeCatalogVersionId, { updateId, targetRevision: comparison.targetRevision });

  let bytesUploaded = 0;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkId = `chunk_${String(chunk.chunkIndex).padStart(3, '0')}`;
    const chunkRef = doc(db, 'catalog_versions', comparison.activeCatalogVersionId, 'inventory_updates', updateId, 'chunks', chunkId);

    await setDoc(chunkRef, {
      chunkIndex: chunk.chunkIndex,
      productCount: chunk.productCount,
      checksum: chunk.checksum,
      byteSize: chunk.byteSize,
      payloadJson: chunk.payloadJson,
    });

    bytesUploaded += chunk.byteSize;
    if (onProgress) {
      onProgress({
        uploadedChunks: i + 1,
        totalChunks: chunks.length,
        bytesUploaded,
      });
    }
  }

  await setDoc(updateRef, { status: 'staged', uploadedChunkCount: chunks.length }, { merge: true });
  return { updateId, checksum: comparison.checksum };
}

// 4. Verify server inventory update (P0-4 Hardened Deep Chunk & Payload Verification)
export async function verifyServerInventoryUpdate(
  catalogVersionId: string,
  updateId: string,
  expectedChecksum: string,
  expectedCount: number
): Promise<boolean> {
  const updateRef = doc(db, 'catalog_versions', catalogVersionId, 'inventory_updates', updateId);
  const snap = await getDoc(updateRef);
  if (!snap.exists()) throw new Error('وثيقة تحديث المخزون غير موجودة.');

  const data = snap.data();
  // 1. update document exists (checked above)
  // 2. update.catalogVersionId exists
  if (!data.catalogVersionId || data.catalogVersionId !== catalogVersionId) {
    throw new Error('فشل التحقق: معرف الكتالوج في وثيقة التحديث غير مطابق.');
  }
  // 3. update.baseRevision is valid
  if (typeof data.baseRevision !== 'number' || data.baseRevision < 0) {
    throw new Error('فشل التحقق: المراجعة الأساسية (baseRevision) غير صالحة.');
  }
  // 4. update.targetRevision == baseRevision + 1
  if (data.targetRevision !== data.baseRevision + 1) {
    throw new Error(`فشل التحقق: المراجعة المستهدفة (${data.targetRevision}) يجب أن تساوي baseRevision + 1 (${data.baseRevision + 1}).`);
  }
  // 5. chunkCount is valid
  if (typeof data.chunkCount !== 'number' || data.chunkCount <= 0) {
    throw new Error('فشل التحقق: عدد الـ Chunks غير صالح في وثيقة التحديث.');
  }
  // 14. uploadedChunkCount == chunkCount
  if (data.uploadedChunkCount !== data.chunkCount) {
    throw new Error(`فشل التحقق: عدد الـ Chunks المرفوعة (${data.uploadedChunkCount}) لا يطابق الإجمالي (${data.chunkCount}).`);
  }
  if (data.checksum !== expectedChecksum) {
    throw new Error('بصمة الـ SHA-256 لتحديث المخزون غير مطابقة.');
  }
  if (data.changedProductCount !== expectedCount) {
    throw new Error(`عدد الأصناف المتغيرة (${data.changedProductCount}) لا يطابق المتوقع (${expectedCount}).`);
  }

  // 6. Exactly all expected delta chunks exist
  const chunksColRef = collection(db, 'catalog_versions', catalogVersionId, 'inventory_updates', updateId, 'chunks');
  const chunksSnap = await getDocs(chunksColRef);
  if (chunksSnap.size !== data.chunkCount) {
    throw new Error(`فشل التحقق: عدد الـ Chunks على السحابة (${chunksSnap.size}) لا يطابق المتوقع (${data.chunkCount}).`);
  }

  const chunksByIndex = new Map<number, any>();
  const seenIndexes = new Set<number>();
  chunksSnap.forEach(d => {
    const cData = d.data();
    const idx = cData.chunkIndex;
    if (typeof idx !== 'number') {
      throw new Error(`فشل التحقق: chunkIndex غير صالح في دلتا chunk ${d.id}.`);
    }
    if (seenIndexes.has(idx)) {
      throw new Error(`فشل التحقق: تكرار chunkIndex (${idx}) في دلتا التحديث.`);
    }
    seenIndexes.add(idx);
    chunksByIndex.set(idx, cData);
  });

  // 7. No missing indexes (0 ... chunkCount - 1)
  for (let i = 0; i < data.chunkCount; i++) {
    if (!chunksByIndex.has(i)) {
      throw new Error(`فشل التحقق: دلتا Chunk رقم ${i} مفقود على السحابة.`);
    }
  }

  const reconstructedDeltaProducts: NormalizedProduct[] = [];
  const seenItemCodes = new Set<string>();

  for (let i = 0; i < data.chunkCount; i++) {
    const cData = chunksByIndex.get(i)!;
    if (!cData.payloadJson || typeof cData.payloadJson !== 'string' || cData.payloadJson.trim() === '') {
      throw new Error(`فشل التحقق: دلتا Chunk رقم ${i} لا يحتوي على حمولة (payloadJson).`);
    }

    // 8. Each delta chunk checksum passes
    const computedChecksum = await computeSha256Checksum(cData.payloadJson);
    if (cData.checksum && cData.checksum !== computedChecksum) {
      throw new Error(`فشل التحقق: بصمة دلتا Chunk رقم ${i} غير مطابقة.`);
    }

    // 9. Deserializes successfully
    let prods: NormalizedProduct[];
    try {
      prods = deserializeCatalogChunk(cData.payloadJson);
    } catch (e: any) {
      throw new Error(`فشل التحقق: تعذر فك تشفير دلتا Chunk رقم ${i}: ${e.message}`);
    }

    if (cData.productCount !== undefined && cData.productCount !== prods.length) {
      throw new Error(`فشل التحقق: عدد الأصناف في دلتا Chunk ${i} (${cData.productCount}) لا يطابق الفعلي (${prods.length}).`);
    }

    // 10. Valid itemCode & 11. itemCode appears at most once in whole delta
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

  // 12. Actual delta product count matches metadata
  if (reconstructedDeltaProducts.length !== expectedCount) {
    throw new Error(`فشل التحقق: مجموع أصناف الدلتا (${reconstructedDeltaProducts.length}) لا يطابق المتوقع (${expectedCount}).`);
  }

  // 13. Update full checksum matches reconstructed delta checksum
  const sortedDelta = sortProductsDeterministically(reconstructedDeltaProducts);
  const reconstructedFullChecksum = await computeSha256Checksum(sortedDelta);
  if (reconstructedFullChecksum !== data.checksum) {
    throw new Error(`فشل التحقق: بصمة الدلتا المجمعة (${reconstructedFullChecksum}) لا تطابق بصمة التحديث (${data.checksum}).`);
  }

  // Only after successful verification:
  await setDoc(updateRef, { status: 'verified', verifiedChunkCount: data.chunkCount }, { merge: true });
  await recordAuditLog('inventory_update_verified', catalogVersionId, { updateId, targetRevision: data.targetRevision, productCount: reconstructedDeltaProducts.length });

  return true;
}

// 5. Publish inventory update atomically (P0-5 Active Catalog & Revision Validation Gate)
export async function publishInventoryUpdate(
  catalogVersionId: string,
  updateId: string,
  expectedBaseRevision: number
): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('عملية النشر مرفوضة: يجب تسجيل الدخول كمسؤول.');
  const uid = currentUser.uid;

  const globalRef = doc(db, 'app_settings', 'global');
  const updateRef = doc(db, 'catalog_versions', catalogVersionId, 'inventory_updates', updateId);
  const versionRef = doc(db, 'catalog_versions', catalogVersionId);

  await runTransaction(db, async (transaction) => {
    const globalSnap = await transaction.get(globalRef);
    if (!globalSnap.exists()) {
      throw new Error('وثيقة app_settings/global غير موجودة.');
    }
    const globalData = globalSnap.data();
    const activeCatalogId = globalData.activeCatalogVersionId;
    const currentRev = globalData.activeInventoryRevision ?? 0;

    const updateSnap = await transaction.get(updateRef);
    if (!updateSnap.exists()) {
      throw new Error('تحديث المخزون غير موجود.');
    }
    const updateData = updateSnap.data();

    // P0-5 Strict Validations:
    // 1. update.status == "verified"
    if (updateData.status !== 'verified') {
      throw new Error('يجب التحقق من التحديث السحابي بنجاح (status == verified) قبل النشر.');
    }

    // 2. update.catalogVersionId == app_settings/global.activeCatalogVersionId
    if (updateData.catalogVersionId !== activeCatalogId) {
      throw new Error(`تعذر النشر: التحديث يتبع كتالوج آخر (${updateData.catalogVersionId}) غير الكتالوج النشط حالياً (${activeCatalogId}).`);
    }

    // 3. update.baseRevision == app_settings/global.activeInventoryRevision
    if (updateData.baseRevision !== currentRev) {
      throw new Error(`تعذر النشر: baseRevision للتحديث (${updateData.baseRevision}) لا يطابق المراجعة السحابية الحالية (${currentRev}).`);
    }

    // 4. update.targetRevision == update.baseRevision + 1
    if (updateData.targetRevision !== updateData.baseRevision + 1) {
      throw new Error(`تعذر النشر: targetRevision (${updateData.targetRevision}) يجب أن يساوي baseRevision + 1 (${updateData.baseRevision + 1}).`);
    }

    // 5. verifiedChunkCount == chunkCount
    if (updateData.verifiedChunkCount !== updateData.chunkCount) {
      throw new Error(`تعذر النشر: verifiedChunkCount (${updateData.verifiedChunkCount}) لا يساوي chunkCount (${updateData.chunkCount}).`);
    }

    // 6. uploadedChunkCount == chunkCount
    if (updateData.uploadedChunkCount !== updateData.chunkCount) {
      throw new Error(`تعذر النشر: uploadedChunkCount (${updateData.uploadedChunkCount}) لا يساوي chunkCount (${updateData.chunkCount}).`);
    }

    if (currentRev !== expectedBaseRevision) {
      throw new Error(`تعذر النشر: تم تعديل المخزون في جلسة أخرى (المراجعة الحالية ${currentRev}، المتوقعة ${expectedBaseRevision}).`);
    }

    const newRevision = updateData.targetRevision;

    transaction.set(globalRef, {
      activeCatalogVersionId: catalogVersionId,
      activeInventoryRevision: newRevision,
      lastInventoryUpdateId: updateId,
      updatedAt: serverTimestamp(),
      updatedByUid: uid,
    }, { merge: true });

    transaction.set(updateRef, {
      status: 'published',
      publishedAt: serverTimestamp(),
      publishedByUid: uid,
    }, { merge: true });

    transaction.set(versionRef, {
      activeInventoryRevision: newRevision,
      lastInventoryUpdateId: updateId,
      updatedAt: serverTimestamp(),
      updatedByUid: uid,
    }, { merge: true });
  });

  await recordAuditLog('inventory_update_published', catalogVersionId, { updateId, targetRevision: expectedBaseRevision + 1 });
}
