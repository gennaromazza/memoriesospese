import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Loader2, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  PRINT_SHOP_CATALOG,
  PRINT_SHOP_CATEGORIES,
} from '@shared/print-shop-catalog';
import type {
  PrintPackagePricing,
  PrintPriceTier,
  PrintPricing,
  PrintShopCatalogProduct,
} from '@shared/print-shop-types';

const catalogQueryKey = (sku: string) => ['/api/print-shop/admin/catalog', sku] as const;
const POLAROID_SKU = 'PRINT-POLAROID-100X090';

function cloneProduct(product: PrintShopCatalogProduct): PrintShopCatalogProduct {
  const isPolaroid = product.sku === POLAROID_SKU;
  const pricing: PrintPricing = isPolaroid
    ? product.printSpec.pricing.model === 'package'
      ? { ...product.printSpec.pricing, packageSize: 50, requireDistinctAssets: true, allowMultiplePackages: false }
      : {
          model: 'package',
          packageSize: 50,
          packagePriceCents: Math.max(1, Math.round((product.prezzoFinale || 9.9) * 100)),
          requireDistinctAssets: true,
          allowMultiplePackages: false,
        }
    : product.printSpec.pricing.model === 'tiered'
      ? { model: 'tiered', tiers: product.printSpec.pricing.tiers.map((tier) => ({ ...tier })) }
      : { model: 'tiered', tiers: [{ minQuantity: 1, unitPriceCents: 50 }] };
  return {
    ...product,
    immagini: [...product.immagini],
    salesChannels: [...product.salesChannels],
    printSpec: {
      ...product.printSpec,
      finishes: ['glossy', 'matte'],
      fitModes: ['border', 'cover'],
      pricing,
    },
  };
}

async function readAdminCatalogProduct(sku: string): Promise<PrintShopCatalogProduct> {
  const response = await apiRequest('GET', `/api/print-shop/admin/catalog/${encodeURIComponent(sku)}`);
  const body = await response.json() as unknown;
  const product = body && typeof body === 'object' && 'product' in body
    ? (body as { product?: PrintShopCatalogProduct }).product
    : body as PrintShopCatalogProduct;
  if (!product) throw new Error('Il prodotto non è disponibile nel catalogo gestionale.');
  return product;
}

async function saveAdminCatalogProduct(product: PrintShopCatalogProduct): Promise<PrintShopCatalogProduct> {
  const response = await apiRequest(
    'PATCH',
    `/api/print-shop/admin/catalog/${encodeURIComponent(product.sku)}`,
    {
      nome: product.nome.trim(),
      descrizione: product.descrizione.trim(),
      categoria: product.categoria.trim(),
      displayOrder: product.displayOrder,
      attivo: product.attivo,
      printSpec: product.printSpec,
    },
  );
  const body = await response.json() as unknown;
  const updated = body && typeof body === 'object' && 'product' in body
    ? (body as { product?: PrintShopCatalogProduct }).product
    : body as PrintShopCatalogProduct;
  if (!updated) throw new Error('Il server non ha restituito il prodotto aggiornato.');
  return updated;
}

