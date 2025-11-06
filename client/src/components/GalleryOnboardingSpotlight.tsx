import { useEffect, useState } from "react";
import { OnboardingSpotlight } from "./OnboardingSpotlight";

interface GalleryOnboardingSpotlightProps {
  galleryData: {
    id: string;
    productRequirements?: Array<{
      prodottoNome: string;
      prodottoNumeroFoto: number;
    }> | null;
    selectionStatus?: string;
  } | null;
  isSelectionMode: boolean;
  isDeadlinePassed?: boolean;
}

/**
 * GalleryOnboardingSpotlight - Wrapper component per tutorial multi-prodotto
 * 
 * Gestisce automaticamente:
 * - Trigger basato su condizioni (multi-product mode, non completato, deadline non passata)
 * - Check localStorage per evitare mostrare tutorial più volte
 * - Polling intelligente per aspettare che i pulsanti siano renderizzati nel DOM
 * - Scroll automatico verso il target quando il tutorial appare
 * - Dismissione e salvataggio preferenza utente
 * 
 * Questo componente incapsula TUTTA la logica del tutorial onboarding,
 * permettendo a Gallery.tsx di rimanere pulita e leggibile.
 */
export function GalleryOnboardingSpotlight({
  galleryData,
  isSelectionMode,
  isDeadlinePassed = false,
}: GalleryOnboardingSpotlightProps) {
  const [showSpotlight, setShowSpotlight] = useState(false);

  useEffect(() => {
    // 📱 Mobile-only tutorial: su desktop i chip sono già visibili e auto-esplicativi
    const isMobile = window.innerWidth < 768;
    if (!isMobile) {
      return;
    }

    // Guard: verifica che sia il momento giusto per mostrare il tutorial
    if (
      !isSelectionMode ||
      !galleryData?.productRequirements ||
      galleryData.productRequirements.length === 0 ||
      galleryData.selectionStatus === "completed" ||
      isDeadlinePassed
    ) {
      return;
    }

    const tutorialKey = `gallery-product-assignment-tutorial-${galleryData.id}`;
    
    // Check se l'utente ha già visto il tutorial
    const alreadyShown = localStorage.getItem(tutorialKey);
    if (alreadyShown) {
      return;
    }

    // 🎯 Polling intelligente: aspetta che i pulsanti siano renderizzati
    const checkReady = setInterval(() => {
      const target = document.querySelector('[data-testid^="button-mobile-assign-"]');
      
      if (target) {
        clearInterval(checkReady);
        
        // 📜 Scroll automatico verso il target (smooth, centrato)
        target.scrollIntoView({ 
          behavior: "smooth", 
          block: "center",
          inline: "nearest"
        });
        
        // ⏱️ Piccolo delay post-scroll per dare tempo all'animazione
        setTimeout(() => {
          setShowSpotlight(true);
        }, 400);
      }
    }, 300); // Poll ogni 300ms

    // Cleanup: stop polling dopo 10 secondi per evitare loop infiniti
    const timeout = setTimeout(() => {
      clearInterval(checkReady);
    }, 10000);

    return () => {
      clearInterval(checkReady);
      clearTimeout(timeout);
    };
  }, [galleryData, isSelectionMode, isDeadlinePassed]);

  const handleDismiss = () => {
    setShowSpotlight(false);
  };

  if (!galleryData) return null;

  return (
    <OnboardingSpotlight
      storageKey={`gallery-product-assignment-tutorial-${galleryData.id}`}
      targetSelector='[data-testid^="button-mobile-assign-"]'
      title="🏷️ Come assegnare le foto"
      description="Clicca sul pulsante 'Assegna ai prodotti' sotto ogni foto per scegliere a quali prodotti assegnare l'immagine. Puoi assegnare la stessa foto a più prodotti!"
      isVisible={showSpotlight}
      onDismiss={handleDismiss}
    />
  );
}
