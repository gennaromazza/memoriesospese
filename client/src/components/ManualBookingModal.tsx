/**
 * Manual Booking Modal - Crea prenotazione manuale per clienti walk-in
 */

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';
import { getAllCampaigns } from '@/lib/booking-campaigns';
import { getActiveProducts } from '@/lib/products';
import { getAvailableSlots } from '@/lib/bookings';
import type { BookingCampaign, Product, OrderItem } from '@shared/booking-types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Calendar, Clock, User, Plus, Trash2, Package, ShoppingCart } from 'lucide-react';
import { format, addMinutes, parseISO, setHours, setMinutes, startOfDay } from 'date-fns';
import { it } from 'date-fns/locale';

interface ManualBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface CustomProduct {
  id: string;
  nome: string;
  prezzo: number;
  numeroFoto: number;
  quantita: number;
}

export default function ManualBookingModal({ isOpen, onClose, onSuccess }: ManualBookingModalProps) {
  const { toast } = useToast();
  const { user } = useFirebaseAuth();
  
  // Form fields
  const [campaignId, setCampaignId] = useState<string>('');
  const [nome, setNome] = useState('');
  const [cognome, setCognome] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [dataShootingDate, setDataShootingDate] = useState<string>('');
  const [selectedSlot, setSelectedSlot] = useState<any | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<Array<{
    prodottoId: string;
    quantita: number;
  }>>([]);
  const [customProducts, setCustomProducts] = useState<CustomProduct[]>([]);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customNome, setCustomNome] = useState('');
  const [customPrezzo, setCustomPrezzo] = useState<number>(0);
  const [customNumeroFoto, setCustomNumeroFoto] = useState<number>(0);
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Query campagne attive
  const { data: campaigns = [] } = useQuery<BookingCampaign[]>({
    queryKey: ['campaigns'],
    queryFn: getAllCampaigns,
  });

  // Query prodotti attivi
  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['products', 'active'],
    queryFn: getActiveProducts,
  });

  // Campagna selezionata
  const selectedCampaign = campaigns.find(c => c.id === campaignId);

  // Prodotti disponibili per la campagna selezionata
  const availableProducts = selectedCampaign
    ? products.filter(p => selectedCampaign.prodottiDisponibili.includes(p.id))
    : [];

  // Query slot disponibili per data selezionata (V2: usa Calendar Engine V2)
  const { data: availableSlots = [], isLoading: loadingSlots } = useQuery({
    queryKey: ['manual-booking-slots', dataShootingDate, campaignId],
    queryFn: async () => {
      if (!dataShootingDate || !selectedCampaign) return [];
      
      // V2: Campaign configuration loaded server-side
      return await getAvailableSlots(dataShootingDate, selectedCampaign.id);
    },
    enabled: !!dataShootingDate && !!selectedCampaign,
  });

  // Helper: Aggiungi prodotto vuoto
  const addProduct = () => {
    setSelectedProducts([...selectedProducts, { prodottoId: '', quantita: 1 }]);
  };

  // Helper: Rimuovi prodotto
  const removeProduct = (index: number) => {
    setSelectedProducts(selectedProducts.filter((_, i) => i !== index));
  };

  // Helper: Aggiorna prodotto
  const updateProduct = (index: number, field: 'prodottoId' | 'quantita', value: string | number) => {
    const updated = [...selectedProducts];
    updated[index] = { ...updated[index], [field]: value };
    setSelectedProducts(updated);
  };

  // Helper: Calcola subtotale per prodotto
  const getProductSubtotal = (prodottoId: string, quantita: number): number => {
    const product = products.find(p => p.id === prodottoId);
    if (!product) return 0;
    return product.prezzoFinale * quantita;
  };

  // Helper: Calcola totale prenotazione (catalogo + custom)
  const calculateTotale = (): number => {
    const catalogoTotale = selectedProducts.reduce((sum, item) => {
      return sum + getProductSubtotal(item.prodottoId, item.quantita);
    }, 0);
    const customTotale = customProducts.reduce((sum, item) => {
      return sum + item.prezzo * item.quantita;
    }, 0);
    return catalogoTotale + customTotale;
  };

  // Helper: Aggiungi prodotto personalizzato con validazione
  const addCustomProduct = () => {
    if (!customNome.trim()) return;
    if (typeof customPrezzo !== 'number' || isNaN(customPrezzo) || customPrezzo <= 0) return;
    
    const validNumeroFoto = typeof customNumeroFoto === 'number' && !isNaN(customNumeroFoto) && customNumeroFoto >= 0
      ? customNumeroFoto
      : 0;
    
    const newCustom: CustomProduct = {
      id: `custom_${Date.now()}`,
      nome: customNome.trim(),
      prezzo: customPrezzo,
      numeroFoto: validNumeroFoto,
      quantita: 1,
    };
    setCustomProducts([...customProducts, newCustom]);
    setCustomNome('');
    setCustomPrezzo(0);
    setCustomNumeroFoto(0);
    setShowCustomForm(false);
  };

  // Helper: Rimuovi prodotto personalizzato
  const removeCustomProduct = (id: string) => {
    setCustomProducts(customProducts.filter((p) => p.id !== id));
  };

  // Helper: Aggiorna campo prodotto personalizzato
  const updateCustomProduct = (id: string, field: keyof CustomProduct, value: string | number) => {
    setCustomProducts(
      customProducts.map((p) => {
        if (p.id !== id) return p;
        if (field === 'quantita') return { ...p, quantita: Math.max(1, value as number) };
        if (field === 'prezzo') return { ...p, prezzo: Math.max(0, value as number) };
        if (field === 'numeroFoto') return { ...p, numeroFoto: Math.max(0, value as number) };
        if (field === 'nome') return { ...p, nome: value as string };
        return p;
      })
    );
  };

  // Helper: Aggiorna quantità prodotto personalizzato
  const updateCustomQuantita = (id: string, quantita: number) => {
    updateCustomProduct(id, 'quantita', quantita);
  };

  // Reset form quando modal si apre
  useEffect(() => {
    if (isOpen) {
      setCampaignId('');
      setNome('');
      setCognome('');
      setEmail('');
      setWhatsapp('');
      setDataShootingDate('');
      setSelectedSlot(null);
      setSelectedProducts([]);
      setCustomProducts([]);
      setShowCustomForm(false);
      setCustomNome('');
      setCustomPrezzo(0);
      setCustomNumeroFoto(0);
      setNote('');
    }
  }, [isOpen]);

  // Reset slot quando cambia data
  useEffect(() => {
    setSelectedSlot(null);
  }, [dataShootingDate]);

  // Reset slot, data, e prodotti quando cambia campagna (previene dati stale)
  useEffect(() => {
    setSelectedSlot(null);
    setDataShootingDate('');
    setSelectedProducts([]);
    setCustomProducts([]);
    setShowCustomForm(false);
  }, [campaignId]);

  // Auto-seleziona prima campagna attiva
  useEffect(() => {
    if (campaigns.length > 0 && !campaignId) {
      const activeCampaigns = campaigns.filter(c => c.attiva);
      if (activeCampaigns.length > 0) {
        setCampaignId(activeCampaigns[0].id);
      }
    }
  }, [campaigns, campaignId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedCampaign) {
      toast({
        title: 'Campagna mancante',
        description: 'Seleziona una campagna per la prenotazione',
        variant: 'destructive',
      });
      return;
    }

    if (!nome.trim() || !cognome.trim() || !email.trim()) {
      toast({
        title: 'Campi obbligatori',
        description: 'Nome, cognome ed email sono obbligatori',
        variant: 'destructive',
      });
      return;
    }

    if (!dataShootingDate || !selectedSlot) {
      toast({
        title: 'Data e ora mancanti',
        description: 'Seleziona data e orario dello shooting',
        variant: 'destructive',
      });
      return;
    }

    // Validazione prodotti catalogo (opzionale)
    if (selectedProducts.length > 0) {
      if (selectedProducts.some(p => !p.prodottoId || p.quantita <= 0)) {
        toast({
          title: 'Prodotti incompleti',
          description: 'Completa tutti i prodotti con quantità valida o rimuovili',
          variant: 'destructive',
        });
        return;
      }

      const availableProductIds = availableProducts.map(p => p.id);
      const invalidProducts = selectedProducts.filter(p => !availableProductIds.includes(p.prodottoId));
      if (invalidProducts.length > 0) {
        toast({
          title: 'Prodotti non validi',
          description: 'Alcuni prodotti selezionati non sono disponibili per questa campagna. Rimuovili prima di continuare.',
          variant: 'destructive',
        });
        return;
      }
    }

    // Validazione prodotti custom
    if (customProducts.length > 0) {
      const invalidCustom = customProducts.filter(p => !p.nome?.trim() || p.prezzo <= 0 || p.quantita <= 0);
      if (invalidCustom.length > 0) {
        toast({
          title: 'Prodotti personalizzati non validi',
          description: 'Tutti i prodotti personalizzati devono avere nome, prezzo positivo e quantità valida',
          variant: 'destructive',
        });
        return;
      }
    }

    try {
      setIsSubmitting(true);

      // Usa lo slot selezionato dal sistema
      const dataInizioDate = new Date(selectedSlot.start);
      const dataFineDate = new Date(selectedSlot.end);

      // Costruisci array OrderItem (catalogo + custom)
      let prodottiOrderItems: OrderItem[] | undefined = undefined;
      
      // Prodotti da catalogo
      const catalogoOrderItems: OrderItem[] = selectedProducts.map(item => {
        const product = products.find(p => p.id === item.prodottoId)!;
        // Per bundle: calcola totale foto da bundleItems
        const totalPhotos = product.isBundle && product.bundleItems && product.bundleItems.length > 0
          ? product.bundleItems.reduce((sum, bi) => sum + (bi.numeroFoto || 0) * (bi.quantita || 1), 0)
          : product.numeroFoto;
        return {
          prodottoId: product.id,
          prodottoNome: product.nome,
          prodottoPrezzo: product.prezzoFinale,
          prodottoNumeroFoto: totalPhotos,
          quantita: item.quantita,
          // Salva bundleItems se è un bundle per espansione in gallery
          ...(product.isBundle && product.bundleItems ? { isBundle: true, bundleItems: product.bundleItems } : {}),
        };
      });
      
      // Prodotti personalizzati
      const customOrderItems: OrderItem[] = customProducts.map(item => ({
        prodottoId: item.id,
        prodottoNome: item.nome,
        prodottoPrezzo: item.prezzo,
        prodottoNumeroFoto: item.numeroFoto,
        quantita: item.quantita,
        isCustom: true,
      }));
      
      // Combina catalogo + custom
      if (catalogoOrderItems.length > 0 || customOrderItems.length > 0) {
        prodottiOrderItems = [...catalogoOrderItems, ...customOrderItems];
      }

      // Legacy support: usa primo prodotto (catalogo o custom) se disponibile
      let firstProductId: string | undefined = undefined;
      let firstProductName: string | undefined = undefined;
      
      if (selectedProducts.length > 0) {
        const firstCatalog = products.find(p => p.id === selectedProducts[0].prodottoId);
        firstProductId = selectedProducts[0].prodottoId;
        firstProductName = firstCatalog?.nome;
      } else if (customProducts.length > 0) {
        firstProductId = customProducts[0].id;
        firstProductName = customProducts[0].nome;
      }

      // Payload prenotazione V2 (no workingHours/durataMinuti - loaded server-side)
      const bookingPayload = {
        campaignId,
        cliente: {
          nome: nome.trim(),
          cognome: cognome.trim(),
          email: email.trim(),
          whatsapp: whatsapp.trim(),
        },
        dataShootingInizio: dataInizioDate.toISOString(),
        dataShootingFine: dataFineDate.toISOString(),
        prodottoId: firstProductId,
        prodottoNome: firstProductName,
        prodotti: prodottiOrderItems, // Nuovo campo multi-prodotto
        note: note.trim(),
        isManual: true,
        createdByAdmin: user?.email || 'admin',
      };

      console.log('📝 Creazione prenotazione manuale (V2):', bookingPayload);

      // Chiamata API V2
      const response = await fetch('/api/booking/v2/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bookingPayload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Errore durante la creazione della prenotazione');
      }

      const result = await response.json();
      console.log('✅ Prenotazione manuale creata:', result);

      toast({
        title: 'Prenotazione creata',
        description: `Prenotazione per ${nome} ${cognome} creata con successo`,
      });

      onSuccess();
      onClose();
    } catch (error) {
      console.error('❌ Errore creazione prenotazione manuale:', error);
      toast({
        title: 'Errore',
        description: error instanceof Error ? error.message : 'Impossibile creare la prenotazione',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent 
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            Nuova Prenotazione Manuale
          </DialogTitle>
          <DialogDescription>
            Crea una prenotazione per un cliente walk-in che si presenta senza aver prenotato online
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Campagna */}
          <div className="space-y-2">
            <Label htmlFor="campaign">
              <Calendar className="w-4 h-4 inline mr-1" />
              Campagna *
            </Label>
            <Select value={campaignId} onValueChange={setCampaignId}>
              <SelectTrigger data-testid="select-campaign">
                <SelectValue placeholder="Seleziona campagna" />
              </SelectTrigger>
              <SelectContent>
                {campaigns.filter(c => c.attiva).map((campaign) => (
                  <SelectItem key={campaign.id} value={campaign.id}>
                    {campaign.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Dati Cliente */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome *</Label>
              <Input
                id="nome"
                data-testid="input-nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Mario"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cognome">Cognome *</Label>
              <Input
                id="cognome"
                data-testid="input-cognome"
                value={cognome}
                onChange={(e) => setCognome(e.target.value)}
                placeholder="Rossi"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              data-testid="input-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="mario.rossi@example.com"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="whatsapp">WhatsApp</Label>
            <Input
              id="whatsapp"
              data-testid="input-whatsapp"
              type="tel"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="+39 333 123 4567"
            />
          </div>

          {/* Data Shooting */}
          <div className="space-y-2">
            <Label htmlFor="date">
              <Calendar className="w-4 h-4 inline mr-1" />
              Data Shooting *
            </Label>
            <Input
              id="date"
              data-testid="input-date"
              type="date"
              value={dataShootingDate}
              onChange={(e) => setDataShootingDate(e.target.value)}
              min={format(new Date(), 'yyyy-MM-dd')}
              required
            />
          </div>

          {/* Slot Disponibili (da Google Calendar) */}
          {dataShootingDate && (
            <div className="space-y-2">
              <Label htmlFor="slot">
                <Clock className="w-4 h-4 inline mr-1" />
                Orario *
              </Label>
              
              {loadingSlots ? (
                <div className="flex items-center justify-center py-4 border rounded-md bg-muted/50">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mr-2" />
                  <span className="text-sm text-muted-foreground">Caricamento slot disponibili...</span>
                </div>
              ) : availableSlots.length === 0 ? (
                <div className="py-4 text-center border rounded-md bg-amber-50 border-amber-200">
                  <Clock className="h-8 w-8 mx-auto mb-2 text-amber-500" />
                  <p className="text-sm text-amber-800 font-medium">Nessuno slot disponibile</p>
                  <p className="text-xs text-amber-600 mt-1">Seleziona un'altra data</p>
                </div>
              ) : (
                <>
                  <Select 
                    value={selectedSlot ? `${selectedSlot.startTime}-${selectedSlot.endTime}` : ''} 
                    onValueChange={(value) => {
                      const slot = availableSlots.find(s => `${s.startTime}-${s.endTime}` === value);
                      setSelectedSlot(slot || null);
                    }}
                  >
                    <SelectTrigger data-testid="select-slot">
                      <SelectValue placeholder="Seleziona orario disponibile" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableSlots.map((slot, index) => (
                        <SelectItem key={index} value={`${slot.startTime}-${slot.endTime}`}>
                          {slot.startTime} - {slot.endTime}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  <p className="text-xs text-muted-foreground mt-1">
                    ✅ {availableSlots.length} slot liberi su Google Calendar
                  </p>
                </>
              )}
            </div>
          )}

          {/* Info Durata */}
          {selectedSlot && selectedCampaign && (
            <div className="p-3 bg-green-50 rounded-lg border border-green-200">
              <p className="text-sm text-green-800">
                ✅ Slot confermato: <strong>{selectedSlot.startTime} - {selectedSlot.endTime}</strong>
                <br />
                ⏱️ Durata: {selectedCampaign.durataShootingMinuti} minuti
              </p>
            </div>
          )}

          {/* Prodotti Multi-Prodotto */}
          <div className="space-y-4 border-t pt-4">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold flex items-center gap-2">
                <ShoppingCart className="w-4 h-4" />
                Prodotti (opzionale)
              </Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={addProduct}
                className="border-sage text-sage hover:bg-sage hover:text-white"
                data-testid="button-add-product"
              >
                <Plus className="w-4 h-4 mr-1" />
                Aggiungi Prodotto
              </Button>
            </div>

            {selectedProducts.length === 0 ? (
              <div className="text-center py-6 text-gray-500 bg-gray-50 rounded-lg border border-dashed">
                <Package className="w-10 h-10 mx-auto mb-2 text-gray-400" />
                <p className="text-sm">Nessun prodotto aggiunto</p>
                <p className="text-xs mt-1">I prodotti possono essere aggiunti ora o in sede</p>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  {selectedProducts.map((item, index) => {
                    const product = availableProducts.find(p => p.id === item.prodottoId);
                    const subtotale = getProductSubtotal(item.prodottoId, item.quantita);

                    return (
                      <div key={index} className="flex items-center gap-3 p-3 border rounded-lg bg-white">
                        <div className="flex-1">
                          <Select
                            value={item.prodottoId}
                            onValueChange={(value) => updateProduct(index, 'prodottoId', value)}
                          >
                            <SelectTrigger data-testid={`select-product-${index}`}>
                              <SelectValue placeholder="Seleziona prodotto" />
                            </SelectTrigger>
                            <SelectContent>
                              {availableProducts.map(p => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.nome} - €{p.prezzoFinale.toFixed(2)} ({p.numeroFoto} foto)
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="w-20">
                          <Input
                            type="number"
                            min="1"
                            value={item.quantita}
                            onChange={(e) => updateProduct(index, 'quantita', parseInt(e.target.value) || 1)}
                            placeholder="Qtà"
                            data-testid={`input-quantity-${index}`}
                          />
                        </div>

                        <div className="w-24 text-right font-medium">
                          €{subtotale.toFixed(2)}
                        </div>

                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => removeProduct(index)}
                          data-testid={`button-remove-product-${index}`}
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    );
                  })}
                </div>

              </>
            )}

            {/* Prodotti Personalizzati */}
            <div className="space-y-4 mt-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Prodotti Personalizzati</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setShowCustomForm(true)}
                  className="border-amber-500 text-amber-600 hover:bg-amber-500 hover:text-white"
                  data-testid="button-add-custom-product"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Aggiungi Personalizzato
                </Button>
              </div>

              {/* Form nuovo prodotto personalizzato */}
              {showCustomForm && (
                <div className="p-4 border-2 border-dashed border-amber-300 rounded-lg bg-amber-50 space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-3 sm:col-span-1">
                      <Label className="text-xs mb-1 block">Nome Prodotto *</Label>
                      <Input
                        value={customNome}
                        onChange={(e) => setCustomNome(e.target.value)}
                        placeholder="es. Servizio Extra"
                        data-testid="input-custom-nome"
                      />
                    </div>
                    <div>
                      <Label className="text-xs mb-1 block">Prezzo (€) *</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={customPrezzo || ''}
                        onChange={(e) => setCustomPrezzo(parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                        data-testid="input-custom-prezzo"
                      />
                    </div>
                    <div>
                      <Label className="text-xs mb-1 block">N. Foto</Label>
                      <Input
                        type="number"
                        min="0"
                        value={customNumeroFoto || ''}
                        onChange={(e) => setCustomNumeroFoto(parseInt(e.target.value) || 0)}
                        placeholder="0"
                        data-testid="input-custom-foto"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setShowCustomForm(false);
                        setCustomNome('');
                        setCustomPrezzo(0);
                        setCustomNumeroFoto(0);
                      }}
                    >
                      Annulla
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={addCustomProduct}
                      disabled={!customNome.trim() || customPrezzo <= 0}
                      className="bg-amber-500 hover:bg-amber-600 text-white"
                      data-testid="button-confirm-custom"
                    >
                      Conferma
                    </Button>
                  </div>
                </div>
              )}

              {/* Lista prodotti personalizzati */}
              {customProducts.length > 0 && (
                <div className="space-y-3">
                  {customProducts.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 border border-amber-200 rounded-lg bg-amber-50 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded">
                          Personalizzato
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => removeCustomProduct(item.id)}
                          data-testid={`button-remove-custom-${item.id}`}
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        <div className="col-span-2">
                          <Label className="text-xs mb-1 block">Nome</Label>
                          <Input
                            value={item.nome}
                            onChange={(e) => updateCustomProduct(item.id, 'nome', e.target.value)}
                            placeholder="Nome prodotto"
                            data-testid={`input-custom-name-${item.id}`}
                          />
                        </div>
                        <div>
                          <Label className="text-xs mb-1 block">Prezzo (€)</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.prezzo || ''}
                            onChange={(e) =>
                              updateCustomProduct(item.id, 'prezzo', parseFloat(e.target.value) || 0)
                            }
                            data-testid={`input-custom-price-${item.id}`}
                          />
                        </div>
                        <div>
                          <Label className="text-xs mb-1 block">N. Foto</Label>
                          <Input
                            type="number"
                            min="0"
                            value={item.numeroFoto || ''}
                            onChange={(e) =>
                              updateCustomProduct(item.id, 'numeroFoto', parseInt(e.target.value) || 0)
                            }
                            data-testid={`input-custom-photos-${item.id}`}
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-amber-200">
                        <div className="flex items-center gap-2">
                          <Label className="text-xs">Quantità:</Label>
                          <Input
                            type="number"
                            min="1"
                            value={item.quantita}
                            onChange={(e) =>
                              updateCustomQuantita(item.id, parseInt(e.target.value) || 1)
                            }
                            className="w-16 text-center"
                            data-testid={`input-custom-qty-${item.id}`}
                          />
                        </div>
                        <div className="text-right font-medium">
                          Subtotale: €{(item.prezzo * item.quantita).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Riepilogo Totale */}
            {(selectedProducts.length > 0 || customProducts.length > 0) && (
              <div className="bg-sage/10 p-3 rounded-lg border border-sage/20 mt-4">
                <div className="flex justify-between items-center font-bold">
                  <span>Totale Preventivo:</span>
                  <span className="text-sage text-lg">€{calculateTotale().toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Note */}
          <div className="space-y-2">
            <Label htmlFor="note">Note</Label>
            <Textarea
              id="note"
              data-testid="input-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note aggiuntive sulla prenotazione..."
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
              data-testid="button-cancel"
            >
              Annulla
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              data-testid="button-submit"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creazione...
                </>
              ) : (
                'Crea Prenotazione'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
