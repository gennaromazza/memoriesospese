import { useState } from "react";

import "./PhotobookFlowStates.css";

const imageRoot = "/__mockup/images/photobook-chooser";

type FlowState = "choice" | "configure" | "confirmed" | "readonly";

const stateLabels: Record<FlowState, string> = {
  choice: "Scelta",
  configure: "Configura",
  confirmed: "Conferma",
  readonly: "Sola lettura",
};

export function PhotobookFlowStates() {
  const [state, setState] = useState<FlowState>("choice");
  const [cover, setCover] = useState("Tessuto continuo");
  const [notice, setNotice] = useState("");

  function handleDownload() {
    setNotice("Le otto viste sono pronte per il download.");
  }

  return (
    <main className="pf-states">
      <aside className="pf-rail">
        <div className="pf-wordmark"><span className="pf-mark" aria-hidden="true" /> Album studio</div>
        <span className="pf-rail-kicker">Sistema completo</span>
        <h1>Una sola direzione visiva, <em>ogni passaggio.</em></h1>
        <p className="pf-rail-copy">La stessa gerarchia accompagna scelta, personalizzazione, revisione e consultazione.</p>
        <nav className="pf-state-nav" aria-label="Anteprima delle schermate">
          {(Object.keys(stateLabels) as FlowState[]).map((item) => (
            <button
              key={item}
              type="button"
              className={state === item ? "is-active" : ""}
              aria-pressed={state === item}
              onClick={() => { setState(item); setNotice(""); }}
            >
              <span>{String((Object.keys(stateLabels) as FlowState[]).indexOf(item) + 1).padStart(2, "0")}</span>
              {stateLabels[item]}
            </button>
          ))}
        </nav>
        <p className="pf-rail-note">Frame di design · landscape mobile / desktop compatto</p>
      </aside>

      <section className="pf-preview" aria-live="polite">
        <header className="pf-preview-topbar">
          <div>
            <span className="pf-preview-kicker">Configuratore album</span>
            <strong>{state === "choice" ? "Scegli il tuo album" : state === "readonly" ? "Plaza · revisione 06" : "Plaza"}</strong>
          </div>
          <div className="pf-preview-meta">
            <span>Passaggio {state === "choice" ? "1" : state === "configure" ? "4" : "6"} di 6</span>
            <span className={`pf-status pf-status--${state}`}>{state === "confirmed" ? "Confermato" : state === "readonly" ? "Sola lettura" : state === "configure" ? "Bozza da salvare" : "Inizia qui"}</span>
          </div>
        </header>

        {state === "choice" && (
          <section className="pf-choice">
            <div className="pf-intro">
              <span className="pf-kicker">01 · Inizia dalla forma</span>
              <h2>Che storia vuoi <em>tenere in mano?</em></h2>
              <p>Prima scegli il carattere dell’album. Poi vedremo insieme come vestirlo.</p>
            </div>
            <div className="pf-models">
              <button type="button" className="pf-model-card" onClick={() => setState("configure")}>
                <span className="pf-model-copy"><small>Il classico, rifinito</small><strong>Custodia</strong><span>Essenziale fuori, sorprendente quando si apre.</span><b>Scopri questo modello →</b></span>
                <img src={`${imageRoot}/custodia-full.webp`} alt="Album Custodia" />
              </button>
              <button type="button" className="pf-model-card is-selected" onClick={() => setState("configure")}>
                <span className="pf-model-copy"><small>Il gesto che cambia</small><strong>Girevole</strong><span>Un oggetto da mostrare, non solo da conservare.</span><b>Modello scelto →</b></span>
                <img src={`${imageRoot}/girevole-full.webp`} alt="Album Girevole" />
              </button>
            </div>
          </section>
        )}

        {state === "configure" && (
          <section className="pf-configure">
            <div className="pf-live-preview">
              <span className="pf-live-badge">Anteprima live · trascina per ruotare</span>
              <img src={`${imageRoot}/girevole-full.webp`} alt="Anteprima live album Girevole" />
              <div className="pf-view-tools"><button type="button" onClick={() => setNotice("Vista frontale")}>F Fronte</button><button type="button" onClick={() => setNotice("Album estratto")}>↗ Estrai</button><button type="button" onClick={() => setNotice("Vista reimpostata")}>↻ Reset</button></div>
            </div>
            <div className="pf-config-panel">
              <span className="pf-kicker">04 · Personalizzazione</span>
              <h2>Configura il modello</h2>
              <p className="pf-panel-copy">Scegli la superficie che accompagnerà la tua storia.</p>
              <div className="pf-panel-section"><span>Copertina</span><div className="pf-cover-options">{["Tessuto continuo", "Piastra", "Doppio materiale"].map((item) => <button key={item} type="button" className={cover === item ? "is-selected" : ""} onClick={() => setCover(item)}>{item}</button>)}</div></div>
              <div className="pf-panel-section"><span>Stato bozza</span><strong className="pf-draft-state">Modifiche da salvare</strong></div>
              <div className="pf-panel-actions"><button type="button" className="pf-secondary" onClick={() => setState("choice")}>← Modello</button><button type="button" className="pf-primary" onClick={() => setState("confirmed")}>Salva bozza →</button></div>
            </div>
          </section>
        )}

        {state === "confirmed" && (
          <section className="pf-confirmed">
            <div className="pf-confirmed-mark" aria-hidden="true">✓</div>
            <span className="pf-kicker">06 · Revisione completata</span>
            <h2>La proposta è <em>confermata.</em></h2>
            <p>La revisione Plaza è stata conservata con la finitura <strong>{cover}</strong>. Le viste e la configurazione restano disponibili nello storico.</p>
            <div className="pf-confirmed-grid"><div><span>Stato</span><strong>Confermato dallo studio</strong></div><div><span>Revisione</span><strong>06 · 14:32</strong></div><div><span>Modello</span><strong>Girevole · Plaza</strong></div></div>
            <div className="pf-panel-actions"><button type="button" className="pf-secondary" onClick={() => setState("readonly")}>Apri consultazione</button><button type="button" className="pf-primary" onClick={handleDownload}>Scarica conferma →</button></div>
            {notice && <p className="pf-notice" role="status">{notice}</p>}
          </section>
        )}

        {state === "readonly" && (
          <section className="pf-readonly">
            <div className="pf-live-preview">
              <span className="pf-live-badge">Anteprima live · sola lettura</span>
              <img src={`${imageRoot}/girevole-full.webp`} alt="Anteprima album confermato" />
              <div className="pf-view-tools"><button type="button" onClick={() => setNotice("Vista frontale")}>F Fronte</button><button type="button" onClick={() => setNotice("Album estratto")}>↗ Estrai</button><button type="button" onClick={() => setNotice("Vista reimpostata")}>↻ Reset</button></div>
            </div>
            <div className="pf-config-panel pf-readonly-panel">
              <span className="pf-kicker">Revisione 06 · Confermata</span>
              <h2>Consultazione</h2>
              <div className="pf-readonly-state"><strong>Versione in sola lettura</strong><span>Puoi esplorare l’album e scaricare le viste.</span></div>
              <dl><div><dt>Modello</dt><dd>Girevole · Plaza</dd></div><div><dt>Copertina</dt><dd>{cover}</dd></div><div><dt>Stato</dt><dd>Confermato dallo studio</dd></div></dl>
              <div className="pf-panel-actions"><button type="button" className="pf-secondary" onClick={() => setState("confirmed")}>← Riepilogo</button><button type="button" className="pf-primary" onClick={handleDownload}>Scarica viste →</button></div>
              {notice && <p className="pf-notice" role="status">{notice}</p>}
            </div>
          </section>
        )}
      </section>
    </main>
  );
}