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

    let idleHandle: number | null = null;
    let timeoutHandle: number | null = null;
    const w = window as any;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          // Defer del mount: lasciamo al browser il tempo di decodificare/dipingere
          // le immagini visibili (priorità UX più alta), poi montiamo i pannelli.
          if (typeof w.requestIdleCallback === 'function') {
            // timeout: garantisce il mount entro 250ms anche con main thread occupato
            idleHandle = w.requestIdleCallback(() => setShouldMount(true), { timeout: 250 });
          } else {
            timeoutHandle = window.setTimeout(() => setShouldMount(true), 120);
          }
        }
      },
      // Margine ridotto: pre-mount solo quando il pannello è vicino al viewport,
      // così le icone non compaiono "prima" delle foto fuori schermo.
      { rootMargin: '120px 0px' }
    );

    observer.observe(node);
    return () => {
      observer.disconnect();
      if (idleHandle !== null && typeof w.cancelIdleCallback === 'function') {
        w.cancelIdleCallback(idleHandle);
      }
      if (timeoutHandle !== null) {
        window.clearTimeout(timeoutHandle);
      }
    };
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
