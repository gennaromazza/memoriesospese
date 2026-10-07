export const CUSTOMER_NOTIFICATION_KIND_VALUES = [
  'order_approved',
  'manual_acceptance',
  'order_confirmed',
  'payment_confirmed',
  'files_check',
  'ready_to_print',
  'sent_to_laboratory',
  'printing',
  'ready_for_pickup',
  'delivered',
  'cancelled',
  'order_restored',
] as const;

export type CustomerNotificationKind = typeof CUSTOMER_NOTIFICATION_KIND_VALUES[number];

export const CUSTOMER_STATUS_NOTIFICATIONS = new Set<CustomerNotificationKind>([
  'files_check', 'ready_to_print', 'sent_to_laboratory', 'printing',
  'ready_for_pickup', 'delivered', 'cancelled',
]);

const keys: Record<CustomerNotificationKind, string> = {
  order_approved: 'orderApproved',
  manual_acceptance: 'manualAcceptance',
  order_confirmed: 'orderConfirmed',
  payment_confirmed: 'paymentConfirmed',
  files_check: 'filesCheck',
  ready_to_print: 'readyToPrint',
  sent_to_laboratory: 'sentToLaboratory',
  printing: 'printing',
  ready_for_pickup: 'readyForPickup',
  delivered: 'delivered',
  cancelled: 'cancelled',
  order_restored: 'orderRestored',
};

export function customerNotificationKey(kind: CustomerNotificationKind): string {
  return keys[kind];
}

export function customerNotificationEvent(kind: CustomerNotificationKind, order: any): unknown {
  if (kind === 'order_approved') return order.quoteFingerprint;
  if (kind === 'manual_acceptance') return order.printShop?.adminAcceptance?.recordId;
  if (kind === 'order_confirmed' && order.payment?.deferredAuthorization?.authorizedAt) {
    return order.payment.deferredAuthorization.authorizedAt;
  }
  if (kind === 'payment_confirmed') {
    return order.payment?.manualReceipt?.recordedAt || order.payment?.paypalCaptureId || order.payment?.paidAt;
  }
  if (kind === 'sent_to_laboratory' && order.fulfillment?.laboratory?.labShipmentId) {
    return order.fulfillment.laboratory.labShipmentId;
  }
  if (kind === 'cancelled' && order.fulfillment?.cancelledAt) return order.fulfillment.cancelledAt;
  const history = [...(order.fulfillment?.history || [])].reverse();
  return history.find((entry: any) =>
    kind === 'order_restored' ? entry.action === 'order_restored'
      : entry.to === (kind === 'order_confirmed' ? 'submitted' : kind),
  ) || order.fulfillment?.status;
}

/** Describes the committed business event, not customer consent or a payment we inferred. */
export function customerNotificationCopy(kind: CustomerNotificationKind, order: any) {
  const shipping = order.fulfillment?.method === 'shipping';
  const copies: Record<CustomerNotificationKind, { label: string; message: string }> = {
    order_approved: {
      label: 'Ordine confermato da te · pagamento da completare',
      message: 'hai confermato il riepilogo del tuo ordine online. Il pagamento non è ancora stato acquisito: l’ordine è in attesa del completamento del pagamento e la produzione non è ancora iniziata.',
    },
    manual_acceptance: {
      label: 'Ordine preso in carico dallo studio',
      message: 'abbiamo preso in carico il tuo ordine sulla base degli accordi presi direttamente con lo studio. Trovi qui il riepilogo dei formati, della carta, delle quantità e della modalità di consegna. Questa conferma non costituisce una ricevuta di pagamento.',
    },
    order_confirmed: {
      label: 'Ordine confermato',
      message: 'il tuo ordine è confermato e lo studio procederà con la verifica delle fotografie e la preparazione della stampa. La modalità di pagamento concordata è indicata nel riepilogo qui sotto.',
    },
    payment_confirmed: {
      label: 'Pagamento confermato',
      message: 'il pagamento del tuo ordine è stato acquisito correttamente e l’ordine è confermato. Qui sotto trovi il riepilogo delle stampe e della modalità di consegna concordata.',
    },
    files_check: {
      label: 'Controllo fotografie in corso',
      message: 'stiamo verificando le fotografie e le impostazioni del tuo ordine prima di procedere con la stampa.',
    },
    ready_to_print: {
      label: 'Ordine pronto per il laboratorio',
      message: 'la verifica dei file è completata. Il tuo ordine è pronto per essere affidato alla lavorazione.',
    },
    sent_to_laboratory: {
      label: 'Ordine inviato al laboratorio',
      message: 'abbiamo affidato le fotografie e le specifiche di stampa al laboratorio. Ti aggiorneremo quando le stampe entreranno in produzione e quando saranno pronte.',
    },
    printing: {
      label: 'Stampe in produzione',
      message: `le tue fotografie sono in stampa. Riceverai un nuovo aggiornamento quando l’ordine sarà pronto per ${shipping ? 'la spedizione' : 'il ritiro in studio'}.`,
    },
    ready_for_pickup: {
      label: shipping ? 'Pronto per la spedizione' : 'Pronto per il ritiro',
      message: shipping
        ? 'abbiamo terminato la lavorazione. Le stampe sono pronte per essere affidate alla spedizione.'
        : 'abbiamo terminato la lavorazione. Puoi ritirare le stampe presso il nostro studio: ti aspettiamo.',
    },
    delivered: {
      label: shipping ? 'Ordine consegnato' : 'Ritiro completato',
      message: shipping
        ? 'lo studio ha registrato il tuo ordine come consegnato. Grazie per aver scelto le nostre stampe.'
        : 'abbiamo registrato il ritiro delle tue stampe in studio. Grazie per averci scelto.',
    },
    cancelled: {
      label: 'Ordine annullato',
      message: 'il tuo ordine è stato annullato. Per informazioni sui motivi o su eventuali pagamenti, contatta direttamente lo studio.',
    },
    order_restored: {
      label: 'Ordine riaperto dallo studio',
      message: 'abbiamo riaperto il tuo ordine. È in attesa del pagamento o della successiva conferma dello studio: questa riapertura non avvia da sola la produzione.',
    },
  };
  const copy = copies[kind];
  return {
    ...copy,
    subject: kind === 'payment_confirmed'
      ? `Ordine ${order.orderNumber} ricevuto e pagato`
      : kind === 'ready_for_pickup'
        ? `Le tue stampe ${order.orderNumber} sono pronte per ${shipping ? 'la spedizione' : 'il ritiro'}`
        : `Ordine ${order.orderNumber} · ${copy.label}`,
  };
}