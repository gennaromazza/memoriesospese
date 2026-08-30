import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import {
  ArrowDown,
  Check,
  Heart,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Search,
  Send,
  Smartphone,
  X,
} from 'lucide-react';
import Navigation from '@/components/Navigation';
import Footer from '@/components/Footer';
import StudioLogo from '@/components/StudioLogo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
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
  searchPrintFormats,
  type PrintPriceRow,
} from '@shared/print-service-content';

const FALLBACK_PHONE = '+39 334 710 3142';
const FALLBACK_EMAIL = 'info@memoriesospese.it';
const BASE_URL = 'https://imagestudiofotografico.com';

const formatCards = [
  {
    title: '10×15 classico',
    price: 'da €0,20',
    description: 'Il formato più versatile per album, scatole dei ricordi e fotografie da regalare.',
    tag: 'Più scelto',
    image: '/images/print-service/printed-memories-table.jpg',
    imageAlt: 'Stampe fotografiche reali disposte su un tavolo in legno',
  },
  {
    title: 'Polaroid 10×9',
    price: '50 foto · €9,90',
    description: 'Bordo iconico per pareti, fili con mollette, dediche e piccoli regali.',
    tag: 'Idea creativa',
    image: '/images/print-service/travel-polaroid-prints.jpg',
    imageAlt: 'Fotografie di viaggio reali stampate in stile Polaroid',
  },
  {
    title: '20×30 e oltre',
    price: 'da €2,00',
    description: 'Per dare spazio a un panorama, un ritratto o alla fotografia simbolo della vacanza.',
    tag: 'Da parete',
    image: '/images/print-service/family-vacation-beach.jpg',
    imageAlt: 'Famiglia davanti al mare durante una vacanza estiva',
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

interface PriceBreakdownProps {
  row: PrintPriceRow;
  quantityHeaders: string[];
}

function PriceBreakdown({ row, quantityHeaders }: PriceBreakdownProps) {
  return (
    <dl className="grid gap-2 border-t border-sage/10 bg-off-white/60 p-4 sm:grid-cols-2">
      {quantityHeaders.map((quantity, index) => (
        <div key={`${row.format}-${quantity}`} className="flex items-center justify-between gap-4 rounded-xl bg-white px-4 py-3 shadow-sm">
          <dt className="text-xs font-medium text-blue-gray/55">{quantity} foto</dt>
          <dd className="font-semibold tabular-nums text-blue-gray">{row.prices[index]}</dd>
        </div>
      ))}
    </dl>
  );
}

function PriceFormatDisclosure({ row, quantityHeaders }: PriceBreakdownProps) {
  const lowestPrice = row.prices[row.prices.length - 1];
  const isPolaroidPackage = row.format.toLocaleLowerCase('it-IT').includes('polaroid');

  return (
    <details className="group overflow-hidden rounded-2xl border border-sage/15 bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 marker:hidden">
        <span>
          <span className="block text-lg font-semibold text-blue-gray">{row.format} cm</span>
          <span className="mt-0.5 block text-xs text-blue-gray/50">
            {isPolaroidPackage ? `confezione da 50 foto · ${lowestPrice}` : `a partire da ${lowestPrice} per stampa`}
          </span>
        </span>
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-sage/10 text-lg text-dark-sage transition-transform duration-200 group-open:rotate-45" aria-hidden="true">+</span>
      </summary>
      <PriceBreakdown row={row} quantityHeaders={quantityHeaders} />
    </details>
  );
}

export default function StampaFotoAversaPage() {
  const { studioSettings } = useStudio();
  const [formatQuery, setFormatQuery] = useState('');
  const formatResults = useMemo(() => searchPrintFormats(formatQuery), [formatQuery]);
  const hasFormatQuery = formatQuery.trim().length > 0;

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

            <div className="relative mx-auto h-[430px] w-full max-w-[540px] sm:h-[510px]" aria-label="Fotografie vere di una vacanza e stampe in stile Polaroid">
              <figure className="absolute inset-x-4 top-3 overflow-hidden rounded-[2rem] border-[10px] border-white bg-white shadow-2xl sm:inset-x-8 sm:top-4">
                <img
                  src={createUrl('/images/print-service/family-vacation-beach.jpg')}
                  alt="Famiglia che guarda il mare durante una vacanza"
                  className="h-72 w-full object-cover sm:h-80"
                  fetchPriority="high"
                />
                <figcaption className="flex items-center justify-between gap-4 bg-white px-4 py-3 text-blue-gray">
                  <span className="font-playfair text-lg italic">La fotografia simbolo dell’estate</span>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-terracotta">Stampa 20×30</span>
                </figcaption>
              </figure>

              <figure className="absolute bottom-1 right-3 w-[52%] rotate-3 rounded-sm bg-white p-3 shadow-2xl sm:right-1 sm:w-[50%]">
                <img
                  src={createUrl('/images/print-service/travel-polaroid-prints.jpg')}
                  alt="Fotografie vere di viaggio stampate in stile Polaroid"
                  className="h-44 w-full object-cover object-center sm:h-52"
                  loading="eager"
                />
                <figcaption className="pt-3 text-center font-playfair text-lg italic text-blue-gray">Ricordi da tenere tra le mani</figcaption>
              </figure>

              <div className="absolute bottom-12 left-2 max-w-[190px] -rotate-3 rounded-2xl border border-white/20 bg-blue-gray/90 px-5 py-4 text-white shadow-xl backdrop-blur sm:left-0 sm:max-w-[220px]">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cream">Foto vere. Carta vera.</p>
                <p className="mt-2 font-playfair text-xl leading-tight">La vacanza non resta più nascosta nel telefono.</p>
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
                return (
                  <article key={card.title} className="group overflow-hidden rounded-[2rem] border border-sage/15 bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl">
                    <div className="relative h-52 overflow-hidden">
                      <img
                        src={createUrl(card.image)}
                        alt={card.imageAlt}
                        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                        loading="lazy"
                      />
                      <span className="absolute right-4 top-4 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-blue-gray shadow-sm backdrop-blur">{card.tag}</span>
                    </div>
                    <div className="p-7">
                      <h3 className="text-2xl font-semibold text-blue-gray">{card.title}</h3>
                      <p className="mt-2 text-xl font-semibold text-terracotta">{card.price}</p>
                      <p className="mt-4 leading-relaxed text-blue-gray/65">{card.description}</p>
                    </div>
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
            <div className="relative min-h-[430px] overflow-hidden rounded-[2.5rem] shadow-xl">
              <img
                src={createUrl('/images/print-service/printed-memories-table.jpg')}
                alt="Fotografie stampate realmente e appoggiate su un tavolo"
                className="absolute inset-0 h-full w-full object-cover"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-blue-gray/85 via-blue-gray/10 to-transparent" aria-hidden="true" />
              <div className="absolute inset-x-4 bottom-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-white/95 p-5 shadow-lg backdrop-blur">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-terracotta">Carta lucida</p>
                  <p className="mt-2 font-playfair text-2xl text-blue-gray">Colore, luce, contrasto.</p>
                </div>
                <div className="rounded-2xl bg-white/95 p-5 shadow-lg backdrop-blur">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-dark-sage">Carta opaca</p>
                  <p className="mt-2 font-playfair text-2xl text-blue-gray">Tatto, eleganza, niente riflessi.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="listino" className="scroll-mt-20 bg-cream/35 px-4 py-20 sm:py-24">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-3xl text-center">
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-terracotta">Prezzi chiari, ricordi senza misura</span>
              <h2 className="mt-4 text-3xl font-semibold text-blue-gray sm:text-5xl">Listino stampe fotografiche</h2>
              <p className="mt-5 text-blue-gray/70">
                Cerca direttamente il formato che ti serve oppure apri una categoria. I prezzi sono per singola stampa e diminuiscono in base alla quantità.
              </p>
            </div>

            <div className="mx-auto mt-10 max-w-3xl rounded-[2rem] border border-sage/20 bg-white p-5 shadow-sm sm:p-7">
              <label htmlFor="format-search" className="text-sm font-semibold text-blue-gray">Quale formato stai cercando?</label>
              <div className="relative mt-3">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-sage" aria-hidden="true" />
                <Input
                  id="format-search"
                  type="search"
                  inputMode="search"
                  value={formatQuery}
                  onChange={(event) => setFormatQuery(event.target.value)}
                  placeholder="Es. 10×15, 20×30, 50×70"
                  className="h-14 rounded-2xl border-sage/25 bg-off-white/50 pl-12 pr-12 text-base text-blue-gray placeholder:text-blue-gray/35 focus-visible:ring-sage"
                  autoComplete="off"
                />
                {hasFormatQuery && (
                  <button
                    type="button"
                    onClick={() => setFormatQuery('')}
                    className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-blue-gray/45 transition-colors hover:bg-sage/10 hover:text-blue-gray focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
                    aria-label="Cancella la ricerca del formato"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-blue-gray/55">
                <span>Prova:</span>
                {['10×15', '13×18', '20×30', '50×70', 'Polaroid'].map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setFormatQuery(suggestion)}
                    className="rounded-full border border-sage/20 bg-off-white px-3 py-1.5 font-semibold text-blue-gray transition-colors hover:border-sage hover:bg-sage/10"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-8" aria-live="polite">
              {hasFormatQuery ? (
                formatResults.length > 0 ? (
                  <div>
                    <p className="mb-4 text-sm font-medium text-blue-gray/65">
                      {formatResults.length === 1 ? 'Formato trovato' : `${formatResults.length} formati trovati`} per “{formatQuery}”
                    </p>
                    <div className="grid gap-4 md:grid-cols-2">
                      {formatResults.map((result) => (
                        <article key={`${result.tableId}-${result.row.format}`} className="overflow-hidden rounded-2xl border border-sage/20 bg-white shadow-sm">
                          <div className="flex items-start justify-between gap-4 px-5 py-4">
                            <div>
                              <h3 className="text-xl font-semibold text-blue-gray">{result.row.format} cm</h3>
                              <p className="mt-1 text-xs text-blue-gray/50">{result.tableTitle}</p>
                            </div>
                            <span className="rounded-full bg-sage/10 px-3 py-1 text-xs font-semibold text-dark-sage">Prezzi per quantità</span>
                          </div>
                          <PriceBreakdown row={result.row} quantityHeaders={result.quantityHeaders} />
                        </article>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-[2rem] border border-dashed border-sage/30 bg-white px-6 py-10 text-center">
                    <p className="text-lg font-semibold text-blue-gray">Nessun formato corrisponde a “{formatQuery}”.</p>
                    <p className="mt-2 text-sm text-blue-gray/55">Prova a scrivere solo le misure, per esempio 30×40, oppure consulta le categorie.</p>
                    <Button variant="outline" onClick={() => setFormatQuery('')} className="mt-5 rounded-full border-sage/30 text-blue-gray hover:bg-sage/10">
                      Mostra tutti i formati
                    </Button>
                  </div>
                )
              ) : (
                <Accordion type="single" collapsible defaultValue="classici" className="space-y-4">
                  {PRINT_PRICE_TABLES.map((table) => (
                    <AccordionItem key={table.id} value={table.id} className="overflow-hidden rounded-[2rem] border border-sage/20 bg-white px-0 shadow-sm">
                      <AccordionTrigger className="px-6 py-5 text-left hover:no-underline sm:px-8">
                        <span className="pr-4">
                          <span className="block text-xl font-semibold text-blue-gray sm:text-2xl">{table.title}</span>
                          <span className="mt-1 block text-sm font-normal leading-relaxed text-blue-gray/55">{table.rows.length} formati · {table.description}</span>
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="border-t border-sage/10 px-4 pb-5 pt-5 sm:px-6">
                        <div className="grid gap-3 md:grid-cols-2">
                          {table.rows.map((row) => (
                            <PriceFormatDisclosure key={row.format} row={row} quantityHeaders={table.quantityHeaders} />
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
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

