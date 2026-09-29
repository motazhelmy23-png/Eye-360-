import { describe, it, expect } from 'vitest';

describe('Eye 360 Dual Login & Portal Authorization Tests', () => {
  // Helper simulating portal authorization check
  const evaluateLoginPortalAccess = (
    portal: 'admin' | 'branch',
    userAccount: { role: 'admin' | 'sales' | 'unauthorized'; isActive: boolean; branchId?: string },
    branchRecord?: { isActive: boolean } | null
  ) => {
    // 1. Inactive user account
    if (!userAccount.isActive) {
      return { allowed: false, reason: 'حساب غير مفعل أو معطل' };
    }

    if (portal === 'admin') {
      if (userAccount.role !== 'admin') {
        return { allowed: false, wrongPortal: true, expectedPortal: 'branch', guidance: 'هذا حساب فرع. استخدم بوابة دخول الفروع.' };
      }
      return { allowed: true };
    }

    if (portal === 'branch') {
      if (userAccount.role !== 'sales') {
        return { allowed: false, wrongPortal: true, expectedPortal: 'admin', guidance: 'هذا حساب إدارة. استخدم بوابة دخول الإدارة.' };
      }
      if (!userAccount.branchId) {
        return { allowed: false, reason: 'هذا الحساب غير مرتبط بأي فرع.' };
      }
      if (!branchRecord || branchRecord.isActive !== true) {
        return { allowed: false, reason: 'الفرع المرتبط بهذا الحساب غير نشط. تواصل مع الإدارة.' };
      }
      return { allowed: true };
    }

    return { allowed: false, reason: 'بوابة غير معروفة' };
  };

  it('1. Admin portal + valid Admin -> allowed', () => {
    const adminAccount = { role: 'admin' as const, isActive: true };
    const res = evaluateLoginPortalAccess('admin', adminAccount);
    expect(res.allowed).toBe(true);
  });

  it('2. Admin portal + Sales -> denied with wrong portal guidance', () => {
    const salesAccount = { role: 'sales' as const, isActive: true, branchId: 'AUC' };
    const res = evaluateLoginPortalAccess('admin', salesAccount);
    expect(res.allowed).toBe(false);
    expect(res.wrongPortal).toBe(true);
    expect(res.guidance).toBe('هذا حساب فرع. استخدم بوابة دخول الفروع.');
  });

  it('3. Branch portal + active Sales + active Branch -> allowed', () => {
    const salesAccount = { role: 'sales' as const, isActive: true, branchId: 'AUC' };
    const branchRecord = { isActive: true };
    const res = evaluateLoginPortalAccess('branch', salesAccount, branchRecord);
    expect(res.allowed).toBe(true);
  });

  it('4. Branch portal + Admin -> denied with wrong portal guidance', () => {
    const adminAccount = { role: 'admin' as const, isActive: true };
    const res = evaluateLoginPortalAccess('branch', adminAccount);
    expect(res.allowed).toBe(false);
    expect(res.wrongPortal).toBe(true);
    expect(res.guidance).toBe('هذا حساب إدارة. استخدم بوابة دخول الإدارة.');
  });

  it('5. Branch portal + disabled Sales -> denied', () => {
    const disabledSales = { role: 'sales' as const, isActive: false, branchId: 'AUC' };
    const branchRecord = { isActive: true };
    const res = evaluateLoginPortalAccess('branch', disabledSales, branchRecord);
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe('حساب غير مفعل أو معطل');
  });

  it('6. Branch portal + inactive Branch -> denied', () => {
    const salesAccount = { role: 'sales' as const, isActive: true, branchId: 'AUC' };
    const inactiveBranch = { isActive: false };
    const res = evaluateLoginPortalAccess('branch', salesAccount, inactiveBranch);
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe('الفرع المرتبط بهذا الحساب غير نشط. تواصل مع الإدارة.');
  });

  it('7. Missing Branch -> denied', () => {
    const salesWithoutBranch = { role: 'sales' as const, isActive: true, branchId: '' };
    const res = evaluateLoginPortalAccess('branch', salesWithoutBranch, { isActive: true });
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe('هذا الحساب غير مرتبط بأي فرع.');
  });
});
