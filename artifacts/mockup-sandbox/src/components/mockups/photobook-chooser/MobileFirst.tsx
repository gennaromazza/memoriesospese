import { useEffect, useRef, useState } from "react";

import "./MobileFirst.css";

type ModelId = "custodia" | "girevole";
type CoverLayout = "fabric" | "plaque" | "photo-plaque" | "split-fabric";

type Model = {
  id: ModelId;
  eyebrow: string;
  name: string;
  description: string;
  detail: string;
  image: string;
};

type CoverOption = {
  id: CoverLayout;
  name: string;
  description: string;
  image: string;
};

const imageRoot = "/__mockup/images/photobook-chooser";

const models: Model[] = [
  {
    id: "custodia",
    eyebrow: "Il classico, rifinito",
    name: "Custodia",
    description:
      "Un album avvolto in una custodia rigida: essenziale fuori, sorprendente quando si apre.",
    detail: "Per storie da conservare",
    image: `${imageRoot}/custodia-full.webp`,
  },
  {
    id: "girevole",
    eyebrow: "Il gesto che cambia",
    name: "Girevole",
    description:
      "Una copertina che ruota e rivela l’immagine: il tuo album diventa subito un oggetto.",
    detail: "Per storie da mostrare",
    image: `${imageRoot}/girevole-full.webp`,
  },
];

const coverOptions: Record<ModelId, CoverOption[]> = {
  custodia: [
    {
      id: "fabric",
      name: "Tessuto continuo",
      description: "Una superficie morbida e uniforme, per un segno discreto.",
      image: `${imageRoot}/custodia-oblique.webp`,
    },
    {
      id: "photo-plaque",
      name: "Dettaglio fotografico",
      description: "La tua immagine diventa il punto di arrivo della copertina.",
      image: `${imageRoot}/custodia-full.webp`,
    },
  ],
  girevole: [
    {
      id: "plaque",
      name: "Piastra",
      description: "Un inserto materico che incornicia la storia con precisione.",
      image: `${imageRoot}/girevole-plaque.webp`,
    },
    {
      id: "photo-plaque",
      name: "Piastra fotografica",
      description: "Un’immagine in primo piano, protetta e pronta a ruotare.",
      image: `${imageRoot}/girevole-photo-plaque.webp`,
    },
    {
      id: "split-fabric",
      name: "Doppio materiale",
      description: "Fotografia e tessuto si incontrano in una composizione divisa.",
      image: `${imageRoot}/girevole-split-photo-fabric.svg`,
    },
  ],
};

function Arrow() {
  return <span aria-hidden="true">→</span>;
}

