import type { BookingCampaignFE } from '@shared/booking-types';

export interface CampaignPaymentFormValues {
  richiedeApprovazione: boolean;
  richiedeAcconto: boolean;
  accontoImportoEuro: string;
  emailPromemoriaAcconto?: boolean;
  emailRecuperoAcconto?: boolean;
}

type PaymentFields = Pick<BookingCampaignFE,
  'richiedeApprovazione' | 'richiedeAcconto' | 'accontoImportoCentesimi' | 'emailPromemoriaAcconto' | 'emailRecuperoAcconto'>;

export function campaignPaymentForm(campaign?: PaymentFields): CampaignPaymentFormValues {
  const cents = campaign?.accontoImportoCentesimi;
  return {
    richiedeApprovazione: campaign?.richiedeApprovazione ?? true,
    richiedeAcconto: campaign?.richiedeAcconto ?? false,
    emailPromemoriaAcconto: campaign?.emailPromemoriaAcconto !== false,
    emailRecuperoAcconto: campaign === undefined || campaign.emailRecuperoAcconto === true,
    accontoImportoEuro: typeof cents === 'number' && Number.isSafeInteger(cents) && cents > 0
      ? `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`
      : '',
  };
}

export function campaignPaymentFields(form: CampaignPaymentFormValues): PaymentFields {
  let cents: number | null = null;
  if (form.richiedeAcconto) {
    const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(form.accontoImportoEuro.trim());
    if (match) cents = Number(`${match[1]}${(match[2] ?? '').padEnd(2, '0')}`);
    if (cents === null || !Number.isSafeInteger(cents) || cents <= 0) {
      throw new Error('Inserisci un acconto maggiore di zero, con al massimo due decimali.');
    }
  }
  return {
    richiedeApprovazione: form.richiedeApprovazione,
    richiedeAcconto: form.richiedeAcconto,
    emailPromemoriaAcconto: form.emailPromemoriaAcconto !== false,
    emailRecuperoAcconto: form.richiedeAcconto && form.emailRecuperoAcconto === true,
    // Disattivando l'acconto si elimina esplicitamente l'importo salvato.
    accontoImportoCentesimi: cents,
  };
}
