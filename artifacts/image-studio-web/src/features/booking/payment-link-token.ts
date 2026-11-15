// Loaded before App/Firebase Analytics: never leave a bearer token in page_location.
const captured = new Map<string, string>();
export function readPaymentLinkToken(id: string): string | null {
  captureBookingLinkFragment();
  let value = captured.get(id);
  if (!value) { try { value = sessionStorage.getItem(`approved-payment:${id}`) || undefined; } catch { /* Storage can be disabled. */ } }
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}
export function readManagementLinkToken(id: string): string | null {
  captureBookingLinkFragment();
  let value = captured.get(`management:${id}`);
  if (!value) { try { value = sessionStorage.getItem(`booking-management:${id}`) || undefined; } catch { /* Storage can be disabled. */ } }
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}
function captureBookingLinkFragment() {
  if (typeof window === 'undefined') return;
  const match = /^\/prenota\/(acconto|gestisci)\/([A-Za-z0-9_-]{1,200})\/?$/.exec(window.location.pathname);
  const token = window.location.hash.slice(1);
  if (match && window.location.hash) {
    const management = match[1] === 'gestisci', id = match[2];
    const memoryKey = management ? `management:${id}` : id;
    const storageKey = `${management ? 'booking-management' : 'approved-payment'}:${id}`;
    if (/^[a-f0-9]{64}$/.test(token)) {
      captured.set(memoryKey, token);
      try { sessionStorage.setItem(storageKey, token); } catch { /* Kept in memory until the email is reopened. */ }
    } else {
      captured.delete(memoryKey);
      try { sessionStorage.removeItem(storageKey); } catch { /* Do not reuse a cached token for an explicitly invalid link. */ }
    }
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
  }
}
captureBookingLinkFragment();
