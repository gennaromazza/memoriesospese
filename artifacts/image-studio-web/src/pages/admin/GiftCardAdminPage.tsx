import { lazy, Suspense } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, Gift } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const GiftCardSellPanel = lazy(() => import('@/components/gift-cards/admin/GiftCardSellPanel'));
const GiftCardTypesPanel = lazy(() => import('@/components/gift-cards/admin/GiftCardTypesPanel'));
const GiftCardIssuedPanel = lazy(() => import('@/components/gift-cards/admin/GiftCardIssuedPanel'));

/** Gestione gift card: vendita al banco, catalogo dei tipi e card emesse. */
export default function GiftCardAdminPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-4">
        <Link href="/admin/dashboard">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Torna alla Dashboard
          </Button>
        </Link>
      </div>
      <header className="flex items-start gap-3">
        <Gift className="mt-1 h-7 w-7 text-primary" aria-hidden="true" />
        <div>
          <h1 className="font-playfair text-3xl">Gift card</h1>
          <p className="text-sm text-muted-foreground">
            Un cliente è al banco: scegli cosa regala, scrivi il nome di chi riceve, incassa e stampa il cartoncino.
          </p>
        </div>
      </header>

      <Tabs defaultValue="vendi" className="space-y-6">
        <TabsList>
          <TabsTrigger value="vendi">Vendi in studio</TabsTrigger>
          <TabsTrigger value="tipi">Tipi di gift card</TabsTrigger>
          <TabsTrigger value="emesse">Card emesse</TabsTrigger>
        </TabsList>
        <Suspense fallback={<Skeleton className="h-96 w-full" />}>
          <TabsContent value="vendi"><GiftCardSellPanel /></TabsContent>
          <TabsContent value="tipi"><GiftCardTypesPanel /></TabsContent>
          <TabsContent value="emesse"><GiftCardIssuedPanel /></TabsContent>
        </Suspense>
      </Tabs>
    </div>
  );
}
