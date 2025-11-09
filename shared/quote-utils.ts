/**
 * QUOTE UTILITIES
 * Funzioni condivise per calcolo totali e validazione sconti
 */

/**
 * Calcola sconto da applicare
 */
export function calculateDiscount(
  subtotal: number,
  discountType?: 'amount' | 'percent',
  discountValue?: number
): number {
  if (!discountType || !discountValue || discountValue <= 0) {
    return 0;
  }

  if (discountType === 'amount') {
    // Sconto fisso in euro
    return Math.min(discountValue, subtotal); // Non può superare il subtotale
  } else {
    // Sconto percentuale
    const validPercent = Math.min(discountValue, 100); // Max 100%
    return (subtotal * validPercent) / 100;
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
 */
export function validateDiscount(
  subtotal: number,
  discountType?: 'amount' | 'percent',
  discountValue?: number
): { valid: boolean; error?: string } {
  if (!discountType || !discountValue) {
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
