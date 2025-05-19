import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { CalendarIcon, Clock, Filter } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface GalleryFilterProps {
  onFilterChange: (filters: FilterCriteria) => void;
  totalPhotos: number;
  activeFilters: boolean;
  resetFilters: () => void;
}

export interface FilterCriteria {
  startDate: Date | undefined;
  endDate: Date | undefined;
  startTime: string | undefined;
  endTime: string | undefined;
  sortOrder: 'newest' | 'oldest';
}

const GalleryFilter: React.FC<GalleryFilterProps> = ({ 
  onFilterChange, 
  totalPhotos,
  activeFilters,
  resetFilters
}) => {
  // Stati per i vari filtri
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [startTime, setStartTime] = useState<string | undefined>(undefined);
  const [endTime, setEndTime] = useState<string | undefined>(undefined);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  
  // Genera le opzioni orarie per i selettori
  const generateTimeOptions = () => {
    const options = [];
    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const formattedHour = hour.toString().padStart(2, '0');
        const formattedMinute = minute.toString().padStart(2, '0');
        options.push(`${formattedHour}:${formattedMinute}`);
      }
    }
    return options;
  };
  
  const timeOptions = generateTimeOptions();
  
  // Aggiorna i filtri quando cambiano
  useEffect(() => {
    onFilterChange({
      startDate,
      endDate,
      startTime,
      endTime,
      sortOrder
    });
  }, [startDate, endDate, startTime, endTime, sortOrder, onFilterChange]);
  
  // Formatta la data per la visualizzazione
  const formatDisplayDate = (date: Date | undefined) => {
    if (!date) return '';
    return format(date, 'dd/MM/yyyy', { locale: it });
  };
  
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
          
          <Popover open={isFilterOpen} onOpenChange={setIsFilterOpen}>
            <PopoverTrigger asChild>
              <Button
                variant={activeFilters ? "default" : "outline"}
                size="sm"
                className={activeFilters ? "bg-blue-gray-600 hover:bg-blue-gray-700" : ""}
              >
                <Filter className="w-4 h-4 mr-2" />
                Filtra per data
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-4" align="end">
              <div className="space-y-4">
                <h4 className="font-medium text-sm mb-2">Filtra per data</h4>
                
                {/* Data inizio */}
                <div className="space-y-2">
                  <Label htmlFor="startDate">Data inizio</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-start text-left font-normal"
                        id="startDate"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {startDate ? (
                          formatDisplayDate(startDate)
                        ) : (
                          <span>Seleziona data iniziale</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={startDate}
                        onSelect={setStartDate}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                
                {/* Data fine */}
                <div className="space-y-2">
                  <Label htmlFor="endDate">Data fine</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-start text-left font-normal"
                        id="endDate"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {endDate ? (
                          formatDisplayDate(endDate)
                        ) : (
                          <span>Seleziona data finale</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={endDate}
                        onSelect={setEndDate}
                        initialFocus
                        disabled={(date) => 
                          startDate ? date < startDate : false
                        }
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                
                <Separator />
                
                {/* Ora inizio */}
                <div className="space-y-2">
                  <Label htmlFor="startTime">Ora inizio</Label>
                  <Select
                    value={startTime}
                    onValueChange={setStartTime}
                  >
                    <SelectTrigger id="startTime" className="w-full">
                      <SelectValue placeholder="Qualsiasi ora" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Qualsiasi ora</SelectItem>
                      {timeOptions.map(time => (
                        <SelectItem key={time} value={time}>
                          {time}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {/* Ora fine */}
                <div className="space-y-2">
                  <Label htmlFor="endTime">Ora fine</Label>
                  <Select
                    value={endTime}
                    onValueChange={setEndTime}
                  >
                    <SelectTrigger id="endTime" className="w-full">
                      <SelectValue placeholder="Qualsiasi ora" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Qualsiasi ora</SelectItem>
                      {timeOptions.map(time => (
                        <SelectItem key={time} value={time}>
                          {time}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <Separator />
                
                {/* Ordinamento */}
                <div className="space-y-2">
                  <Label htmlFor="sortOrder">Ordina per</Label>
                  <Select
                    value={sortOrder}
                    onValueChange={(value: 'newest' | 'oldest') => setSortOrder(value)}
                  >
                    <SelectTrigger id="sortOrder" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="newest">Più recenti prima</SelectItem>
                      <SelectItem value="oldest">Più vecchie prima</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {/* Pulsanti azione */}
                <div className="flex justify-between pt-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      setStartDate(undefined);
                      setEndDate(undefined);
                      setStartTime(undefined);
                      setEndTime(undefined);
                      setSortOrder('newest');
                    }}
                  >
                    Azzera
                  </Button>
                  <Button 
                    size="sm"
                    onClick={() => setIsFilterOpen(false)}
                  >
                    Applica filtri
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );
};

export default GalleryFilter;