import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { getQuotesForJob, deleteQuote, resetQuoteSignature, calculateQuoteTotalForPayments } from '@/lib/quotes';
import { Quote, QuoteStatus } from '@shared/quotes-types';
import { getJob } from '@/lib/jobs';
import { getClienteById } from '@/lib/clienti';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Loader2, FileText, Plus, ExternalLink, CheckCircle2, XCircle, CreditCard, Copy, Check, MoreVertical, Trash2, AlertTriangle, Phone, Download } from 'lucide-react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';
import { convertFirestoreTimestamp } from '@/lib/firebase';
import { queryClient } from '@/lib/queryClient';
import GeneraPagamentiModal from './GeneraPagamentiModal';

interface ModuliJobSectionProps {
  jobId: string;
  onCreateModulo?: () => void;
  onEditQuote?: (quoteId: string) => void;
  clienteId?: string;
  isAdmin?: boolean;
}

const STATUS_LABELS: Record<QuoteStatus, string> = {
  bozza: 'Bozza',
  inviato: 'Inviato',
  visionato: 'Visionato',
  firmato: 'Firmato',
  rifiutato: 'Rifiutato',
  annullato: 'Annullato',
  scaduto: 'Scaduto'
};

const STATUS_COLORS: Record<QuoteStatus, string> = {
  bozza: 'bg-gray-100 text-gray-700',
  inviato: 'bg-blue-100 text-blue-700',
  visionato: 'bg-yellow-100 text-yellow-700',
  firmato: 'bg-green-100 text-green-700',
  rifiutato: 'bg-red-100 text-red-700',
  annullato: 'bg-gray-200 text-gray-800',
  scaduto: 'bg-orange-100 text-orange-700'
};

const TYPE_LABELS = {
  fisso: 'Modulo Fisso',
  variabile: 'Modulo Variabile'
};

// Utility: genera URL unificato portale preventivo (auto-adatta rendering a status)
const getQuoteUrl = (quote: Quote) => {
  const baseUrl = window.location.origin;
  return `${baseUrl}/quote/${quote.publicToken}`;
};

