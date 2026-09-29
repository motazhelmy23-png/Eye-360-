import React, { useState, useEffect } from 'react';
import { SalesAccountProfile, getAllSalesAccounts, saveSalesAccount } from '../services/accountService';
import { BranchProfile, getAllBranches } from '../services/branchService';
import { 
  Users, UserPlus, Shield, AlertTriangle, 
  CheckCircle2, X, Store, Lock, Edit, UserCheck
} from 'lucide-react';

export default function AccountsManagementView() {
  const [accounts, setAccounts] = useState<SalesAccountProfile[]>([]);
  const [branches, setBranches] = useState<BranchProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<SalesAccountProfile | null>(null);

  // Form state
  const [uidInput, setUidInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [branchIdInput, setBranchIdInput] = useState('');
  const [isActiveInput, setIsActiveInput] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const aList = await getAllSalesAccounts();
      const bList = await getAllBranches();
      setAccounts(aList);
      setBranches(bList);
      if (bList.length > 0 && !branchIdInput) {
        setBranchIdInput(bList[0].branchId);
      }
    } catch (err) {
      console.error('Failed to load accounts:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setEditingAccount(null);
    setUidInput('');
    setNameInput('');
    if (branches.length > 0) setBranchIdInput(branches[0].branchId);
    setIsActiveInput(true);
    setErrorMsg('');
    setShowModal(true);
  };

  const handleOpenEdit = (acc: SalesAccountProfile) => {
    setEditingAccount(acc);
    setUidInput(acc.uid);
    setNameInput(acc.name);
    setBranchIdInput(acc.branchId);
    setIsActiveInput(acc.isActive);
    setErrorMsg('');
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!uidInput.trim() || !nameInput.trim() || !branchIdInput) {
      setErrorMsg('جميع الحقول مطلوبة.');
      return;
    }

    try {
      await saveSalesAccount({
        uid: uidInput.trim(),
        role: 'sales',
        name: nameInput.trim(),
        branchId: branchIdInput,
        isActive: isActiveInput,
      });

      setShowModal(false);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message || 'فشل حفظ حساب موظف المبيعات.');
    }
  };

  const getBranchName = (branchId: string) => {
    const b = branches.find(item => item.branchId === branchId);
    return b ? b.name : branchId;
  };

  if (loading) {
    return (
      <div className="bg-[#111823] border border-white/[0.08] rounded-xl p-16 text-center space-y-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mx-auto">
          <Users className="w-5 h-5 animate-pulse" />
        </div>
        <p className="text-slate-400 text-xs">جاري تحميل حسابات المبيعات والصلاحيات...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-[#111823] border border-white/[0.08] rounded-xl p-6 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <Users className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-bold text-white">الحسابات والصلاحيات التشغيلية</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            إدارة موظفي المبيعات وربط حساباتهم بالفروع التشغيلية المعتمدة ({accounts.length} حساب مسجل).
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer shrink-0 shadow-sm"
        >
          <UserPlus className="w-4 h-4" />
          <span>إضافة حساب مبيعات</span>
        </button>
      </div>

      {/* Info Notice Strip */}
      <div className="p-3.5 bg-[#111823] border border-white/[0.08] rounded-xl text-xs text-slate-300 flex items-start gap-3">
        <Lock className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
        <div className="leading-relaxed text-slate-400">
          <strong className="text-slate-200">آلية إضافة موظف جديد:</strong> يتم إنشاء البريد وكلمة المرور في لوحة Firebase Authentication، ثم يتم إدخال الـ UID الخاص بالحساب هنا لربطه بالفرع وتفعيل صلاحيات المبيعات.
        </div>
      </div>

      {/* Accounts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {accounts.map(acc => (
          <div key={acc.uid} className="bg-[#111823] border border-white/[0.08] rounded-xl p-5 space-y-4 shadow-xl flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[11px] text-slate-500 font-mono block truncate max-w-[180px]">
                    UID: {acc.uid.substring(0, 14)}...
                  </span>
                  <h3 className="text-white font-bold text-sm mt-0.5">{acc.name}</h3>
                </div>
                <span className={`text-[11px] px-2 py-0.5 rounded font-mono font-semibold ${
                  acc.isActive 
                    ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' 
                    : 'bg-red-500/10 text-red-300 border border-red-500/20'
                }`}>
                  {acc.isActive ? 'نشط' : 'معطل'}
                </span>
              </div>

              <div className="space-y-1.5 text-xs font-mono text-slate-300 bg-[#0B1017] p-3 rounded-lg border border-white/[0.06]">
                <div className="flex justify-between py-0.5 border-b border-white/[0.04]">
                  <span className="text-slate-500">الصلاحية:</span>
                  <span className="text-emerald-400 font-semibold uppercase">{acc.role}</span>
                </div>
                <div className="flex justify-between py-0.5 truncate">
                  <span className="text-slate-500 shrink-0">الفرع المخصص:</span>
                  <span className="text-white font-semibold truncate mr-2">{getBranchName(acc.branchId)}</span>
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end border-t border-white/[0.04]">
              <button
                onClick={() => handleOpenEdit(acc)}
                className="px-3 py-1.5 bg-[#131B26] hover:bg-[#1A2534] border border-white/[0.08] text-slate-200 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Edit className="w-3.5 h-3.5 text-emerald-400" />
                <span>تعديل الحساب</span>
              </button>
            </div>
          </div>
        ))}
        {accounts.length === 0 && (
          <div className="col-span-full bg-[#111823] border border-white/[0.08] rounded-xl p-12 text-center text-slate-500 text-xs">
            لا توجد حسابات مبيعات مسجلة حتى الآن.
          </div>
        )}
      </div>

      {/* Modal Form */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#111823] border border-white/[0.1] rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-5 dir-rtl font-sans">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <h3 className="text-base font-bold text-white">
                {editingAccount ? 'تعديل حساب موظف المبيعات' : 'إضافة حساب مبيعات جديد'}
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
                <label className="block text-slate-300 mb-1 font-medium">معرف المستخدم (Firebase Auth UID)</label>
                <input
                  type="text"
                  required
                  disabled={Boolean(editingAccount)}
                  value={uidInput}
                  onChange={(e) => setUidInput(e.target.value)}
                  className="w-full bg-[#0B1017] border border-white/[0.1] rounded-lg px-3.5 py-2 text-white font-mono disabled:opacity-40 text-xs focus:outline-none focus:border-emerald-500"
                  placeholder="انسخ الـ UID من لوحة تحكم Firebase"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-medium">اسم الموظف</label>
                <input
                  type="text"
                  required
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="w-full bg-[#0B1017] border border-white/[0.1] rounded-lg px-3.5 py-2 text-white focus:outline-none focus:border-emerald-500"
                  placeholder="محمد أحمد"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-medium">تعيين الفرع</label>
                <select
                  value={branchIdInput}
                  onChange={(e) => setBranchIdInput(e.target.value)}
                  className="w-full bg-[#0B1017] border border-white/[0.1] rounded-lg px-3.5 py-2 text-white focus:outline-none focus:border-emerald-500"
                >
                  {branches.map(b => (
                    <option key={b.branchId} value={b.branchId} className="bg-[#111823] text-white">
                      {b.name} ({b.branchId})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between bg-[#0B1017] p-3 rounded-lg border border-white/[0.06]">
                <div>
                  <span className="text-white font-medium block">حالة الحساب</span>
                  <span className="text-slate-500 text-[11px]">تعطيل الحساب يمنع الموظف من تسجيل الدخول للنظام.</span>
                </div>
                <input
                  type="checkbox"
                  checked={isActiveInput}
                  onChange={(e) => setIsActiveInput(e.target.checked)}
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
                  حفظ الحساب
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
