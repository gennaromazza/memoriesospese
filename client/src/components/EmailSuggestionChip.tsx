/**
 * Chip cliccabile che suggerisce la correzione di typo nel dominio email
 * ("gnail.com" → "gmail.com"). Solo suggerimento: non blocca mai l'invio.
 */
import { suggestEmailCorrection } from '@shared/email-suggest';

interface EmailSuggestionChipProps {
  email: string;
  onAccept: (correctedEmail: string) => void;
}

export function EmailSuggestionChip({ email, onAccept }: EmailSuggestionChipProps) {
  const suggestion = suggestEmailCorrection(email || '');
  if (!suggestion) return null;

  return (
    <button
      type="button"
      onClick={() => onAccept(suggestion)}
      className="w-full text-left text-xs rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-800 hover:bg-amber-100 transition-colors"
      data-testid="email-suggestion"
    >
      ⚠️ Forse intendevi <strong className="underline">{suggestion}</strong>?
      <span className="block text-amber-700/80">Tocca qui per correggere</span>
    </button>
  );
}
