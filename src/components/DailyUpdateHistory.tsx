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
      <div className="bg-[#111823] border border-white/[0.08] rounded-xl p-6 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <History className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-bold text-white">سجل تحديثات المخزون اليومية (Updates History)</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            مراجعة كافة مراجعات الدلتا اليومية وتفاصيل الأصناف المعدلة في الكتالوج النشط.
          </p>
        </div>

        <button
          onClick={fetchHistory}
          disabled={loading}
          className="px-3 py-2 bg-[#131B26] hover:bg-[#1A2534] border border-white/[0.08] text-slate-200 rounded-lg text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer shrink-0 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
          <span>تحديث السجل</span>
        </button>
      </div>

      {loading ? (
        <div className="bg-[#111823] border border-white/[0.08] rounded-xl p-16 text-center space-y-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mx-auto">
            <RefreshCw className="w-5 h-5 animate-spin" />
          </div>
          <p className="text-slate-400 text-xs">جاري تحميل سجل المراجعات...</p>
        </div>
      ) : updates.length === 0 ? (
        <div className="bg-[#111823] border border-white/[0.08] rounded-xl p-12 text-center text-slate-500 text-xs">
          لا توجد تحديثات مخزون مسجلة حتى الآن.
        </div>
      ) : (
        <div className="bg-[#111823] border border-white/[0.08] rounded-xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-[#0B1017] text-slate-400 border-b border-white/[0.08] font-mono">
                <tr>
                  <th className="py-3 px-4 font-medium">المراجعة (Revision)</th>
                  <th className="py-3 px-4 font-medium">معرف التحديث (Update ID)</th>
                  <th className="py-3 px-4 font-medium font-sans">اسم الملف المصدر</th>
                  <th className="py-3 px-4 font-medium">أصناف متغيرة</th>
                  <th className="py-3 px-4 font-medium">أصناف جديدة</th>
                  <th className="py-3 px-4 font-medium">أصناف مفقودة</th>
                  <th className="py-3 px-4 font-medium text-center">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04] font-mono tabular-nums">
                {updates.map(u => (
                  <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-4 text-emerald-400 font-bold">Rev {u.targetRevision}</td>
                    <td className="py-3 px-4 text-slate-400 text-[11px]">{u.id}</td>
                    <td className="py-3 px-4 text-white font-sans truncate max-w-xs">{u.sourceFileName}</td>
                    <td className="py-3 px-4 text-amber-400 font-semibold">{u.changedProductCount}</td>
                    <td className="py-3 px-4 text-emerald-400 font-semibold">{u.newProductCount}</td>
                    <td className="py-3 px-4 text-slate-500">{u.missingProductCount}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                        u.status === 'published' ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' :
                        u.status === 'verified' ? 'bg-blue-500/10 text-blue-300 border border-blue-500/20' :
                        'bg-amber-500/10 text-amber-300 border border-amber-500/20'
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
