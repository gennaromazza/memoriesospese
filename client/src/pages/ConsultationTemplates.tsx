
/**
 * CONSULTATION TEMPLATES PAGE
 * Mostra template disponibili per tipo lavoro selezionato
 */

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTemplatesByJobType } from '@/lib/consultations';
import { Link, useParams } from 'wouter';
import { Calendar, Clock, ArrowLeft, ArrowRight, Loader2, FileText, CheckCircle2, Sparkles } from 'lucide-react';
import { useStudio } from '@/context/StudioContext';

export default function ConsultationTemplates() {
  const params = useParams<{ tipo: string }>();
  const jobType = params.tipo ? decodeURIComponent(params.tipo) : '';
  
  const { studioSettings } = useStudio();
  const { data: templates, isLoading } = useTemplatesByJobType(jobType);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-b from-off-white to-white">
        <Loader2 className="h-8 w-8 animate-spin text-sage" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-off-white via-white to-off-white">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 max-w-7xl">
        {/* Breadcrumb */}
        <div className="mb-6">
          <Link href="/consulenze">
            <Button 
              variant="ghost" 
              className="text-sage hover:text-dark-sage hover:bg-sage/10 -ml-2 transition-all"
              data-testid="button-back-to-index"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Torna ai Servizi
            </Button>
          </Link>
        </div>

        {/* Hero Header */}
        <div className="text-center mb-12 sm:mb-16">
          <div className="inline-flex items-center gap-2 mb-4 px-4 py-2 bg-sage/10 rounded-full border border-sage/20">
            <Sparkles className="h-4 w-4 text-sage" />
            <Badge className="bg-transparent text-sage border-0 hover:bg-transparent text-sm sm:text-base px-0">
              {jobType}
            </Badge>
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-playfair font-bold text-blue-gray mb-4 sm:mb-6 leading-tight">
            Scegli la Tua Consulenza
          </h1>
          <p className="text-lg sm:text-xl text-gray-600 max-w-3xl mx-auto px-4 leading-relaxed">
            Ogni consulenza è pensata per guidarti passo dopo passo nella realizzazione del tuo evento speciale.
            Scegli la modalità più adatta alle tue esigenze.
          </p>
        </div>

        {/* Templates Grid */}
        {!templates || templates.length === 0 ? (
          <Card className="text-center py-16 border-beige shadow-lg max-w-2xl mx-auto">
            <CardContent>
              <div className="bg-beige/20 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-6">
                <FileText className="h-10 w-10 text-sage" />
              </div>
              <h3 className="text-xl font-playfair font-semibold text-blue-gray mb-3">
                Nessuna Consulenza Disponibile
              </h3>
              <p className="text-gray-500 mb-6">
                Al momento non sono disponibili opzioni di consulenza per {jobType}.
                Ti invitiamo a esplorare altri servizi.
              </p>
              <Link href="/consulenze">
                <Button className="bg-sage hover:bg-dark-sage text-white px-8 py-6 text-base">
                  Esplora Altri Servizi
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
            {templates.map((template, index) => (
              <Card 
                key={template.id}
                className="group h-full transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 border-beige/50 bg-white overflow-hidden"
                style={{ animationDelay: `${index * 100}ms` }}
                data-testid={`card-template-${template.id}`}
              >
                {/* Card Header with Gradient */}
                <div className="bg-gradient-to-br from-sage/5 to-terra/5 p-6 border-b border-beige/30">
                  <CardHeader className="p-0">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <CardTitle className="text-2xl sm:text-3xl font-playfair text-blue-gray flex-1 leading-tight">
                        {template.nome}
                      </CardTitle>
                      <Badge 
                        variant={template.attiva ? "default" : "secondary"}
                        className={`${
                          template.attiva 
                            ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100" 
                            : "bg-gray-100 text-gray-600"
                        } flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium shrink-0`}
                      >
                        {template.attiva && <CheckCircle2 className="h-3.5 w-3.5" />}
                        {template.attiva ? 'Disponibile' : 'Non Disponibile'}
                      </Badge>
                    </div>
                    {template.descrizione && (
                      <CardDescription className="text-base text-gray-600 leading-relaxed">
                        {template.descrizione}
                      </CardDescription>
                    )}
                  </CardHeader>
                </div>
                
                <CardContent className="p-6 space-y-6">
                  {/* Preview Image */}
                  {template.imageUrls && template.imageUrls.length > 0 && (
                    <div className="aspect-[16/9] rounded-lg overflow-hidden border border-beige bg-gray-50">
                      <img
                        src={template.imageUrls[0]}
                        alt={template.nome}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-300"
                        data-testid={`img-preview-template-${template.id}`}
                      />
                    </div>
                  )}
                  
                  {/* Info Pills */}
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-sage/5 rounded-full border border-sage/20">
                      <Clock className="h-5 w-5 text-sage flex-shrink-0" />
                      <span className="text-sm font-medium text-gray-700">{template.durataMinuti} minuti</span>
                    </div>
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-terra/5 rounded-full border border-terra/20">
                      <Calendar className="h-5 w-5 text-terra flex-shrink-0" />
                      <span className="text-sm font-medium text-gray-700">Online/Presenza</span>
                    </div>
                  </div>

                  {/* CTA Button */}
                  <Link href={`/consulenze/${encodeURIComponent(jobType)}/${template.id}/prenota`}>
                    <Button 
                      className={`w-full text-base py-6 transition-all group-hover:scale-[1.02] ${
                        template.attiva 
                          ? "bg-gradient-to-r from-sage to-dark-sage hover:from-dark-sage hover:to-sage text-white shadow-lg hover:shadow-xl" 
                          : "bg-gray-200 text-gray-500 cursor-not-allowed"
                      }`}
                      disabled={!template.attiva}
                      data-testid={`button-book-template-${template.id}`}
                    >
                      {template.attiva ? (
                        <>
                          <span>Prenota Ora</span>
                          <ArrowRight className="h-5 w-5 ml-2 transition-transform group-hover:translate-x-1" />
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
        <div className="mt-12 sm:mt-16 bg-gradient-to-r from-terra/5 to-sage/5 rounded-2xl border border-terra/20 p-8 sm:p-10 text-center max-w-4xl mx-auto shadow-lg">
          <div className="bg-terra/10 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-6">
            <Sparkles className="h-8 w-8 text-terra" />
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
