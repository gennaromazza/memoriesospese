import { useEffect } from 'react';

interface SEOProps {
  title: string;
  description: string;
  canonical?: string;
  ogType?: string;
  ogImage?: string;
  keywords?: string;
  noindex?: boolean;
}

const BASE_URL = 'https://imagestudiofotografico.com';
const DEFAULT_OG_IMAGE = `${BASE_URL}/1200x630px.jpg`;
const DEFAULT_ROBOTS = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';

function setMetaTag(attr: string, key: string, content: string) {
  let tag = document.querySelector(`meta[${attr}="${key}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attr, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
}

function setCanonical(url: string) {
  let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    document.head.appendChild(link);
  }
  link.setAttribute('href', url);
}

export function useSEO({ title, description, canonical, ogType = 'website', ogImage, keywords, noindex }: SEOProps) {
  useEffect(() => {
    document.title = title;

    setMetaTag('name', 'description', description);
    if (keywords) setMetaTag('name', 'keywords', keywords);

    setMetaTag('name', 'robots', noindex ? 'noindex, nofollow' : DEFAULT_ROBOTS);

    setMetaTag('property', 'og:title', title);
    setMetaTag('property', 'og:description', description);
    setMetaTag('property', 'og:type', ogType);
    setMetaTag('property', 'og:image', ogImage || DEFAULT_OG_IMAGE);
    setMetaTag('property', 'og:locale', 'it_IT');
    setMetaTag('property', 'og:site_name', 'Image Studio');

    setMetaTag('name', 'twitter:card', 'summary_large_image');
    setMetaTag('name', 'twitter:title', title);
    setMetaTag('name', 'twitter:description', description);
    setMetaTag('name', 'twitter:image', ogImage || DEFAULT_OG_IMAGE);

    if (canonical) {
      const fullCanonical = canonical.startsWith('http') ? canonical : `${BASE_URL}${canonical}`;
      setCanonical(fullCanonical);
      setMetaTag('property', 'og:url', fullCanonical);
    }

    return () => {
      document.title = 'Image Studio – Fotografia e Storytelling Digitale';
      setMetaTag('name', 'robots', DEFAULT_ROBOTS);
    };
  }, [title, description, canonical, ogType, ogImage, keywords, noindex]);
}
