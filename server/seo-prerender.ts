import { Request, Response, NextFunction } from 'express';
import { db } from './firebase-admin';
import { BlogPostStatus } from '../shared/schema';
import { portfolioCategoryContent } from '../shared/portfolio-seo-content';
import {
  PRINT_FAQS,
  PRINT_SERVICE_PATH,
  PRINT_SERVICE_SEO,
} from '../shared/print-service-content';
import {
  WEDDING_HOME_COPY,
  WEDDING_HOME_SEO,
  WEDDING_PORTFOLIO_BREADCRUMB_JSON_LD,
  WEDDING_PORTFOLIO_SEO,
  WEDDING_SERVICE_JSON_LD,
} from '../shared/public-seo-content';
import {
  isKnownClientPath,
  isPrivateClientPath,
  normalizeClientPath,
} from './client-routes';
import {
  canonicalUrl,
  defaultSocialImage,
  firstImageCandidateFromHtml,
  resolveSocialImage,
  staticPageMetadata,
  staticSocialImage,
  type ResolvedSocialImage,
  type SocialImageCandidate,
} from '../shared/social-metadata';

const BASE_URL = 'https://imagestudiofotografico.com';
const OG_IMAGE = defaultSocialImage().url;
// Il prerender è statico e non legge il catalogo Firestore: esclude quindi le
// FAQ che contengono prezzi/quantità, per non pubblicare condizioni obsolete.
const PRINT_SEO_FAQS = PRINT_FAQS.filter(faq => !faq.answer.includes('€'));

const BOT_USER_AGENTS = [
  'googlebot', 'bingbot', 'yandexbot', 'duckduckbot',
  'slurp', 'baiduspider', 'facebot', 'facebookexternalhit',
  'twitterbot', 'linkedinbot', 'whatsapp',
  'gptbot', 'chatgpt-user', 'ccbot', 'anthropic-ai', 'claude-web',
  'perplexitybot', 'bytespider', 'youbot', 'applebot',
  'google-extended', 'ia_archiver', 'semrushbot', 'ahrefsbot',
  'dotbot', 'petalbot', 'mj12bot'
];

function isBot(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  return BOT_USER_AGENTS.some(bot => ua.includes(bot));
}

function isNonPrerenderablePath(path: string): boolean {
  return (
    path.startsWith('/api/') ||
    path.startsWith('/admin') ||
    path.startsWith('/gallery/') ||
    path.startsWith('/view/') ||
    path === '/special-gallery' ||
    path.startsWith('/quote/') ||
    path.startsWith('/preventivo-rapido/') ||
    path.startsWith('/modulo/') ||
    path.startsWith('/fotolibro/') ||
    path.includes('.')
  );
}

interface PageMeta {
  title: string;
  description: string;
  canonical: string;
  ogType?: string;
  keywords?: string;
  ogImage?: string;
  socialImage?: SocialImageCandidate | ResolvedSocialImage;
  jsonLd?: object | object[];
  bodyContent?: string;
}

