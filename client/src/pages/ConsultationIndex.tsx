
/**
 * CONSULTATION INDEX PAGE
 * Pagina pubblica - mostra tipi lavoro disponibili per consulenze
 */

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useJobTypes } from '@/lib/consultations';
import { Link } from 'wouter';
import { Calendar, ArrowRight, Loader2 } from 'lucide-react';

export default function ConsultationIndex() {
  const { data: jobTypes, isLoading } = useJobTypes();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-off-white">
        <Loader2 className="h-8 w-8 animate-spin text-sage" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-off-white to-white">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 max-w-7xl">
        {/* Header */}
        <div className="text-center mb-8 sm:mb-12">
          <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-sage/10 mb-4">
            <Calendar className="h-7 w-7 sm:h-8 sm:w-8 text-sage" />
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-playfair font-bold text-blue-gray mb-3 sm:mb-4">
            Prenota una Consulenza
          </h1>
          <p className="text-base sm:text-lg text-gray-600 max-w-2xl mx-auto px-4">
            Scegli il tipo di servizio fotografico per cui desideri una consulenza preliminare.
            Ti aiuteremo a pianificare ogni dettaglio del tuo evento speciale.
          </p>
        </div>

        {/* Job Types Grid */}
        {!jobTypes || jobTypes.length === 0 ? (
          <Card className="text-center py-12 border-beige">
            <CardContent>
              <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">
                Nessun tipo di consulenza disponibile al momento.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {jobTypes.map((jobType) => (
              <Link key={jobType} href={`/consulenze/${encodeURIComponent(jobType)}`}>
                <Card 
                  className="h-full transition-all duration-300 hover:shadow-xl hover:scale-[1.02] cursor-pointer border-beige bg-white group"
                  data-testid={`card-job-type-${jobType}`}
                >
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg sm:text-xl font-playfair text-blue-gray flex items-center justify-between gap-2">
                      <span className="line-clamp-2">{jobType}</span>
                      <ArrowRight className="h-5 w-5 text-sage flex-shrink-0 transition-transform group-hover:translate-x-1" />
                    </CardTitle>
                    <CardDescription className="text-sm text-gray-600 line-clamp-2">
                      Prenota una consulenza preliminare per {jobType.toLowerCase()}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button 
                      variant="outline" 
                      className="w-full border-sage text-sage hover:bg-sage hover:text-white transition-colors"
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
        <div className="mt-12 sm:mt-16 bg-white rounded-lg shadow-sm border border-beige p-6 sm:p-8">
          <h2 className="text-2xl sm:text-3xl font-playfair font-semibold text-blue-gray mb-6 text-center sm:text-left">
            Come funziona?
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-sage/10 text-sage font-bold text-xl mb-3">
                1
              </div>
              <h3 className="font-semibold text-blue-gray mb-2 text-base sm:text-lg">
                Scegli il Servizio
              </h3>
              <p className="text-sm text-gray-600">
                Seleziona il tipo di servizio fotografico che ti interessa
              </p>
            </div>
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-sage/10 text-sage font-bold text-xl mb-3">
                2
              </div>
              <h3 className="font-semibold text-blue-gray mb-2 text-base sm:text-lg">
                Prenota uno Slot
              </h3>
              <p className="text-sm text-gray-600">
                Scegli data e orario più comodi per la tua consulenza
              </p>
            </div>
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-sage/10 text-sage font-bold text-xl mb-3">
                3
              </div>
              <h3 className="font-semibold text-blue-gray mb-2 text-base sm:text-lg">
                Consulenza Gratuita
              </h3>
              <p className="text-sm text-gray-600">
                Parleremo di ogni dettaglio del tuo progetto fotografico
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
