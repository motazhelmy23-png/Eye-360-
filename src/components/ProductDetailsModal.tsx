import React, { useMemo, useState, useRef, useEffect } from 'react';
import { NormalizedProduct } from '../types/inventory';
import { BranchProfile } from '../services/branchService';
import { findSimilarProducts, ProductRecommendation } from '../utils/productSimilarity';
import { MARKETPLACE_PROVIDERS, getMarketplaceSearchUrl, buildExternalProductSearchQuery } from '../constants/marketplaces';
import { 
  X, Printer, ExternalLink, Sparkles, Package, 
  Layers, ShoppingBag, ShieldAlert, CheckCircle2, ChevronRight, Bug
} from 'lucide-react';

interface ProductDetailsModalProps {
  product: NormalizedProduct | null;
  allProducts: NormalizedProduct[];
  isOpen: boolean;
  onClose: () => void;
  onSelectProduct?: (product: NormalizedProduct) => void;
  onOpenPrintModal?: (product: NormalizedProduct) => void;
  branchProfile?: BranchProfile | null;
  isAdmin?: boolean;
}

export const ProductDetailsModal: React.FC<ProductDetailsModalProps> = ({
  product,
  allProducts,
  isOpen,
  onClose,
  onSelectProduct,
  onOpenPrintModal,
  branchProfile,
  isAdmin = false,
}) => {
  const [showDebug, setShowDebug] = useState(false);
  const modalBodyRef = useRef<HTMLDivElement>(null);

  // Scroll to top when product changes
  useEffect(() => {
    if (modalBodyRef.current) {
      modalBodyRef.current.scrollTop = 0;
    }
  }, [product?.itemCode]);

  // Compute 3 similar products locally without Firestore reads
  const similarProducts: ProductRecommendation[] = useMemo(() => {
    if (!product || !allProducts || allProducts.length === 0) {
      return [];
    }
    return findSimilarProducts(product, allProducts, 3);
  }, [product, allProducts]);

  // Compute external search query
  const externalSearchQuery = useMemo(() => {
    return buildExternalProductSearchQuery(product);
  }, [product]);

  if (!isOpen || !product) return null;

  const ownLocationId = branchProfile?.inventoryLocationId;
  const allowCrossBranch = branchProfile?.allowCrossBranchStockView ?? true;

  const handleSelectSimilar = (candidate: NormalizedProduct) => {
    if (onSelectProduct) {
      onSelectProduct(candidate);
    }
    if (modalBodyRef.current) {
      modalBodyRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 print:hidden">
      <div 
        className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl dir-rtl font-sans overflow-hidden"
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/70 shrink-0">
          <div className="space-y-0.5">
            <span className="text-xs text-blue-600 font-mono font-bold block">{product.itemCode}</span>
            <h3 className="text-base font-bold text-slate-900 leading-snug">{product.name || 'بدون اسم صنف'}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div ref={modalBodyRef} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {/* Core Info Specs Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 font-mono text-xs tabular-nums">
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <span className="text-slate-500 block mb-1 text-[11px] font-medium font-sans">الباركود</span>
              <span className="text-slate-900 font-bold">{product.barcode || '—'}</span>
            </div>
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <span className="text-slate-500 block mb-1 text-[11px] font-medium font-sans">كود الموديل</span>
              <span className="text-slate-900 font-bold">{product.modelCode || '—'}</span>
            </div>
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <span className="text-slate-500 block mb-1 text-[11px] font-medium font-sans">الماركة</span>
              <span className="text-slate-900 font-bold font-sans">{product.brand || '—'}</span>
            </div>
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <span className="text-slate-500 block mb-1 text-[11px] font-medium font-sans">التصنيف</span>
              <span className="text-slate-900 font-bold font-sans truncate block">{product.category || '—'}</span>
            </div>
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <span className="text-slate-500 block mb-1 text-[11px] font-medium font-sans">سعر البيع</span>
              <span className="text-slate-900 font-bold">{product.salePrice !== null ? `${product.salePrice} ج.م` : '—'}</span>
            </div>
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <span className="text-slate-500 block mb-1 text-[11px] font-medium font-sans">إجمالي المخزون</span>
              <span className="text-slate-900 font-bold">{product.totalStock}</span>
            </div>
          </div>

          {/* Stocks Breakdown */}
          <div className="space-y-2.5">
            <h4 className="text-slate-900 font-bold text-xs flex items-center justify-between">
              <span>أرصدة المخزون حسب الفروع والمواقع التشغيلية:</span>
              {ownLocationId && (
                <span className="text-[11px] text-blue-600 font-normal font-sans">
                  (فرعك الحالي: {ownLocationId})
                </span>
              )}
            </h4>
            <div className="bg-slate-50 rounded-xl border border-slate-200 divide-y divide-slate-200 font-mono text-xs max-h-44 overflow-y-auto">
              {product.stocks && Object.entries(product.stocks).map(([locId, qty]) => {
                const isOwnLoc = ownLocationId === locId;
                return (
                  <div key={locId} className={`p-3 flex items-center justify-between ${isOwnLoc ? 'bg-blue-50/40 font-bold' : ''}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-700 font-semibold">{locId}</span>
                      {isOwnLoc && (
                        <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-sans font-bold">
                          فرعك
                        </span>
                      )}
                    </div>
                    <span className={`font-bold tabular-nums ${qty > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>
                      {qty} وحدة
                    </span>
                  </div>
                );
              })}
              {(!product.stocks || Object.keys(product.stocks).length === 0) && (
                <div className="p-4 text-center text-slate-400 text-xs font-sans">
                  لا توجد تفاصيل مواقع مسجلة لهذا الصنف.
                </div>
              )}
            </div>
          </div>

          {/* SECTION 1: Similar Products ("منتجات مشابهة") */}
          <div className="space-y-3 pt-2 border-t border-slate-200">
            <div className="flex items-center justify-between">
              <h4 className="text-slate-900 font-bold text-xs flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-blue-600" />
                <span>منتجات مشابهة</span>
              </h4>
              {isAdmin && similarProducts.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowDebug(!showDebug)}
                  className="text-[10px] text-slate-400 hover:text-slate-600 flex items-center gap-1 cursor-pointer font-mono"
                  title="عرض تفاصيل تقييم الخوارزمية (Debug Mode)"
                >
                  <Bug className="w-3 h-3" />
                  <span>{showDebug ? 'إخفاء Debug' : 'Debug'}</span>
                </button>
              )}
            </div>

            {similarProducts.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {similarProducts.map((rec) => {
                  const p = rec.product;
                  const hasStock = (p.totalStock || 0) > 0;
                  return (
                    <div
                      key={p.itemCode}
                      onClick={() => handleSelectSimilar(p)}
                      className="group bg-white hover:bg-slate-50/80 border border-slate-200 hover:border-blue-400 p-3.5 rounded-xl transition-all cursor-pointer shadow-2xs hover:shadow-sm flex flex-col justify-between space-y-2.5 text-right"
                    >
                      <div>
                        <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono mb-1">
                          <span className="font-bold text-blue-600">{p.itemCode}</span>
                          <span className="truncate max-w-[100px]">{p.brand || ''}</span>
                        </div>
                        <h5 className="text-xs font-bold text-slate-900 line-clamp-2 leading-tight group-hover:text-blue-600 transition-colors" title={p.name || ''}>
                          {p.name || p.itemCode}
                        </h5>
                      </div>

                      {/* Similarity Reason Badges */}
                      {rec.reasons.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {rec.reasons.map((reason, idx) => (
                            <span 
                              key={idx}
                              className="px-1.5 py-0.5 rounded-md bg-blue-50 border border-blue-100 text-blue-700 text-[10px] font-medium"
                            >
                              {reason}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Debug breakdown for Admin only */}
                      {isAdmin && showDebug && rec.scoreBreakdown && (
                        <div className="bg-slate-100 p-1.5 rounded text-[9px] font-mono text-slate-600 space-y-0.5 border border-slate-200">
                          <div>Cat: {rec.scoreBreakdown.categoryScore} | Spec: {rec.scoreBreakdown.specScore}</div>
                          <div>Price: {rec.scoreBreakdown.priceScore} | Txt: {rec.scoreBreakdown.textScore}</div>
                          <div className="font-bold text-blue-700">Total: {rec.scoreBreakdown.totalScore} pts</div>
                        </div>
                      )}

                      {/* Price & Stock status */}
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                        <span className="font-bold font-mono text-slate-900">
                          {p.salePrice !== null ? `${p.salePrice} ج.م` : '—'}
                        </span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          hasStock 
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                            : 'bg-slate-100 text-slate-500 border border-slate-200'
                        }`}>
                          {hasStock ? `متوفر: ${p.totalStock}` : 'غير متوفر حالياً'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-4 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center text-slate-500 text-xs font-sans">
                لا توجد منتجات مشابهة كافية حالياً.
              </div>
            )}
          </div>

          {/* SECTION 2: Online Marketplace Search ("ابحث عن المنتج أونلاين") */}
          <div className="space-y-3 pt-2 border-t border-slate-200">
            <h4 className="text-slate-900 font-bold text-xs flex items-center gap-1.5">
              <ShoppingBag className="w-4 h-4 text-slate-700" />
              <span>ابحث عن المنتج أونلاين</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {MARKETPLACE_PROVIDERS.map((provider) => {
                const searchUrl = getMarketplaceSearchUrl(provider, product);
                const isDisabled = !searchUrl;

                if (isDisabled) {
                  return (
                    <button
                      key={provider.id}
                      disabled
                      className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-400 flex items-center justify-between opacity-50 cursor-not-allowed"
                    >
                      <span>{provider.nameAr}</span>
                      <ExternalLink className="w-3.5 h-3.5 text-slate-300" />
                    </button>
                  );
                }

                return (
                  <a
                    key={provider.id}
                    href={searchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-3 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-semibold text-slate-800 flex items-center justify-between transition-all cursor-pointer shadow-2xs hover:shadow-xs group"
                  >
                    <div className="flex items-center gap-2">
                      <span 
                        className="w-2 h-2 rounded-full shrink-0" 
                        style={{ backgroundColor: provider.badgeColor }}
                      />
                      <span className="font-bold">{provider.nameAr}</span>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-700 transition-colors" />
                  </a>
                );
              })}
            </div>
            {externalSearchQuery && (
              <p className="text-[11px] text-slate-400 font-mono truncate px-1">
                كلمات البحث: <span className="text-slate-600">{externalSearchQuery}</span>
              </p>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-200 bg-slate-50/70 flex items-center justify-between shrink-0">
          {onOpenPrintModal && (
            <button
              onClick={() => onOpenPrintModal(product)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer shadow-xs transition-colors"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة باركود الصنف</span>
            </button>
          )}

          <button
            onClick={onClose}
            className="px-5 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer transition-colors shadow-2xs mr-auto"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
