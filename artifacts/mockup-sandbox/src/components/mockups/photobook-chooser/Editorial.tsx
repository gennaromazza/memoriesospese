import { useState } from 'react';
import './Editorial.css';

type ModelId = 'custodia' | 'girevole';
type Stage = 'models' | 'covers';

type Cover = {
  id: string;
  title: string;
  description: string;
  image: string;
};

type Model = {
  id: ModelId;
  name: string;
  strapline: string;
  description: string;
  detail: string;
  image: string;
  covers: Cover[];
};

const asset = (name: string) => `/__mockup/images/photobook-chooser/${name}`;

const models: Model[] = [
  {
    id: 'custodia',
    name: 'Custodia',
    strapline: 'La scelta per chi ama le fotografie protagoniste.',
    description:
      'Un album estraibile in una custodia morbida e rivestita. Essenziale da fuori, sorprendente quando si apre.',
    detail: 'Più spazio all’immagine · gesto semplice · presenza discreta',
    image: asset('custodia-oblique.webp'),
    covers: [
      {
        id: 'oblique',
        title: 'Foto e tessuto',
        description: 'Una fotografia incontra il tessuto con un taglio obliquo.',
        image: asset('custodia-oblique.webp'),
      },
      {
        id: 'full',
        title: 'Foto grande',
        description: 'La tua fotografia prende tutta la scena sulla copertina.',
        image: asset('custodia-full.webp'),
      },
    ],
  },
  {
    id: 'girevole',
    name: 'Girevole',
    strapline: 'Per chi vuole un oggetto da scoprire.',
    description:
      'Un album estraibile custodito in uno scrigno che ruota. Più materico, più rituale, pensato per essere mostrato.',
    detail: 'Scrigno scenografico · dettagli tattili · apertura da condividere',
    image: asset('girevole-plaque.webp'),
    covers: [
      {
        id: 'plaque',
        title: 'Placchetta incisa',
        description: 'Nomi, iniziali e una decorazione botanica nel legno.',
        image: asset('girevole-plaque.webp'),
      },
      {
        id: 'full',
        title: 'Foto grande',
        description: 'Una fotografia intera sulla copertina dello scrigno.',
        image: asset('girevole-full.webp'),
      },
      {
        id: 'photo-plaque',
        title: 'Foto e placchetta',
        description: 'Una piccola fotografia centrale, come un ritratto custodito.',
        image: asset('girevole-photo-plaque.webp'),
      },
      {
        id: 'split-photo-fabric',
        title: 'Foto e tessuto inciso',
        description: 'Metà fotografia, metà tessuto con monogramma inciso.',
        image: asset('girevole-split-photo-fabric.svg'),
      },
    ],
  },
];

function ArrowIcon({ direction = 'right' }: { direction?: 'left' | 'right' }) {
  return (
    <svg
      aria-hidden="true"
      className="editorial-icon"
      viewBox="0 0 20 20"
      fill="none"
    >
      {direction === 'left' ? (
        <path d="M12.7 3.8 6.5 10l6.2 6.2M7 10h7.1" />
      ) : (
        <path d="m7.3 3.8 6.2 6.2-6.2 6.2M13 10H5.9" />
      )}
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" className="editorial-check" viewBox="0 0 16 16" fill="none">
      <path d="m3.2 8.3 3.1 3.1 6.5-6.8" />
    </svg>
  );
}

