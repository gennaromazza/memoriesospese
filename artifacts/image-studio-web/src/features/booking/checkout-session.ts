export interface BookingCheckoutSession { bookingId: string; token: string; captureAttempted?: boolean }
const key = (campaignId: string) => `booking-deposit:${campaignId}`;
export function readCheckoutSession(campaignId: string): BookingCheckoutSession | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(key(campaignId)) || 'null');
    return value && /^[A-Za-z0-9_-]{1,200}$/.test(value.bookingId) && /^[a-f0-9]{64}$/.test(value.token)
      ? { bookingId: value.bookingId, token: value.token, captureAttempted: value.captureAttempted === true } : null;
  } catch { return null; }
}
export function saveCheckoutSession(campaignId: string, session: BookingCheckoutSession): boolean {
  try { sessionStorage.setItem(key(campaignId), JSON.stringify(session)); return true; }
  catch { return false; }
}
export function clearCheckoutSession(campaignId: string) {
  try { sessionStorage.removeItem(key(campaignId)); } catch { /* The in-memory session still has a fixed server deadline. */ }
}
