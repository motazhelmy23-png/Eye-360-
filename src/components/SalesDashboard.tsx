import React, { useState, useEffect, useRef } from 'react';
import { BrandLogo } from './BrandLogo';
import { BarcodeScanner } from './BarcodeScanner';
import { BarcodeLabelModal } from './BarcodeLabelModal';
import { UserProfile } from '../services/authService';
import { BranchProfile, getBranch } from '../services/branchService';
import { NormalizedProduct } from '../types/inventory';
import { searchLocalProducts, getLocalIndexedDbState } from '../services/indexedDbService';
import { smartStartupSync } from '../services/smartSyncService';
import { getInventorySessions } from '../services/inventorySessionService';
import { InventorySession } from '../types/inventorySession';
import SalesInventoryCountView from './SalesInventoryCountView';
import { CopyrightNotice } from './CopyrightNotice';
import { 
  Barcode, Search, Shield, AlertTriangle, RefreshCw, CheckCircle2, 
  ChevronRight, ChevronLeft, Eye, X, HardDrive, Package, Cpu, 
  Camera, Scan, Store, User, LogOut, WifiOff, CheckCheck, 
  Layers, ArrowUpRight, Sparkles, Building2, ClipboardCheck, ArrowLeft,
  Printer
} from 'lucide-react';

interface SalesDashboardProps {
  profile: UserProfile;
  branchProfile: BranchProfile | null;
  onLogout: () => void;
}

export function getOwnBranchStock(product: NormalizedProduct | null | undefined, locationId?: string): number | null {
  if (!product || !locationId || !product.stocks || !Object.prototype.hasOwnProperty.call(product.stocks, locationId)) {
    return null;
  }
  return product.stocks[locationId];
}

