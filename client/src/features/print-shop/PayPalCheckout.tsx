import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2, LockKeyhole } from 'lucide-react';
import type { PrintShopQuote } from '@shared/print-shop-types';
import { printShopApi } from './print-shop-api';
import type { PaypalCaptureResult, PaypalClientConfig, PrintShopLegalConsents } from './types';
import {
  PrintShopQuoteReviewRequiredError,
  paypalOrderActionNotice,
  requiresPaypalQuoteReview,
  sandboxPaypalNotice,
} from './paypal-checkout-state';

interface PayPalApproveData {
  orderID: string;
}

interface PayPalButtonActions {
  enable(): void;
  disable(): void;
}

interface PayPalButtonsInstance {
  render(element: HTMLElement): Promise<void>;
  close?(): Promise<void>;
  isEligible?(): boolean;
}

interface PayPalSdk {
  Buttons(options: {
    style?: Record<string, string | number | boolean>;
    createOrder(): Promise<string>;
    onApprove(data: PayPalApproveData): Promise<void>;
    onCancel?(): void;
    onError?(error: unknown): void;
    onInit?(data: unknown, actions: PayPalButtonActions): void;
  }): PayPalButtonsInstance;
}

declare global {
  interface Window {
    paypal?: PayPalSdk;
  }
}

let paypalScriptPromise: Promise<PayPalSdk> | null = null;
let loadedPaypalClientId: string | null = null;

function loadPaypalSdk(config: PaypalClientConfig): Promise<PayPalSdk> {
  if (!config.enabled || !config.clientId) {
    return Promise.reject(new Error('Il pagamento PayPal non è ancora configurato.'));
  }
  if (window.paypal && loadedPaypalClientId === config.clientId) return Promise.resolve(window.paypal);
  if (paypalScriptPromise && loadedPaypalClientId === config.clientId) return paypalScriptPromise;

  loadedPaypalClientId = config.clientId;
  paypalScriptPromise = new Promise<PayPalSdk>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-print-shop-paypal="true"]');
    if (existing) existing.remove();
    delete window.paypal;

    const script = document.createElement('script');
    const query = new URLSearchParams({
      'client-id': config.clientId!,
      currency: config.currency,
      intent: 'capture',
      components: 'buttons',
      locale: 'it_IT',
      'enable-funding': 'paypal',
    });
    script.src = `https://www.paypal.com/sdk/js?${query.toString()}`;
    script.async = true;
    script.dataset.printShopPaypal = 'true';
    script.onload = () => {
      if (window.paypal) resolve(window.paypal);
      else reject(new Error('PayPal non si è caricato correttamente.'));
    };
    script.onerror = () => reject(new Error('Impossibile collegarsi a PayPal. Controlla la connessione.'));
    document.head.appendChild(script);
  }).catch((error) => {
    paypalScriptPromise = null;
    throw error;
  });
  return paypalScriptPromise!;
}

function checkoutErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Il pagamento non è riuscito. Non è stato addebitato nulla: puoi riprovare.';
}

interface PayPalCheckoutProps {
  orderId: string;
  enabled: boolean;
  legalConsents: PrintShopLegalConsents;
  prepareOrder: () => Promise<PrintShopQuote>;
  onQuoteReviewRequired: () => Promise<void>;
  onCaptured: (result: PaypalCaptureResult) => void;
  onCancel?: () => void;
}

