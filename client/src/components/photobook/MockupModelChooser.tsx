import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import type { MockupOption } from '@shared/mockup-workflow';
import { MOCKUP_MODEL, ROTATING_MOCKUP_MODEL } from '@shared/mockup-catalog';
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from '@/components/ui/carousel';
import './mockup-model-chooser.css';

type CoverExample = { layout: string; title: string; description: string; image: string };
const EXAMPLES: Record<string, CoverExample[]> = {
  [MOCKUP_MODEL.id]: [
    { layout: 'oblique', title: 'Foto e tessuto', description: 'La tua foto incontra il tessuto con un taglio obliquo.', image: 'custodia-oblique.webp' },
    { layout: 'full', title: 'Foto grande', description: 'La tua fotografia protagonista su tutta la copertina.', image: 'custodia-full.webp' },
  ],
  [ROTATING_MOCKUP_MODEL.id]: [
    { layout: 'plaque', title: 'Incisione con i vostri nomi', description: 'Placchetta in legno, iniziali e decorazione botanica.', image: 'girevole-plaque.webp' },
    { layout: 'full', title: 'Foto grande', description: 'La tua fotografia su tutta la copertina dell’album.', image: 'girevole-full.webp' },
    { layout: 'photo-plaque', title: 'Foto piccola sul tessuto', description: 'Una fotografia centrale nel formato della placchetta.', image: 'girevole-photo-plaque.webp' },
  ],
};

/** Gli esempi descrivono esclusivamente i layout dei renderer registrati. Non contengono dati da salvare. */
export function mockupCoverExamples(rendererId: MockupOption['rendererId']): readonly CoverExample[] {
  return rendererId ? EXAMPLES[rendererId] || [] : [];
}

export interface MockupModelChooserProps {
  options: MockupOption[];
  initialOption?: MockupOption;
  onChoose: (option: MockupOption, coverLayout: string) => void;
  onCancel?: () => void;
}

const optionKey = (option: MockupOption) => `${option.labId}/${option.id}`;

