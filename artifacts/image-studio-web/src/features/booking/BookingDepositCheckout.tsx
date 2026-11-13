import { useEffect, useRef, useState } from 'react';
import {
  createBookingCheckoutHold, resumeBookingCheckoutHold, releaseBookingCheckoutHold,
  createBookingDepositOrder, captureBookingDeposit, getBookingDepositStatus, getBookingPayPalConfig,
  type BookingCheckoutHoldInput, type BookingCheckoutHoldView, type BookingDepositCaptureResult,
  type BookingDepositStatusResult, type BookingPayPalConfig,
} from '@workspace/api-client-react';
import { GiftCardPayPalButtons } from '@/features/gift-cards/GiftCardPayPalButtons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, ShieldCheck } from 'lucide-react';
import { clearCheckoutSession, readCheckoutSession, saveCheckoutSession, type BookingCheckoutSession } from './checkout-session';

type Phase = 'loading' | 'ready' | 'authorizing' | 'capturing' | 'closing' | 'closed' | 'unknown' | 'review';
export interface BookingDepositCompletion {
  payment: BookingDepositCaptureResult;
  start: string;
  end: string;
}
interface Props {
  campaignId: string;
  input: BookingCheckoutHoldInput | null;
  initialCredentials?: BookingCheckoutSession;
  sessionScope?: string;
  onCompleted(result: BookingDepositCompletion): void;
  onExit(): void;
}
const iso = (value: string | Date) => new Date(value).toISOString();
const money = (cents: number) => (cents / 100).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
const problem = (error: unknown) => {
  const data = (error as { data?: { error?: unknown } })?.data;
  return typeof data?.error === 'string' ? data.error : 'Non è stato possibile completare la verifica. Controlla la connessione.';
};

