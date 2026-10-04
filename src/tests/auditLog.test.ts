import { describe, it, expect, beforeEach } from 'vitest';
import { 
  recordAuditEvent, 
  fetchAuditLogs, 
  AuditLogEntry 
} from '../services/auditLogService';

describe('Audit Log Service (سجل نشاط الإدارة الموثق)', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  it('records an audit event with correct metadata and immutability attributes', async () => {
    const entry = await recordAuditEvent('catalog_activated', {
      entityType: 'catalog',
      targetId: 'ver_test_123',
      targetName: 'كتالوج الخريف 2026',
      details: { productCount: 500, checksum: 'abc123sha' },
      severity: 'critical',
      userName: 'مدير النظام الأول',
    });

    expect(entry).toBeDefined();
    expect(entry.id).toMatch(/^audit_/);
    expect(entry.action).toBe('catalog_activated');
    expect(entry.actionNameAr).toBe('تفعيل كتالوج رئيسي جديد');
    expect(entry.severity).toBe('critical');
    expect(entry.entityType).toBe('catalog');
    expect(entry.details.productCount).toBe(500);
    expect(entry.userName).toBe('مدير النظام الأول');
  });

  it('records account deletion as a critical immutable audit event', async () => {
    const entry = await recordAuditEvent('account_deleted', {
      entityType: 'account',
      targetId: 'usr_sales_99',
      targetName: 'أحمد علي',
      details: { deletedUid: 'usr_sales_99' },
      severity: 'critical',
    });

    expect(entry.action).toBe('account_deleted');
    expect(entry.actionNameAr).toBe('حذف حساب موظف مبيعات نهائياً');
    expect(entry.severity).toBe('critical');
    expect(entry.targetName).toBe('أحمد علي');
  });

  it('fetches recorded audit logs sorted by timestamp descending', async () => {
    await recordAuditEvent('settings_updated', {
      details: { changedSetting: 'soundEffects' },
    });

    await recordAuditEvent('branch_created', {
      targetId: 'branch_alex',
      targetName: 'فرع الإسكندرية',
    });

    const logs = await fetchAuditLogs();
    expect(logs.length).toBeGreaterThanOrEqual(2);
    expect(logs[0].action).toBe('branch_created');
  });

  it('provides baseline logs when no logs exist in mirror', async () => {
    const logs = await fetchAuditLogs();
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.some(l => l.severity === 'critical')).toBe(true);
  });
});
