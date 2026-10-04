import React, { useState, useEffect } from 'react';
import { SalesAccountProfile, getAllSalesAccounts, saveSalesAccount, deleteSalesAccount } from '../services/accountService';
import { BranchProfile, getAllBranches } from '../services/branchService';
import { 
  Users, UserPlus, Shield, AlertTriangle, 
  CheckCircle2, X, Store, Lock, Edit, UserCheck, Trash2
} from 'lucide-react';

export default function AccountsManagementView() {
  const [accounts, setAccounts] = useState<SalesAccountProfile[]>([]);
  const [branches, setBranches] = useState<BranchProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<SalesAccountProfile | null>(null);
  const [accountToDelete, setAccountToDelete] = useState<SalesAccountProfile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

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

  const showToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 3500);
  };

  const handleConfirmDelete = async () => {
    if (!accountToDelete) return;
    setIsDeleting(true);
    try {
      await deleteSalesAccount(accountToDelete.uid, accountToDelete.name);
      setAccountToDelete(null);
      showToast(`تم حذف حساب الموظف (${accountToDelete.name}) وتوثيق العملية في سجل النشاط بنجاح`);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message || 'فشل حذف الحساب.');
    } finally {
      setIsDeleting(false);
    }
  };

  const getBranchName = (branchId: string) => {
    const b = branches.find(item => item.branchId === branchId);
    return b ? b.name : branchId;
  };

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center space-y-3 shadow-xs">
        <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 mx-auto">
          <Users className="w-5 h-5 animate-pulse" />
        </div>
        <p className="text-slate-500 text-xs font-medium">جاري تحميل حسابات المبيعات والصلاحيات...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed bottom-6 left-6 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 text-xs border border-slate-700 font-sans">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Top Header Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <Users className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-bold text-slate-900">الحسابات والصلاحيات التشغيلية</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            إدارة موظفي المبيعات وربط حساباتهم بالفروع التشغيلية المعتمدة ({accounts.length} حساب مسجل).
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer shrink-0 shadow-sm"
        >
          <UserPlus className="w-4 h-4" />
          <span>إضافة حساب مبيعات</span>
        </button>
      </div>

      {/* Info Notice Strip */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl text-xs text-blue-900 flex items-start gap-3 shadow-xs">
        <Lock className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <div className="leading-relaxed text-blue-800">
          <strong className="font-bold text-blue-950">آلية إضافة موظف جديد:</strong> يتم إنشاء البريد وكلمة المرور في لوحة Firebase Authentication، ثم يتم إدخال الـ UID الخاص بالحساب هنا لربطه بالفرع وتفعيل صلاحيات المبيعات.
        </div>
      </div>

      {/* Accounts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {accounts.map(acc => (
          <div key={acc.uid} className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-xs flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[11px] text-slate-500 font-mono block truncate max-w-[180px]">
                    UID: {acc.uid.substring(0, 14)}...
                  </span>
                  <h3 className="text-slate-900 font-bold text-sm mt-0.5">{acc.name}</h3>
                </div>
                <span className={`text-[11px] px-2 py-0.5 rounded-lg font-mono font-semibold ${
                  acc.isActive 
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
                    : 'bg-red-50 text-red-800 border border-red-200'
                }`}>
                  {acc.isActive ? 'نشط' : 'معطل'}
                </span>
              </div>

              <div className="space-y-1.5 text-xs font-mono text-slate-700 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div className="flex justify-between py-1 border-b border-slate-200">
                  <span className="text-slate-500 font-sans">الصلاحية:</span>
                  <span className="text-blue-600 font-bold uppercase">{acc.role}</span>
                </div>
                <div className="flex justify-between py-1 truncate">
                  <span className="text-slate-500 font-sans shrink-0">الفرع المخصص:</span>
                  <span className="text-slate-900 font-bold truncate mr-2 font-sans">{getBranchName(acc.branchId)}</span>
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-between items-center border-t border-slate-100">
              <button
                onClick={() => setAccountToDelete(acc)}
                className="p-1.5 hover:bg-rose-50 border border-transparent hover:border-rose-200 text-slate-400 hover:text-rose-600 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                title="حذف الحساب"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              <button
                onClick={() => handleOpenEdit(acc)}
                className="px-3.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
              >
                <Edit className="w-3.5 h-3.5 text-blue-600" />
                <span>تعديل الحساب</span>
              </button>
            </div>
          </div>
        ))}
        {accounts.length === 0 && (
          <div className="col-span-full bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-500 text-xs shadow-xs">
            لا توجد حسابات مبيعات مسجلة حتى الآن.
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {accountToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 text-right dir-rtl font-sans">
            <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center">
              <Trash2 className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">تأكيد حذف حساب الموظف</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              هل أنت متأكد من رغبتك في حذف حساب <strong className="text-slate-900 font-bold">{accountToDelete.name}</strong>؟
              <br />
              <span className="text-[11px] text-slate-500 mt-1 block">
                سيتم إزالة صلاحيات الحساب فوراً وتوثيق هذه العملية الحساسة تلقائياً في سجل نشاط الإدارة (Audit Logs).
              </span>
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAccountToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-xs flex items-center gap-1.5"
              >
                {isDeleting ? 'جاري الحذف...' : 'نعم، حذف الحساب'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Form */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 dir-rtl font-sans">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3.5">
              <h3 className="text-base font-bold text-slate-900">
                {editingAccount ? 'تعديل حساب موظف المبيعات' : 'إضافة حساب مبيعات جديد'}
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
                <label className="block text-slate-700 mb-1 font-semibold">معرف المستخدم (Firebase Auth UID)</label>
                <input
                  type="text"
                  required
                  disabled={Boolean(editingAccount)}
                  value={uidInput}
                  onChange={(e) => setUidInput(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-slate-900 font-mono disabled:opacity-50 text-xs focus:outline-none focus:border-blue-600"
                  placeholder="انسخ الـ UID من لوحة تحكم Firebase"
                />
              </div>

              <div>
                <label className="block text-slate-700 mb-1 font-semibold">اسم الموظف</label>
                <input
                  type="text"
                  required
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-slate-900 focus:outline-none focus:border-blue-600"
                  placeholder="محمد أحمد"
                />
              </div>

              <div>
                <label className="block text-slate-700 mb-1 font-semibold">تعيين الفرع</label>
                <select
                  value={branchIdInput}
                  onChange={(e) => setBranchIdInput(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-slate-900 focus:outline-none focus:border-blue-600"
                >
                  {branches.map(b => (
                    <option key={b.branchId} value={b.branchId} className="bg-white text-slate-900">
                      {b.name} ({b.branchId})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-900 font-bold block">حالة الحساب</span>
                  <span className="text-slate-500 text-[11px]">تعطيل الحساب يمنع الموظف من تسجيل الدخول للنظام.</span>
                </div>
                <input
                  type="checkbox"
                  checked={isActiveInput}
                  onChange={(e) => setIsActiveInput(e.target.checked)}
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
