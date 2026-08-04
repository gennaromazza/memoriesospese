/**
 * Helper puri per l'intestazione fiscale delle ricevute (testabili).
 */

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
} | undefined | null): ClienteFiscaleSnapshot {
  if (!c) return {};
  const indirizzo = [c.via, [c.cap, c.citta].filter(Boolean).join(' '), c.provincia]
    .filter(Boolean)
    .join(', ');
  return {
    codiceFiscale: c.codiceFiscale || undefined,
    partitaIva: c.partitaIva || undefined,
    indirizzo: indirizzo || undefined,
  };
}
