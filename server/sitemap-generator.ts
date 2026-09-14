import { db } from './firebase-admin';
import { BlogPost, BlogPostStatus } from '../shared/schema';

interface BlogPostMedia {
  url: string;
  caption?: string;
  title?: string;
  description?: string;
  thumbnailUrl?: string;
}

// Aggiornare questa data solo quando cambia in modo significativo il rendering
// pubblico comune a tutti gli articoli (prerender, canonical, dati strutturati
// o interlinking). È un limite minimo stabile, non una data generata a ogni request.
export const BLOG_SEO_RENDERING_LASTMOD = '2026-09-07';

const STATIC_SITEMAP_IMAGES: Record<string, { url: string; title: string }> = {
  '/': {
    url: '/1200x630px.jpg',
    title: 'Fotografia di matrimonio in Campania - Image Studio',
  },
  '/portfolio': {
    url: '/1200x630px.jpg',
    title: 'Portfolio fotografico Image Studio',
  },
  '/portfolio/matrimonio': {
    url: '/images/portfolio/matrimonio.jpg',
    title: 'Portfolio fotografia di matrimonio in Campania',
  },
  '/vision': {
    url: '/assets/og-image.jpg',
    title: 'Video matrimonio cinematografico iMaGe Vision',
  },
  '/image-experience': {
    url: '/images/image-experience/image-experience-social-1200x630.jpg',
    title: 'Image Experience per il servizio fotografico di matrimonio',
  },
  '/fotografo-aversa': {
    url: '/assets/og-image.jpg',
    title: 'Fotografo professionista ad Aversa',
  },
};

export const STATIC_SITEMAP_PAGES: Array<{
  path: string;
  changefreq: string;
  priority: string;
  lastmod: string;
}> = [
  { path: '/', changefreq: 'weekly', priority: '1.0', lastmod: '2026-09-11' },
  { path: '/portfolio/matrimonio', changefreq: 'weekly', priority: '0.98', lastmod: '2026-08-21' },
  { path: '/vision', changefreq: 'monthly', priority: '0.95', lastmod: '2026-08-21' },
  { path: '/portfolio', changefreq: 'weekly', priority: '0.9', lastmod: '2026-08-21' },
  { path: '/portfolio/battesimo', changefreq: 'weekly', priority: '0.85', lastmod: '2026-08-18' },
  { path: '/portfolio/comunione', changefreq: 'weekly', priority: '0.85', lastmod: '2026-08-18' },
  { path: '/portfolio/cresima', changefreq: 'weekly', priority: '0.85', lastmod: '2026-08-18' },
  { path: '/portfolio/evento', changefreq: 'weekly', priority: '0.85', lastmod: '2026-08-18' },
  { path: '/portfolio/ritratto', changefreq: 'weekly', priority: '0.85', lastmod: '2026-08-18' },
  { path: '/portfolio/famiglia', changefreq: 'weekly', priority: '0.85', lastmod: '2026-08-18' },
  { path: '/portfolio/altro', changefreq: 'weekly', priority: '0.8', lastmod: '2026-08-18' },
  { path: '/blog', changefreq: 'daily', priority: '0.9', lastmod: BLOG_SEO_RENDERING_LASTMOD },
  { path: '/image-experience', changefreq: 'monthly', priority: '0.95', lastmod: '2026-09-04' },
  { path: '/storie', changefreq: 'monthly', priority: '0.85', lastmod: '2026-02-06' },
  { path: '/fotografo-aversa', changefreq: 'monthly', priority: '0.95', lastmod: '2026-08-18' },
  { path: '/stampa-foto-aversa', changefreq: 'weekly', priority: '0.92', lastmod: '2026-08-31' },
  { path: '/prenota', changefreq: 'weekly', priority: '0.9', lastmod: '2026-08-05' },
  { path: '/consulenze', changefreq: 'monthly', priority: '0.85', lastmod: '2026-08-05' },
  { path: '/lasciati-trasportare', changefreq: 'monthly', priority: '0.8', lastmod: '2026-02-06' },
  { path: '/privacy', changefreq: 'yearly', priority: '0.3', lastmod: '2026-08-31' },
  { path: '/terms', changefreq: 'yearly', priority: '0.3', lastmod: '2026-08-31' },
];

