import { useState } from "react";

export function EnvelopeLetter() {
  const [selected, setSelected] = useState(true);

  return (
    <main className="letter-stage">
      <style>{`
        .letter-stage {
          --paper: #fff9eb;
          --ink: #3d2926;
          --wine: #813d42;
          --muted: #8d7770;
          min-height: 100vh;
          display: grid;
          place-items: center;
          padding: 28px 18px;
          background:
            radial-gradient(ellipse at 50% 4%, rgba(226, 205, 174, .34), transparent 44%),
            #f0eee4;
          color: var(--ink);
          font-family: 'Raleway', 'Trebuchet MS', sans-serif;
        }
        .letter-card {
          width: min(100%, 414px);
          overflow: hidden;
          border: 1px solid #e5d9c6;
          border-radius: 5px;
          background: var(--paper);
          box-shadow: 0 22px 50px rgba(62, 42, 31, .15), 0 3px 9px rgba(62, 42, 31, .06);
          position: relative;
        }
        .letter-card::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: .18;
          background-image: radial-gradient(#b79568 .55px, transparent .7px);
          background-size: 7px 7px;
          mix-blend-mode: multiply;
        }
        .letter-head {
          position: relative;
          padding: 26px 28px 0;
          text-align: center;
        }
        .letter-kicker {
          margin: 0;
          color: var(--wine);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: .2em;
          text-transform: uppercase;
        }
        .letter-promise {
          max-width: 280px;
          margin: 11px auto 0;
          font: italic 500 17px/1.35 'Playfair Display', Georgia, serif;
          color: #64514b;
        }
        .envelope-art {
          height: 232px;
          position: relative;
          margin: 10px 20px 0;
          isolation: isolate;
        }
        .letter-sheet {
          position: absolute;
          z-index: 3;
          left: 13%;
          top: 3px;
          width: 74%;
          height: 188px;
          padding: 19px 18px 12px;
          border: 1px solid #e6d9c5;
          background:
            linear-gradient(90deg, transparent 0 17px, rgba(180, 119, 101, .13) 17px 18px, transparent 18px),
            repeating-linear-gradient(to bottom, transparent 0 24px, rgba(180, 119, 101, .12) 24px 25px),
            #fffdf6;
          box-shadow: 0 5px 12px rgba(63, 42, 31, .08);
          transform: rotate(-2deg);
          text-align: center;
        }
        .letter-sheet small {
          display: block;
          color: #997b6e;
          font: 500 9px/1.2 'DM Mono', monospace;
          letter-spacing: .16em;
          text-transform: uppercase;
        }
        .letter-sheet strong {
          display: block;
          margin-top: 13px;
          color: #743b3d;
          font: italic 700 clamp(26px, 8vw, 34px)/1.05 'Playfair Display', Georgia, serif;
          letter-spacing: -.035em;
        }
        .letter-script {
          display: block;
          margin-top: 13px;
          color: #88756d;
          font: italic 13px/1.2 'Pinyon Script', cursive;
        }
        .envelope-back {
          position: absolute;
          z-index: 2;
          left: 2%;
          right: 2%;
          bottom: 0;
          height: 154px;
          overflow: hidden;
          background: linear-gradient(145deg, #b66d64, #995451 72%, #85464a);
          clip-path: polygon(0 10%, 50% 45%, 100% 10%, 100% 100%, 0 100%);
          filter: drop-shadow(0 8px 8px rgba(59, 37, 31, .14));
        }
        .envelope-base {
          position: absolute;
          z-index: 4;
          inset: auto 2% 0;
          height: 143px;
          background: linear-gradient(135deg, #d9a094, #c5837a 54%, #b96e6c);
          clip-path: polygon(0 0, 50% 57%, 100% 0, 100% 100%, 0 100%);
          border-radius: 0 0 3px 3px;
        }
        .envelope-flap {
          position: absolute;
          z-index: 2;
          inset: 0 2% auto;
          height: 158px;
          background: linear-gradient(155deg, #cf8a7e 0%, #b96f6c 75%);
          clip-path: polygon(0 0, 100% 0, 50% 73%);
          filter: drop-shadow(0 3px 2px rgba(75, 43, 39, .1));
        }
        .wax-seal {
          z-index: 5;
          position: absolute;
          left: 50%;
          top: 119px;
          display: grid;
          width: 48px;
          height: 48px;
          place-items: center;
          transform: translateX(-50%);
          border: 1px solid rgba(255, 231, 194, .66);
          border-radius: 50%;
          background: radial-gradient(circle at 35% 30%, #a45e4d, #723a3b 78%);
          box-shadow: 0 2px 7px rgba(63, 31, 30, .22), inset 0 0 0 3px rgba(255, 230, 190, .14);
          color: #f4dfbd;
          font: italic 20px/1 'Playfair Display', Georgia, serif;
        }
        .letter-details {
          position: relative;
          padding: 19px 27px 24px;
          border-top: 1px solid #eadfce;
        }
        .included-label {
          margin: 0 0 7px;
          color: #9a8178;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: .18em;
          text-transform: uppercase;
        }
        .included-name {
          margin: 0;
          color: #44312c;
          font: 600 21px/1.2 'Playfair Display', Georgia, serif;
        }
        .included-name::before {
          content: "✦";
          display: inline-block;
          margin-right: 9px;
          color: #b2785e;
          font: 12px/1 'Raleway', sans-serif;
          vertical-align: 3px;
        }
        .letter-divider {
          height: 1px;
          margin: 17px 0 15px;
          background: repeating-linear-gradient(90deg, #d8c8b2 0 4px, transparent 4px 8px);
        }
        .letter-purchase {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .gift-price {
          color: #3e2c27;
          font: 700 25px/1 'Raleway', sans-serif;
          letter-spacing: -.04em;
        }
        .choose-button {
          display: inline-flex;
          min-height: 46px;
          align-items: center;
          justify-content: center;
          gap: 9px;
          padding: 0 20px;
          border: 1px solid #784243;
          border-radius: 3px;
          background: #784243;
          color: #fff8e8;
          cursor: pointer;
          font: 700 12px/1 'Raleway', sans-serif;
          letter-spacing: .09em;
          transition: transform .18s ease, background .18s ease, color .18s ease;
        }
        .choose-button:hover { transform: translateY(-1px); }
        .choose-button:focus-visible { outline: 3px solid #bb8c62; outline-offset: 3px; }
        .choose-button[aria-pressed="false"] {
          background: transparent;
          color: #784243;
        }
        .check-mark { font-size: 15px; line-height: 1; }
        @media (max-width: 380px) {
          .letter-stage { padding: 16px 12px; }
          .letter-head { padding: 22px 18px 0; }
          .envelope-art { height: 214px; margin-inline: 10px; }
          .letter-sheet { height: 173px; }
          .envelope-back { height: 140px; }
          .envelope-base { height: 131px; }
          .envelope-flap { height: 144px; }
          .wax-seal { top: 109px; }
          .letter-details { padding: 17px 20px 21px; }
          .choose-button { padding-inline: 15px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .choose-button { transition: none; }
        }
      `}</style>
      <article className="letter-card" aria-label="Buono regalo Foto di Natale">
        <header className="letter-head">
          <p className="letter-kicker">Un pensiero da aprire</p>
          <p className="letter-promise">Un ricordo speciale, da custodire insieme.</p>
        </header>
        <div className="envelope-art" aria-hidden="true">
          <div className="letter-sheet">
            <small>Per chi ami</small>
            <strong>Foto di Natale</strong>
            <span className="letter-script">con affetto, Image Studio</span>
          </div>
          <div className="envelope-back" />
          <div className="envelope-base" />
          <div className="envelope-flap" />
          <div className="wax-seal">i</div>
        </div>
        <section className="letter-details" aria-label="Dettagli del regalo">
          <p className="included-label">L’esperienza inclusa</p>
          <h2 className="included-name">Jungle Bells</h2>
          <div className="letter-divider" />
          <div className="letter-purchase">
            <strong className="gift-price">75 €</strong>
            <button
              className="choose-button"
              type="button"
              aria-pressed={selected}
              onClick={() => setSelected((value) => !value)}
            >
              {selected && <span className="check-mark" aria-hidden="true">✓</span>}
              {selected ? "Scelto" : "Scegli"}
            </button>
          </div>
        </section>
      </article>
    </main>
  );
}
