export interface AppSettings {
  // General
  systemName: string;
  soundEnabled: boolean;
  currency: string;
  timezone: string;

  // Barcode Printing Defaults & Customization
  defaultLabelPreset: 'thermal_small' | 'shelf_standard' | 'detailed_large' | 'a4_grid';
  defaultLabelCopies: number;
  defaultShowPrice: boolean;
  defaultShowName: boolean;
  defaultShowBrandModel: boolean;
  defaultShowHeader: boolean;
  defaultShowCategory: boolean;
  customLabelHeader: string;
  customLabelFooterText: string;

  // Scanner & Hardware Calibration
  scannerDebounceMs: number;
  preferredCameraFacing: 'environment' | 'user';

  // Stock Alerts & Table Preferences
  lowStockThreshold: number;
  itemsPerPage: number;
  highlightOutOfStock: boolean;

  // Marketplaces & Recommendations
  recommendationsEnabled: boolean;
  recommendationsDebugMode: boolean;
  amazonSearchEnabled: boolean;
  noonSearchEnabled: boolean;
  jumiaSearchEnabled: boolean;

  // Inventory & Branch Policies
  enforceBlindInventory: boolean;
  defaultAllowCrossBranchView: boolean;

  // Security & Session Policies
  sessionTimeoutMinutes: number; // 0 = disabled, 15, 30, 60
  requirePasswordChangeOnFirstLogin: boolean;

  // Sync & Network
  autoSyncIntervalMinutes: number; // 0 = manual, 5, 10, 30
  lowDataMode: boolean;
}

const SETTINGS_STORAGE_KEY = 'eye360_system_settings_v1';

export const DEFAULT_APP_SETTINGS: AppSettings = {
  systemName: 'Eye 360 Optical Enterprise',
  soundEnabled: true,
  currency: 'ج.م (EGP)',
  timezone: 'Africa/Cairo (GMT+2)',

  defaultLabelPreset: 'thermal_small',
  defaultLabelCopies: 1,
  defaultShowPrice: true,
  defaultShowName: true,
  defaultShowBrandModel: true,
  defaultShowHeader: true,
  defaultShowCategory: false,
  customLabelHeader: 'EYE 360',
  customLabelFooterText: '',

  scannerDebounceMs: 100,
  preferredCameraFacing: 'environment',

  lowStockThreshold: 3,
  itemsPerPage: 25,
  highlightOutOfStock: true,

  recommendationsEnabled: true,
  recommendationsDebugMode: false,
  amazonSearchEnabled: true,
  noonSearchEnabled: true,
  jumiaSearchEnabled: true,

  enforceBlindInventory: true,
  defaultAllowCrossBranchView: true,

  sessionTimeoutMinutes: 30,
  requirePasswordChangeOnFirstLogin: false,

  autoSyncIntervalMinutes: 10,
  lowDataMode: false,
};

// In-memory fallback cache for SSR / Node environments
let memorySettingsCache: AppSettings = { ...DEFAULT_APP_SETTINGS };

function getStorage(): Storage | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  if (typeof globalThis !== 'undefined' && (globalThis as any).localStorage) {
    return (globalThis as any).localStorage;
  }
  return null;
}

/**
 * Loads current settings from localStorage with fallback to defaults
 */
export function getAppSettings(): AppSettings {
  const storage = getStorage();
  if (!storage) return memorySettingsCache;

  try {
    const raw = storage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_APP_SETTINGS;
    const parsed = JSON.parse(raw);
    memorySettingsCache = { ...DEFAULT_APP_SETTINGS, ...parsed };
    return memorySettingsCache;
  } catch (err) {
    console.warn('Failed to load app settings from localStorage, using defaults:', err);
    return DEFAULT_APP_SETTINGS;
  }
}

/**
 * Saves updated settings to localStorage and dispatches a storage event
 */
export function saveAppSettings(newSettings: Partial<AppSettings>): AppSettings {
  const current = getAppSettings();
  const updated: AppSettings = { ...current, ...newSettings };
  memorySettingsCache = updated;

  const storage = getStorage();
  if (storage) {
    try {
      storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(updated));
    } catch (err) {
      console.error('Failed to save app settings to storage:', err);
    }
  }

  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('eye360_settings_updated', { detail: updated }));
    } catch {
      // ignore
    }
  }

  return updated;
}

/**
 * Resets settings to system defaults
 */
export function resetAppSettings(): AppSettings {
  memorySettingsCache = { ...DEFAULT_APP_SETTINGS };
  const storage = getStorage();
  if (storage) {
    try {
      storage.removeItem(SETTINGS_STORAGE_KEY);
    } catch {
      // ignore
    }
  }
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('eye360_settings_updated', { detail: DEFAULT_APP_SETTINGS }));
    } catch {
      // ignore
    }
  }
  return DEFAULT_APP_SETTINGS;
}

/**
 * Plays a pleasant scan confirmation beep if audio is enabled
 */
export function playScanSound(): void {
  const settings = getAppSettings();
  if (!settings.soundEnabled || typeof window === 'undefined') return;

  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1046.5, ctx.currentTime); // High C6 beep
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch {
    // AudioContext autoplay restriction or not supported
  }
}