/** Due decisioni distinte, prima del caricamento del 3D: modello, poi esempio di copertina. */
export default function MockupModelChooser({ options, initialOption, onChoose, onCancel }: MockupModelChooserProps) {
  const available = options.filter(option => option.active && mockupCoverExamples(option.rendererId).length > 0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected = available.find(option => optionKey(option) === selectedKey);
  const [modelIndex, setModelIndex] = useState(() => Math.max(0, available.findIndex(option => initialOption && optionKey(option) === optionKey(initialOption))));
  const [index, setIndex] = useState(modelIndex);
  const [api, setApi] = useState<CarouselApi>();
  const [canPrevious, setCanPrevious] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const examples = selected ? mockupCoverExamples(selected.rendererId) : [];
  const count = selected ? examples.length : available.length;
  const stage = selected ? `styles-${optionKey(selected)}` : 'models';

  const updatePosition = useCallback((carousel: CarouselApi) => {
    if (!carousel) return;
    if (carousel.containerNode().closest('[data-chooser-track-stage]')?.getAttribute('data-chooser-track-stage') !== stage) return;
    const position = carousel.selectedScrollSnap();
    setIndex(position);
    if (!selected) setModelIndex(position);
    setCanPrevious(carousel.canScrollPrev());
    setCanNext(carousel.canScrollNext());
  }, [stage]);

  useEffect(() => {
    if (!api) return;
    updatePosition(api);
    api.on('select', updatePosition);
    api.on('reInit', updatePosition);
    return () => { api.off('select', updatePosition); api.off('reInit', updatePosition); };
  }, [api, updatePosition]);

  function openStyles(option: MockupOption) {
    setSelectedKey(optionKey(option));
    setIndex(0);
  }

  const imageUrl = (file: string) => `${import.meta.env.BASE_URL}mockups/examples/${file}`;
  // Un catalogo può contenere molti modelli: non trasformare i punti in una seconda barra scorrevole.
  const firstDot = Math.min(Math.max(0, index - 1), Math.max(0, count - 3));
  const dotIndexes = Array.from({ length: Math.min(count, 3) }, (_, offset) => firstDot + offset);

  if (!available.length) return <div className="mockup-chooser mockup-chooser-empty" role="status">
    <h2>Nessun modello disponibile</h2><p>Chiedi allo studio di aggiornare la proposta.</p>
    {onCancel && <button type="button" onClick={onCancel}>Torna al tuo album</button>}
  </div>;

  return <section className="mockup-chooser" data-testid="mockup-model-chooser" data-chooser-stage={selected ? 'styles' : 'models'} aria-label={selected ? `Stili di ${selected.name}` : 'Scelta del modello'}>
    <header className="mockup-chooser-heading">
      <div>
        <h2>{selected ? `Come immagini ${selected.name}?` : 'Quale album preferisci?'}</h2>
        <p>{selected ? 'Scorri gli esempi. Foto e nomi saranno i tuoi.' : 'Scorri i modelli e tocca quello che ti piace.'}</p>
      </div>
      {(selected || onCancel) && <button type="button" className="mockup-chooser-back" onClick={() => selected ? (setSelectedKey(null), setIndex(modelIndex)) : onCancel?.()}>
        <ArrowLeft size={17} aria-hidden="true" /><span>{selected ? 'Modelli' : 'Annulla'}</span>
      </button>}
    </header>
    <Carousel key={stage} className="mockup-chooser-carousel" data-chooser-track-stage={stage} opts={{ align: 'start', containScroll: 'keepSnaps', startIndex: selected ? 0 : Math.min(modelIndex, available.length - 1) }} setApi={setApi} aria-label={selected ? 'Esempi di copertina' : 'Modelli proposti dallo studio'}>
      <CarouselContent className="mockup-chooser-track">
        {selected ? examples.map((example, itemIndex) => <CarouselItem key={example.layout} className="mockup-chooser-slide" aria-label={`${itemIndex + 1} di ${count}: ${example.title}`}>
          <article className="mockup-chooser-card">
            <div className="mockup-chooser-image"><img src={imageUrl(example.image)} alt={`${selected.name}: ${example.title}`} loading={itemIndex ? 'lazy' : 'eager'} draggable={false} /></div>
            <div className="mockup-chooser-description">
              <div className="mockup-chooser-copy">
                <span className="mockup-chooser-eyebrow">{selected.name} · {selected.labName}</span>
                <h3>{example.title}</h3><p>{example.description}</p>
                <small>Esempio illustrativo · colori e foto personalizzabili</small>
              </div>
              <button type="button" className="mockup-chooser-choose" data-testid={`choose-mockup-example-${example.layout}`} tabIndex={index === itemIndex ? 0 : -1} onClick={() => onChoose(selected, example.layout)}>
                Personalizza questo <ArrowRight size={17} aria-hidden="true" />
              </button>
            </div>
          </article>
        </CarouselItem>) : available.map((option, itemIndex) => {
          const representative = mockupCoverExamples(option.rendererId)[0];
          return <CarouselItem key={optionKey(option)} className="mockup-chooser-slide" aria-label={`${itemIndex + 1} di ${count}: ${option.name}`}>
            <button type="button" className="mockup-chooser-card mockup-chooser-model" tabIndex={index === itemIndex ? 0 : -1} onClick={() => openStyles(option)} aria-label={`Scopri ${option.name}`}>
              <span className="mockup-chooser-image"><img src={imageUrl(representative.image)} alt={`Anteprima del modello ${option.name}`} loading={itemIndex ? 'lazy' : 'eager'} draggable={false} /></span>
              <span className="mockup-chooser-description">
                <span className="mockup-chooser-copy">
                  <span className="mockup-chooser-eyebrow">{option.labName}</span>
                  <strong className="mockup-chooser-model-name">{option.name}</strong>
                  <span className="mockup-chooser-model-copy">{option.rendererId === ROTATING_MOCKUP_MODEL.id ? 'Album estraibile in uno scrigno che ruota.' : 'Album estraibile e custodia rivestita in tessuto.'}</span>
                </span>
                <span className="mockup-chooser-choose">Scopri questo modello <ArrowRight size={17} aria-hidden="true" /></span>
              </span>
            </button>
          </CarouselItem>;
        })}
      </CarouselContent>
    </Carousel>
    <nav className="mockup-chooser-navigation" aria-label={selected ? 'Scorri gli esempi' : 'Scorri i modelli'}>
      <button type="button" className="mockup-chooser-arrow" aria-label={selected ? 'Esempio precedente' : 'Modello precedente'} disabled={!canPrevious} onClick={() => api?.scrollPrev()}><ChevronLeft size={22} aria-hidden="true" /></button>
      <div className="mockup-chooser-pagination">
        <span aria-live="polite" aria-atomic="true">{Math.min(index + 1, count)} / {count}</span>
        <div className="mockup-chooser-dots">{dotIndexes.map(dot => <button type="button" key={dot} aria-label={`Mostra ${selected ? 'esempio' : 'modello'} ${dot + 1}`} aria-current={index === dot ? 'true' : undefined} onClick={() => api?.scrollTo(dot)}><span /></button>)}</div>
      </div>
      <button type="button" className="mockup-chooser-arrow" aria-label={selected ? 'Esempio successivo' : 'Modello successivo'} disabled={!canNext} onClick={() => api?.scrollNext()}><ChevronRight size={22} aria-hidden="true" /></button>
    </nav>
  </section>;
}
