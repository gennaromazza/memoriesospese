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
  CheckCircle,
  LogOut
} from 'lucide-react';
import GalleryAuthSystem from './GalleryAuthSystem';
import SubscriptionManager from './SubscriptionManager';
import { useState as useAuthState, useEffect } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { auth } from '@/lib/firebase';

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
  
  const { user, isAuthenticated, logout } = useGalleryAuth();

  const handleAuthSuccess = (firebaseUser: FirebaseUser) => {
    setShowAuthDialog(false);
    // Mostra il toast di benvenuto
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout error:', error);
    }
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
      {/* Auth Call-to-Action - Show different content based on auth status */}
      {!isAuthenticated ? (
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
                  Accedi o registrati per mettere like, commentare e ricevere notifiche quando vengono caricate nuove foto.
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
                  <Button 
                    onClick={() => setShowAuthDialog(true)}
                    className="bg-gradient-to-r from-sage-600 to-blue-gray-600 hover:from-sage-700 hover:to-blue-gray-700 text-white font-medium shadow-lg"
                  >
                    <Users className="h-4 w-4 mr-2" />
                    Accedi / Registrati
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>

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
      ) : (
        <Card className={`bg-gradient-to-r from-green-50 to-blue-50 border-green-200 ${className}`}>
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-gradient-to-r from-green-600 to-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                <CheckCircle className="h-6 w-6 text-white" />
              </div>
              
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="font-bold text-gray-900">Benvenuto, {user?.displayName || user?.email}!</h3>
                  <Badge variant="secondary" className="bg-green-100 text-green-800">
                    Autenticato
                  </Badge>
                </div>
                
                <p className="text-gray-700 mb-4 text-sm">
                  Ora puoi interagire completamente con la galleria. Metti like, commenta e carica le tue foto!
                </p>

                <div className="flex gap-3">
                  <Button 
                    variant="outline"
                    onClick={() => setShowSubscription(true)}
                    className="border-blue-300 text-blue-700 hover:bg-blue-50"
                  >
                    <Bell className="h-4 w-4 mr-2" />
                    Gestisci Notifiche
                  </Button>

                  <Button 
                    variant="outline"
                    onClick={handleLogout}
                    className="border-gray-300 text-gray-700 hover:bg-gray-50"
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Logout
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Auth Dialog */}
      <GalleryAuthSystem
        isOpen={showAuthDialog}
        onClose={() => setShowAuthDialog(false)}
        galleryId={galleryId}
        galleryName={galleryName}
        onAuthSuccess={handleAuthSuccess}
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