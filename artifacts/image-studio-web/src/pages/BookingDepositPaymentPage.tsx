import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { getBookingDepositStatus } from '@workspace/api-client-react';
import { BookingDepositCheckout, type BookingDepositCompletion } from '@/features/booking/BookingDepositCheckout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSEO } from '@/hooks/useSEO';
import { readPaymentLinkToken } from '@/features/booking/payment-link-token';
export default function BookingDepositPaymentPage() {
  const { bookingId = '' } = useParams<{ bookingId: string }>();
  const [, navigate] = useLocation();
  const token = useMemo(() => readPaymentLinkToken(bookingId), [bookingId]);
  const [ready, setReady] = useState<{ bookingId: string; campaignId: string } | null>(null);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<BookingDepositCompletion | null>(null);
  const [storageWarning, setStorageWarning] = useState(false);
  const initialization = useRef<{ id: string; promise: ReturnType<typeof getBookingDepositStatus> } | null>(null);
  useSEO({ title: 'Completa il tuo acconto | Image Studio', description: 'Pagamento sicuro dell’acconto per il tuo appuntamento fotografico.',
    canonical: '/prenota', noindex: true });
  useEffect(() => {
    let disposed = false;
    setError(''); setReceipt(null); setReady(null);
    if (!/^[A-Za-z0-9_-]{1,200}$/.test(bookingId) || !token) {
      setError('Il link di pagamento non è valido. Apri il link completo ricevuto via email oppure contatta lo studio.');
      return;
    }
    try { sessionStorage.setItem(`approved-payment:${bookingId}`, token); }
    catch { setStorageWarning(true); }
    // Fragments are not sent to the server; remove this one before subsequent navigation/analytics.
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
    initialization.current ??= { id: bookingId, promise: getBookingDepositStatus(bookingId, { token }) };
    if (initialization.current.id !== bookingId) initialization.current = { id: bookingId, promise: getBookingDepositStatus(bookingId, { token }) };
    void initialization.current.promise.then(result => {
      if (disposed) return;
      if (result.flow !== 'approved' || !result.campaignId) {
        setError('Questo link non corrisponde a una richiesta di acconto approvata. Contatta lo studio.'); return;
      }
      setReady({ bookingId, campaignId: result.campaignId });
    }).catch(() => {
      if (!disposed) setError('Non è stato possibile verificare il link. Non ripagare se hai già autorizzato PayPal: riapri questa email o contatta lo studio.');
    });
    return () => { disposed = true; };
  }, [bookingId, token]);
  const home = <Button type="button" variant="outline" className="w-full" data-testid="button-deposit-campaigns"
    onClick={() => navigate('/prenota')}>Torna alle campagne</Button>;
  if (receipt?.payment.bookingId === bookingId) return <div className="min-h-screen bg-background px-4 py-8">
    <Card className="mx-auto max-w-lg" role="status" data-testid="approved-deposit-receipt">
      <CardHeader><CardTitle>Appuntamento confermato!</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p>Acconto ricevuto: <strong>{(receipt.payment.amountCents / 100).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}</strong>.</p>
        <p>{new Date(receipt.start).toLocaleString('it-IT', { timeZone: 'Europe/Rome', dateStyle: 'long', timeStyle: 'short' })}</p>
        <p className="text-sm">Il pagamento è registrato. Riferimento: {receipt.payment.bookingId}. Per informazioni contatta lo studio.</p>
        {home}
      </CardContent>
    </Card>
  </div>;
  return <div className="min-h-screen bg-background px-4 py-8" data-testid="approved-deposit-page">
    {storageWarning && <p role="alert" className="mx-auto max-w-lg text-sm">Il browser non salva il link. Non ricaricare durante il pagamento; per riaprirlo usa l’email originale.</p>}
    {error ? <Card className="mx-auto max-w-lg"><CardContent className="space-y-4 pt-6">
      <p role="alert">{error}</p>{home}
    </CardContent></Card> : ready?.bookingId === bookingId && token
      ? <BookingDepositCheckout key={bookingId} campaignId={ready.campaignId} input={null}
        sessionScope={`approved-${bookingId}`} initialCredentials={{ bookingId, token }} onCompleted={setReceipt}
        onExit={() => navigate('/prenota')} />
      : <p role="status" className="mx-auto max-w-lg">Verifico la richiesta di acconto…</p>}
  </div>;
}
