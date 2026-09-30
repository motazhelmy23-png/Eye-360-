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
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <Layers className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-bold text-slate-900">سجل إصدارات الكتالوج الأساسي (Catalog Versions)</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            مراجعة كافة إصدارات الكتالوج الأساسي المرفوعة والمعتمدة وتاريخ تفعيلها بالسحابة.
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
          <p className="text-slate-500 text-xs font-medium">جاري تحميل سجل إصدارات الكتالوج...</p>
        </div>
      ) : versions.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-500 text-xs shadow-xs">
          لا توجد إصدارات كتالوج مسجلة حتى الآن.
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-mono font-semibold">
                <tr>
                  <th className="py-3 px-4">معرف الإصدار (Version ID)</th>
                  <th className="py-3 px-4 text-center">الحالة</th>
                  <th className="py-3 px-4 font-sans">اسم الملف المصدر</th>
                  <th className="py-3 px-4">عدد الأصناف</th>
                  <th className="py-3 px-4">عدد الـ Chunks</th>
                  <th className="py-3 px-4">بصمة SHA-256</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                {versions.map(v => (
                  <tr key={v.versionId || v.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 text-blue-600 font-bold">{v.versionId || v.id}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        v.status === 'active' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                        v.status === 'verified' ? 'bg-blue-50 text-blue-800 border border-blue-200' :
                        'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}>
                        {v.status === 'active' ? 'ACTIVE (نشط)' : v.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-900 font-sans truncate max-w-xs font-medium">{v.sourceFileName || '---'}</td>
                    <td className="py-3 px-4 text-slate-900 font-bold">{v.productCount?.toLocaleString() || 0}</td>
                    <td className="py-3 px-4 text-slate-600">{v.chunkCount || 0} chunks</td>
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
