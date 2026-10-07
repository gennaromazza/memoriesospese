import { useRef, useState } from 'react';
import { CostoLavoro } from '@shared/jobs-types';
import type { CashMovementFE } from '@shared/cash-types';
import type { Lab } from '@shared/lab-types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Check, X, Pencil, Link2, Unlink, ShieldCheck } from 'lucide-react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { useQuery } from '@tanstack/react-query';
import { getAllLabs } from '@/lib/labs';
import { getDatedCashExpensesForJobCostMatching } from '@/lib/cash';
import { isSameVerifiedPaymentCandidate } from '@/lib/job-cost-payments';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface CostiLavoroTableProps {
  jobId: string;
  jobName: string;
  costi: CostoLavoro[];
  totalePreventivato: number;
  onAddCosto?: (costo: Omit<CostoLavoro, 'id'>) => void;
  onUpdateCosto?: (id: string, costo: Partial<CostoLavoro>) => void;
  onDeleteCosto?: (id: string) => void;
  onLinkCashMovement?: (input: {
    jobCostId: string;
    cashMovementId: string;
    supplierName: string;
    evidenceReference: string;
  }) => Promise<void>;
  onUnlinkCashMovement?: (jobCostId: string, cashMovementId: string) => Promise<void>;
  isAdmin?: boolean;
}

const NESSUN_LAB = '__nessun_laboratorio__';

