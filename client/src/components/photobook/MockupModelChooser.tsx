import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import type { MockupOption } from '@shared/mockup-workflow';
import { MOCKUP_RENDERERS, type MockupCoverExample } from '@shared/mockup-catalog';
import './mockup-model-chooser.css';

/** Gli esempi descrivono esclusivamente i layout dei renderer registrati. Non contengono dati da salvare. */
export function mockupCoverExamples(rendererId: MockupOption['rendererId']): readonly MockupCoverExample[] {
  return MOCKUP_RENDERERS.find(renderer => renderer.id === rendererId)?.coverExamples || [];
}

export interface MockupModelChooserProps {
  options: MockupOption[];
  initialOption?: MockupOption;
  fixed?: boolean;
  onChoose: (option: MockupOption, coverLayout: string) => void;
  onCancel?: () => void;
}

const optionKey = (option: MockupOption) => `${option.labId}/${option.id}`;

/** Due decisioni distinte, prima del caricamento del 3D: modello, poi esempio di copertina. */
export default function MockupModelChooser({ options, initialOption, fixed = false, onChoose, onCancel }: MockupModelChooserProps) {
  const available = options.filter(option => option.active && mockupCoverExamples(option.rendererId).length > 0);
  const fixedOption = fixed
    ? available.find(option => initialOption && optionKey(option) === optionKey(initialOption)) || (!initialOption ? available[0] : undefined)
    : undefined;
  const visibleOptions = fixed ? (fixedOption ? [fixedOption] : []) : available;
  const initialKey = fixedOption
    ? optionKey(fixedOption)
    : available.find(option => initialOption && optionKey(option) === optionKey(initialOption)) && optionKey(initialOption!);
  const [selectedKey, setSelectedKey] = useState<string | null>(initialKey || null);
  const [stage, setStage] = useState<'models' | 'styles'>(() => fixedOption ? 'styles' : 'models');
  const [selectedCover, setSelectedCover] = useState<string | null>(null);
  const [coverFocusIndex, setCoverFocusIndex] = useState(0);
  const coverRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const userSelectedKey = useRef<string | null>(null);
  const previousFixed = useRef(fixed);
  const previousExamplesSignature = useRef('');
  const selected = visibleOptions.find(option => optionKey(option) === selectedKey);
  const examples = selected ? mockupCoverExamples(selected.rendererId) : [];
  const examplesSignature = `${selected?.rendererId || ''}|${examples.map(example => example.layout).join(',')}`;
  const initialOptionKey = available.find(option => initialOption && optionKey(option) === optionKey(initialOption))
    ? optionKey(initialOption!)
    : null;
  const syncSignature = `${fixed ? 'fixed' : 'choice'}|${visibleOptions.map(option => `${optionKey(option)}:${option.rendererId || ''}`).join('\u0001')}|${initialOptionKey || ''}|${examplesSignature}`;
  const displayStage = stage === 'styles' && !selected ? 'models' : stage;

  useEffect(() => {
    const selectedIsVisible = !!selectedKey && visibleOptions.some(option => optionKey(option) === selectedKey);
    const fixedModeChanged = previousFixed.current !== fixed;
    if (fixed) {
      const nextKey = fixedOption ? optionKey(fixedOption) : null;
      if (selectedKey !== nextKey) {
        userSelectedKey.current = null;
        setSelectedKey(nextKey);
        setSelectedCover(null);
        setCoverFocusIndex(0);
      }
      if (nextKey && (fixedModeChanged || !selectedIsVisible)) setStage('styles');
      else if (!nextKey) setStage('models');
    } else if (!selectedIsVisible) {
      const nextKey = initialOptionKey;
      userSelectedKey.current = null;
      setSelectedKey(nextKey);
      setSelectedCover(null);
      setCoverFocusIndex(0);
      setStage(nextKey && fixedModeChanged ? 'styles' : 'models');
    } else if (!userSelectedKey.current && selectedKey !== initialOptionKey) {
      setSelectedKey(initialOptionKey);
      setSelectedCover(null);
      setCoverFocusIndex(0);
      setStage('models');
    }
    if (coverFocusIndex >= examples.length || previousExamplesSignature.current !== examplesSignature) {
      setCoverFocusIndex(0);
    }
    if (selectedCover && !examples.some(example => example.layout === selectedCover)) {
      setSelectedCover(null);
      setCoverFocusIndex(0);
    }
    previousFixed.current = fixed;
    previousExamplesSignature.current = examplesSignature;
  }, [syncSignature]);

  function openStyles(option: MockupOption) {
    setSelectedKey(optionKey(option));
    userSelectedKey.current = optionKey(option);
    setSelectedCover(null);
    setCoverFocusIndex(0);
    setStage('styles');
  }

  function backToModels() {
    setStage('models');
    setSelectedCover(null);
  }

  function focusCover(index: number) {
    const nextIndex = Math.max(0, Math.min(index, examples.length - 1));
    setCoverFocusIndex(nextIndex);
    const layout = examples[nextIndex]?.layout;
    if (layout) window.requestAnimationFrame(() => coverRefs.current[layout]?.focus());
  }

  function handleCoverKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!examples.length) return;
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % examples.length;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + examples.length) % examples.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = examples.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    setSelectedCover(examples[nextIndex].layout);
    focusCover(nextIndex);
  }

  const imageUrl = (file: string) => `${import.meta.env.BASE_URL}mockups/examples/${file}`;

  if (!visibleOptions.length) return <div className="mockup-chooser mockup-chooser-empty" role="status" data-testid="mockup-model-chooser">
    <h2>Nessun modello disponibile</h2><p>Chiedi allo studio di aggiornare la proposta.</p>
    {onCancel && <button type="button" onClick={onCancel}>Torna al tuo album</button>}
  </div>;

  return <section className="mockup-chooser" data-testid="mockup-model-chooser" data-chooser-stage={displayStage} aria-label={displayStage === 'styles' && selected ? `Stili di ${selected.name}` : 'Scelta del modello'}>
    <div className="mockup-chooser-shell">
      <header className="mockup-chooser-heading">
        <div className="mockup-chooser-brand"><span className="mockup-chooser-brand-mark" aria-hidden="true" /><span>Album studio</span></div>
        <div className="mockup-chooser-stepper" aria-label="Avanzamento configurazione">
        <span className={`mockup-chooser-step ${displayStage === 'models' ? 'is-current' : 'is-complete'}`}>
          <span className="mockup-chooser-step-index">{displayStage === 'models' ? '1' : <Check size={13} aria-hidden="true" />}</span> Modello
        </span>
        <span className="mockup-chooser-step-line" aria-hidden="true" />
        <span className={`mockup-chooser-step ${displayStage === 'styles' ? 'is-current' : ''}`}>
          <span className="mockup-chooser-step-index">2</span> Copertina
        </span>
        </div>
        {onCancel && <button type="button" className="mockup-chooser-cancel" onClick={onCancel}>Annulla</button>}
      </header>

      {displayStage === 'models' && (
        <section className="mockup-chooser-model-stage" aria-labelledby="mockup-model-heading">
          <p className="mockup-chooser-kicker">Inizia dalla forma</p>
          <h2 id="mockup-model-heading">Che storia vuoi <em>tenere in mano?</em></h2>
          <p className="mockup-chooser-intro">
            {fixed
              ? 'Questo modello è stato scelto dallo studio. Puoi ancora scegliere la finitura della copertina.'
              : 'Prima scegli il carattere dell’album. Poi vedremo insieme come vestirlo.'}
          </p>
          <div className="mockup-chooser-models" aria-label={fixed ? 'Modello scelto dallo studio' : 'Scegli il modello di album'}>
            {visibleOptions.map((option, itemIndex) => {
              const representative = mockupCoverExamples(option.rendererId)[0];
              return <button
                key={optionKey(option)}
                type="button"
                className={`mockup-chooser-model-card ${selectedKey === optionKey(option) ? 'is-selected' : ''}`}
                data-testid={`mockup-model-${option.id}`}
                aria-pressed={selectedKey === optionKey(option)}
                aria-label={`${fixed ? 'Modello scelto dallo studio: ' : 'Scegli '}${option.name}`}
                onClick={() => openStyles(option)}
              >
                <span className="mockup-chooser-model-copy">
                  <span className="mockup-chooser-eyebrow">{option.labName}</span>
                  <strong className="mockup-chooser-model-name">{option.name}</strong>
                  <span className="mockup-chooser-model-description">Un album pensato per conservare e mostrare la tua storia.</span>
                  <span className="mockup-chooser-model-link">{fixed ? 'Continua con questo modello' : 'Scopri questo modello'} <ArrowRight size={16} aria-hidden="true" /></span>
                </span>
                <span className="mockup-chooser-model-image">
                  <img src={imageUrl(representative.image)} alt={`Anteprima del modello ${option.name}`} loading={itemIndex ? 'lazy' : 'eager'} draggable={false} />
                </span>
                <span className="mockup-chooser-model-check" aria-hidden="true"><Check size={14} /></span>
              </button>;
            })}
          </div>
          <p className="mockup-chooser-model-note"><strong>{visibleOptions.length}</strong> {visibleOptions.length === 1 ? 'modello disponibile' : 'modelli disponibili'} · Puoi cambiare idea in ogni momento</p>
        </section>
      )}

      {displayStage === 'styles' && selected && (
        <section className="mockup-chooser-style-stage" aria-labelledby="mockup-style-heading">
          <div className="mockup-chooser-selected-summary">
            <div><span className="mockup-chooser-summary-label">{fixed ? 'Scelto dallo studio' : 'Modello scelto'}</span><strong>{selected.name}</strong></div>
            <button type="button" className="mockup-chooser-change" data-testid="mockup-change-model" onClick={backToModels}>
              <ArrowLeft size={15} aria-hidden="true" /> Cambia modello
            </button>
          </div>
          <p className="mockup-chooser-kicker">Ora il carattere</p>
          <h2 id="mockup-style-heading">Come vuoi vestirlo?</h2>
          <p className="mockup-chooser-intro">Queste sono le finiture che valorizzano {selected.name.toLowerCase()}. Scegline una per continuare.</p>
          <div className="mockup-chooser-covers" role="radiogroup" aria-label="Scegli il layout della copertina">
            {examples.map((example, itemIndex) => <button
              key={example.layout}
              type="button"
              role="radio"
              aria-checked={selectedCover === example.layout}
              tabIndex={coverFocusIndex === itemIndex ? 0 : -1}
              className={`mockup-chooser-cover-card ${selectedCover === example.layout ? 'is-selected' : ''}`}
              data-testid={`choose-mockup-example-${example.layout}`}
              ref={element => { coverRefs.current[example.layout] = element; }}
              onClick={() => { setSelectedCover(example.layout); setCoverFocusIndex(itemIndex); }}
              onKeyDown={event => handleCoverKeyDown(event, itemIndex)}
            >
              <span className="mockup-chooser-cover-image"><img src={imageUrl(example.image)} alt={`${selected.name}: ${example.title}`} loading={itemIndex ? 'lazy' : 'eager'} draggable={false} /></span>
              <span className="mockup-chooser-cover-copy">
                <span className="mockup-chooser-cover-title"><strong>{example.title}</strong><span className="mockup-chooser-radio" aria-hidden="true"><Check size={12} /></span></span>
                <span className="mockup-chooser-cover-description">{example.description}</span>
                <small>Esempio illustrativo · colori e foto personalizzabili</small>
              </span>
            </button>)}
          </div>
          <p className="mockup-chooser-cover-note">Il materiale e il colore si definiscono nel configuratore, dopo questa scelta.</p>
        </section>
      )}

      <div className="mockup-chooser-action-bar">
        <div className="mockup-chooser-action-status" aria-live="polite">
          {displayStage === 'styles' && selected ? <><strong>{selectedCover ? examples.find(example => example.layout === selectedCover)?.title : 'Scegli una finitura'}</strong><span>{selected.name}</span></> : <><strong>Il tuo album</strong><span>Seleziona un modello per iniziare</span></>}
        </div>
        <button type="button" className="mockup-chooser-primary" disabled={displayStage !== 'styles' || !selected || !selectedCover} onClick={() => selected && selectedCover && onChoose(selected, selectedCover)}>
          Continua <ArrowRight size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  </section>;
}