function getStaticPageMeta(path: string): PageMeta | null {
  const pages: Record<string, PageMeta> = {
    '/': {
      title: WEDDING_HOME_SEO.title,
      description: WEDDING_HOME_SEO.description,
      canonical: `${BASE_URL}/`,
      keywords: WEDDING_HOME_SEO.keywords,
      jsonLd: WEDDING_SERVICE_JSON_LD,
      bodyContent: `
        <img src="${OG_IMAGE}" alt="Sposi davanti a una villa durante un matrimonio in Campania" width="1200" height="630" fetchpriority="high" />
        <h1>${WEDDING_HOME_COPY.heroTitle}</h1>
        <p>${WEDDING_HOME_COPY.heroDescription}</p>
        <h2>${WEDDING_HOME_COPY.portfolioTitle}</h2>
        <p>${WEDDING_HOME_COPY.portfolioDescription}</p>
        <p><a href="${BASE_URL}/portfolio/matrimonio">${WEDDING_HOME_COPY.portfolioCta}</a> | <a href="${BASE_URL}/consulenze">${WEDDING_HOME_COPY.consultationCta}</a></p>
        <h2>Fotografia e video per matrimoni in Campania</h2>
        <p>Image Studio è lo studio fotografico di Gennaro Mazzacane con sede ad Aversa (CE). Con oltre 10 anni di esperienza e 500+ matrimoni documentati, raccontiamo matrimoni ad Aversa, Napoli, Caserta, Salerno e Costiera Amalfitana con reportage fotografico e video iMaGe Vision.</p>
        <h2>${WEDDING_HOME_COPY.secondaryTitle}</h2>
        <p>${WEDDING_HOME_COPY.secondaryDescription}</p>
        <ul>
          <li><a href="${BASE_URL}/portfolio/matrimonio">Portfolio matrimoni</a></li>
          <li><a href="${BASE_URL}/vision">Video matrimoni iMaGe Vision</a></li>
          <li><a href="${BASE_URL}/portfolio/battesimo">Battesimi, comunioni e cresime</a></li>
          <li><a href="${BASE_URL}/portfolio/evento">Eventi, ritratti e famiglia</a></li>
        </ul>
        <p><a href="${BASE_URL}/portfolio">Esplora tutte le categorie del portfolio</a> | <a href="${BASE_URL}/accesso-galleria">Accedi alla tua galleria</a></p>
      `
    },
    '/fotografo-aversa': {
      title: 'Fotografo Aversa | Matrimoni, Battesimi, Cerimonie | Image Studio',
      description: 'Fotografo professionista ad Aversa per matrimoni, battesimi e cerimonie. Gennaro Mazzacane di Image Studio: 10+ anni di esperienza, 500+ matrimoni. Servizi nell\'agro aversano senza costi di trasferta.',
      canonical: `${BASE_URL}/fotografo-aversa`,
      keywords: 'fotografo Aversa, fotografo matrimoni Aversa, fotografo battesimi Aversa, fotografo cerimonie Aversa, fotografo Sant\'Arpino, fotografo Succivo, fotografo Casal di Principe, fotografo agro aversano',
      bodyContent: `
        <h1>Fotografo Aversa - Image Studio | Gennaro Mazzacane</h1>
        <p>Sei alla ricerca di un fotografo professionista ad Aversa per il tuo matrimonio, battesimo o cerimonia? Image Studio, con sede ad Aversa (CE), è il punto di riferimento per la fotografia professionale nell'agro aversano e in tutta la Campania.</p>
        <h2>Fotografo di Matrimonio ad Aversa</h2>
        <p>Gennaro Mazzacane ha documentato oltre 500 matrimoni in tutta la Campania. Specializzato in fotografia matrimoniale emozionale e reportage documentaristico, cattura i momenti autentici della tua giornata speciale con uno stile che unisce eleganza e spontaneità.</p>
        <h2>Servizi Fotografici ad Aversa</h2>
        <ul>
          <li><strong>Fotografia Matrimoni Aversa</strong> - Reportage completo dalla preparazione alla festa</li>
          <li><strong>Fotografia Battesimi Aversa</strong> - Momenti emozionanti della cerimonia e del ricevimento</li>
          <li><strong>Fotografia Comunioni e Cresime</strong> - Ricordi preziosi per tutta la famiglia</li>
          <li><strong>Video Matrimoni (iMaGe Vision)</strong> - Film cinematografici emozionali</li>
          <li><strong>Gallerie Digitali Memorie Sospese</strong> - Accesso online protetto alle tue foto</li>
        </ul>
        <h2>Comuni Serviti nell'Agro Aversano</h2>
        <p>Fotografo disponibile senza costi di trasferta ad Aversa e nei comuni limitrofi: Sant'Arpino, Succivo, Casal di Principe, Frignano, Parete, Carinaro, Lusciano, Teverola, San Marcellino, Villa di Briano, Orta di Atella, Trentola-Ducenta, Gricignano di Aversa, Cesa, Giugliano in Campania, Marano di Napoli, Qualiano e tutta la provincia di Caserta e Napoli.</p>
        <h2>Prezzi Fotografo Aversa</h2>
        <p>I pacchetti fotografici per matrimoni ad Aversa partono da €2.000 fino a €3.500 incluso album fotografico, galleria digitale Memorie Sospese e consegna entro 12 settimane. Nessun costo di trasferta nell'area aversana.</p>
        <h2>Domande Frequenti</h2>
        <h3>Quanto costa un fotografo di matrimonio ad Aversa?</h3>
        <p>I nostri pacchetti partono da €2.000. Non è previsto alcun costo di trasferta per matrimoni nell'area di Aversa e nella provincia di Caserta e Napoli. Contattaci per un preventivo personalizzato e gratuito.</p>
        <h3>In quali comuni operate senza costi di trasferta?</h3>
        <p>Operiamo senza trasferta ad Aversa e in tutti i comuni dell'agro aversano: Sant'Arpino, Succivo, Casal di Principe, Frignano, Parete, Carinaro, Lusciano, Teverola, San Marcellino, Giugliano e tutta la provincia di Caserta e Napoli.</p>
        <h3>Fotografate anche battesimi e comunioni ad Aversa?</h3>
        <p>Sì, offriamo servizi fotografici professionali per battesimi, comunioni e cresime ad Aversa e nei comuni limitrofi. Contattaci per verificare disponibilità.</p>
        <h3>Come si prenota una consulenza gratuita?</h3>
        <p>Puoi prenotare una consulenza gratuita direttamente online nella sezione Consulenze. Offriamo incontri di persona ad Aversa o in videocall per discutere le tue esigenze.</p>
        <h3>Entro quando vengono consegnate le foto?</h3>
        <p>La consegna della galleria digitale avviene entro 10-12 settimane dalla data dell'evento, a seconda del pacchetto scelto.</p>
        <h2>Contatta il Fotografo ad Aversa</h2>
        <p>Telefono: +39 334 710 3142 | Email: info@memoriesospese.it | <a href="${BASE_URL}/consulenze">Prenota una consulenza gratuita</a> di persona ad Aversa o in videocall.</p>
        <p>Vedi anche: <a href="${BASE_URL}/portfolio/matrimonio">Portfolio Matrimoni</a> | <a href="${BASE_URL}/portfolio/battesimo">Portfolio Battesimi</a> | <a href="${BASE_URL}/blog">Blog</a></p>
      `,
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE_URL}/` },
            { '@type': 'ListItem', position: 2, name: 'Fotografo Aversa', item: `${BASE_URL}/fotografo-aversa` },
          ],
        },
        {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          // Allineate alle FAQ realmente visibili in FotografoAversaPage.tsx
          mainEntity: [
            {
              '@type': 'Question',
              name: 'Quanto costa un fotografo di matrimonio ad Aversa?',
              acceptedAnswer: { '@type': 'Answer', text: "I nostri pacchetti partono da €2.000. Non è previsto alcun costo di trasferta per matrimoni nell'area di Aversa e nella provincia di Caserta e Napoli. Contattaci per un preventivo personalizzato e gratuito." },
            },
            {
              '@type': 'Question',
              name: 'In quali comuni operate senza costi di trasferta?',
              acceptedAnswer: { '@type': 'Answer', text: "Operiamo senza trasferta ad Aversa e in tutti i comuni dell'agro aversano: Sant'Arpino, Succivo, Casal di Principe, Frignano, Parete, Carinaro, Lusciano, Teverola, San Marcellino, Giugliano e tutta la provincia di Caserta e Napoli." },
            },
            {
              '@type': 'Question',
              name: 'Fotografate anche battesimi e comunioni ad Aversa?',
              acceptedAnswer: { '@type': 'Answer', text: 'Sì, offriamo servizi fotografici professionali per battesimi, comunioni e cresime ad Aversa e nei comuni limitrofi. Contattaci per verificare disponibilità.' },
            },
            {
              '@type': 'Question',
              name: 'Come si prenota una consulenza gratuita?',
              acceptedAnswer: { '@type': 'Answer', text: 'Puoi prenotare una consulenza gratuita direttamente online nella sezione Consulenze. Offriamo incontri di persona ad Aversa o in videocall per discutere le tue esigenze.' },
            },
            {
              '@type': 'Question',
              name: 'Entro quando vengono consegnate le foto?',
              acceptedAnswer: { '@type': 'Answer', text: "La consegna della galleria digitale avviene entro 10-12 settimane dalla data dell'evento, a seconda del pacchetto scelto." },
            },
          ],
        },
      ],
    },
    [PRINT_SERVICE_PATH]: {
      title: PRINT_SERVICE_SEO.title,
      description: PRINT_SERVICE_SEO.description,
      canonical: `${BASE_URL}${PRINT_SERVICE_PATH}`,
      keywords: PRINT_SERVICE_SEO.keywords,
      bodyContent: `
        <h1>Stampa foto online ad Aversa: vacanze e ricordi</h1>
        <p>Scopri il servizio di stampa fotografica di Image Studio e Memorie Sospese: nella pagina trovi i formati e le condizioni disponibili nel catalogo aggiornato.</p>
        <h2>Stampe fotografiche classiche e grandi formati</h2>
        <ul>
          <li><strong>Formati classici</strong> per album, scatole dei ricordi e fotografie da regalare.</li>
          <li><strong>20×30 e grandi formati</strong> per panorami, ritratti e fotografie da parete.</li>
          <li><strong>Carta lucida o opaca</strong> in base al soggetto e all'utilizzo della fotografia.</li>
        </ul>
        <h2>Catalogo e formati delle stampe</h2>
        <p>Formati, scaglioni e disponibilità sono mostrati direttamente nel catalogo della pagina, così il riepilogo viene calcolato sui dati aggiornati del gestionale.</p>
        <h2>Come ordinare le stampe fotografiche</h2>
        <ol>
          <li>Accedi in modo sicuro con Google.</li>
          <li>Carica le fotografie JPG dal telefono o dal computer.</li>
          <li>Scegli formato, quantità, carta lucida o opaca e bordo bianco o riempimento.</li>
          <li>Paga il totale online tramite PayPal e ritira l'ordine in sede quando è pronto.</li>
        </ol>
        <p><a href="${BASE_URL}${PRINT_SERVICE_PATH}">Consulta catalogo e modalità del servizio</a></p>
        <h2>Domande frequenti</h2>
        ${PRINT_SEO_FAQS.map((faq) => `<h3>${faq.question}</h3><p>${faq.answer}</p>`).join('')}
        <p>Image Studio di Gennaro Mazzacane · Via Quinto Orazio Flacco 5, 81031 Aversa (CE) · Telefono e WhatsApp: +39 327 465 6179 · Email: image.studio.fotografico@gmail.com · P. IVA 08039821213</p>
        <p><a href="${BASE_URL}/">Home Image Studio</a> | <a href="${BASE_URL}/portfolio">Portfolio</a> | <a href="${BASE_URL}/blog">Blog</a></p>
      `,
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE_URL}/` },
            { '@type': 'ListItem', position: 2, name: 'Stampa foto ad Aversa', item: `${BASE_URL}${PRINT_SERVICE_PATH}` },
          ],
        },
        {
          '@context': 'https://schema.org',
          '@type': 'Service',
          name: 'Stampa foto ad Aversa',
          description: PRINT_SERVICE_SEO.description,
          url: `${BASE_URL}${PRINT_SERVICE_PATH}`,
          serviceType: 'Stampa fotografica digitale',
          provider: { '@id': `${BASE_URL}/#localbusiness` },
          areaServed: ['Aversa', 'Napoli', 'Caserta', 'Agro Aversano'],
        },
        {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: PRINT_SEO_FAQS.map((faq) => ({
            '@type': 'Question',
            name: faq.question,
            acceptedAnswer: { '@type': 'Answer', text: faq.answer },
          })),
        },
      ],
    },
    '/portfolio': {
      title: 'Portfolio Matrimoni e Fotografia | Image Studio Aversa',
      description: 'Scopri prima il portfolio matrimonio di Image Studio, poi battesimi, comunioni, eventi, ritratti e famiglia ad Aversa, Napoli, Caserta e in Campania.',
      canonical: `${BASE_URL}/portfolio`,
      keywords: 'portfolio fotografo matrimonio aversa, foto matrimoni campania, galleria fotografica, foto battesimi napoli',
      bodyContent: `
        <h1>Portfolio di fotografia di matrimonio</h1>
        <p>In evidenza i matrimoni, poi tutti gli altri servizi fotografici dello studio.</p>
        <h2>Categorie</h2>
        <ul>
          <li><a href="${BASE_URL}/portfolio/matrimonio">Matrimoni</a> - Reportage matrimoniali emozionali e portfolio principale</li>
          <li><a href="${BASE_URL}/portfolio/battesimo">Battesimi</a> - Documentazione professionale battesimi</li>
          <li><a href="${BASE_URL}/portfolio/comunione">Comunioni</a> - Fotografia comunioni</li>
          <li><a href="${BASE_URL}/portfolio/cresima">Cresime</a> - Fotografia cresime</li>
          <li><a href="${BASE_URL}/portfolio/evento">Eventi</a> - Eventi aziendali e privati</li>
          <li><a href="${BASE_URL}/portfolio/ritratto">Ritratti</a> - Ritratti professionali</li>
          <li><a href="${BASE_URL}/portfolio/famiglia">Famiglia</a> - Foto di famiglia</li>
        </ul>
      `
    },
    '/blog': {
      title: 'Blog | Consigli Matrimonio, Storie e Fotografia | Image Studio',
      description: 'Il blog di Image Studio: consigli per il matrimonio, storie di coppie, tendenze fotografia, guide per sposi. Scopri i nostri articoli e lasciati ispirare.',
      canonical: `${BASE_URL}/blog`,
      keywords: 'blog matrimonio, consigli sposi, fotografia matrimonio consigli, storie matrimoni campania',
      bodyContent: `
        <h1>Blog Image Studio - Consigli, Storie e Ispirazione</h1>
        <p>Benvenuti nel blog di Image Studio. Qui troverai consigli per il tuo matrimonio, storie emozionanti di coppie, tendenze nella fotografia e guide utili per organizzare il giorno più bello.</p>
      `
    },
    '/vision': {
      title: 'iMaGe Vision | Video Matrimoni Cinematografici | Napoli Caserta',
      description: 'iMaGe Vision: video matrimoniali cinematografici ed emozionali. Raccontiamo la vostra storia d\'amore con riprese professionali e montaggio cinematografico a Napoli, Caserta e Campania.',
      canonical: `${BASE_URL}/vision`,
      keywords: 'video matrimoni napoli, video matrimoni caserta, videografo matrimoni campania, video matrimoniali cinematografici',
      bodyContent: `
        <h1>iMaGe Vision - Video Matrimoni Cinematografici</h1>
        <p>iMaGe Vision è il servizio video di Image Studio dedicato ai matrimoni. Realizziamo video cinematografici emozionali che raccontano la vostra storia d'amore con riprese professionali in alta definizione e montaggio artistico.</p>
        <h2>Cosa Include</h2>
        <ul>
          <li>Riprese in alta definizione con attrezzatura professionale</li>
          <li>Montaggio cinematografico con musica personalizzata</li>
          <li>Trailer e highlight reel</li>
          <li>Film completo della giornata</li>
        </ul>
      `
    },
    '/storie': {
      title: 'La Nostra Storia | Gennaro Mazzacane Fotografo | Image Studio',
      description: 'Scopri la storia di Image Studio e del fotografo Gennaro Mazzacane. Oltre 10 anni di passione per la fotografia matrimoniale in Campania. Lasciati Trasportare.',
      canonical: `${BASE_URL}/storie`,
      keywords: 'gennaro mazzacane fotografo, storia image studio, fotografo aversa storia',
      bodyContent: `
        <h1>La Nostra Storia - Gennaro Mazzacane</h1>
        <p>Gennaro Mazzacane è un fotografo professionista con sede ad Aversa (CE), specializzato in fotografia matrimoniale ed eventi. Con oltre 10 anni di esperienza e 500+ matrimoni documentati, ha sviluppato uno stile unico che combina reportage documentaristico e ritrattistica artistica.</p>
        <p>"Lasciati Trasportare" - La filosofia di Gennaro è catturare le emozioni autentiche, i momenti spontanei e le connessioni genuine tra le persone.</p>
      `
    },
    '/prenota': {
      title: 'Prenota il Tuo Servizio Fotografico | Image Studio Napoli Caserta',
      description: 'Prenota il tuo servizio fotografico con Image Studio. Matrimoni, battesimi, comunioni ed eventi in Campania. Campagne attive con disponibilità limitata.',
      canonical: `${BASE_URL}/prenota`,
      keywords: 'prenotare fotografo matrimoni napoli, prenota servizio fotografico caserta, booking fotografo campania',
      bodyContent: `
        <h1>Prenota il Tuo Servizio Fotografico</h1>
        <p>Prenota il tuo servizio fotografico con Image Studio. Scegli tra le nostre campagne attive e assicurati la data del tuo evento. Servizi fotografici per matrimoni, battesimi, comunioni ed eventi in tutta la Campania.</p>
      `
    },
    '/consulenze': {
      title: 'Consulenza Gratuita Fotografo Matrimoni | Image Studio Napoli',
      description: 'Richiedi una consulenza gratuita con Image Studio. Parliamo del tuo matrimonio, evento o servizio fotografico. Incontro personalizzato a Napoli, Caserta o online.',
      canonical: `${BASE_URL}/consulenze`,
      keywords: 'consulenza fotografo matrimoni, incontro fotografo napoli, consulenza servizio fotografico',
      bodyContent: `
        <h1>Consulenze - Incontriamoci</h1>
        <p>Richiedi una consulenza gratuita per discutere del tuo matrimonio, evento o servizio fotografico. Ci incontriamo di persona ad Aversa o in videocall per capire le tue esigenze e creare il pacchetto perfetto per te.</p>
      `
    },
    '/consultations': {
      title: 'Consulenza Gratuita Fotografo Matrimoni | Image Studio',
      description: 'Richiedi una consulenza gratuita e personalizzata con Image Studio, ad Aversa oppure online.',
      canonical: `${BASE_URL}/consulenze`,
      bodyContent: `<h1>Consulenze Image Studio</h1><p>Parliamo del tuo matrimonio, evento o servizio fotografico.</p>`
    },
    '/lasciati-trasportare': {
      title: 'Lasciati Trasportare | E-book Fotografia Matrimonio | Image Studio',
      description: 'Scarica l\'e-book "Lasciati Trasportare" di Image Studio. La filosofia e l\'approccio emozionale alla fotografia matrimoniale di Gennaro Mazzacane.',
      canonical: `${BASE_URL}/lasciati-trasportare`,
      keywords: 'ebook fotografia matrimonio, lasciati trasportare image studio, filosofia fotografo matrimoni',
      bodyContent: `
        <h1>Lasciati Trasportare - La Filosofia Image Studio</h1>
        <p>"Lasciati Trasportare" è la filosofia di Image Studio: non posare per le foto, ma vivere il momento. Scopri il nostro approccio emozionale alla fotografia attraverso il nostro e-book gratuito.</p>
      `
    },
    '/accesso-galleria': {
      title: 'Accesso Galleria Memorie Sospese | Image Studio',
      description: 'Accedi alla tua galleria fotografica Memorie Sospese. Inserisci la password ricevuta via email per visualizzare e scaricare le foto del tuo evento.',
      canonical: `${BASE_URL}/accesso-galleria`,
      bodyContent: `
        <h1>Accesso Galleria - Memorie Sospese</h1>
        <p>Inserisci la password che hai ricevuto via email per accedere alla tua galleria fotografica Memorie Sospese. Potrai visualizzare tutte le foto del tuo evento, selezionare le preferite e scaricarle in alta risoluzione.</p>
      `
    },
    '/privacy': {
      title: 'Privacy Policy | Image Studio',
      description: 'Informativa sulla privacy di Image Studio. Come trattiamo i tuoi dati personali in conformità con il GDPR.',
      canonical: `${BASE_URL}/privacy`,
      bodyContent: `<h1>Privacy Policy - Image Studio</h1><p>Informativa sulla privacy e trattamento dei dati personali in conformità con il Regolamento UE 2016/679 (GDPR).</p>`
    },
    '/cookie-policy': {
      title: 'Cookie Policy | Image Studio',
      description: 'Informativa sui cookie utilizzati dal sito Image Studio e sulle preferenze disponibili per i visitatori.',
      canonical: `${BASE_URL}/cookie-policy`,
      bodyContent: `<h1>Cookie Policy - Image Studio</h1><p>Informazioni sui cookie utilizzati dal sito e sulla gestione delle preferenze.</p>`
    },
    '/gdpr': {
      title: 'Richieste GDPR | Image Studio',
      description: 'Invia una richiesta di accesso, esportazione o cancellazione dei dati personali trattati da Image Studio.',
      canonical: `${BASE_URL}/gdpr`,
      bodyContent: `<h1>Richieste GDPR - Image Studio</h1><p>Esercita i diritti previsti dal Regolamento UE 2016/679 sui tuoi dati personali.</p>`
    },
    '/ospiti': {
      title: 'Area Ospiti | Image Studio',
      description: 'Scopri i servizi Image Studio dedicati agli ospiti e accedi rapidamente ai contatti dello studio.',
      canonical: `${BASE_URL}/ospiti`,
      bodyContent: `<h1>Area Ospiti Image Studio</h1><p>Informazioni e contatti utili per gli ospiti degli eventi fotografati da Image Studio.</p>`
    },
    '/terms': {
      title: 'Termini e Condizioni | Image Studio',
      description: 'Termini e condizioni dei servizi e del sito Image Studio di Gennaro Mazzacane.',
      canonical: `${BASE_URL}/terms`,
      bodyContent: `<h1>Termini e Condizioni - Image Studio</h1><p>Consulta i termini e le condizioni applicabili ai servizi e al sito Image Studio.</p>`
    }
  };

  const page = pages[path];
  const sharedPage = staticPageMetadata(path);
  return page ? { ...page, ...(sharedPage || {}) } : null;
}

