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
      <div className="bg-[#111823] border border-white/[0.08] rounded-xl p-16 text-center space-y-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mx-auto">
          <Store className="w-5 h-5 animate-pulse" />
        </div>
        <p className="text-slate-400 text-xs">جاري تحميل الفروع ومواقع الكتالوج النشط...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-[#111823] border border-white/[0.08] rounded-xl p-6 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <Store className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-bold text-white">إدارة الفروع والمواقع التشغيلية</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            ربط الفروع التجارية بمواقع المخزون المستخرجة ديناميكياً من الكتالوج النشط ({activeLocations.length} موقع متوفر).
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer shrink-0 shadow-sm"
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
              className={`bg-[#111823] border rounded-xl p-5 space-y-4 shadow-xl flex flex-col justify-between ${
                !isLocValid ? 'border-amber-500/40 bg-amber-500/[0.02]' : 'border-white/[0.08]'
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[11px] text-emerald-400 font-mono font-bold block">{b.branchId}</span>
                    <h3 className="text-white font-bold text-sm mt-0.5">{b.name}</h3>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-[11px] px-2 py-0.5 rounded font-mono font-semibold ${
                      b.isActive 
                        ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' 
                        : 'bg-red-500/10 text-red-300 border border-red-500/20'
                    }`}>
                      {b.isActive ? 'نشط' : 'معطل'}
                    </span>
                    {!isLocValid && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        NEEDS_REVIEW
                      </span>
                    )}
                  </div>
                </div>

                {!isLocValid && (
                  <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-300 text-[11px] flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                    <span>موقع المخزون غير موجود في الكتالوج النشط</span>
                  </div>
                )}

                <div className="space-y-1.5 text-xs font-mono text-slate-300 bg-[#0B1017] p-3 rounded-lg border border-white/[0.06] tabular-nums">
                  <div className="flex justify-between py-0.5 border-b border-white/[0.04]">
                    <span className="text-slate-500">كود الفرع:</span>
                    <span className="text-white font-bold">{b.code}</span>
                  </div>
                  <div className="flex justify-between py-0.5 border-b border-white/[0.04] truncate">
                    <span className="text-slate-500 shrink-0">موقع المخزون:</span>
                    <span className="text-emerald-400 font-semibold truncate mr-2" title={b.inventoryLocationId}>
                      {formatLocationDisplayName(b.inventoryLocationId)}
                    </span>
                  </div>
                  <div className="flex justify-between py-0.5 border-b border-white/[0.04]">
                    <span className="text-slate-500">الحسابات المرتبطة:</span>
                    <span className="text-white">{accCount} موظف</span>
                  </div>
                  <div className="flex justify-between py-0.5">
                    <span className="text-slate-500">رؤية فروع أخرى:</span>
                    <span className={b.allowCrossBranchStockView ? 'text-emerald-400' : 'text-slate-500'}>
                      {b.allowCrossBranchStockView ? 'مسموح' : 'محظور'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex justify-end border-t border-white/[0.04]">
                <button
                  onClick={() => handleOpenEdit(b)}
                  className="px-3 py-1.5 bg-[#131B26] hover:bg-[#1A2534] border border-white/[0.08] text-slate-200 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Edit className="w-3.5 h-3.5 text-emerald-400" />
                  <span>تعديل الفرع</span>
                </button>
              </div>
            </div>
          );
        })}
        {branches.length === 0 && (
          <div className="col-span-full bg-[#111823] border border-white/[0.08] rounded-xl p-12 text-center text-slate-500 text-xs">
            لا توجد فروع مسجلة حتى الآن.
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#111823] border border-white/[0.1] rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-5 dir-rtl font-sans">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <h3 className="text-base font-bold text-white">
                {editingBranch ? 'تعديل بيانات الفرع' : 'إضافة فرع تجاري جديد'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/[0.04]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4 text-xs font-sans">
              <div>
                <label className="block text-slate-300 mb-1 font-medium">معرف الفرع (Branch ID - بالإنجليزية دون مسافات)</label>
                <input
                  type="text"
                  required
                  disabled={Boolean(editingBranch)}
                  value={branchIdInput}
                  onChange={(e) => setBranchIdInput(e.target.value)}
                  className="w-full bg-[#0B1017] border border-white/[0.1] rounded-lg px-3.5 py-2 text-white font-mono disabled:opacity-40 focus:outline-none focus:border-emerald-500"
                  placeholder="auc"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-medium">اسم الفرع بالعربية</label>
                <input
                  type="text"
                  required
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="w-full bg-[#0B1017] border border-white/[0.1] rounded-lg px-3.5 py-2 text-white focus:outline-none focus:border-emerald-500"
                  placeholder="التجمع الخامس AUC"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-medium">كود الفرع المختصر</label>
                <input
                  type="text"
                  required
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value)}
                  className="w-full bg-[#0B1017] border border-white/[0.1] rounded-lg px-3.5 py-2 text-white font-mono uppercase focus:outline-none focus:border-emerald-500"
                  placeholder="AUC"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-medium">موقع المخزون التشغيلي (ديناميكياً من الكتالوج النشط)</label>
                <select
                  value={locationIdInput}
                  onChange={(e) => setLocationIdInput(e.target.value)}
                  className="w-full bg-[#0B1017] border border-white/[0.1] rounded-lg px-3.5 py-2 text-white font-mono focus:outline-none focus:border-emerald-500"
                  required
                >
                  {activeLocations.map(loc => (
                    <option key={loc.id} value={loc.id} className="bg-[#111823] text-white">
                      {loc.name} ({loc.id})
                    </option>
                  ))}
                  {activeLocations.length === 0 && (
                    <option value="" className="bg-[#111823] text-slate-400">لا توجد مواقع مخزون متاحة في الكتالوج</option>
                  )}
                </select>
              </div>

              <div className="flex items-center justify-between bg-[#0B1017] p-3 rounded-lg border border-white/[0.06]">
                <div>
                  <span className="text-white font-medium block">حالة الفرع</span>
                  <span className="text-slate-500 text-[11px]">تعطيل الفرع يحظر تسجيل دخول موظفيه فورياً.</span>
                </div>
                <input
                  type="checkbox"
                  checked={isActiveInput}
                  onChange={(e) => setIsActiveInput(e.target.checked)}
                  className="w-4 h-4 accent-emerald-500 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between bg-[#0B1017] p-3 rounded-lg border border-white/[0.06]">
                <div>
                  <span className="text-white font-medium block">عرض أرصدة الفروع الأخرى (Cross-Branch View)</span>
                  <span className="text-slate-500 text-[11px]">السماح لموظفي هذا الفرع بالاطلاع على كميات الفروع الأخرى (للقراءة فقط).</span>
                </div>
                <input
                  type="checkbox"
                  checked={allowCrossViewInput}
                  onChange={(e) => setAllowCrossViewInput(e.target.checked)}
                  className="w-4 h-4 accent-emerald-500 cursor-pointer"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-white/[0.06] hover:bg-white/[0.1] text-slate-300 rounded-lg text-xs font-medium cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold cursor-pointer shadow-sm"
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
