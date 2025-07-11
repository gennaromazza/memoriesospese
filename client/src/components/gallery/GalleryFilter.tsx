import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar, Clock, Filter } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

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
  // State for all filters
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [startTime, setStartTime] = useState<string>('');
  const [endTime, setEndTime] = useState<string>('');
  const [isOpen, setIsOpen] = useState(false);
  
  // Update filters when any filter changes
  useEffect(() => {
    onFilterChange({
      sortOrder,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      startTime: startTime || undefined,
      endTime: endTime || undefined
    });
  }, [sortOrder, startDate, endDate, startTime, endTime, onFilterChange]);
  
  const handleReset = () => {
    setSortOrder('newest');
    setStartDate('');
    setEndDate('');
    setStartTime('');
    setEndTime('');
    resetFilters();
    setIsOpen(false);
  };
  
  return (
    <div className="mb-6">
      <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
        <h3 className="text-lg font-medium text-blue-gray-800">
          {totalPhotos} foto {activeFilters ? '(filtrate)' : ''}
        </h3>
        
        <div className="flex gap-2 items-center">
          {activeFilters && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
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
          
          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className={activeFilters ? 'bg-sage-50 border-sage-300' : ''}
              >
                <Filter className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Filtri avanzati</SheetTitle>
                <SheetDescription>
                  Filtra le foto per data e orario
                </SheetDescription>
              </SheetHeader>
              
              <div className="mt-6 space-y-6">
                {/* Filtri per data */}
                <div className="space-y-4">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Filtra per data
                  </h4>
                  
                  <div className="space-y-2">
                    <Label htmlFor="startDate">Data inizio</Label>
                    <Input
                      id="startDate"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      max={endDate || undefined}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="endDate">Data fine</Label>
                    <Input
                      id="endDate"
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      min={startDate || undefined}
                    />
                  </div>
                </div>
                
                {/* Filtri per orario */}
                <div className="space-y-4">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Filtra per orario
                  </h4>
                  
                  <div className="space-y-2">
                    <Label htmlFor="startTime">Ora inizio</Label>
                    <Input
                      id="startTime"
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="endTime">Ora fine</Label>
                    <Input
                      id="endTime"
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                    />
                  </div>
                </div>
                
                {/* Pulsanti azione */}
                <div className="flex gap-2 pt-4">
                  <Button
                    variant="outline"
                    onClick={handleReset}
                    className="flex-1"
                  >
                    Reset
                  </Button>
                  <Button
                    onClick={() => setIsOpen(false)}
                    className="flex-1 bg-sage hover:bg-sage/90"
                  >
                    Applica
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </div>
  );
};

export default GalleryFilter;