
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from './firebase-admin';
import { BlogPost, BlogPostStatus } from '../shared/schema';

export async function generateDynamicSitemap(): Promise<string> {
  const baseUrl = 'https://www.memoriesospese.it';
  
  // Carica tutti i post pubblicati
  const postsRef = collection(db, 'blogPosts');
  const q = query(
    postsRef,
    where('status', '==', BlogPostStatus.PUBLISHED),
    orderBy('publishedAt', 'desc')
  );
  
  const snapshot = await getDocs(q);
  const posts = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  })) as BlogPost[];

  // Costruisci sitemap XML
  let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  
  <!-- Homepage -->
  <url>
    <loc>${baseUrl}/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
  </url>
  
  <!-- Portfolio -->
  <url>
    <loc>${baseUrl}/portfolio</loc>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
  
  <!-- Blog List -->
  <url>
    <loc>${baseUrl}/blog</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  
  <!-- Storia -->
  <url>
    <loc>${baseUrl}/storie</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  
  <!-- Vision -->
  <url>
    <loc>${baseUrl}/vision</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  
  <!-- Consulenze -->
  <url>
    <loc>${baseUrl}/consulenze</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  
  <!-- Accesso Galleria -->
  <url>
    <loc>${baseUrl}/accesso-galleria</loc>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  
  <!-- Special Gallery -->
  <url>
    <loc>${baseUrl}/special-gallery</loc>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  
  <!-- Privacy -->
  <url>
    <loc>${baseUrl}/privacy</loc>
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
  </url>
`;
  }

  sitemap += `</urlset>`;
  
  return sitemap;
}
