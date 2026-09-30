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
      setErrorMessage(err.message || 'فشل نشر وتفعيل المراجعة.');
    }
  };

  const filteredDeltas = comparisonResult?.deltas.filter((d: ProductDeltaItem) => {
    if (filterTab === 'STOCK_CHANGED' && d.classification !== 'STOCK_CHANGED') return false;
    if (filterTab === 'PRICE_CHANGED' && d.classification !== 'PRICE_CHANGED') return false;
    if (filterTab === 'PRICE_AND_STOCK_CHANGED' && d.classification !== 'PRICE_AND_STOCK_CHANGED') return false;
    if (filterTab === 'NEW_PRODUCT' && d.classification !== 'NEW_PRODUCT') return false;
    if (filterTab === 'MISSING_FROM_NEW_FILE' && d.classification !== 'MISSING_FROM_NEW_FILE') return false;
    if (filterTab === 'UNCHANGED' && d.classification !== 'UNCHANGED') return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const codeMatch = d.itemCode.toLowerCase().includes(q);
      const nameMatch = d.newProduct?.name?.toLowerCase().includes(q) || d.oldProduct?.name?.toLowerCase().includes(q);
      return codeMatch || nameMatch;
    }
    return true;
  }) || [];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <RotateCw className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-bold text-slate-900">تحديث المخزون اليومي (Daily Inventory Delta)</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            مقارنة ملف Excel اليومي ضد الكتالوج المعتمد في IndexedDB ورفع مراجعة دلتا محسوبة سحابياً.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-slate-600 bg-slate-50 px-3.5 py-1.5 rounded-xl border border-slate-200">
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          <span>IndexedDB Cache Ready</span>
        </div>
      </div>

      {/* Stepper Indicator */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
        {[
          { num: 1, title: '1. رفع الملف' },
          { num: 2, title: '2. تحليل ومقارنة' },
          { num: 3, title: '3. مراجعة التغييرات' },
          { num: 4, title: '4. الرفع السحابي' },
          { num: 5, title: '5. التحقق والنشر' },
        ].map((s) => (
          <div
            key={s.num}
            className={`p-3 rounded-xl border text-center text-xs transition-all ${
              currentStep === s.num
                ? 'bg-blue-50 border-blue-300 text-blue-700 font-bold shadow-2xs'
                : currentStep > s.num
                ? 'bg-white border-slate-200 text-slate-700 font-semibold'
                : 'bg-slate-50 border-slate-200 text-slate-400 font-medium'
            }`}
          >
            {s.title}
          </div>
        ))}
      </div>

      {!healthGateChecked && (
        <div className="p-4 bg-white border border-slate-200 rounded-2xl text-slate-600 text-xs flex items-center gap-2.5 shadow-xs">
          <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
          <span>جاري فحص البوابة الصحية للكتالوج والمراجعات...</span>
        </div>
      )}

      {healthGateChecked && !healthGatePassed && (
        <div className="p-5 bg-red-50 border border-red-200 rounded-2xl text-red-800 text-xs space-y-3 shadow-xs">
          <div className="flex items-center gap-2 font-bold text-sm text-red-700">
            <ShieldAlert className="w-5 h-5 shrink-0" />
            <span>بوابة تحديث المخزون مقفلة</span>
          </div>
          <p className="leading-relaxed">{healthGateError}</p>
          <button
            onClick={checkHealthGate}
            className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer shadow-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>إعادة الفحص</span>
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-800 text-xs flex items-center gap-2.5 shadow-xs">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
          <span className="font-medium">{errorMessage}</span>
        </div>
      )}

      {/* STEP 1: UPLOAD DAILY FILE */}
      {currentStep === 1 && healthGateChecked && healthGatePassed && (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-xs">
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
            className="cursor-pointer inline-flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-2xl bg-slate-50 hover:bg-blue-50/30 transition-all group max-w-md w-full"
          >
            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-3 group-hover:scale-105 transition-transform border border-blue-100">
              <Upload className="w-6 h-6" />
            </div>
            <span className="text-slate-900 font-bold text-sm mb-1">اختر ملف Excel اليومي للمخزون</span>
            <span className="text-slate-500 text-xs mb-4">يتم الانتقال تلقائياً للتحليل والمقارنة ضد الكتالوج المحلي</span>
            <span className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition-colors shadow-sm">
              استعراض الملف (.xlsx)
            </span>
          </label>
        </div>
      )}

      {/* STEP 2: ANALYSIS & COMPARISON */}
      {currentStep === 2 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-4 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 mx-auto">
            <RefreshCw className="w-5 h-5 animate-spin" />
          </div>
          <p className="text-slate-900 font-bold text-xs">{parseProgressMessage}...</p>
          {!comparing && comparisonResult && (
            <div className="pt-2">
              <button
                onClick={() => setCurrentStep(3)}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer shadow-sm"
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
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">ملخص تغييرات المخزون اليومي</h3>
                <p className="text-slate-500 text-xs mt-0.5">المقارنة الدقيقة ضد الكتالوج النشط في IndexedDB.</p>
              </div>
              <button
                onClick={() => setCurrentStep(4)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-2 cursor-pointer shadow-sm"
              >
                <span>متابعة لخطوة الرفع (Step 4)</span>
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono tabular-nums">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <span className="text-slate-500 block mb-1 text-[11px] font-medium font-sans">إجمالي التغييرات</span>
                <span className="text-slate-900 font-bold text-base">{comparisonResult.totalChangedProductsCount.toLocaleString()} صنف</span>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <span className="text-slate-500 block mb-1 text-[11px] font-medium font-sans">أصناف جديدة</span>
                <span className="text-emerald-700 font-bold text-base">{comparisonResult.newProductCount.toLocaleString()} صنف</span>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <span className="text-slate-500 block mb-1 text-[11px] font-medium font-sans">تغير الأرصدة والأسعار</span>
                <span className="text-amber-700 font-bold text-base">{(comparisonResult.stockChangedCount + comparisonResult.priceChangedCount).toLocaleString()} صنف</span>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <span className="text-slate-500 block mb-1 text-[11px] font-medium font-sans">المراجعة الأساسية</span>
                <span className="text-blue-600 font-bold text-base">Rev {comparisonResult.baseRevision}</span>
              </div>
            </div>

            {/* Filter and Table */}
            <div className="space-y-3.5 pt-2">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  {(['ALL', 'STOCK_CHANGED', 'PRICE_CHANGED', 'NEW_PRODUCT', 'MISSING_FROM_NEW_FILE'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setFilterTab(tab)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                        filterTab === tab 
                          ? 'bg-blue-600 text-white shadow-xs' 
                          : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {tab === 'ALL' ? 'الكل' : tab === 'STOCK_CHANGED' ? 'تغير الرصيد' : tab === 'PRICE_CHANGED' ? 'تغير السعر' : tab === 'NEW_PRODUCT' ? 'أصناف جديدة' : 'مفقودة من الملف'}
                    </button>
                  ))}
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="بحث بالكود أو الاسم..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl pr-9 pl-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-blue-600 font-mono"
                  />
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden max-h-80 overflow-y-auto shadow-2xs">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-mono sticky top-0 border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3 font-semibold">كود الصنف</th>
                      <th className="py-2.5 px-3 font-semibold font-sans">اسم الصنف</th>
                      <th className="py-2.5 px-3 font-semibold font-sans">التصنيف</th>
                      <th className="py-2.5 px-3 font-semibold">الرصيد السابق</th>
                      <th className="py-2.5 px-3 font-semibold text-emerald-700">الرصيد الجديد</th>
                      <th className="py-2.5 px-3 font-semibold text-center">التصنيف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                    {filteredDeltas.slice(0, 100).map((d) => (
                      <tr key={d.itemCode} className="hover:bg-slate-50/80">
                        <td className="py-2.5 px-3 text-blue-600 font-bold">{d.itemCode}</td>
                        <td className="py-2.5 px-3 text-slate-900 font-sans max-w-xs truncate font-medium">{d.newProduct?.name || d.oldProduct?.name || '---'}</td>
                        <td className="py-2.5 px-3 text-slate-500 font-sans">{d.newProduct?.category || '---'}</td>
                        <td className="py-2.5 px-3 text-slate-500">{d.oldProduct?.totalStock ?? 0}</td>
                        <td className="py-2.5 px-3 text-emerald-700 font-bold">{d.newProduct?.totalStock ?? 0}</td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            d.classification === 'NEW_PRODUCT' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                            d.classification === 'STOCK_CHANGED' ? 'bg-blue-50 text-blue-800 border border-blue-200' :
                            d.classification === 'PRICE_CHANGED' ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                            'bg-slate-100 text-slate-600 border border-slate-200'
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
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5 shadow-xs">
          <div className="border-b border-slate-200 pb-3">
            <h3 className="text-base font-bold text-slate-900">خطوة الرفع السحابي (Staging & Upload)</h3>
            <p className="text-slate-500 text-xs mt-0.5">تقسيم التغييرات إلى أجزاء (Chunks) ورفعها بشكل محمي.</p>
          </div>

          <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-4 font-mono text-xs">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="preflight-agree"
                checked={preflightAgreed}
                onChange={(e) => setPreflightAgreed(e.target.checked)}
                className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
              />
              <label htmlFor="preflight-agree" className="text-slate-800 cursor-pointer font-sans font-medium">
                أؤكد مراجعة وصحة بيانات مقارنة المخزون وأوافق على إنشاء المراجعة السحابية.
              </label>
            </div>

            {syncState === 'uploading' && (
              <div className="space-y-2 tabular-nums">
                <div className="flex justify-between text-slate-600 font-medium">
                  <span>جاري رفع الـ Chunks: {uploadProgress.uploadedChunks} / {uploadProgress.totalChunks}</span>
                  <span>{(uploadProgress.bytesUploaded / 1024).toFixed(1)} KB</span>
                </div>
                <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                  <div 
                    className="bg-blue-600 h-full transition-all duration-300" 
                    style={{ width: `${uploadProgress.totalChunks > 0 ? (uploadProgress.uploadedChunks / uploadProgress.totalChunks) * 100 : 0}%` }} 
                  />
                </div>
              </div>
            )}

            <div className="pt-2 flex justify-end">
              <button
                onClick={handleStartUpload}
                disabled={!preflightAgreed || syncState === 'uploading'}
                className={`px-5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer shadow-sm ${
                  !preflightAgreed || syncState === 'uploading'
                    ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
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
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5 shadow-xs">
          <div className="border-b border-slate-200 pb-3">
            <h3 className="text-base font-bold text-slate-900">التحقق السحابي والنشر الذري (Verification & Publish)</h3>
            <p className="text-slate-500 text-xs mt-0.5">التحقق من سلامة البصمة السحابية ثم النشر الذري للمراجعة الجديدة.</p>
          </div>

          <div className="space-y-3 font-mono text-xs tabular-nums">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-center justify-between">
              <div>
                <span className="text-slate-500 block mb-0.5 text-[11px] font-sans">1. فحص تطابق البصمة والعدد (Server Verification)</span>
                <span className="text-slate-900 font-bold">{updateId}</span>
              </div>
              <button
                onClick={handleVerify}
                disabled={syncState === 'verifying' || syncState === 'verified' || syncState === 'published'}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-xs transition-colors"
              >
                {syncState === 'verifying' ? 'جاري التحقق...' : syncState === 'verified' || syncState === 'published' ? 'تم التحقق بنجاح' : 'التحقق السحابي'}
              </button>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-center justify-between">
              <div>
                <span className="text-slate-500 block mb-0.5 text-[11px] font-sans">2. النشر الذري وتحديث المراجعة (Atomic Publish)</span>
                <span className="text-slate-900 font-bold">Base Rev {comparisonResult.baseRevision} → New Rev {comparisonResult.baseRevision + 1}</span>
              </div>
              <button
                onClick={handlePublish}
                disabled={syncState !== 'verified' && syncState !== 'publishing'}
                className={`px-4 py-1.5 rounded-xl text-xs font-semibold cursor-pointer shadow-xs transition-colors ${
                  syncState === 'published' ? 'bg-emerald-600 text-white' :
                  syncState !== 'verified' ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed' :
                  'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
              >
                {syncState === 'publishing' ? 'جاري النشر...' : syncState === 'published' ? 'تم النشر بنجاح' : 'نشر المراجعة الآن'}
              </button>
            </div>

            {syncState === 'published' && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2.5 shadow-xs">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span className="font-medium">تم نشر تحديث المخزون اليومي واعتماد المراجعة بنجاح. ستتلقى نقاط البيع التحديث فورياً.</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