function escapeXml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function timestampSeconds(value: unknown): number | null {
  if (!value || typeof value !== 'object') return null;
  const timestamp = value as { seconds?: number; _seconds?: number };
  return timestamp.seconds ?? timestamp._seconds ?? null;
}

async function loadWeddingSitemapCoverImage(story: Record<string, any>): Promise<string | undefined> {
  const galleryIdOrCode = typeof story.galleryId === 'string' ? story.galleryId : '';
  if (!galleryIdOrCode) return undefined;

  let galleryDocument = await db.collection('galleries').doc(galleryIdOrCode).get();
  if (!galleryDocument.exists) {
    const codes = [...new Set([galleryIdOrCode, galleryIdOrCode.toUpperCase()])];
    for (const code of codes) {
      const snapshot = await db.collection('galleries').where('code', '==', code).limit(1).get();
      if (snapshot.docs[0]) {
        galleryDocument = snapshot.docs[0];
        break;
      }
    }
  }
  if (!galleryDocument.exists) return undefined;

  const gallery = { id: galleryDocument.id, ...galleryDocument.data() } as Record<string, any>;
  const selectedPhotoIds = Array.isArray(story.selectedPhotoIds)
    ? story.selectedPhotoIds.map(String)
    : [];
  const coverPhotoId = story.coverPhotoId && selectedPhotoIds.includes(String(story.coverPhotoId))
    ? String(story.coverPhotoId)
    : selectedPhotoIds[0];
  if (!coverPhotoId) return undefined;

  const photoDocument = coverPhotoId.startsWith('legacy-')
    ? await db.collection('galleries').doc(gallery.id).collection('photos').doc(coverPhotoId.slice('legacy-'.length)).get()
    : await db.collection('photos').doc(coverPhotoId).get();
  if (!photoDocument.exists) return undefined;

  const photo = photoDocument.data() || {};
  if (!coverPhotoId.startsWith('legacy-') && photo.galleryId !== gallery.id) return undefined;
  return typeof photo.url === 'string' && photo.url.trim() ? photo.url.trim() : undefined;
}

export function blogSitemapLastModifiedDate(
  post: Pick<BlogPost, 'updatedAt' | 'publishedAt'>,
  renderingLastmod = BLOG_SEO_RENDERING_LASTMOD,
): string {
  const contentSeconds = timestampSeconds(post.updatedAt) ?? timestampSeconds(post.publishedAt);
  const contentLastmod = contentSeconds
    ? new Date(contentSeconds * 1000).toISOString().split('T')[0]
    : null;
  return contentLastmod && contentLastmod > renderingLastmod
    ? contentLastmod
    : renderingLastmod;
}

export function buildWeddingSitemapEntries(
  stories: Array<Record<string, any>>,
  baseUrl = 'https://imagestudiofotografico.com',
): string {
  let entries = '';
  for (const story of stories) {
    // Difesa aggiuntiva: anche se la query Firestore è già filtrata, una bozza
    // non deve mai produrre una voce pubblica.
    if (story.status !== 'published' || !story.slug) continue;
    const modifiedSeconds = timestampSeconds(story.updatedAt) ?? timestampSeconds(story.publishedAt);
    const lastmod = modifiedSeconds
      ? new Date(modifiedSeconds * 1000).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];
    const location = `${baseUrl}/real-wedding/${encodeURIComponent(story.slug)}`;
    entries += `  <url>\n    <loc>${escapeXml(location)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n`;
    if (typeof story.coverImage === 'string' && story.coverImage.trim()) {
      entries += `    <image:image>\n      <image:loc>${escapeXml(story.coverImage.trim())}</image:loc>\n      <image:caption>${escapeXml(story.title || 'Real Wedding Image Studio')}</image:caption>\n      <image:title>${escapeXml(story.title || 'Real Wedding Image Studio')}</image:title>\n    </image:image>\n`;
    }
    entries += '  </url>\n';
  }
  return entries;
}

