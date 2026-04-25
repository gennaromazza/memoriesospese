import { useEffect, useRef, useState } from 'react';
import InteractionPanel from './InteractionPanel';

interface LazyInteractionPanelProps {
  itemId: string;
  itemType: 'photo' | 'voice_memo';
  galleryId: string;
  isAdmin?: boolean;
  className?: string;
  variant?: 'default' | 'floating';
}

export default function LazyInteractionPanel(props: LazyInteractionPanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [shouldMount, setShouldMount] = useState(false);

  useEffect(() => {
    if (shouldMount) return;
    const node = ref.current;
    if (!node) return;

    if (typeof IntersectionObserver === 'undefined') {
      setShouldMount(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShouldMount(true);
          observer.disconnect();
        }
      },
      { rootMargin: '300px 0px' }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [shouldMount]);

  return (
    <div
      ref={ref}
      className={props.className}
      style={{ minHeight: shouldMount ? undefined : 40 }}
      data-testid={`lazy-interaction-${props.itemId}`}
    >
      {shouldMount && <InteractionPanel {...props} />}
    </div>
  );
}
