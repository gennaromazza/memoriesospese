/**
 * QUOTE UTILITIES
 * Funzioni condivise per calcolo totali e validazione sconti
 */

/**
 * Calcola sconto da applicare
 * NOTA: discountValue=0 è un valore valido (sconto zero esplicito)
 * NOTA: valori fuori range (percent>100, amount>subtotal) restituiscono 0 
 *       per sicurezza - usare validateDiscount PRIMA per bloccare input invalidi
 */
export function calculateDiscount(
  subtotal: number,
  discountType?: 'amount' | 'percent',
  discountValue?: number
): number {
  // discountValue=0 è valido, solo undefined è "nessuno sconto"
  if (!discountType || discountValue === undefined || discountValue < 0) {
    return 0;
  }

  if (discountType === 'amount') {
    // Sconto fisso in euro - se supera subtotal, blocca a 0 (doveva essere validato prima)
    if (discountValue > subtotal) return 0;
    return discountValue;
  } else {
    // Sconto percentuale - se supera 100%, blocca a 0 (doveva essere validato prima)
    if (discountValue > 100) return 0;
    return (subtotal * discountValue) / 100;
  }
}

/**
 * Calcola totali preventivo con sconto
 */
export function calculateQuoteTotals(
  subtotal: number,
  discountType?: 'amount' | 'percent',
  discountValue?: number
): {
  totalBeforeDiscount: number;
  discountAmount: number;
  totalAfterDiscount: number;
} {
  const totalBeforeDiscount = Math.max(0, subtotal);
  const discountAmount = calculateDiscount(totalBeforeDiscount, discountType, discountValue);
  const totalAfterDiscount = totalBeforeDiscount - discountAmount;

  return {
    totalBeforeDiscount: parseFloat(totalBeforeDiscount.toFixed(2)),
    discountAmount: parseFloat(discountAmount.toFixed(2)),
    totalAfterDiscount: parseFloat(totalAfterDiscount.toFixed(2))
  };
}

/**
 * Valida sconto
 * NOTA: discountValue=0 è un valore valido (sconto zero esplicito)
 */
export function validateDiscount(
  subtotal: number,
  discountType?: 'amount' | 'percent',
  discountValue?: number
): { valid: boolean; error?: string } {
  // Solo undefined è "nessuno sconto" - 0 è sconto zero esplicito valido
  if (!discountType || discountValue === undefined) {
    return { valid: true }; // Nessuno sconto = valido
  }

  if (discountValue < 0) {
    return { valid: false, error: 'Lo sconto non può essere negativo' };
  }

  if (discountType === 'amount' && discountValue > subtotal) {
    return { 
      valid: false, 
      error: `Lo sconto in euro non può superare il subtotale (€${subtotal.toFixed(2)})` 
    };
  }

  if (discountType === 'percent' && discountValue > 100) {
    return { 
      valid: false, 
      error: 'Lo sconto percentuale non può superare 100%' 
    };
  }

  return { valid: true };
}
