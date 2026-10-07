import React, { useEffect, useState } from "react";

/**
 * Masonry a COLONNE reali con assegnazione fissa.
 *
 * A differenza del masonry CSS `column-count`, ogni elemento è assegnato in modo
 * stabile a una colonna (round-robin per indice). Le nuove foto si aggiungono SOLO
 * in fondo alla colonna: niente ribilanciamento globale ad ogni immagine caricata,
 * quindi niente reflow dell'intera lista = scroll fluido.
 *
 * L'indice passato a `renderItem` è SEMPRE l'indice originale nell'array `items`
 * (necessario per gli indici della lightbox e per la selezione).
 */
export interface MasonryColumnsProps<T> {
  items: T[];
  getKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => React.ReactNode;
}

function getColumnCount(): number {
  if (typeof window === "undefined") return 4;
  const w = window.innerWidth;
  if (w >= 1024) return 4;
  if (w >= 640) return 3;
  return 2;
}

function useColumnCount(): number {
  const [cols, setCols] = useState(getColumnCount);

  useEffect(() => {
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setCols((prev) => {
          const next = getColumnCount();
          return next === prev ? prev : next;
        });
      });
    };
    window.addEventListener("resize", onResize, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return cols;
}

export function MasonryColumns<T>({ items, getKey, renderItem }: MasonryColumnsProps<T>) {
  const columnCount = useColumnCount();

  const columns: { item: T; index: number }[][] = Array.from(
    { length: columnCount },
    () => [],
  );
  items.forEach((item, index) => {
    columns[index % columnCount].push({ item, index });
  });

  return (
    <div className="masonry-grid">
      {columns.map((col, c) => (
        <div className="masonry-column" key={c}>
          {col.map(({ item, index }) => (
            <div className="masonry-item" key={getKey(item, index)}>
              {renderItem(item, index)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default MasonryColumns;
