import { Home, Maximize, Rotate3D, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import './_group.css';

const asset = '/__mockup/images/photobook-chooser/girevole-plaque.webp';

export function Current() {
  return <section className="photobook-configurator">
    <div className="photobook-configurator-shell">
      <header className="photobook-configurator-topbar">
        <div className="photobook-configurator-brand">
          <span className="photobook-configurator-brand-mark">P</span>
          <div className="photobook-configurator-brand-copy"><strong>Plaza</strong><span>Configuratore album 3D</span></div>
        </div>
        <div className="photobook-configurator-top-actions">
          <button className="photobook-configurator-button photobook-configurator-button--quiet">Cambia</button>
          <button className="photobook-configurator-button"><Home size={14} /> In casa</button>
          <button className="photobook-configurator-button"><Maximize size={14} /></button>
          <button className="photobook-configurator-button photobook-configurator-button--quiet">Chiudi</button>
        </div>
      </header>
      <div className="photobook-configurator-workspace">
        <main className="photobook-configurator-stage">
          <div className="photobook-configurator-stage-label"><span /> Anteprima album</div>
          <img className="photobook-configurator-book" src={asset} alt="Anteprima del modello Plaza" />
          <div className="photobook-configurator-view-controls">
            <div className="photobook-configurator-view-group">
              <button>F</button><button>R</button><button><Rotate3D size={14} /></button><button><ZoomIn size={14} /></button><button><ZoomOut size={14} /></button><button><RotateCcw size={14} /></button>
            </div>
          </div>
        </main>
        <aside className="photobook-configurator-panel">
          <div className="photobook-configurator-panel-head"><p className="photobook-configurator-kicker">Personalizzazione</p><h1>Plaza</h1><p>Tessuto: City 01 · Struttura: Tessuto coordinato all’album</p></div>
          <div className="photobook-configurator-step"><h2>Configurazione album</h2><p>Foto formato placchetta · Plexiglass posteriore dello scrigno: foto stampata · Foto retro salvata</p><div className="photobook-configurator-note">Le opzioni, lo stato della bozza e le azioni finali convivono nello stesso pannello.</div></div>
          <footer className="photobook-configurator-footer"><button className="photobook-configurator-button">Indietro</button><button className="photobook-configurator-button photobook-configurator-button--primary">Invia allo studio</button></footer>
        </aside>
      </div>
    </div>
  </section>;
}