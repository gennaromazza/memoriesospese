import { Request, Response, NextFunction } from 'express';
import { db } from './firebase-admin';
import { BlogPostStatus } from '../shared/schema';

const BASE_URL = 'https://imagestudiofotografico.com';
const OG_IMAGE = `${BASE_URL}/1200x630px.jpg`;

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

interface PageMeta {
  title: string;
  description: string;
  canonical: string;
  ogType?: string;
  keywords?: string;
  bodyContent?: string;
}

function getStaticPageMeta(path: string): PageMeta | null {
  const pages: Record<string, PageMeta> = {
    '/': {
      title: 'Image Studio | Fotografo Matrimoni Napoli Caserta | Memorie Sospese',
      description: 'Fotografo professionista per matrimoni, battesimi, eventi in Campania. 10+ anni esperienza, 500+ matrimoni. Gallerie digitali interattive Memorie Sospese. Servizi foto e video a Napoli, Caserta, Aversa, Costiera Amalfitana.',
      canonical: `${BASE_URL}/`,
      keywords: 'fotografo matrimoni napoli, fotografo matrimoni caserta, fotografo professionista aversa, video matrimoni campania, gallerie foto interattive, memorie sospese, image studio, destination wedding italy',
      bodyContent: `
        <h1>Image Studio - Fotografo Professionista Matrimoni ed Eventi in Campania</h1>
        <p>Benvenuti in Image Studio, lo studio fotografico di Gennaro Mazzacane specializzato in matrimoni, battesimi, comunioni, cresime ed eventi in Campania. Con oltre 10 anni di esperienza e 500+ matrimoni documentati, offriamo servizi fotografici emozionali a Napoli, Caserta, Aversa, Salerno e Costiera Amalfitana.</p>
        <h2>I Nostri Servizi</h2>
        <ul>
          <li>Fotografia Matrimoni - Reportage emozionale completo</li>
          <li>Video Matrimoni (iMaGe Vision) - Video cinematografici</li>
          <li>Fotografia Battesimi, Comunioni, Cresime</li>
          <li>Eventi Aziendali e Privati</li>
          <li>Ritratti e Book Fotografici</li>
          <li>Gallerie Digitali "Memorie Sospese" - Gallerie interattive con selezione foto online</li>
        </ul>
        <h2>Memorie Sospese - Gallerie Digitali Interattive</h2>
        <p>Memorie Sospese è la nostra piattaforma proprietaria di gallerie fotografiche digitali che permette ai clienti di visualizzare, selezionare e scaricare le foto in alta risoluzione tramite accesso protetto da password.</p>
        <h2>Aree Servite</h2>
        <p>Operiamo in tutta la Campania: Napoli, Caserta, Aversa, Salerno, Costiera Amalfitana (Amalfi, Ravello, Positano, Sorrento). Disponibili per destination wedding in tutta Italia e all'estero.</p>
        <p>Contattaci: info@memoriesospese.it | <a href="${BASE_URL}/prenota">Prenota il tuo servizio</a> | <a href="${BASE_URL}/consulenze">Richiedi una consulenza</a></p>
      `
    },
    '/portfolio': {
      title: 'Portfolio Fotografico | Matrimoni, Battesimi, Eventi | Image Studio Napoli',
      description: 'Scopri il portfolio fotografico di Image Studio: matrimoni, battesimi, comunioni, ritratti ed eventi a Napoli, Caserta e Campania. Fotografie emozionali che raccontano storie.',
      canonical: `${BASE_URL}/portfolio`,
      keywords: 'portfolio fotografo napoli, foto matrimoni campania, galleria fotografica matrimoni, foto battesimi napoli, foto comunioni caserta',
      bodyContent: `
        <h1>Portfolio Fotografico - Image Studio</h1>
        <p>Esplora il nostro portfolio fotografico organizzato per categorie: matrimoni, battesimi, comunioni, cresime, eventi, ritratti e foto di famiglia. Ogni servizio racconta una storia unica attraverso fotografie emozionali.</p>
        <h2>Categorie</h2>
        <ul>
          <li><a href="${BASE_URL}/portfolio/matrimonio">Matrimoni</a> - Reportage matrimoniali emozionali</li>
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
    }
  };

  return pages[path] || null;
}

async function getBlogPostMeta(slug: string): Promise<PageMeta | null> {
  try {
    const snapshot = await db.collection('blogPosts')
      .where('slug', '==', slug)
      .where('status', '==', BlogPostStatus.PUBLISHED)
      .limit(1)
      .get();

    if (snapshot.empty) return null;

    const post = snapshot.docs[0].data();
    const publishedDate = post.publishedAt?.seconds
      ? new Date(post.publishedAt.seconds * 1000).toISOString()
      : new Date().toISOString();

    return {
      title: `${post.title} | Blog Image Studio`,
      description: post.excerpt || post.title,
      canonical: `${BASE_URL}/blog/${slug}`,
      ogType: 'article',
      keywords: post.tags?.join(', ') || 'fotografia, matrimoni, blog',
      bodyContent: `
        <article>
          <h1>${post.title}</h1>
          <time datetime="${publishedDate}">${new Date(publishedDate).toLocaleDateString('it-IT', { year: 'numeric', month: 'long', day: 'numeric' })}</time>
          <p>${post.excerpt || ''}</p>
          ${post.content ? `<div>${post.content.substring(0, 2000)}</div>` : ''}
        </article>
        <nav>
          <a href="${BASE_URL}/blog">Torna al Blog</a>
          <a href="${BASE_URL}/">Home Image Studio</a>
        </nav>
      `
    };
  } catch (error) {
    console.error('Errore caricamento blog post per SEO:', error);
    return null;
  }
}

function getPortfolioCategoryMeta(category: string): PageMeta | null {
  const categories: Record<string, { title: string; description: string }> = {
    'matrimonio': {
      title: 'Portfolio Matrimoni | Fotografo Matrimoni Napoli Caserta | Image Studio',
      description: 'Scopri i nostri migliori servizi fotografici matrimoniali. Reportage emozionali di matrimoni a Napoli, Caserta, Costiera Amalfitana e tutta la Campania.'
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
    }
  };

  const cat = categories[category];
  if (!cat) return null;

  return {
    title: cat.title,
    description: cat.description,
    canonical: `${BASE_URL}/portfolio/${category}`,
    keywords: `portfolio ${category} napoli, foto ${category} caserta, ${category} campania`,
    bodyContent: `
      <h1>${cat.title.split(' | ')[0]}</h1>
      <p>${cat.description}</p>
      <nav>
        <a href="${BASE_URL}/portfolio">Tutti i Portfolio</a>
        <a href="${BASE_URL}/">Home Image Studio</a>
      </nav>
    `
  };
}

function renderSeoHtml(meta: PageMeta, indexHtml: string): string {
  const ogType = meta.ogType || 'website';

  const seoHead = `
    <title>${meta.title}</title>
    <meta name="description" content="${meta.description}" />
    ${meta.keywords ? `<meta name="keywords" content="${meta.keywords}" />` : ''}
    <link rel="canonical" href="${meta.canonical}" />
    <meta property="og:title" content="${meta.title}" />
    <meta property="og:description" content="${meta.description}" />
    <meta property="og:type" content="${ogType}" />
    <meta property="og:url" content="${meta.canonical}" />
    <meta property="og:image" content="${OG_IMAGE}" />
    <meta property="og:locale" content="it_IT" />
    <meta property="og:site_name" content="Image Studio" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${meta.title}" />
    <meta name="twitter:description" content="${meta.description}" />
    <meta name="twitter:image" content="${OG_IMAGE}" />
  `;

  let html = indexHtml;

  html = html.replace(/<title>[^<]*<\/title>/, '');
  html = html.replace(/<meta\s+name="description"[^>]*>/g, '');
  html = html.replace(/<meta\s+property="og:title"[^>]*>/g, '');
  html = html.replace(/<meta\s+property="og:description"[^>]*>/g, '');
  html = html.replace(/<meta\s+property="og:type"[^>]*>/g, '');
  html = html.replace(/<meta\s+property="og:url"[^>]*>/g, '');
  html = html.replace(/<link\s+rel="canonical"[^>]*>/g, '');
  html = html.replace(/<meta\s+name="twitter:title"[^>]*>/g, '');
  html = html.replace(/<meta\s+name="twitter:description"[^>]*>/g, '');

  html = html.replace('</head>', `${seoHead}\n</head>`);

  if (meta.bodyContent) {
    html = html.replace(
      '<div id="root"></div>',
      `<div id="root"><div style="position:absolute;left:-9999px;top:-9999px;" aria-hidden="true">${meta.bodyContent}</div></div>`
    );
  }

  return html;
}

export function createSeoMiddleware() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userAgent = req.headers['user-agent'] || '';

    if (!isBot(userAgent)) {
      return next();
    }

    const path = req.path.replace(/\/$/, '') || '/';

    if (path.startsWith('/api/') || path.startsWith('/admin') || path.includes('.')) {
      return next();
    }

    try {
      let meta: PageMeta | null = null;

      if (path.startsWith('/blog/') && path !== '/blog') {
        const slug = path.replace('/blog/', '');
        meta = await getBlogPostMeta(slug);
      } else if (path.startsWith('/portfolio/') && path !== '/portfolio') {
        const category = path.replace('/portfolio/', '');
        meta = getPortfolioCategoryMeta(category);
      } else {
        meta = getStaticPageMeta(path);
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
