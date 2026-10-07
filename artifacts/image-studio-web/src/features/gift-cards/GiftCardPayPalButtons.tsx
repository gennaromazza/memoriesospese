import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { GiftCardPaypalPublicConfig } from '@shared/gift-card-types';

interface ButtonActions {
  enable(): void;
  disable(): void;
}

interface ButtonsInstance {
  render(element: HTMLElement): Promise<void>;
  close?(): Promise<void>;
}

interface PayPalSdk {
  Buttons(options: {
    style?: Record<string, string | number | boolean>;
    createOrder(): Promise<string>;
    onApprove(data: { orderID: string }): Promise<void>;
    onCancel?(): void;
    onError?(error: unknown): void;
    onInit?(data: unknown, actions: ButtonActions): void;
  }): ButtonsInstance;
}

// Lo shop stampe dichiara già `window.paypal` con un proprio tipo: qui si legge senza ridichiararlo.
const sdkWindow = () => window as unknown as { paypal?: PayPalSdk };

let sdkPromise: Promise<PayPalSdk> | null = null;
let sdkClientId: string | null = null;

function loadSdk(config: GiftCardPaypalPublicConfig): Promise<PayPalSdk> {
  if (!config.enabled || !config.clientId) {
    return Promise.reject(new Error('Il pagamento con PayPal non è ancora attivo.'));
  }
  if (sdkWindow().paypal && sdkClientId === config.clientId) return Promise.resolve(sdkWindow().paypal as PayPalSdk);
  if (sdkPromise && sdkClientId === config.clientId) return sdkPromise;

  sdkClientId = config.clientId;
  sdkPromise = new Promise<PayPalSdk>((resolve, reject) => {
    document.querySelector('script[data-gift-card-paypal="true"]')?.remove();
    delete sdkWindow().paypal;
    const script = document.createElement('script');
    const query = new URLSearchParams({
      'client-id': config.clientId as string,
      currency: config.currency,
      intent: 'capture',
      components: 'buttons',
      locale: 'it_IT',
      'enable-funding': 'paypal',
    });
    script.src = `https://www.paypal.com/sdk/js?${query.toString()}`;
    script.async = true;
    script.dataset.giftCardPaypal = 'true';
    script.onload = () => {
      const sdk = sdkWindow().paypal;
      if (sdk) resolve(sdk);
      else reject(new Error('PayPal non si è caricato correttamente.'));
    };
    script.onerror = () => reject(new Error('Impossibile collegarsi a PayPal. Controlla la connessione.'));
    document.head.appendChild(script);
  }).catch(error => {
    sdkPromise = null;
    throw error;
  });
  return sdkPromise;
}

export interface GiftCardPayPalButtonsProps {
  config: GiftCardPaypalPublicConfig;
  /** I pulsanti restano visibili ma spenti finché i dati non sono completi. */
  enabled: boolean;
  /** Crea la card e l'ordine PayPal, restituisce l'id dell'ordine. */
  createOrder: () => Promise<string>;
  /** Chiamata dopo l'approvazione del cliente su PayPal. */
  onApprove: (paypalOrderId: string) => Promise<void>;
  onCancel?: () => void;
  onError: (message: string) => void;
}

export function GiftCardPayPalButtons({ config, enabled, createOrder, onApprove, onCancel, onError }: GiftCardPayPalButtonsProps) {
  const container = useRef<HTMLDivElement>(null);
  const actions = useRef<ButtonActions | null>(null);
  const enabledRef = useRef(enabled);
  const createRef = useRef(createOrder);
  const approveRef = useRef(onApprove);
  const cancelRef = useRef(onCancel);
  const errorRef = useRef(onError);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => { createRef.current = createOrder; }, [createOrder]);
  useEffect(() => { approveRef.current = onApprove; }, [onApprove]);
  useEffect(() => { cancelRef.current = onCancel; }, [onCancel]);
  useEffect(() => { errorRef.current = onError; }, [onError]);
  useEffect(() => {
    enabledRef.current = enabled;
    if (enabled) actions.current?.enable();
    else actions.current?.disable();
  }, [enabled]);

  useEffect(() => {
    let cancelled = false;
    let instance: ButtonsInstance | null = null;
    setLoading(true);
    setLoadError(null);
    loadSdk(config)
      .then(async sdk => {
        const element = container.current;
        if (cancelled || !element) return;
        element.innerHTML = '';
        instance = sdk.Buttons({
          style: { layout: 'vertical', shape: 'rect', label: 'pay', height: 48 },
          onInit(_data, buttonActions) {
            actions.current = buttonActions;
            if (enabledRef.current) buttonActions.enable();
            else buttonActions.disable();
          },
          createOrder: () => createRef.current(),
          onApprove: data => approveRef.current(data.orderID),
          onCancel: () => cancelRef.current?.(),
          onError: error => {
            errorRef.current(error instanceof Error && error.message ? error.message : 'Il pagamento non è riuscito. Non è stato addebitato nulla: puoi riprovare.');
          },
        });
        await instance.render(element);
        if (!cancelled) setLoading(false);
      })
      .catch(error => {
        if (cancelled) return;
        setLoading(false);
        setLoadError(error instanceof Error ? error.message : 'PayPal non è disponibile.');
      });
    return () => {
      cancelled = true;
      actions.current = null;
      void instance?.close?.().catch(() => undefined);
    };
  }, [config.clientId, config.enabled, config.currency]);

  return (
    <div>
      {loading ? (
        <p className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Sto preparando PayPal…
        </p>
      ) : null}
      {loadError ? <p className="py-3 text-sm text-red-700" role="alert">{loadError}</p> : null}
      <div ref={container} aria-label="Paga con PayPal" />
    </div>
  );
}
