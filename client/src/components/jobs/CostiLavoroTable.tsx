import { useState } from 'react';
import { CostoLavoro } from '@shared/jobs-types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Check, X } from 'lucide-react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';

interface CostiLavoroTableProps {
  costi: CostoLavoro[];
  totalePreventivato: number;
  onAddCosto?: (costo: Omit<CostoLavoro, 'id'>) => void;
  onUpdateCosto?: (id: string, costo: Partial<CostoLavoro>) => void;
  onDeleteCosto?: (id: string) => void;
  isAdmin?: boolean;
}

function safeToDate(val: any): Date {
  if (!val) return new Date();
  if (typeof val.toDate === 'function') return val.toDate();
  if (val.seconds !== undefined) return new Date(val.seconds * 1000);
  if (val._seconds !== undefined) return new Date(val._seconds * 1000);
  if (val instanceof Date) return val;
  return new Date();
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
  onDeleteCosto,
  isAdmin = false
}: CostiLavoroTableProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState({
    descrizione: '',
    importo: '',
    tipo: 'materiale' as CostoLavoro['tipo'],
    note: ''
  });

  const totaleCosti = costi.reduce((sum, c) => sum + c.importo, 0);
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

  const handleCancel = () => {
    setIsAdding(false);
    setFormData({ descrizione: '', importo: '', tipo: 'materiale', note: '' });
  };

  const handleDelete = (id: string) => {
    if (onDeleteCosto && confirm('Eliminare questo costo?')) {
      onDeleteCosto(id);
    }
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <div className="p-3 sm:p-4 bg-blue-50 rounded-lg">
          <p className="text-xs sm:text-sm text-muted-foreground">Totale Costi</p>
          <p className="text-base sm:text-2xl font-bold text-blue-600">
            €{totaleCosti.toFixed(2)}
          </p>
        </div>
        <div className="p-3 sm:p-4 bg-green-50 rounded-lg">
          <p className="text-xs sm:text-sm text-muted-foreground">Margine</p>
          <p className="text-base sm:text-2xl font-bold text-green-600">
            €{margine.toFixed(2)}
          </p>
        </div>
        <div className="p-3 sm:p-4 bg-gray-50 rounded-lg">
          <p className="text-xs sm:text-sm text-muted-foreground">Margine %</p>
          <p className="text-base sm:text-2xl font-bold">
            {marginePerc.toFixed(1)}%
          </p>
        </div>
      </div>

      {/* ── Inline Add Form (fuori dalla tabella) ── */}
      {isAdding && (
        <div className="rounded-lg border border-dashed border-blue-300 bg-blue-50/40 p-4 space-y-3">
          <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Nuovo costo</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-gray-600">Descrizione *</Label>
              <Input
                placeholder="Es. Stampe album, Collaboratore..."
                value={formData.descrizione}
                onChange={(e) => setFormData({ ...formData, descrizione: e.target.value })}
                data-testid="input-descrizione"
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-600">Importo (€) *</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={formData.importo}
                onChange={(e) => setFormData({ ...formData, importo: e.target.value })}
                data-testid="input-importo"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-600">Categoria</Label>
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
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-600">Note (opzionale)</Label>
              <Input
                placeholder="Note aggiuntive..."
                value={formData.note}
                onChange={(e) => setFormData({ ...formData, note: e.target.value })}
              />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              onClick={handleAdd}
              disabled={!formData.descrizione || !formData.importo}
              className="bg-[#6b7f6b] hover:bg-[#5a6e5a] text-white gap-1.5"
              data-testid="button-save"
            >
              <Check className="h-3.5 w-3.5" />
              Salva costo
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleCancel}
              data-testid="button-cancel"
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Annulla
            </Button>
          </div>
        </div>
      )}

      {/* ── Tabella costi ── */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descrizione</TableHead>
                <TableHead className="hidden sm:table-cell">Categoria</TableHead>
                <TableHead>Importo</TableHead>
                <TableHead className="hidden md:table-cell">Data</TableHead>
                {isAdmin && <TableHead className="w-12" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {costi.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={isAdmin ? 5 : 4}
                    className="text-center text-muted-foreground py-8 text-sm"
                  >
                    Nessun costo inserito
                  </TableCell>
                </TableRow>
              ) : (
                costi.map(costo => (
                  <TableRow key={costo.id} data-testid={`row-costo-${costo.id}`}>
                    <TableCell>
                      <p className="font-medium text-sm">{costo.descrizione}</p>
                      {/* su mobile mostra categoria e data sotto la descrizione */}
                      <div className="flex items-center gap-2 mt-0.5 sm:hidden">
                        <Badge variant="outline" className="text-[10px] py-0">{costo.tipo}</Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {format(safeToDate(costo.data), 'dd/MM/yy', { locale: it })}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant="outline">{costo.tipo}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      €{costo.importo.toFixed(2)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {format(safeToDate(costo.data), 'dd/MM/yyyy', { locale: it })}
                    </TableCell>
                    {isAdmin && (
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(costo.id)}
                          data-testid={`button-delete-${costo.id}`}
                          className="h-7 w-7 p-0"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Add Button */}
      {isAdmin && !isAdding && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsAdding(true)}
          data-testid="button-add-costo"
          className="gap-1.5"
        >
          <Plus className="h-4 w-4" />
          Aggiungi Costo
        </Button>
      )}
    </div>
  );
}
