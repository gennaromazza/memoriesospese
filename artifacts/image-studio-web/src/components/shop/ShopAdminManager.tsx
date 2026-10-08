import { Settings2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ShopSettingsPanel from './ShopSettingsPanel';

/**
 * Scheda "Shop online" del pannello admin. Per ora contiene le impostazioni;
 * l'elenco ordini si aggiunge nella stessa scheda.
 */
export default function ShopAdminManager() {
  return (
    <Tabs defaultValue="settings" className="w-full">
      <TabsList className="mb-5 h-auto w-full justify-start gap-1 overflow-x-auto rounded-xl bg-muted/60 p-1 sm:w-auto">
        <TabsTrigger value="settings" className="gap-2 rounded-lg px-4 py-2.5">
          <Settings2 className="h-4 w-4" aria-hidden="true" /> Impostazioni
        </TabsTrigger>
      </TabsList>
      <TabsContent value="settings" className="mt-0">
        <ShopSettingsPanel />
      </TabsContent>
    </Tabs>
  );
}
