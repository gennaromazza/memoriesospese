import { Fragment } from 'react';
import { parseWeddingStoryInlineMarkdown } from '@/lib/wedding-story-format';

interface Props {
  text: string;
  currentOrigin?: string;
}

export default function WeddingStoryInline({ text, currentOrigin }: Props) {
  const parts = parseWeddingStoryInlineMarkdown(text, currentOrigin);

  return (
    <>
      {parts.map((part, index) => part.type === 'link' ? (
        <a
          key={`${part.href}-${index}`}
          href={part.href}
          {...(part.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          className="text-[#526d52] underline underline-offset-2 transition-colors hover:text-[#435b43]"
        >
          {part.label}
        </a>
      ) : (
        <Fragment key={`text-${index}`}>{part.value}</Fragment>
      ))}
    </>
  );
}