export default function SalesDashboard({ profile, branchProfile, onLogout }: SalesDashboardProps) {
  const [products, setProducts] = useState<NormalizedProduct[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<NormalizedProduct[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [localState, setLocalState] = useState<any>(null);
  const [selectedProduct, setSelectedProduct] = useState<NormalizedProduct | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [assignedSessions, setAssignedSessions] = useState<InventorySession[]>([]);
  const [activeCountSession, setActiveCountSession] = useState<InventorySession | null>(null);

  // Label Printing Modal State
  const [productsToPrint, setProductsToPrint] = useState<NormalizedProduct[]>([]);
  const [showLabelModal, setShowLabelModal] = useState(false);

  // Pagination & camera modal
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [cameraInput, setCameraInput] = useState('');

  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    initDashboard();
  }, []);

  const initDashboard = async () => {
    setLoading(true);
    try {
      // Run smart startup sync on login
      const syncResult = await smartStartupSync((msg) => {
        setSyncMessage(msg);
      });

      const st = await getLocalIndexedDbState();
      setLocalState(st);
      setIsOffline(false);

      const all = await searchLocalProducts('', 15000);
      setProducts(all);
      setFilteredProducts(all);

      if (profile.branchId && profile.uid) {
        try {
          const sess = await getInventorySessions(profile.branchId, profile.uid);
          setAssignedSessions(sess.filter(s => s.status === 'ACTIVE' || s.status === 'REVIEW'));
        } catch (sessErr) {
          console.warn('Could not load inventory sessions:', sessErr);
        }
      }
    } catch (err: any) {
      console.error('Startup sync error / offline mode:', err);
      setIsOffline(true);
      setSyncMessage('وضع دون اتصال — البيانات من آخر مزامنة محلية.');
      try {
        const st = await getLocalIndexedDbState();
        setLocalState(st);
        const all = await searchLocalProducts('', 15000);
        setProducts(all);
        setFilteredProducts(all);
      } catch (dbErr) {
        console.error('Failed to load local DB:', dbErr);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleManualSync = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await smartStartupSync((msg) => {
        setSyncMessage(msg);
      });
      setSyncMessage(res.message);
      const st = await getLocalIndexedDbState();
      setLocalState(st);
      setIsOffline(false);
      const all = await searchLocalProducts('', 15000);
      setProducts(all);
      setFilteredProducts(all);
    } catch (err: any) {
      console.error('Manual sync failed:', err);
      setSyncMessage(`فشل المزامنة: ${err.message || 'خطأ غير معروف'}`);
    } finally {
      setSyncing(false);
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

  const openPrintModal = (p: NormalizedProduct) => {
    setProductsToPrint([p]);
    setShowLabelModal(true);
  };

  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const paginatedProducts = filteredProducts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const ownBranchName = branchProfile?.name || 'فرع غير معروف';
  const ownLocationId = branchProfile?.inventoryLocationId;
  const allowCrossView = branchProfile?.allowCrossBranchStockView ?? false;
  const currentRev = localState?.localInventoryRevision ?? 0;
  const isBranchActive = branchProfile?.isActive ?? true;

  // Validate if ownLocationId is recognized in indexeddb metadata
  const hasValidLocationMapping = Boolean(
    ownLocationId && 
    localState?.availableLocationIds && 
    localState.availableLocationIds.includes(ownLocationId)
  );

  if (branchProfile && !isBranchActive) {
    return (
      <div className="min-h-screen bg-[#F6F8FB] text-slate-900 flex items-center justify-center font-sans dir-rtl p-4">
        <div className="max-w-md w-full bg-white border border-red-200 rounded-2xl p-8 text-center space-y-4 shadow-sm">
          <div className="w-12 h-12 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto border border-red-200">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-slate-900">الفرع المرتبط بهذا الحساب غير نشط</h2>
          <p className="text-slate-500 text-xs leading-relaxed">
            الفرع ({ownBranchName}) غير مفعل حالياً. يرجى التواصل مع الإدارة.
          </p>
          <button
            onClick={onLogout}
            className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 rounded-xl transition-colors text-xs cursor-pointer"
          >
            تسجيل الخروج
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F6F8FB] text-slate-900 flex items-center justify-center font-sans dir-rtl">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
            <RefreshCw className="w-5 h-5 animate-spin" />
          </div>
          <p className="text-xs text-slate-500 font-medium">جاري تحميل لوحة عمليات فرع {ownBranchName}...</p>
        </div>
      </div>
    );
  }

  if (activeCountSession) {
    return (
      <div className="min-h-screen bg-[#F6F8FB] text-slate-900 font-sans dir-rtl flex flex-col justify-between p-4 md:p-6">
        <SalesInventoryCountView
          session={activeCountSession}
          currentUser={profile}
          branchProfile={branchProfile}
          onBack={() => {
            setActiveCountSession(null);
            initDashboard();
          }}
        />
        <div className="py-4 text-center">
          <CopyrightNotice variant="dark" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F6F8FB] text-slate-900 font-sans dir-rtl flex flex-col">
      {/* 
        ====================================================================
        TOP SALES HEADER BAR
        ====================================================================
      */}
      <header className="h-16 px-6 bg-white border-b border-slate-200 flex items-center justify-between sticky top-0 z-30 shrink-0 shadow-xs">
        <div className="flex items-center gap-4">
          <BrandLogo variant="light" className="w-[125px]" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-slate-900 font-bold text-sm tracking-tight">{ownBranchName}</h1>
              <span className="text-[11px] font-mono font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-lg border border-blue-200">
                Rev {currentRev}
              </span>
            </div>
            <div className="text-[11px] text-slate-500 flex items-center gap-2 font-medium">
              <span>{profile.name || profile.email}</span>
              <span>·</span>
              <span>نقطة بيع الفرع</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleManualSync}
            disabled={syncing}
            className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-blue-600 ${syncing ? 'animate-spin' : ''}`} />
            <span>مزامنة المخزون</span>
          </button>
          <button
            onClick={onLogout}
            className="px-3.5 py-2 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer shadow-2xs"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>خروج</span>
          </button>
        </div>
      </header>

      {/* Offline / Sync Notification Strip */}
      {isOffline && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2.5 text-amber-900 text-xs flex items-center gap-2 font-mono shadow-2xs">
          <WifiOff className="w-3.5 h-3.5 shrink-0 text-amber-600" />
          <span>وضع دون اتصال — البيانات من آخر مزامنة محلية ({localState?.lastSyncedAt ? new Date(localState.lastSyncedAt).toLocaleString('ar-EG') : 'غير متوفر'})</span>
        </div>
      )}

      {syncMessage && !isOffline && (
        <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-2 text-xs text-emerald-800 flex items-center gap-2 font-mono shadow-2xs">
          <CheckCheck className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
          <span className="font-medium">{syncMessage}</span>
        </div>
      )}

      {/* 
        ====================================================================
        MAIN CONTENT WORKSPACE
        ====================================================================
      */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-5">
        {/* Active Inventory Sessions Banner */}
        {assignedSessions.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 shadow-xs space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-blue-900 font-bold text-xs">
                <ClipboardCheck className="w-4 h-4 text-blue-600" />
                <span>جلسات الجرد الفعلي المخصصة لفرعك</span>
              </div>
              <span className="px-2.5 py-0.5 bg-blue-100 text-blue-800 rounded-lg text-[10px] font-mono font-bold">
                {assignedSessions.length} جلسة
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {assignedSessions.map(sess => (
                <div
                  key={sess.id}
                  className="bg-white border border-blue-200 rounded-xl p-4 flex items-center justify-between gap-3 shadow-2xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-slate-900">{sess.name}</span>
                      <span className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold ${
                        sess.status === 'ACTIVE' 
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 animate-pulse' 
                          : 'bg-amber-50 text-amber-800 border border-amber-200'
                      }`}>
                        {sess.status === 'ACTIVE' ? 'جرد فعّال الآن' : 'قيد المراجعة'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      النوع: {sess.type === 'FULL' ? 'جرد كامل' : sess.type === 'CATEGORY' ? `جرد تصنيف (${sess.category})` : 'أصناف محددة'}
                    </p>
                  </div>

                  <button
                    onClick={() => setActiveCountSession(sess)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm transition-all shrink-0"
                  >
                    <span>{sess.status === 'ACTIVE' ? 'بدء الجرد' : 'متابعة إعادة الجرد'}</span>
                    <ArrowLeft className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Command Search Bar */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3.5">
          <div className="flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="ابحث برمز الصنف، الباركود، الموديل، الاسم، أو الماركة..."
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl pr-10 pl-4 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:bg-white focus:ring-1 focus:ring-blue-600/30 transition-colors font-mono"
              />
            </div>
            <button
              onClick={() => setShowCameraModal(true)}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-2 shrink-0 transition-colors cursor-pointer shadow-sm"
            >
              <Camera className="w-4 h-4" />
              <span>مسح بالكاميرا</span>
            </button>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500 font-mono px-1">
            <div className="flex items-center gap-1.5">
              <span>النتائج:</span>
              <strong className="text-slate-900 font-bold tabular-nums">{filteredProducts.length.toLocaleString()}</strong>
              <span>صنف</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-500 text-[11px]">
              <span>موقع المخزون المرتبط:</span>
              <span className="text-blue-600 font-bold">{ownLocationId || 'غير محدد'}</span>
            </div>
          </div>
        </div>

        {!hasValidLocationMapping && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-900 text-xs flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
              <div>
                <strong className="block font-bold">موقع المخزون المرتبط بهذا الفرع غير موجود في الكتالوج النشط (NEEDS_REVIEW)</strong>
                <span className="text-amber-800 text-[11px]">يرجى مراجعة إدارة النظام لتصحيح ربط موقع الفرع. تم حظر عرض رصيد فرعي وهمي.</span>
              </div>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-amber-100 text-amber-800 border border-amber-300">
              NEEDS_REVIEW
            </span>
          </div>
        )}

        {/* High Density Products Table */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-600 font-mono border-b border-slate-200 font-semibold">
                <tr>
                  <th className="py-3 px-4">كود الصنف</th>
                  <th className="py-3 px-4">الباركود / الموديل</th>
                  <th className="py-3 px-4 font-sans">اسم الصنف</th>
                  <th className="py-3 px-4 font-sans">الماركة</th>
                  <th className="py-3 px-4">سعر البيع</th>
                  <th className="py-3 px-4 text-blue-700">رصيد فرعك ({ownBranchName})</th>
                  <th className="py-3 px-4 text-slate-600">إجمالي المخزون</th>
                  <th className="py-3 px-4 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                {paginatedProducts.map((p) => {
                  const ownStock = getOwnBranchStock(p, ownLocationId);
                  return (
                    <tr key={p.itemCode} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 text-blue-600 font-bold">{p.itemCode}</td>
                      <td className="py-3 px-4 text-slate-600">{p.barcode || p.modelCode || '—'}</td>
                      <td className="py-3 px-4 text-slate-900 font-sans max-w-xs truncate font-medium">{p.name || '—'}</td>
                      <td className="py-3 px-4 text-slate-600 font-sans">{p.brand || '—'}</td>
                      <td className="py-3 px-4 text-slate-900 font-bold">{p.salePrice !== null ? `${p.salePrice} ج.م` : '—'}</td>
                      <td className="py-3 px-4 font-semibold">
                        {ownStock !== null ? (
                          <span className="text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-lg text-xs font-bold border border-emerald-200">
                            {ownStock.toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-amber-800 bg-amber-50 px-2 py-0.5 rounded text-[11px] border border-amber-200" title="موقع الفرع غير موجود في الكتالوج">
                            — (خطأ ربط)
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-900 font-bold">{p.totalStock.toLocaleString()}</td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => openPrintModal(p)}
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
                    <td colSpan={8} className="py-12 text-center text-slate-500 font-sans">
                      لا توجد أصناف مطابقة للبحث الحالي.
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
                  className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 disabled:opacity-40 text-slate-700 rounded-lg cursor-pointer font-medium shadow-2xs"
                >
                  السابق
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 disabled:opacity-40 text-slate-700 rounded-lg cursor-pointer font-medium shadow-2xs"
                >
                  التالي
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="py-4 px-6 text-center border-t border-slate-200 bg-white shrink-0">
        <CopyrightNotice variant="dark" />
      </footer>

      {/* 
        ====================================================================
        PRODUCT DETAILS MODAL
        ====================================================================
      */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto dir-rtl font-sans">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3.5">
              <div>
                <span className="text-xs text-blue-600 font-mono font-bold block">{selectedProduct.itemCode}</span>
                <h3 className="text-base font-bold text-slate-900 mt-0.5">{selectedProduct.name || 'بدون اسم صنف'}</h3>
              </div>
              <button
                onClick={() => setSelectedProduct(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 font-mono text-xs tabular-nums">
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <span className="text-slate-500 block mb-1 text-[11px] font-sans font-medium">الباركود</span>
                <span className="text-slate-900 font-bold">{selectedProduct.barcode || '—'}</span>
              </div>
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <span className="text-slate-500 block mb-1 text-[11px] font-sans font-medium">كود الموديل</span>
                <span className="text-slate-900 font-bold">{selectedProduct.modelCode || '—'}</span>
              </div>
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <span className="text-slate-500 block mb-1 text-[11px] font-sans font-medium">الماركة</span>
                <span className="text-slate-900 font-bold font-sans">{selectedProduct.brand || '—'}</span>
              </div>
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <span className="text-slate-500 block mb-1 text-[11px] font-sans font-medium">التصنيف</span>
                <span className="text-slate-900 font-bold font-sans">{selectedProduct.category || '—'}</span>
              </div>
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <span className="text-slate-500 block mb-1 text-[11px] font-sans font-medium">سعر البيع</span>
                <span className="text-slate-900 font-bold">{selectedProduct.salePrice !== null ? `${selectedProduct.salePrice} ج.م` : '—'}</span>
              </div>
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <span className="text-slate-500 block mb-1 text-[11px] font-sans font-medium">إجمالي المخزون</span>
                <span className="text-slate-900 font-bold">{selectedProduct.totalStock}</span>
              </div>
            </div>

            {/* Own Branch Stock Highlight Card */}
            {(() => {
              const modalOwnStock = getOwnBranchStock(selectedProduct, ownLocationId);
              if (modalOwnStock !== null) {
                return (
                  <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl flex items-center justify-between font-mono shadow-2xs">
                    <div>
                      <span className="text-xs text-emerald-800 font-semibold font-sans block">رصيد فرعك الحالي ({ownBranchName})</span>
                      <span className="text-emerald-900 text-lg font-bold">{modalOwnStock.toLocaleString()} وحدة</span>
                    </div>
                    <span className="text-xs bg-emerald-100 text-emerald-800 px-3 py-1 rounded-lg border border-emerald-300 font-bold">
                      فرعك
                    </span>
                  </div>
                );
              }
              return (
                <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-center justify-between font-mono shadow-2xs">
                  <div>
                    <span className="text-xs text-amber-800 font-semibold font-sans block">رصيد فرعك الحالي ({ownBranchName})</span>
                    <span className="text-amber-900 text-lg font-bold">— (خطأ ربط)</span>
                    <span className="text-[11px] text-amber-800 block mt-1 font-sans">تنبيه: موقع المخزون غير مرتبط بشكل صحيح بالكتالوج النشط</span>
                  </div>
                  <span className="text-xs bg-amber-100 text-amber-800 px-3 py-1 rounded-lg border border-amber-300 font-bold">
                    خطأ ربط
                  </span>
                </div>
              );
            })()}

            {/* Cross-Branch Stock Availability */}
            {allowCrossView && (
              <div className="space-y-2.5">
                <h4 className="text-slate-900 font-bold text-xs">التوفر في المواقع والفروع الأخرى:</h4>
                <div className="bg-slate-50 rounded-xl border border-slate-200 divide-y divide-slate-200 font-mono text-xs max-h-48 overflow-y-auto">
                  {selectedProduct.stocks && Object.entries(selectedProduct.stocks).map(([locId, qty]) => {
                    const isOwn = locId === ownLocationId;
                    return (
                      <div key={locId} className={`p-3 flex items-center justify-between ${isOwn ? 'bg-emerald-50/50' : ''}`}>
                        <span className={isOwn ? 'text-emerald-800 font-bold' : 'text-slate-700 font-medium'}>
                          {locId} {isOwn ? '(فرعك)' : ''}
                        </span>
                        <span className={isOwn ? 'text-emerald-800 font-bold' : 'text-slate-900 font-bold'}>{qty} وحدة</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="pt-2 flex items-center justify-between border-t border-slate-200">
              <button
                onClick={() => {
                  const prod = selectedProduct;
                  setSelectedProduct(null);
                  openPrintModal(prod);
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer shadow-xs transition-colors"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة باركود الصنف</span>
              </button>

              <button
                onClick={() => setSelectedProduct(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Camera Barcode Modal */}
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
