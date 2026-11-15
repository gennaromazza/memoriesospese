/**
 * Email di benvenuto all'Area Cliente.
 *
 * Parte una sola volta per scheda cliente (`clientArea.welcomeSentAt`), la
 * prima volta che il cliente viene collegato a un lavoro. L'invio manuale
 * ("Invia di nuovo") usa `force`.
 */
import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { isValidEmail, normalizeClientEmail } from '@shared/client-area';
import { welcomeEmailHtml } from './emails.js';

export type WelcomeOutcome =
  | { clienteId: string; result: 'sent' }
  | { clienteId: string; result: 'skipped'; reason: 'already_sent' | 'no_email' | 'not_found' | 'excluded' }
  | { clienteId: string; result: 'error'; message: string };

export interface WelcomeDeps {
  baseUrl: string;
  studioName: string;
  send: (to: string, subject: string, html: string) => Promise<unknown>;
  /** Email che non devono mai ricevere l'invito (es. l'admin). */
  isExcludedEmail: (email: string) => boolean;
}

export async function sendClientAreaWelcome(
  db: Firestore,
  clienteIds: string[],
  deps: WelcomeDeps,
  options: { force?: boolean; nomeEvento?: string } = {},
): Promise<WelcomeOutcome[]> {
  const unique = [...new Set(clienteIds.filter(id => typeof id === 'string' && id.trim()))];
  const outcomes: WelcomeOutcome[] = [];
  for (const clienteId of unique) {
    const ref = db.collection('clienti').doc(clienteId);
    // Prenota l'invio in transazione: due creazioni ravvicinate non mandano due email.
    const claim = await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { ok: false as const, reason: 'not_found' as const };
      const data = snap.data() || {};
      const email = normalizeClientEmail(data.email);
      if (!isValidEmail(email)) return { ok: false as const, reason: 'no_email' as const };
      if (deps.isExcludedEmail(email)) return { ok: false as const, reason: 'excluded' as const };
      const previous = data.clientArea?.welcomeSentAt ?? null;
      if (previous && !options.force) return { ok: false as const, reason: 'already_sent' as const };
      tx.update(ref, { 'clientArea.welcomeSentAt': FieldValue.serverTimestamp() });
      return { ok: true as const, email, nome: typeof data.nome === 'string' ? data.nome : '', previous };
    });
    if (!claim.ok) {
      outcomes.push({ clienteId, result: 'skipped', reason: claim.reason });
      continue;
    }
    try {
      await deps.send(
        claim.email,
        `La tua area personale ${deps.studioName}`,
        welcomeEmailHtml({ studioName: deps.studioName, nome: claim.nome, nomeEvento: options.nomeEvento, baseUrl: deps.baseUrl }),
      );
      outcomes.push({ clienteId, result: 'sent' });
    } catch (error) {
      // Invio fallito: libera la prenotazione così si potrà riprovare.
      await ref.update({ 'clientArea.welcomeSentAt': claim.previous ?? FieldValue.delete() }).catch(() => undefined);
      outcomes.push({ clienteId, result: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }
  return outcomes;
}

/** Clienti di un lavoro (nuovo campo `clientiIds` e campo legacy `clienteId`). */
export function jobClienteIds(job: Record<string, any>): string[] {
  return [...new Set([
    ...(Array.isArray(job.clientiIds) ? job.clientiIds : []),
    job.clienteId,
  ].filter((id): id is string => typeof id === 'string' && id.trim().length > 0))];
}

/**
 * Clienti da invitare all'area: hanno almeno un lavoro collegato, un'email
 * valida, non sono archiviati e non hanno ancora ricevuto il benvenuto.
 */
export function isPendingWelcome(data: Record<string, any>, isExcludedEmail: (email: string) => boolean): boolean {
  const email = normalizeClientEmail(data.email);
  if (!isValidEmail(email) || isExcludedEmail(email)) return false;
  if (data.lifecycle?.status === 'archiviato') return false;
  if (data.clientArea?.welcomeSentAt) return false;
  const jobIds = data.sourceRefs?.jobIds;
  return Array.isArray(jobIds) && jobIds.some((id: unknown) => typeof id === 'string' && id.trim());
}
