import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Notification {
  kind?: string;
  label?: string;
  status?: string;
  attempts?: number;
  manualResends?: number;
  manualResendHistory?: Array<{
    attempt?: number;
    by?: string;
    at?: string;
  }>;
}

const notificationKinds = [
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

type CustomerNotificationKind = typeof notificationKinds[number];

const legacyKinds: Record<string, CustomerNotificationKind> = {
  orderApproved: 'order_approved',
  manualAcceptance: 'manual_acceptance',
  orderConfirmed: 'order_confirmed',
  paymentConfirmed: 'payment_confirmed',
  filesCheck: 'files_check',
  readyToPrint: 'ready_to_print',
  sentToLaboratory: 'sent_to_laboratory',
  printing: 'printing',
  readyForPickup: 'ready_for_pickup',
  delivered: 'delivered',
  cancelled: 'cancelled',
  orderRestored: 'order_restored',
};

function isCustomerNotificationKind(value: string): value is CustomerNotificationKind {
  return notificationKinds.includes(value as CustomerNotificationKind);
}

export default function CustomerOrderNotifications({
  notifications,
  onResend,
  resendingKind,
}: {
  notifications?: Record<string, Notification>;
  onResend?: (kind: CustomerNotificationKind) => void;
  resendingKind?: string | null;
}) {
  const entries = Object.entries(notifications || {});
  const legacyLabels: Record<string, string> = {
    paymentConfirmed: 'Pagamento confermato',
    readyForPickup: 'Stampe pronte',
  };
  return (
    <section
      data-testid="customer-order-notifications"
      className="rounded-xl border border-amber-200 bg-amber-50/40 p-4"
    >
      <h3 className="font-semibold text-stone-900">Email al cliente</h3>
      <p className="mt-1 text-xs text-stone-600">
        Qui puoi reinviare le email già inviate o ritentare quelle non riuscite. Gli invii con esito incerto restano bloccati per evitare duplicati.
      </p>
      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-stone-500">Nessuna email di stato registrata per questo ordine.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {entries.map(([key, notification]) => (
            <li key={key} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm">
              <div className="min-w-0 flex-1">
                <p>{notification.label || legacyLabels[key] || 'Aggiornamento ordine'}</p>
                <p className={notification.status === 'sent' ? 'text-xs text-emerald-700' : 'text-xs text-amber-700'}>
                  {notification.status === 'sent' ? 'Email inviata'
                    : notification.status === 'failed' ? 'Invio non riuscito — verifica il registro email'
                      : 'Esito in verifica — controlla prima di riprovare'}
                  {typeof notification.attempts === 'number' &&
                    ` · ${notification.attempts} ${notification.attempts === 1 ? 'tentativo' : 'tentativi'}`}
                  {typeof notification.manualResends === 'number' && notification.manualResends > 0 &&
                    ` · ${notification.manualResends} ${notification.manualResends === 1 ? 'reinvio manuale' : 'reinvii manuali'}`}
                </p>
                {notification.manualResendHistory?.slice(-3).map((attempt, index) => (
                  <p key={`${attempt.at || 'manual-resend'}-${index}`} className="mt-0.5 text-xs text-stone-500">
                    Reinvio manuale{attempt.attempt ? ` ${attempt.attempt}` : ''} da {attempt.by || 'Admin'}
                    {attempt.at && ` · ${new Date(attempt.at).toLocaleString('it-IT')}`}
                  </p>
                ))}
              </div>
              {(() => {
                const kind = notification.kind && isCustomerNotificationKind(notification.kind)
                  ? notification.kind
                  : legacyKinds[key];
                const canResend = onResend && kind &&
                  (notification.status === 'sent' || notification.status === 'failed');
                if (!canResend) return null;
                return (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-8 shrink-0 px-3 text-xs"
                    disabled={Boolean(resendingKind)}
                    aria-label={`${notification.status === 'sent' ? 'Reinvia' : 'Riprova'} email: ${notification.label || legacyLabels[key] || 'aggiornamento ordine'}`}
                    onClick={() => {
                      const confirmation = notification.status === 'sent'
                        ? 'Questa email risulta già inviata. Un nuovo invio può creare un duplicato. Vuoi procedere?'
                        : 'L’ultimo invio non è riuscito. Vuoi tentare di nuovo?';
                      if (window.confirm(confirmation)) onResend(kind);
                    }}
                  >
                    {resendingKind === kind
                      ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      : <RefreshCw className="mr-2 h-3.5 w-3.5" />}
                    {notification.status === 'sent' ? 'Reinvia email' : 'Riprova invio'}
                  </Button>
                );
              })()}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}