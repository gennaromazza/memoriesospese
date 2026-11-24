import { useRef, useState } from 'react';
import { useCancelManagedBooking, type BookingManagementView } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
const labels: Record<string, string> = { none: 'Nessun rimborso richiesto.', review: 'L’acconto è da valutare con lo studio.',
  approved: 'Rimborso autorizzato dallo studio, in preparazione.', processing: 'Rimborso in verifica su PayPal.',
  pending: 'PayPal sta elaborando il rimborso.', unknown: 'Esito del rimborso da verificare con lo studio.',
  completed: 'Il rimborso integrale dell’acconto è stato confermato da PayPal.' };
export function BookingCancellationPanel({ booking, token, onUpdated, onRefresh }: {
  booking: BookingManagementView; token: string; onUpdated: (view: BookingManagementView) => void; onRefresh: () => void;
}) {
  const [confirm, setConfirm] = useState(false), intent = useRef<string | null>(null);
  const action = useCancelManagedBooking({ mutation: { retry: false, onSuccess: onUpdated, onError: onRefresh } });
  const state = booking.cancellation;
  return <section className="space-y-3 border-t pt-4" aria-label="Annullamento prenotazione">
    <h2 className="font-semibold">Annullare l’appuntamento</h2>
    {state.conditions && <p className="text-sm text-muted-foreground">{state.conditions}</p>}
    {state.canCancel ? !confirm ? <Button variant="outline" onClick={() => setConfirm(true)}>Annulla appuntamento</Button>
      : <div className="space-y-3 rounded-lg border p-4">
        <p>Vuoi annullare questo appuntamento? L’orario verrà liberato. L’acconto non viene rimborsato automaticamente: lo studio ne valuterà la gestione.</p>
        <div className="flex flex-wrap gap-3">
          <Button variant="destructive" disabled={action.isPending} onClick={() => {
            intent.current ||= crypto.randomUUID();
            action.mutate({ bookingId: booking.bookingId, data: { token, requestId: intent.current, expectedStartsAt: booking.startsAt! } });
          }}>{action.isPending ? 'Annullamento in corso…' : 'Conferma annullamento'}</Button>
          <Button variant="outline" disabled={action.isPending} onClick={() => setConfirm(false)}>Mantieni appuntamento</Button>
        </div>
      </div> : <p role="status" className="text-sm">{state.reason}</p>}
    {action.isError && <p role="alert" className="text-sm">Non ho ricevuto un esito certo. Aggiorna lo stato prima di riprovare; non è stato richiesto un nuovo pagamento.</p>}
    {['complete', 'pending', 'blocked'].includes(state.status) && <>
      <p className="text-sm">{labels[state.refundStatus] || 'Gestione dell’acconto da verificare con lo studio.'}</p>
      <p className="text-sm">{state.notificationStatus === 'sent' ? 'Ti abbiamo inviato l’email con l’esito.'
        : ['unknown', 'failed', 'skipped'].includes(state.notificationStatus || '') ? 'Email non confermata: conserva questa pagina e contatta lo studio.'
        : state.status === 'complete' && !state.notificationStatus ? 'Per informazioni sulla comunicazione di annullamento contatta lo studio.'
        : 'Riceverai l’email quando l’annullamento sarà completato.'}</p>
    </>}
  </section>;
}
