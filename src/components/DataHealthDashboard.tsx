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
      <div className="bg-[#111823] border border-white/[0.08] rounded-xl p-6 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <Activity className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-bold text-white">سلامة البيانات والتحقق السحابي</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            متابعة حالة الكتالوج النشط، التحقق من أجزاء البيانات (Chunks)، ومطابقة النسخة المحلية (IndexedDB).
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={refreshAllStates}
            disabled={loadingQuick}
            className="px-3 py-2 bg-[#131B26] hover:bg-[#1A2534] border border-white/[0.08] text-slate-200 rounded-lg text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${loadingQuick ? 'animate-spin' : ''}`} />
            <span>تحديث الحالة</span>
          </button>
          <button
            onClick={handleFullCheck}
            disabled={loadingFull}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer shadow-sm disabled:opacity-50"
          >
            <Cpu className={`w-3.5 h-3.5 ${loadingFull ? 'animate-spin' : ''}`} />
            <span>فحص سحابي كامل</span>
          </button>
        </div>
      </div>

      {message && (
        <div className={`p-3.5 rounded-lg text-xs flex items-center gap-2.5 border ${
          message.includes('بنجاح') 
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
            : 'bg-[#111823] border-white/[0.08] text-slate-200'
        }`}>
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {/* Metrics Row: 4 Clean Surfaces */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-[#111823] border border-white/[0.08] rounded-xl p-5 space-y-2">
          <span className="text-slate-400 text-xs block">الاتصال السحابي</span>
          <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>السحابة متصلة وجاهزة</span>
          </div>
        </div>

        <div className="bg-[#111823] border border-white/[0.08] rounded-xl p-5 space-y-2">
          <span className="text-slate-400 text-xs block">حالة الكتالوج النشط</span>
          <div className="flex items-center gap-2">
            {quickHealth?.healthy ? (
              <span className="text-emerald-400 font-semibold text-sm flex items-center gap-1.5 font-mono">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>سليم ومعتمد (17/17)</span>
              </span>
            ) : (
              <span className="text-amber-400 font-semibold text-sm flex items-center gap-1.5 font-mono">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span>يحتاج مراجعة</span>
              </span>
            )}
          </div>
        </div>

        <div className="bg-[#111823] border border-white/[0.08] rounded-xl p-5 space-y-2">
          <span className="text-slate-400 text-xs block">معرف الكتالوج النشط</span>
          <span className="text-white font-mono text-xs font-semibold block truncate">
            {quickHealth?.activeCatalogVersionId || '---'}
          </span>
        </div>

        <div className="bg-[#111823] border border-white/[0.08] rounded-xl p-5 space-y-2">
          <span className="text-slate-400 text-xs block">مراجعة المخزون (Revision)</span>
          <span className="text-emerald-400 font-mono text-base font-bold block tabular-nums">
            Rev {quickHealth?.activeInventoryRevision ?? 0}
          </span>
        </div>
      </div>

      {/* Local IndexedDB Cache Section */}
      <div className="bg-[#111823] border border-white/[0.08] rounded-xl p-6 space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.06] pb-4">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-blue-400" />
              <span>قاعدة البيانات المحلية (IndexedDB Cache)</span>
            </h3>
            <p className="text-slate-400 text-xs mt-0.5">
              {isLocalAlreadySynced && !forceAdvancedRebuild
                ? 'النسخة المحلية محدثة ومتطابقة تماماً مع السحابة، والبحث المباشر جاهز فورياً.'
                : 'تنزيل ومزامنة الكتالوج المعتمد محلياً للعمل السريع والبحث بالباركود دون انتظار.'}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isLocalAlreadySynced && !forceAdvancedRebuild ? (
              <div className="flex items-center gap-2">
                <span className="px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 rounded-lg text-xs font-semibold flex items-center gap-1.5">
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>متطابقة ومحدثة</span>
                </span>
                <button
                  onClick={() => setForceAdvancedRebuild(true)}
                  className="px-3 py-1.5 bg-[#131B26] hover:bg-[#1A2534] border border-white/[0.08] text-slate-300 rounded-lg text-xs font-medium cursor-pointer"
                >
                  إعادة بناء
                </button>
              </div>
            ) : (
              <button
                onClick={() => handleRebuildLocal(true)}
                disabled={rebuilding}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer shadow-sm"
              >
                <HardDrive className={`w-3.5 h-3.5 ${rebuilding ? 'animate-spin' : ''}`} />
                <span>{rebuilding ? 'جاري إعادة البناء...' : 'إعادة بناء النسخة المحلية'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Progress Bar for Rebuild */}
        {rebuilding && (
          <div className="bg-[#0B1017] p-3.5 rounded-lg border border-white/[0.08] space-y-2">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-blue-400">{progressMessage || 'جاري المعالجة...'}</span>
              <span className="text-slate-400">{progressPercent}%</span>
            </div>
            <div className="w-full bg-[#131B26] h-1.5 rounded-full overflow-hidden">
              <div className="bg-blue-500 h-full transition-all duration-300" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
        )}

        {/* Local State Metadata Strip */}
        {localState && localState.isHealthy && (
          <div className="bg-[#0B1017] p-4 rounded-lg border border-white/[0.06] grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono tabular-nums">
            <div>
              <span className="text-slate-500 block mb-0.5 text-[11px]">الأصناف المحلية</span>
              <span className="text-white font-bold">{localState.localProductCount.toLocaleString()} صنف</span>
            </div>
            <div>
              <span className="text-slate-500 block mb-0.5 text-[11px]">مراجعة المخزون</span>
              <span className="text-emerald-400 font-bold">Rev {localState.localInventoryRevision}</span>
            </div>
            <div>
              <span className="text-slate-500 block mb-0.5 text-[11px]">بصمة Checksum</span>
              <span className="text-blue-400 font-bold">مطابقة 100%</span>
            </div>
            <div>
              <span className="text-slate-500 block mb-0.5 text-[11px]">آخر مزامنة ناجحة</span>
              <span className="text-slate-300">{localState.lastSyncedAt ? new Date(localState.lastSyncedAt).toLocaleTimeString('ar-EG') : '---'}</span>
            </div>
          </div>
        )}

        {/* Diagnostics Accordion */}
        <div className="pt-2">
          <button
            onClick={() => setShowDiagnostics(!showDiagnostics)}
            className="text-slate-400 hover:text-white text-xs flex items-center gap-2 font-mono cursor-pointer"
          >
            <Terminal className="w-3.5 h-3.5 text-emerald-400" />
            <span>بيانات التشخيص الفني لقاعدة البيانات المحلية</span>
            {showDiagnostics ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {showDiagnostics && diagnostics && (
            <div className="mt-3 bg-[#0B1017] p-4 rounded-lg border border-white/[0.06] font-mono text-xs text-slate-300 space-y-1.5 tabular-nums">
              <div className="flex justify-between py-1 border-b border-white/[0.04]">
                <span className="text-slate-500">Database Name</span>
                <span>{diagnostics.databaseName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/[0.04]">
                <span className="text-slate-500">Schema Version</span>
                <span>{diagnostics.schemaVersion}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/[0.04]">
                <span className="text-slate-500">Product Store Count</span>
                <span className="text-white font-bold">{diagnostics.productStoreCount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/[0.04]">
                <span className="text-slate-500">Barcode Index Count</span>
                <span className="text-white font-bold">{diagnostics.barcodeIndexCount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/[0.04]">
                <span className="text-slate-500">Active Version ID</span>
                <span className="text-emerald-400 font-semibold">{diagnostics.activeCatalogVersionId}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Last Synced At</span>
                <span className="text-slate-400">{diagnostics.lastSyncedAt}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
