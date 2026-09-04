import { useEffect, useMemo, useRef, useState } from 'react';
import { useStudio } from '@/context/StudioContext';
import { useSEO } from '@/hooks/useSEO';
import { trackAnalyticsEvent } from '@/lib/analytics';
import { buildImageExperienceConfiguratorUrl } from '@/lib/image-experience';
import { getPublicWeddingStoryPreviews } from '@/lib/wedding-seo';
import type { PublicWeddingStoryPreview } from '@shared/wedding-seo-types';
import './ImageExperiencePage.css';

const IMAGE_ROOT = '/images/image-experience';

type ResponsiveImageProps = {
  name: string;
  alt: string;
  className?: string;
  eager?: boolean;
  sizes: string;
};

function ResponsiveImage({ name, alt, className, eager = false, sizes }: ResponsiveImageProps) {
  const srcSet = (extension: 'avif' | 'webp') =>
    [640, 1024, 1536].map(width => `${IMAGE_ROOT}/${name}-${width}.${extension} ${width}w`).join(', ');

  return (
    <picture className={className}>
      <source type="image/avif" srcSet={srcSet('avif')} sizes={sizes} />
      <source type="image/webp" srcSet={srcSet('webp')} sizes={sizes} />
      <img
        src={`${IMAGE_ROOT}/${name}-1024.webp`}
        width="1536"
        height="1024"
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        decoding={eager ? 'sync' : 'async'}
        {...(eager ? { fetchpriority: 'high' } : {})}
      />
    </picture>
  );
}

function useConfiguratorUrl() {
  return useMemo(() => {
    return buildImageExperienceConfiguratorUrl(
      typeof window === 'undefined' ? '' : window.location.search,
    );
  }, []);
}

