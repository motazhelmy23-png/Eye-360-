import { doc, setDoc, collection, getDocs, query, orderBy, limit, serverTimestamp } from 'firebase/firestore';
import { db, auth } from './firebaseClient';
import * as XLSX from 'xlsx';

export type AuditEntityType = 'catalog' | 'account' | 'branch' | 'settings' | 'inventory' | 'security' | 'system';
export type AuditSeverity = 'info' | 'warning' | 'critical';

export interface AuditLogEntry {
  id: string;
  action: string;
  actionNameAr: string;
  entityType: AuditEntityType;
  targetId?: string;
  targetName?: string;
  uid: string;
  userName?: string;
  userRole?: string;
  timestamp: any;
  details: Record<string, any>;
  severity: AuditSeverity;
  ipOrDevice?: string;
}

const ACTION_METADATA: Record<string, { nameAr: string; entityType: AuditEntityType; severity: AuditSeverity }> = {
  // Catalog actions
  'catalog_upload_started': { nameAr: 'بدء رفع كتالوج جديد', entityType: 'catalog', severity: 'info' },
  'catalog_upload_resumed': { nameAr: 'استئناف رفع الكتالوج', entityType: 'catalog', severity: 'info' },
  'catalog_verified': { nameAr: 'اكتمال فحص ومطابقة الكتالوج', entityType: 'catalog', severity: 'info' },
  'catalog_activated': { nameAr: 'تفعيل كتالوج رئيسي جديد', entityType: 'catalog', severity: 'critical' },
  'inventory_update_started': { nameAr: 'بدء تحديث مخزون تفاضلي', entityType: 'catalog', severity: 'info' },
  'inventory_update_verified': { nameAr: 'مطابقة حزمة التحديث التفاضلي', entityType: 'catalog', severity: 'info' },
  'inventory_update_published': { nameAr: 'نشر تحديث مخزون فوري', entityType: 'catalog', severity: 'critical' },
  
  // Account actions
  'account_created': { nameAr: 'إنشاء حساب موظف مبيعات جديد', entityType: 'account', severity: 'warning' },
  'account_updated': { nameAr: 'تعديل بيانات حساب مبيعات', entityType: 'account', severity: 'warning' },
  'account_deleted': { nameAr: 'حذف حساب موظف مبيعات نهائياً', entityType: 'account', severity: 'critical' },
  'account_status_toggled': { nameAr: 'تغيير حالة تفعيل حساب', entityType: 'account', severity: 'warning' },

  // Branch actions
  'branch_created': { nameAr: 'إضافة فرع تشغيلي جديد', entityType: 'branch', severity: 'warning' },
  'branch_updated': { nameAr: 'تعديل بيانات فرع تشغيلي', entityType: 'branch', severity: 'warning' },
  'branch_status_toggled': { nameAr: 'تغيير حالة تفعيل فرع', entityType: 'branch', severity: 'warning' },

  // Settings actions
  'settings_updated': { nameAr: 'تعديل الإعدادات العامة للنظام', entityType: 'settings', severity: 'warning' },
  'settings_reset': { nameAr: 'استعادة ضبط المصنع للإعدادات', entityType: 'settings', severity: 'critical' },
  'cache_cleared': { nameAr: 'تفريغ الذاكرة المحلية (IndexedDB)', entityType: 'system', severity: 'warning' },
  'catalog_backup_exported': { nameAr: 'تصدير نسخة احتياطية من الكتالوج', entityType: 'system', severity: 'info' },

  // Inventory sessions
  'inventory_session_started': { nameAr: 'بدء جلسة جرد فعلي للفرع', entityType: 'inventory', severity: 'info' },
  'inventory_session_finalized': { nameAr: 'اعتماد وإغلاق جلسة الجرد', entityType: 'inventory', severity: 'critical' },
  'inventory_count_submitted': { nameAr: 'تسجيل حصر فعلي لأصناف', entityType: 'inventory', severity: 'info' },

  // Security
  'admin_login': { nameAr: 'تسجيل دخول لوحة الإدارة', entityType: 'security', severity: 'info' },
  'admin_logout': { nameAr: 'تسجيل خروج من النظام', entityType: 'security', severity: 'info' },
};

const LOCAL_AUDIT_KEY = 'eye360_audit_logs_local_mirror';
const inMemoryAuditLogs: AuditLogEntry[] = [];

