import React, { useState, useEffect, useRef } from 'react';
import { BrandLogo } from './BrandLogo';
import { BarcodeScanner } from './BarcodeScanner';
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
  Layers, ArrowUpRight, Sparkles, Building2, ClipboardCheck, ArrowLeft
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

  const ownLocationId = branchProfile?.inventoryLocationId || '';
  const ownBranchName = branchProfile?.name || profile.branchId;
  const isBranchActive = branchProfile?.isActive === true;
  // Cross-branch view defaults to false unless explicitly enabled by Admin
  const allowCrossView = branchProfile?.allowCrossBranchStockView === true;
  const currentRev = localState?.activeInventoryRevision ?? 1;

  // Check if ownLocationId is present in products
  const hasValidLocationMapping = Boolean(
    ownLocationId &&
    products.length > 0 &&
    products[0].stocks &&
    Object.prototype.hasOwnProperty.call(products[0].stocks, ownLocationId)
  );

  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const paginatedProducts = filteredProducts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Inactive branch blocks access
  if (branchProfile && !isBranchActive) {
    return (
      <div className="min-h-screen bg-[#0B1017] text-slate-100 flex items-center justify-center font-sans dir-rtl p-4">
        <div className="max-w-md w-full bg-[#111823] border border-red-500/30 rounded-xl p-8 text-center space-y-4 shadow-2xl">
          <div className="w-12 h-12 bg-red-500/10 text-red-400 rounded-xl flex items-center justify-center mx-auto border border-red-500/20">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-white">الفرع المرتبط بهذا الحساب غير نشط</h2>
          <p className="text-slate-400 text-xs leading-relaxed">
            الفرع ({ownBranchName}) غير مفعل حالياً. يرجى التواصل مع الإدارة.
          </p>
          <button
            onClick={onLogout}
            className="w-full bg-white/[0.08] hover:bg-white/[0.12] text-white font-medium py-2.5 rounded-lg transition-colors text-xs cursor-pointer"
          >
            تسجيل الخروج
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B1017] text-slate-100 flex items-center justify-center font-sans dir-rtl">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <RefreshCw className="w-5 h-5 animate-spin" />
          </div>
          <p className="text-xs text-slate-400">جاري تحميل لوحة عمليات فرع {ownBranchName}...</p>
        </div>
      </div>
    );
  }

  if (activeCountSession) {
    return (
      <div className="min-h-screen bg-[#0B1017] text-slate-100 font-sans dir-rtl flex flex-col justify-between p-4 md:p-6">
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
          <CopyrightNotice variant="light" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B1017] text-slate-100 font-sans dir-rtl flex flex-col selection:bg-emerald-500/25">
      {/* 
        ====================================================================
        TOP SALES HEADER BAR
        ====================================================================
      */}
      <header className="h-16 px-6 bg-[#0E1520] border-b border-white/[0.08] flex items-center justify-between sticky top-0 z-30 shrink-0">
        <div className="flex items-center gap-4">
          <BrandLogo variant="dark" className="w-[125px]" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-white font-bold text-sm tracking-tight">{ownBranchName}</h1>
              <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                Rev {currentRev}
              </span>
            </div>
            <div className="text-[11px] text-slate-500 flex items-center gap-2">
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
            className="px-3 py-1.5 bg-[#131B26] hover:bg-[#1A2534] border border-white/[0.08] text-slate-200 rounded-lg text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${syncing ? 'animate-spin' : ''}`} />
            <span>مزامنة المخزون</span>
          </button>
          <button
            onClick={onLogout}
            className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 rounded-lg text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>خروج</span>
          </button>
        </div>
      </header>

      {/* Offline / Sync Notification Strip */}
      {isOffline && (
        <div className="bg-amber-500/10 border-b border-amber-500/30 px-6 py-2 text-amber-300 text-xs flex items-center gap-2 font-mono">
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          <span>وضع دون اتصال — البيانات من آخر مزامنة محلية ({localState?.lastSyncedAt ? new Date(localState.lastSyncedAt).toLocaleString('ar-EG') : 'غير متوفر'})</span>
        </div>
      )}

      {syncMessage && !isOffline && (
        <div className="bg-[#111823] border-b border-white/[0.06] px-6 py-2 text-xs text-emerald-400 flex items-center gap-2 font-mono">
          <CheckCheck className="w-3.5 h-3.5 shrink-0" />
          <span>{syncMessage}</span>
        </div>
      )}

      {/* 
        ====================================================================
        MAIN CONTENT WORKSPACE
        ====================================================================
      */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-5">
        {/* Active Inventory Sessions Banner */}
        {assignedSessions.length > 0 && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
                <ClipboardCheck className="w-4 h-4" />
                <span>جلسات الجرد الفعلي المخصصة لفرعك</span>
              </div>
              <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded text-[10px] font-mono font-bold">
                {assignedSessions.length} جلسة
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {assignedSessions.map(sess => (
                <div
                  key={sess.id}
                  className="bg-[#111823] border border-white/[0.08] rounded-xl p-3.5 flex items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-white">{sess.name}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                        sess.status === 'ACTIVE' 
                          ? 'bg-emerald-500/20 text-emerald-400 animate-pulse' 
                          : 'bg-amber-500/20 text-amber-400'
                      }`}>
                        {sess.status === 'ACTIVE' ? 'جرد فعّال الآن' : 'قيد المراجعة'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      النوع: {sess.type === 'FULL' ? 'جرد كامل' : sess.type === 'CATEGORY' ? `جرد تصنيف (${sess.category})` : 'أصناف محددة'}
                    </p>
                  </div>

                  <button
                    onClick={() => setActiveCountSession(sess)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-600/20 transition-all shrink-0"
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
        <div className="bg-[#111823] border border-white/[0.08] rounded-xl p-4 shadow-xl space-y-3">
          <div className="flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-slate-500 absolute right-3.5 top-3" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="ابحث برمز الصنف، الباركود (e.g. 7394586123476)، الموديل، الاسم، أو الماركة..."
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

          <div className="flex items-center justify-between text-xs text-slate-400 font-mono px-1">
            <div className="flex items-center gap-2 text-slate-500">
              <span>النتائج:</span>
              <span className="text-white font-bold">{filteredProducts.length.toLocaleString()}</span>
              <span>صنف</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-500 text-[11px]">
              <span>موقع المخزون المرتبط:</span>
              <span className="text-emerald-400 font-bold">{ownLocationId || 'غير محدد'}</span>
            </div>
          </div>
        </div>

        {!hasValidLocationMapping && (
          <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
              <div>
                <strong className="block font-bold">موقع المخزون المرتبط بهذا الفرع غير موجود في الكتالوج النشط (NEEDS_REVIEW)</strong>
                <span className="text-amber-400/80 text-[11px]">يرجى مراجعة إدارة النظام لتصحيح ربط موقع الفرع. تم حظر عرض رصيد فرعي وهمي.</span>
              </div>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              NEEDS_REVIEW
            </span>
          </div>
        )}

        {/* High Density Products Table */}
        <div className="bg-[#111823] border border-white/[0.08] rounded-xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-[#0B1017] text-slate-400 font-mono border-b border-white/[0.08]">
                <tr>
                  <th className="py-3 px-4 font-medium">كود الصنف</th>
                  <th className="py-3 px-4 font-medium">الباركود / الموديل</th>
                  <th className="py-3 px-4 font-medium font-sans">اسم الصنف</th>
                  <th className="py-3 px-4 font-medium font-sans">الماركة</th>
                  <th className="py-3 px-4 font-medium">سعر البيع</th>
                  <th className="py-3 px-4 font-medium text-emerald-400">رصيد فرعك ({ownBranchName})</th>
                  <th className="py-3 px-4 font-medium text-slate-500">إجمالي المخزون</th>
                  <th className="py-3 px-4 font-medium text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04] font-mono tabular-nums">
                {paginatedProducts.map((p) => {
                  const ownStock = getOwnBranchStock(p, ownLocationId);
                  return (
                    <tr key={p.itemCode} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3 px-4 text-emerald-400 font-semibold">{p.itemCode}</td>
                      <td className="py-3 px-4 text-slate-400">{p.barcode || p.modelCode || '—'}</td>
                      <td className="py-3 px-4 text-white font-sans max-w-xs truncate">{p.name || '—'}</td>
                      <td className="py-3 px-4 text-slate-400 font-sans">{p.brand || '—'}</td>
                      <td className="py-3 px-4 text-emerald-400 font-semibold">{p.salePrice !== null ? `${p.salePrice} ج.م` : '—'}</td>
                      <td className="py-3 px-4 font-semibold">
                        {ownStock !== null ? (
                          <span className="text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded text-xs border border-emerald-500/20">
                            {ownStock.toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded text-[11px] border border-amber-500/20" title="موقع الفرع غير موجود في الكتالوج">
                            — (خطأ ربط)
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-400">{p.totalStock.toLocaleString()}</td>
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
      </main>

      <footer className="py-4 px-6 text-center border-t border-white/[0.08] bg-[#0E1520] shrink-0">
        <CopyrightNotice variant="light" />
      </footer>

      {/* 
        ====================================================================
        PRODUCT DETAILS MODAL
        ====================================================================
      */}
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
                <span className="text-slate-500 block mb-1 text-[11px]">سعر البيع (Rev {currentRev})</span>
                <span className="text-emerald-400 font-bold">{selectedProduct.salePrice !== null ? `${selectedProduct.salePrice} ج.م` : '—'}</span>
              </div>
              <div className="bg-[#0B1017] p-3 rounded-lg border border-white/[0.06]">
                <span className="text-slate-500 block mb-1 text-[11px]">إجمالي المخزون</span>
                <span className="text-white font-bold">{selectedProduct.totalStock}</span>
              </div>
            </div>

            {/* Own Branch Stock Highlight Card */}
            {(() => {
              const modalOwnStock = getOwnBranchStock(selectedProduct, ownLocationId);
              if (modalOwnStock !== null) {
                return (
                  <div className="bg-emerald-500/10 border border-emerald-500/25 p-4 rounded-lg flex items-center justify-between font-mono">
                    <div>
                      <span className="text-xs text-emerald-300 block">رصيد فرعك الحالي ({ownBranchName})</span>
                      <span className="text-white text-lg font-bold">{modalOwnStock.toLocaleString()} وحدة</span>
                    </div>
                    <span className="text-xs bg-emerald-500/20 text-emerald-300 px-2.5 py-1 rounded border border-emerald-500/30">
                      فرعك
                    </span>
                  </div>
                );
              }
              return (
                <div className="bg-amber-500/10 border border-amber-500/25 p-4 rounded-lg flex items-center justify-between font-mono">
                  <div>
                    <span className="text-xs text-amber-300 block">رصيد فرعك الحالي ({ownBranchName})</span>
                    <span className="text-amber-400 text-lg font-bold">— (خطأ ربط)</span>
                    <span className="text-[11px] text-amber-400/80 block mt-1">تنبيه: موقع المخزون غير مرتبط بشكل صحيح بالكتالوج النشط</span>
                  </div>
                  <span className="text-xs bg-amber-500/20 text-amber-300 px-2.5 py-1 rounded border border-amber-500/30">
                    خطأ ربط
                  </span>
                </div>
              );
            })()}

            {/* Cross-Branch Stock Availability */}
            {allowCrossView && (
              <div className="space-y-2.5">
                <h4 className="text-white font-semibold text-xs">التوفر في المواقع والفروع الأخرى:</h4>
                <div className="bg-[#0B1017] rounded-lg border border-white/[0.06] divide-y divide-white/[0.04] font-mono text-xs max-h-48 overflow-y-auto">
                  {selectedProduct.stocks && Object.entries(selectedProduct.stocks).map(([locId, qty]) => {
                    const isOwn = locId === ownLocationId;
                    return (
                      <div key={locId} className={`p-2.5 flex items-center justify-between ${isOwn ? 'bg-emerald-500/5' : ''}`}>
                        <span className={isOwn ? 'text-emerald-300 font-semibold' : 'text-slate-400'}>
                          {locId} {isOwn ? '(فرعك)' : ''}
                        </span>
                        <span className={isOwn ? 'text-emerald-400 font-bold' : 'text-slate-300'}>{qty} وحدة</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

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

      {/* Camera Barcode Modal */}
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
                onScanError={(err) => {
                  console.warn('Barcode scan error:', err);
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
