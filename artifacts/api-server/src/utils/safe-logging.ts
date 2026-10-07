const SENSITIVE_ASSIGNMENT =
  /(\b(?:access[_-]?token|refresh[_-]?token|id[_-]?token|token|secret|password|passwd|api[_-]?key|client[_-]?secret|private[_-]?key|authorization|cookie|session)\b\s*[:=]\s*)(["']?)[^"',;\s}\]]+/gi;

/**
 * Errori provenienti da SDK e servizi esterni possono contenere request,
 * response o credenziali. Nei log conserviamo solo un messaggio breve e
 * redatto, mai l'oggetto completo.
 */
export function safeErrorMessage(error: unknown, fallback = "Errore sconosciuto"): string {
  const raw = error instanceof Error ? error.message : fallback;
  return raw
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [REDACTED]")
    .replace(SENSITIVE_ASSIGNMENT, "$1[REDACTED]")
    .slice(0, 500);
}