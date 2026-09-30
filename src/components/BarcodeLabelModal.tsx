import React, { useState } from 'react';
import { NormalizedProduct } from '../types/inventory';
import { BarcodeLabelItem, LabelPreset, LabelSettings } from './BarcodeLabelItem';
import { 
  executePrintLabels, 
  buildPrintableHtmlDocument 
} from '../services/barcodePrintService';
import { 
  Printer, X, Tag, Sliders, Layers, 
  Eye, Copy, ArrowRight, ExternalLink, Download, Check, Loader2
} from 'lucide-react';

interface BarcodeLabelModalProps {
  products: NormalizedProduct[];
  isOpen: boolean;
  onClose: () => void;
}

export const BarcodeLabelModal: React.FC<BarcodeLabelModalProps> = ({
  products,
  isOpen,
  onClose,
}) => {
  const [preset, setPreset] = useState<LabelPreset>('thermal_small');
  const [copies, setCopies] = useState<number>(1);
  const [showPrice, setShowPrice] = useState<boolean>(true);
  const [showName, setShowName] = useState<boolean>(true);
  const [showBrandModel, setShowBrandModel] = useState<boolean>(true);
  const [showHeader, setShowHeader] = useState<boolean>(true);
  const [showCategory, setShowCategory] = useState<boolean>(false);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [printSuccess, setPrintSuccess] = useState<boolean>(false);

  if (!isOpen || products.length === 0) return null;

  const settings: LabelSettings = {
    preset,
    copies: Math.max(1, copies),
    showPrice,
    showName,
    showBrandModel,
    showHeader,
    showCategory,
  };

  // Build the list of all label items to print (multiplied by copies)
  const itemsToPrint: NormalizedProduct[] = [];
  products.forEach(p => {
    for (let i = 0; i < settings.copies; i++) {
      itemsToPrint.push(p);
    }
  });

  const handlePrint = async () => {
    setIsPrinting(true);
    setPrintSuccess(false);
    try {
      await executePrintLabels(products, settings);
      setPrintSuccess(true);
      setTimeout(() => setPrintSuccess(false), 3000);
    } catch (err) {
      console.error('Print trigger error:', err);
      // Fallback
      window.print();
    } finally {
      setIsPrinting(false);
    }
  };

  const handleOpenPrintWindow = () => {
    try {
      const html = buildPrintableHtmlDocument(products, settings);
      const printBlob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const blobUrl = URL.createObjectURL(printBlob);
      const newWin = window.open(blobUrl, '_blank');
      if (newWin) {
        newWin.focus();
        setTimeout(() => {
          try {
            newWin.print();
          } catch {
            // ignore
          }
        }, 500);
      }
    } catch (err) {
      console.warn('Failed to open new print window, calling window.print directly', err);
      window.print();
    }
  };

  const handleDownloadHtml = () => {
    try {
      const html = buildPrintableHtmlDocument(products, settings);
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `EYE360_Barcode_Labels_${preset}_${Date.now()}.html`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 500);
    } catch (err) {
      console.error('Download labels failed:', err);
    }
  };

  const presetLabels: Record<LabelPreset, { name: string; desc: string; size: string }> = {
    thermal_small: {
      name: 'ملصق حراري صغير (نظارات وإطارات)',
      desc: 'مناسب للبكرات الحرارية 38×25 مم لطابعات Zebra / Xprinter',
      size: '38 × 25 مم',
    },
    shelf_standard: {
      name: 'ملصق رفوف وأسعار (Shelf Talker)',
      desc: 'مناسب لبطاقات الأسعار والرفوف 50×30 مم بخط وسعر واضح',
      size: '50 × 30 مم',
    },
    detailed_large: {
      name: 'ملصق كبير تفصيلي',
      desc: 'مناسب للصناديق والكراتين بمقاس 70×40 مم مع كافة التفاصيل',
      size: '70 × 40 مم',
    },
    a4_grid: {
      name: 'ورق ملصقات A4 مقسم (24 ملصق بالصفحة)',
      desc: 'مناسب لورق الملصقات القياسي A4 لطابعات الليزر/الحبر (3 أعمدة × 8 صفوف)',
      size: 'A4 شبكي',
    },
  };

  return (
    <>
      {/* 
        ====================================================================
        SCREEN MODAL VIEW
        ====================================================================
      */}
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-5 print:hidden">
        <div className="bg-white border border-slate-200 rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl dir-rtl font-sans overflow-hidden">
          {/* Header */}
          <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
                <Printer className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  طباعة وتوليد ملصقات الباركود والأسعار
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  تجهيز ومعاينة طباعة الملصقات لـ ({products.length}) صنف — إجمالي الملصقات: ({itemsToPrint.length}) ملصق
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Modal Body: Settings on right, Live Preview on left */}
          <div className="flex-1 overflow-y-auto p-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Settings Column (5 cols) */}
            <div className="lg:col-span-5 space-y-4">
              {/* Preset Selector */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2.5">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-2">
                  <Tag className="w-4 h-4 text-blue-600" />
                  <span>نوع ومقاس الملصق:</span>
                </label>
                <div className="space-y-2">
                  {(Object.keys(presetLabels) as LabelPreset[]).map((key) => {
                    const isSelected = preset === key;
                    const pInfo = presetLabels[key];
                    return (
                      <div
                        key={key}
                        onClick={() => setPreset(key)}
                        className={`p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-blue-50/80 border-blue-500 text-slate-900 shadow-2xs'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100/60'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold">{pInfo.name}</span>
                          <span className="font-mono text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-600 font-semibold">
                            {pInfo.size}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 leading-tight">{pInfo.desc}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Number of copies */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                <label className="text-xs font-bold text-slate-800 flex items-center justify-between">
                  <span>عدد النسخ لكل صنف:</span>
                  <span className="font-mono text-blue-600 font-bold">{copies} نسخ</span>
                </label>
                <div className="flex items-center gap-2">
                  {[1, 2, 5, 10].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setCopies(num)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-bold transition-colors cursor-pointer ${
                        copies === num
                          ? 'bg-blue-600 text-white'
                          : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {num}
                    </button>
                  ))}
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={copies}
                    onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-16 bg-white border border-slate-300 rounded-lg py-1.5 px-2 text-center text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              {/* Fields Display Toggles */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2.5 text-xs">
                <span className="font-bold text-slate-800 block mb-1">عناصر الملصق:</span>

                <label className="flex items-center justify-between cursor-pointer py-1">
                  <span className="text-slate-700">إظهار سعر البيع (ج.م)</span>
                  <input
                    type="checkbox"
                    checked={showPrice}
                    onChange={(e) => setShowPrice(e.target.checked)}
                    className="w-4 h-4 accent-blue-600 cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer py-1">
                  <span className="text-slate-700">إظهار اسم الصنف</span>
                  <input
                    type="checkbox"
                    checked={showName}
                    onChange={(e) => setShowName(e.target.checked)}
                    className="w-4 h-4 accent-blue-600 cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer py-1">
                  <span className="text-slate-700">إظهار الماركة والموديل</span>
                  <input
                    type="checkbox"
                    checked={showBrandModel}
                    onChange={(e) => setShowBrandModel(e.target.checked)}
                    className="w-4 h-4 accent-blue-600 cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer py-1">
                  <span className="text-slate-700">إظهار ترويسة EYE 360</span>
                  <input
                    type="checkbox"
                    checked={showHeader}
                    onChange={(e) => setShowHeader(e.target.checked)}
                    className="w-4 h-4 accent-blue-600 cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer py-1">
                  <span className="text-slate-700">إظهار التصنيف (Category)</span>
                  <input
                    type="checkbox"
                    checked={showCategory}
                    onChange={(e) => setShowCategory(e.target.checked)}
                    className="w-4 h-4 accent-blue-600 cursor-pointer"
                  />
                </label>
              </div>
            </div>

            {/* Live Preview Column (7 cols) */}
            <div className="lg:col-span-7 bg-slate-100/80 border border-slate-200 rounded-xl p-5 flex flex-col justify-between overflow-hidden">
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-2">
                    <Eye className="w-4 h-4 text-blue-600" />
                    <span>المعاينة المباشرة للملصق</span>
                  </span>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {presetLabels[preset].size}
                  </span>
                </div>

                {/* Scaled Preview Box */}
                <div className="p-6 bg-white/70 border border-dashed border-slate-300 rounded-xl flex items-center justify-center min-h-[160px] overflow-auto">
                  <div className="transform scale-110 sm:scale-125 transition-transform origin-center">
                    <BarcodeLabelItem
                      product={products[0]}
                      settings={settings}
                    />
                  </div>
                </div>

                {/* Selected Products summary */}
                <div className="space-y-1.5 pt-1">
                  <div className="text-[11px] font-bold text-slate-700 flex justify-between">
                    <span>قائمة الأصناف المختارة للطباعة ({products.length}):</span>
                    <span className="text-blue-600 font-mono font-bold">
                      {itemsToPrint.length} ملصق
                    </span>
                  </div>
                  <div className="max-h-36 overflow-y-auto bg-white rounded-lg border border-slate-200 divide-y divide-slate-100 text-xs font-mono">
                    {products.map((p) => (
                      <div key={p.itemCode} className="p-2 flex items-center justify-between">
                        <div>
                          <span className="font-bold text-blue-600 ml-2">{p.itemCode}</span>
                          <span className="text-slate-800 font-sans text-[11px]">{p.name || '---'}</span>
                        </div>
                        <span className="text-slate-500 font-semibold">{copies} ×</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Alternate print actions info */}
              <div className="space-y-2 mt-4">
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Printer className="w-4 h-4 text-blue-600 shrink-0" />
                    <span className="leading-tight">
                      الطباعة مهيأة تلقائياً بدون هوامش حسب مقاس الطابعة المختارة.
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={handleOpenPrintWindow}
                      title="فتح صفحة الطباعة في نافذة جديدة"
                      className="px-2 py-1 bg-white hover:bg-blue-100 border border-blue-200 text-blue-700 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>نافذة مستقلة</span>
                    </button>
                    <button
                      onClick={handleDownloadHtml}
                      title="تحميل كملف HTML للطباعة في أي وقت"
                      className="px-2 py-1 bg-white hover:bg-blue-100 border border-blue-200 text-blue-700 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <Download className="w-3 h-3" />
                      <span>حفظ</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="p-4 border-t border-slate-200 bg-slate-50/70 flex items-center justify-between">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer transition-colors shadow-2xs"
            >
              إلغاء
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={handleOpenPrintWindow}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5 text-slate-600" />
                <span>طباعة عبر نافذة جديدة</span>
              </button>

              <button
                onClick={handlePrint}
                disabled={isPrinting}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-sm active:scale-98"
              >
                {isPrinting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>جاري تجهيز الطباعة...</span>
                  </>
                ) : printSuccess ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-300" />
                    <span>تم إرسال أمر الطباعة</span>
                  </>
                ) : (
                  <>
                    <Printer className="w-4 h-4" />
                    <span>طباعة الآن ({itemsToPrint.length} ملصق)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
