import React, { useState, useEffect } from 'react';
import { 
  getAppSettings, 
  saveAppSettings, 
  resetAppSettings, 
  playScanSound, 
  AppSettings 
} from '../services/appSettingsService';
import { getLocalIndexedDbState, LocalIndexedDbState, openCatalogDB, searchLocalProducts } from '../services/indexedDbService';
import { quickCloudHealthCheck, CloudHealthResult } from '../services/dataIntegrityService';
import { UserProfile } from '../services/authService';
import { 
  Settings, Sliders, Printer, HardDrive, Cloud, Store, 
  Users, RefreshCw, CheckCircle2, AlertTriangle, Download, 
  Trash2, Volume2, Globe, Shield, Tag, Eye, ArrowRight,
  Sparkles, ShoppingBag, Layers, Lock, Cpu, Server, Save,
  Scan, Bell, Clock, Database, Radio, Wifi, Smartphone, FileText,
  X, HelpCircle, Check
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface UnifiedSettingsViewProps {
  currentUser?: UserProfile | null;
  diagnostics?: any;
  onNavigateTab?: (tabId: string) => void;
}

export default function UnifiedSettingsView({
  currentUser,
  diagnostics,
  onNavigateTab,
}: UnifiedSettingsViewProps) {
  const [settings, setSettings] = useState<AppSettings>(getAppSettings());
  const [activeSection, setActiveSection] = useState<
    'general' | 'printing' | 'scanner' | 'branches' | 'security' | 'sync' | 'marketplaces' | 'storage' | 'cloud' | 'maintenance'
  >('general');

  const [localDbState, setLocalDbState] = useState<LocalIndexedDbState | null>(null);
  const [cloudHealth, setCloudHealth] = useState<CloudHealthResult | null>(null);
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);

  // In-app Modal States (Zero window.confirm / window.alert)
  const [showResetConfirmModal, setShowResetConfirmModal] = useState(false);
  const [showClearCacheConfirmModal, setShowClearCacheConfirmModal] = useState(false);

  useEffect(() => {
    loadDiagnosticsData();
  }, []);

  const loadDiagnosticsData = async () => {
    setLoadingHealth(true);
    try {
      const dbState = await getLocalIndexedDbState();
      setLocalDbState(dbState);
      const health = await quickCloudHealthCheck();
      setCloudHealth(health);
      showSuccessFeedback('تم تحديث فحص النظام والذاكرة بنجاح');
    } catch (err) {
      console.error('Failed to load diagnostics data:', err);
    } finally {
      setLoadingHealth(false);
    }
  };

  const showSuccessFeedback = (msg: string) => {
    setSaveToast(msg);
    setTimeout(() => setSaveToast(null), 3000);
  };

  const handleUpdateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const updated = saveAppSettings({ [key]: value });
    setSettings(updated);
    showSuccessFeedback('تم حفظ وتطبيق التعديل بنجاح');
  };

  const executeResetSettings = () => {
    const def = resetAppSettings();
    setSettings(def);
    setShowResetConfirmModal(false);
    showSuccessFeedback('تم استعادة كافة الإعدادات الافتراضية');
  };

  const executeClearLocalCache = async () => {
    setClearingCache(true);
    try {
      const db = await openCatalogDB();
      const tx = db.transaction(['products', 'metadata'], 'readwrite');
      tx.objectStore('products').clear();
      tx.objectStore('metadata').clear();
      await new Promise<void>((resolve) => {
        tx.oncomplete = () => resolve();
      });
      setShowClearCacheConfirmModal(false);
      showSuccessFeedback('تم تفريغ الذاكرة المحلية بنجاح');
      await loadDiagnosticsData();
    } catch (err) {
      console.error('Clear cache error:', err);
      showSuccessFeedback('حدث خطأ أثناء تفريغ الذاكرة');
    } finally {
      setClearingCache(false);
    }
  };

  const handleExportCatalogBackup = async (format: 'json' | 'excel') => {
    setExporting(true);
    try {
      const allProducts = await searchLocalProducts('', 20000);
      if (allProducts.length === 0) {
        showSuccessFeedback('لا توجد أصناف مخزنة محلياً لتصديرها');
        return;
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      if (format === 'json') {
        const jsonString = JSON.stringify(allProducts, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Eye360_Catalog_Backup_${timestamp}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        const worksheet = XLSX.utils.json_to_sheet(allProducts);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Catalog');
        XLSX.writeFile(workbook, `Eye360_Catalog_Backup_${timestamp}.xlsx`);
      }
      showSuccessFeedback(`تم تصدير النسخة الاحتياطية (${allProducts.length.toLocaleString()} صنف) بنجاح`);
    } catch (err) {
      console.error('Export error:', err);
      showSuccessFeedback('فشل تصدير الكتالوج');
    } finally {
      setExporting(false);
    }
  };

  const sections = [
    { id: 'general', label: 'الإعدادات العامة والعرض', icon: Sliders, desc: 'هوية النظام، كثافة الجداول، والتنبيه الصوتي' },
    { id: 'printing', label: 'طباعة الباركود والملصقات', icon: Printer, desc: 'المقاسات الافتراضية، الترويسة المخصصة، والخيارات' },
    { id: 'scanner', label: 'قارئ الباركود والكاميرا', icon: Scan, desc: 'معايرة سرعة القارئ والتقاط الكاميرا' },
    { id: 'branches', label: 'الفروع والمخزون الحرج', icon: Store, desc: 'الجرد الأعمى، رصيد الأمان، وتنبيهات النواقص' },
    { id: 'security', label: 'الأمان وإدارة الجلسات', icon: Lock, desc: 'الخروج التلقائي وسياسات الدخول' },
    { id: 'sync', label: 'المزامنة والشبكة بالخلفية', icon: Wifi, desc: 'المزامنة الدورية وتوفير البيانات' },
    { id: 'marketplaces', label: 'التوصيات والمتاجر الذكية', icon: ShoppingBag, desc: 'خوارزمية التشابه وروابط المتاجر' },
    { id: 'storage', label: 'الذاكرة المؤقتة و IndexedDB', icon: HardDrive, desc: 'فحص وحجم قاعدة البيانات المحلية' },
    { id: 'cloud', label: 'المعطيات الفنية والسحابية', icon: Cloud, desc: 'ربط Firestore والمصادقة والـ API' },
    { id: 'maintenance', label: 'النسخ الاحتياطي والصيانة', icon: Shield, desc: 'تصدير الكتالوج وتفريغ الذاكرة' },
  ];

  return (
    <div className="space-y-6 dir-rtl font-sans">
      {/* Toast notification */}
      {saveToast && (
        <div className="fixed bottom-6 left-6 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 text-xs border border-slate-700 animate-fade-in font-sans">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{saveToast}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
            <Settings className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900">مركز التحكم والإعدادات الموحد</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              لوحة التحكم الشاملة لإدارة تفضيلات الويب أب، الطابعات، الأمان، والذاكرة المحلية
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadDiagnosticsData}
            disabled={loadingHealth}
            className="px-3.5 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs active:scale-98"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingHealth ? 'animate-spin text-blue-600' : ''}`} />
            <span>تحديث الفحص</span>
          </button>

          <button
            onClick={() => setShowResetConfirmModal(true)}
            className="px-3.5 py-2 bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-300 text-slate-600 hover:text-rose-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer shadow-2xs active:scale-98"
          >
            استعادة الافتراضي
          </button>
        </div>
      </div>

      {/* Layout: Sidebar on right, Content Panel on left */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Navigation Sidebar (4 cols) */}
        <div className="lg:col-span-4 space-y-2">
          <div className="bg-white border border-slate-200 rounded-2xl p-2.5 shadow-xs space-y-1">
            {sections.map((sec) => {
              const Icon = sec.icon;
              const isActive = activeSection === sec.id;
              return (
                <button
                  key={sec.id}
                  onClick={() => setActiveSection(sec.id as any)}
                  className={`w-full p-3 rounded-xl text-right transition-all flex items-start gap-3 cursor-pointer ${
                    isActive
                      ? 'bg-blue-50/80 border border-blue-200 text-blue-900 shadow-2xs'
                      : 'hover:bg-slate-50 border border-transparent text-slate-700'
                  }`}
                >
                  <div className={`p-2 rounded-lg mt-0.5 shrink-0 ${
                    isActive ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                  }`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-slate-900 flex items-center justify-between">
                      <span>{sec.label}</span>
                      {isActive && <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-tight">{sec.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Quick Module Jump Links */}
          {onNavigateTab && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2.5">
              <span className="text-xs font-bold text-slate-800 block">روابط سريعة لأقسام الإدارة:</span>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  onClick={() => onNavigateTab('branches')}
                  className="p-2 bg-white hover:bg-blue-50 border border-slate-200 rounded-xl text-right font-medium text-slate-700 flex items-center justify-between cursor-pointer shadow-2xs transition-colors"
                >
                  <span>الفروع والمواقع</span>
                  <ArrowRight className="w-3 h-3 text-slate-400 rotate-180" />
                </button>
                <button
                  onClick={() => onNavigateTab('accounts')}
                  className="p-2 bg-white hover:bg-blue-50 border border-slate-200 rounded-xl text-right font-medium text-slate-700 flex items-center justify-between cursor-pointer shadow-2xs transition-colors"
                >
                  <span>الحسابات</span>
                  <ArrowRight className="w-3 h-3 text-slate-400 rotate-180" />
                </button>
                <button
                  onClick={() => onNavigateTab('catalog_replacement')}
                  className="p-2 bg-white hover:bg-blue-50 border border-slate-200 rounded-xl text-right font-medium text-slate-700 flex items-center justify-between cursor-pointer shadow-2xs transition-colors"
                >
                  <span>استبدال الكتالوج</span>
                  <ArrowRight className="w-3 h-3 text-slate-400 rotate-180" />
                </button>
                <button
                  onClick={() => onNavigateTab('overview')}
                  className="p-2 bg-white hover:bg-blue-50 border border-slate-200 rounded-xl text-right font-medium text-slate-700 flex items-center justify-between cursor-pointer shadow-2xs transition-colors"
                >
                  <span>سلامة البيانات</span>
                  <ArrowRight className="w-3 h-3 text-slate-400 rotate-180" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Active Content Panel (8 cols) */}
        <div className="lg:col-span-8">
          {/* SECTION 1: GENERAL PREFERENCES & DISPLAY */}
          {activeSection === 'general' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-blue-600" />
                  <span>الإعدادات العامة وتفضيلات العرض</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1">تخصيص الخيارات الأساسية، الجداول، وسلوك الواجهة التفاعلية.</p>
              </div>

              <div className="space-y-4 text-xs">
                <div>
                  <label className="block font-bold text-slate-800 mb-1.5">اسم المؤسسة / النظام</label>
                  <input
                    type="text"
                    value={settings.systemName}
                    onChange={(e) => handleUpdateSetting('systemName', e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-900 font-semibold focus:outline-none focus:border-blue-600 focus:bg-white"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-bold text-slate-800 mb-1.5">العملة الافتراضية</label>
                    <input
                      type="text"
                      value={settings.currency}
                      onChange={(e) => handleUpdateSetting('currency', e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-900 font-mono font-semibold focus:outline-none focus:border-blue-600 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-800 mb-1.5">عدد الصفوف لكل صفحة بالجداول</label>
                    <select
                      value={settings.itemsPerPage}
                      onChange={(e) => handleUpdateSetting('itemsPerPage', parseInt(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-900 font-mono font-semibold focus:outline-none focus:border-blue-600 focus:bg-white cursor-pointer"
                    >
                      <option value={15}>15 صنف في الصفحة</option>
                      <option value={25}>25 صنف في الصفحة (الافتراضي)</option>
                      <option value={50}>50 صنف في الصفحة</option>
                      <option value={100}>100 صنف في الصفحة</option>
                    </select>
                  </div>
                </div>

                {/* Sound alert switch */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-900 block">التنبيه الصوتي عند مسح الباركود (Audio Beep)</span>
                    <span className="text-[11px] text-slate-500">إصدار صوت تأكيدي فوري عند مسح الباركود بنجاح عبر USB أو الكاميرا</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={playScanSound}
                      className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-lg text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs active:scale-95"
                    >
                      <Volume2 className="w-3 h-3 text-blue-600" />
                      <span>اختبار الصوت</span>
                    </button>
                    <input
                      type="checkbox"
                      checked={settings.soundEnabled}
                      onChange={(e) => handleUpdateSetting('soundEnabled', e.target.checked)}
                      className="w-5 h-5 accent-blue-600 cursor-pointer"
                    />
                  </div>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-900 block">تمييز الأصناف المنعدمة المخزون (Highlight Out of Stock)</span>
                    <span className="text-[11px] text-slate-500">إبراز الأصناف ذات الرصيد الصفري بوضوح لتمييزها عن الأصناف المتوفرة</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.highlightOutOfStock}
                    onChange={(e) => handleUpdateSetting('highlightOutOfStock', e.target.checked)}
                    className="w-5 h-5 accent-blue-600 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}

          {/* SECTION 2: PRINTING SETTINGS */}
          {activeSection === 'printing' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Printer className="w-4 h-4 text-blue-600" />
                  <span>إعدادات طابعات وملصقات الباركود والترويسة</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1">تحديد المقاس الافتراضي، نصوص الترويسة المخصصة، وخيارات العرض.</p>
              </div>

              <div className="space-y-4 text-xs">
                <div>
                  <label className="block font-bold text-slate-800 mb-2">المقاس الافتراضي المفضل للطباعة:</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {[
                      { id: 'thermal_small', name: 'ملصق حراري صغير (على المنتج)', size: '38 × 25 مم' },
                      { id: 'shelf_standard', name: 'ملصق رفوف وأسعار (Shelf Talker)', size: '50 × 30 مم' },
                      { id: 'detailed_large', name: 'ملصق كبير تفصيلي', size: '70 × 40 مم' },
                      { id: 'a4_grid', name: 'ورق ملصقات A4 شبكي (24 ملصق)', size: 'A4 Sheets' },
                    ].map((p) => {
                      const isSelected = settings.defaultLabelPreset === p.id;
                      return (
                        <div
                          key={p.id}
                          onClick={() => handleUpdateSetting('defaultLabelPreset', p.id as any)}
                          className={`p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-blue-50/90 border-blue-500 text-slate-900 shadow-2xs font-bold'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span>{p.name}</span>
                            <span className="font-mono text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 font-semibold">{p.size}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-bold text-slate-800 mb-1.5">نص الترويسة المخصص أعلى الملصق</label>
                    <input
                      type="text"
                      value={settings.customLabelHeader}
                      placeholder="مثلاً: EYE 360 OPTICAL أو اسم الفرع"
                      onChange={(e) => handleUpdateSetting('customLabelHeader', e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-slate-900 font-semibold focus:outline-none focus:border-blue-600 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-800 mb-1.5">نص تذييل إضافي أسفل الملصق (اختياري)</label>
                    <input
                      type="text"
                      value={settings.customLabelFooterText}
                      placeholder="مثلاً: الاستبدال خلال 14 يوماً بالفاتورة"
                      onChange={(e) => handleUpdateSetting('customLabelFooterText', e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-800 mb-1.5">عدد النسخ الافتراضي لكل صنف</label>
                  <div className="flex items-center gap-2">
                    {[1, 2, 5, 10].map((c) => (
                      <button
                        key={c}
                        onClick={() => handleUpdateSetting('defaultLabelCopies', c)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-colors cursor-pointer shadow-2xs active:scale-95 ${
                          settings.defaultLabelCopies === c
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {c} نسخ
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <span className="font-bold text-slate-900 block">عناصر الملصق الافتراضية:</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <label className="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-200 cursor-pointer">
                      <span>إظهار سعر البيع</span>
                      <input
                        type="checkbox"
                        checked={settings.defaultShowPrice}
                        onChange={(e) => handleUpdateSetting('defaultShowPrice', e.target.checked)}
                        className="w-4 h-4 accent-blue-600 cursor-pointer"
                      />
                    </label>

                    <label className="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-200 cursor-pointer">
                      <span>إظهار اسم الصنف</span>
                      <input
                        type="checkbox"
                        checked={settings.defaultShowName}
                        onChange={(e) => handleUpdateSetting('defaultShowName', e.target.checked)}
                        className="w-4 h-4 accent-blue-600 cursor-pointer"
                      />
                    </label>

                    <label className="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-200 cursor-pointer">
                      <span>إظهار الماركة والموديل</span>
                      <input
                        type="checkbox"
                        checked={settings.defaultShowBrandModel}
                        onChange={(e) => handleUpdateSetting('defaultShowBrandModel', e.target.checked)}
                        className="w-4 h-4 accent-blue-600 cursor-pointer"
                      />
                    </label>

                    <label className="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-200 cursor-pointer">
                      <span>إظهار ترويسة EYE 360</span>
                      <input
                        type="checkbox"
                        checked={settings.defaultShowHeader}
                        onChange={(e) => handleUpdateSetting('defaultShowHeader', e.target.checked)}
                        className="w-4 h-4 accent-blue-600 cursor-pointer"
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 3: SCANNER & HARDWARE CALIBRATION */}
          {activeSection === 'scanner' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Scan className="w-4 h-4 text-blue-600" />
                  <span>معايرة قارئ الباركود والكاميرا (Hardware Calibration)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1">ضبط سرعة استجابة أجهزة المسح اليدوية وتوجيه الكاميرا الافتراضية.</p>
              </div>

              <div className="space-y-4 text-xs">
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-bold text-slate-900 block">حساسية وسرعة قارئ USB (Debounce Delay)</span>
                      <span className="text-[11px] text-slate-500">الفترة الزمنية بين الحروف الممسوحة لتمييز الإدخال السريع للقارئ اليدوي</span>
                    </div>
                    <span className="font-mono font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
                      {settings.scannerDebounceMs} ms
                    </span>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    {[50, 75, 100, 150, 200].map((ms) => (
                      <button
                        key={ms}
                        onClick={() => handleUpdateSetting('scannerDebounceMs', ms)}
                        className={`flex-1 py-1.5 rounded-lg font-mono font-bold text-xs transition-colors cursor-pointer shadow-2xs active:scale-95 ${
                          settings.scannerDebounceMs === ms
                            ? 'bg-blue-600 text-white'
                            : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {ms}ms {ms === 100 ? '(مثالي)' : ''}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-900 block">الكاميرا الافتراضية لمسح الباركود</span>
                    <span className="text-[11px] text-slate-500">توجيه المستشعر المفضل عند فتح نافذة المسح عبر الهاتف أو التابلت</span>
                  </div>
                  <select
                    value={settings.preferredCameraFacing}
                    onChange={(e) => handleUpdateSetting('preferredCameraFacing', e.target.value as any)}
                    className="bg-white border border-slate-300 rounded-xl px-3 py-1.5 font-bold text-slate-900 focus:outline-none focus:border-blue-600 cursor-pointer"
                  >
                    <option value="environment">الكاميرا الخلفية (Environment / Back)</option>
                    <option value="user">الكاميرا الأمامية (User / Front)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 4: BRANCHES & INVENTORY POLICIES */}
          {activeSection === 'branches' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Store className="w-4 h-4 text-blue-600" />
                  <span>سياسات الفروع والمخزون الحرج</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1">الضوابط الأمنية والتشغيلية المطبقة على شاشات المبيعات والجرد.</p>
              </div>

              <div className="space-y-4 text-xs">
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                  <div className="space-y-0.5 max-w-md">
                    <span className="font-bold text-slate-900 block">إلزام الجرد الأعمى (Strict Blind Inventory)</span>
                    <span className="text-[11px] text-slate-500 leading-relaxed block">
                      حجب الأرصدة الدفترية المتوقعة عن موظف الفرع أثناء الجرد لضمان النزاهة التامة في عد القطع الفعلية.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.enforceBlindInventory}
                    onChange={(e) => handleUpdateSetting('enforceBlindInventory', e.target.checked)}
                    className="w-5 h-5 accent-blue-600 cursor-pointer shrink-0"
                  />
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                  <div className="space-y-0.5 max-w-md">
                    <span className="font-bold text-slate-900 block">حد الأمان للمخزون الحرج (Safety Stock Threshold)</span>
                    <span className="text-[11px] text-slate-500 leading-relaxed block">
                      الأصناف التي يقل رصيدها عن هذا الحد تظهر بعلامة تنبيه برتقالية في قوائم المخزون.
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {[1, 2, 3, 5, 10].map((num) => (
                      <button
                        key={num}
                        onClick={() => handleUpdateSetting('lowStockThreshold', num)}
                        className={`px-2.5 py-1.5 rounded-lg font-mono font-bold text-xs transition-colors cursor-pointer shadow-2xs active:scale-95 ${
                          settings.lowStockThreshold === num
                            ? 'bg-amber-600 text-white'
                            : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        ≤ {num}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                  <div className="space-y-0.5 max-w-md">
                    <span className="font-bold text-slate-900 block">السماح التلقائي باستعراض أرصدة الفروع الأخرى (Cross-Branch View)</span>
                    <span className="text-[11px] text-slate-500 leading-relaxed block">
                      القيمة الافتراضية عند إنشاء فرع جديد للسماح للموظفين برؤية توفر القطع في الفروع والمخازن الأخرى.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.defaultAllowCrossBranchView}
                    onChange={(e) => handleUpdateSetting('defaultAllowCrossBranchView', e.target.checked)}
                    className="w-5 h-5 accent-blue-600 cursor-pointer shrink-0"
                  />
                </div>
              </div>
            </div>
          )}

          {/* SECTION 5: SECURITY & SESSIONS */}
          {activeSection === 'security' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-blue-600" />
                  <span>الأمان وإدارة الجلسات (Security & Sessions)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1">حماية شاشات الفروع ومنع الوصول غير المصرح به عند مغادرة الأجهزة.</p>
              </div>

              <div className="space-y-4 text-xs">
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-bold text-slate-900 block">مهلة الخروج التلقائي عند الخمول (Auto-Logout)</span>
                      <span className="text-[11px] text-slate-500">تسجيل الخروج تلقائياً إذا لم يتحرك المستخدم لفترة محددة لحماية البيانات</span>
                    </div>
                    <span className="font-mono font-bold text-slate-800 bg-white px-3 py-1 rounded-lg border border-slate-200">
                      {settings.sessionTimeoutMinutes > 0 ? `${settings.sessionTimeoutMinutes} دقيقة` : 'معطل'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                    {[
                      { val: 15, label: '15 دقيقة' },
                      { val: 30, label: '30 دقيقة (موصى به)' },
                      { val: 60, label: '60 دقيقة' },
                      { val: 0, label: 'تعطيل المهلة' },
                    ].map((opt) => (
                      <button
                        key={opt.val}
                        onClick={() => handleUpdateSetting('sessionTimeoutMinutes', opt.val)}
                        className={`py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer shadow-2xs active:scale-98 ${
                          settings.sessionTimeoutMinutes === opt.val
                            ? 'bg-blue-600 text-white shadow-xs font-bold'
                            : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-900 block">إلزام تغيير كلمة المرور عند أول دخول لحسابات الفروع</span>
                    <span className="text-[11px] text-slate-500">توجيه الموظف لتعيين كلمة سر سرية خاصة بالفرع عند تسجيل الدخول الأول</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.requirePasswordChangeOnFirstLogin}
                    onChange={(e) => handleUpdateSetting('requirePasswordChangeOnFirstLogin', e.target.checked)}
                    className="w-5 h-5 accent-blue-600 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}

          {/* SECTION 6: SYNC & BACKGROUND NETWORK */}
          {activeSection === 'sync' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Wifi className="w-4 h-4 text-blue-600" />
                  <span>المزامنة والشبكة في الخلفية (Sync & Network)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1">جدولة فحص التحديثات السحابية وتكييف استهلاك البيانات.</p>
              </div>

              <div className="space-y-4 text-xs">
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-bold text-slate-900 block">الفحص التلقائي للتحديثات في الخلفية</span>
                      <span className="text-[11px] text-slate-500">التحقق من وجود مراجعات مخزون أحدث على السحابة وتطبيقها بسلاسة</span>
                    </div>
                    <span className="font-mono font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-lg border border-blue-200">
                      {settings.autoSyncIntervalMinutes > 0 ? `كل ${settings.autoSyncIntervalMinutes} دقائق` : 'يدوي فقط'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                    {[
                      { val: 5, label: 'كل 5 دقائق' },
                      { val: 10, label: 'كل 10 دقائق (الافتراضي)' },
                      { val: 30, label: 'كل 30 دقيقة' },
                      { val: 0, label: 'يدوي فقط' },
                    ].map((opt) => (
                      <button
                        key={opt.val}
                        onClick={() => handleUpdateSetting('autoSyncIntervalMinutes', opt.val)}
                        className={`py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer shadow-2xs active:scale-98 ${
                          settings.autoSyncIntervalMinutes === opt.val
                            ? 'bg-blue-600 text-white shadow-xs font-bold'
                            : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-900 block">وضع توفير البيانات (Low Data Mode)</span>
                    <span className="text-[11px] text-slate-500">تقليل طلبات الفحص الدورية لشبكات الفروع ذات السرعات المحدودة أو باقات 4G</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.lowDataMode}
                    onChange={(e) => handleUpdateSetting('lowDataMode', e.target.checked)}
                    className="w-5 h-5 accent-blue-600 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}

          {/* SECTION 7: MARKETPLACES & RECOMMENDATIONS */}
          {activeSection === 'marketplaces' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-blue-600" />
                  <span>محرك التوصيات وروابط المتاجر الذكية</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1">التحكم في خوارزمية المنتجات المشابهة واختصارات البحث في المتاجر الإلكترونية.</p>
              </div>

              <div className="space-y-4 text-xs">
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-900 block">تفعيل قسم المنتجات المشابهة (Smart Similar Products)</span>
                    <span className="text-[11px] text-slate-500">استخراج المواصفات الحتمية (RAM، Wattage، السعر) وتقديم 3 بدائل فورية في نافذة الصنف</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.recommendationsEnabled}
                    onChange={(e) => handleUpdateSetting('recommendationsEnabled', e.target.checked)}
                    className="w-5 h-5 accent-blue-600 cursor-pointer"
                  />
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <span className="font-bold text-slate-900 block">روابط البحث المتاحة للموظفين والإدارة:</span>
                  <div className="space-y-2">
                    <label className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-slate-200 cursor-pointer">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#FF9900]"></span>
                        <span className="font-bold text-slate-900">Amazon Egypt</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={settings.amazonSearchEnabled}
                        onChange={(e) => handleUpdateSetting('amazonSearchEnabled', e.target.checked)}
                        className="w-4 h-4 accent-blue-600 cursor-pointer"
                      />
                    </label>

                    <label className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-slate-200 cursor-pointer">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#FEEE00]"></span>
                        <span className="font-bold text-slate-900">noon Egypt</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={settings.noonSearchEnabled}
                        onChange={(e) => handleUpdateSetting('noonSearchEnabled', e.target.checked)}
                        className="w-4 h-4 accent-blue-600 cursor-pointer"
                      />
                    </label>

                    <label className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-slate-200 cursor-pointer">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#F68B1E]"></span>
                        <span className="font-bold text-slate-900">Jumia Egypt</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={settings.jumiaSearchEnabled}
                        onChange={(e) => handleUpdateSetting('jumiaSearchEnabled', e.target.checked)}
                        className="w-4 h-4 accent-blue-600 cursor-pointer"
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 8: LOCAL STORAGE & INDEXEDDB */}
          {activeSection === 'storage' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-blue-600" />
                  <span>إدارة التخزين المحلي (IndexedDB & Local Cache)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1">حالة وحجم البيانات المخزنة داخل المتصفح للعمل فائق السرعة وبدون اتصال.</p>
              </div>

              {localDbState ? (
                <div className="grid grid-cols-2 gap-3.5 font-mono text-xs tabular-nums">
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="text-slate-500 block text-[11px] font-sans font-medium mb-1">إصدار الكتالوج النشط</span>
                    <span className="text-slate-900 font-bold text-sm">{localDbState.localCatalogVersionId || '—'}</span>
                  </div>
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="text-slate-500 block text-[11px] font-sans font-medium mb-1">المراجعة التراكمية</span>
                    <span className="text-blue-600 font-bold text-sm">Rev {localDbState.localInventoryRevision}</span>
                  </div>
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="text-slate-500 block text-[11px] font-sans font-medium mb-1">عدد الأصناف بالفهرس المحلي</span>
                    <span className="text-slate-900 font-bold text-sm">{localDbState.localProductCount.toLocaleString()} صنف</span>
                  </div>
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="text-slate-500 block text-[11px] font-sans font-medium mb-1">سلامة الفهرس المحلي</span>
                    <span className={`font-bold text-sm ${localDbState.isHealthy ? 'text-emerald-600 font-sans' : 'text-amber-600 font-sans'}`}>
                      {localDbState.isHealthy ? 'سليم ومتطابق ✓' : 'بحاجة لمزامنة'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl text-center text-slate-500 text-xs">
                  جاري فحص مؤشرات التخزين المحلي...
                </div>
              )}

              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-amber-900 block">تفريغ الذاكرة المؤقتة (Clear Local Cache)</span>
                  <span className="text-amber-700 text-[11px]">حذف الكتالوج من IndexedDB في حال وجود بيانات تالفة وإعادة البناء النظيف</span>
                </div>
                <button
                  onClick={() => setShowClearCacheConfirmModal(true)}
                  disabled={clearingCache}
                  className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 shadow-2xs active:scale-95"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>تفريغ الكاش</span>
                </button>
              </div>
            </div>
          )}

          {/* SECTION 9: CLOUD & API DIAGNOSTICS */}
          {activeSection === 'cloud' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Cloud className="w-4 h-4 text-blue-600" />
                  <span>المعطيات الفنية والربط السحابي (Cloud & Firebase)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1">البيانات الفنية لاتصال Firestore، المصادقة، والبروتوكول المستخدم.</p>
              </div>

              {diagnostics && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs font-mono">
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="text-slate-500 block font-sans text-[11px] mb-1">معرف مشروع Firebase</span>
                    <span className="text-slate-900 font-bold break-all">{diagnostics.projectId}</span>
                  </div>
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="text-slate-500 block font-sans text-[11px] mb-1">قاعدة بيانات Firestore Database ID</span>
                    <span className="text-blue-600 font-bold break-all">{diagnostics.firestoreDatabaseId}</span>
                  </div>
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="text-slate-500 block font-sans text-[11px] mb-1">بروتوكول الاتصال (Transport Protocol)</span>
                    <span className="text-emerald-700 font-bold font-sans">HTTP Long Polling (Force Long Polling)</span>
                  </div>
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="text-slate-500 block font-sans text-[11px] mb-1">المستخدم المسجل حالياً</span>
                    <span className="text-slate-900 font-bold truncate block">{currentUser?.email || '—'}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SECTION 10: MAINTENANCE & BACKUP */}
          {activeSection === 'maintenance' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-blue-600" />
                  <span>النسخ الاحتياطي وإجراءات الصيانة</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1">تصدير بيانات الكتالوج بالكامل لملفات خارجية لحفظ الأرشيف التشغيلي.</p>
              </div>

              <div className="space-y-4 text-xs">
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="font-bold text-slate-900 block">تصدير نسخة احتياطية من الكتالوج الحالي (Excel XLSX)</span>
                    <span className="text-[11px] text-slate-500">تحميل كافة أصناف الكتالوج النشط مع تفاصيل المخزون والموديلات في ملف إكسيل</span>
                  </div>
                  <button
                    onClick={() => handleExportCatalogBackup('excel')}
                    disabled={exporting}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs shrink-0 active:scale-98"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{exporting ? 'جاري التصدير...' : 'تصدير Excel'}</span>
                  </button>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="font-bold text-slate-900 block">تصدير نسخة احتياطية بصيغة JSON برمجية</span>
                    <span className="text-[11px] text-slate-500">حفظ هيكل البيانات بالكامل للاسترجاع البرمجي السريع والنسخ السحابي</span>
                  </div>
                  <button
                    onClick={() => handleExportCatalogBackup('json')}
                    disabled={exporting}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs shrink-0 active:scale-98"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{exporting ? 'جاري التصدير...' : 'تصدير JSON'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* CONFIRMATION MODAL: RESET DEFAULTS */}
      {showResetConfirmModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 text-right">
            <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">تأكيد استعادة الإعدادات الافتراضية</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              هل أنت متأكد من رغبتك في إعادة ضبط جميع الإعدادات وتفضيلات العرض والطابعات إلى الوضع الافتراضي الأصلي للنظام؟
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowResetConfirmModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
              >
                إلغاء
              </button>
              <button
                onClick={executeResetSettings}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-xs"
              >
                نعم، استعادة الافتراضي
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL: CLEAR LOCAL CACHE */}
      {showClearCacheConfirmModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 text-right">
            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center">
              <Trash2 className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">تأكيد تفريغ الذاكرة المحلية (IndexedDB)</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              سيتم تفريغ كافة بيانات الكتالوج المحفوظة محلياً في هذا المتصفح. ستحتاج لإعادة مزامنة الكتالوج من السحابة أو استبداله.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowClearCacheConfirmModal(false)}
                disabled={clearingCache}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
              >
                إلغاء
              </button>
              <button
                onClick={executeClearLocalCache}
                disabled={clearingCache}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-xs flex items-center gap-1.5"
              >
                {clearingCache ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>{clearingCache ? 'جاري التفريغ...' : 'نعم، تفريغ الذاكرة'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
