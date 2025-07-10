import React, { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Mail, Bell, CheckCircle } from 'lucide-react';
import { subscribeToGallery, testEmailSystem } from '../lib/email';
import { useToast } from '../hooks/use-toast';

interface SubscriptionManagerProps {
  galleryId: string;
  galleryName: string;
}

export function SubscriptionManager({ galleryId, galleryName }: SubscriptionManagerProps) {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const { toast } = useToast();

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !email.includes('@')) {
      toast({
        title: "❌ Email non valida",
        description: "Inserisci un indirizzo email valido",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);

    try {
      const result = await subscribeToGallery(galleryId, galleryName, email);

      if (result.success) {
        setIsSubscribed(true);
        toast({
          title: "✅ Iscrizione completata!",
          description: `Riceverai notifiche quando verranno aggiunte nuove foto a "${galleryName}"`,
        });
        setEmail('');
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      toast({
        title: "❌ Errore iscrizione",
        description: error.message || "Non è stato possibile completare l'iscrizione",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestEmail = async () => {
    setIsLoading(true);
    try {
      await testEmailSystem();
      toast({
        title: "✅ Test email inviato!",
        description: "Controlla la tua casella email",
      });
    } catch (error) {
      toast({
        title: "❌ Errore test email",
        description: "Impossibile inviare email di test",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isSubscribed) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-2" />
          <CardTitle className="text-green-700">Iscrizione Completata!</CardTitle>
          <CardDescription>
            Riceverai notifiche email quando verranno aggiunte nuove foto
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="w-5 h-5" />
          Notifiche Email
        </CardTitle>
        <CardDescription>
          Iscriviti per ricevere una notifica quando vengono aggiunte nuove foto a "{galleryName}"
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubscribe} className="space-y-4">
          <div className="space-y-2">
            <Input
              type="email"
              placeholder="Inserisci la tua email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              required
            />
          </div>

          <div className="flex gap-2">
            <Button 
              type="submit" 
              className="flex-1"
              disabled={isLoading}
            >
              <Mail className="w-4 h-4 mr-2" />
              {isLoading ? 'Iscrizione...' : 'Iscriviti alle Notifiche'}
            </Button>

            <Button 
              type="button" 
              variant="outline"
              onClick={handleTestEmail}
              disabled={isLoading}
              title="Test configurazione email"
            >
              🧪
            </Button>
          </div>
        </form>

        <p className="text-xs text-gray-500 mt-4 text-center">
          📧 Powered by Brevo SMTP • Firebase Functions
        </p>
      </CardContent>
    </Card>
  );
}