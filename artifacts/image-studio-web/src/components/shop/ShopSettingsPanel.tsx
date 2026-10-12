import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, ExternalLink, Loader2, Plus, Save, Settings2, Trash2 } from 'lucide-react';
import { SHOP_MAX_CATEGORIES, SHOP_MAX_SHIPPING_TIERS, formatShopPrice, type ShopSettings } from '@shared/shop-types';
import { describeShopShippingTier, formatShopWeight, shopShippingTiers } from '@shared/shop-shipping';
import { parseTierRows, tiersToRows, type ShippingTierRow } from '@/features/shop/shop-shipping-form';
import { SHOP_PATH, shopCategoryPath } from '@shared/shop-landing-content';
import { getProductCategories } from '@/lib/product-categories';
import { shopApi } from '@/features/shop/shop-api';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

const settingsKey = ['shop-admin-settings'] as const;

function withoutTiers(shipping: ShopSettings['shipping']): ShopSettings['shipping'] {
  const { tiers: _tiers, ...flat } = shipping;
  return flat;
}

/** Errori da correggere prima di salvare; vuoto se i dati sono validi. */
const SHOP_PUBLIC_ORIGIN = 'https://imagestudiofotografico.com';

/** Link pubblici da condividere: lo shop e una pagina per ogni categoria scelta. */
export function shopShareLinks(categories: Array<{ value: string; nome: string }>, selectedValues: string[]) {
  return [
    { key: 'shop', label: 'Shop di Natale (tutte le categorie)', url: `${SHOP_PUBLIC_ORIGIN}${SHOP_PATH}` },
    ...categories
      .filter(category => selectedValues.includes(category.value))
      .map(category => ({ key: category.value, label: category.nome, url: `${SHOP_PUBLIC_ORIGIN}${shopCategoryPath(category.value)}` })),
  ];
}

