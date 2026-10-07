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
import { GIFT_SHOP_FAQS, GIFT_SHOP_SEO, GIFT_SHOP_STEPS } from '@shared/gift-card-landing-content';
import { useStudio } from '@/context/StudioContext';
import { useSEO } from '@/hooks/useSEO';
import { giftCardShareUrl } from '@/components/gift-cards/GiftCardCartoncino';
import { GiftCardAmbient, GiftCardFull, GiftCardSeal } from '@/components/gift-cards/GiftCardArt';
import { GIFT_CARD_THEMES, giftCardThemeVars } from '@/components/gift-cards/giftCardThemes';
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
    title: GIFT_SHOP_SEO.title,
    description: GIFT_SHOP_SEO.description,
    canonical: '/regala',
  });

  const shop = useQuery({ queryKey: ['gift-card-shop'], queryFn: giftCardsApi.getShop, staleTime: 60_000 });

  const [typeId, setTypeId] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [message, setMessage] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [delivery, setDelivery] = useState<DeliveryMode>('now');
  const [deliverOn, setDeliverOn] = useState('');
  const [buyerFirstName, setBuyerFirstName] = useState('');
  const [buyerLastName, setBuyerLastName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
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
    if (!buyerFirstName.trim()) list.push('il tuo nome');
    if (!buyerLastName.trim()) list.push('il tuo cognome');
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
  }, [type, buyerFirstName, buyerLastName, buyerEmail, recipientEmail, delivery, deliverOn, today, maxDay, terms, privacy]);

  const formReady = problems.length === 0 && !retry;
  const form = useRef({ type, recipientName, message, recipientEmail, delivery, deliverOn, buyerFirstName, buyerLastName, buyerPhone, buyerEmail, terms, privacy });
  form.current = { type, recipientName, message, recipientEmail, delivery, deliverOn, buyerFirstName, buyerLastName, buyerPhone, buyerEmail, terms, privacy };
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
        buyerFirstName: current.buyerFirstName.trim(),
        buyerLastName: current.buyerLastName.trim(),
        buyerPhone: current.buyerPhone.trim() || undefined,
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

  // Il colore della pagina segue il tema più presente tra i regali in vendita (oggi Natale).
  const theme = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of types) counts.set(item.theme, (counts.get(item.theme) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    return (top as keyof typeof GIFT_CARD_THEMES | undefined) ?? 'natale';
  }, [types]);
  const studioAddress = studioSettings.address?.trim();
  const studioEmail = studioSettings.email?.trim();
  // Con il tag <base> del sito i link #ancora porterebbero alla home: si scorre via codice.
  const scrollToId = (id: string) => {
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }), 0);
  };
  const goToPurchase = (id: string) => {
    setTypeId(id);
    scrollToId('acquista');
  };
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
      <>
        <section id="idee" className="gcx-block" aria-labelledby="gcx-ideas-t">
          <h2 id="gcx-ideas-t" className="gcx-h2">Le nostre idee regalo</h2>
          <p className="gcx-sub">Scegli quella che farà felice chi ami: la vedi qui sotto con il tuo messaggio prima di pagare.</p>
          <div className="gcx-ideas">
            {types.map(item => {
              const cover = item.items.find(entry => entry.imageUrls[0])?.imageUrls[0];
              const selected = item.id === type?.id;
              return (
                <article key={item.id} className={`gcx-idea${selected ? ' gcx-idea-on' : ''}`}>
                  <div className="gcx-idea-ph" style={cover ? undefined : { background: GIFT_CARD_THEMES[item.theme].bg }}>
                    {cover ? <img src={cover} alt="" loading="lazy" /> : <span>{item.title}</span>}
                  </div>
                  <div className="gcx-idea-body">
                    <h3>{item.title}</h3>
                    {item.line2 ? <p className="gcx-idea-line">{item.line2}</p> : null}
                    {item.description ? <p>{item.description}</p> : null}
                    {item.items.length ? (
                      <p className="gcx-idea-incl">Include: {item.items.map(entry => (entry.quantity > 1 ? `${entry.name} × ${entry.quantity}` : entry.name)).join(', ')}</p>
                    ) : null}
                    <div className="gcx-idea-row">
                      <b>{formatGiftCardPrice(item.priceCents)}</b>
                      <button type="button" className="gcx-btn-gold" aria-pressed={selected} onClick={() => goToPurchase(item.id)}>
                        {selected ? 'Scelto' : 'Scegli'}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <div id="acquista" className="gcx-shop-stack gcx-buy">
          <h2 className="gcx-h2 gcx-h2-center">Personalizza e regala</h2>
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
          <h3 id="gcx-s2" className="gcx-step gcx-step-dark">Personalizza il regalo</h3>
          <label className="gcx-field">
            <span>Per chi è (facoltativo)</span>
            <input value={recipientName} maxLength={GIFT_CARD_NAME_MAX} onChange={event => setRecipientName(event.target.value)} placeholder="Per esempio Giulia" />
          </label>
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
          <h3 id="gcx-s3" className="gcx-step gcx-step-dark">Paga</h3>
          <div className="gcx-grid2">
            <label className="gcx-field">
              <span>Il tuo nome</span>
              <input value={buyerFirstName} maxLength={60} onChange={event => setBuyerFirstName(event.target.value)} autoComplete="given-name" />
            </label>
            <label className="gcx-field">
              <span>Il tuo cognome</span>
              <input value={buyerLastName} maxLength={60} onChange={event => setBuyerLastName(event.target.value)} autoComplete="family-name" />
            </label>
          </div>
          <label className="gcx-field">
            <span>La tua email</span>
            <input type="email" value={buyerEmail} onChange={event => setBuyerEmail(event.target.value)} autoComplete="email" />
            <small>Qui ti mandiamo la ricevuta e il codice.</small>
          </label>
          <label className="gcx-field">
            <span>Telefono (facoltativo)</span>
            <input type="tel" value={buyerPhone} maxLength={30} onChange={event => setBuyerPhone(event.target.value)} autoComplete="tel" />
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
      </>
    );
  }

  const showMarketing = !done && !shop.isLoading && !!shop.data && types.length > 0;

  return (
    <main className="gcx-scene gcx-landing" style={giftCardThemeVars(theme)}>
      <GiftCardAmbient theme={theme} />
      <div className="gcx-scene-inner gcx-shop">
        {done ? null : (
          <header className="gcx-hero">
            <div className="gcx-bulbs" aria-hidden="true" />
            <p className="gcx-eyebrow-l">Natale 2026 · {studioName}</p>
            <h1>{GIFT_SHOP_SEO.h1}<span className="gcx-hero-script">{GIFT_SHOP_SEO.script}</span></h1>
            <p className="gcx-lede">{GIFT_SHOP_SEO.lede}</p>
            {types.length ? (
              <div className="gcx-cta-row">
                <button type="button" className="gcx-btn-gold" onClick={() => scrollToId('idee')}>Scegli l'idea regalo</button>
                <Link href="/regala/come-funziona" className="gcx-btn-line">Come funziona</Link>
              </div>
            ) : null}
            <ul className="gcx-proof">
              <li>Paghi in sicurezza con PayPal</li>
              <li>Un regalo che si scarta</li>
            </ul>
          </header>
        )}
        {body}

        {showMarketing ? (
          <>
            <div className="gcx-stripes" aria-hidden="true" />
            <section id="come-funziona" className="gcx-block" aria-labelledby="gcx-how-t">
              <h2 id="gcx-how-t" className="gcx-h2">Come regalare una gift card</h2>
              <p className="gcx-sub">Tre passaggi, dal telefono, senza creare un account.</p>
              <ol className="gcx-how">
                {GIFT_SHOP_STEPS.map((step, index) => (
                  <li key={step.title}><b>{index + 1}</b><h3>{step.title}</h3><p>{step.text}</p></li>
                ))}
              </ol>
              <p className="gcx-more"><Link href="/regala/come-funziona">Leggi la guida completa</Link></p>
            </section>

            <section className="gcx-block gcx-unwrap" aria-labelledby="gcx-unwrap-t">
              <div className="gcx-pack" role="img" aria-label="Il regalo chiuso con il sigillo">
                <div className="gcx-seal-wrap"><GiftCardSeal theme={theme} size={72} /></div>
              </div>
              <div>
                <h2 id="gcx-unwrap-t" className="gcx-h2">Un regalo che si scarta davvero</h2>
                <p className="gcx-sub">Chi lo riceve apre il link e rompe il sigillo. Vede la card con il tuo messaggio e scopre cosa c'è dentro.</p>
                <ul className="gcx-dots">
                  <li>Vede i prodotti inclusi, con foto e dettagli</li>
                  <li>Non deve pagare nulla</li>
                  <li>Può avere anche il cartoncino stampato, da regalare in mano</li>
                </ul>
              </div>
            </section>

            <section className="gcx-block" aria-labelledby="gcx-why-t">
              <h2 id="gcx-why-t" className="gcx-h2">Perché {studioName}</h2>
              <div className="gcx-trust">
                <div><b>Il nostro studio</b><span>{studioAddress || 'Dove si fa il regalo, vicino a te.'}</span></div>
                <div><b>Il set di Natale</b><span>Luci, velluto rosso e decorazioni, solo per questa stagione.</span></div>
                <div><b>Consegna quando vuoi</b><span>Scegli il giorno e il regalo arriva per email alle 8:00.</span></div>
              </div>
            </section>

            <section className="gcx-block" aria-labelledby="gcx-faq-t">
              <h2 id="gcx-faq-t" className="gcx-h2">Domande frequenti</h2>
              {GIFT_SHOP_FAQS.map(faq => (
                <details key={faq.question} className="gcx-faq">
                  <summary>{faq.question}</summary>
                  <p>{faq.answer}</p>
                </details>
              ))}
            </section>

            <div className="gcx-stripes" aria-hidden="true" />
            <aside className="gcx-final">
              <h2 className="gcx-h2 gcx-h2-center">Il regalo di Natale che resta</h2>
              <p className="gcx-sub gcx-center-text">Scegli l'idea e consegnala quando vuoi.</p>
              <div className="gcx-cta-row"><button type="button" className="gcx-btn-gold" onClick={() => scrollToId('idee')}>Scegli l'idea regalo</button></div>
            </aside>
          </>
        ) : null}

        <footer className="gcx-foot gcx-foot-l">
          <p>{studioName}{studioAddress ? ` · ${studioAddress}` : ''}</p>
          <p>
            {whatsappUrl ? <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">WhatsApp</a> : null}
            {whatsappUrl && studioEmail ? ' · ' : null}
            {studioEmail ? <a href={`mailto:${studioEmail}`}>{studioEmail}</a> : null}
          </p>
        </footer>
      </div>
    </main>
  );
}
