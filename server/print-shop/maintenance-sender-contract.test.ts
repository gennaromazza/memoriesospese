import { describe, expect, it } from 'vitest';
import {
  PRINT_SHOP_MAINTENANCE_AUDIENCE,
  isSuccessfulMaintenanceResult,
  resolveMaintenanceUrl,
} from '../../functions-retention/src/contract.js';

describe('print-shop retention sender contract', () => {
  it('derives only the canonical endpoint and exact OIDC audience', () => {
    expect(resolveMaintenanceUrl('')).toBe(PRINT_SHOP_MAINTENANCE_AUDIENCE);
    expect(resolveMaintenanceUrl('https://imagestudiofotografico.com/')).toBe(
      PRINT_SHOP_MAINTENANCE_AUDIENCE,
    );
    expect(() => resolveMaintenanceUrl('https://preview.example.test')).toThrow(
      /SITE_URL non canonico/,
    );
  });

  it('requires an explicit successful JSON result instead of trusting HTTP 2xx', () => {
    expect(isSuccessfulMaintenanceResult({ ok: true })).toBe(true);
    expect(isSuccessfulMaintenanceResult({ ok: false })).toBe(false);
    expect(isSuccessfulMaintenanceResult('<!doctype html><html></html>')).toBe(false);
    expect(isSuccessfulMaintenanceResult(null)).toBe(false);
    expect(isSuccessfulMaintenanceResult([])).toBe(false);
  });
});
