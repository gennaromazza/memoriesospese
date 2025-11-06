import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface OnboardingSpotlightProps {
  /**
   * Unique key for localStorage (e.g., "gallery-product-assignment-tutorial")
   */
  storageKey: string;
  
  /**
   * Target element selector (e.g., "[data-testid='button-mobile-assign-foto1']")
   */
  targetSelector: string;
  
  /**
   * Title of the tutorial tooltip
   */
  title: string;
  
  /**
   * Description text explaining the feature
   */
  description: string;
  
  /**
   * Optional callback when user dismisses the tutorial
   */
  onDismiss?: () => void;
  
  /**
   * Whether to show the spotlight (external control)
   */
  isVisible: boolean;
}

/**
 * OnboardingSpotlight - Tutorial interattivo stile Temu
 * 
 * Mostra un overlay scuro con elemento evidenziato, animazione pulse,
 * e tooltip esplicativo per guidare l'utente attraverso nuove funzionalità.
 * 
 * Features:
 * - Overlay scuro (rgba) con z-index elevato
 * - Elemento target evidenziato con bordo pulse animato
 * - Tooltip posizionato automaticamente sopra l'elemento
 * - Dismissione permanente via localStorage
 * - Responsive e accessibile
 */
export function OnboardingSpotlight({
  storageKey,
  targetSelector,
  title,
  description,
  onDismiss,
  isVisible,
}: OnboardingSpotlightProps) {
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [show, setShow] = useState(false);
  const [isAboveTarget, setIsAboveTarget] = useState(true); // Tooltip sopra o sotto il target

  useEffect(() => {
    if (!isVisible) {
      setShow(false);
      return;
    }

    // Check if user has already seen this tutorial
    const hasSeenTutorial = localStorage.getItem(storageKey);
    if (hasSeenTutorial) {
      setShow(false);
      return;
    }

    // Wait for DOM to be ready, then find target element
    const timer = setTimeout(() => {
      const element = document.querySelector(targetSelector) as HTMLElement;
      if (element) {
        setTargetElement(element);
        const rect = element.getBoundingClientRect();
        setTargetRect(rect);
        
        // 🎯 Smart positioning: se target è nella metà superiore, tooltip sotto, altrimenti sopra
        const isTopHalf = rect.top < window.innerHeight / 2;
        setIsAboveTarget(!isTopHalf);
        
        setShow(true);
      }
    }, 100); // Ridotto delay perché ora il wrapper fa polling

    return () => clearTimeout(timer);
  }, [isVisible, storageKey, targetSelector]);

  // 🔄 Riposizionamento dinamico su scroll/resize (migliorato)
  useEffect(() => {
    if (!targetElement || !show) return;

    const updatePosition = () => {
      const rect = targetElement.getBoundingClientRect();
      setTargetRect(rect);
      
      // Ricalcola posizione sopra/sotto in base alla nuova posizione
      const isTopHalf = rect.top < window.innerHeight / 2;
      setIsAboveTarget(!isTopHalf);
    };

    // 📜 Listen su resize e scroll (con capture per elementi scrollabili)
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true); // true = capture phase

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [targetElement, show]);

  const handleDismiss = () => {
    localStorage.setItem(storageKey, "true");
    setShow(false);
    onDismiss?.();
  };

  if (!show || !targetRect) return null;

  // 🎯 Smart tooltip positioning
  const tooltipWidth = 300;
  const tooltipHeight = 180; // Altezza stimata
  const padding = 16; // Padding dai bordi
  const gap = 12; // Gap tra target e tooltip

  // Calcola posizione verticale (sopra o sotto il target)
  const tooltipTop = isAboveTarget
    ? targetRect.top - tooltipHeight - gap // Sopra il target
    : targetRect.bottom + gap; // Sotto il target

  // Calcola posizione orizzontale (centrato sul target, con limiti)
  const targetCenter = targetRect.left + targetRect.width / 2;
  const tooltipLeft = Math.max(
    padding, // Min padding da sinistra
    Math.min(
      window.innerWidth - tooltipWidth - padding, // Max padding da destra
      targetCenter - tooltipWidth / 2 // Centrato sul target
    )
  );

  return (
    <>
      {/* Dark Overlay */}
      <div
        className="fixed inset-0 bg-black/80 z-[9998] transition-opacity duration-300"
        style={{ opacity: show ? 1 : 0 }}
      />

      {/* Highlighted Element Cutout with Pulse Animation */}
      <div
        className="fixed z-[9999] pointer-events-none"
        style={{
          top: targetRect.top - 8,
          left: targetRect.left - 8,
          width: targetRect.width + 16,
          height: targetRect.height + 16,
        }}
      >
        {/* White glow pulse */}
        <div className="absolute inset-0 rounded-lg border-4 border-white shadow-[0_0_0_4px_rgba(255,255,255,0.3)] animate-spotlight-pulse" />
        
        {/* Pointer arrow - dinamica in base a posizione */}
        <div
          className={`absolute left-1/2 -translate-x-1/2 text-white animate-bounce ${
            isAboveTarget ? '-bottom-12' : '-top-12'
          }`}
          style={{ fontSize: "48px" }}
        >
          {isAboveTarget ? '↑' : '↓'}
        </div>
      </div>

      {/* Tooltip Card - con transform per centratura perfetta */}
      <div
        className="fixed z-[10000] max-w-[280px] bg-white rounded-lg shadow-2xl p-5 animate-fade-in transition-all duration-200"
        style={{
          top: `${tooltipTop}px`,
          left: `${tooltipLeft}px`,
        }}
      >
        {/* Close button */}
        <button
          onClick={handleDismiss}
          className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Chiudi tutorial"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Content */}
        <div className="mb-4">
          <h3 className="text-lg font-playfair font-semibold text-blue-gray mb-2">
            {title}
          </h3>
          <p className="text-sm text-gray-600 leading-relaxed">
            {description}
          </p>
        </div>

        {/* Action button */}
        <Button
          onClick={handleDismiss}
          className="w-full bg-gradient-to-r from-sage to-dark-sage hover:from-dark-sage hover:to-sage text-white"
        >
          Ho capito! 👍
        </Button>
      </div>
    </>
  );
}
