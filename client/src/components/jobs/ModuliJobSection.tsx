import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { getQuotesForJob, deleteQuote, resetQuoteSignature } from '@/lib/quotes';
import { Quote, QuoteStatus } from '@shared/quotes-types';
import { getJob } from '@/lib/jobs';
import { getClienteById } from '@/lib/clienti';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Loader2, FileText, Plus, ExternalLink, CheckCircle2, XCircle, CreditCard, Copy, Check, MoreVertical, Trash2, AlertTriangle, Phone, Download, Calendar as CalendarIcon, Edit } from 'lucide-react';
import { format as formatDate } from 'date-fns';
import { it } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';
import { queryClient } from '@/lib/queryClient';
import GeneraPagamentiModal from './GeneraPagamentiModal';
import { cn } from '@/lib/utils';

const manualSignatureSchema = z.object({
  signedAt: z.date({ required_error: 'La data di firma è obbligatoria' }),
  signerName: z.string().min(2, 'Il nome del firmatario deve contenere almeno 2 caratteri')
});

interface ModuliJobSectionProps {
  jobId: string;
  onCreateModulo?: () => void;
  clienteId?: string;
  isAdmin?: boolean;
}

const STATUS_LABELS: Record<QuoteStatus, string> = {
  bozza: 'Bozza',
  inviato: 'Inviato',
  visionato: 'Visionato',
  firmato: 'Firmato',
  rifiutato: 'Rifiutato',
  scaduto: 'Scaduto'
};

const STATUS_COLORS: Record<QuoteStatus, string> = {
  bozza: 'bg-gray-100 text-gray-700',
  inviato: 'bg-blue-100 text-blue-700',
  visionato: 'bg-yellow-100 text-yellow-700',
  firmato: 'bg-green-100 text-green-700',
  rifiutato: 'bg-red-100 text-red-700',
  scaduto: 'bg-orange-100 text-orange-700'
};

const TYPE_LABELS = {
  fisso: 'Modulo Fisso',
  variabile: 'Modulo Variabile'
};

// Utility: genera URL intelligente basato su status
const getQuoteUrl = (quote: Quote) => {
  const baseUrl = window.location.origin;
  const path = quote.status === 'firmato' ? '/quote/signed' : '/quote/view';
  return `${baseUrl}${path}/${quote.publicToken}`;
};

