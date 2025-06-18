import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface GalleryFilterProps {
  onFilterChange: (filters: FilterCriteria) => void;
  totalPhotos: number;
  activeFilters: boolean;
  resetFilters: () => void;
}

export interface FilterCriteria {
  sortOrder: 'newest' | 'oldest';
  startDate?: Date;
  endDate?: Date;
  startTime?: string;
  endTime?: string;
}

const GalleryFilter: React.FC<GalleryFilterProps> = ({ 
  onFilterChange, 
  totalPhotos,
  activeFilters,
  resetFilters
}) => {
  // State for sort order
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  
  // Update filters when sort order changes
  useEffect(() => {
    onFilterChange({
      sortOrder
    });
  }, [sortOrder, onFilterChange]);
  
  return (
    <div className="mb-6">
      <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
        <h3 className="text-lg font-medium text-blue-gray-800">
          {totalPhotos} foto {activeFilters ? '(filtrate)' : ''}
        </h3>
        
        <div className="flex gap-2">
          {activeFilters && (
            <Button
              variant="outline"
              size="sm"
              onClick={resetFilters}
              className="text-sm"
            >
              Rimuovi filtri
            </Button>
          )}
          
          <Select
            value={sortOrder}
            onValueChange={(value: 'newest' | 'oldest') => setSortOrder(value)}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Più recenti prima</SelectItem>
              <SelectItem value="oldest">Più vecchie prima</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
};

export default GalleryFilter;