import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Save, Settings2 } from 'lucide-react';
import { SHOP_MAX_CATEGORIES, type ShopSettings } from '@shared/shop-types';
import { getProductCategories } from '@/lib/product-categories';
import { shopApi } from '@/features/shop/shop-api';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

const settingsKey = ['shop-admin-settings'] as const;

/** Errori da correggere prima di salvare; vuoto se i dati sono validi. */
export function validateShopSettings(draft: ShopSettings): string[] {
  const errors: string[] = [];
  if (draft.categoryValues.length > SHOP_MAX_CATEGORIES) errors.push(`Puoi scegliere al massimo ${SHOP_MAX_CATEGORIES} categorie.`);
  if (draft.enabled && draft.categoryValues.length === 0) errors.push('Scegli almeno una categoria da mostrare nella vetrina.');
  if (draft.lastOrderDate && !/^\d{4}-\d{2}-\d{2}$/.test(draft.lastOrderDate)) errors.push('L\'ultimo giorno per ordinare non è una data valida.');
  if (!Number.isInteger(draft.photoWaitDays) || draft.photoWaitDays < 1 || draft.photoWaitDays > 60) errors.push('I giorni di attesa foto devono essere tra 1 e 60.');
  const { shipping } = draft;
  if (!Number.isInteger(shipping.priceCents) || shipping.priceCents < 0) errors.push('Inserisci un costo di spedizione valido.');
  if (!Number.isInteger(shipping.estimatedMinDays) || shipping.estimatedMinDays < 1) errors.push('Inserisci i giorni minimi di consegna.');
  if (!Number.isInteger(shipping.estimatedMaxDays) || shipping.estimatedMaxDays < shipping.estimatedMinDays) errors.push('I giorni massimi devono essere uguali o superiori ai minimi.');
  return errors;
}

