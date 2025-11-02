
import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Mail, Bell, X } from "lucide-react";
import { subscribeToGallery } from "@/lib/email";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

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
  const [visible, setVisible] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const { toast } = useToast();

  // 🧠 Mostra automaticamente solo se non già iscritto
  useEffect(() => {
    const hasSubscribed = localStorage.getItem(`subscription_prompt_${galleryId}`) === "true";
    if (!hasSubscribed) {
      const timeout = setTimeout(() => setVisible(true), 1500); // ritardo apparizione dolce
      return () => clearTimeout(timeout);
    }
  }, [galleryId]);

  // 🕓 Auto dismiss dopo 3s dalla conferma
  useEffect(() => {
    if (subscribed) {
      const t = setTimeout(() => {
        setVisible(false);
        if (onDismiss) onDismiss();
      }, 3000);
      return () => clearTimeout(t);
    }
  }, [subscribed, onDismiss]);

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
          setSubscribed(true);
          localStorage.setItem(`subscription_prompt_${galleryId}`, "true");
        }

        setEmail("");
        // 🔔 Mantiene visibile per pochi secondi con conferma visiva
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
    <AnimatePresence>
      {visible && (
        <motion.div
          key="subscription-widget"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.4, ease: "easeInOut" }}
          className="fixed bottom-6 right-6 z-50 max-w-sm w-[90%] sm:w-auto bg-white/90 backdrop-blur-xl border border-sage-200 shadow-xl rounded-xl p-5 flex flex-col gap-3"
          data-testid="subscription-prompt"
        >
          {/* Bottone chiudi */}
          {onDismiss && (
            <button
              onClick={() => {
                setVisible(false);
                onDismiss?.();
              }}
              className="absolute top-2 right-3 text-gray-400 hover:text-sage transition-colors"
              aria-label="Chiudi"
            >
              <X className="h-5 w-5" />
            </button>
          )}

          {!subscribed ? (
            <>
              <div className="flex items-center gap-3 mb-1">
                <div className="rounded-full bg-sage/10 p-3">
                  <Bell className="h-6 w-6 text-sage" />
                </div>
                <h3 className="text-base font-semibold text-gray-900">
                  Non perdere nuove foto 📸
                </h3>
              </div>
              <p className="text-sm text-gray-600 mb-2">
                Iscriviti per ricevere una notifica quando vengono aggiunte nuove foto a{" "}
                <span className="font-medium text-sage">{galleryName}</span>
              </p>
              <div className="flex gap-2 items-center">
                <div className="relative flex-1">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    type="email"
                    placeholder="la-tua-email@esempio.it"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSubscribe()}
                    className="pl-10 pr-2 bg-white border-gray-200 text-sm"
                    disabled={isSubscribing}
                  />
                </div>
                <Button
                  onClick={handleSubscribe}
                  disabled={isSubscribing}
                  className="bg-sage hover:bg-sage/90 text-white text-sm px-4 py-2"
                >
                  {isSubscribing ? "..." : "Avvisami"}
                </Button>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-3 justify-center py-2">
              <span className="text-lg">✨</span>
              <p className="text-sage-700 text-sm">
                Ti avviseremo quando arriveranno nuove foto!
              </p>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
