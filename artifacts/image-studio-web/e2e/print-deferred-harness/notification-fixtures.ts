import { PRINT_SHOP_CATALOG, POLAROID_SKU } from '@shared/print-shop-catalog';

// Opt-in, isolated browser fixture. No real SDK, database, Gmail or PayPal calls.
export function installNotificationFixtures() {
  if (!new URLSearchParams(window.location.search).has('notificationFixture')) return;
  const catalog = PRINT_SHOP_CATALOG.map(product => ({ ...product, attivo: true }));
  const polaroid = catalog.find(product => product.sku === POLAROID_SKU)!;
  const draft: any = {
    id: 'recover-fixture', orderNumber: 'ST-RECOVER-FIXTURE',
    customer: { name: 'Cliente Fixture', email: 'customer@example.test', phone: '327 123 4567' },
    payment: { method: 'paypal', status: 'pending' },
    fulfillment: { method: 'shipping', status: 'draft', shippingAddress: {
      street: 'Via Salvata', houseNumber: '12', postalCode: '81031', city: 'Aversa', province: 'CE', country: 'IT',
    } },
    billingDetails: { fiscalCode: 'RSSMRA85M01F839X', residenceAddress: {
      street: 'Via Residenza', houseNumber: '7', postalCode: '81031', city: 'Aversa', province: 'CE', country: 'IT',
    } },
    currency: 'EUR', catalogVersion: 4, quoteFingerprint: 'a'.repeat(64),
    totals: { subtotalCents: 100, discountCents: 0, shippingCents: 300, totalCents: 400 },
    assets: [{ id: 'photo-saved', status: 'ready', originalName: 'foto-salvata.jpg', widthPx: 3000, heightPx: 4000 }],
    printShop: {
      assetCount: 1, copyCount: 1, customerNotes: 'Note già salvate',
      requestedItems: [{ sku: POLAROID_SKU, finish: 'matte', fitMode: 'cover',
        assignments: [{ assetId: 'photo-saved', copies: 1, composition: { version: 1, x: .73, y: .38, zoom: 1.3 } }] }],
      items: [{ sku: POLAROID_SKU, productName: polaroid.nome, copyCount: 1, assetCount: 1,
        unitPriceCents: 100, lineTotalCents: 100,
        assignments: [{ assetId: 'photo-saved', copies: 1, composition: { version: 1, x: .73, y: .38, zoom: 1.3 } }] }],
    },
  };
  const orders = [
    { ...draft, id: 'local', orderNumber: 'ST-LOCAL',
      fulfillment: { status: 'submitted', method: 'studio_pickup' }, payment: { status: 'paid' } },
    { ...draft, id: 'legacy', orderNumber: 'ST-LEGACY',
      customer: { name: 'Cliente Legacy', email: 'legacy@example.test' }, telefonoCliente: '0039 (327) 765-4321',
      fulfillment: { status: 'submitted', method: 'studio_pickup' }, payment: { status: 'paid' } },
    { ...draft, id: 'international', orderNumber: 'ST-FRANCE',
      customer: { name: 'Cliente Francia', email: 'france@example.test', phone: '+33 612 345 678' },
      fulfillment: { status: 'submitted', method: 'studio_pickup' }, payment: { status: 'paid' } },
    { ...draft, id: 'invalid', orderNumber: 'ST-INVALID',
      customer: { name: 'Cliente Invalid', email: 'invalid@example.test', phone: '123' },
      fulfillment: { status: 'submitted', method: 'studio_pickup' }, payment: { status: 'paid' } },
    { ...draft, id: 'missing', orderNumber: 'ST-MISSING',
      customer: { name: 'Cliente Missing', email: 'missing@example.test' },
      fulfillment: { status: 'submitted', method: 'studio_pickup' }, payment: { status: 'paid' } },
  ];
  const originalFetch = window.fetch.bind(window);
  (window as any).__printFixtureRequests = [];
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.origin);
    if (!url.pathname.startsWith('/api/')) return originalFetch(input, init);
    (window as any).__printFixtureRequests.push({ path: url.pathname, method: init?.method || 'GET', body: init?.body });
    const json = (data: any, status = 200) => new Response(JSON.stringify(data), {
      status, headers: { 'content-type': 'application/json' },
    });
    if (url.pathname.endsWith('/catalog')) return json({ products: catalog, currency: 'EUR', catalogVersion: 4,
      shipping: { enabled: true, priceCents: 300, estimatedMinDays: 2, estimatedMaxDays: 5 } });
    if (url.pathname.endsWith('/paypal/config')) return json({ enabled: true, checkoutEnabled: true, clientId: 'fixture' });
    if (url.pathname.endsWith('/admin/orders')) return json({ orders });
    if (url.pathname.endsWith('/lab-shipments')) return json({ shipments: [] });
    if (url.pathname.includes('/admin/orders/')) {
      const id = url.pathname.split('/admin/orders/')[1].split('/')[0];
      return json({ order: orders.find(order => order.id === id) });
    }
    if (url.pathname.endsWith('/reminders/stop')) return json({ stopped: true });
    if (url.pathname.includes('/orders/forbidden')) return json({ message: 'Ordine non trovato', code: 'order_not_found' }, 404);
    if (url.pathname.includes('/orders/expired')) return json({ message: 'Ordine scaduto', code: 'draft_expired' }, 410);
    if (url.pathname.includes('/orders/paid-fixture')) return json({ order: { ...draft, id: 'paid-fixture',
      payment: { method: 'paypal', status: 'paid' }, fulfillment: { status: 'submitted', method: 'studio_pickup' } } });
    if (url.pathname.endsWith('/quote')) return json({ quote: { currency: 'EUR', catalogVersion: 4,
      totals: draft.totals, items: draft.printShop.items, quoteFingerprint: draft.quoteFingerprint,
      assetCount: 1, copyCount: 1, qualityWarnings: [] } });
    if (url.pathname.endsWith('/preview')) return new Response(new Blob([], { type: 'image/jpeg' }));
    if (url.pathname.includes('/orders/recover-fixture')) return json({ order: draft });
    return json({ message: 'Fixture refused an unexpected API request' }, 400);
  };
}