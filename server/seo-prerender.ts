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
  ogImage?: string;
  jsonLd?: object | object[];
  bodyContent?: string;
}

function getStaticPageMeta(path: string): PageMeta | null {
  const pages: Record<string, PageMeta> = {
    '/': {
      title: 'Fotografo Aversa | Image Studio | Matrimoni, Battesimi ed Eventi in Campania',
      description: 'Fotografo professionista ad Aversa. Matrimoni, battesimi, comunioni ed eventi in Campania. Gennaro Mazzacane - 10+ anni di esperienza, 500+ matrimoni. Preventivo gratuito.',
      canonical: `${BASE_URL}/`,
      keywords: 'fotografo Aversa, fotografo matrimoni Aversa, fotografo battesimi Aversa, fotografo matrimoni Napoli, fotografo matrimoni Caserta, fotografo professionista Campania, video matrimoni Aversa, memorie sospese, image studio, gallerie foto interattive',
      bodyContent: `
        <h1>Fotografo Aversa - Gennaro Mazzacane | Image Studio</h1>
        <p>Image Studio è lo studio fotografico di Gennaro Mazzacane con sede ad Aversa (CE), specializzato in matrimoni, battesimi, comunioni, cresime ed eventi in Campania. Con oltre 10 anni di esperienza e 500+ matrimoni documentati, offriamo servizi fotografici emozionali ad Aversa, Napoli, Caserta, Salerno e Costiera Amalfitana.</p>
        <h2>Fotografo Matrimoni Aversa</h2>
        <p>Cerchi un fotografo di matrimonio ad Aversa? Image Studio offre un reportage fotografico completo della tua giornata: dai preparativi alla festa serale. Stile emozionale e documentaristico, galleria digitale Memorie Sospese inclusa.</p>
        <h2>Fotografo Battesimi e Cerimonie Aversa</h2>
        <p>Servizi fotografici professionali per battesimi, comunioni e cresime ad Aversa e nei comuni limitrofi: Sant'Arpino, Succivo, Casal di Principe, Frignano, Parete, Carinaro, Lusciano, Teverola, Giugliano in Campania.</p>
        <h2>I Nostri Servizi</h2>
        <ul>
          <li><a href="${BASE_URL}/portfolio/matrimonio">Fotografia Matrimoni Aversa</a> - Reportage emozionale completo</li>
          <li>Video Matrimoni (iMaGe Vision) - Video cinematografici</li>
          <li><a href="${BASE_URL}/portfolio/battesimo">Fotografia Battesimi Aversa</a>, Comunioni, Cresime</li>
          <li>Ritratti e Book Fotografici</li>
          <li>Gallerie Digitali "Memorie Sospese" - Gallerie interattive con selezione foto online</li>
        </ul>
        <h2>Aree Servite - Agro Aversano e Campania</h2>
        <p>Operiamo principalmente ad Aversa e nell'agro aversano: Sant'Arpino, Succivo, Casal di Principe, Frignano, Parete, Carinaro, Lusciano, Teverola, San Marcellino, Orta di Atella, Giugliano in Campania, Napoli, Caserta, Salerno e Costiera Amalfitana.</p>
        <h2>Quanto costa un fotografo di matrimonio ad Aversa?</h2>
        <p>Il costo indicativo è tra €2.000 e €3.500 a seconda del pacchetto. Non è previsto costo di trasferta nell'area aversana. <a href="${BASE_URL}/consulenze">Richiedi un preventivo gratuito</a>.</p>
        <p>Contattaci: info@memoriesospese.it | Tel: +39 334 710 3142 | <a href="${BASE_URL}/prenota">Prenota il tuo servizio</a> | <a href="${BASE_URL}/consulenze">Richiedi una consulenza</a></p>
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
        <h2>Contatta il Fotografo ad Aversa</h2>
        <p>Telefono: +39 334 710 3142 | Email: info@memoriesospese.it | <a href="${BASE_URL}/consulenze">Prenota una consulenza gratuita</a> di persona ad Aversa o in videocall.</p>
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
    },
    '/terms': {
      title: 'Termini e Condizioni | Image Studio',
      description: 'Termini e condizioni dei servizi e del sito Image Studio di Gennaro Mazzacane.',
      canonical: `${BASE_URL}/terms`,
      bodyContent: `<h1>Termini e Condizioni - Image Studio</h1><p>Consulta i termini e le condizioni applicabili ai servizi e al sito Image Studio.</p>`
    }
  };

  return pages[path] || null;
}

function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
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
    const articleImage: string = post.coverImage || OG_IMAGE;

    const rawContent: string = post.content || '';
    const plainText = stripHtmlTags(rawContent).substring(0, 3000);
    const isLargePost = !!post.contentUrl && !rawContent;

    const bodyText = isLargePost
      ? (excerpt || post.title)
      : (plainText || excerpt);

    const blogPostingJsonLd = {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      '@id': `${BASE_URL}/blog/${slug}`,
      'headline': post.title,
      'description': excerpt || post.title,
      'image': {
        '@type': 'ImageObject',
        'url': articleImage,
        'width': 1200,
        'height': 630
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
      title: `${post.title} | Blog Image Studio`,
      description: excerpt || post.title,
      canonical: `${BASE_URL}/blog/${slug}`,
      ogType: 'article',
      ogImage: articleImage,
      keywords: tags.join(', ') || 'fotografia, matrimoni, blog',
      jsonLd: [blogPostingJsonLd, breadcrumbJsonLd],
      bodyContent: `
        <article>
          <h1>${post.title}</h1>
          <p>
            Di <a href="${BASE_URL}/storie">${authorName}</a> &bull;
            <time datetime="${publishedDate}">${formattedDate}</time>
            ${tags.length > 0 ? ` &bull; ${tags.join(', ')}` : ''}
          </p>
          ${excerpt ? `<p><strong>${excerpt}</strong></p>` : ''}
          ${bodyText ? `<p>${bodyText}</p>` : ''}
          ${isLargePost ? `<p><a href="${BASE_URL}/blog/${slug}">Leggi l'articolo completo</a></p>` : ''}
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

async function getBlogListMeta(): Promise<PageMeta> {
  try {
    const snapshot = await db.collection('blogPosts')
      .where('status', '==', BlogPostStatus.PUBLISHED)
      .orderBy('publishedAt', 'desc')
      .limit(10)
      .get();

    const posts = snapshot.docs.map(doc => doc.data());

    const articlesHtml = posts.length > 0
      ? `<section>
          <h2>Articoli Recenti</h2>
          <ul>
            ${posts.map(post => {
              const dateMs = post.publishedAt?.seconds ? post.publishedAt.seconds * 1000 : null;
              const dateStr = dateMs
                ? new Date(dateMs).toLocaleDateString('it-IT', { year: 'numeric', month: 'long', day: 'numeric' })
                : '';
              return `<li>
                <h3><a href="${BASE_URL}/blog/${post.slug}">${post.title}</a></h3>
                ${dateStr ? `<time datetime="${new Date(dateMs!).toISOString()}">${dateStr}</time>` : ''}
                ${post.excerpt ? `<p>${post.excerpt}</p>` : ''}
              </li>`;
            }).join('')}
          </ul>
        </section>`
      : '';

    return {
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
    },
    'altro': {
      title: 'Portfolio Eventi e Servizi Fotografici | Image Studio',
      description: 'Scopri altri servizi fotografici ed eventi realizzati da Image Studio ad Aversa, Napoli, Caserta e in Campania.'
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
  const ogImage = meta.ogImage || OG_IMAGE;

  const commonJsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      '@id': meta.canonical,
      url: meta.canonical,
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
    .map(schema => `<script type="application/ld+json">${JSON.stringify(schema)}</script>`)
    .join('\n    ');

  const seoHead = `
    <title>${meta.title}</title>
    <meta name="description" content="${meta.description}" />
    ${meta.keywords ? `<meta name="keywords" content="${meta.keywords}" />` : ''}
    <link rel="canonical" href="${meta.canonical}" />
    <meta property="og:title" content="${meta.title}" />
    <meta property="og:description" content="${meta.description}" />
    <meta property="og:type" content="${ogType}" />
    <meta property="og:url" content="${meta.canonical}" />
    <meta property="og:image" content="${ogImage}" />
    <meta property="og:locale" content="it_IT" />
    <meta property="og:site_name" content="Image Studio" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${meta.title}" />
    <meta name="twitter:description" content="${meta.description}" />
    <meta name="twitter:image" content="${ogImage}" />
    ${jsonLdScripts}
  `;

  let html = indexHtml;

  html = html.replace(/<script[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi, '');
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
      } else if (path === '/blog') {
        meta = await getBlogListMeta();
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