export default function ModuliJobSection({ jobId, onCreateModulo, clienteId, isAdmin = false }: ModuliJobSectionProps) {
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [generaPagamentiQuoteId, setGeneraPagamentiQuoteId] = useState<string | null>(null);
  const [deleteQuoteId, setDeleteQuoteId] = useState<string | null>(null);
  const [resetQuoteId, setResetQuoteId] = useState<string | null>(null);
  const [signatureMode, setSignatureMode] = useState<'none' | 'reset' | 'manual'>('none');
  const [forceDeleteMode, setForceDeleteMode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const { toast } = useToast();
  const { user } = useFirebaseAuth();
  const [, navigate] = useLocation();

  // Form per firma manuale
  const manualSignatureForm = useForm<z.infer<typeof manualSignatureSchema>>({
    resolver: zodResolver(manualSignatureSchema),
    defaultValues: {
      signedAt: new Date(),
      signerName: ''
    }
  });

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

  // Signature management mutation (reset o manual)
  const signatureMutation = useMutation({
    mutationFn: async (params: { 
      quoteId: string; 
      action: 'reset' | 'manual';
      signatureData?: { signedAt: string; signerName: string };
    }) => {
      if (!user?.email) throw new Error('Utente non autenticato');
      await resetQuoteSignature(params.quoteId, user.email, {
        action: params.action,
        signatureData: params.signatureData
      });
      return params.action;
    },
    onSuccess: (action) => {
      queryClient.invalidateQueries({ queryKey: ['quotes', 'job', jobId] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      setSelectedQuoteId(null);
      setResetQuoteId(null);
      setSignatureMode('none');
      manualSignatureForm.reset();
      
      const messages = {
        reset: {
          title: 'Firma reimpostata',
          description: 'Il preventivo è tornato in stato "Bozza"'
        },
        manual: {
          title: 'Firma impostata',
          description: 'La firma è stata registrata con successo'
        }
      };
      
      toast(messages[action]);
    },
    onError: (error: Error) => {
      toast({
        title: 'Errore gestione firma',
        description: error.message || 'Impossibile completare l\'operazione',
        variant: 'destructive'
      });
      setResetQuoteId(null);
      setSignatureMode('none');
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
          <Button 
            onClick={() => {
              if (!jobId) {
                toast({
                  title: 'Salva il lavoro prima',
                  description: 'Devi salvare il lavoro prima di creare un preventivo',
                  variant: 'destructive'
                });
                return;
              }
              onCreateModulo();
            }} 
            disabled={!jobId}
            data-testid="button-create-modulo"
          >
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
          <Button 
            onClick={() => {
              if (!jobId) {
                toast({
                  title: 'Salva il lavoro prima',
                  description: 'Devi salvare il lavoro prima di creare un preventivo',
                  variant: 'destructive'
                });
                return;
              }
              onCreateModulo();
            }}
            disabled={!jobId}
            size="sm" 
            data-testid="button-create-modulo"
          >
            <Plus className="h-4 w-4 mr-2" />
            Nuovo Modulo
          </Button>
        )}
      </div>

      {/* Quotes List */}
      <div className="space-y-3">
        {quotes.map(quote => (
          <Card
            key={quote.id}
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => setSelectedQuoteId(quote.id)}
            data-testid={`card-quote-${quote.id}`}
          >
            <CardContent className="p-4">
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
                    {quote.createdAt && (
                      <div>
                        <span className="font-medium">Creato:</span>{' '}
                        {format(quote.createdAt.toDate(), 'dd/MM/yyyy', { locale: it })}
                      </div>
                    )}
                    {quote.signature && (
                      <div className="text-green-600 font-medium">
                        ✓ Firmato: {format(quote.signature.signedAt.toDate(), 'dd/MM/yyyy HH:mm', { locale: it })}
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
          </Card>
        ))}
      </div>

      {/* Quote Detail Sheet */}
      {selectedQuoteId && (() => {
        const selectedQuote = quotes.find(q => q.id === selectedQuoteId);
        if (!selectedQuote) return null;
        
        return (
          <Sheet open={!!selectedQuoteId} onOpenChange={(open) => !open && setSelectedQuoteId(null)}>
            <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
              <SheetHeader>
                <div className="flex items-center justify-between">
                  <SheetTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    {selectedQuote.templateName || 'Modulo Preventivo'}
                  </SheetTitle>
                  
                  {/* Actions Dropdown */}
                  {isAdmin && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" data-testid="button-quote-actions">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {/* Gestione Firma */}
                        {selectedQuote.status === 'firmato' ? (
                          <>
                            <DropdownMenuItem
                              onClick={() => {
                                setResetQuoteId(selectedQuote.id);
                                setSignatureMode('reset');
                              }}
                              data-testid="menu-reset-signature"
                            >
                              <AlertTriangle className="h-4 w-4 mr-2" />
                              Reimposta Firma
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                          </>
                        ) : (
                          <>
                            <DropdownMenuItem
                              onClick={() => {
                                setResetQuoteId(selectedQuote.id);
                                setSignatureMode('manual');
                                // Pre-fill con nome cliente se disponibile
                                if (selectedQuote.clientiInfo && selectedQuote.clientiInfo.length > 0) {
                                  const firstClient = selectedQuote.clientiInfo[0];
                                  manualSignatureForm.setValue('signerName', `${firstClient.nome} ${firstClient.cognome}`);
                                }
                              }}
                              data-testid="menu-set-manual-signature"
                            >
                              <Edit className="h-4 w-4 mr-2" />
                              Imposta come Firmato
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                          </>
                        )}
                        
                        {/* Delete quote */}
                        <DropdownMenuItem
                          onClick={() => setDeleteQuoteId(selectedQuote.id)}
                          className="text-destructive"
                          data-testid="menu-delete-quote"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Elimina Preventivo
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </SheetHeader>

              <div className="space-y-6 mt-6">
                {/* Status & Type */}
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{TYPE_LABELS[selectedQuote.type]}</Badge>
                  <Badge className={STATUS_COLORS[selectedQuote.status]}>
                    {STATUS_LABELS[selectedQuote.status]}
                  </Badge>
                </div>

                {/* Products */}
                <div>
                  <h3 className="font-semibold mb-3">Prodotti</h3>
                  <div className="space-y-2">
                    {selectedQuote.products.map((product, idx) => (
                      <div key={idx} className="flex items-start justify-between p-3 bg-muted rounded-lg">
                        <div className="flex-1">
                          <p className="font-medium">{product.nome}</p>
                          {product.descrizione && (
                            <p className="text-sm text-muted-foreground mt-1">{product.descrizione}</p>
                          )}
                          {product.numeroFoto && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {product.numeroFoto} foto
                            </p>
                          )}
                        </div>
                        <div className="text-right ml-4">
                          <p className="font-semibold">€{product.prezzo.toFixed(2)}</p>
                          {selectedQuote.type === 'variabile' && (
                            <div className="flex items-center gap-1 mt-1">
                              {product.selected ? (
                                <CheckCircle2 className="h-4 w-4 text-green-600" />
                              ) : (
                                <XCircle className="h-4 w-4 text-muted-foreground" />
                              )}
                              <span className="text-xs text-muted-foreground">
                                {product.selected ? 'Selezionato' : 'Non selezionato'}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 pt-4 border-t flex justify-between items-center">
                    <span className="font-semibold text-lg">Totale</span>
                    <span className="font-bold text-2xl">
                      €{selectedQuote.type === 'fisso' 
                        ? (selectedQuote.totaleBase ?? selectedQuote.totalAfterDiscount ?? 0).toFixed(2) 
                        : (selectedQuote.totaleSelezionato ?? selectedQuote.totaleBase ?? selectedQuote.totalAfterDiscount ?? 0).toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Signature */}
                {selectedQuote.signature && (
                  <div className="border-t pt-4">
                    <h3 className="font-semibold mb-3 flex items-center gap-2 text-green-600">
                      <CheckCircle2 className="h-5 w-5" />
                      Firmato Digitalmente
                    </h3>
                    <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg space-y-2">
                      <p className="text-sm">
                        <span className="font-medium">Firmato da:</span> {selectedQuote.signature.clientName}
                      </p>
                      <p className="text-sm">
                        <span className="font-medium">Data:</span>{' '}
                        {format(selectedQuote.signature.signedAt.toDate(), 'dd/MM/yyyy HH:mm', { locale: it })}
                      </p>
                      <p className="text-sm">
                        <span className="font-medium">IP:</span> {selectedQuote.signature.ipAddress}
                      </p>
                    </div>
                  </div>
                )}

                {/* Genera Pagamenti (only for signed quotes) */}
                {selectedQuote.status === 'firmato' && isAdmin && (
                  <div className="border-t pt-4">
                    <Button
                      onClick={() => setGeneraPagamentiQuoteId(selectedQuote.id)}
                      className="w-full"
                      size="lg"
                      data-testid="button-genera-pagamenti"
                    >
                      <CreditCard className="h-5 w-5 mr-2" />
                      Genera Piano Pagamenti
                    </Button>
                    <p className="text-xs text-muted-foreground mt-2 text-center">
                      Crea uno scadenzario pagamenti basato sul totale preventivato
                    </p>
                  </div>
                )}

                {/* Public Link */}
                <div className="border-t pt-4">
                  <h3 className="font-semibold mb-3">
                    {selectedQuote.status === 'firmato' ? 'Portale Cliente Firmato' : 'Link Firma Preventivo'}
                  </h3>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={getQuoteUrl(selectedQuote)}
                      className="flex-1 px-3 py-2 bg-muted rounded text-sm"
                      onClick={(e) => e.currentTarget.select()}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        const url = getQuoteUrl(selectedQuote);
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
                      onClick={() => window.open(getQuoteUrl(selectedQuote), '_blank')}
                      data-testid="button-open-portal"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Export PDF Button - only for signed quotes */}
                  {selectedQuote.status === 'firmato' && (
                    <div className="mt-3">
                      <Button
                        onClick={() => window.open(getQuoteUrl(selectedQuote), '_blank')}
                        className="w-full bg-blue-gray hover:bg-blue-gray/90 text-white"
                        size="lg"
                        data-testid="button-export-pdf"
                      >
                        <Download className="h-5 w-5 mr-2" />
                        Esporta PDF
                      </Button>
                      <p className="text-xs text-muted-foreground mt-2 text-center">
                        Apri il portale firmato per scaricare il PDF del preventivo
                      </p>
                    </div>
                  )}

                  {/* WhatsApp Button - only for signed quotes with clients that have phone */}
                  {(() => {
                    if (selectedQuote.status !== 'firmato') return null;
                    
                    // Use whatsapp field if available, otherwise use cellulare1
                    const clientiConWhatsApp = clienti.filter(c => {
                      const phoneNumber = c.whatsapp || c.cellulare1;
                      return phoneNumber && phoneNumber.trim() !== '';
                    });
                    
                    if (clientiConWhatsApp.length === 0) return null;
                    
                    return (
                      <div className="mt-3">
                        <p className="text-xs text-muted-foreground mb-2">Invia preventivo su WhatsApp:</p>
                        <div className="flex flex-wrap gap-2">
                          {clientiConWhatsApp.map((cliente, index) => {
                            const nomeEvento = job?.nomeEvento || 'il tuo evento';
                            const message = `Ecco il preventivo per *${nomeEvento}* by Image Studio. Aprilo per poter vedere i dettagli e eventualmente confermare la prenotazione\n\n${getQuoteUrl(selectedQuote)}`;
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
                </div>

                {/* Notes */}
                {selectedQuote.noteInterne && (
                  <div className="border-t pt-4">
                    <h3 className="font-semibold mb-2">Note Interne</h3>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {selectedQuote.noteInterne}
                    </p>
                  </div>
                )}
              </div>
            </SheetContent>
          </Sheet>
        );
      })()}

      {/* Genera Pagamenti Modal */}
      {generaPagamentiQuoteId && (() => {
        const targetQuote = quotes.find(q => q.id === generaPagamentiQuoteId);
        if (!targetQuote || !clienteId) return null;

        const totale = targetQuote.type === 'fisso'
          ? (targetQuote.totaleBase ?? targetQuote.totalAfterDiscount ?? 0)
          : (targetQuote.totaleSelezionato ?? targetQuote.totaleBase ?? targetQuote.totalAfterDiscount ?? 0);

        return (
          <GeneraPagamentiModal
            open={true}
            onClose={() => setGeneraPagamentiQuoteId(null)}
            quoteId={targetQuote.id}
            quoteTotale={totale}
            jobId={jobId}
            clienteId={clienteId}
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

      {/* Signature Management Dialog (Reset or Manual) */}
      <Dialog open={!!resetQuoteId && signatureMode !== 'none'} onOpenChange={(open) => {
        if (!open) {
          setResetQuoteId(null);
          setSignatureMode('none');
          manualSignatureForm.reset();
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {signatureMode === 'reset' ? (
                <>
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  Reimposta Firma Preventivo
                </>
              ) : (
                <>
                  <Edit className="h-5 w-5 text-green-600" />
                  Imposta Firma Manualmente
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {signatureMode === 'reset' 
                ? 'Rimuovi la firma del preventivo e riportalo in stato "Bozza"'
                : 'Registra manualmente una firma per questo preventivo (utile per import da vecchio database)'
              }
            </DialogDescription>
          </DialogHeader>

          {/* RESET MODE: Conferma reimpostazione */}
          {signatureMode === 'reset' && (
            <div className="space-y-4">
              <div className="space-y-3 pt-2">
                <p className="text-sm text-muted-foreground">
                  Questa azione:
                </p>
                <ul className="list-disc list-inside space-y-1 text-sm pl-2 text-muted-foreground">
                  <li>Cambierà lo status da <strong>Firmato</strong> a <strong>Bozza</strong></li>
                  <li>Rimuoverà la firma digitale del cliente</li>
                  <li>Cancellerà la data di firma</li>
                  <li>Manterrà tutti gli altri dati del preventivo</li>
                </ul>
                <div className="text-amber-700 bg-amber-50 dark:bg-amber-950/20 p-3 rounded-md border border-amber-200 dark:border-amber-800 text-sm">
                  ⚠️ Il cliente dovrà firmare nuovamente il preventivo se necessario.
                </div>
              </div>
              
              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setResetQuoteId(null);
                    setSignatureMode('none');
                  }}
                  data-testid="button-cancel-reset"
                >
                  Annulla
                </Button>
                <Button
                  onClick={() => {
                    if (resetQuoteId) {
                      signatureMutation.mutate({
                        quoteId: resetQuoteId,
                        action: 'reset'
                      });
                    }
                  }}
                  disabled={signatureMutation.isPending}
                  className="bg-amber-600 hover:bg-amber-700"
                  data-testid="button-confirm-reset"
                >
                  {signatureMutation.isPending ? (
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
                </Button>
              </DialogFooter>
            </div>
          )}

          {/* MANUAL MODE: Form inserimento dati firma */}
          {signatureMode === 'manual' && (
            <form onSubmit={manualSignatureForm.handleSubmit((data) => {
              if (resetQuoteId) {
                signatureMutation.mutate({
                  quoteId: resetQuoteId,
                  action: 'manual',
                  signatureData: {
                    signedAt: data.signedAt.toISOString(),
                    signerName: data.signerName
                  }
                });
              }
            })}>
              <div className="space-y-4 py-4">
                {/* Data Firma */}
                <div className="space-y-2">
                  <Label htmlFor="signedAt">Data di Firma *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !manualSignatureForm.watch('signedAt') && "text-muted-foreground"
                        )}
                        data-testid="button-date-picker"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {manualSignatureForm.watch('signedAt') ? (
                          formatDate(manualSignatureForm.watch('signedAt'), 'PPP', { locale: it })
                        ) : (
                          <span>Seleziona data</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={manualSignatureForm.watch('signedAt')}
                        onSelect={(date) => date && manualSignatureForm.setValue('signedAt', date)}
                        disabled={(date) => date > new Date()}
                        initialFocus
                        locale={it}
                      />
                    </PopoverContent>
                  </Popover>
                  {manualSignatureForm.formState.errors.signedAt && (
                    <p className="text-sm text-destructive">{manualSignatureForm.formState.errors.signedAt.message}</p>
                  )}
                </div>

                {/* Nome Firmatario */}
                <div className="space-y-2">
                  <Label htmlFor="signerName">Nome Firmatario *</Label>
                  <Input
                    id="signerName"
                    placeholder="Nome e cognome di chi ha firmato"
                    {...manualSignatureForm.register('signerName')}
                    data-testid="input-signer-name"
                  />
                  {manualSignatureForm.formState.errors.signerName && (
                    <p className="text-sm text-destructive">{manualSignatureForm.formState.errors.signerName.message}</p>
                  )}
                </div>

                <div className="text-green-700 bg-green-50 dark:bg-green-950/20 p-3 rounded-md border border-green-200 dark:border-green-800 text-sm">
                  ℹ️ Questa firma verrà registrata come inserimento manuale per import legacy.
                </div>
              </div>

              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button 
                  type="button"
                  variant="outline" 
                  onClick={() => {
                    setResetQuoteId(null);
                    setSignatureMode('none');
                    manualSignatureForm.reset();
                  }}
                  data-testid="button-cancel-manual"
                >
                  Annulla
                </Button>
                <Button
                  type="submit"
                  disabled={signatureMutation.isPending}
                  className="bg-green-600 hover:bg-green-700"
                  data-testid="button-confirm-manual"
                >
                  {signatureMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Registrazione...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Registra Firma
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
