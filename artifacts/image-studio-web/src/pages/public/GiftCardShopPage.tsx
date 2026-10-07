import { useCallback, useMemo, useRef, useState, type ReactElement } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Copy } from 'lucide-react';
import {
  GIFT_CARD_MESSAGE_MAX,
  GIFT_CARD_NAME_MAX,
  formatGiftCardPrice,
  isPlausibleEmail,
  type GiftCardOnlineCreateResult,
  type GiftCardShopTypeDto,
} from '@shared/gift-card-types';
import { getWhatsAppLink } from '@shared/phone-utils';
import { useStudio } from '@/context/StudioContext';
import { useSEO } from '@/hooks/useSEO';
import { giftCardShareUrl } from '@/components/gift-cards/GiftCardCartoncino';
import { GiftCardAmbient, GiftCardFull, GiftCardMini, formatCardDate } from '@/components/gift-cards/GiftCardArt';
import { giftCardThemeVars } from '@/components/gift-cards/giftCardThemes';
import { GiftCardApiError, giftCardsApi } from '@/features/gift-cards/gift-cards-api';
import { GiftCardPayPalButtons } from '@/features/gift-cards/GiftCardPayPalButtons';
import '@/components/gift-cards/gift-cards.css';

type DeliveryMode = 'now' | 'date';

interface PendingPayment {
  code: string;
  buyerToken: string;
  paypalOrderId: string;
}

interface Completed {
  code: string;
  type: GiftCardShopTypeDto;
  recipientName: string;
  message: string;
  deliverOn: string | null;
  recipientEmail: string;
  buyerEmail: string;
}

