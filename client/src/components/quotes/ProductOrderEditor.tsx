/**
 * ProductOrderEditor
 * Drag-and-drop panel to reorder a merged list of products (catalog + custom).
 * Used in both QuoteTemplatesManager and QuoteBuilder.
 */
import { useEffect, useRef, useState } from 'react';
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
import { GripVertical, ArrowUpDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export interface OrderableProduct {
  key: string;
  nome: string;
  prezzo: number;
  isOmaggio?: boolean;
  isFromCatalog?: boolean;
}

interface SortableRowProps {
  product: OrderableProduct;
  index: number;
}

function SortableRow({ product, index }: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: product.key });

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

interface ProductOrderEditorProps {
  products: OrderableProduct[];
  /** Keys già ordinati dall'esterno (per es. caricati da Firestore) */
  orderKeys?: string[];
  onOrderChange: (orderedKeys: string[]) => void;
}

export default function ProductOrderEditor({ products, orderKeys, onOrderChange }: ProductOrderEditorProps) {
  // Inizializza con l'ordine esterno se disponibile, altrimenti usa l'ordine di products
  const buildItems = (prods: OrderableProduct[], keys?: string[]): OrderableProduct[] => {
    if (!keys || keys.length === 0) return prods;
    const map = new Map(prods.map(p => [p.key, p]));
    const ordered = keys.map(k => map.get(k)).filter((p): p is OrderableProduct => !!p);
    // Aggiungi prodotti nuovi non ancora in keys
    prods.forEach(p => { if (!keys.includes(p.key)) ordered.push(p); });
    return ordered;
  };

  const [items, setItems] = useState<OrderableProduct[]>(() => buildItems(products, orderKeys));

  // Traccia se l'utente ha già trascinato (per evitare override indesiderati)
  const userHasReordered = useRef(false);

  // Quando arrivano nuovi orderKeys (inizializzazione da Firestore), applica l'ordine
  // solo se l'utente NON ha già trascinato nella sessione corrente
  useEffect(() => {
    if (userHasReordered.current) return;
    setItems(buildItems(products, orderKeys));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderKeys]);

  // Quando products cambia (prodotto aggiunto/rimosso/rinominato dall'esterno)
  useEffect(() => {
    setItems(prev => {
      const prevKeys = prev.map(p => p.key);
      const newKeys = products.map(p => p.key);

      // Same keys → aggiorna solo i dati (nome/prezzo)
      if (JSON.stringify(prevKeys.sort()) === JSON.stringify(newKeys.sort())) {
        return prev.map(item => {
          const updated = products.find(p => p.key === item.key);
          return updated ?? item;
        });
      }

      // Nuovi prodotti: preserva ordine utente, aggiungi in coda, rimuovi quelli usciti
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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setItems(prev => {
        const oldIdx = prev.findIndex(p => p.key === active.id);
        const newIdx = prev.findIndex(p => p.key === over.id);
        const reordered = arrayMove(prev, oldIdx, newIdx);
        userHasReordered.current = true;
        onOrderChange(reordered.map(p => p.key));
        return reordered;
      });
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
        <SortableContext items={items.map(p => p.key)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {items.map((product, index) => (
              <SortableRow key={product.key} product={product} index={index} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
