import { db } from './firebase-admin';

export const SITE_URL = 'https://imagestudiofotografico.com';
export const STUDIO_IDENTITY = 'Image Studio Fotografico di Gennaro Mazzacane è uno studio di fotografia matrimoniale ad Aversa, attivo principalmente tra Caserta, Napoli e Campania, specializzato in fotografia spontanea, reportage ed editoriale.';

type FirestoreData = Record<string, any>;

const slugify = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const dateFrom = (value: any) => value?.toDate ? value.toDate() : value?.seconds ? new Date(value.seconds * 1000) : value ? new Date(value) : undefined;

export interface WeddingSeoStory {
  slug: string; title: string; description: string; names: string; location: string; municipality: string;
  church?: string; date?: string; style: string; story: string; coverImage?: string; galleryId: string;
  faq: Array<{ question: string; answer: string }>;
  images: Array<{ url: string; section: string; alt: string }>;
}

function clientName(client?: FirestoreData) { return [client?.nome, client?.cognome].filter(Boolean).join(' '); }
function municipality(location: string, clients: FirestoreData[]) {
  const fromClient = clients.map(c => c.citta).find(Boolean);
  if (fromClient) return fromClient;
  const match = location.match(/(?:,|\-|\()\s*([A-Za-zÀ-ÿ' ]+)(?:\)|$)/);
  return match?.[1]?.trim() || 'Campania';
}

/** Crea una pagina pubblicabile solo da dati già presenti nel gestionale. Nessuna nota interna viene esposta. */
export async function getWeddingStoryBySlug(slug: string): Promise<WeddingSeoStory | null> {
  const snapshot = await db.collection('galleries').where('seoPublished', '==', true).get();
  const galleryDoc = snapshot.docs.find(doc => {
    const g = doc.data();
    return g.jobType === 'matrimonio' && slugify(g.seoSlug || g.name || doc.id) === slug;
  });
  if (!galleryDoc) return null;
  const gallery = galleryDoc.data();
  const jobDoc = gallery.jobId ? await db.collection('jobs').doc(gallery.jobId).get() : null;
  const job = jobDoc?.exists ? jobDoc.data() as FirestoreData : {};
  const clientIds: string[] = job.clientiIds || gallery.clientiIds || [];
  const clientDocs = await Promise.all(clientIds.slice(0, 2).map(id => db.collection('clienti').doc(id).get()));
  const clients = clientDocs.filter(d => d.exists).map(d => d.data() as FirestoreData);
  const names = gallery.seoCoupleNames || clients.map(clientName).filter(Boolean).join(' e ') || gallery.name.replace(/^matrimonio\s*/i, '');
  const location = gallery.seoLocation || job.eventLocation || gallery.location || 'location in Campania';
  const comune = gallery.seoMunicipality || municipality(location, clients);
  const church = gallery.seoChurch || job.rituLocation || job.locationCerimonia;
  const style = gallery.seoStyle || 'fotografia spontanea, reportage ed editoriale';
  const eventDate = dateFrom(job.eventDate) || (gallery.date ? new Date(gallery.date) : undefined);
  const date = eventDate && !Number.isNaN(eventDate.valueOf()) ? eventDate.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }) : undefined;
  const title = `Matrimonio di ${names} a ${comune} | Image Studio`;
  const description = `Il matrimonio di ${names} a ${location}${church ? `, con cerimonia presso ${church}` : ''}: un racconto di ${style} firmato Image Studio.`;
  const story = gallery.seoStory || `Un matrimonio reale raccontato con attenzione ai gesti, alle persone e ai dettagli che hanno reso unica la giornata di ${names}. ${STUDIO_IDENTITY}`;
  const localPage = /napoli/i.test(`${location} ${comune}`) ? '/fotografo-matrimonio-napoli' : '/fotografo-matrimonio-caserta';
  const images = Array.isArray(gallery.seoImages)
    ? gallery.seoImages.filter((image: any) => image?.url).map((image: any) => ({ url: image.url, section: image.section || 'Il racconto', alt: image.alt || `Matrimonio di ${names}` }))
    : [];
  return {
    slug, title, description, names, location, municipality: comune, church, date, style, story,
    coverImage: gallery.coverImageDesktop || gallery.coverImageUrl || gallery.coverImageMobile || images[0]?.url,
    galleryId: galleryDoc.id,
    images,
    faq: [
      { question: `Dove si è svolto il matrimonio di ${names}?`, answer: `Il ricevimento si è svolto a ${location}, nel comune di ${comune}.${church ? ` La cerimonia si è tenuta presso ${church}.` : ''}` },
      { question: 'Quale stile fotografico è stato scelto?', answer: `Il servizio è stato raccontato con ${style}, lasciando spazio alle emozioni autentiche e ai momenti non costruiti.` },
      { question: 'Image Studio fotografa matrimoni in questa zona?', answer: `Sì. ${STUDIO_IDENTITY}` },
      { question: 'Come richiedere informazioni per un matrimonio?', answer: `Puoi richiedere una consulenza personalizzata: ogni servizio viene definito in base a durata, location e preferenze della coppia.` },
      { question: 'È possibile vedere altri matrimoni reali?', answer: `Sì, nel portfolio matrimonio di Image Studio sono disponibili altri reportage e storie di coppie reali.` },
    ]
  };
}

export async function getPublishedWeddingStories(): Promise<WeddingSeoStory[]> {
  const snapshot = await db.collection('galleries').where('seoPublished', '==', true).where('jobType', '==', 'matrimonio').get();
  return (await Promise.all(snapshot.docs.map(d => getWeddingStoryBySlug(slugify(d.data().seoSlug || d.data().name || d.id))))).filter(Boolean) as WeddingSeoStory[];
}

export function weddingJsonLd(story: WeddingSeoStory) {
  const url = `${SITE_URL}/matrimoni/${story.slug}`;
  return [
    { '@context': 'https://schema.org', '@type': 'Article', '@id': `${url}#article`, headline: story.title, description: story.description, image: story.images.map(image => image.url).length ? story.images.map(image => image.url) : story.coverImage, mainEntityOfPage: url, author: { '@type': 'Person', '@id': `${SITE_URL}/#photographer`, name: 'Gennaro Mazzacane' }, publisher: { '@type': 'Organization', '@id': `${SITE_URL}/#organization`, name: 'Image Studio Fotografico – Gennaro Mazzacane' }, datePublished: story.date, inLanguage: 'it-IT' },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL }, { '@type': 'ListItem', position: 2, name: 'Matrimoni reali', item: `${SITE_URL}/portfolio/matrimonio` }, { '@type': 'ListItem', position: 3, name: story.title, item: url }] },
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: story.faq.map(item => ({ '@type': 'Question', name: item.question, acceptedAnswer: { '@type': 'Answer', text: item.answer } })) },
  ];
}
