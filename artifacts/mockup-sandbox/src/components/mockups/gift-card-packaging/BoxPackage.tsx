import { useState } from "react";

export function BoxPackage() {
  const [selected, setSelected] = useState(true);

  return (
    <main className="box-package-stage">
      <article className="box-package-card" aria-label="Gift card Foto di Natale">
        <div className="box-package-scene" aria-hidden="true">
          <div className="scene-glow" />
          <div className="sparkle sparkle-one">✦</div>
          <div className="sparkle sparkle-two">✧</div>
          <div className="sparkle sparkle-three">✦</div>
          <div className="gift-box">
            <div className="box-front">
              <div className="box-ribbon-vertical" />
              <div className="box-ribbon-horizontal" />
              <div className="box-knot"><i /><i /><b /></div>
              <div className="box-stamp">IMAGE<br />STUDIO</div>
            </div>
            <div className="box-lid">
              <div className="lid-ribbon" />
              <div className="gift-bow"><i /><i /><b /></div>
            </div>
            <div className="gift-tag">
              <span className="tag-hole" />
              <span className="tag-overline">un ricordo da regalare</span>
              <span className="tag-title">Foto di<br />Natale</span>
              <span className="tag-rule" />
              <span className="tag-offer">Jungle Bells</span>
            </div>
          </div>
          <div className="scene-caption">un piccolo pensiero, una grande storia</div>
        </div>

        <div className="box-package-details">
          <div className="package-intro">
            <span className="package-kicker"><span /> IL TUO REGALO</span>
            <p>Un’esperienza da vivere insieme,<br className="desktop-break" /> da tenere per sempre.</p>
          </div>
          <div className="package-purchase">
            <div className="package-price">
              <span>Valore del regalo</span>
              <strong>75 <small>€</small></strong>
            </div>
            <button
              type="button"
              className={`package-select${selected ? " is-selected" : ""}`}
              aria-pressed={selected}
              onClick={() => setSelected((value) => !value)}
            >
              <span className="select-check" aria-hidden="true">{selected ? "✓" : "+"}</span>
              {selected ? "Scelto" : "Scegli questo regalo"}
            </button>
          </div>
        </div>
      </article>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,500;0,600;0,700;1,500;1,600&display=swap');
        .box-package-stage {
          min-height: 100dvh; box-sizing: border-box; display: grid; place-items: center;
          padding: 26px; background: #f4eee2; color: #34231f;
          font-family: 'DM Sans', sans-serif;
        }
        .box-package-card {
          width: min(100%, 430px); overflow: hidden; border: 1px solid #e3d5bf;
          border-radius: 15px; background: #fffaf0;
          box-shadow: 0 24px 50px -35px rgba(63, 39, 26, .6), 0 3px 10px rgba(91, 63, 39, .08);
        }
        .box-package-scene {
          position: relative; display: grid; min-height: 330px; place-items: center;
          overflow: hidden; padding: 30px 20px 26px;
          background:
            radial-gradient(ellipse at 50% 68%, rgba(255,230,174,.35), transparent 42%),
            repeating-linear-gradient(135deg, rgba(255,255,255,.022) 0 1px, transparent 1px 5px),
            #742b2a;
        }
        .box-package-scene:before, .box-package-scene:after {
          position: absolute; content: ""; pointer-events: none;
          border: 1px solid rgba(238,204,147,.24); inset: 13px; border-radius: 8px;
        }
        .box-package-scene:after { inset: 18px; border-color: rgba(238,204,147,.12); }
        .scene-glow { position: absolute; width: 270px; height: 220px; border-radius: 50%; background: rgba(245,190,119,.1); filter: blur(24px); }
        .gift-box { position: relative; width: 238px; height: 224px; margin-top: 15px; filter: drop-shadow(0 15px 10px rgba(31,12,10,.28)); }
        .box-front {
          position: absolute; left: 9px; right: 8px; bottom: 0; height: 151px; overflow: hidden;
          border: 1px solid #d1a75f; border-radius: 5px 5px 9px 9px;
          background: linear-gradient(110deg,#d8ae6e 0%,#f0d49b 28%,#d9b16e 52%,#c99b59 100%);
          box-shadow: inset 0 0 0 5px rgba(255,239,194,.22), inset 0 -14px 22px rgba(103,58,28,.13);
        }
        .box-front:after { content:""; position:absolute; inset:0; opacity:.24; background:repeating-linear-gradient(0deg,transparent 0 3px,rgba(103,64,29,.15) 3px 4px); }
        .box-ribbon-vertical { position:absolute; z-index:1; left:50%; top:0; bottom:0; width:35px; transform:translateX(-50%); background:linear-gradient(90deg,#8e262c,#b6383a 50%,#8c2229); box-shadow:0 0 0 1px rgba(94,28,28,.18); }
        .box-ribbon-horizontal { position:absolute; z-index:1; top:37px; left:0; right:0; height:21px; background:linear-gradient(#b83b3b,#8f252b); }
        .box-knot { position:absolute; z-index:3; left:50%; top:25px; width:64px; height:40px; transform:translateX(-50%); }
        .box-knot i,.gift-bow i { position:absolute; width:28px; height:20px; border:5px solid #8f252b; border-radius:80% 15% 75% 20%; transform:rotate(25deg); background:#b6383a; }
        .box-knot i:first-child,.gift-bow i:first-child { left:2px; top:0; }
        .box-knot i:nth-child(2),.gift-bow i:nth-child(2) { right:2px; top:0; transform:scaleX(-1) rotate(25deg); }
        .box-knot b,.gift-bow b { position:absolute; left:25px; top:15px; width:15px; height:15px; border-radius:50%; background:#9d2e32; border:2px solid #d9a75f; }
        .box-stamp { position:absolute; z-index:2; right:15px; bottom:13px; color:#825a31; text-align:center; font:600 7px/1.4 'DM Sans',sans-serif; letter-spacing:.18em; }
        .box-lid { position:absolute; z-index:4; top:49px; left:0; right:0; height:40px; border:1px solid #dfbd7e; border-radius:5px; background:linear-gradient(180deg,#efd39a,#d3a861); box-shadow:0 5px 8px rgba(73,42,22,.2), inset 0 0 0 4px rgba(255,239,194,.22); }
        .lid-ribbon { position:absolute; left:50%; top:0; bottom:0; width:37px; transform:translateX(-50%); background:linear-gradient(90deg,#8e262c,#b6383a 50%,#8c2229); }
        .gift-bow { position:absolute; width:75px; height:40px; left:50%; top:-30px; transform:translateX(-50%); }
        .gift-bow i { width:34px; height:23px; border-width:5px; }
        .gift-bow b { left:30px; top:16px; width:17px; height:17px; }
        .gift-tag {
          position:absolute; z-index:7; top:28px; right:-7px; display:flex; width:117px; height:139px;
          box-sizing:border-box; flex-direction:column; align-items:center; padding:18px 9px 12px;
          transform:rotate(7deg); clip-path:polygon(0 0,100% 0,100% 88%,50% 100%,0 88%);
          background:#fff7df; color:#562c27; box-shadow:0 8px 16px rgba(32,11,10,.25);
        }
        .gift-tag:before { content:""; position:absolute; inset:5px; border:1px solid #dfc795; }
        .tag-hole { position:absolute; top:10px; width:7px; height:7px; border:1px solid #a98754; border-radius:50%; background:#742b2a; }
        .tag-overline { margin-top:8px; color:#9a6b4d; font-size:6px; font-weight:700; letter-spacing:.13em; text-transform:uppercase; white-space:nowrap; }
        .tag-title { margin-top:8px; text-align:center; font:600 20px/.98 'Playfair Display',Georgia,serif; letter-spacing:-.04em; }
        .tag-rule { width:25px; margin:9px 0 7px; border-top:1px solid #bf9464; }
        .tag-offer { color:#8d2b2d; font:italic 600 12px 'Playfair Display',Georgia,serif; }
        .sparkle { position:absolute; color:#f2cf8a; font-size:17px; opacity:.85; }
        .sparkle-one { top:58px; left:47px; }
        .sparkle-two { top:118px; right:47px; font-size:22px; }
        .sparkle-three { bottom:55px; left:63px; font-size:12px; }
        .scene-caption { position:absolute; bottom:23px; color:#e8c58d; font:italic 500 11px 'Playfair Display',Georgia,serif; letter-spacing:.045em; }
        .box-package-details { padding:20px 23px 22px; }
        .package-kicker { display:flex; align-items:center; gap:8px; color:#8f3931; font-size:9px; font-weight:700; letter-spacing:.19em; }
        .package-kicker span { width:6px; height:6px; border-radius:50%; background:#b58a4f; }
        .package-intro p { margin:8px 0 17px; color:#765d50; font:italic 500 17px/1.35 'Playfair Display',Georgia,serif; }
        .package-purchase { display:flex; align-items:center; justify-content:space-between; gap:12px; padding-top:15px; border-top:1px solid #e8dcc8; }
        .package-price { display:flex; flex-direction:column; gap:1px; }
        .package-price span { color:#927f6b; font-size:10px; letter-spacing:.04em; }
        .package-price strong { color:#432a26; font:600 28px/1 'Playfair Display',Georgia,serif; }
        .package-price small { font-size:17px; }
        .package-select { display:flex; min-height:46px; align-items:center; justify-content:center; gap:9px; border:1px solid #762d2e; border-radius:7px; padding:0 16px; background:#8c3534; color:#fff8e8; font:700 13px 'DM Sans',sans-serif; cursor:pointer; transition:transform .18s ease, background .18s ease; }
        .package-select:hover { transform:translateY(-1px); background:#742b2a; }
        .package-select:focus-visible { outline:3px solid #c69c5a; outline-offset:3px; }
        .package-select.is-selected { border-color:#285b43; background:#285b43; }
        .select-check { display:grid; width:17px; height:17px; place-items:center; border:1px solid rgba(255,248,232,.65); border-radius:50%; font-size:11px; }
        @media (max-width: 390px) {
          .box-package-stage { padding:14px; }
          .box-package-scene { min-height:295px; }
          .gift-box { transform:scale(.91); margin-top:4px; }
          .box-package-details { padding:18px 17px 19px; }
          .package-purchase { align-items:flex-end; }
          .package-select { min-height:44px; padding:0 12px; font-size:12px; }
          .desktop-break { display:none; }
        }
        @media (prefers-reduced-motion: reduce) { .package-select { transition:none; } }
      `}</style>
    </main>
  );
}
