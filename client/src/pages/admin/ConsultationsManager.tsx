/**
 * Consultations Manager - Admin page per gestione prenotazioni consulenze
 */

import { useState, useMemo, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import ConflictResolutionModal from '@/components/consultations/ConflictResolutionModal';

interface ConsultationsManagerProps {
  highlightConsultationId?: string | null;
  onHighlightComplete?: () => void;
}
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';
import {
  useConsultations,
  useApproveConsultation,
  useRejectConsultation,
  useConvertToJob,
  useMarkConsultationViewed,
  useDeleteConsultation,
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
  Briefcase,
  Trash2,
  Loader2
} from 'lucide-react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

const STATUS_CONFIG: Record<ConsultationStatus, { label: string; variant: string; icon: typeof Clock }> = {
  in_attesa: { label: 'In Attesa', variant: 'bg-yellow-100 text-yellow-700 border-yellow-200', icon: Clock },
  confermata: { label: 'Confermata', variant: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle },
  rifiutata: { label: 'Rifiutata', variant: 'bg-red-100 text-red-700 border-red-200', icon: XCircle },
  completata: { label: 'Completata', variant: 'bg-blue-100 text-blue-700 border-blue-200', icon: FileText },
  annullata: { label: 'Annullata', variant: 'bg-gray-100 text-gray-700 border-gray-200', icon: XCircle }
};

/**
 * Helper: Normalizza Firestore Timestamp in Date
 * Supporta: { seconds }, { _seconds }, .toDate(), ISO string, Date object
 */
const normalizeTimestampToDate = (timestamp: any): Date | null => {
  try {
    if (!timestamp) return null;
    
    // Firestore Timestamp con proprietà seconds (formato standard)
    if (typeof timestamp === 'object' && typeof timestamp.seconds === 'number') {
      return new Date(timestamp.seconds * 1000);
    }
    
    // Firestore Timestamp con proprietà _seconds (formato admin SDK)
    if (typeof timestamp === 'object' && typeof timestamp._seconds === 'number') {
      return new Date(timestamp._seconds * 1000);
    }
    
    // Firestore Timestamp con metodo .toDate()
    if (typeof timestamp.toDate === 'function') {
      return timestamp.toDate();
    }
    
    // ISO string o Date object
    const date = new Date(timestamp);
    return isNaN(date.getTime()) ? null : date;
  } catch (error) {
    console.error('[normalizeTimestampToDate] Error:', error, 'timestamp:', timestamp);
    return null;
  }
};

const formatDataCreazione = (dataCreazione: any) => {
  const date = normalizeTimestampToDate(dataCreazione);
  return date ? format(date, 'd MMM yyyy', { locale: it }) : 'Data non disponibile';
};

export default function ConsultationsManager({
  highlightConsultationId,
  onHighlightComplete
}: ConsultationsManagerProps = {}) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedConsultation, setSelectedConsultation] = useState<Consultation | null>(null);
  const [approveConfirmId, setApproveConfirmId] = useState<string | null>(null);
  const [rejectConfirmId, setRejectConfirmId] = useState<string | null>(null);
  const [rejectMotivazione, setRejectMotivazione] = useState('');
  const [convertConfirmId, setConvertConfirmId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [bulkDeleteRifiutateOpen, setBulkDeleteRifiutateOpen] = useState(false);
  const [bulkDeleteInAttesaOpen, setBulkDeleteInAttesaOpen] = useState(false);
  const [conflictConsultationId, setConflictConsultationId] = useState<string | null>(null);
  
  // Refs per scroll deeplink
  const consultationRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const highlightTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const clearHighlightTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Ref per throttling auto-mark (evita chiamate ripetute)
  const autoMarkTriggeredRef = useRef(false);
  
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
  const deleteMutation = useDeleteConsultation();
  
  // Mutation bulk delete consultazioni rifiutate/annullate
  // 🔥 FIX: Passa esplicitamente la lista da eliminare per evitare problemi di closure
  const bulkDeleteRifiutateMutation = useMutation({
    mutationFn: async (idsToDelete: string[]) => {
      if (idsToDelete.length === 0) {
        throw new Error('Nessuna consultazione rifiutata/annullata da eliminare');
      }
      
      // Elimina sequenzialmente per evitare race conditions
      const errors: string[] = [];
      for (const id of idsToDelete) {
        try {
          await apiRequest('DELETE', `/api/consultations/${id}`);
        } catch (error: any) {
          errors.push(`${id}: ${error.message}`);
        }
      }
      
      if (errors.length > 0) {
        throw new Error(`Errori durante eliminazione: ${errors.join(', ')}`);
      }
      
      return idsToDelete.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['/api/consultations'] });
      toast({
        title: 'Pulizia completata',
        description: `${count} consultazione/i rifiutata/e o annullata/e eliminata/e con successo`,
      });
      setBulkDeleteRifiutateOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: 'Errore eliminazione',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  
  // Mutation bulk delete consultazioni in_attesa (senza notifica cliente)
  // 🔥 FIX: Passa esplicitamente la lista da eliminare per evitare problemi di closure
  const bulkDeleteInAttesaMutation = useMutation({
    mutationFn: async (idsToDelete: string[]) => {
      if (idsToDelete.length === 0) {
        throw new Error('Nessuna consultazione in attesa da eliminare');
      }
      
      // Elimina sequenzialmente per evitare race conditions
      const errors: string[] = [];
      for (const id of idsToDelete) {
        try {
          await apiRequest('DELETE', `/api/consultations/${id}`);
        } catch (error: any) {
          errors.push(`${id}: ${error.message}`);
        }
      }
      
      if (errors.length > 0) {
        throw new Error(`Errori durante eliminazione: ${errors.join(', ')}`);
      }
      
      return idsToDelete.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['/api/consultations'] });
      toast({
        title: 'Pulizia completata',
        description: `${count} richiesta/e in attesa eliminata/e con successo`,
      });
      setBulkDeleteInAttesaOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: 'Errore eliminazione',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  
  const templatesMap = useMemo(() => {
    const map: Record<string, ConsultationTemplate> = {};
    templates.forEach(t => {
      map[t.id] = t;
    });
    return map;
  }, [templates]);
  
  // 🎯 Filtro smart: default 'in_attesa' se esistono consultazioni da confermare, altrimenti 'all'
  useEffect(() => {
    if (!consultations || consultations.length === 0) return;
    
    const hasInAttesa = consultations.some(c => c.stato === 'in_attesa');
    
    // Setta filtro solo al primo caricamento (quando filterStatus è ancora 'all')
    if (filterStatus === 'all' && hasInAttesa) {
      setFilterStatus('in_attesa');
    }
  }, [consultations, filterStatus]);
  
  // 🔔 Auto-mark consulenze in_attesa come visualizzate (per notifiche)
  useEffect(() => {
    if (!consultations || !authReady || consultations.length === 0) return;
    
    const pendingConsultations = consultations.filter(
      c => c.stato === 'in_attesa' && !c.dataVisualizzazione
    );
    
    if (pendingConsultations.length === 0) {
      autoMarkTriggeredRef.current = false; // Reset se nessun pending
      return;
    }
    
    if (autoMarkTriggeredRef.current) return; // Già eseguito
    
    // Marca flag per evitare re-trigger
    autoMarkTriggeredRef.current = true;
    
    // Sequential mark (evita race conditions con mutateAsync)
    (async () => {
      try {
        for (const c of pendingConsultations) {
          await markViewedMutation.mutateAsync(c.id);
        }
      } catch (error) {
        console.error('[Auto-mark] Errore mark viewed:', error);
        autoMarkTriggeredRef.current = false; // Reset su errore per retry
      }
    })();
  }, [consultations, authReady, markViewedMutation]);
  
  // 🎯 Deeplink: scroll + highlight consultation da URL param
  useEffect(() => {
    // Cleanup timeout precedenti
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = null;
    }
    if (clearHighlightTimeoutRef.current) {
      clearTimeout(clearHighlightTimeoutRef.current);
      clearHighlightTimeoutRef.current = null;
    }

    if (!highlightConsultationId) return;

    // Attendi caricamento dati
    if (isLoading) return;

    // Cerca consultation nel dataset
    const targetConsultation = consultations.find((c) => c.id === highlightConsultationId);

    if (!targetConsultation) {
      console.warn(`Consultation ${highlightConsultationId} non trovata`);
      onHighlightComplete?.();
      return;
    }

    // Reset filtri per mostrare tutte le consulenze
    setFilterStatus('all');
    setSearchQuery('');

    // Timeout per assicurarsi che il DOM sia renderizzato
    highlightTimeoutRef.current = setTimeout(() => {
      const element = consultationRefs.current[highlightConsultationId];
      if (element) {
        // Scroll smooth
        element.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });

        // Aggiungi highlight temporaneo
        setHighlightedId(highlightConsultationId);

        // Rimuovi highlight dopo 3 secondi
        clearHighlightTimeoutRef.current = setTimeout(() => {
          setHighlightedId(null);
          onHighlightComplete?.();
        }, 3000);
      } else {
        console.warn(`DOM element per consultation ${highlightConsultationId} non trovato`);
        onHighlightComplete?.();
      }
    }, 300);

    // Cleanup
    return () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
      if (clearHighlightTimeoutRef.current) {
        clearTimeout(clearHighlightTimeoutRef.current);
      }
    };
  }, [highlightConsultationId, consultations, isLoading, onHighlightComplete]);
  
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
    
    console.log('[handleApprove] Approving with ID:', approveConfirmId);
    console.log('[handleApprove] All consultations:', consultations.map(c => ({ id: c.id, cliente: c.cliente.nome })));
    
    try {
      await approveMutation.mutateAsync(approveConfirmId);
      toast({
        title: 'Consulenza approvata',
        description: 'Evento creato su Google Calendar e email inviata al cliente'
      });
      setApproveConfirmId(null);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Approvazione fallita';
      console.error('[handleApprove] Error:', errorMessage);
      
      // Check for 409 conflict error
      if (errorMessage.includes('409') || errorMessage.toLowerCase().includes('conflict')) {
        // Close confirm dialog and open conflict resolution modal
        setApproveConfirmId(null);
        setConflictConsultationId(approveConfirmId);
      } else {
        // Generic error: show toast
        toast({
          variant: 'destructive',
          title: 'Errore',
          description: errorMessage
        });
      }
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
  
  const handleDelete = async () => {
    if (!deleteConfirmId) return;
    
    try {
      await deleteMutation.mutateAsync({ 
        id: deleteConfirmId,
        cancellationReason: cancellationReason.trim() || undefined
      });
      toast({
        title: 'Consulenza cancellata',
        description: 'Email di cancellazione inviata al cliente e evento rimosso da Calendar'
      });
      setDeleteConfirmId(null);
      setCancellationReason('');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Cancellazione fallita';
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
      const dateA = normalizeTimestampToDate(a.dataConsulenza)?.getTime() || 0;
      const dateB = normalizeTimestampToDate(b.dataConsulenza)?.getTime() || 0;
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
          <h1 className="text-3xl font-bold text-gray-900">Gestione Richieste Info</h1>
          <p className="text-gray-600 mt-1">
            {consultations.length} richieste totali
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
          <div className="grid grid-cols-2 gap-4 mb-4">
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
          
          {(consultations.filter(c => c.stato === 'rifiutata' || c.stato === 'annullata').length > 0 || 
            consultations.filter(c => c.stato === 'in_attesa').length > 0) && (
            <div className="flex justify-end gap-2 flex-wrap">
              {consultations.filter(c => c.stato === 'in_attesa').length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setBulkDeleteInAttesaOpen(true)}
                  className="text-amber-600 hover:bg-amber-50"
                  data-testid="button-cleanup-in-attesa"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Pulisci richieste in attesa ({consultations.filter(c => c.stato === 'in_attesa').length})
                </Button>
              )}
              {consultations.filter(c => c.stato === 'rifiutata' || c.stato === 'annullata').length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setBulkDeleteRifiutateOpen(true)}
                  className="text-red-600 hover:bg-red-50"
                  data-testid="button-cleanup-rifiutate"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Pulisci consultazioni rifiutate/annullate ({consultations.filter(c => c.stato === 'rifiutata' || c.stato === 'annullata').length})
                </Button>
              )}
            </div>
          )}
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
                  <TableHead>Data Richiesta</TableHead>
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
                  const config = STATUS_CONFIG[consultation.stato];
                  const jobDataCount = Object.keys(consultation.jobDataCollected || {}).length;
                  const isHighlighted = highlightedId === consultation.id;
                  
                  // 🔍 DEBUG: Log formato dataConsulenza
                  console.log('🔍 [DEBUG] consultation.dataConsulenza:', consultation.dataConsulenza);
                  console.log('🔍 [DEBUG] consultation.dataConsulenza type:', typeof consultation.dataConsulenza);
                  console.log('🔍 [DEBUG] consultation object:', consultation);
                  
                  return (
                    <TableRow 
                      key={consultation.id} 
                      data-testid={`row-consultation-${consultation.id}`}
                      ref={(el) => {
                        consultationRefs.current[consultation.id] = el;
                      }}
                      className={isHighlighted ? 'bg-amber-50 dark:bg-amber-950/20 border-2 border-amber-500 shadow-lg transition-all' : ''}
                    >
                      <TableCell>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1 text-sm font-medium">
                            <Calendar className="w-3 h-3" />
                            {(() => {
                              const date = normalizeTimestampToDate(consultation.dataConsulenza);
                              console.log('🔍 [DEBUG] normalized date:', date);
                              return date ? format(date, 'dd MMM yyyy', { locale: it }) : 'Data non valida';
                            })()}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-gray-500">
                            <Clock className="w-3 h-3" />
                            {consultation.orarioInizio} - {consultation.orarioFine}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{formatDataCreazione(consultation.createdAt)}</TableCell>
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
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setConvertConfirmId(consultation.id)}
                                className="text-blue-600 hover:text-blue-700"
                                data-testid={`button-convert-${consultation.id}`}
                              >
                                <Briefcase className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeleteConfirmId(consultation.id)}
                                className="text-red-600 hover:text-red-700"
                                data-testid={`button-delete-${consultation.id}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                          
                          {consultation.stato === 'rifiutata' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteConfirmId(consultation.id)}
                              className="text-red-600 hover:text-red-700"
                              data-testid={`button-delete-${consultation.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
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
                    {(() => {
                      const date = normalizeTimestampToDate(selectedConsultation.dataConsulenza);
                      return date ? format(date, 'dd MMMM yyyy', { locale: it }) : 'Data non disponibile';
                    })()}
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
      
      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={() => {
        setDeleteConfirmId(null);
        setCancellationReason('');
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma Cancellazione Consulenza</AlertDialogTitle>
            <AlertDialogDescription>
              Eliminando questa consulenza confermata verranno eseguite le seguenti azioni:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <ul className="list-disc list-inside space-y-1 text-sm text-gray-600 mb-4">
              <li>Rimozione dell'evento da Google Calendar</li>
              <li>Invio email di cancellazione al cliente</li>
              <li>Eliminazione definitiva della prenotazione</li>
            </ul>
            <Label htmlFor="cancellationReason" className="text-sm font-medium mb-2 block">
              Motivo Cancellazione (opzionale)
            </Label>
            <Input
              id="cancellationReason"
              placeholder="es. Imprevisto dello studio, maltempo, cambio disponibilità..."
              value={cancellationReason}
              onChange={(e) => setCancellationReason(e.target.value)}
              data-testid="input-cancellation-reason"
            />
            <p className="text-xs text-gray-500 mt-2">
              Il motivo verrà incluso nell'email inviata al cliente
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-confirm-delete"
            >
              Cancella Consulenza
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Bulk Delete Rifiutate/Annullate Confirmation */}
      <AlertDialog open={bulkDeleteRifiutateOpen} onOpenChange={setBulkDeleteRifiutateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pulizia Consultazioni Rifiutate/Annullate</AlertDialogTitle>
            <AlertDialogDescription>
              Stai per eliminare definitivamente tutte le consultazioni rifiutate o annullate ({consultations.filter(c => c.stato === 'rifiutata' || c.stato === 'annullata').length} totali).
              Questa operazione cancellerà anche gli eventuali eventi Google Calendar associati ed è irreversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-bulk-delete">Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const idsToDelete = consultations
                  .filter(c => c.stato === 'rifiutata' || c.stato === 'annullata')
                  .map(c => c.id);
                bulkDeleteRifiutateMutation.mutate(idsToDelete);
              }}
              className="bg-red-600 hover:bg-red-700"
              disabled={bulkDeleteRifiutateMutation.isPending}
              data-testid="button-confirm-bulk-delete"
            >
              {bulkDeleteRifiutateMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Eliminazione...
                </>
              ) : (
                'Elimina Tutto'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Bulk Delete In Attesa Confirmation */}
      <AlertDialog open={bulkDeleteInAttesaOpen} onOpenChange={setBulkDeleteInAttesaOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pulizia Richieste in Attesa</AlertDialogTitle>
            <AlertDialogDescription>
              Stai per eliminare definitivamente tutte le richieste in attesa ({consultations.filter(c => c.stato === 'in_attesa').length} totali).
              <strong className="block mt-2">Nessuna email verrà inviata ai clienti.</strong>
              Questa operazione è irreversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-bulk-delete-in-attesa">Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const idsToDelete = consultations
                  .filter(c => c.stato === 'in_attesa')
                  .map(c => c.id);
                bulkDeleteInAttesaMutation.mutate(idsToDelete);
              }}
              className="bg-amber-600 hover:bg-amber-700"
              disabled={bulkDeleteInAttesaMutation.isPending}
              data-testid="button-confirm-bulk-delete-in-attesa"
            >
              {bulkDeleteInAttesaMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Eliminazione...
                </>
              ) : (
                'Elimina Tutto'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Conflict Resolution Modal */}
      <ConflictResolutionModal
        open={!!conflictConsultationId}
        onClose={() => setConflictConsultationId(null)}
        consultationId={conflictConsultationId || ''}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['/api/consultations'] });
        }}
      />
    </div>
  );
}
