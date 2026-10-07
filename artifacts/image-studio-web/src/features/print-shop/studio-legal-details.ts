import type { StudioSettings } from '@/context/StudioContext';

export const PRINT_SHOP_MAX_PICKUP_DAYS = 30;

export interface StudioLegalDetails {
  name: string;
  address: string;
  phone: string;
  email: string;
  partitaIVA: string;
  complete: boolean;
}

/** Usa esclusivamente i campi amministrati in settings/studio, senza fallback inventati. */
export function resolveStudioLegalDetails(
  settings: Pick<
    StudioSettings,
    'name' | 'phone' | 'email' | 'partitaIVA' | 'fiscalVia' | 'fiscalCap' | 'fiscalComune' | 'fiscalProvincia'
  >,
): StudioLegalDetails {
  const fiscalVia = settings.fiscalVia?.trim() || '';
  const fiscalCap = settings.fiscalCap?.trim() || '';
  const fiscalComune = settings.fiscalComune?.trim() || '';
  const fiscalProvincia = settings.fiscalProvincia?.trim().toUpperCase() || '';
  const details = {
    name: settings.name?.trim() || '',
    address: fiscalVia && fiscalCap && fiscalComune && fiscalProvincia
      ? `${fiscalVia}, ${fiscalCap} ${fiscalComune} (${fiscalProvincia})`
      : '',
    phone: settings.phone?.trim() || '',
    email: settings.email?.trim() || '',
    partitaIVA: settings.partitaIVA?.trim() || '',
  };
  return {
    ...details,
    complete: Boolean(
      details.name && details.phone && details.email && details.partitaIVA
      && fiscalVia && fiscalCap && fiscalComune && fiscalProvincia,
    ),
  };
}
