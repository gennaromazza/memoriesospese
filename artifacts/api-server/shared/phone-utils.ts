/**
 * PHONE UTILITIES - Funzioni per formattazione numeri di telefono
 * Standardizzazione per WhatsApp e altri servizi
 */

/**
 * Formatta un numero di telefono per WhatsApp (wa.me)
 * 
 * Regole:
 * - Rimuove tutti i caratteri non numerici (+, spazi, -, (, ), etc.)
 * - Rimuove prefisso "00" (formato internazionale alternativo)
 * - Aggiunge prefisso 39 se il numero inizia con 3 (mobile italiano) e non ha già prefisso
 * - Gestisce numeri che iniziano già con 39, +39 o 0039
 * 
 * Esempi:
 * - "+39 327 123 4567" → "393271234567"
 * - "327 123 4567" → "393271234567"
 * - "39 327 123 4567" → "393271234567"
 * - "0039 327 123 4567" → "393271234567"
 * - "00393271234567" → "393271234567"
 * - "393271234567" → "393271234567" (già corretto)
 * - "+1 555 123 4567" → "15551234567" (numero USA)
 * 
 * @param phone - Numero di telefono in qualsiasi formato
 * @returns Numero formattato per wa.me (solo cifre, con prefisso internazionale)
 */
export function formatPhoneForWhatsApp(phone: string | undefined | null): string {
  if (!phone) return '';
  
  // Rimuovi tutti i caratteri non numerici
  let cleaned = phone.replace(/\D/g, '');
  
  if (!cleaned) return '';
  
  // Rimuovi prefisso "00" internazionale (es. 0039 → 39, 001 → 1)
  if (cleaned.startsWith('00')) {
    cleaned = cleaned.substring(2);
  }
  
  // Se inizia con 39 seguito da 3, è già un numero italiano con prefisso
  if (cleaned.startsWith('39') && cleaned.length >= 11 && cleaned[2] === '3') {
    return cleaned;
  }
  
  // Se inizia con 3 e ha 9-10 cifre, è un numero mobile italiano senza prefisso
  if (cleaned.startsWith('3') && cleaned.length >= 9 && cleaned.length <= 10) {
    return '39' + cleaned;
  }
  
  // Per altri numeri (internazionali o fissi), restituisci pulito
  return cleaned;
}

/**
 * Genera un link WhatsApp completo con messaggio opzionale
 * 
 * @param phone - Numero di telefono
 * @param message - Messaggio precompilato opzionale
 * @returns URL wa.me completo
 */
export function getWhatsAppLink(phone: string | undefined | null, message?: string): string {
  const formattedPhone = formatPhoneForWhatsApp(phone);
  if (!formattedPhone) return '';
  
  const baseUrl = `https://wa.me/${formattedPhone}`;
  if (message) {
    return `${baseUrl}?text=${encodeURIComponent(message)}`;
  }
  return baseUrl;
}
