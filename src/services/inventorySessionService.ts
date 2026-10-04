import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  query, 
  where, 
  orderBy, 
  serverTimestamp, 
  writeBatch,
  runTransaction
} from 'firebase/firestore';
import { db } from './firebaseClient';
import { 
  InventorySession, 
  BaselineProductEntry, 
  BaselineChunk, 
  ProductCountRecord, 
  VarianceReviewItem,
  SessionStatus
} from '../types/inventorySession';
import { NormalizedProduct } from '../types/inventory';
import { getLocalIndexedDbState, searchLocalProducts } from './indexedDbService';
import { UserProfile } from './authService';
import { getBranch } from './branchService';
import { recordAuditEvent } from './auditLogService';
import * as XLSX from 'xlsx';

const SESSIONS_COLL = 'inventory_sessions';
const MAX_CHUNK_BYTES = 450 * 1024; // 450 KB safe target well below Firestore 1 MiB limit
const MAX_HISTORY_ENTRIES = 30;

/**
 * Calculates byte size of an object in UTF-8
 */
export function estimateObjectByteSize(obj: any): number {
  try {
    return new TextEncoder().encode(JSON.stringify(obj)).length;
  } catch {
    return JSON.stringify(obj).length * 2;
  }
}

/**
 * Creates byte-bounded baseline chunks
 */
export function chunkBaselineEntriesByBytes(entries: BaselineProductEntry[], maxBytes: number = MAX_CHUNK_BYTES): BaselineChunk[] {
  if (entries.length === 0) return [];
  const chunks: BaselineChunk[] = [];
  let currentChunkProducts: BaselineProductEntry[] = [];
  let currentChunkBytes = 100; // Overhead for chunk object envelope

  for (const entry of entries) {
    const entryBytes = estimateObjectByteSize(entry) + 2;
    if (currentChunkProducts.length > 0 && (currentChunkBytes + entryBytes > maxBytes)) {
      chunks.push({
        chunkIndex: chunks.length,
        products: currentChunkProducts,
      });
      currentChunkProducts = [];
      currentChunkBytes = 100;
    }
    currentChunkProducts.push(entry);
    currentChunkBytes += entryBytes;
  }

  if (currentChunkProducts.length > 0) {
    chunks.push({
      chunkIndex: chunks.length,
      products: currentChunkProducts,
    });
  }

  return chunks;
}

/**
 * Creates a new DRAFT inventory session
 */
export async function createDraftSession(params: {
  name: string;
  branchId: string;
  branchName: string;
  inventoryLocationId: string;
  inventoryLocationName: string;
  type: 'FULL' | 'CATEGORY' | 'SELECTED_PRODUCTS';
  category?: string | null;
  selectedItemCodes?: string[] | null;
  assignedUserIds: string[];
  assignedUserNames?: string[];
  currentUser: UserProfile;
}): Promise<string> {
  const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const sessionRef = doc(db, SESSIONS_COLL, sessionId);

  const sessionDoc: InventorySession = {
    id: sessionId,
    name: params.name.trim(),
    branchId: params.branchId,
    branchName: params.branchName,
    inventoryLocationId: params.inventoryLocationId,
    inventoryLocationName: params.inventoryLocationName,
    type: params.type,
    category: params.category || null,
    selectedItemCodes: params.selectedItemCodes || null,
    assignedUserIds: params.assignedUserIds,
    assignedUserNames: params.assignedUserNames || [],
    blindCount: true,
    status: 'DRAFT',
    baselineCatalogVersionId: null,
    baselineRevision: null,
    baselineProductCount: 0,
    baselineChunkCount: 0,
    baselineChecksum: null,
    baselineSnapshotStatus: 'NOT_CREATED',
    createdAt: serverTimestamp(),
    createdByUid: params.currentUser.uid,
    createdByName: params.currentUser.name || params.currentUser.email || 'Admin',
  };

  await setDoc(sessionRef, sessionDoc);
  return sessionId;
}

