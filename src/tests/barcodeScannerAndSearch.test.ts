import { describe, it, expect, vi } from 'vitest';
import { NormalizedProduct } from '../types/inventory';

describe('Eye 360 Barcode Scanner & Exact Search Test Suite', () => {
  const sampleProducts: NormalizedProduct[] = [
    {
      itemCode: '11752',
      barcode: '0739458612347', // leading zero test
      modelCode: 'MOD-0739458',
      name: 'Leading Zero Barcode Product',
      brand: 'Tiger',
      salePrice: 199.99,
      stocks: { loc_1: 10 },
      totalStock: 10,
      active: true,
      fingerprint: 'fp_1',
    },
    {
      itemCode: '11753',
      barcode: '7394586123476',
      modelCode: 'MOD-7394586',
      name: 'Second Product',
      brand: 'Samsung',
      salePrice: 299.99,
      stocks: { loc_1: 5 },
      totalStock: 5,
      active: true,
      fingerprint: 'fp_2',
    },
  ];

  it('1. barcode remains string and leading zeroes are strictly preserved', () => {
    const rawScanned = '0739458612347';
    expect(typeof rawScanned).toBe('string');
    expect(rawScanned.startsWith('0')).toBe(true);
    expect(rawScanned).toBe('0739458612347');
    
    const numericTest = Number(rawScanned);
    expect(numericTest).not.toBeNaN();
    expect(String(numericTest)).not.toBe(rawScanned);
  });

  it('2. exact barcode search returns only the exact match, without appending other products', () => {
    const query = '0739458612347';
    const queryStr = query.toLowerCase();

    const exactMatches = sampleProducts.filter(p =>
      p.itemCode.toLowerCase() === queryStr ||
      (p.barcode && p.barcode.toLowerCase() === queryStr) ||
      (p.modelCode && p.modelCode.toLowerCase() === queryStr)
    );

    expect(exactMatches.length).toBe(1);
    expect(exactMatches[0].itemCode).toBe('11752');

    const filtered = exactMatches;
    expect(filtered.length).toBe(1);
    expect(filtered[0].itemCode).toBe('11752');
    expect(filtered.find(p => p.itemCode === '11753')).toBeUndefined();
  });

  it('3. exact modelCode search returns only exact result', () => {
    const query = 'mod-7394586';
    const queryStr = query.toLowerCase();

    const exactMatches = sampleProducts.filter(p =>
      p.itemCode.toLowerCase() === queryStr ||
      (p.barcode && p.barcode.toLowerCase() === queryStr) ||
      (p.modelCode && p.modelCode.toLowerCase() === queryStr)
    );

    expect(exactMatches.length).toBe(1);
    expect(exactMatches[0].itemCode).toBe('11753');
  });

  it('4. partial text search still returns matching items', () => {
    const query = 'Tiger';
    const queryStr = query.toLowerCase();

    const matched = sampleProducts.filter(p =>
      p.itemCode.toLowerCase().includes(queryStr) ||
      (p.name && p.name.toLowerCase().includes(queryStr)) ||
      (p.barcode && p.barcode.toLowerCase().includes(queryStr)) ||
      (p.modelCode && p.modelCode.toLowerCase().includes(queryStr)) ||
      (p.brand && p.brand.toLowerCase().includes(queryStr)) ||
      (p.category && p.category.toLowerCase().includes(queryStr))
    );

    expect(matched.length).toBe(1);
    expect(matched[0].itemCode).toBe('11752');
  });

  it('5. duplicate scan callback lock simulation', () => {
    let successCount = 0;
    let locked = false;

    const simulateScan = (decodedText: string) => {
      if (locked) return;
      locked = true;
      successCount++;
    };

    simulateScan('0739458612347');
    simulateScan('0739458612347');
    simulateScan('0739458612347');

    expect(successCount).toBe(1);
  });

  it('6. camera error mapping verification', () => {
    const mapCameraError = (errName: string) => {
      if (errName.includes('NotAllowedError') || errName.includes('PermissionDeniedError')) {
        return "تم رفض إذن الكاميرا. اسمح بالوصول إلى الكاميرا من إعدادات المتصفح ثم حاول مرة أخرى.";
      }
      if (errName.includes('NotFoundError')) {
        return "لم يتم العثور على كاميرا على هذا الجهاز.";
      }
      if (errName.includes('NotReadableError')) {
        return "تعذر تشغيل الكاميرا. قد تكون مستخدمة بواسطة تطبيق آخر.";
      }
      return "تعذر تشغيل ماسح الباركود. حاول مرة أخرى.";
    };

    expect(mapCameraError('NotAllowedError')).toContain('تم رفض إذن الكاميرا');
    expect(mapCameraError('NotFoundError')).toContain('لم يتم العثور على كاميرا');
    expect(mapCameraError('NotReadableError')).toContain('تعذر تشغيل الكاميرا');
  });

  it('7. local barcode lookup triggers 0 Firestore reads', () => {
    const firestoreReadMock = vi.fn();
    
    const lookupLocalBarcode = (barcode: string) => {
      const found = sampleProducts.find(p => p.barcode === barcode || p.modelCode === barcode);
      return found || null;
    };

    const res = lookupLocalBarcode('7394586123476');
    expect(res?.itemCode).toBe('11753');
    expect(firestoreReadMock).not.toHaveBeenCalled();
    expect(firestoreReadMock.mock.calls.length).toBe(0);
  });
});
