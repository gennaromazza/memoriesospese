
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import UnifiedAuthDialog from '@/components/auth/UnifiedAuthDialog';
import { 
  Heart, 
  MessageCircle, 
  Mic, 
  Upload, 
  Star, 
  Shield,
  UserPlus,
  CheckCircle
} from 'lucide-react';

interface RegistrationCTAProps {
  galleryId: string;
  onAuthComplete: () => void;
  className?: string;
}

export default function RegistrationCTA({ 
  galleryId, 
  onAuthComplete, 
  className = "" 
}: RegistrationCTAProps) {
  const [showAuthDialog, setShowAuthDialog] = useState(false);

  const benefits = [
    {
      icon: <Heart className="h-5 w-5 text-red-500" />,
      title: "Metti Like alle Foto",
      description: "Esprimi il tuo apprezzamento per le foto più belle"
    },
    {
      icon: <MessageCircle className="h-5 w-5 text-blue-500" />,
      title: "Commenta e Condividi",
      description: "Lascia messaggi speciali e ricordi indimenticabili"
    },
    {
      icon: <Mic className="h-5 w-5 text-purple-500" />,
      title: "Vocali Segreti",
      description: "Registra messaggi audio per gli sposi"
    },
    {
      icon: <Upload className="h-5 w-5 text-green-500" />,
      title: "Carica le tue Foto",
      description: "Aggiungi le tue foto migliori alla galleria"
    },
    {
      icon: <Star className="h-5 w-5 text-yellow-500" />,
      title: "Esperienza Personalizzata",
      description: "Tutto salvato con il tuo nome per sempre"
    },
    {
      icon: <Shield className="h-5 w-5 text-sage-600" />,
      title: "Privacy Garantita",
      description: "I tuoi dati sono al sicuro e non condivisi"
    }
  ];

  return (
    <>
      <Card className={`border-gradient-to-r from-sage-200 to-blue-gray-200 shadow-lg ${className}`}>
        <CardHeader className="text-center pb-4">
          <div className="mx-auto w-16 h-16 bg-gradient-to-r from-sage-600 to-blue-gray-600 rounded-full flex items-center justify-center mb-4">
            <UserPlus className="h-8 w-8 text-white" />
          </div>
          <CardTitle className="text-2xl font-bold text-blue-gray-900 mb-2">
            Unisciti alla Galleria
          </CardTitle>
          <CardDescription className="text-sage-700 text-lg">
            Registrati gratuitamente per sbloccare tutte le funzionalità e vivere appieno questa esperienza speciale
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {benefits.map((benefit, index) => (
              <div key={index} className="flex items-start gap-3 p-3 rounded-lg bg-gradient-to-r from-sage-50 to-blue-gray-50 border border-sage-200">
                <div className="flex-shrink-0 mt-0.5">
                  {benefit.icon}
                </div>
                <div>
                  <h4 className="font-semibold text-blue-gray-900 text-sm mb-1">
                    {benefit.title}
                  </h4>
                  <p className="text-xs text-sage-700">
                    {benefit.description}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-gradient-to-r from-sage-100 to-blue-gray-100 p-4 rounded-lg border border-sage-300">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="h-5 w-5 text-sage-600" />
              <span className="font-semibold text-sage-800">Registrazione Veloce</span>
            </div>
            <ul className="text-sm text-sage-700 space-y-1 ml-7">
              <li>• Solo email e nome richiesti</li>
              <li>• Nessuna verifica complicata</li>
              <li>• Accesso immediato a tutte le funzioni</li>
              <li>• I tuoi dati rimangono privati e sicuri</li>
            </ul>
          </div>

          <div className="text-center space-y-3">
            <Button
              onClick={() => setShowAuthDialog(true)}
              size="lg"
              className="w-full bg-gradient-to-r from-sage-600 to-blue-gray-600 hover:from-sage-700 hover:to-blue-gray-700 text-white font-semibold py-3 shadow-lg hover:shadow-xl transition-all duration-300"
            >
              <UserPlus className="h-5 w-5 mr-2" />
              Registrati Ora - È Gratis!
            </Button>
            
            <p className="text-xs text-sage-600">
              Hai già un account?{' '}
              <button 
                onClick={() => setShowAuthDialog(true)}
                className="text-sage-700 hover:text-sage-800 font-medium underline"
              >
                Accedi qui
              </button>
            </p>
          </div>
        </CardContent>
      </Card>

      <UnifiedAuthDialog
        isOpen={showAuthDialog}
        onOpenChange={setShowAuthDialog}
        galleryId={galleryId}
        onAuthComplete={() => {
          onAuthComplete();
          setShowAuthDialog(false);
        }}
        defaultTab="register"
      />
    </>
  );
}
