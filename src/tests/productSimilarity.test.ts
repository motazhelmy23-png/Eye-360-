import { describe, it, expect } from 'vitest';
import { NormalizedProduct } from '../types/inventory';
import { 
  extractProductSpecs, 
  compareSpecs, 
  findSimilarProducts, 
  normalizeText 
} from '../utils/productSimilarity';

describe('Eye 360: Product Similarity Engine', () => {
  const createTestProduct = (overrides: Partial<NormalizedProduct>): NormalizedProduct => ({
    itemCode: 'ITEM-DEFAULT',
    name: 'Default Product Name',
    barcode: null,
    modelCode: null,
    brand: null,
    category: null,
    salePrice: 1000,
    stocks: { 'MAIN': 1 },
    totalStock: 1,
    active: true,
    fingerprint: 'fp_default',
    ...overrides,
  });

  // Test 1: Arabic and English Spec Extraction
  describe('Technical Spec Extraction', () => {
    it('extracts RAM in English and Arabic', () => {
      expect(extractProductSpecs({ name: 'Samsung Galaxy A55 8GB RAM 256GB' }).ramGb).toBe(8);
      expect(extractProductSpecs({ name: 'شاومي ريدمي نوت 13 رام 8 جيجا' }).ramGb).toBe(8);
      expect(extractProductSpecs({ name: 'Realme 12 Pro (RAM 12GB)' }).ramGb).toBe(12);
      expect(extractProductSpecs({ name: 'هاتف سامسونج 4 جيجا رام' }).ramGb).toBe(4);
    });

    it('extracts Storage / ROM in English and Arabic', () => {
      expect(extractProductSpecs({ name: 'iPhone 15 Pro Max 256GB' }).storageGb).toBe(256);
      expect(extractProductSpecs({ name: 'لابتوب ديل مساحة 512 جيجا' }).storageGb).toBe(512);
      expect(extractProductSpecs({ name: 'هارد خارجي 1TB' }).storageGb).toBe(1024);
      expect(extractProductSpecs({ name: 'سامسونج A15 ذاكرة 128' }).storageGb).toBe(128);
    });

    it('extracts Power / Wattage in English and Arabic', () => {
      expect(extractProductSpecs({ name: 'مكنسة توشيبا 2000W كهربائية' }).wattage).toBe(2000);
      expect(extractProductSpecs({ name: 'مكنسة باناسونيك 2100 Watt' }).wattage).toBe(2100);
      expect(extractProductSpecs({ name: 'مكنسة كينوود 1800 وات' }).wattage).toBe(1800);
      expect(extractProductSpecs({ name: 'غلاية مياه 2200 واط' }).wattage).toBe(2200);
    });

    it('extracts Screen Size in English and Arabic', () => {
      expect(extractProductSpecs({ name: 'شاشة سامسونج 55 بوصة سمارت' }).screenInches).toBe(55);
      expect(extractProductSpecs({ name: 'LG 65" OLED 4K TV' }).screenInches).toBe(65);
      expect(extractProductSpecs({ name: 'تلفزيون تورنيدو 43 بوصه LED' }).screenInches).toBe(43);
    });

    it('extracts Volume, Weight, Horsepower, and BTU', () => {
      expect(extractProductSpecs({ name: 'قلاية هوائية فيليبس 1.5L' }).volumeLiters).toBe(1.5);
      expect(extractProductSpecs({ name: 'ميكروويف 20 لتر ديجيتال' }).volumeLiters).toBe(20);
      expect(extractProductSpecs({ name: 'غسالة ال جي 7kg أوتوماتيك' }).weightKg).toBe(7);
      expect(extractProductSpecs({ name: 'غسالة زانوسي 10 كجم' }).weightKg).toBe(10);
      expect(extractProductSpecs({ name: 'تكييف كاريير 1.5 HP سبليت' }).horsepower).toBe(1.5);
      expect(extractProductSpecs({ name: 'تكييف شارب 2.25 حصان بارد' }).horsepower).toBe(2.25);
      expect(extractProductSpecs({ name: 'تكييف 18000 BTU انفرتر' }).btu).toBe(18000);
    });
  });

  // Test 2: Phone RAM Matching
  describe('Phone Recommendations (RAM & Specs prioritization)', () => {
    const targetPhone = createTestProduct({
      itemCode: '00100',
      name: 'Samsung Galaxy A55 8GB RAM 128GB',
      barcode: '00100200300',
      modelCode: 'SM-A556',
      brand: 'Samsung',
      category: 'Smartphones',
      salePrice: 10000,
      stocks: { 'MAIN': 5 },
      totalStock: 5,
    });

    const candidateSameRam = createTestProduct({
      itemCode: '00101',
      name: 'Xiaomi Redmi Note 13 Pro 8GB RAM 256GB',
      barcode: '00101200301',
      modelCode: 'REDMI-13',
      brand: 'Xiaomi',
      category: 'Smartphones',
      salePrice: 10500,
      stocks: { 'MAIN': 2 },
      totalStock: 2,
    });

    const candidateDiffRam = createTestProduct({
      itemCode: '00102',
      name: 'Samsung Galaxy A15 4GB RAM 128GB',
      barcode: '00102200302',
      modelCode: 'SM-A155',
      brand: 'Samsung',
      category: 'Smartphones',
      salePrice: 9900,
      stocks: { 'MAIN': 10 },
      totalStock: 10,
    });

    const otherCatalog: NormalizedProduct[] = [
      targetPhone,
      candidateSameRam,
      candidateDiffRam,
    ];

    it('favors another 8GB phone over a 4GB phone with close price', () => {
      const recommendations = findSimilarProducts(targetPhone, otherCatalog);
      expect(recommendations.length).toBe(2);
      // The 8GB phone should rank first
      expect(recommendations[0].product.itemCode).toBe('00101');
      expect(recommendations[0].reasons).toContain('رام 8 جيجا');
    });

    it('strictly excludes the current product itself by itemCode', () => {
      const recommendations = findSimilarProducts(targetPhone, otherCatalog);
      const itemCodes = recommendations.map(r => r.product.itemCode);
      expect(itemCodes).not.toContain(targetPhone.itemCode);
    });
  });

  // Test 3: Vacuum Wattage Matching
  describe('Vacuum Recommendations (Wattage & Power)', () => {
    const targetVacuum = createTestProduct({
      itemCode: 'VAC-001',
      name: 'مكنسة توشيبا 2000W كهربائية بكيس',
      barcode: 'VAC001BAR',
      modelCode: 'VC-EA200',
      brand: 'Toshiba',
      category: 'Vacuums',
      salePrice: 5000,
      stocks: { 'MAIN': 4 },
      totalStock: 4,
    });

    const vacuum2100W = createTestProduct({
      itemCode: 'VAC-002',
      name: 'مكنسة باناسونيك 2100W ياباني',
      barcode: 'VAC002BAR',
      modelCode: 'MC-CG713',
      brand: 'Panasonic',
      category: 'Vacuums',
      salePrice: 5400,
      stocks: { 'MAIN': 3 },
      totalStock: 3,
    });

    const vacuum1800W = createTestProduct({
      itemCode: 'VAC-003',
      name: 'مكنسة كينوود 1800W بدون كيس',
      barcode: 'VAC003BAR',
      modelCode: 'VBP80',
      brand: 'Kenwood',
      category: 'Vacuums',
      salePrice: 4800,
      stocks: { 'MAIN': 1 },
      totalStock: 1,
    });

    const vacuum800W = createTestProduct({
      itemCode: 'VAC-004',
      name: 'مكنسة يدوية صغيرة 800W للسيارة',
      barcode: 'VAC004BAR',
      modelCode: 'ADV1200',
      brand: 'Black&Decker',
      category: 'Vacuums',
      salePrice: 4950, // Close price, but weak wattage match
      stocks: { 'MAIN': 10 },
      totalStock: 10,
    });

    const vacuumCatalog = [targetVacuum, vacuum2100W, vacuum1800W, vacuum800W];

    it('favors 2100W and 1800W vacuums over 800W vacuum with close price', () => {
      const recommendations = findSimilarProducts(targetVacuum, vacuumCatalog);
      expect(recommendations.length).toBe(3);
      // High wattage vacuums should occupy the top ranks
      const topCodes = [recommendations[0].product.itemCode, recommendations[1].product.itemCode];
      expect(topCodes).toContain('VAC-002');
      expect(topCodes).toContain('VAC-003');
    });
  });

  // Test 4: Category Barrier & Price Proximity
  describe('Category Barrier & Constraints', () => {
    const targetTV = createTestProduct({
      itemCode: 'TV-001',
      name: 'شاشة تورنيدو 55 بوصة سمارت 4K',
      barcode: 'TV001BAR',
      modelCode: '55UA1400E',
      brand: 'Tornado',
      category: 'Televisions',
      salePrice: 15000,
      stocks: { 'MAIN': 2 },
      totalStock: 2,
    });

    const vacuumSamePrice = createTestProduct({
      itemCode: 'VAC-999',
      name: 'مكنسة كهربائية احترافية',
      barcode: 'VAC999BAR',
      modelCode: 'WD3',
      brand: 'Karcher',
      category: 'Vacuums',
      salePrice: 15000, // Exact same price as TV
      stocks: { 'MAIN': 5 },
      totalStock: 5,
    });

    const tvOtherBrand = createTestProduct({
      itemCode: 'TV-002',
      name: 'شاشة سامسونج 55 بوصة Crystal UHD',
      barcode: 'TV002BAR',
      modelCode: '55CU7000',
      brand: 'Samsung',
      category: 'Televisions',
      salePrice: 16500,
      stocks: { 'MAIN': 1 },
      totalStock: 1,
    });

    const tvZeroStock = createTestProduct({
      itemCode: 'TV-003',
      name: 'شاشة ال جي 55 بوصة نانوسيل',
      barcode: 'TV003BAR',
      modelCode: '55NANO776RA',
      brand: 'LG',
      category: 'Televisions',
      salePrice: 15500,
      stocks: { 'MAIN': 0 },
      totalStock: 0, // Zero stock
    });

    it('price cannot overpower category mismatch (vacuum is never recommended for TV)', () => {
      const recommendations = findSimilarProducts(targetTV, [targetTV, vacuumSamePrice, tvOtherBrand, tvZeroStock]);
      const codes = recommendations.map(r => r.product.itemCode);
      expect(codes).not.toContain('VAC-999');
      expect(codes).toContain('TV-002');
    });

    it('handles zero-stock candidates gracefully', () => {
      const recommendations = findSimilarProducts(targetTV, [targetTV, tvOtherBrand, tvZeroStock]);
      const zeroStockRec = recommendations.find(r => r.product.itemCode === 'TV-003');
      expect(zeroStockRec).toBeDefined();
      expect(zeroStockRec?.product.totalStock).toBe(0);
    });

    it('returns at most 3 recommendations', () => {
      const extraTvs: NormalizedProduct[] = Array.from({ length: 10 }).map((_, i) => createTestProduct({
        itemCode: `TV-EXTRA-${i}`,
        name: `شاشة سمارت ${50 + i} بوصة`,
        barcode: `TVEXTRA${i}`,
        modelCode: `MOD-${i}`,
        brand: 'Generic',
        category: 'Televisions',
        salePrice: 14000 + i * 500,
        stocks: { 'MAIN': 1 },
        totalStock: 1,
      }));

      const recommendations = findSimilarProducts(targetTV, [targetTV, ...extraTvs]);
      expect(recommendations.length).toBe(3);
    });

    it('handles missing/null prices safely without errors', () => {
      const prodNoPrice = createTestProduct({
        itemCode: 'NO-PRICE-1',
        name: 'منتج بدون سعر',
        category: 'Accessories',
        salePrice: null,
        stocks: {},
        totalStock: 0,
      });

      const cand = createTestProduct({
        itemCode: 'NO-PRICE-2',
        name: 'منتج ملحق إضافي',
        category: 'Accessories',
        salePrice: null,
        stocks: {},
        totalStock: 0,
      });

      expect(() => findSimilarProducts(prodNoPrice, [prodNoPrice, cand])).not.toThrow();
    });

    it('preserves leading zeros in itemCode and barcode untouched', () => {
      const leadingZeroProd = createTestProduct({
        itemCode: '00042',
        barcode: '000123456789',
        name: 'قطعة غيار برمز صفري',
        category: 'Spare Parts',
        salePrice: 150,
        stocks: { 'MAIN': 2 },
        totalStock: 2,
      });

      const cand = createTestProduct({
        itemCode: '00043',
        barcode: '000123456790',
        name: 'قطعة غيار مماثلة برمز صفري',
        category: 'Spare Parts',
        salePrice: 160,
        stocks: { 'MAIN': 3 },
        totalStock: 3,
      });

      const recs = findSimilarProducts(leadingZeroProd, [leadingZeroProd, cand]);
      expect(recs[0].product.itemCode).toBe('00043');
      expect(recs[0].product.barcode).toBe('000123456790');
    });
  });
});
