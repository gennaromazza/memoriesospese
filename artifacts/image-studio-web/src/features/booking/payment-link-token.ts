// Loaded before App/Firebase Analytics: never leave a bearer token in page_location.
const captured = new Map<string, string>();
export function readPaymentLinkToken(id: string): string | null {
  let value = window.location.hash.slice(1) || captured.get(id);
  if (!value) { try { value = sessionStorage.getItem(`approved-payment:${id}`) || undefined; } catch { /* Storage can be disabled. */ } }
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}
if (typeof window !== 'undefined') {
  const match = /^\/prenota\/acconto\/([A-Za-z0-9_-]{1,200})\/?$/.exec(window.location.pathname);
  const token = window.location.hash.slice(1);
  if (match && /^[a-f0-9]{64}$/.test(token)) {
    captured.set(match[1], token);
    try { sessionStorage.setItem(`approved-payment:${match[1]}`, token); } catch { /* Kept in memory until the email is reopened. */ }
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
  }
}
