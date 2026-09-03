import { useEffect } from 'react';
import {
  canonicalUrl,
  resolveSocialImage,
  staticPageMetadata,
  staticSocialImage,
  type SocialImageSource,
} from '@shared/social-metadata';

interface SEOProps {
  title: string;
  description: string;
  canonical?: string;
  ogType?: string;
  ogImage?: string;
  ogImageAlt?: string;
  ogImageWidth?: number;
  ogImageHeight?: number;
  ogImageType?: string;
  ogImageSource?: SocialImageSource;
  keywords?: string;
  noindex?: boolean;
}

const DEFAULT_ROBOTS = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';

function setUniqueMeta(attr: 'name' | 'property', key: string, content?: string) {
  const tags = Array.from(document.querySelectorAll<HTMLMetaElement>(`meta[${attr}="${key}"]`));
  if (!content) {
    tags.forEach(tag => tag.remove());
    return;
  }
  const tag = tags.shift() || document.head.appendChild(document.createElement('meta'));
  tag.setAttribute(attr, key);
  tag.setAttribute('content', content);
  tags.forEach(duplicate => duplicate.remove());
}

function setUniqueCanonical(url: string) {
  const links = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="canonical"]'));
  const link = links.shift() || document.head.appendChild(document.createElement('link'));
  link.setAttribute('rel', 'canonical');
  link.setAttribute('href', url);
  links.forEach(duplicate => duplicate.remove());
}

const MANAGED_META = [
  ['name', 'description'], ['name', 'keywords'], ['name', 'robots'],
  ['property', 'og:title'], ['property', 'og:description'], ['property', 'og:type'],
  ['property', 'og:url'], ['property', 'og:image'], ['property', 'og:image:width'],
  ['property', 'og:image:height'], ['property', 'og:image:type'], ['property', 'og:image:alt'],
  ['property', 'og:locale'], ['property', 'og:site_name'],
  ['name', 'twitter:card'], ['name', 'twitter:title'], ['name', 'twitter:description'],
  ['name', 'twitter:image'], ['name', 'twitter:image:alt'],
] as const;

export function useSEO({
  title,
  description,
  canonical,
  ogType = 'website',
  ogImage,
  ogImageAlt,
  ogImageWidth,
  ogImageHeight,
  ogImageType,
  ogImageSource,
  keywords,
  noindex,
}: SEOProps) {
  useEffect(() => {
    const fullCanonical = canonicalUrl(canonical || window.location.pathname);
    const sharedPage = staticPageMetadata(fullCanonical);
    const effectiveTitle = sharedPage?.title || title;
    const effectiveDescription = sharedPage?.description || description;
    const socialImage = resolveSocialImage([
      {
        url: ogImage,
        alt: ogImageAlt || effectiveTitle,
        width: ogImageWidth,
        height: ogImageHeight,
        type: ogImageType,
        source: ogImageSource,
      },
      staticSocialImage(fullCanonical),
    ]);

    document.title = effectiveTitle;
    setUniqueMeta('name', 'description', effectiveDescription);
    setUniqueMeta('name', 'keywords', keywords);
    setUniqueMeta('name', 'robots', noindex ? 'noindex, nofollow' : DEFAULT_ROBOTS);
    setUniqueCanonical(fullCanonical);

    setUniqueMeta('property', 'og:title', effectiveTitle);
    setUniqueMeta('property', 'og:description', effectiveDescription);
    setUniqueMeta('property', 'og:type', ogType);
    setUniqueMeta('property', 'og:url', fullCanonical);
    setUniqueMeta('property', 'og:image', socialImage.url);
    setUniqueMeta('property', 'og:image:width', socialImage.width?.toString());
    setUniqueMeta('property', 'og:image:height', socialImage.height?.toString());
    setUniqueMeta('property', 'og:image:type', socialImage.type);
    setUniqueMeta('property', 'og:image:alt', socialImage.alt);
    setUniqueMeta('property', 'og:locale', 'it_IT');
    setUniqueMeta('property', 'og:site_name', 'Image Studio');

    setUniqueMeta('name', 'twitter:card', 'summary_large_image');
    setUniqueMeta('name', 'twitter:title', effectiveTitle);
    setUniqueMeta('name', 'twitter:description', effectiveDescription);
    setUniqueMeta('name', 'twitter:image', socialImage.url);
    setUniqueMeta('name', 'twitter:image:alt', socialImage.alt);

    return () => {
      document.title = 'Image Studio – Fotografia e Storytelling Digitale';
      MANAGED_META.forEach(([attr, key]) => {
        document.querySelectorAll(`meta[${attr}="${key}"]`).forEach(tag => tag.remove());
      });
      document.querySelectorAll('link[rel="canonical"]').forEach(link => link.remove());
    };
  }, [
    title, description, canonical, ogType, ogImage, ogImageAlt, ogImageWidth,
    ogImageHeight, ogImageType, ogImageSource, keywords, noindex,
  ]);
}