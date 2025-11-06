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
        setTargetRect(element.getBoundingClientRect());
        setShow(true);
      }
    }, 500); // Delay to ensure photo grid is rendered

    return () => clearTimeout(timer);
  }, [isVisible, storageKey, targetSelector]);

  // Update position on scroll/resize
  useEffect(() => {
    if (!targetElement) return;

    const updatePosition = () => {
      setTargetRect(targetElement.getBoundingClientRect());
    };

    window.addEventListener("scroll", updatePosition);
    window.addEventListener("resize", updatePosition);

    return () => {
      window.removeEventListener("scroll", updatePosition);
      window.removeEventListener("resize", updatePosition);
    };
  }, [targetElement]);

  const handleDismiss = () => {
    localStorage.setItem(storageKey, "true");
    setShow(false);
    onDismiss?.();
  };

  if (!show || !targetRect) return null;

  // Calculate tooltip position (centered above target with padding)
  const tooltipTop = targetRect.top - 180; // 180px above target
  const tooltipLeft = Math.max(
    16, // Min 16px from left edge
    Math.min(
      window.innerWidth - 316, // Max 16px from right edge (300px width + padding)
      targetRect.left + targetRect.width / 2 - 150 // Center on target
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
        
        {/* Pointer arrow */}
        <div
          className="absolute -top-12 left-1/2 -translate-x-1/2 text-white animate-bounce"
          style={{ fontSize: "48px" }}
        >
          ↓
        </div>
      </div>

      {/* Tooltip Card */}
      <div
        className="fixed z-[10000] w-[300px] bg-white rounded-lg shadow-2xl p-5 animate-fade-in"
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
