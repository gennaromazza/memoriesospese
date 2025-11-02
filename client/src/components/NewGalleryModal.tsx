import React, { useState, useEffect } from 'react';
import { nanoid } from 'nanoid';
import { collection, addDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';
import { getAllThemes } from '@shared/special-themes';
import { getProductById } from '@/lib/products';
import type { Product } from '@shared/booking-types';
import { Info } from 'lucide-react';

interface NewGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGalleryCreated?: () => void;
  
  // Pre-population fields (optional)
  prePopulate?: {
    name?: string;
    date?: string;
    location?: string;
    description?: string;
    specialTheme?: string; // Auto-populated from campaign.temaStagionale
    specialPin?: string;
    bookingId?: string; // Link to booking (for integration)
    prodottoId?: string; // Product ID to fetch data and auto-populate selection settings
    clienteEmail?: string; // Client email for sending gallery ready notification
    clienteNome?: string; // Client nome per email personalizzata
  };
}

export default function NewGalleryModal({ isOpen, onClose, onGalleryCreated, prePopulate }: NewGalleryModalProps) {
  const { user } = useFirebaseAuth();
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [password, setPassword] = useState('');
  const [specialTheme, setSpecialTheme] = useState<string>('none');
  const [specialPin, setSpecialPin] = useState('');
  const [selectionEnabled, setSelectionEnabled] = useState(false);
  const [requiredPhotoCount, setRequiredPhotoCount] = useState<number>(0);
  const [selectionDeadline, setSelectionDeadline] = useState<string>('');
  const [product, setProduct] = useState<Product | null>(null);
  const [isLoadingProduct, setIsLoadingProduct] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const availableThemes = getAllThemes();
  
  // Fetch product data when prodottoId is provided
  useEffect(() => {
    const fetchProduct = async () => {
      if (prePopulate?.prodottoId) {
        setIsLoadingProduct(true);
        try {
          const productData = await getProductById(prePopulate.prodottoId);
          if (productData) {
            setProduct(productData);
            // Auto-populate selection settings from product
            if (productData.numeroFoto > 0) {
              setSelectionEnabled(true);
              setRequiredPhotoCount(productData.numeroFoto);
            }
          }
        } catch (error) {
          console.error('Errore fetch prodotto:', error);
        } finally {
          setIsLoadingProduct(false);
        }
      }
    };
    
    fetchProduct();
  }, [prePopulate?.prodottoId]);
  
  // Initialize form with pre-populated values
  useEffect(() => {
    if (prePopulate) {
      setName(prePopulate.name || '');
      setDate(prePopulate.date || '');
      setLocation(prePopulate.location || '');
      setDescription(prePopulate.description || '');
      setSpecialTheme(prePopulate.specialTheme || 'none');
      setSpecialPin(prePopulate.specialPin || '');
    }
  }, [prePopulate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      toast.error('Devi essere autenticato per creare una galleria');
      return;
    }

    if (!name.trim()) {
      toast.error('Il nome della galleria è obbligatorio');
      return;
    }

    // Validate PIN for special themes
    if (specialTheme !== 'none' && !specialPin.trim()) {
      toast.error('Il PIN è obbligatorio per le gallerie con tema stagionale');
      return;
    }

    setIsLoading(true);
    try {
      // Check gallery limit
      const galleriesQuery = query(
        collection(db, 'galleries'),
        where('userId', '==', user.uid)
      );
      const galleriesSnapshot = await getDocs(galleriesQuery);
      const currentGalleryCount = galleriesSnapshot.size;


      // Generate unique code
      const code = nanoid(8);

      // Create gallery
      const galleryData: any = {
        name: name.trim(),
        code,
        date,
        location: location.trim(),
        description: description.trim(),
        password: password.trim(),
        userId: user.uid,
        photoCount: 0,
        active: true,
        selectionEnabled, // Modalità selezione foto
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      // Add special theme fields if theme is selected
      if (specialTheme !== 'none') {
        galleryData.specialTheme = specialTheme;
        galleryData.specialPin = specialPin.trim();
      }
      
      // Add photo selection fields if selection is enabled
      if (selectionEnabled && requiredPhotoCount > 0) {
        galleryData.requiredPhotoCount = requiredPhotoCount;
        galleryData.selectionStatus = 'pending';
        galleryData.selectedPhotoIds = [];
        if (selectionDeadline) {
          // Convert date string to Firestore Timestamp
          galleryData.selectionDeadline = new Date(selectionDeadline);
          galleryData.selectionDeadlineEnforced = true;
        }
      }
      
      // Add booking link if gallery created from BookingsManager
      if (prePopulate?.bookingId) {
        galleryData.bookingId = prePopulate.bookingId;
      }

      const galleryDocRef = await addDoc(collection(db, 'galleries'), galleryData);
      const newGalleryId = galleryDocRef.id;

      // Send email notification if selection enabled
      if (selectionEnabled && requiredPhotoCount > 0 && prePopulate?.clienteEmail) {
        try {
          const galleryUrl = `${window.location.origin}/gallery/${code}`;
          const deadlineFormatted = selectionDeadline 
            ? new Date(selectionDeadline).toLocaleDateString('it-IT', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })
            : undefined;

          const emailResponse = await fetch('/api/email/gallery-ready', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              recipientEmail: prePopulate.clienteEmail,
              clienteNome: prePopulate.clienteNome || 'Cliente',
              galleryName: name.trim(),
              galleryUrl,
              requiredPhotoCount,
              selectionDeadline: deadlineFormatted,
              photoCount: 0 // Always 0 on creation
            })
          });

          if (emailResponse.ok) {
            console.log('✅ Email "Galleria Pronta" inviata al cliente');
          } else {
            console.error('⚠️ Email non inviata:', await emailResponse.text());
          }
        } catch (emailError) {
          console.error('⚠️ Errore invio email galleria:', emailError);
          // Non bloccare il flusso se email fallisce
        }
      }

      toast.success('Galleria creata con successo!');

      // Reset form
      setName('');
      setDate('');
      setLocation('');
      setDescription('');
      setPassword('');
      setSpecialTheme('none');
      setSpecialPin('');
      setSelectionEnabled(false);
      setRequiredPhotoCount(0);
      setSelectionDeadline('');
      setProduct(null);

      onGalleryCreated?.();
      onClose();
    } catch (error) {
      console.error('Errore creazione galleria:', error);
      toast.error('Errore durante la creazione della galleria');
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Crea Nuova Galleria Evento</DialogTitle>
            <DialogDescription>
              Inserisci i dettagli per creare una nuova galleria di evento
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome dell'Evento *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nome dell'Evento"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="date">Data dell'Evento</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                placeholder="Data dell'Evento"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">Luogo</Label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="es. Villa Rossi, Roma"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descrizione</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Una breve descrizione dell'evento..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password Accesso</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password per accedere alla galleria"
              />
              <p className="text-sm text-muted-foreground">
                Lascia vuoto per accesso libero
              </p>
            </div>

            {/* Special Theme Section */}
            <div className="border-t pt-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="specialTheme">Tema Stagionale</Label>
                <Select value={specialTheme} onValueChange={setSpecialTheme}>
                  <SelectTrigger data-testid="select-special-theme">
                    <SelectValue placeholder="Seleziona tema (opzionale)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nessun tema (galleria normale)</SelectItem>
                    {availableThemes.map((theme) => (
                      <SelectItem key={theme.id} value={theme.id}>
                        {theme.icon} {theme.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  Applica un tema stagionale speciale alla galleria
                </p>
              </div>

              {specialTheme !== 'none' && (
                <div className="space-y-2">
                  <Label htmlFor="specialPin">PIN Galleria Speciale *</Label>
                  <Input
                    id="specialPin"
                    type="text"
                    value={specialPin}
                    onChange={(e) => setSpecialPin(e.target.value)}
                    placeholder="Es. 2024"
                    required={specialTheme !== 'none'}
                    data-testid="input-special-pin"
                  />
                  <p className="text-sm text-muted-foreground">
                    PIN univoco per accedere a questa galleria speciale
                  </p>
                </div>
              )}
            </div>

            {/* Product Snapshot & Photo Selection Section */}
            {product && (
              <div className="border-t pt-4 space-y-3">
                <div className="bg-sage/10 border border-sage/30 rounded-lg p-4 space-y-2">
                  <div className="flex items-start gap-2">
                    <Info className="w-5 h-5 text-sage mt-0.5" />
                    <div className="flex-1">
                      <h4 className="font-semibold text-sage-dark">📦 Prodotto Prenotato</h4>
                      <p className="text-sm text-gray-700 mt-1">
                        <strong>{product.nome}</strong>
                      </p>
                      <p className="text-sm text-gray-600">
                        🎯 <strong>{product.numeroFoto} foto</strong> richieste per questo prodotto
                      </p>
                      {prePopulate?.specialTheme && (
                        <p className="text-sm text-gray-600">
                          🎨 Tema: {availableThemes.find(t => t.id === prePopulate.specialTheme)?.name || 'Standard'}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {/* Photo Selection Settings */}
            <div className="border-t pt-4 space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="selectionEnabled"
                  checked={selectionEnabled}
                  onCheckedChange={(checked) => setSelectionEnabled(checked as boolean)}
                  data-testid="checkbox-selection-enabled"
                />
                <Label htmlFor="selectionEnabled" className="font-medium cursor-pointer">
                  Abilita Selezione Foto {product && `(${product.numeroFoto} foto)`}
                </Label>
              </div>
              <p className="text-sm text-muted-foreground ml-6">
                Permetti al cliente di selezionare le foto preferite dalla galleria
              </p>
              
              {selectionEnabled && (
                <div className="ml-6 space-y-4 border-l-2 border-sage/30 pl-4">
                  <div className="space-y-2">
                    <Label htmlFor="requiredPhotoCount">Numero Foto da Selezionare *</Label>
                    <Input
                      id="requiredPhotoCount"
                      type="number"
                      min="1"
                      value={requiredPhotoCount || ''}
                      onChange={(e) => setRequiredPhotoCount(parseInt(e.target.value) || 0)}
                      placeholder="Es. 50"
                      required={selectionEnabled}
                      data-testid="input-required-photo-count"
                    />
                    <p className="text-sm text-muted-foreground">
                      {product 
                        ? `Pre-compilato da prodotto: ${product.numeroFoto} foto (puoi modificarlo)` 
                        : 'Quante foto deve selezionare il cliente?'
                      }
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="selectionDeadline">Scadenza Selezione (Opzionale)</Label>
                    <Input
                      id="selectionDeadline"
                      type="date"
                      value={selectionDeadline}
                      onChange={(e) => setSelectionDeadline(e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                      data-testid="input-selection-deadline"
                    />
                    <p className="text-sm text-muted-foreground">
                      Se impostata, il cliente riceverà email reminder 1 giorno prima e selezione bloccata dopo deadline (puoi sbloccare manualmente)
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
            >
              Annulla
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Creazione...' : 'Crea Galleria'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}