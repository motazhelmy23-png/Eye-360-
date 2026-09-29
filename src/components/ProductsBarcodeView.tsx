import React, { useState, useEffect, useRef } from 'react';
import { BarcodeScanner } from './BarcodeScanner';
import { NormalizedProduct } from '../types/inventory';
import { openCatalogDB, getActiveCatalogMeta, getLocalIndexedDbState, searchLocalProducts, getProductByBarcodeOrModel } from '../services/indexedDbService';
import { quickCloudHealthCheck, CloudHealthResult } from '../services/dataIntegrityService';
import { syncMissedRevisions, getSyncDiagnostics, SyncDiagnosticsInfo } from '../services/missedRevisionSyncService';
import { 
  Barcode, Search, Shield, AlertTriangle, RefreshCw, CheckCircle2, 
  ChevronRight, ChevronLeft, Eye, X, HardDrive, Package, Cpu, 
  Camera, Scan, Terminal, CheckCheck, Tag, ArrowUpRight
} from 'lucide-react';

export default function ProductsBarcodeView() {
  const [products, setProducts] = useState<NormalizedProduct[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<NormalizedProduct[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<NormalizedProduct | null>(null);
  const [cloudHealth, setCloudHealth] = useState<CloudHealthResult | null>(null);
  const [localMeta, setLocalMeta] = useState<any>(null);
  const [staleWarning, setStaleWarning] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<SyncDiagnosticsInfo | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  // Camera scanner modal state
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [cameraInput, setCameraInput] = useState('');

  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    initView();
  }, []);

  const initView = async () => {
    setLoading(true);
    try {
      const q = await quickCloudHealthCheck();
      setCloudHealth(q);
      const meta = await getActiveCatalogMeta();
      setLocalMeta(meta);

      const isStale = q.healthy && meta && (meta.activeInventoryRevision ?? 0) < q.activeInventoryRevision;
      setStaleWarning(Boolean(isStale));

      const diag = await getSyncDiagnostics();
      setDiagnostics(diag);

      const all = await searchLocalProducts('', 15000);
      setProducts(all);
      setFilteredProducts(all);
    } catch (err) {
      console.error('Failed to load products from IndexedDB:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (q: string) => {
    setSearchQuery(q);
    setCurrentPage(1);
    const queryStr = q.trim().toLowerCase();
    if (!queryStr) {
      setFilteredProducts(products);
      return;
    }

    const exactMatches = products.filter(p => 
      p.itemCode.toLowerCase() === queryStr ||
      (p.barcode && p.barcode.toLowerCase() === queryStr) ||
      (p.modelCode && p.modelCode.toLowerCase() === queryStr)
    );

    if (exactMatches.length > 0) {
      const others = products.filter(p => !exactMatches.includes(p));
      setFilteredProducts([...exactMatches, ...others]);
      return;
    }

    const matched = products.filter(p =>
      p.itemCode.toLowerCase().includes(queryStr) ||
      (p.name && p.name.toLowerCase().includes(queryStr)) ||
      (p.barcode && p.barcode.toLowerCase().includes(queryStr)) ||
      (p.modelCode && p.modelCode.toLowerCase().includes(queryStr)) ||
      (p.brand && p.brand.toLowerCase().includes(queryStr)) ||
      (p.category && p.category.toLowerCase().includes(queryStr))
    );
    setFilteredProducts(matched);
  };

  // USB Barcode Scanner listener
  useEffect(() => {
    let barcodeBuffer = '';
    let lastKeyTime = Date.now();

    const handleKeyDown = (e: KeyboardEvent) => {
      const currentTime = Date.now();
      if (currentTime - lastKeyTime > 100) {
        barcodeBuffer = '';
      }
      lastKeyTime = currentTime;

      if (e.key === 'Enter') {
        if (barcodeBuffer.trim().length > 2) {
          const scanned = barcodeBuffer.trim();
          handleSearch(scanned);
          barcodeBuffer = '';
          e.preventDefault();
        }
      } else if (e.key.length === 1) {
        barcodeBuffer += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [products]);

  const handleSyncNow = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await syncMissedRevisions((msg) => {
        setSyncMessage(msg);
      });
      if (res.updatesApplied === 0) {
        setSyncMessage('البيانات محدثة بالفعل.');
      } else {
        setSyncMessage(`تم تطبيق Revision ${res.finalRevision} بنجاح (${res.updatesApplied} تحديث تم تطبيقه).`);
      }
      await initView();
    } catch (err: any) {
      console.error('Missed revision sync failed:', err);
      setSyncMessage(`فشل مزامنة المراجعات: ${err.message || 'خطأ غير معروف'}`);
    } finally {
      setSyncing(false);
    }
  };

  const totalProducts = products.length;
  const productsWithStock = products.filter(p => p.totalStock > 0).length;
  const productsWithoutStock = totalProducts - productsWithStock;
  const currentRevision = localMeta?.activeInventoryRevision ?? 0;

  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const paginatedProducts = filteredProducts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  if (loading) {
    return (
      <div className="bg-[#111823] border border-white/[0.08] rounded-xl p-16 text-center space-y-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mx-auto">
          <RefreshCw className="w-5 h-5 animate-spin" />
        </div>
        <p className="text-slate-400 text-xs">جاري تحميل الأصناف والباركود من قاعدة البيانات المحلية...</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Revision Status Strip */}
      {staleWarning ? (
        <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
            <span>البيانات المحلية تحتاج إلى مزامنة (المراجعة المحلية Rev {currentRevision} أقدم من السحابة Rev {cloudHealth?.activeInventoryRevision}).</span>
          </div>
          <button
            onClick={handleSyncNow}
            disabled={syncing}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold flex items-center gap-2 cursor-pointer shadow-sm"
          >
            <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
            <span>مزامنة الآن</span>
          </button>
        </div>
      ) : (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCheck className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>البيانات المحلية متطابقة تماماً مع السحابة (Rev {currentRevision}).</span>
          </div>
          <button
            onClick={handleSyncNow}
            disabled={syncing}
            className="px-2.5 py-1 bg-[#131B26] hover:bg-[#1A2534] border border-white/[0.08] text-slate-300 rounded text-[11px] font-medium flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
            <span>فحص التحديثات</span>
          </button>
        </div>
      )}

      {syncMessage && (
        <div className="p-3 bg-[#111823] border border-white/[0.08] rounded-lg text-xs text-white flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{syncMessage}</span>
        </div>
      )}

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[#111823] border border-white/[0.08] rounded-xl p-4 space-y-1">
          <span className="text-slate-400 text-xs block">إجمالي الأصناف (Local DB)</span>
          <span className="text-white font-bold text-xl font-mono tabular-nums">{totalProducts.toLocaleString()}</span>
        </div>
        <div className="bg-[#111823] border border-white/[0.08] rounded-xl p-4 space-y-1">
          <span className="text-slate-400 text-xs block">الأصناف المتوفرة بمخزون</span>
          <span className="text-emerald-400 font-bold text-xl font-mono tabular-nums">{productsWithStock.toLocaleString()}</span>
        </div>
        <div className="bg-[#111823] border border-white/[0.08] rounded-xl p-4 space-y-1">
          <span className="text-slate-400 text-xs block">أصناف بدون مخزون (صفر)</span>
          <span className="text-slate-400 font-bold text-xl font-mono tabular-nums">{productsWithoutStock.toLocaleString()}</span>
        </div>
        <div className="bg-[#111823] border border-white/[0.08] rounded-xl p-4 space-y-1">
          <span className="text-slate-400 text-xs block">المراجعة الحالية</span>
          <span className="text-emerald-400 font-bold text-xl font-mono tabular-nums">Rev {currentRevision}</span>
        </div>
      </div>

      {/* Search & Barcode Command Bar */}
      <div className="bg-[#111823] border border-white/[0.08] rounded-xl p-4 shadow-xl space-y-3">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-500 absolute right-3.5 top-3" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="ابحث بررمز الصنف (itemCode)، الباركود (7394586123476)، الموديل، الاسم، أو الماركة..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full bg-[#0B1017] border border-white/[0.1] rounded-lg pr-10 pl-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-colors font-mono"
            />
          </div>
          <button
            onClick={() => setShowCameraModal(true)}
            className="px-3.5 py-2.5 bg-[#131B26] hover:bg-[#1A2534] border border-white/[0.08] text-slate-200 rounded-lg text-xs font-medium flex items-center gap-2 shrink-0 transition-colors cursor-pointer"
          >
            <Camera className="w-3.5 h-3.5 text-emerald-400" />
            <span>مسح بالكاميرا</span>
          </button>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500 font-mono px-1">
          <div className="flex items-center gap-1.5">
            <span>النتائج:</span>
            <strong className="text-white tabular-nums">{filteredProducts.length.toLocaleString()}</strong>
            <span>صنف</span>
          </div>
          <span className="text-[11px]">يدعم قارئات الباركود USB تلقائياً</span>
        </div>
      </div>

      {/* High Density Table */}
      <div className="bg-[#111823] border border-white/[0.08] rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-[#0B1017] text-slate-400 font-mono border-b border-white/[0.08]">
              <tr>
                <th className="py-3 px-4 font-medium">كود الصنف</th>
                <th className="py-3 px-4 font-medium">الباركود / الموديل</th>
                <th className="py-3 px-4 font-medium font-sans">اسم الصنف</th>
                <th className="py-3 px-4 font-medium font-sans">الماركة</th>
                <th className="py-3 px-4 font-medium font-sans">التصنيف</th>
                <th className="py-3 px-4 font-medium">السعر</th>
                <th className="py-3 px-4 font-medium text-slate-400">إجمالي المخزون</th>
                <th className="py-3 px-4 font-medium text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04] font-mono tabular-nums">
              {paginatedProducts.map((p) => (
                <tr key={p.itemCode} className="hover:bg-white/[0.02] transition-colors">
                  <td className="py-3 px-4 text-emerald-400 font-semibold">{p.itemCode}</td>
                  <td className="py-3 px-4 text-slate-400">{p.barcode || p.modelCode || '—'}</td>
                  <td className="py-3 px-4 text-white font-sans max-w-xs truncate">{p.name || '—'}</td>
                  <td className="py-3 px-4 text-slate-400 font-sans">{p.brand || '—'}</td>
                  <td className="py-3 px-4 text-slate-500 font-sans">{p.category || '—'}</td>
                  <td className="py-3 px-4 text-emerald-400 font-semibold">{p.salePrice !== null ? `${p.salePrice} ج.م` : '—'}</td>
                  <td className="py-3 px-4 text-white font-semibold">{p.totalStock.toLocaleString()}</td>
                  <td className="py-3 px-4 text-center">
                    <button
                      onClick={() => setSelectedProduct(p)}
                      className="px-2.5 py-1 bg-[#131B26] hover:bg-[#1A2534] border border-white/[0.06] text-slate-200 rounded-md text-[11px] font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Eye className="w-3 h-3 text-emerald-400" />
                      <span>التفاصيل</span>
                    </button>
                  </td>
                </tr>
              ))}
              {paginatedProducts.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500 font-sans">
                    لا توجد أصناف مطابقة للبحث.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="py-3 px-4 bg-[#0B1017] border-t border-white/[0.08] flex items-center justify-between text-xs font-mono">
            <span className="text-slate-500">
              صفحة {currentPage} من {totalPages}
            </span>
            <div className="flex gap-1.5">
              <button
                onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 bg-[#131B26] hover:bg-[#1A2534] border border-white/[0.06] disabled:opacity-30 text-slate-300 rounded cursor-pointer disabled:cursor-not-allowed"
              >
                السابق
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 bg-[#131B26] hover:bg-[#1A2534] border border-white/[0.06] disabled:opacity-30 text-slate-300 rounded cursor-pointer disabled:cursor-not-allowed"
              >
                التالي
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Product Details Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#111823] border border-white/[0.1] rounded-xl max-w-xl w-full p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto dir-rtl font-sans">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <div>
                <span className="text-xs text-emerald-400 font-mono font-bold block">{selectedProduct.itemCode}</span>
                <h3 className="text-base font-bold text-white mt-0.5">{selectedProduct.name || 'بدون اسم صنف'}</h3>
              </div>
              <button
                onClick={() => setSelectedProduct(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/[0.04]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 font-mono text-xs tabular-nums">
              <div className="bg-[#0B1017] p-3 rounded-lg border border-white/[0.06]">
                <span className="text-slate-500 block mb-1 text-[11px]">الباركود</span>
                <span className="text-white font-bold">{selectedProduct.barcode || '—'}</span>
              </div>
              <div className="bg-[#0B1017] p-3 rounded-lg border border-white/[0.06]">
                <span className="text-slate-500 block mb-1 text-[11px]">كود الموديل</span>
                <span className="text-white font-bold">{selectedProduct.modelCode || '—'}</span>
              </div>
              <div className="bg-[#0B1017] p-3 rounded-lg border border-white/[0.06]">
                <span className="text-slate-500 block mb-1 text-[11px]">الماركة</span>
                <span className="text-white font-bold font-sans">{selectedProduct.brand || '—'}</span>
              </div>
              <div className="bg-[#0B1017] p-3 rounded-lg border border-white/[0.06]">
                <span className="text-slate-500 block mb-1 text-[11px]">التصنيف</span>
                <span className="text-white font-bold font-sans">{selectedProduct.category || '—'}</span>
              </div>
              <div className="bg-[#0B1017] p-3 rounded-lg border border-white/[0.06]">
                <span className="text-slate-500 block mb-1 text-[11px]">سعر البيع (Rev {currentRevision})</span>
                <span className="text-emerald-400 font-bold">{selectedProduct.salePrice !== null ? `${selectedProduct.salePrice} ج.م` : '—'}</span>
              </div>
              <div className="bg-[#0B1017] p-3 rounded-lg border border-white/[0.06]">
                <span className="text-slate-500 block mb-1 text-[11px]">إجمالي المخزون</span>
                <span className="text-white font-bold">{selectedProduct.totalStock}</span>
              </div>
            </div>

            {/* Stocks Breakdown */}
            <div className="space-y-2.5">
              <h4 className="text-white font-semibold text-xs">أرصدة المخزون حسب الفروع والمواقع التشغيلية:</h4>
              <div className="bg-[#0B1017] rounded-lg border border-white/[0.06] divide-y divide-white/[0.04] font-mono text-xs max-h-48 overflow-y-auto">
                {selectedProduct.stocks && Object.entries(selectedProduct.stocks).map(([locId, qty]) => (
                  <div key={locId} className="p-2.5 flex items-center justify-between">
                    <span className="text-slate-300 font-semibold">{locId}</span>
                    <span className="text-emerald-400 font-bold tabular-nums">{qty} وحدة</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedProduct(null)}
                className="px-4 py-2 bg-white/[0.08] hover:bg-white/[0.12] text-white rounded-lg text-xs font-medium cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Camera Barcode Scanner Modal */}
      {showCameraModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#111823] border border-white/[0.1] rounded-xl max-w-sm w-full p-6 shadow-2xl space-y-4 dir-rtl font-sans text-center">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <h3 className="text-white font-semibold text-xs flex items-center gap-2">
                <Scan className="w-4 h-4 text-emerald-400" />
                <span>مسح باركود بالكاميرا</span>
              </h3>
              <button
                onClick={() => setShowCameraModal(false)}
                className="p-1 text-slate-400 hover:text-white rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 bg-[#0B1017] border border-white/[0.12] rounded-lg space-y-3">
              <BarcodeScanner
                onScanSuccess={(decodedText) => {
                  setCameraInput(decodedText);
                  handleSearch(decodedText);
                  setShowCameraModal(false);
                  setCameraInput('');
                }}
              />
              <input
                type="text"
                placeholder="أدخل الباركود يدوياً"
                value={cameraInput}
                onChange={(e) => setCameraInput(e.target.value)}
                className="w-full bg-[#111823] border border-white/[0.1] rounded-lg px-3 py-2 text-white text-xs font-mono text-center"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowCameraModal(false)}
                className="px-3 py-1.5 bg-white/[0.06] text-slate-400 rounded-lg text-xs cursor-pointer"
              >
                إلغاء
              </button>
              <button
                onClick={() => {
                  if (cameraInput.trim()) {
                    handleSearch(cameraInput.trim());
                    setShowCameraModal(false);
                    setCameraInput('');
                  }
                }}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium cursor-pointer"
              >
                بحث بالباركود
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