export default function ShopSettingsPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({ queryKey: settingsKey, queryFn: shopApi.getSettings, staleTime: 30_000 });
  const categoriesQuery = useQuery({ queryKey: ['shop-admin-categories'], queryFn: getProductCategories, staleTime: 60_000 });
  const [draft, setDraft] = useState<ShopSettings | null>(null);
  useEffect(() => {
    if (settingsQuery.data) setDraft({ ...settingsQuery.data, shipping: { ...settingsQuery.data.shipping } });
  }, [settingsQuery.data]);

  const mutation = useMutation({
    mutationFn: shopApi.saveSettings,
    onSuccess: (saved) => {
      setDraft({ ...saved, shipping: { ...saved.shipping } });
      queryClient.setQueryData(settingsKey, saved);
      void queryClient.invalidateQueries({ queryKey: ['shop-catalog'] });
      toast({ title: 'Impostazioni salvate', description: 'Le modifiche sono già visibili nella vetrina.' });
    },
    onError: (error) => toast({
      variant: 'destructive',
      title: 'Salvataggio non riuscito',
      description: error instanceof Error ? error.message : 'Controlla i dati e riprova.',
    }),
  });

  const errors = draft ? validateShopSettings(draft) : [];
  const categories = categoriesQuery.data ?? [];
  const toggleCategory = (value: string, checked: boolean) => {
    if (!draft) return;
    const next = checked ? [...new Set([...draft.categoryValues, value])] : draft.categoryValues.filter(item => item !== value);
    setDraft({ ...draft, categoryValues: next });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-primary/10 p-2"><Settings2 className="h-5 w-5 text-primary" /></span>
          <div>
            <CardTitle>Impostazioni dello shop</CardTitle>
            <CardDescription className="mt-1">
              I prodotti si aggiungono da Impostazioni → Prodotti, come sempre: metti il prodotto nella categoria scelta qui sotto
              e indica nel campo «Numero foto incluse» quante foto deve caricare il cliente (0 se non servono).
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {settingsQuery.isLoading || !draft ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Caricamento…</div>
        ) : (
          <div className="max-w-2xl space-y-6">
            <div className="flex items-center justify-between gap-5 rounded-xl border p-4">
              <div>
                <Label htmlFor="shop-enabled" className="text-base">Vetrina visibile ai clienti</Label>
                <p className="mt-1 text-sm text-muted-foreground">Se spenta, la pagina dello shop non mostra prodotti e i collegamenti nel menu spariscono.</p>
              </div>
              <Switch id="shop-enabled" checked={draft.enabled} onCheckedChange={(enabled) => setDraft({ ...draft, enabled })} />
            </div>

            <div className="flex items-center justify-between gap-5 rounded-xl border p-4">
              <div>
                <Label htmlFor="shop-orders-open" className="text-base">Ordini online aperti</Label>
                <p className="mt-1 text-sm text-muted-foreground">Con la vetrina visibile e gli ordini chiusi, i clienti guardano i prodotti ma non possono ancora ordinare.</p>
              </div>
              <Switch id="shop-orders-open" checked={draft.ordersOpen} onCheckedChange={(ordersOpen) => setDraft({ ...draft, ordersOpen })} />
            </div>

            <fieldset className="space-y-3 rounded-xl border p-4">
              <legend className="px-1 text-base font-medium">Categorie mostrate nella vetrina</legend>
              {categoriesQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Caricamento categorie…</p>
              ) : categories.length === 0 ? (
                <p className="text-sm text-muted-foreground">Non ci sono categorie: creale da Impostazioni → Categorie prodotti.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {categories.map(category => (
                    <label key={category.id} className="flex items-center gap-3 rounded-lg border p-3 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={draft.categoryValues.includes(category.value)}
                        onChange={(event) => toggleCategory(category.value, event.target.checked)}
                      />
                      <span>{category.nome}{category.attivo ? '' : ' (disattivata)'}</span>
                    </label>
                  ))}
                </div>
              )}
            </fieldset>

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="shop-last-order">Ultimo giorno per ordinare</Label>
                <div className="flex gap-2">
                  <Input id="shop-last-order" type="date" value={draft.lastOrderDate ?? ''} onChange={(event) => setDraft({ ...draft, lastOrderDate: event.target.value || null })} />
                  {draft.lastOrderDate ? (
                    <Button type="button" variant="outline" onClick={() => setDraft({ ...draft, lastOrderDate: null })}>Nessun limite</Button>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">Dopo questo giorno la vetrina resta visibile ma gli ordini si chiudono.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="shop-photo-wait">Giorni di attesa delle foto</Label>
                <Input id="shop-photo-wait" type="number" min={1} max={60} value={draft.photoWaitDays} onChange={(event) => setDraft({ ...draft, photoWaitDays: Number(event.target.value) })} />
                <p className="text-xs text-muted-foreground">Se le foto non arrivano entro questo tempo l'ordine non viene lavorato.</p>
              </div>
            </div>

            <div className="space-y-4 rounded-xl border p-4">
              <div className="flex items-center justify-between gap-5">
                <div>
                  <Label htmlFor="shop-shipping-enabled" className="text-base">Spedizione</Label>
                  <p className="mt-1 text-sm text-muted-foreground">Se spenta, resta disponibile soltanto il ritiro gratuito in studio.</p>
                </div>
                <Switch id="shop-shipping-enabled" checked={draft.shipping.enabled} onCheckedChange={(enabled) => setDraft({ ...draft, shipping: { ...draft.shipping, enabled } })} />
              </div>
              <p className="text-sm text-muted-foreground">
                I giorni indicano il tempo dal pagamento (con tutte le foto) alla consegna a casa, preparazione e corriere compresi. Sono un'indicazione per il cliente, non una promessa.
              </p>
              <div className="grid gap-5 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="shop-shipping-price">Costo al cliente (€)</Label>
                  <Input id="shop-shipping-price" type="number" inputMode="decimal" min={0} step="0.01" value={draft.shipping.priceCents / 100} onChange={(event) => setDraft({ ...draft, shipping: { ...draft.shipping, priceCents: Math.max(0, Math.round((Number(event.target.value) || 0) * 100)) } })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="shop-shipping-min">Tempo indicativo, da (giorni)</Label>
                  <Input id="shop-shipping-min" type="number" min={1} max={60} value={draft.shipping.estimatedMinDays} onChange={(event) => setDraft({ ...draft, shipping: { ...draft.shipping, estimatedMinDays: Number(event.target.value) } })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="shop-shipping-max">Tempo indicativo, fino a (giorni)</Label>
                  <Input id="shop-shipping-max" type="number" min={1} max={90} value={draft.shipping.estimatedMaxDays} onChange={(event) => setDraft({ ...draft, shipping: { ...draft.shipping, estimatedMaxDays: Number(event.target.value) } })} />
                </div>
              </div>
            </div>

            {errors.length > 0 && <p className="text-sm font-medium text-destructive" role="alert">{errors[0]}</p>}
            <Button type="button" disabled={errors.length > 0 || mutation.isPending} onClick={() => mutation.mutate(draft)}>
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salva impostazioni
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
