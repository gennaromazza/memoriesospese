/**
 * SEND QUOTE EMAIL BUTTON - Pulsante invio preventivo manuale
 * Permette all'admin di inviare/reinviare email preventivo
 */

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { sendQuoteEmailManually } from '@/lib/quotes';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Mail, Loader2 } from 'lucide-react';
import type { Quote } from '@shared/quotes-types';

interface SendQuoteEmailButtonProps {
  quote: Quote;
  onEmailSent?: () => void;
}

export default function SendQuoteEmailButton({ quote, onEmailSent }: SendQuoteEmailButtonProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);

  const sendMutation = useMutation({
    mutationFn: async () => {
      return sendQuoteEmailManually(quote.id);
    },
    onSuccess: (result) => {
      toast({
        title: '✅ Email inviata!',
        description: `Preventivo inviato a ${result.recipientEmails?.join(', ') || 'cliente'}`
      });
      setIsOpen(false);
      onEmailSent?.();
    },
    onError: (error: any) => {
      toast({
        title: '❌ Errore',
        description: error instanceof Error ? error.message : 'Impossibile inviare email',
        variant: 'destructive'
      });
    }
  });

  // Non mostrare pulsante se email è già stata inviata
  const isAlreadySent = !!quote.emailSentAt;

  return (
    <Button
      onClick={() => sendMutation.mutate()}
      disabled={sendMutation.isPending}
      variant={isAlreadySent ? "outline" : "default"}
      size="sm"
      className="gap-2"
      title={isAlreadySent && quote.emailSentAt ? `Email inviata il ${quote.emailSentAt.toDate().toLocaleDateString('it-IT')}` : 'Invia email preventivo al cliente'}
    >
      <Mail className="w-4 h-4" />
      {sendMutation.isPending ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          Invio...
        </>
      ) : isAlreadySent ? (
        '📧 Inviato'
      ) : (
        'Invia Email'
      )}
    </Button>
  );
}
