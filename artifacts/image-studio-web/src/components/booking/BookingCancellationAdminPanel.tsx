import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminBookingCancellation, AdminBookingCancellationInput } from '@workspace/api-client-react';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
const labels: Record<string, string> = { none: 'Nessun rimborso avviato', review: 'Acconto da valutare / verifica manuale',
  approved: 'Rimborso autorizzato, da elaborare', processing: 'Verifica PayPal in corso', pending: 'Rimborso in attesa su PayPal',
  unknown: 'Esito PayPal incerto: non rimborsare nuovamente', completed: 'Rimborso integrale confermato da PayPal' };
export function BookingCancellationAdminPanel({ bookingId, userId }: { bookingId: string; userId: string }) {
  const client = useQueryClient(), key = ['booking-cancellation', userId, bookingId];
  const [choice, setChoice] = useState<AdminBookingCancellationInput['action'] | null>(null);
  const [expectedAmountCents, setExpectedAmountCents] = useState<number | null>(null);
  const [intent, setIntent] = useState(() => crypto.randomUUID());
  const query = useQuery<AdminBookingCancellation>({ queryKey: key, enabled: !!userId && !!bookingId,
    queryFn: async () => (await apiRequest('GET', `/api/booking/${bookingId}/cancellation`)).json(),
    refetchInterval: q => q.state.data?.status === 'pending' || ['approved', 'processing', 'pending', 'unknown'].includes(q.state.data?.refundStatus || '') ? 15_000 : false });
  const mutation = useMutation({ mutationFn: async (action: AdminBookingCancellationInput['action']) =>
    (await apiRequest('POST', `/api/booking/${bookingId}/cancellation`, { action, requestId: intent,
      ...(['refund', 'cancel_refund'].includes(action) ? { expectedAmountCents } : {}) })).json() as Promise<AdminBookingCancellation>,
    onSuccess: data => { client.setQueryData(key, data); setChoice(null); setIntent(crypto.randomUUID()); void client.invalidateQueries({ queryKey: ['bookings'] }); },
    onError: () => { void query.refetch(); } });
  const state = query.data;
  const choose = (action: AdminBookingCancellationInput['action']) => { setExpectedAmountCents(state?.amountCents ?? null); setChoice(action); };
  return <Card><CardHeader><CardTitle className="text-lg">Annullamento e acconto</CardTitle></CardHeader><CardContent className="space-y-3">
    {query.isPending ? <p>Caricamento…</p> : query.isError ? <p role="alert">Impossibile verificare annullamento e rimborso. <Button variant="outline" onClick={() => query.refetch()}>Riprova</Button></p> : state && <>
      <p>{state.status === 'complete' ? 'Appuntamento annullato' : state.status === 'pending' ? 'Cancellazione calendario in corso: orario ancora protetto'
        : state.status === 'blocked' ? 'Cancellazione da verificare: orario protetto' : 'Appuntamento non annullato'}</p>
      <p className="font-medium">{labels[state.refundStatus] || state.refundStatus}</p>
      {state.amountCents > 0 && <p>Acconto nello storico: {(state.amountCents / 100).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}. I rimborsi sono registrati separatamente dall’incasso originale.</p>}
      {state.reason && <p>{state.reason}</p>}
      {state.refundId && <p className="break-all text-sm">Riferimento PayPal: {state.refundId}</p>}
      {state.notificationStatus && <p className="text-sm">Email annullamento: {state.notificationStatus === 'sent' ? 'inviata' : state.notificationStatus === 'unknown' ? 'esito incerto, controllare Gmail prima di reinviare' : state.notificationStatus}</p>}
      <div className="flex flex-wrap gap-2 [&>button]:h-auto [&>button]:whitespace-normal [&>button]:text-left">
        {state.status === 'blocked' && <Button variant="outline" disabled={mutation.isPending} onClick={() => mutation.mutate('retry_cancellation')}>Riprova annullamento calendario</Button>}
        {state.canCancel && (state.amountCents > 0 ? <>
          <Button variant="outline" onClick={() => choose('cancel_reschedule')}>Annulla e concorda una nuova data</Button>
          <Button variant="destructive" onClick={() => choose('cancel_refund')}>{state.paypalDeposit ? 'Annulla e rimborsa con PayPal' : 'Annulla; rimborso da gestire'}</Button>
        </> : <Button variant="destructive" onClick={() => choose('cancel_unpaid')}>Annulla appuntamento</Button>)}
        {state.canRefund && <Button onClick={() => choose('refund')}>Rimborsa l’acconto con PayPal</Button>}
        {state.canVerifyRefund && state.refundStatus !== 'completed' && <Button variant="outline" disabled={mutation.isPending} onClick={() => mutation.mutate('verify_refund')}>Verifica esito PayPal</Button>}
        <Button variant="outline" disabled={mutation.isPending || query.isFetching} onClick={() => query.refetch()}>Aggiorna stato</Button>
      </div>
      {choice && <div className="space-y-3 rounded-lg border p-4">
        <p>{choice === 'cancel_refund' && !state.paypalDeposit ? 'L’appuntamento verrà annullato e il rimborso resterà da gestire direttamente con il cliente. La piattaforma non sposta denaro per questo acconto non PayPal.'
          : ['cancel_refund', 'refund'].includes(choice) ? `Confermi il rimborso integrale di ${((expectedAmountCents ?? state.amountCents) / 100).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}? È un movimento reale di denaro. Non ripeterlo manualmente se l’esito è incerto.`
          : choice === 'cancel_reschedule' ? 'L’orario verrà liberato. L’acconto resta da gestire con una nuova data concordata: non viene trattenuto né rimborsato automaticamente.'
          : 'Confermi l’annullamento e la liberazione dell’orario?'}</p>
        {['refund', 'cancel_refund'].includes(choice) && state.amountCents !== expectedAmountCents
          && <p role="alert">L’importo è cambiato. Torna indietro, controllalo e conferma nuovamente.</p>}
        <div className="flex flex-wrap gap-2"><Button disabled={mutation.isPending || ['refund', 'cancel_refund'].includes(choice) && state.amountCents !== expectedAmountCents} onClick={() => mutation.mutate(choice)}>{mutation.isPending ? 'Operazione in corso…' : 'Conferma operazione'}</Button>
          <Button variant="outline" disabled={mutation.isPending} onClick={() => { setChoice(null); setIntent(crypto.randomUUID()); }}>Torna indietro</Button></div>
      </div>}
      {mutation.isError && <p role="alert">Operazione da verificare. Aggiorna lo stato prima di qualsiasi rimborso manuale.</p>}
    </>}
  </CardContent></Card>;
}
