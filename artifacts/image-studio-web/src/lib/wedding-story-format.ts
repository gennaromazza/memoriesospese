export interface WeddingStoryBlock {
  heading?: string;
  paragraphs: string[];
}

export interface WeddingStoryTextPart {
  type: 'text';
  value: string;
}

export interface WeddingStoryLinkPart {
  type: 'link';
  label: string;
  href: string;
  external: boolean;
}

export type WeddingStoryInlinePart = WeddingStoryTextPart | WeddingStoryLinkPart;

const WEDDING_STORY_LINK_PATTERN = /\[([^\]\r\n]+)\]\(([^)\s]+)\)/g;
const WEDDING_STORY_SITE_HOSTS = new Set([
  'imagestudiofotografico.com',
  'memoriesospese.it',
]);

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, '');
}

function isSafeWeddingStoryUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (/[<>"\u0000-\u001f\u007f]/u.test(value)) return null;
    return url;
  } catch {
    return null;
  }
}

function isInternalWeddingStoryUrl(url: URL, currentOrigin?: string): boolean {
  if (currentOrigin) {
    try {
      if (url.origin === new URL(currentOrigin).origin) return true;
    } catch {
      // An invalid optional origin must not make a valid story link unusable.
    }
  } else if (typeof window !== 'undefined' && url.origin === window.location.origin) {
    return true;
  }

  return WEDDING_STORY_SITE_HOSTS.has(normalizeHost(url.hostname));
}

/**
 * Parses only the small inline Markdown subset supported by Real Wedding.
 * Unrecognized or unsafe candidates are returned as literal text.
 */
export function parseWeddingStoryInlineMarkdown(value: string, currentOrigin?: string): WeddingStoryInlinePart[] {
  const parts: WeddingStoryInlinePart[] = [];
  let lastIndex = 0;

  for (const match of value.matchAll(WEDDING_STORY_LINK_PATTERN)) {
    const fullMatch = match[0];
    const matchIndex = match.index ?? 0;
    if (matchIndex > lastIndex) {
      parts.push({ type: 'text', value: value.slice(lastIndex, matchIndex) });
    }

    const label = match[1];
    const href = match[2];
    const url = isSafeWeddingStoryUrl(href);
    if (url) {
      parts.push({
        type: 'link',
        label,
        href,
        external: !isInternalWeddingStoryUrl(url, currentOrigin),
      });
    } else {
      parts.push({ type: 'text', value: fullMatch });
    }
    lastIndex = matchIndex + fullMatch.length;
  }

  if (lastIndex < value.length) {
    parts.push({ type: 'text', value: value.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ type: 'text', value }];
}

export function weddingStorySlug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

export function parseWeddingStoryMarkdown(value: string): WeddingStoryBlock[] {
  const blocks: WeddingStoryBlock[] = [];
  let current: WeddingStoryBlock = { paragraphs: [] };
  let paragraphLines: string[] = [];

  const flushParagraph = () => {
    const paragraph = paragraphLines.join(' ').trim();
    if (paragraph) current.paragraphs.push(paragraph);
    paragraphLines = [];
  };
  const flushBlock = () => {
    flushParagraph();
    if (current.heading || current.paragraphs.length) blocks.push(current);
  };

  for (const line of value.split('\n')) {
    const trimmed = line.trim();
    const heading = trimmed.match(/^#{1,3}\s+(.+)$/);
    if (heading) {
      flushBlock();
      current = { heading: heading[1].trim(), paragraphs: [] };
    } else if (!trimmed) {
      flushParagraph();
    } else {
      paragraphLines.push(trimmed);
    }
  }
  flushBlock();
  return blocks;
}