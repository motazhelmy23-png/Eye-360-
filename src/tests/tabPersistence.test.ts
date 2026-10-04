import { describe, it, expect, beforeEach } from 'vitest';
import { getSavedAdminTab, VALID_ADMIN_TABS } from '../App';

describe('Admin Navigation Tab Persistence on Page Refresh (تثبيت التبويب الحالي عند التحديث)', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
    if (typeof window !== 'undefined') {
      window.location.hash = '';
    }
  });

  it('defaults to overview when no hash or stored tab exists', () => {
    expect(getSavedAdminTab()).toBe('overview');
  });

  it('restores tab from URL hash when user refreshes page on specific tab', () => {
    if (typeof window !== 'undefined') {
      window.location.hash = '#/admin/settings';
      expect(getSavedAdminTab()).toBe('settings');

      window.location.hash = '#/admin/products';
      expect(getSavedAdminTab()).toBe('products');

      window.location.hash = '#/admin/inventory_count';
      expect(getSavedAdminTab()).toBe('inventory_count');

      window.location.hash = '#/admin/branches';
      expect(getSavedAdminTab()).toBe('branches');

      window.location.hash = '#/admin/accounts';
      expect(getSavedAdminTab()).toBe('accounts');
    }
  });

  it('restores tab from localStorage if hash is missing', () => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('eye360_active_admin_tab', 'catalog_replacement');
      expect(getSavedAdminTab()).toBe('catalog_replacement');
    }
  });

  it('falls back to overview if stored tab is invalid', () => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('eye360_active_admin_tab', 'invalid_tab_xyz');
      expect(getSavedAdminTab()).toBe('overview');
    }
  });

  it('has all required admin tabs in VALID_ADMIN_TABS', () => {
    expect(VALID_ADMIN_TABS).toContain('overview');
    expect(VALID_ADMIN_TABS).toContain('settings');
    expect(VALID_ADMIN_TABS).toContain('products');
    expect(VALID_ADMIN_TABS).toContain('branches');
    expect(VALID_ADMIN_TABS).toContain('accounts');
    expect(VALID_ADMIN_TABS).toContain('inventory_count');
    expect(VALID_ADMIN_TABS).toContain('catalog_replacement');
    expect(VALID_ADMIN_TABS).toContain('daily_update');
    expect(VALID_ADMIN_TABS).toContain('reports');
  });
});