/**
 * Activates a DRAFT session by snapshotting baseline products into chunks
 */
export async function activateSession(
  sessionId: string, 
  currentUser: UserProfile,
  cachedProducts?: NormalizedProduct[]
): Promise<void> {
  const sessionRef = doc(db, SESSIONS_COLL, sessionId);
  const sessionSnap = await getDoc(sessionRef);

  if (!sessionSnap.exists()) {
    throw new Error('جلسة الجرد غير موجودة.');
  }

  const session = sessionSnap.data() as InventorySession;

  if (session.status !== 'DRAFT') {
    throw new Error(`لا يمكن تفعيل الجلسة لأن حالتها الحالية هي ${session.status}`);
  }

  if (!session.assignedUserIds || session.assignedUserIds.length === 0) {
    throw new Error('يجب تعيين موظف واحد على الأقل قبل بدء جلسة الجرد.');
  }

  // 1. Check branch validity
  const branch = await getBranch(session.branchId);
  if (!branch || !branch.isActive) {
    throw new Error('الفرع المحدد غير نشط أو غير موجود.');
  }

  // 2. Check cloud catalog version & revision
  const globalDocSnap = await getDoc(doc(db, 'app_settings', 'global'));
  if (!globalDocSnap.exists()) {
    throw new Error('إعدادات النظام العامة غير متوفرة.');
  }
  const globalData = globalDocSnap.data();
  const activeCatalogVersionId = globalData?.activeCatalogVersionId;
  const activeInventoryRevision = globalData?.activeInventoryRevision ?? 0;

  if (!activeCatalogVersionId) {
    throw new Error('لا يوجد كتالوج نشط حالياً.');
  }

  // 3. Check local IndexedDB state against cloud
  const localState = await getLocalIndexedDbState();
  if (
    localState.localCatalogVersionId !== activeCatalogVersionId ||
    localState.localInventoryRevision !== activeInventoryRevision
  ) {
    throw new Error('يجب مزامنة البيانات قبل بدء جلسة الجرد.');
  }

  // 4. Load all local products
  const products = cachedProducts && cachedProducts.length > 0 
    ? cachedProducts 
    : await searchLocalProducts('', 25000);

  // 5. Filter expected products for baseline snapshot
  let expectedProducts: NormalizedProduct[] = [];
  const locId = session.inventoryLocationId;

  if (session.type === 'FULL') {
    expectedProducts = products.filter(p => p.active && (p.stocks[locId] || 0) > 0);
  } else if (session.type === 'CATEGORY') {
    if (!session.category) {
      throw new Error('التصنيف غير محدد لجلسة جرد التصنيف.');
    }
    expectedProducts = products.filter(
      p => p.active && p.category === session.category && (p.stocks[locId] || 0) > 0
    );
  } else if (session.type === 'SELECTED_PRODUCTS') {
    const selectedSet = new Set(session.selectedItemCodes || []);
    if (selectedSet.size === 0) {
      throw new Error('لم يتم تحديد أي أصناف لجلسة الجرد.');
    }
    if (selectedSet.size > 500) {
      throw new Error('الحد الأقصى للأصناف المحددة هو 500 صنف.');
    }
    expectedProducts = products.filter(p => p.active && selectedSet.has(p.itemCode));
  }

  // Map to lightweight baseline entries
  const baselineEntries: BaselineProductEntry[] = expectedProducts.map(p => ({
    itemCode: p.itemCode,
    name: p.name || null,
    barcode: p.barcode || null,
    modelCode: p.modelCode || null,
    category: p.category || null,
    baselineQty: p.stocks[locId] || 0,
  }));

  // Byte-bounded Chunking
  const chunks: BaselineChunk[] = chunkBaselineEntriesByBytes(baselineEntries, MAX_CHUNK_BYTES);

  // Write chunks
  const chunksColl = collection(db, SESSIONS_COLL, sessionId, 'baseline_chunks');
  
  // Set status to UPLOADING
  await updateDoc(sessionRef, {
    baselineSnapshotStatus: 'UPLOADING',
    baselineCatalogVersionId: activeCatalogVersionId,
    baselineRevision: activeInventoryRevision,
    baselineProductCount: baselineEntries.length,
    baselineChunkCount: chunks.length,
  });

  const batch = writeBatch(db);
  for (let i = 0; i < chunks.length; i++) {
    const chunkDocRef = doc(chunksColl, `chunk_${i}`);
    batch.set(chunkDocRef, chunks[i]);
  }
  await batch.commit();

  // Generate a basic checksum (e.g. hash of itemCodes count + sum)
  const checksum = `chk_${baselineEntries.length}_${baselineEntries.reduce((acc, curr) => acc + curr.baselineQty, 0)}`;

  // Transition to ACTIVE atomically
  await updateDoc(sessionRef, {
    status: 'ACTIVE',
    baselineSnapshotStatus: 'VERIFIED',
    baselineChecksum: checksum,
    startedAt: serverTimestamp(),
    startedByUid: currentUser.uid,
  });

  await recordAuditEvent('inventory_session_started', {
    entityType: 'inventory',
    targetId: sessionId,
    targetName: session.name,
    details: {
      branchId: session.branchId,
      branchName: session.branchName,
      type: session.type,
      baselineProductCount: baselineEntries.length,
    },
    severity: 'info',
  });
}

