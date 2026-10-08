/** Strumenti per i test dello shop: un PayPal finto che si comporta come quello vero. */
export class FakePayPal {
  config = { merchantId: 'MERCH' };
  enabled = true;
  created: any[] = [];
  captureError: unknown;
  amountOverride: string | undefined;
  webhookValid = true;
  private completed = new Map<string, any>();

  publicConfig() {
    return { enabled: this.enabled, checkoutEnabled: this.enabled, webhookReady: true, environment: 'sandbox' as const, clientId: 'cid' };
  }

  async createOrder(input: any, requestId?: string) {
    const id = `PAYPAL-ORDER-${this.created.length + 1}`;
    this.created.push({ ...input, requestId, id });
    return { id, status: 'CREATED', links: [{ rel: 'approve', href: `https://paypal.test/approve/${id}` }] };
  }

  captureResponse(id: string, captureId = 'CAP-1') {
    const input = this.created.find(item => item.id === id);
    return {
      id,
      status: 'COMPLETED',
      payer: { email_address: 'payer@example.com' },
      purchase_units: [{
        custom_id: input.internalOrderId,
        invoice_id: input.invoiceId,
        payee: { merchant_id: 'MERCH' },
        payments: {
          captures: [{
            id: captureId,
            status: 'COMPLETED',
            amount: { value: this.amountOverride ?? (input.amountCents / 100).toFixed(2), currency_code: 'EUR' },
            seller_receivable_breakdown: { paypal_fee: { value: '0.95', currency_code: 'EUR' } },
          }],
        },
      }],
    };
  }

  async captureOrder(id: string) {
    if (this.captureError) throw this.captureError;
    const response = this.captureResponse(id);
    this.completed.set(id, response);
    return response;
  }

  /** Simula un incasso che PayPal ha completato senza che il sito lo sapesse. */
  completeBehindTheScenes(id: string) {
    this.completed.set(id, this.captureResponse(id));
  }

  async getOrder(id: string) {
    return this.completed.get(id) ?? { id, status: 'APPROVED', purchase_units: [{}] };
  }

  async verifyWebhook() {
    return this.webhookValid;
  }
}