export function validatePrintCatalogDraft(product: PrintShopCatalogProduct | null): string[] {
  if (!product) return [];
  const errors: string[] = [];
  const spec = product.printSpec;
  if (!product.nome.trim()) errors.push('Inserisci il nome del formato.');
  if (!product.descrizione.trim()) errors.push('Inserisci una descrizione del formato.');
  if (!product.categoria.trim()) errors.push('Scegli una categoria.');
  if (!Number.isInteger(product.displayOrder) || product.displayOrder < 0) errors.push('L’ordine di visualizzazione deve essere un numero intero positivo o zero.');
  if (!(spec.widthMm > 0) || !(spec.heightMm > 0) || spec.widthMm > 5_000 || spec.heightMm > 5_000) errors.push('Larghezza e altezza devono essere comprese tra 1 e 5.000 mm.');
  if (!spec.finishes.includes('glossy') || !spec.finishes.includes('matte')) errors.push('Ogni formato deve offrire carta lucida e opaca.');
  if (!spec.fitModes.includes('border') || !spec.fitModes.includes('cover')) errors.push('Ogni formato deve offrire foto intera e tutta pagina.');
  if (!Number.isInteger(spec.qualityWarningDpi) || spec.qualityWarningDpi < 1 || spec.qualityWarningDpi > 2_400) errors.push('La soglia di avviso DPI deve essere compresa tra 1 e 2.400.');
  if (!Number.isInteger(spec.qualityTargetDpi) || spec.qualityTargetDpi < spec.qualityWarningDpi || spec.qualityTargetDpi > 2_400) errors.push('Il DPI consigliato deve essere tra la soglia di avviso e 2.400.');

  const isPolaroid = product.sku === POLAROID_SKU;
  if (isPolaroid && spec.pricing.model !== 'package') errors.push('Lo SKU Polaroid deve usare il prezzo a pacchetto.');
  if (!isPolaroid && spec.pricing.model !== 'tiered') errors.push('Questo SKU deve usare prezzi per copia a scaglioni.');

  if (spec.pricing.model === 'tiered') {
    if (spec.pricing.tiers.length === 0) errors.push('Aggiungi almeno uno scaglione di prezzo.');
    spec.pricing.tiers.forEach((tier, index, tiers) => {
      if (!Number.isInteger(tier.minQuantity) || tier.minQuantity < 1) errors.push(`Scaglione ${index + 1}: quantità minima non valida.`);
      if (!Number.isInteger(tier.unitPriceCents) || tier.unitPriceCents < 1) errors.push(`Scaglione ${index + 1}: prezzo non valido.`);
      if (tier.maxQuantity !== undefined && (!Number.isInteger(tier.maxQuantity) || tier.maxQuantity < tier.minQuantity)) {
        errors.push(`Scaglione ${index + 1}: quantità massima non valida.`);
      }
      if (index < tiers.length - 1) {
        if (tier.maxQuantity === undefined) errors.push(`Scaglione ${index + 1}: solo l’ultimo può non avere un limite massimo.`);
        else if (tiers[index + 1].minQuantity !== tier.maxQuantity + 1) errors.push(`Gli scaglioni ${index + 1} e ${index + 2} devono essere consecutivi.`);
      }
    });
    if (spec.pricing.tiers[0]?.minQuantity !== 1) errors.push('Il primo scaglione deve iniziare da 1.');
  } else if (isPolaroid) {
    if (spec.pricing.packageSize !== 50) errors.push('Il pacchetto Polaroid deve contenere esattamente 50 foto.');
    if (!Number.isInteger(spec.pricing.packagePriceCents) || spec.pricing.packagePriceCents < 1) errors.push('Inserisci un prezzo valido per il pacchetto.');
    if (!spec.pricing.requireDistinctAssets) errors.push('Il pacchetto Polaroid richiede 50 foto tutte diverse.');
    if (spec.pricing.allowMultiplePackages) errors.push('La versione attuale non consente più pacchetti Polaroid nella stessa riga.');
  }
  return Array.from(new Set(errors));
}

function centsToEuros(cents: number): string {
  return (Math.max(0, Number(cents) || 0) / 100).toFixed(2);
}

function eurosToCents(value: string): number {
  const normalized = value.replace(',', '.');
  return Math.max(0, Math.round((Number(normalized) || 0) * 100));
}

