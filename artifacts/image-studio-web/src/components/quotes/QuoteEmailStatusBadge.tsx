/**
 * QUOTE EMAIL STATUS BADGE - Badge di stato invio email
 * Mostra visivamente se l'email è stata inviata e quando
 */

import { Badge } from '@/components/ui/badge';
import type { Quote } from '@shared/quotes-types';
import { Mail, Clock } from 'lucide-react';

interface QuoteEmailStatusBadgeProps {
  quote: Quote;
}

export default function QuoteEmailStatusBadge({ quote }: QuoteEmailStatusBadgeProps) {
  if (!quote.emailSentAt) {
    return (
      <Badge variant="secondary" className="gap-2 bg-yellow-100 text-yellow-900 border-yellow-300">
        <Clock className="w-3 h-3" />
        Email non inviata
      </Badge>
    );
  }

  const sentDate = quote.emailSentAt instanceof Date 
    ? quote.emailSentAt 
    : new Date((quote.emailSentAt as any).seconds * 1000);

  const formattedDate = sentDate.toLocaleDateString('it-IT', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <Badge variant="outline" className="gap-2 bg-green-50 text-green-800 border-green-300">
      <Mail className="w-3 h-3" />
      Inviato il {formattedDate}
    </Badge>
  );
}
