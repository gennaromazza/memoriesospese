// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
beforeEach(() => { vi.resetModules(); sessionStorage.clear(); window.history.replaceState({}, '', '/'); });
afterEach(() => vi.restoreAllMocks());
it('strips a management bearer before analytics and restores it after reload', async () => {
  window.history.replaceState({}, '', `/prenota/gestisci/one#${'a'.repeat(64)}`);
  const first = await import('./payment-link-token');
  expect(window.location.hash).toBe('');
  expect(first.readManagementLinkToken('one')).toBe('a'.repeat(64));
  expect(first.readPaymentLinkToken('one')).toBeNull();
  expect(first.readManagementLinkToken('two')).toBeNull();
  vi.resetModules();
  expect((await import('./payment-link-token')).readManagementLinkToken('one')).toBe('a'.repeat(64));
});
it('keeps payment and management credentials separate even for the same booking', async () => {
  window.history.replaceState({}, '', `/prenota/gestisci/one#${'a'.repeat(64)}`);
  const tokens = await import('./payment-link-token');
  window.history.replaceState({}, '', `/prenota/acconto/one#${'b'.repeat(64)}`);
  expect(tokens.readPaymentLinkToken('one')).toBe('b'.repeat(64));
  expect(tokens.readManagementLinkToken('one')).toBe('a'.repeat(64));
  expect(window.location.hash).toBe('');
});
it('does not reuse an old cached credential for an explicitly malformed link', async () => {
  sessionStorage.setItem('booking-management:one', 'a'.repeat(64));
  window.history.replaceState({}, '', '/prenota/gestisci/one#malformed-token');
  const tokens = await import('./payment-link-token');
  expect(tokens.readManagementLinkToken('one')).toBeNull();
  expect(window.location.hash).toBe('');
  expect(sessionStorage.getItem('booking-management:one')).toBeNull();
});
it('keeps a valid token in memory when browser storage is blocked', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage disabled'); });
  window.history.replaceState({}, '', `/prenota/gestisci/one#${'a'.repeat(64)}`);
  const tokens = await import('./payment-link-token');
  expect(tokens.readManagementLinkToken('one')).toBe('a'.repeat(64));
  expect(window.location.hash).toBe('');
});
it('leaves ordinary page anchors untouched', async () => {
  window.history.replaceState({}, '', '/online-shop#prodotti');
  await import('./payment-link-token');
  expect(window.location.hash).toBe('#prodotti');
});
