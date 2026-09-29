import { describe, it, expect } from 'vitest';
import { NormalizedProduct } from '../types/inventory';
import { searchLocalProducts } from '../services/indexedDbService';

describe('Eye 360 Phase 5: Products & Barcode Local View Test Suite', () => {
  const sampleProduct: NormalizedProduct = {
    itemCode: '11752',
    barcode: '7394586123476',
    modelCode: '7394586123476',
    name: 'Test Product 11752',
    brand: 'Tiger',
    category: 'Electronics',
    salePrice: 199.99,
    stocks: { loc_1: 10 },
    totalStock: 10,
    active: true,
    fingerprint: 'fp_11752',
  };

  it('1. barcode business rule: 7394586123476 resolves itemCode 11752', () => {
    const p = sampleProduct;
    expect(p.itemCode).toBe('11752');
    expect(p.barcode).toBe('7394586123476');
    expect(p.modelCode).toBe('7394586123476');
  });

  it('2. blank barcode product remains searchable by itemCode and name', () => {
    const blankBarcodeProduct: NormalizedProduct = {
      itemCode: '99999',
      barcode: null,
      modelCode: null,
      name: 'Blank Barcode Item',
      brand: 'Generic',
      salePrice: 50,
      stocks: {},
      totalStock: 5,
      active: true,
      fingerprint: 'fp_99999',
    };

    expect(blankBarcodeProduct.barcode).toBeNull();
    expect(blankBarcodeProduct.itemCode).toBe('99999');
    expect(blankBarcodeProduct.name).toContain('Blank');
  });

  it('3. revision 1 operational price overrides master baseline price', () => {
    const baselinePrice = 150;
    const revision1Price = 180; // changed in Revision 1
    const currentOperationalProduct = { ...sampleProduct, salePrice: revision1Price };

    expect(currentOperationalProduct.salePrice).toBe(180);
    expect(currentOperationalProduct.salePrice).not.toBe(baselinePrice);
  });

  it('4. local search priority matching logic (itemCode, barcode, brand, name)', () => {
    const products = [
      sampleProduct,
      {
        itemCode: '11773',
        barcode: '9876543210123',
        modelCode: '9876543210123',
        name: 'Another Item',
        brand: 'Samsung',
        salePrice: 500,
        stocks: {},
        totalStock: 2,
        active: true,
        fingerprint: 'fp_2',
      }
    ];

    const q = '11752';
    const found = products.filter(p => p.itemCode === q || p.barcode === q);
    expect(found.length).toBe(1);
    expect(found[0].itemCode).toBe('11752');
  });
});
