import type { AdminSecurityStatus } from './admin-passkey';

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

function errorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('status' in error)) return undefined;
  return typeof error.status === 'number' ? error.status : undefined;
}

function errorMessage(error: unknown): string | undefined {
  if (typeof error === 'string') return error.trim() || undefined;
  if (typeof error !== 'object' || error === null || !('message' in error)) return undefined;
  return typeof error.message === 'string' ? error.message.trim() || undefined : undefined;
}

export function isProductWritePermissionDenied(error: unknown): boolean {
  const code = errorCode(error);
  return code === 'permission-denied' || code === 'firestore/permission-denied';
}

export function isAdminPasskeyRefreshRequired(error: unknown): boolean {
  return errorCode(error) === 'admin_passkey_required';
}

export function getProductSaveErrorMessage(
  error: unknown,
  securityStatus?: Pick<AdminSecurityStatus, 'passkeyRequired' | 'verified'>,
  securityStatusError?: unknown,
): string {
  const code = errorCode(error);
  if (isAdminPasskeyRefreshRequired(error)) {
    return 'La verifica passkey è scaduta. I dati inseriti restano nel modulo: rinnova la verifica in Sicurezza e riprova a salvare.';
  }
  if (code === 'print_shop_route_required') {
    return error instanceof Error ? error.message : 'Gestisci questo formato dall’editor dedicato del catalogo stampe.';
  }

  if (code === 'unauthenticated' || code === 'auth/user-token-expired' || code === 'auth/invalid-user-token') {
    return 'La sessione amministratore è scaduta. Accedi di nuovo e ripeti il salvataggio.';
  }

  if (isProductWritePermissionDenied(error)) {
    const statusCode = errorStatus(securityStatusError);
    if (statusCode === 401 || errorCode(securityStatusError) === 'unauthenticated') {
      return 'La sessione amministratore è scaduta. Accedi di nuovo e ripeti il salvataggio.';
    }
    if (
      (securityStatus?.passkeyRequired && !securityStatus.verified) ||
      errorCode(securityStatusError) === 'admin_passkey_required'
    ) {
      return 'La verifica passkey amministratore è scaduta o non è attiva. Vai in Sicurezza, verifica di nuovo la passkey e poi ripeti il salvataggio.';
    }
    return 'Firestore ha rifiutato il salvataggio. Controlla di essere nella sessione amministratore; se la verifica passkey è scaduta, rinnovala da Sicurezza e riprova.';
  }

  const details = [
    code ? `codice ${code}` : undefined,
    errorMessage(error)?.slice(0, 240),
  ].filter(Boolean).join(' — ');
  return details
    ? `Impossibile salvare il prodotto. Dettaglio: ${details}`
    : 'Impossibile salvare il prodotto. Riprova; se il problema continua, controlla la connessione e la sessione amministratore.';
}