async function getBookingCampaignMeta(path: string): Promise<PageMeta | null> {
  const code = decodeURIComponent(path.replace('/prenota/', ''));
  if (!code) return getStaticPageMeta('/prenota');
  const snapshot = await db.collection('booking_campaigns').where('code', '==', code).limit(1).get();
  if (snapshot.empty) return null;
  const campaign = snapshot.docs[0].data();
  const name = String(campaign.nome || 'Servizio fotografico');
  const title = String(campaign.titoloPaginaBooking || `${name} - Prenota il tuo shooting`);
  const description = String(
    campaign.descrizionePaginaBooking
    || campaign.descrizione
    || `Prenota il tuo servizio fotografico per ${name} con Image Studio.`,
  );
  return {
    title,
    description,
    canonical: `${BASE_URL}/prenota/${encodeURIComponent(code)}`,
    socialImage: resolveSocialImage([{
      url: campaign.immaginePaginaBooking,
      alt: `Prenotazione ${name}`,
      source: 'editorial-cover',
    }], staticSocialImage('/prenota')),
    bodyContent: `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p>`,
  };
}

function stripHtmlTags(html: string): string {
  const withoutExecutableContent = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]*>/g, ' ');

  return decodeHtmlEntities(withoutExecutableContent).replace(/\s+/g, ' ').trim();
}

