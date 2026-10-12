import { ClipboardList, Package, Settings2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ShopOrdersManager from './ShopOrdersManager';
import ShopProductsPanel from './ShopProductsPanel';
import ShopSettingsPanel from './ShopSettingsPanel';

/** Scheda "Shop online" del pannello admin: gli ordini e le impostazioni dello shop. */
export default function ShopAdminManager() {
  return (
    <Tabs defaultValue="orders" className="w-full">
      <TabsList className="mb-5 h-auto w-full justify-start gap-1 overflow-x-auto rounded-xl bg-muted/60 p-1 sm:w-auto">
        <TabsTrigger value="orders" className="gap-2 rounded-lg px-4 py-2.5">
          <ClipboardList className="h-4 w-4" aria-hidden="true" /> Ordini
        </TabsTrigger>
        <TabsTrigger value="products" className="gap-2 rounded-lg px-4 py-2.5">
          <Package className="h-4 w-4" aria-hidden="true" /> Prodotti
        </TabsTrigger>
        <TabsTrigger value="settings"className="gap-2 rounded-lg px-4 py-2.5">
          <Settings2 className="h-4 w-4" aria-hidden="true" /> Impostazioni
        </TabsTrigger>
      </TabsList>
      <TabsContent value="orders" className="mt-0">
        <ShopOrdersManager />
      </TabsContent>
      <TabsContent value="products" className="mt-0">
        <ShopProductsPanel />
      </TabsContent>
      <TabsContent value="settings"className="mt-0">
        <ShopSettingsPanel />
      </TabsContent>
    </Tabs>
  );
}