/** Giorno di oggi (YYYY-MM-DD) nel fuso orario dello studio. */
function romeToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function romeDay(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function longDay(isoDay: string): string {
  return new Intl.DateTimeFormat('it-IT', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${isoDay}T12:00:00Z`));
}

const STORAGE_KEY = 'gift-card-pending-payment';

function rememberPending(value: PendingPayment | null) {
  try {
    if (value) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // il browser può negare l'accesso: la conferma resta possibile dalla stessa pagina
  }
}

export default function GiftCardShopPage() {
  const { studioSettings } = useStudio();
  const studioName = studioSettings.name || 'Image Studio';
  const whatsapp = studioSettings.whatsapp?.trim();
  const whatsappUrl = whatsapp ? getWhatsAppLink(whatsapp) : '';

  useSEO({
    title: `${studioName} | Regala uno shooting`,
    description: 'Una gift card Image Studio: scegli il regalo, scrivi un messaggio e consegnalo quando vuoi.',
    canonical: '/regala',
    noindex: true,
  });

  const shop = useQuery({ queryKey: ['gift-card-shop'], queryFn: giftCardsApi.getShop, staleTime: 60_000 });

  const [typeId, setTypeId] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [message, setMessage] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [delivery, setDelivery] = useState<DeliveryMode>('now');
  const [deliverOn, setDeliverOn] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState<PendingPayment | null>(null);
  const [done, setDone] = useState<Completed | null>(null);
  const [copied, setCopied] = useState(false);

  const types = shop.data?.types ?? [];
  const type = types.find(item => item.id === typeId) ?? types[0];
  const today = romeToday();
  const maxDay = type ? romeDay(type.validUntil) : null;

  const problems = useMemo(() => {
    const list: string[] = [];
    if (!type) list.push('scegli un regalo');
    if (!buyerName.trim()) list.push('il tuo nome');
    if (!isPlausibleEmail(buyerEmail.trim())) list.push('la tua email');
    if (recipientEmail.trim() && !isPlausibleEmail(recipientEmail.trim())) list.push('un\'email valida per chi riceve');
    if (delivery === 'date') {
      if (!deliverOn) list.push('il giorno di consegna');
      else if (deliverOn < today || (maxDay && deliverOn > maxDay)) list.push('un giorno di consegna valido');
      if (!recipientEmail.trim()) list.push('l\'email di chi riceve, per la consegna programmata');
    }
    if (!terms) list.push('le condizioni di vendita');
    if (!privacy) list.push('la privacy');
    return list;
  }, [type, buyerName, buyerEmail, recipientEmail, delivery, deliverOn, today, maxDay, terms, privacy]);

  const formReady = problems.length === 0 && !retry;
  const form = useRef({ type, recipientName, message, recipientEmail, delivery, deliverOn, buyerName, buyerEmail, terms, privacy });
  form.current = { type, recipientName, message, recipientEmail, delivery, deliverOn, buyerName, buyerEmail, terms, privacy };
  const pending = useRef<PendingPayment | null>(null);

  const createOrder = useCallback(async (): Promise<string> => {
    const current = form.current;
    if (!current.type) throw new Error('Scegli un regalo.');
    setError(null);
    setBusy(true);
    try {
      const result: GiftCardOnlineCreateResult = await giftCardsApi.createOnlineOrder({
        typeId: current.type.id,
        recipientName: current.recipientName.trim(),
        message: current.message.trim(),
        buyerName: current.buyerName.trim(),
        buyerEmail: current.buyerEmail.trim(),
        recipientEmail: current.recipientEmail.trim() || undefined,
        deliverOn: current.delivery === 'date' ? current.deliverOn : null,
        termsAccepted: current.terms,
        privacyAccepted: current.privacy,
      });
      pending.current = { code: result.code, buyerToken: result.buyerToken, paypalOrderId: result.paypalOrderId };
      rememberPending(pending.current);
      return result.paypalOrderId;
    } catch (caught) {
      setBusy(false);
      const text = caught instanceof Error ? caught.message : 'Non riesco a preparare il pagamento.';
      setError(text);
      throw caught;
    }
  }, []);

  const confirm = useCallback(async (payment: PendingPayment) => {
    const current = form.current;
    try {
      await giftCardsApi.captureOnlineOrder(payment.code, payment.paypalOrderId, payment.buyerToken);
    } catch (caught) {
      setBusy(false);
      // Se la conferma non arriva, PayPal potrebbe aver già incassato: si può solo ripetere la conferma, mai pagare di nuovo.
      const unreachable = caught instanceof GiftCardApiError && (caught.status === 0 || caught.status >= 500 || caught.status === 409);
      if (unreachable) {
        setRetry(payment);
        setError(caught.message);
      } else {
        setError(caught instanceof Error ? caught.message : 'Non riesco a confermare il pagamento.');
      }
      throw caught;
    }
    rememberPending(null);
    pending.current = null;
    setRetry(null);
    setBusy(false);
    if (current.type) {
      setDone({
        code: payment.code,
        type: current.type,
        recipientName: current.recipientName.trim(),
        message: current.message.trim(),
        deliverOn: current.delivery === 'date' ? current.deliverOn : null,
        recipientEmail: current.recipientEmail.trim(),
        buyerEmail: current.buyerEmail.trim(),
      });
    }
    window.scrollTo({ top: 0 });
  }, []);

  const approve = useCallback(async (paypalOrderId: string) => {
    const payment = pending.current;
    if (!payment || payment.paypalOrderId !== paypalOrderId) {
      setError('Non riesco a collegare il pagamento alla tua gift card. Scrivici: controlliamo subito.');
      return;
    }
    setBusy(true);
    await confirm(payment).catch(() => undefined);
  }, [confirm]);

  const copyLink = async (code: string) => {
    try {
      await navigator.clipboard.writeText(giftCardShareUrl(code));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const theme = (done?.type ?? type)?.theme ?? 'classico';
  const contact = whatsappUrl ? (
    <a className="underline" href={whatsappUrl} target="_blank" rel="noopener noreferrer">scrivici su WhatsApp</a>
  ) : (
    <span>scrivici</span>
  );

  let body: ReactElement;
  if (shop.isLoading) {
    body = <p className="gcx-note" role="status">Un momento…</p>;
  } else if (shop.isError || !shop.data) {
    body = (
      <div className="gcx-panel">
        <h2>Le gift card non sono disponibili</h2>
        <p>{shop.error instanceof Error ? shop.error.message : 'Riprova tra poco.'}</p>
      </div>
    );
  } else if (done) {
    const link = giftCardShareUrl(done.code);
    body = (
      <div className="gcx-shop-stack">
        <div className="gcx-panel gcx-center">
          <CheckCircle2 className="gcx-ok" aria-hidden="true" />
          <h2>Il tuo regalo è pronto</h2>
          <p>
            Il pagamento è andato a buon fine. Ti abbiamo scritto a <strong>{done.buyerEmail}</strong> con la ricevuta e il codice.
            {done.recipientEmail
              ? done.deliverOn
                ? ` Il regalo arriverà a ${done.recipientName || 'chi lo riceve'} il ${longDay(done.deliverOn)}, alle 8:00.`
                : ` Abbiamo già inviato il regalo a ${done.recipientName || 'chi lo riceve'}.`
              : ' Inoltra tu il link qui sotto a chi vuoi.'}
          </p>
        </div>
        <GiftCardFull
          theme={done.type.theme}
          title={done.type.title}
          line2={done.type.line2}
          recipientName={done.recipientName}
          message={done.message}
          validUntil={done.type.validUntil}
          code={done.code}
        />
        <div className="gcx-panel">
          <p className="gcx-small-label">Link del regalo</p>
          <p className="gcx-link-box">{link}</p>
          <div className="gcx-row">
            <button type="button" className="gcx-btn" onClick={() => void copyLink(done.code)}>
              <Copy aria-hidden="true" /> {copied ? 'Copiato' : 'Copia il link'}
            </button>
            <Link href={`/regalo/${encodeURIComponent(done.code)}`} className="gcx-btn gcx-btn-ghost">Guarda come appare</Link>
          </div>
        </div>
      </div>
    );
  } else if (!types.length) {
    body = (
      <div className="gcx-panel gcx-center">
        <h2>Le gift card arrivano presto</h2>
        <p>In questo momento non c'è nessun regalo in vendita online. Per un regalo su misura {contact}.</p>
      </div>
    );
  } else {
    body = (
      <div className="gcx-shop-stack">
        <section aria-labelledby="gcx-s1">
          <h2 id="gcx-s1" className="gcx-step">1 · Scegli il regalo</h2>
          <div className="gcx-choices" role="radiogroup" aria-label="Regalo">
            {types.map(item => (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={item.id === type?.id}
                className="gcx-choice"
                onClick={() => setTypeId(item.id)}
              >
                <GiftCardMini theme={item.theme} name={item.title} small={item.line2} />
                <span className="gcx-choice-meta">
                  <b>{item.name}</b>
                  <span>{formatGiftCardPrice(item.priceCents)}</span>
                </span>
              </button>
            ))}
          </div>
          {type?.description ? <p className="gcx-hint-text">{type.description}</p> : null}
        </section>

        {type ? (
          <GiftCardFull
            theme={type.theme}
            title={type.title}
            line2={type.line2}
            recipientName={recipientName.trim()}
            message={message.trim()}
            validUntil={type.validUntil}
            code="••••-••••-••••"
          />
        ) : null}

        <section className="gcx-panel" aria-labelledby="gcx-s2">
          <h2 id="gcx-s2" className="gcx-step gcx-step-dark">2 · Personalizzalo</h2>
          <div className="gcx-grid2">
            <label className="gcx-field">
              <span>Per chi è (facoltativo)</span>
              <input value={recipientName} maxLength={GIFT_CARD_NAME_MAX} onChange={event => setRecipientName(event.target.value)} placeholder="Per esempio Giulia" />
            </label>
            <label className="gcx-field">
              <span>Da parte di</span>
              <input value={buyerName} maxLength={80} onChange={event => setBuyerName(event.target.value)} autoComplete="name" />
            </label>
          </div>
          <label className="gcx-field">
            <span>Il tuo messaggio (facoltativo)</span>
            <textarea value={message} maxLength={GIFT_CARD_MESSAGE_MAX} rows={2} onChange={event => setMessage(event.target.value)} placeholder="Una riga scritta a mano per chi riceve" />
            <small>{message.length}/{GIFT_CARD_MESSAGE_MAX}</small>
          </label>
          <fieldset className="gcx-field">
            <legend>Quando arriva</legend>
            <label className="gcx-radio"><input type="radio" name="gcx-delivery" checked={delivery === 'now'} onChange={() => setDelivery('now')} /> Subito dopo il pagamento</label>
            <label className="gcx-radio"><input type="radio" name="gcx-delivery" checked={delivery === 'date'} onChange={() => setDelivery('date')} /> In un giorno che scelgo, alle 8:00</label>
            {delivery === 'date' ? (
              <input type="date" aria-label="Giorno di consegna" value={deliverOn} min={today} max={maxDay ?? undefined} onChange={event => setDeliverOn(event.target.value)} />
            ) : null}
          </fieldset>
          <label className="gcx-field">
            <span>Email di chi riceve (facoltativa)</span>
            <input type="email" value={recipientEmail} onChange={event => setRecipientEmail(event.target.value)} autoComplete="off" />
            <small>Se la scrivi, il regalo arriva direttamente a lei o a lui. Altrimenti ricevi tu il link da inoltrare.</small>
          </label>
        </section>

        <section className="gcx-panel" aria-labelledby="gcx-s3">
          <h2 id="gcx-s3" className="gcx-step gcx-step-dark">3 · Paga</h2>
          <label className="gcx-field">
            <span>La tua email</span>
            <input type="email" value={buyerEmail} onChange={event => setBuyerEmail(event.target.value)} autoComplete="email" />
            <small>Qui ti mandiamo la ricevuta e il codice.</small>
          </label>
          <label className="gcx-radio gcx-consent"><input type="checkbox" checked={terms} onChange={event => setTerms(event.target.checked)} /> <span>Ho letto le <Link href="/terms" className="underline">condizioni di vendita</Link>: la card scade alla data indicata e non è rimborsabile.</span></label>
          <label className="gcx-radio gcx-consent"><input type="checkbox" checked={privacy} onChange={event => setPrivacy(event.target.checked)} /> <span>Ho letto l'<Link href="/privacy" className="underline">informativa privacy</Link>.</span></label>
          <div className="gcx-total"><span>Totale</span><b>{type ? formatGiftCardPrice(type.priceCents) : '—'}</b></div>
          {problems.length && !busy ? <p className="gcx-hint-text">Per pagare mancano: {problems.join(', ')}.</p> : null}
          {error ? <p className="gcx-error" role="alert">{error}</p> : null}
          {retry ? (
            <div className="gcx-warn" role="alert">
              <p><b>Non pagare di nuovo.</b> Il pagamento potrebbe essere già stato registrato da PayPal.</p>
              <button type="button" className="gcx-btn" disabled={busy} onClick={() => { setBusy(true); setError(null); void confirm(retry).catch(() => undefined); }}>
                Riprova a confermare
              </button>
              <p>Se non funziona, {contact} indicando il codice <b>{retry.code}</b>.</p>
            </div>
          ) : !shop.data.paypal.enabled ? (
            <p className="gcx-error">Il pagamento online non è ancora attivo. Per ordinare {contact}.</p>
          ) : (
            <GiftCardPayPalButtons
              config={shop.data.paypal}
              enabled={formReady}
              createOrder={createOrder}
              onApprove={approve}
              onCancel={() => { setBusy(false); setError('Pagamento annullato. Non è stato addebitato nulla.'); }}
              onError={message => { setBusy(false); setError(message); }}
            />
          )}
          <p className="gcx-hint-text">Paghi in modo sicuro con PayPal. Non vediamo i dati della tua carta.</p>
        </section>
      </div>
    );
  }

  return (
    <main className="gcx-scene" style={giftCardThemeVars(theme)}>
      <GiftCardAmbient theme={theme} />
      <div className="gcx-scene-inner gcx-shop">
        <header className="gcx-shop-head">
          <div className="gcx-script">Un regalo che si scarta</div>
          <h1>Regala uno shooting</h1>
          <p>
            Scegli il regalo, scrivi due righe e consegnalo quando vuoi.
            {type?.validUntil ? ` La card che stai scegliendo è valida fino al ${formatCardDate(type.validUntil)}.` : ''}
          </p>
        </header>
        {body}
        <p className="gcx-foot">{studioName}</p>
      </div>
    </main>
  );
}
