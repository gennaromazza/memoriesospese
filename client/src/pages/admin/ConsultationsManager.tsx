/**
 * Consultations Manager - Admin page per gestione prenotazioni consulenze
 */

import { useState, useMemo } from 'react';
import { useLocation } from 'wouter';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';
import {
  useConsultations,
  useApproveConsultation,
  useRejectConsultation,
  useConvertToJob,
  useMarkConsultationViewed,
  useTemplates
} from '@/lib/consultations';
import type { Consultation, ConsultationStatus, ConsultationTemplate } from '@shared/consultation-types';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { useToast } from '@/hooks/use-toast';
import {
  CheckCircle,
  XCircle,
  Eye,
  Calendar,
  Clock,
  User,
  Mail,
  Phone,
  FileText,
  ExternalLink,
  Briefcase
} from 'lucide-react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

const STATUS_CONFIG: Record<ConsultationStatus, { label: string; variant: string; icon: typeof Clock }> = {
  in_attesa: { label: 'In Attesa', variant: 'bg-yellow-100 text-yellow-700 border-yellow-200', icon: Clock },
  confermata: { label: 'Confermata', variant: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle },
  completata: { label: 'Completata', variant: 'bg-blue-100 text-blue-700 border-blue-200', icon: FileText },
  annullata: { label: 'Annullata', variant: 'bg-red-100 text-red-700 border-red-200', icon: XCircle }
};

