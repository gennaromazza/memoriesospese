/**
 * DATE INPUT
 * Input data con supporto tastiera + calendar picker
 * Formato: gg/mm/aaaa
 */

import { useState, useEffect } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { it } from 'date-fns/locale';

interface DateInputProps {
  value?: Date;
  onChange: (date: Date | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  'data-testid'?: string;
}

export function DateInput({
  value,
  onChange,
  placeholder = 'gg/mm/aaaa',
  disabled = false,
  className,
  'data-testid': testId,
}: DateInputProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState(false);

  // Sync input quando value cambia (es. da calendar picker)
  useEffect(() => {
    if (value) {
      const day = String(value.getDate()).padStart(2, '0');
      const month = String(value.getMonth() + 1).padStart(2, '0');
      const year = value.getFullYear();
      setInputValue(`${day}/${month}/${year}`);
      setError(false);
    } else {
      setInputValue('');
      setError(false);
    }
  }, [value]);

  // Parse input manuale
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);

    // Reset error se sta scrivendo
    if (error) setError(false);

    // Prova parsing se formato completo (10 chars: gg/mm/aaaa)
    if (val.length === 10) {
      const parsed = parseItalianDate(val);
      if (parsed) {
        onChange(parsed);
        setError(false);
      } else {
        setError(true);
      }
    } else if (val === '') {
      // Clear date se input vuoto
      onChange(undefined);
    }
  };

  // Blur: valida formato finale
  const handleInputBlur = () => {
    if (inputValue && inputValue.length > 0 && inputValue.length !== 10) {
      setError(true);
    }
  };

  // Supporto Enter per confermare
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const parsed = parseItalianDate(inputValue);
      if (parsed) {
        onChange(parsed);
        setError(false);
        // Close popover se aperto
        setOpen(false);
      } else if (inputValue) {
        setError(true);
      }
    } else if (e.key === 'Escape') {
      // Reset su Esc
      if (value) {
        const day = String(value.getDate()).padStart(2, '0');
        const month = String(value.getMonth() + 1).padStart(2, '0');
        const year = value.getFullYear();
        setInputValue(`${day}/${month}/${year}`);
      } else {
        setInputValue('');
      }
      setError(false);
      setOpen(false);
    }
  };

  return (
    <div className="flex gap-2">
      <Input
        type="text"
        placeholder={placeholder}
        value={inputValue}
        onChange={handleInputChange}
        onBlur={handleInputBlur}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={cn(
          'flex-1',
          error && 'border-destructive focus-visible:ring-destructive',
          className
        )}
        data-testid={testId}
        autoComplete="off"
      />
      
      <Popover open={open} onOpenChange={setOpen} modal={true}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className="px-3 min-h-[44px] min-w-[44px]"
            data-testid={testId ? `${testId}-calendar-button` : undefined}
            onClick={(e) => {
              e.stopPropagation();
              setOpen(!open);
            }}
          >
            <CalendarIcon className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent 
          className="w-auto p-0 z-[100]" 
          align="end"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Calendar
            mode="single"
            selected={value}
            onSelect={(date) => {
              onChange(date);
              setOpen(false);
            }}
            disabled={disabled}
            initialFocus
            locale={it}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

/**
 * Parse date formato italiano gg/mm/aaaa
 * Returns Date se valido, null altrimenti
 */
function parseItalianDate(dateStr: string): Date | null {
  if (!dateStr || typeof dateStr !== 'string') return null;

  // Accetta solo formato gg/mm/aaaa
  const regex = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
  const match = dateStr.match(regex);

  if (!match) return null;

  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);

  // Validazione range base
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (year < 1900 || year > 2100) return null;

  // Crea Date object (JS mese è 0-indexed)
  const date = new Date(year, month - 1, day);

  // Verifica che la data sia valida (es. 31/02/2024 non è valido)
  if (
    date.getDate() !== day ||
    date.getMonth() !== month - 1 ||
    date.getFullYear() !== year
  ) {
    return null;
  }

  return date;
}
