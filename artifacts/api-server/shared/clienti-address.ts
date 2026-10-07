export interface ClienteAddressFields {
  via?: string;
  citta?: string;
  cap?: string;
  provincia?: string;
  indirizzoFiscaleUguale?: boolean;
  viaFiscale?: string;
  cittaFiscale?: string;
  capFiscale?: string;
  provinciaFiscale?: string;
}

export interface ResolvedClienteAddress {
  via?: string;
  citta?: string;
  cap?: string;
  provincia?: string;
  isAlternativo: boolean;
}

/**
 * Risolve l'indirizzo da usare per fatture/riepiloghi.
 *
 * I clienti storici non hanno indirizzoFiscaleUguale: per compatibilità
 * continuano a usare l'indirizzo operativo. Anche un'alternativa incompleta
 * non nasconde l'indirizzo esistente.
 */
export function getIndirizzoFiscale(cliente: ClienteAddressFields | null | undefined): ResolvedClienteAddress {
  if (!cliente) return { isAlternativo: false };

  const hasCompleteAlternative = [
    cliente.viaFiscale,
    cliente.cittaFiscale,
    cliente.capFiscale,
    cliente.provinciaFiscale,
  ].every((value) => Boolean(value?.trim()));

  if (cliente.indirizzoFiscaleUguale === false && hasCompleteAlternative) {
    return {
      via: cliente.viaFiscale,
      citta: cliente.cittaFiscale,
      cap: cliente.capFiscale,
      provincia: cliente.provinciaFiscale,
      isAlternativo: true,
    };
  }

  return {
    via: cliente.via,
    citta: cliente.citta,
    cap: cliente.cap,
    provincia: cliente.provincia,
    isAlternativo: false,
  };
}

export function formatClienteAddress(address: ResolvedClienteAddress | ClienteAddressFields | null | undefined): string {
  if (!address) return '';
  return [address.via, [address.cap, address.citta].filter(Boolean).join(' '), address.provincia]
    .filter(Boolean)
    .join(', ');
}