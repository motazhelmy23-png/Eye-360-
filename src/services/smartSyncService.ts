import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebaseClient';
import { getActiveCatalogMeta, getLocalIndexedDbState } from './indexedDbService';
import { quickCloudHealthCheck, rebuildLocalCacheFromCloud } from './dataIntegrityService';
import { syncMissedRevisions } from './missedRevisionSyncService';

let activeSyncPromise: Promise<{ synced: boolean; message: string; revision: number }> | null = null;

export async function smartStartupSync(onProgress?: (msg: string) => void): Promise<{ synced: boolean; message: string; revision: number }> {
  // Single-flight lock
  if (activeSyncPromise) {
    if (onProgress) onProgress('عملية مزامنة قيد التنفيذ بالفعل... جاري الانتظار.');
    return activeSyncPromise;
  }

  activeSyncPromise = (async () => {
    try {
      if (onProgress) onProgress('جاري التحقق من سلامة الاتصال والمزامنة الذكية...');

      let cloudHealth;
      try {
        cloudHealth = await quickCloudHealthCheck();
      } catch (err) {
        // Offline mode fallback
        const localState = await getLocalIndexedDbState();
        if (localState.localProductCount > 0) {
          if (onProgress) onProgress('وضع دون اتصال — البيانات من آخر مزامنة محلية.');
          return { synced: false, message: 'وضع دون اتصال — البيانات من آخر مزامنة', revision: localState.localInventoryRevision };
        }
        throw new Error('فشل الاتصال بالإنترنت ولا توجد بيانات محلية مسجلة.');
      }

      if (!cloudHealth.healthy || !cloudHealth.activeCatalogVersionId) {
        throw new Error('الكتالوج السحابي غير سليم.');
      }

      const localState = await getLocalIndexedDbState();
      const cloudVersionId = cloudHealth.activeCatalogVersionId;
      const cloudRevision = cloudHealth.activeInventoryRevision;
      const localVersionId = localState.localCatalogVersionId;
      const localRevision = localState.localInventoryRevision;

      // Scenario C: Empty local DB or different catalog version
      const isLocalEmptyOrDifferent = !localVersionId || localVersionId !== cloudVersionId || localState.localProductCount === 0;
      if (isLocalEmptyOrDifferent) {
        if (onProgress) onProgress('تم اكتشاف قاعدة بيانات محلية فارغة أو إصدار كتالوج جديد. جاري تنزيل الكتالوج الأساسي...');
        await rebuildLocalCacheFromCloud((stepName: string, pct: number) => {
          if (onProgress) onProgress(`تنزيل وبناء الكتالوج: ${stepName} (${pct}%)`);
        });
      }

      // Check current local state after baseline build
      const postBaselineState = await getLocalIndexedDbState();
      const currentLocalRev = postBaselineState.localInventoryRevision;

      // Scenario B: Local revision behind cloud revision
      if (currentLocalRev < cloudRevision) {
        if (onProgress) onProgress(`جاري تنزيل المراجعات الفائتة (المحلية Rev ${currentLocalRev} ← السحابية Rev ${cloudRevision})...`);
        const res = await syncMissedRevisions(onProgress);
        return { synced: true, message: `تم تطبيق ${res.updatesApplied} تحديث بنجاح — Rev ${res.finalRevision}`, revision: res.finalRevision };
      }

      // Scenario A: Same catalog version and revision
      if (onProgress) onProgress(`البيانات محدثة بالفعل — Rev ${cloudRevision}`);
      return { synced: false, message: `البيانات محدثة بالفعل — Rev ${cloudRevision}`, revision: cloudRevision };

    } finally {
      activeSyncPromise = null;
    }
  })();

  return activeSyncPromise;
}
