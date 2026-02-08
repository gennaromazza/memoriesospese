import { useState } from "react";
import { Share2, Copy, Check, MessageCircle, ExternalLink, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { formatPhoneForWhatsApp } from "@shared/phone-utils";

interface ShareGalleryButtonProps {
  galleryCode: string;
  galleryName: string;
  clientPhone?: string;
  clientName?: string;
  galleryPassword?: string;
  galleryPin?: string;
  onWhatsAppSent?: () => void;
  whatsAppSent?: boolean;
  variant?: "icon" | "button";
  size?: "sm" | "default" | "lg" | "icon";
  className?: string;
}

export default function ShareGalleryButton({
  galleryCode,
  galleryName,
  clientPhone,
  clientName,
  galleryPassword,
  galleryPin,
  onWhatsAppSent,
  whatsAppSent,
  variant = "icon",
  size = "icon",
  className = "",
}: ShareGalleryButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const getPublicGalleryUrl = () => {
    const baseUrl = window.location.origin;
    return `${baseUrl}/gallery/${galleryCode}`;
  };

  const handleCopyLink = async () => {
    const url = getPublicGalleryUrl();
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast({
        title: "Link copiato",
        description: "Il link della galleria è stato copiato negli appunti",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast({
        title: "Errore",
        description: "Impossibile copiare il link",
        variant: "destructive",
      });
    }
  };

  const handleShareWhatsApp = () => {
    const url = getPublicGalleryUrl();
    let message = clientName 
      ? `Ciao ${clientName}! Ecco il link alla tua galleria fotografica "${galleryName}":\n\n${url}`
      : `Ecco il link alla galleria fotografica "${galleryName}":\n\n${url}`;
    
    if (galleryPassword) {
      message += `\n\nPassword: ${galleryPassword}`;
    }
    if (galleryPin) {
      message += `\n\nPIN di accesso: ${galleryPin}`;
    }
    
    const whatsappUrl = clientPhone
      ? `https://wa.me/${formatPhoneForWhatsApp(clientPhone)}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;
    
    window.open(whatsappUrl, "_blank");
    onWhatsAppSent?.();
    setIsOpen(false);
  };

  const handleOpenPublicLink = () => {
    const url = getPublicGalleryUrl();
    window.open(url, "_blank");
  };

  return (
    <>
      {variant === "icon" ? (
        <Button
          variant="outline"
          size={size}
          className={`h-9 w-9 ${whatsAppSent ? "bg-green-50 hover:bg-green-100 border-green-300" : "bg-teal-50 hover:bg-teal-100 border-teal-200"} transition-colors relative ${className}`}
          onClick={() => setIsOpen(true)}
          title={whatsAppSent ? "Galleria già condivisa via WhatsApp" : "Condividi galleria"}
          data-testid="button-share-gallery"
        >
          <Share2 className={`h-4 w-4 ${whatsAppSent ? "text-green-600" : "text-teal-600"}`} />
          {whatsAppSent && (
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-green-500 rounded-full flex items-center justify-center">
              <Check className="h-2.5 w-2.5 text-white" />
            </span>
          )}
        </Button>
      ) : (
        <Button
          variant="outline"
          size={size}
          className={`${whatsAppSent ? "bg-green-50 hover:bg-green-100 border-green-300 text-green-700" : "bg-teal-50 hover:bg-teal-100 border-teal-200 text-teal-700"} ${className}`}
          onClick={() => setIsOpen(true)}
          data-testid="button-share-gallery"
        >
          <Share2 className="h-4 w-4 mr-2" />
          {whatsAppSent ? "Già condivisa" : "Condividi Galleria"}
        </Button>
      )}

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="h-5 w-5 text-teal-600" />
              Condividi Galleria
            </DialogTitle>
            <DialogDescription>
              Condividi il link pubblico della galleria "{galleryName}" con il cliente
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div className="p-3 bg-gray-50 rounded-lg border">
              <p className="text-xs text-gray-500 mb-1">Link pubblico galleria</p>
              <p className="text-sm font-mono text-gray-800 break-all">
                {getPublicGalleryUrl()}
              </p>
            </div>

            {(galleryPassword || galleryPin) && (
              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                <div className="flex items-center gap-2 mb-1">
                  <KeyRound className="h-4 w-4 text-amber-600" />
                  <p className="text-xs text-amber-700 font-medium">Credenziali di accesso</p>
                </div>
                {galleryPassword && (
                  <p className="text-sm font-mono text-amber-900">
                    Password: <span className="font-semibold">{galleryPassword}</span>
                  </p>
                )}
                {galleryPin && (
                  <p className="text-sm font-mono text-amber-900">
                    PIN: <span className="font-semibold">{galleryPin}</span>
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 gap-3">
              <Button
                onClick={handleCopyLink}
                variant="outline"
                className="w-full justify-start gap-3 h-12"
                data-testid="button-copy-gallery-link"
              >
                {copied ? (
                  <Check className="h-5 w-5 text-green-600" />
                ) : (
                  <Copy className="h-5 w-5 text-gray-600" />
                )}
                <span className="flex-1 text-left">
                  {copied ? "Link copiato!" : "Copia link"}
                </span>
              </Button>

              <Button
                onClick={handleShareWhatsApp}
                className="w-full justify-start gap-3 h-12 bg-green-600 hover:bg-green-700 text-white"
                data-testid="button-share-whatsapp"
              >
                <MessageCircle className="h-5 w-5" />
                <span className="flex-1 text-left">
                  {clientPhone 
                    ? `Invia su WhatsApp${clientName ? ` a ${clientName}` : ""}`
                    : "Condividi su WhatsApp"
                  }
                </span>
              </Button>

              <Button
                onClick={handleOpenPublicLink}
                variant="outline"
                className="w-full justify-start gap-3 h-12"
                data-testid="button-open-public-link"
              >
                <ExternalLink className="h-5 w-5 text-gray-600" />
                <span className="flex-1 text-left">
                  Apri link pubblico
                </span>
              </Button>
            </div>

            {clientPhone && (
              <p className="text-xs text-gray-500 text-center">
                Il messaggio verrà inviato a {clientPhone}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
