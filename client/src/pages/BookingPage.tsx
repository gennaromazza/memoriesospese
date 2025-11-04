/**
 * Booking Page - Pagina pubblica prenotazione
 * URL: /prenota/:code
 */

import { useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { getCampaignByCode } from '@/lib/booking-campaigns';
import { getAllProducts } from '@/lib/products';
import { createBooking, getAvailableSlots } from '@/lib/bookings';
import type { BookingCampaign, Product } from '@shared/booking-types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Calendar, Clock, Package, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { format, addDays, isBefore, isAfter, startOfDay } from 'date-fns';
import { it } from 'date-fns/locale';

export default function BookingPage() {
  const params = useParams<{ code: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const code = params.code || '';

  // Stati form
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<any | null>(null);
  const [formData, setFormData] = useState({
    nome: '',
    cognome: '',
    email: '',
    whatsapp: '',
    prodottoId: '',
    note: '',
  });
  const [bookingSuccess, setBookingSuccess] = useState(false);

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

  // Query slots disponibili per data selezionata
  const { data: availableSlots = [], isLoading: loadingSlots } = useQuery({
    queryKey: ['available-slots', selectedDate, campaign?.code],
    queryFn: async () => {
      if (!selectedDate || !campaign) return [];
      
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      
      return await getAvailableSlots(
        dateStr,
        {
          apertura: campaign.orarioApertura,
          pausaInizio: campaign.orarioPausaInizio,
          pausaFine: campaign.orarioPausaFine,
          chiusura: campaign.orarioChiusura,
        },
        campaign.durataShootingMinuti,
        campaign.excludedDays
      );
    },
    enabled: !!selectedDate && !!campaign,
  });

  // Mutation per creare prenotazione
  const createBookingMutation = useMutation({
    mutationFn: async () => {
      if (!campaign || !selectedSlot) {
        throw new Error('Dati mancanti');
      }

      const prodotto = products.find(p => p.id === formData.prodottoId);

      return await createBooking({
        campaignId: campaign.id,
        cliente: {
          nome: formData.nome,
          cognome: formData.cognome,
          email: formData.email,
          whatsapp: formData.whatsapp,
        },
        dataShootingInizio: new Date(selectedSlot.start),
        dataShootingFine: new Date(selectedSlot.end),
        prodottoId: formData.prodottoId || undefined,
        prodottoNome: prodotto?.nome || undefined,
        note: formData.note,
        workingHours: {
          apertura: campaign.orarioApertura,
          pausaInizio: campaign.orarioPausaInizio,
          pausaFine: campaign.orarioPausaFine,
          chiusura: campaign.orarioChiusura,
        },
        durataMinuti: campaign.durataShootingMinuti,
      });
    },
    onSuccess: () => {
      setBookingSuccess(true);
      toast({
        title: 'Prenotazione inviata!',
        description: 'Riceverai una conferma via email a breve.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Errore',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Filtra prodotti disponibili per questa campagna
  const availableProducts = products.filter(p => 
    campaign?.prodottiDisponibili.includes(p.id)
  );

  // Genera date disponibili (solo da oggi in poi fino a dataFine campagna)
  const availableDates: Date[] = [];
  if (campaign) {
    const today = startOfDay(new Date());
    const endDate = startOfDay(campaign.dataFine);
    let currentDate = today < startOfDay(campaign.dataInizio) 
      ? startOfDay(campaign.dataInizio) 
      : today;

    while (currentDate <= endDate) {
      // Doppia verifica: aggiungi solo se >= oggi (previene bug timezone)
      if (currentDate >= today) {
        availableDates.push(new Date(currentDate));
      }
      currentDate = addDays(currentDate, 1);
    }
  }

  // Validazione form
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.nome.trim() || !formData.cognome.trim()) {
      toast({
        title: 'Errore',
        description: 'Inserisci nome e cognome',
        variant: 'destructive',
      });
      return;
    }

    // Validazione email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!formData.email.trim() || !emailRegex.test(formData.email)) {
      toast({
        title: 'Errore',
        description: 'Inserisci un indirizzo email valido',
        variant: 'destructive',
      });
      return;
    }

    // Validazione WhatsApp
    if (!formData.whatsapp.trim() || formData.whatsapp.trim().length < 8) {
      toast({
        title: 'Errore',
        description: 'Inserisci un numero WhatsApp valido',
        variant: 'destructive',
      });
      return;
    }

    if (!selectedSlot) {
      toast({
        title: 'Errore',
        description: 'Seleziona data e orario',
        variant: 'destructive',
      });
      return;
    }

    createBookingMutation.mutate();
  };

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

  // Mostra conferma prenotazione
  if (bookingSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sage-50 to-cream-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center px-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <div className="flex items-center gap-3 text-green-600">
              <CheckCircle2 className="h-8 w-8" />
              <CardTitle>Prenotazione Confermata!</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              La tua richiesta di prenotazione è stata inviata con successo.
            </p>
            <div className="bg-muted rounded-lg p-4 space-y-2">
              <p className="text-sm"><strong>Data:</strong> {selectedSlot && format(new Date(selectedSlot.start), 'dd MMMM yyyy', { locale: it })}</p>
              <p className="text-sm"><strong>Orario:</strong> {selectedSlot?.startTime} - {selectedSlot?.endTime}</p>
              <p className="text-sm"><strong>Email:</strong> {formData.email}</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Riceverai una email di conferma all'indirizzo fornito. 
              Lo staff ti contatterà a breve per confermare la prenotazione.
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

        {/* Form Prenotazione */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Selezione Data */}
          <Card>
            <CardHeader>
              <CardTitle>1. Seleziona la Data</CardTitle>
              <CardDescription>
                Scegli il giorno per il tuo shooting
              </CardDescription>
            </CardHeader>
            <CardContent>
              {availableDates.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="font-medium">Nessuna data disponibile</p>
                  <p className="text-sm mt-2">
                    La campagna {campaign.nome} è terminata o non ha date disponibili.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {availableDates.map(date => (
                  <Button
                    key={date.toISOString()}
                    type="button"
                    variant={selectedDate?.toDateString() === date.toDateString() ? 'default' : 'outline'}
                    className="h-auto py-3 flex flex-col items-center"
                    onClick={() => {
                      setSelectedDate(date);
                      setSelectedSlot(null);
                    }}
                    data-testid={`date-${format(date, 'yyyy-MM-dd')}`}
                  >
                    <span className="text-xs text-muted-foreground">
                      {format(date, 'EEE', { locale: it })}
                    </span>
                    <span className="text-2xl font-bold">
                      {format(date, 'dd', { locale: it })}
                    </span>
                    <span className="text-xs">
                      {format(date, 'MMM', { locale: it })}
                    </span>
                  </Button>
                ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Selezione Orario */}
          {selectedDate && (
            <Card>
              <CardHeader>
                <CardTitle>2. Seleziona l'Orario</CardTitle>
                <CardDescription>
                  Slot disponibili per {format(selectedDate, 'dd MMMM yyyy', { locale: it })}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingSlots ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : availableSlots.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Nessuno slot disponibile per questa data</p>
                    <p className="text-sm mt-2">Prova a selezionare un'altra giornata</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {availableSlots.map((slot, index) => (
                      <Button
                        key={index}
                        type="button"
                        variant={selectedSlot?.start === slot.start ? 'default' : 'outline'}
                        className="h-auto py-3"
                        onClick={() => setSelectedSlot(slot)}
                        data-testid={`slot-${slot.startTime}`}
                      >
                        <div className="text-center">
                          <div className="font-bold">{slot.startTime}</div>
                          <div className="text-xs text-muted-foreground">
                            {slot.endTime}
                          </div>
                        </div>
                      </Button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Dati Cliente */}
          {selectedSlot && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>3. I Tuoi Dati</CardTitle>
                  <CardDescription>
                    Inserisci le tue informazioni di contatto
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="nome">Nome *</Label>
                      <Input
                        id="nome"
                        value={formData.nome}
                        onChange={e => setFormData({ ...formData, nome: e.target.value })}
                        placeholder="Mario"
                        required
                        data-testid="input-nome"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cognome">Cognome *</Label>
                      <Input
                        id="cognome"
                        value={formData.cognome}
                        onChange={e => setFormData({ ...formData, cognome: e.target.value })}
                        placeholder="Rossi"
                        required
                        data-testid="input-cognome"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email *</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                        placeholder="mario.rossi@example.com"
                        required
                        data-testid="input-email"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="whatsapp">WhatsApp *</Label>
                      <Input
                        id="whatsapp"
                        type="tel"
                        value={formData.whatsapp}
                        onChange={e => setFormData({ ...formData, whatsapp: e.target.value })}
                        placeholder="+39 123 456 7890"
                        required
                        data-testid="input-whatsapp"
                      />
                    </div>
                  </div>

                  {availableProducts.length > 0 && (
                    <div className="space-y-3">
                      <Label>Pacchetto Fotografico (opzionale)</Label>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {/* Opzione "Da decidere" */}
                        <Card 
                          className={`cursor-pointer transition-all hover:shadow-md ${
                            formData.prodottoId === '' 
                              ? 'ring-2 ring-primary' 
                              : 'hover:border-primary/50'
                          }`}
                          onClick={() => setFormData({ ...formData, prodottoId: '' })}
                          data-testid="product-none"
                        >
                          <CardContent className="p-4 flex flex-col items-center justify-center min-h-[200px]">
                            <Package className="h-12 w-12 text-muted-foreground mb-3" />
                            <h3 className="font-semibold text-center mb-2">Da Decidere</h3>
                            <p className="text-sm text-muted-foreground text-center">
                              Sceglierò il pacchetto in sede
                            </p>
                          </CardContent>
                        </Card>

                        {/* Prodotti disponibili */}
                        {availableProducts.map(product => (
                          <Card 
                            key={product.id}
                            className={`cursor-pointer transition-all hover:shadow-md ${
                              formData.prodottoId === product.id 
                                ? 'ring-2 ring-primary' 
                                : 'hover:border-primary/50'
                            }`}
                            onClick={() => setFormData({ ...formData, prodottoId: product.id })}
                            data-testid={`product-${product.id}`}
                          >
                            <CardContent className="p-0">
                              {/* Immagine prodotto */}
                              {product.immagini && product.immagini.length > 0 ? (
                                <div className="relative w-full h-40 bg-muted overflow-hidden rounded-t-lg">
                                  <img 
                                    src={product.immagini[0]} 
                                    alt={product.nome}
                                    className="w-full h-full object-cover"
                                  />
                                  {formData.prodottoId === product.id && (
                                    <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-1">
                                      <CheckCircle2 className="h-5 w-5" />
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="relative w-full h-40 bg-muted flex items-center justify-center rounded-t-lg">
                                  <Package className="h-12 w-12 text-muted-foreground" />
                                  {formData.prodottoId === product.id && (
                                    <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-1">
                                      <CheckCircle2 className="h-5 w-5" />
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Info prodotto */}
                              <div className="p-4">
                                <h3 className="font-semibold mb-2 line-clamp-1">{product.nome}</h3>
                                
                                {/* Prezzi */}
                                <div className="flex items-baseline gap-2">
                                  {product.sconto > 0 ? (
                                    <>
                                      <span className="text-lg font-bold text-primary">
                                        €{product.prezzoFinale.toFixed(2)}
                                      </span>
                                      <span className="text-sm text-muted-foreground line-through">
                                        €{product.prezzo.toFixed(2)}
                                      </span>
                                      <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                                        -{product.sconto}%
                                      </span>
                                    </>
                                  ) : (
                                    <span className="text-lg font-bold text-primary">
                                      €{product.prezzoFinale.toFixed(2)}
                                    </span>
                                  )}
                                </div>

                                {/* Info aggiuntive */}
                                <p className="text-xs text-muted-foreground mt-2">
                                  {product.numeroFoto} foto incluse
                                </p>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="note">Note (opzionale)</Label>
                    <Textarea
                      id="note"
                      value={formData.note}
                      onChange={e => setFormData({ ...formData, note: e.target.value })}
                      placeholder="Eventuali richieste particolari..."
                      rows={3}
                      data-testid="textarea-note"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Riepilogo e Conferma */}
              <Card>
                <CardHeader>
                  <CardTitle>4. Conferma Prenotazione</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-muted rounded-lg p-4 space-y-2">
                    <p className="font-medium">Riepilogo:</p>
                    <p className="text-sm">📅 {format(new Date(selectedSlot.start), 'dd MMMM yyyy', { locale: it })}</p>
                    <p className="text-sm">🕐 {selectedSlot.startTime} - {selectedSlot.endTime}</p>
                    <p className="text-sm">⏱️ Durata: {campaign.durataShootingMinuti} minuti</p>
                  </div>

                  <Button
                    type="submit"
                    className="w-full"
                    size="lg"
                    disabled={createBookingMutation.isPending}
                    data-testid="button-submit-booking"
                  >
                    {createBookingMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Invio in corso...
                      </>
                    ) : (
                      'Conferma Prenotazione'
                    )}
                  </Button>

                  <p className="text-xs text-center text-muted-foreground">
                    Cliccando conferma, riceverai una email con i dettagli della prenotazione.
                    Lo staff ti contatterà per la conferma definitiva.
                  </p>
                </CardContent>
              </Card>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
