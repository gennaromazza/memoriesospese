import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { 
  Camera, 
  User, 
  Sparkles, 
  Heart, 
  MessageCircle, 
  Mic2,
  X,
  Upload,
  CheckCircle
} from 'lucide-react';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';
import ProfileImageUpload from './ProfileImageUpload';

interface ProfileImageWelcomeProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

export default function ProfileImageWelcome({
  isOpen,
  onOpenChange,
  onComplete
}: ProfileImageWelcomeProps) {
  const { user, userProfile } = useFirebaseAuth();
  const [showUpload, setShowUpload] = useState(false);
  const [uploadComplete, setUploadComplete] = useState(false);

  const handleUploadComplete = () => {
    setUploadComplete(true);
    setTimeout(() => {
      onComplete();
      onOpenChange(false);
    }, 1500);
  };

  const handleSkip = () => {
    onComplete();
    onOpenChange(false);
  };

  if (!user) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" aria-describedby="profile-welcome-description">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="h-6 w-6 text-yellow-500" />
            Benvenuto/a {userProfile?.displayName || user.displayName || 'Utente'}!
          </DialogTitle>
          <DialogDescription id="profile-welcome-description">
            Personalizza il tuo profilo per un'esperienza più coinvolgente
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {!showUpload && !uploadComplete ? (
            <>
              {/* Introduzione */}
              <div className="text-center space-y-4">
                <div className="w-20 h-20 bg-gradient-to-r from-sage-500 to-blue-gray-500 rounded-full flex items-center justify-center mx-auto">
                  <User className="h-10 w-10 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Aggiungi la tua foto profilo
                  </h3>
                  <p className="text-sm text-gray-600">
                    La tua immagine profilo verrà mostrata quando interagisci con le gallerie
                  </p>
                </div>
              </div>

              {/* Vantaggi */}
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                  <MessageCircle className="h-5 w-5 text-blue-600" />
                  <div>
                    <p className="text-sm font-medium text-blue-900">Commenti personalizzati</p>
                    <p className="text-xs text-blue-700">I tuoi commenti avranno la tua foto</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-lg">
                  <Mic2 className="h-5 w-5 text-purple-600" />
                  <div>
                    <p className="text-sm font-medium text-purple-900">Voice memos riconoscibili</p>
                    <p className="text-xs text-purple-700">I tuoi messaggi audio saranno identificabili</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
                  <Heart className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="text-sm font-medium text-green-900">Esperienza più sociale</p>
                    <p className="text-xs text-green-700">Rendi le interazioni più personali</p>
                  </div>
                </div>
              </div>

              {/* Pulsanti azione */}
              <div className="flex flex-col gap-3">
                <Button
                  onClick={() => setShowUpload(true)}
                  className="w-full bg-gradient-to-r from-sage-600 to-blue-gray-600 hover:from-sage-700 hover:to-blue-gray-700"
                  size="lg"
                >
                  <Camera className="h-5 w-5 mr-2" />
                  Aggiungi foto profilo
                </Button>

                <Button
                  onClick={handleSkip}
                  variant="outline"
                  className="w-full"
                  size="lg"
                >
                  Salta per ora
                </Button>
              </div>

              {/* Nota privacy */}
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-xs text-gray-600 text-center">
                  <span className="font-medium">Privacy:</span> La tua immagine profilo sarà visibile solo agli utenti che accedono alle stesse gallerie
                </p>
              </div>
            </>
          ) : showUpload && !uploadComplete ? (
            <>
              {/* Header upload */}
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">
                  Carica la tua foto
                </h3>
                <Button
                  onClick={() => setShowUpload(false)}
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Upload component */}
              <ProfileImageUpload
                onUploadComplete={handleUploadComplete}
                compact={true}
              />

              {/* Suggerimenti */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-gray-900">Suggerimenti per una foto perfetta:</h4>
                <ul className="text-xs text-gray-600 space-y-1">
                  <li>• Usa una foto recente e ben illuminata</li>
                  <li>• Evita foto di gruppo o con altre persone</li>
                  <li>• Preferisci foto dove il viso è ben visibile</li>
                  <li>• Formato consigliato: quadrato (1:1)</li>
                </ul>
              </div>
            </>
          ) : (
            <>
              {/* Completamento */}
              <div className="text-center space-y-4">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle className="h-10 w-10 text-green-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-green-900 mb-2">
                    Perfetto! 🎉
                  </h3>
                  <p className="text-sm text-green-700">
                    La tua foto profilo è stata caricata con successo
                  </p>
                </div>
              </div>

              {/* Badge completamento */}
              <div className="flex justify-center">
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                  <Sparkles className="h-3 w-3 mr-1" />
                  Profilo completato
                </Badge>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}