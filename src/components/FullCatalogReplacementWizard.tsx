import React, { useState, useRef, useEffect } from 'react';
import { ImportParseResult, NormalizedProduct } from '../types/inventory';
import { parseInventoryExcel } from '../services/excelParser';
import { 
  stageAndUploadCatalog, 
  verifyServerCatalog, 
  activateCatalogVersion, 
  chunkProductsByByteSize, 
  computeSha256Checksum, 
  sortProductsDeterministically,
  ChunkPayload,
  inspectResumableCatalogVersion,
  ResumableInspectionResult
} from '../services/catalogSyncService';
import { auth } from '../services/firebaseClient';
import { FileSpreadsheet, Upload, AlertCircle, CheckCircle2, Search, Eye, RefreshCw, Layers, ShieldAlert, Terminal, ChevronDown, ChevronUp, CloudUpload, CheckCheck, Zap, ArrowRight, ArrowLeft, Copy, Check } from 'lucide-react';

export default function FullCatalogReplacementWizard() {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseProgressMessage, setParseProgressMessage] = useState('جاهز للتحليل');
  const [parseResult, setParseResult] = useState<ImportParseResult | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 4 preflight data calculated state
  const [calculatingPreflight, setCalculatingPreflight] = useState(false);
  const [calculatedChecksum, setCalculatedChecksum] = useState<string | null>(null);
  const [chunksMeta, setChunksMeta] = useState<ChunkPayload[]>([]);
  const [totalSerializedBytes, setTotalSerializedBytes] = useState(0);
  const [preflightAgreed, setPreflightAgreed] = useState(false);
  const [resumableInfo, setResumableInfo] = useState<ResumableInspectionResult | null>(null);
  const [copiedHash, setCopiedHash] = useState(false);
  const [copiedUid, setCopiedUid] = useState(false);

  const [syncState, setSyncState] = useState<'idle' | 'uploading' | 'uploaded' | 'verifying' | 'verified' | 'activating' | 'active' | 'failed'>('idle');
  const [syncProgress, setSyncProgress] = useState({
    uploadedChunks: 0,
    totalChunks: 0,
    uploadedProducts: 0,
    totalProducts: 0,
    bytesUploaded: 0,
    currentChunk: 0,
    retryCount: 0,
  });
  const [stagedVersionId, setStagedVersionId] = useState<string | null>(null);
  const [stagedChecksum, setStagedChecksum] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const pageSize = 20;

  // When entering Step 4, calculate preflight data and inspect resumable version automatically (ZERO Firestore writes)
  useEffect(() => {
    if (currentStep === 4 && parseResult && file && !calculatedChecksum && !calculatingPreflight) {
      computePreflightData();
    }
  }, [currentStep, parseResult, file]);

  const computePreflightData = async () => {
    if (!parseResult || !file) return;
    setCalculatingPreflight(true);
    setErrorMessage(null);
    setResumableInfo(null);
    try {
      const sorted = sortProductsDeterministically(parseResult.products);
      const sha256 = await computeSha256Checksum(sorted);
      const chunks = await chunkProductsByByteSize(sorted);
      const serializedStr = JSON.stringify(sorted);
      const totalBytes = new TextEncoder().encode(serializedStr).length;

      setCalculatedChecksum(sha256);
      setChunksMeta(chunks);
      setTotalSerializedBytes(totalBytes);

      // Inspect if an existing resumable version exists in Firestore matching this checksum
      const resumable = await inspectResumableCatalogVersion(sha256);
      if (resumable) {
        setResumableInfo(resumable);
        setStagedVersionId(resumable.resumableVersionId);
        setStagedChecksum(sha256);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'فشل حساب بصمة SHA-256 ومقاييس الـ Chunks.');
    } finally {
      setCalculatingPreflight(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    setFile(selectedFile);
    setParsing(true);
    setCurrentStep(2); // Step 2: Analysis & Mapping
    setErrorMessage(null);
    setResumableInfo(null);

    try {
      setParseProgressMessage('جاري قراءة ملف Excel');
      await new Promise(r => setTimeout(r, 150));
      setParseProgressMessage('جاري تحديد الأعمدة');
      await new Promise(r => setTimeout(r, 150));
      setParseProgressMessage('جاري قراءة الأصناف');
      await new Promise(r => setTimeout(r, 150));
      setParseProgressMessage('جاري حساب المخزون');
      await new Promise(r => setTimeout(r, 150));
      setParseProgressMessage('جاري التحقق من البيانات');

      const result = await parseInventoryExcel(selectedFile);
      setParseResult(result);
      setParseProgressMessage('اكتمل التحليل بنجاح');
    } catch (err) {
      console.error(err);
      setParseResult({
        success: false,
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
        lastModified: selectedFile.lastModified,
        sourceRowCount: 0,
        headerRowIndex: -1,
        rawHeaders: [],
        rawRowsSample: [],
        columnDiagnostics: [],
        products: [],
        locations: [],
        debugInspections: [],
        blockingErrors: ['فشل قراءة ملف الـ Excel. تأكد من أن الملف سليم وصالح.'],
        warnings: [],
        duplicates: [],
        stats: { totalProducts: 0, productsWithStock: 0, productsWithoutStock: 0, totalOperationalUnits: 0 }
      });
      setParseProgressMessage('فشل التحليل');
    } finally {
      setParsing(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setParseResult(null);
    setCurrentStep(1);
    setSearchQuery('');
    setCurrentPage(1);
    setCalculatedChecksum(null);
    setChunksMeta([]);
    setTotalSerializedBytes(0);
    setPreflightAgreed(false);
    setResumableInfo(null);
    setSyncState('idle');
    setStagedVersionId(null);
    setStagedChecksum(null);
    setErrorMessage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleProceedToStep3 = () => {
    if (!parseResult) return;
    if (parseResult.blockingErrors && parseResult.blockingErrors.length > 0) {
      setErrorMessage('لا يمكن متابعة الاستيراد قبل معالجة الأخطاء المانعة.');
      return;
    }
    setErrorMessage(null);
    setCurrentStep(3);
  };

  const handleStartUpload = async () => {
    if (!parseResult || !file || !preflightAgreed) return;
    setSyncState('uploading');
    setErrorMessage(null);

    try {
      const { versionId, catalogChecksum } = await stageAndUploadCatalog(
        parseResult, 
        file, 
        (prog) => { setSyncProgress(prog); },
        false
      );
      setStagedVersionId(versionId);
      setStagedChecksum(catalogChecksum);
      setSyncState('uploaded');
    } catch (err: any) {
      console.error(err);
      setSyncState('failed');
      setErrorMessage(err.message || 'حدث خطأ أثناء رفع الـ Chunks إلى السحابة.');
    }
  };

  const handleVerifyVersion = async () => {
    if (!stagedVersionId || !stagedChecksum || !parseResult) return;
    setSyncState('verifying');
    setErrorMessage(null);

    try {
      await verifyServerCatalog(stagedVersionId, stagedChecksum, parseResult.stats.totalProducts);
      setSyncState('verified');
    } catch (err: any) {
      console.error(err);
      setSyncState('failed');
      setErrorMessage(err.message || 'فشل التحقق من الإصدار على السحابة.');
    }
  };

  const handleActivateVersion = async () => {
    if (!stagedVersionId || !parseResult || !stagedChecksum) return;
    setSyncState('activating');
    setErrorMessage(null);

    try {
      await activateCatalogVersion(stagedVersionId, parseResult, stagedChecksum);
      setSyncState('active');
    } catch (err: any) {
      console.error(err);
      setSyncState('failed');
      setErrorMessage(err.message || 'فشل تفعيل الإصدار.');
    }
  };

  const filteredProducts = parseResult?.products.filter(p => 
    p.itemCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.name && p.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (p.modelCode && p.modelCode.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (p.barcode && p.barcode.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (p.brand && p.brand.toLowerCase().includes(searchQuery.toLowerCase()))
  ) || [];

  const totalPages = Math.ceil(filteredProducts.length / pageSize) || 1;
  const paginatedProducts = filteredProducts.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Step 4 preflight metric calculations
  const chunkCount = chunksMeta.length;
  const totalPayloadBytes = chunksMeta.reduce((acc, c) => acc + c.byteSize, 0);
  const smallestChunkBytes = chunkCount > 0 ? Math.min(...chunksMeta.map(c => c.byteSize)) : 0;
  const largestChunkBytes = chunkCount > 0 ? Math.max(...chunksMeta.map(c => c.byteSize)) : 0;
  const averageChunkBytes = chunkCount > 0 ? Math.round(totalPayloadBytes / chunkCount) : 0;

  // Dynamic Firestore write breakdown estimation based on actual workflow
  const chunkWrites = chunkCount;
  const versionMetaWrites = 3; // initial create + progress updates + verification/status updates
  const auditWrites = 4; // upload_started, upload_resumed, verified, activated
  const activationWrites = 1; // app_settings global pointer update
  const estimatedTotalWrites = chunkWrites + versionMetaWrites + auditWrites + activationWrites;

  const adminEmail = auth.currentUser?.email || 'غير مسجل الدخول';
  const adminUid = auth.currentUser?.uid || '';

  const isMissingPreflightData = !file || !parseResult || !calculatedChecksum || chunkCount === 0 || !adminUid;
  const uploadedChunksCount = resumableInfo ? resumableInfo.uploadedChunkCount : (syncState === 'uploaded' || syncState === 'verified' || syncState === 'active' ? chunkCount : 0);
  const remainingChunks = Math.max(0, chunkCount - uploadedChunksCount);

  return (
    <div className="space-y-6">
      {/* Header & Status Banner */}
      <div className="bg-[#111823] border border-white/[0.08] rounded-xl p-6 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-bold text-white">استبدال الكتالوج الشامل (Full Replacement)</h2>
          </div>
          <p className="text-slate-400 text-xs mt-1 leading-relaxed">
            إدارة تدفق خطوات الاستيراد: الرفع ← التحليل والتخطيط ← مراجعة البيانات ← الرفع السحابي والتفعيل.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-slate-400 bg-[#0B1017] px-3 py-1.5 rounded-lg border border-white/[0.06]">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          <span>{adminEmail}</span>
        </div>
      </div>

      {/* Wizard Steps Progress Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { num: 1, title: '1. رفع الملف' },
          { num: 2, title: '2. تحليل البيانات' },
          { num: 3, title: '3. مراجعة المعاينة' },
          { num: 4, title: '4. الرفع والتفعيل' },
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

      {errorMessage && (
        <div className="p-3.5 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* STEP 1: UPLOAD FILE */}
      {currentStep === 1 && (
        <div className="bg-[#111823] border border-white/[0.08] rounded-xl p-12 text-center">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept=".xlsx, .xls"
            className="hidden"
            id="excel-file-input"
          />
          <label
            htmlFor="excel-file-input"
            className="cursor-pointer inline-flex flex-col items-center justify-center p-8 border-2 border-dashed border-white/[0.12] hover:border-emerald-500/60 rounded-xl bg-[#0B1017] transition-colors group max-w-md w-full"
          >
            <div className="w-12 h-12 bg-emerald-500/10 text-emerald-400 rounded-xl flex items-center justify-center mb-3 group-hover:scale-105 transition-transform border border-emerald-500/20">
              <Upload className="w-6 h-6" />
            </div>
            <span className="text-white font-semibold text-sm mb-1">اختر ملف Excel الرئيسي للكتالوج</span>
            <span className="text-slate-500 text-xs mb-4">الانتقال التلقائي إلى خطوة تحليل البيانات (Step 2)</span>
            <span className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium transition-colors shadow-sm">
              استعراض الملف (.xlsx)
            </span>
          </label>
        </div>
      )}

      {/* STEP 2: ANALYSIS & MAPPING */}
      {currentStep === 2 && (
        <div className="bg-[#111823] border border-white/[0.08] rounded-xl p-6 sm:p-8 space-y-6 shadow-xl">
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Layers className="w-5 h-5 text-emerald-400" />
                <span>تحليل البيانات واكتشاف البنية (Step 2)</span>
              </h3>
              <p className="text-slate-400 text-xs mt-0.5">فحص هيكل الملف، رصد صف العناوين، وإحصائيات مواقع المخزون التشغيلية.</p>
            </div>
            <div className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 rounded-lg text-xs font-medium">
              {parsing ? parseProgressMessage : 'اكتمل التحليل بنجاح'}
            </div>
          </div>

          {parsing ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mx-auto">
                <RefreshCw className="w-5 h-5 animate-spin" />
              </div>
              <p className="text-white font-medium text-xs">{parseProgressMessage}...</p>
            </div>
          ) : parseResult ? (
            <div className="space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="bg-[#0B1017] p-3.5 rounded-lg border border-white/[0.06]">
                  <span className="text-slate-500 block mb-0.5 text-[11px]">اسم الملف الفعلي</span>
                  <span className="text-white font-medium truncate block">{parseResult.fileName}</span>
                </div>
                <div className="bg-[#0B1017] p-3.5 rounded-lg border border-white/[0.06]">
                  <span className="text-slate-500 block mb-0.5 text-[11px]">حجم الملف</span>
                  <span className="text-white font-medium">{(parseResult.fileSize / 1024).toFixed(1)} KB</span>
                </div>
                <div className="bg-[#0B1017] p-3.5 rounded-lg border border-white/[0.06]">
                  <span className="text-slate-500 block mb-0.5 text-[11px]">صف العناوين المكتشف</span>
                  <span className="text-emerald-400 font-bold font-mono">السطر #{parseResult.headerRowIndex + 1}</span>
                </div>
                <div className="bg-[#0B1017] p-3.5 rounded-lg border border-white/[0.06]">
                  <span className="text-slate-500 block mb-0.5 text-[11px]">عدد الصفوف المقروءة</span>
                  <span className="text-white font-bold font-mono tabular-nums">{parseResult.sourceRowCount.toLocaleString()}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                <div className="bg-[#0B1017] p-3.5 rounded-lg border border-white/[0.06]">
                  <span className="text-slate-500 block mb-0.5 text-[11px]">إجمالي الأصناف</span>
                  <span className="text-emerald-400 text-base font-bold font-mono tabular-nums">{parseResult.stats.totalProducts.toLocaleString()}</span>
                </div>
                <div className="bg-[#0B1017] p-3.5 rounded-lg border border-white/[0.06]">
                  <span className="text-slate-500 block mb-0.5 text-[11px]">مواقع المخزون</span>
                  <span className="text-emerald-400 text-base font-bold font-mono tabular-nums">{parseResult.locations.length} مواقع</span>
                </div>
                <div className="bg-[#0B1017] p-3.5 rounded-lg border border-white/[0.06]">
                  <span className="text-slate-500 block mb-0.5 text-[11px]">أصناف بمخزون (&gt;0)</span>
                  <span className="text-white text-base font-bold font-mono tabular-nums">{parseResult.stats.productsWithStock.toLocaleString()}</span>
                </div>
                <div className="bg-[#0B1017] p-3.5 rounded-lg border border-white/[0.06]">
                  <span className="text-slate-500 block mb-0.5 text-[11px]">أصناف برصيد صفري</span>
                  <span className="text-white text-base font-bold font-mono tabular-nums">{parseResult.stats.productsWithoutStock}</span>
                </div>
                <div className="bg-[#0B1017] p-3.5 rounded-lg border border-white/[0.06]">
                  <span className="text-slate-500 block mb-0.5 text-[11px]">الأخطاء المانعة</span>
                  <span className={`text-base font-bold font-mono ${parseResult.blockingErrors.length > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {parseResult.blockingErrors.length}
                  </span>
                </div>
              </div>

              <div className="bg-[#0B1017] p-4 rounded-lg border border-white/[0.06] space-y-2">
                <h4 className="text-xs font-semibold text-slate-300">مواقع المخزون التشغيلية المكتشفة ({parseResult.locations.length}):</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  {parseResult.locations.map(loc => (
                    <div key={loc.id} className="p-2 bg-[#111823] border border-white/[0.06] rounded-md text-xs flex justify-between items-center">
                      <span className="text-white font-medium">{loc.name}</span>
                      <span className="text-emerald-400 font-mono text-[10px]">{loc.id}</span>
                    </div>
                  ))}
                </div>
              </div>

              {parseResult.blockingErrors.length > 0 && (
                <div className="p-3.5 bg-red-500/10 border border-red-500/30 rounded-xl space-y-2">
                  <span className="text-red-300 font-bold text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-400" />
                    <span>توجد أخطاء مانعة تمنع الانتقال للخطوة التالية:</span>
                  </span>
                  <ul className="list-disc list-inside text-red-200 text-xs space-y-1">
                    {parseResult.blockingErrors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : null}

          <div className="flex items-center justify-between pt-4 border-t border-white/[0.08]">
            <button
              onClick={() => setCurrentStep(1)}
              className="px-3.5 py-2 bg-white/[0.06] hover:bg-white/[0.1] text-slate-300 rounded-lg text-xs font-medium transition-colors flex items-center gap-2 cursor-pointer"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              <span>العودة لاختيار ملف آخر</span>
            </button>

            <button
              onClick={handleProceedToStep3}
              disabled={parsing || !parseResult || parseResult.blockingErrors.length > 0}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-2 shadow-sm cursor-pointer"
            >
              <span>متابعة إلى مراجعة البيانات (Step 3)</span>
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: DATA REVIEW & PREVIEW */}
      {parseResult && currentStep === 3 && (
        <div className="space-y-5">
          <div className="bg-[#111823] border border-white/[0.08] rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-300">
            <div>
              <span className="text-slate-500 block text-[11px]">اسم الملف</span>
              <span className="font-semibold text-white">{parseResult.fileName}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">إجمالي الأصناف المراجعة</span>
              <span className="font-semibold text-white font-mono tabular-nums">{parseResult.stats.totalProducts.toLocaleString()}</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentStep(2)}
                className="px-3.5 py-1.5 bg-[#131B26] hover:bg-[#1A2534] border border-white/[0.08] text-slate-200 rounded-lg font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                <span>العودة للتحليل</span>
              </button>
              <button
                onClick={() => setCurrentStep(4)}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <span>الانتقال للرفع والتفعيل (Step 4)</span>
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="bg-[#111823] border border-white/[0.08] rounded-xl overflow-hidden shadow-xl">
            <div className="p-4 border-b border-white/[0.08] flex flex-col sm:flex-row items-center justify-between gap-3">
              <h3 className="font-bold text-white text-sm">مراجعة أصناف الكتالوج التفصيلية</h3>
              <div className="relative w-full sm:w-72">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute right-3 top-2.5" />
                <input
                  type="text"
                  placeholder="بحث بالكود، الباركود، أو الاسم..."
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                  className="w-full bg-[#0B1017] border border-white/[0.1] rounded-lg pr-8 pl-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-[#0B1017] text-slate-400 font-mono border-b border-white/[0.08]">
                  <tr>
                    <th className="py-2.5 px-3 font-medium">كود الصنف</th>
                    <th className="py-2.5 px-3 font-medium">الباركود / الموديل</th>
                    <th className="py-2.5 px-3 font-medium font-sans">اسم الصنف</th>
                    <th className="py-2.5 px-3 font-medium font-sans">الماركة</th>
                    <th className="py-2.5 px-3 font-medium">السعر</th>
                    <th className="py-2.5 px-3 font-medium text-emerald-400">إجمالي المخزون</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04] font-mono tabular-nums">
                  {paginatedProducts.map((p) => (
                    <tr key={p.itemCode} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-2.5 px-3 text-emerald-400 font-semibold">{p.itemCode}</td>
                      <td className="py-2.5 px-3 text-slate-400">{p.barcode || '---'}</td>
                      <td className="py-2.5 px-3 text-white font-sans max-w-xs truncate">{p.name || '---'}</td>
                      <td className="py-2.5 px-3 text-slate-400 font-sans">{p.brand || '---'}</td>
                      <td className="py-2.5 px-3 text-slate-200">{p.salePrice !== null ? `${p.salePrice} ج.م` : '---'}</td>
                      <td className="py-2.5 px-3 font-bold text-white">{p.totalStock}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="py-3 px-4 border-t border-white/[0.08] flex items-center justify-between text-xs text-slate-400 font-mono">
              <span>عرض {(currentPage - 1) * pageSize + 1} إلى {Math.min(currentPage * pageSize, filteredProducts.length)} من {filteredProducts.length} صنف</span>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 bg-[#131B26] hover:bg-[#1A2534] border border-white/[0.06] disabled:opacity-30 text-slate-300 rounded cursor-pointer"
                >
                  السابق
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 bg-[#131B26] hover:bg-[#1A2534] border border-white/[0.06] disabled:opacity-30 text-slate-300 rounded cursor-pointer"
                >
                  التالي
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STEP 4: EMBEDDED COMPREHENSIVE PREFLIGHT CONFIRMATION DASHBOARD & RESUME */}
      {parseResult && currentStep === 4 && (
        <div className="bg-[#111823] border border-white/[0.08] rounded-xl p-6 sm:p-8 space-y-6 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <CloudUpload className="w-5 h-5 text-emerald-400" />
                <span>مركز الرفع السحابي واستكمال العمليات (Step 4)</span>
              </h3>
              <p className="text-slate-400 text-xs mt-0.5">مراجعة شاملة لبيانات الملف، فحص الـ Chunks على السحابة، وتأكيد استكمال الرفع.</p>
            </div>
            <div>
              <span className={`px-2.5 py-1 rounded text-xs font-semibold ${
                syncState === 'active' ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' :
                syncState === 'verified' ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30' :
                syncState === 'uploading' || syncState === 'verifying' || syncState === 'activating' ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 animate-pulse' :
                syncState === 'failed' ? 'bg-red-500/15 text-red-300 border border-red-500/30' :
                'bg-white/[0.06] text-slate-300'
              }`}>
                {syncState === 'idle' && (resumableInfo ? 'تم العثور على رفع غير مكتمل' : 'جاهز للمراجعة والتأكيد')}
                {syncState === 'uploading' && 'جاري استكمال الرفع...'}
                {syncState === 'uploaded' && 'تم رفع/استكمال جميع الـ Chunks'}
                {syncState === 'verifying' && 'جاري التحقق من السحابة...'}
                {syncState === 'verified' && 'تم التحقق بنجاح'}
                {syncState === 'activating' && 'جاري التفعيل الذري...'}
                {syncState === 'active' && 'نشط ومفعل رسمياً'}
                {syncState === 'failed' && 'فشل العملية'}
              </span>
            </div>
          </div>

          {calculatingPreflight ? (
            <div className="py-16 text-center space-y-4">
              <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <p className="text-white font-semibold text-sm">جاري فحص حالة السحابة واستكمال بيانات الـ Chunks...</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Resumable Version Alert Banner */}
              {resumableInfo && (
                <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2 text-xs text-amber-200">
                  <div className="font-bold flex items-center gap-2 text-sm text-amber-300">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <span>تم العثور على عملية رفع غير مكتملة لنفس الكتالوج:</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono pt-1 text-xs">
                    <div className="bg-[#0B1017] p-2.5 rounded-lg border border-amber-500/20">
                      <span className="text-slate-400 block mb-0.5 text-[11px]">معرف الإصدار (Version ID):</span>
                      <span className="text-white font-bold">{resumableInfo.resumableVersionId}</span>
                    </div>
                    <div className="bg-[#0B1017] p-2.5 rounded-lg border border-amber-500/20">
                      <span className="text-slate-400 block mb-0.5 text-[11px]">التقدم الحالي للـ Chunks:</span>
                      <span className="text-emerald-400 font-bold">{uploadedChunksCount} / {chunkCount} chunks</span>
                    </div>
                    <div className="bg-[#0B1017] p-2.5 rounded-lg border border-amber-500/20">
                      <span className="text-slate-400 block mb-0.5 text-[11px]">المتبقي للرفع:</span>
                      <span className="text-amber-400 font-bold">{remainingChunks} chunks</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Preflight Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono tabular-nums">
                <div className="bg-[#0B1017] p-3.5 rounded-lg border border-white/[0.06]">
                  <span className="text-slate-500 block mb-0.5 text-[11px] font-sans">اسم الملف</span>
                  <span className="text-white font-medium truncate block font-sans">{file?.name}</span>
                </div>
                <div className="bg-[#0B1017] p-3.5 rounded-lg border border-white/[0.06]">
                  <span className="text-slate-500 block mb-0.5 text-[11px] font-sans">حجم الملف</span>
                  <span className="text-white font-medium">{(file?.size || 0).toLocaleString()} بايت</span>
                </div>
                <div className="bg-[#0B1017] p-3.5 rounded-lg border border-white/[0.06]">
                  <span className="text-slate-500 block mb-0.5 text-[11px] font-sans">إجمالي الأصناف</span>
                  <span className="text-emerald-400 font-bold text-base">{parseResult.stats.totalProducts.toLocaleString()}</span>
                </div>
                <div className="bg-[#0B1017] p-3.5 rounded-lg border border-white/[0.06]">
                  <span className="text-slate-500 block mb-0.5 text-[11px] font-sans">مواقع المخزون</span>
                  <span className="text-white font-bold text-base">{parseResult.locations.length} مواقع</span>
                </div>

                <div className="bg-[#0B1017] p-3.5 rounded-lg border border-white/[0.06]">
                  <span className="text-slate-500 block mb-0.5 text-[11px] font-sans">أصناف بمخزون (&gt;0)</span>
                  <span className="text-white font-bold">{parseResult.stats.productsWithStock.toLocaleString()}</span>
                </div>
                <div className="bg-[#0B1017] p-3.5 rounded-lg border border-white/[0.06]">
                  <span className="text-slate-500 block mb-0.5 text-[11px] font-sans">أصناف برصيد صفري</span>
                  <span className="text-white font-bold">{parseResult.stats.productsWithoutStock}</span>
                </div>
                <div className="bg-[#0B1017] p-3.5 rounded-lg border border-white/[0.06]">
                  <span className="text-slate-500 block mb-0.5 text-[11px] font-sans">إجمالي الوحدات</span>
                  <span className="text-emerald-400 font-bold">{parseResult.stats.totalOperationalUnits.toLocaleString()}</span>
                </div>
                <div className="bg-[#0B1017] p-3.5 rounded-lg border border-white/[0.06]">
                  <span className="text-slate-500 block mb-0.5 text-[11px] font-sans">أصناف/وحدات AUC</span>
                  <span className="text-white font-bold">{parseResult.stats.aucPositiveCount || 0} / {parseResult.stats.aucTotalUnits || 0}</span>
                </div>

                <div className="bg-[#0B1017] p-3.5 rounded-lg border border-white/[0.06]">
                  <span className="text-slate-500 block mb-0.5 text-[11px] font-sans">عدد الـ Chunks</span>
                  <span className="text-emerald-400 font-bold text-base">{chunkCount} chunks</span>
                </div>
                <div className="bg-[#0B1017] p-3.5 rounded-lg border border-white/[0.06]">
                  <span className="text-slate-500 block mb-0.5 text-[11px] font-sans">إجمالي بايتات الكتالوج</span>
                  <span className="text-white font-bold">{totalSerializedBytes.toLocaleString()} بايت</span>
                </div>
                <div className="bg-[#0B1017] p-3.5 rounded-lg border border-white/[0.06]">
                  <span className="text-slate-500 block mb-0.5 text-[11px] font-sans">أصغر / أكبر / متوسط</span>
                  <span className="text-white font-bold text-[11px]">{(smallestChunkBytes/1024).toFixed(0)}K / {(largestChunkBytes/1024).toFixed(0)}K / {(averageChunkBytes/1024).toFixed(0)}K</span>
                </div>
                <div className="bg-[#0B1017] p-3.5 rounded-lg border border-white/[0.06]">
                  <span className="text-slate-500 block mb-0.5 text-[11px] font-sans">العمليات المقدرة</span>
                  <span className="text-amber-400 font-bold text-base">~{estimatedTotalWrites} كتابة</span>
                </div>
              </div>

              {/* Full SHA-256 Checksum Card */}
              <div className="bg-[#0B1017] p-3.5 rounded-lg border border-white/[0.06] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-xs font-semibold">بصمة SHA-256 الكاملة للكتالوج:</span>
                  <button
                    onClick={() => {
                      if (calculatedChecksum) {
                        navigator.clipboard.writeText(calculatedChecksum);
                        setCopiedHash(true);
                        setTimeout(() => setCopiedHash(false), 2000);
                      }
                    }}
                    className="px-2.5 py-1 bg-[#131B26] hover:bg-[#1A2534] text-emerald-400 border border-white/[0.08] rounded text-xs flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    {copiedHash ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedHash ? 'تم النسخ!' : 'نسخ البصمة'}</span>
                  </button>
                </div>
                <div className="p-2.5 bg-[#111823] border border-white/[0.06] rounded font-mono text-emerald-400 text-xs break-all">
                  {calculatedChecksum || 'جاري الحساب...'}
                </div>
              </div>

              {/* Admin UID & Email Card */}
              <div className="bg-[#0B1017] p-3.5 rounded-lg border border-white/[0.06] grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-500 block mb-0.5 text-[11px]">البريد الإلكتروني للمسؤول:</span>
                  <span className="text-white font-medium">{adminEmail}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-slate-500 block mb-0.5 text-[11px]">معرف المسؤول (Admin UID):</span>
                    <span className="text-white font-mono truncate max-w-[200px] inline-block align-bottom">{adminUid || 'غير متوفر'}</span>
                  </div>
                  <button
                    onClick={() => {
                      if (adminUid) {
                        navigator.clipboard.writeText(adminUid);
                        setCopiedUid(true);
                        setTimeout(() => setCopiedUid(false), 2000);
                      }
                    }}
                    className="px-2.5 py-1 bg-[#131B26] hover:bg-[#1A2534] text-emerald-400 border border-white/[0.08] rounded text-xs flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    {copiedUid ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedUid ? 'تم النسخ!' : 'نسخ'}</span>
                  </button>
                </div>
              </div>

              {/* Chunk Preview Table */}
              <div className="bg-[#0B1017] rounded-lg border border-white/[0.08] overflow-hidden">
                <div className="p-3 bg-[#111823] border-b border-white/[0.06] text-xs font-bold text-white flex items-center justify-between">
                  <span>معاينة الـ Chunks قبل الرفع واستكمال النواقص ({chunkCount} chunks)</span>
                </div>
                <div className="max-h-56 overflow-y-auto">
                  <table className="w-full text-right text-xs font-mono tabular-nums">
                    <thead className="bg-[#111823] text-slate-400 sticky top-0 border-b border-white/[0.06]">
                      <tr>
                        <th className="py-2 px-3">رقم الـ Chunk</th>
                        <th className="py-2 px-3">عدد الأصناف</th>
                        <th className="py-2 px-3">حجم الحمولة</th>
                        <th className="py-2 px-3">الحالة على السحابة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {chunksMeta.map((c) => {
                        const existsRemotely = resumableInfo?.existingChunksMap.has(c.chunkIndex);
                        return (
                          <tr key={c.chunkIndex} className="hover:bg-white/[0.02]">
                            <td className="py-2 px-3 text-emerald-400 font-bold">Chunk #{c.chunkIndex}</td>
                            <td className="py-2 px-3 text-white">{c.productCount.toLocaleString()} صنف</td>
                            <td className="py-2 px-3 text-slate-300">{c.byteSize.toLocaleString()} بايت</td>
                            <td className="py-2 px-3">
                              {existsRemotely ? (
                                <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 rounded text-[10px]">موجود (مُتخطى)</span>
                              ) : (
                                <span className="px-2 py-0.5 bg-amber-500/10 text-amber-300 border border-amber-500/20 rounded text-[10px]">غير موجود (سيتم رفعه)</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Two-Stage Confirmation Checkbox & Resume/Upload Button */}
              <div className="bg-[#0B1017] p-5 rounded-lg border border-white/[0.06] space-y-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={preflightAgreed}
                    onChange={(e) => setPreflightAgreed(e.target.checked)}
                    className="mt-1 w-4 h-4 accent-emerald-500 rounded bg-[#111823] border-white/[0.1] cursor-pointer"
                  />
                  <span className="text-white text-xs leading-relaxed font-medium">
                    راجعت بيانات الملف وأوافق على استكمال الرفع للسحابة وتحديث مؤشر الكتالوج النشط وفقاً للشروط المعمارية والأمنية المعتمدة.
                  </span>
                </label>

                <div className="flex items-center justify-between pt-2">
                  <button
                    onClick={() => setCurrentStep(3)}
                    className="px-3.5 py-2 bg-white/[0.06] hover:bg-white/[0.1] text-slate-300 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                    <span>العودة لمراجعة البيانات</span>
                  </button>

                  <div className="flex items-center gap-3">
                    {syncState === 'idle' && (
                      <button
                        onClick={handleStartUpload}
                        disabled={!preflightAgreed || isMissingPreflightData}
                        className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-2 shadow-sm cursor-pointer"
                      >
                        <CloudUpload className="w-4 h-4" />
                        <span>{resumableInfo ? 'استكمال الرفع (Resume Upload)' : 'بدء الرفع للسحابة'}</span>
                      </button>
                    )}

                    {syncState === 'uploaded' && (
                      <button
                        onClick={handleVerifyVersion}
                        className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-2 shadow-sm cursor-pointer"
                      >
                        <CheckCheck className="w-4 h-4" />
                        <span>التحقق من النسخة (Server Verification)</span>
                      </button>
                    )}

                    {syncState === 'verified' && (
                      <button
                        onClick={handleActivateVersion}
                        className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-2 shadow-sm cursor-pointer"
                      >
                        <Zap className="w-4 h-4" />
                        <span>تفعيل النسخة رسمياً (Atomic Activation)</span>
                      </button>
                    )}

                    {syncState === 'active' && (
                      <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 rounded-lg text-xs font-bold">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span>تم التفعيل بنجاح والكتالوج نشط الآن!</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
