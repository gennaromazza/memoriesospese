import { useState, useEffect } from 'react';

/**
 * Hook per rilevare breakpoint responsive
 * @returns {boolean} true se mobile (< 768px), false altrimenti
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 768px)');
    
    // Handler per aggiornamenti
    const handleChange = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(e.matches);
    };
    
    // Set iniziale
    setIsMobile(mediaQuery.matches);
    
    // Listener per cambiamenti
    mediaQuery.addEventListener('change', handleChange);
    
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  return isMobile;
}

/**
 * Hook avanzato con più breakpoint
 */
export function useBreakpoint() {
  const [breakpoint, setBreakpoint] = useState<'mobile' | 'tablet' | 'desktop'>('desktop');

  useEffect(() => {
    const mobile = window.matchMedia('(max-width: 640px)');
    const tablet = window.matchMedia('(min-width: 641px) and (max-width: 1024px)');
    
    const updateBreakpoint = () => {
      if (mobile.matches) {
        setBreakpoint('mobile');
      } else if (tablet.matches) {
        setBreakpoint('tablet');
      } else {
        setBreakpoint('desktop');
      }
    };
    
    // Set iniziale
    updateBreakpoint();
    
    // Listeners
    mobile.addEventListener('change', updateBreakpoint);
    tablet.addEventListener('change', updateBreakpoint);
    
    return () => {
      mobile.removeEventListener('change', updateBreakpoint);
      tablet.removeEventListener('change', updateBreakpoint);
    };
  }, []);

  return {
    breakpoint,
    isMobile: breakpoint === 'mobile',
    isTablet: breakpoint === 'tablet',
    isDesktop: breakpoint === 'desktop'
  };
}
