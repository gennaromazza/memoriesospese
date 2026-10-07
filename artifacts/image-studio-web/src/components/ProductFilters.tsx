/**
 * ProductFilters - Barra filtri per lista prodotti
 * Usato per filtrare prodotti per categoria e ricerca testuale
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getActiveProductCategories } from '@/lib/product-categories';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, Filter } from 'lucide-react';
import type { Product, ProductCategory } from '@shared/booking-types';

interface ProductFiltersProps {
  products: Product[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  categoryFilter: string;
  onCategoryChange: (category: string) => void;
  compact?: boolean;
}

export function ProductFilters({
  products,
  searchQuery,
  onSearchChange,
  categoryFilter,
  onCategoryChange,
  compact = false,
}: ProductFiltersProps) {
  const { data: categories = [] } = useQuery<ProductCategory[]>({
    queryKey: ['product-categories', 'active'],
    queryFn: getActiveProductCategories,
  });

  const usedCategories = useMemo(() => {
    const usedCatValues = new Set(products.map(p => p.categoria));
    return categories.filter(cat => usedCatValues.has(cat.value));
  }, [products, categories]);

  const getCategoryDisplayName = (value: string): string => {
    const cat = categories.find(c => c.value === value);
    return cat?.nome || value;
  };

  return (
    <div className={`flex gap-2 ${compact ? '' : 'mb-3'}`}>
      <Select value={categoryFilter} onValueChange={onCategoryChange}>
        <SelectTrigger className={compact ? 'w-[140px]' : 'w-[160px]'}>
          <Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
          <SelectValue placeholder="Categoria">
            {categoryFilter === 'all' ? 'Tutte' : getCategoryDisplayName(categoryFilter)}
          </SelectValue>
        </SelectTrigger>
        <SelectContent position="popper" sideOffset={4} className="z-[9999]">
          <SelectItem value="all">Tutte le categorie</SelectItem>
          {usedCategories.map(cat => (
            <SelectItem key={cat.value} value={cat.value}>
              {cat.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="relative flex-1">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          placeholder="Cerca prodotto..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-8"
        />
      </div>
    </div>
  );
}

export function useProductFilter(products: Product[], searchQuery: string, categoryFilter: string): Product[] {
  return useMemo(() => {
    let filtered = products;

    if (categoryFilter !== 'all') {
      filtered = filtered.filter(p => p.categoria === categoryFilter);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(p =>
        p.nome.toLowerCase().includes(query) ||
        p.descrizione?.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [products, searchQuery, categoryFilter]);
}
