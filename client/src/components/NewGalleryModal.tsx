import React, { useState } from 'react';
import { nanoid } from 'nanoid';
import { collection, addDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';

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
  const [isLoading, setIsLoading] = useState(false);

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
      await addDoc(collection(db, 'galleries'), {
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
      });

      toast.success('Galleria creata con successo!');
      
      // Reset form
      setName('');
      setDate('');
      setLocation('');
      setDescription('');
      setPassword('');
      
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
            <DialogTitle>Crea Nuova Galleria</DialogTitle>
            <DialogDescription>
              Inserisci i dettagli per creare una nuova galleria di matrimonio
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome Galleria *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="es. Marco e Giulia"
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="date">Data Matrimonio</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
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
                placeholder="Una breve descrizione del matrimonio..."
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