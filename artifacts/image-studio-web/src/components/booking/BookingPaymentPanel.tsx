import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { bookingPaymentMillis, bookingPaymentStageLabel } from '@shared/booking-payment-state';
import { getBookingPaymentDetails, resendBookingDeposit, verifyBookingDeposit } from '@/lib/bookings';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { InPersonDepositDialog } from './InPersonDepositDialog';

const euro = (value: number | null) => value === null ? 'Non disponibile' : new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value / 100);
const date = (value: unknown) => { const time = bookingPaymentMillis(value); return time === null ? 'Non disponibile' : new Date(time).toLocaleString('it-IT', { timeZone: 'Europe/Rome' }); };
const providerLabels: Record<string, string> = { ORDER_CREATED: 'Ordine creato, non incassato', CREATED: 'Pagamento avviato, non incassato',
  APPROVED: 'Autorizzato, non ancora incassato', COMPLETED: 'Incassato', VOIDED: 'Ordine annullato',
  PAYER_ACTION_REQUIRED: 'È richiesta un’azione del cliente', SAVED: 'Ordine salvato, non incassato' };
const emailLabels: Record<string, string> = { pending: 'Da inviare', sending: 'Invio in corso', sent: 'Inviata',
  failed: 'Invio non riuscito', unknown: 'Esito incerto: controllare Gmail' };

