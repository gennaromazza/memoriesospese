import React from "react";

interface Props {
  enabled: boolean;
  createOrder(): Promise<string>;
  onApprove(orderId: string): Promise<void>;
  onCancel(): void;
  onError(error: Error): void;
}

export function GiftCardPayPalButtons({ enabled, createOrder, onApprove, onCancel, onError }: Props) {
  return (
    <div aria-label="PayPal simulato" data-testid="paypal-simulator" className="space-y-2">
      <button type="button" disabled={!enabled} data-testid="simulated-paypal-pay"
        className="w-full rounded-md bg-[#003087] px-4 py-3 font-semibold text-white disabled:opacity-50"
        onClick={async () => {
          try {
            await onApprove(await createOrder());
          } catch {
            onError(new Error("Errore PayPal simulato"));
          }
        }}>
        Paga con PayPal
      </button>
      <button type="button" data-testid="simulated-paypal-cancel" onClick={onCancel}>
        Annulla PayPal
      </button>
      <button type="button" data-testid="simulated-paypal-error"
        onClick={() => onError(new Error("SDK PayPal non disponibile"))}>
        Simula errore PayPal
      </button>
    </div>
  );
}
