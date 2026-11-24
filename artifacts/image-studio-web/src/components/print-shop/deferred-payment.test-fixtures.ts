/** Offline-only UI fixture, also used by the isolated browser harness. */
export const draftOrder = () => ({
  id: 'offline-draft', orderNumber: 'ST-TEST-50', customer: { name: 'Cliente fixture' },
  quoteFingerprint: 'quote-50', totals: { totalCents: 1500 },
  payment: { status: 'pending', collectedCents: 0, dueCents: 1500 },
  fulfillment: { status: 'draft', method: 'studio_pickup' as const },
  printShop: { assetCount: 50, copyCount: 50, items: [{
    productName: 'Stampe', formatLabel: '10×15', finish: 'glossy', copyCount: 50,
    assignments: [{ assetId: 'photo', copies: 50 }],
  }] },
  assets: Array.from({ length: 50 }, (_, i) => ({ id: `photo-${i}`, originalName: `Foto-${i}.jpg` })),
  manualAcceptanceEligibility: { canAccept: true, snapshotHash: 'snapshot-50' },
  deferredPaymentEligibility: { canAuthorize: false, reason: 'Ordine non confermato: accetta manualmente la bozza.' },
});
