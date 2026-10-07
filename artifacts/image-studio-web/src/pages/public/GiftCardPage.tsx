import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Link, useParams } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import type { GiftCardPublicDto } from '@shared/gift-card-types';
import { getWhatsAppLink } from '@shared/phone-utils';
import { useStudio } from '@/context/StudioContext';
import { useSEO } from '@/hooks/useSEO';
import { giftCardsApi, GiftCardApiError } from '@/features/gift-cards/gift-cards-api';
import { GiftCardAmbient, GiftCardFull, GiftCardGlyph } from '@/components/gift-cards/GiftCardArt';
import { GiftCardIncludes } from '@/components/gift-cards/GiftCardIncludes';
import { giftCardThemeVars, resolveGiftCardTheme } from '@/components/gift-cards/giftCardThemes';
import '@/components/gift-cards/gift-cards.css';

type Phase = 'sealed' | 'breaking' | 'open';

const BURST_ANGLES = Array.from({ length: 14 }, (_, index) => index * 25.7);

function formatDayMonth(iso: string | null): string {
  if (!iso) return 'presto';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'presto';
  return new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: 'numeric', month: 'long' }).format(date);
}

/** Messaggio per le card che non si possono usare, con un modo per scriverci. */
function unusableMessage(card: GiftCardPublicDto): { title: string; text: string } | null {
  switch (card.status) {
    case 'in_attesa_pagamento':
      return {
        title: 'Questa card aspetta di essere attivata',
        text: 'Appena il pagamento è confermato la attiviamo. Poi torna qui e scegli il tuo giorno.',
      };
    case 'scaduta':
      return { title: 'Questa card è scaduta', text: 'Succede. Scrivici e vediamo insieme cosa si può fare.' };
    case 'riscattata':
      return { title: 'Questa card è già stata usata', text: 'Se pensi sia un errore, scrivici e controlliamo insieme.' };
    case 'annullata':
      return { title: 'Questa card non è più valida', text: 'Se hai domande, scrivici e ti aiutiamo volentieri.' };
    default:
      break;
  }
  if (card.campaign?.state === 'closed') {
    return {
      title: `La campagna ${card.campaign.name} è terminata`,
      text: 'La tua card è ancora tua. Scrivici e troviamo il modo di usarla.',
    };
  }
  return null;
}

export default function GiftCardPage() {
  const params = useParams<{ code: string }>();
  const code = params.code ?? '';
  const { studioSettings } = useStudio();
  const [phase, setPhase] = useState<Phase>('sealed');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useSEO({
    title: `${studioSettings.name || 'Image Studio'} | La tua gift card`,
    description: 'Apri il tuo regalo e scegli il giorno del tuo shooting.',
    canonical: `/regalo/${code}`,
    noindex: true,
  });

  const query = useQuery({
    queryKey: ['gift-card-public', code],
    queryFn: () => giftCardsApi.getPublic(code),
    retry: false,
    staleTime: 60_000,
  });

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => setPhase('sealed'), [code]);

  const card = query.data;
  const theme = resolveGiftCardTheme(card?.theme);
  const studioName = studioSettings.name || 'Image Studio';
  const whatsapp = studioSettings.whatsapp?.trim();
  const whatsappUrl = whatsapp ? getWhatsAppLink(whatsapp) : '';

  const openGift = () => {
    if (phase !== 'sealed') return;
    setPhase('breaking');
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    timer.current = setTimeout(() => setPhase('open'), reduced ? 0 : 520);
  };

  const contact = whatsappUrl ? (
    <a className="gcx-cta" href={whatsappUrl} target="_blank" rel="noopener noreferrer">Scrivici su WhatsApp</a>
  ) : null;

  let content: ReactElement;
  if (query.isLoading) {
    content = <p className="gcx-note" role="status">Un momento, stiamo cercando il tuo regalo…</p>;
  } else if (query.isError || !card) {
    const notFound = query.error instanceof GiftCardApiError && query.error.status === 404;
    content = (
      <div className="gcx-stage">
        <h1>{notFound ? 'Non troviamo questa gift card' : 'Qualcosa non ha funzionato'}</h1>
        <p className="gcx-note">
          {notFound
            ? 'Controlla di aver letto bene il QR o il codice. Se il problema resta, scrivici.'
            : query.error instanceof GiftCardApiError
              ? query.error.message
              : 'Riprova tra poco.'}
        </p>
        {contact}
      </div>
    );
  } else {
    const blocked = unusableMessage(card);
    const full = (
      <GiftCardFull
        theme={theme}
        title={card.title}
        line2={card.line2}
        recipientName={card.recipientName}
        message={card.message}
        validUntil={card.validUntil}
        code={card.code}
        ghost={!!blocked}
      />
    );
    if (blocked) {
      content = (
        <div className="gcx-stage">
          <div className="gcx-ghostwrap">{full}</div>
          <h1>{blocked.title}</h1>
          <p className="gcx-note">{blocked.text}</p>
          {card.status === 'in_attesa_pagamento' ? null : contact}
        </div>
      );
    } else {
      const campaign = card.campaign;
      const upcoming = campaign?.state === 'upcoming';
      const bookingHref = campaign?.bookingCode
        ? `/prenota/${encodeURIComponent(campaign.bookingCode)}?regalo=${encodeURIComponent(card.code)}`
        : '/prenota';
      const stageClass = `gcx-stage${phase === 'breaking' ? ' gcx-breaking' : ''}${phase === 'open' ? ' gcx-open' : ''}`;
      content = (
        <div className={stageClass}>
          <div className="gcx-intro">
            {card.recipientName ? <div className="gcx-script">Per {card.recipientName}</div> : null}
            <h1>Qualcuno ha un regalo per te</h1>
            <div className="gcx-pack">
              <div className="gcx-seal-wrap">
                <button type="button" className="gcx-seal gcx-seal-btn" onClick={openGift} aria-label="Apri il regalo">
                  <GiftCardGlyph theme={theme} />
                </button>
                {BURST_ANGLES.map(angle => (
                  <span key={angle} className="gcx-burst" style={{ ['--a' as string]: `${angle}deg` }} />
                ))}
              </div>
            </div>
            <p className="gcx-hint">Tocca il sigillo per aprirlo</p>
          </div>
          <div className="gcx-reveal">
            {full}
            <GiftCardIncludes includes={card.includes} items={card.items} />
            {upcoming ? (
              <span className="gcx-cta" role="link" aria-disabled="true">
                La campagna apre il {formatDayMonth(campaign?.opensAt ?? null)}
              </span>
            ) : (
              <Link href={bookingHref} className="gcx-cta">Scegli il tuo giorno</Link>
            )}
            {campaign ? <p className="gcx-note">{campaign.name} · tutto è già pagato</p> : null}
            <ol className="gcx-steps">
              <li><b>1</b>Scegli giorno e ora</li>
              <li><b>2</b>Lasciaci nome e contatti</li>
              <li><b>3</b>Vieni in studio: non devi pagare nulla</li>
            </ol>
          </div>
        </div>
      );
    }
  }

  return (
    <main className="gcx-scene" style={giftCardThemeVars(theme)}>
      <GiftCardAmbient theme={theme} />
      <div className="gcx-scene-inner">
        {content}
        <p className="gcx-foot">{studioName}</p>
      </div>
    </main>
  );
}