export function buildStaticSitemapEntries(
  baseUrl = 'https://imagestudiofotografico.com',
): string {
  let entries = '';
  for (const page of STATIC_SITEMAP_PAGES) {
    entries += `  <url>
    <loc>${baseUrl}${page.path}</loc>
    <lastmod>${page.lastmod}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
`;
    const image = STATIC_SITEMAP_IMAGES[page.path];
    if (image) {
      entries += `    <image:image>
      <image:loc>${escapeXml(`${baseUrl}${image.url}`)}</image:loc>
      <image:title>${escapeXml(image.title)}</image:title>
    </image:image>
`;
    }
    entries += `  </url>
`;
  }
  return entries;
}

export async function generateDynamicSitemap(): Promise<string> {
  const baseUrl = 'https://imagestudiofotografico.com';

  // Carica tutti i post pubblicati usando Admin SDK
  const postsSnapshot = await db.collection('blogPosts')
    .where('status', '==', BlogPostStatus.PUBLISHED)
    .orderBy('publishedAt', 'desc')
    .get();

  const posts = postsSnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  })) as (BlogPost & { images?: BlogPostMedia[]; videos?: BlogPostMedia[] })[];

  // Solo le storie pubblicate entrano nella sitemap; le bozze non hanno URL indicizzabile.
  const storiesSnapshot = await db.collection('weddingSeoStories')
    .where('status', '==', 'published')
    .get();
  const weddingStories = await Promise.all(storiesSnapshot.docs.map(async document => {
    const story = { id: document.id, ...document.data() } as Record<string, any>;
    return {
      ...story,
      coverImage: await loadWeddingSitemapCoverImage(story),
    };
  }));

  // Pagine statiche con data di ultima modifica REALE del contenuto
  // (aggiornare la data quando si modifica il contenuto/prerender della pagina)
  // Costruisci sitemap XML con namespace immagini
  let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
        xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">

`;

  sitemap += buildStaticSitemapEntries(baseUrl);

  sitemap += `
  <!-- Blog Posts Dinamici -->
`;

  // Aggiungi ogni post del blog
  for (const post of posts) {
    const lastModifiedDate = blogSitemapLastModifiedDate(post);
    const postUrl = `${baseUrl}/blog/${encodeURIComponent(post.slug)}`;

    sitemap += `  <url>
    <loc>${escapeXml(postUrl)}</loc>
    <lastmod>${lastModifiedDate}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
`;

    // Aggiungi immagini se presenti nel post
    if (post.images && post.images.length > 0) {
      for (const image of post.images) {
        sitemap += `    <image:image>
      <image:loc>${escapeXml(image.url)}</image:loc>
      <image:caption>${escapeXml(image.caption || post.title)}</image:caption>
      <image:title>${escapeXml(image.title || post.title)}</image:title>
    </image:image>
`;
      }
    }

    // Aggiungi video se presenti nel post
    if (post.videos && post.videos.length > 0) {
      for (const video of post.videos) {
        sitemap += `    <video:video>
      <video:title>${escapeXml(video.title || post.title)}</video:title>
      <video:description>${escapeXml(video.description || post.excerpt)}</video:description>
      <video:content_loc>${escapeXml(video.url)}</video:content_loc>
      <video:thumbnail_loc>${escapeXml(video.thumbnailUrl || (post.images && post.images.length > 0 ? post.images[0].url : ''))}</video:thumbnail_loc>
    </video:video>
`;
      }
    }

    sitemap += `  </url>
`;
  }

  sitemap += `\n  <!-- Real Wedding pubblicati -->\n`;
  sitemap += buildWeddingSitemapEntries(weddingStories, baseUrl);

  sitemap += `</urlset>`;

  return sitemap;
}
