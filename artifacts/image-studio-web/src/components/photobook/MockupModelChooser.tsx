import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import type { MockupOption } from "@shared/mockup-workflow";
import {
  MOCKUP_RENDERERS,
  type MockupCoverExample,
} from "@shared/mockup-catalog";
import "./mockup-model-chooser.css";

/**
 * Gli esempi descrivono esclusivamente i layout dei renderer registrati.
 * Non contengono dati da salvare.
 */

// FIX: array vuoto condiviso → `examples` resta stabile quando non c'è selezione,
// evitando che ogni render produca un nuovo riferimento e faccia scattare i memo a vuoto.
const EMPTY_EXAMPLES: readonly MockupCoverExample[] = [];

export function mockupCoverExamples(
  rendererId: MockupOption["rendererId"],
): readonly MockupCoverExample[] {
  return (
    MOCKUP_RENDERERS.find((renderer) => renderer.id === rendererId)
      ?.coverExamples ?? EMPTY_EXAMPLES
  );
}

export interface MockupModelChooserProps {
  options: MockupOption[];
  initialOption?: MockupOption;
  fixed?: boolean;
  onChoose: (option: MockupOption, coverLayout: string) => void;
  onCancel?: () => void;
}

const optionKey = (option: MockupOption) => `${option.labId}/${option.id}`;

// FIX: `imageUrl` era ricreato a ogni render → spostato a livello di modulo.
const imageUrl = (file: string) =>
  `${import.meta.env.BASE_URL}mockups/examples/${file}`;

