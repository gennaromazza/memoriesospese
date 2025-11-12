
/**
 * CONSULTATION TEMPLATES PAGE
 * Mostra template disponibili per tipo lavoro selezionato
 */

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTemplatesByJobType } from '@/lib/consultations';
import { Link, useParams } from 'wouter';
import { Calendar, Clock, ArrowLeft, ArrowRight, Loader2, FileText } from 'lucide-react';

export default function ConsultationTemplates() {
  const params = useParams<{ tipo: string }>();
  const jobType = params.tipo ? decodeURIComponent(params.tipo) : '';
  
  const { data: templates, isLoading } = useTemplatesByJobType(jobType);

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
        {/* Breadcrumb */}
        <div className="mb-6 sm:mb-8">
          <Link href="/consulenze">
            <Button 
              variant="ghost" 
              className="text-sage hover:text-dark-sage hover:bg-sage/10 -ml-2"
              data-testid="button-back-to-index"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Torna ai Servizi
            </Button>
          </Link>
        </div>

        {/* Header */}
        <div className="text-center mb-8 sm:mb-12">
          <Badge className="mb-4 bg-sage/10 text-sage border-sage hover:bg-sage/20 text-sm sm:text-base px-3 py-1">
            {jobType}
          </Badge>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-playfair font-bold text-blue-gray mb-3 sm:mb-4">
            Scegli il Tipo di Consulenza
          </h1>
          <p className="text-base sm:text-lg text-gray-600 max-w-2xl mx-auto px-4">
            Seleziona la modalità di consulenza più adatta alle tue esigenze.
            Ogni opzione include diversi temi da discutere durante l'incontro.
          </p>
        </div>

        {/* Templates Grid */}
        {!templates || templates.length === 0 ? (
          <Card className="text-center py-12 border-beige">
            <CardContent>
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 mb-2">
                Nessuna opzione di consulenza disponibile per {jobType}
              </p>
              <Link href="/consulenze">
                <Button variant="outline" className="mt-4 border-sage text-sage hover:bg-sage hover:text-white">
                  Scegli un Altro Servizio
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            {templates.map((template) => (
              <Card 
                key={template.id}
                className="h-full transition-all duration-300 hover:shadow-xl border-beige bg-white"
                data-testid={`card-template-${template.id}`}
              >
                <CardHeader className="pb-3">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-2">
                    <CardTitle className="text-lg sm:text-xl font-playfair text-blue-gray flex-1">
                      {template.nome}
                    </CardTitle>
                    <Badge 
                      variant={template.attiva ? "default" : "secondary"}
                      className={`${template.attiva ? "bg-green-100 text-green-700 border-green-200" : "bg-gray-100 text-gray-600"} self-start sm:self-auto`}
                    >
                      {template.attiva ? 'Disponibile' : 'Non Disponibile'}
                    </Badge>
                  </div>
                  {template.descrizione && (
                    <CardDescription className="text-sm text-gray-600 line-clamp-3">
                      {template.descrizione}
                    </CardDescription>
                  )}
                </CardHeader>
                
                <CardContent className="space-y-4">
                  {/* Info Row */}
                  <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-sm text-gray-600">
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-4 w-4 text-sage flex-shrink-0" />
                      <span>{template.durataMinuti} min</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-4 w-4 text-sage flex-shrink-0" />
                      <span className="text-xs sm:text-sm">Online/Presenza</span>
                    </div>
                  </div>

                  {/* Campi Job */}
                  {template.jobDataFields && template.jobDataFields.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-blue-gray mb-2">
                        Informazioni da raccogliere:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {template.jobDataFields.slice(0, 5).map((campo, idx) => (
                          <Badge 
                            key={idx}
                            variant="outline"
                            className="text-xs border-sage text-gray-700"
                          >
                            {campo.label}
                          </Badge>
                        ))}
                        {template.jobDataFields.length > 5 && (
                          <Badge variant="outline" className="text-xs border-beige">
                            +{template.jobDataFields.length - 5} altri
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}

                  {/* CTA Button */}
                  <Link href={`/consulenze/${encodeURIComponent(jobType)}/${template.id}/prenota`}>
                    <Button 
                      className="w-full bg-sage hover:bg-dark-sage text-white transition-colors group"
                      disabled={!template.attiva}
                      data-testid={`button-book-template-${template.id}`}
                    >
                      {template.attiva ? (
                        <>
                          Prenota Consulenza
                          <ArrowRight className="h-4 w-4 ml-2 transition-transform group-hover:translate-x-1" />
                        </>
                      ) : (
                        'Non Disponibile'
                      )}
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Help Section */}
        <div className="mt-8 sm:mt-12 bg-terra/5 rounded-lg border border-terra/20 p-6 sm:p-8">
          <h3 className="font-semibold text-blue-gray mb-2 text-base sm:text-lg">
            Hai bisogno di aiuto nella scelta?
          </h3>
          <p className="text-sm text-gray-600">
            Contattaci per ricevere assistenza nella selezione del tipo di consulenza più adatto alle tue esigenze.
            Saremo felici di aiutarti a pianificare il tuo evento speciale.
          </p>
        </div>
      </div>
    </div>
  );
}
