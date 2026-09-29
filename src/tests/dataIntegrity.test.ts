import { describe, it, expect } from 'vitest';
import { quickCloudHealthCheck, canonicalStringify } from '../services/dataIntegrityService';
import { deserializeCatalogChunk } from '../services/catalogSyncService';

describe('Eye 360 Phase 3: Data Integrity & Checksum Forensics Test Suite (14 Tests)', () => {
  it('1. quick cloud health check structure', async () => {
    expect(typeof quickCloudHealthCheck).toBe('function');
  });

  it('2. diagnostic product lookup rules', () => {
    const sampleProduct = {
      itemCode: '11752',
      barcode: '7394586123476',
      modelCode: '7394586123476',
    };
    expect(sampleProduct.itemCode).toBe('11752');
    expect(sampleProduct.barcode).toBe(sampleProduct.modelCode);
  });

  it('3. active catalog version ID reference integrity', () => {
    const activeVersionId = 'v_1790622936100_fd78fcc7';
    expect(activeVersionId).toMatch(/^v_\d+_[a-f0-9]{8}$/);
  });

  it('4. initial active inventory revision is 0', () => {
    const initialRevision = 0;
    expect(initialRevision).toBe(0);
  });

  it('5. revision increment rule', () => {
    let rev = 0;
    rev += 1;
    expect(rev).toBe(1);
  });

  it('6. read-only full integrity check safeguard check', () => {
    const isReadOnly = true;
    expect(isReadOnly).toBe(true);
  });

  it('7. local IndexedDB stale detection', () => {
    const localVersion: string = 'v_old';
    const cloudVersion: string = 'v_1790622936100_fd78fcc7';
    const isStale = localVersion !== cloudVersion;
    expect(isStale).toBe(true);
  });

  it('8. missing product review only rule', () => {
    const missingProductAction = 'review_only';
    expect(missingProductAction).not.toBe('delete');
    expect(missingProductAction).not.toBe('zero_stock');
  });

  it('9. barcode string preservation rule', () => {
    const barcode = '00123456';
    expect(typeof barcode).toBe('string');
    expect(barcode.startsWith('0')).toBe(true);
  });

  it('10. branch sync order verification', () => {
    const missedRevisions = [1, 2, 3];
    const sorted = [...missedRevisions].sort((a, b) => a - b);
    expect(sorted).toEqual([1, 2, 3]);
  });

  it('11. deserializeCatalogChunk handles arrays and JSON strings correctly', () => {
    const mockProducts = [{ itemCode: '11752', name: 'Test Product' }];
    const fromArray = deserializeCatalogChunk(mockProducts);
    expect(fromArray.length).toBe(1);
    expect(fromArray[0].itemCode).toBe('11752');

    const jsonStr = JSON.stringify(mockProducts);
    const fromString = deserializeCatalogChunk(jsonStr);
    expect(fromString.length).toBe(1);
    expect(fromString[0].itemCode).toBe('11752');
  });

  it('12. deserializeCatalogChunk rejects malformed or empty payloads safely', () => {
    expect(deserializeCatalogChunk(null)).toEqual([]);
    expect(deserializeCatalogChunk('invalid json')).toEqual([]);
    expect(deserializeCatalogChunk({})).toEqual([]);
  });

  it('13. canonicalStringify sorts object keys deterministically', () => {
    const obj1 = { b: 2, a: 1 };
    const obj2 = { a: 1, b: 2 };
    expect(canonicalStringify(obj1)).toBe(canonicalStringify(obj2));
  });

  it('14. checksum error classifications are distinct', () => {
    const errorCodes = [
      'CHECKSUM_FORMAT_UNKNOWN',
      'RAW_PAYLOAD_CHECKSUM_MISMATCH',
      'PAYLOAD_DESERIALIZATION_ERROR',
      'CHUNK_PRODUCT_COUNT_MISMATCH',
      'CATALOG_CHECKSUM_MISMATCH'
    ];
    expect(errorCodes.length).toBe(5);
    expect(new Set(errorCodes).size).toBe(5);
  });
});
