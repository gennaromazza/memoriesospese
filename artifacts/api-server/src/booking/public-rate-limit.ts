import type { NextFunction, Request, Response } from 'express';
import { requestClientKey } from '../print-shop/rate-limit.js';

/**
 * Le rotte pubbliche del checkout con acconto non richiedono login: senza un
 * limite chiunque potrebbe riservare in serie tutti gli slot di una campagna
 * (dieci minuti ciascuno, senza pagare) o martellare PayPal tramite il server.
 * Le risposte usano la stessa forma `{ error }` delle altre rotte prenotazioni.
 */
export function bookingPublicRateLimiter(maxRequests: number, windowMs: number, now: () => number = Date.now) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    const key = requestClientKey(req), current = hits.get(key), time = now();
    if (!current || current.resetAt <= time) {
      hits.set(key, { count: 1, resetAt: time + windowMs });
      if (hits.size > 5000) for (const [stored, value] of hits) if (value.resetAt <= time) hits.delete(stored);
      next();
      return;
    }
    current.count++;
    if (current.count > maxRequests) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((current.resetAt - time) / 1000))));
      res.setHeader('Cache-Control', 'no-store');
      res.status(429).json({ error: 'Troppe richieste in poco tempo. Attendi qualche minuto e riprova: nessun pagamento è stato avviato.' });
      return;
    }
    next();
  };
}
/** Nuove riserve di slot: poche per visitatore, i tentativi legittimi sono rari. */
export const CHECKOUT_HOLD_CREATE_LIMIT = { maxRequests: 6, windowMs: 10 * 60_000 };
/** Ripresa, ordine, verifica e cattura: la pagina verifica l'esito ogni 5 secondi per al massimo un minuto. */
export const CHECKOUT_PAYMENT_LIMIT = { maxRequests: 120, windowMs: 10 * 60_000 };
/** Link personale di gestione: accesso, slot, cambio data e annullamento. */
export const MANAGEMENT_LINK_LIMIT = { maxRequests: 60, windowMs: 10 * 60_000 };
