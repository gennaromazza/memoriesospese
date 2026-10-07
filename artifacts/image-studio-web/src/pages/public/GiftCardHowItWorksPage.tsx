import { useMemo } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { getWhatsAppLink } from '@shared/phone-utils';
import { GIFT_HOW_NOTES, GIFT_HOW_SEO, GIFT_HOW_SECTIONS, GIFT_SHOP_FAQS } from '@shared/gift-card-landing-content';
import { useStudio } from '@/context/StudioContext';
import { useSEO } from '@/hooks/useSEO';
import { giftCardsApi } from '@/features/gift-cards/gift-cards-api';
import { GiftCardAmbient } from '@/components/gift-cards/GiftCardArt';
import { GIFT_CARD_THEMES, giftCardThemeVars } from '@/components/gift-cards/giftCardThemes';
import '@/components/gift-cards/gift-cards.css';

/** Guida completa alla gift card: per chi regala, per chi riceve, in studio. */
export default function GiftCardHowItWorksPage() {
  const { studioSettings } = useStudio();
  const studioName = studioSettings.name || 'Image Studio';
  const whatsapp = studioSettings.whatsapp?.trim();
  const whatsappUrl = whatsapp ? getWhatsAppLink(whatsapp) : '';
  const studioAddress = studioSettings.address?.trim();
  const studioEmail = studioSettings.email?.trim();

  useSEO({
    title: GIFT_HOW_SEO.title,
    description: GIFT_HOW_SEO.description,
    canonical: '/regala/come-funziona',
  });

  // Stessi colori della pagina regalo: seguono il tema più presente tra i regali in vendita.
  const shop = useQuery({ queryKey: ['gift-card-shop'], queryFn: giftCardsApi.getShop, staleTime: 60_000 });
  const theme = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of shop.data?.types ?? []) counts.set(item.theme, (counts.get(item.theme) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    return (top as keyof typeof GIFT_CARD_THEMES | undefined) ?? 'natale';
  }, [shop.data]);

  return (
    <main className="gcx-scene gcx-landing" style={giftCardThemeVars(theme)}>
      <GiftCardAmbient theme={theme} />
      <div className="gcx-scene-inner gcx-shop">
        <nav aria-label="Percorso" className="gcx-crumbs">
          <Link href="/regala">Idee regalo</Link>
          <span aria-hidden="true"> › </span>
          <span aria-current="page">Come funziona</span>
        </nav>

        <header className="gcx-hero">
          <div className="gcx-bulbs" aria-hidden="true" />
          <h1>{GIFT_HOW_SEO.h1}</h1>
          <p className="gcx-lede">{GIFT_HOW_SEO.lede}</p>
          <div className="gcx-cta-row">
            <Link href="/regala" className="gcx-btn-gold">Scegli l'idea regalo</Link>
          </div>
        </header>

        {GIFT_HOW_SECTIONS.map(section => (
          <section key={section.id} id={section.id} className="gcx-block" aria-labelledby={`gcx-h-${section.id}`}>
            <h2 id={`gcx-h-${section.id}`} className="gcx-h2">{section.title}</h2>
            <p className="gcx-sub">{section.intro}</p>
            <ol className="gcx-how">
              {section.steps.map((step, index) => (
                <li key={step.title}><b>{index + 1}</b><h3>{step.title}</h3><p>{step.text}</p></li>
              ))}
            </ol>
          </section>
        ))}

        <div className="gcx-stripes" aria-hidden="true" />
        <section className="gcx-block" aria-labelledby="gcx-notes-t">
          <h2 id="gcx-notes-t" className="gcx-h2">Da sapere</h2>
          <div className="gcx-trust">
            {GIFT_HOW_NOTES.map(note => (
              <div key={note.title}><b>{note.title}</b><span>{note.text}</span></div>
            ))}
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

        <aside className="gcx-final">
          <h2 className="gcx-h2 gcx-h2-center">Pronto a scegliere il regalo?</h2>
          <div className="gcx-cta-row">
            <Link href="/regala" className="gcx-btn-gold">Vedi le idee regalo</Link>
            {whatsappUrl ? <a className="gcx-btn-line" href={whatsappUrl} target="_blank" rel="noopener noreferrer">Scrivici su WhatsApp</a> : null}
          </div>
        </aside>

        <footer className="gcx-foot gcx-foot-l">
          <p>{studioName}{studioAddress ? ` · ${studioAddress}` : ''}</p>
          <p>{studioEmail ? <a href={`mailto:${studioEmail}`}>{studioEmail}</a> : null}</p>
        </footer>
      </div>
    </main>
  );
}
