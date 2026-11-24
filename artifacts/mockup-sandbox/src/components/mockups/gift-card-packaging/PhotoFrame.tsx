import { useState } from "react";

/** A gift voucher imagined as a small, keepsake-worthy framed photograph. */
export function PhotoFrame() {
  const [selected, setSelected] = useState(true);

  return (
    <main className="photo-frame-stage">
      <style>{`
        .photo-frame-stage {
          --paper: #f5efdf;
          --ink: #342a25;
          --wine: #762d34;
          --forest: #29483d;
          min-height: 100vh;
          display: grid;
          place-items: center;
          padding: 24px 18px;
          box-sizing: border-box;
          color: var(--ink);
          background:
            radial-gradient(ellipse at 18% 14%, rgba(255,255,255,.72), transparent 40%),
            radial-gradient(ellipse at 83% 88%, rgba(190,177,147,.22), transparent 42%),
            #e9e3d6;
          font-family: 'Raleway', 'Trebuchet MS', sans-serif;
        }
        .photo-frame-stage * { box-sizing: border-box; }
        .photo-gift {
          width: min(100%, 398px);
          overflow: hidden;
          border: 1px solid rgba(76, 58, 43, .16);
          border-radius: 3px;
          background: var(--paper);
          box-shadow: 0 24px 54px -30px rgba(49, 38, 30, .54), 0 3px 9px rgba(49,38,30,.08);
          animation: frame-arrive .65s cubic-bezier(.2,.75,.25,1) both;
        }
        @keyframes frame-arrive {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .frame-topline {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 15px 20px 12px;
          color: #71665a;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: .19em;
          text-transform: uppercase;
        }
        .frame-brand { display: inline-flex; align-items: center; gap: 8px; }
        .brand-mark { width: 15px; height: 15px; color: var(--wine); }
        .frame-index { font-family: 'DM Mono', monospace; font-size: 9px; letter-spacing: .08em; }
        .print-mount {
          margin: 0 15px;
          padding: 11px 11px 13px;
          background: #fffaf0;
          border: 1px solid #dfd4bd;
          box-shadow: 0 5px 13px rgba(53, 42, 31, .12);
        }
        .print-art {
          position: relative;
          display: block;
          width: 100%;
          aspect-ratio: 1.18 / 1;
          overflow: hidden;
          background: #9dada4;
        }
        .print-art svg { display: block; width: 100%; height: 100%; }
        .print-caption {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 3px 0;
          color: #766d61;
          font: 9px 'DM Mono', monospace;
          letter-spacing: .11em;
          text-transform: uppercase;
        }
        .print-caption span:last-child { color: #9a8d7a; }
        .gift-details { padding: 18px 22px 19px; }
        .gift-kicker {
          margin: 0 0 5px;
          color: var(--wine);
          font-size: 9px;
          font-weight: 700;
          letter-spacing: .2em;
          text-transform: uppercase;
        }
        .gift-title {
          margin: 0;
          color: #382b28;
          font: italic 700 clamp(27px, 8vw, 32px)/1.05 'Playfair Display', Georgia, serif;
          letter-spacing: -.035em;
        }
        .gift-included {
          display: flex;
          align-items: baseline;
          gap: 7px;
          margin: 10px 0 0;
          color: #6d6258;
          font-size: 13px;
          line-height: 1.45;
        }
        .gift-included strong { color: #392f2a; font-weight: 700; }
        .gift-divider {
          height: 1px;
          margin: 15px 0 13px;
          background: #ded4c1;
        }
        .gift-action-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .gift-price {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .gift-price small {
          color: #83776a;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: .14em;
          text-transform: uppercase;
        }
        .gift-price strong {
          color: #332824;
          font: 700 23px/1 'DM Mono', monospace;
          letter-spacing: -.06em;
        }
        .gift-select {
          min-width: 125px;
          min-height: 45px;
          display: inline-flex;
          justify-content: center;
          align-items: center;
          gap: 8px;
          border: 1px solid var(--forest);
          border-radius: 2px;
          padding: 10px 15px;
          background: var(--forest);
          color: #fff9eb;
          font: 700 12px 'Raleway', sans-serif;
          letter-spacing: .035em;
          cursor: pointer;
          transition: background .18s ease, color .18s ease, transform .18s ease;
        }
        .gift-select:hover { transform: translateY(-1px); }
        .gift-select:focus-visible { outline: 3px solid #b7824f; outline-offset: 3px; }
        .gift-select[aria-pressed="false"] {
          background: transparent;
          color: var(--forest);
        }
        .gift-select svg { width: 14px; height: 14px; flex: none; }
        .gift-footnote {
          display: flex;
          align-items: center;
          gap: 6px;
          margin: 15px 0 0;
          color: #84796c;
          font: 9px 'DM Mono', monospace;
          letter-spacing: .035em;
        }
        .gift-footnote svg { width: 12px; height: 12px; color: var(--wine); flex: none; }
        @media (max-width: 380px) {
          .photo-frame-stage { padding: 14px 12px; }
          .frame-topline { padding: 13px 15px 10px; }
          .print-mount { margin: 0 11px; padding: 8px 8px 10px; }
          .gift-details { padding: 16px 17px 17px; }
          .gift-select { min-width: 112px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .photo-gift { animation: none; }
          .gift-select { transition: none; }
        }
      `}</style>
      <article className="photo-gift" aria-label="Buono regalo Foto di Natale">
        <div className="frame-topline">
          <span className="frame-brand">
            <svg className="brand-mark" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <rect x="2.4" y="4" width="15.2" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="10" cy="10" r="3.1" stroke="currentColor" strokeWidth="1.5" />
              <path d="M6 4 7.2 2.5h5.6L14 4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
            Image Studio
          </span>
          <span className="frame-index">EDIZIONE  ·  01</span>
        </div>

        <div className="print-mount" aria-label="Illustrazione ricordo invernale">
          <div className="print-art">
            <svg viewBox="0 0 420 350" role="img" aria-label="Paesaggio invernale illustrato con abeti e luci calde">
              <defs>
                <linearGradient id="winter-sky" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#9eaca6" />
                  <stop offset=".58" stopColor="#c9c9b5" />
                  <stop offset="1" stopColor="#e6d5b5" />
                </linearGradient>
                <linearGradient id="winter-hill" x1="0" y1="0" x2="0" y2="1">
                  <stop stopColor="#d7d2bd" />
                  <stop offset="1" stopColor="#f0e7d2" />
                </linearGradient>
                <radialGradient id="warm-light">
                  <stop stopColor="#fff1c9" stopOpacity=".9" />
                  <stop offset="1" stopColor="#fff1c9" stopOpacity="0" />
                </radialGradient>
              </defs>
              <rect width="420" height="350" fill="url(#winter-sky)" />
              <circle cx="318" cy="89" r="48" fill="url(#warm-light)" />
              <circle cx="318" cy="89" r="13" fill="#f4e2ba" opacity=".9" />
              <path d="M0 213Q62 175 123 210t123 0q66-46 174-3v143H0Z" fill="#abb9b0" opacity=".65" />
              <path d="M0 250q68-48 143-13t140-1q66-35 137-7v121H0Z" fill="url(#winter-hill)" />
              <path d="M0 287q78-35 151-2t133-2q62-32 136-8v75H0Z" fill="#f5eddd" />
              <g fill="#304c42">
                <path d="m56 250 29-57 29 57h-17l23 38H50l23-38Z" />
                <path d="m105 232 22-44 23 44h-14l18 30H99l18-30Z" opacity=".88" />
                <path d="m332 238 28-55 28 55h-16l22 36h-69l22-36Z" />
                <path d="m288 246 20-39 20 39h-12l16 26h-48l16-26Z" opacity=".88" />
              </g>
              <g fill="#f7edda" opacity=".95">
                <path d="m85 207 9 18H76Z" /><path d="m360 201 10 19h-20Z" />
                <path d="m127 199 8 16h-16Z" /><path d="m309 216 7 14h-14Z" />
              </g>
              <path d="M172 350q21-39 48-40 26 2 44 40" fill="#8b4e3f" opacity=".7" />
              <path d="M191 350q13-29 29-30 16 1 27 30" fill="#f3dfc0" opacity=".92" />
              <g fill="#f1dcae">
                <circle cx="82" cy="150" r="2.6" /><circle cx="148" cy="91" r="2" />
                <circle cx="233" cy="128" r="2.4" /><circle cx="374" cy="145" r="1.8" />
                <circle cx="275" cy="60" r="1.7" /><circle cx="196" cy="61" r="1.7" />
              </g>
              <path d="M17 18h24M17 18v24M403 18h-24M403 18v24M17 332h24M17 332v-24M403 332h-24M403 332v-24" fill="none" stroke="#f6edda" strokeOpacity=".65" strokeWidth="1" />
            </svg>
          </div>
          <div className="print-caption">
            <span>Un momento da tenere</span>
            <span>12 · XII</span>
          </div>
        </div>

        <section className="gift-details" aria-labelledby="photo-gift-title">
          <p className="gift-kicker">Un ricordo, da regalare</p>
          <h1 className="gift-title" id="photo-gift-title">Foto di Natale</h1>
          <p className="gift-included"><span>Include</span><strong>Jungle Bells</strong></p>
          <div className="gift-divider" />
          <div className="gift-action-row">
            <div className="gift-price">
              <small>Il tuo regalo</small>
              <strong>75 €</strong>
            </div>
            <button
              className="gift-select"
              type="button"
              aria-pressed={selected}
              aria-label={selected ? "Foto di Natale, selezionato" : "Seleziona Foto di Natale"}
              onClick={() => setSelected((value) => !value)}
            >
              {selected ? (
                <>
                  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="m3.5 8.2 2.8 2.7 6.3-6.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Scelto
                </>
              ) : "Scegli"}
            </button>
          </div>
          <p className="gift-footnote">
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M8 1.8 13 4v3.5c0 3.2-2.2 5.4-5 6.7-2.8-1.3-5-3.5-5-6.7V4l5-2.2Z" stroke="currentColor" strokeWidth="1.2" />
              <path d="m5.6 7.9 1.6 1.5 3.2-3.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Un pensiero speciale, custodito con cura
          </p>
        </section>
      </article>
    </main>
  );
}
