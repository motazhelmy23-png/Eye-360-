import JsBarcode from 'jsbarcode';
import { NormalizedProduct } from '../types/inventory';
import { LabelPreset, LabelSettings } from '../components/BarcodeLabelItem';

/**
 * Generates an SVG string representation of a CODE128 barcode
 */
export function generateBarcodeSvg(
  value: string,
  options: { width?: number; height?: number; fontSize?: number; displayValue?: boolean } = {}
): string {
  if (!value || typeof document === 'undefined') {
    return `<div style="font-family: monospace; font-size: 10px; font-weight: bold;">*${value || 'NO-CODE'}*</div>`;
  }

  try {
    const svgNode = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    JsBarcode(svgNode, value, {
      format: 'CODE128',
      width: options.width ?? 1.4,
      height: options.height ?? 30,
      displayValue: options.displayValue ?? true,
      font: 'monospace',
      fontSize: options.fontSize ?? 10,
      textMargin: 1,
      margin: 0,
      background: '#ffffff',
      lineColor: '#000000',
    });
    return svgNode.outerHTML;
  } catch (err) {
    console.warn('JsBarcode SVG generation warning:', err);
    // Fallback simple display
    return `<div style="font-family: monospace; font-size: 11px; font-weight: bold; border: 1px dashed #999; padding: 4px; text-align: center;">${value}</div>`;
  }
}

/**
 * Builds HTML for an individual label item according to preset & settings
 */
export function renderLabelHtml(product: NormalizedProduct, settings: LabelSettings): string {
  const barcodeValue = product.barcode || product.itemCode;
  const isSmall = settings.preset === 'thermal_small';
  const isLarge = settings.preset === 'detailed_large';
  const isShelf = settings.preset === 'shelf_standard';

  const barcodeSvg = generateBarcodeSvg(barcodeValue, {
    width: isSmall ? 1.3 : isLarge ? 1.8 : 1.5,
    height: isSmall ? 26 : isLarge ? 42 : 32,
    fontSize: isSmall ? 9 : 11,
    displayValue: true,
  });

  const headerHtml = settings.showHeader
    ? `<span style="font-weight: 900; color: #1e3a8a; font-size: ${isSmall ? '7px' : '9px'};">EYE 360</span>`
    : '';

  const brandModelText = product.brand
    ? `${product.brand} ${product.modelCode || ''}`.trim()
    : product.modelCode || '';

  const brandModelHtml = settings.showBrandModel && brandModelText
    ? `<span style="font-family: monospace; font-weight: 600; color: #334155; font-size: ${isSmall ? '7px' : '8.5px'}; max-width: 65%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${brandModelText}</span>`
    : '';

  const nameHtml = settings.showName
    ? `<div style="font-size: ${isSmall ? '7.5px' : isLarge ? '10px' : '8.5px'}; font-weight: 700; color: #0f172a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin: 1px 0;" title="${product.name || ''}">${product.name || product.itemCode}</div>`
    : '';

  const priceHtml = settings.showPrice && product.salePrice !== null
    ? `<span style="font-family: monospace; font-weight: 900; font-size: ${isSmall ? '8px' : isLarge ? '13px' : '10px'}; color: #000000; background: ${isSmall ? 'transparent' : '#f1f5f9'}; padding: 1px 4px; border-radius: 3px;">${product.salePrice} ج.م</span>`
    : '';

  const codeHtml = `<span style="font-family: monospace; font-size: ${isSmall ? '7px' : '8px'}; color: #475569; font-weight: 600;">${product.itemCode}</span>`;

  if (settings.preset === 'thermal_small') {
    return `
      <div class="label-box label-thermal-small">
        <div class="label-header">
          ${headerHtml}
          ${brandModelHtml}
        </div>
        <div class="label-barcode">
          ${barcodeSvg}
        </div>
        <div class="label-footer">
          <span style="max-width: 60%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 7.5px; font-weight: 700;">
            ${settings.showName ? (product.name || product.itemCode) : product.itemCode}
          </span>
          ${priceHtml}
        </div>
      </div>
    `;
  }

  if (settings.preset === 'shelf_standard') {
    return `
      <div class="label-box label-shelf-standard">
        <div class="label-header">
          ${headerHtml}
          ${brandModelHtml}
        </div>
        ${nameHtml}
        <div class="label-barcode">
          ${barcodeSvg}
        </div>
        <div class="label-footer">
          ${codeHtml}
          ${priceHtml}
        </div>
      </div>
    `;
  }

  if (settings.preset === 'detailed_large') {
    const categoryHtml = settings.showCategory && product.category
      ? `<span style="font-size: 9px; color: #64748b; font-weight: 600;">${product.category}</span>`
      : '';

    return `
      <div class="label-box label-detailed-large">
        <div class="label-header">
          <span style="font-weight: 900; color: #1e3a8a; font-size: 11px;">EYE 360 OPTICAL</span>
          ${categoryHtml}
        </div>
        ${nameHtml}
        <div class="label-barcode">
          ${barcodeSvg}
        </div>
        <div class="label-footer" style="padding-top: 2px; border-top: 1px solid #cbd5e1;">
          <div style="text-align: right; font-size: 8.5px; font-family: monospace; color: #475569; line-height: 1.2;">
            <div>كود: <strong>${product.itemCode}</strong></div>
            ${product.modelCode ? `<div>موديل: ${product.modelCode}</div>` : ''}
          </div>
          ${priceHtml}
        </div>
      </div>
    `;
  }

  // A4 Grid Label (approx 63.5 x 33.8 mm)
  return `
    <div class="label-box label-a4-cell">
      <div class="label-header">
        ${headerHtml}
        ${brandModelHtml}
      </div>
      ${nameHtml}
      <div class="label-barcode">
        ${barcodeSvg}
      </div>
      <div class="label-footer">
        ${codeHtml}
        ${priceHtml}
      </div>
    </div>
  `;
}

