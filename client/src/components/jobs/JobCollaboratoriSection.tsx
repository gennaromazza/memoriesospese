
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Check, X, Euro, Clock, Calendar, Trash2, Link2, CreditCard, Pencil, Package, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
  updateAssignmentProductsTasks,
} from '@/lib/collaboratori';
import { getOrdersByJobId } from '@/lib/orders';
import type {
  Collaboratore,
  JobCollaboratoreAssignment,
  InsertJobCollaboratoreAssignment,
  CollaboratoreRole,
  CollaboratorPaymentType,
  PaymentMethod,
  AssignedProduct,
} from '@shared/collaboratori-types';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

function safeToDate(val: any): Date {
  if (!val) return new Date();
  if (typeof val.toDate === 'function') return val.toDate();
  if (val.seconds !== undefined) return new Date(val.seconds * 1000);
  if (val._seconds !== undefined) return new Date(val._seconds * 1000);
  if (val instanceof Date) return val;
  return new Date();
}

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
    sendEmail: false,
  });
  const [isProductsTasksModalOpen, setIsProductsTasksModalOpen] = useState(false);
  const [productsTasksData, setProductsTasksData] = useState<{
    assignmentId: string;
    prodottiAssegnati: AssignedProduct[];
    mansioniAssegnate: string[];
    nuovaMansione: string;
  }>({
    assignmentId: '',
    prodottiAssegnati: [],
    mansioniAssegnate: [],
    nuovaMansione: '',
  });
  const [removeAssignmentId, setRemoveAssignmentId] = useState<string | null>(null);

  const { data: collaboratori = [] } = useQuery({
    queryKey: ['collaboratori', 'attivi'],
    queryFn: () => getAllCollaboratori(true),
  });

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ['job-assignments', jobId],
    queryFn: () => getJobAssignments(jobId),
  });

  const { data: orders = [] } = useQuery({
    queryKey: ['orders', 'job', jobId],
    queryFn: () => getOrdersByJobId(jobId),
  });

  const availableProducts = orders.flatMap(order => 
    (order.prodotti || []).map(p => ({
      orderItemId: p.prodottoId || `order_${order.id}_${p.prodottoNome}`,
      label: p.prodottoNome,
      qty: p.quantita || 1,
    }))
  );

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

  const updateProductsTasksMutation = useMutation({
    mutationFn: ({ assignmentId, prodottiAssegnati, mansioniAssegnate }: { 
      assignmentId: string; 
      prodottiAssegnati: AssignedProduct[]; 
      mansioniAssegnate: string[] 
    }) => updateAssignmentProductsTasks(assignmentId, { prodottiAssegnati, mansioniAssegnate }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-assignments', jobId] });
      toast({ title: '✅ Prodotti e mansioni aggiornati' });
      setIsProductsTasksModalOpen(false);
      setProductsTasksData({ assignmentId: '', prodottiAssegnati: [], mansioniAssegnate: [], nuovaMansione: '' });
    },
    onError: () => {
      toast({ title: '❌ Errore aggiornamento prodotti/mansioni', variant: 'destructive' });
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
    setRemoveAssignmentId(assignmentId);
  };

  const confirmRemoveAssignment = () => {
    if (removeAssignmentId) {
      removeAssignmentMutation.mutate(removeAssignmentId);
      setRemoveAssignmentId(null);
    }
  };

  const handleOpenEditCompensoModal = (assignment: JobCollaboratoreAssignment) => {
    setEditCompensoData({
      assignmentId: assignment.id,
      compenso: assignment.compenso,
      noteModifica: '',
      sendEmail: false,
    });
    setIsEditCompensoModalOpen(true);
  };

  const handleSubmitEditCompenso = (e: React.FormEvent) => {
    e.preventDefault();
    updateCompensoMutation.mutate(editCompensoData);
  };

  const handleOpenProductsTasksModal = (assignment: JobCollaboratoreAssignment) => {
    setProductsTasksData({
      assignmentId: assignment.id,
      prodottiAssegnati: assignment.prodottiAssegnati || [],
      mansioniAssegnate: assignment.mansioniAssegnate || [],
      nuovaMansione: '',
    });
    setIsProductsTasksModalOpen(true);
  };

  const handleToggleProduct = (product: AssignedProduct) => {
    setProductsTasksData(prev => {
      const exists = prev.prodottiAssegnati.some(p => p.orderItemId === product.orderItemId);
      if (exists) {
        return {
          ...prev,
          prodottiAssegnati: prev.prodottiAssegnati.filter(p => p.orderItemId !== product.orderItemId),
        };
      } else {
        return {
          ...prev,
          prodottiAssegnati: [...prev.prodottiAssegnati, product],
        };
      }
    });
  };

  const handleAddMansione = () => {
    const trimmed = productsTasksData.nuovaMansione.trim();
    if (trimmed && !productsTasksData.mansioniAssegnate.includes(trimmed)) {
      setProductsTasksData(prev => ({
        ...prev,
        mansioniAssegnate: [...prev.mansioniAssegnate, trimmed],
        nuovaMansione: '',
      }));
    }
  };

  const handleRemoveMansione = (mansione: string) => {
    setProductsTasksData(prev => ({
      ...prev,
      mansioniAssegnate: prev.mansioniAssegnate.filter(m => m !== mansione),
    }));
  };

  const handleSubmitProductsTasks = (e: React.FormEvent) => {
    e.preventDefault();
    updateProductsTasksMutation.mutate({
      assignmentId: productsTasksData.assignmentId,
      prodottiAssegnati: productsTasksData.prodottiAssegnati,
      mansioniAssegnate: productsTasksData.mansioniAssegnate,
    });
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
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
          <CardTitle className="text-base sm:text-lg">👥 Collaboratori Assegnati</CardTitle>
          <Button onClick={handleOpenModal} size="sm" className="w-full sm:w-auto">
            <Plus className="w-4 h-4 mr-2" />
            <span className="sm:hidden">Assegna Collab</span>
            <span className="hidden sm:inline">Assegna Collaboratore</span>
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
            {/* ── MOBILE: card per ogni collaboratore ── */}
            <div className="space-y-3 md:hidden">
              {assignments.map((assignment) => {
                const pagato = assignment.pagamenti?.reduce((s, p) => s + p.importo, 0) ?? 0;
                const residuo = assignment.saldoResiduo ?? assignment.compenso;
                return (
                  <div key={assignment.id} className="border rounded-lg p-4 space-y-3 bg-white">
                    {/* Header: nome + stato + azioni */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-sm">{getCollaboratoreNome(assignment.collaboratoreId)}</p>
                        <Badge variant="outline" className="text-xs mt-0.5">
                          {RUOLI_LABELS[assignment.ruoloInJob]}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Badge variant={STATUS_LABELS[assignment.status].variant} className="text-xs">
                          {STATUS_LABELS[assignment.status].label}
                        </Badge>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleCopyDashboardLink(assignment.collaboratoreId)}
                          className="h-7 w-7 p-0"
                          data-testid={`button-copy-dashboard-link-${assignment.id}`}
                        >
                          <Link2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemoveAssignment(assignment.id)}
                          className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                          disabled={removeAssignmentMutation.isPending}
                          data-testid={`button-remove-assignment-${assignment.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Compenso */}
                    <div className="flex items-center justify-between border-t pt-2">
                      <div>
                        <p className="text-xs text-muted-foreground">Compenso</p>
                        <div className="flex items-center gap-1">
                          <span className="font-bold text-sm">
                            {assignment.compenso > 0 ? `€${assignment.compenso}` : 'Da definire'}
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={() => handleOpenEditCompensoModal(assignment)}
                            data-testid={`button-edit-compenso-${assignment.id}`}
                          >
                            <Pencil className="w-3 h-3" />
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {assignment.tipoPagamento === 'orario' && `${assignment.oreStimate}h • Orario`}
                          {assignment.tipoPagamento === 'giornaliero' && `${assignment.giorniStimati}gg • Giornaliero`}
                          {assignment.tipoPagamento === 'forfait' && 'Forfait'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-green-600 font-semibold">Pagato: €{pagato.toFixed(2)}</p>
                        {assignment.compenso > 0 && (
                          <p className="text-xs text-orange-600 font-semibold">Residuo: €{residuo.toFixed(2)}</p>
                        )}
                      </div>
                    </div>

                    {/* Ultimi pagamenti */}
                    {assignment.pagamenti && assignment.pagamenti.length > 0 && (
                      <div className="text-xs text-muted-foreground space-y-0.5 bg-gray-50 rounded p-2">
                        {assignment.pagamenti.slice(0, 2).map((pag) => (
                          <div key={pag.id} className="flex justify-between">
                            <span>{format(safeToDate(pag.data), 'dd/MM/yy', { locale: it })} ({pag.metodo})</span>
                            <span className="font-medium">€{pag.importo}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Prodotti/Mansioni */}
                    {((assignment.prodottiAssegnati?.length || 0) > 0 || (assignment.mansioniAssegnate?.length || 0) > 0) && (
                      <div className="flex flex-wrap gap-1 border-t pt-2">
                        {assignment.prodottiAssegnati?.map((p, idx) => (
                          <Badge key={idx} variant="secondary" className="text-xs">
                            <Package className="w-3 h-3 mr-1" />{p.label}
                          </Badge>
                        ))}
                        {assignment.mansioniAssegnate?.map((m, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            <ClipboardList className="w-3 h-3 mr-1" />{m}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {/* Azioni */}
                    <div className="flex gap-2 border-t pt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 text-xs h-8"
                        onClick={() => handleOpenPaymentModal(assignment)}
                        data-testid={`button-registra-pagamento-${assignment.id}`}
                      >
                        <CreditCard className="w-3 h-3 mr-1" />
                        {assignment.status === 'accepted' ? 'Registra Pagamento' : 'Registra Acconto'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs h-8 px-3"
                        onClick={() => handleOpenProductsTasksModal(assignment)}
                        data-testid={`button-products-tasks-${assignment.id}`}
                      >
                        <Pencil className="w-3 h-3 mr-1" />
                        Mansioni
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── DESKTOP: tabella ── */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Collaboratore</TableHead>
                    <TableHead>Ruolo</TableHead>
                    <TableHead>Prodotti/Mansioni</TableHead>
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
                          {(assignment.prodottiAssegnati?.length || 0) > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {assignment.prodottiAssegnati?.map((p, idx) => (
                                <Badge key={idx} variant="secondary" className="text-xs">
                                  <Package className="w-3 h-3 mr-1" />
                                  {p.label}
                                </Badge>
                              ))}
                            </div>
                          )}
                          {(assignment.mansioniAssegnate?.length || 0) > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {assignment.mansioniAssegnate?.map((m, idx) => (
                                <Badge key={idx} variant="outline" className="text-xs">
                                  <ClipboardList className="w-3 h-3 mr-1" />
                                  {m}
                                </Badge>
                              ))}
                            </div>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-xs"
                            onClick={() => handleOpenProductsTasksModal(assignment)}
                            title="Gestisci prodotti e mansioni"
                            data-testid={`button-products-tasks-${assignment.id}`}
                          >
                            <Pencil className="w-3 h-3 mr-1" />
                            Modifica
                          </Button>
                        </div>
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
                              `${assignment.oreStimate}h x €${assignment.compenso / (assignment.oreStimate || 1)}/h`}
                            {assignment.tipoPagamento === 'giornaliero' &&
                              `${assignment.giorniStimati}gg x €${assignment.compenso / (assignment.giorniStimati || 1)}/gg`}
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
                            {format(safeToDate(assignment.dataRisposta), 'dd/MM/yyyy', { locale: it })}
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
                                  {format(safeToDate(pag.data), 'dd/MM/yy', { locale: it })} - €{pag.importo} ({pag.metodo})
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
            </div>

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

        <Dialog open={isProductsTasksModalOpen} onOpenChange={setIsProductsTasksModalOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Gestisci Prodotti e Mansioni</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSubmitProductsTasks} className="space-y-4">
              <div>
                <Label className="mb-2 block">Prodotti da gestire</Label>
                {availableProducts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nessun prodotto disponibile per questo lavoro</p>
                ) : (
                  <div className="space-y-2 max-h-40 overflow-y-auto border rounded-md p-2">
                    {availableProducts.map((product, idx) => (
                      <div key={idx} className="flex items-center space-x-2">
                        <Checkbox
                          id={`product-${idx}`}
                          checked={productsTasksData.prodottiAssegnati.some(p => p.orderItemId === product.orderItemId)}
                          onCheckedChange={() => handleToggleProduct(product)}
                          data-testid={`checkbox-product-${idx}`}
                        />
                        <Label htmlFor={`product-${idx}`} className="text-sm font-normal cursor-pointer">
                          <Package className="w-4 h-4 inline mr-1" />
                          {product.label}
                          {product.qty && product.qty > 1 && ` (x${product.qty})`}
                        </Label>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <Label className="mb-2 block">Mansioni assegnate</Label>
                <div className="flex gap-2 mb-2">
                  <Input
                    placeholder="Es: Riprese aeree, Post-produzione..."
                    value={productsTasksData.nuovaMansione}
                    onChange={(e) => setProductsTasksData(prev => ({ ...prev, nuovaMansione: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddMansione();
                      }
                    }}
                    data-testid="input-nuova-mansione"
                  />
                  <Button type="button" variant="outline" onClick={handleAddMansione} data-testid="button-add-mansione">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                {productsTasksData.mansioniAssegnate.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {productsTasksData.mansioniAssegnate.map((mansione, idx) => (
                      <Badge key={idx} variant="secondary" className="gap-1">
                        <ClipboardList className="w-3 h-3" />
                        {mansione}
                        <button
                          type="button"
                          onClick={() => handleRemoveMansione(mansione)}
                          className="ml-1 hover:text-red-500"
                          data-testid={`button-remove-mansione-${idx}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsProductsTasksModalOpen(false)}>
                  Annulla
                </Button>
                <Button type="submit" disabled={updateProductsTasksMutation.isPending} data-testid="button-submit-products-tasks">
                  {updateProductsTasksMutation.isPending ? 'Salvataggio...' : 'Salva'}
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

        {/* AlertDialog per conferma rimozione collaboratore */}
        <AlertDialog open={!!removeAssignmentId} onOpenChange={(open) => !open && setRemoveAssignmentId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Rimuovi Collaboratore</AlertDialogTitle>
              <AlertDialogDescription>
                Sei sicuro di voler rimuovere questo collaboratore dal lavoro? 
                Questa azione non può essere annullata.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={removeAssignmentMutation.isPending}>Annulla</AlertDialogCancel>
              <AlertDialogAction 
                onClick={confirmRemoveAssignment}
                className="bg-red-600 hover:bg-red-700"
                disabled={removeAssignmentMutation.isPending}
              >
                {removeAssignmentMutation.isPending ? 'Rimozione...' : 'Rimuovi'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