export function MobileFirst() {
  const [selectedModel, setSelectedModel] = useState<ModelId | null>(null);
  const [selectedCover, setSelectedCover] = useState<CoverLayout | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const coverSectionRef = useRef<HTMLElement | null>(null);

  const selectedModelDetails = models.find((model) => model.id === selectedModel);
  const selectedCoverDetails = selectedModel
    ? coverOptions[selectedModel].find((cover) => cover.id === selectedCover)
    : undefined;
  const isChoosingCover = selectedModel !== null && !isComplete;

  useEffect(() => {
    if (isChoosingCover && coverSectionRef.current) {
      window.requestAnimationFrame(() => {
        coverSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, [isChoosingCover]);

  function handleModelSelect(modelId: ModelId) {
    setSelectedModel(modelId);
    setSelectedCover(null);
    setIsComplete(false);
  }

  function handleChangeModel() {
    setSelectedModel(null);
    setSelectedCover(null);
    setIsComplete(false);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  function handleContinue() {
    if (!selectedModel || !selectedCover) return;
    setIsComplete(true);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  return (
    <main className="pb-chooser">
      <div className="pb-shell">
        <header className="pb-topbar">
          <div className="pb-wordmark">
            <span className="pb-wordmark-mark" aria-hidden="true" />
            <span>Album studio</span>
          </div>
          <span className="pb-top-note">Passo 1 di 2</span>
        </header>

        <div className="pb-stepper" aria-label="Avanzamento configurazione">
          <span className={`pb-step ${!selectedModel ? "is-current" : "is-complete"}`}>
            <span className="pb-step-index">{selectedModel ? "✓" : "1"}</span>
            Modello
          </span>
          <span className="pb-step-connector" aria-hidden="true" />
          <span className={`pb-step ${isChoosingCover ? "is-current" : ""}`}>
            <span className="pb-step-index">2</span>
            Copertina
          </span>
        </div>

        {!isComplete && !selectedModel && (
          <>
            <p className="pb-kicker">Inizia dalla forma</p>
            <h1 className="pb-heading">
              Che storia vuoi <em>tenere in mano?</em>
            </h1>
            <p className="pb-subheading">
              Prima scegli il carattere dell’album. Poi vedremo insieme come vestirlo.
            </p>

            <section className="pb-models" aria-label="Scegli il modello di album">
              {models.map((model) => (
                <button
                  key={model.id}
                  className="pb-model-card"
                  type="button"
                  aria-pressed={selectedModel === model.id}
                  onClick={() => handleModelSelect(model.id)}
                >
                  <span className="pb-model-copy">
                    <span className="pb-model-type">{model.eyebrow}</span>
                    <span className="pb-model-name">{model.name}</span>
                    <span className="pb-model-description">{model.description}</span>
                    <span className="pb-model-link">
                      Scopri questo modello <Arrow />
                    </span>
                  </span>
                  <span className="pb-model-visual">
                    <img src={model.image} alt={`Album modello ${model.name}`} />
                  </span>
                  <span className="pb-model-select" aria-hidden="true" />
                </button>
              ))}
            </section>

            <div className="pb-model-footer">
              <span><strong>1</strong> di 2 scelte</span>
              <span>Puoi cambiare idea in ogni momento</span>
            </div>
          </>
        )}

        {isChoosingCover && selectedModelDetails && (
          <section
            className="pb-cover-section"
            ref={coverSectionRef}
            aria-labelledby="cover-heading"
          >
            <div className="pb-selected-summary">
              <div className="pb-selected-summary-copy">
                <span className="pb-summary-dot" aria-hidden="true" />
                <div>
                  <span className="pb-summary-label">Modello scelto</span>
                  <strong className="pb-summary-model">{selectedModelDetails.name}</strong>
                </div>
              </div>
              <button className="pb-back" type="button" onClick={handleChangeModel}>
                Cambia
              </button>
            </div>

            <p className="pb-kicker">Ora il carattere</p>
            <h2 className="pb-cover-heading" id="cover-heading">
              Come vuoi vestirlo?
            </h2>
            <p className="pb-cover-intro">
              Queste sono le finiture che valorizzano un {selectedModelDetails.name.toLowerCase()}.
              Scegline una per continuare.
            </p>

            <div className="pb-cover-options" role="radiogroup" aria-label="Scegli il layout della copertina">
              {coverOptions[selectedModel].map((cover) => (
                <button
                  key={cover.id}
                  className={`pb-cover-option ${selectedCover === cover.id ? "is-selected" : ""}`}
                  type="button"
                  role="radio"
                  aria-checked={selectedCover === cover.id}
                  onClick={() => setSelectedCover(cover.id)}
                >
                  <span className="pb-cover-image">
                    <img src={cover.image} alt={`Esempio copertina ${cover.name}`} />
                  </span>
                  <span className="pb-cover-copy">
                    <span className="pb-cover-choice-line">
                      <span className="pb-cover-name">{cover.name}</span>
                      <span className="pb-cover-radio" aria-hidden="true" />
                    </span>
                    <span className="pb-cover-description">{cover.description}</span>
                  </span>
                </button>
              ))}
            </div>
            <p className="pb-cover-note">
              Il materiale e il colore si definiscono nel configuratore, dopo questa scelta.
            </p>
          </section>
        )}

        {isComplete && selectedModelDetails && selectedCoverDetails && (
          <section className="pb-complete" aria-live="polite">
            <div className="pb-complete-mark" aria-hidden="true">✓</div>
            <h1>La direzione è chiara.</h1>
            <p>
              Hai scelto <strong>{selectedModelDetails.name}</strong> con layout{" "}
              <strong>{selectedCoverDetails.name}</strong>. Nel configuratore potrai definire
              materiali, formato e dettagli.
            </p>
          </section>
        )}
      </div>

      {!isComplete && (
        <div className="pb-action-bar">
          <div className="pb-action-inner">
            <div className="pb-action-status" aria-live="polite">
              {selectedModel ? (
                <>
                  <strong>{selectedCover ? selectedCoverDetails?.name : "Scegli una finitura"}</strong>
                  <span>{selectedModelDetails?.name}</span>
                </>
              ) : (
                <>
                  <strong>Il tuo album</strong>
                  <span>Seleziona un modello per iniziare</span>
                </>
              )}
            </div>
            <button
              className="pb-primary"
              type="button"
              disabled={!selectedModel || !selectedCover}
              onClick={handleContinue}
            >
              Continua <Arrow />
            </button>
          </div>
        </div>
      )}
    </main>
  );
}