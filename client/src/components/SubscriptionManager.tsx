import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Bell, BellOff, Mail, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { db } from '@/lib/firebase';
import { collection, addDoc, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { createWelcomeEmailTemplate } from '@/lib/emailTemplates';

interface SubscriptionManagerProps {
  galleryId: string;
  galleryName: string;
}

export default function SubscriptionManager({ galleryId, galleryName }: SubscriptionManagerProps) {
  const [email, setEmail] = useState('');
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isAlreadySubscribed, setIsAlreadySubscribed] = useState(false);
  const { toast } = useToast();

  const checkIfSubscribed = async (emailToCheck: string) => {
    if (!emailToCheck || !emailToCheck.includes('@')) return false;
    
    try {
      const subscriptionsRef = collection(db, 'subscriptions');
      const q = query(
        subscriptionsRef, 
        where('galleryId', '==', galleryId),
        where('email', '==', emailToCheck.toLowerCase())
      );
      const querySnapshot = await getDocs(q);
      return !querySnapshot.empty;
    } catch (error) {
      console.error('Errore nel controllo iscrizione:', error);
      return false;
    }
  };

  const handleEmailChange = async (newEmail: string) => {
    setEmail(newEmail);
    if (newEmail && newEmail.includes('@')) {
      const isSubscribed = await checkIfSubscribed(newEmail);
      setIsAlreadySubscribed(isSubscribed);
    } else {
      setIsAlreadySubscribed(false);
    }
  };

  const handleSubscribe = async () => {
    if (!email || !email.includes('@')) {
      toast({
        title: "Email non valida",
        description: "Inserisci un indirizzo email valido",
        variant: "destructive",
      });
      return;
    }

    if (isAlreadySubscribed) {
      toast({
        title: "Email già iscritta",
        description: `L'email ${email} è già iscritta per ricevere notifiche da questa galleria`,
        variant: "destructive",
      });
      return;
    }

    setIsSubscribing(true);
    
    try {
      // Controlla nuovamente prima di procedere
      const alreadyExists = await checkIfSubscribed(email);
      if (alreadyExists) {
        toast({
          title: "Email già iscritta",
          description: "Questa email è già registrata per le notifiche di questa galleria",
          variant: "destructive",
        });
        setIsAlreadySubscribed(true);
        return;
      }

      // Salva l'iscrizione direttamente in Firestore
      await addDoc(collection(db, 'subscriptions'), {
        galleryId: galleryId,
        galleryName: galleryName,
        email: email.toLowerCase(),
        createdAt: serverTimestamp(),
        active: true
      });

      // Invia email di benvenuto
      try {
        const response = await fetch('/api/send-welcome-email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: email.toLowerCase(),
            galleryName: galleryName
          }),
        });

        if (!response.ok) {
          console.warn('Email di benvenuto non inviata:', await response.text());
        }
      } catch (emailError) {
        console.warn('Errore nell\'invio email di benvenuto:', emailError);
        // Non bloccare l'iscrizione per errori email
      }

      toast({
        title: "Iscrizione completata!",
        description: `Riceverai notifiche quando verranno aggiunte nuove foto a "${galleryName}". Controlla la tua email per la conferma.`,
      });
      
      setEmail('');
      setIsDialogOpen(false);
      setIsAlreadySubscribed(false);
      
    } catch (error) {
      console.error('Errore nell\'iscrizione:', error);
      toast({
        title: "Errore nell'iscrizione",
        description: "Si è verificato un errore durante l'iscrizione. Riprova più tardi.",
        variant: "destructive",
      });
    } finally {
      setIsSubscribing(false);
    }
  };

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="outline" 
          size="sm"
          className="bg-sage-50 hover:bg-sage-100 text-sage-700 border-sage-200"
        >
          <Bell className="h-4 w-4 mr-2" />
          Ricevi notifiche
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md" aria-describedby="subscription-dialog-description">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-sage-600" />
            Iscriviti agli aggiornamenti
          </DialogTitle>
          <DialogDescription id="subscription-dialog-description">
            Ricevi notifiche via email quando vengono aggiunte nuove foto alla galleria
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Ricevi una notifica via email ogni volta che vengono aggiunte nuove foto alla galleria 
            <strong className="text-gray-800"> "{galleryName}"</strong>.
          </p>
          
          <div className="space-y-3">
            <div className="space-y-2">
              <Input
                type="email"
                placeholder="Il tuo indirizzo email"
                value={email}
                onChange={(e) => handleEmailChange(e.target.value)}
                className={`w-full ${isAlreadySubscribed ? 'border-amber-300 bg-amber-50' : ''}`}
              />
              {isAlreadySubscribed && (
                <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 p-2 rounded-md border border-amber-200">
                  <Check className="h-4 w-4" />
                  <span>Questa email è già iscritta alle notifiche di questa galleria</span>
                </div>
              )}
            </div>
            
            <div className="flex gap-2">
              <Button 
                onClick={handleSubscribe}
                disabled={isSubscribing || !email}
                className="flex-1"
              >
                {isSubscribing ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Iscrizione...
                  </>
                ) : (
                  <>
                    <Bell className="h-4 w-4 mr-2" />
                    Iscriviti
                  </>
                )}
              </Button>
              
              <Button 
                variant="outline" 
                onClick={() => setIsDialogOpen(false)}
                disabled={isSubscribing}
              >
                Annulla
              </Button>
            </div>
          </div>

          <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded-lg">
            <p><strong>Privacy:</strong> Il tuo indirizzo email verrà utilizzato solo per inviarti notifiche di aggiornamento di questa galleria. Non condivideremo mai i tuoi dati con terze parti.</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}