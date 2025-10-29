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
      className="relative bg-gradient-to-br from-sage/10 via-sage/5 to-transparent dark:from-sage/20 dark:via-sage/10 border border-sage/20 dark:border-sage/30 rounded-lg p-6 shadow-lg"
      data-testid="subscription-prompt"
    >
      {/* Bottone chiudi */}
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
          aria-label="Chiudi"
          data-testid="button-dismiss"
        >
          <X className="h-5 w-5" />
        </button>
      )}

      <div className="flex flex-col sm:flex-row items-center gap-4">
        {/* Icona */}
        <div className="flex-shrink-0">
          <div className="rounded-full bg-sage/20 dark:bg-sage/30 p-4">
            <Bell className="h-8 w-8 text-sage" />
          </div>
        </div>

        {/* Contenuto */}
        <div className="flex-1 text-center sm:text-left">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
            Non perdere nessuna foto!
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Iscriviti per ricevere una notifica quando vengono aggiunte nuove foto a{" "}
            <span className="font-medium text-sage">{galleryName}</span>
          </p>
        </div>

        {/* Form iscrizione */}
        <div className="flex gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              type="email"
              placeholder="la-tua-email@esempio.it"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubscribe();
              }}
              className="pl-10 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
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
            {isSubscribing ? "Iscrizione..." : "Iscriviti"}
          </Button>
        </div>
      </div>
    </div>
  );
}
