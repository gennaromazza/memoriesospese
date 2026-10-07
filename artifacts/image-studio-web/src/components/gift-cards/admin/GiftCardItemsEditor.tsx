import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { GIFT_CARD_MAX_ITEMS, GIFT_CARD_MAX_ITEM_QUANTITY, type GiftCardItemInput } from '@shared/gift-card-types';
import { getAllProducts } from '@/lib/products';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const euro = (value: number) => `${value.toFixed(2).replace('.', ',')} €`;

interface Props {
  items: GiftCardItemInput[];
  onChange: (items: GiftCardItemInput[]) => void;
  /** Propone il totale del catalogo (in centesimi) come prezzo del regalo. */
  onUseTotal: (cents: number) => void;
}

/** Sceglie dal catalogo centrale i prodotti inclusi nel regalo. Prezzi visibili solo qui, allo studio. */
export default function GiftCardItemsEditor({ items, onChange, onUseTotal }: Props) {
  const products = useQuery({ queryKey: ['gift-card-products'], queryFn: getAllProducts, staleTime: 60_000 });
  const [pick, setPick] = useState('');
  const [quantity, setQuantity] = useState('1');

  const byId = useMemo(() => new Map((products.data ?? []).map(product => [product.id, product])), [products.data]);
  const available = (products.data ?? []).filter(product => product.attivo !== false && !items.some(item => item.productId === product.id));
  const totalCents = items.reduce((sum, item) => sum + Math.round((byId.get(item.productId)?.prezzoFinale ?? 0) * 100) * item.quantity, 0);

  const add = () => {
    const qty = Math.min(GIFT_CARD_MAX_ITEM_QUANTITY, Math.max(1, Math.floor(Number(quantity) || 1)));
    if (!pick || items.length >= GIFT_CARD_MAX_ITEMS) return;
    onChange([...items, { productId: pick, quantity: qty }]);
    setPick('');
    setQuantity('1');
  };

  return (
    <fieldset className="space-y-3 rounded-lg border p-4">
      <legend className="px-1 text-sm font-semibold">Prodotti del catalogo inclusi</legend>
      <p className="text-xs text-muted-foreground">
        Chi riceve il regalo vede nome, descrizione e foto presi dal catalogo, senza il prezzo. Se aggiorni il prodotto, la pagina del regalo si aggiorna.
      </p>

      {items.length ? (
        <ul className="space-y-2">
          {items.map(item => {
            const product = byId.get(item.productId);
            return (
              <li key={item.productId} className="flex flex-wrap items-center gap-3 rounded-md bg-muted/40 p-2 text-sm">
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
        <p className="text-sm text-muted-foreground">Nessun prodotto: il regalo mostrerà solo il testo «Cosa include».</p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1 space-y-1.5">
          <Label htmlFor="gct-product">Aggiungi un prodotto</Label>
          <Select value={pick} onValueChange={setPick}>
            <SelectTrigger id="gct-product"><SelectValue placeholder={products.isLoading ? 'Carico il catalogo…' : 'Scegli dal catalogo'} /></SelectTrigger>
            <SelectContent>
              {available.map(product => (
                <SelectItem key={product.id} value={product.id}>{product.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-20 space-y-1.5">
          <Label htmlFor="gct-qty">Quantità</Label>
          <Input id="gct-qty" type="number" min={1} max={GIFT_CARD_MAX_ITEM_QUANTITY} value={quantity} onChange={event => setQuantity(event.target.value)} />
        </div>
        <Button type="button" variant="outline" disabled={!pick || items.length >= GIFT_CARD_MAX_ITEMS} onClick={add}>Aggiungi</Button>
      </div>
      {products.isError ? <p className="text-xs text-red-600">Impossibile caricare il catalogo prodotti.</p> : null}

      {items.length ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-sm">
          <span>Valore a catalogo: <b>{euro(totalCents / 100)}</b> <span className="text-xs text-muted-foreground">(solo per te)</span></span>
          <Button type="button" size="sm" variant="secondary" disabled={totalCents <= 0} onClick={() => onUseTotal(totalCents)}>
            Usa il totale come prezzo
          </Button>
        </div>
      ) : null}
    </fieldset>
  );
}
