import { useEffect } from 'react';
import { Link } from 'wouter';
import {
  ArrowDown,
  Check,
  Heart,
  Image as ImageIcon,
  Mail,
  MapPin,
  Maximize2,
  MessageCircle,
  Phone,
  Send,
  Smartphone,
  Sparkles,
} from 'lucide-react';
import Navigation from '@/components/Navigation';
import Footer from '@/components/Footer';
import StudioLogo from '@/components/StudioLogo';
import { Button } from '@/components/ui/button';
import { useSEO } from '@/hooks/useSEO';
import { useStudio } from '@/context/StudioContext';
import { createUrl } from '@/lib/basePath';
import { trackEvent } from '@/lib/analytics';
import { getWhatsAppLink } from '@shared/phone-utils';
import {
  PRINT_FAQS,
  PRINT_PRICE_TABLES,
  PRINT_PRICE_UPDATED_AT,
  PRINT_SERVICE_PATH,
  PRINT_SERVICE_SEO,
  PRINT_WHATSAPP_MESSAGE,
  countPrintFormats,
} from '@shared/print-service-content';

const FALLBACK_PHONE = '+39 334 710 3142';
const FALLBACK_EMAIL = 'info@memoriesospese.it';
const BASE_URL = 'https://imagestudiofotografico.com';

const formatCards = [
  {
    icon: ImageIcon,
    title: '10×15 classico',
    price: 'da €0,20',
    description: 'Il formato più versatile per album, scatole dei ricordi e fotografie da regalare.',
    tag: 'Più scelto',
  },
  {
    icon: Sparkles,
    title: 'Polaroid 10×9',
    price: '50 foto · €9,90',
    description: 'Bordo iconico per pareti, fili con mollette, dediche e piccoli regali.',
    tag: 'Idea creativa',
  },
  {
    icon: Maximize2,
    title: '20×30 e oltre',
    price: 'da €2,00',
    description: 'Per dare spazio a un panorama, un ritratto o alla fotografia simbolo della vacanza.',
    tag: 'Da parete',
  },
];

const steps = [
  {
    number: '01',
    icon: Heart,
    title: 'Scegli i ricordi',
    description: 'Seleziona dal telefono le fotografie che vuoi finalmente rivedere su carta.',
  },
  {
    number: '02',
    icon: Smartphone,
    title: 'Scrivici su WhatsApp',
    description: 'Indica quantità, formato e preferenza tra carta lucida oppure opaca.',
  },
  {
    number: '03',
    icon: Send,
    title: 'Invia le fotografie',
    description: 'Riceverai le istruzioni più comode per trasferire i file senza perdere qualità.',
  },
  {
    number: '04',
    icon: Check,
    title: 'Conferma la stampa',
    description: 'Concorda con lo studio prezzo finale, tempi e modalità di ritiro o consegna.',
  },
];