const SEO_CONTENT_LIMIT = 50000;
const EXTERNAL_HTML_LIMIT = 8_000_000;
const EXTERNAL_FETCH_TIMEOUT_MS = 15_000;
type ExternalSeoContent = { text: string; image: SocialImageCandidate | null };
const externalSeoContentCache = new Map<string, Promise<ExternalSeoContent>>();

function decodeHtmlEntities(value: string): string {
  const namedEntities: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»',
    rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', euro: '€', bull: '•'
  };

  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, code: string) => {
    if (code.startsWith('#')) {
      const hexadecimal = code[1]?.toLowerCase() === 'x';
      const parsed = Number.parseInt(code.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
      return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : entity;
    }
    return namedEntities[code.toLowerCase()] ?? entity;
  });
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderPortfolioCategoryContent(category: string): string {
  const content = portfolioCategoryContent[category];
  if (!content) return '';

  const sectionHtml = content.sections
    .map(
      (section) => `
        <h2>${escapeHtml(section.heading)}</h2>
        ${section.paragraphs
          .map(
            (paragraph) =>
              `<p>${paragraph
                .map((part) =>
                  part.href
                    ? `<a href="${BASE_URL}${escapeHtml(part.href)}">${escapeHtml(part.text)}</a>`
                    : escapeHtml(part.text),
                )
                .join('')}</p>`,
          )
          .join('')}`,
    )
    .join('');

  const faqHtml = content.faqs?.length
    ? `
      <h2>Domande Frequenti</h2>
      ${content.faqs
        .map(
          (faq) => `
            <h3>${escapeHtml(faq.question)}</h3>
            <p>${faq.answer
              .map((part) =>
                part.href
                  ? `<a href="${BASE_URL}${escapeHtml(part.href)}">${escapeHtml(part.text)}</a>`
                  : escapeHtml(part.text),
              )
              .join('')}</p>`,
        )
        .join('')}`
    : '';

  const relatedHtml = content.relatedLinks?.length
    ? `<p>Vedi anche: ${content.relatedLinks
        .map(
          (link) =>
            `<a href="${BASE_URL}${escapeHtml(link.href)}">${escapeHtml(link.text)}</a>`,
        )
        .join(' | ')}</p>`
    : '';

  return `${sectionHtml}${faqHtml}${relatedHtml}`;
}

function isAllowedBlogContentUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && url.hostname === 'firebasestorage.googleapis.com'
      && url.pathname.includes('/wedding-gallery-397b6.firebasestorage.app/o/blog-content%2F');
  } catch {
    return false;
  }
}

async function fetchExternalSeoContent(contentUrl: string): Promise<ExternalSeoContent> {
  if (!isAllowedBlogContentUrl(contentUrl)) return { text: '', image: null };

  const cached = externalSeoContentCache.get(contentUrl);
  if (cached) return cached;

  const pending = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), EXTERNAL_FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(contentUrl, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const declaredLength = Number(response.headers.get('content-length') || '0');
      if (declaredLength > EXTERNAL_HTML_LIMIT) {
        throw new Error(`contenuto troppo grande (${declaredLength} byte)`);
      }

      const html = await response.text();
      if (Buffer.byteLength(html, 'utf8') > EXTERNAL_HTML_LIMIT) {
        throw new Error('contenuto oltre il limite consentito');
      }
      return {
        text: stripHtmlTags(html).slice(0, SEO_CONTENT_LIMIT),
        image: firstImageCandidateFromHtml(html, 'Immagine dell’articolo'),
      };
    } finally {
      clearTimeout(timeout);
    }
  })().catch(error => {
    externalSeoContentCache.delete(contentUrl);
    console.warn('Contenuto SEO esterno non disponibile:', error instanceof Error ? error.message : error);
    return { text: '', image: null };
  });

  externalSeoContentCache.set(contentUrl, pending);
  return pending;
}

async function resolveBlogSeoContent(post: Record<string, any>): Promise<{
  text: string;
  complete: boolean;
  image: SocialImageCandidate | null;
}> {
  const storedSeoContent = String(post.seoContent || '').trim();
  if (storedSeoContent) {
    return { text: storedSeoContent.slice(0, SEO_CONTENT_LIMIT), complete: true, image: null };
  }

  const inlineContent = String(post.content || '');
  if (inlineContent) {
    return {
      text: stripHtmlTags(inlineContent).slice(0, SEO_CONTENT_LIMIT),
      complete: true,
      image: firstImageCandidateFromHtml(inlineContent, post.title),
    };
  }

  const contentUrl = String(post.contentUrl || '');
  if (contentUrl) {
    const externalContent = await fetchExternalSeoContent(contentUrl);
    if (externalContent.text) return { ...externalContent, complete: true };
  }

  return { text: String(post.excerpt || post.title || '').trim(), complete: false, image: null };
}

