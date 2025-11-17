/**
 * Booking Index - Pagina lista campagne attive
 * URL: /prenota
 */

import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { getActiveCampaigns } from '@/lib/booking-campaigns';
import type { BookingCampaign } from '@shared/booking-types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import Navigation from '@/components/Navigation';
import Footer from '@/components/Footer';
import { Calendar, Clock, Package, ArrowRight, Sparkles, Camera, AlertCircle } from 'lucide-react';
import { format, isAfter, isBefore, startOfDay, endOfDay } from 'date-fns';
import it from 'date-fns/locale/it';
import { createUrl } from '@/lib/basePath';
import { FloralDivider } from '@/components/WeddingIllustrations';

export default function BookingIndex() {
  // Query campagne attive (considera giorniAnticipoSlider)
  const { data: activeCampaigns = [], isLoading } = useQuery<BookingCampaign[]>({
    queryKey: ['active-booking-campaigns'],
    queryFn: getActiveCampaigns,
  });

  const today = new Date();

  return (
    <div className="min-h-screen flex flex-col bg-cream">
      <Navigation />

      {/* Hero Section */}
      <div className="bg-gradient-to-br from-sage/20 via-cream to-warm-white py-16 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('/api/placeholder/400/400')] opacity-5 bg-repeat"></div>
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <div className="inline-block mb-6">
            <Camera className="w-16 h-16 text-sage mx-auto mb-4" />
          </div>
          <h1 className="text-4xl md:text-5xl font-playfair font-bold text-blue-gray mb-4">
            Prenota il tuo servizio fotografico
          </h1>
          <p className="text-lg text-gray-700 max-w-2xl mx-auto">
            Scopri le nostre campagne attive e prenota il tuo shooting con pochi clic.
            Ti ricontatteremo per confermare la prenotazione.
          </p>
          <FloralDivider className="mx-auto mt-8" />
        </div>
      </div>

      {/* Campagne attive */}
      <div className="flex-1 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="overflow-hidden">
                  <CardHeader>
                    <Skeleton className="h-8 w-3/4 mb-2" />
                    <Skeleton className="h-4 w-full" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-24 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : activeCampaigns.length === 0 ? (
            <Card className="max-w-2xl mx-auto">
              <CardContent className="py-16 text-center">
                <AlertCircle className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                <h3 className="text-xl font-semibold text-gray-700 mb-2">
                  Nessuna campagna attiva
                </h3>
                <p className="text-gray-600">
                  Al momento non ci sono campagne fotografiche attive. Torna a trovarci presto!
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-playfair font-bold text-blue-gray mb-2">
                  Campagne Attive
                </h2>
                <p className="text-gray-600">
                  {activeCampaigns.length} {activeCampaigns.length === 1 ? 'campagna disponibile' : 'campagne disponibili'}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {activeCampaigns.map((campaign) => {
                  const startDate = campaign.dataInizio.toDate ? campaign.dataInizio.toDate() : new Date(campaign.dataInizio);
                  const endDate = campaign.dataFine.toDate ? campaign.dataFine.toDate() : new Date(campaign.dataFine);
                  const daysRemaining = Math.ceil((endOfDay(endDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

                  return (
                    <Card
                      key={campaign.id}
                      className="group hover:shadow-xl transition-all duration-300 overflow-hidden border-2 hover:border-sage"
                    >
                      {/* Header con tema stagionale */}
                      <div className={`h-2 ${campaign.temaStagionale && campaign.temaStagionale !== 'none' ? 'bg-gradient-to-r from-sage via-warm-white to-sage' : 'bg-sage'}`}></div>
                      
                      {/* Immagine campagna */}
                      {campaign.immagineSlider && (
                        <div className="w-full h-48 overflow-hidden bg-gray-100">
                          <img
                            src={campaign.immagineSlider}
                            alt={campaign.nome}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                            decoding="async"
                          />
                        </div>
                      )}

                      <CardHeader className="pb-4">
                        <div className="flex items-start justify-between gap-4 mb-2">
                          <CardTitle className="text-xl font-playfair text-blue-gray group-hover:text-sage transition-colors">
                            {campaign.nome}
                          </CardTitle>
                          {campaign.temaStagionale && campaign.temaStagionale !== 'none' && (
                            <Badge variant="outline" className="bg-sage/10 text-sage border-sage/30">
                              <Sparkles className="w-3 h-3 mr-1" />
                              Speciale
                            </Badge>
                          )}
                        </div>
                        <CardDescription className="text-sm text-gray-600 line-clamp-2">
                          {campaign.descrizione}
                        </CardDescription>
                      </CardHeader>

                      <CardContent className="space-y-4">
                        {/* Info campagna */}
                        <div className="space-y-3">
                          <div className="flex items-center gap-3 text-sm text-gray-700">
                            <Calendar className="w-4 h-4 text-sage flex-shrink-0" />
                            <span>
                              {format(startDate, 'd MMMM', { locale: it })} - {format(endDate, 'd MMMM yyyy', { locale: it })}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-sm text-gray-700">
                            <Clock className="w-4 h-4 text-sage flex-shrink-0" />
                            <span>
                              Durata: {campaign.durataShootingMinuti} minuti
                            </span>
                          </div>
                          {campaign.prodottiDisponibili && campaign.prodottiDisponibili.length > 0 && (
                            <div className="flex items-center gap-3 text-sm text-gray-700">
                              <Package className="w-4 h-4 text-sage flex-shrink-0" />
                              <span>
                                {campaign.prodottiDisponibili.length} {campaign.prodottiDisponibili.length === 1 ? 'prodotto disponibile' : 'prodotti disponibili'}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Badge giorni rimanenti */}
                        {daysRemaining <= 7 && (
                          <Badge variant="outline" className="w-full justify-center bg-yellow-50 text-yellow-700 border-yellow-200">
                            {daysRemaining === 0 ? 'Ultimo giorno!' : `${daysRemaining} ${daysRemaining === 1 ? 'giorno' : 'giorni'} rimast${daysRemaining === 1 ? 'o' : 'i'}`}
                          </Badge>
                        )}

                        {/* CTA */}
                        <Link href={createUrl(`/prenota/${campaign.code}`)}>
                          <Button
                            className="w-full bg-sage hover:bg-dark-sage group-hover:scale-105 transition-transform"
                            data-testid={`button-book-${campaign.code}`}
                          >
                            Prenota Ora
                            <ArrowRight className="w-4 h-4 ml-2" />
                          </Button>
                        </Link>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <Footer />
    </div>
  );
}
