import { formatPhoneForWhatsApp } from '@shared/phone-utils';

const ALLOWED_RAW = /^\+?[\d\s().\-/]+$/;

/** Digits for wa.me, or '' when the value is not a plausible phone number (7..15 digits). */
export function validWhatsAppDigits(value: string | null | undefined): string {
  const raw = (value ?? '').trim();
  if (!raw || !ALLOWED_RAW.test(raw)) return '';
  let digits = formatPhoneForWhatsApp(raw);
  if (!raw.startsWith('+') && !raw.startsWith('00') &&
    /^0\d{8,10}$/.test(digits) && !/^0+$/.test(digits)) digits = '39' + digits;
  if (!/^[1-9]\d{6,14}$/.test(digits)) return '';
  return digits;
}

export function resolveStudioWhatsApp(settings: { whatsapp?: string; phone?: string }): string {
  return validWhatsAppDigits(settings.whatsapp) || validWhatsAppDigits(settings.phone);
}

export function printShopHelpMessage(orderNumber?: string | null): string {
  const number = (orderNumber ?? '').trim();
  return number
    ? `Ciao, ho bisogno di aiuto con il mio ordine di stampe ${number}.`
    : 'Ciao, ho bisogno di aiuto con un ordine di stampe fotografiche.';
}

export function printShopWhatsAppUrl(
  settings: { whatsapp?: string; phone?: string },
  orderNumber?: string | null,
): string | null {
  const digits = resolveStudioWhatsApp(settings);
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(printShopHelpMessage(orderNumber))}` : null;
}