export default function PrintShopCatalogManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedSku, setSelectedSku] = useState(PRINT_SHOP_CATALOG[0]?.sku ?? '');
  const [draft, setDraft] = useState<PrintShopCatalogProduct | null>(null);
  const productsByCategory = useMemo(() => PRINT_SHOP_CATEGORIES.map((category) => ({
    category,
    products: PRINT_SHOP_CATALOG.filter((product) => product.categoria === category.id),
  })).filter((entry) => entry.products.length > 0), []);

  const productQuery = useQuery({
    queryKey: catalogQueryKey(selectedSku),
    enabled: Boolean(selectedSku),
    queryFn: () => readAdminCatalogProduct(selectedSku),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (productQuery.data) setDraft(cloneProduct(productQuery.data));
  }, [productQuery.data]);

  const saveMutation = useMutation({
    mutationFn: saveAdminCatalogProduct,
    onSuccess: (updated) => {
      queryClient.setQueryData(catalogQueryKey(updated.sku), updated);
      void queryClient.invalidateQueries({ queryKey: ['/api/print-shop/catalog'] });
      setDraft(cloneProduct(updated));
      toast({ title: 'Listino aggiornato', description: `${updated.nome}: prezzi e configurazione sono stati salvati.` });
    },
    onError: (error) => toast({
      variant: 'destructive',
      title: 'Salvataggio non riuscito',
      description: error instanceof Error ? error.message : 'Controlla i dati e riprova.',
    }),
  });

  const errors = useMemo(() => validatePrintCatalogDraft(draft), [draft]);
  const tierCount = draft?.printSpec.pricing.model === 'tiered'
    ? draft.printSpec.pricing.tiers.length
    : 0;
  const updateSpec = (patch: Partial<PrintShopCatalogProduct['printSpec']>) => {
    setDraft((current) => current ? ({
      ...current,
      printSpec: { ...current.printSpec, ...patch },
    }) : current);
  };
  const updatePricing = (pricing: PrintPricing) => updateSpec({ pricing });

  const updateTier = (index: number, patch: Partial<PrintPriceTier>) => {
    if (!draft || draft.printSpec.pricing.model !== 'tiered') return;
    const tiers = draft.printSpec.pricing.tiers.map((tier, tierIndex) => tierIndex === index ? { ...tier, ...patch } : tier);
    updatePricing({ model: 'tiered', tiers });
  };
  const updatePackage = (patch: Partial<PrintPackagePricing>) => {
    if (!draft || draft.printSpec.pricing.model !== 'package') return;
    updatePricing({ ...draft.printSpec.pricing, ...patch });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Listino stampe online</CardTitle>
          <CardDescription>Modifica disponibilità, formati e prezzi usati dal preventivo autorevole dello shop.</CardDescription>
        </CardHeader>
        <CardContent>
          <Label htmlFor="print-catalog-product">Formato da modificare</Label>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row">
            <select
              id="print-catalog-product"
              value={selectedSku}
              onChange={(event) => { setSelectedSku(event.target.value); setDraft(null); }}
              className="h-11 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {productsByCategory.map(({ category, products }) => (
                <optgroup key={category.id} label={category.nome}>
                  {products.map((product) => <option key={product.sku} value={product.sku}>{product.nome} · {product.sku}</option>)}
                </optgroup>
              ))}
            </select>
            <Button type="button" variant="outline" onClick={() => void productQuery.refetch()} disabled={productQuery.isFetching}>
              <RefreshCw className={productQuery.isFetching ? 'animate-spin' : ''} aria-hidden="true" /> Ricarica
            </Button>
          </div>
        </CardContent>
      </Card>

      {productQuery.isLoading || !draft ? (
        productQuery.isError ? (
          <Card className="border-destructive/40"><CardContent className="flex items-start gap-3 py-8 text-destructive"><AlertTriangle className="h-5 w-5 flex-none" /><span>{productQuery.error instanceof Error ? productQuery.error.message : 'Formato non disponibile.'}</span></CardContent></Card>
        ) : (
          <div className="flex min-h-64 items-center justify-center" role="status"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" /><span className="sr-only">Caricamento formato</span></div>
        )
      ) : (
        <>
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
              <div><CardTitle>Dati del formato</CardTitle><CardDescription className="mt-1">SKU immutabile: {draft.sku} · versione catalogo {draft.catalogVersion}</CardDescription></div>
              <Badge variant={draft.attivo ? 'default' : 'secondary'}>{draft.attivo ? 'Pubblicato' : 'Nascosto'}</Badge>
            </CardHeader>
            <CardContent className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="catalog-name">Nome</Label><Input id="catalog-name" value={draft.nome} onChange={(event) => setDraft({ ...draft, nome: event.target.value })} /></div>
              <div className="space-y-2"><Label htmlFor="catalog-category">Categoria</Label><select id="catalog-category" value={draft.categoria} onChange={(event) => setDraft({ ...draft, categoria: event.target.value })} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">{PRINT_SHOP_CATEGORIES.map((category) => <option key={category.id} value={category.id}>{category.nome}</option>)}</select></div>
              <div className="space-y-2 md:col-span-2"><Label htmlFor="catalog-description">Descrizione</Label><Textarea id="catalog-description" value={draft.descrizione} onChange={(event) => setDraft({ ...draft, descrizione: event.target.value })} maxLength={1000} /></div>
              <div className="space-y-2"><Label htmlFor="catalog-order">Ordine di visualizzazione</Label><Input id="catalog-order" type="number" min={0} step={1} value={draft.displayOrder} onChange={(event) => setDraft({ ...draft, displayOrder: Number(event.target.value) })} /></div>
              <label className="flex items-center gap-3 self-end rounded-lg border p-3 text-sm font-medium"><input type="checkbox" checked={draft.attivo} onChange={(event) => setDraft({ ...draft, attivo: event.target.checked })} className="h-5 w-5" />Visibile e acquistabile nello shop</label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Specifiche di stampa</CardTitle><CardDescription>Questi valori alimentano selezione, controllo qualità e preventivo.</CardDescription></CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2"><Label htmlFor="width-mm">Larghezza (mm)</Label><Input id="width-mm" type="number" min={1} step="0.1" value={draft.printSpec.widthMm} onChange={(event) => updateSpec({ widthMm: Number(event.target.value) })} /></div>
                <div className="space-y-2"><Label htmlFor="height-mm">Altezza (mm)</Label><Input id="height-mm" type="number" min={1} step="0.1" value={draft.printSpec.heightMm} onChange={(event) => updateSpec({ heightMm: Number(event.target.value) })} /></div>
                <div className="space-y-2"><Label htmlFor="warning-dpi">Avviso sotto (DPI)</Label><Input id="warning-dpi" type="number" min={1} step={1} value={draft.printSpec.qualityWarningDpi} onChange={(event) => updateSpec({ qualityWarningDpi: Number(event.target.value) })} /></div>
                <div className="space-y-2"><Label htmlFor="target-dpi">Qualità consigliata (DPI)</Label><Input id="target-dpi" type="number" min={1} step={1} value={draft.printSpec.qualityTargetDpi} onChange={(event) => updateSpec({ qualityTargetDpi: Number(event.target.value) })} /></div>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <section className="rounded-xl border p-4" aria-labelledby="fixed-finishes-title"><h3 id="fixed-finishes-title" className="text-sm font-semibold">Carta sempre disponibile</h3><div className="mt-3 space-y-3"><p className="flex items-center gap-3 text-sm"><Check className="h-4 w-4 text-emerald-700" />Lucida</p><p className="flex items-center gap-3 text-sm"><Check className="h-4 w-4 text-emerald-700" />Opaca</p></div><p className="mt-3 text-xs text-muted-foreground">Scelte fisse per tutti i formati dello shop.</p></section>
                <section className="rounded-xl border p-4" aria-labelledby="fixed-fit-title"><h3 id="fixed-fit-title" className="text-sm font-semibold">Aspetto sempre disponibile</h3><div className="mt-3 space-y-3"><p className="flex items-center gap-3 text-sm"><Check className="h-4 w-4 text-emerald-700" />Foto intera con possibile bordo bianco</p><p className="flex items-center gap-3 text-sm"><Check className="h-4 w-4 text-emerald-700" />Tutta pagina con possibile ritaglio</p></div><p className="mt-3 text-xs text-muted-foreground">Scelte fisse per tutti i formati dello shop.</p></section>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Prezzi</CardTitle><CardDescription>Gli importi salvati qui sono quelli usati dal server al checkout.</CardDescription></CardHeader>
            <CardContent className="space-y-5">
              <div className="rounded-xl border bg-muted/20 p-4 text-sm"><span className="font-semibold">Tipo di prezzo: </span>{draft.sku === POLAROID_SKU ? 'pacchetto Polaroid da 50 foto tutte diverse' : 'prezzo per copia con scaglioni'}. <span className="text-muted-foreground">È determinato dallo SKU e non può essere cambiato.</span></div>

              {draft.printSpec.pricing.model === 'tiered' ? (
                <div className="space-y-3">
                  {draft.printSpec.pricing.tiers.map((tier, index) => (
                    <div key={index} className="grid gap-3 rounded-xl border bg-muted/20 p-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
                      <div className="space-y-2"><Label htmlFor={`tier-min-${index}`}>Da quantità</Label><Input id={`tier-min-${index}`} type="number" min={1} step={1} value={tier.minQuantity} onChange={(event) => updateTier(index, { minQuantity: Number(event.target.value) })} /></div>
                      <div className="space-y-2"><Label htmlFor={`tier-max-${index}`}>A quantità <span className="font-normal text-muted-foreground">(vuoto = oltre)</span></Label><Input id={`tier-max-${index}`} type="number" min={tier.minQuantity} step={1} value={tier.maxQuantity ?? ''} onChange={(event) => updateTier(index, { maxQuantity: event.target.value ? Number(event.target.value) : undefined })} /></div>
                      <div className="space-y-2"><Label htmlFor={`tier-price-${index}`}>Prezzo per copia (€)</Label><Input id={`tier-price-${index}`} type="number" min="0.01" step="0.01" value={centsToEuros(tier.unitPriceCents)} onChange={(event) => updateTier(index, { unitPriceCents: eurosToCents(event.target.value) })} /></div>
                      <Button type="button" variant="ghost" size="icon" aria-label={`Elimina scaglione ${index + 1}`} disabled={tierCount === 1} onClick={() => {
                        const pricing = draft.printSpec.pricing;
                        if (pricing.model === 'tiered') updatePricing({ model: 'tiered', tiers: pricing.tiers.filter((_, tierIndex) => tierIndex !== index) });
                      }}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" onClick={() => {
                    if (draft.printSpec.pricing.model !== 'tiered') return;
                    const previous = draft.printSpec.pricing.tiers.at(-1);
                    const minQuantity = previous?.maxQuantity ? previous.maxQuantity + 1 : Math.max(1, (previous?.minQuantity ?? 0) + 1);
                    updatePricing({ model: 'tiered', tiers: [...draft.printSpec.pricing.tiers, { minQuantity, unitPriceCents: previous?.unitPriceCents ?? 50 }] });
                  }}><Plus aria-hidden="true" /> Aggiungi scaglione</Button>
                </div>
              ) : (
                <div className="grid gap-5 rounded-xl border bg-muted/20 p-5 sm:grid-cols-2">
                  <div className="space-y-2"><Label htmlFor="package-size">Numero foto nel pacchetto</Label><Input id="package-size" type="number" value={50} readOnly className="bg-muted" /><p className="text-xs text-muted-foreground">Valore fisso per lo SKU Polaroid.</p></div>
                  <div className="space-y-2"><Label htmlFor="package-price">Prezzo pacchetto (€)</Label><Input id="package-price" type="number" min="0.01" step="0.01" value={centsToEuros(draft.printSpec.pricing.packagePriceCents)} onChange={(event) => updatePackage({ packagePriceCents: eurosToCents(event.target.value) })} /></div>
                  <p className="flex items-center gap-3 rounded-lg border bg-background p-3 text-sm"><Check className="h-4 w-4 text-emerald-700" />50 fotografie obbligatoriamente tutte diverse</p>
                  <p className="flex items-center gap-3 rounded-lg border bg-background p-3 text-sm"><Check className="h-4 w-4 text-emerald-700" />Un solo pacchetto per riga ordine</p>
                </div>
              )}
            </CardContent>
          </Card>

          {errors.length > 0 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" role="alert"><div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" />Correggi prima di salvare</div><ul className="mt-2 list-disc space-y-1 pl-5">{errors.map((error) => <li key={error}>{error}</li>)}</ul></div>
          )}

          <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-end gap-3 rounded-xl border bg-background/95 p-4 shadow-lg backdrop-blur">
            <Button type="button" variant="outline" onClick={() => productQuery.data && setDraft(cloneProduct(productQuery.data))}>Annulla modifiche</Button>
            <Button type="button" onClick={() => draft && saveMutation.mutate(draft)} disabled={errors.length > 0 || saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
              Salva listino
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