/**
 * Builds the complete standalone HTML document with embedded CSS & page styles
 */
export function buildPrintableHtmlDocument(
  products: NormalizedProduct[],
  settings: LabelSettings
): string {
  // Multiply products by copies
  const itemsToPrint: NormalizedProduct[] = [];
  products.forEach((p) => {
    for (let i = 0; i < settings.copies; i++) {
      itemsToPrint.push(p);
    }
  });

  const labelsHtml = itemsToPrint
    .map((p) => renderLabelHtml(p, settings))
    .join('\n');

  let pageCss = '';
  if (settings.preset === 'thermal_small') {
    pageCss = `
      @page {
        size: 38mm 25mm;
        margin: 0;
      }
      body {
        margin: 0;
        padding: 0;
      }
      .labels-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0;
      }
      .label-box {
        page-break-after: always;
        break-after: page;
      }
    `;
  } else if (settings.preset === 'shelf_standard') {
    pageCss = `
      @page {
        size: 50mm 30mm;
        margin: 0;
      }
      body {
        margin: 0;
        padding: 0;
      }
      .labels-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0;
      }
      .label-box {
        page-break-after: always;
        break-after: page;
      }
    `;
  } else if (settings.preset === 'detailed_large') {
    pageCss = `
      @page {
        size: 70mm 40mm;
        margin: 0;
      }
      body {
        margin: 0;
        padding: 0;
      }
      .labels-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0;
      }
      .label-box {
        page-break-after: always;
        break-after: page;
      }
    `;
  } else {
    // a4_grid
    pageCss = `
      @page {
        size: A4 portrait;
        margin: 8mm 6mm;
      }
      body {
        margin: 0;
        padding: 0;
      }
      .labels-container {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 2.5mm;
        width: 100%;
        box-sizing: border-box;
      }
      .label-box {
        break-inside: avoid;
        page-break-inside: avoid;
      }
    `;
  }

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>طباعة ملصقات الباركود — EYE 360</title>
  <style>
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: #ffffff;
      color: #000000;
      direction: rtl;
    }

    .label-box {
      background: #ffffff;
      color: #000000;
      border: 1px solid #e2e8f0;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      text-align: center;
      overflow: hidden;
    }

    @media print {
      .label-box {
        border: none !important;
      }
    }

    .label-thermal-small {
      width: 38mm;
      height: 25mm;
      max-width: 38mm;
      max-height: 25mm;
      padding: 1.5mm;
    }

    .label-shelf-standard {
      width: 50mm;
      height: 30mm;
      max-width: 50mm;
      max-height: 30mm;
      padding: 2mm;
    }

    .label-detailed-large {
      width: 70mm;
      height: 40mm;
      max-width: 70mm;
      max-height: 40mm;
      padding: 3mm;
    }

    .label-a4-cell {
      width: 100%;
      height: 33.5mm;
      padding: 2mm;
      border: 1px dashed #cbd5e1;
      border-radius: 4px;
    }

    .label-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 1px;
      line-height: 1;
    }

    .label-barcode {
      display: flex;
      align-items: center;
      justify-content: center;
      margin: auto 0;
      padding: 1px 0;
    }

    .label-barcode svg {
      max-width: 100%;
      height: auto;
      display: block;
    }

    .label-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-top: 1px solid #e2e8f0;
      padding-top: 1px;
      line-height: 1;
    }

    ${pageCss}
  </style>
</head>
<body>
  <div class="labels-container">
    ${labelsHtml}
  </div>
</body>
</html>`;
}

/**
 * Executes a clean browser print job via a hidden isolated iframe.
 * Falls back to window.print() if iframe printing is restricted.
 */
export async function executePrintLabels(
  products: NormalizedProduct[],
  settings: LabelSettings
): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const html = buildPrintableHtmlDocument(products, settings);

      // Create an isolated hidden iframe
      const iframe = document.createElement('iframe');
      iframe.setAttribute('title', 'Print Labels Frame');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.style.opacity = '0';
      iframe.style.pointerEvents = 'none';
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document || iframe.contentDocument;
      if (!doc) {
        window.print();
        resolve(true);
        return;
      }

      doc.open();
      doc.write(html);
      doc.close();

      // Allow fonts and SVG layout to settle, then invoke print
      setTimeout(() => {
        try {
          if (iframe.contentWindow) {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            resolve(true);
          } else {
            window.print();
            resolve(true);
          }
        } catch (printErr) {
          console.warn('Iframe print failed, calling window.print directly:', printErr);
          window.print();
          resolve(true);
        } finally {
          // Cleanup after 4 seconds
          setTimeout(() => {
            if (iframe.parentNode) {
              iframe.parentNode.removeChild(iframe);
            }
          }, 4000);
        }
      }, 300);
    } catch (err) {
      console.error('Print execution error:', err);
      window.print();
      resolve(false);
    }
  });
}
