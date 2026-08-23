export interface WeddingStoryBlock {
  heading?: string;
  paragraphs: string[];
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