/**
 * ProductSelector - Componente riutilizzabile per selezione prodotti
 * Include filtro per categoria e ricerca testuale
 */

import { useState, useMemo, useEffect } from 'react';
import type { Product, ProductCategory } from '@shared/booking-types';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, Filter, Package } from 'lucide-react';

interface ProductSelectorProps {
  products: Product[];
  categories: ProductCategory[];
  onSelectProduct: (productId: string) => void;
  placeholder?: string;
  disabled?: boolean;
  defaultCategory?: string; // Categoria preselezionata di default
}

export default function ProductSelector({
  products,
  categories,
  onSelectProduct,
  placeholder = "Seleziona prodotto...",
  disabled = false,
  defaultCategory = 'all',
}: ProductSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>(defaultCategory);
  
  // Aggiorna categoria quando cambia defaultCategory (es. cambio campagna)
  useEffect(() => {
    setSelectedCategory(defaultCategory);
  }, [defaultCategory]);

  // Filtra prodotti per categoria e ricerca
  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      // Filtro per categoria
      if (selectedCategory !== 'all' && product.categoria !== selectedCategory) {
        return false;
      }
      
      // Filtro per ricerca testuale
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesName = product.nome.toLowerCase().includes(query);
        const matchesDesc = product.descrizione?.toLowerCase().includes(query);
        return matchesName || matchesDesc;
      }
      
      return true;
    });
  }, [products, selectedCategory, searchQuery]);

  // Raggruppa prodotti per categoria per visualizzazione
  const groupedProducts = useMemo(() => {
    const groups: Record<string, Product[]> = {};
    
    filteredProducts.forEach(product => {
      const cat = product.categoria || 'altro';
      if (!groups[cat]) {
        groups[cat] = [];
      }
      groups[cat].push(product);
    });
    
    return groups;
  }, [filteredProducts]);

  // Ordina categorie per displayOrder
  const sortedCategories = useMemo(() => {
    return [...categories].sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
  }, [categories]);

  // Ottieni nome categoria dal value
  const getCategoryName = (value: string): string => {
    const cat = categories.find(c => c.value === value);
    return cat?.nome || value;
  };

  // Handler selezione prodotto
  const handleSelectProduct = (productId: string) => {
    onSelectProduct(productId);
    // Reset filtri dopo selezione
    setSearchQuery('');
  };

  // Calcola info prodotto per visualizzazione
  const getProductDisplayText = (product: Product): string => {
    const totalPhotos = product.isBundle && product.bundleItems && product.bundleItems.length > 0
      ? product.bundleItems.reduce((sum, bi) => sum + (bi.numeroFoto || 0) * (bi.quantita || 1), 0)
      : product.numeroFoto;
    const photoText = totalPhotos > 0 ? `${totalPhotos} foto` : '∞';
    
    if (product.isBundle && product.bundleItems && product.bundleItems.length > 0) {
      // Per bundle: mostra nome + prodotti inclusi
      const bundleItemNames = product.bundleItems.map(bi => bi.prodottoNome).join(', ');
      return `📦 ${product.nome} - €${product.prezzoFinale} (${photoText}) → ${bundleItemNames}`;
    }
    
    return `${product.nome} - €${product.prezzoFinale} (${photoText})`;
  };

  return (
    <div className="space-y-2">
      {/* Riga filtri: Categoria + Ricerca */}
      <div className="flex gap-2">
        {/* Filtro Categoria */}
        <Select 
          value={selectedCategory} 
          onValueChange={setSelectedCategory}
          disabled={disabled}
        >
          <SelectTrigger className="w-[180px]">
            <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte le categorie</SelectItem>
            {sortedCategories.filter(c => c.attivo).map(category => (
              <SelectItem key={category.id} value={category.value}>
                {category.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Ricerca testuale */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Cerca prodotto..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            disabled={disabled}
          />
        </div>
      </div>

      {/* Select Prodotto con prodotti filtrati */}
      <Select onValueChange={handleSelectProduct} disabled={disabled}>
        <SelectTrigger className="w-full">
          <Package className="w-4 h-4 mr-2 text-muted-foreground" />
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="max-h-[300px]">
          {filteredProducts.length === 0 ? (
            <div className="px-2 py-4 text-sm text-muted-foreground text-center">
              Nessun prodotto trovato
            </div>
          ) : selectedCategory === 'all' && !searchQuery.trim() ? (
            // Vista raggruppata per categoria
            Object.entries(groupedProducts).map(([categoryValue, categoryProducts]) => (
              <div key={categoryValue}>
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50 sticky top-0">
                  {getCategoryName(categoryValue)}
                </div>
                {categoryProducts.map(product => (
                  <SelectItem key={product.id} value={product.id}>
                    {getProductDisplayText(product)}
                  </SelectItem>
                ))}
              </div>
            ))
          ) : (
            // Vista lista semplice (quando filtrato)
            filteredProducts.map(product => (
              <SelectItem key={product.id} value={product.id}>
                {getProductDisplayText(product)}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>

      {/* Contatore risultati */}
      {(selectedCategory !== 'all' || searchQuery.trim()) && (
        <p className="text-xs text-muted-foreground">
          {filteredProducts.length} prodotti trovati
          {selectedCategory !== 'all' && ` in "${getCategoryName(selectedCategory)}"`}
          {searchQuery.trim() && ` per "${searchQuery}"`}
        </p>
      )}
    </div>
  );
}