export default function ImageExperiencePage() {
  const { studioSettings } = useStudio();
  const configuratorUrl = useConfiguratorUrl();
  const [heroPassed, setHeroPassed] = useState(false);
  const [realWeddings, setRealWeddings] = useState<PublicWeddingStoryPreview[]>([]);
  const trackedView = useRef(false);
  useSEO({
    title: 'Image Experience | Fotografo Matrimonio Campania da 2.200 €',
    description: 'Scopri Image Experience di Image Studio. Un punto di partenza chiaro da 2.200 € e la libertà di configurare il servizio fotografico del vostro matrimonio.',
    canonical: '/image-experience',
    ogType: 'website',
    ogImage: '/images/image-experience/image-experience-social-1200x630.jpg',
    ogImageAlt: 'Una sposa abbraccia sua madre durante i preparativi del matrimonio',
    ogImageWidth: 1200,
    ogImageHeight: 630,
    ogImageType: 'image/jpeg',
    ogImageSource: 'curated-static',
    keywords: 'fotografo matrimonio Campania, fotografia matrimonio Napoli, Image Experience',
  });

  useEffect(() => {
    if (!trackedView.current) {
      trackedView.current = true;
      trackAnalyticsEvent('image_experience_landing_view', { landing: 'image_experience' });
    }
    const onScroll = () => setHeroPassed(window.scrollY > Math.max(300, window.innerHeight * .62));
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    let isCurrent = true;
    getPublicWeddingStoryPreviews(3)
      .then(stories => {
        if (isCurrent) setRealWeddings(stories);
      })
      .catch(error => {
        console.warn('Real Wedding non disponibili nella landing Image Experience:', error);
      });
    return () => {
      isCurrent = false;
    };
  }, []);

  const goConfigure = (position: string) => {
    trackAnalyticsEvent('image_experience_configurator_click', {
      position,
      landing: 'image_experience',
    });
  };
  const portfolioClick = () => trackAnalyticsEvent('image_experience_portfolio_click', {
    position: 'editorial_gallery',
    landing: 'image_experience',
  });
  const studioName = studioSettings.name || 'Image Studio';

  return (
    <main className="image-experience">
      <header className="ie-shell ie-header">
        <a href="/" className="ie-logo" aria-label={`${studioName}, home`}>
          {studioSettings.logo ? (
            <img src={studioSettings.logo} alt={`${studioName} logo`} width="40" height="40" />
          ) : (
            <strong>Image Studio</strong>
          )}
          Fotografia matrimoniale
        </a>
        <a href={configuratorUrl} className="ie-header-cta" onClick={() => goConfigure('header')}>Configura</a>
      </header>

      <section className="ie-hero" aria-labelledby="hero-title">
        <ResponsiveImage
          name="abbraccio-sposa-reportage-matrimonio"
          alt="Una sposa abbraccia sua madre durante i preparativi del matrimonio"
          className="ie-hero-media"
          eager
          sizes="100vw"
        />
        <div className="ie-shell ie-hero-content">
          <span className="ie-kicker">Image Studio · 2026</span>
          <h1 id="hero-title">Quest'anno non saremo in fiera.<br /><em>Saremo dove iniziano le vostre domande.</em></h1>
          <p className="ie-lead">Dopo quattro anni di fiere abbiamo scelto di costruire un modo diverso per farvi conoscere il nostro lavoro.</p>
          <div className="ie-price"><strong>2.200 €</strong><span>punto di partenza</span></div>
          <br />
          <a href={configuratorUrl} className="ie-cta" onClick={() => goConfigure('hero')}>Configura il tuo servizio</a>
          <p className="ie-kicker" style={{ marginTop: '1.2rem', letterSpacing: '.08em', textTransform: 'none' }}>Configurate liberamente, prima ancora di contattarci.</p>
        </div>
      </section>

      <section className="ie-section" aria-labelledby="choice-title">
        <div className="ie-shell ie-grid">
          <div className="ie-copy">
            <hr className="ie-rule" />
            <h2 id="choice-title">Non volevamo un altro stand. Volevamo un percorso.</h2>
            <p>Le fiere ci hanno insegnato ad ascoltare le domande che arrivano prima di una scelta. Nel 2026 ci prendiamo una pausa per trasformare quell'ascolto in qualcosa di più semplice, aperto e accessibile.</p>
          </div>
          <ResponsiveImage
            name="coppia-visita-fiera-sposi"
            alt="Una coppia visita una fiera dedicata al matrimonio"
            className="ie-image ie-image--tall"
            sizes="(min-width: 700px) 44vw, 100vw"
          />
        </div>
      </section>

      <section className="ie-section ie-section--soft" aria-labelledby="problem-title">
        <div className="ie-shell">
          <p className="ie-kicker">Ogni matrimonio è differente.</p>
          <h2 id="problem-title" className="ie-statement">Il problema non è scegliere tra tre pacchetti.<br /><em>È capire cosa vi serve davvero.</em></h2>
          <div className="ie-choice">
            <div className="ie-choice-item"><strong>Non tre pacchetti</strong><span>Ogni storia ha tempi, persone e priorità diverse.</span></div>
            <div className="ie-choice-item"><strong>Un punto di partenza</strong><span>Vedete subito da dove si comincia, senza formule nascoste.</span></div>
            <div className="ie-choice-item"><strong>La vostra misura</strong><span>Aggiungete solo ciò che vi somiglia e vi serve davvero.</span></div>
          </div>
          <ResponsiveImage
            name="coppia-configura-servizio-matrimonio"
            alt="Una coppia configura insieme il servizio fotografico del matrimonio"
            className="ie-config-photo"
            sizes="(min-width: 700px) 44vw, 100vw"
          />
        </div>
      </section>

      <section className="ie-section" aria-labelledby="experience-title">
        <div className="ie-shell ie-grid ie-grid--reverse">
          <div className="ie-copy">
            <span className="ie-kicker">Image Experience</span>
            <h2 id="experience-title">Un punto di partenza chiaro. Il resto lo scegliete voi.</h2>
            <p>La proposta parte da 2.200 €. Da lì potete aggiungere le esperienze che desiderate e costruire una prima configurazione del vostro servizio, con calma.</p>
            <a href={configuratorUrl} className="ie-cta" onClick={() => goConfigure('image_experience')}>Inizia a configurare</a>
          </div>
          <div className="ie-config" aria-label="Come funziona Image Experience">
            <div className="ie-config-block"><strong>Base</strong><span>La partenza</span></div>
            <div className="ie-config-sign" aria-hidden="true">+</div>
            <div className="ie-config-block"><strong>Esperienze</strong><span>Le vostre scelte</span></div>
            <div className="ie-config-sign" aria-hidden="true">=</div>
            <div className="ie-config-block"><strong>La vostra</strong><span>Image Experience</span></div>
          </div>
        </div>
      </section>

      <section className="ie-section ie-section--soft ie-services" aria-labelledby="services-title">
        <div className="ie-shell">
          <div className="ie-copy">
            <span className="ie-kicker">Image Experience · cosa comprende</span>
            <h2 id="services-title">Cosa è incluso nella nostra Experience?</h2>
            <p>Una proposta completa per raccontare, vivere e custodire il vostro matrimonio. Quattro elementi pensati per stare insieme, senza dover scegliere da dove cominciare.</p>
          </div>
          <div className="ie-service-grid">
            <article className="ie-service-card">
              <ResponsiveImage
                name="festa-ricevimento-matrimonio"
                alt="Gli sposi ballano con gli invitati durante la festa di matrimonio"
                className="ie-service-media"
                sizes="(min-width: 700px) 25vw, 100vw"
              />
              <div className="ie-service-card-body">
                <span className="ie-service-number">01</span>
                <h3>Fotografia e video</h3>
                <p>Due fotografi e due videomaker raccontano il vostro giorno dai preparativi al taglio della torta, con riprese aeree e una narrazione completa.</p>
              </div>
            </article>
            <article className="ie-service-card">
              <ResponsiveImage
                name="coppia-sceglie-fotografie-matrimonio"
                alt="Una coppia osserva insieme una selezione di fotografie di matrimonio"
                className="ie-service-media"
                sizes="(min-width: 700px) 25vw, 100vw"
              />
              <div className="ie-service-card-body">
                <span className="ie-service-number">02</span>
                <h3>Experience Gallery Interattiva</h3>
                <p>Una galleria privata con QR code e password, dove gli ospiti possono commentare, lasciare messaggi vocali, mettere like e salvare le immagini.</p>
              </div>
            </article>
            <article className="ie-service-card">
              <ResponsiveImage
                name="coppia-configura-servizio-matrimonio"
                alt="Una coppia configura insieme il servizio fotografico del matrimonio"
                className="ie-service-media"
                sizes="(min-width: 700px) 25vw, 100vw"
              />
              <div className="ie-service-card-body">
                <span className="ie-service-number">03</span>
                <h3>Album fotografico</h3>
                <p>Un album da custodire nel tempo, realizzato con cura per trasformare il racconto del vostro matrimonio in qualcosa da sfogliare e tramandare.</p>
              </div>
            </article>
            <article className="ie-service-card">
              <ResponsiveImage
                name="abbraccio-sposa-reportage-matrimonio"
                alt="Un abbraccio spontaneo tra una sposa e sua madre"
                className="ie-service-media"
                sizes="(min-width: 700px) 25vw, 100vw"
              />
              <div className="ie-service-card-body">
                <span className="ie-service-number">04</span>
                <h3>Poster Experience</h3>
                <p>Tre immagini del vostro matrimonio diventano stampe da vivere anche ogni giorno, fuori dall’album e fuori dallo schermo.</p>
              </div>
            </article>
          </div>
          <p className="ie-services-extra">Nel configuratore potete anche aggiungere esperienze come Foto Invitati, SelfieBooth, Wedding Trailer, Anteprima, Post-wedding o consegna rapida.</p>
          <a href={configuratorUrl} className="ie-cta" onClick={() => goConfigure('services')} style={{ marginTop: '2.5rem' }}>
            Scoprite Image Experience
          </a>
        </div>
      </section>

      <section className="ie-section ie-section--soft" aria-labelledby="images-title">
        <div className="ie-shell">
          <div className="ie-copy">
            <span className="ie-kicker">Prima del prezzo</span>
            <h2 id="images-title">Dovete riconoscervi nelle immagini.</h2>
            <p>Una fotografia può essere tecnicamente perfetta e non appartenervi. Prima di confrontare i preventivi, guardate le storie. Chiedetevi: ci immaginiamo dentro queste fotografie?</p>
          </div>
          <div className="ie-gallery" style={{ marginTop: '3rem' }}>
            <figure>
              <ResponsiveImage name="abbraccio-sposa-reportage-matrimonio" alt="Un abbraccio spontaneo tra una sposa e sua madre" sizes="(min-width: 700px) 36vw, 100vw" />
              <figcaption>Presenza, non posa</figcaption>
            </figure>
            <figure>
              <ResponsiveImage name="coppia-sceglie-fotografie-matrimonio" alt="Una coppia osserva insieme una selezione di fotografie di matrimonio" sizes="(min-width: 700px) 28vw, 50vw" />
              <figcaption>Scegliere insieme</figcaption>
            </figure>
            <figure>
              <ResponsiveImage name="festa-ricevimento-matrimonio" alt="Gli sposi ballano con gli invitati durante la festa di matrimonio" sizes="(min-width: 700px) 30vw, 50vw" />
              <figcaption>La parte imprevista</figcaption>
            </figure>
          </div>
          <a href="/portfolio/matrimonio" className="ie-cta" style={{ marginTop: '2rem' }} onClick={portfolioClick}>Guarda il portfolio matrimonio</a>
        </div>
      </section>

      <section className="ie-section" aria-labelledby="yes-title">
        <div className="ie-shell">
          <span className="ie-kicker">Il nostro criterio</span>
          <h2 id="yes-title">Tre sì prima del preventivo.</h2>
          <div className="ie-sies">
            <div className="ie-si"><b>01</b><span>Sì, mi riconosco nelle immagini.</span></div>
            <div className="ie-si"><b>02</b><span>Sì, ho capito cosa sto scegliendo.</span></div>
            <div className="ie-si"><b>03</b><span>Sì, mi fido delle persone che saranno con noi.</span></div>
          </div>
          <p style={{ marginTop: '2rem', maxWidth: '480px', color: 'var(--muted-ink)' }}>Solo dopo questi tre sì il prezzo acquista davvero significato.</p>
        </div>
      </section>

      {realWeddings.length > 0 && (
        <section className="ie-section ie-real-weddings" aria-labelledby="real-weddings-title">
          <div className="ie-shell">
            <div className="ie-copy">
              <span className="ie-kicker">Storie vere</span>
              <h2 id="real-weddings-title">Prima di scegliere, guardate come raccontiamo.</h2>
              <p>Ogni matrimonio ha il suo ritmo. Nei nostri Real Wedding potete incontrare persone, luoghi e gesti reali, prima ancora di immaginare il vostro racconto.</p>
            </div>
            <div className="ie-real-wedding-grid">
              {realWeddings.map(story => (
                <a key={story.slug} href={`/real-wedding/${encodeURIComponent(story.slug)}`} className="ie-real-wedding-card">
                  {story.coverImage && (
                    <img src={story.coverImage} alt="" loading="lazy" />
                  )}
                  <span className="ie-real-wedding-body">
                    <strong>{story.title}</strong>
                    <span>Leggi il Real Wedding <span aria-hidden="true">↗</span></span>
                  </span>
                </a>
              ))}
            </div>
            <div className="ie-proof">
              <p>Ci trovate anche su <strong>Matrimonio.com</strong>, dove potete leggere le esperienze delle coppie che ci hanno scelto.</p>
              <a href="https://www.matrimonio.com/fotografo-matrimonio/image-studio-fotografico--e149790" target="_blank" rel="noopener noreferrer">Vedi il profilo su Matrimonio.com <span aria-hidden="true">↗</span></a>
            </div>
          </div>
        </section>
      )}

      <section className="ie-section ie-fair" aria-labelledby="fair-title">
        <ResponsiveImage
          name="coppia-visita-fiera-sposi"
          alt=""
          className="ie-fair-media"
          sizes="100vw"
        />
        <div className="ie-shell ie-grid">
          <div><span className="ie-kicker">Una scelta consapevole</span><h2 id="fair-title">Quest'anno non saremo in fiera. Ma non saremo meno presenti.</h2></div>
          <div className="ie-copy"><p>Le fiere restano un ottimo luogo per raccogliere idee, conoscere professionisti e iniziare a costruire il matrimonio. Dopo quattro anni abbiamo deciso di sperimentare qualcosa di diverso.</p><p className="ie-statement">Non uno stand per pochi giorni.<br /><em>Un percorso accessibile tutto l'anno.</em></p></div>
        </div>
      </section>

      <section className="ie-section" aria-labelledby="calm-title">
        <div className="ie-shell ie-calm">
          <div className="ie-copy"><span className="ie-kicker">Senza pressione</span><h2 id="calm-title">Guardate. Confrontate. Configurate. Poi parliamone.</h2></div>
          <p className="ie-statement">Nessuna decisione da prendere in dieci minuti.<br /><em>Tornate quando volete.</em></p>
        </div>
      </section>

      <section className="ie-final" aria-labelledby="final-title">
        <h2 id="final-title">Il matrimonio è vostro.<br /><em>Anche il servizio dovrebbe esserlo.</em></h2>
        <p>Image Experience parte da 2.200 €. Scoprite le possibilità, scegliete ciò che vi rappresenta e costruite una prima configurazione del vostro matrimonio.</p>
        <a href={configuratorUrl} className="ie-cta" onClick={() => goConfigure('footer')}>Configura il tuo servizio</a>
      </section>

      <footer className="ie-shell ie-footer">
        <div className="ie-footer-inner">
          <span>© {new Date().getFullYear()} {studioName}</span>
          <nav aria-label="Informazioni legali e contatti">
            <a href="/privacy">Privacy</a>
            <a href="/cookie-policy">Cookie</a>
            <a href="/terms">Termini</a>
            <a href="/gdpr">GDPR</a>
            {studioSettings.phone && <a href={`tel:${studioSettings.phone}`}>{studioSettings.phone}</a>}
            {studioSettings.email && <a href={`mailto:${studioSettings.email}`}>Email</a>}
          </nav>
        </div>
      </footer>
      {heroPassed && (
        <div className="ie-sticky">
          <a href={configuratorUrl} className="ie-cta" onClick={() => goConfigure('sticky_mobile')}>
            Configura il tuo servizio · da 2.200 €
          </a>
        </div>
      )}
    </main>
  );
}