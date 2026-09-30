import { describe, it, expect } from 'vitest';
import { NormalizedProduct } from '../types/inventory';
import { 
  MARKETPLACE_PROVIDERS, 
  buildExternalProductSearchQuery, 
  getMarketplaceSearchUrl 
} from '../constants/marketplaces';

describe('Eye 360: Marketplace Search Integration', () => {
  const sampleProduct: NormalizedProduct = {
    itemCode: 'ITEM-998877',
    name: 'Galaxy A55 8GB 256GB',
    barcode: '8806091234567',
    modelCode: 'SM-A556',
    brand: 'Samsung',
    category: 'Smartphones',
    salePrice: 14500,
    stocks: { 'MAIN': 5 },
    totalStock: 5,
    active: true,
    fingerprint: 'fp_sample',
  };

  it('1. builds clean search query and strictly excludes internal itemCode', () => {
    const query = buildExternalProductSearchQuery(sampleProduct);
    expect(query).not.toContain('ITEM-998877');
    expect(query).toContain('Samsung');
    expect(query).toContain('Galaxy A55');
    expect(query).toContain('SM-A556');
  });

  it('2. deduplicates repeated words cleanly', () => {
    const prod: Partial<NormalizedProduct> = {
      brand: 'Sony',
      name: 'Sony WH-1000XM5 Headphones Sony',
      modelCode: 'WH-1000XM5',
    };
    const query = buildExternalProductSearchQuery(prod);
    const words = query.split(' ');
    // 'Sony' and 'WH-1000XM5' should appear once only
    const sonyCount = words.filter(w => w.toLowerCase() === 'sony').length;
    const modelCount = words.filter(w => w.toLowerCase() === 'wh-1000xm5').length;
    expect(sonyCount).toBe(1);
    expect(modelCount).toBe(1);
  });

  it('3. generates correct Amazon Egypt search URL with URL encoding', () => {
    const amazon = MARKETPLACE_PROVIDERS.find(p => p.id === 'amazon')!;
    expect(amazon).toBeDefined();

    const url = getMarketplaceSearchUrl(amazon, sampleProduct);
    expect(url).toBeDefined();
    expect(url).toContain('https://www.amazon.eg/s?k=');
    expect(url).toContain(encodeURIComponent('Samsung'));
    expect(url).not.toContain('ITEM-998877');
  });

  it('4. generates correct noon Egypt search URL', () => {
    const noon = MARKETPLACE_PROVIDERS.find(p => p.id === 'noon')!;
    expect(noon).toBeDefined();

    const url = getMarketplaceSearchUrl(noon, sampleProduct);
    expect(url).toBeDefined();
    expect(url).toContain('https://www.noon.com/egypt-en/search?q=');
    expect(url).toContain(encodeURIComponent('Samsung'));
  });

  it('5. generates correct Jumia Egypt search URL', () => {
    const jumia = MARKETPLACE_PROVIDERS.find(p => p.id === 'jumia')!;
    expect(jumia).toBeDefined();

    const url = getMarketplaceSearchUrl(jumia, sampleProduct);
    expect(url).toBeDefined();
    expect(url).toContain('https://www.jumia.com.eg/catalog/?q=');
    expect(url).toContain(encodeURIComponent('Samsung'));
  });

  it('6. falls back to brand and modelCode when name is missing', () => {
    const prodNoName: Partial<NormalizedProduct> = {
      brand: 'Ray-Ban',
      modelCode: 'RB3025',
    };
    const query = buildExternalProductSearchQuery(prodNoName);
    expect(query).toBe('Ray-Ban RB3025');
  });

  it('7. returns null URL when query cannot be built safely', () => {
    const emptyProd: Partial<NormalizedProduct> = {};
    const amazon = MARKETPLACE_PROVIDERS.find(p => p.id === 'amazon')!;
    const url = getMarketplaceSearchUrl(amazon, emptyProd as NormalizedProduct);
    expect(url).toBeNull();
  });
});
