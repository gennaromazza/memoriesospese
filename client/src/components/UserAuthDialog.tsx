import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { User, Mail } from 'lucide-react';
import { setUserAuthData } from '@/hooks/useUserAuth';

interface UserAuthDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  galleryId: string;
  onAuthComplete: (email: string, name: string) => void;
}

export default function UserAuthDialog({
  isOpen,
  onOpenChange,
  galleryId,
  onAuthComplete
}: UserAuthDialogProps) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim() || !name.trim()) {
      toast({
        title: "Campi obbligatori",
        description: "Email e nome sono richiesti per continuare",
        variant: "destructive"
      });
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast({
        title: "Email non valida",
        description: "Inserisci un indirizzo email valido",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);
    
    try {
      // Save authentication data
      setUserAuthData(galleryId, email.trim(), name.trim());
      
      // Call the completion callback
      onAuthComplete(email.trim(), name.trim());
      
      // Close dialog
      onOpenChange(false);
      
      toast({
        title: "Autenticazione completata",
        description: "Ora puoi mettere like e commentare",
      });
    } catch (error) {
      toast({
        title: "Errore",
        description: "Si è verificato un errore durante l'autenticazione",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-gradient-to-r from-sage-600 to-blue-gray-600 rounded-full flex items-center justify-center mb-3">
            <User className="h-6 w-6 text-white" />
          </div>
          <DialogTitle className="text-xl font-bold text-blue-gray-900">
            Identificati per continuare
          </DialogTitle>
          <DialogDescription className="text-sage-700 mt-2">
            Per mettere like e commentare, inserisci i tuoi dati
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="user-email" className="text-sage-700 font-medium text-sm">
              La tua email
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                id="user-email"
                type="email"
                placeholder="es. marco@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10 border-gray-300 focus:border-sage-500 focus:ring-sage-500"
                disabled={isSubmitting}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="user-name" className="text-sage-700 font-medium text-sm">
              Il tuo nome
            </Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                id="user-name"
                type="text"
                placeholder="es. Marco Rossi"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="pl-10 border-gray-300 focus:border-sage-500 focus:ring-sage-500"
                disabled={isSubmitting}
                required
              />
            </div>
          </div>

          <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
            <p className="text-sm text-blue-800">
              <strong>Privacy:</strong> I tuoi dati vengono utilizzati solo per identificarti 
              nei like e nei commenti. Non verranno condivisi con terze parti.
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="submit"
              disabled={isSubmitting || !email.trim() || !name.trim()}
              className="flex-1 bg-gradient-to-r from-sage-600 to-blue-gray-600 hover:from-sage-700 hover:to-blue-gray-700 text-white font-medium shadow-lg"
            >
              {isSubmitting ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Conferma...
                </div>
              ) : (
                'Conferma'
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="px-6 border-gray-300 hover:bg-gray-50"
            >
              Annulla
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}