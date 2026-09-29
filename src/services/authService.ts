import { 
  signInWithEmailAndPassword, 
  signOut as fbSignOut, 
  onAuthStateChanged, 
  User as FirebaseUser 
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebaseClient';

export interface UserProfile {
  uid: string;
  email: string | null;
  role: 'admin' | 'sales' | 'unauthorized';
  name: string;
  branchId?: string;
  isActive: boolean;
  isOffline?: boolean;
  branchInactive?: boolean;
}

const CACHED_PROFILE_KEY = 'eye360_user_profile_cache';

export function getCachedUserProfile(uid: string): UserProfile | null {
  try {
    const raw = localStorage.getItem(`${CACHED_PROFILE_KEY}_${uid}`);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn('Failed to read cached profile', e);
  }
  return null;
}

export function setCachedUserProfile(profile: UserProfile): void {
  try {
    localStorage.setItem(`${CACHED_PROFILE_KEY}_${profile.uid}`, JSON.stringify(profile));
  } catch (e) {
    console.warn('Failed to cache profile', e);
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.warn('Firestore Operation Notice: ', JSON.stringify(errInfo));
}

export async function verifyUserRole(firebaseUser: FirebaseUser): Promise<UserProfile> {
  const uid = firebaseUser.uid;
  const email = firebaseUser.email;

  try {
    // 1. Check Admin profile
    const adminRef = doc(db, 'admins', uid);
    const adminSnap = await getDoc(adminRef);

    if (adminSnap.exists()) {
      const data = adminSnap.data();
      if (data.isActive && data.role === 'admin') {
        const p: UserProfile = {
          uid,
          email,
          role: 'admin',
          name: data.name || 'مدير النظام',
          isActive: true
        };
        setCachedUserProfile(p);
        return p;
      }
    }

    // 2. Check Sales / Branch profile
    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      const data = userSnap.data();
      if (data.isActive && data.role === 'sales' && data.branchId) {
        // Read branches/{branchId} and validate branch exists and isActive == true
        try {
          const branchRef = doc(db, 'branches', data.branchId);
          const branchSnap = await getDoc(branchRef);
          if (!branchSnap.exists() || branchSnap.data()?.isActive !== true) {
            return {
              uid,
              email,
              role: 'unauthorized',
              name: 'الفرع المرتبط بهذا الحساب غير نشط. تواصل مع الإدارة.',
              branchId: data.branchId,
              isActive: false,
              branchInactive: true,
            };
          }
        } catch (branchErr) {
          handleFirestoreError(branchErr, OperationType.GET, `branches/${data.branchId}`);
          const cached = getCachedUserProfile(uid);
          if (cached && cached.role === 'sales' && !cached.branchInactive) {
            return { ...cached, isOffline: true };
          }
          return {
            uid,
            email,
            role: 'unauthorized',
            name: 'تعذر الاتصال بالسحابة للتحقق من حالة الفرع',
            isActive: false,
            isOffline: true,
          };
        }

        const p: UserProfile = {
          uid,
          email,
          role: 'sales',
          name: data.name || 'مستخدم فرع',
          branchId: data.branchId,
          isActive: true
        };
        setCachedUserProfile(p);
        return p;
      }
    }

    // Valid Firebase user, but no valid profile or disabled
    return {
      uid,
      email,
      role: 'unauthorized',
      name: 'غير مصرح',
      isActive: false
    };

  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `admins/${uid} or users/${uid}`);

    // If device is offline or connection dropped, check for cached profile
    const cached = getCachedUserProfile(uid);
    if (cached && (cached.role === 'sales' || cached.role === 'admin')) {
      return {
        ...cached,
        isOffline: true,
      };
    }

    return {
      uid,
      email,
      role: 'unauthorized',
      name: 'تعذر الاتصال بالسحابة (وضع غير متصل)',
      isActive: false,
      isOffline: true,
    };
  }
}

export function isSalesAuthorizedWithActiveBranch(
  account: { role: string; isActive: boolean; branchId?: string },
  branch?: { isActive: boolean } | null
): boolean {
  return account.role === 'sales' &&
         account.isActive === true &&
         Boolean(account.branchId && account.branchId.trim().length > 0) &&
         Boolean(branch && branch.isActive === true);
}

export async function login(email: string, pass: string): Promise<UserProfile> {
  const creds = await signInWithEmailAndPassword(auth, email, pass);
  const profile = await verifyUserRole(creds.user);

  if (profile.role === 'unauthorized') {
    await fbSignOut(auth);
    if (profile.branchInactive) {
      throw new Error("الفرع المرتبط بهذا الحساب غير نشط. تواصل مع الإدارة.");
    }
    throw new Error("حساب Firebase موجود ولكن لم يتم منح صلاحية الصلاحيات أو الحساب غير مفعل أو تعذر الاتصال بالسحابة.");
  }

  return profile;
}

export async function logout(): Promise<void> {
  await fbSignOut(auth);
}

export function subscribeToAuth(callback: (profile: UserProfile | null) => void) {
  return onAuthStateChanged(auth, async (firebaseUser) => {
    if (!firebaseUser) {
      callback(null);
      return;
    }
    try {
      const profile = await verifyUserRole(firebaseUser);
      if (profile.role === 'unauthorized' && profile.branchInactive) {
        await fbSignOut(auth);
      }
      callback(profile);
    } catch {
      callback({
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        role: 'unauthorized',
        name: 'خطأ في التحقق',
        isActive: false
      });
    }
  });
}
