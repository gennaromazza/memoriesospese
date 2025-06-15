import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Bell, BellOff, Mail } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

interface SubscriptionManagerProps {
  galleryId: string;
  galleryName: string;
}

export default function SubscriptionManager({ galleryId, galleryName }: SubscriptionManagerProps) {
  const [email, setEmail] = useState('');
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();

  const handleSubscribe = async () => {
    if (!email || !email.includes('@')) {
      toast({
        title: "Email non valida",
        description: "Inserisci un indirizzo email valido",
        variant: "destructive",
      });
      return;
    }

    setIsSubscribing(true);
    
    try {
      const response = await fetch(`/api/galleries/${galleryId}/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.ok) {
        toast({
          title: "Iscrizione completata!",
          description: `Riceverai notifiche quando verranno aggiunte nuove foto a "${galleryName}"`,
        });
        setEmail('');
        setIsDialogOpen(false);
      } else {
        toast({
          title: "Errore nell'iscrizione",
          description: data.error || "Si è verificato un errore",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Errore di connessione",
        description: "Verifica la tua connessione internet e riprova",
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-sage-600" />
            Iscriviti agli aggiornamenti
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Ricevi una notifica via email ogni volta che vengono aggiunte nuove foto alla galleria 
            <strong className="text-gray-800"> "{galleryName}"</strong>.
          </p>
          
          <div className="space-y-3">
            <Input
              type="email"
              placeholder="Il tuo indirizzo email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full"
            />
            
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