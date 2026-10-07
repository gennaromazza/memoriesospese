/**
 * Helper puri per l'intestazione fiscale delle ricevute (testabili).
 */

import { getIndirizzoFiscale } from './clienti-address';

export interface ClienteFiscaleSnapshot {
  codiceFiscale?: string;
  partitaIva?: string;
  indirizzo?: string;
}

/**
 * Costruisce lo snapshot fiscale per l'intestazione della ricevuta
 * a partire dai dati del cliente in anagrafica.
 */
export function buildClienteFiscaleSnapshot(c: {
  codiceFiscale?: string;
  partitaIva?: string;
  via?: string;
  cap?: string;
  citta?: string;
  provincia?: string;
  indirizzoFiscaleUguale?: boolean;
  viaFiscale?: string;
  cittaFiscale?: string;
  capFiscale?: string;
  provinciaFiscale?: string;
} | undefined | null): ClienteFiscaleSnapshot {
  if (!c) return {};
  const indirizzoFiscale = getIndirizzoFiscale(c);
  const indirizzo = [indirizzoFiscale.via, [indirizzoFiscale.cap, indirizzoFiscale.citta].filter(Boolean).join(' '), indirizzoFiscale.provincia]
    .filter(Boolean)
    .join(', ');
  return {
    codiceFiscale: c.codiceFiscale || undefined,
    partitaIva: c.partitaIva || undefined,
    indirizzo: indirizzo || undefined,
  };
}
