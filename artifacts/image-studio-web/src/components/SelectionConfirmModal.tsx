import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Check, Mail, ArrowLeft, Image as ImageIcon, MessageSquare, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export interface SelectedPhoto {
  id: string;
  url: string;
  thumbnailUrl?: string;
  name?: string;
  note?: string;
}

export interface PhotoWithNote {
  id: string;
  url: string;
  thumbnailUrl?: string;
  name?: string;
  note?: string;
}

interface SelectionConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (photosWithNotes: PhotoWithNote[]) => Promise<void>;
  selectedPhotos: SelectedPhoto[];
  galleryName: string;
  galleryCode: string;
  isSubmitting: boolean;
}

export default function SelectionConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  selectedPhotos,
  galleryName,
  galleryCode,
  isSubmitting,
}: SelectionConfirmModalProps) {
  const { toast } = useToast();
  const [wantEmailCopy, setWantEmailCopy] = useState(false);
  const [email, setEmail] = useState("");
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [photoNotes, setPhotoNotes] = useState<Record<string, string>>({});
  const [showNotesSection, setShowNotesSection] = useState(false);
  const [expandedPhotoId, setExpandedPhotoId] = useState<string | null>(null);

  const updatePhotoNote = (photoId: string, note: string) => {
    setPhotoNotes(prev => ({
      ...prev,
      [photoId]: note
    }));
  };

  const getPhotosWithNotes = (): PhotoWithNote[] => {
    return selectedPhotos.map(photo => ({
      ...photo,
      note: photoNotes[photo.id] || undefined
    }));
  };

  const notesCount = Object.values(photoNotes).filter(note => note.trim()).length;

  const handleConfirm = async () => {
    // Se l'utente vuole una copia via email, invia prima l'email
    if (wantEmailCopy && email.trim()) {
      setIsSendingEmail(true);
      try {
        const response = await fetch("/api/email/selection-copy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipientEmail: email.trim(),
            galleryName,
            galleryCode,
            selectedPhotos: selectedPhotos.map(p => ({
              id: p.id,
              url: p.thumbnailUrl || p.url,
              name: p.name || `Foto ${p.id}`,
            })),
          }),
        });

        if (!response.ok) {
          throw new Error("Errore invio email");
        }

        setEmailSent(true);
        toast({
          title: "Email inviata",
          description: "Riceverai una copia delle foto selezionate via email.",
        });
      } catch (error) {
        console.error("Error sending email:", error);
        toast({
          title: "Errore",
          description: "Impossibile inviare l'email. Procedo con la conferma.",
          variant: "destructive",
        });
      } finally {
        setIsSendingEmail(false);
      }
    }

    // Procedi con la conferma selezione con le note
    await onConfirm(getPhotosWithNotes());
  };

  const isValidEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const canConfirm = !isSubmitting && !isSendingEmail && 
    (!wantEmailCopy || (wantEmailCopy && isValidEmail(email)));

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Check className="h-6 w-6 text-terracotta" />
            Conferma la tua selezione
          </DialogTitle>
          <DialogDescription>
            Hai selezionato <strong className="text-terracotta">{selectedPhotos.length} foto</strong> dalla galleria "{galleryName}".
            Rivedi la tua selezione prima di confermare.
          </DialogDescription>
        </DialogHeader>

        {/* Griglia foto selezionate */}
        <div className="flex-1 min-h-0">
          <div className="flex items-center justify-between mb-2">
            <Label className="text-sm font-medium">
              <ImageIcon className="h-4 w-4 inline mr-1" />
              Le tue foto selezionate:
            </Label>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowNotesSection(!showNotesSection)}
              className="text-xs h-7 px-2 text-terracotta hover:text-terracotta/80"
              data-testid="button-toggle-notes"
            >
              <MessageSquare className="h-3 w-3 mr-1" />
              {showNotesSection ? "Nascondi note" : "Aggiungi note"}
              {notesCount > 0 && <span className="ml-1 bg-terracotta text-white rounded-full px-1.5 py-0.5 text-xs">{notesCount}</span>}
            </Button>
          </div>
          
          <ScrollArea className="h-[280px] border rounded-lg p-2 bg-gray-50">
            {selectedPhotos.length === 0 ? (
              <div className="flex items-center justify-center h-full text-gray-500">
                Nessuna foto selezionata
              </div>
            ) : showNotesSection ? (
              /* Vista con note - lista verticale */
              <div className="space-y-3">
                {selectedPhotos.map((photo, index) => (
                  <div
                    key={photo.id}
                    className="flex gap-3 p-2 bg-white rounded-lg border border-gray-200"
                    data-testid={`preview-photo-note-${index}`}
                  >
                    <div className="relative w-16 h-16 flex-shrink-0 rounded-md overflow-hidden border-2 border-terracotta/30">
                      <img
                        src={photo.thumbnailUrl || photo.url}
                        alt={photo.name || `Foto ${index + 1}`}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                      <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs py-0.5 text-center">
                        {index + 1}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <Textarea
                        placeholder="Aggiungi una nota per il fotografo (es: stampa in bianco e nero, ritocco particolare...)"
                        value={photoNotes[photo.id] || ""}
                        onChange={(e) => updatePhotoNote(photo.id, e.target.value)}
                        rows={2}
                        className="text-sm resize-none"
                        data-testid={`input-photo-note-${index}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* Vista griglia compatta */
              <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2">
                {selectedPhotos.map((photo, index) => (
                  <div
                    key={photo.id}
                    className="relative aspect-square rounded-md overflow-hidden border-2 border-terracotta/30 shadow-sm"
                    data-testid={`preview-photo-${index}`}
                  >
                    <img
                      src={photo.thumbnailUrl || photo.url}
                      alt={photo.name || `Foto ${index + 1}`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs py-0.5 text-center">
                      {index + 1}
                    </div>
                    {photoNotes[photo.id] && (
                      <div className="absolute top-1 right-1 bg-terracotta text-white rounded-full p-0.5">
                        <MessageSquare className="h-3 w-3" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Opzione copia email */}
        <div className="border-t pt-4 space-y-3">
          <div className="flex items-start gap-3 p-3 bg-terracotta/10 border border-terracotta/30 rounded-lg">
            <Checkbox
              id="wantEmailCopy"
              checked={wantEmailCopy}
              onCheckedChange={(checked) => setWantEmailCopy(checked as boolean)}
              className="mt-0.5"
              data-testid="checkbox-want-email"
            />
            <div className="flex-1">
              <Label htmlFor="wantEmailCopy" className="cursor-pointer font-medium flex items-center gap-2">
                <Mail className="h-4 w-4 text-terracotta" />
                Ricevi una copia via email
              </Label>
              <p className="text-xs text-gray-600 mt-1">
                Ti invieremo un riepilogo con le miniature delle foto selezionate.
              </p>
            </div>
          </div>

          {wantEmailCopy && (
            <div className="ml-6 space-y-2">
              <Label htmlFor="email">Indirizzo email</Label>
              <Input
                id="email"
                type="email"
                placeholder="tua@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={!isValidEmail(email) && email.trim() ? "border-red-300" : ""}
                data-testid="input-email-copy"
              />
              {!isValidEmail(email) && email.trim() && (
                <p className="text-xs text-red-500">Inserisci un indirizzo email valido</p>
              )}
              {emailSent && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <Check className="h-3 w-3" /> Email inviata con successo
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-2 sm:gap-2 pt-4 border-t">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting || isSendingEmail}
            className="flex-1 sm:flex-none"
            data-testid="button-back-selection"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Torna alla selezione
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!canConfirm || selectedPhotos.length === 0}
            className="flex-1 sm:flex-none bg-terracotta hover:bg-terracotta/90 text-white"
            data-testid="button-confirm-selection"
          >
            {isSubmitting || isSendingEmail ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {isSendingEmail ? "Invio email..." : "Conferma in corso..."}
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                Conferma Selezione ({selectedPhotos.length})
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