export function BookingPaymentPanel({ bookingId, userId }: { bookingId: string; userId: string }) {
  const client = useQueryClient(), { toast } = useToast();
  const key = ['booking-payment', userId, bookingId];
  const query = useQuery({ queryKey: key, queryFn: () => getBookingPaymentDetails(bookingId), enabled: !!userId && !!bookingId,
    refetchInterval: q => ['unpaid', 'processing', 'review'].includes(q.state.data?.paymentStatus || '') ? 15_000 : false });
  const resendIntent = useRef<string | null>(null);
  const [inPersonOpen, setInPersonOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const offset = (bookingPaymentMillis(query.data?.serverTime) ?? Date.now()) - Date.now();
    setNow(Date.now() + offset);
    const timer = window.setInterval(() => setNow(Date.now() + offset), 1000);
    return () => window.clearInterval(timer);
  }, [query.data?.serverTime]);
  const mutation = useMutation({
    mutationFn: (action: 'verify' | 'resend') => action === 'verify' ? verifyBookingDeposit(bookingId)
      : resendBookingDeposit(bookingId, resendIntent.current ?? (resendIntent.current = crypto.randomUUID())),
    onSuccess: async (data, action) => {
      client.setQueryData(key, data);
      if (action === 'resend') resendIntent.current = null;
      toast({ title: action === 'verify' ? 'Esito PayPal aggiornato' : data.emailStatus === 'sent' ? 'Richiesta inviata' : 'Stato invio aggiornato',
        description: action === 'verify' ? 'Verifica senza nuovi addebiti.' : 'Importo e scadenza restano invariati.' });
      await Promise.all([client.invalidateQueries({ queryKey: ['bookings'] }),
        client.invalidateQueries({ queryKey: ['booking-payment-checkouts', userId] })]);
    },
    onError: error => toast({ title: 'Operazione non completata', description: error.message, variant: 'destructive' }),
  });
  if (query.isError) return <Card><CardContent className="p-4"><p role="alert">Impossibile caricare lo stato dell’acconto.</p>
    <Button variant="outline" onClick={() => query.refetch()}>Riprova</Button></CardContent></Card>;
  const data = query.data;
  if (!data) return <p role="status">Caricamento stato acconto…</p>;
  const deadline = bookingPaymentMillis(data.expiresAt);
  const waiting = ['unpaid', 'processing'].includes(data.paymentStatus);
  const expired = waiting && deadline !== null && now >= deadline;
  const remaining = deadline === null ? 0 : Math.max(0, Math.ceil((deadline - now) / 1000));
  const stage = expired && data.stage === 'in_attesa_pagamento' ? 'scaduta' : data.stage;
  const canResend = data.canResend && !expired && (bookingPaymentMillis(data.resendAvailableAt) ?? 0) <= now;
  // Solo con la richiesta ancora aperta e nessun incasso (nemmeno PayPal in corso o da riconciliare).
  const canRecordInPerson = data.flow === 'approved' && data.paymentStatus === 'unpaid' && stage === 'in_attesa_pagamento' && !expired;
  return <Card className="min-w-0" data-testid="booking-payment-panel">
    <CardHeader className="p-4 pb-2"><CardTitle className="text-base">Acconto e pagamento</CardTitle>
      <Badge variant="outline" className="w-fit max-w-full whitespace-normal">{bookingPaymentStageLabel(stage)}</Badge></CardHeader>
    <CardContent className="space-y-4 p-4 pt-2">
      <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 [&_dd]:break-words">
        <div><dt className="text-muted-foreground">Acconto richiesto</dt><dd className="font-semibold">{euro(data.amountCents)}</dd></div>
        <div><dt className="text-muted-foreground">Importo ricevuto</dt><dd>{data.paidAmountCents === null ? data.paymentStatus === 'paid' ? 'Importo da verificare' : 'Nessun incasso registrato' : euro(data.paidAmountCents)}</dd></div>
        <div><dt className="text-muted-foreground">Metodo</dt><dd>{data.method === 'paypal' ? 'PayPal' : data.method === 'manual' ? 'Pagamento registrato manualmente' : 'Pagamento non ancora avviato'}</dd></div>
        <div><dt className="text-muted-foreground">Stato pagamento</dt><dd>{({ not_required: 'Acconto non richiesto', unpaid: 'Nessun incasso confermato',
          processing: 'Esito da verificare, non ripetere il pagamento', paid: 'Ricevuto', review: 'Incasso o richiesta da riconciliare' })[data.paymentStatus]}</dd></div>
        {data.expiresAt && <div><dt className="text-muted-foreground">Termine pagamento</dt><dd>{date(data.expiresAt)}</dd>
          {waiting && ['in_attesa_pagamento', 'scaduta'].includes(stage) && <dd className="font-medium" data-testid="deposit-countdown">{expired ? 'Tempo scaduto' : `Tempo residuo: ${Math.floor(remaining / 60)}m ${remaining % 60}s`}</dd>}</div>}
        {data.emailStatus && <div><dt className="text-muted-foreground">Email richiesta acconto</dt><dd>{emailLabels[data.emailStatus] || 'Da verificare'}</dd></div>}
        {data.providerStatus && <div><dt className="text-muted-foreground">Ultimo esito PayPal noto</dt><dd>{providerLabels[data.providerStatus] || 'Da verificare'}</dd></div>}
        {data.paypalCaptureId && <div><dt className="text-muted-foreground">Transazione PayPal</dt><dd className="break-all">{data.paypalCaptureId}</dd></div>}
        {data.paypalOrderId && <div><dt className="text-muted-foreground">Ordine PayPal</dt><dd className="break-all">{data.paypalOrderId}</dd></div>}
        {data.paidAmountCents !== null && data.method === 'paypal' && <div><dt className="text-muted-foreground">Commissioni PayPal / netto</dt>
          <dd>{euro(data.paypalFeeCents)} / {euro(data.netCents)}</dd></div>}
      </dl>
      {(expired || data.payabilityReason) && <p role="status" className="rounded-md bg-muted p-3 text-sm">
        {expired ? 'Richiesta scaduta. Non rinnovare questo link: occorre una nuova prenotazione.' : data.payabilityReason}</p>}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button variant="outline" className="h-auto whitespace-normal" disabled={!data.canVerify || mutation.isPending}
          onClick={() => mutation.mutate('verify')}>Verifica esito PayPal</Button>
        {canRecordInPerson && <Button variant="secondary" className="h-auto whitespace-normal" disabled={mutation.isPending}
          onClick={() => setInPersonOpen(true)}>Acconto incassato di persona</Button>}
        {data.flow === 'approved' && <AlertDialog><AlertDialogTrigger asChild><Button className="h-auto whitespace-normal"
          disabled={!canResend || mutation.isPending}>Reinvia link di pagamento</Button></AlertDialogTrigger>
          <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Reinviare la richiesta?</AlertDialogTitle>
            <AlertDialogDescription className="break-words">La richiesta sarà inviata a {data.customerEmail}. Acconto {euro(data.amountCents)}.
              La scadenza resta {date(data.expiresAt)}: il reinvio non concede un’altra ora.</AlertDialogDescription>
          </AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction disabled={mutation.isPending || !canResend} onClick={() => mutation.mutate('resend')}>Conferma reinvio</AlertDialogAction>
          </AlertDialogFooter></AlertDialogContent></AlertDialog>}
      </div>
      <p className="text-xs text-muted-foreground">La verifica legge l’esito PayPal e riconcilia gli incassi già avvenuti: non addebita e non rimborsa.</p>
      {!data.canVerify && data.paymentStatus === 'unpaid' && <p className="text-sm text-muted-foreground">Non è ancora presente un ordine PayPal associato.</p>}
      {data.flow === 'approved' && data.resendReason && <p className="text-sm text-muted-foreground">{data.resendReason}</p>}
      {canRecordInPerson && <p className="text-xs text-muted-foreground">Se il cliente ha pagato di persona, registra l’incasso qui: la prenotazione viene confermata e il link PayPal smette di funzionare.</p>}
      {mutation.isPending && <p role="status">Operazione in corso…</p>}
      <InPersonDepositDialog bookingId={bookingId} userId={userId} suggestedAmountCents={data.amountCents}
        open={inPersonOpen} onOpenChange={setInPersonOpen} />
    </CardContent>
  </Card>;
}
