import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Gift } from 'lucide-react';
import { giftCardsApi } from '@/features/gift-cards/gift-cards-api';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const GiftCardSellPanel = lazy(() => import('./GiftCardSellPanel'));
const GiftCardTypesPanel = lazy(() => import('./GiftCardTypesPanel'));
const GiftCardIssuedPanel = lazy(() => import('./GiftCardIssuedPanel'));

type Section = 'vendi' | 'tipi' | 'emesse';

/**
 * Gestione gift card dentro la dashboard admin: vendita al banco, catalogo dei
 * tipi e card emesse. Senza nessun tipo si apre direttamente il catalogo.
 */
export default function GiftCardAdminContent() {
  const types = useQuery({ queryKey: ['gift-card-types'], queryFn: giftCardsApi.listTypes });
  const [section, setSection] = useState<Section>('vendi');
  const redirected = useRef(false);

  useEffect(() => {
    if (!redirected.current && types.isSuccess && types.data.length === 0) {
      redirected.current = true;
      setSection('tipi');
    }
  }, [types.isSuccess, types.data]);

  return (
    <div className="space-y-6 px-4 sm:px-0">
      <header className="flex items-start gap-3">
        <Gift className="mt-1 h-7 w-7 text-primary" aria-hidden="true" />
        <div>
          <h1 className="font-playfair text-3xl">Gift card</h1>
          <p className="text-sm text-muted-foreground">
            Un cliente è al banco: scegli cosa regala, scrivi il nome di chi riceve, incassa e stampa il cartoncino.
          </p>
        </div>
      </header>

      <Tabs value={section} onValueChange={value => setSection(value as Section)} className="space-y-6">
        <TabsList>
          <TabsTrigger value="vendi">Vendi in studio</TabsTrigger>
          <TabsTrigger value="tipi">Tipi di gift card</TabsTrigger>
          <TabsTrigger value="emesse">Card emesse</TabsTrigger>
        </TabsList>
        <Suspense fallback={<Skeleton className="h-96 w-full" />}>
          <TabsContent value="vendi"><GiftCardSellPanel onCreateType={() => setSection('tipi')} /></TabsContent>
          <TabsContent value="tipi"><GiftCardTypesPanel /></TabsContent>
          <TabsContent value="emesse"><GiftCardIssuedPanel /></TabsContent>
        </Suspense>
      </Tabs>
    </div>
  );
}
