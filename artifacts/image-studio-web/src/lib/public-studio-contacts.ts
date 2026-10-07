export interface PublicStudioContactSource {
  address?: unknown;
  phone?: unknown;
  email?: unknown;
  whatsapp?: unknown;
}

export interface PublicStudioContacts {
  address: string;
  phone: string;
  email: string;
  whatsapp: string;
}

function trimPublicContact(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizePublicStudioContacts(
  settings: PublicStudioContactSource,
): PublicStudioContacts {
  return {
    address: trimPublicContact(settings.address),
    phone: trimPublicContact(settings.phone),
    email: trimPublicContact(settings.email),
    whatsapp: trimPublicContact(settings.whatsapp),
  };
}

interface PrintServiceProviderInput extends PublicStudioContactSource {
  name: string;
  fiscalComune?: unknown;
  fiscalProvincia?: unknown;
}

export function buildPrintServiceProvider({
  name,
  fiscalComune,
  fiscalProvincia,
  ...contactSource
}: PrintServiceProviderInput) {
  const { address, phone, email } = normalizePublicStudioContacts(contactSource);
  const locality = trimPublicContact(fiscalComune);
  const region = trimPublicContact(fiscalProvincia);

  return {
    '@type': 'LocalBusiness',
    name,
    ...(phone ? { telephone: phone } : {}),
    ...(email ? { email } : {}),
    ...(address ? {
      address: {
        '@type': 'PostalAddress',
        streetAddress: address,
        ...(locality ? { addressLocality: locality } : {}),
        ...(region ? { addressRegion: region } : {}),
        addressCountry: 'IT',
      },
    } : {}),
  };
}