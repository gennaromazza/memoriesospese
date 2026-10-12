import { MapPin, Truck } from 'lucide-react';
import { formatShopPrice, type ShopOrderDto } from '@shared/shop-types';
import { shopStatusInfo, type ShopStatusTone } from './shop-status';

const TONES: Record<ShopStatusTone, string> = {
  neutral: 'border-sage/30 bg-white text-blue-gray/70',
  wait: 'border-amber-200 bg-amber-50 text-amber-900',
  ok: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  bad: 'border-red-200 bg-red-50 text-red-800',
};

export function ShopStatusPill({ order }: { order: Pick<ShopOrderDto, 'fulfillmentStatus' | 'paymentStatus'> }) {
  const status = shopStatusInfo(order);
  return <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${TONES[status.tone]}`}>{status.label}</span>;
}

export function formatOrderDate(value: string | null): string {
  if (!value) return '';
  return new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value));
}

export function addressText(address: NonNullable<ShopOrderDto['fulfillment']['shippingAddress']>): string {
  return `${address.street} ${address.houseNumber}, ${address.postalCode} ${address.city} (${address.province})`;
}

/** Righe dell'ordine con i prezzi, la spedizione e il totale. */
export function ShopOrderLines({ order, totalCents, shippingCents, shippingFree = false }: { order: Pick<ShopOrderDto, 'lines' | 'totals'>; totalCents?: number; shippingCents?: number; shippingFree?: boolean }) {
  const shipping = shippingCents ?? order.totals.shippingCents;
  const total = totalCents ?? order.totals.totalCents;
  return (
    <div>
      <ul className="divide-y divide-sage/15 text-sm">
        {order.lines.map(line => (
          <li key={line.lineId} className="flex items-start justify-between gap-3 py-2.5">
            <span>
              {line.productName}
              {line.quantity > 1 ? <span className="text-blue-gray/55"> × {line.quantity}</span> : null}
            </span>
            <strong className="whitespace-nowrap">{formatShopPrice(line.lineTotalCents)}</strong>
          </li>
        ))}
        {shipping > 0 && (
          <li className="flex justify-between gap-3 py-2.5 text-blue-gray/70"><span>Spedizione</span><span>{formatShopPrice(shipping)}</span></li>
        )}
        {shipping === 0 && shippingFree && (
          <li className="flex justify-between gap-3 py-2.5 text-blue-gray/70"><span>Spedizione</span><strong className="text-terracotta">Gratuita</strong></li>
        )}
      </ul>
      <div className="mt-2 flex items-center justify-between border-t border-sage/25 pt-3 text-lg font-semibold">
        <span>Totale</span>
        <span className="text-terracotta">{formatShopPrice(total)}</span>
      </div>
    </div>
  );
}

export function ShopDeliveryLine({ order, studioAddress }: { order: Pick<ShopOrderDto, 'fulfillment'>; studioAddress?: string }) {
  const shipping = order.fulfillment.method === 'shipping';
  const address = order.fulfillment.shippingAddress;
  return (
    <p className="flex items-start gap-2 text-sm text-blue-gray/75">
      {shipping ? <Truck className="mt-0.5 h-4 w-4 flex-none text-dark-sage" aria-hidden="true" /> : <MapPin className="mt-0.5 h-4 w-4 flex-none text-dark-sage" aria-hidden="true" />}
      <span>
        {shipping ? `Spedizione${address ? ` a ${addressText(address)}` : ''}` : `Ritiro in studio${studioAddress ? ` · ${studioAddress}` : ''}`}
        {order.fulfillment.tracking ? <><br />Corriere {order.fulfillment.tracking.carrier || '—'} · tracking <strong>{order.fulfillment.tracking.code}</strong></> : null}
      </span>
    </p>
  );
}
