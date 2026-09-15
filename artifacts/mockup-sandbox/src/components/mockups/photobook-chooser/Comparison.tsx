import { ArrowLeft, ArrowRight, Check, CircleHelp, Layers3 } from 'lucide-react';
import { useState } from 'react';
import './Comparison.css';

type CoverExample = {
  layout: string;
  title: string;
  description: string;
  image: string;
};

type Model = {
  id: 'custodia' | 'girevole';
  name: string;
  descriptor: string;
  promise: string;
  difference: string;
  image: string;
  examples: CoverExample[];
};

const asset = (name: string) => `/__mockup/images/photobook-chooser/${name}`;

const models: Model[] = [
  {
    id: 'custodia',
    name: 'Custodia',
    descriptor: 'L’album da conservare',
    promise: 'Un gesto calmo: sfili il libro dalla sua custodia e lo ritrovi ogni volta come nuovo.',
    difference: 'La custodia protegge il tuo album e diventa parte del rituale di apertura.',
    image: asset('custodia-oblique.webp'),
    examples: [
      {
        layout: 'oblique',
        title: 'Foto e tessuto',
        description: 'La tua foto incontra il tessuto con un taglio obliquo.',
        image: asset('custodia-oblique.webp'),
      },
      {
        layout: 'full',
        title: 'Foto grande',
        description: 'La tua fotografia protagonista su tutta la copertina.',
        image: asset('custodia-full.webp'),
      },
    ],
  },
  {
    id: 'girevole',
    name: 'Girevole',
    descriptor: 'L’album da scoprire',
    promise: 'Un’apertura sorprendente: lo scrigno ruota e rivela il tuo album con un piccolo movimento.',
    difference: 'Lo scrigno ruota sul suo asse: più scenografico, pensato per essere mostrato.',
    image: asset('girevole-full.webp'),
    examples: [
      {
        layout: 'plaque',
        title: 'Incisione con i vostri nomi',
        description: 'Placchetta in legno, iniziali e decorazione botanica.',
        image: asset('girevole-plaque.webp'),
      },
      {
        layout: 'full',
        title: 'Foto grande',
        description: 'La tua fotografia su tutta la copertina dell’album.',
        image: asset('girevole-full.webp'),
      },
      {
        layout: 'photo-plaque',
        title: 'Foto piccola sul tessuto',
        description: 'Una fotografia centrale nel formato della placchetta.',
        image: asset('girevole-photo-plaque.webp'),
      },
      {
        layout: 'split-photo-fabric',
        title: 'Foto e tessuto inciso',
        description: 'Una metà con la tua foto, una metà in tessuto con il monogramma.',
        image: asset('girevole-split-photo-fabric.svg'),
      },
    ],
  },
];