export function BookingDepositCheckout({ campaignId, input, initialCredentials, sessionScope, onCompleted, onExit }: Props) {
  const storageScope = sessionScope ?? campaignId;
  const [phase, setPhase] = useState<Phase>('loading');
  const [hold, setHold] = useState<BookingCheckoutHoldView | null>(null);
  const [config, setConfig] = useState<BookingPayPalConfig | null>(null);
  const [message, setMessage] = useState('');
  const [remaining, setRemaining] = useState(0);
  const [storageWarning, setStorageWarning] = useState(false);
  const [sdkVersion, setSdkVersion] = useState(0);
  const [canRetrySdk, setCanRetrySdk] = useState(false);
  const session = useRef<BookingCheckoutSession | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const busy = useRef(false), alive = useRef(true), closed = useRef(false);
  const orderId = useRef<string | null>(null);
  const deadlineTriggered = useRef(false);
  const initialInput = useRef(input);
  const explicitCredentials = useRef(initialCredentials);
  const init = useRef<Promise<{ hold?: BookingCheckoutHoldView; config?: BookingPayPalConfig; receipt?: BookingDepositStatusResult }> | null>(null);

  const persist = (value: BookingCheckoutSession) => {
    session.current = value;
    if (!saveCheckoutSession(storageScope, value)) setStorageWarning(true);
  };
  const credentials = () => {
    if (!session.current) throw new Error('Sessione non disponibile');
    return session.current;
  };
  const accept = (result: BookingDepositStatusResult): boolean => {
    if (!alive.current) return true;
    if (result.payment) {
      closed.current = true;
      if (result.payment.status === 'paid' && result.payment.bookingConfirmed) {
        // Keep the opaque receipt credentials until the customer explicitly starts another booking.
        // Otherwise a refresh would return to the payment form after a successful charge.
        onCompleted({ payment: result.payment, start: iso(result.dataShootingInizio), end: iso(result.dataShootingFine) });
      } else {
        setPhase('review');
        setMessage('L’acconto è stato ricevuto, ma l’appuntamento richiede una verifica dello studio. Non effettuare un altro pagamento.');
      }
      return true;
    }
    if (result.status === 'processing') {
      setPhase('unknown');
      setMessage('Stiamo verificando l’esito del pagamento. Non pagare di nuovo: usa “Verifica pagamento” o contatta lo studio.');
      return true;
    }
    return false;
  };
  const check = async () => {
    const current = credentials();
    return getBookingDepositStatus(current.bookingId, { token: current.token });
  };
  const verify = async () => {
    if (busy.current || closed.current) return;
    busy.current = true;
    try {
      if (!accept(await check()) && alive.current) {
        setPhase('unknown');
        setMessage('Non risulta ancora un incasso confermato. Se hai autorizzato PayPal, non pagare di nuovo: attendi la verifica o contatta lo studio.');
      }
    } catch {
      if (alive.current) { setPhase('unknown'); setMessage('Esito non verificabile al momento. Non ripagare: riprova la verifica o contatta lo studio.'); }
    } finally { busy.current = false; }
  };
  const closeUnpaid = async (reason: 'cancelled' | 'error' | 'expired') => {
    if (busy.current || closed.current) return;
    if (session.current?.captureAttempted) { await verify(); return; }
    busy.current = true; setPhase('closing');
    try {
      if (accept(await check())) return;
      if (hold?.flow === 'approved' && reason !== 'expired') {
        setPhase('ready');
        setCanRetrySdk(reason === 'error');
        setMessage(reason === 'cancelled'
          ? 'Hai annullato il pagamento PayPal, non la prenotazione. L’orario resta riservato fino alla scadenza indicata: puoi riprovare qui.'
          : 'PayPal non è disponibile al momento. Il tuo orario resta riservato fino alla scadenza indicata. Puoi ricaricare i pulsanti per riprovare.');
        return;
      }
      const current = credentials();
      await releaseBookingCheckoutHold(current.bookingId, { token: current.token });
      clearCheckoutSession(storageScope);
      if (!alive.current) return;
      closed.current = true; setPhase('closed');
      setMessage(reason === 'expired' ? 'Il tempo per pagare è scaduto. Lo slot è stato liberato: scegli nuovamente data e orario.'
        : reason === 'cancelled' ? `Pagamento annullato. Lo slot è stato liberato${initialInput.current ? ' e i dati del modulo sono conservati.' : ': scegli nuovamente data e orario.'}`
          : 'PayPal non ha completato il pagamento. Lo slot è stato liberato: puoi tornare alla prenotazione.');
    } catch {
      if (alive.current) {
        setPhase('unknown');
        setMessage('Non possiamo confermare l’esito o il rilascio dello slot. Non ripagare: verifica il pagamento o contatta lo studio. Il termine originale non cambia.');
      }
    } finally { busy.current = false; }
  };
  const expiryAction = useRef(closeUnpaid);
  expiryAction.current = closeUnpaid;

  useEffect(() => {
    alive.current = true;
    container.current?.focus({ preventScroll: true });
    container.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    let disposed = false;
    init.current ??= (async () => {
      const stored = readCheckoutSession(storageScope), explicit = explicitCredentials.current;
      const saved = explicit && (stored?.bookingId !== explicit.bookingId || stored?.token !== explicit.token)
        ? explicit : stored ?? explicit;
      if (saved) {
        session.current = saved;
        if (!saveCheckoutSession(storageScope, saved)) setStorageWarning(true);
        const receipt = await getBookingDepositStatus(saved.bookingId, { token: saved.token });
        if (receipt.payment || receipt.status === 'processing' || saved.captureAttempted) return { receipt };
        const existing = await resumeBookingCheckoutHold(saved.bookingId, { token: saved.token });
        const paypal = await getBookingPayPalConfig();
        if (!paypal.enabled) throw new Error('PAYPAL_UNAVAILABLE');
        return { hold: existing, config: paypal };
      }
      const paypal = await getBookingPayPalConfig();
      if (!paypal.enabled) throw new Error('PAYPAL_UNAVAILABLE');
      if (!initialInput.current) throw new Error('CHECKOUT_INPUT_MISSING');
      const created = await createBookingCheckoutHold(initialInput.current);
      const value = { bookingId: created.bookingId, token: created.token };
      session.current = value;
      // No customer details or tokens in URLs, analytics, or persistent localStorage.
      const persisted = saveCheckoutSession(storageScope, value);
      return { hold: created, config: paypal, stored: persisted };
    })();
    void init.current.then(result => {
      if (disposed) return;
      if ('stored' in result && !result.stored) setStorageWarning(true);
      if (result.receipt) {
        if (!accept(result.receipt)) { setPhase('unknown'); setMessage('Controlla l’esito del pagamento prima di riprovare.'); }
        return;
      }
      setHold(result.hold!); setConfig(result.config!); setPhase('ready');
    }).catch(error => {
      if (disposed) return;
      if (session.current) {
        if ((error as { status?: number }).status === 410 || (error as { status?: number }).status === 409
          || error instanceof Error && error.message === 'PAYPAL_UNAVAILABLE') {
          void closeUnpaid('expired');
        } else {
          setPhase('unknown'); setMessage('Il checkout esistente non è verificabile. Non aprire un altro pagamento: verifica l’esito o contatta lo studio.');
        }
      } else {
        setPhase('closed'); closed.current = true;
        setMessage(error instanceof Error && error.message === 'PAYPAL_UNAVAILABLE'
          ? 'PayPal non è disponibile. Nessun pagamento è stato avviato: riprova più tardi o contatta lo studio.'
          : `${problem(error)} Se la preparazione è stata interrotta, l’eventuale blocco dello slot scadrà entro dieci minuti.`);
      }
    });
    return () => { disposed = true; alive.current = false; };
  }, [campaignId]);

  useEffect(() => {
    if (!hold) return;
    const initial = new Date(hold.expiresAt).getTime() - new Date(hold.serverTime).getTime();
    const received = performance.now();
    const tick = () => {
      const seconds = Math.max(0, Math.ceil((initial - (performance.now() - received)) / 1000));
      setRemaining(seconds);
      if (seconds === 0 && !deadlineTriggered.current) {
        deadlineTriggered.current = true; void expiryAction.current('expired');
      }
    };
    tick(); const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [hold]);
  useEffect(() => {
    if (phase !== 'unknown') return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      if (++attempts > 12) { window.clearInterval(timer); return; }
      void verify();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [phase]);

  const approve = async (approvedOrderId: string) => {
    if (busy.current || closed.current) return;
    if (approvedOrderId !== orderId.current) { await closeUnpaid('error'); return; }
    busy.current = true; setPhase('capturing');
    const current = credentials();
    persist({ ...current, captureAttempted: true });
    try {
      const payment = await captureBookingDeposit(current.bookingId, { token: current.token });
      if (hold) accept({ bookingId: current.bookingId, status: payment.status, payment,
        campaignId, flow: hold.flow,
        dataShootingInizio: hold.dataShootingInizio, dataShootingFine: hold.dataShootingFine });
    } catch {
      if (alive.current) {
        setPhase('unknown');
        setMessage('La risposta di PayPal non è stata confermata. Non pagare una seconda volta: verifica l’esito qui sotto.');
      }
    } finally { busy.current = false; }
  };
  return (
    <Card ref={container} tabIndex={-1} aria-labelledby="booking-deposit-title" className="mx-auto my-6 w-full max-w-lg" data-testid="booking-deposit-checkout">
      <CardHeader>
        <CardTitle id="booking-deposit-title" className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" />Conferma il tuo appuntamento</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {hold && <div className="rounded-lg bg-muted p-4" data-testid="booking-deposit-summary">
          <p className="text-sm">{phase === 'review' ? 'Acconto ricevuto' : phase === 'unknown' ? 'Acconto in verifica'
            : phase === 'closed' ? 'Acconto della prenotazione' : 'Acconto da pagare ora'}</p>
          <p className="text-3xl font-semibold" data-testid="booking-deposit-amount">{money(hold.depositAmountCents)}</p>
          <p className="mt-2 text-sm">{new Date(hold.dataShootingInizio).toLocaleString('it-IT', { timeZone: 'Europe/Rome', dateStyle: 'long', timeStyle: 'short' })}</p>
          <p className="mt-2 text-sm">Puoi scegliere i prodotti in studio. L’acconto serve a confermare lo slot, non è il prezzo totale del servizio.</p>
          {['ready', 'authorizing'].includes(phase) && <p className="mt-3 text-sm" role="timer" data-testid="booking-checkout-countdown">
            Tempo rimasto: {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
          </p>}
        </div>}
        {['loading', 'capturing', 'closing'].includes(phase) && <p role="status" className="flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />{phase === 'capturing' ? 'Verifico il pagamento. Non chiudere la pagina…' : phase === 'closing' ? 'Verifico l’esito e libero lo slot…' : 'Preparo il pagamento sicuro…'}
        </p>}
        {message && <p role={phase === 'closed' ? 'alert' : 'status'} data-testid="booking-payment-message" className="text-sm">{message}</p>}
        {storageWarning && <p role="alert" className="text-sm">Questo browser non salva la sessione: non ricaricare la pagina durante il pagamento.</p>}
        {config && hold && ['ready', 'authorizing', 'capturing'].includes(phase) && <GiftCardPayPalButtons
          key={sdkVersion}
          config={config} enabled={phase === 'ready' && remaining > 0}
          createOrder={async () => {
            if (busy.current || closed.current || remaining <= 0) throw new Error('Checkout non disponibile');
            setPhase('authorizing');
            setCanRetrySdk(false); setMessage('');
            try {
              const current = credentials();
              const order = await createBookingDepositOrder(current.bookingId, { token: current.token });
              if (order.depositAmountCents !== hold.depositAmountCents || order.currency !== 'EUR') throw new Error('Importo cambiato');
              orderId.current = order.paypalOrderId;
              return order.paypalOrderId;
            } catch (error) { await closeUnpaid('error'); throw error; }
          }}
          onApprove={approve}
          onCancel={() => { void closeUnpaid('cancelled'); }}
          onError={() => { void closeUnpaid('error'); }}
        />}
        {phase === 'authorizing' && <p className="text-sm" role="status">Completa l’autorizzazione nella finestra PayPal.</p>}
        {phase === 'ready' && hold?.flow !== 'approved' && <Button type="button" variant="outline" className="w-full" data-testid="button-cancel-booking-payment" onClick={() => void closeUnpaid('cancelled')}>Annulla e libera lo slot</Button>}
        {phase === 'ready' && canRetrySdk && <Button type="button" variant="outline" className="w-full" data-testid="button-retry-booking-paypal"
          onClick={() => { setCanRetrySdk(false); setSdkVersion(value => value + 1); }}>Ricarica PayPal</Button>}
        {phase === 'unknown' && <Button type="button" className="w-full" data-testid="button-verify-booking-payment" onClick={() => void verify()}>Verifica pagamento</Button>}
        {phase === 'review' && <p className="text-sm">Riferimento da comunicare allo studio: <strong>{session.current?.bookingId}</strong></p>}
        {phase === 'closed' && <Button type="button" className="w-full" data-testid="button-return-booking-form" onClick={onExit}>Torna a data e orario</Button>}
      </CardContent>
    </Card>
  );
}
