/**
 * QUOTE PORTAL - Link Pubblico Unificato
 * 
 * Componente intelligente che mostra automaticamente la view corretta
 * in base allo stato del preventivo:
 * - NON firmato → QuotePublicViewPage (per firmare)
 * - Firmato → QuoteSignedPortalPage (preventivo firmato + pagamenti)
 */

import { useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import QuotePublicViewPage from './QuotePublicViewPage';
import QuoteSignedPortalPage from './QuoteSignedPortalPage';

export default function QuotePortal() {
  const params = useParams();
  const [, navigate] = useLocation();
  const token = params.token;

  // Fetch quote per determinare lo stato
  const { data, isLoading, error } = useQuery({
    queryKey: ['/api/quotes/portal-check', token],
    queryFn: async () => {
      // Prova prima endpoint public (per preventivi non firmati)
      try {
        const response = await fetch(`/api/quotes/public/${token}`);
        if (response.ok) {
          const data = await response.json();
          return { 
            status: data.data.quote.status,
            isSigned: data.data.quote.status === 'firmato'
          };
        }
      } catch (err) {
        console.error('Error checking quote status:', err);
      }

      // Fallback: prova endpoint signed
      try {
        const response = await fetch(`/api/quotes/signed/${token}`);
        if (response.ok) {
          return { 
            status: 'firmato',
            isSigned: true
          };
        }
      } catch (err) {
        console.error('Error checking signed quote:', err);
      }

      throw new Error('Preventivo non trovato o token non valido');
    },
    enabled: !!token,
    retry: false
  });

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-sage/10 to-white">
        <div className="text-center">
          <Loader2 className="h-12 w-12 mx-auto mb-4 text-sage animate-spin" />
          <p className="text-sage-dark font-medium">Caricamento preventivo...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !data) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-sage/10 to-white p-4">
        <div className="text-center max-w-md">
          <div className="bg-red-50 border-2 border-red-200 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-red-800 mb-2">
              Preventivo non trovato
            </h2>
            <p className="text-red-600">
              Il link che hai seguito non è valido o è scaduto.
              <br />
              Contatta lo studio per ricevere un nuovo link.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Renderizza il componente corretto in base allo stato
  if (data.isSigned) {
    // Preventivo firmato → Mostra portale firmato
    return <QuoteSignedPortalPage />;
  } else {
    // Preventivo non firmato → Mostra portale per firmare
    return <QuotePublicViewPage />;
  }
}
