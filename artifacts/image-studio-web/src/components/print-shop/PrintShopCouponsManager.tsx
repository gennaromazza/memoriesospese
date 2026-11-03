import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil, Plus, Save, Ticket, X } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { PrintShopCatalogProduct, PrintShopCoupon, PrintShopCouponInput } from '@shared/print-shop-types';

const queryKey = ['/api/print-shop/admin/coupons'] as const;
const formatsQueryKey = ['/api/print-shop/coupon-formats'] as const;

type CouponForm = {
  id?: string;
  code: string;
  discountType: 'percentage' | 'fixed';
  value: number;
  scope: 'all' | 'selected';
  eligibleSkus: string[];
  minPrintQuantity: string;
  startsAt: string;
  endsAt: string;
  maxUses: string;
  active: boolean;
};

function localDateTime(value: Date): string {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

function emptyForm(): CouponForm {
  const start = new Date();
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  return {
    code: '',
    discountType: 'percentage',
    value: 10,
    scope: 'all',
    eligibleSkus: [],
    minPrintQuantity: '',
    startsAt: localDateTime(start),
    endsAt: localDateTime(end),
    maxUses: '',
    active: true,
  };
}

function editForm(coupon: PrintShopCoupon): CouponForm {
  return {
    id: coupon.id,
    code: coupon.code,
    discountType: coupon.discountType,
    value: coupon.discountType === 'fixed' ? coupon.value / 100 : coupon.value,
    scope: coupon.scope || 'all',
    eligibleSkus: [...(coupon.eligibleSkus || [])],
    minPrintQuantity: coupon.minPrintQuantity ? String(coupon.minPrintQuantity) : '',
    startsAt: localDateTime(new Date(coupon.startsAt)),
    endsAt: localDateTime(new Date(coupon.endsAt)),
    maxUses: coupon.maxUses == null ? '' : String(coupon.maxUses),
    active: coupon.active,
  };
}

async function readCoupons(): Promise<PrintShopCoupon[]> {
  const response = await apiRequest('GET', '/api/print-shop/admin/coupons');
  const body = await response.json() as { coupons?: PrintShopCoupon[] };
  if (!Array.isArray(body.coupons)) throw new Error('Elenco coupon non disponibile.');
  return body.coupons;
}

async function readCouponFormats(): Promise<PrintShopCatalogProduct[]> {
  const response = await apiRequest('GET', '/api/print-shop/catalog');
  const body = await response.json() as { products?: PrintShopCatalogProduct[] };
  if (!Array.isArray(body.products)) throw new Error('Formati dello shop non disponibili.');
  return body.products.filter(product => product.attivo && product.sku);
}

function toInput(form: CouponForm): PrintShopCouponInput {
  return {
    code: form.code.trim().toUpperCase(),
    discountType: form.discountType,
    value: form.discountType === 'fixed'
      ? Math.round((Number(String(form.value).replace(',', '.')) || 0) * 100)
      : Number(form.value),
    scope: form.scope,
    eligibleSkus: form.scope === 'selected' ? form.eligibleSkus : [],
    minPrintQuantity: form.minPrintQuantity.trim() ? Number(form.minPrintQuantity) : 0,
    startsAt: new Date(form.startsAt).toISOString(),
    endsAt: new Date(form.endsAt).toISOString(),
    maxUses: form.maxUses.trim() ? Number(form.maxUses) : null,
    active: form.active,
  };
}

function couponStatus(coupon: PrintShopCoupon): { label: string; variant: 'default' | 'secondary' | 'destructive' } {
  const now = Date.now();
  if (!coupon.active) return { label: 'Disattivato', variant: 'secondary' };
  if (new Date(coupon.startsAt).getTime() > now) return { label: 'Programmato', variant: 'secondary' };
  if (new Date(coupon.endsAt).getTime() < now) return { label: 'Scaduto', variant: 'destructive' };
  if (coupon.remainingUses === 0) return { label: 'Esaurito', variant: 'destructive' };
  return { label: 'Attivo', variant: 'default' };
}

export default function PrintShopCouponsManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey, queryFn: readCoupons, staleTime: 15_000 });
  const formatsQuery = useQuery({ queryKey: formatsQueryKey, queryFn: readCouponFormats, staleTime: 60_000 });
  const [form, setForm] = useState<CouponForm | null>(null);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (query.isError) setFormError(query.error instanceof Error ? query.error.message : 'Coupon non disponibili.');
  }, [query.isError, query.error]);

  const saveMutation = useMutation({
    mutationFn: async (value: { id?: string; input: PrintShopCouponInput }) => {
      const response = await apiRequest(
        value.id ? 'PATCH' : 'POST',
        value.id
          ? `/api/print-shop/admin/coupons/${encodeURIComponent(value.id)}`
          : '/api/print-shop/admin/coupons',
        value.input,
      );
      const body = await response.json() as { coupon?: PrintShopCoupon };
      if (!body.coupon) throw new Error('Il server non ha restituito il coupon salvato.');
      return body.coupon;
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey });
      setForm(null);
      setFormError('');
      toast({
        title: 'Coupon salvato',
        description: `${saved.code} è ${saved.active ? 'attivo' : 'disattivato'}.`,
      });
    },
    onError: (error) => setFormError(error instanceof Error ? error.message : 'Salvataggio non riuscito.'),
  });

  const errors = useMemo(() => {
    if (!form) return [];
    const result: string[] = [];
    const code = form.code.trim().toUpperCase();
    const value = Number(String(form.value).replace(',', '.'));
    const start = new Date(form.startsAt).getTime();
    const end = new Date(form.endsAt).getTime();
    if (!/^[A-Z0-9_-]{3,32}$/.test(code)) result.push('Usa 3–32 lettere, numeri, trattini o trattini bassi.');
    if (!Number.isFinite(value) || value <= 0) result.push('Inserisci uno sconto maggiore di zero.');
    if (form.discountType === 'percentage' && (!Number.isInteger(value) || value > 100)) result.push('La percentuale deve essere un numero intero tra 1 e 100.');
    if (form.discountType === 'fixed' && value > 1_000_000) result.push('L’importo fisso non può superare 10.000 €.');
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) result.push('La scadenza deve essere successiva all’inizio.');
    if (form.maxUses.trim() && (!Number.isInteger(Number(form.maxUses)) || Number(form.maxUses) < 1)) result.push('Il limite utilizzi deve essere un intero positivo o vuoto.');
    if (form.minPrintQuantity.trim() && (!Number.isInteger(Number(form.minPrintQuantity)) || Number(form.minPrintQuantity) < 1 || Number(form.minPrintQuantity) > 100_000)) result.push('Il minimo di stampe deve essere un numero intero tra 1 e 100.000, oppure vuoto.');
    if (form.scope === 'selected' && form.eligibleSkus.length === 0) result.push('Seleziona almeno un formato oppure scegli tutto lo shop.');
    if (form.scope === 'selected' && formatsQuery.isError) result.push('Non riesco a caricare i formati dello shop.');
    return result;
  }, [form, formatsQuery.isError]);

  const startEdit = (coupon: PrintShopCoupon) => {
    setForm(editForm(coupon));
    setFormError('');
  };
  const submit = () => {
    if (!form || errors.length) return;
    try {
      setFormError('');
      saveMutation.mutate({ id: form.id, input: toInput(form) });
    } catch {
      setFormError('Controlla date e importi del coupon.');
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-primary/10 p-2"><Ticket className="h-5 w-5 text-primary" aria-hidden="true" /></span>
            <div>
              <CardTitle>Coupon per le stampe</CardTitle>
              <CardDescription className="mt-1">Lo sconto si applica alle stampe, non alla spedizione. I coupon già usati restano associati agli ordini pagati.</CardDescription>
            </div>
          </div>
          <Button type="button" onClick={() => { setForm(emptyForm()); setFormError(''); }}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Nuovo coupon
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {query.isLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Caricamento…</div>
          ) : query.data?.length ? query.data.map((coupon) => {
            const status = couponStatus(coupon);
            return (
              <div key={coupon.id} className="grid gap-4 rounded-xl border p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="font-mono text-base">{coupon.code}</strong>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {coupon.discountType === 'percentage' ? `${coupon.value}% di sconto` : `${(coupon.value / 100).toFixed(2)} € di sconto`}
                    {' · '}{coupon.scope === 'selected' ? `${coupon.eligibleSkus?.length || 0} formati selezionati` : 'tutti i formati'}
                    {coupon.minPrintQuantity ? ` · minimo ${coupon.minPrintQuantity} stampe` : ''}
                    {' · '}{new Date(coupon.startsAt).toLocaleString('it-IT')} – {new Date(coupon.endsAt).toLocaleString('it-IT')}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {coupon.usedCount} utilizz{coupon.usedCount === 1 ? 'o' : 'i'}
                    {coupon.maxUses == null ? ' · senza limite massimo' : ` · ${coupon.remainingUses ?? 0} utilizzi residui su ${coupon.maxUses}`}
                    {coupon.reservedCount > 0 ? ` · ${coupon.reservedCount} in checkout` : ''}
                  </p>
                </div>
                <Switch
                  checked={coupon.active}
                  aria-label={`${coupon.active ? 'Disattiva' : 'Attiva'} coupon ${coupon.code}`}
                  onCheckedChange={(active) => saveMutation.mutate({
                    id: coupon.id,
                    input: {
                      code: coupon.code,
                      discountType: coupon.discountType,
                      value: coupon.value,
                      scope: coupon.scope || 'all',
                      eligibleSkus: coupon.eligibleSkus || [],
                      minPrintQuantity: coupon.minPrintQuantity || 0,
                      startsAt: coupon.startsAt,
                      endsAt: coupon.endsAt,
                      maxUses: coupon.maxUses,
                      active,
                    },
                  })}
                />
                <Button type="button" variant="outline" onClick={() => startEdit(coupon)}>
                  <Pencil className="h-4 w-4" aria-hidden="true" /> Modifica
                </Button>
              </div>
            );
          }) : (
            <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">Non hai ancora creato coupon per lo shop stampe.</p>
          )}
        </CardContent>
      </Card>

      {form && (
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle>{form.id ? `Modifica coupon ${form.code}` : 'Crea un coupon'}</CardTitle>
              <CardDescription className="mt-1">Il codice non distingue tra maiuscole e minuscole.</CardDescription>
            </div>
            <Button type="button" variant="ghost" size="icon" aria-label="Chiudi modulo coupon" onClick={() => setForm(null)}><X className="h-4 w-4" /></Button>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="print-coupon-code">Codice</Label>
                <Input id="print-coupon-code" value={form.code} maxLength={32} autoCapitalize="characters" onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} placeholder="ESTATE2026" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="print-coupon-discount-type">Tipo di sconto</Label>
                <select id="print-coupon-discount-type" value={form.discountType} onChange={(event) => setForm({ ...form, discountType: event.target.value as CouponForm['discountType'], value: event.target.value === 'percentage' ? 10 : 5 })} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="percentage">Percentuale</option>
                  <option value="fixed">Importo fisso</option>
                </select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="print-coupon-scope">Formati inclusi</Label>
                <select
                  id="print-coupon-scope"
                  value={form.scope}
                  onChange={(event) => setForm({
                    ...form,
                    scope: event.target.value as CouponForm['scope'],
                    eligibleSkus: event.target.value === 'all' ? [] : form.eligibleSkus,
                  })}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="all">Tutto lo shop stampe</option>
                  <option value="selected">Solo formati selezionati</option>
                </select>
                {form.scope === 'selected' && (
                  <fieldset className="max-h-64 space-y-2 overflow-y-auto rounded-lg border p-3">
                    <legend className="px-1 text-sm font-medium">Seleziona i formati ammessi</legend>
                    {formatsQuery.isLoading ? (
                      <p className="text-sm text-muted-foreground">Caricamento formati…</p>
                    ) : formatsQuery.isError ? (
                      <p className="text-sm text-destructive" role="alert">Formati non disponibili. Riprova a caricare la pagina.</p>
                    ) : (
                      <>
                        {form.eligibleSkus
                          .filter((sku) => !formatsQuery.data?.some((product) => product.sku === sku))
                          .map((sku) => (
                            <label key={`unavailable-${sku}`} className="flex cursor-pointer items-start gap-3 rounded-md bg-amber-50 px-2 py-2 text-amber-900">
                              <input
                                type="checkbox"
                                checked
                                onChange={() => setForm({
                                  ...form,
                                  eligibleSkus: form.eligibleSkus.filter((eligibleSku) => eligibleSku !== sku),
                                })}
                                className="mt-1 h-4 w-4 accent-primary"
                              />
                              <span className="min-w-0 text-sm">
                                {sku} · non più disponibile (togli la selezione per salvare)
                              </span>
                            </label>
                          ))}
                        {formatsQuery.data?.length ? formatsQuery.data.map((product) => {
                          const checked = form.eligibleSkus.includes(product.sku);
                          return (
                            <label key={product.sku} className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-muted/60">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(event) => setForm({
                                  ...form,
                                  eligibleSkus: event.target.checked
                                    ? [...new Set([...form.eligibleSkus, product.sku])]
                                    : form.eligibleSkus.filter((sku) => sku !== product.sku),
                                })}
                                className="mt-1 h-4 w-4 accent-primary"
                              />
                              <span className="min-w-0">
                                <span className="block text-sm font-medium">{product.nome}</span>
                                <span className="block text-xs text-muted-foreground">{product.sku} · {product.categoria}</span>
                              </span>
                            </label>
                          );
                        }) : (
                          <p className="text-sm text-muted-foreground">Non ci sono formati acquistabili.</p>
                        )}
                      </>
                    )}
                  </fieldset>
                )}
                <p className="text-xs text-muted-foreground">Se lo sconto è fisso, si applica solo al subtotale dei formati selezionati; la spedizione resta esclusa.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="print-coupon-value">{form.discountType === 'percentage' ? 'Percentuale (%)' : 'Importo (€)'}</Label>
                <Input id="print-coupon-value" type="number" min={form.discountType === 'percentage' ? 1 : 0.01} max={form.discountType === 'percentage' ? 100 : 1_000_000} step={form.discountType === 'percentage' ? 1 : 0.01} value={form.value} onChange={(event) => setForm({ ...form, value: Number(event.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="print-coupon-max-uses">Numero massimo di utilizzi</Label>
                <Input id="print-coupon-max-uses" type="number" min={1} step={1} value={form.maxUses} onChange={(event) => setForm({ ...form, maxUses: event.target.value })} placeholder="Nessun limite" />
              </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="print-coupon-min-prints">Numero minimo di stampe</Label>
                  <Input id="print-coupon-min-prints" type="number" min={1} max={100_000} step={1} value={form.minPrintQuantity} onChange={(event) => setForm({ ...form, minPrintQuantity: event.target.value })} placeholder="Nessun minimo" />
                  <p className="text-xs text-muted-foreground">
                    Conta le copie ordinate, non le foto caricate. {form.scope === 'selected' ? 'Se hai scelto dei formati, contano solo quelli.' : 'Contano tutti i formati dello shop.'}
                  </p>
                </div>
              <div className="space-y-2">
                <Label htmlFor="print-coupon-starts">Valido da</Label>
                <Input id="print-coupon-starts" type="datetime-local" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="print-coupon-ends">Valido fino a</Label>
                <Input id="print-coupon-ends" type="datetime-local" value={form.endsAt} onChange={(event) => setForm({ ...form, endsAt: event.target.value })} />
              </div>
            </div>
            <div className="flex items-center justify-between gap-5 rounded-xl border p-4">
              <div><Label htmlFor="print-coupon-active">Coupon attivo</Label><p className="mt-1 text-sm text-muted-foreground">Quando è disattivato, non può essere applicato al checkout.</p></div>
              <Switch id="print-coupon-active" checked={form.active} onCheckedChange={(active) => setForm({ ...form, active })} />
            </div>
            {(formError || errors.length > 0) && <p className="text-sm font-medium text-destructive" role="alert">{formError || errors[0]}</p>}
            <div className="flex flex-wrap justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setForm(null)}>Annulla</Button>
              <Button type="button" disabled={errors.length > 0 || saveMutation.isPending} onClick={submit}>
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salva coupon
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
