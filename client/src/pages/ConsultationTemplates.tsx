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
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-sage-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-sage-50 to-white dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-12 max-w-6xl">
        {/* Breadcrumb */}
        <div className="mb-8">
          <Link href="/consulenze">
            <Button 
              variant="ghost" 
              className="text-sage-600 dark:text-sage-400 hover:text-sage-700 dark:hover:text-sage-300"
              data-testid="button-back-to-index"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Torna ai Servizi
            </Button>
          </Link>
        </div>

        {/* Header */}
        <div className="text-center mb-12">
          <Badge className="mb-4 bg-sage-100 text-sage-700 dark:bg-sage-900 dark:text-sage-300 border-sage-300 dark:border-sage-700">
            {jobType}
          </Badge>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Scegli il Tipo di Consulenza
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            Seleziona la modalità di consulenza più adatta alle tue esigenze.
            Ogni opzione include diversi temi da discutere durante l'incontro.
          </p>
        </div>

        {/* Templates Grid */}
        {!templates || templates.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400 mb-2">
                Nessuna opzione di consulenza disponibile per {jobType}
              </p>
              <Link href="/consulenze">
                <Button variant="outline" className="mt-4">
                  Scegli un Altro Servizio
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {templates.map((template) => (
              <Card 
                key={template.id}
                className="h-full transition-all duration-200 hover:shadow-lg border-2 border-transparent hover:border-sage-300 dark:hover:border-sage-700"
                data-testid={`card-template-${template.id}`}
              >
                <CardHeader>
                  <div className="flex items-start justify-between mb-2">
                    <CardTitle className="text-xl text-gray-900 dark:text-white">
                      {template.nome}
                    </CardTitle>
                    <Badge 
                      variant={template.attiva ? "default" : "secondary"}
                      className={template.attiva ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" : ""}
                    >
                      {template.attiva ? 'Disponibile' : 'Non Disponibile'}
                    </Badge>
                  </div>
                  {template.descrizione && (
                    <CardDescription className="text-gray-600 dark:text-gray-400">
                      {template.descrizione}
                    </CardDescription>
                  )}
                </CardHeader>
                
                <CardContent className="space-y-4">
                  {/* Info Row */}
                  <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      <span>{template.durataMinuti} min</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      <span>Online/Presenza</span>
                    </div>
                  </div>

                  {/* Campi Job */}
                  {template.jobDataFields && template.jobDataFields.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Informazioni da raccogliere:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {template.jobDataFields.slice(0, 5).map((campo, idx) => (
                          <Badge 
                            key={idx}
                            variant="outline"
                            className="text-xs border-sage-300 dark:border-sage-700"
                          >
                            {campo.label}
                          </Badge>
                        ))}
                        {template.jobDataFields.length > 5 && (
                          <Badge variant="outline" className="text-xs">
                            +{template.jobDataFields.length - 5} altri
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}

                  {/* CTA Button */}
                  <Link href={`/consulenze/${encodeURIComponent(jobType)}/${template.id}/prenota`}>
                    <Button 
                      className="w-full bg-sage-600 hover:bg-sage-700 text-white dark:bg-sage-700 dark:hover:bg-sage-800"
                      disabled={!template.attiva}
                      data-testid={`button-book-template-${template.id}`}
                    >
                      {template.attiva ? (
                        <>
                          Prenota Consulenza
                          <ArrowRight className="h-4 w-4 ml-2" />
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
        <div className="mt-12 bg-terra-50 dark:bg-gray-800 rounded-lg border border-terra-200 dark:border-gray-700 p-6">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
            Hai bisogno di aiuto nella scelta?
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Contattaci per ricevere assistenza nella selezione del tipo di consulenza più adatto alle tue esigenze.
            Saremo felici di aiutarti a pianificare il tuo evento speciale.
          </p>
        </div>
      </div>
    </div>
  );
}
