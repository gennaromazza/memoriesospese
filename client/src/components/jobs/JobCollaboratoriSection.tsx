
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Check, X, Euro, Clock, Calendar, Trash2, Link2, CreditCard } from 'lucide-react';
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

  const getCollaboratoreNome = (id: string) => {
    const collab = collaboratori.find((c) => c.id === id);
    return collab ? `${collab.cognome} ${collab.nome}` : 'N/D';
  };

  const totaleCosti = assignments
    .filter((a) => a.status === 'accepted')
    .reduce((sum, a) => sum + a.compenso, 0);

  const totalePagato = assignments
    .filter((a) => a.status === 'accepted' && a.isPagato)
    .reduce((sum, a) => sum + a.compenso, 0);

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
                        <div className="font-semibold">€{assignment.compenso}</div>
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
                      {assignment.status === 'accepted' && (
                        assignment.isPagato ? (
                          <Badge variant="default">✅ Pagato</Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => markPaidMutation.mutate(assignment.id)}
                          >
                            Segna Pagato
                          </Button>
                        )
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {/* Futura funzionalità: rimuovi assegnazione */}
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
