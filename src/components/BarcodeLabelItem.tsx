import React, { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import { NormalizedProduct } from '../types/inventory';

export type LabelPreset = 'thermal_small' | 'shelf_standard' | 'detailed_large' | 'a4_grid';

export interface LabelSettings {
  preset: LabelPreset;
  showPrice: boolean;
  showName: boolean;
  showBrandModel: boolean;
  showHeader: boolean;
  showCategory: boolean;
  copies: number;
}

interface BarcodeLabelItemProps {
  product: NormalizedProduct;
  settings: LabelSettings;
}

export const BarcodeLabelItem: React.FC<BarcodeLabelItemProps> = ({ product, settings }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  // Barcode value to encode: barcode if present, otherwise itemCode
  const barcodeValue = product.barcode || product.itemCode;

  useEffect(() => {
    if (svgRef.current && barcodeValue) {
      try {
        // Configure barcode based on label size
        const isSmall = settings.preset === 'thermal_small';
        JsBarcode(svgRef.current, barcodeValue, {
          format: 'CODE128',
          width: isSmall ? 1.4 : 1.8,
          height: isSmall ? 28 : 40,
          displayValue: true,
          font: 'monospace',
          fontSize: isSmall ? 10 : 12,
          textMargin: 1,
          margin: 0,
          background: '#ffffff',
          lineColor: '#000000',
        });
      } catch (err) {
        console.warn('JsBarcode render warning for value:', barcodeValue, err);
      }
    }
  }, [barcodeValue, settings.preset]);

  // Size styles based on preset
  if (settings.preset === 'thermal_small') {
    // 38mm x 25mm label (typical optical frame / glasses label)
    return (
      <div className="w-[38mm] h-[25mm] max-w-[38mm] max-h-[25mm] p-[1.5mm] bg-white border border-slate-300 text-black flex flex-col justify-between overflow-hidden text-center box-border print:border-0 break-inside-avoid shadow-2xs print:shadow-none select-none font-sans">
        {/* Header */}
        <div className="flex items-center justify-between text-[7px] leading-tight font-bold text-slate-700 border-b border-slate-200 pb-[0.5mm]">
          {settings.showHeader && <span className="font-extrabold text-blue-900">EYE 360</span>}
          {settings.showBrandModel && (
            <span className="truncate max-w-[24mm] text-slate-900 font-mono">
              {product.brand || product.modelCode || ''}
            </span>
          )}
        </div>

        {/* Barcode SVG */}
        <div className="flex items-center justify-center my-auto py-[0.5mm]">
          <svg ref={svgRef} className="max-w-full h-auto" />
        </div>

        {/* Footer with name & price */}
        <div className="flex items-center justify-between text-[7.5px] font-bold leading-tight pt-[0.5mm] border-t border-slate-200">
          <span className="truncate max-w-[22mm] font-sans text-slate-800" title={product.name || ''}>
            {settings.showName ? (product.name || product.itemCode) : product.itemCode}
          </span>
          {settings.showPrice && product.salePrice !== null && (
            <span className="text-black font-mono font-black shrink-0">
              {product.salePrice} ج.م
            </span>
          )}
        </div>
      </div>
    );
  }

  if (settings.preset === 'shelf_standard') {
    // 50mm x 30mm label (Shelf Talker / Price Tag)
    return (
      <div className="w-[50mm] h-[30mm] max-w-[50mm] max-h-[30mm] p-[2mm] bg-white border border-slate-300 text-black flex flex-col justify-between overflow-hidden text-center box-border print:border-0 break-inside-avoid shadow-2xs print:shadow-none select-none font-sans">
        {/* Header */}
        <div className="flex items-center justify-between text-[8px] font-bold border-b border-slate-200 pb-[1mm]">
          {settings.showHeader && <span className="text-blue-900 font-black">EYE 360</span>}
          {settings.showBrandModel && (
            <span className="text-slate-700 truncate max-w-[30mm] font-semibold">
              {product.brand ? `${product.brand} ` : ''}{product.modelCode || ''}
            </span>
          )}
        </div>

        {/* Product Name */}
        {settings.showName && (
          <div className="text-[9px] font-bold text-slate-900 truncate px-1" title={product.name || ''}>
            {product.name || product.itemCode}
          </div>
        )}

        {/* Barcode SVG */}
        <div className="flex items-center justify-center my-auto">
          <svg ref={svgRef} className="max-w-full h-auto" />
        </div>

        {/* Price & Code */}
        <div className="flex items-center justify-between text-[9px] font-bold pt-[1mm] border-t border-slate-200">
          <span className="font-mono text-slate-600 text-[8px]">{product.itemCode}</span>
          {settings.showPrice && product.salePrice !== null && (
            <span className="text-black font-mono font-black text-[11px] bg-slate-100 px-1 rounded">
              {product.salePrice} ج.م
            </span>
          )}
        </div>
      </div>
    );
  }

  if (settings.preset === 'detailed_large') {
    // 70mm x 40mm large label
    return (
      <div className="w-[70mm] h-[40mm] max-w-[70mm] max-h-[40mm] p-[3mm] bg-white border border-slate-300 text-black flex flex-col justify-between overflow-hidden text-center box-border print:border-0 break-inside-avoid shadow-2xs print:shadow-none select-none font-sans">
        <div className="flex items-center justify-between text-[10px] font-bold border-b border-slate-300 pb-1">
          {settings.showHeader && <span className="text-blue-900 font-extrabold text-[11px]">EYE 360 OPTICAL</span>}
          {settings.showCategory && <span className="text-slate-600 text-[9px]">{product.category || ''}</span>}
        </div>

        {settings.showName && (
          <div className="text-[10px] font-bold text-slate-900 truncate my-0.5 text-right px-1">
            {product.name || product.itemCode}
          </div>
        )}

        <div className="flex items-center justify-center my-auto">
          <svg ref={svgRef} className="max-w-full h-auto" />
        </div>

        <div className="flex items-center justify-between text-[10px] font-bold pt-1 border-t border-slate-300">
          <div className="text-right text-[8.5px] text-slate-600 font-mono leading-tight">
            <div>كود: {product.itemCode}</div>
            {product.modelCode && <div>موديل: {product.modelCode}</div>}
          </div>
          {settings.showPrice && product.salePrice !== null && (
            <div className="text-left font-mono font-black text-sm bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
              {product.salePrice} ج.م
            </div>
          )}
        </div>
      </div>
    );
  }

  // A4 Sheet Grid Item (approx 63.5mm x 33.8mm for standard 3x8 24-up label sheet)
  return (
    <div className="w-[63.5mm] h-[33.8mm] max-w-[63.5mm] max-h-[33.8mm] p-[2mm] bg-white border border-slate-200 text-black flex flex-col justify-between overflow-hidden text-center box-border print:border-0 break-inside-avoid shadow-2xs print:shadow-none select-none font-sans">
      <div className="flex items-center justify-between text-[8px] font-bold border-b border-slate-200 pb-0.5">
        {settings.showHeader && <span className="text-blue-900 font-black">EYE 360</span>}
        {settings.showBrandModel && (
          <span className="text-slate-700 truncate max-w-[32mm] font-semibold">
            {product.brand ? `${product.brand} ` : ''}{product.modelCode || ''}
          </span>
        )}
      </div>

      {settings.showName && (
        <div className="text-[9px] font-bold text-slate-900 truncate px-1">
          {product.name || product.itemCode}
        </div>
      )}

      <div className="flex items-center justify-center my-auto">
        <svg ref={svgRef} className="max-w-full h-auto" />
      </div>

      <div className="flex items-center justify-between text-[9px] font-bold pt-0.5 border-t border-slate-200">
        <span className="font-mono text-slate-600 text-[8px]">{product.itemCode}</span>
        {settings.showPrice && product.salePrice !== null && (
          <span className="text-black font-mono font-black text-[10px] bg-slate-100 px-1.5 py-0.2 rounded">
            {product.salePrice} ج.م
          </span>
        )}
      </div>
    </div>
  );
};
