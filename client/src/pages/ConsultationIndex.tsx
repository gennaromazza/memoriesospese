/**
 * CONSULTATION INDEX PAGE
 * Pagina pubblica - mostra tipi lavoro disponibili per consulenze
 */

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useJobTypes } from '@/lib/consultations';
import { Link } from 'wouter';
import { Calendar, ArrowRight, Loader2 } from 'lucide-react';

export function ConsultationIndex() {
  const { data: jobTypes, isLoading } = useJobTypes();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-sage-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-sage-50 to-white dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-12 max-w-6xl">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-sage-100 dark:bg-sage-900 mb-4">
            <Calendar className="h-8 w-8 text-sage-600 dark:text-sage-400" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Prenota una Consulenza
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            Scegli il tipo di servizio fotografico per cui desideri una consulenza preliminare.
            Ti aiuteremo a pianificare ogni dettaglio del tuo evento speciale.
          </p>
        </div>

        {/* Job Types Grid */}
        {!jobTypes || jobTypes.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">
                Nessun tipo di consulenza disponibile al momento.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {jobTypes.map((jobType) => (
              <Link key={jobType} href={`/consulenze/${encodeURIComponent(jobType)}`}>
                <Card 
                  className="h-full transition-all duration-200 hover:shadow-lg hover:scale-105 cursor-pointer border-2 border-transparent hover:border-sage-300 dark:hover:border-sage-700"
                  data-testid={`card-job-type-${jobType}`}
                >
                  <CardHeader>
                    <CardTitle className="text-xl text-gray-900 dark:text-white flex items-center justify-between">
                      {jobType}
                      <ArrowRight className="h-5 w-5 text-sage-600 dark:text-sage-400" />
                    </CardTitle>
                    <CardDescription className="text-gray-600 dark:text-gray-400">
                      Prenota una consulenza preliminare per {jobType.toLowerCase()}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button 
                      variant="outline" 
                      className="w-full border-sage-300 text-sage-700 hover:bg-sage-50 dark:border-sage-700 dark:text-sage-400 dark:hover:bg-sage-900"
                      data-testid={`button-view-templates-${jobType}`}
                    >
                      Visualizza Opzioni
                    </Button>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}

        {/* Info Section */}
        <div className="mt-16 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-8">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
            Come funziona?
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-sage-100 dark:bg-sage-900 text-sage-600 dark:text-sage-400 font-bold mb-3">
                1
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                Scegli il Servizio
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Seleziona il tipo di servizio fotografico che ti interessa
              </p>
            </div>
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-sage-100 dark:bg-sage-900 text-sage-600 dark:text-sage-400 font-bold mb-3">
                2
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                Prenota uno Slot
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Scegli data e orario più comodi per la tua consulenza
              </p>
            </div>
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-sage-100 dark:bg-sage-900 text-sage-600 dark:text-sage-400 font-bold mb-3">
                3
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                Consulenza Gratuita
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Parleremo di ogni dettaglio del tuo progetto fotografico
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