export default function ModuliJobSection({ jobId, onCreateModulo, onEditQuote, clienteId, isAdmin = false }: ModuliJobSectionProps) {
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [generaPagamentiQuoteId, setGeneraPagamentiQuoteId] = useState<string | null>(null);
  const [deleteQuoteId, setDeleteQuoteId] = useState<string | null>(null);
  const [resetQuoteId, setResetQuoteId] = useState<string | null>(null);
  const [forceDeleteMode, setForceDeleteMode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const { toast } = useToast();
  const { user } = useFirebaseAuth();
  const [, navigate] = useLocation();

  const { data: quotes = [], isLoading } = useQuery<Quote[]>({
    queryKey: ['quotes', 'job', jobId],
    queryFn: () => getQuotesForJob(jobId),
    enabled: !!jobId
  });

  // Fetch job data for nome evento and clienti
  const { data: job } = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => getJob(jobId),
    enabled: !!jobId
  });

  // Fetch all clienti for the job
  const { data: clienti = [] } = useQuery({
    queryKey: ['clienti', 'job', job?.clientiIds],
    queryFn: async () => {
      if (!job?.clientiIds || job.clientiIds.length === 0) return [];
      const clientiPromises = job.clientiIds.map(id => getClienteById(id));
      const results = await Promise.all(clientiPromises);
      return results.filter(c => c !== null);
    },
    enabled: !!job?.clientiIds && job.clientiIds.length > 0
  });

  // Get quote being deleted for status check
  const quoteToDelete = quotes.find(q => q.id === deleteQuoteId);
  const isSigned = quoteToDelete?.status === 'firmato';

  // Delete quote mutation
  const deleteMutation = useMutation({
    mutationFn: async ({ quoteId, forceDelete }: { quoteId: string; forceDelete: boolean }) => {
      if (!user?.email) throw new Error('Utente non autenticato');
      await deleteQuote(quoteId, user.email, forceDelete);
    },
    onSuccess: (_, variables) => {
      // Optimistic update: remove quote from cache immediately
      queryClient.setQueryData(['quotes', 'job', jobId], (oldQuotes: Quote[] | undefined) => {
        if (!oldQuotes) return [];
        return oldQuotes.filter(q => q.id !== variables.quoteId);
      });

      // Invalidate queries for background refetch
      queryClient.invalidateQueries({ queryKey: ['quotes', 'job', jobId] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });

      // Close dialogs and reset state
      setSelectedQuoteId(null);
      setDeleteQuoteId(null);
      setForceDeleteMode(false);

      // Navigate to jobs list in admin dashboard
      navigate('/admin/dashboard');

      toast({
        title: 'Preventivo eliminato',
        description: 'Il preventivo e i dati correlati sono stati eliminati con successo'
      });
    },
    onError: (error: Error) => {
      // Check if it's a signed quote protection error
      if (error.message.includes('SIGNED_QUOTE_PROTECTION') || error.message.includes('SIGNED_QUOTE_WITH_PAYMENTS')) {
        // Activate force delete mode for 2-step confirm
        setForceDeleteMode(true);
      } else {
        // Other errors: show toast and close
        toast({
          title: 'Errore eliminazione',
          description: error.message || 'Impossibile eliminare il preventivo',
          variant: 'destructive'
        });
        setDeleteQuoteId(null);
        setForceDeleteMode(false);
      }
    }
  });

  // Reset signature mutation
  const resetMutation = useMutation({
    mutationFn: async (quoteId: string) => {
      if (!user?.email) throw new Error('Utente non autenticato');
      await resetQuoteSignature(quoteId, user.email);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes', 'job', jobId] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      setSelectedQuoteId(null);
      setResetQuoteId(null);
      toast({
        title: 'Firma reimpostata',
        description: 'Il preventivo è tornato in stato "Bozza"'
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Errore reimpostazione',
        description: error.message || 'Impossibile reimpostare la firma',
        variant: 'destructive'
      });
      setResetQuoteId(null);
    }
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (quotes.length === 0) {
    return (
      <div className="text-center py-8">
        <FileText className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
        <p className="text-muted-foreground mb-4">Nessun modulo di prenotazione creato</p>
        {isAdmin && onCreateModulo && (
          <Button onClick={onCreateModulo} data-testid="button-create-modulo">
            <Plus className="h-4 w-4 mr-2" />
            Crea Modulo
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <p className="text-sm text-muted-foreground">
            {quotes.length} {quotes.length === 1 ? 'modulo' : 'moduli'}
          </p>
          {quotes.filter(q => q.status === 'firmato').length > 0 && (
            <Badge variant="default" className="bg-green-600">
              {quotes.filter(q => q.status === 'firmato').length} firmati
            </Badge>
          )}
        </div>
        {isAdmin && onCreateModulo && (
          <Button onClick={onCreateModulo} size="sm" data-testid="button-create-modulo">
            <Plus className="h-4 w-4 mr-2" />
            Nuovo Modulo
          </Button>
        )}
      </div>

      {/* Quotes List - Collapsible Inline */}
      <div className="space-y-3">
        {quotes.map(quote => (
          <Collapsible
            key={quote.id}
            open={selectedQuoteId === quote.id}
            onOpenChange={(open) => setSelectedQuoteId(open ? quote.id : null)}
          >
            <Card data-testid={`card-quote-${quote.id}`}>
              <CollapsibleTrigger asChild>
                <CardContent className="p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      {/* Header */}
                      <div className="flex items-center gap-2 mb-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">
                          {quote.templateName || 'Modulo Preventivo'}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {TYPE_LABELS[quote.type]}
                        </Badge>
                        <Badge className={STATUS_COLORS[quote.status]}>
                          {STATUS_LABELS[quote.status]}
                        </Badge>
                      </div>

                      {/* Info */}
                      <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                        <div>
                          <span className="font-medium">Prodotti:</span> {quote.products.length}
                        </div>
                        <div>
                          <span className="font-medium">Totale:</span>{' '}
                          €{quote.type === 'fisso'
                            ? (quote.totaleBase ?? quote.totalAfterDiscount ?? 0).toFixed(2)
                            : (quote.totaleSelezionato ?? quote.totaleBase ?? quote.totalAfterDiscount ?? 0).toFixed(2)}
                        </div>
                        {quote.createdAt && convertFirestoreTimestamp(quote.createdAt) && (
                          <div>
                            <span className="font-medium">Creato:</span>{' '}
                            {format(convertFirestoreTimestamp(quote.createdAt)!, 'dd/MM/yyyy', { locale: it })}
                          </div>
                        )}
                        {quote.signature?.signedAt && convertFirestoreTimestamp(quote.signature.signedAt) && (
                          <div className="text-green-600 font-medium">
                            ✓ Firmato: {format(convertFirestoreTimestamp(quote.signature.signedAt)!, 'dd/MM/yyyy HH:mm', { locale: it })}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(getQuoteUrl(quote), '_blank');
                        }}
                        data-testid={`button-view-${quote.id}`}
                        title="Apri preventivo"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>

                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteQuoteId(quote.id);
                          }}
                          data-testid={`button-delete-${quote.id}`}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          title="Elimina preventivo"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </CollapsibleTrigger>

              {/* Collapsible Content */}
              <CollapsibleContent>
                <div className="border-t bg-muted/30 p-6">
                  {/* Admin Actions Menu - Top Right */}
                  {isAdmin && (
                    <div className="flex justify-end mb-4">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" data-testid="button-quote-actions">
                            <MoreVertical className="h-4 w-4 mr-2" />
                            Azioni
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {/* Edit quote (only for non-signed quotes) */}
                          {quote.status !== 'firmato' && onCreateModulo && (
                            <>
                              <DropdownMenuItem
                                onClick={() => {
                                  // Call parent callback to open QuoteBuilder in edit mode
                                  onEditQuote?.(quote.id);
                                }}
                                data-testid="menu-edit-quote"
                              >
                                <FileText className="h-4 w-4 mr-2" />
                                Modifica Preventivo
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                            </>
                          )}

                          {/* Reset signature (only for signed quotes) */}
                          {quote.status === 'firmato' && (
                            <>
                              <DropdownMenuItem
                                onClick={() => setResetQuoteId(quote.id)}
                                data-testid="menu-reset-signature"
                              >
                                <AlertTriangle className="h-4 w-4 mr-2" />
                                Reimposta Firma
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                            </>
                          )}

                          {/* Delete quote */}
                          <DropdownMenuItem
                            onClick={() => setDeleteQuoteId(quote.id)}
                            className="text-destructive"
                            data-testid="menu-delete-quote"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Elimina Preventivo
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}

                  {/* Single Column Layout: Signature, Actions, Links */}
                  <div className="max-w-2xl mx-auto space-y-4">
                      {/* Signature */}
                      {quote.signature && (
                        <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
                          <h3 className="font-semibold mb-3 flex items-center gap-2 text-green-700 dark:text-green-400">
                            <CheckCircle2 className="h-5 w-5" />
                            Firmato Digitalmente
                          </h3>
                          <div className="space-y-2 text-sm">
                            <p>
                              <span className="font-medium">Firmato da:</span> {quote.signature.clientName}
                            </p>
                            {quote.signature.signedAt && convertFirestoreTimestamp(quote.signature.signedAt) && (
                              <p>
                                <span className="font-medium">Data:</span>{' '}
                                {format(convertFirestoreTimestamp(quote.signature.signedAt)!, 'dd/MM/yyyy HH:mm', { locale: it })}
                              </p>
                            )}
                            <p>
                              <span className="font-medium">IP:</span> {quote.signature.ipAddress}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Azioni Documento / Condivisione Preventivo */}
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Azioni Documento</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {/* Portale Cliente */}
                          <div>
                            <h3 className="font-semibold mb-2 text-sm">
                              {quote.status === 'firmato' ? 'Portale Cliente Firmato' : 'Link Firma Preventivo'}
                            </h3>
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                readOnly
                                value={getQuoteUrl(quote)}
                                className="flex-1 px-3 py-2 bg-muted rounded text-sm border"
                                onClick={(e) => e.currentTarget.select()}
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={async () => {
                                  const url = getQuoteUrl(quote);
                                  try {
                                    await navigator.clipboard.writeText(url);
                                    setCopiedLink(true);
                                    toast({
                                      title: "Link copiato!",
                                      description: "Il link del portale è stato copiato negli appunti"
                                    });
                                    setTimeout(() => setCopiedLink(false), 2000);
                                  } catch (error) {
                                    toast({
                                      title: "Errore",
                                      description: "Impossibile copiare il link",
                                      variant: "destructive"
                                    });
                                  }
                                }}
                                data-testid="button-copy-link"
                              >
                                {copiedLink ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => window.open(getQuoteUrl(quote), '_blank')}
                                data-testid="button-open-portal"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>

                          {/* Export PDF - solo preventivi firmati */}
                          {quote.status === 'firmato' && (
                            <div>
                              <Button
                                onClick={() => window.open(getQuoteUrl(quote), '_blank')}
                                className="w-full"
                                variant="secondary"
                                data-testid="button-export-pdf"
                              >
                                <Download className="h-4 w-4 mr-2" />
                                Esporta PDF
                              </Button>
                            </div>
                          )}

                          {/* WhatsApp Buttons */}
                          {(() => {
                            const clientiConWhatsApp = clienti.filter(c => {
                              const phoneNumber = c.whatsapp || c.cellulare1;
                              return phoneNumber && phoneNumber.trim() !== '';
                            });

                            if (clientiConWhatsApp.length === 0) return null;

                            return (
                              <div>
                                <p className="text-xs text-muted-foreground mb-2">
                                  {quote.status === 'firmato'
                                    ? 'Invia preventivo firmato su WhatsApp:'
                                    : 'Invia preventivo su WhatsApp:'}
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  {clientiConWhatsApp.map((cliente, index) => {
                                    const nomeEvento = job?.nomeEvento || 'il tuo evento';
                                    const message = quote.status === 'firmato'
                                      ? `Ecco il preventivo firmato per *${nomeEvento}* by Image Studio. Aprilo per vedere i dettagli del contratto e i pagamenti\n\n${getQuoteUrl(quote)}`
                                      : `Ecco il preventivo per *${nomeEvento}* by Image Studio. Aprilo per vedere i dettagli e firmare se sei d'accordo\n\n${getQuoteUrl(quote)}`;
                                    const phoneNumber = (cliente.whatsapp || cliente.cellulare1 || '').replace(/\s+/g, '').replace(/^\+/, '');
                                    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;

                                    return (
                                      <Button
                                        key={cliente.id}
                                        size="sm"
                                        variant="outline"
                                        onClick={() => window.open(whatsappUrl, '_blank')}
                                        className="bg-[#25D366] hover:bg-[#20BD5A] text-white border-[#25D366] hover:border-[#20BD5A]"
                                        data-testid={`button-whatsapp-${index}`}
                                      >
                                        <Phone className="h-4 w-4 mr-2" />
                                        {cliente.nome || `Cliente ${index + 1}`}
                                      </Button>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })()}
                        </CardContent>
                      </Card>

                      {/* Notes */}
                      {quote.noteInterne && (
                        <div className="bg-muted/50 p-4 rounded-lg border">
                          <h3 className="font-semibold mb-2 text-sm">Note Interne</h3>
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                            {quote.noteInterne}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        ))}
      </div>

      {/* Genera Pagamenti Modal */}
      {generaPagamentiQuoteId && (() => {
        const targetQuote = quotes.find(q => q.id === generaPagamentiQuoteId);
        if (!targetQuote || !clienteId) return null;

        // ✅ FIX: Calcola totale corretto per piano pagamenti
        // - Fisso: usa totalAfterDiscount
        // - Variabile non firmato: solo prodotti fissi (€600)
        // - Variabile firmato: totaleSelezionato (con scelte cliente)
        const totale = calculateQuoteTotalForPayments(targetQuote);

        return (
          <GeneraPagamentiModal
            open={true}
            onClose={() => setGeneraPagamentiQuoteId(null)}
            quoteId={targetQuote.id}
            quoteTotale={totale}
            jobId={jobId}
            clienteId={clienteId}
            eventDate={job?.eventDate ? convertFirestoreTimestamp(job.eventDate) : null}
          />
        );
      })()}

      {/* Delete Confirmation Dialog - 2-Step per Signed Quotes */}
      <AlertDialog open={!!deleteQuoteId} onOpenChange={(open) => {
        if (!open) {
          setDeleteQuoteId(null);
          setForceDeleteMode(false);
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {forceDeleteMode ? 'Attenzione: Preventivo Firmato' : 'Conferma Eliminazione'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {forceDeleteMode
                ? 'Stai per eliminare un preventivo già firmato dal cliente. Questa è un\'operazione critica.'
                : 'Sei sicuro di voler eliminare questo preventivo?'
              }
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4 py-4">
            {forceDeleteMode ? (
              <>
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                    <div className="space-y-2">
                      <p className="font-semibold text-destructive text-sm">
                        Preventivo Firmato Protetto
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Questo preventivo è stato firmato dal cliente. Eliminarlo potrebbe:
                      </p>
                      <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground pl-2">
                        <li>Invalidare il contratto firmato</li>
                        <li>Eliminare lo scadenzario pagamenti attivo</li>
                        <li>Perdere la firma digitale e i dati correlati</li>
                        <li>Rimuovere i riferimenti dal lavoro</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-sm font-medium text-amber-900">
                    Sei assolutamente sicuro di voler procedere?
                  </p>
                </div>
              </>
            ) : (
              <>
                <div>
                  <p className="font-medium mb-2">Questa azione eliminerà anche:</p>
                  <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                    <li>Il preventivo e tutti i suoi dati</li>
                    <li>Eventuali scadenzari pagamenti collegati</li>
                    <li>Il riferimento al preventivo nel lavoro</li>
                    {isSigned && <li className="text-destructive font-medium">La firma digitale del cliente</li>}
                  </ul>
                </div>
                {isSigned && (
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                    <p className="text-sm font-medium text-orange-900">
                      Nota: Questo preventivo è già stato firmato dal cliente
                    </p>
                  </div>
                )}
                <p className="text-destructive font-medium text-sm">
                  Questa operazione non può essere annullata.
                </p>
              </>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel
              data-testid="button-cancel-delete"
              onClick={() => setForceDeleteMode(false)}
            >
              Annulla
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteQuoteId) {
                  deleteMutation.mutate({
                    quoteId: deleteQuoteId,
                    forceDelete: forceDeleteMode
                  });
                }
              }}
              disabled={deleteMutation.isPending}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Eliminazione...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  {forceDeleteMode ? 'Elimina Comunque' : 'Elimina Definitivamente'}
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Signature Confirmation Dialog */}
      <AlertDialog open={!!resetQuoteId} onOpenChange={(open) => !open && setResetQuoteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Reimposta Firma Preventivo
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-2">
                <p>
                  Stai per reimpostare la firma del preventivo. Questa azione:
                </p>
                <ul className="list-disc list-inside space-y-1 text-sm pl-2">
                  <li>Cambierà lo status da <strong>Firmato</strong> a <strong>Bozza</strong></li>
                  <li>Rimuoverà la firma digitale del cliente</li>
                  <li>Cancellerà la data di firma</li>
                  <li>Manterrà tutti gli altri dati del preventivo (prodotti, prezzi, clienti)</li>
                </ul>
                <p className="text-amber-700 bg-amber-50 dark:bg-amber-950/20 p-3 rounded-md border border-amber-200 dark:border-amber-800">
                  ⚠️ Il cliente dovrà firmare nuovamente il preventivo se necessario.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setResetQuoteId(null)}
              data-testid="button-cancel-reset"
            >
              Annulla
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (resetQuoteId) {
                  resetMutation.mutate(resetQuoteId);
                }
              }}
              disabled={resetMutation.isPending}
              className="bg-amber-600 hover:bg-amber-700"
              data-testid="button-confirm-reset"
            >
              {resetMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Reimpostazione...
                </>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  Reimposta Firma
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}