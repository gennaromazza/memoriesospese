import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Save, Truck } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { PrintShopShippingConfig } from '@shared/print-shop-types';

const queryKey = ['/api/print-shop/admin/shipping'] as const;

async function readShipping(): Promise<PrintShopShippingConfig> {
  const response = await apiRequest('GET', '/api/print-shop/admin/shipping');
  const body = await response.json() as { shipping?: PrintShopShippingConfig };
  if (!body.shipping) throw new Error('Configurazione della spedizione non disponibile.');
  return body.shipping;
}

async function saveShipping(value: PrintShopShippingConfig): Promise<PrintShopShippingConfig> {
  const response = await apiRequest('PATCH', '/api/print-shop/admin/shipping', value);
  const body = await response.json() as { shipping?: PrintShopShippingConfig };
  if (!body.shipping) throw new Error('Il server non ha restituito la configurazione salvata.');
  return body.shipping;
}

export default function PrintShopShippingManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey, queryFn: readShipping, staleTime: 30_000 });
  const [draft, setDraft] = useState<PrintShopShippingConfig | null>(null);
  useEffect(() => { if (query.data) setDraft({ ...query.data }); }, [query.data]);

  const mutation = useMutation({
    mutationFn: saveShipping,
    onSuccess: (shipping) => {
      setDraft({ ...shipping });
      queryClient.setQueryData(queryKey, shipping);
      void queryClient.invalidateQueries({ queryKey: ['/api/print-shop/catalog'] });
      toast({
        title: shipping.enabled ? 'Spedizione attivata' : 'Spedizione disattivata',
        description: shipping.enabled
          ? 'Costo e tempi sono ora disponibili nello shop stampe.'
          : 'I clienti potranno scegliere soltanto il ritiro in sede.',
      });
    },
    onError: (error) => toast({
      variant: 'destructive',
      title: 'Salvataggio non riuscito',
      description: error instanceof Error ? error.message : 'Controlla i dati e riprova.',
    }),
  });

  const errors = !draft ? [] : [
    ...(!Number.isInteger(draft.priceCents) || draft.priceCents < 0 ? ['Inserisci un costo valido.'] : []),
    ...(!Number.isInteger(draft.estimatedMinDays) || draft.estimatedMinDays < 1 ? ['Inserisci i giorni minimi.'] : []),
    ...(!Number.isInteger(draft.estimatedMaxDays) || draft.estimatedMaxDays < draft.estimatedMinDays ? ['I giorni massimi devono essere uguali o superiori ai minimi.'] : []),
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-primary/10 p-2"><Truck className="h-5 w-5 text-primary" /></span>
          <div>
            <CardTitle>Spedizione delle stampe</CardTitle>
            <CardDescription className="mt-1">Decidi se mostrarla nello shop e imposta il costo che verrà aggiunto al totale PayPal.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {query.isLoading || !draft ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Caricamento…</div>
        ) : (
          <div className="max-w-2xl space-y-6">
            <div className="flex items-center justify-between gap-5 rounded-xl border p-4">
              <div>
                <Label htmlFor="print-shipping-enabled" className="text-base">Abilita la spedizione</Label>
                <p className="mt-1 text-sm text-muted-foreground">Se disattivata, nello shop resta disponibile soltanto il ritiro gratuito in sede.</p>
              </div>
              <Switch id="print-shipping-enabled" checked={draft.enabled} onCheckedChange={(enabled) => setDraft({ ...draft, enabled })} />
            </div>
            <div className="grid gap-5 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="print-shipping-price">Costo al cliente (€)</Label>
                <Input id="print-shipping-price" type="number" inputMode="decimal" min={0} step="0.01" value={draft.priceCents / 100} onChange={(event) => setDraft({ ...draft, priceCents: Math.max(0, Math.round((Number(event.target.value) || 0) * 100)) })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="print-shipping-min">Consegna minima (giorni)</Label>
                <Input id="print-shipping-min" type="number" min={1} max={60} value={draft.estimatedMinDays} onChange={(event) => setDraft({ ...draft, estimatedMinDays: Number(event.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="print-shipping-max">Consegna massima (giorni)</Label>
                <Input id="print-shipping-max" type="number" min={1} max={90} value={draft.estimatedMaxDays} onChange={(event) => setDraft({ ...draft, estimatedMaxDays: Number(event.target.value) })} />
              </div>
            </div>
            {errors.length > 0 && <p className="text-sm font-medium text-destructive" role="alert">{errors[0]}</p>}
            <Button type="button" disabled={errors.length > 0 || mutation.isPending} onClick={() => mutation.mutate(draft)}>
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salva configurazione
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
