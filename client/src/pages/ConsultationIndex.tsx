/**
 * CONSULTATION INDEX PAGE
 * Pagina pubblica - mostra tipi lavoro disponibili per consulenze
 */

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { getActiveJobTypes } from '@/lib/job-types';
import { Link } from 'wouter';
import { Calendar, ArrowRight, Loader2, Heart, Baby, Cake, Briefcase, User, Camera } from 'lucide-react';
import { useStudio } from '@/context/StudioContext';
import Navigation from '@/components/Navigation';

export default function ConsultationIndex() {
  const { data: jobTypesData, isLoading } = useQuery({
    queryKey: ['jobTypes'],
    queryFn: getActiveJobTypes,
  });
  
  // Estrae solo i nomi per compatibilità
  const jobTypes = jobTypesData?.map(jt => jt.nome) || [];
  
  const { studioSettings } = useStudio();

  const getJobTypeIcon = (jobType: string) => {
    const jobTypeLower = jobType.toLowerCase();

    if (jobTypeLower.includes('matrimonio')) {
      return Heart;
    } else if (jobTypeLower.includes('battesimo') || jobTypeLower.includes('comunione')) {
      return Baby;
    } else if (jobTypeLower.includes('compleanno')) {
      return Cake;
    } else if (jobTypeLower.includes('aziendale') || jobTypeLower.includes('corporate')) {
      return Briefcase;
    } else if (jobTypeLower.includes('ritratto')) {
      return User;
    } else {
      return Camera;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-off-white">
        <Loader2 className="h-8 w-8 animate-spin text-sage" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-off-white to-white">
      <Navigation />
      <div className="container mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-12 max-w-7xl">
        {/* Header */}
        <div className="text-center mb-6 sm:mb-12">
          <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-sage/10 mb-3 sm:mb-4">
            <Calendar className="h-6 w-6 sm:h-8 sm:w-8 text-sage" />
          </div>
          <h1 className="text-2xl sm:text-4xl lg:text-5xl font-playfair font-bold text-blue-gray mb-2 sm:mb-4 px-2">
            Prenota una Consulenza
          </h1>
          <p className="text-sm sm:text-lg text-gray-600 max-w-2xl mx-auto px-4 leading-relaxed">
            Scegli il tipo di servizio fotografico per cui desideri una consulenza preliminare.
            Ti aiuteremo a pianificare ogni dettaglio del tuo evento speciale.
          </p>
        </div>

        {/* Job Types Grid */}
        {!jobTypes || jobTypes.length === 0 ? (
          <Card className="text-center py-12 border-beige mx-2">
            <CardContent>
              <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">
                Nessun tipo di consulenza disponibile al momento.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
            {jobTypesData?.map((jobType) => {
              const IconComponent = getJobTypeIcon(jobType.nome);
              const hasImage = !!jobType.imageUrl;
              
              return (
                <Link key={jobType.id} href={`/consulenze/${jobType.slug}`}>
                  <Card 
                    className="h-full transition-all duration-300 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] cursor-pointer border-beige bg-white group overflow-hidden"
                    data-testid={`card-job-type-${jobType.nome}`}
                  >
                    <CardHeader className="pb-2 sm:pb-3 p-4 sm:p-6">
                      {hasImage ? (
                        <div className="flex justify-center mb-3 sm:mb-4 -mx-4 sm:-mx-6 -mt-4 sm:-mt-6">
                          <div className="w-full h-32 sm:h-40 overflow-hidden">
                            <img 
                              src={jobType.imageUrl} 
                              alt={jobType.nome}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="flex justify-center mb-3 sm:mb-4">
                          <div className="w-14 h-14 sm:w-16 sm:h-16 bg-sage/20 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                            <IconComponent className="h-7 w-7 sm:h-8 sm:w-8 text-sage" />
                          </div>
                        </div>
                      )}
                      <CardTitle className="text-base sm:text-xl font-playfair text-blue-gray flex items-center justify-between gap-2">
                        <span className="line-clamp-2 leading-tight">{jobType.nome}</span>
                        <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5 text-sage flex-shrink-0 transition-transform group-hover:translate-x-1" />
                      </CardTitle>
                      <CardDescription className="text-xs sm:text-sm text-gray-600 line-clamp-2 leading-relaxed mt-1 sm:mt-2">
                        {jobType.descrizione || `Prenota una consulenza preliminare per ${jobType.nome.toLowerCase()}`}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-4 sm:p-6 pt-0">
                      <Button 
                        variant="outline" 
                        className="w-full border-sage text-sage hover:bg-sage hover:text-white transition-colors text-sm sm:text-base min-h-[44px] sm:h-10"
                        data-testid={`button-view-templates-${jobType.nome}`}
                      >
                        Visualizza Opzioni
                      </Button>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}

        {/* Info Section */}
        <div className="mt-8 sm:mt-16 bg-white rounded-lg shadow-sm border border-beige p-5 sm:p-8 mx-2 sm:mx-0">
          <h2 className="text-xl sm:text-3xl font-playfair font-semibold text-blue-gray mb-5 sm:mb-6 text-center">
            Come funziona?
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 sm:gap-8">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-sage/10 text-sage font-bold text-lg sm:text-xl mb-2 sm:mb-3">
                1
              </div>
              <h3 className="font-semibold text-blue-gray mb-1.5 sm:mb-2 text-sm sm:text-lg">
                Scegli il Servizio
              </h3>
              <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
                Seleziona il tipo di servizio fotografico che ti interessa
              </p>
            </div>
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-sage/10 text-sage font-bold text-lg sm:text-xl mb-2 sm:mb-3">
                2
              </div>
              <h3 className="font-semibold text-blue-gray mb-1.5 sm:mb-2 text-sm sm:text-lg">
                Prenota uno Slot
              </h3>
              <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
                Scegli data e orario più comodi per la tua consulenza
              </p>
            </div>
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-sage/10 text-sage font-bold text-lg sm:text-xl mb-2 sm:mb-3">
                3
              </div>
              <h3 className="font-semibold text-blue-gray mb-1.5 sm:mb-2 text-sm sm:text-lg">
                Consulenza Gratuita
              </h3>
              <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
                Parleremo di ogni dettaglio del tuo progetto fotografico
              </p>
            </div>
          </div>
        </div>

        {/* Help Section with WhatsApp */}
        <div className="mt-8 bg-gradient-to-r from-terra/5 to-sage/5 rounded-2xl border border-terra/20 p-8 sm:p-10 text-center shadow-lg">
          <div className="bg-terra/10 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-6">
            <Calendar className="h-8 w-8 text-terra" />
          </div>
          <h3 className="font-playfair font-semibold text-blue-gray mb-3 text-2xl sm:text-3xl">
            Hai Bisogno di Aiuto?
          </h3>
          <p className="text-base sm:text-lg text-gray-600 leading-relaxed max-w-2xl mx-auto mb-6">
            Il nostro team è a tua disposizione per aiutarti a scegliere la consulenza più adatta.
            Saremo felici di guidarti nella pianificazione del tuo evento speciale.
          </p>
          {studioSettings.phone && (
            <a
              href={`https://wa.me/${studioSettings.phone.replace(/\s+/g, '').replace(/^\+/, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#25D366] hover:bg-[#20BD5A] text-white rounded-lg font-medium transition-all shadow-md hover:shadow-lg"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
              </svg>
              Contattaci su WhatsApp
            </a>
          )}
        </div>
      </div>
    </div>
  );
}