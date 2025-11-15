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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, FileText, Search } from 'lucide-react';
import QuoteManagementPanel from '@/components/quotes/QuoteManagementPanel';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import type { Quote } from '@shared/quotes-types';

export default function QuoteManagementDemo() {
  const [, navigate] = useLocation();
  const [quoteId, setQuoteId] = useState<string>('');
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);

  // Fetch quote
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

  const handleLoadQuote = (e: React.FormEvent) => {
    e.preventDefault();
    if (quoteId.trim()) {
      setSelectedQuoteId(quoteId.trim());
    }
  };

  const handleReset = () => {
    setSelectedQuoteId(null);
    setQuoteId('');
  };

  // Mostra form per inserire ID preventivo
  if (!selectedQuoteId) {
    return (
      <div className="container mx-auto py-12">
        <Card className="max-w-md mx-auto">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Gestione Preventivi - Demo
            </CardTitle>
            <CardDescription>
              Inserisci l'ID di un preventivo esistente per testare il pannello di gestione
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLoadQuote} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="quote-id">ID Preventivo</Label>
                <Input
                  id="quote-id"
                  data-testid="input-quote-id"
                  placeholder="es. abc123xyz..."
                  value={quoteId}
                  onChange={(e) => setQuoteId(e.target.value)}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  Puoi trovare l'ID preventivo nel database Firebase (collection 'quotes')
                </p>
              </div>
              <div className="flex gap-2">
                <Button 
                  type="submit" 
                  className="flex-1"
                  disabled={!quoteId.trim()}
                  data-testid="button-load-quote"
                >
                  <Search className="h-4 w-4 mr-2" />
                  Carica Preventivo
                </Button>
                <Button 
                  type="button"
                  variant="outline" 
                  onClick={() => navigate('/admin')}
                  data-testid="button-back-admin"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </div>
            </form>
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
