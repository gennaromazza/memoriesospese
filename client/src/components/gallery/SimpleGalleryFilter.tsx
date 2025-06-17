import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { X, CalendarIcon, SortAsc, SortDesc } from 'lucide-react';
import { format } from 'date-fns';

interface SimpleFilterProps {
  onFilterChange: (filters: SimpleFilterCriteria) => void;
  totalPhotos: number;
  activeFilters: boolean;
  resetFilters: () => void;
}

export interface SimpleFilterCriteria {
  date: Date | undefined;
  sortOrder: 'newest' | 'oldest' | 'name';
}

const SimpleGalleryFilter: React.FC<SimpleFilterProps> = ({ 
  onFilterChange, 
  totalPhotos,
  activeFilters,
  resetFilters
}) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'name'>('newest');
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

  // Applica i filtri quando cambiano i valori
  useEffect(() => {
    onFilterChange({
      searchTerm,
      date: selectedDate,
      sortOrder
    });
  }, [searchTerm, selectedDate, sortOrder, onFilterChange]);

  const clearDate = () => {
    setSelectedDate(undefined);
  };

  const handleReset = () => {
    setSelectedDate(undefined);
    setSortOrder('newest');
    resetFilters();
  };

  const formatDisplayDate = (date: Date) => {
    return format(date, 'dd/MM/yyyy');
  };

  const getSortIcon = () => {
    if (sortOrder === 'newest') return <SortDesc className="w-4 h-4" />;
    if (sortOrder === 'oldest') return <SortAsc className="w-4 h-4" />;
    return <SortAsc className="w-4 h-4" />;
  };

  const getSortText = () => {
    if (sortOrder === 'newest') return 'Più recenti';
    if (sortOrder === 'oldest') return 'Più vecchie';
    return 'Per nome';
  };

  return (
    <div className="space-y-4">
      {/* Filtri rapidi */}
      <div className="flex flex-wrap gap-2">
        {/* Filtro data */}
        <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
          <PopoverTrigger asChild>
            <Button
              variant={selectedDate ? "default" : "outline"}
              size="sm"
              className="flex items-center gap-2"
            >
              <CalendarIcon className="w-4 h-4" />
              {selectedDate ? formatDisplayDate(selectedDate) : 'Filtra per data'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => {
                setSelectedDate(date);
                setIsDatePickerOpen(false);
              }}
              initialFocus
            />
            {selectedDate && (
              <div className="p-3 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    clearDate();
                    setIsDatePickerOpen(false);
                  }}
                  className="w-full"
                >
                  Rimuovi filtro data
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>

        {/* Ordinamento */}
        <Select value={sortOrder} onValueChange={(value: 'newest' | 'oldest' | 'name') => setSortOrder(value)}>
          <SelectTrigger className="w-auto">
            <div className="flex items-center gap-2">
              {getSortIcon()}
              <span>{getSortText()}</span>
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">
              <div className="flex items-center gap-2">
                <SortDesc className="w-4 h-4" />
                Più recenti prima
              </div>
            </SelectItem>
            <SelectItem value="oldest">
              <div className="flex items-center gap-2">
                <SortAsc className="w-4 h-4" />
                Più vecchie prima
              </div>
            </SelectItem>
            <SelectItem value="name">
              <div className="flex items-center gap-2">
                <SortAsc className="w-4 h-4" />
                Ordine alfabetico
              </div>
            </SelectItem>
          </SelectContent>
        </Select>

        {/* Pulsante reset - mostrato solo se ci sono filtri attivi */}
        {activeFilters && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            className="flex items-center gap-2 text-gray-600"
          >
            <X className="w-4 h-4" />
            Azzera filtri
          </Button>
        )}
      </div>

      {/* Contatore risultati */}
      <div className="text-sm text-gray-500">
        {activeFilters ? (
          <span>Risultati del filtro: {totalPhotos} foto</span>
        ) : (
          <span>Totale: {totalPhotos} foto</span>
        )}
      </div>
    </div>
  );
};

export default SimpleGalleryFilter;