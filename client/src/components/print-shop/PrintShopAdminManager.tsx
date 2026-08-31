import { useState } from 'react';
import { ClipboardList, Tags, Truck } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PrintShopCatalogManager from './PrintShopCatalogManager';
import PrintShopOrdersManager from './PrintShopOrdersManager';
import PrintShopShippingManager from './PrintShopShippingManager';

export default function PrintShopAdminManager() {
  const [section, setSection] = useState(() =>
    ['orders', 'catalog', 'shipping'].includes(sessionStorage.getItem('printShopAdminSection') || '')
      ? sessionStorage.getItem('printShopAdminSection')!
      : 'orders',
  );
  const changeSection = (nextSection: string) => {
    setSection(nextSection);
    sessionStorage.setItem('printShopAdminSection', nextSection);
  };
  return (
    <Tabs value={section} onValueChange={changeSection} className="w-full">
      <TabsList className="mb-5 h-auto w-full justify-start gap-1 overflow-x-auto rounded-xl bg-muted/60 p-1 sm:w-auto">
        <TabsTrigger value="orders" className="gap-2 rounded-lg px-4 py-2.5">
          <ClipboardList className="h-4 w-4" aria-hidden="true" /> Ordini stampe
        </TabsTrigger>
        <TabsTrigger value="catalog" className="gap-2 rounded-lg px-4 py-2.5">
          <Tags className="h-4 w-4" aria-hidden="true" /> Listino e prezzi
        </TabsTrigger>
        <TabsTrigger value="shipping" className="gap-2 rounded-lg px-4 py-2.5">
          <Truck className="h-4 w-4" aria-hidden="true" /> Spedizione
        </TabsTrigger>
      </TabsList>
      <TabsContent value="orders" className="mt-0">
        <PrintShopOrdersManager />
      </TabsContent>
      <TabsContent value="catalog" className="mt-0">
        <PrintShopCatalogManager />
      </TabsContent>
      <TabsContent value="shipping" className="mt-0">
        <PrintShopShippingManager />
      </TabsContent>
    </Tabs>
  );
}
