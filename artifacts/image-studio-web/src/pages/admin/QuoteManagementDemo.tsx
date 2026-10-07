/**
 * QUOTE MANAGEMENT DEMO PAGE
 * Pagina demo per testare il QuoteManagementPanel
 * Può essere integrata nella JobDetailPage o usata standalone
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, FileText } from 'lucide-react';
import QuoteManagementPanel from '@/components/quotes/QuoteManagementPanel';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import type { Quote } from '@shared/quotes-types';
import { Badge } from '@/components/ui/badge';

export default function QuoteManagementDemo() {
  const [, navigate] = useLocation();
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);

  // Fetch lista preventivi
  const { data: quotes, isLoading: isLoadingList } = useQuery({
    queryKey: ['/api/quotes', 'list'],
    queryFn: async () => {
      const quotesRef = collection(db, 'quotes');
      const q = query(quotesRef, orderBy('createdAt', 'desc'), limit(50));
      const snapshot = await getDocs(q);
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Quote[];
    },
    enabled: !selectedQuoteId
  });

  // Fetch preventivo selezionato
  const { data: quote, isLoading, error } = useQuery({
    queryKey: ['/api/quotes', selectedQuoteId],
    queryFn: async () => {
      if (!selectedQuoteId) throw new Error('ID preventivo mancante');
      
      const quoteRef = doc(db, 'quotes', selectedQuoteId);
      const quoteDoc = await getDoc(quoteRef);
      
      if (!quoteDoc.exists()) {
        throw new Error('Preventivo non trovato');
      }
      
      return { id: quoteDoc.id, ...quoteDoc.data() } as Quote;
    },
    enabled: !!selectedQuoteId
  });

  const handleReset = () => {
    setSelectedQuoteId(null);
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'firmato': return 'default';
      case 'inviato': return 'secondary';
      case 'bozza': return 'outline';
      case 'rifiutato': return 'destructive';
      case 'annullato': return 'destructive';
      default: return 'secondary';
    }
  };

  // Mostra lista preventivi
  if (!selectedQuoteId) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Gestione Preventivi - Demo
                </CardTitle>
                <CardDescription className="mt-1">
                  Seleziona un preventivo per testare il pannello di gestione
                </CardDescription>
              </div>
              <Button variant="outline" onClick={() => navigate('/admin')} data-testid="button-back-admin">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Indietro
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoadingList ? (
              <div className="text-center py-8 text-muted-foreground">
                Caricamento preventivi...
              </div>
            ) : !quotes || quotes.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Nessun preventivo trovato nel database
              </div>
            ) : (
              <div className="space-y-2">
                {quotes.map((q) => (
                  <button
                    key={q.id}
                    onClick={() => setSelectedQuoteId(q.id)}
                    data-testid={`button-select-quote-${q.id}`}
                    className="w-full text-left p-4 rounded-lg border hover:bg-accent hover:border-primary transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {q.jobInfo?.nomeEvento || `Preventivo #${q.id.slice(0, 8)}`}
                          </span>
                          <Badge variant={getStatusBadgeVariant(q.status)}>
                            {q.status}
                          </Badge>
                        </div>
                        {q.clientiInfo && q.clientiInfo.length > 0 && (
                          <p className="text-sm text-muted-foreground">
                            Cliente: {q.clientiInfo.map(c => `${c.nome} ${c.cognome}`).join(', ')}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          ID: {q.id}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">
                          €{q.totalAfterDiscount?.toFixed(2) || '0.00'}
                        </p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {q.type || 'fisso'}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground animate-pulse" />
          <p className="text-muted-foreground">Caricamento preventivo...</p>
        </div>
      </div>
    );
  }

  if (error || !quote) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive">Errore</CardTitle>
            <CardDescription>
              {error instanceof Error ? error.message : 'Preventivo non trovato'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => navigate('/admin')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Torna all'admin
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Gestione Preventivo</h1>
          <p className="text-muted-foreground mt-1">
            Preventivo #{quote.id}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleReset} data-testid="button-change-quote">
            Cambia Preventivo
          </Button>
          <Button variant="outline" onClick={() => navigate('/admin')} data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Indietro
          </Button>
        </div>
      </div>

      {/* Quote Info Card */}
      <Card>
        <CardHeader>
          <CardTitle>Informazioni Preventivo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium">Tipo:</span>{' '}
              {quote.type === 'fisso' ? 'Fisso' : 'Variabile'}
            </div>
            <div>
              <span className="font-medium">Totale:</span>{' '}
              €{quote.totalAfterDiscount?.toFixed(2) || '0.00'}
            </div>
            <div className="col-span-2">
              <span className="font-medium">Job:</span> {quote.jobInfo?.nomeEvento || quote.jobId}
            </div>
            {quote.clientiInfo && quote.clientiInfo.length > 0 && (
              <div className="col-span-2">
                <span className="font-medium">Cliente:</span>{' '}
                {quote.clientiInfo.map(c => `${c.nome} ${c.cognome}`).join(', ')}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Management Panel */}
      <QuoteManagementPanel quote={quote} />

      {/* Integration Guide */}
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-sm">💡 Come integrare questo pannello</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>Per integrare QuoteManagementPanel nella tua app:</p>
          <ol className="list-decimal list-inside space-y-1 ml-2">
            <li>Importa il componente: <code className="bg-muted px-1 py-0.5 rounded">import QuoteManagementPanel from '@/components/quotes/QuoteManagementPanel'</code></li>
            <li>Passa l'oggetto quote come prop: <code className="bg-muted px-1 py-0.5 rounded">&lt;QuoteManagementPanel quote=&#123;quote&#125; /&gt;</code></li>
            <li>Esempio: aggiungi nella tab "Preventivi" di JobDetailPage.tsx</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
