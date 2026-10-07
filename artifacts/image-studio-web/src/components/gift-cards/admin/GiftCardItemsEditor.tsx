import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search, Trash2 } from 'lucide-react';
import { GIFT_CARD_MAX_ITEMS, GIFT_CARD_MAX_ITEM_QUANTITY, type GiftCardItemInput } from '@shared/gift-card-types';
import { getAllProducts, useActiveProductCategories } from '@/lib/products';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const euro = (value: number) => `${value.toFixed(2).replace('.', ',')} €`;
const ALL = '__all__';
const normalize = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const MAX_RESULTS = 30;

interface Props {
  items: GiftCardItemInput[];
  onChange: (items: GiftCardItemInput[]) => void;
  /** Propone il totale del catalogo (in centesimi) come prezzo del regalo. */
  onUseTotal: (cents: number) => void;
}

/** Sceglie dal catalogo centrale i prodotti inclusi nel regalo, con ricerca e categorie. Prezzi visibili solo qui, allo studio. */
export default function GiftCardItemsEditor({ items, onChange, onUseTotal }: Props) {
  const products = useQuery({ queryKey: ['gift-card-products'], queryFn: getAllProducts, staleTime: 60_000 });
  const categories = useActiveProductCategories();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState(ALL);

  const byId = useMemo(() => new Map((products.data ?? []).map(product => [product.id, product])), [products.data]);
  const categoryName = useMemo(() => new Map((categories.data ?? []).map(entry => [entry.value, entry.nome])), [categories.data]);

  const results = useMemo(() => {
    const needle = normalize(search);
    return (products.data ?? [])
      .filter(product => product.attivo !== false && !items.some(item => item.productId === product.id))
      .filter(product => category === ALL || product.categoria === category)
      .filter(product => !needle || normalize(`${product.nome} ${product.descrizione ?? ''}`).includes(needle));
  }, [products.data, items, category, search]);

  const totalCents = items.reduce((sum, item) => sum + Math.round((byId.get(item.productId)?.prezzoFinale ?? 0) * 100) * item.quantity, 0);
  const full = items.length >= GIFT_CARD_MAX_ITEMS;

  return (
    <div className="space-y-5">
      <section aria-labelledby="gci-chosen" className="space-y-2">
        <h4 id="gci-chosen" className="text-sm font-semibold">Nel regalo ({items.length})</h4>
        {items.length ? (
          <ul className="space-y-2">
            {items.map(item => {
              const product = byId.get(item.productId);
              return (
                <li key={item.productId} className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/40 p-2 text-sm">
                  {product?.immagini?.[0] ? <img src={product.immagini[0]} alt="" className="h-10 w-10 rounded object-cover" /> : <span className="h-10 w-10 rounded bg-muted" aria-hidden="true" />}
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{product?.nome ?? 'Prodotto non più nel catalogo'}</span>
                    {product ? <span className="block text-xs text-muted-foreground">{euro(product.prezzoFinale)} ciascuno · solo per te</span> : null}
                  </span>
                  <Input
                    aria-label={`Quantità di ${product?.nome ?? 'prodotto'}`}
                    className="w-20"
                    type="number"
                    min={1}
                    max={GIFT_CARD_MAX_ITEM_QUANTITY}
                    value={item.quantity}
                    onChange={event => onChange(items.map(entry => (entry.productId === item.productId
                      ? { ...entry, quantity: Math.min(GIFT_CARD_MAX_ITEM_QUANTITY, Math.max(1, Math.floor(Number(event.target.value) || 1))) }
                      : entry)))}
                  />
                  <Button type="button" size="icon" variant="ghost" aria-label={`Togli ${product?.nome ?? 'prodotto'}`} onClick={() => onChange(items.filter(entry => entry.productId !== item.productId))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nessun prodotto: il regalo mostrerà solo il testo che hai scritto. Puoi aggiungerli qui sotto.</p>
        )}
        {items.length ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-sm">
            <span>Valore a catalogo: <b>{euro(totalCents / 100)}</b> <span className="text-xs text-muted-foreground">(solo per te)</span></span>
            <Button type="button" size="sm" variant="secondary" disabled={totalCents <= 0} onClick={() => onUseTotal(totalCents)}>
              Usa il totale come prezzo
            </Button>
          </div>
        ) : null}
      </section>

      <section aria-labelledby="gci-add" className="space-y-3 rounded-lg border p-4">
        <h4 id="gci-add" className="text-sm font-semibold">Aggiungi dal catalogo</h4>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
          <div className="space-y-1.5">
            <Label htmlFor="gci-search">Cerca un prodotto</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input id="gci-search" className="pl-9" value={search} placeholder="Per esempio tela, album, foto di Natale" onChange={event => setSearch(event.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gci-cat">Categoria</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="gci-cat"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Tutte le categorie</SelectItem>
                {(categories.data ?? []).map(entry => (
                  <SelectItem key={entry.value} value={entry.value}>{entry.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {products.isLoading ? <p className="text-sm text-muted-foreground" role="status">Carico il catalogo…</p> : null}
        {products.isError ? <p className="text-sm text-red-600">Impossibile caricare il catalogo prodotti.</p> : null}
        {full ? <p className="text-xs text-amber-700">Hai raggiunto il massimo di {GIFT_CARD_MAX_ITEMS} prodotti.</p> : null}

        {products.data ? (
          results.length ? (
            <>
              <ul className="max-h-72 space-y-1 overflow-y-auto pr-1" aria-label="Risultati">
                {results.slice(0, MAX_RESULTS).map(product => (
                  <li key={product.id} className="flex items-center gap-3 rounded-md p-2 hover:bg-muted/50">
                    {product.immagini?.[0] ? <img src={product.immagini[0]} alt="" className="h-10 w-10 rounded object-cover" loading="lazy" /> : <span className="h-10 w-10 rounded bg-muted" aria-hidden="true" />}
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="block truncate font-medium">{product.nome}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {categoryName.get(product.categoria) ?? product.categoria} · {euro(product.prezzoFinale)}
                      </span>
                    </span>
                    <Button type="button" size="sm" variant="outline" disabled={full} onClick={() => onChange([...items, { productId: product.id, quantity: 1 }])}>
                      <Plus className="mr-1 h-4 w-4" />Aggiungi
                    </Button>
                  </li>
                ))}
              </ul>
              {results.length > MAX_RESULTS ? (
                <p className="text-xs text-muted-foreground">Mostro i primi {MAX_RESULTS} di {results.length}: restringi la ricerca o scegli una categoria.</p>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {search || category !== ALL ? 'Nessun prodotto corrisponde: prova un\'altra parola o categoria.' : 'Hai già aggiunto tutti i prodotti del catalogo.'}
            </p>
          )
        ) : null}
      </section>
    </div>
  );
}
