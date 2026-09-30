import React, { useState, useEffect } from 'react';
import { BranchProfile, getAllBranches, saveBranch, getActiveCatalogLocations, CatalogLocation, formatLocationDisplayName } from '../services/branchService';
import { getAllSalesAccounts, SalesAccountProfile } from '../services/accountService';
import { 
  Building2, Plus, Edit, ShieldCheck, AlertTriangle, 
  CheckCircle2, X, Store, MapPin, Users, Eye
} from 'lucide-react';

export default function BranchManagementView() {
  const [branches, setBranches] = useState<BranchProfile[]>([]);
  const [salesAccounts, setSalesAccounts] = useState<SalesAccountProfile[]>([]);
  const [activeLocations, setActiveLocations] = useState<CatalogLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingBranch, setEditingBranch] = useState<BranchProfile | null>(null);

  // Form state
  const [branchIdInput, setBranchIdInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [locationIdInput, setLocationIdInput] = useState('');
  const [isActiveInput, setIsActiveInput] = useState(true);
  const [allowCrossViewInput, setAllowCrossViewInput] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const bList = await getAllBranches();
      const sList = await getAllSalesAccounts();
      const locList = await getActiveCatalogLocations();
      setBranches(bList);
      setSalesAccounts(sList);
      setActiveLocations(locList);
      if (locList.length > 0 && !locationIdInput) {
        setLocationIdInput(locList[0].id);
      }
    } catch (err) {
      console.error('Failed to load branches:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setEditingBranch(null);
    setBranchIdInput('');
    setNameInput('');
    setCodeInput('');
    setLocationIdInput(activeLocations.length > 0 ? activeLocations[0].id : '');
    setIsActiveInput(true);
    setAllowCrossViewInput(false);
    setErrorMsg('');
    setShowModal(true);
  };

  const handleOpenEdit = (b: BranchProfile) => {
    setEditingBranch(b);
    setBranchIdInput(b.branchId);
    setNameInput(b.name);
    setCodeInput(b.code);
    setLocationIdInput(b.inventoryLocationId || (activeLocations.length > 0 ? activeLocations[0].id : ''));
    setIsActiveInput(b.isActive);
    setAllowCrossViewInput(Boolean(b.allowCrossBranchStockView));
    setErrorMsg('');
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!branchIdInput.trim() || !nameInput.trim() || !codeInput.trim() || !locationIdInput) {
      setErrorMsg('جميع الحقول الأساسية مطلوبة.');
      return;
    }

    try {
      await saveBranch({
        branchId: branchIdInput.trim().toLowerCase(),
        name: nameInput.trim(),
        code: codeInput.trim().toUpperCase(),
        inventoryLocationId: locationIdInput,
        isActive: isActiveInput,
        allowCrossBranchStockView: allowCrossViewInput,
      }, 'admin');

      setShowModal(false);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message || 'فشل حفظ بيانات الفرع.');
    }
  };

  const countBranchAccounts = (branchId: string) => {
    return salesAccounts.filter(a => a.branchId === branchId).length;
  };

  const isLocationInActiveCatalog = (locId: string) => {
    return activeLocations.some(l => l.id === locId);
  };

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center space-y-3 shadow-xs">
        <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 mx-auto">
          <Store className="w-5 h-5 animate-pulse" />
        </div>
        <p className="text-slate-500 text-xs font-medium">جاري تحميل الفروع ومواقع الكتالوج النشط...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <Store className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-bold text-slate-900">إدارة الفروع والمواقع التشغيلية</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            ربط الفروع التجارية بمواقع المخزون المستخرجة ديناميكياً من الكتالوج النشط ({activeLocations.length} موقع متوفر).
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer shrink-0 shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة فرع جديد</span>
        </button>
      </div>

      {/* Branches Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {branches.map(b => {
          const accCount = countBranchAccounts(b.branchId);
          const isLocValid = isLocationInActiveCatalog(b.inventoryLocationId);
          return (
            <div 
              key={b.branchId} 
              className={`bg-white border rounded-2xl p-5 space-y-4 shadow-xs flex flex-col justify-between transition-all ${
                !isLocValid ? 'border-amber-300 bg-amber-50/20' : 'border-slate-200'
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[11px] text-blue-600 font-mono font-bold block">{b.branchId}</span>
                    <h3 className="text-slate-900 font-bold text-sm mt-0.5">{b.name}</h3>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-[11px] px-2 py-0.5 rounded-lg font-mono font-semibold ${
                      b.isActive 
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
                        : 'bg-red-50 text-red-800 border border-red-200'
                    }`}>
                      {b.isActive ? 'نشط' : 'معطل'}
                    </span>
                    {!isLocValid && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold bg-amber-100 text-amber-800 border border-amber-300">
                        NEEDS_REVIEW
                      </span>
                    )}
                  </div>
                </div>

                {!isLocValid && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-[11px] flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                    <span className="font-medium">موقع المخزون غير موجود في الكتالوج النشط</span>
                  </div>
                )}

                <div className="space-y-1.5 text-xs font-mono text-slate-700 bg-slate-50 p-3.5 rounded-xl border border-slate-200 tabular-nums">
                  <div className="flex justify-between py-1 border-b border-slate-200">
                    <span className="text-slate-500 font-sans">كود الفرع:</span>
                    <span className="text-slate-900 font-bold">{b.code}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200 truncate">
                    <span className="text-slate-500 font-sans shrink-0">موقع المخزون:</span>
                    <span className="text-blue-600 font-bold truncate mr-2" title={b.inventoryLocationId}>
                      {formatLocationDisplayName(b.inventoryLocationId)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200">
                    <span className="text-slate-500 font-sans">الحسابات المرتبطة:</span>
                    <span className="text-slate-900 font-medium">{accCount} موظف</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-500 font-sans">رؤية فروع أخرى:</span>
                    <span className={b.allowCrossBranchStockView ? 'text-emerald-700 font-semibold' : 'text-slate-500'}>
                      {b.allowCrossBranchStockView ? 'مسموح' : 'محظور'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex justify-end border-t border-slate-100">
                <button
                  onClick={() => handleOpenEdit(b)}
                  className="px-3.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                >
                  <Edit className="w-3.5 h-3.5 text-blue-600" />
                  <span>تعديل الفرع</span>
                </button>
              </div>
            </div>
          );
        })}
        {branches.length === 0 && (
          <div className="col-span-full bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-500 text-xs shadow-xs">
            لا توجد فروع مسجلة حتى الآن.
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 dir-rtl font-sans">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3.5">
              <h3 className="text-base font-bold text-slate-900">
                {editingBranch ? 'تعديل بيانات الفرع' : 'إضافة فرع تجاري جديد'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs flex items-center gap-2.5 shadow-xs">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                <span className="font-medium">{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4 text-xs font-sans">
              <div>
                <label className="block text-slate-700 mb-1 font-semibold">معرف الفرع (Branch ID - بالإنجليزية دون مسافات)</label>
                <input
                  type="text"
                  required
                  disabled={Boolean(editingBranch)}
                  value={branchIdInput}
                  onChange={(e) => setBranchIdInput(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-slate-900 font-mono disabled:opacity-50 focus:outline-none focus:border-blue-600"
                  placeholder="auc"
                />
              </div>

              <div>
                <label className="block text-slate-700 mb-1 font-semibold">اسم الفرع بالعربية</label>
                <input
                  type="text"
                  required
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-slate-900 focus:outline-none focus:border-blue-600"
                  placeholder="التجمع الخامس AUC"
                />
              </div>

              <div>
                <label className="block text-slate-700 mb-1 font-semibold">كود الفرع المختصر</label>
                <input
                  type="text"
                  required
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-slate-900 font-mono uppercase focus:outline-none focus:border-blue-600"
                  placeholder="AUC"
                />
              </div>

              <div>
                <label className="block text-slate-700 mb-1 font-semibold">موقع المخزون التشغيلي (ديناميكياً من الكتالوج النشط)</label>
                <select
                  value={locationIdInput}
                  onChange={(e) => setLocationIdInput(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-slate-900 font-mono focus:outline-none focus:border-blue-600"
                  required
                >
                  {activeLocations.map(loc => (
                    <option key={loc.id} value={loc.id} className="bg-white text-slate-900">
                      {loc.name} ({loc.id})
                    </option>
                  ))}
                  {activeLocations.length === 0 && (
                    <option value="" className="bg-white text-slate-400">لا توجد مواقع مخزون متاحة في الكتالوج</option>
                  )}
                </select>
              </div>

              <div className="flex items-center justify-between bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-900 font-bold block">حالة الفرع</span>
                  <span className="text-slate-500 text-[11px]">تعطيل الفرع يحظر تسجيل دخول موظفيه فورياً.</span>
                </div>
                <input
                  type="checkbox"
                  checked={isActiveInput}
                  onChange={(e) => setIsActiveInput(e.target.checked)}
                  className="w-4 h-4 accent-blue-600 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-900 font-bold block">عرض أرصدة الفروع الأخرى (Cross-Branch View)</span>
                  <span className="text-slate-500 text-[11px]">السماح لموظفي هذا الفرع بالاطلاع على كميات الفروع الأخرى (للقراءة فقط).</span>
                </div>
                <input
                  type="checkbox"
                  checked={allowCrossViewInput}
                  onChange={(e) => setAllowCrossViewInput(e.target.checked)}
                  className="w-4 h-4 accent-blue-600 cursor-pointer"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-sm transition-colors"
                >
                  حفظ الفرع
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
