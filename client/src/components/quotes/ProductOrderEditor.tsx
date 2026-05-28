/**
 * ProductOrderEditor
 * Drag-and-drop panel to reorder a merged list of products (catalog + custom).
 * Used in both QuoteTemplatesManager and QuoteBuilder.
 *
 * Display grouping matches the client portal:
 *   1. Products without a section (null group) are shown first
 *   2. Named sections follow in first-appearance order
 * This ensures what the admin sees mirrors what the client will see.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, ArrowUpDown, Tag, RotateCcw, Gift } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export interface OrderableProduct {
  key: string;
  nome: string;
  prezzo: number;
  isOmaggio?: boolean;
  isFromCatalog?: boolean;
  sezione?: string;
  /** Solo per template variabili: se false, prodotto sempre incluso (Fisso) */
  selectable?: boolean;
  /** Prezzo originale del catalogo (listino). Se differisce da `prezzo` significa override attivo. */
  originalPrice?: number;
}

interface SortableRowProps {
  product: OrderableProduct;
  index: number;
  onSectionChange?: (key: string, sezione: string) => void;
  sectionSuggestions?: string[];
  onPriceChange?: (key: string, prezzo: number) => void;
  onSelectableChange?: (key: string, selectable: boolean) => void;
  /** Mostra il toggle Fisso/Extra (solo per template variabili) */
  showSelectableToggle?: boolean;
  /** Callback per riportare il prezzo al valore di listino (rimuove l'override) */
  onResetPrice?: (key: string) => void;
  /** Callback per marcare/smarcare il prodotto come Omaggio (forza prezzo=0 e sempre incluso) */
  onOmaggioChange?: (key: string, isOmaggio: boolean) => void;
}

