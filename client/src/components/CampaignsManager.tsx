/**
 * Campaigns Manager - Gestione campagne booking per admin
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { deleteField } from 'firebase/firestore';
import { queryClient } from '@/lib/queryClient';
import {
  getAllCampaigns,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  generateCampaignCode,
  isCampaignCodeUnique
} from '@/lib/booking-campaigns';
import { getAllProducts } from '@/lib/products';
import type { BookingCampaign, Product } from '@shared/booking-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TimeInput } from '@/components/ui/time-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import {
  Calendar,
  Plus,
  Pencil,
  Trash2,
  ExternalLink,
  Copy,
  Clock,
  Package,
  Upload,
  X,
  Image as ImageIcon
} from 'lucide-react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { storage } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import imageCompression from 'browser-image-compression';

// Temi stagionali disponibili
const TEMI_STAGIONALI = [
  { value: 'none', label: 'Nessun tema' },
  { value: 'natale', label: '🎄 Natale' },
  { value: 'carnevale', label: '🎭 Carnevale' },
  { value: 'san-valentino', label: '💕 San Valentino' },
  { value: 'pasqua', label: '🐰 Pasqua' },
  { value: 'halloween', label: '🎃 Halloween' },
];

interface CampaignFormData {
  nome: string;
  descrizione: string;
  code: string;
  dataInizio: string;
  dataFine: string;
  giorniAnticipoSlider?: number; // Giorni anticipo slider homepage (0-30)
  bloccaPrenotazioniPrimaInizio?: boolean; // Blocca prenotazioni prima di dataInizio
  temaStagionale: string;
  orarioApertura: string;
  orarioPausaInizio: string;
  orarioPausaFine: string;
  orarioChiusura: string;
  durataShootingMinuti: number;
  prodottiDisponibili: string[];
  excludedDays: number[]; // Giorni esclusi (0=Domenica, 1=Lunedì, ..., 6=Sabato)
  immagineSlider?: string; // URL immagine slider homepage
  immaginePaginaBooking?: string; // URL immagine pagina booking
  attiva: boolean;
}

const defaultFormData: CampaignFormData = {
  nome: '',
  descrizione: '',
  code: '',
  dataInizio: '',
  dataFine: '',
  giorniAnticipoSlider: 0,
  bloccaPrenotazioniPrimaInizio: false,
  temaStagionale: 'none',
  orarioApertura: '09:00',
  orarioPausaInizio: '13:00',
  orarioPausaFine: '14:30',
  orarioChiusura: '19:00',
  durataShootingMinuti: 120,
  prodottiDisponibili: [],
  excludedDays: [], // Nessun giorno escluso di default
  immagineSlider: undefined,
  immaginePaginaBooking: undefined,
  attiva: true,
};

export default function CampaignsManager() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<BookingCampaign | null>(null);
  const [formData, setFormData] = useState<CampaignFormData>(defaultFormData);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [uploadingSlider, setUploadingSlider] = useState(false);
  const [uploadingBooking, setUploadingBooking] = useState(false);

  // Query campaigns
  const { data: campaigns = [], isLoading: loadingCampaigns } = useQuery<BookingCampaign[]>({
    queryKey: ['booking-campaigns'],
    queryFn: getAllCampaigns,
  });

  // Query products
  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: getAllProducts,
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: CampaignFormData) => {
      // Mantieni type safety con spread condizionale (Firestore non accetta undefined)
      const campaignData: Omit<BookingCampaign, 'id' | 'createdAt'> = {
        nome: data.nome,
        descrizione: data.descrizione,
        code: data.code,
        dataInizio: new Date(data.dataInizio),
        dataFine: new Date(data.dataFine),
        giorniAnticipoSlider: data.giorniAnticipoSlider ?? 0,
        bloccaPrenotazioniPrimaInizio: data.bloccaPrenotazioniPrimaInizio ?? false,
        temaStagionale: data.temaStagionale === 'none' ? null : data.temaStagionale,
        orarioApertura: data.orarioApertura,
        orarioPausaInizio: data.orarioPausaInizio,
        orarioPausaFine: data.orarioPausaFine,
        orarioChiusura: data.orarioChiusura,
        durataShootingMinuti: data.durataShootingMinuti,
        prodottiDisponibili: data.prodottiDisponibili,
        attiva: data.attiva,
        ...(data.excludedDays.length > 0 && { excludedDays: data.excludedDays }),
        ...(data.immagineSlider && { immagineSlider: data.immagineSlider }),
        ...(data.immaginePaginaBooking && { immaginePaginaBooking: data.immaginePaginaBooking }),
      };
      
      return await createCampaign(campaignData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['booking-campaigns'] });
      toast({
        title: 'Successo',
        description: 'Campagna creata con successo',
      });
      handleCloseDialog();
    },
    onError: (error: Error) => {
      toast({
        title: 'Errore',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CampaignFormData> }) => {
      const updateData: any = { ...data };
      
      if (data.dataInizio) {
        updateData.dataInizio = new Date(data.dataInizio);
      }
      if (data.dataFine) {
        updateData.dataFine = new Date(data.dataFine);
      }
      if (data.temaStagionale !== undefined) {
        updateData.temaStagionale = data.temaStagionale === 'none' ? null : data.temaStagionale;
      }
      if (data.excludedDays !== undefined) {
        // Aggiungi excludedDays solo se non è vuoto, altrimenti usa deleteField() per rimuoverlo
        if (data.excludedDays.length > 0) {
          updateData.excludedDays = data.excludedDays;
        } else {
          // Usa deleteField() di Firestore per rimuovere completamente il campo
          updateData.excludedDays = deleteField();
        }
      }
      // Assicura che i booleani vengano sempre salvati esplicitamente
      if (data.giorniAnticipoSlider !== undefined) {
        updateData.giorniAnticipoSlider = data.giorniAnticipoSlider ?? 0;
      }
      if (data.bloccaPrenotazioniPrimaInizio !== undefined) {
        updateData.bloccaPrenotazioniPrimaInizio = data.bloccaPrenotazioniPrimaInizio ?? false;
      }
      // Gestione immagini (opzionali)
      if (data.immagineSlider !== undefined) {
        updateData.immagineSlider = data.immagineSlider || deleteField();
      }
      if (data.immaginePaginaBooking !== undefined) {
        updateData.immaginePaginaBooking = data.immaginePaginaBooking || deleteField();
      }
      
      return await updateCampaign(id, updateData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['booking-campaigns'] });
      toast({
        title: 'Successo',
        description: 'Campagna aggiornata con successo',
      });
      handleCloseDialog();
    },
    onError: (error: Error) => {
      toast({
        title: 'Errore',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: deleteCampaign,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['booking-campaigns'] });
      toast({
        title: 'Successo',
        description: 'Campagna eliminata',
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

  // Upload immagine slider homepage
  const handleUploadSlider = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Errore',
        description: 'Il file deve essere un\'immagine',
        variant: 'destructive',
      });
      return;
    }

    try {
      setUploadingSlider(true);

      // Comprimi immagine
      const compressedFile = await imageCompression(file, {
        maxSizeMB: 1,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
      });

      // Upload a Firebase Storage
      const timestamp = Date.now();
      const campaignId = editingCampaign?.id || 'temp';
      const fileName = `slider_${timestamp}.jpg`;
      const storagePath = `campaigns/${campaignId}/${fileName}`;
      const storageRef = ref(storage, storagePath);

      await uploadBytes(storageRef, compressedFile);
      const downloadURL = await getDownloadURL(storageRef);

      setFormData({ ...formData, immagineSlider: downloadURL });

      toast({
        title: 'Successo',
        description: 'Immagine slider caricata',
      });
    } catch (error) {
      console.error('Errore upload immagine slider:', error);
      toast({
        title: 'Errore',
        description: 'Errore durante l\'upload dell\'immagine',
        variant: 'destructive',
      });
    } finally {
      setUploadingSlider(false);
    }
  };

  // Upload immagine pagina booking
  const handleUploadBooking = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Errore',
        description: 'Il file deve essere un\'immagine',
        variant: 'destructive',
      });
      return;
    }

    try {
      setUploadingBooking(true);

      // Comprimi immagine
      const compressedFile = await imageCompression(file, {
        maxSizeMB: 1,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
      });

      // Upload a Firebase Storage
      const timestamp = Date.now();
      const campaignId = editingCampaign?.id || 'temp';
      const fileName = `booking_${timestamp}.jpg`;
      const storagePath = `campaigns/${campaignId}/${fileName}`;
      const storageRef = ref(storage, storagePath);

      await uploadBytes(storageRef, compressedFile);
      const downloadURL = await getDownloadURL(storageRef);

      setFormData({ ...formData, immaginePaginaBooking: downloadURL });

      toast({
        title: 'Successo',
        description: 'Immagine pagina booking caricata',
      });
    } catch (error) {
      console.error('Errore upload immagine booking:', error);
      toast({
        title: 'Errore',
        description: 'Errore durante l\'upload dell\'immagine',
        variant: 'destructive',
      });
    } finally {
      setUploadingBooking(false);
    }
  };

  // Rimuovi immagine slider
  const handleRemoveSlider = () => {
    setFormData({ ...formData, immagineSlider: undefined });
  };

  // Rimuovi immagine booking
  const handleRemoveBooking = () => {
    setFormData({ ...formData, immaginePaginaBooking: undefined });
  };

  // Genera codice univoco per nuova campagna
  const handleGenerateCode = async () => {
    let code = generateCampaignCode();
    let isUnique = await isCampaignCodeUnique(code);
    
    while (!isUnique) {
      code = generateCampaignCode();
      isUnique = await isCampaignCodeUnique(code);
    }
    
    setFormData({ ...formData, code });
  };

  // Apri dialog per nuova campagna
  const handleNewCampaign = async () => {
    setEditingCampaign(null);
    setFormData(defaultFormData);
    setSelectedProducts([]);
    
    // Genera codice automaticamente
    await handleGenerateCode();
    
    setDialogOpen(true);
  };

  // Apri dialog per modifica
  const handleEditCampaign = (campaign: BookingCampaign) => {
    setEditingCampaign(campaign);
    setFormData({
      nome: campaign.nome,
      descrizione: campaign.descrizione,
      code: campaign.code,
      dataInizio: format(campaign.dataInizio, 'yyyy-MM-dd'),
      dataFine: format(campaign.dataFine, 'yyyy-MM-dd'),
      giorniAnticipoSlider: campaign.giorniAnticipoSlider || 0,
      bloccaPrenotazioniPrimaInizio: campaign.bloccaPrenotazioniPrimaInizio || false,
      temaStagionale: campaign.temaStagionale || 'none',
      orarioApertura: campaign.orarioApertura,
      orarioPausaInizio: campaign.orarioPausaInizio,
      orarioPausaFine: campaign.orarioPausaFine,
      orarioChiusura: campaign.orarioChiusura,
      durataShootingMinuti: campaign.durataShootingMinuti,
      prodottiDisponibili: campaign.prodottiDisponibili,
      excludedDays: campaign.excludedDays || [],
      immagineSlider: campaign.immagineSlider,
      immaginePaginaBooking: campaign.immaginePaginaBooking,
      attiva: campaign.attiva,
    });
    setSelectedProducts(campaign.prodottiDisponibili);
    setDialogOpen(true);
  };

  // Chiudi dialog
  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingCampaign(null);
    setFormData(defaultFormData);
    setSelectedProducts([]);
  };

  // Submit form
  const handleSubmit = () => {
    // Validazione
    if (!formData.nome.trim()) {
      toast({
        title: 'Errore',
        description: 'Inserisci il nome della campagna',
        variant: 'destructive',
      });
      return;
    }
    
    if (!formData.code.trim()) {
      toast({
        title: 'Errore',
        description: 'Genera un codice campagna',
        variant: 'destructive',
      });
      return;
    }
    
    if (!formData.dataInizio || !formData.dataFine) {
      toast({
        title: 'Errore',
        description: 'Seleziona le date di inizio e fine',
        variant: 'destructive',
      });
      return;
    }

    const dataToSave = {
      ...formData,
      prodottiDisponibili: selectedProducts,
    };

    if (editingCampaign) {
      updateMutation.mutate({ id: editingCampaign.id, data: dataToSave });
    } else {
      createMutation.mutate(dataToSave);
    }
  };

  // Toggle selezione prodotto
  const toggleProductSelection = (productId: string) => {
    setSelectedProducts(prev =>
      prev.includes(productId)
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  // Copia URL pubblico
  const copyPublicUrl = (code: string) => {
    const url = `${window.location.origin}/prenota/${code}`;
    navigator.clipboard.writeText(url);
    toast({
      title: 'Copiato!',
      description: 'URL copiato negli appunti',
    });
  };

  // Aggiorna prodotti selezionati quando cambia formData
  useEffect(() => {
    setSelectedProducts(formData.prodottiDisponibili);
  }, [formData.prodottiDisponibili]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Campagne Booking</h2>
          <p className="text-muted-foreground">
            Gestisci campagne di prenotazione con date, temi e prodotti
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleNewCampaign} data-testid="button-new-campaign">
              <Plus className="h-4 w-4 mr-2" />
              Nuova Campagna
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingCampaign ? 'Modifica Campagna' : 'Nuova Campagna'}
              </DialogTitle>
              <DialogDescription>
                Configura date, orari lavorativi e prodotti disponibili
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Nome e Codice */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="nome">Nome Campagna *</Label>
                  <Input
                    id="nome"
                    value={formData.nome}
                    onChange={e => setFormData({ ...formData, nome: e.target.value })}
                    placeholder="es. Natale 2025"
                    data-testid="input-campaign-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="code">Codice URL *</Label>
                  <div className="flex gap-2">
                    <Input
                      id="code"
                      value={formData.code}
                      onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                      placeholder="ABC123XY"
                      maxLength={8}
                      data-testid="input-campaign-code"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleGenerateCode}
                      data-testid="button-generate-code"
                    >
                      Genera
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    URL pubblico: /prenota/{formData.code}
                  </p>
                </div>
              </div>

              {/* Descrizione */}
              <div className="space-y-2">
                <Label htmlFor="descrizione">Descrizione</Label>
                <Textarea
                  id="descrizione"
                  value={formData.descrizione}
                  onChange={e => setFormData({ ...formData, descrizione: e.target.value })}
                  placeholder="Descrivi la campagna..."
                  rows={3}
                  data-testid="textarea-campaign-description"
                />
              </div>

              {/* Immagini */}
              <div className="space-y-4 pt-3 border-t">
                <Label className="text-base font-semibold">Immagini Campagna</Label>
                
                {/* Immagine Slider Homepage */}
                <div className="space-y-2">
                  <Label>Immagine Slider Homepage (Opzionale)</Label>
                  <p className="text-xs text-muted-foreground mb-2">
                    Immagine mostrata nello slider della homepage quando la campagna è attiva
                  </p>
                  {formData.immagineSlider ? (
                    <div className="relative">
                      <img
                        src={formData.immagineSlider}
                        alt="Preview slider"
                        className="w-full h-48 object-cover rounded-lg"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="absolute top-2 right-2"
                        onClick={handleRemoveSlider}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="border-2 border-dashed rounded-lg p-6 text-center">
                      <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                      <Label htmlFor="upload-slider" className="cursor-pointer">
                        <div className="text-sm text-muted-foreground mb-2">
                          Clicca per caricare un'immagine
                        </div>
                        <Button type="button" variant="outline" disabled={uploadingSlider} asChild>
                          <span>
                            {uploadingSlider ? (
                              <>Caricamento...</>
                            ) : (
                              <>
                                <Upload className="h-4 w-4 mr-2" />
                                Carica Immagine Slider
                              </>
                            )}
                          </span>
                        </Button>
                      </Label>
                      <input
                        id="upload-slider"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleUploadSlider}
                        disabled={uploadingSlider}
                      />
                    </div>
                  )}
                </div>

                {/* Immagine Pagina Booking */}
                <div className="space-y-2">
                  <Label>Immagine Pagina Booking (Opzionale)</Label>
                  <p className="text-xs text-muted-foreground mb-2">
                    Immagine hero della pagina di prenotazione pubblica (per preview WhatsApp/social)
                  </p>
                  {formData.immaginePaginaBooking ? (
                    <div className="relative">
                      <img
                        src={formData.immaginePaginaBooking}
                        alt="Preview booking"
                        className="w-full h-48 object-cover rounded-lg"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="absolute top-2 right-2"
                        onClick={handleRemoveBooking}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="border-2 border-dashed rounded-lg p-6 text-center">
                      <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                      <Label htmlFor="upload-booking" className="cursor-pointer">
                        <div className="text-sm text-muted-foreground mb-2">
                          Clicca per caricare un'immagine
                        </div>
                        <Button type="button" variant="outline" disabled={uploadingBooking} asChild>
                          <span>
                            {uploadingBooking ? (
                              <>Caricamento...</>
                            ) : (
                              <>
                                <Upload className="h-4 w-4 mr-2" />
                                Carica Immagine Booking
                              </>
                            )}
                          </span>
                        </Button>
                      </Label>
                      <input
                        id="upload-booking"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleUploadBooking}
                        disabled={uploadingBooking}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Date */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="dataInizio">Data Inizio *</Label>
                  <Input
                    id="dataInizio"
                    type="date"
                    value={formData.dataInizio}
                    onChange={e => setFormData({ ...formData, dataInizio: e.target.value })}
                    data-testid="input-campaign-start-date"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dataFine">Data Fine *</Label>
                  <Input
                    id="dataFine"
                    type="date"
                    value={formData.dataFine}
                    onChange={e => setFormData({ ...formData, dataFine: e.target.value })}
                    data-testid="input-campaign-end-date"
                  />
                </div>
              </div>

              {/* Anticipo Slider Homepage */}
              <div className="space-y-3 pt-3 border-t">
                <Label className="text-base font-semibold">Configurazione Slider Homepage</Label>
                
                <div className="space-y-2">
                  <Label htmlFor="giorniAnticipoSlider">Anticipo Slider (giorni)</Label>
                  <Input
                    id="giorniAnticipoSlider"
                    type="number"
                    min="0"
                    max="30"
                    value={formData.giorniAnticipoSlider || 0}
                    onChange={e => {
                      const value = parseInt(e.target.value) || 0;
                      const clampedValue = Math.max(0, Math.min(30, value));
                      setFormData({ ...formData, giorniAnticipoSlider: clampedValue });
                    }}
                    data-testid="input-slider-advance-days"
                  />
                  <p className="text-xs text-muted-foreground">
                    Lo slider apparirà in homepage X giorni prima della data di inizio (0-30 giorni).
                  </p>
                </div>

                <div className="flex items-center justify-between space-x-2 p-3 bg-muted/50 rounded-lg">
                  <div className="flex-1">
                    <Label htmlFor="bloccaPrenotazioni" className="font-medium">
                      Blocca prenotazioni prima della data di inizio
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Se attivo, anche con lo slider visibile, le prenotazioni si apriranno solo dalla data di inizio. 
                      Se disattivo, gli utenti potranno prenotare anche prima della data di inizio.
                    </p>
                  </div>
                  <Switch
                    id="bloccaPrenotazioni"
                    checked={formData.bloccaPrenotazioniPrimaInizio || false}
                    onCheckedChange={checked => setFormData({ ...formData, bloccaPrenotazioniPrimaInizio: checked })}
                    data-testid="switch-block-bookings"
                  />
                </div>
              </div>

              {/* Tema Stagionale */}
              <div className="space-y-2">
                <Label htmlFor="tema">Tema Stagionale</Label>
                <Select
                  value={formData.temaStagionale}
                  onValueChange={value => setFormData({ ...formData, temaStagionale: value })}
                >
                  <SelectTrigger data-testid="select-campaign-theme">
                    <SelectValue placeholder="Seleziona tema" />
                  </SelectTrigger>
                  <SelectContent>
                    {TEMI_STAGIONALI.map(tema => (
                      <SelectItem key={tema.value} value={tema.value}>
                        {tema.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Il tema sarà applicato automaticamente alle gallerie collegate
                </p>
              </div>

              {/* Orari Lavorativi */}
              <div className="space-y-3 pt-3 border-t">
                <Label className="text-base font-semibold">Orari Lavorativi</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="orarioApertura">Apertura</Label>
                    <TimeInput
                      id="orarioApertura"
                      value={formData.orarioApertura}
                      onChange={e => setFormData({ ...formData, orarioApertura: e.target.value })}
                      data-testid="input-opening-time"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="orarioChiusura">Chiusura</Label>
                    <TimeInput
                      id="orarioChiusura"
                      value={formData.orarioChiusura}
                      onChange={e => setFormData({ ...formData, orarioChiusura: e.target.value })}
                      data-testid="input-closing-time"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="pausaInizio">Pausa Inizio</Label>
                    <TimeInput
                      id="pausaInizio"
                      value={formData.orarioPausaInizio}
                      onChange={e => setFormData({ ...formData, orarioPausaInizio: e.target.value })}
                      data-testid="input-break-start"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pausaFine">Pausa Fine</Label>
                    <TimeInput
                      id="pausaFine"
                      value={formData.orarioPausaFine}
                      onChange={e => setFormData({ ...formData, orarioPausaFine: e.target.value })}
                      data-testid="input-break-end"
                    />
                  </div>
                </div>
              </div>

              {/* Durata Shooting */}
              <div className="space-y-2">
                <Label htmlFor="durata">Durata Shooting (minuti)</Label>
                <Input
                  id="durata"
                  type="number"
                  min="30"
                  step="30"
                  value={formData.durataShootingMinuti}
                  onChange={e => setFormData({ ...formData, durataShootingMinuti: parseInt(e.target.value) || 60 })}
                  data-testid="input-shooting-duration"
                />
              </div>

              {/* Giorni Esclusi */}
              <div className="space-y-3 pt-3 border-t">
                <Label className="text-base font-semibold">Giorni Esclusi dalle Prenotazioni</Label>
                <p className="text-sm text-muted-foreground">Seleziona i giorni in cui NON accetti prenotazioni</p>
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { value: 0, label: 'Dom', fullName: 'Domenica' },
                    { value: 1, label: 'Lun', fullName: 'Lunedì' },
                    { value: 2, label: 'Mar', fullName: 'Martedì' },
                    { value: 3, label: 'Mer', fullName: 'Mercoledì' },
                    { value: 4, label: 'Gio', fullName: 'Giovedì' },
                    { value: 5, label: 'Ven', fullName: 'Venerdì' },
                    { value: 6, label: 'Sab', fullName: 'Sabato' },
                  ].map(day => (
                    <div
                      key={day.value}
                      className={`flex items-center justify-center p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                        formData.excludedDays.includes(day.value)
                          ? 'border-red-500 bg-red-50 text-red-700'
                          : 'border-muted hover:border-red-300'
                      }`}
                      onClick={() => {
                        const newExcludedDays = formData.excludedDays.includes(day.value)
                          ? formData.excludedDays.filter(d => d !== day.value)
                          : [...formData.excludedDays, day.value];
                        setFormData({ ...formData, excludedDays: newExcludedDays });
                      }}
                      data-testid={`day-toggle-${day.value}`}
                      title={day.fullName}
                    >
                      <span className="font-medium text-sm">{day.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Prodotti Disponibili */}
              <div className="space-y-3 pt-3 border-t">
                <Label className="text-base font-semibold">Prodotti Disponibili</Label>
                {products.filter(p => p.attivo).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nessun prodotto attivo. Crea dei prodotti prima di configurare la campagna.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 max-h-64 overflow-y-auto border rounded-lg p-3">
                    {products.filter(p => p.attivo).map(product => (
                      <div
                        key={product.id}
                        className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                          selectedProducts.includes(product.id)
                            ? 'border-primary bg-primary/5'
                            : 'border-muted hover:border-primary/50'
                        }`}
                        onClick={() => toggleProductSelection(product.id)}
                        data-testid={`product-option-${product.id}`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{product.nome}</p>
                          <p className="text-xs text-muted-foreground">
                            €{product.prezzoFinale.toFixed(2)} • {product.numeroFoto} foto
                          </p>
                        </div>
                        <div className="flex-shrink-0">
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                            selectedProducts.includes(product.id)
                              ? 'bg-primary border-primary'
                              : 'border-muted-foreground/50'
                          }`}>
                            {selectedProducts.includes(product.id) && (
                              <div className="w-2 h-2 bg-white rounded-full" />
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Stato Attiva */}
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div>
                  <Label htmlFor="attiva" className="text-sm font-medium">
                    Campagna Attiva
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Rendi visibile la campagna per le prenotazioni pubbliche
                  </p>
                </div>
                <Switch
                  id="attiva"
                  checked={formData.attiva}
                  onCheckedChange={checked => setFormData({ ...formData, attiva: checked })}
                  data-testid="switch-campaign-active"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleCloseDialog} data-testid="button-cancel">
                Annulla
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={createMutation.isPending || updateMutation.isPending}
                data-testid="button-save-campaign"
              >
                {createMutation.isPending || updateMutation.isPending
                  ? 'Salvataggio...'
                  : editingCampaign
                  ? 'Aggiorna'
                  : 'Crea Campagna'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Lista Campagne */}
      {loadingCampaigns ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : campaigns.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">Nessuna campagna</p>
            <p className="text-sm text-muted-foreground mb-4">
              Crea la tua prima campagna di prenotazione
            </p>
            <Button onClick={handleNewCampaign}>
              <Plus className="h-4 w-4 mr-2" />
              Nuova Campagna
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {campaigns.map(campaign => (
            <Card key={campaign.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <CardTitle className="flex items-center gap-2">
                      {campaign.nome}
                      {!campaign.attiva && (
                        <Badge variant="secondary" className="text-xs">
                          Disattiva
                        </Badge>
                      )}
                      {campaign.temaStagionale && (
                        <Badge variant="outline" className="text-xs">
                          {TEMI_STAGIONALI.find(t => t.value === campaign.temaStagionale)?.label}
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {format(campaign.dataInizio, 'dd MMMM yyyy', { locale: it })} -{' '}
                      {format(campaign.dataFine, 'dd MMMM yyyy', { locale: it })}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => copyPublicUrl(campaign.code)}
                      data-testid={`button-copy-url-${campaign.id}`}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => window.open(`/prenota/${campaign.code}`, '_blank')}
                      data-testid={`button-open-url-${campaign.id}`}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEditCampaign(campaign)}
                      data-testid={`button-edit-${campaign.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm('Eliminare questa campagna?')) {
                          deleteMutation.mutate(campaign.id);
                        }
                      }}
                      data-testid={`button-delete-${campaign.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {campaign.descrizione && (
                  <p className="text-sm text-muted-foreground">
                    {campaign.descrizione}
                  </p>
                )}

                <div className="flex flex-wrap gap-4 pt-2 border-t">
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>
                      {campaign.orarioApertura} - {campaign.orarioChiusura}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      (pausa {campaign.orarioPausaInizio}-{campaign.orarioPausaFine})
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>{campaign.durataShootingMinuti} min</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    <span>{campaign.prodottiDisponibili.length} prodotti</span>
                  </div>
                </div>

                {campaign.prodottiDisponibili.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <Label className="text-xs text-muted-foreground">Prodotti disponibili:</Label>
                    <div className="flex flex-wrap gap-2">
                      {campaign.prodottiDisponibili.map(productId => {
                        const product = products.find(p => p.id === productId);
                        return product ? (
                          <Badge key={productId} variant="secondary" className="text-xs">
                            {product.nome}
                          </Badge>
                        ) : null;
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
