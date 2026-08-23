import { useEffect, useState } from 'react';
import { useParams } from 'wouter';
import { Loader2 } from 'lucide-react';
import { getPublicWeddingStory } from '@/lib/wedding-seo';
import type { PublicWeddingStory } from '@shared/wedding-seo-types';
import { parseWeddingStoryMarkdown } from '@/lib/wedding-story-format';

function useStoryMetadata(story: PublicWeddingStory | null, missing: boolean) {
  useEffect(() => {
    const previousTitle = document.title;
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const previousDescription = description?.content;
    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    const createdCanonical = !canonical;
    const previousCanonical = canonical?.href;
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const createdRobots = !robots;
    const previousRobots = robots?.content;
    if (!robots) {
      robots = document.createElement('meta');
      robots.name = 'robots';
      document.head.appendChild(robots);
    }
    const structuredData = document.createElement('script');
    structuredData.type = 'application/ld+json';
    structuredData.dataset.weddingStory = 'true';
    if (story) {
      const canonicalUrl = `${window.location.origin}/real-wedding/${story.slug}`;
      document.title = story.seoTitle || story.title;
      if (description) description.content = story.seoDescription || story.excerpt;
      canonical.href = canonicalUrl;
      robots.content = 'index,follow,max-image-preview:large';
      structuredData.textContent = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Article',
        '@id': canonicalUrl,
        headline: story.title,
        description: story.seoDescription || story.excerpt,
        mainEntityOfPage: canonicalUrl,
        image: story.photos.map(photo => photo.url),
        datePublished: story.publishedAt || undefined,
        author: { '@id': `${window.location.origin}/#photographer` },
        publisher: { '@id': `${window.location.origin}/#organization` },
        inLanguage: 'it-IT',
      });
      document.head.appendChild(structuredData);
    } else if (missing) {
      robots.content = 'noindex,nofollow';
    }
    return () => {
      document.title = previousTitle;
      if (description && previousDescription !== undefined) description.content = previousDescription;
      if (createdCanonical) canonical?.remove();
      else if (canonical && previousCanonical !== undefined) canonical.href = previousCanonical;
      if (createdRobots) robots?.remove();
      else if (robots && previousRobots !== undefined) robots.content = previousRobots;
      structuredData.remove();
    };
  }, [story, missing]);
}

export default function WeddingSeoPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const [story, setStory] = useState<PublicWeddingStory | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    setLoading(true);
    setStory(null);
    setMissing(false);
    getPublicWeddingStory(slug)
      .then(result => {
        setStory(result);
        setMissing(!result);
      })
      .catch(() => {
        setStory(null);
        setMissing(true);
      })
      .finally(() => setLoading(false));
  }, [slug]);

  useStoryMetadata(story, missing);

  const blocks = story ? parseWeddingStoryMarkdown(story.story) : [];

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#f7f3ed]"><Loader2 className="h-8 w-8 animate-spin text-[#6b7f6b]" /></div>;
  if (missing || !story) return <main className="min-h-screen flex items-center justify-center bg-[#f7f3ed] px-6 text-center"><div><h1 className="font-playfair text-4xl text-gray-800">Storia non disponibile</h1><p className="mt-3 text-gray-600">La pagina non è pubblicata oppure non esiste.</p></div></main>;

  return (
    <main className="min-h-screen bg-[#f7f3ed] text-gray-800">
      <article>
        <header className="mx-auto max-w-4xl px-6 pb-12 pt-20 text-center">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.28em] text-[#6b7f6b]">Real Wedding · Image Studio</p>
          <h1 className="font-playfair text-4xl leading-tight sm:text-6xl">{story.title}</h1>
          {story.excerpt && <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-gray-600">{story.excerpt}</p>}
        </header>

        {story.photos[0] && <img src={story.photos[0].url} alt={story.photos[0].chapterTitle || story.title} className="h-[55vh] w-full object-cover" />}

        <div className="mx-auto max-w-3xl space-y-12 px-6 py-16">
          {blocks.map((block, index) => (
            <section key={`${block.heading || 'intro'}-${index}`}>
              {block.heading && <h2 className="mb-5 font-playfair text-3xl text-gray-900">{block.heading}</h2>}
              <div className="space-y-5 text-lg leading-8 text-gray-700">
                {block.paragraphs.map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}
              </div>
              {story.photos[index + 1] && (
                <figure className="mt-10">
                  <img src={story.photos[index + 1].url} alt={story.photos[index + 1].chapterTitle || story.title} loading="lazy" className="max-h-[75vh] w-full rounded-sm object-cover" />
                  {story.photos[index + 1].chapterTitle && <figcaption className="mt-2 text-center text-sm italic text-gray-500">{story.photos[index + 1].chapterTitle}</figcaption>}
                </figure>
              )}
            </section>
          ))}
          {story.vendors.length > 0 && (
            <section className="border-t border-gray-300 pt-10">
              <h2 className="mb-5 font-playfair text-3xl text-gray-900">Fornitori citati</h2>
              <ul className="grid gap-3 sm:grid-cols-2">
                {story.vendors.map((vendor, index) => (
                  <li key={`${vendor.name}-${vendor.role}-${index}`} className="rounded-lg bg-white p-4">
                    <span className="block font-medium">{vendor.name}</span>
                    <span className="text-sm text-gray-600">{vendor.role}</span>
                    {vendor.url && <a href={vendor.url} target="_blank" rel="noopener noreferrer" className="mt-2 block text-sm text-[#6b7f6b] underline">Visita il sito o profilo pubblico</a>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {story.photos.length > blocks.length + 1 && (
          <section className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {story.photos.slice(blocks.length + 1).map(photo => <img key={photo.id} src={photo.url} alt={photo.chapterTitle || story.title} loading="lazy" className="aspect-[4/3] h-full w-full object-cover" />)}
          </section>
        )}
      </article>
    </main>
  );
}
