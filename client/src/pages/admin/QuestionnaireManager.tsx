/**
 * Admin Questionnaire Manager Page
 * Gestisce questionari per una specifica galleria (placeholder per Fase 5)
 */

import { useState, useEffect } from 'react';
import { useLocation, useParams } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Settings, AlertCircle } from 'lucide-react';

interface QuestionnaireManagerParams {
  galleryId: string;
}

export default function QuestionnaireManager() {
  const [, setLocation] = useLocation();
  const params = useParams<QuestionnaireManagerParams>();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simula caricamento dati
    const timer = setTimeout(() => setIsLoading(false), 1000);
    return () => clearTimeout(timer);
  }, []);

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-muted-foreground">Caricamento questionario...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      {/* Header con breadcrumb */}
      <div className="flex items-center gap-4 mb-8">
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => setLocation('/admin/dashboard')}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Dashboard
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Questionario Galleria</h1>
          <p className="text-muted-foreground mt-1">
            ID Galleria: {params?.galleryId}
          </p>
        </div>
      </div>

      {/* Contenuto placeholder */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Gestione Questionario
          </CardTitle>
          <CardDescription>
            Configura il questionario per le coppie di questa galleria
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 p-8 text-center">
            <AlertCircle className="w-12 h-12 text-blue-500 flex-shrink-0" />
            <div>
              <h3 className="text-lg font-semibold mb-2">Componente in Sviluppo</h3>
              <p className="text-muted-foreground mb-4">
                Il QuestionnaireManager sarà implementato nella Fase 5.
                Include generazione token, gestione stato compilazione e export risposte.
              </p>
              <div className="flex gap-2 justify-center">
                <Badge variant="outline">Fase 5</Badge>
                <Badge variant="secondary">In Programma</Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}