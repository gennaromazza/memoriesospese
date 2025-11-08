import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Plus, User } from 'lucide-react';
import { filterClienti, getClienteById } from '@/lib/clienti';
import type { Cliente } from '@shared/clienti-types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';

interface ClientAutocompleteProps {
  value?: string;
  onSelect: (cliente: Cliente | null) => void;
  onAddNew?: () => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function ClientAutocomplete({
  value,
  onSelect,
  onAddNew,
  placeholder = 'Cerca cliente...',
  disabled = false,
  className
}: ClientAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data: preselectedCliente } = useQuery({
    queryKey: ['clienti', 'byId', value],
    queryFn: async () => {
      if (!value) return null;
      return getClienteById(value);
    },
    enabled: !!value && (!selectedCliente || selectedCliente.id !== value)
  });

  const { data: clienti = [], isLoading } = useQuery({
    queryKey: ['clienti', 'search', debouncedSearch],
    queryFn: async () => {
      if (!debouncedSearch || debouncedSearch.length < 2) {
        return [];
      }
      return filterClienti({ searchQuery: debouncedSearch });
    },
    enabled: debouncedSearch.length >= 2
  });

  useEffect(() => {
    if (value) {
      if (preselectedCliente && preselectedCliente.id === value) {
        setSelectedCliente(preselectedCliente);
      } else {
        const cliente = clienti.find(c => c.id === value);
        if (cliente) {
          setSelectedCliente(cliente);
        }
      }
    } else if (selectedCliente && !value) {
      setSelectedCliente(null);
    }
  }, [value, clienti, preselectedCliente, selectedCliente]);

  const handleSelect = (cliente: Cliente) => {
    setSelectedCliente(cliente);
    onSelect(cliente);
    setOpen(false);
    setSearchQuery('');
  };

  const handleClear = () => {
    setSelectedCliente(null);
    onSelect(null);
    setSearchQuery('');
  };

  const handleAddNew = () => {
    setOpen(false);
    if (onAddNew) {
      onAddNew();
    }
  };

  const displayValue = selectedCliente
    ? `${selectedCliente.nome} ${selectedCliente.cognome}`
    : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('w-full justify-between', className)}
          data-testid="button-client-autocomplete"
        >
          <span className={cn('truncate', !selectedCliente && 'text-muted-foreground')}>
            {displayValue}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Cerca per nome, email o telefono..."
            value={searchQuery}
            onValueChange={setSearchQuery}
            data-testid="input-search-cliente"
          />
          <CommandList>
            {isLoading && (
              <div className="p-2 space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            )}

            {!isLoading && debouncedSearch.length < 2 && (
              <CommandEmpty>
                Digita almeno 2 caratteri per cercare
              </CommandEmpty>
            )}

            {!isLoading && debouncedSearch.length >= 2 && clienti.length === 0 && (
              <CommandEmpty>
                Nessun cliente trovato
              </CommandEmpty>
            )}

            {!isLoading && clienti.length > 0 && (
              <CommandGroup>
                {selectedCliente && (
                  <>
                    <CommandItem
                      key="clear"
                      onSelect={handleClear}
                      className="text-muted-foreground italic"
                      data-testid="option-clear-selection"
                    >
                      Deseleziona cliente
                    </CommandItem>
                    <CommandSeparator />
                  </>
                )}
                {clienti.map(cliente => (
                  <CommandItem
                    key={cliente.id}
                    value={cliente.id}
                    onSelect={() => handleSelect(cliente)}
                    data-testid={`option-cliente-${cliente.id}`}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        selectedCliente?.id === cliente.id ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <User className="mr-2 h-4 w-4 text-muted-foreground" />
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {cliente.nome} {cliente.cognome}
                      </span>
                      <span className="text-xs text-muted-foreground">{cliente.email}</span>
                      {cliente.cellulare1 && (
                        <span className="text-xs text-muted-foreground">{cliente.cellulare1}</span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {onAddNew && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    onSelect={handleAddNew}
                    className="text-primary cursor-pointer"
                    data-testid="button-add-new-cliente"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    <span className="font-medium">Aggiungi nuovo cliente</span>
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
