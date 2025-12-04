import { useState } from 'react';
import { useLocation } from 'wouter';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Sparkles, Lock, Eye, EyeOff } from 'lucide-react';
import { Gallery } from '@shared/schema';
import { getThemeById } from '@shared/special-themes';
import { FloralCorner, BackgroundDecoration } from '@/components/WeddingIllustrations';
import { WeddingImage } from '@/components/WeddingImages';

export default function SpecialGalleryAccess() {
  const [, setLocation] = useLocation();
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); // Reset errore

    if (!pin.trim()) {
      setError('Inserisci un PIN');
      toast.error('Inserisci un PIN');
      return;
    }

    setIsLoading(true);

    try {
      // Verifica PIN SERVER-SIDE (sicuro!)
      const response = await fetch('/api/email/verify-special-pin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pin: pin.trim()
        }),
      });

      // Verifica che la risposta sia JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.error('Errore: risposta non JSON. Content-Type:', contentType);
        console.error('Status:', response.status, response.statusText);
        toast.error('Errore del server. Riprova tra poco o contatta l\'amministratore.');
        return;
      }

      const data = await response.json();

      if (!response.ok || !data.result?.valid) {
        setError('PIN non valido. Riprova.');
        toast.error('PIN non valido. Riprova.');
        setPin('');
        return;
      }

      // PIN valido - recupera i dati della galleria
      const { galleryId, galleryCode, galleryName } = data.result;

      // Save auth in localStorage (come le password normali)
      localStorage.setItem(`gallery_auth_${galleryCode || galleryId}`, 'true');

      // Get theme info dalla galleria
      const galleriesRef = collection(db, 'galleries');
      const q = query(galleriesRef, where('code', '==', galleryCode));
      const snapshot = await getDocs(q);
      
      let themeName = '';
      if (!snapshot.empty) {
        const galleryData = snapshot.docs[0].data();
        const theme = galleryData.specialTheme ? getThemeById(galleryData.specialTheme) : null;
        themeName = theme ? ` ${theme.icon} ${theme.name}` : '';
      }

      toast.success(`Accesso consentito${themeName ? ` alla galleria${themeName}` : ''}!`);
      
      // Redirect to gallery view
      setLocation(`/view/${galleryCode || galleryId}`);
    } catch (error) {
      console.error('Errore accesso PIN:', error);
      setError('Errore durante l\'accesso. Riprova.');
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
              <div className="relative">
                <Input
                  id="pin"
                  type={showPin ? "text" : "password"}
                  value={pin}
                  onChange={(e) => {
                    setPin(e.target.value);
                    setError(''); // Reset errore quando l'utente digita
                  }}
                  placeholder="Inserisci il PIN"
                  className={`text-center text-lg tracking-widest font-mono pr-10 transition-all ${
                    error 
                      ? 'border-red-500 dark:border-red-400 focus:border-red-500 dark:focus:border-red-400 animate-shake' 
                      : 'border-sage/30 dark:border-sage/40 focus:border-sage dark:focus:border-sage'
                  }`}
                  autoFocus
                  disabled={isLoading}
                  data-testid="input-special-pin"
                />
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-gray/60 hover:text-blue-gray dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                  data-testid="button-toggle-pin-visibility"
                >
                  {showPin ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              {error && (
                <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3 animate-in fade-in slide-in-from-top-2 duration-300" data-testid="error-message">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <span className="font-medium">{error}</span>
                </div>
              )}
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
