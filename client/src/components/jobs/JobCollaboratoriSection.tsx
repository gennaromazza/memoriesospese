
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Check, X, Euro, Clock, Calendar, Trash2, Link2, CreditCard, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import {
  getAllCollaboratori,
  getJobAssignments,
  assignCollaboratoreToJob,
  markAssignmentAsPaid,
  addPaymentToAssignment,
  removeAssignment,
  generateDashboardToken,
  updateAssignmentCompenso,
} from '@/lib/collaboratori';
import type {
  Collaboratore,
  JobCollaboratoreAssignment,
  InsertJobCollaboratoreAssignment,
  CollaboratoreRole,
  CollaboratorPaymentType,
  PaymentMethod,
} from '@shared/collaboratori-types';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

const RUOLI_LABELS: Record<CollaboratoreRole, string> = {
  fotografo_secondario: '📷 Fotografo Secondario',
  videomaker: '🎥 Videomaker',
  assistente: '🤝 Assistente',
  photo_editor: '🎨 Photo Editor',
  album_designer: '📚 Album Designer',
  altro: '👤 Altro',
};

const STATUS_LABELS = {
  pending: { label: '⏳ In Attesa', variant: 'secondary' as const },
  accepted: { label: '✅ Accettato', variant: 'default' as const },
  declined: { label: '❌ Rifiutato', variant: 'destructive' as const },
};

interface Props {
  jobId: string;
}

