import { createHash } from 'node:crypto';

export type PayPalEnvironment = 'sandbox' | 'live';

export interface PayPalOrdersConfig {
  environment: PayPalEnvironment;
  clientId: string;
  clientSecret: string;
  webhookId: string;
  merchantId?: string;
}

export interface PayPalPublicConfig {
  enabled: boolean;
  checkoutEnabled: boolean;
  webhookReady: boolean;
  environment: PayPalEnvironment;
  clientId: string | null;
}

export interface PayPalCreateOrderInput {
  internalOrderId: string;
  orderNumber: string;
  invoiceId?: string;
  amountCents: number;
  currency?: 'EUR';
}

export interface PayPalOrderResponse {
  id: string;
  status?: string;
  links?: Array<{ href?: string; rel?: string; method?: string }>;
  purchase_units?: Array<Record<string, any>>;
  payer?: Record<string, any>;
}

export interface PayPalWebhookHeaders {
  transmissionId?: string;
  transmissionTime?: string;
  certUrl?: string;
  authAlgo?: string;
  transmissionSig?: string;
}

export class PayPalConfigurationError extends Error {
  constructor(message = 'PayPal non configurato') {
    super(message);
    this.name = 'PayPalConfigurationError';
  }
}

export class PayPalApiError extends Error {
  readonly status: number;
  readonly details: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'PayPalApiError';
    this.status = status;
    this.details = details;
  }
}

export function loadPayPalOrdersConfig(
  env: NodeJS.ProcessEnv = process.env,
): PayPalOrdersConfig {
  const rawEnvironment = (env.PAYPAL_ENVIRONMENT || 'sandbox').trim().toLowerCase();
  if (rawEnvironment !== 'sandbox' && rawEnvironment !== 'live') {
    throw new PayPalConfigurationError(
      'PAYPAL_ENVIRONMENT deve essere "sandbox" oppure "live"',
    );
  }

  return {
    environment: rawEnvironment,
    clientId: (env.PAYPAL_CLIENT_ID || '').trim(),
    clientSecret: (env.PAYPAL_CLIENT_SECRET || '').trim(),
    webhookId: (env.PAYPAL_WEBHOOK_ID || '').trim(),
    merchantId: (env.PAYPAL_MERCHANT_ID || '').trim() || undefined,
  };
}

export function paypalPublicConfig(config: PayPalOrdersConfig): PayPalPublicConfig {
  const credentialsReady = Boolean(config.clientId && config.clientSecret);
  const webhookReady = credentialsReady && Boolean(config.webhookId);
  // In produzione il webhook è parte della riconciliazione finanziaria: senza
  // non si espone il checkout. In sandbox è possibile sviluppare create/capture.
  const checkoutEnabled = credentialsReady && (config.environment === 'sandbox' || webhookReady);
  return {
    enabled: checkoutEnabled,
    checkoutEnabled,
    webhookReady,
    environment: config.environment,
    clientId: checkoutEnabled ? config.clientId : null,
  };
}

export function paypalRequestId(...parts: string[]): string {
  return createHash('sha256').update(parts.join(':')).digest('hex');
}

export class PayPalOrdersClient {
  private accessTokenCache?: { token: string; expiresAt: number };

  constructor(
    readonly config: PayPalOrdersConfig,
    private readonly fetchImpl: typeof fetch = globalThis.fetch,
  ) {}

  publicConfig(): PayPalPublicConfig {
    return paypalPublicConfig(this.config);
  }

  assertCheckoutConfigured(): void {
    if (!this.publicConfig().checkoutEnabled) {
      throw new PayPalConfigurationError(
        this.config.environment === 'live' && !this.config.webhookId
          ? 'PayPal live richiede PAYPAL_WEBHOOK_ID per la riconciliazione dei pagamenti'
          : 'PayPal richiede PAYPAL_CLIENT_ID e PAYPAL_CLIENT_SECRET',
      );
    }
  }

  assertWebhookConfigured(): void {
    this.assertCheckoutConfigured();
    if (!this.config.webhookId) {
      throw new PayPalConfigurationError('PayPal richiede PAYPAL_WEBHOOK_ID per verificare i webhook');
    }
  }

  async createOrder(
    input: PayPalCreateOrderInput,
    requestId = paypalRequestId('print-shop', 'create', input.internalOrderId),
  ): Promise<PayPalOrderResponse> {
    this.assertCheckoutConfigured();
    if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
      throw new Error('Importo PayPal non valido');
    }

