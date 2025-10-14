import { useState } from 'react';
import { useLocation } from 'wouter';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Sparkles, Lock } from 'lucide-react';
import { Gallery } from '@shared/schema';
import { getThemeById } from '@shared/special-themes';

export default function SpecialGalleryAccess() {
  const [, setLocation] = useLocation();
  const [pin, setPin] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!pin.trim()) {
      toast.error('Inserisci un PIN');
      return;
    }

    setIsLoading(true);

    try {
      // Query galleries with this PIN
      const galleriesRef = collection(db, 'galleries');
      const q = query(
        galleriesRef,
        where('specialPin', '==', pin.trim())
      );
      
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        toast.error('PIN non valido. Riprova.');
        setPin('');
        return;
      }

      // Get first matching gallery
      const galleryDoc = snapshot.docs[0];
      const gallery = { id: galleryDoc.id, ...galleryDoc.data() } as Gallery;

      // Save PIN in sessionStorage for this gallery
      sessionStorage.setItem(`specialGallery_${gallery.id}`, pin.trim());

      // Get theme info for success message
      const theme = gallery.specialTheme ? getThemeById(gallery.specialTheme) : null;

      toast.success(`Accesso consentito${theme ? ` alla galleria ${theme.icon} ${theme.name}` : ''}!`);
      
      // Redirect to gallery
      setLocation(`/gallery/${gallery.code || gallery.id}`);
    } catch (error) {
      console.error('Errore accesso PIN:', error);
      toast.error('Errore durante l\'accesso. Riprova.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-orange-50 dark:from-gray-900 dark:via-purple-950 dark:to-gray-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold">Galleria Speciale</CardTitle>
            <CardDescription className="mt-2">
              Inserisci il PIN per accedere alla galleria tematica
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pin" className="flex items-center gap-2">
                <Lock className="w-4 h-4" />
                PIN di Accesso
              </Label>
              <Input
                id="pin"
                type="text"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="Inserisci il PIN"
                className="text-center text-lg tracking-widest font-mono"
                autoFocus
                disabled={isLoading}
                data-testid="input-special-pin"
              />
              <p className="text-sm text-muted-foreground text-center">
                Il PIN ti è stato fornito dagli organizzatori
              </p>
            </div>

            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
              disabled={isLoading}
              data-testid="button-submit-pin"
            >
              {isLoading ? 'Verifica in corso...' : 'Accedi'}
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => setLocation('/')}
              disabled={isLoading}
            >
              Torna alla Home
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
