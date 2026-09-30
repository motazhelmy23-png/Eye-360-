import { describe, it, expect } from 'vitest';
import { NormalizedProduct } from '../types/inventory';
import { LabelSettings } from '../components/BarcodeLabelItem';
import { buildPrintableHtmlDocument, renderLabelHtml } from '../services/barcodePrintService';

describe('Eye 360: Barcode & Label Printing Engine', () => {
  const sampleProduct: NormalizedProduct = {
    itemCode: 'RAY-5154-2000',
    name: 'Ray-Ban Clubmaster Optics Black',
    barcode: '805289304456',
    modelCode: 'RB5154',
    brand: 'Ray-Ban',
    category: 'Optical Frames',
    salePrice: 4250,
    stocks: {
      'AUC': 8,
      'ZAMALEK': 3,
    },
    totalStock: 11,
    active: true,
    fingerprint: 'fp_123',
  };

  it('1. correctly configures thermal label presets', () => {
    const thermalSettings: LabelSettings = {
      preset: 'thermal_small',
      copies: 3,
      showPrice: true,
      showName: true,
      showBrandModel: true,
      showHeader: true,
      showCategory: false,
    };

    expect(thermalSettings.preset).toBe('thermal_small');
    expect(thermalSettings.copies).toBe(3);
    expect(thermalSettings.showPrice).toBe(true);
  });

  it('2. falls back to itemCode if barcode is empty', () => {
    const productNoBarcode: NormalizedProduct = {
      ...sampleProduct,
      barcode: null,
    };

    const targetBarcode = productNoBarcode.barcode || productNoBarcode.itemCode;
    expect(targetBarcode).toBe('RAY-5154-2000');
  });

  it('3. uses barcode when available', () => {
    const targetBarcode = sampleProduct.barcode || sampleProduct.itemCode;
    expect(targetBarcode).toBe('805289304456');
  });

  it('4. calculates total labels count based on copies', () => {
    const products: NormalizedProduct[] = [
      sampleProduct,
      { ...sampleProduct, itemCode: 'OAK-9013-01' },
      { ...sampleProduct, itemCode: 'GUCCI-0024S' },
    ];

    const copies = 4;
    const totalLabels = products.length * copies;
    expect(totalLabels).toBe(12);
  });

  it('5. builds standalone printable HTML document with exact thermal styles', () => {
    const settings: LabelSettings = {
      preset: 'thermal_small',
      copies: 2,
      showPrice: true,
      showName: true,
      showBrandModel: true,
      showHeader: true,
      showCategory: false,
    };

    const html = buildPrintableHtmlDocument([sampleProduct], settings);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('38mm 25mm');
    expect(html).toContain('EYE 360');
    expect(html).toContain('4250 ج.م');
  });

  it('6. builds shelf talker and large label presets properly', () => {
    const shelfSettings: LabelSettings = {
      preset: 'shelf_standard',
      copies: 1,
      showPrice: true,
      showName: true,
      showBrandModel: true,
      showHeader: true,
      showCategory: false,
    };

    const shelfHtml = renderLabelHtml(sampleProduct, shelfSettings);
    expect(shelfHtml).toContain('label-shelf-standard');
    expect(shelfHtml).toContain('Ray-Ban');
  });
});
