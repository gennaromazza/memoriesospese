import { CheckCircle } from 'lucide-react';

interface InverseSelectionFeedbackProps {
  includedCount: number;
  excludedCount: number;
  isRecorded: boolean;
}

export function InverseSelectionFeedback({
  includedCount,
  excludedCount,
  isRecorded,
}: InverseSelectionFeedbackProps) {
  return (
    <div
      className="flex items-start gap-3 rounded-lg border border-sage/40 bg-sage/10 px-4 py-3"
      role="status"
      data-testid="inverse-selection-feedback"
    >
      <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-sage" aria-hidden="true" />
      <div className="space-y-1">
        <p className="font-semibold text-blue-gray">Lista già al netto delle esclusioni</p>
        <p className="text-sm text-gray-800">
          <strong>{includedCount} foto da copiare</strong>
          {' · '}
          <strong>{isRecorded ? `${excludedCount} “Non mi piace” registrati alla conferma` : `${excludedCount} foto oggi non incluse nella selezione`}</strong>
        </p>
        <p className="text-sm text-gray-700">
          Copia tutti i nomi nella lista qui sotto senza togliere altre foto.
        </p>
        <p className="text-xs text-gray-600">
          {isRecorded
            ? 'Il numero dei “Non mi piace” è quello salvato alla conferma; la lista riflette le foto ancora presenti oggi.'
            : 'Selezione storica: il numero delle foto non incluse è calcolato sulle foto presenti oggi, non sui clic originali della cliente.'}
        </p>
      </div>
    </div>
  );
}
