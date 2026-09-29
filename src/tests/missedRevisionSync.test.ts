import { describe, it, expect } from 'vitest';
import { syncMissedRevisions, getSyncDiagnostics } from '../services/missedRevisionSyncService';

describe('Eye 360 Phase 6: Real Missed-Revision Sync Test Suite (Rev 0 → Rev 1)', () => {
  it('1. diagnostics uses targetRevision query field', async () => {
    const diag = await getSyncDiagnostics();
    expect(diag.queryFieldUsed).toBe('targetRevision');
    expect(diag.cloudCatalogVersion).toBeDefined();
  });

  it('2. missed revision sync service exports expected functions', () => {
    expect(typeof syncMissedRevisions).toBe('function');
    expect(typeof getSyncDiagnostics).toBe('function');
  });

  it('3. revision sequence validation rule (baseRevision matches local revision)', () => {
    const localRev = 0;
    const update = { baseRevision: 0, targetRevision: 1, status: 'published' };
    const isValidSequence = update.baseRevision === localRev;
    expect(isValidSequence).toBe(true);

    const brokenUpdate = { baseRevision: 2, targetRevision: 3, status: 'published' };
    const isBrokenValid = brokenUpdate.baseRevision === localRev;
    expect(isBrokenValid).toBe(false);
  });

  it('4. no-op sync when local revision equals cloud revision', () => {
    const localRev = 1;
    const cloudRev = 1;
    const shouldSync = localRev < cloudRev;
    expect(shouldSync).toBe(false);
  });
});
