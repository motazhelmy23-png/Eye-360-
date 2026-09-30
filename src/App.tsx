import React, { useState, useEffect } from 'react';
import { BRAND_ASSETS } from './assets/brand';
import { BrandLogo } from './components/BrandLogo';
import { 
  login, 
  logout, 
  subscribeToAuth, 
  UserProfile 
} from './services/authService';
import { getSystemDiagnostics } from './services/diagnosticsService';
import { getBranch, BranchProfile } from './services/branchService';
import FullCatalogReplacementWizard from './components/FullCatalogReplacementWizard';
import DailyInventoryWizard from './components/DailyInventoryWizard';
import DailyUpdateHistory from './components/DailyUpdateHistory';
import CatalogVersionHistory from './components/CatalogVersionHistory';
import DataHealthDashboard from './components/DataHealthDashboard';
import ProductsBarcodeView from './components/ProductsBarcodeView';
import BranchManagementView from './components/BranchManagementView';
import AccountsManagementView from './components/AccountsManagementView';
import PhysicalInventoryAdminView from './components/PhysicalInventoryAdminView';
import UnifiedSettingsView from './components/UnifiedSettingsView';
import SalesDashboard from './components/SalesDashboard';
import { CopyrightNotice } from './components/CopyrightNotice';
import { 
  Shield, Database, User, LogOut, CheckCircle2, AlertTriangle, 
  RefreshCw, Building2, LayoutDashboard, FileSpreadsheet, 
  RotateCw, Barcode, Store, Users, History, FileText, 
  ClipboardCheck, MessageSquareWarning, Settings, Menu, X, Cpu,
  ChevronLeft, ChevronRight, Layers, ArrowUpRight, Search,
  PanelRightClose, PanelRightOpen, Lock, Mail, HardDrive, Eye,
  ArrowRight
} from 'lucide-react';

