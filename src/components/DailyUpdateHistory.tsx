import React, { useState, useEffect } from 'react';
import { db } from '../services/firebaseClient';
import { collection, getDocs, query, orderBy, doc, getDoc } from 'firebase/firestore';
import { 
  FileSpreadsheet, Layers, ShieldAlert, CheckCircle2, 
  Search, Calendar, User, Hash, Clock, History, RefreshCw
} from 'lucide-react';

export default function DailyUpdateHistory() {
  const [updates, setUpdates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const globalSnap = await getDoc(doc(db, 'app_settings', 'global'));
      const activeVersionId = globalSnap.exists() ? globalSnap.data().activeCatalogVersionId : 'v_1790622936100_fd78fcc7';

      const updatesRef = collection(db, 'catalog_versions', activeVersionId, 'inventory_updates');
      const q = query(updatesRef, orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      const list: any[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() });
      });
      setUpdates(list);
    } catch (err) {
      console.error('Failed to fetch inventory update history:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <History className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-bold text-slate-900">سجل تحديثات المخزون اليومية (Updates History)</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            مراجعة كافة مراجعات الدلتا اليومية وتفاصيل الأصناف المعدلة في الكتالوج النشط.
          </p>
        </div>

        <button
          onClick={fetchHistory}
          disabled={loading}
          className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer shrink-0 shadow-2xs disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
          <span>تحديث السجل</span>
        </button>
      </div>

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center space-y-3 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 mx-auto">
            <RefreshCw className="w-5 h-5 animate-spin" />
          </div>
          <p className="text-slate-500 text-xs font-medium">جاري تحميل سجل المراجعات...</p>
        </div>
      ) : updates.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-500 text-xs shadow-xs">
          لا توجد تحديثات مخزون مسجلة حتى الآن.
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-mono font-semibold">
                <tr>
                  <th className="py-3 px-4">المراجعة (Revision)</th>
                  <th className="py-3 px-4">معرف التحديث (Update ID)</th>
                  <th className="py-3 px-4 font-sans">اسم الملف المصدر</th>
                  <th className="py-3 px-4">أصناف متغيرة</th>
                  <th className="py-3 px-4">أصناف جديدة</th>
                  <th className="py-3 px-4">أصناف مفقودة</th>
                  <th className="py-3 px-4 text-center">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                {updates.map(u => (
                  <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 text-blue-600 font-bold">Rev {u.targetRevision}</td>
                    <td className="py-3 px-4 text-slate-600 text-[11px]">{u.id}</td>
                    <td className="py-3 px-4 text-slate-900 font-sans truncate max-w-xs font-medium">{u.sourceFileName}</td>
                    <td className="py-3 px-4 text-amber-700 font-bold">{u.changedProductCount}</td>
                    <td className="py-3 px-4 text-emerald-700 font-bold">{u.newProductCount}</td>
                    <td className="py-3 px-4 text-slate-500">{u.missingProductCount}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                        u.status === 'published' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                        u.status === 'verified' ? 'bg-blue-50 text-blue-800 border border-blue-200' :
                        'bg-amber-50 text-amber-800 border border-amber-200'
                      }`}>
                        {u.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