export function JobCollaboratoriSection({ jobId }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<JobCollaboratoreAssignment | null>(null);
  const [formData, setFormData] = useState<InsertJobCollaboratoreAssignment>({
    jobId,
    collaboratoreId: '',
    ruoloInJob: 'fotografo_secondario',
    compenso: 0,
    tipoPagamento: 'forfait',
    oreStimate: undefined,
    giorniStimati: undefined,
    noteAdmin: '',
  });
  const [paymentFormData, setPaymentFormData] = useState({
    importo: 0,
    tipo: 'acconto' as CollaboratorPaymentType,
    metodo: 'bonifico' as PaymentMethod,
    note: '',
    data: new Date().toISOString().split('T')[0],
  });
  const [isEditCompensoModalOpen, setIsEditCompensoModalOpen] = useState(false);
  const [editCompensoData, setEditCompensoData] = useState({
    assignmentId: '',
    compenso: 0,
    noteModifica: '',
    sendEmail: true,
  });

  const { data: collaboratori = [] } = useQuery({
    queryKey: ['collaboratori', 'attivi'],
    queryFn: () => getAllCollaboratori(true),
  });

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ['job-assignments', jobId],
    queryFn: () => getJobAssignments(jobId),
  });

  const assignMutation = useMutation({
    mutationFn: assignCollaboratoreToJob,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-assignments', jobId] });
      toast({ title: '✅ Collaboratore assegnato e notificato via email' });
      handleCloseModal();
    },
    onError: () => {
      toast({ title: '❌ Errore assegnazione', variant: 'destructive' });
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: markAssignmentAsPaid,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-assignments', jobId] });
      toast({ title: '✅ Pagamento registrato' });
    },
  });

  const addPaymentMutation = useMutation({
    mutationFn: ({ assignmentId, payload }: { assignmentId: string; payload: any }) =>
      addPaymentToAssignment(assignmentId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-assignments', jobId] });
      queryClient.invalidateQueries({ queryKey: ['cash-movements'] });
      toast({ title: '✅ Pagamento registrato e movimento cassa creato' });
      setIsPaymentModalOpen(false);
      setSelectedAssignment(null);
      setPaymentFormData({
        importo: 0,
        tipo: 'acconto',
        metodo: 'bonifico',
        note: '',
        data: new Date().toISOString().split('T')[0],
      });
    },
    onError: () => {
      toast({ title: '❌ Errore registrazione pagamento', variant: 'destructive' });
    },
  });

  const removeAssignmentMutation = useMutation({
    mutationFn: removeAssignment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-assignments', jobId] });
      queryClient.invalidateQueries({ queryKey: ['cash-movements'] });
      toast({ title: '✅ Collaboratore rimosso dal lavoro' });
    },
    onError: () => {
      toast({ title: '❌ Errore rimozione collaboratore', variant: 'destructive' });
    },
  });

  const updateCompensoMutation = useMutation({
    mutationFn: ({ assignmentId, compenso, noteModifica, sendEmail }: { assignmentId: string; compenso: number; noteModifica: string; sendEmail: boolean }) =>
      updateAssignmentCompenso(assignmentId, compenso, noteModifica, sendEmail),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-assignments', jobId] });
      toast({ title: editCompensoData.sendEmail ? '✅ Compenso aggiornato e collaboratore notificato' : '✅ Compenso aggiornato' });
      setIsEditCompensoModalOpen(false);
      setEditCompensoData({ assignmentId: '', compenso: 0, noteModifica: '', sendEmail: true });
    },
    onError: () => {
      toast({ title: '❌ Errore aggiornamento compenso', variant: 'destructive' });
    },
  });

  const handleOpenModal = () => {
    setFormData({
      jobId,
      collaboratoreId: '',
      ruoloInJob: 'fotografo_secondario',
      compenso: 0,
      tipoPagamento: 'forfait',
      oreStimate: undefined,
      giorniStimati: undefined,
      noteAdmin: '',
    });
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    assignMutation.mutate(formData);
  };

  const handleOpenPaymentModal = (assignment: JobCollaboratoreAssignment) => {
    setSelectedAssignment(assignment);
    setPaymentFormData({
      importo: assignment.saldoResiduo || assignment.compenso,
      tipo: 'acconto',
      metodo: 'bonifico',
      note: '',
      data: new Date().toISOString().split('T')[0],
    });
    setIsPaymentModalOpen(true);
  };

  const handleSubmitPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAssignment) return;
    addPaymentMutation.mutate({
      assignmentId: selectedAssignment.id,
      payload: paymentFormData,
    });
  };

  const handleCopyDashboardLink = async (collaboratoreId: string) => {
    const collab = collaboratori.find((c) => c.id === collaboratoreId);
    
    let dashboardToken = collab?.dashboardToken;
    
    // Se il token non esiste, lo genera
    if (!dashboardToken) {
      try {
        toast({ title: '🔄 Generazione token in corso...' });
        dashboardToken = await generateDashboardToken(collaboratoreId);
        // Invalida la cache per aggiornare i dati
        queryClient.invalidateQueries({ queryKey: ['collaboratori'] });
      } catch (error) {
        toast({
          title: '❌ Errore generazione token',
          variant: 'destructive',
        });
        return;
      }
    }

    const link = `${window.location.origin}/collaboratori/dashboard/${dashboardToken}`;
    try {
      await navigator.clipboard.writeText(link);
      toast({ title: '✅ Link copiato negli appunti!' });
    } catch (error) {
      toast({ title: '❌ Errore copia link', variant: 'destructive' });
    }
  };

  const handleRemoveAssignment = (assignmentId: string) => {
    if (window.confirm('Sei sicuro di voler rimuovere questo collaboratore dal lavoro?')) {
      removeAssignmentMutation.mutate(assignmentId);
    }
  };

  const handleOpenEditCompensoModal = (assignment: JobCollaboratoreAssignment) => {
    setEditCompensoData({
      assignmentId: assignment.id,
      compenso: assignment.compenso,
      noteModifica: '',
      sendEmail: true,
    });
    setIsEditCompensoModalOpen(true);
  };

  const handleSubmitEditCompenso = (e: React.FormEvent) => {
    e.preventDefault();
    updateCompensoMutation.mutate(editCompensoData);
  };

  const getCollaboratoreNome = (id: string) => {
    const collab = collaboratori.find((c) => c.id === id);
    return collab ? `${collab.cognome} ${collab.nome}` : 'N/D';
  };

  const totaleCosti = assignments
    .filter((a) => a.status === 'accepted')
    .reduce((sum, a) => sum + a.compenso, 0);

  const totalePagato = assignments
    .filter((a) => a.status === 'accepted')
    .reduce((sum, a) => sum + (a.pagamenti?.reduce((pSum, p) => pSum + p.importo, 0) || 0), 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>👥 Collaboratori Assegnati</CardTitle>
          <Button onClick={handleOpenModal} size="sm">
            <Plus className="w-4 h-4 mr-2" />
            Assegna Collaboratore
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div>Caricamento...</div>
        ) : assignments.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">
            Nessun collaboratore assegnato
          </p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Collaboratore</TableHead>
                  <TableHead>Ruolo</TableHead>
                  <TableHead>Compenso</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead>Pagamento</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((assignment) => (
                  <TableRow key={assignment.id}>
                    <TableCell className="font-medium">
                      {getCollaboratoreNome(assignment.collaboratoreId)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {RUOLI_LABELS[assignment.ruoloInJob]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1">
                          <span className="font-semibold">
                            {assignment.compenso > 0 ? `€${assignment.compenso}` : 'Da definire'}
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={() => handleOpenEditCompensoModal(assignment)}
                            title="Modifica compenso"
                            data-testid={`button-edit-compenso-${assignment.id}`}
                          >
                            <Pencil className="w-3 h-3" />
                          </Button>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {assignment.tipoPagamento === 'orario' &&
                            `${assignment.oreStimate}h x €${
                              assignment.compenso / (assignment.oreStimate || 1)
                            }/h`}
                          {assignment.tipoPagamento === 'giornaliero' &&
                            `${assignment.giorniStimati}gg x €${
                              assignment.compenso / (assignment.giorniStimati || 1)
                            }/gg`}
                          {assignment.tipoPagamento === 'forfait' && 'Forfait'}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_LABELS[assignment.status].variant}>
                        {STATUS_LABELS[assignment.status].label}
                      </Badge>
                      {assignment.dataRisposta && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {format(assignment.dataRisposta.toDate(), 'dd/MM/yyyy', {
                            locale: it,
                          })}
                        </div>
                      )}
                      {assignment.noteRifiuto && (
                        <div className="text-xs text-red-600 mt-1">
                          "{assignment.noteRifiuto}"
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-2">
                        <div className="text-sm">
                          <div className="font-semibold text-green-600">
                            Pagato: €{assignment.pagamenti?.reduce((sum, p) => sum + p.importo, 0).toFixed(2) || '0.00'}
                          </div>
                          {assignment.compenso > 0 && (
                            <div className="font-semibold text-orange-600">
                              Residuo: €{(assignment.saldoResiduo ?? assignment.compenso).toFixed(2)}
                            </div>
                          )}
                        </div>
                        {assignment.pagamenti && assignment.pagamenti.length > 0 && (
                          <div className="text-xs text-muted-foreground space-y-1">
                            {assignment.pagamenti.slice(0, 2).map((pag) => (
                              <div key={pag.id}>
                                {format(pag.data.toDate(), 'dd/MM/yy', { locale: it })} - €{pag.importo} ({pag.metodo})
                              </div>
                            ))}
                          </div>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenPaymentModal(assignment)}
                          data-testid={`button-registra-pagamento-${assignment.id}`}
                        >
                          <CreditCard className="w-3 h-3 mr-1" />
                          {assignment.status === 'accepted' ? 'Registra Pag' : 'Acconto'}
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleCopyDashboardLink(assignment.collaboratoreId)}
                          title="Copia link dashboard"
                          data-testid={`button-copy-dashboard-link-${assignment.id}`}
                        >
                          <Link2 className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemoveAssignment(assignment.id)}
                          title="Rimuovi collaboratore"
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          disabled={removeAssignmentMutation.isPending}
                          data-testid={`button-remove-assignment-${assignment.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="mt-4 p-4 bg-muted rounded-lg space-y-2">
              <div className="flex justify-between font-semibold">
                <span>💰 Totale Costi Collaboratori (Accettati):</span>
                <span>€{totaleCosti.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>✅ Pagato:</span>
                <span className="text-green-600">€{totalePagato.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>⏳ Da Pagare:</span>
                <span className="text-orange-600">
                  €{(totaleCosti - totalePagato).toFixed(2)}
                </span>
              </div>
            </div>
          </>
        )}

        <Dialog open={isPaymentModalOpen} onOpenChange={setIsPaymentModalOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Registra Pagamento Collaboratore</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSubmitPayment} className="space-y-4">
              {selectedAssignment && (
                <div className="text-sm text-muted-foreground">
                  Compenso totale: €{selectedAssignment.compenso} • Saldo residuo: €{(selectedAssignment.saldoResiduo ?? selectedAssignment.compenso).toFixed(2)}
                </div>
              )}

              <div>
                <Label htmlFor="importo">Importo (€) *</Label>
                <Input
                  id="importo"
                  type="number"
                  step="0.01"
                  value={paymentFormData.importo}
                  onChange={(e) =>
                    setPaymentFormData({ ...paymentFormData, importo: parseFloat(e.target.value) || 0 })
                  }
                  required
                  data-testid="input-importo-pagamento"
                />
              </div>

              <div>
                <Label htmlFor="tipo">Tipo Pagamento *</Label>
                <Select
                  value={paymentFormData.tipo}
                  onValueChange={(value: CollaboratorPaymentType) =>
                    setPaymentFormData({ ...paymentFormData, tipo: value })
                  }
                >
                  <SelectTrigger data-testid="select-tipo-pagamento">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="acconto">Acconto</SelectItem>
                    <SelectItem value="saldo">Saldo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="metodo">Metodo Pagamento *</Label>
                <Select
                  value={paymentFormData.metodo}
                  onValueChange={(value: PaymentMethod) =>
                    setPaymentFormData({ ...paymentFormData, metodo: value })
                  }
                >
                  <SelectTrigger data-testid="select-metodo-pagamento">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contante">Contante</SelectItem>
                    <SelectItem value="carta">Carta</SelectItem>
                    <SelectItem value="bonifico">Bonifico</SelectItem>
                    <SelectItem value="paypal">PayPal</SelectItem>
                    <SelectItem value="altro">Altro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="data">Data Pagamento *</Label>
                <Input
                  id="data"
                  type="date"
                  value={paymentFormData.data}
                  onChange={(e) =>
                    setPaymentFormData({ ...paymentFormData, data: e.target.value })
                  }
                  required
                  data-testid="input-data-pagamento"
                />
              </div>

              <div>
                <Label htmlFor="note">Note</Label>
                <Textarea
                  id="note"
                  value={paymentFormData.note}
                  onChange={(e) =>
                    setPaymentFormData({ ...paymentFormData, note: e.target.value })
                  }
                  rows={2}
                  data-testid="textarea-note-pagamento"
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsPaymentModalOpen(false)}>
                  Annulla
                </Button>
                <Button type="submit" disabled={addPaymentMutation.isPending} data-testid="button-submit-pagamento">
                  {addPaymentMutation.isPending ? 'Registrazione...' : 'Registra Pagamento'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={isEditCompensoModalOpen} onOpenChange={setIsEditCompensoModalOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Modifica Compenso</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSubmitEditCompenso} className="space-y-4">
              <div>
                <Label htmlFor="editCompenso">Nuovo Compenso (€) *</Label>
                <Input
                  id="editCompenso"
                  type="number"
                  step="0.01"
                  min="0"
                  value={editCompensoData.compenso}
                  onChange={(e) =>
                    setEditCompensoData({ ...editCompensoData, compenso: parseFloat(e.target.value) || 0 })
                  }
                  required
                  data-testid="input-edit-compenso"
                />
              </div>

              <div>
                <Label htmlFor="noteModifica">Note (opzionale)</Label>
                <Textarea
                  id="noteModifica"
                  placeholder="Es: Aggiornato dopo accordo con collaboratore"
                  value={editCompensoData.noteModifica}
                  onChange={(e) =>
                    setEditCompensoData({ ...editCompensoData, noteModifica: e.target.value })
                  }
                  rows={2}
                  data-testid="textarea-note-modifica"
                />
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="sendEmail"
                  checked={editCompensoData.sendEmail}
                  onChange={(e) =>
                    setEditCompensoData({ ...editCompensoData, sendEmail: e.target.checked })
                  }
                  className="rounded border-gray-300"
                  data-testid="checkbox-send-email"
                />
                <Label htmlFor="sendEmail" className="text-sm font-normal">
                  Notifica il collaboratore via email
                </Label>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsEditCompensoModalOpen(false)}>
                  Annulla
                </Button>
                <Button type="submit" disabled={updateCompensoMutation.isPending} data-testid="button-submit-edit-compenso">
                  {updateCompensoMutation.isPending ? 'Aggiornamento...' : 'Salva Compenso'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Assegna Collaboratore</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="collaboratoreId">Collaboratore *</Label>
                <Select
                  value={formData.collaboratoreId}
                  onValueChange={(value) =>
                    setFormData({ ...formData, collaboratoreId: value })
                  }
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona collaboratore" />
                  </SelectTrigger>
                  <SelectContent>
                    {collaboratori.map((collab) => (
                      <SelectItem key={collab.id} value={collab.id}>
                        {collab.cognome} {collab.nome} - {RUOLI_LABELS[collab.ruolo]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="ruoloInJob">Ruolo in questo Job *</Label>
                <Select
                  value={formData.ruoloInJob}
                  onValueChange={(value: CollaboratoreRole) =>
                    setFormData({ ...formData, ruoloInJob: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(RUOLI_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="tipoPagamento">Tipo Pagamento *</Label>
                <Select
                  value={formData.tipoPagamento}
                  onValueChange={(value: 'orario' | 'giornaliero' | 'forfait') =>
                    setFormData({ ...formData, tipoPagamento: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="orario">⏰ Orario</SelectItem>
                    <SelectItem value="giornaliero">📅 Giornaliero</SelectItem>
                    <SelectItem value="forfait">💰 Forfait</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.tipoPagamento === 'orario' && (
                <div>
                  <Label htmlFor="oreStimate">Ore Stimate</Label>
                  <Input
                    id="oreStimate"
                    type="number"
                    step="0.5"
                    value={formData.oreStimate || ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        oreStimate: parseFloat(e.target.value) || undefined,
                      })
                    }
                  />
                </div>
              )}

              {formData.tipoPagamento === 'giornaliero' && (
                <div>
                  <Label htmlFor="giorniStimati">Giorni Stimati</Label>
                  <Input
                    id="giorniStimati"
                    type="number"
                    step="0.5"
                    value={formData.giorniStimati || ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        giorniStimati: parseFloat(e.target.value) || undefined,
                      })
                    }
                  />
                </div>
              )}

              <div>
                <Label htmlFor="compenso">Compenso Totale (€) *</Label>
                <Input
                  id="compenso"
                  type="number"
                  step="0.01"
                  value={formData.compenso}
                  onChange={(e) =>
                    setFormData({ ...formData, compenso: parseFloat(e.target.value) })
                  }
                  required
                />
              </div>

              <div>
                <Label htmlFor="noteAdmin">Note Admin</Label>
                <Textarea
                  id="noteAdmin"
                  value={formData.noteAdmin}
                  onChange={(e) =>
                    setFormData({ ...formData, noteAdmin: e.target.value })
                  }
                  rows={2}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={handleCloseModal}>
                  Annulla
                </Button>
                <Button type="submit" disabled={assignMutation.isPending}>
                  Assegna e Notifica
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
