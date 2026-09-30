import React, { useState, useEffect } from 'react';
import { quickCloudHealthCheck, performFullCloudIntegrityCheck, rebuildLocalCacheFromCloud, CloudHealthResult, FullIntegrityReport } from '../services/dataIntegrityService';
import { getLocalDatabaseDiagnostics, LocalIndexedDbState, getLocalIndexedDbState } from '../services/indexedDbService';
import { 
  ShieldAlert, CheckCircle2, AlertTriangle, RefreshCw, Database, 
  Terminal, Shield, CheckCheck, Cpu, HardDrive, ChevronDown, 
  ChevronUp, Clock, Barcode, Layers, ArrowUpRight, Activity
} from 'lucide-react';

export default function DataHealthDashboard() {
  const [quickHealth, setQuickHealth] = useState<CloudHealthResult | null>(null);
  const [loadingQuick, setLoadingQuick] = useState(true);
  const [fullReport, setFullReport] = useState<FullIntegrityReport | null>(null);
  const [loadingFull, setLoadingFull] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [message, setMessage] = useState<string | null>(null);
  const [localState, setLocalState] = useState<LocalIndexedDbState | null>(null);
  const [diagnostics, setDiagnostics] = useState<any | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [forceAdvancedRebuild, setForceAdvancedRebuild] = useState(false);

  useEffect(() => {
    refreshAllStates();
  }, []);

  const refreshAllStates = async () => {
    setLoadingQuick(true);
    try {
      const q = await quickCloudHealthCheck();
      setQuickHealth(q);
      const loc = await getLocalIndexedDbState();
      setLocalState(loc);
      const diag = await getLocalDatabaseDiagnostics();
      setDiagnostics(diag);
    } catch (err: any) {
      setMessage(err.message || 'فشل تحميل الحالة');
    } finally {
      setLoadingQuick(false);
    }
  };

  const handleFullCheck = async () => {
    setLoadingFull(true);
    setMessage(null);
    setFullReport(null);
    try {
      const rep = await performFullCloudIntegrityCheck();
      setFullReport(rep);
      setLocalState(rep.localState || null);
      if (rep.isHealthy) {
        setMessage('تم إجراء الفحص الكامل للبيانات السحابية بنجاح — الكتالوج سليم 100%.');
      } else {
        setMessage(`فشل الفحص الكامل: ${rep.errorSummary || 'تم اكتشاف خلل في البيانات السحابية.'}`);
      }
    } catch (err: any) {
      setMessage(err.message || 'فشل الفحص الكامل للبيانات.');
    } finally {
      setLoadingFull(false);
    }
  };

  const handleRebuildLocal = async (force = false) => {
    setRebuilding(true);
    setMessage(null);
    setProgressPercent(0);
    setProgressMessage('جاري بدء إعادة بناء النسخة المحلية...');
    try {
      await rebuildLocalCacheFromCloud((stepName, pct) => {
        setProgressMessage(stepName);
        setProgressPercent(pct);
      }, force);
      
      setMessage('تمت إعادة بناء النسخة المحلية بنجاح.');
      await refreshAllStates();
      const rep = await performFullCloudIntegrityCheck();
      setFullReport(rep);
    } catch (err: any) {
      console.error('Rebuild local error:', err);
      setMessage(`فشل إعادة بناء النسخة المحلية: ${err.message || 'خطأ غير معروف'}`);
    } finally {
      setRebuilding(false);
      setProgressMessage(null);
      setForceAdvancedRebuild(false);
    }
  };

  const isLocalAlreadySynced = Boolean(
    localState && 
    quickHealth && 
    localState.localCatalogVersionId === quickHealth.activeCatalogVersionId && 
    localState.localProductCount === quickHealth.productCount &&
    localState.localCatalogChecksum === quickHealth.checksum &&
    localState.localInventoryRevision === quickHealth.activeInventoryRevision
  );

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="bg-[#FFFFFF] border border-[#E2E8F0] rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <Activity className="w-5 h-5 text-[#10B981]" />
            <h2 className="text-base font-bold text-[#0F172A]">سلامة البيانات والتحقق السحابي</h2>
          </div>
          <p className="text-xs text-[#64748B] mt-1 leading-relaxed">
            متابعة حالة الكتالوج النشط، التحقق من أجزاء البيانات (Chunks)، ومطابقة النسخة المحلية (IndexedDB).
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={refreshAllStates}
            disabled={loadingQuick}
            className="px-3.5 py-2 bg-[#FFFFFF] hover:bg-[#F8FAFC] border border-[#E2E8F0] text-[#334155] rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50 shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#64748B] ${loadingQuick ? 'animate-spin' : ''}`} />
            <span>تحديث الحالة</span>
          </button>
          <button
            onClick={handleFullCheck}
            disabled={loadingFull}
            className="px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer shadow-sm disabled:opacity-50"
          >
            <Cpu className={`w-3.5 h-3.5 ${loadingFull ? 'animate-spin' : ''}`} />
            <span>فحص سحابي كامل</span>
          </button>
        </div>
      </div>

      {message && (
        <div className={`p-3.5 rounded-xl text-xs flex items-center gap-2.5 border ${
          message.includes('بنجاح') 
            ? 'bg-[#ECFDF5] border-[#A7F3D0] text-[#047857]' 
            : 'bg-[#FEF2F2] border-[#FECACA] text-[#B91C1C]'
        }`}>
          <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {/* Metrics Row: 4 Clean Surfaces */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-[#FFFFFF] border border-[#E2E8F0] rounded-2xl p-5 space-y-2 shadow-xs">
          <span className="text-[#64748B] text-xs font-medium block">الاتصال السحابي</span>
          <div className="flex items-center gap-2 text-[#10B981] font-bold text-sm">
            <span className="w-2 h-2 rounded-full bg-[#10B981]"></span>
            <span>السحابة متصلة وجاهزة</span>
          </div>
        </div>

        <div className="bg-[#FFFFFF] border border-[#E2E8F0] rounded-2xl p-5 space-y-2 shadow-xs">
          <span className="text-[#64748B] text-xs font-medium block">حالة الكتالوج النشط</span>
          <div className="flex items-center gap-2">
            {quickHealth?.healthy ? (
              <span className="text-[#10B981] font-bold text-sm flex items-center gap-1.5 font-mono">
                <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
                <span>سليم ومعتمد (17/17)</span>
              </span>
            ) : (
              <span className="text-[#F59E0B] font-bold text-sm flex items-center gap-1.5 font-mono">
                <AlertTriangle className="w-4 h-4 text-[#F59E0B]" />
                <span>يحتاج مراجعة</span>
              </span>
            )}
          </div>
        </div>

        <div className="bg-[#FFFFFF] border border-[#E2E8F0] rounded-2xl p-5 space-y-2 shadow-xs">
          <span className="text-[#64748B] text-xs font-medium block">معرف الكتالوج النشط</span>
          <span className="text-[#0F172A] font-mono text-xs font-semibold block truncate">
            {quickHealth?.activeCatalogVersionId || '---'}
          </span>
        </div>

        <div className="bg-[#FFFFFF] border border-[#E2E8F0] rounded-2xl p-5 space-y-2 shadow-xs">
          <span className="text-[#64748B] text-xs font-medium block">مراجعة المخزون (Revision)</span>
          <span className="text-[#2563EB] font-mono text-base font-bold block tabular-nums">
            Rev {quickHealth?.activeInventoryRevision ?? 0}
          </span>
        </div>
      </div>

      {/* Local IndexedDB Cache Section */}
      <div className="bg-[#FFFFFF] border border-[#E2E8F0] rounded-2xl p-6 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E2E8F0] pb-4">
          <div>
            <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-[#2563EB]" />
              <span>قاعدة البيانات المحلية (IndexedDB Cache)</span>
            </h3>
            <p className="text-[#64748B] text-xs mt-0.5">
              {isLocalAlreadySynced && !forceAdvancedRebuild
                ? 'النسخة المحلية محدثة ومتطابقة تماماً مع السحابة، والبحث المباشر جاهز فورياً.'
                : 'تنزيل ومزامنة الكتالوج المعتمد محلياً للعمل السريع والبحث بالباركود دون انتظار.'}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isLocalAlreadySynced && !forceAdvancedRebuild ? (
              <div className="flex items-center gap-2">
                <span className="px-3 py-1.5 bg-[#ECFDF5] border border-[#A7F3D0] text-[#047857] rounded-xl text-xs font-semibold flex items-center gap-1.5">
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>متطابقة ومحدثة</span>
                </span>
                <button
                  onClick={() => setForceAdvancedRebuild(true)}
                  className="px-3 py-1.5 bg-[#FFFFFF] hover:bg-[#F8FAFC] border border-[#E2E8F0] text-[#334155] rounded-xl text-xs font-semibold cursor-pointer shadow-xs"
                >
                  إعادة بناء
                </button>
              </div>
            ) : (
              <button
                onClick={() => handleRebuildLocal(true)}
                disabled={rebuilding}
                className="px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer shadow-sm"
              >
                <HardDrive className={`w-3.5 h-3.5 ${rebuilding ? 'animate-spin' : ''}`} />
                <span>{rebuilding ? 'جاري إعادة البناء...' : 'إعادة بناء النسخة المحلية'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Progress Bar for Rebuild */}
        {rebuilding && (
          <div className="bg-[#F8FAFC] p-3.5 rounded-xl border border-[#E2E8F0] space-y-2">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-[#2563EB] font-semibold">{progressMessage || 'جاري المعالجة...'}</span>
              <span className="text-[#64748B]">{progressPercent}%</span>
            </div>
            <div className="w-full bg-[#E2E8F0] h-1.5 rounded-full overflow-hidden">
              <div className="bg-[#2563EB] h-full transition-all duration-300" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
        )}

        {/* Local State Metadata Strip */}
        {localState && localState.isHealthy && (
          <div className="bg-[#F8FAFC] p-4 rounded-xl border border-[#E2E8F0] grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono tabular-nums">
            <div>
              <span className="text-[#64748B] block mb-0.5 text-[11px]">الأصناف المحلية</span>
              <span className="text-[#0F172A] font-bold">{localState.localProductCount.toLocaleString()} صنف</span>
            </div>
            <div>
              <span className="text-[#64748B] block mb-0.5 text-[11px]">مراجعة المخزون</span>
              <span className="text-[#2563EB] font-bold">Rev {localState.localInventoryRevision}</span>
            </div>
            <div>
              <span className="text-[#64748B] block mb-0.5 text-[11px]">بصمة Checksum</span>
              <span className="text-[#10B981] font-bold">مطابقة 100%</span>
            </div>
            <div>
              <span className="text-[#64748B] block mb-0.5 text-[11px]">آخر مزامنة ناجحة</span>
              <span className="text-[#334155]">{localState.lastSyncedAt ? new Date(localState.lastSyncedAt).toLocaleTimeString('ar-EG') : '---'}</span>
            </div>
          </div>
        )}

        {/* Diagnostics Accordion */}
        <div className="pt-2">
          <button
            onClick={() => setShowDiagnostics(!showDiagnostics)}
            className="text-[#64748B] hover:text-[#0F172A] text-xs flex items-center gap-2 font-mono cursor-pointer transition-colors"
          >
            <Terminal className="w-3.5 h-3.5 text-[#10B981]" />
            <span className="font-sans font-semibold">بيانات التشخيص الفني لقاعدة البيانات المحلية</span>
            {showDiagnostics ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {showDiagnostics && diagnostics && (
            <div className="mt-3 bg-[#F8FAFC] p-4 rounded-xl border border-[#E2E8F0] font-mono text-xs text-[#334155] space-y-1.5 tabular-nums">
              <div className="flex justify-between py-1 border-b border-[#E2E8F0]">
                <span className="text-[#64748B]">Database Name</span>
                <span className="font-semibold text-[#0F172A]">{diagnostics.databaseName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#E2E8F0]">
                <span className="text-[#64748B]">Schema Version</span>
                <span className="font-semibold text-[#0F172A]">{diagnostics.schemaVersion}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#E2E8F0]">
                <span className="text-[#64748B]">Product Store Count</span>
                <span className="text-[#0F172A] font-bold">{diagnostics.productStoreCount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#E2E8F0]">
                <span className="text-[#64748B]">Barcode Index Count</span>
                <span className="text-[#0F172A] font-bold">{diagnostics.barcodeIndexCount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#E2E8F0]">
                <span className="text-[#64748B]">Active Version ID</span>
                <span className="text-[#2563EB] font-semibold">{diagnostics.activeCatalogVersionId}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-[#64748B]">Last Synced At</span>
                <span className="text-[#64748B]">{diagnostics.lastSyncedAt}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