/**
 * Gets list of inventory sessions (with optional branch filter)
 */
export async function getInventorySessions(filterBranchId?: string, assignedToUid?: string): Promise<InventorySession[]> {
  const sessionsColl = collection(db, SESSIONS_COLL);
  let q = query(sessionsColl, orderBy('createdAt', 'desc'));

  if (filterBranchId) {
    q = query(sessionsColl, where('branchId', '==', filterBranchId), orderBy('createdAt', 'desc'));
  }

  const snapshot = await getDocs(q);
  const results: InventorySession[] = [];

  snapshot.forEach(docSnap => {
    const data = docSnap.data() as InventorySession;
    if (assignedToUid) {
      if (data.assignedUserIds && data.assignedUserIds.includes(assignedToUid)) {
        results.push(data);
      }
    } else {
      results.push(data);
    }
  });

  return results;
}

/**
 * Gets a single inventory session by ID
 */
export async function getSessionById(sessionId: string): Promise<InventorySession | null> {
  const docRef = doc(db, SESSIONS_COLL, sessionId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;
  return snap.data() as InventorySession;
}

/**
 * Cancels a DRAFT or ACTIVE session
 */
export async function cancelSession(sessionId: string, reason: string, currentUser: UserProfile): Promise<void> {
  const sessionRef = doc(db, SESSIONS_COLL, sessionId);
  const snap = await getDoc(sessionRef);
  if (!snap.exists()) throw new Error('جلسة الجرد غير موجودة.');
  const session = snap.data() as InventorySession;

  if (session.status !== 'DRAFT' && session.status !== 'ACTIVE') {
    throw new Error('لا يمكن إلغاء الجلسة إلا في حالتي المسودة أو الجرد النشط.');
  }

  await updateDoc(sessionRef, {
    status: 'CANCELLED',
    cancelledAt: serverTimestamp(),
    cancelledByUid: currentUser.uid,
    cancellationReason: reason.trim(),
  });
}

/**
 * Transitions an ACTIVE session to REVIEW
 */
export async function closeCountToReview(sessionId: string, currentUser: UserProfile): Promise<void> {
  const sessionRef = doc(db, SESSIONS_COLL, sessionId);
  const snap = await getDoc(sessionRef);
  if (!snap.exists()) throw new Error('جلسة الجرد غير موجودة.');
  const session = snap.data() as InventorySession;

  if (session.status !== 'ACTIVE') {
    throw new Error('يمكن الانتقال للمراجعة فقط من حالة الجرد النشط (ACTIVE).');
  }

  await updateDoc(sessionRef, {
    status: 'REVIEW',
    reviewStartedAt: serverTimestamp(),
    reviewStartedByUid: currentUser.uid,
  });
}

/**
 * Completes a REVIEW session
 */
export async function completeSession(
  sessionId: string, 
  currentUser: UserProfile, 
  uncountedCount: number, 
  pendingRecountCount: number
): Promise<void> {
  if (uncountedCount > 0) {
    throw new Error(`لا يمكن اعتماد الجلسة ويوجد ${uncountedCount} أصناف متوقعة لم يتم جردها بعد.`);
  }
  if (pendingRecountCount > 0) {
    throw new Error(`لا يمكن اعتماد الجلسة وتوجد ${pendingRecountCount} طلبات إعادة جرد معلقة.`);
  }

  const sessionRef = doc(db, SESSIONS_COLL, sessionId);
  const snap = await getDoc(sessionRef);
  if (!snap.exists()) throw new Error('جلسة الجرد غير موجودة.');
  const session = snap.data() as InventorySession;

  if (session.status !== 'REVIEW') {
    throw new Error('يمكن اعتماد وإنهاء الجلسة فقط من حالة المراجعة (REVIEW).');
  }

  await updateDoc(sessionRef, {
    status: 'COMPLETED',
    completedAt: serverTimestamp(),
    completedByUid: currentUser.uid,
  });
}

/**
 * Saves a physical product count (First Count or Edit)
 */
export async function saveProductCount(params: {
  sessionId: string;
  itemCode: string;
  branchId: string;
  quantity: number;
  currentUser: UserProfile;
  unexpected?: boolean;
  isEdit?: boolean;
}): Promise<void> {
  const countDocRef = doc(db, SESSIONS_COLL, params.sessionId, 'counts', params.itemCode);

  await runTransaction(db, async (transaction) => {
    const countSnap = await transaction.get(countDocRef);

    if (!countSnap.exists()) {
      // First Count
      const newRecord: ProductCountRecord = {
        itemCode: params.itemCode,
        branchId: params.branchId,
        currentQty: params.quantity,
        firstQty: params.quantity,
        firstCountedByUid: params.currentUser.uid,
        firstCountedByName: params.currentUser.name || params.currentUser.email || 'Sales',
        firstCountedAt: serverTimestamp(),
        lastUpdatedByUid: params.currentUser.uid,
        lastUpdatedByName: params.currentUser.name || params.currentUser.email || 'Sales',
        lastUpdatedAt: serverTimestamp(),
        editCount: 0,
        history: [],
        status: 'COUNTED',
        unexpected: !!params.unexpected,
      };
      transaction.set(countDocRef, newRecord);
    } else {
      if (!params.isEdit) {
        throw new Error('تم تسجيل هذا الصنف بواسطة مستخدم آخر.');
      }

      // Edit existing count
      const existing = countSnap.data() as ProductCountRecord;
      const historyEntry = {
        qty: existing.currentQty,
        changedByUid: params.currentUser.uid,
        changedByName: params.currentUser.name || params.currentUser.email || 'Sales',
        changedAt: new Date().toISOString(),
      };

      const cappedHistory = [...(existing.history || []), historyEntry].slice(-MAX_HISTORY_ENTRIES);

      transaction.update(countDocRef, {
        currentQty: params.quantity,
        lastUpdatedByUid: params.currentUser.uid,
        lastUpdatedByName: params.currentUser.name || params.currentUser.email || 'Sales',
        lastUpdatedAt: serverTimestamp(),
        editCount: (existing.editCount || 0) + 1,
        history: cappedHistory,
        status: 'COUNTED',
      });
    }
  });
}

/**
 * Requests a recount for a specific product
 */
export async function requestRecount(sessionId: string, itemCode: string, currentUser: UserProfile): Promise<void> {
  const countDocRef = doc(db, SESSIONS_COLL, sessionId, 'counts', itemCode);
  await updateDoc(countDocRef, {
    recountRequested: true,
    status: 'RECOUNT_REQUIRED',
    recountRequestedAt: serverTimestamp(),
    recountRequestedByUid: currentUser.uid,
  });
}

/**
 * Saves a recount submitted by Sales
 */
export async function saveRecount(params: {
  sessionId: string;
  itemCode: string;
  quantity: number;
  currentUser: UserProfile;
}): Promise<void> {
  const countDocRef = doc(db, SESSIONS_COLL, params.sessionId, 'counts', params.itemCode);
  await updateDoc(countDocRef, {
    recountQty: params.quantity,
    recountedByUid: params.currentUser.uid,
    recountedByName: params.currentUser.name || params.currentUser.email || 'Sales',
    recountedAt: serverTimestamp(),
    status: 'RECOUNTED',
    recountRequested: false,
  });
}

/**
 * Loads all counts for a session
 */
export async function getSessionCounts(sessionId: string): Promise<Record<string, ProductCountRecord>> {
  const countsColl = collection(db, SESSIONS_COLL, sessionId, 'counts');
  const snap = await getDocs(countsColl);
  const countsMap: Record<string, ProductCountRecord> = {};
  snap.forEach(docSnap => {
    const data = docSnap.data() as ProductCountRecord;
    countsMap[data.itemCode] = data;
  });
  return countsMap;
}

/**
 * Loads all baseline product entries from chunk documents
 */
export async function getBaselineProducts(sessionId: string): Promise<BaselineProductEntry[]> {
  const chunksColl = collection(db, SESSIONS_COLL, sessionId, 'baseline_chunks');
  const snap = await getDocs(chunksColl);
  const products: BaselineProductEntry[] = [];
  
  snap.forEach(docSnap => {
    const chunk = docSnap.data() as BaselineChunk;
    if (chunk.products && Array.isArray(chunk.products)) {
      products.push(...chunk.products);
    }
  });

  return products;
}

/**
 * Assembles complete Variance Review Items by combining baseline entries and actual counts
 */
export function calculateVarianceReview(
  baselineProducts: BaselineProductEntry[],
  countsMap: Record<string, ProductCountRecord>,
  catalogProductsMap?: Record<string, NormalizedProduct>
): VarianceReviewItem[] {
  const items: VarianceReviewItem[] = [];
  const processedCodes = new Set<string>();

  // 1. Process all expected baseline products
  for (const bp of baselineProducts) {
    processedCodes.add(bp.itemCode);
    const countRecord = countsMap[bp.itemCode];

    if (!countRecord) {
      // Uncounted
      items.push({
        itemCode: bp.itemCode,
        name: bp.name || 'بدون اسم',
        barcode: bp.barcode || '—',
        modelCode: bp.modelCode || '—',
        category: bp.category || 'عام',
        baselineQty: bp.baselineQty,
        firstQty: null,
        currentQty: null,
        recountQty: null,
        finalCountQty: null,
        variance: null,
        semanticStatus: 'UNCOUNTED',
        countStatus: 'UNCOUNTED',
        unexpected: false,
      });
    } else {
      const finalCountQty = countRecord.recountQty !== null && countRecord.recountQty !== undefined 
        ? countRecord.recountQty 
        : countRecord.currentQty;
      const variance = finalCountQty - bp.baselineQty;

      let semanticStatus: 'MATCH' | 'SHORTAGE' | 'OVERAGE' | 'RECOUNT_REQUIRED' = 'MATCH';
      if (countRecord.status === 'RECOUNT_REQUIRED') {
        semanticStatus = 'RECOUNT_REQUIRED';
      } else if (variance === 0) {
        semanticStatus = 'MATCH';
      } else if (variance < 0) {
        semanticStatus = 'SHORTAGE';
      } else {
        semanticStatus = 'OVERAGE';
      }

      items.push({
        itemCode: bp.itemCode,
        name: bp.name || 'بدون اسم',
        barcode: bp.barcode || '—',
        modelCode: bp.modelCode || '—',
        category: bp.category || 'عام',
        baselineQty: bp.baselineQty,
        firstQty: countRecord.firstQty,
        currentQty: countRecord.currentQty,
        recountQty: countRecord.recountQty ?? null,
        finalCountQty,
        variance,
        semanticStatus,
        countStatus: countRecord.status,
        unexpected: !!countRecord.unexpected,
        firstCountedByName: countRecord.firstCountedByName,
        recountedByName: countRecord.recountedByName ?? undefined,
      });
    }
  }

  // 2. Process unexpected products (scanned items not in baseline)
  for (const [code, countRecord] of Object.entries(countsMap)) {
    if (!processedCodes.has(code)) {
      const catProd = catalogProductsMap ? catalogProductsMap[code] : undefined;
      const finalCountQty = countRecord.recountQty !== null && countRecord.recountQty !== undefined 
        ? countRecord.recountQty 
        : countRecord.currentQty;
      const baselineQty = 0;
      const variance = finalCountQty - baselineQty;

      let semanticStatus: 'MATCH' | 'SHORTAGE' | 'OVERAGE' | 'RECOUNT_REQUIRED' = 'OVERAGE';
      if (countRecord.status === 'RECOUNT_REQUIRED') {
        semanticStatus = 'RECOUNT_REQUIRED';
      } else if (variance === 0) {
        semanticStatus = 'MATCH';
      }

      items.push({
        itemCode: code,
        name: catProd?.name || 'صنف غير متوقع',
        barcode: catProd?.barcode || '—',
        modelCode: catProd?.modelCode || '—',
        category: catProd?.category || 'عام',
        baselineQty: 0,
        firstQty: countRecord.firstQty,
        currentQty: countRecord.currentQty,
        recountQty: countRecord.recountQty ?? null,
        finalCountQty,
        variance,
        semanticStatus,
        countStatus: countRecord.status,
        unexpected: true,
        firstCountedByName: countRecord.firstCountedByName,
        recountedByName: countRecord.recountedByName ?? undefined,
      });
    }
  }

  return items;
}

/**
 * Exports physical inventory report to XLSX
 */
export function exportInventoryReportXLSX(session: InventorySession, items: VarianceReviewItem[]): void {
  const rows = items.map(item => {
    let statusArabic = 'مطابق';
    if (item.semanticStatus === 'UNCOUNTED') statusArabic = 'لم يتم جرده';
    else if (item.semanticStatus === 'SHORTAGE') statusArabic = 'عجز';
    else if (item.semanticStatus === 'OVERAGE') statusArabic = 'زيادة';
    else if (item.semanticStatus === 'RECOUNT_REQUIRED') statusArabic = 'إعادة جرد مطلوبة';

    return {
      'كود الصنف (Item Code)': item.itemCode,
      'اسم الصنف (Product Name)': item.name,
      'الباركود (Barcode)': item.barcode,
      'كود الموديل (Model Code)': item.modelCode,
      'التصنيف (Category)': item.category,
      'الرصيد المرجعي (Baseline Qty)': item.baselineQty,
      'العد الأول (First Count)': item.firstQty ?? '—',
      'إعادة الجرد (Recount Qty)': item.recountQty ?? '—',
      'العد النهائي (Final Count)': item.finalCountQty ?? '—',
      'الفرق (Variance)': item.variance ?? '—',
      'الحالة (Status)': statusArabic,
      'صنف غير متوقع (Unexpected)': item.unexpected ? 'نعم' : 'لا',
      'الموظف (Counted By)': item.firstCountedByName || '—',
      'موظف إعادة الجرد (Recounted By)': item.recountedByName || '—',
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'تقرير الجرد الفعلي');

  const fileName = `Inventory_Report_${session.name.replace(/[^a-zA-Z0-9_\-\u0600-\u06FF]/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(workbook, fileName);
}