function SortableRow({ product, index, onSectionChange, sectionSuggestions, onPriceChange, onSelectableChange, showSelectableToggle, onResetPrice, onOmaggioChange }: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: product.key });

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(product.sezione || '');
  const inputRef = useRef<HTMLInputElement>(null);

  // Stato editing prezzo inline
  const [editingPrice, setEditingPrice] = useState(false);
  const [priceDraft, setPriceDraft] = useState(String(product.prezzo ?? 0));
  const priceInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(product.sezione || '');
  }, [product.sezione]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    if (!editingPrice) setPriceDraft(String(product.prezzo ?? 0));
  }, [product.prezzo, editingPrice]);

  useEffect(() => {
    if (editingPrice) {
      priceInputRef.current?.focus();
      priceInputRef.current?.select();
    }
  }, [editingPrice]);

  const commitEdit = () => {
    setEditing(false);
    if (onSectionChange) onSectionChange(product.key, draft.trim());
  };

  const commitPriceEdit = () => {
    setEditingPrice(false);
    if (!onPriceChange) return;
    const parsed = parseFloat(priceDraft.replace(',', '.'));
    const next = isNaN(parsed) || parsed < 0 ? 0 : parsed;
    if (next !== product.prezzo) onPriceChange(product.key, next);
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 'auto',
  };

  const formatPrice = (p: number) =>
    product.isOmaggio ? '✓ Incluso' : `€${p.toLocaleString('it-IT', { minimumFractionDigits: 2 })}`;

  // Override prezzo attivo: il prezzo corrente differisce dal listino (tolleranza centesimi)
  const hasPriceOverride =
    product.originalPrice !== undefined &&
    Math.round((product.prezzo || 0) * 100) !== Math.round(product.originalPrice * 100);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg shadow-sm hover:border-sage/50 hover:shadow-md transition-all"
    >
      <span className="text-xs text-gray-400 w-5 text-center font-mono">{index + 1}</span>
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 flex-shrink-0 touch-none"
        aria-label="Trascina per riordinare"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="flex-1 text-sm font-medium text-gray-800 truncate">{product.nome}</span>

      {/* Sezione badge / editor — shown only when onSectionChange is provided */}
      {onSectionChange && (
        editing ? (
          <>
            <input
              ref={inputRef}
              type="text"
              list={`sezione-options-${product.key}`}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') { setEditing(false); setDraft(product.sezione || ''); } }}
              placeholder="Sezione..."
              className="w-28 text-xs border border-sage/40 rounded px-2 py-0.5 focus:outline-none focus:border-sage flex-shrink-0"
            />
            {sectionSuggestions && sectionSuggestions.length > 0 && (
              <datalist id={`sezione-options-${product.key}`}>
                {sectionSuggestions.map(s => <option key={s} value={s} />)}
              </datalist>
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            title="Modifica sezione"
            className={`flex items-center gap-1 text-xs rounded px-1.5 py-0.5 flex-shrink-0 transition-colors ${
              product.sezione?.trim()
                ? 'text-sage border border-sage/30 bg-sage/5 hover:bg-sage/10'
                : 'text-gray-400 border border-dashed border-gray-200 hover:border-sage/30'
            }`}
          >
            <Tag className="h-3 w-3" />
            <span className="max-w-[80px] truncate">{product.sezione?.trim() || 'Sezione'}</span>
          </button>
        )
      )}

      {product.isFromCatalog && (
        <Badge variant="outline" className="text-xs text-blue-600 border-blue-300 flex-shrink-0">catalogo</Badge>
      )}
      {product.isOmaggio && (
        <Badge className="text-xs bg-emerald-100 text-emerald-700 border-emerald-300 flex-shrink-0">incluso</Badge>
      )}

      {/* Toggle Omaggio — sempre disponibile quando onOmaggioChange è fornito */}
      {onOmaggioChange && (
        <button
          type="button"
          onClick={() => onOmaggioChange(product.key, !product.isOmaggio)}
          title={product.isOmaggio
            ? 'Prodotto in omaggio (clicca per rimuovere)'
            : 'Marca come omaggio (prezzo a 0, sempre incluso nel preventivo)'}
          className={`flex items-center gap-1 text-[10px] font-semibold rounded px-1.5 py-0.5 flex-shrink-0 transition-colors border ${
            product.isOmaggio
              ? 'bg-emerald-100 text-emerald-700 border-emerald-300 hover:bg-emerald-200'
              : 'bg-white text-gray-500 border-gray-200 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700'
          }`}
          data-testid={`button-toggle-omaggio-${product.key}`}
        >
          <Gift className="h-3 w-3" />
          {product.isOmaggio ? 'OMAGGIO' : 'Omaggio'}
        </button>
      )}

      {/* Toggle Fisso / Extra — solo per template variabili e prodotti non-omaggio */}
      {showSelectableToggle && onSelectableChange && !product.isOmaggio && (
        <button
          type="button"
          onClick={() => onSelectableChange(product.key, !(product.selectable !== false))}
          title={
            product.selectable === false
              ? 'Prodotto sempre incluso (clicca per renderlo opzionale)'
              : 'Prodotto opzionale, il cliente può deselezionarlo (clicca per renderlo sempre incluso)'
          }
          className={`text-[10px] font-semibold rounded px-1.5 py-0.5 flex-shrink-0 transition-colors border ${
            product.selectable === false
              ? 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200'
              : 'bg-sage/10 text-sage border-sage/30 hover:bg-sage/20'
          }`}
          data-testid={`button-toggle-selectable-${product.key}`}
        >
          {product.selectable === false ? '🔒 FISSO' : '✓ EXTRA'}
        </button>
      )}

      {/* Prezzo: input inline se onPriceChange è fornito e non è un omaggio, altrimenti label */}
      {onPriceChange && !product.isOmaggio ? (
        editingPrice ? (
          <div className="flex items-center gap-1 flex-shrink-0">
            <span className="text-sm text-gray-500">€</span>
            <input
              ref={priceInputRef}
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={priceDraft}
              onChange={(e) => setPriceDraft(e.target.value)}
              onBlur={commitPriceEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitPriceEdit();
                if (e.key === 'Escape') { setEditingPrice(false); setPriceDraft(String(product.prezzo ?? 0)); }
              }}
              className="w-20 text-sm font-semibold text-right border border-sage/40 rounded px-1.5 py-0.5 focus:outline-none focus:border-sage"
              data-testid={`input-price-${product.key}`}
            />
          </div>
        ) : (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Listino barrato + badge "modificato" + reset (solo se override attivo) */}
            {hasPriceOverride && (
              <>
                <span
                  className="text-xs text-gray-400 line-through"
                  title="Prezzo di listino"
                  data-testid={`text-list-price-${product.key}`}
                >
                  €{(product.originalPrice ?? 0).toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                </span>
                <Badge className="text-[10px] bg-amber-50 text-amber-700 border-amber-300 px-1 py-0">
                  modificato
                </Badge>
                {onResetPrice && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onResetPrice(product.key); }}
                    title="Ripristina prezzo di listino"
                    className="text-gray-400 hover:text-sage transition-colors p-0.5"
                    data-testid={`button-reset-price-${product.key}`}
                  >
                    <RotateCcw className="h-3 w-3" />
                  </button>
                )}
              </>
            )}
            <button
              type="button"
              onClick={() => setEditingPrice(true)}
              title={hasPriceOverride
                ? 'Prezzo modificato solo per questo template (clicca per modificare di nuovo)'
                : 'Clicca per modificare il prezzo (solo per questo template, il listino non viene toccato)'}
              className={`text-sm font-semibold hover:underline decoration-dotted underline-offset-2 ${
                hasPriceOverride ? 'text-amber-700 hover:text-amber-800' : 'text-gray-700 hover:text-sage'
              }`}
              data-testid={`button-edit-price-${product.key}`}
            >
              {formatPrice(product.prezzo)}
            </button>
          </div>
        )
      ) : (
        <span className={`text-sm font-semibold flex-shrink-0 ${product.isOmaggio ? 'text-emerald-600' : 'text-gray-700'}`}>
          {formatPrice(product.prezzo)}
        </span>
      )}
    </div>
  );
}

