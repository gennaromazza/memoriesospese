/**
 * Booking Page - Pagina pubblica prenotazione
 * URL: /prenota/:code
 */

import { useEffect, useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { getCampaignByCode } from '@/lib/booking-campaigns';
import { getAllProducts } from '@/lib/products';
import type { BookingCampaign, Product } from '@shared/booking-types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, Clock, Package, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

export default function BookingPage() {
  const params = useParams<{ code: string }>();
  const [, setLocation] = useLocation();
  const code = params.code || '';

  // Query campaign
  const { data: campaign, isLoading, error } = useQuery<BookingCampaign | null>({
    queryKey: ['booking-campaign', code],
    queryFn: () => getCampaignByCode(code),
    enabled: !!code,
  });

  // Query products
  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: getAllProducts,
    enabled: !!campaign,
  });

  // Filtra prodotti disponibili per questa campagna
  const availableProducts = products.filter(p => 
    campaign?.prodottiDisponibili.includes(p.id)
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sage-50 to-cream-50 dark:from-gray-900 dark:to-gray-800 py-12 px-4">
        <div className="max-w-4xl mx-auto space-y-6">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sage-50 to-cream-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center px-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <div className="flex items-center gap-3 text-destructive">
              <AlertCircle className="h-8 w-8" />
              <CardTitle>Campagna non trovata</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              La campagna con codice <strong>{code}</strong> non è stata trovata o non è più attiva.
            </p>
            <Button onClick={() => setLocation('/')} className="w-full">
              Torna alla homepage
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!campaign.attiva) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sage-50 to-cream-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center px-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <div className="flex items-center gap-3 text-amber-600">
              <AlertCircle className="h-8 w-8" />
              <CardTitle>Campagna non attiva</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              La campagna <strong>{campaign.nome}</strong> non è attualmente attiva per le prenotazioni.
            </p>
            <Button onClick={() => setLocation('/')} className="w-full">
              Torna alla homepage
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sage-50 to-cream-50 dark:from-gray-900 dark:to-gray-800 py-12 px-4">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header Campagna */}
        <Card>
          <CardHeader>
            <CardTitle className="text-3xl">{campaign.nome}</CardTitle>
            {campaign.descrizione && (
              <CardDescription className="text-base mt-2">
                {campaign.descrizione}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-medium">Periodo</p>
                  <p className="text-sm text-muted-foreground">
                    {format(campaign.dataInizio, 'dd MMM', { locale: it })} - {format(campaign.dataFine, 'dd MMM yyyy', { locale: it })}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-medium">Durata shooting</p>
                  <p className="text-sm text-muted-foreground">
                    {campaign.durataShootingMinuti} minuti
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <Package className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-medium">Prodotti disponibili</p>
                  <p className="text-sm text-muted-foreground">
                    {availableProducts.length} opzioni
                  </p>
                </div>
              </div>
            </div>

            {campaign.temaStagionale && (
              <div className="pt-4 border-t">
                <p className="text-sm text-muted-foreground">
                  🎨 Tema stagionale: <span className="font-medium capitalize">{campaign.temaStagionale}</span>
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Prodotti Disponibili */}
        {availableProducts.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Pacchetti Fotografici Disponibili</CardTitle>
              <CardDescription>
                Scegli il pacchetto più adatto alle tue esigenze
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {availableProducts.map(product => (
                  <div 
                    key={product.id} 
                    className="border-2 rounded-lg p-4 hover:border-primary transition-colors"
                  >
                    {product.immagini && product.immagini.length > 0 && (
                      <div className="aspect-video w-full rounded-lg overflow-hidden bg-muted mb-3">
                        <img
                          src={product.immagini[0]}
                          alt={product.nome}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    
                    <h3 className="font-semibold text-lg mb-2">{product.nome}</h3>
                    
                    {product.descrizione && (
                      <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                        {product.descrizione}
                      </p>
                    )}
                    
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-xs text-muted-foreground">Include {product.numeroFoto} foto</p>
                        {product.sconto > 0 && (
                          <p className="text-xs text-muted-foreground line-through">
                            €{product.prezzo.toFixed(2)}
                          </p>
                        )}
                        <p className="text-xl font-bold text-primary">
                          €{product.prezzoFinale.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Coming Soon - Form Prenotazione */}
        <Card>
          <CardHeader>
            <CardTitle>Prenota il tuo shooting</CardTitle>
            <CardDescription>
              Il modulo di prenotazione sarà disponibile a breve
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-muted rounded-lg p-8 text-center">
              <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground mb-4">
                Il calendario per la selezione della data e dell'orario è in fase di implementazione.
              </p>
              <p className="text-sm text-muted-foreground">
                Nel frattempo, puoi contattarci direttamente per prenotare il tuo shooting.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
