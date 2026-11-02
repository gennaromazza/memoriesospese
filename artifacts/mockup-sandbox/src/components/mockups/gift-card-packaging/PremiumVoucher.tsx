import { useState } from "react";

export function PremiumVoucher() {
  const [selected, setSelected] = useState(true);

  return (
    <main className="pv-stage">
      <article className="pv-card" aria-label="Gift card Foto di Natale">
        <div className="pv-topline">
          <span className="pv-brand">IMAGE <i>STUDIO</i></span>
          <span className="pv-edition">UN RICORDO DA REGALARE</span>
        </div>

        <div className="pv-artwork" aria-hidden="true">
          <div className="pv-art-rule" />
          <svg className="pv-window" viewBox="0 0 180 214" fill="none">
            <path d="M19 194V91C19 48 50 16 90 16s71 32 71 75v103H19Z" fill="#D6D0BF" />
            <path d="M32 194V92c0-35 25-62 58-62s58 27 58 62v102H32Z" fill="#A8B2A1" />
            <path d="M32 138c23-14 43-18 58-12 20 8 36 3 58-12v80H32v-56Z" fill="#667B70" />
            <path d="M32 156c23-8 44-7 63 4 18 11 34 10 53 0v34H32v-38Z" fill="#465D54" />
            <path d="M90 30v164M32 92h116" stroke="#EEE9DC" strokeWidth="3" />
            <path d="M49 111c7-8 13-12 19-12m44-23c6-6 12-9 19-9" stroke="#E7DFC9" strokeWidth="2" strokeLinecap="round" />
            <circle cx="124" cy="45" r="5" fill="#C8A978" />
          </svg>
          <div className="pv-art-caption">
            <span>UN’ESPERIENZA</span>
            <b>da custodire</b>
          </div>
          <span className="pv-number">N° 01 <span>—</span> 25</span>
          <div className="pv-art-rule pv-art-rule-bottom" />
        </div>

        <div className="pv-content">
          <div className="pv-title-block">
            <span className="pv-kicker">IL TUO REGALO</span>
            <h1>Foto di Natale</h1>
            <p>Un momento da vivere, un ricordo da tenere vicino.</p>
          </div>

          <div className="pv-included">
            <div className="pv-included-label">
              <span className="pv-dot" />
              <span>ESPERIENZA INCLUSA</span>
            </div>
            <strong>Jungle Bells</strong>
          </div>

          <div className="pv-footer">
            <div className="pv-price">
              <span>VALORE DEL DONO</span>
              <strong>75 <small>€</small></strong>
            </div>
            <button
              className={`pv-select${selected ? " is-selected" : ""}`}
              type="button"
              aria-pressed={selected}
              onClick={() => setSelected((value) => !value)}
            >
              <span className="pv-check" aria-hidden="true">{selected ? "✓" : "+"}</span>
              {selected ? "Scelto" : "Scegli"}
            </button>
          </div>
        </div>
        <div className="pv-edge" aria-hidden="true" />
      </article>

      <style>{`
        .pv-stage {
          min-height: 100dvh;
          box-sizing: border-box;
          display: grid;
          place-items: center;
          padding: 28px 18px;
          background: #e9e4d9;
          background-image: radial-gradient(ellipse at 50% 42%, #f5f1e9 0, #e9e4d9 70%);
          color: #252e29;
          font-family: "DM Sans", "Avenir Next", sans-serif;
        }
        .pv-card {
          position: relative;
          display: grid;
          grid-template-columns: 0.88fr 1fr;
          width: min(100%, 690px);
          min-height: 394px;
          overflow: hidden;
          background: #f7f3e9;
          border: 1px solid #d1c8b6;
          box-shadow: 0 24px 58px -32px rgba(40, 41, 34, .42), 0 3px 10px rgba(63, 58, 46, .08);
        }
        .pv-topline {
          position: absolute;
          z-index: 2;
          top: 0;
          left: 0;
          right: 0;
          height: 43px;
          padding: 0 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid rgba(88, 91, 76, .17);
          color: #586858;
        }
        .pv-brand {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: .19em;
        }
        .pv-brand i { font-family: Georgia, serif; font-weight: 400; letter-spacing: .1em; }
        .pv-edition { font-size: 8px; letter-spacing: .15em; }
        .pv-artwork {
          position: relative;
          grid-row: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 394px;
          margin-top: 43px;
          overflow: hidden;
          background: #e4e0d2;
        }
        .pv-artwork:before {
          content: "";
          position: absolute;
          inset: 14px;
          border: 1px solid rgba(81, 99, 82, .3);
          pointer-events: none;
        }
        .pv-art-rule {
          position: absolute;
          top: 27px;
          left: 50%;
          width: 24px;
          height: 1px;
          background: #9c8661;
          transform: translateX(-50%);
        }
        .pv-window { width: 43%; max-height: 70%; filter: drop-shadow(0 9px 7px rgba(52, 57, 47, .1)); }
        .pv-art-caption {
          position: absolute;
          left: 21px;
          bottom: 27px;
          display: flex;
          flex-direction: column;
          gap: 3px;
          color: #3f5146;
        }
        .pv-art-caption span { font-size: 7px; letter-spacing: .18em; }
        .pv-art-caption b { font: italic 17px/1 Georgia, serif; }
        .pv-number { position: absolute; right: 21px; bottom: 29px; font: 8px "DM Mono", monospace; letter-spacing: .1em; color: #69776a; }
        .pv-number span { color: #ad9470; }
        .pv-art-rule-bottom { top: auto; bottom: 18px; width: calc(100% - 42px); background: rgba(91, 105, 86, .23); }
        .pv-content {
          display: flex;
          flex-direction: column;
          padding: 77px 30px 24px;
          background: #faf8f1;
        }
        .pv-kicker, .pv-included-label, .pv-price > span {
          color: #8c795b;
          font-size: 8px;
          line-height: 1.3;
          font-weight: 700;
          letter-spacing: .16em;
        }
        .pv-title-block h1 {
          margin: 11px 0 9px;
          color: #26372e;
          font: 500 clamp(31px, 5vw, 40px)/.99 "Cormorant Garamond", "Iowan Old Style", Georgia, serif;
          letter-spacing: -.035em;
        }
        .pv-title-block p {
          max-width: 260px;
          margin: 0;
          color: #74766a;
          font: 13px/1.55 "DM Sans", "Avenir Next", sans-serif;
        }
        .pv-included {
          position: relative;
          margin-top: 24px;
          padding: 13px 14px 12px;
          border-top: 1px solid #d8d2c3;
          border-bottom: 1px solid #d8d2c3;
        }
        .pv-included-label { display: flex; align-items: center; gap: 7px; color: #737b6c; font-size: 7px; }
        .pv-dot { width: 5px; height: 5px; border-radius: 50%; background: #a78252; }
        .pv-included strong { display: block; margin-top: 7px; color: #33483b; font: 600 22px/1.1 "Cormorant Garamond", Georgia, serif; }
        .pv-footer { display: flex; align-items: end; justify-content: space-between; gap: 12px; margin-top: auto; padding-top: 20px; }
        .pv-price { display: flex; flex-direction: column; gap: 5px; }
        .pv-price > span { font-size: 7px; }
        .pv-price strong { color: #26372e; font: 500 31px/.9 "Cormorant Garamond", Georgia, serif; }
        .pv-price small { font-size: 18px; }
        .pv-select {
          min-width: 115px;
          min-height: 43px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 0 14px;
          border: 1px solid #355342;
          border-radius: 2px;
          background: transparent;
          color: #355342;
          font: 700 11px "DM Sans", "Avenir Next", sans-serif;
          cursor: pointer;
          transition: background-color .18s ease, color .18s ease, transform .18s ease;
        }
        .pv-select:hover { transform: translateY(-1px); }
        .pv-select:focus-visible { outline: 3px solid #b39461; outline-offset: 3px; }
        .pv-select.is-selected { background: #355342; color: #f7f3e9; }
        .pv-check { display: grid; place-items: center; width: 15px; height: 15px; border: 1px solid currentColor; border-radius: 50%; font-size: 9px; line-height: 1; }
        .pv-edge { position: absolute; top: 43px; bottom: 0; left: 43.86%; width: 1px; background: rgba(98, 104, 83, .13); }
        @media (max-width: 540px) {
          .pv-stage { padding: 18px 14px; }
          .pv-card { grid-template-columns: 1fr; width: min(100%, 380px); }
          .pv-topline { position: relative; grid-row: 1; height: 42px; padding: 0 18px; }
          .pv-artwork { grid-row: 2; min-height: 212px; margin-top: 0; }
          .pv-window { width: auto; height: 155px; }
          .pv-artwork:before { inset: 10px; }
          .pv-art-caption { left: 20px; bottom: 21px; }
          .pv-number { right: 20px; bottom: 23px; }
          .pv-art-rule { top: 19px; }
          .pv-art-rule-bottom { top: auto; bottom: 13px; }
          .pv-content { grid-row: 3; padding: 23px 21px 20px; }
          .pv-title-block h1 { font-size: 36px; }
          .pv-included { margin-top: 18px; }
          .pv-footer { padding-top: 17px; }
          .pv-edge { display: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .pv-select { transition: none; }
        }
      `}</style>
    </main>
  );
}