function nuovoFormData() {
  return {
    descrizione: '',
    importo: '',
    tipo: 'materiale' as CostoLavoro['tipo'],
    note: '',
    labId: NESSUN_LAB,
  };
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
  jobId,
  jobName,
  costi,
  totalePreventivato,
  onAddCosto,
  onUpdateCosto,
  onDeleteCosto,
  onLinkCashMovement,
  onUnlinkCashMovement,
  isAdmin = false
}: CostiLavoroTableProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingCostoId, setEditingCostoId] = useState<string | null>(null);
  const [formData, setFormData] = useState(nuovoFormData);
  const [linkingCosto, setLinkingCosto] = useState<CostoLavoro | null>(null);
  const [selectedCashMovementId, setSelectedCashMovementId] = useState('');
  const [verifiedSupplierName, setVerifiedSupplierName] = useState('');
  const [evidenceReference, setEvidenceReference] = useState('');
  const [linkError, setLinkError] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const [unlinkingCostId, setUnlinkingCostId] = useState<string | null>(null);
  const linkSubmissionInFlight = useRef(false);
  const unlinkSubmissionInFlight = useRef(false);
  const { data: labs = [] } = useQuery<Lab[]>({
    queryKey: ['/api/labs', 'job-cost-selector'],
    queryFn: () => getAllLabs(),
  });
  const { toast } = useToast();
  const { data: cashExpenses = [], isLoading: isLoadingCashExpenses, isError: cashExpensesFailed } =
    useQuery<CashMovementFE[]>({
      queryKey: ['cash-movements', 'job-cost-matching'],
      queryFn: getDatedCashExpensesForJobCostMatching,
      enabled: isAdmin,
      staleTime: 15_000,
      refetchOnWindowFocus: true,
    });

  const totaleCosti = costi.reduce((sum, c) => sum + c.importo, 0);
  const margine = totalePreventivato - totaleCosti;
  const marginePerc = totalePreventivato > 0 ? (margine / totalePreventivato) * 100 : 0;
  const editingCosto = costi.find((costo) => costo.id === editingCostoId);
  const matchingCashExpenses = linkingCosto
    ? cashExpenses.filter((movement) =>
      !movement.jobCostAssociation &&
      (!movement.jobId || movement.jobId === jobId) &&
      isSameVerifiedPaymentCandidate(linkingCosto, movement)
    )
    : [];
  const selectedCashMovement = matchingCashExpenses.find((movement) => movement.id === selectedCashMovementId);

  const resetForm = () => {
    setIsAdding(false);
    setEditingCostoId(null);
    setFormData(nuovoFormData());
  };

  const openEdit = (costo: CostoLavoro) => {
    if (costo.cashMovementId || costo.labStatementId) return;
    setIsAdding(false);
    setEditingCostoId(costo.id);
    setFormData({
      descrizione: costo.descrizione,
      importo: String(costo.importo),
      tipo: costo.tipo,
      note: costo.note || '',
      labId: costo.labId || NESSUN_LAB,
    });
  };

  const handleSave = () => {
    const importo = Number.parseFloat(formData.importo);
    if (!formData.descrizione.trim() || !Number.isFinite(importo) || importo < 0) return;

    const lab = formData.labId === NESSUN_LAB
      ? undefined
      : labs.find((candidate) => candidate.id === formData.labId);
    const costo = {
      descrizione: formData.descrizione.trim(),
      importo,
      tipo: formData.tipo,
      note: formData.note.trim() || undefined,
      labId: lab ? lab.id : formData.labId === NESSUN_LAB ? null : formData.labId,
      labNome: lab?.nome || (formData.labId === NESSUN_LAB ? null : editingCosto?.labNome || null),
    };

    if (editingCostoId) {
      onUpdateCosto?.(editingCostoId, costo);
    } else {
      onAddCosto?.({
        ...costo,
        data: { toDate: () => new Date() } as any,
      });
    }
    resetForm();
  };

  const handleDelete = (id: string) => {
    const costo = costi.find((item) => item.id === id);
    if (costo?.cashMovementId || costo?.labStatementId) return;
    if (onDeleteCosto && confirm('Eliminare questo costo?')) {
      onDeleteCosto(id);
    }
  };

  const openPaymentLink = (costo: CostoLavoro) => {
    setLinkingCosto(costo);
    setSelectedCashMovementId('');
    setVerifiedSupplierName(costo.labNome || labs.find((lab) => lab.id === costo.labId)?.nome || '');
    setEvidenceReference('');
    setLinkError('');
  };

  const closePaymentLink = () => {
    if (linkSubmissionInFlight.current) return;
    setLinkingCosto(null);
    setSelectedCashMovementId('');
    setVerifiedSupplierName('');
    setEvidenceReference('');
    setLinkError('');
  };

  const confirmPaymentLink = async () => {
    if (!linkingCosto || !selectedCashMovement || !onLinkCashMovement ||
        !verifiedSupplierName.trim() || !evidenceReference.trim() ||
        linkSubmissionInFlight.current) return;

    linkSubmissionInFlight.current = true;
    setIsLinking(true);
    setLinkError('');
    try {
      await onLinkCashMovement({
        jobCostId: linkingCosto.id,
        cashMovementId: selectedCashMovement.id,
        supplierName: verifiedSupplierName.trim(),
        evidenceReference: evidenceReference.trim(),
      });
      setLinkingCosto(null);
      setSelectedCashMovementId('');
      setVerifiedSupplierName('');
      setEvidenceReference('');
    } catch (error) {
      setLinkError(error instanceof Error ? error.message : 'Impossibile salvare l’abbinamento.');
    } finally {
      linkSubmissionInFlight.current = false;
      setIsLinking(false);
    }
  };

  const confirmPaymentUnlink = async (costo: CostoLavoro) => {
    if (!costo.cashMovementId || !onUnlinkCashMovement || unlinkSubmissionInFlight.current) return;
    if (!window.confirm(
      `Rimuovere l’abbinamento del costo "${costo.descrizione}" al movimento ${costo.cashMovementId}? ` +
      'Il movimento di cassa resterà invariato; il costo Job tornerà a essere conteggiato separatamente.'
    )) return;

    unlinkSubmissionInFlight.current = true;
    setUnlinkingCostId(costo.id);
    try {
      await onUnlinkCashMovement(costo.id, costo.cashMovementId);
    } catch (error) {
      toast({
        title: 'Impossibile rimuovere l’abbinamento',
        description: error instanceof Error ? error.message : 'Aggiorna la pagina e riprova.',
        variant: 'destructive',
      });
    } finally {
      unlinkSubmissionInFlight.current = false;
      setUnlinkingCostId(null);
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
      {(isAdding || editingCostoId) && (
        <div className="rounded-lg border border-dashed border-blue-300 bg-blue-50/40 p-4 space-y-3">
          <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
            {editingCostoId ? 'Modifica costo' : 'Nuovo costo'}
          </p>
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
            <div className="space-y-1">
              <Label className="text-xs text-gray-600">Laboratorio (opzionale)</Label>
              <Select
                value={formData.labId}
                onValueChange={(labId) => setFormData({ ...formData, labId })}
              >
                <SelectTrigger data-testid="select-costo-laboratorio">
                  <SelectValue placeholder="Nessun laboratorio" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NESSUN_LAB}>Nessun laboratorio</SelectItem>
                  {editingCosto?.labId && !labs.some((lab) => lab.id === editingCosto.labId) && (
                    <SelectItem value={editingCosto.labId}>
                      {editingCosto.labNome || 'Laboratorio rimosso'} (non in anagrafica)
                    </SelectItem>
                  )}
                  {labs.map((lab) => (
                    <SelectItem key={lab.id} value={lab.id}>
                      {lab.nome}{lab.attivo === false ? ' (inattivo)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!formData.descrizione.trim() || !formData.importo || !Number.isFinite(Number(formData.importo)) || Number(formData.importo) < 0}
              className="bg-[#6b7f6b] hover:bg-[#5a6e5a] text-white gap-1.5"
              data-testid="button-save"
            >
              <Check className="h-3.5 w-3.5" />
              {editingCostoId ? 'Salva modifiche' : 'Salva costo'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={resetForm}
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
                {isAdmin && <TableHead className="w-20" />}
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
                costi.map(costo => {
                  const linkedCashMovement = costo.cashMovementId
                    ? cashExpenses.find((movement) => movement.id === costo.cashMovementId)
                    : undefined;
                  const paymentChangedAfterVerification = !!costo.pagamentoVerificato &&
                    !isLoadingCashExpenses &&
                    !cashExpensesFailed &&
                    (!linkedCashMovement || !isSameVerifiedPaymentCandidate({
                      importo: costo.pagamentoVerificato.paymentAmount,
                      data: costo.pagamentoVerificato.paymentDate,
                    }, linkedCashMovement));
                  return (
                  <TableRow key={costo.id} data-testid={`row-costo-${costo.id}`}>
                    <TableCell>
                      <p className="font-medium text-sm">{costo.descrizione}</p>
                      {(costo.labNome || costo.labId) && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Laboratorio: {costo.labNome || labs.find((lab) => lab.id === costo.labId)?.nome || 'Laboratorio rimosso'}
                        </p>
                      )}
                      {costo.cashMovementId && (
                        <div className="mt-1 space-y-0.5 text-xs text-muted-foreground" data-testid={`payment-link-${costo.id}`}>
                          <p className="flex items-center gap-1 text-green-700">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            {costo.pagamentoVerificato ? 'Pagamento verificato e abbinato' : 'Pagamento collegato; verifica non registrata'}
                          </p>
                          <p>
                            Riferimento cassa: {costo.cashMovementId}
                            {costo.pagamentoVerificato
                              ? ` · ${costo.pagamentoVerificato.supplierName} · documento ${costo.pagamentoVerificato.evidenceReference}`
                              : ''}
                          </p>
                        </div>
                      )}
                      {paymentChangedAfterVerification && (
                        <p className="mt-1 text-xs text-amber-800" role="alert">
                          Il movimento non coincide più con i dati verificati o non è disponibile. Controlla data e importo prima di usarlo nei report.
                        </p>
                      )}
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
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(costo)}
                            disabled={!!costo.cashMovementId || !!costo.labStatementId}
                            data-testid={`button-edit-${costo.id}`}
                            className="h-7 w-7 p-0"
                            aria-label={costo.labStatementId
                              ? `Costo ${costo.descrizione} gestito dal conteggio laboratorio`
                              : costo.cashMovementId
                                ? `Rimuovi prima l'abbinamento per modificare ${costo.descrizione}`
                                : `Modifica ${costo.descrizione}`}
                            title={costo.labStatementId ? 'Gestisci questo costo dal conteggio laboratorio' : costo.cashMovementId ? 'Rimuovi prima l’abbinamento del pagamento' : undefined}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => costo.labStatementId
                              ? undefined
                              : costo.cashMovementId
                              ? void confirmPaymentUnlink(costo)
                              : handleDelete(costo.id)}
                            disabled={!!costo.labStatementId || (!!costo.cashMovementId && unlinkingCostId === costo.id)}
                            data-testid={costo.cashMovementId
                              ? `button-unlink-payment-${costo.id}`
                              : `button-delete-${costo.id}`}
                            className="h-7 w-7 p-0"
                            aria-label={costo.labStatementId
                              ? `Costo ${costo.descrizione} gestito dal conteggio laboratorio`
                              : costo.cashMovementId
                                ? `Rimuovi abbinamento di ${costo.descrizione}`
                                : `Elimina ${costo.descrizione}`}
                            title={costo.labStatementId ? 'Gestisci questo costo dal conteggio laboratorio' : costo.cashMovementId ? 'Rimuovi abbinamento' : 'Elimina costo'}
                          >
                            {costo.cashMovementId
                              ? <Unlink className="h-3.5 w-3.5 text-amber-700" />
                              : <Trash2 className="h-3.5 w-3.5 text-destructive" />}
                          </Button>
                          {!costo.cashMovementId && !costo.labStatementId && onLinkCashMovement && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openPaymentLink(costo)}
                              data-testid={`button-link-payment-${costo.id}`}
                              className="h-7 w-7 p-0"
                              aria-label={`Abbina pagamento verificato a ${costo.descrizione}`}
                              title="Abbina pagamento verificato"
                            >
                              <Link2 className="h-3.5 w-3.5 text-blue-700" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Add Button */}
      {isAdmin && !isAdding && !editingCostoId && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setFormData(nuovoFormData());
            setIsAdding(true);
          }}
          data-testid="button-add-costo"
          className="gap-1.5"
        >
          <Plus className="h-4 w-4" />
          Aggiungi Costo
        </Button>
      )}

      <Dialog
        open={!!linkingCosto}
        onOpenChange={(open) => {
          if (!open) closePaymentLink();
        }}
      >
        <DialogContent data-testid="dialog-link-job-cost-payment">
          <DialogHeader>
            <DialogTitle>Abbina pagamento verificato</DialogTitle>
            <DialogDescription>
              Scegli solo l’uscita che hai verificato sul documento. Importo e giorno devono coincidere con il costo;
              il fornitore e il riferimento documentale sono obbligatori.
            </DialogDescription>
          </DialogHeader>

          {linkingCosto && (
            <div className="space-y-4">
              <div className="rounded-md bg-muted/50 p-3 text-sm">
                <p className="font-medium">{jobName} · {linkingCosto.descrizione}</p>
                <p className="text-muted-foreground">
                  Costo Job: €{linkingCosto.importo.toFixed(2)} · {format(safeToDate(linkingCosto.data), 'dd/MM/yyyy', { locale: it })}
                </p>
              </div>

              <div className="space-y-2">
                <Label>Uscita di cassa verificata *</Label>
                {isLoadingCashExpenses ? (
                  <p className="text-sm text-muted-foreground">Caricamento delle uscite con data valida…</p>
                ) : cashExpensesFailed ? (
                  <p className="text-sm text-destructive">Impossibile caricare le uscite di cassa. Riprova più tardi.</p>
                ) : matchingCashExpenses.length === 0 ? (
                  <p className="rounded-md border p-3 text-sm text-muted-foreground">
                    Nessuna uscita ha lo stesso importo e giorno. Non vengono proposti abbinamenti basati solo su descrizioni simili.
                  </p>
                ) : (
                  <div className="max-h-52 space-y-2 overflow-y-auto rounded-md border p-2">
                    {matchingCashExpenses.map((movement) => (
                      <label
                        key={movement.id}
                        className="flex cursor-pointer gap-2 rounded-md p-2 hover:bg-muted/60"
                      >
                        <input
                          type="radio"
                          name={`cash-movement-${linkingCosto.id}`}
                          value={movement.id}
                          checked={selectedCashMovementId === movement.id}
                          onChange={() => setSelectedCashMovementId(movement.id)}
                          className="mt-1"
                        />
                        <span className="min-w-0 text-sm">
                          <span className="block font-medium">
                            €{movement.importo.toFixed(2)} · {format(movement.data, 'dd/MM/yyyy', { locale: it })} · {movement.metodoPagamento}
                          </span>
                          <span className="block break-words text-muted-foreground">
                            {movement.descrizione || movement.categoria} · ID {movement.id}
                          </span>
                          {!!movement.allegati?.length && (
                            <span className="mt-1 flex flex-wrap gap-2">
                              {movement.allegati.map((url, index) => (
                                <a
                                  key={`${movement.id}-attachment-${index}`}
                                  href={url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-blue-700 underline"
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  Documento {index + 1}
                                </a>
                              ))}
                            </span>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor={`verified-supplier-${linkingCosto.id}`}>Fornitore verificato *</Label>
                <Input
                  id={`verified-supplier-${linkingCosto.id}`}
                  value={verifiedSupplierName}
                  onChange={(event) => setVerifiedSupplierName(event.target.value)}
                  placeholder="Nome del fornitore riportato sul documento"
                  maxLength={160}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`payment-evidence-${linkingCosto.id}`}>Riferimento documento verificato *</Label>
                <Input
                  id={`payment-evidence-${linkingCosto.id}`}
                  value={evidenceReference}
                  onChange={(event) => setEvidenceReference(event.target.value)}
                  placeholder="Numero fattura, ricevuta o riferimento estratto conto"
                  maxLength={240}
                />
              </div>

              {selectedCashMovement && (
                <p className="text-xs text-muted-foreground">
                  Confermando, il costo di questo lavoro sarà ricondotto al movimento {selectedCashMovement.id}.
                  Data e importo della transazione originale non verranno modificati e l’uscita sarà conteggiata una sola volta.
                </p>
              )}
              {linkError && <p role="alert" className="text-sm text-destructive">{linkError}</p>}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closePaymentLink} disabled={isLinking}>
              Annulla
            </Button>
            <Button
              onClick={() => void confirmPaymentLink()}
              disabled={isLinking || !selectedCashMovement || !verifiedSupplierName.trim() || !evidenceReference.trim()}
              data-testid="button-confirm-payment-link"
            >
              <Check className="mr-1.5 h-4 w-4" />
              {isLinking ? 'Salvataggio…' : 'Conferma abbinamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
