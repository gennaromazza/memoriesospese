import { useParams } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { giftCardsApi } from '@/features/gift-cards/gift-cards-api';
import { GiftCardCartoncino } from '@/components/gift-cards/GiftCardCartoncino';
import { errorText } from '@/components/gift-cards/admin/giftCardAdminShared';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import '@/components/gift-cards/gift-cards.css';

/** In stampa mostra solo il cartoncino, anche se la pagina ha banner o notifiche. */
const PRINT_ONLY_SHEET = `@media print { body * { visibility: hidden !important; } .gcx-print-sheet, .gcx-print-sheet * { visibility: visible !important; } .gcx-print-sheet { position: absolute; left: 0; top: 0; } }`;

/**
 * Cartoncino a misura di foglio (15 x 20 cm). Dal browser: scala 100%, margini
 * assenti e "grafica di sfondo" attiva, altrimenti i fondi scuri non si stampano.
 */
export default function GiftCardPrintPage() {
  const params = useParams<{ code: string }>();
  const code = params.code ?? '';
  const card = useQuery({ queryKey: ['gift-card-print', code], queryFn: () => giftCardsApi.getCard(code), retry: false });

  if (card.isLoading) return <div className="p-6"><Skeleton className="h-96 w-80" /></div>;
  if (card.isError || !card.data) {
    return <p className="p-6 text-sm text-red-700" role="alert">{errorText(card.error)}</p>;
  }
  const data = card.data;

  return (
    <div className="gcx-print-root">
      <style>{PRINT_ONLY_SHEET}</style>
      <div className="gcx-no-print mx-auto flex max-w-xl flex-col gap-3 p-4 text-sm">
        <h1 className="font-playfair text-2xl">Cartoncino {data.code}</h1>
        <p className="text-muted-foreground">
          Stampa su carta 15 × 20 cm a pieno foglio, scala 100%, senza margini e con la grafica di sfondo attiva.
          Poi incolla la card nel riquadro tratteggiato in alto.
        </p>
        <div>
          <Button onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Stampa</Button>
        </div>
      </div>
      <div className="gcx-print-sheet">
        <GiftCardCartoncino
          print
          theme={data.theme}
          title={data.title}
          line2={data.line2}
          recipientName={data.recipientName}
          message={data.message}
          validUntil={data.expiresAt}
          code={data.code}
        />
      </div>
    </div>
  );
}
