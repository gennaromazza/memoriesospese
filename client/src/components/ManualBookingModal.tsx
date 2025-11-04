/**
 * Manual Booking Modal - Crea prenotazione manuale per clienti walk-in
 */

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';
import { getAllCampaigns } from '@/lib/booking-campaigns';
import { getActiveProducts } from '@/lib/products';
import type { BookingCampaign, Product } from '@shared/booking-types';
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
import { Loader2, Calendar, Clock, User } from 'lucide-react';
import { format, addMinutes, parseISO, setHours, setMinutes } from 'date-fns';
import { it } from 'date-fns/locale';

interface ManualBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
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
  const [dataShootingTime, setDataShootingTime] = useState<string>('09:00');
  const [prodottoId, setProdottoId] = useState<string>('');
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

  // Reset form quando modal si apre
  useEffect(() => {
    if (isOpen) {
      setCampaignId('');
      setNome('');
      setCognome('');
      setEmail('');
      setWhatsapp('');
      setDataShootingDate('');
      setDataShootingTime('09:00');
      setProdottoId('');
      setNote('');
    }
  }, [isOpen]);

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

    if (!dataShootingDate || !dataShootingTime) {
      toast({
        title: 'Data e ora mancanti',
        description: 'Seleziona data e ora dello shooting',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsSubmitting(true);

      // Costruisci dataShootingInizio
      const [hours, minutes] = dataShootingTime.split(':').map(Number);
      const dataInizioDate = setMinutes(setHours(parseISO(dataShootingDate), hours), minutes);
      
      // Calcola dataShootingFine basandosi su durataShootingMinuti
      const dataFineDate = addMinutes(dataInizioDate, selectedCampaign.durataShootingMinuti);

      // Trova prodotto selezionato
      const selectedProduct = products.find(p => p.id === prodottoId);

      // Payload prenotazione
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
        prodottoId: prodottoId || undefined,
        prodottoNome: selectedProduct?.nome,
        note: note.trim(),
        isManual: true,
        createdByAdmin: user?.email || 'admin',
      };

      console.log('📝 Creazione prenotazione manuale:', bookingPayload);

      // Chiamata API
      const response = await fetch('/api/bookings/create', {
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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

          {/* Data e Ora Shooting */}
          <div className="grid grid-cols-2 gap-4">
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
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="time">
                <Clock className="w-4 h-4 inline mr-1" />
                Ora Inizio *
              </Label>
              <Input
                id="time"
                data-testid="input-time"
                type="time"
                value={dataShootingTime}
                onChange={(e) => setDataShootingTime(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Durata calcolata */}
          {selectedCampaign && dataShootingDate && dataShootingTime && (
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-sm text-blue-800">
                ⏱️ Durata: {selectedCampaign.durataShootingMinuti} minuti
                {' - '}
                Fine prevista: {format(
                  addMinutes(
                    setMinutes(setHours(parseISO(dataShootingDate), parseInt(dataShootingTime.split(':')[0])), parseInt(dataShootingTime.split(':')[1])),
                    selectedCampaign.durataShootingMinuti
                  ),
                  'HH:mm'
                )}
              </p>
            </div>
          )}

          {/* Prodotto */}
          <div className="space-y-2">
            <Label htmlFor="product">Prodotto (opzionale)</Label>
            <Select value={prodottoId} onValueChange={setProdottoId}>
              <SelectTrigger data-testid="select-product">
                <SelectValue placeholder="Da decidere in sede" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Da decidere in sede</SelectItem>
                {availableProducts.map((product) => (
                  <SelectItem key={product.id} value={product.id}>
                    {product.nome} - €{product.prezzoFinale}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
