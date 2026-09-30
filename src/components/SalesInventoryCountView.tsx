import React, { useState, useEffect, useRef } from 'react';
import { UserProfile } from '../services/authService';
import { BranchProfile } from '../services/branchService';
import { NormalizedProduct } from '../types/inventory';
import { 
  InventorySession, 
  ProductCountRecord 
} from '../types/inventorySession';
import { 
  getSessionById, 
  getSessionCounts, 
  saveProductCount, 
  saveRecount 
} from '../services/inventorySessionService';
import { searchLocalProducts } from '../services/indexedDbService';
import { BarcodeScanner } from './BarcodeScanner';
import { 
  ClipboardCheck, Barcode, Search, CheckCircle2, AlertTriangle, 
  RefreshCw, X, ArrowRight, Camera, Plus, Minus, Check, 
  Shield, WifiOff, AlertCircle, Sparkles, Tag, ArrowLeft
} from 'lucide-react';

interface SalesInventoryCountViewProps {
  session: InventorySession;
  currentUser: UserProfile;
  branchProfile: BranchProfile | null;
  onBack: () => void;
}

export default function SalesInventoryCountView({
  session: initialSession,
  currentUser,
  branchProfile,
  onBack,
}: SalesInventoryCountViewProps) {
  const [session, setSession] = useState<InventorySession>(initialSession);
  const [countsMap, setCountsMap] = useState<Record<string, ProductCountRecord>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  // Search & Scanning
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<NormalizedProduct[]>([]);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Active Count Flow
  const [selectedProduct, setSelectedProduct] = useState<NormalizedProduct | null>(null);
  const [enteredQty, setEnteredQty] = useState<number>(1);
  const [existingCountRecord, setExistingCountRecord] = useState<ProductCountRecord | null>(null);
  const [isEditingExisting, setIsEditingExisting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Recount Flow
  const [selectedRecountCode, setSelectedRecountCode] = useState<string | null>(null);
  const [recountQty, setRecountQty] = useState<number>(0);

  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    loadSessionData();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const loadSessionData = async () => {
    setLoading(true);
    try {
      const [sess, counts] = await Promise.all([
        getSessionById(initialSession.id),
        getSessionCounts(initialSession.id),
      ]);
      if (sess) setSession(sess);
      setCountsMap(counts);
    } catch (err) {
      console.error('Failed to load session counts:', err);
    } finally {
      setLoading(false);
    }
  };

  // Local Search (0 Firestore queries per search)
  const handleSearch = async (q: string) => {
    setSearchQuery(q);
    setStatusMessage(null);
    const queryStr = q.trim().toLowerCase();
    if (!queryStr) {
      setSearchResults([]);
      return;
    }

    try {
      const allLocal = await searchLocalProducts('', 15000);
      const matched = allLocal.filter(p => 
        p.itemCode.toLowerCase() === queryStr ||
        (p.barcode && p.barcode.toLowerCase() === queryStr) ||
        (p.modelCode && p.modelCode.toLowerCase() === queryStr)
      );

      if (matched.length === 1) {
        handleSelectProduct(matched[0]);
        setSearchResults([]);
      } else {
        const partialMatches = allLocal.filter(p =>
          p.itemCode.toLowerCase().includes(queryStr) ||
          (p.name && p.name.toLowerCase().includes(queryStr)) ||
          (p.barcode && p.barcode.toLowerCase().includes(queryStr)) ||
          (p.modelCode && p.modelCode.toLowerCase().includes(queryStr))
        ).slice(0, 10);
        setSearchResults(partialMatches);
      }
    } catch (err) {
      console.error('Local product search failed:', err);
    }
  };

  // Handle Product Selection from scan / search
  const handleSelectProduct = (product: NormalizedProduct) => {
    setStatusMessage(null);

    // Validate Scope
    if (session.type === 'CATEGORY' && session.category) {
      if (product.category !== session.category) {
        setStatusMessage({
          type: 'error',
          text: 'هذا الصنف خارج نطاق جلسة الجرد الحالية.',
        });
        return;
      }
    }

    if (session.type === 'SELECTED_PRODUCTS' && session.selectedItemCodes) {
      if (!session.selectedItemCodes.includes(product.itemCode)) {
        setStatusMessage({
          type: 'error',
          text: 'هذا الصنف غير مدرج ضمن جلسة الجرد الحالية.',
        });
        return;
      }
    }

    // Check if already counted
    const existing = countsMap[product.itemCode];
    if (existing) {
      setExistingCountRecord(existing);
      setEnteredQty(existing.currentQty);
      setIsEditingExisting(false);
    } else {
      setExistingCountRecord(null);
      setEnteredQty(1);
      setIsEditingExisting(false);
    }

    setSelectedProduct(product);
    setShowCamera(false);
  };

  // Save Count (First Count or Edit)
  const handleSaveCount = async () => {
    if (!selectedProduct) return;
    if (isOffline) {
      alert('انقطع الاتصال. أعد الاتصال بالإنترنت لمواصلة تسجيل الجرد.');
      return;
    }

    setSubmitting(true);
    setStatusMessage(null);
    try {
      const locId = session.inventoryLocationId;
      const baselineStock = selectedProduct.stocks[locId] || 0;
      const isUnexpected = baselineStock === 0;

      await saveProductCount({
        sessionId: session.id,
        itemCode: selectedProduct.itemCode,
        branchId: session.branchId,
        quantity: Math.max(0, Number(enteredQty)),
        currentUser,
        unexpected: isUnexpected,
        isEdit: isEditingExisting,
      });

      // Update local state
      await loadSessionData();

      setStatusMessage({
        type: 'success',
        text: `تم تسجيل جرد الصنف (${selectedProduct.itemCode}) بالكمية: ${enteredQty}`,
      });

      // Reset selection and auto focus for next scan
      setSelectedProduct(null);
      setExistingCountRecord(null);
      setSearchQuery('');
      setSearchResults([]);
      if (searchInputRef.current) {
        searchInputRef.current.focus();
      }
    } catch (err: any) {
      console.error('Failed to save count:', err);
      setStatusMessage({
        type: 'error',
        text: err.message || 'فشل حفظ كمية الجرد.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Save Recount
  const handleSaveRecount = async () => {
    if (!selectedRecountCode) return;
    if (isOffline) {
      alert('انقطع الاتصال. أعد الاتصال بالإنترنت لمواصلة تسجيل الجرد.');
      return;
    }

    setSubmitting(true);
    try {
      await saveRecount({
        sessionId: session.id,
        itemCode: selectedRecountCode,
        quantity: Math.max(0, Number(recountQty)),
        currentUser,
      });

      await loadSessionData();
      setSelectedRecountCode(null);
      setStatusMessage({
        type: 'success',
        text: `تم حفظ إعادة الجرد للصنف (${selectedRecountCode}) بنجاح.`,
      });
    } catch (err: any) {
      console.error('Failed to save recount:', err);
      alert(err.message || 'فشل حفظ إعادة الجرد');
    } finally {
      setSubmitting(false);
    }
  };

  // Pending Recounts List (if session in REVIEW)
  const pendingRecounts = Object.values(countsMap).filter(c => c.status === 'RECOUNT_REQUIRED');
  const countedItemsCount = Object.keys(countsMap).length;

  return (
    <div className="space-y-4 max-w-xl mx-auto pb-12 font-sans dir-rtl">
      {/* Offline Alert */}
      {isOffline && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs text-red-700">
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>انقطع الاتصال. أعد الاتصال بالإنترنت لمواصلة تسجيل الجرد.</span>
        </div>
      )}

      {/* Header Bar */}
      <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-2xl p-4 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 text-[#667085] hover:text-[#111827] rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
            title="العودة للرئيسية"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-sm font-bold text-[#111827]">{session.name}</h2>
            <div className="flex items-center gap-2 text-[11px] text-[#667085]">
              <span>الفرع: <strong className="text-[#111827]">{session.branchName}</strong></span>
              <span>•</span>
              <span className="text-emerald-700 font-semibold">جرد أعمى (Blind Count)</span>
            </div>
          </div>
        </div>

        <div className="text-left">
          <span className="text-[10px] text-[#667085] block">الأصناف المجرودة</span>
          <span className="text-sm font-bold text-[#2F81F7] font-mono">{countedItemsCount}</span>
        </div>
      </div>

      {/* Status Feedback Message */}
      {statusMessage && (
        <div className={`p-3 rounded-xl border flex items-center gap-2 text-xs ${
          statusMessage.type === 'success' 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* RECOUNT REQUIRED ALERT SECTION (during REVIEW) */}
      {session.status === 'REVIEW' && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-amber-800 font-bold text-xs">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span>جلسة الجرد قيد المراجعة</span>
          </div>
          <p className="text-[11px] text-amber-700">
            تم إنهاء مرحلة العد العادية. يمكنك فقط إدخال الكميات للأصناف التي طُلب إعادة جردها أدناه:
          </p>

          {pendingRecounts.length === 0 ? (
            <div className="p-3 bg-white/70 rounded-xl text-center text-xs text-[#667085]">
              لا توجد طلبات إعادة جرد معلقة مخصصة حالياً.
            </div>
          ) : (
            <div className="space-y-2">
              <span className="text-[11px] font-semibold text-[#374151]">الأصناف المطلوب إعادة جردها ({pendingRecounts.length}):</span>
              <div className="divide-y divide-amber-200 bg-white rounded-xl border border-amber-200 overflow-hidden">
                {pendingRecounts.map(rec => (
                  <div 
                    key={rec.itemCode}
                    onClick={() => {
                      setSelectedRecountCode(rec.itemCode);
                      setRecountQty(0);
                    }}
                    className="p-3 flex items-center justify-between hover:bg-amber-50/60 cursor-pointer text-xs"
                  >
                    <div>
                      <span className="font-mono font-bold text-[#111827]">{rec.itemCode}</span>
                      <span className="text-[#667085] mr-2 block text-[11px]">مطلوب إعادة العد والتأكيد</span>
                    </div>
                    <button className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold cursor-pointer">
                      إعادة الجرد
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* NORMAL ACTIVE COUNTING FLOW */}
      {session.status === 'ACTIVE' && (
        <>
          {/* CAMERA & SCAN SECTION */}
          {!selectedProduct && (
            <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-2xl p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#374151]">مسح الباركود أو البحث عن الصنف</span>
                <button
                  type="button"
                  onClick={() => setShowCamera(!showCamera)}
                  className="px-3 py-1.5 bg-[#2F81F7]/10 hover:bg-[#2F81F7]/20 text-[#2F81F7] rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Camera className="w-3.5 h-3.5" />
                  {showCamera ? 'إغلاق الكاميرا' : 'مسح بالكاميرا'}
                </button>
              </div>

              {/* Camera Scanner View */}
              {showCamera && (
                <div className="rounded-xl overflow-hidden border border-[#E5E7EB] bg-black">
                  <BarcodeScanner
                    onScanSuccess={(scannedText) => {
                      handleSearch(scannedText);
                    }}
                    onScanError={(err) => {
                      setCameraError(err);
                    }}
                  />
                </div>
              )}

              {/* Search Input */}
              <div className="relative">
                <Search className="w-4 h-4 text-[#9CA3AF] absolute right-3 top-3" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="امسح الباركود أو أدخل كود الصنف..."
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl pr-9 pl-3 py-2.5 text-xs text-[#111827] focus:outline-none focus:border-[#2F81F7]"
                  autoFocus
                />
              </div>

              {/* Search Suggestions */}
              {searchResults.length > 0 && (
                <div className="rounded-xl border border-[#E5E7EB] divide-y divide-[#E5E7EB] bg-[#FFFFFF] shadow-sm max-h-48 overflow-y-auto">
                  {searchResults.map(prod => (
                    <div
                      key={prod.itemCode}
                      onClick={() => handleSelectProduct(prod)}
                      className="p-2.5 flex items-center justify-between hover:bg-[#F3F4F6] cursor-pointer text-xs transition-colors"
                    >
                      <div>
                        <span className="font-mono font-bold text-[#111827] ml-2">{prod.itemCode}</span>
                        <span className="text-[#374151]">{prod.name}</span>
                      </div>
                      <span className="text-[10px] text-[#667085] font-mono">{prod.barcode || '—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* PRODUCT COUNT CARD (WHEN ITEM SELECTED) */}
          {selectedProduct && (
            <div className="bg-[#FFFFFF] border-2 border-[#2F81F7] rounded-2xl p-5 shadow-md space-y-4">
              <div className="flex items-start justify-between border-b border-[#E5E7EB] pb-3">
                <div>
                  <h3 className="text-sm font-bold text-[#111827]">{selectedProduct.name}</h3>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#667085] mt-1 font-mono">
                    <span>الكود: <strong className="text-[#111827]">{selectedProduct.itemCode}</strong></span>
                    <span>الباركود: {selectedProduct.barcode || '—'}</span>
                    <span>الموديل: {selectedProduct.modelCode || '—'}</span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedProduct(null)}
                  className="p-1 text-[#9CA3AF] hover:text-[#111827] rounded"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Duplicate Count Notice if already counted */}
              {existingCountRecord && !isEditingExisting && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2 text-xs text-amber-800">
                  <div className="flex items-center gap-1.5 font-bold">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span>تم جرد هذا الصنف بالفعل!</span>
                  </div>
                  <p>
                    الكمية المسجلة سابقاً: <span className="font-mono font-bold text-base text-[#111827]">{existingCountRecord.currentQty}</span>
                  </p>
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsEditingExisting(true)}
                      className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold cursor-pointer"
                    >
                      تعديل الكمية
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedProduct(null)}
                      className="px-3 py-1 bg-white text-[#374151] border border-amber-300 rounded-lg text-xs font-semibold cursor-pointer"
                    >
                      إلغاء
                    </button>
                  </div>
                </div>
              )}

              {/* Quantity Input Area */}
              {(!existingCountRecord || isEditingExisting) && (
                <div className="space-y-4 text-center">
                  <label className="text-xs font-bold text-[#374151] block">الكمية الفعلية</label>
                  
                  <div className="flex items-center justify-center gap-4">
                    <button
                      type="button"
                      onClick={() => setEnteredQty(Math.max(0, enteredQty - 1))}
                      className="w-12 h-12 bg-[#F3F4F6] hover:bg-[#E5E7EB] active:scale-95 text-[#111827] rounded-xl text-xl font-bold flex items-center justify-center cursor-pointer transition-all"
                    >
                      <Minus className="w-5 h-5" />
                    </button>

                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={enteredQty}
                      onChange={(e) => setEnteredQty(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-24 h-12 bg-[#F9FAFB] border-2 border-[#2F81F7] rounded-xl text-center text-xl font-mono font-bold text-[#111827] focus:outline-none"
                    />

                    <button
                      type="button"
                      onClick={() => setEnteredQty(enteredQty + 1)}
                      className="w-12 h-12 bg-[#F3F4F6] hover:bg-[#E5E7EB] active:scale-95 text-[#111827] rounded-xl text-xl font-bold flex items-center justify-center cursor-pointer transition-all"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={handleSaveCount}
                      className="flex-1 py-3 bg-[#2F81F7] hover:bg-blue-600 active:scale-98 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer shadow-md transition-all"
                    >
                      <Check className="w-4 h-4" />
                      {isEditingExisting ? 'حفظ تعديل الكمية' : 'حفظ الكمية ومتابعة الجرد'}
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedProduct(null)}
                      className="px-4 py-3 bg-gray-100 hover:bg-gray-200 text-[#374151] rounded-xl text-xs font-semibold cursor-pointer"
                    >
                      إلغاء
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* RECOUNT MODAL (DURING REVIEW) */}
      {selectedRecountCode && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4 dir-rtl text-center">
            <h3 className="text-sm font-bold text-[#111827]">إعادة جرد الصنف ({selectedRecountCode})</h3>
            <p className="text-xs text-[#667085]">يرجى إعادة عد المنتج على الرف بدقة وإدخال الكمية الفعلية المؤكدة:</p>

            <div className="flex items-center justify-center gap-3 py-2">
              <button
                type="button"
                onClick={() => setRecountQty(Math.max(0, recountQty - 1))}
                className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center font-bold text-lg"
              >
                -
              </button>
              <input
                type="number"
                min="0"
                value={recountQty}
                onChange={(e) => setRecountQty(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-20 h-10 border-2 border-amber-500 rounded-lg text-center font-mono font-bold text-lg"
              />
              <button
                type="button"
                onClick={() => setRecountQty(recountQty + 1)}
                className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center font-bold text-lg"
              >
                +
              </button>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSelectedRecountCode(null)}
                className="flex-1 py-2 bg-gray-100 text-[#374151] rounded-lg text-xs font-semibold"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleSaveRecount}
                className="flex-1 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold shadow-sm"
              >
                حفظ إعادة الجرد
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
