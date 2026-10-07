import { formatPhoneForWhatsApp } from './phone-utils';

export interface PrintOrderContact {
  id?: string;
  orderNumber?: string;
  customer?: { phone?: string };
  telefonoCliente?: string;
  whatsappCliente?: string;
}

export function printOrderPhone(order: PrintOrderContact): string {
  return [order.customer?.phone, order.telefonoCliente, order.whatsappCliente]
    .find(value => typeof value === 'string' && value.trim())?.trim() || '';
}

export function printOrderWhatsAppLink(order: PrintOrderContact): string {
  const original = printOrderPhone(order);
  // Do not turn arbitrary text or an incomplete number into an actionable link.
  if (!/^(?:\+|00)?[\d\s().-]+$/.test(original)) return '';
  const explicit = original.startsWith('+') || original.startsWith('00');
  const phone = explicit
    ? original.replace(/\D/g, '').replace(/^00/, '')
    : formatPhoneForWhatsApp(original);
  if (!/^[1-9]\d{6,14}$/.test(phone)) return '';
  return `https://wa.me/${phone}?text=${encodeURIComponent(`Ciao, ti contattiamo per l’ordine stampe ${order.orderNumber || order.id || ''}.`)}`;
}