/**
 * Record an immutable audit log entry.
 * Writes to Firestore 'audit_logs' collection and mirrors to local storage.
 */
export async function recordAuditEvent(
  action: string,
  params: {
    entityType?: AuditEntityType;
    targetId?: string;
    targetName?: string;
    details?: Record<string, any>;
    severity?: AuditSeverity;
    userName?: string;
    userRole?: string;
  } = {}
): Promise<AuditLogEntry> {
  const meta = ACTION_METADATA[action] || {
    nameAr: action,
    entityType: params.entityType || 'system',
    severity: params.severity || 'info',
  };

  const currentAuth = typeof auth !== 'undefined' ? auth.currentUser : null;
  const uid = currentAuth?.uid || 'system_admin';
  const userName = params.userName || currentAuth?.displayName || (currentAuth?.email ? currentAuth.email.split('@')[0] : 'مدير النظام');
  const userRole = params.userRole || 'admin';

  const logId = `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const nowIso = new Date().toISOString();

  const entry: AuditLogEntry = {
    id: logId,
    action,
    actionNameAr: meta.nameAr,
    entityType: params.entityType || meta.entityType,
    targetId: params.targetId || '',
    targetName: params.targetName || '',
    uid,
    userName,
    userRole,
    timestamp: nowIso,
    details: params.details || {},
    severity: params.severity || meta.severity,
    ipOrDevice: typeof navigator !== 'undefined' ? navigator.userAgent.substring(0, 80) : 'Browser Client',
  };

  inMemoryAuditLogs.unshift(entry);

  // 1. Mirror locally for instant UI availability
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(LOCAL_AUDIT_KEY);
      const existing: AuditLogEntry[] = raw ? JSON.parse(raw) : [];
      const updated = [entry, ...existing.slice(0, 499)];
      localStorage.setItem(LOCAL_AUDIT_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn('Local audit mirror error:', e);
    }
  }

  // 2. Write to Firestore 'audit_logs'
  try {
    if (db) {
      const auditRef = doc(db, 'audit_logs', logId);
      await setDoc(auditRef, {
        ...entry,
        timestamp: serverTimestamp(),
      });
    }
  } catch (err) {
    console.warn('Firestore audit log write notice:', err);
  }

  return entry;
}

/**
 * Fetch audit logs from Firestore, with fallback to local mirror and sample seed data if empty.
 */
export async function fetchAuditLogs(limitCount = 100): Promise<AuditLogEntry[]> {
  const logsMap = new Map<string, AuditLogEntry>();

  // In-memory logs
  inMemoryAuditLogs.forEach(l => logsMap.set(l.id, l));

  // 1. First load from local mirror
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(LOCAL_AUDIT_KEY);
      if (raw) {
        const localLogs: AuditLogEntry[] = JSON.parse(raw);
        localLogs.forEach(l => logsMap.set(l.id, l));
      }
    } catch (e) {
      console.warn('Error reading local audit mirror:', e);
    }
  }

  // 2. Query Firestore audit_logs collection
  try {
    if (db) {
      const colRef = collection(db, 'audit_logs');
      const q = query(colRef, orderBy('timestamp', 'desc'), limit(limitCount));
      const snap = await getDocs(q);

      snap.forEach((docSnap) => {
        const data = docSnap.data();
        let formattedTs = data.timestamp;
        if (data.timestamp && typeof data.timestamp.toDate === 'function') {
          formattedTs = data.timestamp.toDate().toISOString();
        } else if (data.timestamp && data.timestamp.seconds) {
          formattedTs = new Date(data.timestamp.seconds * 1000).toISOString();
        }

        const meta = ACTION_METADATA[data.action] || {
          nameAr: data.actionNameAr || data.action,
          entityType: data.entityType || 'system',
          severity: data.severity || 'info',
        };

        const entry: AuditLogEntry = {
          id: docSnap.id,
          action: data.action || 'system_event',
          actionNameAr: data.actionNameAr || meta.nameAr,
          entityType: data.entityType || meta.entityType,
          targetId: data.targetId || data.versionId || '',
          targetName: data.targetName || '',
          uid: data.uid || 'admin',
          userName: data.userName || 'مدير النظام',
          userRole: data.userRole || 'admin',
          timestamp: formattedTs || new Date().toISOString(),
          details: data.details || {},
          severity: data.severity || meta.severity,
          ipOrDevice: data.ipOrDevice || '',
        };
        logsMap.set(docSnap.id, entry);
      });
    }
  } catch (err) {
    console.warn('Could not fetch cloud audit logs (may be offline or using local demo):', err);
  }

  const result = Array.from(logsMap.values()).sort((a, b) => {
    const timeA = new Date(a.timestamp).getTime() || 0;
    const timeB = new Date(b.timestamp).getTime() || 0;
    return timeB - timeA;
  });

  // If no logs exist yet, generate initial baseline audit logs for immediate demonstration
  if (result.length === 0) {
    const initialLogs: AuditLogEntry[] = [
      {
        id: 'audit_init_1',
        action: 'catalog_activated',
        actionNameAr: 'تفعيل كتالوج رئيسي جديد',
        entityType: 'catalog',
        targetId: 'ver_cat_init_2026',
        targetName: 'كتالوج المنتجات والمخزون الأساسي',
        uid: 'adm_master',
        userName: 'المدير العام',
        userRole: 'admin',
        timestamp: new Date(Date.now() - 3600000 * 4).toISOString(),
        details: { productCount: 1450, chunkCount: 4, sourceFile: 'EYE360_Catalog_2026.xlsx' },
        severity: 'critical',
      },
      {
        id: 'audit_init_2',
        action: 'account_created',
        actionNameAr: 'إنشاء حساب موظف مبيعات جديد',
        entityType: 'account',
        targetId: 'sales_user_01',
        targetName: 'محمد عبد الله (فرع المهندسين)',
        uid: 'adm_master',
        userName: 'المدير العام',
        userRole: 'admin',
        timestamp: new Date(Date.now() - 3600000 * 24).toISOString(),
        details: { branchId: 'loc_01_mohandessin', role: 'sales', isActive: true },
        severity: 'warning',
      },
      {
        id: 'audit_init_3',
        action: 'inventory_update_published',
        actionNameAr: 'نشر تحديث مخزون فوري',
        entityType: 'catalog',
        targetId: 'upd_delta_001',
        targetName: 'تحديث الرصيد اليومي - فرع المعادي',
        uid: 'adm_master',
        userName: 'المدير العام',
        userRole: 'admin',
        timestamp: new Date(Date.now() - 3600000 * 48).toISOString(),
        details: { targetRevision: 2, affectedProductsCount: 85 },
        severity: 'critical',
      },
      {
        id: 'audit_init_4',
        action: 'settings_updated',
        actionNameAr: 'تعديل الإعدادات العامة للنظام',
        entityType: 'settings',
        targetId: 'global_config',
        targetName: 'إعدادات النظام العامة',
        uid: 'adm_master',
        userName: 'المدير العام',
        userRole: 'admin',
        timestamp: new Date(Date.now() - 3600000 * 72).toISOString(),
        details: { lowStockThreshold: 3, soundEffects: true },
        severity: 'warning',
      }
    ];

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(LOCAL_AUDIT_KEY, JSON.stringify(initialLogs));
      } catch {}
    }
    return initialLogs;
  }

  return result;
}

/**
 * Export audit logs to Excel (.xlsx) file
 */
export function exportAuditLogsToExcel(logs: AuditLogEntry[], filename?: string) {
  const rows = logs.map(l => ({
    'معرف السجل': l.id,
    'نوع العملية': l.actionNameAr,
    'رمز العملية': l.action,
    'القسم': l.entityType,
    'مستوى الأهمية': l.severity === 'critical' ? 'حرج' : l.severity === 'warning' ? 'تنبيه' : 'معلومات',
    'الهدف': l.targetName || l.targetId || '-',
    'المستخدم': l.userName || l.uid,
    'معرف المستخدم': l.uid,
    'التوقيت': new Date(l.timestamp).toLocaleString('ar-EG'),
    'التفاصيل': JSON.stringify(l.details),
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Audit Logs');
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  XLSX.writeFile(workbook, filename || `Eye360_Audit_Logs_${timestamp}.xlsx`);
}

/**
 * Export audit logs to JSON file
 */
export function exportAuditLogsToJson(logs: AuditLogEntry[], filename?: string) {
  const jsonString = JSON.stringify(logs, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  a.href = url;
  a.download = filename || `Eye360_Audit_Logs_${timestamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
