/**
 * Gallery Header Themes
 * Definizioni pure-data dei template visivi per l'overlay della copertina galleria.
 * Nessun JSX qui — solo configurazione.
 */

export type GalleryHeaderThemeId =
  | 'classico'
  | 'dorato'
  | 'romantico'
  | 'minimalista'
  | 'bosco'
  | 'cinematografico';

export interface GalleryHeaderTheme {
  id: GalleryHeaderThemeId;
  nome: string;
  descrizione: string;
  /** Colori per il preview nella UI admin (swatches) */
  previewColors: string[];
  /** CSS gradient dell'overlay sopra la foto */
  gradient: string;
  /** Stile del testo del nome principale */
  titleStyle: React.CSSProperties;
  /** Classe Tailwind aggiuntiva per il titolo */
  titleClass: string;
  /** Stile della data/location */
  metaStyle: React.CSSProperties;
  /** Colore delle linee decorative (rgba CSS) */
  lineColor: string;
  /** Colore del separatore (fill SVG) */
  separatorColor: string;
  /** Opacità dell'etichetta sopra il nome (0–1) */
  labelOpacity: number;
  /** Testo dell'etichetta decorativa (null = non mostrare) */
  labelText: string | null;
  /** Tipo di separatore tra nome e data */
  separator: 'diamond' | 'stars' | 'line' | 'floral' | 'none';
  /** Allineamento del blocco testo */
  align: 'center' | 'left';
  /** Padding bottom del blocco testo */
  paddingBottom: string;
}

// Importato come type per evitare dipendenza React in questo file
import type React from 'react';

