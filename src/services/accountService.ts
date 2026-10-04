import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from './firebaseClient';
import { UserProfile } from './authService';
import { recordAuditEvent } from './auditLogService';

export interface SalesAccountProfile {
  uid: string;
  role: 'sales';
  name: string;
  branchId: string;
  isActive: boolean;
  createdAt?: any;
  updatedAt?: any;
}

export async function getAllSalesAccounts(): Promise<SalesAccountProfile[]> {
  const colRef = collection(db, 'users');
  const snap = await getDocs(colRef);
  const accounts: SalesAccountProfile[] = [];
  snap.forEach(d => {
    const data = d.data();
    if (data.role === 'sales') {
      accounts.push({ uid: d.id, ...data } as SalesAccountProfile);
    }
  });
  return accounts;
}

export async function saveSalesAccount(account: SalesAccountProfile): Promise<void> {
  if (!account.uid || !account.uid.trim()) {
    throw new Error('معرف المستخدم (UID) مطلوب.');
  }
  if (!account.branchId) {
    throw new Error('يجب تحديد الفرع التابع للحساب.');
  }

  const ref = doc(db, 'users', account.uid);
  const existing = await getDoc(ref);

  if (existing.exists()) {
    await updateDoc(ref, {
      name: account.name,
      branchId: account.branchId,
      isActive: account.isActive,
      updatedAt: serverTimestamp(),
    });
    
    await recordAuditEvent('account_updated', {
      entityType: 'account',
      targetId: account.uid,
      targetName: account.name,
      details: {
        branchId: account.branchId,
        isActive: account.isActive,
      },
      severity: 'warning',
    });
  } else {
    await setDoc(ref, {
      role: 'sales',
      name: account.name,
      branchId: account.branchId,
      isActive: account.isActive,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await recordAuditEvent('account_created', {
      entityType: 'account',
      targetId: account.uid,
      targetName: account.name,
      details: {
        branchId: account.branchId,
        isActive: account.isActive,
      },
      severity: 'warning',
    });
  }
}

export async function deleteSalesAccount(uid: string, accountName?: string): Promise<void> {
  if (!uid || !uid.trim()) {
    throw new Error('معرف الحساب مطلوب للحذف.');
  }

  const ref = doc(db, 'users', uid);
  await deleteDoc(ref);

  await recordAuditEvent('account_deleted', {
    entityType: 'account',
    targetId: uid,
    targetName: accountName || uid,
    details: {
      deletedUid: uid,
    },
    severity: 'critical',
  });
}