    return this.request<PayPalOrderResponse>('/v2/checkout/orders', {
      method: 'POST',
      headers: { 'PayPal-Request-Id': requestId },
      body: {
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: input.internalOrderId,
            custom_id: input.internalOrderId,
            invoice_id: input.invoiceId || input.orderNumber,
            amount: {
              currency_code: input.currency || 'EUR',
              value: centsToPayPalValue(input.amountCents),
            },
          },
        ],
      },
    });
  }

  async captureOrder(
    paypalOrderId: string,
    requestId: string,
  ): Promise<PayPalOrderResponse> {
    this.assertCheckoutConfigured();
    assertPayPalResourceId(paypalOrderId);
    return this.request<PayPalOrderResponse>(
      `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`,
      {
        method: 'POST',
        headers: { 'PayPal-Request-Id': requestId },
        body: {},
      },
    );
  }

  async getOrder(paypalOrderId: string): Promise<PayPalOrderResponse> {
    this.assertCheckoutConfigured();
    assertPayPalResourceId(paypalOrderId);
    return this.request<PayPalOrderResponse>(
      `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`,
      { method: 'GET' },
    );
  }

  async verifyWebhook(
    headers: PayPalWebhookHeaders,
    event: unknown,
  ): Promise<boolean> {
    this.assertWebhookConfigured();
    const required = {
      transmission_id: headers.transmissionId,
      transmission_time: headers.transmissionTime,
      cert_url: headers.certUrl,
      auth_algo: headers.authAlgo,
      transmission_sig: headers.transmissionSig,
    };
    if (Object.values(required).some(value => !value)) return false;

    const result = await this.request<{ verification_status?: unknown }>(
      '/v1/notifications/verify-webhook-signature',
      {
        method: 'POST',
        body: {
          ...required,
          webhook_id: this.config.webhookId,
          webhook_event: event,
        },
      },
    );
    return result.verification_status === 'SUCCESS';
  }

  private async request<T>(
    path: string,
    options: {
      method: 'GET' | 'POST';
      headers?: Record<string, string>;
      body?: unknown;
    },
  ): Promise<T> {
    const accessToken = await this.accessToken();
    const response = await this.fetchImpl(`${paypalApiBase(this.config.environment)}${path}`, {
      method: options.method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      signal: AbortSignal.timeout(15_000),
    });
    const payload = await response.json().catch(() => undefined);
    if (!response.ok) {
      throw new PayPalApiError(
        `PayPal ha rifiutato la richiesta (${response.status})`,
        response.status,
        payload,
      );
    }
    return payload as T;
  }

  private async accessToken(): Promise<string> {
    if (
      this.accessTokenCache &&
      this.accessTokenCache.expiresAt > Date.now() + 30_000
    ) {
      return this.accessTokenCache.token;
    }
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new PayPalConfigurationError(
        'PAYPAL_CLIENT_ID e PAYPAL_CLIENT_SECRET sono obbligatori',
      );
    }

    const basic = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`,
      'utf8',
    ).toString('base64');
    const response = await this.fetchImpl(
      `${paypalApiBase(this.config.environment)}/v1/oauth2/token`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basic}`,
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
        signal: AbortSignal.timeout(10_000),
      },
    );
    const payload = (await response.json().catch(() => ({}))) as {
      access_token?: unknown;
      expires_in?: unknown;
    };
    if (!response.ok || typeof payload.access_token !== 'string') {
      throw new PayPalApiError(
        `OAuth PayPal non riuscito (${response.status})`,
        response.status,
        payload,
      );
    }
    const expiresIn =
      typeof payload.expires_in === 'number' && payload.expires_in > 0
        ? payload.expires_in
        : 300;
    this.accessTokenCache = {
      token: payload.access_token,
      expiresAt: Date.now() + expiresIn * 1000,
    };
    return payload.access_token;
  }
}

export function centsToPayPalValue(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new Error('Centesimi non validi');
  }
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

export function paypalValueToCents(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d+\.\d{2}$/.test(value)) return null;
  const [whole, fraction] = value.split('.');
  const cents = Number(whole) * 100 + Number(fraction);
  return Number.isSafeInteger(cents) ? cents : null;
}

function paypalApiBase(environment: PayPalEnvironment): string {
  return environment === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

function assertPayPalResourceId(value: string): void {
  if (!/^[A-Z0-9-]{8,80}$/i.test(value)) {
    throw new Error('ID PayPal non valido');
  }
}