export function Editorial() {
  const [stage, setStage] = useState<Stage>('models');
  const [modelId, setModelId] = useState<ModelId>('custodia');
  const [coverId, setCoverId] = useState('oblique');
  const [confirmed, setConfirmed] = useState(false);

  const model = models.find((item) => item.id === modelId) ?? models[0];
  const selectedCover = model.covers.find((cover) => cover.id === coverId) ?? model.covers[0];

  const chooseModel = (nextModel: Model) => {
    setModelId(nextModel.id);
    setCoverId(nextModel.covers[0].id);
    setConfirmed(false);
    setStage('covers');
  };

  const goBack = () => {
    setConfirmed(false);
    setStage('models');
  };

  return (
    <main
      className="editorial-chooser"
      data-chooser-stage={stage}
      data-model-id={model.id}
      data-cover-layout={selectedCover.id}
      aria-label="Configura il tuo photobook"
    >
      <div className="editorial-shell">
        <header className="editorial-topbar">
          <div className="editorial-brand" aria-label="Image Studio">
            <span className="editorial-brand-mark" aria-hidden="true">
              IS
            </span>
            <span>Image Studio</span>
          </div>
          <div className="editorial-progress" aria-label={`Passaggio ${stage === 'models' ? '1' : '2'} di 2`}>
            <span className={stage === 'models' ? 'is-current' : 'is-done'}>01 Modello</span>
            <i aria-hidden="true" />
            <span className={stage === 'covers' ? 'is-current' : undefined}>02 Copertina</span>
          </div>
          <span className="editorial-edition">Edizione 2024</span>
        </header>

        {stage === 'models' ? (
          <section className="editorial-stage editorial-model-stage" aria-labelledby="editorial-model-title">
            <div className="editorial-intro">
              <p className="editorial-kicker">
                <span>01</span> Prima scegli la forma
              </p>
              <h1 id="editorial-model-title">
                Che tipo di <em>album</em> vuoi tenere tra le mani?
              </h1>
              <p className="editorial-intro-copy">
                Due modi diversi di custodire la stessa storia. Parti dal modello: alla copertina
                pensiamo subito dopo.
              </p>
            </div>

            <div className="editorial-model-layout">
              <article className="editorial-feature-card">
                <div className="editorial-feature-media">
                  <img src={models[0].image} alt="Photobook Custodia con inserto fotografico" draggable={false} />
                  <span className="editorial-recommendation">
                    <span className="editorial-star" aria-hidden="true" />
                    La più scelta
                  </span>
                  <span className="editorial-image-note">01 / 02</span>
                </div>
                <div className="editorial-feature-copy">
                  <div className="editorial-model-heading">
                    <div>
                      <p className="editorial-overline">Il modello più versatile</p>
                      <h2>{models[0].name}</h2>
                    </div>
                    <span className="editorial-model-number">A</span>
                  </div>
                  <p>{models[0].strapline}</p>
                  <p className="editorial-muted-copy">{models[0].description}</p>
                  <div className="editorial-detail-line">
                    <span aria-hidden="true" />
                    {models[0].detail}
                  </div>
                  <button
                    type="button"
                    className="editorial-primary-action"
                    onClick={() => chooseModel(models[0])}
                  >
                    Scegli Custodia
                    <ArrowIcon />
                  </button>
                </div>
              </article>

              <aside className="editorial-alternative" aria-label="Alternativa di modello">
                <div className="editorial-alternative-label">
                  <span>In alternativa</span>
                  <span>02</span>
                </div>
                <button
                  type="button"
                  className="editorial-alternative-card"
                  onClick={() => chooseModel(models[1])}
                  aria-label="Scegli il modello Girevole"
                >
                  <span className="editorial-alternative-media">
                    <img src={models[1].image} alt="" draggable={false} />
                  </span>
                  <span className="editorial-alternative-copy">
                    <span className="editorial-overline">Più scenografico</span>
                    <strong>{models[1].name}</strong>
                    <span>{models[1].strapline}</span>
                    <span className="editorial-text-link">
                      Scopri Girevole <ArrowIcon />
                    </span>
                  </span>
                </button>
                <p className="editorial-alternative-note">
                  Sceglilo se vuoi che l’album diventi parte del rito del racconto.
                </p>
              </aside>
            </div>

            <footer className="editorial-stage-footer">
              <span className="editorial-footer-rule" />
              <span>Puoi cambiare idea in ogni momento</span>
              <span className="editorial-footer-rule" />
            </footer>
          </section>
        ) : (
          <section className="editorial-stage editorial-cover-stage" aria-labelledby="editorial-cover-title">
            <div className="editorial-cover-heading">
              <button type="button" className="editorial-back-action" onClick={goBack}>
                <ArrowIcon direction="left" />
                Torna ai modelli
              </button>
              <p className="editorial-kicker">
                <span>02</span> Ora scegli la copertina
              </p>
              <h1 id="editorial-cover-title">
                Il tuo <em>{model.name}</em>, come lo immagini?
              </h1>
              <p className="editorial-intro-copy">
                Il modello è scelto. Qui puoi dare il tono alla prima impressione.
              </p>
            </div>

            <div className="editorial-cover-layout">
              <div className="editorial-cover-preview">
                <div className="editorial-cover-preview-top">
                  <span className="editorial-overline">{model.name} · Copertine</span>
                  <span className="editorial-selection-state">
                    <span className="editorial-state-dot" aria-hidden="true" />
                    {confirmed ? 'Scelta salvata' : 'Anteprima'}
                  </span>
                </div>
                <div className="editorial-cover-hero">
                  <img src={selectedCover.image} alt={`${model.name}, ${selectedCover.title}`} draggable={false} />
                  <span className="editorial-cover-count">
                    {String(model.covers.findIndex((cover) => cover.id === selectedCover.id) + 1).padStart(2, '0')} /{' '}
                    {String(model.covers.length).padStart(2, '0')}
                  </span>
                </div>
                <div className="editorial-cover-caption">
                  <span className="editorial-caption-index">Layout selezionato</span>
                  <h2>{selectedCover.title}</h2>
                  <p>{selectedCover.description}</p>
                </div>
              </div>

              <div className="editorial-cover-options">
                <div className="editorial-options-heading">
                  <div>
                    <p className="editorial-overline">Scegli un layout</p>
                    <h2>Quale parla di voi?</h2>
                  </div>
                  <span>{model.covers.length} opzioni</span>
                </div>
                <div className="editorial-cover-list" role="radiogroup" aria-label={`Layout copertina ${model.name}`}>
                  {model.covers.map((cover, index) => {
                    const isSelected = selectedCover.id === cover.id;
                    return (
                      <button
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        className={`editorial-cover-option${isSelected ? ' is-selected' : ''}`}
                        key={cover.id}
                        onClick={() => {
                          setCoverId(cover.id);
                          setConfirmed(false);
                        }}
                      >
                        <span className="editorial-option-image">
                          <img src={cover.image} alt="" draggable={false} />
                        </span>
                        <span className="editorial-option-copy">
                          <span className="editorial-option-number">{String(index + 1).padStart(2, '0')}</span>
                          <span>
                            <strong>{cover.title}</strong>
                            <small>{cover.description}</small>
                          </span>
                        </span>
                        <span className="editorial-option-check">
                          {isSelected ? <CheckIcon /> : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="editorial-cover-actions">
                  <button
                    type="button"
                    className="editorial-primary-action editorial-primary-wide"
                    onClick={() => setConfirmed(true)}
                  >
                    {confirmed ? 'Scelta confermata' : 'Continua con questo stile'}
                    {confirmed ? <CheckIcon /> : <ArrowIcon />}
                  </button>
                  <p className="editorial-contract-note">
                    <span aria-hidden="true">↳</span> Modello: <strong>{model.name}</strong> · Layout:{' '}
                    <strong>{selectedCover.id}</strong>
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}