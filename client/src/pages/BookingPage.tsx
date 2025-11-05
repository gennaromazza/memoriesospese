/**
 * Booking Page - Pagina pubblica prenotazione
 * URL: /prenota/:code
 */

import { useState, useEffect } from 'react';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Calendar, Clock, Package, AlertCircle, CheckCircle2, Loader2, ZoomIn, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { format, addDays, isBefore, isAfter, startOfDay } from 'date-fns';
import { it } from 'date-fns/locale';
import { isSundayOrHoliday } from '@/lib/italian-holidays';

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
  
  // Stati lightbox immagini
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxProductName, setLightboxProductName] = useState('');
  
  // Stati per descrizioni espanse (key = productId, value = boolean)
  const [expandedDescriptions, setExpandedDescriptions] = useState<Record<string, boolean>>({});
  
  // Stati per indici immagini carousel (key = productId, value = currentIndex)
  const [productImageIndexes, setProductImageIndexes] = useState<Record<string, number>>({});

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

  // Reset slot selezionato se non è più disponibile
  useEffect(() => {
    if (selectedSlot && availableSlots.length > 0) {
      const stillAvailable = availableSlots.some(slot => slot.start === selectedSlot.start);
      if (!stillAvailable) {
        setSelectedSlot(null);
      }
    }
  }, [availableSlots, selectedSlot]);

  // Filtra prodotti disponibili per questa campagna e ordina per prezzo crescente
  const availableProducts = products
    .filter(p => campaign?.prodottiDisponibili.includes(p.id))
    .sort((a, b) => {
      // Usa prezzoFinale se esiste, altrimenti prezzo base
      const priceA = a.prezzoFinale ?? a.prezzo;
      const priceB = b.prezzoFinale ?? b.prezzo;
      return priceA - priceB; // Dal più basso al più alto
    });

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

  // Funzioni lightbox
  const openLightbox = (images: string[], productName: string, startIndex = 0) => {
    setLightboxImages(images);
    setLightboxProductName(productName);
    setLightboxIndex(startIndex);
    setLightboxOpen(true);
  };

  const nextImage = () => {
    setLightboxIndex((prev) => (prev + 1) % lightboxImages.length);
  };

  const prevImage = () => {
    setLightboxIndex((prev) => (prev - 1 + lightboxImages.length) % lightboxImages.length);
  };

  // Toggle descrizione espansa
  const toggleDescription = (productId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Previeni selezione prodotto quando clicchi "Vedi di più"
    setExpandedDescriptions(prev => ({
      ...prev,
      [productId]: !prev[productId]
    }));
  };

  // Funzioni carousel prodotti
  const getProductImageIndex = (productId: string) => productImageIndexes[productId] || 0;
  
  const nextProductImage = (productId: string, totalImages: number, e: React.MouseEvent) => {
    e.stopPropagation(); // Previeni selezione prodotto
    setProductImageIndexes(prev => ({
      ...prev,
      [productId]: (prev[productId] || 0) + 1 >= totalImages ? 0 : (prev[productId] || 0) + 1
    }));
  };
  
  const prevProductImage = (productId: string, totalImages: number, e: React.MouseEvent) => {
    e.stopPropagation(); // Previeni selezione prodotto
    setProductImageIndexes(prev => ({
      ...prev,
      [productId]: (prev[productId] || 0) - 1 < 0 ? totalImages - 1 : (prev[productId] || 0) - 1
    }));
  };
  
  const setProductImageIndex = (productId: string, index: number, e: React.MouseEvent) => {
    e.stopPropagation(); // Previeni selezione prodotto
    setProductImageIndexes(prev => ({
      ...prev,
      [productId]: index
    }));
  };

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

    // Validazione: verifica che lo slot selezionato non sia nel passato
    const now = new Date();
    const slotDate = new Date(selectedSlot.start);
    if (isBefore(slotDate, now)) {
      toast({
        title: 'Slot non disponibile',
        description: 'Lo slot selezionato è ormai passato. Seleziona un altro orario.',
        variant: 'destructive',
      });
      setSelectedSlot(null); // Reset selezione
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
                  {availableDates.map(date => {
                    const isHoliday = isSundayOrHoliday(date);
                    const isSelected = selectedDate?.toDateString() === date.toDateString();
                    
                    return (
                      <Button
                        key={date.toISOString()}
                        type="button"
                        variant={isSelected ? 'default' : 'outline'}
                        className={`h-auto py-3 flex flex-col items-center ${
                          isHoliday && !isSelected ? 'border-red-500/50 hover:border-red-500' : ''
                        }`}
                        onClick={() => {
                          setSelectedDate(date);
                          setSelectedSlot(null);
                        }}
                        data-testid={`date-${format(date, 'yyyy-MM-dd')}`}
                      >
                        <span className={`text-xs ${
                          isSelected ? 'text-primary-foreground' : isHoliday ? 'text-red-500' : 'text-muted-foreground'
                        }`}>
                          {format(date, 'EEE', { locale: it })}
                        </span>
                        <span className={`text-2xl font-bold ${
                          isSelected ? 'text-primary-foreground' : isHoliday ? 'text-red-500' : ''
                        }`}>
                          {format(date, 'dd', { locale: it })}
                        </span>
                        <span className={`text-xs ${
                          isSelected ? 'text-primary-foreground' : isHoliday ? 'text-red-500' : ''
                        }`}>
                          {format(date, 'MMM', { locale: it })}
                        </span>
                      </Button>
                    );
                  })}
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
                    {availableSlots.map((slot, index) => {
                      // Verifica se lo slot è nel passato
                      const now = new Date();
                      const slotDate = new Date(slot.start);
                      const isPast = isBefore(slotDate, now);

                      return (
                        <Button
                          key={index}
                          type="button"
                          variant={selectedSlot?.start === slot.start ? 'default' : 'outline'}
                          className="h-auto py-3"
                          onClick={() => !isPast && setSelectedSlot(slot)}
                          disabled={isPast}
                          data-testid={`slot-${slot.startTime}`}
                        >
                          <div className="text-center">
                            <div className="font-bold">{slot.startTime}</div>
                            <div className="text-xs text-muted-foreground">
                              {slot.endTime}
                            </div>
                            {isPast && (
                              <div className="text-xs text-red-500 mt-1">Non disponibile</div>
                            )}
                          </div>
                        </Button>
                      );
                    })}
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
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                        {/* Opzione "Da decidere" */}
                        <Card 
                          className={`cursor-pointer transition-all hover:shadow-md active:scale-[0.98] ${
                            formData.prodottoId === '' 
                              ? 'ring-2 ring-primary shadow-lg' 
                              : 'hover:border-primary/50'
                          }`}
                          onClick={() => setFormData({ ...formData, prodottoId: '' })}
                          data-testid="product-none"
                        >
                          <CardContent className="p-6 flex flex-col items-center justify-center min-h-[220px]">
                            <Package className="h-14 w-14 text-muted-foreground mb-4" />
                            <h3 className="font-semibold text-base text-center mb-2">Da Decidere</h3>
                            <p className="text-sm text-muted-foreground text-center leading-relaxed">
                              Sceglierò il pacchetto in sede
                            </p>
                          </CardContent>
                        </Card>

                        {/* Prodotti disponibili */}
                        {availableProducts.map(product => (
                          <Card 
                            key={product.id}
                            className={`cursor-pointer transition-all hover:shadow-md active:scale-[0.98] ${
                              formData.prodottoId === product.id 
                                ? 'ring-2 ring-primary shadow-lg' 
                                : 'hover:border-primary/50'
                            }`}
                            onClick={() => setFormData({ ...formData, prodottoId: product.id })}
                            data-testid={`product-${product.id}`}
                          >
                            <CardContent className="p-0">
                              {/* Immagine prodotto con carousel */}
                              {product.immagini && product.immagini.length > 0 ? (
                                <div className="relative w-full h-48 sm:h-52 bg-muted overflow-hidden rounded-t-lg group">
                                  <img 
                                    src={product.immagini[getProductImageIndex(product.id)]} 
                                    alt={`${product.nome} - ${getProductImageIndex(product.id) + 1}`}
                                    className="w-full h-full object-cover"
                                  />
                                  
                                  {/* Frecce navigazione carousel - visibili solo se più immagini */}
                                  {product.immagini.length > 1 && (
                                    <>
                                      <button
                                        type="button"
                                        className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-full p-2 shadow-lg hover:bg-white dark:hover:bg-gray-800 active:scale-95 transition-all z-10 opacity-0 group-hover:opacity-100 min-w-[40px] min-h-[40px] flex items-center justify-center"
                                        onClick={(e) => prevProductImage(product.id, product.immagini!.length, e)}
                                        aria-label="Immagine precedente"
                                        data-testid={`prev-${product.id}`}
                                      >
                                        <ChevronLeft className="h-5 w-5 text-gray-900 dark:text-white" />
                                      </button>
                                      <button
                                        type="button"
                                        className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-full p-2 shadow-lg hover:bg-white dark:hover:bg-gray-800 active:scale-95 transition-all z-10 opacity-0 group-hover:opacity-100 min-w-[40px] min-h-[40px] flex items-center justify-center"
                                        onClick={(e) => nextProductImage(product.id, product.immagini!.length, e)}
                                        aria-label="Immagine successiva"
                                        data-testid={`next-${product.id}`}
                                      >
                                        <ChevronRight className="h-5 w-5 text-gray-900 dark:text-white" />
                                      </button>
                                    </>
                                  )}
                                  
                                  {/* Bottone zoom - touch target 44x44px */}
                                  <button
                                    type="button"
                                    className="absolute top-2 left-2 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-full p-3 shadow-lg hover:bg-white dark:hover:bg-gray-800 active:scale-95 transition-all z-10 min-w-[44px] min-h-[44px] flex items-center justify-center"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openLightbox(product.immagini!, product.nome, getProductImageIndex(product.id));
                                    }}
                                    aria-label="Vedi immagine grande"
                                    data-testid={`zoom-${product.id}`}
                                  >
                                    <ZoomIn className="h-5 w-5 text-gray-900 dark:text-white" />
                                  </button>
                                  
                                  {/* Badge selezione */}
                                  {formData.prodottoId === product.id && (
                                    <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-1.5 shadow-lg z-10">
                                      <CheckCircle2 className="h-5 w-5" />
                                    </div>
                                  )}
                                  
                                  {/* Indicatori carousel - solo se più immagini */}
                                  {product.immagini.length > 1 && (
                                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-2 z-10">
                                      {product.immagini.map((_, index) => (
                                        <button
                                          key={index}
                                          type="button"
                                          className={`rounded-full transition-all min-w-[24px] min-h-[24px] flex items-center justify-center ${
                                            index === getProductImageIndex(product.id)
                                              ? 'bg-white/90'
                                              : 'bg-white/40 hover:bg-white/60'
                                          }`}
                                          onClick={(e) => setProductImageIndex(product.id, index, e)}
                                          aria-label={`Vai all'immagine ${index + 1}`}
                                          data-testid={`indicator-${product.id}-${index}`}
                                        >
                                          <span className={`rounded-full ${
                                            index === getProductImageIndex(product.id)
                                              ? 'bg-white w-2 h-2'
                                              : 'bg-white w-1.5 h-1.5'
                                          }`} />
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="relative w-full h-48 sm:h-52 bg-muted flex items-center justify-center rounded-t-lg">
                                  <Package className="h-12 w-12 text-muted-foreground" />
                                  {formData.prodottoId === product.id && (
                                    <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-1.5">
                                      <CheckCircle2 className="h-5 w-5" />
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Info prodotto */}
                              <div className="p-5 sm:p-6 space-y-3">
                                {/* Nome prodotto - sempre completo */}
                                <h3 className="font-semibold text-base sm:text-lg leading-tight">
                                  {product.nome}
                                </h3>
                                
                                {/* Descrizione prodotto espandibile */}
                                {product.descrizione && (
                                  <div className="space-y-1">
                                    <p className={`text-sm text-muted-foreground leading-relaxed ${
                                      expandedDescriptions[product.id] ? '' : 'line-clamp-3'
                                    }`}>
                                      {product.descrizione}
                                    </p>
                                    {/* Mostra sempre il toggle per permettere espansione/compressione */}
                                    <button
                                      type="button"
                                      onClick={(e) => toggleDescription(product.id, e)}
                                      className="text-xs text-primary hover:underline font-medium inline-block"
                                    >
                                      {expandedDescriptions[product.id] ? 'Vedi meno' : 'Vedi di più'}
                                    </button>
                                  </div>
                                )}
                                
                                {/* Prezzi */}
                                <div className="flex items-baseline gap-2 flex-wrap pt-1">
                                  {product.sconto > 0 ? (
                                    <>
                                      <span className="text-xl sm:text-2xl font-bold text-primary">
                                        €{product.prezzoFinale.toFixed(2)}
                                      </span>
                                      <span className="text-sm text-muted-foreground line-through">
                                        €{product.prezzo.toFixed(2)}
                                      </span>
                                      <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full font-medium">
                                        -{product.sconto}%
                                      </span>
                                    </>
                                  ) : (
                                    <span className="text-xl sm:text-2xl font-bold text-primary">
                                      €{product.prezzoFinale.toFixed(2)}
                                    </span>
                                  )}
                                </div>

                                {/* Info aggiuntive */}
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <Package className="h-4 w-4" />
                                  <span>{product.numeroFoto} foto incluse</span>
                                </div>
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

      {/* Lightbox per immagini prodotto */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-4xl w-full p-0 overflow-hidden">
          <DialogHeader className="absolute top-0 left-0 right-0 z-20 bg-gradient-to-b from-black/80 to-transparent p-4">
            <DialogTitle className="text-white text-lg font-semibold">
              {lightboxProductName}
            </DialogTitle>
            {lightboxImages.length > 1 && (
              <p className="text-white/80 text-sm">
                Immagine {lightboxIndex + 1} di {lightboxImages.length}
              </p>
            )}
          </DialogHeader>
          
          <div className="relative w-full h-[60vh] sm:h-[70vh] bg-black flex items-center justify-center">
            {/* Immagine corrente */}
            <img
              src={lightboxImages[lightboxIndex]}
              alt={`${lightboxProductName} - Immagine ${lightboxIndex + 1}`}
              className="max-w-full max-h-full object-contain"
            />

            {/* Navigazione - solo se ci sono multiple immagini */}
            {lightboxImages.length > 1 && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full h-12 w-12"
                  onClick={prevImage}
                  aria-label="Immagine precedente"
                >
                  <ChevronLeft className="h-6 w-6" />
                </Button>
                
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full h-12 w-12"
                  onClick={nextImage}
                  aria-label="Immagine successiva"
                >
                  <ChevronRight className="h-6 w-6" />
                </Button>
              </>
            )}
          </div>

          {/* Miniature - solo se ci sono multiple immagini */}
          {lightboxImages.length > 1 && (
            <div className="flex gap-2 p-4 overflow-x-auto bg-black/90">
              {lightboxImages.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => setLightboxIndex(idx)}
                  className={`flex-shrink-0 w-16 h-16 rounded overflow-hidden border-2 transition-all ${
                    idx === lightboxIndex 
                      ? 'border-primary ring-2 ring-primary/50' 
                      : 'border-transparent hover:border-white/50'
                  }`}
                >
                  <img
                    src={img}
                    alt={`Miniatura ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
