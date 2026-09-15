import { Check, Eye, Maximize, Rotate3D, RotateCcw, Save, X, ZoomIn, ZoomOut } from 'lucide-react';
import './_group.css';

const asset = '/__mockup/images/photobook-chooser/girevole-plaque.webp';

export function AdminClarity() {
  return <section className="photobook-configurator">
    <div className="photobook-configurator-shell">
      <header className="photobook-configurator-topbar">
        <div className="photobook-configurator-brand">
          <span className="photobook-configurator-brand-mark">P</span>
          <div className="photobook-configurator-brand-copy"><strong>Plaza</strong><span>Configuratore album · versione 4</span></div>
        </div>
        <div className="photobook-configurator-top-actions">
          <span className="photobook-configurator-status">Bozza modificata</span>
          <button className="photobook-configurator-button"><X size={14} /> Esci</button>
          <button className="photobook-configurator-button photobook-configurator-button--primary"><Save size={14} /> Salva bozza</button>
        </div>
      </header>
      <div className="photobook-configurator-workspace">
        <main className="photobook-configurator-stage">
          <div className="photobook-configurator-stage-label"><span /> Anteprima live · clicca e trascina per ruotare</div>
          <img className="photobook-configurator-book" src={asset} alt="Anteprima del modello Plaza" />
          <div className="photobook-configurator-view-controls">
            <div className="photobook-configurator-view-group" aria-label="Controlli anteprima">
              <button aria-pressed="true"><Eye size={14} /> Fronte</button>
              <button><Rotate3D size={14} /> Ruota</button>
              <button><Maximize size={14} /> Adatta</button>
              <button><ZoomIn size={14} /> Zoom</button>
              <button><RotateCcw size={14} /> Reset</button>
            </div>
            <span className="photobook-configurator-view-hint">I controlli riguardano solo la vista</span>
          </div>
        </main>
        <aside className="photobook-configurator-panel">
          <div className="photobook-configurator-panel-head">
            <p className="photobook-configurator-kicker">Configura il modello</p>
            <h1>Plaza</h1>
            <p>Custodia · Tessuto City 01</p>
            <div className="photobook-configurator-progress" aria-label="Avanzamento configurazione"><span className="is-done" /><span className="is-current" /><span /><span /></div>
          </div>
          <div className="photobook-configurator-step">
            <div className="photobook-configurator-step-head"><div><h2>Rivestimento</h2><p>Scegli il materiale da vedere sull’anteprima.</p></div><span className="photobook-configurator-step-badge">2 di 4</span></div>
            <button className="photobook-configurator-choice is-selected"><span><strong>City 01</strong><small>Tessuto · coordinato all’album</small></span><span className="photobook-configurator-choice-check"><Check size={12} /></span></button>
            <button className="photobook-configurator-choice"><span><strong>City 04</strong><small>Tessuto · tonalità chiara</small></span><span className="photobook-configurator-choice-check"><Check size={12} /></span></button>
            <button className="photobook-configurator-choice"><span><strong>Velluto 02</strong><small>Velluto · finitura morbida</small></span><span className="photobook-configurator-choice-check"><Check size={12} /></span></button>
            <div className="photobook-configurator-note"><strong>Stato della bozza</strong><br />Le modifiche restano nella bozza finché non premi “Salva bozza”. L’invio allo studio avviene solo dal riepilogo.</div>
          </div>
          <footer className="photobook-configurator-footer"><button className="photobook-configurator-button">Indietro</button><button className="photobook-configurator-button photobook-configurator-button--primary">Avanti</button></footer>
        </aside>
      </div>
    </div>
  </section>;
}