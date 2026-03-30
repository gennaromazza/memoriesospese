/**
 * QUOTE UTILITIES
 * Funzioni condivise per calcolo totali e validazione sconti
 */

/**
 * Coerce sicura a number - gestisce stringhe, null, undefined, NaN
 */
export function toNum(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return isNaN(n) ? 0 : n;
}

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
  const sub = toNum(subtotal);
  const val = discountValue === undefined ? undefined : toNum(discountValue);

  // discountValue=0 è valido, solo undefined è "nessuno sconto"
  if (!discountType || val === undefined || val < 0) {
    return 0;
  }

  if (discountType === 'amount') {
    // Sconto fisso in euro - se supera subtotal, blocca a 0 (doveva essere validato prima)
    if (val > sub) return 0;
    return val;
  } else {
    // Sconto percentuale - se supera 100%, blocca a 0 (doveva essere validato prima)
    if (val > 100) return 0;
    return (sub * val) / 100;
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
  const totalBeforeDiscount = Math.max(0, toNum(subtotal));
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
  const sub = toNum(subtotal);
  const val = discountValue === undefined ? undefined : toNum(discountValue);

  // Solo undefined è "nessuno sconto" - 0 è sconto zero esplicito valido
  if (!discountType || val === undefined) {
    return { valid: true }; // Nessuno sconto = valido
  }

  if (val < 0) {
    return { valid: false, error: 'Lo sconto non può essere negativo' };
  }

  if (discountType === 'amount' && val > sub) {
    return { 
      valid: false, 
      error: `Lo sconto in euro non può superare il subtotale (€${sub.toFixed(2)})` 
    };
  }

  if (discountType === 'percent' && val > 100) {
    return { 
      valid: false, 
      error: 'Lo sconto percentuale non può superare 100%' 
    };
  }

  return { valid: true };
}
