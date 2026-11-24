import { describe, expect, it } from 'vitest';
import { toOwnerDto } from './order-model.js';

describe('toOwnerDto shop', () => {
  it('non espone costo interno del prodotto nelle righe dell’ordine cliente', () => {
    const dto = toOwnerDto('order-1', {
      orderNumber: 'NAT-001',
      costoUnitario: 3.75,
      payment: { status: 'pending' },
      fulfillment: { method: 'studio_pickup' },
      totals: { subtotalCents: 2000, shippingCents: 0, totalCents: 2000 },
      lines: [{
        lineId: 'line-1',
        productId: 'p1',
        productName: 'Tazza',
        categoria: 'natale',
        unitPriceCents: 2000,
        listPriceCents: 2000,
        discountPercent: 0,
        quantity: 1,
        photosRequired: 0,
        lineTotalCents: 2000,
        costoUnitario: 3.75,
      }],
    }, [], Date.now());

    expect(dto).not.toHaveProperty('costoUnitario');
    expect(dto.lines[0]).not.toHaveProperty('costoUnitario');
    expect(dto.lines[0]).toMatchObject({ productName: 'Tazza', unitPriceCents: 2000 });
  });
});