export default function ConsultationsManager() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedConsultation, setSelectedConsultation] = useState<Consultation | null>(null);
  const [approveConfirmId, setApproveConfirmId] = useState<string | null>(null);
  const [rejectConfirmId, setRejectConfirmId] = useState<string | null>(null);
  const [rejectMotivazione, setRejectMotivazione] = useState('');
  const [convertConfirmId, setConvertConfirmId] = useState<string | null>(null);
  
  // Auth state
  const { user, isLoading: authLoading } = useFirebaseAuth();
  const authReady = !authLoading && !!user;
  
  // Queries
  const { data: consultations = [], isLoading } = useConsultations(authReady);
  const { data: templates = [] } = useTemplates(authReady);
  const approveMutation = useApproveConsultation();
  const rejectMutation = useRejectConsultation();
  const convertMutation = useConvertToJob();
  const markViewedMutation = useMarkConsultationViewed();
  
  const templatesMap = useMemo(() => {
    const map: Record<string, ConsultationTemplate> = {};
    templates.forEach(t => {
      map[t.id] = t;
    });
    return map;
  }, [templates]);
  
  const handleViewDetails = async (consultation: Consultation) => {
    setSelectedConsultation(consultation);
    
    if (!consultation.dataVisualizzazione) {
      try {
        await markViewedMutation.mutateAsync(consultation.id);
      } catch (error) {
        console.error('Failed to mark viewed:', error);
      }
    }
  };
  
  const handleApprove = async () => {
    if (!approveConfirmId) return;
    
    try {
      await approveMutation.mutateAsync(approveConfirmId);
      toast({
        title: 'Consulenza approvata',
        description: 'Evento creato su Google Calendar e email inviata al cliente'
      });
      setApproveConfirmId(null);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Approvazione fallita';
      toast({
        variant: 'destructive',
        title: 'Errore',
        description: errorMessage
      });
    }
  };
  
  const handleReject = async () => {
    if (!rejectConfirmId || !rejectMotivazione.trim()) {
      toast({
        variant: 'destructive',
        title: 'Motivazione obbligatoria',
        description: 'Inserisci una motivazione per il rifiuto'
      });
      return;
    }
    
    try {
      await rejectMutation.mutateAsync({ 
        id: rejectConfirmId, 
        motivazione: rejectMotivazione 
      });
      toast({
        title: 'Consulenza rifiutata',
        description: 'Email di rifiuto inviata al cliente'
      });
      setRejectConfirmId(null);
      setRejectMotivazione('');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Rifiuto fallito';
      toast({
        variant: 'destructive',
        title: 'Errore',
        description: errorMessage
      });
    }
  };
  
  const handleConvertToJob = async () => {
    if (!convertConfirmId) return;
    
    try {
      const result = await convertMutation.mutateAsync(convertConfirmId) as unknown as { jobId: string };
      toast({
        title: 'Job creato',
        description: `Consulenza convertita in job con successo`
      });
      setConvertConfirmId(null);
      
      if (result?.jobId) {
        navigate(`/admin/jobs/${result.jobId}`);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Conversione fallita';
      toast({
        variant: 'destructive',
        title: 'Errore',
        description: errorMessage
      });
    }
  };
  
  const filteredConsultations = useMemo(() => {
    return consultations.filter(c => {
      if (filterStatus !== 'all' && c.stato !== filterStatus) return false;
      
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const clienteNome = `${c.cliente.nome} ${c.cliente.cognome}`.toLowerCase();
        const template = templatesMap[c.templateId];
        const templateNome = template?.nome.toLowerCase() || '';
        
        if (!clienteNome.includes(query) && !templateNome.includes(query)) {
          return false;
        }
      }
      
      return true;
    });
  }, [consultations, filterStatus, searchQuery, templatesMap]);
  
  const sortedConsultations = useMemo(() => {
    return [...filteredConsultations].sort((a, b) => {
      const dateA = typeof a.dataConsulenza.toDate === 'function' 
        ? a.dataConsulenza.toDate().getTime()
        : new Date(a.dataConsulenza as any).getTime();
      const dateB = typeof b.dataConsulenza.toDate === 'function' 
        ? b.dataConsulenza.toDate().getTime()
        : new Date(b.dataConsulenza as any).getTime();
      
      return dateB - dateA;
    });
  }, [filteredConsultations]);
  
  const statsCounts = useMemo(() => {
    return consultations.reduce((acc, c) => {
      acc[c.stato] = (acc[c.stato] || 0) + 1;
      return acc;
    }, {} as Record<ConsultationStatus, number>);
  }, [consultations]);

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Gestione Consulenze</h1>
          <p className="text-gray-600 mt-1">
            {consultations.length} prenotazioni totali
          </p>
        </div>
      </div>
      
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {(['in_attesa', 'confermata', 'completata', 'annullata'] as ConsultationStatus[]).map((status) => {
          const config = STATUS_CONFIG[status];
          const count = statsCounts[status] || 0;
          const Icon = config.icon;
          
          return (
            <Card 
              key={status} 
              className="cursor-pointer hover:shadow-md transition-shadow" 
              onClick={() => setFilterStatus(status)}
              data-testid={`card-status-${status}`}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-gray-600">
                    {config.label}
                  </CardTitle>
                  <Icon className="w-4 h-4 text-gray-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid={`count-status-${status}`}>{count}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      
      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Stato</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger data-testid="select-filter-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti</SelectItem>
                  <SelectItem value="in_attesa">In Attesa</SelectItem>
                  <SelectItem value="confermata">Confermate</SelectItem>
                  <SelectItem value="completata">Completate</SelectItem>
                  <SelectItem value="annullata">Annullate</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Cerca</Label>
              <Input
                placeholder="Nome cliente o template..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="input-search"
              />
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Prenotazioni</CardTitle>
          <CardDescription>
            {sortedConsultations.length} prenotazioni trovate
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Caricamento...</div>
          ) : sortedConsultations.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="w-12 h-12 mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500">
                {consultations.length === 0 
                  ? 'Nessuna consulenza prenotata' 
                  : 'Nessuna consulenza trovata con i filtri selezionati'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data/Ora</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead>Job Data</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedConsultations.map((consultation) => {
                  const template = templatesMap[consultation.templateId];
                  const consultationDate = typeof consultation.dataConsulenza.toDate === 'function'
                    ? consultation.dataConsulenza.toDate()
                    : new Date(consultation.dataConsulenza as any);
                  const config = STATUS_CONFIG[consultation.stato];
                  const jobDataCount = Object.keys(consultation.jobDataCollected || {}).length;
                  
                  return (
                    <TableRow key={consultation.id} data-testid={`row-consultation-${consultation.id}`}>
                      <TableCell>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1 text-sm font-medium">
                            <Calendar className="w-3 h-3" />
                            {format(consultationDate, 'dd MMM yyyy', { locale: it })}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-gray-500">
                            <Clock className="w-3 h-3" />
                            {consultation.orarioInizio} - {consultation.orarioFine}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1 font-medium">
                            <User className="w-3 h-3" />
                            {consultation.cliente.nome} {consultation.cliente.cognome}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-gray-500">
                            <Mail className="w-3 h-3" />
                            {consultation.cliente.email}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-gray-500">
                            <Phone className="w-3 h-3" />
                            {consultation.cliente.whatsapp}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {template?.nome || 'Template non trovato'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={config.variant}>
                          {config.label}
                        </Badge>
                        {!consultation.dataVisualizzazione && (
                          <Badge variant="outline" className="ml-2 bg-blue-50 text-blue-600 text-xs">
                            Nuovo
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {jobDataCount} {jobDataCount === 1 ? 'campo' : 'campi'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewDetails(consultation)}
                            data-testid={`button-view-${consultation.id}`}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          
                          {consultation.stato === 'in_attesa' && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setApproveConfirmId(consultation.id)}
                                className="text-green-600 hover:text-green-700"
                                data-testid={`button-approve-${consultation.id}`}
                              >
                                <CheckCircle className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setRejectConfirmId(consultation.id)}
                                className="text-red-600 hover:text-red-700"
                                data-testid={`button-reject-${consultation.id}`}
                              >
                                <XCircle className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                          
                          {consultation.stato === 'confermata' && !consultation.jobCreated && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setConvertConfirmId(consultation.id)}
                              className="text-blue-600 hover:text-blue-700"
                              data-testid={`button-convert-${consultation.id}`}
                            >
                              <Briefcase className="w-4 h-4" />
                            </Button>
                          )}
                          
                          {consultation.jobCreated && consultation.jobId && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigate(`/admin/jobs/${consultation.jobId}`)}
                              data-testid={`button-view-job-${consultation.id}`}
                            >
                              <ExternalLink className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      
      {/* Details Dialog */}
      <Dialog open={!!selectedConsultation} onOpenChange={() => setSelectedConsultation(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Dettagli Consulenza</DialogTitle>
            <DialogDescription>
              Informazioni complete sulla prenotazione
            </DialogDescription>
          </DialogHeader>
          
          {selectedConsultation && (
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-gray-500">Cliente</Label>
                  <p className="font-medium">
                    {selectedConsultation.cliente.nome} {selectedConsultation.cliente.cognome}
                  </p>
                </div>
                
                <div>
                  <Label className="text-xs text-gray-500">Email</Label>
                  <p className="font-medium">{selectedConsultation.cliente.email}</p>
                </div>
                
                <div>
                  <Label className="text-xs text-gray-500">WhatsApp</Label>
                  <p className="font-medium">{selectedConsultation.cliente.whatsapp}</p>
                </div>
                
                <div>
                  <Label className="text-xs text-gray-500">Template</Label>
                  <p className="font-medium">
                    {templatesMap[selectedConsultation.templateId]?.nome || 'N/A'}
                  </p>
                </div>
                
                <div>
                  <Label className="text-xs text-gray-500">Data</Label>
                  <p className="font-medium">
                    {format(
                      typeof selectedConsultation.dataConsulenza.toDate === 'function'
                        ? selectedConsultation.dataConsulenza.toDate()
                        : new Date(selectedConsultation.dataConsulenza as any),
                      'dd MMMM yyyy',
                      { locale: it }
                    )}
                  </p>
                </div>
                
                <div>
                  <Label className="text-xs text-gray-500">Orario</Label>
                  <p className="font-medium">
                    {selectedConsultation.orarioInizio} - {selectedConsultation.orarioFine}
                  </p>
                </div>
                
                <div className="col-span-2">
                  <Label className="text-xs text-gray-500">Note</Label>
                  <p className="font-medium">{selectedConsultation.note || 'Nessuna nota'}</p>
                </div>
              </div>
              
              {selectedConsultation.jobDataCollected && Object.keys(selectedConsultation.jobDataCollected).length > 0 && (
                <div className="border-t pt-4">
                  <Label className="text-sm font-medium mb-3 block">Dati Job Raccolti</Label>
                  <div className="space-y-2">
                    {Object.entries(selectedConsultation.jobDataCollected).map(([key, value]) => {
                      const template = templatesMap[selectedConsultation.templateId];
                      const fieldDef = template?.jobDataFields?.find(f => f.fieldKey === key);
                      const label = fieldDef?.label || key;
                      
                      return (
                        <div key={key} className="flex items-start gap-2">
                          <Label className="text-xs text-gray-500 min-w-[120px]">{label}:</Label>
                          <p className="font-medium text-sm">
                            {Array.isArray(value) ? value.join(', ') : String(value)}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              
              {selectedConsultation.googleCalendarEventId && (
                <div className="border-t pt-4">
                  <Label className="text-xs text-gray-500">Google Calendar Event ID</Label>
                  <p className="font-mono text-xs text-gray-600">
                    {selectedConsultation.googleCalendarEventId}
                  </p>
                </div>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSelectedConsultation(null)}
              data-testid="button-close-details"
            >
              Chiudi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Approve Confirmation */}
      <AlertDialog open={!!approveConfirmId} onOpenChange={() => setApproveConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma Approvazione</AlertDialogTitle>
            <AlertDialogDescription>
              Approvando questa consulenza verrà creato automaticamente un evento su Google Calendar
              e inviata un'email di conferma al cliente. Continuare?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-approve">Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleApprove}
              className="bg-green-600 hover:bg-green-700"
              data-testid="button-confirm-approve"
            >
              Approva
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Reject Confirmation */}
      <AlertDialog open={!!rejectConfirmId} onOpenChange={() => {
        setRejectConfirmId(null);
        setRejectMotivazione('');
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma Rifiuto</AlertDialogTitle>
            <AlertDialogDescription>
              Rifiutando questa consulenza verrà inviata un'email di rifiuto al cliente.
              Questa azione è irreversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="motivazione" className="text-sm font-medium mb-2 block">
              Motivazione Rifiuto *
            </Label>
            <Input
              id="motivazione"
              placeholder="es. Slot non più disponibile, conferma di altre prenotazioni, ecc."
              value={rejectMotivazione}
              onChange={(e) => setRejectMotivazione(e.target.value)}
              data-testid="input-reject-motivazione"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-reject">Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReject}
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-confirm-reject"
            >
              Rifiuta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Convert to Job Confirmation */}
      <AlertDialog open={!!convertConfirmId} onOpenChange={() => setConvertConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Converti in Job</AlertDialogTitle>
            <AlertDialogDescription>
              Verrà creato un nuovo job utilizzando i dati raccolti dalla consulenza.
              Il cliente verrà automaticamente collegato al job. Continuare?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-convert">Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConvertToJob}
              className="bg-blue-600 hover:bg-blue-700"
              data-testid="button-confirm-convert"
            >
              Converti
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
