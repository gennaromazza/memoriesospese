import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { CheckCircle2, Mail, Camera } from "lucide-react";

interface PhotoUploadSuccessModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  photosCount: number;
  notifiedCount: number;
}

export function PhotoUploadSuccessModal({
  open,
  onOpenChange,
  photosCount,
  notifiedCount,
}: PhotoUploadSuccessModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-photo-upload-success">
        <DialogHeader>
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-sage/10">
            <CheckCircle2 className="h-10 w-10 text-sage" />
          </div>
          <DialogTitle className="text-center text-2xl">
            Upload Completato!
          </DialogTitle>
          <DialogDescription className="text-center text-base pt-2">
            Le foto sono state caricate con successo nella galleria
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Foto caricate */}
          <div className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-sage/10 p-2">
                <Camera className="h-5 w-5 text-sage" />
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  Foto caricate
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Aggiunte alla galleria
                </p>
              </div>
            </div>
            <span className="text-2xl font-bold text-sage" data-testid="text-photos-count">
              {photosCount}
            </span>
          </div>

          {/* Email inviate */}
          <div className="flex items-center justify-between rounded-lg border border-sage/20 bg-sage/5 dark:bg-sage/10 p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-sage/20 p-2">
                <Mail className="h-5 w-5 text-sage" />
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  Email inviate
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {notifiedCount === 0 
                    ? "Nessun iscritto alle notifiche"
                    : notifiedCount === 1 
                    ? "Persona notificata"
                    : "Persone notificate"}
                </p>
              </div>
            </div>
            <span 
              className="text-2xl font-bold text-sage" 
              data-testid="text-notified-count"
            >
              {notifiedCount}
            </span>
          </div>
        </div>

        <div className="flex justify-center pt-2">
          <Button
            onClick={() => onOpenChange(false)}
            className="bg-sage hover:bg-sage/90 text-white"
            data-testid="button-close"
          >
            Chiudi
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
