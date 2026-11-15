/**
 * Ritorno all'Area Cliente.
 *
 * Quando il cliente è nella sua area, la pagina segna in sessionStorage (per
 * questa scheda del browser) che le pagine aperte da lì devono offrire il
 * ritorno: preventivo, prenotazione, galleria e fotolibro.
 */
const KEY = 'client_area_return';
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

const RETURN_PATHS = [/^\/quote\/[^/]+$/, /^\/consulenze\/[^/]+\/[^/]+\/prenota$/, /^\/view\/[^/]+$/, /^\/gallery\/[^/]+$/, /^\/fotolibro\/[^/]+$/];

export function markClientAreaVisit(now = Date.now()): void {
  try { sessionStorage.setItem(KEY, String(now)); } catch { /* facoltativo */ }
}

export function clearClientAreaVisit(): void {
  try { sessionStorage.removeItem(KEY); } catch { /* facoltativo */ }
}

export function isClientAreaReturnPath(pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return RETURN_PATHS.some(re => re.test(path));
}

export function shouldOfferClientAreaReturn(pathname: string, now = Date.now()): boolean {
  if (!isClientAreaReturnPath(pathname)) return false;
  try {
    const at = Number(sessionStorage.getItem(KEY));
    return Number.isFinite(at) && at > 0 && now - at < MAX_AGE_MS;
  } catch {
    return false;
  }
}
