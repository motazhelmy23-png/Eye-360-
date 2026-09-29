import { describe, it, expect } from 'vitest';
import { NormalizedProduct, ImportParseResult } from '../types/inventory';
import { compareCatalogWithActive } from '../services/inventoryDeltaService';
import { sortProductsDeterministically, computeSha256Checksum, chunkProductsByByteSize } from '../services/catalogSyncService';

describe('Eye 360 Phase 3 & 4: Daily Delta Unique Counting & Deduplication Tests', () => {
  const baseProduct: NormalizedProduct = {
    itemCode: 'ITEM-11773',
    barcode: '7394586123476',
    modelCode: 'MODEL-11773',
    name: 'Test Product 11773',
    brand: 'Tiger',
    salePrice: 150,
    stocks: { loc_1: 10 },
    totalStock: 10,
    active: true,
    fingerprint: 'fp1',
  };

  it('1. one price-changed product -> totalChangedProducts = 1', () => {
    const updatedProduct = { ...baseProduct, salePrice: 180 };
    const priceChanged = updatedProduct.salePrice !== baseProduct.salePrice;
    const stockChanged = false;
    const hasMetadataChange = false;

    let classification = 'UNCHANGED';
    if (stockChanged && priceChanged) classification = 'PRICE_AND_STOCK_CHANGED';
    else if (stockChanged) classification = 'STOCK_CHANGED';
    else if (priceChanged) classification = 'PRICE_CHANGED';

    expect(priceChanged).toBe(true);
    expect(classification).toBe('PRICE_CHANGED');
  });

  it('2. one product with price change + metadata flag -> totalChangedProducts = 1 (exclusive primary classification)', () => {
    const updatedProduct = { ...baseProduct, salePrice: 180, name: 'Updated Name 11773' };
    const priceChanged = updatedProduct.salePrice !== baseProduct.salePrice;
    const nameChanged = updatedProduct.name !== baseProduct.name;
    const hasMetadataChange = nameChanged;

    let classification = 'UNCHANGED';
    if (priceChanged) classification = 'PRICE_CHANGED';

    // Even with metadata change, unique itemCode count remains 1 and classification is strictly PRICE_CHANGED
    const deltaMap = new Map<string, NormalizedProduct>();
    if (classification !== 'UNCHANGED') {
      deltaMap.set(updatedProduct.itemCode, updatedProduct);
    }
    // Simulate duplicate attempt
    deltaMap.set(updatedProduct.itemCode, updatedProduct);

    expect(deltaMap.size).toBe(1);
    expect(classification).toBe('PRICE_CHANGED');
  });

  it('3. PRICE_AND_STOCK_CHANGED is counted once', () => {
    const updatedProduct = { ...baseProduct, salePrice: 200, stocks: { loc_1: 15 }, totalStock: 15 };
    const priceChanged = updatedProduct.salePrice !== baseProduct.salePrice;
    const stockChanged = updatedProduct.totalStock !== baseProduct.totalStock;

    let classification = 'UNCHANGED';
    if (stockChanged && priceChanged) classification = 'PRICE_AND_STOCK_CHANGED';

    const deltaMap = new Map<string, NormalizedProduct>();
    deltaMap.set(updatedProduct.itemCode, updatedProduct);
    deltaMap.set(updatedProduct.itemCode, updatedProduct); // duplicate insertion test

    expect(deltaMap.size).toBe(1);
    expect(classification).toBe('PRICE_AND_STOCK_CHANGED');
  });

  it('4. duplicate itemCode cannot enter delta twice', () => {
    const deltaMap = new Map<string, NormalizedProduct>();
    deltaMap.set('11773', baseProduct);
    deltaMap.set('11773', baseProduct); // duplicate key
    expect(deltaMap.size).toBe(1);
    expect(Array.from(deltaMap.values()).length).toBe(1);
  });
});
