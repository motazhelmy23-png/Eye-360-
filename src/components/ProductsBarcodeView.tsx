import React, { useState, useEffect, useRef } from 'react';
import { BarcodeScanner } from './BarcodeScanner';
import { BarcodeLabelModal } from './BarcodeLabelModal';
import { ProductDetailsModal } from './ProductDetailsModal';
import { NormalizedProduct } from '../types/inventory';
import { openCatalogDB, getActiveCatalogMeta, getLocalIndexedDbState, searchLocalProducts, getProductByBarcodeOrModel } from '../services/indexedDbService';
import { quickCloudHealthCheck, CloudHealthResult } from '../services/dataIntegrityService';
import { syncMissedRevisions, getSyncDiagnostics, SyncDiagnosticsInfo } from '../services/missedRevisionSyncService';
import { 
  Barcode, Search, Shield, AlertTriangle, RefreshCw, CheckCircle2, 
  ChevronRight, ChevronLeft, Eye, X, HardDrive, Package, Cpu, 
  Camera, Scan, Terminal, CheckCheck, Tag, ArrowUpRight, Printer,
  CheckSquare, Square
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

  // Batch Selection for Barcode Printing
  const [selectedItemCodes, setSelectedItemCodes] = useState<Set<string>>(new Set());
  const [productsToPrint, setProductsToPrint] = useState<NormalizedProduct[]>([]);
  const [showLabelModal, setShowLabelModal] = useState(false);

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
      setFilteredProducts(exactMatches);
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

  // Selection helpers for batch printing
  const toggleSelectProduct = (itemCode: string) => {
    const next = new Set(selectedItemCodes);
    if (next.has(itemCode)) {
      next.delete(itemCode);
    } else {
      next.add(itemCode);
    }
    setSelectedItemCodes(next);
  };

  const toggleSelectAllCurrentPage = () => {
    const currentCodes = paginatedProducts.map(p => p.itemCode);
    const allSelected = currentCodes.every(c => selectedItemCodes.has(c));
    const next = new Set(selectedItemCodes);
    if (allSelected) {
      currentCodes.forEach(c => next.delete(c));
    } else {
      currentCodes.forEach(c => next.add(c));
    }
    setSelectedItemCodes(next);
  };

  const openPrintModalForProducts = (prods: NormalizedProduct[]) => {
    if (prods.length === 0) return;
    setProductsToPrint(prods);
    setShowLabelModal(true);
  };

  const openPrintModalForSelected = () => {
    const selected = products.filter(p => selectedItemCodes.has(p.itemCode));
    if (selected.length > 0) {
      openPrintModalForProducts(selected);
    }
  };

  const totalProducts = products.length;
  const productsWithStock = products.filter(p => p.totalStock > 0).length;
  const productsWithoutStock = totalProducts - productsWithStock;
  const currentRevision = localMeta?.activeInventoryRevision ?? 0;

  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const paginatedProducts = filteredProducts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const isAllCurrentPageSelected = paginatedProducts.length > 0 && paginatedProducts.every(p => selectedItemCodes.has(p.itemCode));

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center space-y-3 shadow-xs">
        <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 mx-auto">
          <RefreshCw className="w-5 h-5 animate-spin" />
        </div>
        <p className="text-slate-500 text-xs font-medium">جاري تحميل الأصناف والباركود من قاعدة البيانات المحلية...</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Revision Status Strip */}
      {staleWarning ? (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-900 text-xs flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
            <span className="font-medium">البيانات المحلية تحتاج إلى مزامنة (المراجعة المحلية Rev {currentRevision} أقدم من السحابة Rev {cloudHealth?.activeInventoryRevision}).</span>
          </div>
          <button
            onClick={handleSyncNow}
            disabled={syncing}
            className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer shadow-xs transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            <span>مزامنة الآن</span>
          </button>
        </div>
      ) : (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-900 text-xs flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2.5">
            <CheckCheck className="w-4 h-4 shrink-0 text-emerald-600" />
            <span className="font-medium">البيانات المحلية متطابقة تماماً مع السحابة (Rev {currentRevision}).</span>
          </div>
          <button
            onClick={handleSyncNow}
            disabled={syncing}
            className="px-3 py-1.5 bg-white hover:bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-emerald-600 ${syncing ? 'animate-spin' : ''}`} />
            <span>فحص التحديثات</span>
          </button>
        </div>
      )}

      {syncMessage && (
        <div className="p-3.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 flex items-center gap-2.5 shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-medium">{syncMessage}</span>
        </div>
      )}

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-1 shadow-xs">
          <span className="text-slate-500 text-xs font-medium block">إجمالي الأصناف (Local DB)</span>
          <span className="text-slate-900 font-bold text-xl font-mono tabular-nums">{totalProducts.toLocaleString()}</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-1 shadow-xs">
          <span className="text-slate-500 text-xs font-medium block">الأصناف المتوفرة بمخزون</span>
          <span className="text-emerald-600 font-bold text-xl font-mono tabular-nums">{productsWithStock.toLocaleString()}</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-1 shadow-xs">
          <span className="text-slate-500 text-xs font-medium block">أصناف بدون مخزون (صفر)</span>
          <span className="text-slate-500 font-bold text-xl font-mono tabular-nums">{productsWithoutStock.toLocaleString()}</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-1 shadow-xs">
          <span className="text-slate-500 text-xs font-medium block">المراجعة الحالية</span>
          <span className="text-blue-600 font-bold text-xl font-mono tabular-nums">Rev {currentRevision}</span>
        </div>
      </div>

      {/* Search & Barcode Command Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3.5">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="ابحث برمز الصنف (itemCode)، الباركود، الموديل، الاسم، أو الماركة..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl pr-10 pl-4 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:bg-white focus:ring-1 focus:ring-blue-600/30 transition-colors font-mono"
            />
          </div>

          <div className="flex items-center gap-2.5 w-full md:w-auto">
            {selectedItemCodes.size > 0 && (
              <button
                onClick={openPrintModalForSelected}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shrink-0 transition-colors cursor-pointer shadow-sm animate-pulse"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة باركود ({selectedItemCodes.size}) صنف</span>
              </button>
            )}

            <button
              onClick={() => setShowCameraModal(true)}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-2 shrink-0 transition-colors cursor-pointer shadow-sm"
            >
              <Camera className="w-4 h-4" />
              <span>مسح بالكاميرا</span>
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500 font-mono px-1">
          <div className="flex items-center gap-2">
            <span>النتائج:</span>
            <strong className="text-slate-900 font-bold tabular-nums">{filteredProducts.length.toLocaleString()}</strong>
            <span>صنف</span>
            {selectedItemCodes.size > 0 && (
              <span className="text-blue-600 font-bold mr-2">
                (المحدد: {selectedItemCodes.size} صنف)
              </span>
            )}
          </div>
          <span className="text-[11px] text-slate-400">يدعم قارئات الباركود USB وطابعات الملصقات الحرارية</span>
        </div>
      </div>

      {/* High Density Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-600 font-mono border-b border-slate-200">
              <tr>
                <th className="py-3 px-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={isAllCurrentPageSelected}
                    onChange={toggleSelectAllCurrentPage}
                    className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                    title="تحديد كافة أصناف الصفحة الحالية"
                  />
                </th>
                <th className="py-3 px-3 font-semibold">كود الصنف</th>
                <th className="py-3 px-3 font-semibold">الباركود / الموديل</th>
                <th className="py-3 px-3 font-semibold font-sans">اسم الصنف</th>
                <th className="py-3 px-3 font-semibold font-sans">الماركة</th>
                <th className="py-3 px-3 font-semibold font-sans">التصنيف</th>
                <th className="py-3 px-3 font-semibold">السعر</th>
                <th className="py-3 px-3 font-semibold text-slate-600">إجمالي المخزون</th>
                <th className="py-3 px-3 font-semibold text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
              {paginatedProducts.map((p) => {
                const isChecked = selectedItemCodes.has(p.itemCode);
                return (
                  <tr key={p.itemCode} className={`hover:bg-slate-50/80 transition-colors ${isChecked ? 'bg-blue-50/30' : ''}`}>
                    <td className="py-3 px-3 text-center">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleSelectProduct(p.itemCode)}
                        className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                      />
                    </td>
                    <td className="py-3 px-3 text-blue-600 font-bold">{p.itemCode}</td>
                    <td className="py-3 px-3 text-slate-600">{p.barcode || p.modelCode || '—'}</td>
                    <td className="py-3 px-3 text-slate-900 font-sans max-w-xs truncate font-medium">{p.name || '—'}</td>
                    <td className="py-3 px-3 text-slate-600 font-sans">{p.brand || '—'}</td>
                    <td className="py-3 px-3 text-slate-500 font-sans">{p.category || '—'}</td>
                    <td className="py-3 px-3 text-slate-900 font-bold">{p.salePrice !== null ? `${p.salePrice} ج.م` : '—'}</td>
                    <td className="py-3 px-3 text-slate-900 font-bold">{p.totalStock.toLocaleString()}</td>
                    <td className="py-3 px-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => openPrintModalForProducts([p])}
                          className="px-2.5 py-1 bg-white hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 text-slate-700 hover:text-emerald-700 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                          title="طباعة باركود الصنف"
                        >
                          <Printer className="w-3.5 h-3.5 text-emerald-600" />
                          <span>طباعة</span>
                        </button>
                        <button
                          onClick={() => setSelectedProduct(p)}
                          className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                        >
                          <Eye className="w-3.5 h-3.5 text-blue-600" />
                          <span>التفاصيل</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {paginatedProducts.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500 font-sans">
                    لا توجد أصناف مطابقة للبحث.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="py-3.5 px-5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs font-mono">
            <span className="text-slate-600 font-medium">
              صفحة {currentPage} من {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 disabled:opacity-40 text-slate-700 rounded-lg cursor-pointer disabled:cursor-not-allowed font-medium shadow-2xs"
              >
                السابق
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 disabled:opacity-40 text-slate-700 rounded-lg cursor-pointer disabled:cursor-not-allowed font-medium shadow-2xs"
              >
                التالي
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Product Details Modal */}
      {selectedProduct && (
        <ProductDetailsModal
          product={selectedProduct}
          allProducts={products}
          isOpen={Boolean(selectedProduct)}
          onClose={() => setSelectedProduct(null)}
          onSelectProduct={(p) => setSelectedProduct(p)}
          onOpenPrintModal={(p) => {
            setSelectedProduct(null);
            openPrintModalForProducts([p]);
          }}
          isAdmin={true}
        />
      )}

      {/* Camera Barcode Scanner Modal */}
      {showCameraModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4 dir-rtl font-sans text-center">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-slate-900 font-bold text-xs flex items-center gap-2">
                <Scan className="w-4 h-4 text-blue-600" />
                <span>مسح باركود بالكاميرا</span>
              </h3>
              <button
                onClick={() => setShowCameraModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Camera Viewport Area — preserved dark for video feed */}
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
              <BarcodeScanner
                onScanSuccess={(decodedText) => {
                  setCameraInput(decodedText);
                  handleSearch(decodedText);
                  setShowCameraModal(false);
                  setCameraInput('');
                }}
                onScanError={(err) => {
                  console.warn('Barcode scan error:', err);
                }}
              />
              <input
                type="text"
                placeholder="أدخل الباركود يدوياً"
                value={cameraInput}
                onChange={(e) => setCameraInput(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs font-mono text-center placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowCameraModal(false)}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
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
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold cursor-pointer transition-colors shadow-xs"
              >
                بحث بالباركود
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Barcode Label Printing Modal */}
      {showLabelModal && (
        <BarcodeLabelModal
          products={productsToPrint}
          isOpen={showLabelModal}
          onClose={() => {
            setShowLabelModal(false);
            setProductsToPrint([]);
          }}
        />
      )}
    </div>
  );
}