export function Comparison() {
  const [selectedModel, setSelectedModel] = useState<Model | null>(null);
  const [selectedLayout, setSelectedLayout] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const chooseModel = (model: Model) => {
    setSelectedModel(model);
    setSelectedLayout(null);
    setConfirmed(false);
  };

  const returnToModels = () => {
    setSelectedModel(null);
    setSelectedLayout(null);
    setConfirmed(false);
  };

  const chooseLayout = (layout: string) => {
    setSelectedLayout(layout);
    setConfirmed(false);
  };

  return (
    <section
      className="comparison-chooser"
      aria-label={selectedModel ? `Scelta dello stile ${selectedModel.name}` : 'Scelta del modello di album'}
      data-chooser-stage={selectedModel ? 'styles' : 'models'}
      data-selected-model={selectedModel?.id ?? ''}
      data-selected-layout={selectedLayout ?? ''}
    >
      <header className="comparison-chooser__masthead">
        <div className="comparison-chooser__mark">Image Studio</div>
        <div className="comparison-chooser__context">
          {selectedModel ? '02 · Scegli il rivestimento' : '01 · Scegli il modello'}
        </div>
      </header>

      <main className="comparison-chooser__main">
        {!selectedModel ? (
          <>
            <div className="comparison-chooser__intro">
              <div>
                <p className="comparison-chooser__kicker">Il primo gesto</p>
                <h1 className="comparison-chooser__title">Come vuoi vivere il tuo album?</h1>
              </div>
              <p className="comparison-chooser__intro-copy">
                Due modi diversi di custodire le tue immagini. Prima scegli l’esperienza che ti somiglia,
                poi entreremo nei dettagli della copertina.
              </p>
            </div>

            <div className="comparison-chooser__rule">
              <span>Confronta i modelli</span>
            </div>

            <div className="comparison-chooser__comparison">
              {models.map((model, index) => (
                <article className="comparison-chooser__card" key={model.id}>
                  <div className={`comparison-chooser__visual comparison-chooser__visual--${model.id}`}>
                    <span className="comparison-chooser__number" aria-hidden="true">
                      0{index + 1}
                    </span>
                    <img
                      src={model.image}
                      alt={`Esempio del modello ${model.name}: ${model.descriptor.toLowerCase()}`}
                      draggable={false}
                    />
                  </div>
                  <div className="comparison-chooser__body">
                    <p className="comparison-chooser__eyebrow">{model.descriptor}</p>
                    <h2 className="comparison-chooser__card-title">{model.name}</h2>
                    <p className="comparison-chooser__card-copy">{model.promise}</p>
                    <div className="comparison-chooser__difference">
                      <Layers3 size={15} strokeWidth={1.7} aria-hidden="true" />
                      <span>{model.difference}</span>
                    </div>
                    <button
                      type="button"
                      className="comparison-chooser__select"
                      aria-label={`Scegli il modello ${model.name}`}
                      onClick={() => chooseModel(model)}
                    >
                      <span>Scegli {model.name}</span>
                      <ArrowRight size={17} strokeWidth={1.8} aria-hidden="true" />
                    </button>
                  </div>
                </article>
              ))}
            </div>

            <p className="comparison-chooser__footnote">
              <CircleHelp size={14} strokeWidth={1.7} aria-hidden="true" />
              <span>Non devi ancora scegliere materiali o colori.</span>
            </p>
          </>
        ) : (
          <>
            <div className="comparison-chooser__style-header">
              <div>
                <p className="comparison-chooser__kicker">Il secondo gesto</p>
                <h1 className="comparison-chooser__title">Dai una veste a {selectedModel.name}.</h1>
                <p className="comparison-chooser__selected-model">
                  Modello scelto: <strong>{selectedModel.name}</strong>
                </p>
              </div>
              <button
                type="button"
                className="comparison-chooser__back"
                onClick={returnToModels}
                aria-label="Torna alla scelta del modello"
              >
                <ArrowLeft size={15} strokeWidth={1.8} aria-hidden="true" />
                <span>Cambia modello</span>
              </button>
            </div>

            <div className="comparison-chooser__rule">
              <span>Scegli il layout della copertina</span>
            </div>

            <div className="comparison-chooser__styles" role="group" aria-label={`Layout di copertina per ${selectedModel.name}`}>
              {selectedModel.examples.map((example) => {
                const isSelected = selectedLayout === example.layout;

                return (
                  <button
                    type="button"
                    className="comparison-chooser__style-option"
                    key={example.layout}
                    aria-pressed={isSelected}
                    aria-label={`${example.title}: ${example.description}`}
                    onClick={() => chooseLayout(example.layout)}
                  >
                    <span className={`comparison-chooser__style-image comparison-chooser__style-image--${selectedModel.id}`}>
                      <img
                        src={example.image}
                        alt=""
                        draggable={false}
                      />
                      {isSelected ? (
                        <span className="comparison-chooser__style-check">
                          <Check size={14} strokeWidth={2.2} aria-hidden="true" />
                        </span>
                      ) : null}
                    </span>
                    <div className="comparison-chooser__style-meta">
                      <span className="comparison-chooser__eyebrow">{selectedModel.name}</span>
                      <div className="comparison-chooser__style-action">
                        <h3 className="comparison-chooser__style-meta-title">{example.title}</h3>
                        <ArrowRight size={15} strokeWidth={1.8} aria-hidden="true" />
                      </div>
                      <p className="comparison-chooser__style-description">{example.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              className="comparison-chooser__continue"
              disabled={!selectedLayout}
              onClick={() => setConfirmed(true)}
              aria-label={selectedLayout ? 'Continua con questo layout' : 'Scegli un layout per continuare'}
            >
              <span>{confirmed ? 'Scelta salvata' : 'Continua con questo layout'}</span>
              {confirmed ? (
                <Check size={16} strokeWidth={2.2} aria-hidden="true" />
              ) : (
                <ArrowRight size={16} strokeWidth={1.8} aria-hidden="true" />
              )}
            </button>
            <p className="comparison-chooser__status" aria-live="polite">
              {confirmed && selectedLayout
                ? `${selectedModel.name} · ${selectedModel.examples.find((example) => example.layout === selectedLayout)?.title}`
                : ''}
            </p>
          </>
        )}
      </main>
    </section>
  );
}