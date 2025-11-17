import { useState } from 'react';
import { CostoLavoro } from '@shared/jobs-types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Edit, Check, X } from 'lucide-react';
import { format } from 'date-fns';
import it from 'date-fns/locale/it';
import { Badge } from '@/components/ui/badge';

interface CostiLavoroTableProps {
  costi: CostoLavoro[];
  totalePreventivato: number;
  onAddCosto?: (costo: Omit<CostoLavoro, 'id'>) => void;
  onUpdateCosto?: (id: string, costo: Partial<CostoLavoro>) => void;
  onDeleteCosto?: (id: string) => void;
  isAdmin?: boolean;
}

const TIPO_COSTO_OPTIONS = [
  { value: 'materiale', label: 'Materiale' },
  { value: 'fornitore', label: 'Fornitore' },
  { value: 'collaboratore', label: 'Collaboratore' },
  { value: 'viaggio', label: 'Viaggio' },
  { value: 'altro', label: 'Altro' }
];

export default function CostiLavoroTable({
  costi,
  totalePreventivato,
  onAddCosto,
  onUpdateCosto,
  onDeleteCosto,
  isAdmin = false
}: CostiLavoroTableProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    descrizione: '',
    importo: '',
    tipo: 'materiale' as CostoLavoro['tipo'],
    note: ''
  });

  const totaleCosti = costi.reduce((sum, costo) => sum + costo.importo, 0);
  const margine = totalePreventivato - totaleCosti;
  const marginePerc = totalePreventivato > 0 ? (margine / totalePreventivato) * 100 : 0;

  const handleAdd = () => {
    if (onAddCosto && formData.descrizione && formData.importo) {
      onAddCosto({
        descrizione: formData.descrizione,
        importo: parseFloat(formData.importo),
        tipo: formData.tipo,
        data: { toDate: () => new Date() } as any,
        note: formData.note || undefined
      });
      setFormData({ descrizione: '', importo: '', tipo: 'materiale', note: '' });
      setIsAdding(false);
    }
  };

  const handleDelete = (id: string) => {
    if (onDeleteCosto && confirm('Eliminare questo costo?')) {
      onDeleteCosto(id);
    }
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
          <p className="text-sm text-muted-foreground">Totale Costi</p>
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            €{totaleCosti.toFixed(2)}
          </p>
        </div>
        <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg">
          <p className="text-sm text-muted-foreground">Margine</p>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">
            €{margine.toFixed(2)}
          </p>
        </div>
        <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <p className="text-sm text-muted-foreground">Margine %</p>
          <p className="text-2xl font-bold">
            {marginePerc.toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Descrizione</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Importo</TableHead>
              <TableHead>Data</TableHead>
              {isAdmin && <TableHead className="w-24">Azioni</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {costi.length === 0 && !isAdding ? (
              <TableRow>
                <TableCell colSpan={isAdmin ? 5 : 4} className="text-center text-muted-foreground py-8">
                  Nessun costo inserito
                </TableCell>
              </TableRow>
            ) : (
              <>
                {costi.map(costo => (
                  <TableRow key={costo.id} data-testid={`row-costo-${costo.id}`}>
                    <TableCell className="font-medium">{costo.descrizione}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{costo.tipo}</Badge>
                    </TableCell>
                    <TableCell className="font-mono">€{costo.importo.toFixed(2)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(costo.data.toDate(), 'dd/MM/yyyy', { locale: it })}
                    </TableCell>
                    {isAdmin && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(costo.id)}
                          data-testid={`button-delete-${costo.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {isAdding && (
                  <TableRow>
                    <TableCell>
                      <Input
                        placeholder="Descrizione"
                        value={formData.descrizione}
                        onChange={(e) => setFormData({ ...formData, descrizione: e.target.value })}
                        data-testid="input-descrizione"
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={formData.tipo}
                        onValueChange={(value: any) => setFormData({ ...formData, tipo: value })}
                      >
                        <SelectTrigger data-testid="select-tipo">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TIPO_COSTO_OPTIONS.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={formData.importo}
                        onChange={(e) => setFormData({ ...formData, importo: e.target.value })}
                        data-testid="input-importo"
                      />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">Oggi</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleAdd}
                          data-testid="button-save"
                        >
                          <Check className="h-4 w-4 text-green-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setIsAdding(false);
                            setFormData({ descrizione: '', importo: '', tipo: 'materiale', note: '' });
                          }}
                          data-testid="button-cancel"
                        >
                          <X className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add Button */}
      {isAdmin && !isAdding && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsAdding(true)}
          data-testid="button-add-costo"
        >
          <Plus className="h-4 w-4 mr-2" />
          Aggiungi Costo
        </Button>
      )}
    </div>
  );
}
