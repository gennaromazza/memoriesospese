import React, { useState } from 'react';
import { nanoid } from 'nanoid';
import { collection, addDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';
import { getAllThemes } from '@shared/special-themes';

interface NewGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGalleryCreated?: () => void;
}

export default function NewGalleryModal({ isOpen, onClose, onGalleryCreated }: NewGalleryModalProps) {
  const { user } = useFirebaseAuth();
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [password, setPassword] = useState('');
  const [specialTheme, setSpecialTheme] = useState<string>('none');
  const [specialPin, setSpecialPin] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const availableThemes = getAllThemes();

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
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      // Add special theme fields if theme is selected
      if (specialTheme !== 'none') {
        galleryData.specialTheme = specialTheme;
        galleryData.specialPin = specialPin.trim();
      }

      await addDoc(collection(db, 'galleries'), galleryData);

      toast.success('Galleria creata con successo!');

      // Reset form
      setName('');
      setDate('');
      setLocation('');
      setDescription('');
      setPassword('');
      setSpecialTheme('none');
      setSpecialPin('');

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