/**
 * Tipi condivisi per il sistema Moduli Informativi
 * Sistema separato dai questionari narrativi — orientato a raccolta dati logistici per il giorno dell'evento.
 */

export interface InfoFormField {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'number' | 'instagram' | 'vendor' | 'address';
  required: boolean;
  options?: string[];
  placeholder?: string;
  // Solo per type === 'instagram': indica di quale cliente del job aggiornare
  // automaticamente il profilo Instagram (client1 = primo, client2 = secondo).
  clientTarget?: 'client1' | 'client2';
  // I campi editoriali restano privati finché il cliente non concede il
  // consenso separato e l'admin non seleziona la singola risposta.
  editorialUse?: boolean;
  editorialCategory?: 'story' | 'vendor';
}

/** Indirizzo postale italiano strutturato raccolto da un modulo informativo. */
export interface InfoFormPostalAddress {
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  province: string;
  country: 'IT';
}

export function createEmptyInfoFormPostalAddress(): InfoFormPostalAddress {
  return { street: '', houseNumber: '', postalCode: '', city: '', province: '', country: 'IT' };
}

export function isEmptyInfoFormPostalAddress(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return true;
  const address = value as Partial<InfoFormPostalAddress>;
  return ![address.street, address.houseNumber, address.postalCode, address.city, address.province]
    .some(part => typeof part === 'string' && part.trim());
}

export function isCompleteInfoFormPostalAddress(value: unknown): value is InfoFormPostalAddress {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const address = value as Partial<InfoFormPostalAddress>;
  return Boolean(
    address.street?.trim() &&
    address.houseNumber?.trim() &&
    /^\d{5}$/.test(address.postalCode || '') &&
    address.city?.trim() &&
    /^[A-Za-z]{2,3}$/.test(address.province || '') &&
    address.country === 'IT',
  );
}

export function formatInfoFormPostalAddress(value: unknown): string {
  if (isEmptyInfoFormPostalAddress(value) || !value || typeof value !== 'object' || Array.isArray(value)) return '';
  const address = value as Partial<InfoFormPostalAddress>;
  const street = [address.street, address.houseNumber]
    .filter(part => typeof part === 'string' && part.trim())
    .join(' ');
  const locality = [
    [address.postalCode, address.city]
      .filter(part => typeof part === 'string' && part.trim())
      .join(' '),
    address.province ? `(${address.province})` : '',
  ].filter(Boolean).join(' ');
  return [street, locality, address.country === 'IT' ? 'Italia' : ''].filter(Boolean).join(', ');
}

/** Dati inseriti dal cliente per un singolo fornitore del matrimonio. */
export interface InfoFormVendor {
  name: string;
  category: string;
  location: string;
}

export const INFO_FORM_VENDOR_LIMITS = {
  count: 20,
  name: 160,
  category: 120,
  location: 180,
} as const;

/**
 * Converte le risposte vendor nuove e quelle storiche nel formato condiviso.
 * La funzione è intenzionalmente permissiva in lettura: le route di submit
 * applicano invece una validazione stretta e rifiutano campi arbitrari.
 */
export function normalizeInfoFormVendors(value: unknown): InfoFormVendor[] {
  const normalize = (item: any): InfoFormVendor | null => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const name = String(item.name ?? '').trim().slice(0, INFO_FORM_VENDOR_LIMITS.name);
    const category = String(item.category ?? item.role ?? '').trim().slice(0, INFO_FORM_VENDOR_LIMITS.category);
    const location = String(item.location ?? '').trim().slice(0, INFO_FORM_VENDOR_LIMITS.location);
    return name ? { name, category, location } : null;
  };

  if (Array.isArray(value)) {
    return value
      .slice(0, INFO_FORM_VENDOR_LIMITS.count)
      .map(normalize)
      .filter((item): item is InfoFormVendor => Boolean(item));
  }

  const legacyObject = normalize(value);
  if (legacyObject) return [legacyObject];

  if (typeof value === 'string') {
    return value
      .split(/\r?\n|;|,/)
      .map(line => line.trim().replace(/^[-–•]\s*/, ''))
      .filter(Boolean)
      .slice(0, INFO_FORM_VENDOR_LIMITS.count)
      .map(line => {
        const parts = line.split(/\s+[—–-]\s+|\s*:\s*/);
        return {
          name: parts[0].trim().slice(0, INFO_FORM_VENDOR_LIMITS.name),
          category: (parts[1] || '').trim().slice(0, INFO_FORM_VENDOR_LIMITS.category),
          location: '',
        };
      })
      .filter(item => item.name);
  }

  return [];
}

export interface InfoFormTemplate {
  id: string;
  name: string;
  description?: string;
  fields: InfoFormField[];
  createdAt: any;
  updatedAt: any;
}

export interface InfoFormSubmission {
  id: string;
  jobId: string;
  templateId: string;
  templateName: string;
  templateFields: InfoFormField[];
  token: string;
  clienteId?: string;
  clientEmail: string;
  clientName: string;
  status: 'pending' | 'completed';
  answers: Record<string, any>;
  editorialConsent?: boolean;
  editorialConsentAt?: any;
  sentAt: any;
  completedAt?: any;
}

export interface InfoFormNotification {
  id: string;
  submissionId: string;
  jobId: string;
  clientName: string;
  templateName: string;
  createdAt: any;
  isRead: boolean;
  deepLink: string;
}