/**
 * Group items by section preserving the original order of first appearance.
 * Items within each group keep their relative order from `flat`.
 * Mirrors the public client view grouping (no forced null-first).
 */
function groupItems(flat: OrderableProduct[]): OrderableProduct[] {
  const sections = new Map<string | null, OrderableProduct[]>();
  const sectionOrder: (string | null)[] = [];

  flat.forEach(p => {
    const key = p.sezione?.trim() || null;
    if (!sections.has(key)) {
      sections.set(key, []);
      sectionOrder.push(key);
    }
    sections.get(key)!.push(p);
  });

  return sectionOrder.flatMap(k => sections.get(k)!);
}

interface ProductOrderEditorProps {
  products: OrderableProduct[];
  /** Keys già ordinati dall'esterno (per es. caricati da Firestore) */
  orderKeys?: string[];
  onOrderChange: (orderedKeys: string[]) => void;
  /** Se fornito, ogni riga mostra un badge sezione cliccabile per modificarla inline */
  onSectionChange?: (key: string, sezione: string) => void;
  /** Suggerimenti sezione per l'autocomplete inline (sezioni già usate nel preventivo) */
  sectionSuggestions?: string[];
  /** Se fornito, il prezzo diventa modificabile inline (override solo per questo template) */
  onPriceChange?: (key: string, prezzo: number) => void;
  /** Se fornito, mostra il toggle Fisso/Extra per marcare prodotti sempre inclusi */
  onSelectableChange?: (key: string, selectable: boolean) => void;
  /** Mostra il toggle Fisso/Extra (true solo per template di tipo variabile) */
  showSelectableToggle?: boolean;
  /** Se fornito, mostra il bottone "reset al listino" quando c'è override prezzo */
  onResetPrice?: (key: string) => void;
  /** Se fornito, mostra il toggle Omaggio per ogni prodotto */
  onOmaggioChange?: (key: string, isOmaggio: boolean) => void;
}

