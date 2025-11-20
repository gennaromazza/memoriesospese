/**
 * PAYMENT SCHEDULE SECTION
 * Display payment schedules con tabella rate, status, actions
 */

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { convertFirestoreTimestamp } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { Loader2, CreditCard, CheckCircle2, AlertCircle, Clock, XCircle, Plus, MoreVertical, Edit, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import type { PaymentSchedule, PaymentStatus, PaymentType } from '@shared/payment-schedule-types';
import RegistraPagamentoModal from './RegistraPagamentoModal';
import GestioneRataModal from './GestioneRataModal';
import { useToast } from '@/hooks/use-toast';

interface PaymentScheduleSectionProps {
  jobId: string;
  eventDate?: Date | null;
  isAdmin?: boolean;
  onGeneratePayments?: () => void; // Callback per aprire modal generazione pagamenti
}

const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  acconto: 'Acconto',
  saldo: 'Saldo',
  rata: 'Rata',
};

const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  atteso: 'Atteso',
  pagato: 'Pagato',
  parziale: 'Parziale',
  scaduto: 'Scaduto',
};

const PAYMENT_STATUS_COLORS: Record<PaymentStatus, string> = {
  atteso: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  pagato: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  parziale: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  scaduto: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const PAYMENT_STATUS_ICONS: Record<PaymentStatus, typeof CheckCircle2> = {
  atteso: Clock,
  pagato: CheckCircle2,
  parziale: AlertCircle,
  scaduto: XCircle,
};

export default function PaymentScheduleSection({ jobId, eventDate, isAdmin = false, onGeneratePayments }: PaymentScheduleSectionProps) {
  const [selectedPayment, setSelectedPayment] = useState<{ id: string; tipo: string; importo: number; scheduleId: string } | null>(null);
  const [gestioneRataState, setGestioneRataState] = useState<{
    open: boolean;
    mode: 'add' | 'edit';
    scheduleId: string;
    payment?: any;
  } | null>(null);
  const [deletePaymentState, setDeletePaymentState] = useState<{
    scheduleId: string;
    paymentId: string;
    tipo: string;
    importo: number;
  } | null>(null);
  const { toast } = useToast();

  const { data: rawSchedules = [], isLoading } = useQuery<PaymentSchedule[]>({
    queryKey: ['payment-schedules', jobId],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/payment-schedules/job/${jobId}`);
      return response.json();
    },
    enabled: !!jobId,
  });

  // Normalize numeric fields + timestamps (Firestore returns numbers as strings, timestamps as plain objects)
  const schedules = (rawSchedules as any[]).map((schedule: any) => ({
    ...schedule,
    totale: Number(schedule.totale ?? 0),
    totalePagato: Number(schedule.totalePagato ?? 0),
    saldoResiduo: Number(schedule.saldoResiduo ?? 0),
    createdAt: convertFirestoreTimestamp(schedule.createdAt),
    updatedAt: convertFirestoreTimestamp(schedule.updatedAt),
    payments: schedule.payments.map((payment: any) => ({
      ...payment,
      importo: Number(payment.importo ?? 0),
      importoPagato: payment.importoPagato ? Number(payment.importoPagato) : undefined,
      dataScadenza: convertFirestoreTimestamp(payment.dataScadenza),
      dataPagamento: payment.dataPagamento ? convertFirestoreTimestamp(payment.dataPagamento) : null,
    })),
  }));

  // Calcola totali aggregati
  const totals = schedules.reduce(
    (acc: any, schedule: any) => ({
      totale: acc.totale + schedule.totale,
      totalePagato: acc.totalePagato + schedule.totalePagato,
      saldoResiduo: acc.saldoResiduo + schedule.saldoResiduo,
    }),
    { totale: 0, totalePagato: 0, saldoResiduo: 0 }
  );

  // Delete payment mutation
  const deleteMutation = useMutation({
    mutationFn: async ({ scheduleId, paymentId }: { scheduleId: string; paymentId: string }) => {
      const response = await fetch(`/api/payment-schedules/${scheduleId}/payments/${paymentId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Errore eliminazione rata');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-schedules', jobId] });
      queryClient.invalidateQueries({ queryKey: ['paymentSchedule', jobId] });
      queryClient.invalidateQueries({ queryKey: ['paymentSchedules', 'aggregated', jobId] });
      queryClient.invalidateQueries({ queryKey: ['jobs', jobId] });
      toast({
        title: 'Rata eliminata',
        description: 'La rata è stata eliminata con successo',
      });
      setDeletePaymentState(null);
    },
    onError: (error: Error) => {
      toast({
        title: 'Errore',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (schedules.length === 0) {
    // Se admin → mostra bottone per generare piano (disabled se callback non fornito)
    if (isAdmin) {
      const isDisabled = !onGeneratePayments;
      
      return (
        <div className="text-center py-12">
          <CreditCard className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="font-semibold text-lg mb-2">Nessun piano pagamenti</h3>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            {isDisabled 
              ? 'Caricamento preventivi in corso...' 
              : 'Crea uno scadenzario pagamenti basato sul preventivo firmato'}
          </p>
          <Button
            onClick={onGeneratePayments}
            size="lg"
            className="min-w-[200px]"
            disabled={isDisabled}
            data-testid="button-genera-piano-pagamenti"
          >
            {isDisabled ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Caricamento...
              </>
            ) : (
              <>
                <CreditCard className="h-5 w-5 mr-2" />
                Genera Piano Pagamenti
              </>
            )}
          </Button>
        </div>
      );
    }
    
    // Altrimenti → messaggio generico
    return (
      <div className="text-center py-8">
        <CreditCard className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
        <p className="text-muted-foreground mb-2">Nessun piano pagamenti generato</p>
        <p className="text-xs text-muted-foreground">
          Crea un preventivo e genera il piano pagamenti dopo la firma
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Totale Preventivato</p>
            <p className="text-2xl font-bold">€{totals.totale.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Totale Pagato</p>
            <p className="text-2xl font-bold text-green-600">€{totals.totalePagato.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Saldo Residuo</p>
            <p className="text-2xl font-bold text-orange-600">€{totals.saldoResiduo.toFixed(2)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Payment Schedules List */}
      {schedules.map((schedule: any) => (
        <Card key={schedule.id}>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span>Piano Pagamenti</span>
                <Badge variant="outline">
                  {schedule.payments.length} {schedule.payments.length === 1 ? 'rata' : 'rate'}
                </Badge>
              </div>
              {isAdmin && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setGestioneRataState({ open: true, mode: 'add', scheduleId: schedule.id })}
                  data-testid="button-add-rata"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Aggiungi Rata
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Payments Table */}
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Importo</TableHead>
                    <TableHead>Scadenza</TableHead>
                    <TableHead>Stato</TableHead>
                    {isAdmin && <TableHead className="text-right">Azioni</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schedule.payments.map((payment: any) => {
                    const StatusIcon = PAYMENT_STATUS_ICONS[payment.stato as PaymentStatus];
                    const isOverdue =
                      payment.stato === 'atteso' &&
                      payment.dataScadenza && payment.dataScadenza < new Date();

                    return (
                      <TableRow key={payment.id} data-testid={`row-payment-${payment.id}`}>
                        <TableCell className="font-medium">
                          {PAYMENT_TYPE_LABELS[payment.tipo as PaymentType]}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-semibold">€{payment.importo.toFixed(2)}</p>
                            {payment.importoPagato && payment.importoPagato !== payment.importo && (
                              <p className="text-xs text-muted-foreground">
                                Pagato: €{payment.importoPagato.toFixed(2)}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p>{payment.dataScadenza ? format(payment.dataScadenza, 'dd/MM/yyyy', { locale: it }) : 'N/A'}</p>
                            {isOverdue && (
                              <p className="text-xs text-red-600 dark:text-red-400">Scaduto</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={PAYMENT_STATUS_COLORS[payment.stato as PaymentStatus]}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {PAYMENT_STATUS_LABELS[payment.stato as PaymentStatus]}
                          </Badge>
                        </TableCell>
                        {isAdmin && (
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              {payment.stato !== 'pagato' && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setSelectedPayment({
                                      id: payment.id,
                                      tipo: payment.tipo,
                                      importo: payment.importo,
                                      scheduleId: schedule.id,
                                    })}
                                    data-testid={`button-register-payment-${payment.id}`}
                                  >
                                    <CheckCircle2 className="h-4 w-4 mr-1" />
                                    Registra
                                  </Button>

                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button size="sm" variant="ghost" data-testid={`button-actions-${payment.id}`}>
                                        <MoreVertical className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem
                                        onClick={() => setGestioneRataState({
                                          open: true,
                                          mode: 'edit',
                                          scheduleId: schedule.id,
                                          payment
                                        })}
                                        data-testid={`menu-edit-${payment.id}`}
                                      >
                                        <Edit className="h-4 w-4 mr-2" />
                                        Modifica
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        className="text-red-600"
                                        onClick={() => setDeletePaymentState({
                                          scheduleId: schedule.id,
                                          paymentId: payment.id,
                                          tipo: payment.tipo,
                                          importo: payment.importo,
                                        })}
                                        data-testid={`menu-delete-${payment.id}`}
                                      >
                                        <Trash2 className="h-4 w-4 mr-2" />
                                        Elimina
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </>
                              )}
                              {payment.stato === 'pagato' && payment.dataPagamento && (
                                <p className="text-xs text-muted-foreground">
                                  {format(payment.dataPagamento, 'dd/MM/yyyy', { locale: it })}
                                </p>
                              )}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Schedule Summary */}
            <div className="mt-4 pt-4 border-t flex justify-between items-center">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">
                  Creato: {schedule.createdAt ? format(schedule.createdAt, 'dd/MM/yyyy HH:mm', { locale: it }) : 'N/A'}
                </p>
                <p className="text-xs text-muted-foreground">
                  ID: {schedule.id.slice(0, 12)}...
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold">
                  €{schedule.totalePagato.toFixed(2)} / €{schedule.totale.toFixed(2)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Residuo: €{schedule.saldoResiduo.toFixed(2)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Registra Pagamento Modal */}
      {selectedPayment && (
        <RegistraPagamentoModal
          open={!!selectedPayment}
          onOpenChange={(open) => !open && setSelectedPayment(null)}
          scheduleId={selectedPayment.scheduleId}
          payment={selectedPayment}
          jobId={jobId}
        />
      )}

      {/* Gestione Rata Modal (Add/Edit) */}
      {gestioneRataState && (
        <GestioneRataModal
          open={gestioneRataState.open}
          onClose={() => setGestioneRataState(null)}
          scheduleId={gestioneRataState.scheduleId}
          jobId={jobId}
          eventDate={eventDate}
          payment={gestioneRataState.payment}
          mode={gestioneRataState.mode}
        />
      )}

      {/* Delete Payment Confirmation */}
      <AlertDialog open={!!deletePaymentState} onOpenChange={(open) => !open && setDeletePaymentState(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma Eliminazione</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare questa rata?
              <div className="mt-2 p-3 bg-muted rounded-md">
                <p className="font-semibold">{deletePaymentState?.tipo}</p>
                <p className="text-sm">Importo: €{deletePaymentState?.importo.toFixed(2)}</p>
              </div>
              <p className="mt-2 text-red-600 font-medium">Questa azione non può essere annullata.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletePaymentState) {
                  deleteMutation.mutate({
                    scheduleId: deletePaymentState.scheduleId,
                    paymentId: deletePaymentState.paymentId,
                  });
                }
              }}
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-confirm-delete"
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
