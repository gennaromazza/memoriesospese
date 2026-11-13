import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'wouter';
import { useAuthorizeBookingManagementAccess, type BookingManagementView } from '@workspace/api-client-react';
import { BookingReschedulePanel } from '@/components/booking/BookingReschedulePanel';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSEO } from '@/hooks/useSEO';
import { readManagementLinkToken } from '@/features/booking/payment-link-token';

const statuses = {
  confirmed: 'Prenotazione confermata', completed: 'Shooting concluso',
  cancelled: 'Prenotazione annullata', cancellation_pending: 'Annullamento in elaborazione',
};
export default function BookingManagementPage() {
  const { bookingId = '' } = useParams<{ bookingId: string }>();
  return <ManagementDetails key={bookingId} bookingId={bookingId} />;
}
function ManagementDetails({ bookingId }: { bookingId: string }) {
  const [token, setToken] = useState(() => readManagementLinkToken(bookingId));
  const [snapshot, setSnapshot] = useState<{ token: string; data: BookingManagementView } | null>(null);
  const generation = useRef(0), currentToken = useRef(token);
  currentToken.current = token;
  const access = useAuthorizeBookingManagementAccess({ mutation: { gcTime: 0, retry: false } });
  const { mutate, reset } = access;
  const refresh = useCallback(() => {
    if (!token) return;
    const request = ++generation.current;
    mutate({ bookingId, data: { token } }, { onSuccess: data => {
      if (generation.current === request && currentToken.current === token) setSnapshot({ token, data });
    } });
  }, [bookingId, token, mutate]);
  useSEO({ title: 'La tua prenotazione | Image Studio',
    description: 'Consulta in modo riservato la tua prenotazione fotografica.', noindex: true });
  useEffect(() => {
    const update = () => setToken(readManagementLinkToken(bookingId));
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, [bookingId]);
  useEffect(() => {
    generation.current++;
    reset();
    if (token && /^[A-Za-z0-9_-]{1,200}$/.test(bookingId)) refresh();
  }, [bookingId, token, refresh, reset]);
  // A changed/revoked fragment must never display data from the previous bearer.
  const booking = snapshot?.token === token && snapshot.data.bookingId === bookingId ? snapshot.data : undefined;
  const denied = !token || !/^[A-Za-z0-9_-]{1,200}$/.test(bookingId)
    || (access.error && 'status' in access.error && [400, 404, 410].includes(Number(access.error.status)));
  useEffect(() => {
    if (!token || !booking || !(booking.reschedule.status === 'pending'
      || booking.reschedule.status === 'changed' && ['pending', 'preparing', 'sending'].includes(booking.reschedule.notificationStatus || ''))) return;
    const timer = window.setInterval(refresh, 15_000);
    return () => window.clearInterval(timer);
  }, [bookingId, token, booking, refresh]);
  return <main className="min-h-screen bg-background px-4 py-8 sm:py-12">
    <div className="mx-auto max-w-2xl space-y-5">
      <p className="text-sm font-medium text-muted-foreground">Image Studio · La tua prenotazione</p>
      {denied ? <Card role="alert" data-testid="management-denied"><CardHeader><CardTitle>Link non valido o revocato</CardTitle></CardHeader>
        <CardContent className="space-y-3"><p>Apri il link completo dall’email di conferma. Se il problema continua, contatta lo studio usando i recapiti nell’email.</p></CardContent></Card>
        : access.isError ? <Card role="alert"><CardHeader><CardTitle>Non riesco a caricare la prenotazione</CardTitle></CardHeader>
          <CardContent className="space-y-4"><p>Riprova tra poco. Non effettuare un nuovo pagamento.</p><Button onClick={refresh}>Riprova</Button></CardContent></Card>
        : !booking ? <Card role="status"><CardContent className="pt-6">Caricamento della prenotazione…</CardContent></Card>
        : <>
          <Card data-testid="customer-booking"><CardHeader>
            <p className="text-sm text-muted-foreground">Il tuo appuntamento</p>
            <CardTitle className="break-words" data-testid="customer-booking-status">{booking.reschedule.status === 'pending'
              ? 'Cambio appuntamento in elaborazione' : booking.reschedule.status === 'blocked' ? 'Cambio appuntamento da verificare' : statuses[booking.status]}</CardTitle>
          </CardHeader><CardContent className="space-y-5">
            {booking.status === 'cancelled' && <p>Questa prenotazione risulta annullata. Per un nuovo appuntamento contatta lo studio.</p>}
            {booking.status === 'cancellation_pending' && <p>La richiesta di annullamento è in elaborazione. Per informazioni contatta lo studio.</p>}
            <dl className="space-y-4 break-words">
              <div><dt className="text-sm text-muted-foreground">Servizio</dt><dd>{booking.campaignName || 'Campagna non più disponibile'}</dd></div>
              {booking.customerName && <div><dt className="text-sm text-muted-foreground">Intestata a</dt><dd>{booking.customerName}</dd></div>}
              <div><dt className="text-sm text-muted-foreground">{['pending', 'blocked'].includes(booking.reschedule.status) ? 'Ultimo orario confermato' : 'Data e ora'}</dt><dd>{booking.startsAt
                ? new Date(booking.startsAt).toLocaleString('it-IT', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/Rome' })
                : 'Data non disponibile: contatta lo studio'}
                {booking.endsAt && <span className="block text-sm text-muted-foreground">Termine: {new Date(booking.endsAt).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Rome' })}</span>}
              </dd></div>
              <div><dt className="text-sm text-muted-foreground">Prodotto</dt><dd>{booking.productName || 'Da scegliere in studio'}</dd></div>
              {booking.depositPaidCents !== null && <div><dt className="text-sm text-muted-foreground">Acconto versato</dt>
                <dd>{(booking.depositPaidCents / 100).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}</dd></div>}
            </dl>
            {token && <BookingReschedulePanel key={`${booking.startsAt}-${booking.reschedule.status}`} booking={booking} token={token}
              onRefresh={refresh} onUpdated={data => {
                if (currentToken.current !== token) return;
                generation.current++; reset();
                setSnapshot({ token, data });
              }} />}
            <div className="flex flex-wrap items-center gap-3 border-t pt-4">
              <Button variant="outline" disabled={access.isPending} onClick={refresh}>Aggiorna i dati</Button>
              <p className="text-xs text-muted-foreground">Dati dell’ultima verifica · orari italiani</p>
            </div>
          </CardContent></Card>
          <Card><CardHeader><CardTitle className="text-lg">Contatti dello studio</CardTitle></CardHeader><CardContent className="space-y-3 break-words">
            {booking.studio.name && <p className="font-medium">{booking.studio.name}</p>}
            {booking.studio.address && <p className="text-sm text-muted-foreground">{booking.studio.address}</p>}
            <p className="text-sm">Per modifiche o informazioni sulla prenotazione, contatta lo studio.</p>
            <div className="flex flex-wrap gap-3">
              {booking.studio.email && <Button asChild variant="outline" className="h-auto whitespace-normal"><a href={`mailto:${booking.studio.email}`}>Scrivi allo studio</a></Button>}
              {booking.studio.phone && <Button asChild className="h-auto whitespace-normal"><a href={`tel:${booking.studio.phone.replace(/[ ().-]/g, '')}`}>Chiama lo studio</a></Button>}
            </div>
            {!booking.studio.email && !booking.studio.phone && <p className="text-sm">Trovi i recapiti nell’email di conferma.</p>}
          </CardContent></Card>
          <p className="text-xs text-muted-foreground">Il link è personale: conserva l’email e non condividerlo.</p>
        </>}
    </div>
  </main>;
}
