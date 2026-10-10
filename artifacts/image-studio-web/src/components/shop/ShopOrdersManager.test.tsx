import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { ShopAdminOrderDto, ShopAdminOrderSummaryDto } from '@shared/shop-types';
import { Dialog } from '@/components/ui/dialog';
import ShopOrdersManager, { OrderDetail } from './ShopOrdersManager';

vi.mock('@/features/shop/shop-api', () => ({ shopApi: {}, shopBlob: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

const summary = (patch: Partial<ShopAdminOrderSummaryDto> = {}): ShopAdminOrderSummaryDto => ({
  id: 'o1',
  orderNumber: 'SH-2026-AAAA1111',
  createdAt: '2026-12-01T10:00:00.000Z',
  paidAt: '2026-12-01T10:05:00.000Z',
  customerName: 'Alice Verdi',
  customerEmail: 'alice@example.com',
  fulfillmentStatus: 'photos_received',
  paymentStatus: 'paid',
  method: 'studio_pickup',
  totalCents: 2100,
  lineCount: 2,
  photosMissing: null,
  photoDeadlineAt: null,
  photoOverdue: false,
  needsAttention: false,
  ...patch,
});

const detail = (patch: Partial<ShopAdminOrderDto> = {}): ShopAdminOrderDto => ({
  ...summary(),
  customer: { name: 'Alice Verdi', email: 'alice@example.com', phone: '333 1112222' },
  customerNotes: 'Bianco e nero',
  adminNotes: null,
  lines: [
    {
      lineId: 'l_00000001', productId: 'mug', productName: 'Tazza con foto', categoria: 'natale', unitPriceCents: 1500, listPriceCents: 1500,
      discountPercent: 0, quantity: 1, photosRequired: 2, lineTotalCents: 1500,
      photos: [{ id: 'a1', lineId: 'l_00000001', originalName: 'IMG_1.jpg', status: 'ready', widthPx: 3000, heightPx: 2000, sizeBytes: 1000, lowResolution: false }],
      photosMissing: 1,
    },
    {
      lineId: 'l_00000002', productId: 'card', productName: 'Cartolina', categoria: 'natale', unitPriceCents: 300, listPriceCents: 300,
      discountPercent: 0, quantity: 2, photosRequired: 0, lineTotalCents: 600, photos: [], photosMissing: 0,
    },
  ],
  totals: { subtotalCents: 2100, shippingCents: 0, totalCents: 2100 },
  fulfillment: { shippingAddress: null, tracking: null, readyAt: null, shippedAt: null, deliveredAt: null },
  billingDetails: null,
  payment: { amountCents: 2100, paypalFeeCents: 95, netAmountCents: 2005, refundedCents: 0, paypalOrderId: 'PAYPAL-ORDER-1', paypalCaptureId: 'CAP-1', reconciliationRequired: false, reconciliationReason: null },
  legal: { acceptedAt: '2026-12-01T10:03:00.000Z', termsVersion: '2026-10-08.1', manifestHash: 'abc' },
  notifications: [{ key: 'order_confirmed', kind: 'order_confirmed', status: 'sent', attempts: 1, sentAt: '2026-12-01T10:06:00.000Z', lastError: null }],
  history: [{ at: '2026-12-02T09:00:00.000Z', by: 'admin@studio.test', from: 'photos_received', to: 'in_production', note: null }],
  refundedAfterShipping: false,
  refundPending: false,
  allowedStatuses: ['in_production', 'cancelled'],
  canReactivate: false,
  canRequestNewPhoto: true,
  ...patch,
});

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderList(lists: Record<string, ShopAdminOrderSummaryDto[]>) {
  const queries = client();
  for (const [view, orders] of Object.entries(lists)) queries.setQueryData(['shop-admin-orders', view, ''], orders);
  return renderToStaticMarkup(
    <QueryClientProvider client={queries}>
      <ShopOrdersManager />
    </QueryClientProvider>,
  );
}

function renderDetail(order: ShopAdminOrderDto) {
  const queries = client();
  queries.setQueryData(['shop-admin-order', order.id], order);
  return renderToStaticMarkup(
    <QueryClientProvider client={queries}>
      <Dialog open>
        <OrderDetail orderId={order.id} onClose={() => undefined} />
      </Dialog>
    </QueryClientProvider>,
  );
}

describe('elenco degli ordini dello shop', () => {
  it('mostra numero, cliente, stato e importo, con il conteggio di quelli da guardare', () => {
    const html = renderList({
      active: [summary(), summary({ id: 'o2', orderNumber: 'SH-2026-BBBB2222', customerName: 'Bruno Neri', fulfillmentStatus: 'awaiting_photos', photosMissing: 2, photoDeadlineAt: '2026-12-08T10:00:00.000Z' })],
      attention: [summary({ id: 'o3', needsAttention: true }), summary({ id: 'o4', needsAttention: true })],
    });
    expect(html).toContain('SH-2026-AAAA1111');
    expect(html).toContain('Alice Verdi');
    expect(html).toContain('21,00');
    expect(html).toContain('Da lavorare');
    expect(html).toContain('Mancano le foto');
    expect(html).toContain('mancano 2 foto');
    expect(html).toContain('>2<');
  });

  it('con nessun ordine lo dice', () => {
    expect(renderList({ active: [], attention: [] })).toContain('Nessun ordine in questa vista.');
  });
});

describe('dettaglio ordine per lo studio', () => {
  it('mostra cliente, prodotti, foto, pagamento, email e storia', () => {
    const html = renderDetail(detail());
    expect(html).toContain('SH-2026-AAAA1111');
    expect(html).toContain('mailto:alice@example.com');
    expect(html).toContain('tel:3331112222');
    expect(html).toContain('wa.me');
    expect(html).toContain('Bianco e nero');
    expect(html).toContain('Tazza con foto');
    expect(html).toContain('1 di 2 foto');
    expect(html).toContain('mancano 1');
    expect(html).toContain('Chiedi un&#x27;altra');
    expect(html).toContain('Scarica tutte le foto (zip)');
    expect(html).toContain('CAP-1');
    expect(html).toContain('Conferma ordine');
    expect(html).toContain('inviata');
    expect(html).toContain('In lavorazione');
  });

  it('offre solo i passaggi consentiti', () => {
    const html = renderDetail(detail());
    expect(html).toContain('Inizia la lavorazione');
    expect(html).toContain('Annulla l’ordine');
    expect(html).not.toContain('Segna come spedito');
    const shipping = renderDetail(detail({ method: 'shipping', fulfillmentStatus: 'in_production', allowedStatuses: ['shipped', 'cancelled'], fulfillment: { shippingAddress: { street: 'Via Po', houseNumber: '3', postalCode: '10100', city: 'Torino', province: 'TO', country: 'IT' }, tracking: null, readyAt: null, shippedAt: null, deliveredAt: null } }));
    expect(shipping).toContain('Segna come spedito');
    expect(shipping).toContain('Via Po 3, 10100 Torino (TO)');
    const closed = renderDetail(detail({ fulfillmentStatus: 'delivered', allowedStatuses: [] }));
    expect(closed).not.toContain('Avanzamento');
  });

  it('segnala quello che lo studio deve guardare', () => {
    const late = renderDetail(detail({ paymentStatus: 'paid_action_required', fulfillmentStatus: 'cancelled', allowedStatuses: [], canReactivate: true, needsAttention: true }));
    expect(late).toContain('Pagamento da controllare');
    expect(late).toContain('Tieni l&#x27;ordine e riattivalo');
    const refund = renderDetail(detail({ fulfillmentStatus: 'cancelled', refundPending: true, allowedStatuses: [] }));
    expect(refund).toContain('Da rimborsare');
    const overdue = renderDetail(detail({ fulfillmentStatus: 'awaiting_photos', photoOverdue: true, photoDeadlineAt: '2026-12-08T10:00:00.000Z', allowedStatuses: ['cancelled'] }));
    expect(overdue).toContain('non sono arrivate entro il termine');
    const afterShipping = renderDetail(detail({ refundedAfterShipping: true }));
    expect(afterShipping).toContain('rimborsato dopo la spedizione');
  });

  it('con le email fallite mostra l\'errore', () => {
    const html = renderDetail(detail({ notifications: [{ key: 'shipped', kind: 'shipped', status: 'failed', attempts: 2, sentAt: null, lastError: 'Gmail non risponde' }] }));
    expect(html).toContain('non inviata (Gmail non risponde)');
  });

  it('senza telefono non mostra i collegamenti telefonici', () => {
    const html = renderDetail(detail({ customer: { name: 'Alice', email: 'alice@example.com', phone: null } }));
    expect(html).not.toContain('tel:');
    expect(html).not.toContain('wa.me');
  });
});
