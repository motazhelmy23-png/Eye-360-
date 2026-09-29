import { doc, getDoc, setDoc, updateDoc, collection, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from './firebaseClient';
import { getActiveCatalogMeta, openCatalogDB } from './indexedDbService';

export interface BranchProfile {
  branchId: string;
  name: string;
  code: string;
  inventoryLocationId: string;
  isActive: boolean;
  allowCrossBranchStockView: boolean;
  createdAt?: any;
  createdByUid?: string;
  updatedAt?: any;
  updatedByUid?: string;
}

export async function getAllBranches(): Promise<BranchProfile[]> {
  const colRef = collection(db, 'branches');
  const snap = await getDocs(colRef);
  const branches: BranchProfile[] = [];
  snap.forEach(d => {
    branches.push({ branchId: d.id, ...d.data() } as BranchProfile);
  });
  return branches;
}

export interface CatalogLocation {
  id: string;
  name: string;
}

export function formatLocationDisplayName(locationId: string): string {
  if (!locationId) return '';
  return locationId
    .replace(/^loc_\d+_/, '')
    .replace(/_/g, ' ')
    .trim() || locationId;
}

export async function getActiveCatalogLocations(): Promise<CatalogLocation[]> {
  try {
    const globalRef = doc(db, 'app_settings', 'global');
    const globalSnap = await getDoc(globalRef);
    if (globalSnap.exists()) {
      const activeVersionId = globalSnap.data().activeCatalogVersionId;
      if (activeVersionId) {
        const verRef = doc(db, 'catalog_versions', activeVersionId);
        const verSnap = await getDoc(verRef);
        if (verSnap.exists()) {
          const locIds: string[] = verSnap.data().locationIds || [];
          if (locIds.length > 0) {
            return locIds.map(id => ({
              id,
              name: formatLocationDisplayName(id),
            }));
          }
        }
      }
    }
  } catch (err) {
    console.warn('Failed to load locations from cloud active catalog:', err);
  }

  // Fallback to local active catalog metadata in IndexedDB
  try {
    const meta = await getActiveCatalogMeta();
    if (meta && meta.activeCatalogVersionId) {
      const dbInstance = await openCatalogDB();
      const firstProd = await new Promise<any>((resolve) => {
        const tx = dbInstance.transaction(['products'], 'readonly');
        const store = tx.objectStore('products');
        const req = store.openCursor();
        req.onsuccess = () => {
          if (req.result && req.result.value) {
            resolve(req.result.value);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      });

      if (firstProd && firstProd.stocks) {
        const keys = Object.keys(firstProd.stocks);
        if (keys.length > 0) {
          return keys.map(id => ({
            id,
            name: formatLocationDisplayName(id),
          }));
        }
      }
    }
  } catch (err) {
    console.warn('Failed to load locations from local IndexedDB:', err);
  }

  return [];
}

const CACHED_BRANCH_KEY = 'eye360_branch_profile_cache';

export async function getBranch(branchId: string): Promise<BranchProfile | null> {
  try {
    const ref = doc(db, 'branches', branchId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const branch = { branchId: snap.id, ...snap.data() } as BranchProfile;
    try {
      localStorage.setItem(`${CACHED_BRANCH_KEY}_${branchId}`, JSON.stringify(branch));
    } catch {}
    return branch;
  } catch (err) {
    console.warn(`Failed to fetch branch ${branchId} from cloud, checking cache:`, err);
    try {
      const cached = localStorage.getItem(`${CACHED_BRANCH_KEY}_${branchId}`);
      if (cached) return JSON.parse(cached);
    } catch {}
    return null;
  }
}

export async function saveBranch(branch: BranchProfile, uid: string): Promise<void> {
  const ref = doc(db, 'branches', branch.branchId);
  const existing = await getDoc(ref);
  
  if (existing.exists()) {
    await updateDoc(ref, {
      name: branch.name,
      code: branch.code,
      inventoryLocationId: branch.inventoryLocationId,
      isActive: branch.isActive,
      allowCrossBranchStockView: branch.allowCrossBranchStockView,
      updatedAt: serverTimestamp(),
      updatedByUid: uid,
    });
  } else {
    await setDoc(ref, {
      name: branch.name,
      code: branch.code,
      inventoryLocationId: branch.inventoryLocationId,
      isActive: branch.isActive,
      allowCrossBranchStockView: branch.allowCrossBranchStockView,
      createdAt: serverTimestamp(),
      createdByUid: uid,
      updatedAt: serverTimestamp(),
      updatedByUid: uid,
    });
  }
}
