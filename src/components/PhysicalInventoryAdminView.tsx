import React, { useState, useEffect } from 'react';
import { UserProfile } from '../services/authService';
import { BranchProfile, getAllBranches, getActiveCatalogLocations, CatalogLocation, formatLocationDisplayName } from '../services/branchService';
import { SalesAccountProfile, getAllSalesAccounts } from '../services/accountService';
import { NormalizedProduct } from '../types/inventory';
import { 
  InventorySession, 
  SessionType, 
  SessionStatus, 
  VarianceReviewItem,
  BaselineProductEntry
} from '../types/inventorySession';
import { 
  getInventorySessions, 
  createDraftSession, 
  activateSession, 
  cancelSession, 
  closeCountToReview, 
  completeSession, 
  getSessionCounts, 
  getBaselineProducts, 
  calculateVarianceReview, 
  requestRecount,
  exportInventoryReportXLSX 
} from '../services/inventorySessionService';
import { searchLocalProducts } from '../services/indexedDbService';
import { 
  ClipboardCheck, Plus, Play, CheckCircle2, AlertTriangle, 
  RefreshCw, X, Search, FileSpreadsheet, Eye, 
  AlertCircle, ArrowRight, UserCheck, CheckSquare, Square, 
  Sliders, FileText, Ban, Layers, ShieldCheck, ChevronRight
} from 'lucide-react';

interface PhysicalInventoryAdminViewProps {
  currentUser: UserProfile;
}

