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
import { ClienteQuickAddDialog } from './ClienteQuickAddDialog';

interface ClientAutocompleteProps {
  value?: string;
  onSelect: (cliente: Cliente | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  enableQuickAdd?: boolean;
}

export function ClientAutocomplete({
  value,
  onSelect,
  placeholder = 'Cerca cliente...',
  disabled = false,
  className,
  enableQuickAdd = true
}: ClientAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
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
    setQuickAddOpen(true);
  };

  const handleQuickAddSuccess = (cliente: Cliente) => {
    setSelectedCliente(cliente);
    onSelect(cliente);
  };

  const displayValue = selectedCliente
    ? `${selectedCliente.nome} ${selectedCliente.cognome}`
    : placeholder;

  return (
    <>
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('w-full justify-between min-h-[44px]', className)}
          data-testid="button-client-autocomplete"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(!open);
          }}
        >
          <span className={cn('truncate', !selectedCliente && 'text-muted-foreground')}>
            {displayValue}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-[min(400px,calc(100vw-2rem))] p-0 z-[200]" 
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
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

            {enableQuickAdd && (
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

    {enableQuickAdd && (
      <ClienteQuickAddDialog
        open={quickAddOpen}
        onOpenChange={setQuickAddOpen}
        onSuccess={handleQuickAddSuccess}
        initialNome={searchQuery}
      />
    )}
  </>
  );
}
