import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getQuotesForJob } from '@/lib/quotes';
import { Quote, QuoteStatus } from '@shared/quotes-types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Loader2, FileText, Plus, ExternalLink, CheckCircle2, XCircle, CreditCard, Copy, Check } from 'lucide-react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import GeneraPagamentiModal from './GeneraPagamentiModal';

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

export default function ModuliJobSection({ jobId, onCreateModulo, clienteId, isAdmin = false }: ModuliJobSectionProps) {
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [generaPagamentiQuoteId, setGeneraPagamentiQuoteId] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const { toast } = useToast();

  const { data: quotes = [], isLoading } = useQuery<Quote[]>({
    queryKey: ['quotes', 'job', jobId],
    queryFn: () => getQuotesForJob(jobId),
    enabled: !!jobId
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
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(`/quote/signed/${quote.publicToken}`, '_blank');
                  }}
                  data-testid={`button-view-${quote.id}`}
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
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
                <SheetTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  {selectedQuote.templateName || 'Modulo Preventivo'}
                </SheetTitle>
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
                  <h3 className="font-semibold mb-3">Portale Cliente Firmato</h3>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={`${window.location.origin}/quote/signed/${selectedQuote.publicToken}`}
                      className="flex-1 px-3 py-2 bg-muted rounded text-sm"
                      onClick={(e) => e.currentTarget.select()}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        const url = `${window.location.origin}/quote/signed/${selectedQuote.publicToken}`;
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
                      onClick={() => window.open(`/quote/signed/${selectedQuote.publicToken}`, '_blank')}
                      data-testid="button-open-portal"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
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
    </div>
  );
}
