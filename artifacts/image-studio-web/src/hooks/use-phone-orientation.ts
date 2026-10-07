/**
 * Rilevamento telefono + orientamento basato sullo SCHERMO FISICO
 * (screen.orientation), NON sul viewport. Motivo: con il meta tag
 * interactive-widget=resizes-content la tastiera restringe il viewport e le
 * media query (orientation)/(max-width) "vedono" un landscape fantasma col
 * telefono in verticale, facendo apparire overlay sbagliati. Lo schermo
 * fisico invece non cambia mai con la tastiera.
 */
import { useEffect, useState } from 'react';

function compute(): { isPhone: boolean; isPortrait: boolean } {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  // Lato corto dello schermo fisico: ≤ ~700px = smartphone
  const minSide = Math.min(window.screen.width, window.screen.height);
  const isPhone = coarse && minSide <= 700;
  const type = window.screen.orientation?.type;
  let isPortrait: boolean;
  if (type) {
    isPortrait = type.startsWith('portrait');
  } else {
    // Fallback (vecchi iOS senza screen.orientation): angolo di rotazione
    const angle = (window as any).orientation;
    isPortrait =
      typeof angle === 'number'
        ? Math.abs(angle) !== 90
        : window.screen.height >= window.screen.width;
  }
  return { isPhone, isPortrait };
}

export function usePhoneOrientation(): { isPhone: boolean; isPortrait: boolean } {
  const [state, setState] = useState(compute);
  useEffect(() => {
    const update = () => setState(compute());
    const so = window.screen.orientation;
    so?.addEventListener('change', update);
    // Fallback per browser senza evento screen.orientation
    window.addEventListener('orientationchange', update);
    window.addEventListener('resize', update);
    return () => {
      so?.removeEventListener('change', update);
      window.removeEventListener('orientationchange', update);
      window.removeEventListener('resize', update);
    };
  }, []);
  return state;
}