export default function ProductOrderEditor({ products, orderKeys, onOrderChange, onSectionChange, sectionSuggestions, onPriceChange, onSelectableChange, showSelectableToggle, onResetPrice, onOmaggioChange }: ProductOrderEditorProps) {
  const buildItems = (prods: OrderableProduct[], keys?: string[]): OrderableProduct[] => {
    if (!keys || keys.length === 0) return prods;
    const map = new Map(prods.map(p => [p.key, p]));
    const ordered = keys.map(k => map.get(k)).filter((p): p is OrderableProduct => !!p);
    prods.forEach(p => { if (!keys.includes(p.key)) ordered.push(p); });
    return ordered;
  };

  const [items, setItems] = useState<OrderableProduct[]>(() => buildItems(products, orderKeys));

  // Tracks the last orderKeys signature we've already applied (or just emitted via drag).
  // This lets us ignore the parent's echo of our own onOrderChange call, while still
  // accepting genuinely new orderKeys from the parent (e.g. template switch).
  const lastAppliedOrderKeysSig = useRef<string>(JSON.stringify(orderKeys || []));

  useEffect(() => {
    const sig = JSON.stringify(orderKeys || []);
    if (sig === lastAppliedOrderKeysSig.current) return;
    lastAppliedOrderKeysSig.current = sig;
    setItems(buildItems(products, orderKeys));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderKeys]);

  useEffect(() => {
    setItems(prev => {
      const prevKeys = prev.map(p => p.key);
      const newKeys = products.map(p => p.key);

      if (JSON.stringify(prevKeys.sort()) === JSON.stringify(newKeys.sort())) {
        return prev.map(item => {
          const updated = products.find(p => p.key === item.key);
          return updated ?? item;
        });
      }

      const existingInOrder = prev.filter(p => newKeys.includes(p.key));
      const addedItems = products.filter(p => !prevKeys.includes(p.key));
      const merged = [...existingInOrder, ...addedItems];

      return merged.map(item => {
        const updated = products.find(p => p.key === item.key);
        return updated ?? item;
      });
    });
  }, [products]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Grouped display: sections by first appearance (no forced null-first).
  // This mirrors the client portal grouping algorithm exactly.
  const groupedItems = useMemo(() => groupItems(items), [items]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIdx = groupedItems.findIndex(p => p.key === active.id);
      const newIdx = groupedItems.findIndex(p => p.key === over.id);
      const reordered = arrayMove(groupedItems, oldIdx, newIdx);
      const newKeys = reordered.map(p => p.key);
      // Record what we're about to emit so the parent's echo doesn't re-trigger the sync effect
      lastAppliedOrderKeysSig.current = JSON.stringify(newKeys);
      setItems(reordered);
      onOrderChange(newKeys);
    }
  };

  if (items.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <ArrowUpDown className="h-4 w-4 text-gray-500" />
        <span className="text-sm text-gray-600">
          Trascina per cambiare l'ordine in cui i clienti vedono i prodotti
        </span>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={groupedItems.map(p => p.key)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {groupedItems.map((product, index) => {
              const prev = index > 0 ? groupedItems[index - 1] : null;
              const currSezione = product.sezione?.trim() || null;
              const prevSezione = prev ? (prev.sezione?.trim() || null) : null;
              const isGroupStart = currSezione !== prevSezione;
              const showHeader = isGroupStart && currSezione !== null;
              return (
                <div key={product.key}>
                  {showHeader && (
                    <div className="flex items-center gap-2 pt-2 pb-1">
                      <div className="h-px flex-1 bg-sage/20" />
                      <span className="text-xs font-semibold text-sage uppercase tracking-wide px-2">{currSezione}</span>
                      <div className="h-px flex-1 bg-sage/20" />
                    </div>
                  )}
                  <SortableRow
                    product={product}
                    index={index}
                    onSectionChange={onSectionChange}
                    sectionSuggestions={sectionSuggestions}
                    onPriceChange={onPriceChange}
                    onSelectableChange={onSelectableChange}
                    showSelectableToggle={showSelectableToggle}
                    onResetPrice={onResetPrice}
                    onOmaggioChange={onOmaggioChange}
                  />
                </div>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