/** Due decisioni distinte, prima del caricamento del 3D: modello, poi esempio di copertina. */
export default function MockupModelChooser({
  options,
  initialOption,
  fixed = false,
  onChoose,
  onCancel,
}: MockupModelChooserProps) {
  // ---- Derivazioni memoizzate --------------------------------------------
  const available = useMemo(
    () =>
      options.filter(
        (option) =>
          option.active && mockupCoverExamples(option.rendererId).length > 0,
      ),
    [options],
  );

  const fixedOption = useMemo(() => {
    if (!fixed) return undefined;
    if (initialOption)
      return available.find(
        (option) => optionKey(option) === optionKey(initialOption),
      );
    return available[0];
  }, [fixed, initialOption, available]);

  const visibleOptions = useMemo(
    () => (fixed ? (fixedOption ? [fixedOption] : []) : available),
    [fixed, fixedOption, available],
  );

  // FIX: la vecchia `initialKey` usava `find(...) && optionKey(initialOption!)`,
  // che restituiva `undefined`/`false`/string a seconda dei rami. Ora è tipata e chiara.
  const initialSelectedKey = useMemo<string | null>(() => {
    if (fixed && fixedOption) return optionKey(fixedOption);
    if (!initialOption) return null;
    const key = optionKey(initialOption);
    return available.some((option) => optionKey(option) === key) ? key : null;
  }, [fixed, fixedOption, initialOption, available]);

  // ---- Stato --------------------------------------------------------------
  const [selectedKey, setSelectedKey] = useState<string | null>(
    initialSelectedKey,
  );
  const [stage, setStage] = useState<"models" | "styles">(() =>
    fixed && fixedOption ? "styles" : "models",
  );
  const [selectedCover, setSelectedCover] = useState<string | null>(null);
  const [coverFocusIndex, setCoverFocusIndex] = useState(0);

  const coverRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const userSelectedKey = useRef<string | null>(null);
  const previousFixed = useRef(fixed);
  const previousExamplesSignature = useRef("");
  const lastSubmittedRef = useRef<string | null>(null);

  // FIX: refs per la gestione del focus al cambio di stage (a11y).
  const modelStageRef = useRef<HTMLElement | null>(null);
  const styleStageRef = useRef<HTMLElement | null>(null);
  const previousStageRef = useRef(displayStageInitialPlaceholder());
  const isFirstRenderRef = useRef(true);

  function displayStageInitialPlaceholder(): "models" | "styles" {
    // La funzione è solo per inizializzare il ref prima del primo render;
    // il valore vero viene sincronizzato dall'effetto qui sotto.
    return fixed && fixedOption ? "styles" : "models";
  }

  const selected = visibleOptions.find(
    (option) => optionKey(option) === selectedKey,
  );
  const examples = selected
    ? mockupCoverExamples(selected.rendererId)
    : EMPTY_EXAMPLES;

  const examplesSignature = useMemo(
    () =>
      `${selected?.rendererId ?? ""}|${examples.map((example) => example.layout).join(",")}`,
    [selected?.rendererId, examples],
  );

  const visibleSignature = useMemo(
    () =>
      visibleOptions
        .map((option) => `${optionKey(option)}:${option.rendererId ?? ""}`)
        .join("\u0001"),
    [visibleOptions],
  );

  const syncSignature = useMemo(
    () =>
      `${fixed ? "fixed" : "choice"}|${visibleSignature}|${initialSelectedKey ?? ""}|${examplesSignature}`,
    [fixed, visibleSignature, initialSelectedKey, examplesSignature],
  );

  const displayStage = stage === "styles" && !selected ? "models" : stage;

  // ---- Sincronizzazione struttura → stato ---------------------------------
  useEffect(() => {
    const selectedIsVisible =
      !!selectedKey &&
      visibleOptions.some((option) => optionKey(option) === selectedKey);
    const fixedModeChanged = previousFixed.current !== fixed;

    if (fixed) {
      const nextKey = fixedOption ? optionKey(fixedOption) : null;
      if (selectedKey !== nextKey) {
        userSelectedKey.current = null;
        setSelectedKey(nextKey);
        setSelectedCover(null);
        setCoverFocusIndex(0);
      }
      if (nextKey && (fixedModeChanged || !selectedIsVisible))
        setStage("styles");
      else if (!nextKey) setStage("models");
    } else if (!selectedIsVisible) {
      userSelectedKey.current = null;
      setSelectedKey(initialSelectedKey);
      setSelectedCover(null);
      setCoverFocusIndex(0);
      setStage(initialSelectedKey && fixedModeChanged ? "styles" : "models");
    } else if (!userSelectedKey.current && selectedKey !== initialSelectedKey) {
      setSelectedKey(initialSelectedKey);
      setSelectedCover(null);
      setCoverFocusIndex(0);
      setStage("models");
    }

    if (
      coverFocusIndex >= examples.length ||
      previousExamplesSignature.current !== examplesSignature
    ) {
      setCoverFocusIndex(0);
    }
    if (
      selectedCover &&
      !examples.some((example) => example.layout === selectedCover)
    ) {
      setSelectedCover(null);
      setCoverFocusIndex(0);
    }

    previousFixed.current = fixed;
    previousExamplesSignature.current = examplesSignature;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- la firma `syncSignature`
    // cattura tutte le dipendenze strutturali; omettere selectedKey/coverFocusIndex/selectedCover
    // è voluto per non causare loop di setState.
  }, [syncSignature]);

  // Pulizia dei ref quando cambiano gli esempi visibili
  // FIX: i ref associati a layout non più presenti restavano nel map (leak logico).
  useEffect(() => {
    const validLayouts = new Set(examples.map((example) => example.layout));
    for (const layout of Object.keys(coverRefs.current)) {
      if (!validLayouts.has(layout)) delete coverRefs.current[layout];
    }
  }, [examples]);

  // FIX: gestione del focus al cambio di stage.
  // Quando si passa da "models" a "styles" il bottone che aveva il focus viene smontato:
  // senza questo effetto il focus finiva su <body> e la tastiera perdeva il contesto.
  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      previousStageRef.current = displayStage;
      return;
    }
    if (previousStageRef.current === displayStage) return;
    previousStageRef.current = displayStage;
    const target =
      displayStage === "models" ? modelStageRef.current : styleStageRef.current;
    target?.focus();
  }, [displayStage]);

  // ---- Handler -------------------------------------------------------------
  const openStyles = useCallback((option: MockupOption) => {
    const key = optionKey(option);
    setSelectedKey(key);
    userSelectedKey.current = key;
    setSelectedCover(null);
    setCoverFocusIndex(0);
    setStage("styles");
  }, []);

  const backToModels = useCallback(() => {
    setStage("models");
    setSelectedCover(null);
  }, []);

  const focusCover = useCallback(
    (index: number) => {
      const nextIndex = Math.max(0, Math.min(index, examples.length - 1));
      setCoverFocusIndex(nextIndex);
      const layout = examples[nextIndex]?.layout;
      if (!layout) return;
      window.requestAnimationFrame(() => coverRefs.current[layout]?.focus());
    },
    [examples],
  );

  const handleCoverKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
      if (!examples.length) return;
      let nextIndex: number | null = null;
      if (event.key === "ArrowRight" || event.key === "ArrowDown")
        nextIndex = (index + 1) % examples.length;
      else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
        nextIndex = (index - 1 + examples.length) % examples.length;
      else if (event.key === "Home") nextIndex = 0;
      else if (event.key === "End") nextIndex = examples.length - 1;
      if (nextIndex === null) return;
      event.preventDefault();
      setSelectedCover(examples[nextIndex].layout);
      focusCover(nextIndex);
    },
    [examples, focusCover],
  );

  // FIX: la CTA poteva essere cliccata due volte a raffica e chiamare onChoose due volte.
  // Ora l'ultima firma inviata viene ricordata e un doppio click identico è ignorato.
  const handleChoose = useCallback(() => {
    if (!selected || !selectedCover) return;
    const signature = `${optionKey(selected)}|${selectedCover}`;
    if (lastSubmittedRef.current === signature) return;
    lastSubmittedRef.current = signature;
    onChoose(selected, selectedCover);
  }, [onChoose, selected, selectedCover]);

  // ---- Render --------------------------------------------------------------
  if (!visibleOptions.length) {
    return (
      <div
        className="mockup-chooser mockup-chooser-empty"
        role="status"
        data-testid="mockup-model-chooser"
      >
        <h2>Nessun modello disponibile</h2>
        <p>Chiedi allo studio di aggiornare la proposta.</p>
        {onCancel && (
          <button type="button" onClick={onCancel}>
            Torna al tuo album
          </button>
        )}
      </div>
    );
  }

  const sectionLabel =
    displayStage === "styles" && selected
      ? `Stili di ${selected.name}`
      : "Scelta del modello";

  return (
    <section
      className="mockup-chooser"
      data-testid="mockup-model-chooser"
      data-chooser-stage={displayStage}
      aria-label={sectionLabel}
    >
      <div className="mockup-chooser-shell">
        <header className="mockup-chooser-heading">
          <div className="mockup-chooser-brand">
            <span className="mockup-chooser-brand-mark" aria-hidden="true" />
            <span>Album studio</span>
          </div>
          <div
            className="mockup-chooser-stepper"
            aria-label="Avanzamento configurazione"
          >
            <span
              className={`mockup-chooser-step ${displayStage === "models" ? "is-current" : "is-complete"}`}
            >
              {/* FIX: la spunta/numero era letta dallo screen reader come contenuto del badge. */}
              <span className="mockup-chooser-step-index" aria-hidden="true">
                {displayStage === "models" ? "1" : <Check size={13} />}
              </span>{" "}
              Modello
            </span>
            <span className="mockup-chooser-step-line" aria-hidden="true" />
            <span
              className={`mockup-chooser-step ${displayStage === "styles" ? "is-current" : ""}`}
            >
              <span className="mockup-chooser-step-index" aria-hidden="true">
                2
              </span>{" "}
              Copertina
            </span>
          </div>
          {onCancel && (
            <button
              type="button"
              className="mockup-chooser-cancel"
              onClick={onCancel}
            >
              Annulla
            </button>
          )}
        </header>

        {displayStage === "models" && (
          <section
            className="mockup-chooser-model-stage"
            aria-labelledby="mockup-model-heading"
            ref={modelStageRef}
            tabIndex={-1}
          >
            <p className="mockup-chooser-kicker">Inizia dalla forma</p>
            <h2 id="mockup-model-heading">
              Che storia vuoi <em>tenere in mano?</em>
            </h2>
            <p className="mockup-chooser-intro">
              {fixed
                ? "Questo modello è stato scelto dallo studio. Puoi ancora scegliere la finitura della copertina."
                : "Prima scegli il carattere dell’album. Poi vedremo insieme come vestirlo."}
            </p>
            <div
              className="mockup-chooser-models"
              aria-label={
                fixed
                  ? "Modello scelto dallo studio"
                  : "Scegli il modello di album"
              }
            >
              {visibleOptions.map((option, itemIndex) => {
                const representative = mockupCoverExamples(
                  option.rendererId,
                )[0];
                const key = optionKey(option);
                const isSelected = selectedKey === key;
                return (
                  <button
                    key={key}
                    type="button"
                    className={`mockup-chooser-model-card ${isSelected ? "is-selected" : ""}`}
                    data-testid={`mockup-model-${option.id}`}
                    aria-pressed={isSelected}
                    aria-label={`${fixed ? "Modello scelto dallo studio: " : "Scegli "}${option.name}`}
                    onClick={() => openStyles(option)}
                  >
                    <span className="mockup-chooser-model-copy">
                      <span className="mockup-chooser-eyebrow">
                        {option.labName}
                      </span>
                      <strong className="mockup-chooser-model-name">
                        {option.name}
                      </strong>
                      <span className="mockup-chooser-model-description">
                        Un album pensato per conservare e mostrare la tua
                        storia.
                      </span>
                      <span className="mockup-chooser-model-link">
                        {fixed
                          ? "Continua con questo modello"
                          : "Scopri questo modello"}{" "}
                        <ArrowRight size={16} aria-hidden="true" />
                      </span>
                    </span>
                    <span className="mockup-chooser-model-image">
                      <img
                        src={imageUrl(representative.image)}
                        alt={`Anteprima del modello ${option.name}`}
                        loading={itemIndex ? "lazy" : "eager"}
                        draggable={false}
                      />
                    </span>
                    <span
                      className="mockup-chooser-model-check"
                      aria-hidden="true"
                    >
                      <Check size={14} />
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mockup-chooser-model-note">
              <strong>{visibleOptions.length}</strong>{" "}
              {visibleOptions.length === 1
                ? "modello disponibile"
                : "modelli disponibili"}{" "}
              · Puoi cambiare idea in ogni momento
            </p>
          </section>
        )}

        {displayStage === "styles" && selected && (
          <section
            className="mockup-chooser-style-stage"
            aria-labelledby="mockup-style-heading"
            ref={styleStageRef}
            tabIndex={-1}
          >
            <div className="mockup-chooser-selected-summary">
              <div>
                <span className="mockup-chooser-summary-label">
                  {fixed ? "Scelto dallo studio" : "Modello scelto"}
                </span>
                <strong>{selected.name}</strong>
              </div>
              <button
                type="button"
                className="mockup-chooser-change"
                data-testid="mockup-change-model"
                onClick={backToModels}
              >
                <ArrowLeft size={15} aria-hidden="true" /> Cambia modello
              </button>
            </div>
            <p className="mockup-chooser-kicker">Ora il carattere</p>
            <h2 id="mockup-style-heading">Come vuoi vestirlo?</h2>
            <p className="mockup-chooser-intro">
              Queste sono le finiture che valorizzano{" "}
              {selected.name.toLowerCase()}. Scegline una per continuare.
            </p>
            <div
              className="mockup-chooser-covers"
              role="radiogroup"
              aria-label="Scegli il layout della copertina"
            >
              {examples.map((example, itemIndex) => {
                const isChecked = selectedCover === example.layout;
                return (
                  <button
                    key={example.layout}
                    type="button"
                    role="radio"
                    aria-checked={isChecked}
                    tabIndex={coverFocusIndex === itemIndex ? 0 : -1}
                    className={`mockup-chooser-cover-card ${isChecked ? "is-selected" : ""}`}
                    data-testid={`choose-mockup-example-${example.layout}`}
                    ref={(element) => {
                      coverRefs.current[example.layout] = element;
                    }}
                    onClick={() => {
                      setSelectedCover(example.layout);
                      setCoverFocusIndex(itemIndex);
                    }}
                    onKeyDown={(event) => handleCoverKeyDown(event, itemIndex)}
                  >
                    <span className="mockup-chooser-cover-image">
                      <img
                        src={imageUrl(example.image)}
                        alt={`${selected.name}: ${example.title}`}
                        loading={itemIndex ? "lazy" : "eager"}
                        draggable={false}
                      />
                    </span>
                    <span className="mockup-chooser-cover-copy">
                      <span className="mockup-chooser-cover-title">
                        <strong>{example.title}</strong>
                        <span
                          className="mockup-chooser-radio"
                          aria-hidden="true"
                        >
                          <Check size={12} />
                        </span>
                      </span>
                      <span className="mockup-chooser-cover-description">
                        {example.description}
                      </span>
                      <small>
                        Esempio illustrativo · colori e foto personalizzabili
                      </small>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mockup-chooser-cover-note">
              Il materiale e il colore si definiscono nel configuratore, dopo
              questa scelta.
            </p>
          </section>
        )}

        <div className="mockup-chooser-action-bar">
          <div className="mockup-chooser-action-status" aria-live="polite">
            {displayStage === "styles" && selected ? (
              <>
                <strong>
                  {selectedCover
                    ? examples.find(
                        (example) => example.layout === selectedCover,
                      )?.title
                    : "Scegli una finitura"}
                </strong>
                <span>{selected.name}</span>
              </>
            ) : (
              <>
                <strong>Il tuo album</strong>
                <span>Seleziona un modello per iniziare</span>
              </>
            )}
          </div>
          <button
            type="button"
            className="mockup-chooser-primary"
            disabled={displayStage !== "styles" || !selected || !selectedCover}
            onClick={handleChoose}
          >
            Continua <ArrowRight size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
}
