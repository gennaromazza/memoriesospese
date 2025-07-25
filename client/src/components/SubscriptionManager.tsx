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

function SubscriptionManager({ galleryId, galleryName }: SubscriptionManagerProps) {
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
        if (result.alreadySubscribed) {
          toast({
            title: "ℹ️ Già iscritto",
            description: `${email} è già iscritto alle notifiche di "${galleryName}"`,
            variant: "default"
          });
        } else {
          toast({
            title: "✅ Iscrizione completata!",
            description: `Riceverai notifiche quando verranno aggiunte nuove foto a "${galleryName}"`,
          });
        }
        setEmail('');
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      toast({
        title: "❌ Errore iscrizione",
        description: error instanceof Error ? error.message : "Non è stato possibile completare l'iscrizione",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestEmail = async () => {
    setIsLoading(true);
    try {
      const result = await testEmailSystem();
      
      if (result && typeof result === 'object' && 'developmentMode' in result && result.developmentMode) {
        toast({
          title: "ℹ️ Ambiente di sviluppo",
          description: "Firebase Functions non disponibili. In produzione il sistema email funziona correttamente.",
          variant: "default"
        });
      } else {
        toast({
          title: "✅ Test email inviato!",
          description: "Controlla la tua casella email",
        });
      }
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
      <div className="bg-gradient-to-r from-sage-100 to-blue-gray-100 border border-sage-300 rounded-md p-3 flex items-center gap-3 shadow-sm">
        <CheckCircle className="w-4 h-4 text-sage-600 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-sage-800">Notifiche attive</p>
          <p className="text-xs text-sage-600">Email per nuove foto</p>
        </div>
        <Button 
          type="button" 
          variant="ghost"
          size="sm"
          onClick={handleTestEmail}
          disabled={isLoading}
          title="Test configurazione email"
          className="text-sage-600 hover:text-sage-800 hover:bg-sage-200 w-8 h-8 p-0"
        >
          🧪
        </Button>
      </div>
    );
  }

  return (
    <div className="border border-sage-200 rounded-md p-3 bg-gradient-to-r from-sage-50 to-blue-gray-50">
      <div className="flex items-center gap-2 mb-2">
        <Bell className="w-4 h-4 text-sage-600" />
        <h3 className="text-sm font-medium text-sage-900">Notifiche Email</h3>
      </div>
      
      <form onSubmit={handleSubscribe} className="space-y-2">
        <div className="flex gap-2">
          <Input
            type="email"
            placeholder="La tua email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isLoading}
            required
            className="flex-1 text-sm h-8 border-sage-200 focus:border-sage-400 focus:ring-sage-200"
          />
          <Button 
            type="submit" 
            disabled={isLoading}
            className="bg-gradient-to-r from-sage-600 to-blue-gray-600 hover:from-sage-700 hover:to-blue-gray-700 text-white h-8 w-8 p-0 shadow-lg"
          >
            {isLoading ? (
              <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <Mail className="w-3 h-3" />
            )}
          </Button>
          <Button 
            type="button" 
            variant="outline"
            onClick={handleTestEmail}
            disabled={isLoading}
            title="Test configurazione email"
            className="h-8 w-8 p-0 border-sage-300 hover:bg-sage-100 hover:border-sage-400"
          >
            🧪
          </Button>
        </div>
        
        <p className="text-xs text-sage-600">
          Notifiche per nuove foto
        </p>
      </form>
    </div>
  );
}

export { SubscriptionManager };
export default SubscriptionManager;