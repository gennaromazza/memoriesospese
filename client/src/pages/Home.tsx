import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Camera, Heart, Users, Music } from 'lucide-react';

export default function Home() {
  const [galleryCode, setGalleryCode] = useState('');

  const handleAccessGallery = () => {
    if (galleryCode.trim()) {
      window.location.href = `/gallery/${galleryCode.trim()}`;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100 mb-4">
            Benvenuto in Wedding Gallery
          </h1>
          <p className="text-xl text-slate-600 dark:text-slate-300 max-w-2xl mx-auto">
            Condividi i momenti più belli del tuo matrimonio con familiari e amici
          </p>
        </div>

        {/* Access Gallery Card */}
        <Card className="max-w-md mx-auto mb-12">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5" />
              Accedi alla Galleria
            </CardTitle>
            <CardDescription>
              Inserisci il codice della galleria per visualizzare le foto
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="gallery-code">Codice Galleria</Label>
              <Input
                id="gallery-code"
                placeholder="es. MATRIMONIO2024"
                value={galleryCode}
                onChange={(e) => setGalleryCode(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAccessGallery()}
              />
            </div>
            <Button 
              onClick={handleAccessGallery}
              className="w-full"
              disabled={!galleryCode.trim()}
            >
              Accedi alla Galleria
            </Button>
          </CardContent>
        </Card>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Heart className="h-5 w-5 text-red-500" />
                Condividi Momenti
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-600 dark:text-slate-300">
                Carica e condividi le tue foto preferite del matrimonio
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-500" />
                Interagisci
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-600 dark:text-slate-300">
                Metti like e commenta le foto più belle
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Music className="h-5 w-5 text-green-500" />
                Messaggi Vocali
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-600 dark:text-slate-300">
                Lascia messaggi vocali per gli sposi
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Admin Link */}
        <div className="text-center">
          <Button variant="outline" onClick={() => window.location.href = '/admin'}>
            Accesso Amministratore
          </Button>
        </div>
      </div>
    </div>
  );
}