export const GALLERY_HEADER_THEMES: GalleryHeaderTheme[] = [
  {
    id: 'classico',
    nome: 'Classico',
    descrizione: 'Elegante gradiente scuro con diamante bianco. Senza tempo.',
    previewColors: ['#1a1612', '#2d2820', '#ffffff'],
    gradient: 'linear-gradient(to bottom, transparent 25%, rgba(10,8,6,0.12) 55%, rgba(10,8,6,0.72) 100%)',
    titleStyle: {
      color: 'white',
      textShadow: '0 2px 24px rgba(0,0,0,0.55), 0 1px 4px rgba(0,0,0,0.4)',
      fontFamily: "'Playfair Display', serif",
      fontWeight: 700,
      letterSpacing: '0.03em',
    },
    titleClass: 'text-3xl sm:text-4xl md:text-5xl lg:text-6xl leading-tight',
    metaStyle: {
      color: 'rgba(255,255,255,0.82)',
      textShadow: '0 1px 8px rgba(0,0,0,0.5)',
      fontFamily: "'Playfair Display', serif",
      fontStyle: 'italic',
      letterSpacing: '0.03em',
      fontSize: '0.95rem',
    },
    lineColor: 'rgba(255,255,255,0.6)',
    separatorColor: 'white',
    labelOpacity: 0.55,
    labelText: 'Galleria Fotografica',
    separator: 'diamond',
    align: 'center',
    paddingBottom: '2.5rem',
  },

  {
    id: 'dorato',
    nome: 'Dorato',
    descrizione: 'Lusso ed eleganza con accenti oro. Perfetto per matrimoni di gala.',
    previewColors: ['#1a1410', '#2a1f08', '#d4af37'],
    gradient: 'linear-gradient(to bottom, transparent 20%, rgba(20,14,4,0.18) 50%, rgba(20,14,4,0.82) 100%)',
    titleStyle: {
      color: '#f5e6b0',
      textShadow: '0 2px 30px rgba(180,120,0,0.35), 0 1px 6px rgba(0,0,0,0.6)',
      fontFamily: "'Playfair Display', serif",
      fontWeight: 700,
      letterSpacing: '0.05em',
    },
    titleClass: 'text-3xl sm:text-4xl md:text-5xl lg:text-6xl leading-tight',
    metaStyle: {
      color: 'rgba(212,175,55,0.85)',
      textShadow: '0 1px 10px rgba(0,0,0,0.5)',
      fontFamily: "'Playfair Display', serif",
      fontStyle: 'italic',
      letterSpacing: '0.06em',
      fontSize: '0.9rem',
    },
    lineColor: 'rgba(212,175,55,0.55)',
    separatorColor: '#d4af37',
    labelOpacity: 0.6,
    labelText: '✦  Galleria  ✦',
    separator: 'stars',
    align: 'center',
    paddingBottom: '2.5rem',
  },

  {
    id: 'romantico',
    nome: 'Romantico',
    descrizione: 'Sfumature rosa cipria e testo morbido. Per matrimoni dal cuore tenero.',
    previewColors: ['#1a0e0e', '#3d1a1a', '#f5c6c6'],
    gradient: 'linear-gradient(to bottom, transparent 20%, rgba(60,20,20,0.1) 52%, rgba(30,10,10,0.78) 100%)',
    titleStyle: {
      color: '#fce8e8',
      textShadow: '0 2px 20px rgba(150,60,60,0.4), 0 1px 6px rgba(0,0,0,0.55)',
      fontFamily: "'Playfair Display', serif",
      fontWeight: 700,
      fontStyle: 'italic',
      letterSpacing: '0.02em',
    },
    titleClass: 'text-3xl sm:text-4xl md:text-5xl lg:text-6xl leading-tight',
    metaStyle: {
      color: 'rgba(252,210,210,0.85)',
      textShadow: '0 1px 8px rgba(0,0,0,0.4)',
      fontFamily: "'Playfair Display', serif",
      fontStyle: 'italic',
      letterSpacing: '0.04em',
      fontSize: '0.9rem',
    },
    lineColor: 'rgba(252,180,180,0.5)',
    separatorColor: '#fbc8c8',
    labelOpacity: 0.55,
    labelText: 'Il nostro giorno speciale',
    separator: 'floral',
    align: 'center',
    paddingBottom: '2.5rem',
  },

  {
    id: 'minimalista',
    nome: 'Minimalista',
    descrizione: 'Design pulito e moderno. Lascia parlare la fotografia.',
    previewColors: ['#000000', '#111111', '#eeeeee'],
    gradient: 'linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.08) 65%, rgba(0,0,0,0.65) 100%)',
    titleStyle: {
      color: 'white',
      textShadow: 'none',
      fontFamily: "'Playfair Display', serif",
      fontWeight: 400,
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
    },
    titleClass: 'text-2xl sm:text-3xl md:text-4xl lg:text-5xl leading-tight',
    metaStyle: {
      color: 'rgba(255,255,255,0.65)',
      fontFamily: 'system-ui, sans-serif',
      letterSpacing: '0.18em',
      textTransform: 'uppercase',
      fontSize: '0.7rem',
    },
    lineColor: 'rgba(255,255,255,0.35)',
    separatorColor: 'rgba(255,255,255,0.5)',
    labelOpacity: 0,
    labelText: null,
    separator: 'line',
    align: 'center',
    paddingBottom: '2.5rem',
  },

  {
    id: 'bosco',
    nome: 'Bosco',
    descrizione: 'Verde smeraldo e toni naturali. Per cerimonie in villa o all\'aperto.',
    previewColors: ['#0d1f14', '#1a3324', '#7eb89a'],
    gradient: 'linear-gradient(to bottom, transparent 22%, rgba(8,22,14,0.15) 52%, rgba(8,22,14,0.80) 100%)',
    titleStyle: {
      color: '#d4ede0',
      textShadow: '0 2px 24px rgba(0,60,20,0.5), 0 1px 5px rgba(0,0,0,0.5)',
      fontFamily: "'Playfair Display', serif",
      fontWeight: 700,
      letterSpacing: '0.03em',
    },
    titleClass: 'text-3xl sm:text-4xl md:text-5xl lg:text-6xl leading-tight',
    metaStyle: {
      color: 'rgba(190,230,208,0.82)',
      textShadow: '0 1px 8px rgba(0,0,0,0.4)',
      fontFamily: "'Playfair Display', serif",
      fontStyle: 'italic',
      letterSpacing: '0.03em',
      fontSize: '0.9rem',
    },
    lineColor: 'rgba(126,184,154,0.55)',
    separatorColor: '#7eb89a',
    labelOpacity: 0.55,
    labelText: 'Galleria Fotografica',
    separator: 'diamond',
    align: 'center',
    paddingBottom: '2.5rem',
  },

  {
    id: 'cinematografico',
    nome: 'Cinematografico',
    descrizione: 'Overlay scuro e drammatico. Effetto film per coppie moderne.',
    previewColors: ['#080808', '#181818', '#cccccc'],
    gradient: 'linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.2) 38%, rgba(0,0,0,0.82) 100%)',
    titleStyle: {
      color: 'white',
      textShadow: '0 2px 8px rgba(0,0,0,0.8)',
      fontFamily: "'Playfair Display', serif",
      fontWeight: 700,
      letterSpacing: '0.08em',
    },
    titleClass: 'text-3xl sm:text-4xl md:text-5xl lg:text-6xl leading-tight',
    metaStyle: {
      color: 'rgba(200,200,200,0.8)',
      textShadow: '0 1px 4px rgba(0,0,0,0.8)',
      fontFamily: 'system-ui, sans-serif',
      letterSpacing: '0.15em',
      textTransform: 'uppercase',
      fontSize: '0.72rem',
    },
    lineColor: 'rgba(255,255,255,0.3)',
    separatorColor: 'rgba(255,255,255,0.6)',
    labelOpacity: 0,
    labelText: null,
    separator: 'line',
    align: 'center',
    paddingBottom: '3rem',
  },
];

export const DEFAULT_THEME_ID: GalleryHeaderThemeId = 'classico';

export function getThemeById(id?: string | null): GalleryHeaderTheme {
  return GALLERY_HEADER_THEMES.find(t => t.id === id) ?? GALLERY_HEADER_THEMES[0];
}
