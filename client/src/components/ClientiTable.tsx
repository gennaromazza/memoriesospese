import { useState, useMemo } from 'react';
import type { Cliente } from '@shared/clienti-types';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Search, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ClienteQuickActions from './ClienteQuickActions';

interface ClientiTableProps {
  clienti: Cliente[];
  onSelectCliente: (cliente: Cliente) => void;
  onActionCliente: (cliente: Cliente, action: string) => void;
}

type SortField = 'nome' | 'email' | 'lastInteraction';
type SortDirection = 'asc' | 'desc';

export default function ClientiTable({ 
  clienti, 
  onSelectCliente, 
  onActionCliente 
}: ClientiTableProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [cittaFilter, setCittaFilter] = useState<string>('tutte');
  const [sortField, setSortField] = useState<SortField>('lastInteraction');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Funzione per ottenere il primo numero di telefono disponibile
  const getPrimoTelefono = (cliente: Cliente): string => {
    if (cliente.cellulare1 && cliente.cellulare1 !== 'N/D') return cliente.cellulare1;
    if (cliente.whatsapp && cliente.whatsapp !== 'N/D') return cliente.whatsapp;
    if (cliente.cellulare2 && cliente.cellulare2 !== 'N/D') return cliente.cellulare2;
    return '-';
  };

  const cittaUniche = useMemo(() => {
    const citta = clienti
      .map(c => c.citta)
      .filter((c): c is string => !!c && c.trim() !== '');
    return Array.from(new Set(citta)).sort();
  }, [clienti]);

  const filteredAndSortedClienti = useMemo(() => {
    let filtered = [...clienti];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(c => {
        const nomeCompleto = `${c.nome} ${c.cognome}`.toLowerCase();
        const email = c.email.toLowerCase();
        const telefono = getPrimoTelefono(c).toLowerCase();
        return nomeCompleto.includes(query) || 
               email.includes(query) || 
               telefono.includes(query);
      });
    }

    if (cittaFilter && cittaFilter !== 'tutte') {
      filtered = filtered.filter(c => c.citta === cittaFilter);
    }

    filtered.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortField) {
        case 'nome':
          aValue = `${a.nome} ${a.cognome}`.toLowerCase();
          bValue = `${b.nome} ${b.cognome}`.toLowerCase();
          break;
        case 'email':
          aValue = a.email.toLowerCase();
          bValue = b.email.toLowerCase();
          break;
        case 'lastInteraction':
          aValue = a.lifecycle.lastInteractionAt?.toMillis?.() || 0;
          bValue = b.lifecycle.lastInteractionAt?.toMillis?.() || 0;
          break;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [clienti, searchQuery, cittaFilter, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-4 w-4 ml-1" />;
    }
    return sortDirection === 'asc' 
      ? <ArrowUp className="h-4 w-4 ml-1" />
      : <ArrowDown className="h-4 w-4 ml-1" />;
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: 'default' | 'secondary' | 'outline' | 'destructive'; label: string }> = {
      'lead': { variant: 'outline', label: 'Lead' },
      'prospect': { variant: 'secondary', label: 'Prospect' },
      'cliente_attivo': { variant: 'default', label: 'Attivo' },
      'archiviato': { variant: 'destructive', label: 'Archiviato' },
    };

    const config = variants[status] || { variant: 'outline' as const, label: status };
    
    return (
      <Badge variant={config.variant} className="text-xs">
        {config.label}
      </Badge>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca per nome, email o telefono..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="input-search-clienti"
          />
        </div>

        <Select value={cittaFilter} onValueChange={setCittaFilter}>
          <SelectTrigger className="w-full md:w-48" data-testid="select-citta-filter">
            <SelectValue placeholder="Filtra per città" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tutte">Tutte le città</SelectItem>
            {cittaUniche.map(citta => (
              <SelectItem key={citta} value={citta}>
                {citta}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="hidden md:block rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSort('nome')}
                  className="flex items-center"
                  data-testid="sort-nome"
                >
                  Nome Completo
                  {getSortIcon('nome')}
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSort('email')}
                  className="flex items-center"
                  data-testid="sort-email"
                >
                  Email
                  {getSortIcon('email')}
                </Button>
              </TableHead>
              <TableHead>Telefono</TableHead>
              <TableHead>Città</TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSort('lastInteraction')}
                  className="flex items-center"
                  data-testid="sort-lastInteraction"
                >
                  Ultimo Contatto
                  {getSortIcon('lastInteraction')}
                </Button>
              </TableHead>
              <TableHead className="w-12">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAndSortedClienti.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Nessun cliente trovato
                </TableCell>
              </TableRow>
            ) : (
              filteredAndSortedClienti.map(cliente => (
                <TableRow
                  key={cliente.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => onSelectCliente(cliente)}
                  data-testid={`row-cliente-${cliente.id}`}
                >
                  <TableCell className="font-medium">
                    {cliente.nome} {cliente.cognome}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {cliente.email}
                  </TableCell>
                  <TableCell className="text-sm">
                    {getPrimoTelefono(cliente)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {cliente.citta || '-'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {cliente.lifecycle.lastInteractionAt
                      ? format(cliente.lifecycle.lastInteractionAt.toDate(), 'dd/MM/yyyy', { locale: it })
                      : '-'}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <ClienteQuickActions
                      cliente={cliente}
                      onAction={(action) => onActionCliente(cliente, action)}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="md:hidden space-y-4">
        {filteredAndSortedClienti.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Nessun cliente trovato
            </CardContent>
          </Card>
        ) : (
          filteredAndSortedClienti.map(cliente => (
            <Card
              key={cliente.id}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => onSelectCliente(cliente)}
              data-testid={`card-cliente-${cliente.id}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold">
                      {cliente.nome} {cliente.cognome}
                    </h3>
                    <p className="text-sm text-muted-foreground">{cliente.email}</p>
                  </div>
                  <div onClick={(e) => e.stopPropagation()}>
                    <ClienteQuickActions
                      cliente={cliente}
                      onAction={(action) => onActionCliente(cliente, action)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Telefono:</span>
                    <p>{getPrimoTelefono(cliente)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Città:</span>
                    <p>{cliente.citta || '-'}</p>
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Ultimo Contatto:</span>
                    <p>
                      {cliente.lifecycle.lastInteractionAt
                        ? format(cliente.lifecycle.lastInteractionAt.toDate(), 'dd/MM/yyyy', { locale: it })
                        : '-'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
