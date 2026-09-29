import { getFirebaseDiagnostics } from './firebaseClient';
import { UserProfile } from './authService';

export async function checkIndexedDBStatus(): Promise<string> {
  return new Promise((resolve) => {
    if (!window.indexedDB) {
      resolve('غير متاح');
      return;
    }
    const request = window.indexedDB.open('Eye360LocalCache');
    request.onerror = () => resolve('خطأ في الفتح');
    request.onsuccess = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      db.close();
      resolve('متصل وجاهز');
    };
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('metadata')) {
        db.createObjectStore('metadata');
      }
      if (!db.objectStoreNames.contains('products')) {
        db.createObjectStore('products', { keyPath: 'itemCode' });
      }
    };
  });
}

export async function getSystemDiagnostics(profile: UserProfile | null) {
  const fbDiag = getFirebaseDiagnostics();
  const idbStatus = await checkIndexedDBStatus();

  return {
    projectId: fbDiag.projectId,
    firestoreDatabaseId: fbDiag.firestoreDatabaseId,
    authStatus: profile ? 'مفعل ومسجل دخول' : 'غير مسجل دخول',
    authenticatedUid: profile?.uid || 'لا يوجد',
    verifiedRole: profile?.role || 'غير متحقق',
    branchId: profile?.branchId || 'غير محدد',
    firestoreConnectivity: fbDiag.firestoreStatus,
    indexedDbStatus: idbStatus,
  };
}