async function getBlogPostMeta(slug: string): Promise<PageMeta | null> {
  try {
    const snapshot = await db.collection('blogPosts')
      .where('slug', '==', slug)
      .where('status', '==', BlogPostStatus.PUBLISHED)
      .limit(1)
      .get();

    if (snapshot.empty) return null;

    const postDocument = snapshot.docs[0];
    const post = postDocument.data();

    const publishedMs = post.publishedAt?.seconds
      ? post.publishedAt.seconds * 1000
      : Date.now();
    const publishedDate = new Date(publishedMs).toISOString();

    const updatedMs = post.updatedAt?.seconds ? post.updatedAt.seconds * 1000 : null;
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    const dateModified = (updatedMs && updatedMs - publishedMs > TWENTY_FOUR_HOURS)
      ? new Date(updatedMs).toISOString()
      : publishedDate;

    const formattedDate = new Date(publishedMs).toLocaleDateString('it-IT', {
      year: 'numeric', month: 'long', day: 'numeric'
    });

    const authorName: string = post.author || 'Gennaro Mazzacane';
    const tags: string[] = post.tags || [];
    const excerpt: string = post.excerpt || '';
    const seoTitle: string = String(post.metaTitle || `${post.title} | Blog Image Studio`).trim();
    const seoDescription: string = String(post.metaDescription || excerpt || post.title).trim();
    const { text: bodyText, complete: hasCompleteSeoContent, image: contentImage } = await resolveBlogSeoContent(post);
    const socialImage = resolveSocialImage([
      {
        url: post.coverImage,
        alt: post.coverImageAlt || post.title,
        width: post.coverImageWidth,
        height: post.coverImageHeight,
        type: post.coverImageType,
        source: 'editorial-cover',
      },
      ...(contentImage ? [{ ...contentImage, alt: post.title }] : []),
    ], defaultSocialImage());
    const articleImage = socialImage.url;

    // Backfill non distruttivo per i quattro articoli legacy su Storage: dopo il
    // primo recupero riuscito, anche i successivi avvii leggono solo il testo leggero.
    if (!post.seoContent && post.contentUrl && hasCompleteSeoContent && bodyText) {
      void postDocument.ref.update({ seoContent: bodyText }).catch(error => {
        console.warn('Backfill seoContent non riuscito:', error instanceof Error ? error.message : error);
      });
    }

    const blogPostingJsonLd = {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      '@id': `${BASE_URL}/blog/${slug}`,
      'headline': post.title,
      'description': seoDescription,
       'image': {
        '@type': 'ImageObject',
        'url': articleImage,
         ...(socialImage.width ? { 'width': socialImage.width } : {}),
         ...(socialImage.height ? { 'height': socialImage.height } : {})
      },
      'author': {
        '@type': 'Person',
        '@id': `${BASE_URL}/#photographer`,
        'name': authorName,
        'url': `${BASE_URL}/storie`,
        'jobTitle': 'Fotografo Professionista Matrimoni',
        'worksFor': {
          '@type': 'Organization',
          '@id': `${BASE_URL}/#organization`,
          'name': 'Image Studio'
        }
      },
      'publisher': {
        '@type': 'Organization',
        '@id': `${BASE_URL}/#organization`,
        'name': 'Image Studio',
        'logo': {
          '@type': 'ImageObject',
          'url': `${BASE_URL}/favicon.png`,
          'width': 512,
          'height': 512
        }
      },
      'datePublished': publishedDate,
      'dateModified': dateModified,
      'mainEntityOfPage': {
        '@type': 'WebPage',
        '@id': `${BASE_URL}/blog/${slug}`
      },
      'url': `${BASE_URL}/blog/${slug}`,
      'inLanguage': 'it-IT',
      'keywords': tags.join(', ') || 'fotografia, matrimoni, image studio',
      'articleSection': post.category || 'Fotografia',
      'isPartOf': {
        '@type': 'Blog',
        '@id': `${BASE_URL}/blog`,
        'name': 'Blog Image Studio',
        'url': `${BASE_URL}/blog`
      }
    };

    const breadcrumbJsonLd = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      'itemListElement': [
        { '@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': `${BASE_URL}/` },
        { '@type': 'ListItem', 'position': 2, 'name': 'Blog', 'item': `${BASE_URL}/blog` },
        { '@type': 'ListItem', 'position': 3, 'name': post.title, 'item': `${BASE_URL}/blog/${slug}` }
      ]
    };

    return {
      title: seoTitle,
      description: seoDescription,
      canonical: `${BASE_URL}/blog/${slug}`,
      ogType: 'article',
      ogImage: articleImage,
       socialImage,
      keywords: tags.join(', ') || 'fotografia, matrimoni, blog',
      jsonLd: [blogPostingJsonLd, breadcrumbJsonLd],
      bodyContent: `
        <article>
          <h1>${escapeHtml(post.title)}</h1>
          <p>
            Di <a href="${BASE_URL}/storie">${escapeHtml(authorName)}</a> &bull;
            <time datetime="${publishedDate}">${escapeHtml(formattedDate)}</time>
            ${tags.length > 0 ? ` &bull; ${escapeHtml(tags.join(', '))}` : ''}
          </p>
          ${excerpt ? `<p><strong>${escapeHtml(excerpt)}</strong></p>` : ''}
          ${bodyText ? `<p>${escapeHtml(bodyText)}</p>` : ''}
          ${!hasCompleteSeoContent ? `<p><a href="${BASE_URL}/blog/${slug}">Leggi l'articolo completo</a></p>` : ''}
        </article>
        <nav>
          <a href="${BASE_URL}/blog">← Tutti gli Articoli</a> &nbsp;|&nbsp;
          <a href="${BASE_URL}/portfolio">Portfolio Image Studio</a> &nbsp;|&nbsp;
          <a href="${BASE_URL}/consulenze">Consulenza Gratuita</a> &nbsp;|&nbsp;
          <a href="${BASE_URL}/">Home Image Studio</a>
        </nav>
      `
    };
  } catch (error) {
    console.error('Errore caricamento blog post per SEO:', error);
    return null;
  }
}

async function hasBlogPost(slug: string): Promise<boolean> {
  const snapshot = await db.collection('blogPosts')
    .where('slug', '==', slug)
    .get();
  return !snapshot.empty;
}

async function getBlogListMeta(): Promise<PageMeta> {
  try {
    const snapshot = await db.collection('blogPosts')
      .where('status', '==', BlogPostStatus.PUBLISHED)
      .orderBy('publishedAt', 'desc')
      .limit(10)
      .get();

    const posts: Array<Record<string, any>> = snapshot.docs.map(doc => ({ kind: 'blog', ...doc.data() }));
    const storiesSnapshot = await db.collection('weddingSeoStories')
      .where('status', '==', 'published')
      .get();
    const stories: Array<Record<string, any>> = storiesSnapshot.docs.map(doc => ({ kind: 'real-wedding', ...doc.data() }));
    const editorialItems = [...posts, ...stories]
      .sort((a, b) => {
        const aDate = a.publishedAt?.seconds || 0;
        const bDate = b.publishedAt?.seconds || 0;
        return bDate - aDate;
      })
      .slice(0, 10);

    const articlesHtml = editorialItems.length > 0
      ? `<section>
          <h2>Articoli e Real Wedding recenti</h2>
          <ul>
            ${editorialItems.map(post => {
              const dateMs = post.publishedAt?.seconds ? post.publishedAt.seconds * 1000 : null;
              const dateStr = dateMs
                ? new Date(dateMs).toLocaleDateString('it-IT', { year: 'numeric', month: 'long', day: 'numeric' })
                : '';
              return `<li>
                <h3><a href="${BASE_URL}/${post.kind === 'real-wedding' ? 'real-wedding' : 'blog'}/${encodeURIComponent(post.slug)}">${escapeHtml(post.title)}</a></h3>
                ${post.kind === 'real-wedding' ? '<p>Real Wedding</p>' : ''}
                ${dateStr ? `<time datetime="${new Date(dateMs!).toISOString()}">${dateStr}</time>` : ''}
                ${post.excerpt ? `<p>${escapeHtml(post.excerpt)}</p>` : ''}
              </li>`;
            }).join('')}
          </ul>
        </section>`
      : '';

    return {
      ...staticPageMetadata('/blog'),
      title: 'Blog Fotografia Matrimoni | Consigli, Storie e Guide | Image Studio',
      description: 'Il blog di Image Studio: guide per scegliere il fotografo di matrimonio, consigli su costi e tempistiche, storie di coppie ed eventi fotografati in Campania.',
      canonical: `${BASE_URL}/blog`,
      keywords: 'blog matrimonio, consigli sposi, fotografia matrimonio, come scegliere fotografo matrimonio, fotografo matrimonio napoli',
      bodyContent: `
        <h1>Blog Image Studio - Consigli, Storie e Guide sulla Fotografia di Matrimonio</h1>
        <p>Il blog di Image Studio di Gennaro Mazzacane: guide pratiche, consigli professionali, storie di matrimoni ed eventi fotografati in Campania (Napoli, Caserta, Costiera Amalfitana).</p>
        ${articlesHtml}
        <nav>
          <a href="${BASE_URL}/">Home Image Studio</a> &nbsp;|&nbsp;
          <a href="${BASE_URL}/portfolio">Portfolio Fotografico</a> &nbsp;|&nbsp;
          <a href="${BASE_URL}/consulenze">Richiedi Consulenza Gratuita</a>
        </nav>
      `
    };
  } catch (error) {
    console.error('Errore caricamento lista blog per SEO:', error);
    return {
      ...staticPageMetadata('/blog'),
      title: 'Blog | Consigli Matrimonio, Storie e Fotografia | Image Studio',
      description: 'Il blog di Image Studio: consigli per il matrimonio, storie di coppie, tendenze fotografia, guide per sposi.',
      canonical: `${BASE_URL}/blog`,
      keywords: 'blog matrimonio, consigli sposi, fotografia matrimonio consigli',
      bodyContent: `
        <h1>Blog Image Studio - Consigli, Storie e Ispirazione</h1>
        <p>Benvenuti nel blog di Image Studio. Qui troverai consigli per il tuo matrimonio, storie emozionanti di coppie, tendenze nella fotografia e guide utili per organizzare il giorno più bello.</p>
      `
    };
  }
}

export function buildWeddingStoryPageMeta(story: Record<string, any>, images: string[] = []): PageMeta {
  const slug = String(story.slug || '');
  const canonical = `${BASE_URL}/real-wedding/${encodeURIComponent(slug)}`;
  const title = String(story.seoTitle || story.title || 'Real Wedding | Image Studio').slice(0, 70);
  const description = String(story.seoDescription || story.excerpt || story.title || '').slice(0, 170);
  const blocks = String(story.story || '')
    .split(/\n\s*\n/)
    .map(value => value.trim())
    .filter(Boolean)
    .map(value => value.startsWith('## ')
      ? `<h2>${escapeHtml(value.slice(3).trim())}</h2>`
      : `<p>${escapeHtml(value.replace(/^#+\s*/, ''))}</p>`)
    .join('');
  const publishedDate = story.publishedAt?.toDate?.()?.toISOString?.()
    || (story.publishedAt?.seconds ? new Date(story.publishedAt.seconds * 1000).toISOString() : undefined);
  const modifiedDate = story.updatedAt?.toDate?.()?.toISOString?.()
    || (story.updatedAt?.seconds ? new Date(story.updatedAt.seconds * 1000).toISOString() : publishedDate);
  const socialImage = resolveSocialImage(images.map((url, index) => ({
    url,
    alt: index === 0
      ? `Copertina del Real Wedding ${story.title}`
      : `${story.title} - fotografia ${index + 1}`,
    source: 'selected-photo' as const,
  })), defaultSocialImage());
  const publicImages = images
    .map(url => resolveSocialImage([{ url, alt: story.title, source: 'selected-photo' }], { url: '' }))
    .filter(image => image.source === 'selected-photo')
    .map(image => image.url);
  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    '@id': canonical,
    headline: story.title,
    description,
    mainEntityOfPage: canonical,
    image: publicImages.length > 0 ? publicImages : [socialImage.url],
    datePublished: publishedDate,
    dateModified: modifiedDate,
    author: { '@id': `${BASE_URL}/#photographer` },
    publisher: { '@id': `${BASE_URL}/#organization` },
    inLanguage: 'it-IT',
  };
  return {
    title,
    description,
    canonical,
    ogType: 'article',
    ogImage: socialImage.url,
    socialImage,
    jsonLd: articleSchema,
    bodyContent: `
      <article><h1>${escapeHtml(story.title)}</h1>${story.excerpt ? `<p>${escapeHtml(story.excerpt)}</p>` : ''}${blocks}${publicImages.map((url, index) => `<img src="${escapeHtml(url)}" alt="${escapeHtml(story.title)} - foto ${index + 1}" />`).join('')}</article>
      <aside>
        <h2>Image Studio</h2>
        <p>Raccontiamo matrimoni con fotografie autentiche e senza tempo.</p>
        <p><a href="${BASE_URL}/portfolio/matrimonio">Guarda il portfolio matrimoni</a></p>
        <p><a href="${BASE_URL}/consulenze">Prenota una consulenza</a></p>
      </aside>
      <nav>
        <a href="${BASE_URL}/blog">Tutte le storie e gli articoli</a> &nbsp;|&nbsp;
        <a href="${BASE_URL}/portfolio">Portfolio Image Studio</a> &nbsp;|&nbsp;
        <a href="${BASE_URL}/">Home Image Studio</a>
      </nav>`,
  };
}

async function getWeddingStoryMeta(slug: string): Promise<PageMeta | null> {
  const snapshot = await db.collection('weddingSeoStories')
    .where('slug', '==', slug)
    .get();
  const publishedDocument = snapshot.docs.find(document => document.data().status === 'published');
  if (!publishedDocument) return null;
  const story = publishedDocument.data();
  const selectedPhotoIds: string[] = Array.isArray(story.selectedPhotoIds) ? story.selectedPhotoIds : [];
  const photoIds: string[] = [
    ...(story.coverPhotoId && selectedPhotoIds.includes(story.coverPhotoId) ? [story.coverPhotoId] : []),
    ...selectedPhotoIds.filter(id => id !== story.coverPhotoId),
  ].slice(0, 12);
  const photoDocuments = await Promise.all(photoIds.map(id => id.startsWith('legacy-')
    ? db.collection('galleries').doc(story.galleryId).collection('photos').doc(id.slice('legacy-'.length)).get()
    : db.collection('photos').doc(id).get()));
  const images = photoDocuments
    .filter((document, index) => document.exists && (photoIds[index].startsWith('legacy-') || document.data()?.galleryId === story.galleryId))
    .map(document => String(document.data()?.url || ''))
    .filter(Boolean);
  return buildWeddingStoryPageMeta(story, images);
}

async function hasWeddingStory(slug: string): Promise<boolean> {
  const snapshot = await db.collection('weddingSeoStories')
    .where('slug', '==', slug)
    .get();
  return !snapshot.empty;
}

function getPortfolioCategoryMeta(category: string): PageMeta | null {
  const categories: Record<string, { title: string; description: string }> = {
    'matrimonio': {
      title: WEDDING_PORTFOLIO_SEO.title,
      description: WEDDING_PORTFOLIO_SEO.description,
    },
    'battesimo': {
      title: 'Portfolio Battesimi | Fotografo Battesimi Napoli | Image Studio',
      description: 'Fotografie professionali di battesimi a Napoli e Caserta. Momenti emozionanti documentati con cura e professionalità.'
    },
    'comunione': {
      title: 'Portfolio Comunioni | Fotografo Comunioni Campania | Image Studio',
      description: 'Servizi fotografici per prime comunioni a Napoli, Caserta e Campania. Ricordi preziosi catturati con eleganza.'
    },
    'cresima': {
      title: 'Portfolio Cresime | Fotografo Cresime Napoli Caserta | Image Studio',
      description: 'Fotografia professionale per cresime in Campania. Documentiamo questo momento importante con foto emozionali.'
    },
    'evento': {
      title: 'Portfolio Eventi | Fotografo Eventi Napoli Caserta | Image Studio',
      description: 'Copertura fotografica professionale per eventi aziendali e privati a Napoli, Caserta e Campania.'
    },
    'ritratto': {
      title: 'Portfolio Ritratti | Fotografo Ritratti Napoli | Image Studio',
      description: 'Ritratti professionali individuali, di coppia e familiari. Sessioni fotografiche personalizzate a Napoli e Caserta.'
    },
    'famiglia': {
      title: 'Portfolio Famiglia | Fotografo Famiglia Napoli Caserta | Image Studio',
      description: 'Foto di famiglia professionali a Napoli e Caserta. Momenti di gioia familiare catturati in scatti autentici.'
    },
    'altro': {
      title: 'Portfolio Eventi e Servizi Fotografici | Image Studio',
      description: 'Scopri altri servizi fotografici ed eventi realizzati da Image Studio ad Aversa, Napoli, Caserta e in Campania.'
    }
  };

  const cat = categories[category];
  if (!cat) return null;

  const catLabels: Record<string, string> = {
    matrimonio: 'Matrimoni', battesimo: 'Battesimi', comunione: 'Comunioni',
    cresima: 'Cresime', evento: 'Eventi', ritratto: 'Ritratti', famiglia: 'Famiglia', altro: 'Altri Servizi',
  };

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE_URL}/` },
      { '@type': 'ListItem', position: 2, name: 'Portfolio', item: `${BASE_URL}/portfolio` },
      { '@type': 'ListItem', position: 3, name: catLabels[category] || category, item: `${BASE_URL}/portfolio/${category}` },
    ],
  };

  const weddingFaqs = portfolioCategoryContent.matrimonio.faqs;
  // Le FAQ derivano dal contenuto condiviso che viene renderizzato anche in React.
  const faqJsonLd = category === 'matrimonio' && weddingFaqs?.length ? {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: weddingFaqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer.map((part) => part.text).join(''),
      },
    })),
  } : null;

  return {
    title: cat.title,
    description: cat.description,
    canonical: `${BASE_URL}/portfolio/${category}`,
    keywords: category === 'matrimonio'
      ? WEDDING_PORTFOLIO_SEO.keywords
      : `portfolio ${category} napoli, foto ${category} caserta, ${category} campania`,
    jsonLd: category === 'matrimonio'
      ? [
          WEDDING_PORTFOLIO_BREADCRUMB_JSON_LD,
          WEDDING_SERVICE_JSON_LD,
          ...(faqJsonLd ? [faqJsonLd] : []),
        ]
      : [breadcrumbJsonLd],
    bodyContent: `
      <h1>${category === 'matrimonio' ? 'Fotografo di Matrimonio ad Aversa, Napoli e Caserta' : cat.title.split(' | ')[0]}</h1>
      <p>${category === 'matrimonio' ? 'Portfolio di fotografia e video di matrimonio in Campania' : cat.description}</p>
      ${renderPortfolioCategoryContent(category)}
      <nav>
        <a href="${BASE_URL}/portfolio">Tutti i Portfolio</a>
        <a href="${BASE_URL}/">Home Image Studio</a>
      </nav>
    `
  };
}

function renderSeoHtml(meta: PageMeta, indexHtml: string): string {
  const ogType = meta.ogType || 'website';
  const canonical = canonicalUrl(meta.canonical);
  const socialImage = resolveSocialImage([
    ...(meta.socialImage ? [meta.socialImage] : []),
    ...(meta.ogImage ? [{ url: meta.ogImage, alt: meta.title, source: 'content-image' as const }] : []),
    staticSocialImage(canonical),
  ]);
  const ogImage = socialImage.url;

  const commonJsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      '@id': `${BASE_URL}/#localbusiness`,
      name: 'Image Studio Fotografico',
      image: ogImage,
      url: BASE_URL,
      telephone: '+39 334 710 3142',
      email: 'info@memoriesospese.it',
      priceRange: '€€€',
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Aversa',
        addressRegion: 'Campania',
        addressCountry: 'IT',
      },
      areaServed: ['Aversa', 'Caserta', 'Napoli', 'Costiera Amalfitana', 'Campania'],
      founder: { '@id': `${BASE_URL}/#photographer` },
      sameAs: [],
      knowsAbout: ['fotografia di matrimonio', 'fotografia di battesimo', 'fotografia di eventi', 'video matrimoniali'],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      '@id': canonical,
      url: canonical,
      name: meta.title,
      description: meta.description,
      inLanguage: 'it-IT',
      isPartOf: { '@id': `${BASE_URL}/#website` },
      about: { '@id': `${BASE_URL}/#organization` },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': `${BASE_URL}/#organization`,
      name: 'Image Studio',
      url: BASE_URL,
      logo: `${BASE_URL}/favicon.png`,
      email: 'info@memoriesospese.it',
      founder: { '@id': `${BASE_URL}/#photographer` },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Person',
      '@id': `${BASE_URL}/#photographer`,
      name: 'Gennaro Mazzacane',
      jobTitle: 'Fotografo professionista',
      url: `${BASE_URL}/storie`,
      worksFor: { '@id': `${BASE_URL}/#organization` },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': `${BASE_URL}/#website`,
      url: BASE_URL,
      name: 'Image Studio - Memorie Sospese',
      publisher: { '@id': `${BASE_URL}/#organization` },
      inLanguage: 'it-IT',
    },
  ];
  const pageJsonLd = meta.jsonLd
    ? (Array.isArray(meta.jsonLd) ? meta.jsonLd : [meta.jsonLd])
    : [];
  const jsonLdScripts = [...commonJsonLd, ...pageJsonLd]
    .map(schema => `<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>`)
    .join('\n    ');

  const seoHead = `
    <title>${escapeHtml(meta.title)}</title>
    <meta name="description" content="${escapeHtml(meta.description)}" />
    <meta name="robots" content="index,follow,max-image-preview:large" />
    ${meta.keywords ? `<meta name="keywords" content="${escapeHtml(meta.keywords)}" />` : ''}
    <link rel="canonical" href="${escapeHtml(canonical)}" />
    <meta property="og:title" content="${escapeHtml(meta.title)}" />
    <meta property="og:description" content="${escapeHtml(meta.description)}" />
    <meta property="og:type" content="${escapeHtml(ogType)}" />
    <meta property="og:url" content="${escapeHtml(canonical)}" />
    <meta property="og:image" content="${escapeHtml(ogImage)}" />
    ${socialImage.width ? `<meta property="og:image:width" content="${socialImage.width}" />` : ''}
    ${socialImage.height ? `<meta property="og:image:height" content="${socialImage.height}" />` : ''}
    ${socialImage.type ? `<meta property="og:image:type" content="${escapeHtml(socialImage.type)}" />` : ''}
    <meta property="og:image:alt" content="${escapeHtml(socialImage.alt)}" />
    <meta property="og:locale" content="it_IT" />
    <meta property="og:site_name" content="Image Studio" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(meta.title)}" />
    <meta name="twitter:description" content="${escapeHtml(meta.description)}" />
    <meta name="twitter:image" content="${escapeHtml(ogImage)}" />
    <meta name="twitter:image:alt" content="${escapeHtml(socialImage.alt)}" />
    ${jsonLdScripts}
  `;

  let html = indexHtml;

  html = html.replace(/<script[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi, '');
  html = html.replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, '');
  html = html.replace(
    /<meta\b[^>]*(?:name|property)\s*=\s*["'](?:description|robots|keywords|og:[^"']+|twitter:[^"']+)["'][^>]*>/gi,
    '',
  );
  html = html.replace(/<link\b(?=[^>]*\brel\s*=\s*["']canonical["'])[^>]*>/gi, '');

  html = html.replace('</head>', `${seoHead}\n</head>`);

  if (meta.bodyContent) {
    html = html.replace(
      '<div id="root"></div>',
      `<div id="root"><main data-seo-prerender="true">${meta.bodyContent}</main></div>`
    );
  }

  return html;
}

export function createSeoMiddleware() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userAgent = req.headers['user-agent'] || '';
    const path = normalizeClientPath(req.path);

    // In development Vite serves these virtual modules after this middleware.
    // They are not application routes and must not be mistaken for 404s.
    if (
      path.startsWith('/@vite/')
      || path === '/@react-refresh'
      || path.startsWith('/@id/')
      || path.startsWith('/@fs/')
      || path.startsWith('/node_modules/')
    ) {
      return next();
    }

    if (isPrivateClientPath(path)) {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
      return next();
    }

    if (isNonPrerenderablePath(path)) {
      return next();
    }

    try {
      const bot = isBot(userAgent);
      let meta: PageMeta | null = null;

      if (path.startsWith('/real-wedding/') && path !== '/real-wedding') {
        const slug = path.replace('/real-wedding/', '');
        if (!await hasWeddingStory(slug)) {
          res.setHeader('X-Robots-Tag', 'noindex, nofollow');
          res.status(404).type('text/plain').send('Not Found');
          return;
        }
        if (bot) {
          meta = await getWeddingStoryMeta(slug);
          if (!meta) {
            res.setHeader('X-Robots-Tag', 'noindex, nofollow');
            return next();
          }
        }
      } else if (path.startsWith('/blog/') && path !== '/blog') {
        const slug = path.replace('/blog/', '');
        if (!await hasBlogPost(slug)) {
          res.setHeader('X-Robots-Tag', 'noindex, nofollow');
          res.status(404).type('text/plain').send('Not Found');
          return;
        }
        if (bot) {
          meta = await getBlogPostMeta(slug);
          if (!meta) {
            res.setHeader('X-Robots-Tag', 'noindex, nofollow');
            return next();
          }
        }
      } else if (path === '/blog') {
        if (bot) meta = await getBlogListMeta();
      } else if (path.startsWith('/prenota/') && path !== '/prenota') {
        if (bot) meta = await getBookingCampaignMeta(path);
      } else if (path.startsWith('/portfolio/') && path !== '/portfolio') {
        const category = path.replace('/portfolio/', '');
        if (bot) meta = getPortfolioCategoryMeta(category);
      } else {
        if (bot) meta = getStaticPageMeta(path);
      }

      if (!isKnownClientPath(path)) {
        res.status(404).type('text/plain').send('Not Found');
        return;
      }

      if (!bot) {
        return next();
      }

      if (!meta) {
        return next();
      }

      const fs = await import('fs');
      const nodePath = await import('path');
      const indexPath = nodePath.resolve(process.cwd(), 'client', 'index.html');
      let indexHtml = fs.readFileSync(indexPath, 'utf-8');

      indexHtml = indexHtml.replace(/%BASE_URL%/g, '/');

      const html = renderSeoHtml(meta, indexHtml);

      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(html);
    } catch (error) {
      console.error('Errore SEO middleware:', error);
      next();
    }
  };
}
