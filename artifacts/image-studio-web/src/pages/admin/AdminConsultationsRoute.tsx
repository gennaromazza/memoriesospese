/**
 * AdminConsultationsRoute - Route wrapper for standalone consultations page
 * 
 * Questo componente funge da adapter tra wouter RouteComponentProps
 * e le props custom di ConsultationsManager, risolvendo il conflitto LSP.
 * 
 * Estrae i query params dalla URL e li passa come props al manager.
 */

import { useLocation } from 'wouter';
import ConsultationsManager from './ConsultationsManager';

export default function AdminConsultationsRoute() {
  const [location] = useLocation();
  
  // Estrai query params dalla URL
  const searchParams = new URLSearchParams(location.split('?')[1] || '');
  const consultationId = searchParams.get('consultation');

  // Renderizza ConsultationsManager con le props estratte
  return (
    <ConsultationsManager
      highlightConsultationId={consultationId}
      onHighlightComplete={() => {
        // Rimuovi query param dopo highlight
        const newUrl = location.split('?')[0];
        window.history.replaceState({}, '', newUrl);
      }}
    />
  );
}