export default function PhysicalInventoryAdminView({ currentUser }: PhysicalInventoryAdminViewProps) {
  const [sessions, setSessions] = useState<InventorySession[]>([]);
  const [branches, setBranches] = useState<BranchProfile[]>([]);
  const [activeLocations, setActiveLocations] = useState<CatalogLocation[]>([]);
  const [branchLoading, setBranchLoading] = useState(false);
  const [branchError, setBranchError] = useState<string | null>(null);
  const [salesUsers, setSalesUsers] = useState<SalesAccountProfile[]>([]);
  const [catalogProducts, setCatalogProducts] = useState<NormalizedProduct[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Creation Wizard State
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);
  const [sessionName, setSessionName] = useState('');
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [sessionType, setSessionType] = useState<SessionType>('FULL');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedItemCodes, setSelectedItemCodes] = useState<string[]>([]);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [wizardError, setWizardError] = useState<string | null>(null);

  // Review & Details State
  const [activeReviewSession, setActiveReviewSession] = useState<InventorySession | null>(null);
  const [reviewItems, setReviewItems] = useState<VarianceReviewItem[]>([]);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewTab, setReviewTab] = useState<'ALL' | 'MATCH' | 'SHORTAGE' | 'OVERAGE' | 'UNCOUNTED' | 'RECOUNT_REQUIRED' | 'UNEXPECTED'>('ALL');
  const [reviewSearch, setReviewSearch] = useState('');

  // Confirmation Modals
  const [activationModalSession, setActivationModalSession] = useState<InventorySession | null>(null);
  const [cancelModalSession, setCancelModalSession] = useState<InventorySession | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');
  const [closeToReviewModalSession, setCloseToReviewModalSession] = useState<InventorySession | null>(null);
  const [uncountedWarningCount, setUncountedWarningCount] = useState<number>(0);

  useEffect(() => {
    initData();
  }, []);

  const initData = async () => {
    setLoading(true);
    setBranchLoading(true);
    setBranchError(null);
    try {
      const [sessList, branchList, userList, prods, locList] = await Promise.all([
        getInventorySessions(),
        getAllBranches().catch(err => {
          console.error('getAllBranches error:', err);
          setBranchError(err.message || 'فشل تحميل الفروع');
          return [] as BranchProfile[];
        }),
        getAllSalesAccounts().catch(() => [] as SalesAccountProfile[]),
        searchLocalProducts('', 25000),
        getActiveCatalogLocations().catch(() => [] as CatalogLocation[]),
      ]);

      setSessions(sessList);
      setBranches(branchList);
      setActiveLocations(locList);
      setSalesUsers(userList.filter(u => u.isActive));
      setCatalogProducts(prods);

      const cats = Array.from(new Set(prods.map(p => p.category).filter(Boolean))) as string[];
      setCategories(cats.sort());
    } catch (err) {
      console.error('Failed to load inventory sessions data:', err);
    } finally {
      setLoading(false);
      setBranchLoading(false);
    }
  };

  // Open Wizard
  const handleOpenWizard = () => {
    const locSet = new Set(activeLocations.map(l => l.id));
    const validBranch = branches.find(b => b.isActive && b.inventoryLocationId && (locSet.size === 0 || locSet.has(b.inventoryLocationId)));
    const defaultBranch = validBranch || branches.find(b => b.isActive) || branches[0];
    const branchName = defaultBranch ? defaultBranch.name : 'الفرع';
    const dateStr = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'numeric', day: 'numeric' });
    
    setSessionName(`جرد ${branchName} - ${dateStr}`);
    setSelectedBranchId(defaultBranch ? defaultBranch.branchId : '');
    setSessionType('FULL');
    setSelectedCategory(categories[0] || '');
    setSelectedItemCodes([]);
    setSelectedEmployeeIds([]);
    setWizardStep(1);
    setWizardError(null);
    setShowWizard(true);
  };

  const selectedBranch = branches.find(b => b.branchId === selectedBranchId);
  const branchSalesUsers = salesUsers.filter(u => u.branchId === selectedBranchId);

  // Wizard Validation
  const handleNextStep = () => {
    setWizardError(null);
    if (wizardStep === 1) {
      if (!sessionName.trim()) {
        setWizardError('يرجى إدخال اسم الجلسة.');
        return;
      }
      if (!selectedBranchId) {
        setWizardError('يرجى اختيار الفرع.');
        return;
      }
      if (!selectedBranch || !selectedBranch.inventoryLocationId) {
        setWizardError('موقع المخزون المرتبط بالفرع غير صالح. راجع إعدادات الفرع أولاً.');
        return;
      }
      setWizardStep(2);
    } else if (wizardStep === 2) {
      if (sessionType === 'CATEGORY' && !selectedCategory) {
        setWizardError('يرجى اختيار التصنيف المراد جرده.');
        return;
      }
      if (sessionType === 'SELECTED_PRODUCTS' && selectedItemCodes.length === 0) {
        setWizardError('يرجى اختيار صنف واحد على الأقل.');
        return;
      }
      if (sessionType === 'SELECTED_PRODUCTS' && selectedItemCodes.length > 500) {
        setWizardError('الحد الأقصى للأصناف المحددة هو 500 صنف.');
        return;
      }
      setWizardStep(3);
    } else if (wizardStep === 3) {
      if (selectedEmployeeIds.length === 0) {
        setWizardError('يجب تعيين موظف مبيعات واحد على الأقل للجلسة.');
        return;
      }
      setWizardStep(4);
    }
  };

  // Create Draft Session
  const handleSaveDraft = async () => {
    if (!selectedBranch) return;
    setActionLoading(true);
    setWizardError(null);
    try {
      const assignedNames = salesUsers
        .filter(u => selectedEmployeeIds.includes(u.uid))
        .map(u => u.name);

      await createDraftSession({
        name: sessionName,
        branchId: selectedBranch.branchId,
        branchName: selectedBranch.name,
        inventoryLocationId: selectedBranch.inventoryLocationId,
        inventoryLocationName: selectedBranch.name,
        type: sessionType,
        category: sessionType === 'CATEGORY' ? selectedCategory : null,
        selectedItemCodes: sessionType === 'SELECTED_PRODUCTS' ? selectedItemCodes : null,
        assignedUserIds: selectedEmployeeIds,
        assignedUserNames: assignedNames,
        currentUser,
      });

      setShowWizard(false);
      await initData();
    } catch (err: any) {
      console.error('Failed to create draft session:', err);
      setWizardError(err.message || 'فشل حفظ المسودة');
    } finally {
      setActionLoading(false);
    }
  };

  // Create & Immediately Activate
  const handleCreateAndActivate = async () => {
    if (!selectedBranch) return;
    setActionLoading(true);
    setWizardError(null);
    try {
      const assignedNames = salesUsers
        .filter(u => selectedEmployeeIds.includes(u.uid))
        .map(u => u.name);

      const sessionId = await createDraftSession({
        name: sessionName,
        branchId: selectedBranch.branchId,
        branchName: selectedBranch.name,
        inventoryLocationId: selectedBranch.inventoryLocationId,
        inventoryLocationName: selectedBranch.name,
        type: sessionType,
        category: sessionType === 'CATEGORY' ? selectedCategory : null,
        selectedItemCodes: sessionType === 'SELECTED_PRODUCTS' ? selectedItemCodes : null,
        assignedUserIds: selectedEmployeeIds,
        assignedUserNames: assignedNames,
        currentUser,
      });

      await activateSession(sessionId, currentUser, catalogProducts);

      setShowWizard(false);
      await initData();
    } catch (err: any) {
      console.error('Failed to activate session:', err);
      setWizardError(err.message || 'فشل بدء الجلسة');
    } finally {
      setActionLoading(false);
    }
  };

  // Confirm Activation of Existing Draft
  const handleConfirmActivate = async () => {
    if (!activationModalSession) return;
    setActionLoading(true);
    try {
      await activateSession(activationModalSession.id, currentUser, catalogProducts);
      setActivationModalSession(null);
      await initData();
    } catch (err: any) {
      console.error('Activation failed:', err);
      alert(err.message || 'فشل تفعيل الجلسة');
    } finally {
      setActionLoading(false);
    }
  };

  // Confirm Cancellation
  const handleConfirmCancel = async () => {
    if (!cancelModalSession) return;
    if (!cancellationReason.trim()) {
      alert('يرجى إدخال سبب الإلغاء.');
      return;
    }
    setActionLoading(true);
    try {
      await cancelSession(cancelModalSession.id, cancellationReason, currentUser);
      setCancelModalSession(null);
      setCancellationReason('');
      await initData();
    } catch (err: any) {
      console.error('Cancellation failed:', err);
      alert(err.message || 'فشل إلغاء الجلسة');
    } finally {
      setActionLoading(false);
    }
  };

  // Check and Open Close-To-Review Modal
  const handleOpenCloseToReview = async (session: InventorySession) => {
    setActionLoading(true);
    try {
      const [baselineProducts, countsMap] = await Promise.all([
        getBaselineProducts(session.id),
        getSessionCounts(session.id),
      ]);

      const countedCount = Object.keys(countsMap).length;
      const uncounted = Math.max(0, baselineProducts.length - countedCount);

      setUncountedWarningCount(uncounted);
      setCloseToReviewModalSession(session);
    } catch (err: any) {
      console.error('Failed to inspect session counts:', err);
      alert(err.message || 'فشل فحص حالة الجرد');
    } finally {
      setActionLoading(false);
    }
  };

  // Confirm Close To Review
  const handleConfirmCloseToReview = async () => {
    if (!closeToReviewModalSession) return;
    setActionLoading(true);
    try {
      await closeCountToReview(closeToReviewModalSession.id, currentUser);
      setCloseToReviewModalSession(null);
      await initData();
    } catch (err: any) {
      console.error('Failed to close count to review:', err);
      alert(err.message || 'فشل نقل الجلسة للمراجعة');
    } finally {
      setActionLoading(false);
    }
  };

  // Open Review Details Screen
  const handleOpenReview = async (session: InventorySession) => {
    setActiveReviewSession(session);
    setReviewLoading(true);
    try {
      const [baselineProducts, countsMap] = await Promise.all([
        getBaselineProducts(session.id),
        getSessionCounts(session.id),
      ]);

      const catMap: Record<string, NormalizedProduct> = {};
      catalogProducts.forEach(p => { catMap[p.itemCode] = p; });

      const items = calculateVarianceReview(baselineProducts, countsMap, catMap);
      setReviewItems(items);
    } catch (err: any) {
      console.error('Failed to load review items:', err);
      alert(err.message || 'فشل تحميل بيانات المراجعة');
    } finally {
      setReviewLoading(false);
    }
  };

  // Request Recount
  const handleRequestRecount = async (itemCode: string) => {
    if (!activeReviewSession) return;
    setActionLoading(true);
    try {
      await requestRecount(activeReviewSession.id, itemCode, currentUser);
      await handleOpenReview(activeReviewSession);
    } catch (err: any) {
      console.error('Failed to request recount:', err);
      alert(err.message || 'فشل طلب إعادة الجرد');
    } finally {
      setActionLoading(false);
    }
  };

  // Complete Session
  const handleCompleteSession = async () => {
    if (!activeReviewSession) return;
    const uncountedCount = reviewItems.filter(i => i.semanticStatus === 'UNCOUNTED').length;
    const pendingRecountCount = reviewItems.filter(i => i.semanticStatus === 'RECOUNT_REQUIRED').length;

    if (uncountedCount > 0) {
      alert(`لا يمكن إنهاء واعتماد الجلسة ويوجد ${uncountedCount} أصناف متوقعة لم يتم جردها بعد.`);
      return;
    }
    if (pendingRecountCount > 0) {
      alert(`لا يمكن إنهاء واعتماد الجلسة وتوجد ${pendingRecountCount} طلبات إعادة جرد معلقة.`);
      return;
    }

    if (!confirm('هل أنت متأكد من اعتماد الجلسة وإنهاء الجرد؟ لن تتمكن من تعديل النتائج بعد ذلك.')) {
      return;
    }

    setActionLoading(true);
    try {
      await completeSession(activeReviewSession.id, currentUser, uncountedCount, pendingRecountCount);
      alert('تم اعتماد وإنهاء جلسة الجرد بنجاح.');
      setActiveReviewSession(null);
      await initData();
    } catch (err: any) {
      console.error('Failed to complete session:', err);
      alert(err.message || 'فشل اعتماد الجلسة');
    } finally {
      setActionLoading(false);
    }
  };

  // Filtered Sessions List
  const filteredSessions = sessions.filter(s => {
    if (statusFilter === 'ALL') return true;
    return s.status === statusFilter;
  });

  // Filtered Review Items
  const filteredReviewItems = reviewItems.filter(item => {
    if (reviewTab === 'MATCH' && item.semanticStatus !== 'MATCH') return false;
    if (reviewTab === 'SHORTAGE' && item.semanticStatus !== 'SHORTAGE') return false;
    if (reviewTab === 'OVERAGE' && item.semanticStatus !== 'OVERAGE') return false;
    if (reviewTab === 'UNCOUNTED' && item.semanticStatus !== 'UNCOUNTED') return false;
    if (reviewTab === 'RECOUNT_REQUIRED' && item.semanticStatus !== 'RECOUNT_REQUIRED') return false;
    if (reviewTab === 'UNEXPECTED' && !item.unexpected) return false;

    if (reviewSearch.trim()) {
      const q = reviewSearch.trim().toLowerCase();
      return (
        item.itemCode.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        item.barcode.toLowerCase().includes(q) ||
        item.modelCode.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Review Summary Metrics
  const reviewMetrics = {
    totalExpected: reviewItems.filter(i => !i.unexpected).length,
    counted: reviewItems.filter(i => i.semanticStatus !== 'UNCOUNTED').length,
    uncounted: reviewItems.filter(i => i.semanticStatus === 'UNCOUNTED').length,
    matches: reviewItems.filter(i => i.semanticStatus === 'MATCH').length,
    shortages: reviewItems.filter(i => i.semanticStatus === 'SHORTAGE').length,
    overages: reviewItems.filter(i => i.semanticStatus === 'OVERAGE').length,
    recountRequired: reviewItems.filter(i => i.semanticStatus === 'RECOUNT_REQUIRED').length,
    unexpected: reviewItems.filter(i => i.unexpected).length,
  };

  if (loading) {
    return (
      <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-2xl p-12 text-center shadow-sm space-y-3">
        <RefreshCw className="w-8 h-8 text-[#2F81F7] animate-spin mx-auto" />
        <p className="text-xs text-[#667085] font-medium">جاري تحميل بيانات الجرد الفعلي...</p>
      </div>
    );
  }

  // VARIANCE REVIEW VIEW SCREEN
  if (activeReviewSession) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-[#667085] mb-1">
              <button 
                onClick={() => setActiveReviewSession(null)}
                className="hover:text-[#2F81F7] font-medium flex items-center gap-1 cursor-pointer"
              >
                <span>الجرد الفعلي</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <span>مراجعة الفروقات</span>
            </div>
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-[#111827]">{activeReviewSession.name}</h2>
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                activeReviewSession.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                activeReviewSession.status === 'REVIEW' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                'bg-amber-50 text-amber-700 border border-amber-200'
              }`}>
                {activeReviewSession.status === 'COMPLETED' ? 'مكتمل' :
                 activeReviewSession.status === 'REVIEW' ? 'قيد المراجعة' : activeReviewSession.status}
              </span>
            </div>
            <p className="text-xs text-[#667085] mt-1">
              الفرع: <span className="font-semibold text-[#111827]">{activeReviewSession.branchName}</span> | 
              الموقع: <span className="font-semibold text-[#111827]">{activeReviewSession.inventoryLocationName}</span> | 
              الرصيد المرجعي: <span className="font-mono font-semibold text-[#2F81F7]">Revision {activeReviewSession.baselineRevision ?? '—'}</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => exportInventoryReportXLSX(activeReviewSession, reviewItems)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer shadow-sm transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4" />
              تصدير التقرير (Excel)
            </button>

            {activeReviewSession.status === 'REVIEW' && (
              <button
                onClick={handleCompleteSession}
                disabled={actionLoading || reviewMetrics.uncounted > 0 || reviewMetrics.recountRequired > 0}
                className="px-4 py-2 bg-[#2F81F7] hover:bg-blue-600 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer shadow-sm transition-colors"
              >
                <ShieldCheck className="w-4 h-4" />
                اعتماد وإنهاء الجلسة
              </button>
            )}
          </div>
        </div>

        {/* Metrics Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-xl p-3 shadow-sm text-center">
            <span className="text-[11px] text-[#667085] block">إجمالي المتوقع</span>
            <span className="text-base font-bold text-[#111827] font-mono">{reviewMetrics.totalExpected}</span>
          </div>
          <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-xl p-3 shadow-sm text-center">
            <span className="text-[11px] text-[#667085] block">تم جرده</span>
            <span className="text-base font-bold text-emerald-600 font-mono">{reviewMetrics.counted}</span>
          </div>
          <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-xl p-3 shadow-sm text-center">
            <span className="text-[11px] text-[#667085] block">لم يتم جرده</span>
            <span className="text-base font-bold text-amber-600 font-mono">{reviewMetrics.uncounted}</span>
          </div>
          <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-xl p-3 shadow-sm text-center">
            <span className="text-[11px] text-[#667085] block">مطابق</span>
            <span className="text-base font-bold text-blue-600 font-mono">{reviewMetrics.matches}</span>
          </div>
          <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-xl p-3 shadow-sm text-center">
            <span className="text-[11px] text-[#667085] block">عجز</span>
            <span className="text-base font-bold text-red-600 font-mono">{reviewMetrics.shortages}</span>
          </div>
          <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-xl p-3 shadow-sm text-center">
            <span className="text-[11px] text-[#667085] block">زيادة</span>
            <span className="text-base font-bold text-purple-600 font-mono">{reviewMetrics.overages}</span>
          </div>
          <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-xl p-3 shadow-sm text-center">
            <span className="text-[11px] text-[#667085] block">إعادة جرد مطلوبة</span>
            <span className="text-base font-bold text-orange-600 font-mono">{reviewMetrics.recountRequired}</span>
          </div>
        </div>

        {/* Filter Tabs & Search */}
        <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-2xl p-4 shadow-sm space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {[
                { id: 'ALL', label: `الكل (${reviewItems.length})` },
                { id: 'MATCH', label: `مطابق (${reviewMetrics.matches})` },
                { id: 'SHORTAGE', label: `عجز (${reviewMetrics.shortages})` },
                { id: 'OVERAGE', label: `زيادة (${reviewMetrics.overages})` },
                { id: 'UNCOUNTED', label: `لم يتم جرده (${reviewMetrics.uncounted})` },
                { id: 'RECOUNT_REQUIRED', label: `إعادة جرد مطلوبة (${reviewMetrics.recountRequired})` },
                { id: 'UNEXPECTED', label: `أصناف غير متوقعة (${reviewMetrics.unexpected})` },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setReviewTab(tab.id as any)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                    reviewTab === tab.id
                      ? 'bg-[#2F81F7] text-white'
                      : 'bg-[#F3F4F6] text-[#667085] hover:bg-[#E5E7EB]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="relative w-full md:w-64">
              <Search className="w-4 h-4 text-[#9CA3AF] absolute right-3 top-2.5" />
              <input
                type="text"
                placeholder="بحث في الأصناف..."
                value={reviewSearch}
                onChange={(e) => setReviewSearch(e.target.value)}
                className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl pr-9 pl-3 py-1.5 text-xs text-[#111827] focus:outline-none focus:border-[#2F81F7]"
              />
            </div>
          </div>

          {/* Review Table */}
          <div className="overflow-x-auto rounded-xl border border-[#E5E7EB]">
            <table className="w-full text-right text-xs">
              <thead className="bg-[#F9FAFB] border-b border-[#E5E7EB] text-[#4B5563] font-semibold">
                <tr>
                  <th className="py-3 px-3">كود الصنف</th>
                  <th className="py-3 px-3">اسم الصنف</th>
                  <th className="py-3 px-3">الباركود</th>
                  <th className="py-3 px-3 text-center">الرصيد المرجعي</th>
                  <th className="py-3 px-3 text-center">العد الأول</th>
                  <th className="py-3 px-3 text-center">إعادة الجرد</th>
                  <th className="py-3 px-3 text-center">العد النهائي</th>
                  <th className="py-3 px-3 text-center">الفرق</th>
                  <th className="py-3 px-3 text-center">الحالة</th>
                  <th className="py-3 px-3">الموظف</th>
                  {activeReviewSession.status === 'REVIEW' && <th className="py-3 px-3 text-center">الإجراء</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB]">
                {filteredReviewItems.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-8 text-center text-[#667085]">
                      لا توجد أصناف تطابق الفلتر المحدد.
                    </td>
                  </tr>
                ) : (
                  filteredReviewItems.map(item => (
                    <tr key={item.itemCode} className="hover:bg-[#F9FAFB] transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-[#111827]">{item.itemCode}</td>
                      <td className="py-2.5 px-3 font-medium text-[#111827]">
                        {item.name}
                        {item.unexpected && (
                          <span className="mr-1.5 px-1.5 py-0.5 bg-purple-50 text-purple-700 text-[10px] rounded border border-purple-200">
                            غير متوقع
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[#667085]">{item.barcode}</td>
                      <td className="py-2.5 px-3 text-center font-mono font-semibold">{item.baselineQty}</td>
                      <td className="py-2.5 px-3 text-center font-mono text-[#667085]">{item.firstQty ?? '—'}</td>
                      <td className="py-2.5 px-3 text-center font-mono text-[#667085]">{item.recountQty ?? '—'}</td>
                      <td className="py-2.5 px-3 text-center font-mono font-bold text-[#111827]">{item.finalCountQty ?? '—'}</td>
                      <td className="py-2.5 px-3 text-center font-mono font-bold">
                        {item.variance === null ? '—' : (
                          <span className={item.variance === 0 ? 'text-blue-600' : item.variance < 0 ? 'text-red-600' : 'text-purple-600'}>
                            {item.variance > 0 ? `+${item.variance}` : item.variance}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          item.semanticStatus === 'MATCH' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                          item.semanticStatus === 'SHORTAGE' ? 'bg-red-50 text-red-700 border border-red-200' :
                          item.semanticStatus === 'OVERAGE' ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                          item.semanticStatus === 'RECOUNT_REQUIRED' ? 'bg-orange-50 text-orange-700 border border-orange-200' :
                          'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}>
                          {item.semanticStatus === 'MATCH' ? 'مطابق' :
                           item.semanticStatus === 'SHORTAGE' ? 'عجز' :
                           item.semanticStatus === 'OVERAGE' ? 'زيادة' :
                           item.semanticStatus === 'RECOUNT_REQUIRED' ? 'إعادة جرد' : 'لم يتم جرده'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-[#667085] text-[11px]">{item.firstCountedByName || '—'}</td>
                      {activeReviewSession.status === 'REVIEW' && (
                        <td className="py-2.5 px-3 text-center">
                          {item.semanticStatus !== 'UNCOUNTED' && item.semanticStatus !== 'RECOUNT_REQUIRED' && (
                            <button
                              onClick={() => handleRequestRecount(item.itemCode)}
                              disabled={actionLoading}
                              className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded text-[11px] font-semibold cursor-pointer transition-colors"
                            >
                              طلب إعادة جرد
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // MAIN SESSIONS LIST VIEW
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <ClipboardCheck className="w-5 h-5 text-[#2F81F7]" />
            <h2 className="text-base font-bold text-[#111827]">الجرد الفعلي للمخزون</h2>
          </div>
          <p className="text-xs text-[#667085]">
            إنشاء وإدارة جلسات الجرد، ومراجعة الفروقات الدفترية والفعلية دون التأثير المباشر على الأرصدة التشغيلية.
          </p>
        </div>

        <button
          onClick={handleOpenWizard}
          className="px-4 py-2 bg-[#2F81F7] hover:bg-blue-600 text-white rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer shadow-sm transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          إنشاء جلسة جرد جديدة
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'ALL', label: 'الكل' },
          { id: 'ACTIVE', label: 'قيد الجرد (Active)' },
          { id: 'REVIEW', label: 'قيد المراجعة (Review)' },
          { id: 'COMPLETED', label: 'مكتمل (Completed)' },
          { id: 'DRAFT', label: 'مسودة (Draft)' },
          { id: 'CANCELLED', label: 'ملغي (Cancelled)' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setStatusFilter(tab.id)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
              statusFilter === tab.id
                ? 'bg-[#2F81F7] text-white shadow-sm'
                : 'bg-[#FFFFFF] text-[#667085] hover:bg-[#F3F4F6] border border-[#E5E7EB]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Sessions Grid */}
      {filteredSessions.length === 0 ? (
        <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-2xl p-16 text-center space-y-3 shadow-sm">
          <ClipboardCheck className="w-10 h-10 text-[#9CA3AF] mx-auto" />
          <h3 className="text-sm font-bold text-[#111827]">لا توجد جلسات جرد حالياً</h3>
          <p className="text-xs text-[#667085] max-w-sm mx-auto">
            قم بإنشاء جلسة جرد جديدة لتحديد الفرع ونطاق الأصناف وتعيين موظفي المبيعات.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSessions.map(session => (
            <div key={session.id} className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-2xl p-5 shadow-sm space-y-4 flex flex-col justify-between hover:border-[#2F81F7]/40 transition-all">
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-bold text-[#111827] leading-snug">{session.name}</h3>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                    session.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 animate-pulse' :
                    session.status === 'REVIEW' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                    session.status === 'COMPLETED' ? 'bg-gray-100 text-gray-700 border border-gray-200' :
                    session.status === 'CANCELLED' ? 'bg-red-50 text-red-700 border border-red-200' :
                    'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}>
                    {session.status === 'ACTIVE' ? 'نشط (جرد)' :
                     session.status === 'REVIEW' ? 'مراجعة' :
                     session.status === 'COMPLETED' ? 'مكتمل' :
                     session.status === 'CANCELLED' ? 'ملغي' : 'مسودة'}
                  </span>
                </div>

                <div className="text-[11px] text-[#667085] space-y-1">
                  <div>الفرع: <span className="font-semibold text-[#111827]">{session.branchName}</span></div>
                  <div>الموقع: <span className="font-semibold text-[#111827]">{session.inventoryLocationName}</span></div>
                  <div>النوع: <span className="font-semibold text-[#111827]">
                    {session.type === 'FULL' ? 'جرد كامل' : session.type === 'CATEGORY' ? `جرد تصنيف (${session.category})` : 'أصناف محددة'}
                  </span></div>
                  <div>الرصيد المرجعي: <span className="font-mono font-semibold text-[#2F81F7]">
                    {session.baselineRevision !== null ? `Revision ${session.baselineRevision}` : 'غير مثبت بعد'}
                  </span></div>
                  <div>الموظفون المعينون: <span className="font-semibold text-[#111827]">{session.assignedUserNames?.join(', ') || '—'}</span></div>
                </div>
              </div>

              {/* Action Buttons based on status */}
              <div className="pt-3 border-t border-[#E5E7EB] flex flex-wrap items-center justify-between gap-2">
                {session.status === 'DRAFT' && (
                  <>
                    <button
                      onClick={() => setActivationModalSession(session)}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-sm transition-colors"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      بدء الجرد
                    </button>
                    <button
                      onClick={() => setCancelModalSession(session)}
                      className="px-3 py-1.5 bg-white text-red-600 hover:bg-red-50 border border-red-200 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                    >
                      إلغاء
                    </button>
                  </>
                )}

                {session.status === 'ACTIVE' && (
                  <>
                    <button
                      onClick={() => handleOpenCloseToReview(session)}
                      className="px-3 py-1.5 bg-[#2F81F7] hover:bg-blue-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-sm transition-colors"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      إنهاء العد وبدء المراجعة
                    </button>
                    <button
                      onClick={() => setCancelModalSession(session)}
                      className="px-2.5 py-1.5 text-red-600 hover:bg-red-50 rounded-lg text-xs font-semibold cursor-pointer"
                    >
                      إلغاء
                    </button>
                  </>
                )}

                {(session.status === 'REVIEW' || session.status === 'COMPLETED') && (
                  <button
                    onClick={() => handleOpenReview(session)}
                    className="w-full px-3 py-1.5 bg-[#2F81F7] hover:bg-blue-600 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer shadow-sm transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    {session.status === 'REVIEW' ? 'مراجعة الفروقات وإعادة الجرد' : 'عرض تقرير الجرد'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CREATION WIZARD MODAL */}
      {showWizard && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5 dir-rtl">
            <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="w-5 h-5 text-[#2F81F7]" />
                <h3 className="text-sm font-bold text-[#111827]">إنشاء جلسة جرد جديدة (خطوة {wizardStep} من 4)</h3>
              </div>
              <button
                onClick={() => setShowWizard(false)}
                className="p-1 text-[#9CA3AF] hover:text-[#111827] rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {wizardError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs text-red-700">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{wizardError}</span>
              </div>
            )}

            {/* STEP 1: Details */}
            {wizardStep === 1 && (() => {
              const activeLocationIds = new Set(activeLocations.map(l => l.id));
              const activeBranches = branches.filter(b => b.isActive);
              const validMappedBranches = activeBranches.filter(b => b.inventoryLocationId && (activeLocationIds.size === 0 || activeLocationIds.has(b.inventoryLocationId)));

              return (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-[#374151] block mb-1">اسم الجلسة</label>
                    <input
                      type="text"
                      value={sessionName}
                      onChange={(e) => setSessionName(e.target.value)}
                      className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl px-3 py-2 text-xs text-[#111827] focus:outline-none focus:border-[#2F81F7]"
                      placeholder="مثال: جرد فرع المعادي - 2026-09-30"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-[#374151] block">الفرع المراد جرده</label>
                      {branchLoading && (
                        <span className="text-[10px] text-[#2F81F7] flex items-center gap-1 font-mono">
                          <RefreshCw className="w-3 h-3 animate-spin" /> جاري تحميل الفروع...
                        </span>
                      )}
                    </div>

                    {branchError ? (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center justify-between">
                        <span>تعذر تحميل الفروع: {branchError}</span>
                        <button 
                          type="button" 
                          onClick={initData} 
                          className="px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white rounded text-[11px] font-semibold cursor-pointer"
                        >
                          إعادة المحاولة
                        </button>
                      </div>
                    ) : activeBranches.length === 0 && !branchLoading ? (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                        لا توجد فروع نشطة في النظام. يرجى إضافة وتفعيل فروع أولاً من قسم إدارة الفروع.
                      </div>
                    ) : (
                      <>
                        <select
                          value={selectedBranchId}
                          disabled={branchLoading}
                          onChange={(e) => {
                            setSelectedBranchId(e.target.value);
                            const b = branches.find(x => x.branchId === e.target.value);
                            if (b) {
                              setSessionName(`جرد ${b.name} - ${new Date().toLocaleDateString('ar-EG')}`);
                            }
                          }}
                          className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl px-3 py-2 text-xs text-[#111827] focus:outline-none focus:border-[#2F81F7] font-medium"
                        >
                          <option value="">-- اختر الفرع المراد جرده --</option>
                          {activeBranches.map(b => {
                            const hasLocation = Boolean(b.inventoryLocationId);
                            const isValidLocation = hasLocation && (activeLocationIds.size === 0 || activeLocationIds.has(b.inventoryLocationId));
                            const locationDisplay = b.inventoryLocationId ? formatLocationDisplayName(b.inventoryLocationId) : '';
                            
                            let label = b.name;
                            if (!hasLocation) {
                              label += ' — (موقع المخزون غير مربوط)';
                            } else if (!isValidLocation) {
                              label += ` — (${locationDisplay} - موقع المخزون غير صالح)`;
                            } else {
                              label += ` (${locationDisplay})`;
                            }

                            return (
                              <option 
                                key={b.branchId} 
                                value={b.branchId}
                                disabled={!isValidLocation}
                              >
                                {label}
                              </option>
                            );
                          })}
                        </select>

                        {validMappedBranches.length === 0 && activeBranches.length > 0 && !branchLoading && (
                          <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800 flex items-center gap-1.5 mt-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                            <span>لا يوجد فرع مرتبط بموقع مخزون صالح. راجع إدارة الفروع.</span>
                          </div>
                        )}

                        {selectedBranch && (
                          <div className="mt-1.5 text-[11px] text-[#667085] flex items-center justify-between px-1">
                            <span>الموقع المرتبط: <strong className="text-[#111827] font-mono">{selectedBranch.inventoryLocationId || 'غير مربوط'}</strong></span>
                            {selectedBranch.inventoryLocationId && (activeLocationIds.size === 0 || activeLocationIds.has(selectedBranch.inventoryLocationId)) ? (
                              <span className="text-emerald-600 font-semibold flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> موقع صالح وجاهز للجرد
                              </span>
                            ) : (
                              <span className="text-red-600 font-semibold flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> موقع غير مطابق للكتالوج النشط
                              </span>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-[#374151] block mb-1">نوع الجرد</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: 'FULL', label: 'جرد كامل' },
                        { id: 'CATEGORY', label: 'جرد تصنيف' },
                        { id: 'SELECTED_PRODUCTS', label: 'أصناف محددة' },
                      ].map(t => (
                        <button
                          type="button"
                          key={t.id}
                          onClick={() => setSessionType(t.id as any)}
                          className={`py-2 px-3 rounded-xl text-xs font-semibold border cursor-pointer text-center ${
                            sessionType === t.id
                              ? 'bg-[#2F81F7]/10 border-[#2F81F7] text-[#2F81F7]'
                              : 'bg-[#F9FAFB] border-[#E5E7EB] text-[#667085]'
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Admin Diagnostic Box */}
                  <div className="bg-[#111827] text-slate-300 p-2.5 rounded-lg text-[10px] font-mono space-y-0.5 dir-ltr border border-white/10">
                    <div className="text-emerald-400 font-bold">ADMIN BRANCH DIAGNOSTICS:</div>
                    <div>Total Branches: {branches.length} | Active: {activeBranches.length}</div>
                    <div>With Location ID: {branches.filter(b => b.inventoryLocationId).length} | Valid Mapped: {validMappedBranches.length}</div>
                    <div>Active Catalog Locations: {activeLocations.length}</div>
                  </div>
                </div>
              );
            })()}

            {/* STEP 2: Scope */}
            {wizardStep === 2 && (
              <div className="space-y-4">
                {sessionType === 'FULL' && (
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-2 text-xs text-blue-800">
                    <p className="font-semibold">نطاق الجرد الكامل:</p>
                    <p>سيشمل الجرد كافة الأصناف النشطة التي رصيدها أكبر من صفر في موقع الفرع المحدد لحظة التفعيل.</p>
                  </div>
                )}

                {sessionType === 'CATEGORY' && (
                  <div>
                    <label className="text-xs font-semibold text-[#374151] block mb-1">اختر التصنيف</label>
                    <select
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                      className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl px-3 py-2 text-xs text-[#111827] focus:outline-none focus:border-[#2F81F7]"
                    >
                      {categories.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                )}

                {sessionType === 'SELECTED_PRODUCTS' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[#374151]">الأصناف المحددة ({selectedItemCodes.length} / 500)</span>
                      <button
                        type="button"
                        onClick={() => setSelectedItemCodes([])}
                        className="text-[11px] text-red-600 hover:underline"
                      >
                        إلغاء التحديد
                      </button>
                    </div>

                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-[#9CA3AF] absolute right-3 top-2.5" />
                      <input
                        type="text"
                        placeholder="ابحث بالكود أو الاسم أو الباركود..."
                        value={productSearchQuery}
                        onChange={(e) => setProductSearchQuery(e.target.value)}
                        className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl pr-9 pl-3 py-1.5 text-xs text-[#111827] focus:outline-none focus:border-[#2F81F7]"
                      />
                    </div>

                    <div className="max-h-48 overflow-y-auto rounded-xl border border-[#E5E7EB] divide-y divide-[#E5E7EB]">
                      {catalogProducts
                        .filter(p => {
                          if (!productSearchQuery.trim()) return true;
                          const q = productSearchQuery.toLowerCase();
                          return (
                            p.itemCode.toLowerCase().includes(q) ||
                            (p.name && p.name.toLowerCase().includes(q)) ||
                            (p.barcode && p.barcode.toLowerCase().includes(q))
                          );
                        })
                        .slice(0, 50)
                        .map(p => {
                          const isSelected = selectedItemCodes.includes(p.itemCode);
                          return (
                            <div
                              key={p.itemCode}
                              onClick={() => {
                                if (isSelected) {
                                  setSelectedItemCodes(selectedItemCodes.filter(c => c !== p.itemCode));
                                } else {
                                  if (selectedItemCodes.length >= 500) {
                                    alert('الحد الأقصى هو 500 صنف.');
                                    return;
                                  }
                                  setSelectedItemCodes([...selectedItemCodes, p.itemCode]);
                                }
                              }}
                              className="p-2 flex items-center justify-between hover:bg-[#F3F4F6] cursor-pointer text-xs"
                            >
                              <div>
                                <span className="font-mono font-bold ml-2 text-[#111827]">{p.itemCode}</span>
                                <span className="text-[#374151]">{p.name}</span>
                              </div>
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-[#2F81F7]" />
                              ) : (
                                <Square className="w-4 h-4 text-[#9CA3AF]" />
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* STEP 3: Employees */}
            {wizardStep === 3 && (
              <div className="space-y-3">
                <label className="text-xs font-semibold text-[#374151] block">
                  تعيين موظفي المبيعات للجرد ({selectedBranch?.name})
                </label>
                {branchSalesUsers.length === 0 ? (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                    لا توجد حسابات مبيعات نشطة مخصصة لهذا الفرع حالياً. يرجى إنشاء أو تفعيل حساب مبيعات للفرع أولاً من قسم الحسابات.
                  </div>
                ) : (
                  <div className="max-h-48 overflow-y-auto rounded-xl border border-[#E5E7EB] divide-y divide-[#E5E7EB]">
                    {branchSalesUsers.map(u => {
                      const isAssigned = selectedEmployeeIds.includes(u.uid);
                      return (
                        <div
                          key={u.uid}
                          onClick={() => {
                            if (isAssigned) {
                              setSelectedEmployeeIds(selectedEmployeeIds.filter(id => id !== u.uid));
                            } else {
                              setSelectedEmployeeIds([...selectedEmployeeIds, u.uid]);
                            }
                          }}
                          className="p-2.5 flex items-center justify-between hover:bg-[#F3F4F6] cursor-pointer text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <UserCheck className="w-4 h-4 text-[#2F81F7]" />
                            <span className="font-semibold text-[#111827]">{u.name}</span>
                          </div>
                          {isAssigned ? (
                            <CheckSquare className="w-4 h-4 text-[#2F81F7]" />
                          ) : (
                            <Square className="w-4 h-4 text-[#9CA3AF]" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* STEP 4: Review */}
            {wizardStep === 4 && (
              <div className="space-y-3 text-xs">
                <div className="p-4 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl space-y-2">
                  <div>اسم الجلسة: <span className="font-bold text-[#111827]">{sessionName}</span></div>
                  <div>الفرع: <span className="font-bold text-[#111827]">{selectedBranch?.name}</span></div>
                  <div>موقع المخزون: <span className="font-mono font-bold text-[#2F81F7]">{selectedBranch?.inventoryLocationId}</span></div>
                  <div>النوع: <span className="font-bold text-[#111827]">
                    {sessionType === 'FULL' ? 'جرد كامل' : sessionType === 'CATEGORY' ? `جرد تصنيف (${selectedCategory})` : `أصناف محددة (${selectedItemCodes.length})`}
                  </span></div>
                  <div>الموظفون المعينون: <span className="font-bold text-[#111827]">
                    {salesUsers.filter(u => selectedEmployeeIds.includes(u.uid)).map(u => u.name).join(', ')}
                  </span></div>
                  <div>وضع الجرد: <span className="font-semibold text-emerald-700">جرد أعمى (Blind Count - مفعل)</span></div>
                </div>
              </div>
            )}

            {/* Wizard Navigation Footer */}
            <div className="flex justify-between items-center pt-3 border-t border-[#E5E7EB]">
              {wizardStep > 1 ? (
                <button
                  type="button"
                  onClick={() => setWizardStep((wizardStep - 1) as any)}
                  className="px-3 py-1.5 bg-gray-100 text-[#374151] rounded-lg text-xs font-semibold cursor-pointer"
                >
                  السابق
                </button>
              ) : <div></div>}

              <div className="flex gap-2">
                {wizardStep < 4 ? (
                  <button
                    type="button"
                    onClick={handleNextStep}
                    className="px-4 py-1.5 bg-[#2F81F7] hover:bg-blue-600 text-white rounded-lg text-xs font-semibold cursor-pointer shadow-sm"
                  >
                    التالي
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={handleSaveDraft}
                      className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-[#374151] rounded-lg text-xs font-semibold cursor-pointer"
                    >
                      حفظ كمسودة
                    </button>
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={handleCreateAndActivate}
                      className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold cursor-pointer shadow-sm"
                    >
                      بدء الجرد وتثبيت الرصيد
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ACTIVATION CONFIRMATION MODAL */}
      {activationModalSession && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 dir-rtl">
            <div className="flex items-center gap-2 text-emerald-600">
              <Play className="w-5 h-5 fill-current" />
              <h3 className="text-sm font-bold text-[#111827]">تأكيد تفعيل وبدء جلسة الجرد</h3>
            </div>
            <p className="text-xs text-[#4B5563] leading-relaxed">
              سيتم تثبيت رصيد مرجعي للجرد استناداً إلى الكتالوج والمراجعة الحالية. أي تحديثات مخزون لاحقة لن تغير أساس المقارنة لهذه الجلسة.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setActivationModalSession(null)}
                className="px-3 py-1.5 bg-gray-100 text-[#374151] rounded-lg text-xs font-semibold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                onClick={handleConfirmActivate}
                disabled={actionLoading}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold cursor-pointer shadow-sm"
              >
                بدء الجرد الآن
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CANCELLATION MODAL */}
      {cancelModalSession && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 dir-rtl">
            <div className="flex items-center gap-2 text-red-600">
              <Ban className="w-5 h-5" />
              <h3 className="text-sm font-bold text-[#111827]">إلغاء جلسة الجرد</h3>
            </div>
            <p className="text-xs text-[#4B5563]">يرجى توضيح سبب إلغاء جلسة الجرد للأرشفة والتدقيق:</p>
            <textarea
              rows={3}
              value={cancellationReason}
              onChange={(e) => setCancellationReason(e.target.value)}
              placeholder="اكتب سبب الإلغاء هنا..."
              className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl p-3 text-xs text-[#111827] focus:outline-none focus:border-[#2F81F7]"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setCancelModalSession(null);
                  setCancellationReason('');
                }}
                className="px-3 py-1.5 bg-gray-100 text-[#374151] rounded-lg text-xs font-semibold cursor-pointer"
              >
                تراجع
              </button>
              <button
                onClick={handleConfirmCancel}
                disabled={actionLoading || !cancellationReason.trim()}
                className="px-4 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold cursor-pointer shadow-sm"
              >
                تأكيد الإلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CLOSE TO REVIEW WARNING MODAL */}
      {closeToReviewModalSession && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 dir-rtl">
            <div className="flex items-center gap-2 text-[#2F81F7]">
              <CheckCircle2 className="w-5 h-5" />
              <h3 className="text-sm font-bold text-[#111827]">إنهاء العد وبدء المراجعة</h3>
            </div>
            {uncountedWarningCount > 0 ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1 text-xs text-amber-800">
                <div className="font-bold flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span>تنبيه: أصناف لم يتم جردها</span>
                </div>
                <p>لا يزال هناك <span className="font-bold">{uncountedWarningCount}</span> صنف متوقع لم يتم جردهم.</p>
              </div>
            ) : (
              <p className="text-xs text-[#4B5563]">تم جرد كافة الأصناف المتوقعة. هل ترغب في إنهاء مرحلة العد ونقل الجلسة إلى المراجعة؟</p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setCloseToReviewModalSession(null)}
                className="px-3 py-1.5 bg-gray-100 text-[#374151] rounded-lg text-xs font-semibold cursor-pointer"
              >
                العودة للجرد
              </button>
              <button
                onClick={handleConfirmCloseToReview}
                disabled={actionLoading}
                className="px-4 py-1.5 bg-[#2F81F7] hover:bg-blue-600 text-white rounded-lg text-xs font-bold cursor-pointer shadow-sm"
              >
                بدء المراجعة
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
