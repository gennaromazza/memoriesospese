import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Eye, EyeOff, Loader2, Package, Pencil, Plus } from 'lucide-react';
import { formatShopPrice } from '@shared/shop-types';
import { shopApi } from '@/features/shop/shop-api';
import { shopProductRows } from '@/features/shop/shop-products-overview';
import { getAllProducts } from '@/lib/products';
import ProductsManager from '@/components/ProductsManager';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type Action = { kind: 'create' } | { kind: 'edit'; id: string } | { kind: 'catalog' };

/** Prodotti assegnati allo shop, con cosa manca a ciascuno; crea e modifica si fanno in una finestra. */
export default function ShopProductsPanel() {
  const queryClient = useQueryClient();
  const [action, setAction] = useState<Action | null>(null);
  const settingsQuery = useQuery({ queryKey: ['shop-admin-settings'], queryFn: shopApi.getSettings, staleTime: 30_000 });
  const productsQuery = useQuery({ queryKey: ['shop-admin-products'], queryFn: getAllProducts });

  const settings = settingsQuery.data;
  const rows = settings && productsQuery.data ? shopProductRows(productsQuery.data, settings.categoryValues, settings.shipping.enabled) : [];
  const refresh = () => {
    void productsQuery.refetch();
    void queryClient.invalidateQueries({ queryKey: ['shop-catalog'] });
    // Dopo aver creato o modificato un solo prodotto si torna all'elenco; il catalogo intero resta aperto.
    setAction(current => (current?.kind === 'catalog' ? current : null));
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-primary/10 p-2"><Package className="h-5 w-5 text-primary" /></span>
            <div>
              <CardTitle>Prodotti dello shop</CardTitle>
              <CardDescription className="mt-1">
                I prodotti attivi delle categorie scelte nelle impostazioni compaiono in vetrina entro pochi secondi.
              </CardDescription>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setAction({ kind: 'catalog' })}>Tutto il catalogo</Button>
            <Button type="button" onClick={() => setAction({ kind: 'create' })}><Plus className="mr-1 h-4 w-4" aria-hidden="true" />Nuovo prodotto</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {settingsQuery.isLoading || productsQuery.isLoading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Caricamento…</div>
        ) : settingsQuery.isError || productsQuery.isError ? (
          <p className="text-sm text-destructive">Non riesco a caricare i prodotti. Riprova tra poco.</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nessun prodotto nelle categorie dello shop. Crea un prodotto e mettilo in una delle categorie scelte nelle impostazioni.
          </p>
        ) : (
          <ul className="space-y-3">
            {rows.map(({ product, visible, notes }) => (
              <li key={product.id} className="flex flex-wrap items-center gap-4 rounded-xl border p-3">
                {product.immagini?.[0] ? (
                  <img src={product.immagini[0]} alt="" className="h-16 w-16 rounded-lg object-cover" loading="lazy" />
                ) : (
                  <span className="flex h-16 w-16 items-center justify-center rounded-lg bg-muted"><Package className="h-6 w-6 text-muted-foreground" aria-hidden="true" /></span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {product.nome}
                    <Badge variant={visible ? 'default' : 'secondary'} className="gap-1">
                      {visible ? <Eye className="h-3 w-3" aria-hidden="true" /> : <EyeOff className="h-3 w-3" aria-hidden="true" />}
                      {visible ? 'In vetrina' : 'Nascosto'}
                    </Badge>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatShopPrice(Math.round((product.prezzoFinale ?? product.prezzo) * 100))}
                    {product.sconto > 0 ? ` (sconto ${product.sconto}%)` : ''}
                    {' · '}{product.numeroFoto > 0 ? `${product.numeroFoto} foto da caricare` : 'nessuna foto richiesta'}
                    {' · '}{product.pesoGrammi && product.pesoGrammi > 0 ? `${product.pesoGrammi} g` : 'peso non indicato'}
                  </p>
                  {notes.map(note => (
                    <p key={note} className="mt-1 flex items-center gap-1 text-xs text-amber-700"><AlertTriangle className="h-3 w-3" aria-hidden="true" />{note}</p>
                  ))}
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setAction({ kind: 'edit', id: product.id })}>
                  <Pencil className="mr-1 h-4 w-4" aria-hidden="true" />Modifica
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={action !== null} onOpenChange={open => { if (!open) setAction(null); }}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{action?.kind === 'create' ? 'Nuovo prodotto' : action?.kind === 'edit' ? 'Modifica prodotto' : 'Catalogo prodotti'}</DialogTitle>
            <DialogDescription>
              Metti il prodotto in una delle categorie dello shop per farlo comparire in vetrina. Indica le foto da caricare e il peso per la spedizione.
            </DialogDescription>
          </DialogHeader>
          {action ? (
            <ProductsManager
              autoCreate={action.kind === 'create'}
              autoEditId={action.kind === 'edit' ? action.id : undefined}
              onChanged={refresh}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
