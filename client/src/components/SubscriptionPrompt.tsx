import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Mail, Bell, X } from "lucide-react";
import { subscribeToGallery } from "@/lib/email";
import { useToast } from "@/hooks/use-toast";

interface SubscriptionPromptProps {
  galleryId: string;
  galleryName: string;
  onDismiss?: () => void;
}

export function SubscriptionPrompt({
  galleryId,
  galleryName,
  onDismiss,
}: SubscriptionPromptProps) {
  const [email, setEmail] = useState("");
  const [isSubscribing, setIsSubscribing] = useState(false);
  const { toast } = useToast();

  const handleSubscribe = async () => {
    if (!email || !email.includes("@")) {
      toast({
        title: "Email non valida",
        description: "Inserisci un indirizzo email valido",
        variant: "destructive",
      });
      return;
    }

    setIsSubscribing(true);

    try {
      const result = await subscribeToGallery(galleryId, galleryName, email);

      if (result.success) {
        if (result.alreadySubscribed) {
          toast({
            title: "Già iscritto",
            description: "Sei già iscritto alle notifiche di questa galleria",
          });
        } else {
          toast({
            title: "Iscrizione completata! 🎉",
            description: "Riceverai una email quando verranno aggiunte nuove foto",
          });
        }

        setEmail("");
        if (onDismiss) onDismiss();
      } else {
        throw new Error(result.error || "Errore durante l'iscrizione");
      }
    } catch (error: any) {
      console.error("Errore iscrizione:", error);
      toast({
        title: "Errore",
        description: "Si è verificato un errore. Riprova più tardi.",
        variant: "destructive",
      });
    } finally {
      setIsSubscribing(false);
    }
  };

  return (
    <div
      className="relative z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border border-sage/40 rounded-xl p-5 shadow-2xl animate-fade-in"
      style={{ isolation: 'isolate' }}
    >
      <div className="space-y-2 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-sage animate-pulse" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Resta Aggiornato!</h3>
          </div>
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              aria-label="Chiudi"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Ricevi una notifica quando vengono caricate nuove foto in questa galleria
        </p>
      </div>
      <div className="space-y-4">
        <form onSubmit={(e) => e.preventDefault()}>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                type="email"
                placeholder="la-tua-email@esempio.it"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSubscribe();
                }}
                className="pl-10 bg-white/50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 backdrop-blur-sm"
                disabled={isSubscribing}
                data-testid="input-email"
              />
            </div>
            <Button
              onClick={handleSubscribe}
              disabled={isSubscribing}
              className="bg-sage hover:bg-sage/90 text-white px-6"
              data-testid="button-subscribe"
            >
              {isSubscribing ? "Iscrizione..." : "Iscriviti alle notifiche"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}