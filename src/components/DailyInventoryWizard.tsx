import React, { useState, useRef, useEffect } from 'react';
import { ImportParseResult, NormalizedProduct } from '../types/inventory';
import { parseInventoryExcel } from '../services/excelParser';
import { 
  compareCatalogWithActive, 
  stageAndUploadInventoryUpdate, 
  verifyServerInventoryUpdate, 
  publishInventoryUpdate,
  InventoryComparisonResult,
  ProductDeltaItem,
  ChangeClassification
} from '../services/inventoryDeltaService';
import { quickCloudHealthCheck } from '../services/dataIntegrityService';
import { getLocalIndexedDbState } from '../services/indexedDbService';
import { auth, db } from '../services/firebaseClient';
import { doc, getDoc, collection, getDocs, query, orderBy } from 'firebase/firestore';
import { 
  FileSpreadsheet, Upload, AlertCircle, CheckCircle2, Search, 
  Eye, RefreshCw, Layers, ShieldAlert, Terminal, ChevronDown, 
  ChevronUp, CloudUpload, CheckCheck, Zap, ArrowRight, ArrowLeft, 
  Copy, Check, Filter, RotateCw
} from 'lucide-react';

export default function DailyInventoryWizard() {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseProgressMessage, setParseProgressMessage] = useState('جاهز للتحليل والمقارنة');
  const [parseResult, setParseResult] = useState<ImportParseResult | null>(null);
  const [comparisonResult, setComparisonResult] = useState<InventoryComparisonResult | null>(null);
  const [comparing, setComparing] = useState(false);
  
  const [filterTab, setFilterTab] = useState<'ALL' | 'STOCK_CHANGED' | 'PRICE_CHANGED' | 'PRICE_AND_STOCK_CHANGED' | 'NEW_PRODUCT' | 'MISSING_FROM_NEW_FILE' | 'UNCHANGED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedItemCode, setExpandedItemCode] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Health gate state
  const [healthGateChecked, setHealthGateChecked] = useState(false);
  const [healthGatePassed, setHealthGatePassed] = useState(false);
  const [healthGateError, setHealthGateError] = useState<string | null>(null);

  // Upload & publish state
  const [updateId, setUpdateId] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<'idle' | 'uploading' | 'uploaded' | 'verifying' | 'verified' | 'publishing' | 'published' | 'failed'>('idle');
  const [uploadProgress, setUploadProgress] = useState({ uploadedChunks: 0, totalChunks: 0, bytesUploaded: 0 });
  const [preflightAgreed, setPreflightAgreed] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    checkHealthGate();
  }, []);

  const checkHealthGate = async () => {
    setHealthGateChecked(false);
    try {
      const q = await quickCloudHealthCheck();
      const loc = await getLocalIndexedDbState();
      
      const cloudHealthy = q.healthy;
      const localHealthy = loc.isHealthy && loc.localProductCount === q.productCount;
      const versionMatch = loc.localCatalogVersionId === q.activeCatalogVersionId;
      const revisionMatch = loc.localInventoryRevision === q.activeInventoryRevision;

      if (cloudHealthy && localHealthy && versionMatch && revisionMatch) {
        setHealthGatePassed(true);
        setHealthGateError(null);
      } else {
        setHealthGatePassed(false);
        setHealthGateError(`لا يمكن تنفيذ تحديث المخزون اليومي: الحالة الصحية غير مستوفاة تماماً (السحابة: ${cloudHealthy ? 'سليم' : 'غير سليم'}, المحلي: ${localHealthy ? 'سليم' : 'غير سليم'}, الإصدار: ${versionMatch ? 'متطابق' : 'غير متطابق'}, المراجعة: ${revisionMatch ? 'متطابق' : 'غير متطابق'}). يُرجى مراجعة صفحة حالة البيانات وفحص السلامة.`);
      }
    } catch (err: any) {
      setHealthGatePassed(false);
      setHealthGateError(err.message || 'فشل التحقق من البوابة الصحية لتحديث المخزون.');
    } finally {
      setHealthGateChecked(true);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!healthGatePassed) return;
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    setFile(selectedFile);
    setParsing(true);
    setComparing(true);
    setCurrentStep(2); // Step 2: Analysis & Comparison
    setErrorMessage(null);

    try {
      setParseProgressMessage('جاري قراءة ملف Excel اليومي');
      await new Promise(r => setTimeout(r, 150));
      const result = await parseInventoryExcel(selectedFile);
      setParseResult(result);
      setParseProgressMessage('جاري مقارنة البيانات ضد الكتالوج النشط في IndexedDB');

      const comparison = await compareCatalogWithActive(result);
      setComparisonResult(comparison);
      setParseProgressMessage('اكتمل التحليل والمقارنة بنجاح');
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'فشل تحليل ملف Excel أو مقارنة الكتالوج.');
      setParseResult(null);
    } finally {
      setParsing(false);
      setComparing(false);
    }
  };

  const handleStartUpload = async () => {
    if (!comparisonResult || !preflightAgreed) return;
    setSyncState('uploading');
    setErrorMessage(null);

    try {
      const { updateId: id } = await stageAndUploadInventoryUpdate(comparisonResult, (prog) => {
        setUploadProgress(prog);
      });
      setUpdateId(id);
      setSyncState('uploaded');
      setCurrentStep(5); // Step 5: Verification & Publish
    } catch (err: any) {
      console.error(err);
      setSyncState('failed');
      setErrorMessage(err.message || 'فشل رفع تحديث المخزون.');
    }
  };

  const handleVerify = async () => {
    if (!updateId || !comparisonResult) return;
    setSyncState('verifying');
    setErrorMessage(null);

    try {
      await verifyServerInventoryUpdate(
        comparisonResult.activeCatalogVersionId,
        updateId,
        comparisonResult.checksum,
        comparisonResult.totalChangedProductsCount
      );
      setSyncState('verified');
    } catch (err: any) {
      console.error(err);
      setSyncState('failed');
      setErrorMessage(err.message || 'فشل التحقق من تحديث المخزون.');
    }
  };

  const handlePublish = async () => {
    if (!updateId || !comparisonResult) return;
    setSyncState('publishing');
    setErrorMessage(null);

    try {
      await publishInventoryUpdate(
        comparisonResult.activeCatalogVersionId,
        updateId,
        comparisonResult.baseRevision
      );
      setSyncState('published');
    } catch (err: any) {
      console.error(err);
      setSyncState('failed');
      setErrorMessage(err.message || 'فشل النشر الذري للمراجعة.');
    }
  };

  const filteredDeltas = comparisonResult?.deltas.filter(d => {
    if (filterTab !== 'ALL' && d.classification !== filterTab) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return d.itemCode.toLowerCase().includes(q) ||
        (d.newProduct?.name && d.newProduct.name.toLowerCase().includes(q)) ||
        (d.newProduct?.barcode && d.newProduct.barcode.toLowerCase().includes(q));
    }
    return true;
  }) || [];

  const adminEmail = auth.currentUser?.email || 'مشرف النظام';

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="bg-[#111823] border border-white/[0.08] rounded-xl p-6 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <RotateCw className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-bold text-white">تحديث المخزون اليومي (Daily Delta Revision)</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            مقارنة ملف Excel اليومي ضد الكتالوج النشط محلياً، استخراج الفروقات، ونشر مراجعة تدريجية ذرية.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-slate-400 bg-[#0B1017] px-3 py-1.5 rounded-lg border border-white/[0.06]">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          <span>{adminEmail}</span>
        </div>
      </div>

      {/* Stepper Indicator */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {[
          { num: 1, title: '1. رفع الملف' },
          { num: 2, title: '2. تحليل ومقارنة' },
          { num: 3, title: '3. مراجعة التغييرات' },
          { num: 4, title: '4. الرفع السحابي' },
          { num: 5, title: '5. التحقق والنشر' },
        ].map((s) => (
          <div
            key={s.num}
            className={`p-2.5 rounded-lg border text-center text-xs font-medium transition-all ${
              currentStep === s.num
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 font-semibold'
                : currentStep > s.num
                ? 'bg-[#111823] border-white/[0.08] text-slate-300'
                : 'bg-[#0B1017] border-white/[0.04] text-slate-600'
            }`}
          >
            {s.title}
          </div>
        ))}
      </div>

      {!healthGateChecked && (
        <div className="p-3.5 bg-[#111823] border border-white/[0.08] rounded-xl text-slate-400 text-xs flex items-center gap-2">
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
          <span>جاري فحص البوابة الصحية للكتالوج والمراجعات...</span>
        </div>
      )}

      {healthGateChecked && !healthGatePassed && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-xs space-y-2.5">
          <div className="flex items-center gap-2 font-bold text-sm text-red-400">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>بوابة تحديث المخزون مقفلة</span>
          </div>
          <p className="leading-relaxed">{healthGateError}</p>
          <button
            onClick={checkHealthGate}
            className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            <span>إعادة الفحص</span>
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="p-3.5 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* STEP 1: UPLOAD DAILY FILE */}
      {currentStep === 1 && healthGateChecked && healthGatePassed && (
        <div className="bg-[#111823] border border-white/[0.08] rounded-xl p-12 text-center">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept=".xlsx, .xls"
            className="hidden"
            id="daily-excel-input"
          />
          <label
            htmlFor="daily-excel-input"
            className="cursor-pointer inline-flex flex-col items-center justify-center p-8 border-2 border-dashed border-white/[0.12] hover:border-emerald-500/60 rounded-xl bg-[#0B1017] transition-colors group max-w-md w-full"
          >
            <div className="w-12 h-12 bg-emerald-500/10 text-emerald-400 rounded-xl flex items-center justify-center mb-3 group-hover:scale-105 transition-transform border border-emerald-500/20">
              <Upload className="w-6 h-6" />
            </div>
            <span className="text-white font-semibold text-sm mb-1">اختر ملف Excel اليومي للمخزون</span>
            <span className="text-slate-500 text-xs mb-4">يتم الانتقال تلقائياً للتحليل والمقارنة ضد الكتالوج المحلي</span>
            <span className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium transition-colors shadow-sm">
              استعراض الملف (.xlsx)
            </span>
          </label>
        </div>
      )}

      {/* STEP 2: ANALYSIS & COMPARISON */}
      {currentStep === 2 && (
        <div className="bg-[#111823] border border-white/[0.08] rounded-xl p-12 text-center space-y-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mx-auto">
            <RefreshCw className="w-5 h-5 animate-spin" />
          </div>
          <p className="text-white font-medium text-xs">{parseProgressMessage}...</p>
          {!comparing && comparisonResult && (
            <div className="pt-2">
              <button
                onClick={() => setCurrentStep(3)}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-sm"
              >
                عرض تقرير التغييرات والمراجعة
              </button>
            </div>
          )}
        </div>
      )}

      {/* STEP 3: REVIEW CHANGES & DELTA SUMMARY */}
      {comparisonResult && currentStep === 3 && (
        <div className="space-y-5">
          <div className="bg-[#111823] border border-white/[0.08] rounded-xl p-6 space-y-5 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
              <div>
                <h3 className="text-base font-bold text-white">ملخص تغييرات المخزون اليومي</h3>
                <p className="text-slate-400 text-xs mt-0.5">المقارنة الدقيقة ضد الكتالوج النشط في IndexedDB.</p>
              </div>
              <button
                onClick={() => setCurrentStep(4)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-2 cursor-pointer shadow-sm"
              >
                <span>متابعة لخطوة الرفع (Step 4)</span>
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono tabular-nums">
              <div className="bg-[#0B1017] p-3.5 rounded-lg border border-white/[0.06]">
                <span className="text-slate-500 block mb-0.5 text-[11px]">إجمالي التغييرات</span>
                <span className="text-white font-bold text-base">{comparisonResult.totalChangedProductsCount.toLocaleString()} صنف</span>
              </div>
              <div className="bg-[#0B1017] p-3.5 rounded-lg border border-white/[0.06]">
                <span className="text-slate-500 block mb-0.5 text-[11px]">أصناف جديدة</span>
                <span className="text-emerald-400 font-bold text-base">{comparisonResult.newProductCount.toLocaleString()} صنف</span>
              </div>
              <div className="bg-[#0B1017] p-3.5 rounded-lg border border-white/[0.06]">
                <span className="text-slate-500 block mb-0.5 text-[11px]">تغير الأرصدة والأسعار</span>
                <span className="text-amber-400 font-bold text-base">{(comparisonResult.stockChangedCount + comparisonResult.priceChangedCount).toLocaleString()} صنف</span>
              </div>
              <div className="bg-[#0B1017] p-3.5 rounded-lg border border-white/[0.06]">
                <span className="text-slate-500 block mb-0.5 text-[11px]">المراجعة الأساسية</span>
                <span className="text-emerald-400 font-bold text-base">Rev {comparisonResult.baseRevision}</span>
              </div>
            </div>

            {/* Filter and Table */}
            <div className="space-y-3 pt-2">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex flex-wrap gap-1.5">
                  {(['ALL', 'STOCK_CHANGED', 'PRICE_CHANGED', 'NEW_PRODUCT', 'MISSING_FROM_NEW_FILE'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setFilterTab(tab)}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                        filterTab === tab 
                          ? 'bg-emerald-600 text-white' 
                          : 'bg-[#0B1017] border border-white/[0.06] text-slate-300 hover:bg-white/[0.04]'
                      }`}
                    >
                      {tab === 'ALL' ? 'الكل' : tab === 'STOCK_CHANGED' ? 'تغير الرصيد' : tab === 'PRICE_CHANGED' ? 'تغير السعر' : tab === 'NEW_PRODUCT' ? 'أصناف جديدة' : 'مفقودة من الملف'}
                    </button>
                  ))}
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute right-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="بحث بالكود أو الاسم..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-[#0B1017] border border-white/[0.1] rounded-lg pr-8 pl-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>

              <div className="bg-[#0B1017] rounded-lg border border-white/[0.08] overflow-hidden max-h-80 overflow-y-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-[#111823] text-slate-400 font-mono sticky top-0 border-b border-white/[0.06]">
                    <tr>
                      <th className="py-2.5 px-3">كود الصنف</th>
                      <th className="py-2.5 px-3 font-sans">اسم الصنف</th>
                      <th className="py-2.5 px-3 font-sans">التصنيف</th>
                      <th className="py-2.5 px-3">الرصيد السابق</th>
                      <th className="py-2.5 px-3 text-emerald-400">الرصيد الجديد</th>
                      <th className="py-2.5 px-3 text-center">التصنيف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04] font-mono tabular-nums">
                    {filteredDeltas.slice(0, 100).map((d) => (
                      <tr key={d.itemCode} className="hover:bg-white/[0.02]">
                        <td className="py-2.5 px-3 text-white font-semibold">{d.itemCode}</td>
                        <td className="py-2.5 px-3 text-slate-300 font-sans max-w-xs truncate">{d.newProduct?.name || d.oldProduct?.name || '---'}</td>
                        <td className="py-2.5 px-3 text-slate-500 font-sans">{d.newProduct?.category || '---'}</td>
                        <td className="py-2.5 px-3 text-slate-400">{d.oldProduct?.totalStock ?? 0}</td>
                        <td className="py-2.5 px-3 text-emerald-400 font-bold">{d.newProduct?.totalStock ?? 0}</td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            d.classification === 'NEW_PRODUCT' ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' :
                            d.classification === 'STOCK_CHANGED' ? 'bg-blue-500/10 text-blue-300 border border-blue-500/20' :
                            d.classification === 'PRICE_CHANGED' ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20' :
                            'bg-white/[0.06] text-slate-400'
                          }`}>
                            {d.classification}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STEP 4: STAGE & UPLOAD */}
      {currentStep === 4 && comparisonResult && (
        <div className="bg-[#111823] border border-white/[0.08] rounded-xl p-6 space-y-5 shadow-xl">
          <div className="border-b border-white/[0.08] pb-3">
            <h3 className="text-base font-bold text-white">خطوة الرفع السحابي (Staging & Upload)</h3>
            <p className="text-slate-400 text-xs mt-0.5">تقسيم التغييرات إلى أجزاء (Chunks) ورفعها بشكل محمي.</p>
          </div>

          <div className="bg-[#0B1017] p-5 rounded-lg border border-white/[0.06] space-y-4 font-mono text-xs">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="preflight-agree"
                checked={preflightAgreed}
                onChange={(e) => setPreflightAgreed(e.target.checked)}
                className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
              />
              <label htmlFor="preflight-agree" className="text-slate-200 cursor-pointer font-sans">
                أؤكد مراجعة وصحة بيانات مقارنة المخزون وأوافق على إنشاء المراجعة السحابية.
              </label>
            </div>

            {syncState === 'uploading' && (
              <div className="space-y-2 tabular-nums">
                <div className="flex justify-between text-slate-400">
                  <span>جاري رفع الـ Chunks: {uploadProgress.uploadedChunks} / {uploadProgress.totalChunks}</span>
                  <span>{(uploadProgress.bytesUploaded / 1024).toFixed(1)} KB</span>
                </div>
                <div className="w-full bg-[#111823] h-1.5 rounded-full overflow-hidden">
                  <div 
                    className="bg-emerald-500 h-full transition-all duration-300" 
                    style={{ width: `${uploadProgress.totalChunks > 0 ? (uploadProgress.uploadedChunks / uploadProgress.totalChunks) * 100 : 0}%` }} 
                  />
                </div>
              </div>
            )}

            <div className="pt-2 flex justify-end">
              <button
                onClick={handleStartUpload}
                disabled={!preflightAgreed || syncState === 'uploading'}
                className={`px-5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer shadow-sm ${
                  !preflightAgreed || syncState === 'uploading'
                    ? 'bg-white/[0.06] text-slate-500 cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                }`}
              >
                <CloudUpload className="w-4 h-4" />
                <span>{syncState === 'uploading' ? 'جاري الرفع...' : 'بدء الرفع السحابي'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 5: VERIFICATION & PUBLISH */}
      {currentStep === 5 && updateId && comparisonResult && (
        <div className="bg-[#111823] border border-white/[0.08] rounded-xl p-6 space-y-5 shadow-xl">
          <div className="border-b border-white/[0.08] pb-3">
            <h3 className="text-base font-bold text-white">التحقق السحابي والنشر الذري (Verification & Publish)</h3>
            <p className="text-slate-400 text-xs mt-0.5">التحقق من سلامة البصمة السحابية ثم النشر الذري للمراجعة الجديدة.</p>
          </div>

          <div className="space-y-3 font-mono text-xs tabular-nums">
            <div className="bg-[#0B1017] p-4 rounded-lg border border-white/[0.06] flex items-center justify-between">
              <div>
                <span className="text-slate-500 block mb-0.5 text-[11px]">1. فحص تطابق البصمة والعدد (Server Verification)</span>
                <span className="text-white font-bold">{updateId}</span>
              </div>
              <button
                onClick={handleVerify}
                disabled={syncState === 'verifying' || syncState === 'verified' || syncState === 'published'}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-white/[0.06] disabled:text-slate-500 text-white rounded-md text-xs font-semibold cursor-pointer"
              >
                {syncState === 'verifying' ? 'جاري التحقق...' : syncState === 'verified' || syncState === 'published' ? 'تم التحقق بنجاح' : 'التحقق السحابي'}
              </button>
            </div>

            <div className="bg-[#0B1017] p-4 rounded-lg border border-white/[0.06] flex items-center justify-between">
              <div>
                <span className="text-slate-500 block mb-0.5 text-[11px]">2. النشر الذري وتحديث المراجعة (Atomic Publish)</span>
                <span className="text-white font-bold">Base Rev {comparisonResult.baseRevision} → New Rev {comparisonResult.baseRevision + 1}</span>
              </div>
              <button
                onClick={handlePublish}
                disabled={syncState !== 'verified' && syncState !== 'publishing'}
                className={`px-4 py-1.5 rounded-md text-xs font-semibold cursor-pointer ${
                  syncState === 'published' ? 'bg-emerald-600 text-white' :
                  syncState !== 'verified' ? 'bg-white/[0.06] text-slate-500 cursor-not-allowed' :
                  'bg-emerald-600 hover:bg-emerald-500 text-white'
                }`}
              >
                {syncState === 'publishing' ? 'جاري النشر...' : syncState === 'published' ? 'تم النشر بنجاح' : 'نشر المراجعة الآن'}
              </button>
            </div>

            {syncState === 'published' && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>تم نشر تحديث المخزون اليومي واعتماد المراجعة بنجاح. ستتلقى نقاط البيع التحديث فورياً.</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
