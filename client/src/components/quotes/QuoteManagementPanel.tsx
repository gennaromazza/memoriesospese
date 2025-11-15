/**
 * Quote Management Panel - Controlli admin per gestione stato preventivo
 * Permette cambio stato manuale, inserimento firma retroattiva, visualizzazione audit log
 */

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  FileEdit, 
  RotateCcw, 
  AlertTriangle, 
  Check,
  PenTool,
  Clock,
  Link as LinkIcon
} from 'lucide-react';
import type { Quote, QuoteStatus } from '@shared/quotes-types';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

interface QuoteManagementPanelProps {
  quote: Quote;
}

const statusLabels: Record<QuoteStatus, string> = {
  bozza: 'Bozza',
  inviato: 'Inviato',
  visionato: 'Visionato',
  firmato: 'Firmato',
  rifiutato: 'Rifiutato',
  scaduto: 'Scaduto',
  annullato: 'Annullato'
};

const statusColors: Record<QuoteStatus, string> = {
  bozza: 'bg-gray-500',
  inviato: 'bg-blue-500',
  visionato: 'bg-cyan-500',
  firmato: 'bg-green-500',
  rifiutato: 'bg-red-500',
  scaduto: 'bg-orange-500',
  annullato: 'bg-red-600'
};

export default function QuoteManagementPanel({ quote }: QuoteManagementPanelProps) {
  const { user } = useFirebaseAuth();
  const { toast } = useToast();
  
  const [selectedStatus, setSelectedStatus] = useState<QuoteStatus>(quote.status);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmReason, setConfirmReason] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  
  const [showSignatureDialog, setShowSignatureDialog] = useState(false);
  const [signatureData, setSignatureData] = useState({
    clientName: '',
    signedAt: '',
    reason: ''
  });

  // Fetch audit log
  const { data: auditLog } = useQuery({
    queryKey: ['/api/quotes', quote.id, 'audit'],
    queryFn: async () => {
      // Fetch dalla collection quoteAuditLog filtrata per quoteId
      const { db } = await import('@/lib/firebase');
      const { collection, query, where, getDocs, orderBy } = await import('firebase/firestore');
      
      const q = query(
        collection(db, 'quoteAuditLog'),
        where('quoteId', '==', quote.id),
        orderBy('timestamp', 'desc')
      );
      
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
  });

  // Mutation cambio stato
  const changeStatusMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest<any>(`/api/quotes/${quote.id}/status`, {
        method: 'PATCH',
        body: {
          newStatus: selectedStatus,
          reason: confirmReason || undefined
        },
        headers: {
          'x-admin-email': user?.email || ''
        }
      });
      return res;
    },
    onSuccess: (data) => {
      toast({
        title: '✅ Stato aggiornato',
        description: data.message
      });
      
      if (data.warnings && data.warnings.length > 0) {
        toast({
          title: '⚠️ Attenzione',
          description: data.warnings.join('\n'),
          variant: 'default'
        });
      }
      
      setShowConfirmDialog(false);
      setConfirmReason('');
      setWarnings([]);
      queryClient.invalidateQueries({ queryKey: ['/api/quotes', quote.id] });
    },
    onError: (error: any) => {
      toast({
        title: '❌ Errore cambio stato',
        description: error.message || 'Impossibile modificare lo stato',
        variant: 'destructive'
      });
    }
  });

  // Mutation firma manuale
  const signatureManualMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest<any>(`/api/quotes/${quote.id}/signature/manual`, {
        method: 'PATCH',
        body: signatureData,
        headers: {
          'x-admin-email': user?.email || ''
        }
      });
      return res;
    },
    onSuccess: (data) => {
      toast({
        title: '✅ Firma inserita',
        description: data.message
      });
      setShowSignatureDialog(false);
      setSignatureData({ clientName: '', signedAt: '', reason: '' });
      queryClient.invalidateQueries({ queryKey: ['/api/quotes', quote.id] });
    },
    onError: (error: any) => {
      toast({
        title: '❌ Errore inserimento firma',
        description: error.message || 'Impossibile inserire la firma',
        variant: 'destructive'
      });
    }
  });

  const handleStatusChange = async (newStatus: QuoteStatus) => {
    setSelectedStatus(newStatus);
    
    // Preflight validation: ottieni warnings prima di mostrare dialog
    try {
      const data = await apiRequest<{
        allowed: boolean;
        warnings?: string[];
        error?: string;
      }>(`/api/quotes/${quote.id}/status/validate?newStatus=${newStatus}`, {
        method: 'GET',
        headers: {
          'x-admin-email': user?.email || ''
        }
      });
      
      if (!data.allowed) {
        // Blocco hard: mostra errore e non aprire dialog
        toast({
          title: '❌ Cambio stato bloccato',
          description: data.error || 'Cambio stato non consentito',
          variant: 'destructive'
        });
        setSelectedStatus(quote.status); // Reset
        return;
      }
      
      // Imposta warnings se presenti
      setWarnings(data.warnings || []);
    } catch (error) {
      console.error('Errore preflight validation:', error);
      toast({
        title: '⚠️ Errore validazione',
        description: error instanceof Error ? error.message : 'Impossibile validare il cambio stato',
        variant: 'destructive'
      });
      setSelectedStatus(quote.status); // Reset
      return;
    }
    
    setShowConfirmDialog(true);
  };

  const handleConfirmStatusChange = () => {
    changeStatusMutation.mutate();
  };

  const handleOpenSignatureDialog = () => {
    // Pre-compila con dati cliente se disponibili
    const defaultClientName = quote.clientiInfo && quote.clientiInfo.length > 0
      ? `${quote.clientiInfo[0].nome} ${quote.clientiInfo[0].cognome}`.trim()
      : '';
    
    setSignatureData({
      clientName: defaultClientName,
      signedAt: new Date().toISOString().split('T')[0], // Oggi
      reason: ''
    });
    setShowSignatureDialog(true);
  };

  const handleSubmitManualSignature = () => {
    if (!signatureData.clientName || !signatureData.signedAt) {
      toast({
        title: '⚠️ Dati incompleti',
        description: 'Nome cliente e data firma sono obbligatori',
        variant: 'destructive'
      });
      return;
    }
    signatureManualMutation.mutate();
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileEdit className="h-5 w-5" />
            Gestione Stato Preventivo
          </CardTitle>
          <CardDescription>
            Modifica manuale dello stato e firma del preventivo
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Stato Attuale */}
          <div className="space-y-2">
            <Label>Stato Attuale</Label>
            <div className="flex items-center gap-2">
              <Badge className={statusColors[quote.status]}>
                {statusLabels[quote.status]}
              </Badge>
              {quote.signature && (
                <Badge variant="outline" className="text-green-600">
                  <Check className="h-3 w-3 mr-1" />
                  Firmato da {quote.signature.clientName}
                </Badge>
              )}
            </div>
          </div>

          {/* Cambio Stato */}
          <div className="space-y-2">
            <Label htmlFor="status-select">Cambia Stato</Label>
            <Select
              value={selectedStatus}
              onValueChange={(value) => handleStatusChange(value as QuoteStatus)}
            >
              <SelectTrigger id="status-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bozza">Bozza</SelectItem>
                <SelectItem value="inviato">Inviato</SelectItem>
                <SelectItem value="visionato">Visionato</SelectItem>
                <SelectItem value="firmato">Firmato</SelectItem>
                <SelectItem value="rifiutato">Rifiutato</SelectItem>
                <SelectItem value="scaduto">Scaduto</SelectItem>
                <SelectItem value="annullato">Annullato</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Seleziona il nuovo stato per aprire la conferma
            </p>
          </div>

          {/* Firma Manuale */}
          <div className="pt-4 border-t">
            <Button
              variant="outline"
              className="w-full"
              onClick={handleOpenSignatureDialog}
              data-testid="button-manual-signature"
            >
              <PenTool className="h-4 w-4 mr-2" />
              Inserisci Firma Manuale
            </Button>
          </div>

          {/* Link Pubblico */}
          {quote.publicToken && (
            <div className="pt-4 border-t space-y-2">
              <Label className="flex items-center gap-2">
                <LinkIcon className="h-4 w-4" />
                Link Pubblico
              </Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={`${window.location.origin}/quote/${quote.publicToken}`}
                  className="font-mono text-xs"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/quote/${quote.publicToken}`);
                    toast({ title: '✅ Link copiato' });
                  }}
                >
                  Copia
                </Button>
              </div>
            </div>
          )}

          {/* Token Revocati */}
          {quote.revokedTokens && quote.revokedTokens.length > 0 && (
            <div className="pt-4 border-t space-y-2">
              <Label>Token Revocati ({quote.revokedTokens.length})</Label>
              <Alert>
                <AlertDescription className="text-sm">
                  {quote.revokedTokens.length} link revocati. I vecchi link non sono più validi.
                </AlertDescription>
              </Alert>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {quote.revokedTokens.map((rt, i) => (
                  <div key={i} className="text-xs text-muted-foreground bg-muted p-2 rounded">
                    <div className="font-mono truncate">{rt.token}</div>
                    <div className="flex gap-2 mt-1">
                      <span>Revocato: {rt.revokedAt ? format(new Date(rt.revokedAt.seconds * 1000), 'dd MMM yyyy HH:mm', { locale: it }) : 'N/D'}</span>
                      <span>•</span>
                      <span>Da: {rt.revokedBy}</span>
                    </div>
                    <div className="text-xs italic">{rt.reason}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cronologia Modifiche (Audit Log) */}
      {auditLog && auditLog.length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Cronologia Modifiche
            </CardTitle>
            <CardDescription>
              Storico delle operazioni admin su questo preventivo
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {auditLog.map((event: any) => {
                const actionLabels: Record<string, string> = {
                  status_change: 'Cambio Stato',
                  signature_override: 'Firma Manuale',
                  token_regenerated: 'Link Rigenerato',
                  quote_created: 'Preventivo Creato',
                  quote_deleted: 'Preventivo Eliminato'
                };

                return (
                  <div key={event.id} className="border-l-2 border-primary/20 pl-4 py-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <Badge variant="outline" className="mb-1">
                          {actionLabels[event.action] || event.action}
                        </Badge>
                        <div className="text-sm">
                          {event.action === 'status_change' && (
                            <span>
                              Da <strong>{statusLabels[event.previousValue as QuoteStatus] || event.previousValue}</strong> a <strong>{statusLabels[event.newValue as QuoteStatus] || event.newValue}</strong>
                            </span>
                          )}
                          {event.action === 'signature_override' && (
                            <span>Firma inserita manualmente: <strong>{event.newValue?.clientName}</strong></span>
                          )}
                          {event.action === 'token_regenerated' && (
                            <span>Link pubblico rigenerato</span>
                          )}
                        </div>
                        {event.reason && (
                          <div className="text-xs text-muted-foreground italic mt-1">
                            {event.reason}
                          </div>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground text-right">
                        <div>{event.adminEmail}</div>
                        <div>{event.timestamp ? format(new Date(event.timestamp.seconds * 1000), 'dd MMM yyyy', { locale: it }) : ''}</div>
                        <div>{event.timestamp ? format(new Date(event.timestamp.seconds * 1000), 'HH:mm', { locale: it }) : ''}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog Conferma Cambio Stato */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Conferma Modifica Stato
            </DialogTitle>
            <DialogDescription>
              Stai cambiando lo stato da <strong>"{statusLabels[quote.status]}"</strong> a <strong>"{statusLabels[selectedStatus]}"</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {warnings.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <ul className="list-disc list-inside space-y-1">
                    {warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="confirm-reason">Motivazione (opzionale)</Label>
              <Textarea
                id="confirm-reason"
                placeholder="Motivo del cambio stato..."
                value={confirmReason}
                onChange={(e) => setConfirmReason(e.target.value)}
                rows={3}
              />
            </div>

            <Alert>
              <Clock className="h-4 w-4" />
              <AlertDescription className="text-sm">
                Questa modifica sarà registrata nell'audit log
              </AlertDescription>
            </Alert>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowConfirmDialog(false);
                setSelectedStatus(quote.status);
                setConfirmReason('');
              }}
            >
              Annulla
            </Button>
            <Button
              onClick={handleConfirmStatusChange}
              disabled={changeStatusMutation.isPending}
            >
              {changeStatusMutation.isPending ? 'Aggiornamento...' : 'Conferma Modifica'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Firma Manuale */}
      <Dialog open={showSignatureDialog} onOpenChange={setShowSignatureDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PenTool className="h-5 w-5" />
              Inserimento Firma Manuale
            </DialogTitle>
            <DialogDescription>
              Inserisci una firma retroattiva per il preventivo
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="sig-clientName">Nome Firmante *</Label>
              <Input
                id="sig-clientName"
                placeholder="Nome e Cognome"
                value={signatureData.clientName}
                onChange={(e) => setSignatureData({ ...signatureData, clientName: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sig-signedAt">Data Firma *</Label>
              <Input
                id="sig-signedAt"
                type="date"
                value={signatureData.signedAt}
                onChange={(e) => setSignatureData({ ...signatureData, signedAt: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sig-reason">Motivo (opzionale)</Label>
              <Textarea
                id="sig-reason"
                placeholder="Es: Importazione contratto pregresso, firma cartacea..."
                value={signatureData.reason}
                onChange={(e) => setSignatureData({ ...signatureData, reason: e.target.value })}
                rows={2}
              />
            </div>

            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-sm">
                Questa firma sarà tracciata come "inserimento manuale admin" nell'audit log
              </AlertDescription>
            </Alert>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowSignatureDialog(false)}
            >
              Annulla
            </Button>
            <Button
              onClick={handleSubmitManualSignature}
              disabled={signatureManualMutation.isPending}
            >
              {signatureManualMutation.isPending ? 'Inserimento...' : 'Inserisci Firma'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
