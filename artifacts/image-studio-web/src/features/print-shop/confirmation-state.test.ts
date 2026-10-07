import { describe, expect, it } from 'vitest';
import {
  printShopConfirmationFromOrder,
  readPrintShopConfirmationLocation,
} from './confirmation-state';
import type { PrintShopOrderListItem } from './types';

function orderWithPayment(status: 'pending' | 'paid'): PrintShopOrderListItem {
  return {
    id: 'order-owner-1',
    orderNumber: 'ST-2026-SERVER',
    totals: { subtotalCents: 1000, totalCents: 1000, currency: 'EUR' },
    payment: { method: 'paypal', status },
    fulfillment: { method: 'studio_pickup', status: 'draft' },
  } as PrintShopOrderListItem;
}

describe('print shop confirmation trust boundary', () => {
  it('reads only orderId from the URL and never trusts paid or orderNumber query values', () => {
    const location = readPrintShopConfirmationLocation(
      '?orderId=order-owner-1&payment=paid&orderNumber=ST-FAKE',
    );

    expect(location).toEqual({ orderId: 'order-owner-1' });
    expect(printShopConfirmationFromOrder(null)).toEqual({ paid: false, deferred: false, actionRequired: false, orderNumber: null });
  });

  it('confirms payment and number only from the authenticated order response', () => {
    expect(printShopConfirmationFromOrder(orderWithPayment('pending'))).toEqual({
      paid: false,
      deferred: false,
      actionRequired: false,
      orderNumber: 'ST-2026-SERVER',
    });
    expect(printShopConfirmationFromOrder(orderWithPayment('paid'))).toEqual({
      paid: true,
      deferred: false,
      actionRequired: false,
      orderNumber: 'ST-2026-SERVER',
    });
  });

  it('shows a paid-but-blocked order as requiring assistance, never as confirmed', () => {
    const order = orderWithPayment('paid') as PrintShopOrderListItem;
    order.payment.status = 'paid_action_required';
    expect(printShopConfirmationFromOrder(order)).toEqual({
      paid: false,
      deferred: false,
      actionRequired: true,
      orderNumber: 'ST-2026-SERVER',
    });
  });
  it('shows authorized delivery payment as unpaid, using only the server response', () => {
    const order = orderWithPayment('pending');
    order.payment!.status = 'deferred';
    expect(printShopConfirmationFromOrder(order)).toMatchObject({ paid: false, deferred: true, actionRequired: false });
    expect(readPrintShopConfirmationLocation('?orderId=x&payment=deferred')).toEqual({ orderId: 'x' });
  });
});
