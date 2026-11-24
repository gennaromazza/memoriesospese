import './_group.css';

/** Estratto della card prodotto usata in /regala, con contenuti dello screenshot. */
export function Current() {
  return (
    <main className="giftcard-preview">
      <article className="giftcard-current" aria-label="Gift card selezionata">
        <div className="giftcard-current-cover">Foto di Natale</div>
        <div className="giftcard-current-details">
          <h2>Foto di Natale</h2>
          <p>Include: Jungle Bells</p>
          <div className="giftcard-current-row">
            <strong>75 €</strong>
            <button type="button" aria-pressed="true">Scelto</button>
          </div>
        </div>
      </article>
    </main>
  );
}
