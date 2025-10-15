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
import { FloralCorner, BackgroundDecoration } from '@/components/WeddingIllustrations';
import { WeddingImage } from '@/components/WeddingImages';

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
    <div className="min-h-screen bg-off-white dark:bg-gray-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Decorazioni floreali */}
      <FloralCorner
        position="top-left"
        className="absolute top-0 left-0 w-40 h-40 opacity-15 dark:opacity-10 pointer-events-none"
      />
      <FloralCorner
        position="bottom-right"
        className="absolute bottom-0 right-0 w-40 h-40 opacity-15 dark:opacity-10 pointer-events-none"
      />
      <BackgroundDecoration className="absolute inset-0 w-full h-full opacity-10 dark:opacity-5 pointer-events-none" />

      <Card className="w-full max-w-md shadow-xl border-sage/10 dark:border-sage/20 relative z-10">
        <CardHeader className="text-center space-y-4">
          {/* Immagine decorativa */}
          <div className="mx-auto w-20 h-20 opacity-90 dark:opacity-70">
            <WeddingImage
              type="heart-balloon"
              className="w-full h-auto"
              alt="Decorazione cuore"
            />
          </div>
          <div className="mx-auto w-16 h-16 bg-gradient-to-br from-sage/80 to-dark-sage/80 dark:from-sage/60 dark:to-dark-sage/60 rounded-full flex items-center justify-center -mt-4">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold text-blue-gray dark:text-white font-playfair">
              Galleria Speciale
            </CardTitle>
            <CardDescription className="mt-2 dark:text-gray-300">
              Inserisci il PIN per accedere alla galleria tematica
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pin" className="flex items-center gap-2 text-blue-gray dark:text-gray-200">
                <Lock className="w-4 h-4" />
                PIN di Accesso
              </Label>
              <Input
                id="pin"
                type="text"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="Inserisci il PIN"
                className="text-center text-lg tracking-widest font-mono border-sage/30 dark:border-sage/40 focus:border-sage dark:focus:border-sage"
                autoFocus
                disabled={isLoading}
                data-testid="input-special-pin"
              />
              <p className="text-sm text-muted-foreground dark:text-gray-400 text-center">
                Il PIN ti è stato fornito dagli organizzatori
              </p>
            </div>

            <Button
              type="submit"
              className="w-full bg-sage hover:bg-dark-sage dark:bg-sage/90 dark:hover:bg-dark-sage/90 text-white shadow-md"
              disabled={isLoading}
              data-testid="button-submit-pin"
            >
              {isLoading ? 'Verifica in corso...' : 'Accedi'}
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="w-full hover:bg-cream dark:hover:bg-gray-800"
              onClick={() => setLocation('/')}
              disabled={isLoading}
              data-testid="button-home"
            >
              Torna alla Home
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