function ShopShareLinks({ links }: { links: ReturnType<typeof shopShareLinks> }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (key: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(key);
      setTimeout(() => setCopied(current => (current === key ? null : current)), 2000);
    } catch {
      toast({ title: 'Copia non riuscita', description: 'Seleziona il link e copialo a mano.', variant: 'destructive' });
    }
  };
  return (
    <section className="space-y-3 rounded-xl border p-4" aria-labelledby="shop-links-t">
      <div>
        <h3 id="shop-links-t" className="text-base font-medium">Link da condividere</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Ogni categoria con prodotti in vendita ha una pagina sua. Il link funziona quando la vetrina è visibile.
        </p>
      </div>
      <ul className="space-y-2">
        {links.map(link => (
          <li key={link.key} className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{link.label}</p>
              <p className="break-all text-xs text-muted-foreground">{link.url}</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => copy(link.key, link.url)}>
              {copied === link.key ? <Check className="mr-1 h-4 w-4" aria-hidden="true" /> : <Copy className="mr-1 h-4 w-4" aria-hidden="true" />}
              {copied === link.key ? 'Copiato' : 'Copia'}
            </Button>
            <Button type="button" variant="outline" size="sm" asChild>
              <a href={link.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-1 h-4 w-4" aria-hidden="true" />Apri</a>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

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
  if (shipping.tiers && shipping.tiers.length > 0 && shopShippingTiers(shipping).length !== shipping.tiers.length) {
    errors.push('Le fasce di peso non sono valide: pesi diversi tra loro e costi non negativi.');
  }
  return errors;
}

export default function ShopSettingsPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({ queryKey: settingsKey, queryFn: shopApi.getSettings, staleTime: 30_000 });
  const categoriesQuery = useQuery({ queryKey: ['shop-admin-categories'], queryFn: getProductCategories, staleTime: 60_000 });
  const catalogQuery = useQuery({ queryKey: ['shop-catalog'], queryFn: shopApi.getCatalog, staleTime: 60_000 });
  const [draft, setDraft] = useState<ShopSettings | null>(null);
  const [byWeight, setByWeight] = useState(false);
  const [rows, setRows] = useState<ShippingTierRow[]>([]);
  const load = (settings: ShopSettings) => {
    setDraft({ ...settings, shipping: { ...settings.shipping } });
    const tiers = shopShippingTiers(settings.shipping);
    setByWeight(tiers.length > 0);
    setRows(tiersToRows(tiers));
  };
  useEffect(() => {
    if (settingsQuery.data) load(settingsQuery.data);
  }, [settingsQuery.data]);

  const mutation = useMutation({
    mutationFn: shopApi.saveSettings,
    onSuccess: (saved) => {
      load(saved);
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

  const parsedTiers = parseTierRows(rows);
  // Quello che si salva davvero: con il costo per peso le fasce lette dal modulo, altrimenti nessuna.
  const effective: ShopSettings | null = draft
    ? { ...draft, shipping: byWeight ? { ...draft.shipping, tiers: parsedTiers.tiers } : withoutTiers(draft.shipping) }
    : null;
  const errors = effective
    ? [
        ...validateShopSettings(effective),
        ...(byWeight ? [...parsedTiers.errors, ...(parsedTiers.tiers.length === 0 && parsedTiers.errors.length === 0 ? ['Aggiungi almeno una fascia di peso.'] : [])] : []),
      ]
    : [];
  const withoutWeight = (catalogQuery.data?.products ?? []).filter(product => !product.weightGrams);
  const updateRow = (index: number, patch: Partial<ShippingTierRow>) =>
    setRows(rows.map((row, position) => (position === index ? { ...row, ...patch } : row)));
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
              I prodotti si aggiungono da Impostazioni → Catalogo Prodotti, come sempre: metti il prodotto nella categoria scelta qui sotto,
              indica in «Numero foto incluse» quante foto deve caricare il cliente (0 se non servono) e, per la spedizione, il peso di un esemplare.
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

            <ShopShareLinks links={shopShareLinks(categories, draft.categoryValues)} />

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

              <div role="radiogroup" aria-label="Come si calcola il costo di spedizione" className="grid gap-2 sm:grid-cols-2">
                <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm ${!byWeight ? 'border-primary bg-primary/5' : ''}`}>
                  <input type="radio" name="shop-shipping-mode" className="mt-1" checked={!byWeight} onChange={() => setByWeight(false)} />
                  <span><strong>Costo unico</strong><br />Lo stesso importo per ogni ordine.</span>
                </label>
                <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm ${byWeight ? 'border-primary bg-primary/5' : ''}`}>
                  <input
                    type="radio"
                    name="shop-shipping-mode"
                    className="mt-1"
                    checked={byWeight}
                    onChange={() => {
                      setByWeight(true);
                      if (rows.length === 0) setRows([{ kg: '1', euro: '' }]);
                    }}
                  />
                  <span><strong>In base al peso</strong><br />Fasce di peso, per esempio da 1 a 3 kg.</span>
                </label>
              </div>

              {!byWeight ? (
                <div className="space-y-2 sm:max-w-xs">
                  <Label htmlFor="shop-shipping-price">Costo al cliente (€)</Label>
                  <Input id="shop-shipping-price" type="number" inputMode="decimal" min={0} step="0.01" value={draft.shipping.priceCents / 100} onChange={(event) => setDraft({ ...draft, shipping: { ...draft.shipping, priceCents: Math.max(0, Math.round((Number(event.target.value) || 0) * 100)) } })} />
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Il peso dell'ordine è la somma dei pesi dei prodotti (indicati nel Catalogo Prodotti) per la quantità. Un ordine rientra in una fascia se pesa
                    fino al suo limite, compreso.
                  </p>
                  <div className="space-y-2">
                    {rows.map((row, index) => (
                      <div key={index} className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
                        <div className="space-y-1">
                          <Label htmlFor={`shop-tier-kg-${index}`} className="text-xs">Fino a (kg)</Label>
                          <Input id={`shop-tier-kg-${index}`} inputMode="decimal" placeholder="es. 3" value={row.kg} onChange={(event) => updateRow(index, { kg: event.target.value })} />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`shop-tier-eur-${index}`} className="text-xs">Costo (€)</Label>
                          <Input id={`shop-tier-eur-${index}`} inputMode="decimal" placeholder="es. 7,90" value={row.euro} onChange={(event) => updateRow(index, { euro: event.target.value })} />
                        </div>
                        <Button type="button" variant="ghost" size="icon" aria-label={`Elimina la fascia ${index + 1}`} onClick={() => setRows(rows.filter((_, position) => position !== index))}>
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button type="button" variant="outline" size="sm" disabled={rows.length >= SHOP_MAX_SHIPPING_TIERS} onClick={() => setRows([...rows, { kg: '', euro: '' }])}>
                    <Plus className="h-4 w-4" aria-hidden="true" /> Aggiungi fascia
                  </Button>
                  {parsedTiers.tiers.length > 0 && parsedTiers.errors.length === 0 ? (
                    <ul className="rounded-lg bg-muted/50 p-3 text-sm" aria-label="Riepilogo delle fasce">
                      {parsedTiers.tiers.map((tier, index, tiers) => (
                        <li key={tier.maxGrams}>{describeShopShippingTier(tiers, index)}: <strong>{formatShopPrice(tier.priceCents)}</strong></li>
                      ))}
                      <li className="text-muted-foreground">
                        Oltre {formatShopWeight(parsedTiers.tiers[parsedTiers.tiers.length - 1].maxGrams)} la spedizione online non è disponibile: il cliente può scegliere il ritiro in studio.
                      </li>
                    </ul>
                  ) : null}
                  {withoutWeight.length > 0 ? (
                    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
                      <strong>{withoutWeight.length === 1 ? '1 prodotto non ha il peso' : `${withoutWeight.length} prodotti non hanno il peso`}</strong>: per questi la spedizione online non si può calcolare
                      e il cliente può solo ritirare in studio. Inseriscilo in Catalogo Prodotti: {withoutWeight.slice(0, 6).map(product => product.nome).join(', ')}
                      {withoutWeight.length > 6 ? `… e altri ${withoutWeight.length - 6}` : ''}.
                    </div>
                  ) : null}
                </div>
              )}

              <p className="text-sm text-muted-foreground">
                I giorni qui sotto indicano il tempo dal pagamento (con tutte le foto) alla consegna a casa, preparazione e corriere compresi. Sono un'indicazione per il cliente, non una promessa.
              </p>
              <div className="grid gap-5 sm:grid-cols-2">
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
            <Button type="button" disabled={errors.length > 0 || mutation.isPending} onClick={() => effective && mutation.mutate(effective)}>
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salva impostazioni
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
