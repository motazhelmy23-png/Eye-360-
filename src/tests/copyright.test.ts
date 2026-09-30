import { describe, it, expect } from 'vitest';
import { COPYRIGHT_NOTICE } from '../constants/brand';

describe('Eye 360: Copyright and Ownership Notice Test Suite', () => {
  it('1. Exact copyright text matches Motaz Osman ownership definition', () => {
    expect(COPYRIGHT_NOTICE).toBe('Eye 360 © 2026 Motaz Osman. All rights reserved.');
  });

  it('2. Copyright notice contains required elements and year', () => {
    expect(COPYRIGHT_NOTICE).toContain('Eye 360');
    expect(COPYRIGHT_NOTICE).toContain('© 2026');
    expect(COPYRIGHT_NOTICE).toContain('Motaz Osman');
    expect(COPYRIGHT_NOTICE).toContain('All rights reserved.');
  });
});
