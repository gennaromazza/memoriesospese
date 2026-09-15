import { useState } from 'react';
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import './_group.css';

type Model = { id: string; name: string; lab: string; copy: string; examples: Example[] };
type Example = { layout: string; title: string; description: string; image: string };
const asset = (name: string) => `/__mockup/images/photobook-chooser/${name}`;
const models: Model[] = [
  { id: 'custodia', name: 'Custodia', lab: 'Image Studio', copy: 'Album estraibile e custodia rivestita in tessuto.', examples: [
    { layout: 'oblique', title: 'Foto e tessuto', description: 'La tua foto incontra il tessuto con un taglio obliquo.', image: asset('custodia-oblique.webp') },
    { layout: 'full', title: 'Foto grande', description: 'La tua fotografia protagonista su tutta la copertina.', image: asset('custodia-full.webp') },
  ] },
  { id: 'girevole', name: 'Girevole', lab: 'Image Studio', copy: 'Album estraibile in uno scrigno che ruota.', examples: [
    { layout: 'plaque', title: 'Incisione con i vostri nomi', description: 'Placchetta in legno, iniziali e decorazione botanica.', image: asset('girevole-plaque.webp') },
    { layout: 'full', title: 'Foto grande', description: 'La tua fotografia su tutta la copertina dell’album.', image: asset('girevole-full.webp') },
    { layout: 'photo-plaque', title: 'Foto piccola sul tessuto', description: 'Una fotografia centrale nel formato della placchetta.', image: asset('girevole-photo-plaque.webp') },
    { layout: 'split-photo-fabric', title: 'Foto e tessuto inciso', description: 'Una metà con la tua foto e una metà in tessuto con il monogramma inciso.', image: asset('girevole-split-photo-fabric.svg') },
  ] },
];

export function Current() {
  const [modelIndex, setModelIndex] = useState(0);
  const [selected, setSelected] = useState<Model | null>(null);
  const [index, setIndex] = useState(0);
  const [chosenLayout, setChosenLayout] = useState<string | null>(null);
  const count = selected ? selected.examples.length : models.length;
  const currentExample = selected?.examples[index];
  const currentModel = models[index]!;
  const firstDot = Math.min(Math.max(0, index - 1), Math.max(0, count - 3));
  const dots = Array.from({ length: Math.min(count, 3) }, (_, i) => firstDot + i);
  const move = (delta: number) => setIndex(Math.max(0, Math.min(count - 1, index + delta)));
  const back = () => { if (selected) { setSelected(null); setChosenLayout(null); setIndex(modelIndex); } };

  return <section className="mockup-chooser" data-testid="mockup-model-chooser" data-chooser-stage={selected ? 'styles' : 'models'} aria-label={selected ? `Stili di ${selected.name}` : 'Scelta del modello'}>
    <header className="mockup-chooser-heading"><div>
      <h2>{selected ? `Scegli lo stile di ${selected.name}` : 'Quale album preferisci?'}</h2>
      <p>{selected ? 'Scorri gli esempi. Foto e nomi saranno i tuoi.' : 'Scorri i modelli e tocca quello che ti piace.'}</p>
    </div>{selected && <button type="button" className="mockup-chooser-back" onClick={back}><ArrowLeft size={17} aria-hidden="true" /><span>Modelli</span></button>}</header>
    <div className="mockup-chooser-carousel"><div className="mockup-chooser-track">
      <div className="mockup-chooser-slide" aria-label={`${index + 1} di ${count}`}>
        {selected && currentExample ? <article className="mockup-chooser-card"><div className="mockup-chooser-image"><img src={currentExample.image} alt={`${selected.name}: ${currentExample.title}`} draggable={false} /></div><div className="mockup-chooser-description"><div className="mockup-chooser-copy"><span className="mockup-chooser-eyebrow">{selected.name} · {selected.lab}</span><h3>{currentExample.title}</h3><p>{currentExample.description}</p><small>Esempio illustrativo · colori e foto personalizzabili</small></div><button type="button" className="mockup-chooser-choose" data-testid={`choose-mockup-example-${currentExample.layout}`} onClick={() => setChosenLayout(currentExample.layout)}>{chosenLayout === currentExample.layout ? 'Stile selezionato' : 'Personalizza questo'} <ArrowRight size={17} aria-hidden="true" /></button></div></article>
        : <button type="button" className="mockup-chooser-card mockup-chooser-model" onClick={() => { setSelected(currentModel); setModelIndex(index); setIndex(0); }}><span className="mockup-chooser-image"><img src={currentModel.examples[0].image} alt={`Anteprima del modello ${currentModel.name}`} draggable={false} /></span><span className="mockup-chooser-description"><span className="mockup-chooser-copy"><span className="mockup-chooser-eyebrow">{currentModel.lab}</span><strong className="mockup-chooser-model-name">{currentModel.name}</strong><span className="mockup-chooser-model-copy">{currentModel.copy}</span></span><span className="mockup-chooser-choose">Scopri questo modello <ArrowRight size={17} aria-hidden="true" /></span></span></button>}
      </div>
    </div></div>
    <nav className="mockup-chooser-navigation" aria-label={selected ? 'Scorri gli esempi' : 'Scorri i modelli'}><button type="button" className="mockup-chooser-arrow" aria-label="Precedente" disabled={index === 0} onClick={() => move(-1)}><ChevronLeft size={22} aria-hidden="true" /></button><div className="mockup-chooser-pagination"><span aria-live="polite">{index + 1} / {count}</span><div className="mockup-chooser-dots">{dots.map(dot => <button type="button" key={dot} aria-label={`Mostra ${dot + 1}`} aria-current={index === dot ? 'true' : undefined} onClick={() => setIndex(dot)}><span /></button>)}</div></div><button type="button" className="mockup-chooser-arrow" aria-label="Successivo" disabled={index === count - 1} onClick={() => move(1)}><ChevronRight size={22} aria-hidden="true" /></button></nav>
  </section>;
}