export default function App() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [branchProfile, setBranchProfile] = useState<BranchProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Routing State for Login Portals: 'selector' | 'admin' | 'branch'
  const [loginMode, setLoginMode] = useState<'selector' | 'admin' | 'branch'>('selector');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Wrong Portal Mismatch Warning State
  const [wrongPortalState, setWrongPortalState] = useState<{
    attemptedPortal: 'admin' | 'branch';
    actualRole: 'admin' | 'sales';
  } | null>(null);

  const [diagnostics, setDiagnostics] = useState<any>(null);
  
  // Admin Navigation State
  const [activeAdminTab, setActiveAdminTab] = useState<
    | 'overview'
    | 'daily_update'
    | 'catalog_replacement'
    | 'products'
    | 'branches'
    | 'accounts'
    | 'inventory_history'
    | 'catalog_history'
    | 'inventory_count'
    | 'reports'
    | 'settings'
  >('overview');

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    // Check URL hash or path for portal routing
    const checkHashRoute = () => {
      const hash = window.location.hash;
      if (hash === '#/login/admin') {
        setLoginMode('admin');
      } else if (hash === '#/login/branch') {
        setLoginMode('branch');
      } else {
        setLoginMode('selector');
      }
    };
    checkHashRoute();
    window.addEventListener('hashchange', checkHashRoute);

    const unsubscribe = subscribeToAuth(async (userProfile) => {
      if (userProfile && userProfile.role !== 'unauthorized') {
        setProfile(userProfile);
        if (userProfile.role === 'sales' && userProfile.branchId) {
          try {
            const bp = await getBranch(userProfile.branchId);
            setBranchProfile(bp);
          } catch (err) {
            console.error('Failed to load branch profile:', err);
          }
        } else {
          setBranchProfile(null);
        }
        if (userProfile.role === 'admin') {
          const diag = await getSystemDiagnostics(userProfile);
          setDiagnostics(diag);
        }
      } else {
        setProfile(null);
        setBranchProfile(null);
      }
      setLoading(false);
    });

    return () => {
      unsubscribe();
      window.removeEventListener('hashchange', checkHashRoute);
    };
  }, []);

  const navigateToPortal = (mode: 'selector' | 'admin' | 'branch') => {
    setLoginMode(mode);
    setErrorMsg('');
    setWrongPortalState(null);
    if (mode === 'admin') {
      window.location.hash = '#/login/admin';
    } else if (mode === 'branch') {
      window.location.hash = '#/login/branch';
    } else {
      window.location.hash = '#/login';
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent, targetPortal: 'admin' | 'branch') => {
    e.preventDefault();
    setErrorMsg('');
    setWrongPortalState(null);
    setSubmitting(true);

    try {
      // 1. Authenticate with Firebase Auth
      const userProfile = await login(email, password);

      // 2. Authorization & Portal Verification Rules
      if (targetPortal === 'admin') {
        if (userProfile.role !== 'admin') {
          await logout();
          setWrongPortalState({ attemptedPortal: 'admin', actualRole: 'sales' });
          setSubmitting(false);
          return;
        }
      } else if (targetPortal === 'branch') {
        if (userProfile.role !== 'sales') {
          await logout();
          setWrongPortalState({ attemptedPortal: 'branch', actualRole: 'admin' });
          setSubmitting(false);
          return;
        }
        if (!userProfile.branchId) {
          await logout();
          setErrorMsg('هذا الحساب غير مرتبط بأي فرع نشط.');
          setSubmitting(false);
          return;
        }
      }

      setProfile(userProfile);
      if (userProfile.role === 'sales' && userProfile.branchId) {
        const bp = await getBranch(userProfile.branchId);
        setBranchProfile(bp);
      }
      if (userProfile.role === 'admin') {
        const diag = await getSystemDiagnostics(userProfile);
        setDiagnostics(diag);
      }
    } catch (err: any) {
      let msg = err.message || 'بيانات الدخول غير صحيحة';
      if (msg.includes('auth/invalid-credential') || msg.includes('auth/wrong-password') || msg.includes('auth/user-not-found')) {
        msg = 'بيانات الدخول غير صحيحة. يرجى التحقق من البريد الإلكتروني وكلمة المرور.';
      } else if (msg.includes('auth/too-many-requests')) {
        msg = 'تم حظر المحاولات مؤقتاً بسبب كثرة المحاولات الفاشلة. حاول لاحقاً.';
      }
      setErrorMsg(msg);
      setProfile(null);
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setProfile(null);
    setBranchProfile(null);
    setEmail('');
    setPassword('');
    setWrongPortalState(null);
    navigateToPortal('selector');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F6F8FA] text-[#111827] flex items-center justify-center font-sans dir-rtl">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-10 h-10 rounded-lg bg-[#2F81F7]/10 border border-[#2F81F7]/20 flex items-center justify-center text-[#2F81F7]">
            <Eye className="w-5 h-5 animate-pulse" />
          </div>
          <p className="text-xs text-[#667085]">جاري تحميل منصة Eye 360...</p>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // LOGIN PORTALS & SELECTOR EXPERIENCE (REFINED POLISH)
  // -------------------------------------------------------------------------
  if (!profile) {
    return (
      <div className="min-h-screen bg-[#F6F8FA] text-[#111827] flex flex-col justify-between font-sans dir-rtl">
        {/* Top Header - No unnecessary utility icons */}
        <header className="w-full max-w-7xl mx-auto px-6 md:px-12 py-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <BrandLogo variant="light" className="h-16 w-auto" onClick={() => navigateToPortal('selector')} />
          </div>
          <div className="text-xs text-[#4B5563] font-medium hidden sm:block">
            منصة عمليات المخزون وإدارة الفروع
          </div>
        </header>

        {/* Main Split Layout for Login with increased container width */}
        <main className="w-full flex-1 flex items-center justify-center p-4 md:p-8">
          <div className="w-full max-w-6xl bg-white border border-[#E5E7EB] rounded-2xl shadow-xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 transition-all duration-150">
            
            {/* RIGHT COLUMN: Authentication / Selector Form with increased breathing room */}
            <div className="lg:col-span-7 p-8 sm:p-12 flex flex-col justify-between transition-all duration-150">
              <div>
                <div className="mb-6">
                  <span className="text-[11px] font-semibold text-[#2F81F7] bg-[#2F81F7]/10 px-3 py-1 rounded-full">
                    بوابة الدخول الموحدة
                  </span>
                  <h1 className="text-xl sm:text-2xl font-bold text-[#111827] mt-3 tracking-tight">
                    {loginMode === 'selector' && 'اختر نوع الدخول للنظام'}
                    {loginMode === 'admin' && 'دخول الإدارة والتشغيل'}
                    {loginMode === 'branch' && 'دخول الفروع ونقاط البيع'}
                  </h1>
                  <p className="text-xs text-[#4B5563] mt-1.5 leading-relaxed font-normal">
                    {loginMode === 'selector' && 'يرجى تحديد بوابة الدخول المناسبة لصلاحيات حسابك المعتمدة.'}
                    {loginMode === 'admin' && 'إدارة وتشغيل منصة Eye 360'}
                    {loginMode === 'branch' && 'الوصول السريع للأسعار والمخزون داخل فرعك المخصص.'}
                  </p>
                </div>

                {/* Wrong Portal Mismatch Warning Box */}
                {wrongPortalState && (
                  <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 mt-0.5">
                        <AlertTriangle className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-amber-900">
                          {wrongPortalState.attemptedPortal === 'admin' && wrongPortalState.actualRole === 'sales'
                            ? 'هذا حساب فرع. استخدم بوابة دخول الفروع.'
                            : 'هذا حساب إدارة. استخدم بوابة دخول الإدارة.'}
                        </h4>
                        <p className="text-[11px] text-amber-700 mt-0.5">
                          تم رفض المحاولة لأن بوابة الدخول غير مطابقة لصلاحيات حسابك المسجل.
                        </p>
                      </div>
                    </div>
                    <div className="pt-1">
                      <button
                        onClick={() => {
                          setWrongPortalState(null);
                          navigateToPortal(wrongPortalState.actualRole === 'admin' ? 'admin' : 'branch');
                        }}
                        className="w-full bg-[#2F81F7] hover:bg-[#1d6fe8] text-white font-medium py-2 px-4 rounded-xl text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <span>
                          {wrongPortalState.actualRole === 'admin' ? 'الانتقال إلى دخول الإدارة' : 'الانتقال إلى دخول الفروع'}
                        </span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                {/* General Error Message */}
                {errorMsg && !wrongPortalState && (
                  <div className="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs flex items-center gap-2.5">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {/* PORTAL SELECTOR CARDS (Neutral by default, hover/selection states) */}
                {loginMode === 'selector' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 my-3">
                    {/* Admin Portal Card */}
                    <div 
                      onClick={() => navigateToPortal('admin')}
                      className="group border border-[#E5E7EB] rounded-2xl p-6 cursor-pointer transition-all duration-150 flex flex-col justify-between relative bg-white hover:border-[#2F81F7] hover:bg-[#F8FBFF] hover:shadow-xs"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <div className="w-10 h-10 rounded-xl bg-[#2F81F7]/10 text-[#2F81F7] flex items-center justify-center group-hover:scale-105 transition-transform">
                            <Shield className="w-5 h-5" />
                          </div>
                        </div>
                        <h3 className="text-sm font-bold text-[#111827] group-hover:text-[#2F81F7] transition-colors">
                          دخول الإدارة
                        </h3>
                        <p className="text-[11px] text-[#4B5563] mt-2 leading-relaxed font-normal">
                          إدارة الكتالوج، تحديثات المخزون، الفروع والصلاحيات.
                        </p>
                      </div>
                      <div className="mt-6 pt-3 border-t border-[#F3F4F6] flex items-center justify-between text-xs font-semibold text-[#2F81F7]">
                        <span>دخول الإدارة</span>
                        <ArrowRight className="w-3.5 h-3.5 group-hover:-translate-x-1 transition-transform" />
                      </div>
                    </div>

                    {/* Branch Portal Card */}
                    <div 
                      onClick={() => navigateToPortal('branch')}
                      className="group border border-[#E5E7EB] rounded-2xl p-6 cursor-pointer transition-all duration-150 flex flex-col justify-between relative bg-white hover:border-[#2F81F7] hover:bg-[#F8FBFF] hover:shadow-xs"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <div className="w-10 h-10 rounded-xl bg-slate-100 text-[#374151] flex items-center justify-center group-hover:scale-105 transition-transform">
                            <Store className="w-5 h-5" />
                          </div>
                        </div>
                        <h3 className="text-sm font-bold text-[#111827] group-hover:text-[#2F81F7] transition-colors">
                          دخول الفروع
                        </h3>
                        <p className="text-[11px] text-[#4B5563] mt-2 leading-relaxed font-normal">
                          البحث عن الأصناف والأسعار ومخزون الفرع ونقاط البيع.
                        </p>
                      </div>
                      <div className="mt-6 pt-3 border-t border-[#F3F4F6] flex items-center justify-between text-xs font-semibold text-[#374151] group-hover:text-[#2F81F7]">
                        <span>دخول الفرع</span>
                        <ArrowRight className="w-3.5 h-3.5 group-hover:-translate-x-1 transition-transform" />
                      </div>
                    </div>
                  </div>
                )}

                {/* ADMIN LOGIN FORM */}
                {loginMode === 'admin' && (
                  <form onSubmit={(e) => handleLoginSubmit(e, 'admin')} className="space-y-4 transition-all duration-150">
                    <div>
                      <label className="block text-xs font-semibold text-[#374151] mb-1.5">البريد الإلكتروني للإدارة</label>
                      <div className="relative">
                        <input
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="w-full h-11 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl pr-10 pl-3 text-xs text-[#111827] placeholder-[#98A2B3] focus:outline-none focus:border-[#2F81F7] focus:ring-1 focus:ring-[#2F81F7]/30 font-mono"
                          placeholder="admin@eye360.com"
                        />
                        <Mail className="w-4 h-4 text-[#98A2B3] absolute right-3.5 top-3.5" />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#374151] mb-1.5">كلمة المرور</label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full h-11 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl pr-10 pl-10 text-xs text-[#111827] placeholder-[#98A2B3] focus:outline-none focus:border-[#2F81F7] focus:ring-1 focus:ring-[#2F81F7]/30 font-mono"
                          placeholder="••••••••"
                        />
                        <Lock className="w-4 h-4 text-[#98A2B3] absolute right-3.5 top-3.5" />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute left-3.5 top-3.5 text-[#98A2B3] hover:text-[#111827]"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full h-11 mt-2 bg-[#2F81F7] hover:bg-[#1d6fe8] active:bg-[#1a5fc7] text-white font-semibold rounded-xl text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm disabled:opacity-50"
                    >
                      {submitting ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>جاري تسجيل الدخول...</span>
                        </>
                      ) : (
                        <span>تسجيل دخول الإدارة</span>
                      )}
                    </button>

                    <div className="pt-2 text-center">
                      <button
                        type="button"
                        onClick={() => navigateToPortal('selector')}
                        className="text-xs text-[#4B5563] hover:text-[#2F81F7] font-medium transition-colors cursor-pointer inline-flex items-center gap-1.5"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                        <span>← تغيير نوع الدخول</span>
                      </button>
                    </div>
                  </form>
                )}

                {/* BRANCH LOGIN FORM */}
                {loginMode === 'branch' && (
                  <form onSubmit={(e) => handleLoginSubmit(e, 'branch')} className="space-y-4 transition-all duration-150">
                    <div>
                      <label className="block text-xs font-semibold text-[#374151] mb-1.5">البريد الإلكتروني للفرع</label>
                      <div className="relative">
                        <input
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="w-full h-11 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl pr-10 pl-3 text-xs text-[#111827] placeholder-[#98A2B3] focus:outline-none focus:border-[#2F81F7] focus:ring-1 focus:ring-[#2F81F7]/30 font-mono"
                          placeholder="branch.sales@eye360.com"
                        />
                        <Mail className="w-4 h-4 text-[#98A2B3] absolute right-3.5 top-3.5" />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#374151] mb-1.5">كلمة المرور</label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full h-11 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl pr-10 pl-10 text-xs text-[#111827] placeholder-[#98A2B3] focus:outline-none focus:border-[#2F81F7] focus:ring-1 focus:ring-[#2F81F7]/30 font-mono"
                          placeholder="••••••••"
                        />
                        <Lock className="w-4 h-4 text-[#98A2B3] absolute right-3.5 top-3.5" />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute left-3.5 top-3.5 text-[#98A2B3] hover:text-[#111827]"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full h-11 mt-2 bg-[#111827] hover:bg-[#1f2937] active:bg-black text-white font-semibold rounded-xl text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm disabled:opacity-50"
                    >
                      {submitting ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>جاري التحقق من الفرع...</span>
                        </>
                      ) : (
                        <span>دخول الفرع</span>
                      )}
                    </button>

                    <div className="pt-2 text-center">
                      <button
                        type="button"
                        onClick={() => navigateToPortal('selector')}
                        className="text-xs text-[#4B5563] hover:text-[#2F81F7] font-medium transition-colors cursor-pointer inline-flex items-center gap-1.5"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                        <span>← تغيير نوع الدخول</span>
                      </button>
                    </div>
                  </form>
                )}
              </div>

              <div className="mt-8 pt-4 border-t border-[#F3F4F6] text-center text-[11px] text-[#4B5563]">
                Eye 360 Enterprise Access
              </div>
            </div>

            {/* LEFT COLUMN: Simplified Dark Feature List (Lighter rows, less box-like, smaller icons) */}
            <div className="lg:col-span-5 bg-[#0B1017] text-white p-8 sm:p-12 flex flex-col justify-between relative overflow-hidden">
              <div className="absolute -left-10 -bottom-10 w-60 h-60 bg-[#2F81F7]/10 rounded-full blur-3xl pointer-events-none"></div>
              
              <div>
                <BrandLogo variant="dark" className="mb-5" />
                <h3 className="text-base font-bold tracking-tight text-white mt-3">
                  منصة عمليات المخزون وإدارة الفروع
                </h3>
                <p className="text-xs text-[#98A2B3] mt-2 leading-relaxed font-normal">
                  نظام مركزي متطور لإدارة الكتالوجات، تتبع مخزون الفروع اللحظي، والتحكم الذكي بمزامنة التحديثات اليومية.
                </p>
              </div>

              <div className="space-y-3.5 my-8">
                <div className="flex items-center gap-3 py-2 text-xs text-[#E5E7EB]">
                  <div className="w-6 h-6 rounded-lg bg-[#2F81F7]/20 text-[#60A5FA] flex items-center justify-center shrink-0">
                    <Barcode className="w-3.5 h-3.5" />
                  </div>
                  <span className="font-medium">بحث فوري بالباركود ومزامنة محلية سريعة</span>
                </div>

                <div className="flex items-center gap-3 py-2 text-xs text-[#E5E7EB]">
                  <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </div>
                  <span className="font-medium">التحقق والاعتماد اللحظي لصلاحيات الفروع</span>
                </div>

                <div className="flex items-center gap-3 py-2 text-xs text-[#E5E7EB]">
                  <div className="w-6 h-6 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
                    <Store className="w-3.5 h-3.5" />
                  </div>
                  <span className="font-medium">إدارة متكاملة ومواءمة مع مستويات المخزون</span>
                </div>
              </div>

              <div className="text-[11px] text-[#98A2B3] font-mono flex items-center justify-between">
                <span>Secured Enterprise Session</span>
                <CopyrightNotice variant="dark" className="text-[10px]" />
              </div>
            </div>

          </div>
        </main>

        {/* Tightened Footer Spacing */}
        <footer className="w-full max-w-7xl mx-auto py-3 px-4 text-center">
          <CopyrightNotice variant="dark" />
        </footer>
      </div>
    );
  }

  // Unauthorized or Offline
  if (profile.role === 'unauthorized') {
    const isBranchInactive = profile.branchInactive;
    return (
      <div className="min-h-screen bg-[#F6F8FA] text-[#111827] flex flex-col items-center justify-center p-4 font-sans dir-rtl">
        <div className="max-w-md w-full bg-[#FFFFFF] border border-[#E5E7EB] rounded-2xl p-8 shadow-sm space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center shrink-0 border border-amber-200">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#111827]">
                {isBranchInactive
                  ? 'الفرع المرتبط غير نشط'
                  : profile.isOffline
                  ? 'تعذر الاتصال بالسحابة'
                  : 'حساب غير مفعل أو غير مصرح له'}
              </h2>
              <p className="text-[#667085] text-xs font-mono mt-0.5">{profile.email}</p>
            </div>
          </div>

          <p className="text-[#374151] text-xs leading-relaxed">
            {isBranchInactive
              ? 'الفرع المرتبط بهذا الحساب غير نشط. تواصل مع الإدارة.'
              : profile.isOffline 
              ? 'يتعذر الوصول لخوادم Firestore حالياً. يمكنك إعادة المحاولة أو العمل بالوضع المحلي.'
              : 'هذا الحساب غير مفعل أو لا يمتلك صلاحية نشطة. يرجى مراجعة مشرف النظام.'}
          </p>

          <div className="flex gap-2 pt-2">
            {!isBranchInactive && (
              <button
                onClick={() => window.location.reload()}
                className="flex-1 bg-[#2F81F7] hover:bg-[#1d6fe8] text-white font-medium py-2 px-3 rounded-xl transition-colors text-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" /> إعادة المحاولة
              </button>
            )}
            <button
              onClick={handleLogout}
              className="flex-1 bg-[#F9FAFB] hover:bg-[#F3F4F6] border border-[#E5E7EB] text-[#374151] font-medium py-2 px-3 rounded-xl transition-colors text-xs cursor-pointer"
            >
              تسجيل الخروج
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Sales / Branch User Dashboard
  if (profile.role === 'sales') {
    return (
      <SalesDashboard 
        profile={profile} 
        branchProfile={branchProfile} 
        onLogout={handleLogout} 
      />
    );
  }

  // Admin Navigation Groups Definition
  const adminNavGroups = [
    {
      groupTitle: 'الرئيسية',
      items: [
        { id: 'overview', label: 'لوحة المؤشرات وسلامة البيانات', icon: Cpu },
      ]
    },
    {
      groupTitle: 'المخزون',
      items: [
        { id: 'products', label: 'الأصناف والباركود', icon: Barcode },
        { id: 'inventory_count', label: 'الجرد الفعلي', icon: ClipboardCheck },
      ]
    },
    {
      groupTitle: 'التحديثات',
      items: [
        { id: 'daily_update', label: 'تحديث المخزون اليومي', icon: RotateCw },
        { id: 'inventory_history', label: 'سجل التحديثات اليومية', icon: History },
        { id: 'catalog_replacement', label: 'استبدال الكتالوج الشامل', icon: FileSpreadsheet },
        { id: 'catalog_history', label: 'سجل إصدارات الكتالوج', icon: Layers },
      ]
    },
    {
      groupTitle: 'الإدارة',
      items: [
        { id: 'branches', label: 'إدارة الفروع والمواقع', icon: Store },
        { id: 'accounts', label: 'الحسابات والصلاحيات', icon: Users },
      ]
    },
    {
      groupTitle: 'النظام',
      items: [
        { id: 'settings', label: 'مركز التحكم والإعدادات', icon: Settings },
        { id: 'reports', label: 'البلاغات والملاحظات', icon: MessageSquareWarning },
      ]
    }
  ];

  const getActiveTabTitle = () => {
    for (const grp of adminNavGroups) {
      const match = grp.items.find(i => i.id === activeAdminTab);
      if (match) return { group: grp.groupTitle, title: match.label };
    }
    return { group: 'الرئيسية', title: 'لوحة التحكم' };
  };

  const activeBreadcrumb = getActiveTabTitle();

  return (
    <div className="min-h-screen bg-[#F6F8FA] text-[#111827] font-sans dir-rtl flex flex-row">
      {/* DARK SIDEBAR */}
      <aside 
        className={`fixed md:sticky top-0 right-0 z-40 h-screen bg-[#0B1017] border-l border-[#1F2937] flex flex-col transition-all duration-200 select-none ${
          mobileMenuOpen ? 'translate-x-0 w-64' : 'translate-x-full md:translate-x-0'
        } ${sidebarCollapsed ? 'md:w-[72px]' : 'md:w-64'}`}
      >
        <div className="h-16 px-4 flex items-center justify-between border-b border-white/[0.08] shrink-0">
          <div className="flex items-center gap-3 overflow-hidden">
            {sidebarCollapsed ? (
              <BrandLogo variant="symbol" className="w-8 h-8 mx-auto" />
            ) : (
              <BrandLogo variant="dark" className="w-[125px]" />
            )}
          </div>
          
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="hidden md:flex p-1.5 text-[#98A2B3] hover:text-white rounded-lg hover:bg-white/[0.04] transition-colors cursor-pointer"
            title={sidebarCollapsed ? 'توسيع القائمة' : 'تصغير القائمة'}
          >
            {sidebarCollapsed ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>

          <button
            onClick={() => setMobileMenuOpen(false)}
            className="md:hidden p-1.5 text-[#98A2B3] hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {adminNavGroups.map((group) => (
            <div key={group.groupTitle} className="space-y-1">
              {!sidebarCollapsed && (
                <div className="px-3 pb-1.5 text-[10px] font-semibold text-[#667085] uppercase tracking-wider">
                  {group.groupTitle}
                </div>
              )}
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeAdminTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveAdminTab(item.id as any);
                      setMobileMenuOpen(false);
                    }}
                    title={sidebarCollapsed ? item.label : undefined}
                    className={`w-full relative flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-[#2F81F7]/15 text-white font-semibold'
                        : 'text-[#A8B1BF] hover:text-white hover:bg-[#151D27]'
                    } ${sidebarCollapsed ? 'justify-center px-2' : ''}`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#60A5FA]' : 'text-[#A8B1BF]'}`} />
                    {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                    {isActive && (
                      <span className="absolute right-0 top-1.5 bottom-1.5 w-1 bg-[#2F81F7] rounded-l-full"></span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-white/[0.08] bg-[#0B1017] shrink-0">
          <div className={`flex items-center gap-3 p-2 rounded-xl bg-[#111820] border border-white/[0.05] ${sidebarCollapsed ? 'justify-center p-1.5' : ''}`}>
            <div className="w-7 h-7 rounded-full bg-[#2F81F7]/20 text-[#60A5FA] font-bold text-xs flex items-center justify-center shrink-0 font-mono">
              {profile.name ? profile.name.charAt(0) : 'A'}
            </div>
            {!sidebarCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white truncate">{profile.name || profile.email}</p>
                <div className="flex items-center gap-1.5 text-[10px] text-[#98A2B3]">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  <span>مشرف نظام</span>
                </div>
              </div>
            )}
            <button
              onClick={handleLogout}
              className="p-1.5 text-[#98A2B3] hover:text-red-400 rounded-md hover:bg-white/[0.04] transition-colors cursor-pointer shrink-0"
              title="تسجيل الخروج"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
          {!sidebarCollapsed && (
            <div className="mt-2 text-center">
              <CopyrightNotice variant="light" className="text-[10px] text-slate-500" />
            </div>
          )}
        </div>
      </aside>

      {/* LIGHT MAIN WORKSPACE */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#F6F8FA]">
        <header className="h-[58px] px-6 bg-[#FFFFFF] border-b border-[#E5E7EB] flex items-center justify-between sticky top-0 z-30 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-1.5 text-[#667085] hover:text-[#111827]"
            >
              <Menu className="w-5 h-5" />
            </button>
            
            <div className="flex items-center gap-2 text-xs font-medium text-[#667085]">
              <span>Eye 360</span>
              <span className="text-[#D1D5DB]">/</span>
              <span>{activeBreadcrumb.group}</span>
              <span className="text-[#D1D5DB]">/</span>
              <span className="text-[#111827] font-semibold">{activeBreadcrumb.title}</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-3 text-xs text-[#667085] font-mono">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>متزامن</span>
              </span>
              <span className="text-emerald-700 font-semibold bg-emerald-50 px-2 py-1 rounded border border-emerald-200">Rev 1</span>
            </div>

            <button
              onClick={() => window.location.reload()}
              className="p-2 text-[#667085] hover:text-[#111827] hover:bg-[#F3F4F6] rounded-lg transition-colors cursor-pointer"
              title="تحديث البيانات"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-7xl mx-auto space-y-6">
            {activeAdminTab === 'overview' && <DataHealthDashboard />}
            {activeAdminTab === 'daily_update' && <DailyInventoryWizard />}
            {activeAdminTab === 'catalog_replacement' && <FullCatalogReplacementWizard />}
            {activeAdminTab === 'products' && <ProductsBarcodeView />}
            {activeAdminTab === 'branches' && <BranchManagementView />}
            {activeAdminTab === 'accounts' && <AccountsManagementView />}
            {activeAdminTab === 'inventory_history' && <DailyUpdateHistory />}
            {activeAdminTab === 'catalog_history' && <CatalogVersionHistory />}

            {activeAdminTab === 'settings' && (
              <UnifiedSettingsView 
                currentUser={profile} 
                diagnostics={diagnostics} 
                onNavigateTab={(tab) => setActiveAdminTab(tab as any)} 
              />
            )}

            {activeAdminTab === 'inventory_count' && <PhysicalInventoryAdminView currentUser={profile} />}

            {activeAdminTab === 'reports' && (
              <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-2xl p-16 text-center space-y-4 shadow-sm">
                <div className="w-12 h-12 bg-blue-50 text-[#2F81F7] rounded-xl flex items-center justify-center mx-auto border border-blue-200">
                  <ClipboardCheck className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-[#111827]">هذه الوحدة مجدولة في خطة التشغيل القادمة</h3>
                <p className="text-[#667085] text-xs max-w-md mx-auto leading-relaxed">
                  تم تجهيز الهيكل التنظيمي والربط البياني بنجاح، وسيتم إطلاق واجهة البلاغات والملاحظات فور اعتمادها رسمياً.
                </p>
              </div>
            )}
          </div>
        </main>

        <footer className="py-3 px-6 text-center border-t border-[#E5E7EB] bg-[#FFFFFF] shrink-0">
          <CopyrightNotice variant="dark" />
        </footer>
      </div>
    </div>
  );
}
