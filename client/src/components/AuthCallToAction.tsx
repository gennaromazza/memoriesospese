import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { 
  Heart, 
  MessageCircle, 
  Mic2, 
  Bell, 
  Users, 
  Sparkles,
  ArrowRight,
  CheckCircle
} from 'lucide-react';
import UserAuthDialog from './UserAuthDialog';
import SubscriptionManager from './SubscriptionManager';

interface AuthCallToActionProps {
  galleryId: string;
  galleryName: string;
  className?: string;
}

export default function AuthCallToAction({ 
  galleryId, 
  galleryName, 
  className = '' 
}: AuthCallToActionProps) {
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [showSubscription, setShowSubscription] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);

  const handleAuthComplete = (email: string, name: string) => {
    setIsRegistered(true);
    setShowSubscription(true);
  };

  const features = [
    {
      icon: Heart,
      title: "Metti Like",
      description: "Esprimi il tuo apprezzamento per foto e vocali",
      color: "text-red-500"
    },
    {
      icon: MessageCircle,
      title: "Commenta",
      description: "Condividi i tuoi pensieri e ricordi",
      color: "text-blue-500"
    },
    {
      icon: Mic2,
      title: "Vocali Segreti",
      description: "Registra messaggi speciali per gli sposi",
      color: "text-purple-500"
    },
    {
      icon: Bell,
      title: "Notifiche",
      description: "Ricevi aggiornamenti quando vengono caricate nuove foto",
      color: "text-green-500"
    }
  ];

  return (
    <>
      {/* Floating Call-to-Action */}
      <Card className={`bg-gradient-to-r from-sage-50 to-blue-gray-50 border-sage-200 ${className}`}>
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-gradient-to-r from-sage-600 to-blue-gray-600 rounded-full flex items-center justify-center flex-shrink-0">
              <Users className="h-6 w-6 text-white" />
            </div>
            
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="font-bold text-blue-gray-900">Partecipa alla galleria!</h3>
                <Badge variant="secondary" className="bg-sage-100 text-sage-700">
                  <Sparkles className="h-3 w-3 mr-1" />
                  Gratuito
                </Badge>
              </div>
              
              <p className="text-gray-700 mb-4 text-sm">
                Registrati gratuitamente per mettere like, commentare e ricevere notifiche quando vengono caricate nuove foto.
              </p>

              <div className="grid grid-cols-2 gap-3 mb-4">
                {features.slice(0, 4).map((feature, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <feature.icon className={`h-4 w-4 ${feature.color}`} />
                    <span className="text-xs text-gray-600">{feature.title}</span>
                  </div>
                ))}
              </div>

              <div className="flex gap-3">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button className="bg-gradient-to-r from-sage-600 to-blue-gray-600 hover:from-sage-700 hover:to-blue-gray-700 text-white font-medium shadow-lg">
                      <Users className="h-4 w-4 mr-2" />
                      Registrati Gratis
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </DialogTrigger>
                  
                  <DialogContent className="sm:max-w-2xl">
                    <DialogHeader className="text-center pb-4">
                      <div className="mx-auto w-16 h-16 bg-gradient-to-r from-sage-600 to-blue-gray-600 rounded-full flex items-center justify-center mb-4">
                        <Sparkles className="h-8 w-8 text-white" />
                      </div>
                      <DialogTitle className="text-2xl font-bold text-blue-gray-900">
                        Unisciti alla galleria di {galleryName}
                      </DialogTitle>
                      <DialogDescription className="text-sage-700 mt-2">
                        Registrazione gratuita - Interagisci con foto e vocali, ricevi notifiche
                      </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-6">
                      {/* Features Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {features.map((feature, index) => (
                          <div key={index} className="bg-white p-4 rounded-lg border border-gray-200">
                            <div className="flex items-start gap-3">
                              <div className={`w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center`}>
                                <feature.icon className={`h-4 w-4 ${feature.color}`} />
                              </div>
                              <div>
                                <h4 className="font-medium text-gray-900">{feature.title}</h4>
                                <p className="text-sm text-gray-600 mt-1">{feature.description}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Benefits */}
                      <div className="bg-sage-50 p-4 rounded-lg border border-sage-200">
                        <h4 className="font-medium text-sage-900 mb-3 flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-sage-600" />
                          Cosa ottieni gratuitamente:
                        </h4>
                        <ul className="space-y-2 text-sm text-sage-800">
                          <li className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 bg-sage-600 rounded-full"></div>
                            Interazione completa con la galleria (like e commenti)
                          </li>
                          <li className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 bg-sage-600 rounded-full"></div>
                            Possibilità di registrare vocali segreti per gli sposi
                          </li>
                          <li className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 bg-sage-600 rounded-full"></div>
                            Notifiche email quando vengono caricate nuove foto
                          </li>
                          <li className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 bg-sage-600 rounded-full"></div>
                            Nessun costo o abbonamento richiesto
                          </li>
                        </ul>
                      </div>

                      {/* Action Button */}
                      <div className="text-center">
                        <Button
                          onClick={() => setShowAuthDialog(true)}
                          size="lg"
                          className="bg-gradient-to-r from-sage-600 to-blue-gray-600 hover:from-sage-700 hover:to-blue-gray-700 text-white font-medium px-8 py-3 shadow-lg"
                        >
                          <Users className="h-5 w-5 mr-2" />
                          Inizia Ora - È Gratis!
                        </Button>
                        <p className="text-xs text-gray-500 mt-2">
                          Registrazione veloce - Solo nome ed email richiesti
                        </p>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>

                <Button 
                  variant="outline" 
                  onClick={() => setShowSubscription(true)}
                  className="border-sage-300 text-sage-700 hover:bg-sage-50"
                >
                  <Bell className="h-4 w-4 mr-2" />
                  Solo Notifiche
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Auth Dialog */}
      <UserAuthDialog
        isOpen={showAuthDialog}
        onOpenChange={setShowAuthDialog}
        galleryId={galleryId}
        onAuthComplete={handleAuthComplete}
      />

      {/* Subscription Dialog */}
      <Dialog open={showSubscription} onOpenChange={setShowSubscription}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-sage-600" />
              Notifiche Email
            </DialogTitle>
            <DialogDescription>
              Ricevi un'email quando vengono caricate nuove foto nella galleria
            </DialogDescription>
          </DialogHeader>
          
          <SubscriptionManager 
            galleryId={galleryId}
            galleryName={galleryName}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}