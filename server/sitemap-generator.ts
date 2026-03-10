import { db } from './firebase-admin';
import { BlogPost, BlogPostStatus } from '../shared/schema';

interface BlogPostMedia {
  url: string;
  caption?: string;
  title?: string;
  description?: string;
  thumbnailUrl?: string;
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

  // Costruisci sitemap XML con namespace immagini
  let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
        xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">

  <!-- Homepage -->
  <url>
    <loc>${baseUrl}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
  </url>

  <!-- Portfolio Principale -->
  <url>
    <loc>${baseUrl}/portfolio</loc>
    <changefreq>weekly</changefreq>
    <priority>0.95</priority>
  </url>

  <!-- Portfolio per Categoria (Matrimoni, Battesimi, etc) -->
  <url>
    <loc>${baseUrl}/portfolio/matrimonio</loc>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>${baseUrl}/portfolio/battesimo</loc>
    <changefreq>weekly</changefreq>
    <priority>0.85</priority>
  </url>
  <url>
    <loc>${baseUrl}/portfolio/comunione</loc>
    <changefreq>weekly</changefreq>
    <priority>0.85</priority>
  </url>
  <url>
    <loc>${baseUrl}/portfolio/cresima</loc>
    <changefreq>weekly</changefreq>
    <priority>0.85</priority>
  </url>
  <url>
    <loc>${baseUrl}/portfolio/evento</loc>
    <changefreq>weekly</changefreq>
    <priority>0.85</priority>
  </url>
  <url>
    <loc>${baseUrl}/portfolio/ritratto</loc>
    <changefreq>weekly</changefreq>
    <priority>0.85</priority>
  </url>
  <url>
    <loc>${baseUrl}/portfolio/famiglia</loc>
    <changefreq>weekly</changefreq>
    <priority>0.85</priority>
  </url>
  <url>
    <loc>${baseUrl}/portfolio/altro</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>

  <!-- Video Matrimoni (iMaGe Vision) -->
  <url>
    <loc>${baseUrl}/vision</loc>
    <changefreq>weekly</changefreq>
    <priority>0.95</priority>
  </url>

  <!-- Blog -->
  <url>
    <loc>${baseUrl}/blog</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>

  <!-- Storia del Fotografo -->
  <url>
    <loc>${baseUrl}/storie</loc>
    <changefreq>monthly</changefreq>
    <priority>0.85</priority>
  </url>

  <!-- Prenota - Campagne Booking -->
  <url>
    <loc>${baseUrl}/prenota</loc>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>

  <!-- Consulenze -->
  <url>
    <loc>${baseUrl}/consulenze</loc>
    <changefreq>monthly</changefreq>
    <priority>0.85</priority>
  </url>

  <!-- Accesso Galleria Clienti -->
  <url>
    <loc>${baseUrl}/accesso-galleria</loc>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>

  <!-- Chi Siamo / About -->
  <url>
    <loc>${baseUrl}/chi-siamo</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>

  <!-- Contatti -->
  <url>
    <loc>${baseUrl}/contatti</loc>
    <changefreq>monthly</changefreq>
    <priority>0.85</priority>
  </url>

  <!-- E-book Download -->
  <url>
    <loc>${baseUrl}/lasciati-trasportare</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>

  <!-- Privacy Policy -->
  <url>
    <loc>${baseUrl}/privacy</loc>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>

  <!-- Termini e Condizioni -->
  <url>
    <loc>${baseUrl}/terms</loc>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>

  <!-- Blog Posts Dinamici -->
`;

  // Aggiungi ogni post del blog
  for (const post of posts) {
    const publishedDate = post.publishedAt?.seconds
      ? new Date(post.publishedAt.seconds * 1000).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    sitemap += `  <url>
    <loc>${baseUrl}/blog/${post.slug}</loc>
    <lastmod>${publishedDate}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
`;

    // Aggiungi immagini se presenti nel post
    if (post.images && post.images.length > 0) {
      for (const image of post.images) {
        sitemap += `    <image:image>
      <image:loc>${image.url}</image:loc>
      <image:caption>${image.caption || post.title}</image:caption>
      <image:title>${image.title || post.title}</image:title>
    </image:image>
`;
      }
    }

    // Aggiungi video se presenti nel post
    if (post.videos && post.videos.length > 0) {
      for (const video of post.videos) {
        sitemap += `    <video:video>
      <video:title>${video.title || post.title}</video:title>
      <video:description>${video.description || post.excerpt}</video:description>
      <video:content_loc>${video.url}</video:content_loc>
      <video:thumbnail_loc>${video.thumbnailUrl || (post.images && post.images.length > 0 ? post.images[0].url : '')}</video:thumbnail_loc>
    </video:video>
`;
      }
    }

    sitemap += `  </url>
`;
  }

  sitemap += `</urlset>`;

  return sitemap;
}
