import { describe, it, expect, beforeEach } from 'vitest';
import { 
  getAppSettings, 
  saveAppSettings, 
  resetAppSettings, 
  DEFAULT_APP_SETTINGS 
} from '../services/appSettingsService';

describe('Eye 360: Unified App Settings Service', () => {
  beforeEach(() => {
    resetAppSettings();
  });

  it('1. returns default settings on initial load', () => {
    const settings = getAppSettings();
    expect(settings.systemName).toBe('Eye 360 Optical Enterprise');
    expect(settings.soundEnabled).toBe(true);
    expect(settings.defaultLabelPreset).toBe('thermal_small');
    expect(settings.defaultLabelCopies).toBe(1);
    expect(settings.recommendationsEnabled).toBe(true);
    expect(settings.enforceBlindInventory).toBe(true);
    expect(settings.sessionTimeoutMinutes).toBe(30);
    expect(settings.scannerDebounceMs).toBe(100);
    expect(settings.lowStockThreshold).toBe(3);
    expect(settings.itemsPerPage).toBe(25);
  });

  it('2. updates and persists custom settings', () => {
    saveAppSettings({
      systemName: 'Eye 360 - Main HQ',
      defaultLabelPreset: 'shelf_standard',
      defaultLabelCopies: 3,
      soundEnabled: false,
      scannerDebounceMs: 150,
      customLabelHeader: 'فرع المعادي الرئيسي',
      sessionTimeoutMinutes: 60,
    });

    const updated = getAppSettings();
    expect(updated.systemName).toBe('Eye 360 - Main HQ');
    expect(updated.defaultLabelPreset).toBe('shelf_standard');
    expect(updated.defaultLabelCopies).toBe(3);
    expect(updated.soundEnabled).toBe(false);
    expect(updated.scannerDebounceMs).toBe(150);
    expect(updated.customLabelHeader).toBe('فرع المعادي الرئيسي');
    expect(updated.sessionTimeoutMinutes).toBe(60);
    // Unchanged settings remain intact
    expect(updated.currency).toBe(DEFAULT_APP_SETTINGS.currency);
  });

  it('3. resets settings to factory defaults', () => {
    saveAppSettings({
      systemName: 'Temporary Name',
      defaultLabelCopies: 10,
      scannerDebounceMs: 50,
    });

    const reset = resetAppSettings();
    expect(reset.systemName).toBe(DEFAULT_APP_SETTINGS.systemName);
    expect(reset.defaultLabelCopies).toBe(1);
    expect(reset.scannerDebounceMs).toBe(100);

    const reloaded = getAppSettings();
    expect(reloaded.systemName).toBe(DEFAULT_APP_SETTINGS.systemName);
  });
});
