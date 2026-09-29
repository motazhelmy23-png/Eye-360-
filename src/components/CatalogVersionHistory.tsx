import React, { useState, useEffect } from 'react';
import { getCatalogVersionsHistory } from '../services/dataIntegrityService';
import { FileText, CheckCircle2, Calendar, User, Shield, Layers, RefreshCw } from 'lucide-react';

export default function CatalogVersionHistory() {
  const [versions, setVersions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const list = await getCatalogVersionsHistory();
      setVersions(list);
    } catch (err) {
      console.error('Failed to fetch catalog versions history:', err);
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
            <Layers className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-bold text-white">سجل إصدارات الكتالوج الأساسي (Catalog Versions)</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            مراجعة كافة إصدارات الكتالوج الأساسي المرفوعة والمعتمدة وتاريخ تفعيلها بالسحابة.
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
          <p className="text-slate-400 text-xs">جاري تحميل سجل إصدارات الكتالوج...</p>
        </div>
      ) : versions.length === 0 ? (
        <div className="bg-[#111823] border border-white/[0.08] rounded-xl p-12 text-center text-slate-500 text-xs">
          لا توجد إصدارات كتالوج مسجلة حتى الآن.
        </div>
      ) : (
        <div className="bg-[#111823] border border-white/[0.08] rounded-xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-[#0B1017] text-slate-400 border-b border-white/[0.08] font-mono">
                <tr>
                  <th className="py-3 px-4 font-medium">معرف الإصدار (Version ID)</th>
                  <th className="py-3 px-4 font-medium text-center">الحالة</th>
                  <th className="py-3 px-4 font-medium font-sans">اسم الملف المصدر</th>
                  <th className="py-3 px-4 font-medium">عدد الأصناف</th>
                  <th className="py-3 px-4 font-medium">عدد الـ Chunks</th>
                  <th className="py-3 px-4 font-medium">بصمة SHA-256</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04] font-mono tabular-nums">
                {versions.map(v => (
                  <tr key={v.versionId || v.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-4 text-emerald-400 font-bold">{v.versionId || v.id}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        v.status === 'active' ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' :
                        v.status === 'verified' ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30' :
                        'bg-white/[0.06] text-slate-400'
                      }`}>
                        {v.status === 'active' ? 'ACTIVE (نشط)' : v.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-white font-sans truncate max-w-xs">{v.sourceFileName || '---'}</td>
                    <td className="py-3 px-4 text-white font-semibold">{v.productCount?.toLocaleString() || 0}</td>
                    <td className="py-3 px-4 text-slate-400">{v.chunkCount || 0} chunks</td>
                    <td className="py-3 px-4 text-slate-500 text-[11px] truncate max-w-[160px]">{v.checksum || '---'}</td>
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
