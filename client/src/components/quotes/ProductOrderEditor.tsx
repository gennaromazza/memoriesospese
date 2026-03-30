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
import { GripVertical, ArrowUpDown, Tag } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export interface OrderableProduct {
  key: string;
  nome: string;
  prezzo: number;
  isOmaggio?: boolean;
  isFromCatalog?: boolean;
  sezione?: string;
}

interface SortableRowProps {
  product: OrderableProduct;
  index: number;
  onSectionChange?: (key: string, sezione: string) => void;
  sectionSuggestions?: string[];
}

function SortableRow({ product, index, onSectionChange, sectionSuggestions }: SortableRowProps) {
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

  useEffect(() => {
    setDraft(product.sezione || '');
  }, [product.sezione]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commitEdit = () => {
    setEditing(false);
    if (onSectionChange) onSectionChange(product.key, draft.trim());
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 'auto',
  };

  const formatPrice = (p: number) =>
    product.isOmaggio ? '✓ Incluso' : `€${p.toLocaleString('it-IT', { minimumFractionDigits: 2 })}`;

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
      <span className={`text-sm font-semibold flex-shrink-0 ${product.isOmaggio ? 'text-emerald-600' : 'text-gray-700'}`}>
        {formatPrice(product.prezzo)}
      </span>
    </div>
  );
}

/**
 * Group items using the same algorithm as the client portal:
 * null-section group first, then named sections by first appearance.
 * Items within each group keep their relative order from `flat`.
 */
function groupItems(flat: OrderableProduct[]): OrderableProduct[] {
  const nullItems: OrderableProduct[] = [];
  const sections = new Map<string, OrderableProduct[]>();
  const sectionOrder: string[] = [];

  flat.forEach(p => {
    const key = p.sezione?.trim() || null;
    if (key === null) {
      nullItems.push(p);
    } else {
      if (!sections.has(key)) {
        sections.set(key, []);
        sectionOrder.push(key);
      }
      sections.get(key)!.push(p);
    }
  });

  return [...nullItems, ...sectionOrder.flatMap(k => sections.get(k)!)];
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
}

export default function ProductOrderEditor({ products, orderKeys, onOrderChange, onSectionChange, sectionSuggestions }: ProductOrderEditorProps) {
  const buildItems = (prods: OrderableProduct[], keys?: string[]): OrderableProduct[] => {
    if (!keys || keys.length === 0) return prods;
    const map = new Map(prods.map(p => [p.key, p]));
    const ordered = keys.map(k => map.get(k)).filter((p): p is OrderableProduct => !!p);
    prods.forEach(p => { if (!keys.includes(p.key)) ordered.push(p); });
    return ordered;
  };

  const [items, setItems] = useState<OrderableProduct[]>(() => buildItems(products, orderKeys));

  const userHasReordered = useRef(false);

  useEffect(() => {
    if (userHasReordered.current) return;
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

  // Grouped display order: null group first, then named sections by first appearance.
  // This mirrors the client portal grouping algorithm exactly.
  const groupedItems = useMemo(() => groupItems(items), [items]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIdx = groupedItems.findIndex(p => p.key === active.id);
      const newIdx = groupedItems.findIndex(p => p.key === over.id);
      const reordered = arrayMove(groupedItems, oldIdx, newIdx);
      userHasReordered.current = true;
      setItems(reordered);
      onOrderChange(reordered.map(p => p.key));
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
                  <SortableRow product={product} index={index} onSectionChange={onSectionChange} sectionSuggestions={sectionSuggestions} />
                </div>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