export function PayPalCheckout({
  orderId,
  enabled,
  legalConsents,
  prepareOrder,
  onQuoteReviewRequired,
  onCaptured,
  onCancel,
}: PayPalCheckoutProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onCapturedRef = useRef(onCaptured);
  const onCancelRef = useRef(onCancel);
  const prepareOrderRef = useRef(prepareOrder);
  const onQuoteReviewRequiredRef = useRef(onQuoteReviewRequired);
  const legalConsentsRef = useRef(legalConsents);
  const enabledRef = useRef(enabled);
  const buttonActionsRef = useRef<PayPalButtonActions | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [environment, setEnvironment] = useState<'sandbox' | 'live' | undefined>();

  useEffect(() => { onCapturedRef.current = onCaptured; }, [onCaptured]);
  useEffect(() => { onCancelRef.current = onCancel; }, [onCancel]);
  useEffect(() => { prepareOrderRef.current = prepareOrder; }, [prepareOrder]);
  useEffect(() => { onQuoteReviewRequiredRef.current = onQuoteReviewRequired; }, [onQuoteReviewRequired]);
  useEffect(() => { legalConsentsRef.current = legalConsents; }, [legalConsents]);
  useEffect(() => {
    enabledRef.current = enabled;
    if (enabled) buttonActionsRef.current?.enable();
    else buttonActionsRef.current?.disable();
  }, [enabled]);

  useEffect(() => {
    let active = true;
    let buttons: PayPalButtonsInstance | null = null;
    const controller = new AbortController();

    const setup = async () => {
      setLoading(true);
      setError(null);
      try {
        const config = await printShopApi.getPaypalConfig(controller.signal);
        setEnvironment(config.environment);
        const sdk = await loadPaypalSdk(config);
        if (!active || !containerRef.current) return;
        containerRef.current.replaceChildren();
        buttons = sdk.Buttons({
          style: {
            layout: 'vertical',
            shape: 'pill',
            height: 48,
            label: 'pay',
            tagline: false,
          },
          onInit: (_data, actions) => {
            buttonActionsRef.current = actions;
            if (enabledRef.current) actions.enable();
            else actions.disable();
          },
          createOrder: async () => {
            if (!enabledRef.current) throw new Error('Conferma prima i dati e le condizioni di vendita.');
            setProcessing(true);
            setError(null);
            try {
              const freshQuote = await prepareOrderRef.current();
              return (await printShopApi.createPaypalOrder(
                orderId,
                legalConsentsRef.current,
                freshQuote,
              )).paypalOrderId;
            } catch (createError) {
              if (requiresPaypalQuoteReview(createError)) {
                const alreadyRefreshed = createError instanceof PrintShopQuoteReviewRequiredError &&
                  createError.quoteAlreadyRefreshed;
                if (!alreadyRefreshed) {
                  await onQuoteReviewRequiredRef.current().catch(() => undefined);
                }
              }
              setProcessing(false);
              setError(checkoutErrorMessage(createError));
              throw createError;
            }
          },
          onApprove: async ({ orderID }) => {
            setProcessing(true);
            setError(null);
            try {
              const result = await printShopApi.capturePaypalOrder(orderId, orderID);
              if (result.paymentStatus !== 'paid') {
                throw new Error('PayPal sta ancora confermando il pagamento. Controlla tra poco nei tuoi ordini.');
              }
              onCapturedRef.current(result);
            } catch (captureError) {
              setError(checkoutErrorMessage(captureError));
            } finally {
              setProcessing(false);
            }
          },
          onCancel: () => {
            setProcessing(false);
            setError('Pagamento annullato. Il tuo ordine è ancora salvato e puoi riprovare.');
            onCancelRef.current?.();
          },
          onError: (paypalError) => {
            setProcessing(false);
            setError(checkoutErrorMessage(paypalError));
          },
        });
        if (buttons.isEligible && !buttons.isEligible()) {
          throw new Error('PayPal non è disponibile su questo dispositivo. Prova con un altro browser.');
        }
        await buttons.render(containerRef.current);
      } catch (setupError) {
        if (active && !(setupError instanceof DOMException && setupError.name === 'AbortError')) {
          setError(checkoutErrorMessage(setupError));
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    setup();
    return () => {
      active = false;
      buttonActionsRef.current = null;
      controller.abort();
      buttons?.close?.().catch(() => undefined);
    };
  }, [orderId]);

  return (
    <div className="relative">
      {sandboxPaypalNotice(environment) && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border-2 border-amber-400 bg-amber-50 p-3 text-sm font-semibold text-amber-950" role="note">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
          <span>{sandboxPaypalNotice(environment)}</span>
        </div>
      )}
      {environment && (
        <p className={`mb-4 rounded-xl border-2 px-4 py-3 text-center text-sm font-semibold ${environment === 'sandbox' ? 'border-amber-400 bg-amber-50 text-amber-950' : 'border-blue-gray bg-blue-gray text-white'}`}>
          {paypalOrderActionNotice(environment)}
        </p>
      )}
      {loading && (
        <div className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-[#ffc439]/20 text-sm font-semibold text-blue-gray" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Caricamento del pagamento sicuro…
        </div>
      )}
      <div ref={containerRef} className={loading ? 'hidden' : ''} aria-label="Paga ora con PayPal" />
      {processing && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/90 text-sm font-semibold text-blue-gray backdrop-blur" role="status">
          <Loader2 className="mr-2 h-5 w-5 animate-spin text-terracotta" aria-hidden="true" />
          Conferma del pagamento… non chiudere la pagina
        </div>
      )}
      {!enabled && !loading && (
        <p className="mt-2 text-center text-xs text-blue-gray/50">Completa i dati e accetta le condizioni per attivare il pagamento.</p>
      )}
      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
      <p className="mt-4 flex items-center justify-center gap-2 text-xs text-blue-gray/45">
        <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
        Pagamento anticipato e protetto da PayPal. Non conserviamo i dati della carta.
      </p>
    </div>
  );
}
