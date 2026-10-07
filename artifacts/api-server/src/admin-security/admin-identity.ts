/**
 * Identità amministrativa e claim della passkey.
 *
 * L'identità admin resta ancorata all'email verificata del token Firebase
 * (stesso criterio di firestore.rules). La verifica passkey viene invece
 * propagata come custom claim `apk` sull'account, così che sia leggibile
 * sia dal server sia dalle regole Firestore per gli accessi diretti dal browser.
 *
 * Claim `apk` = { req: boolean, exp: ms epoch, at: ms epoch, sat: secondi }
 *  - req: la passkey è obbligatoria per questo account
 *  - exp: scadenza della verifica corrente
 *  - at:  istante della verifica (per invalidare le verifiche precedenti a una revoca)
 *  - sat: `auth_time` della sessione Firebase che ha superato la verifica.
 *         Il claim è per account, ma vale solo per la sessione con lo stesso
 *         `auth_time`: un altro login con la password (altro dispositivo, o
 *         un nuovo accesso) deve rifare la verifica passkey.
 */

export const ADMIN_EMAILS = ['gennaro.mazzacane@gmail.com'];

export const ADMIN_PASSKEY_CLAIM = 'apk';

export interface AdminPasskeyClaim {
  req?: boolean;
  exp?: number;
  at?: number;
  sat?: number;
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

export function readAdminPasskeyClaim(claims: unknown): AdminPasskeyClaim | null {
  if (!claims || typeof claims !== 'object') return null;
  const raw = (claims as Record<string, unknown>)[ADMIN_PASSKEY_CLAIM];
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  return {
    req: value.req === true,
    exp: typeof value.exp === 'number' ? value.exp : undefined,
    at: typeof value.at === 'number' ? value.at : undefined,
    sat: typeof value.sat === 'number' ? value.sat : undefined,
  };
}

/** `auth_time` (secondi) del token Firebase: identifica la sessione di login. */
export function readAuthTime(claims: unknown): number | null {
  if (!claims || typeof claims !== 'object') return null;
  const value = (claims as Record<string, unknown>).auth_time;
  return typeof value === 'number' ? value : null;
}

/**
 * Una verifica è valida se non è scaduta, non è precedente all'ultima
 * revoca/reset registrata sul server (`validAfter`) ed è stata ottenuta dalla
 * stessa sessione di login (`auth_time`) che presenta il token.
 */
export function isAdminPasskeyClaimValid(
  claim: AdminPasskeyClaim | null,
  now: number,
  validAfter: number,
  authTime: number | null,
): boolean {
  if (!claim || typeof claim.exp !== 'number' || typeof claim.at !== 'number') return false;
  if (typeof claim.sat !== 'number' || authTime === null || claim.sat !== authTime) return false;
  if (claim.exp <= now) return false;
  if (claim.at <= validAfter) return false;
  return true;
}
