/**
 * Public Questionnaire Form Page
 * Form pubblico per bride/groom con validazione token (placeholder per Fase 7)
 */

import { useState, useEffect } from 'react';
import { useParams, useSearch } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertCircle, Heart, Users } from 'lucide-react';

interface QuestionnaireFormParams {
  galleryId: string;
}

export default function QuestionnaireForm() {
  const params = useParams<QuestionnaireFormParams>();
  const search = useSearch();
  const [isLoading, setIsLoading] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);

  // Estrai parametri URL
  const urlParams = new URLSearchParams(search);
  const token = urlParams.get('token');
  const role = urlParams.get('role') as 'bride' | 'groom' | null;

  useEffect(() => {
    validateTokenAndSetupSession();
  }, [token, role]);

  const validateTokenAndSetupSession = async () => {
    if (!token || !role || !params?.galleryId) {
      setIsLoading(false);
      setTokenValid(false);
      return;
    }

    try {
      const { TokenValidationService } = await import('@/lib/tokenValidation');
      
      // Simula validazione (in produzione userebbe Cloud Functions)
      const validation = await TokenValidationService.validateTokenAndCreateSession(
        token,
        params.galleryId,
        role,
        TokenValidationService.generateBrowserFingerprint()
      );

      setTokenValid(validation.valid);
      
      if (validation.valid) {
        // Cleanup URL params dopo validazione riuscita
        TokenValidationService.cleanupUrlParams();
        
        // Salva sessionId in localStorage per persistenza
        if (validation.sessionId) {
          localStorage.setItem('questionnaire-session', validation.sessionId);
        }
      }
    } catch (error) {
      console.error('Errore validazione token:', error);
      setTokenValid(false);
    } finally {
      setIsLoading(false);
    }
  };

  // Meta tags per noindex/nofollow
  useEffect(() => {
    // Aggiungi meta tag per non indicizzare
    const metaRobots = document.createElement('meta');
    metaRobots.name = 'robots';
    metaRobots.content = 'noindex, nofollow, noarchive, nosnippet';
    document.head.appendChild(metaRobots);

    // Cleanup
    return () => {
      const existingMeta = document.querySelector('meta[name="robots"]');
      if (existingMeta) {
        document.head.removeChild(existingMeta);
      }
    };
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-rose-50 to-pink-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rose-600 mx-auto mb-6"></div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Validazione accesso...
          </h2>
          <p className="text-gray-600">
            Verifica del token in corso
          </p>
        </div>
      </div>
    );
  }

  if (!tokenValid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-rose-50">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2 text-red-600">
              <AlertCircle className="w-6 h-6" />
              Accesso Negato
            </CardTitle>
            <CardDescription>
              Token non valido o scaduto
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-gray-600 mb-4">
              Il link utilizzato non è valido o è scaduto. 
              Contatta gli sposi per un nuovo link di accesso.
            </p>
            <div className="space-y-2">
              <p className="text-sm text-gray-500">
                Galleria: {params?.galleryId}
              </p>
              {role && (
                <p className="text-sm text-gray-500">
                  Ruolo richiesto: {role === 'bride' ? 'Sposa' : 'Sposo'}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50">
      <div className="container mx-auto p-6 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-8 pt-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Heart className="w-8 h-8 text-rose-500" />
            <h1 className="text-4xl font-bold text-gray-900">
              Questionario Coppia
            </h1>
          </div>
          <p className="text-gray-600 text-lg">
            Condividi i momenti speciali del vostro amore
          </p>
          <div className="flex items-center justify-center gap-4 mt-4">
            <Badge variant="outline" className="text-rose-600 border-rose-200">
              <Users className="w-3 h-3 mr-1" />
              {role === 'bride' ? 'Sposa' : 'Sposo'}
            </Badge>
            <Badge variant="secondary">
              Galleria: {params?.galleryId}
            </Badge>
          </div>
        </div>

        {/* Contenuto placeholder */}
        <Card className="border-2 border-rose-100">
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2">
              <AlertCircle className="w-6 h-6 text-blue-500" />
              Form in Sviluppo
            </CardTitle>
            <CardDescription>
              Il questionario interattivo sarà disponibile nella Fase 7
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6 text-center">
              <div className="bg-blue-50 p-6 rounded-lg">
                <h3 className="text-lg font-semibold text-blue-900 mb-3">
                  Funzionalità in Arrivo
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    <span>Form multi-step (10 domande)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    <span>Autosave automatico</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    <span>Navigazione Avanti/Indietro</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    <span>Ripresa da bozza</span>
                  </div>
                </div>
              </div>

              <div className="text-center">
                <p className="text-gray-600 mb-4">
                  Parametri attuali ricevuti correttamente:
                </p>
                <div className="bg-gray-50 p-4 rounded-lg text-left max-w-md mx-auto">
                  <div className="space-y-2 text-sm font-mono">
                    <div><strong>Galleria:</strong> {params?.galleryId}</div>
                    <div><strong>Ruolo:</strong> {role}</div>
                    <div><strong>Token:</strong> {token ? `${token.slice(0, 8)}...` : 'N/A'}</div>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 justify-center">
                <Badge variant="outline">Fase 7</Badge>
                <Badge variant="secondary">Token Validato</Badge>
                <Badge variant="default" className="bg-green-600">
                  Route Funzionante
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}