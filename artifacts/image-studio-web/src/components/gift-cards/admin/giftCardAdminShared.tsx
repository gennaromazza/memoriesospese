import { Badge } from '@/components/ui/badge';
import {
  GIFT_CARD_STATUS_LABELS,
  type GiftCardPaymentMethod,
  type GiftCardStatus,
  type GiftCardTypeDto,
} from '@shared/gift-card-types';
import { GiftCardApiError } from '@/features/gift-cards/gift-cards-api';
import type { BookingCampaignFE } from '@shared/booking-types';

export const PAYMENT_OPTIONS: ReadonlyArray<{ value: GiftCardPaymentMethod; label: string; hint?: string }> = [
  { value: 'contante', label: 'Contanti' },
  { value: 'carta', label: 'Carta' },
  { value: 'bonifico', label: 'Bonifico', hint: 'La card resta in attesa finché non confermi l\'arrivo del bonifico.' },
  { value: 'paypal', label: 'PayPal' },
];

const STATUS_CLASSES: Record<GiftCardStatus, string> = {
  attiva: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100',
  in_attesa_pagamento: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
  riscattata: 'bg-sky-100 text-sky-800 hover:bg-sky-100',
  scaduta: 'bg-stone-200 text-stone-700 hover:bg-stone-200',
  annullata: 'bg-red-100 text-red-800 hover:bg-red-100',
};

export function GiftCardStatusBadge({ status }: { status: GiftCardStatus }) {
  return <Badge className={STATUS_CLASSES[status]} variant="secondary">{GIFT_CARD_STATUS_LABELS[status]}</Badge>;
}

export function errorText(error: unknown): string {
  if (error instanceof GiftCardApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return 'Operazione non riuscita. Riprova.';
}

/** Data come 20 dic 2026, nel fuso orario dello studio. */
export function formatDay(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  const date = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

/** Fine giornata (ora italiana) di una data YYYY-MM-DD, come ISO 8601. */
export function endOfDayIso(isoDay: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDay)) return null;
  const date = new Date(`${isoDay}T23:59:59`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Scadenza che una card avrebbe, secondo le regole del tipo. */
export function typeExpiryIso(type: GiftCardTypeDto, campaigns: readonly BookingCampaignFE[]): string | null {
  if (type.validityMode === 'date' && type.validityDate) return endOfDayIso(type.validityDate);
  if (type.validityMode === 'campaign' && type.campaignId) {
    const campaign = campaigns.find(item => item.id === type.campaignId);
    return campaign ? campaign.dataFine.toISOString() : null;
  }
  return null;
}

export function typeExpiryLabel(type: GiftCardTypeDto, campaigns: readonly BookingCampaignFE[]): string {
  if (type.validityMode === 'none') return 'Nessuna scadenza';
  if (type.validityMode === 'date') return type.validityDate ? `Fino al ${formatDay(endOfDayIso(type.validityDate))}` : 'Data da scegliere';
  const iso = typeExpiryIso(type, campaigns);
  return iso ? `Fine campagna, ${formatDay(iso)}` : 'Fine campagna';
}

export function eurosToCents(value: string): number {
  const normalized = value.replace(',', '.').trim();
  const euros = Number(normalized);
  return Number.isFinite(euros) ? Math.round(euros * 100) : 0;
}

export function centsToEuros(cents: number): string {
  return cents ? String(cents / 100) : '';
}

export function openInNewTab(path: string, createUrl: (path: string) => string) {
  window.open(createUrl(path), '_blank', 'noopener');
}
