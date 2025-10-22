import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Bell, Mail, CheckCircle, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { subscribeToGallery } from '@/lib/email';

interface EmailSubscriptionBoxProps {
  galleryId: string;
  galleryName: string;
}

export default function EmailSubscriptionBox({ galleryId, galleryName }: EmailSubscriptionBoxProps) {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const { toast } = useToast();

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !email.includes('@')) {
      toast({
        title: "Email non valida",
        description: "Inserisci un indirizzo email valido",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await subscribeToGallery(galleryId, galleryName, email);

      if (result.success) {
        setIsSubscribed(true);
        setEmail('');
        
        toast({
          title: "Iscrizione confermata!",
          description: "Riceverai un'email ogni volta che verranno caricate nuove foto in questa galleria",
        });
      } else {
        throw new Error(result.error || 'Errore sconosciuto');
      }
    } catch (error) {
      console.error('Errore iscrizione email:', error);
      toast({
        title: "Errore nell'iscrizione",
        description: "Riprova più tardi o contatta il supporto",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubscribed) {
    return (
      <div className="flex items-center justify-center gap-2 p-4 rounded-lg bg-gradient-to-r from-green-50 to-sage-50 border border-green-200">
        <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
        <span className="text-sm sm:text-base text-green-800 font-medium">
          Iscrizione completata! Controlla la tua email
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sage-700">
        <Bell className="h-4 w-4 flex-shrink-0" />
        <p className="text-sm sm:text-base font-medium">
          Oppure lascia la tua email per essere avvisato quando verranno caricate nuove foto
        </p>
      </div>

      <form onSubmit={handleSubscribe} className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sage-400" />
          <Input
            type="email"
            placeholder="la-tua-email@esempio.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isSubmitting}
            className="pl-10 border-sage-300 focus:border-sage-500 focus:ring-sage-500"
            data-testid="input-email-subscription"
          />
        </div>
        <Button
          type="submit"
          disabled={isSubmitting || !email}
          variant="outline"
          className="border-sage-600 text-sage-700 hover:bg-sage-50 min-h-[40px] whitespace-nowrap"
          data-testid="button-subscribe-email"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Iscrizione...
            </>
          ) : (
            <>
              <Bell className="h-4 w-4 mr-2" />
              Ricevi Notifiche
            </>
          )}
        </Button>
      </form>

      <p className="text-xs text-sage-600">
        Nessuna registrazione richiesta. Riceverai solo email quando vengono aggiunte nuove foto.
      </p>
    </div>
  );
}
