/**
 * CATALOG PRODUCT SELECTOR
 * Multi-select gallery for catalog products
 */

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getActiveProductCategories } from '@/lib/product-categories';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, Package, Euro, Image as ImageIcon } from 'lucide-react';
import type { Product } from '@shared/booking-types';

interface CatalogProductSelectorProps {
  selectedProductIds: string[];
  onSelectionChange: (productIds: string[]) => void;
  products: Product[];
}

export default function CatalogProductSelector({
  selectedProductIds,
  onSelectionChange,
  products
}: CatalogProductSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Query categorie configurate
  const { data: configuredCategories = [] } = useQuery({
    queryKey: ['product-categories', 'active'],
    queryFn: getActiveProductCategories
  });

  // Filter products
  const filteredProducts = useMemo(() => {
    let filtered = products.filter(p => p.attivo);

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(p =>
        p.nome?.toLowerCase().includes(query) ||
        p.descrizione?.toLowerCase().includes(query)
      );
    }

    // Category filter
    if (categoryFilter !== 'all') {
      filtered = filtered.filter(p => p.categoria === categoryFilter);
    }

    return filtered;
  }, [products, searchQuery, categoryFilter]);

  // Get unique categories usate dai prodotti (filtra solo quelle con almeno un prodotto)
  const usedCategories = useMemo(() => {
    const usedCatValues = new Set(products.map(p => p.categoria));
    return configuredCategories.filter(cat => usedCatValues.has(cat.value));
  }, [products, configuredCategories]);

  // Helper per ottenere il nome visualizzato della categoria
  const getCategoryDisplayName = (categoryValue: string) => {
    return configuredCategories.find(cat => cat.value === categoryValue)?.nome || categoryValue;
  };

  // Toggle product selection
  const toggleProduct = (productId: string) => {
    if (selectedProductIds.includes(productId)) {
      onSelectionChange(selectedProductIds.filter(id => id !== productId));
    } else {
      onSelectionChange([...selectedProductIds, productId]);
    }
  };

  // Calculate total
  const selectedTotal = useMemo(() => {
    return selectedProductIds.reduce((sum, id) => {
      const product = products.find(p => p.id === id);
      return sum + (product?.prezzoFinale || product?.prezzo || 0);
    }, 0);
  }, [selectedProductIds, products]);

  // Mappa categorie per display
  const categoryDisplayMap = useMemo(() => {
    const map: Record<string, string> = {};
    configuredCategories.forEach(cat => {
      map[cat.value] = cat.nome;
    });
    return map;
  }, [configuredCategories]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca prodotti..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-catalog"
          />
        </div>

        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-48" data-testid="select-category-filter">
            <SelectValue placeholder="Categoria">
              {categoryFilter === 'all'
                ? 'Tutte le categorie'
                : categoryDisplayMap[categoryFilter] || categoryFilter}
            </SelectValue>
          </SelectTrigger>
          <SelectContent position="popper" sideOffset={4} className="z-[9999]">
            <SelectItem value="all">Tutte le categorie</SelectItem>
            {configuredCategories.length === 0 ? (
              <SelectItem value="none" disabled>
                Nessuna categoria configurata
              </SelectItem>
            ) : (
              configuredCategories.map(category => (
                <SelectItem key={category.value} value={category.value}>
                  {category.nome}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>

      {/* Stats header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Package className="h-4 w-4" />
          <span>
            {selectedProductIds.length} di {filteredProducts.length} selezionati
          </span>
        </div>

        {selectedProductIds.length > 0 && (
          <div className="flex items-center gap-2 font-semibold text-primary">
            <Euro className="h-4 w-4" />
            <span data-testid="text-catalog-total">€{selectedTotal.toFixed(2)}</span>
          </div>
        )}
      </div>

      {/* Products grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[400px] overflow-y-auto pr-2">
        {filteredProducts.length === 0 ? (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Nessun prodotto trovato</p>
          </div>
        ) : (
          filteredProducts.map((product) => {
            const isSelected = selectedProductIds.includes(product.id);
            const priceToDisplay = product.prezzoFinale || product.prezzo;
            const categoryName = product.categoria
              ? (categoryDisplayMap[product.categoria] || product.categoria)
              : 'Altro';

            return (
              <Card
                key={product.id}
                className={`cursor-pointer transition-all hover:shadow-md ${
                  isSelected ? 'ring-2 ring-primary' : ''
                }`}
                onClick={() => toggleProduct(product.id)}
                data-testid={`card-catalog-product-${product.id}`}
              >
                <CardContent className="p-4">
                  {/* Image preview */}
                  <div className="relative mb-3 aspect-video bg-muted rounded-md overflow-hidden">
                    {product.immagini && product.immagini.length > 0 ? (
                      <div className="w-full h-full pointer-events-none">
                        <img
                          src={product.immagini[0]}
                          alt={product.nome}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
                      </div>
                    )}

                    {/* Checkbox overlay */}
                    <div className="absolute top-2 right-2">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleProduct(product.id)}
                        className="bg-white border-2"
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        data-testid={`checkbox-product-${product.id}`}
                      />
                    </div>

                    {/* Category badge */}
                    {product.categoria && (
                      <Badge
                        variant="secondary"
                        className="absolute bottom-2 left-2 text-xs"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {categoryName}
                      </Badge>
                    )}
                  </div>

                  {/* Product info */}
                  <div className="space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <Label className="text-sm font-semibold line-clamp-2 cursor-pointer">
                        {product.nome}
                      </Label>
                    </div>

                    {product.descrizione && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {product.descrizione}
                      </p>
                    )}

                    <div className="flex items-center justify-between pt-2">
                      {product.numeroFoto > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {product.numeroFoto} foto
                        </span>
                      )}

                      <div className="flex items-center gap-1">
                        {product.sconto > 0 && (
                          <span className="text-xs text-muted-foreground line-through">
                            €{product.prezzo}
                          </span>
                        )}
                        <span className="font-bold text-primary">
                          €{priceToDisplay.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}