export default function StampaFotoAversaPage() {
  const { studioSettings } = useStudio();

  useSEO({
    title: PRINT_SERVICE_SEO.title,
    description: PRINT_SERVICE_SEO.description,
    canonical: PRINT_SERVICE_PATH,
    keywords: PRINT_SERVICE_SEO.keywords,
  });

  const phone = studioSettings.whatsapp || studioSettings.phone || FALLBACK_PHONE;
  const displayPhone = studioSettings.whatsapp || studioSettings.phone || FALLBACK_PHONE;
  const email = studioSettings.email || FALLBACK_EMAIL;
  const address = studioSettings.address || 'Aversa (CE)';
  const studioName = studioSettings.name || 'Image Studio Fotografico';
  const whatsappLink = getWhatsAppLink(phone, PRINT_WHATSAPP_MESSAGE);

  useEffect(() => {
    const canonical = `${BASE_URL}${PRINT_SERVICE_PATH}`;
    const jsonLd = [
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE_URL}/` },
          { '@type': 'ListItem', position: 2, name: 'Stampa foto ad Aversa', item: canonical },
        ],
      },
      {
        '@context': 'https://schema.org',
        '@type': 'Service',
        name: 'Stampa foto ad Aversa',
        description: PRINT_SERVICE_SEO.description,
        url: canonical,
        serviceType: 'Stampa fotografica digitale',
        provider: {
          '@type': 'LocalBusiness',
          name: studioName,
          telephone: displayPhone,
          email,
          address: {
            '@type': 'PostalAddress',
            streetAddress: studioSettings.address || undefined,
            addressLocality: studioSettings.fiscalComune || 'Aversa',
            addressRegion: studioSettings.fiscalProvincia || 'CE',
            addressCountry: 'IT',
          },
        },
        areaServed: ['Aversa', 'Napoli', 'Caserta', 'Agro Aversano'],
        offers: {
          '@type': 'AggregateOffer',
          priceCurrency: 'EUR',
          lowPrice: '0.20',
          highPrice: '17.00',
          offerCount: countPrintFormats(),
        },
      },
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: PRINT_FAQS.map((faq) => ({
          '@type': 'Question',
          name: faq.question,
          acceptedAnswer: { '@type': 'Answer', text: faq.answer },
        })),
      },
    ];

    let script = document.querySelector<HTMLScriptElement>('script[data-print-service-schema]');
    if (!script) {
      script = document.createElement('script');
      script.type = 'application/ld+json';
      script.dataset.printServiceSchema = 'true';
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(jsonLd);

    return () => {
      document.querySelector('script[data-print-service-schema]')?.remove();
    };
  }, [displayPhone, email, studioName, studioSettings.address, studioSettings.fiscalComune, studioSettings.fiscalProvincia]);

  const trackWhatsApp = (location: string) => {
    trackEvent('click_whatsapp', 'stampa_foto', location);
  };

  const trackPriceList = () => {
    trackEvent('view_price_list', 'stampa_foto', 'hero');
  };

  return (
    <div className="min-h-screen bg-off-white text-blue-gray font-sans overflow-x-hidden">
      <Navigation />

      <main>
        <section className="relative isolate overflow-hidden bg-gradient-to-br from-blue-gray via-[#587784] to-dark-sage px-4 pb-20 pt-32 text-white sm:pb-24 sm:pt-36 lg:pb-28">
          <div className="absolute -left-28 top-24 h-72 w-72 rounded-full bg-terracotta/20 blur-3xl" aria-hidden="true" />
          <div className="absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-cream/20 blur-3xl" aria-hidden="true" />

          <div className="relative mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="max-w-3xl">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cream backdrop-blur-sm">
                <MapPin className="h-4 w-4" />
                Aversa · Napoli · Caserta
              </div>

              <h1 className="text-4xl font-semibold leading-[1.08] sm:text-5xl lg:text-7xl">
                Le foto della tua <span className="text-cream italic">vacanza</span> meritano più della memoria del telefono.
              </h1>

              <p className="mt-7 max-w-2xl text-lg leading-relaxed text-white/80 sm:text-xl">
                Trasforma fotografie, sorrisi e panorami in stampe da toccare, regalare e vivere ogni giorno. Formati classici, grandi e stile Polaroid, con l’assistenza di Image Studio.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <a href={whatsappLink} target="_blank" rel="noopener noreferrer" onClick={() => trackWhatsApp('hero')}>
                  <Button className="w-full rounded-full bg-terracotta px-7 py-6 text-base text-white shadow-lg hover:bg-terracotta/90 sm:w-auto">
                    <MessageCircle className="mr-2 h-5 w-5" />
                    Stampa i miei ricordi
                  </Button>
                </a>
                <a href="#listino" onClick={trackPriceList}>
                  <Button variant="outline" className="w-full rounded-full border-white/40 bg-white/5 px-7 py-6 text-base text-white hover:bg-white/15 hover:text-white sm:w-auto">
                    Vedi prezzi e formati
                    <ArrowDown className="ml-2 h-5 w-5" />
                  </Button>
                </a>
              </div>

              <div className="mt-10 flex flex-wrap gap-x-7 gap-y-3 text-sm text-white/70">
                <span className="flex items-center gap-2"><Check className="h-4 w-4 text-cream" /> Carta lucida o opaca</span>
                <span className="flex items-center gap-2"><Check className="h-4 w-4 text-cream" /> {countPrintFormats()} formati</span>
                <span className="flex items-center gap-2"><Check className="h-4 w-4 text-cream" /> Assistenza locale</span>
              </div>
            </div>

            <div className="relative mx-auto h-[430px] w-full max-w-[520px] sm:h-[500px]" aria-label="Composizione di stampe fotografiche Image Studio">
              <div className="absolute left-4 top-14 h-72 w-56 -rotate-6 rounded-sm bg-cream p-4 shadow-2xl sm:left-8 sm:h-80 sm:w-64">
                <div className="flex h-full flex-col justify-between bg-terracotta/15 p-5 text-blue-gray">
                  <Sparkles className="h-9 w-9 text-terracotta" />
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-[0.22em]">Estate 2026</span>
                    <p className="mt-2 font-playfair text-3xl leading-tight">Ricordi da tenere tra le mani.</p>
                  </div>
                </div>
              </div>

              <div className="absolute right-3 top-2 h-72 w-56 rotate-6 rounded-sm bg-white p-3 shadow-2xl sm:right-6 sm:h-80 sm:w-64">
                <img
                  src={createUrl('/1200x630px.jpg')}
                  alt="Una fotografia firmata Image Studio pronta per la stampa"
                  className="h-[77%] w-full object-cover"
                />
                <div className="px-2 pt-4 text-center font-playfair text-xl italic text-blue-gray">Memorie Sospese</div>
              </div>

              <div className="absolute bottom-3 right-14 w-64 -rotate-2 rounded-sm bg-white p-3 shadow-2xl sm:right-20 sm:w-72">
                <div className="flex h-28 items-center justify-center bg-sage/20 text-center text-blue-gray">
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-[0.25em] text-dark-sage">Formato Polaroid</span>
                    <p className="mt-1 font-playfair text-2xl">Una foto. Una storia.</p>
                  </div>
                </div>
                <p className="pt-3 text-center text-sm font-medium text-blue-gray/75">Aversa · Image Studio</p>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-sage/15 bg-white px-4 py-5">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-center sm:flex-row sm:text-left">
            <p className="font-playfair text-xl text-blue-gray">Il telefono conserva i file. Una stampa conserva il momento.</p>
            <a href="#come-funziona" className="text-sm font-semibold text-terracotta hover:underline">Scopri come ordinare →</a>
          </div>
        </section>

        <section className="bg-off-white px-4 py-20 sm:py-24">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-3xl text-center">
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-terracotta">Non hai un album. Hai un archivio.</span>
              <h2 className="mt-4 text-3xl font-semibold leading-tight text-blue-gray sm:text-5xl">Quante volte hai davvero riguardato le foto dell’ultima vacanza?</h2>
              <p className="mt-6 text-lg leading-relaxed text-blue-gray/70">
                Tra screenshot, chat e nuove immagini, i ricordi più belli scendono ogni giorno più in basso nella galleria. Stampare significa riportarli davanti agli occhi: in un album, in una cornice, su una parete o dentro un regalo.
              </p>
            </div>

            <div className="mt-14 grid gap-6 md:grid-cols-3">
              {formatCards.map((card) => {
                const Icon = card.icon;
                return (
                  <article key={card.title} className="group rounded-[2rem] border border-sage/15 bg-white p-7 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sage/15 text-dark-sage">
                        <Icon className="h-6 w-6" />
                      </div>
                      <span className="rounded-full bg-cream/70 px-3 py-1 text-xs font-semibold text-blue-gray/70">{card.tag}</span>
                    </div>
                    <h3 className="mt-7 text-2xl font-semibold text-blue-gray">{card.title}</h3>
                    <p className="mt-2 text-xl font-semibold text-terracotta">{card.price}</p>
                    <p className="mt-4 leading-relaxed text-blue-gray/65">{card.description}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="bg-white px-4 py-20 sm:py-24">
          <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-terracotta">Scegli la carta</span>
              <h2 className="mt-4 text-3xl font-semibold text-blue-gray sm:text-5xl">Lucida per accendere i colori. Opaca per lasciare parlare l’immagine.</h2>
              <p className="mt-6 text-lg leading-relaxed text-blue-gray/70">
                Mare, cieli e tramonti acquistano brillantezza sulla carta lucida. Ritratti, fotografie in cornice e immagini da maneggiare spesso trovano eleganza nella finitura opaca, che riduce riflessi e impronte.
              </p>
              <p className="mt-5 text-blue-gray/70">Non devi decidere da solo: raccontaci dove metterai le fotografie e ti aiuteremo a scegliere.</p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="rounded-[2rem] bg-gradient-to-br from-terracotta/20 to-cream p-7">
                <div className="mb-20 h-2 w-16 rounded-full bg-terracotta" />
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-terracotta">Carta lucida</p>
                <p className="mt-3 font-playfair text-3xl text-blue-gray">Colore, luce, contrasto.</p>
              </div>
              <div className="rounded-[2rem] bg-gradient-to-br from-sage/25 to-light-mint p-7 sm:mt-10">
                <div className="mb-20 h-2 w-16 rounded-full bg-dark-sage" />
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-dark-sage">Carta opaca</p>
                <p className="mt-3 font-playfair text-3xl text-blue-gray">Tatto, eleganza, niente riflessi.</p>
              </div>
            </div>
          </div>
        </section>

        <section id="listino" className="scroll-mt-20 bg-cream/35 px-4 py-20 sm:py-24">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-3xl text-center">
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-terracotta">Prezzi chiari, ricordi senza misura</span>
              <h2 className="mt-4 text-3xl font-semibold text-blue-gray sm:text-5xl">Listino stampe fotografiche</h2>
              <p className="mt-5 text-blue-gray/70">
                I prezzi sono per singola stampa e diminuiscono in base alla quantità. Tutti i formati sono espressi in centimetri.
              </p>
            </div>

            <div className="mt-12 space-y-10">
              {PRINT_PRICE_TABLES.map((table) => (
                <section key={table.id} aria-labelledby={`prezzi-${table.id}`} className="overflow-hidden rounded-[2rem] border border-sage/20 bg-white shadow-sm">
                  <div className="border-b border-sage/15 px-6 py-6 sm:px-8">
                    <h3 id={`prezzi-${table.id}`} className="text-2xl font-semibold text-blue-gray">{table.title}</h3>
                    <p className="mt-2 text-sm text-blue-gray/60">{table.description}</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[680px] border-collapse text-left text-sm">
                      <caption className="sr-only">Prezzi per {table.title.toLowerCase()}, suddivisi per quantità</caption>
                      <thead>
                        <tr className="bg-sage/10 text-blue-gray">
                          <th scope="col" className="sticky left-0 z-10 bg-[#eef2eb] px-6 py-4 font-semibold sm:px-8">Formato</th>
                          {table.quantityHeaders.map((quantity) => (
                            <th key={quantity} scope="col" className="px-5 py-4 text-right font-semibold">{quantity} foto</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {table.rows.map((row, rowIndex) => (
                          <tr key={row.format} className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-off-white/60'}>
                            <th scope="row" className={`sticky left-0 z-10 px-6 py-4 font-semibold text-blue-gray sm:px-8 ${rowIndex % 2 === 0 ? 'bg-white' : 'bg-[#f6f6f2]'}`}>
                              {row.format}
                            </th>
                            {row.prices.map((price, priceIndex) => (
                              <td key={`${row.format}-${priceIndex}`} className="px-5 py-4 text-right tabular-nums text-blue-gray/75">{price}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}
            </div>

            <div className="mt-8 rounded-2xl border border-terracotta/20 bg-terracotta/10 p-5 text-sm leading-relaxed text-blue-gray/75">
              <strong className="text-blue-gray">Polaroid Wide 10×9:</strong> confezione promozionale da 50 fotografie a €9,90, salvo disponibilità. Listino aggiornato al {PRINT_PRICE_UPDATED_AT}. Tempi e modalità di ritiro o consegna vengono confermati prima dell’ordine.
            </div>

            <div className="mt-9 text-center">
              <a href={whatsappLink} target="_blank" rel="noopener noreferrer" onClick={() => trackWhatsApp('listino')}>
                <Button className="rounded-full bg-terracotta px-8 py-6 text-base text-white hover:bg-terracotta/90">
                  <MessageCircle className="mr-2 h-5 w-5" />
                  Chiedi il prezzo del tuo ordine
                </Button>
              </a>
            </div>
          </div>
        </section>

        <section id="come-funziona" className="scroll-mt-20 bg-blue-gray px-4 py-20 text-white sm:py-24">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-3xl">
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-cream">Dal telefono alla carta</span>
              <h2 className="mt-4 text-3xl font-semibold sm:text-5xl">Quattro passaggi. Nessun dubbio sul formato.</h2>
            </div>

            <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
              {steps.map((step) => {
                const Icon = step.icon;
                return (
                  <article key={step.number} className="rounded-[2rem] border border-white/15 bg-white/10 p-6 backdrop-blur-sm">
                    <div className="flex items-center justify-between">
                      <Icon className="h-6 w-6 text-cream" />
                      <span className="font-playfair text-3xl text-white/25">{step.number}</span>
                    </div>
                    <h3 className="mt-8 text-xl font-semibold">{step.title}</h3>
                    <p className="mt-3 text-sm leading-relaxed text-white/65">{step.description}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="bg-white px-4 py-20 sm:py-24">
          <div className="mx-auto grid max-w-6xl overflow-hidden rounded-[2.5rem] border border-sage/20 bg-off-white lg:grid-cols-[1.05fr_0.95fr]">
            <div className="p-8 sm:p-12">
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-terracotta">Vicino a te</span>
              <h2 className="mt-4 text-3xl font-semibold text-blue-gray sm:text-5xl">Stampa foto ad Aversa, per Napoli e Caserta.</h2>
              <p className="mt-6 leading-relaxed text-blue-gray/70">
                Memorie Sospese nasce per dare valore alle fotografie e alle storie che contengono. Dietro la piattaforma c’è {studioName}: uno studio vero, con persone a cui chiedere consiglio prima di stampare.
              </p>
              <div className="mt-8 space-y-4 text-sm text-blue-gray/75">
                <div className="flex items-start gap-3"><MapPin className="mt-0.5 h-5 w-5 flex-none text-terracotta" /><span>{address}</span></div>
                <a href={`tel:${displayPhone}`} className="flex items-center gap-3 hover:text-terracotta"><Phone className="h-5 w-5 flex-none text-terracotta" />{displayPhone}</a>
                <a href={`mailto:${email}`} className="flex items-center gap-3 hover:text-terracotta"><Mail className="h-5 w-5 flex-none text-terracotta" />{email}</a>
              </div>
            </div>
            <div className="flex min-h-[360px] flex-col items-center justify-center bg-gradient-to-br from-sage/25 via-cream/60 to-terracotta/20 p-8 text-center sm:p-12">
              <StudioLogo showLink={false} imgClassName="h-16 w-auto" textClassName="text-3xl font-playfair text-blue-gray" />
              <p className="mt-7 max-w-sm font-playfair text-2xl leading-relaxed text-blue-gray">“Le fotografie più belle non devono restare nascoste in una cartella.”</p>
              <a href={whatsappLink} target="_blank" rel="noopener noreferrer" className="mt-8" onClick={() => trackWhatsApp('contatti')}>
                <Button className="rounded-full bg-[#25D366] px-7 py-6 text-base text-white hover:bg-[#1ebe58]">
                  <MessageCircle className="mr-2 h-5 w-5" />
                  {studioSettings.whatsappButtonText || 'Scrivici su WhatsApp'}
                </Button>
              </a>
            </div>
          </div>
        </section>

        <section className="bg-off-white px-4 py-20 sm:py-24">
          <div className="mx-auto max-w-4xl">
            <div className="text-center">
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-terracotta">Prima di stampare</span>
              <h2 className="mt-4 text-3xl font-semibold text-blue-gray sm:text-5xl">Domande frequenti</h2>
            </div>
            <div className="mt-12 space-y-4">
              {PRINT_FAQS.map((faq, index) => (
                <details key={faq.question} className="group rounded-2xl border border-sage/15 bg-white p-6 shadow-sm" open={index === 0}>
                  <summary className="cursor-pointer list-none pr-8 font-semibold text-blue-gray marker:hidden">
                    <span className="flex items-start justify-between gap-4">
                      {faq.question}
                      <span className="text-xl text-terracotta transition-transform group-open:rotate-45" aria-hidden="true">+</span>
                    </span>
                  </summary>
                  <p className="mt-4 max-w-3xl leading-relaxed text-blue-gray/65">{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-terracotta px-4 py-20 text-white sm:py-24">
          <div className="mx-auto max-w-4xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/70">Le hai già scelte?</p>
            <h2 className="mt-4 text-4xl font-semibold sm:text-6xl">Non lasciarle un’altra estate nel telefono.</h2>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-white/80">Scrivici “Voglio stampare i miei ricordi” e raccontaci quante fotografie hai scelto. Ti aiutiamo noi con il resto.</p>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <a href={whatsappLink} target="_blank" rel="noopener noreferrer" onClick={() => trackWhatsApp('finale')}>
                <Button className="w-full rounded-full bg-white px-8 py-6 text-base text-terracotta hover:bg-cream sm:w-auto">
                  <MessageCircle className="mr-2 h-5 w-5" />
                  Stampa i miei ricordi
                </Button>
              </a>
              <Link href="/portfolio">
                <Button variant="outline" className="w-full rounded-full border-white/40 bg-transparent px-8 py-6 text-base text-white hover:bg-white/10 hover:text-white sm:w-auto">
                  Scopri Image Studio
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

