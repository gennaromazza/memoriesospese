/**
 * QUOTE PUBLIC VIEW PAGE
 * Portale pubblico cliente per visualizzare e firmare preventivo
 */

import { useEffect, useState, useRef } from 'react';
import { useParams, useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import SignatureCanvas from 'react-signature-canvas';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, FileText, CheckCircle2, AlertCircle, Trash2, MapPin, Calendar as CalendarIcon, Clock, User, Mail, Phone } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { acceptQuote } from '@/lib/quotes';
import type { Quote, QuoteProduct, QuoteClause } from '@shared/quotes-types';

interface QuotePublicData {
  quote: Quote;
  jobInfo: { 
    nomeEvento?: string; 
    eventDate?: string | null;
    eventLocation?: string;
    rituLocation?: string;
    rituTime?: string;
    startTime?: string;
    endTime?: string;
    allDay?: boolean;
    clientiIds?: string[];
  } | null;
  clientiInfo?: Array<{ 
    id: string;
    nome?: string; 
    cognome?: string;
    email?: string;
    telefono?: string;
    via?: string;
    citta?: string;
    cap?: string;
    provincia?: string;
  }>;
}

export default function QuotePublicViewPage() {
  const params = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const token = params.token;
  
  // State
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [acceptedClauses, setAcceptedClauses] = useState<string[]>([]);
  const [signerName, setSignerName] = useState('');
  const signatureRef = useRef<SignatureCanvas>(null);

  // Fetch quote data
  const { data, isLoading, error } = useQuery<{ success: boolean; data: QuotePublicData }>({
    queryKey: ['/api/quotes/public', token],
    queryFn: async () => {
      const response = await fetch(`/api/quotes/public/${token}`);
      if (!response.ok) {
        throw new Error('Failed to fetch quote');
      }
      return response.json();
    },
    enabled: !!token,
  });

  const portalData = data?.data;
  const quote = portalData?.quote;
  const jobInfo = portalData?.jobInfo;
  const clientiInfo = portalData?.clientiInfo || [];

  // Initialize selected products for variabile quotes (only already selected, not selectable)
  useEffect(() => {
    if (quote?.type === 'variabile' && quote.products) {
      const preselected = quote.products
        .filter(p => p.selected === true)
        .map(p => p.nome);
      setSelectedProducts(preselected);
    }
  }, [quote]);

  // Set theme colors
  useEffect(() => {
    if (quote?.theme) {
      document.documentElement.style.setProperty('--theme-primary', quote.theme.primaryColor || '#8B9A8B');
      document.documentElement.style.setProperty('--theme-secondary', quote.theme.secondaryColor || '#C8D4C8');
    }
    return () => {
      document.documentElement.style.removeProperty('--theme-primary');
      document.documentElement.style.removeProperty('--theme-secondary');
    };
  }, [quote?.theme]);

  // Accept quote mutation
  const acceptMutation = useMutation({
    mutationFn: async () => {
      if (!quote) throw new Error('Quote non trovato');
      if (!signatureRef.current) throw new Error('Firma mancante');

      // Check if signature canvas is empty
      if (signatureRef.current.isEmpty()) {
        throw new Error('Per favore, firma prima di continuare');
      }

      const signatureDataUrl = signatureRef.current.toDataURL();

      await acceptQuote({
        quoteId: quote.id,
        signature: {
          imageDataUrl: signatureDataUrl,
          clientName: signerName.trim()
        },
        selectedProducts: quote.type === 'variabile' ? selectedProducts : undefined,
        clausesAccepted: acceptedClauses
      });
    },
    onSuccess: () => {
      toast({
        title: '✅ Preventivo firmato!',
        description: 'Il preventivo è stato accettato e firmato con successo',
      });
      // Redirect to signed portal after 1.5s
      setTimeout(() => {
        navigate(`/quote/signed/${token}`);
      }, 1500);
    },
    onError: (error: Error) => {
      toast({
        title: '❌ Errore firma',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  // Validation
  const requiredClauses = quote?.contractClauses?.filter(c => c.required) || [];
  const allRequiredAccepted = requiredClauses.every(c => acceptedClauses.includes(c.id));
  const canSign = signerName.trim().length > 0 && allRequiredAccepted && !acceptMutation.isPending;

  // Calculate totale
  const calculateTotale = () => {
    if (!quote) return 0;
    if (quote.type === 'fisso') {
      return quote.totaleBase ?? quote.totalAfterDiscount ?? 0;
    }
    // Variabile: sum selected products
    return (quote.products ?? [])
      .filter(p => selectedProducts.includes(p.nome))
      .reduce((sum, p) => sum + p.prezzo, 0);
  };

  const totale = calculateTotale();

  // Theme colors with fallback
  const primaryColor = quote?.theme?.primaryColor ?? '#8B9A8B';
  const secondaryColor = quote?.theme?.secondaryColor ?? '#C8D4C8';

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  // Format date
  const formatDate = (date: any) => {
    if (!date) return '-';
    try {
      // Handle Firestore Timestamp, ISO string, or Date object
      const d = date.toDate ? date.toDate() : new Date(date);
      if (isNaN(d.getTime())) return '-';
      return d.toLocaleDateString('it-IT', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return '-';
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="w-12 h-12 animate-spin text-blue-600" />
              <p className="text-gray-600">Caricamento preventivo...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  if (error || !data?.success || !quote) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-50 p-4">
        <Card className="w-full max-w-md border-red-200">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                <FileText className="w-8 h-8 text-red-600" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">Preventivo non trovato</h2>
                <p className="text-gray-600">Il link non è valido o è scaduto.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Already signed
  if (quote.status === 'firmato') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-50 p-4">
        <Card className="w-full max-w-md border-green-200">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">Preventivo già firmato</h2>
                <p className="text-gray-600 mb-4">Questo preventivo è stato già firmato.</p>
                <Button onClick={() => navigate(`/quote/signed/${token}`)}>
                  Visualizza Preventivo Firmato
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-4 py-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <Card>
          <CardHeader className="text-center" style={{
            background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
            color: 'white'
          }}>
            <CardTitle className="text-2xl font-bold">
              {quote.templateName || 'Preventivo'}
            </CardTitle>
            {jobInfo?.nomeEvento && (
              <p className="text-white/90 mt-2">{jobInfo.nomeEvento}</p>
            )}
            <Badge variant="secondary" className="mt-2 bg-white/20 text-white border-white/30">
              {quote.type === 'fisso' ? 'Preventivo Fisso' : 'Preventivo Variabile'}
            </Badge>
          </CardHeader>
        </Card>

        {/* Riepilogo Evento */}
        {jobInfo && (
          <Card className="border-blue-100 bg-blue-50/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <CalendarIcon className="w-5 h-5 text-blue-600" />
                Dettagli Evento
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Data e Orari */}
              <div className="grid md:grid-cols-2 gap-4">
                {jobInfo.eventDate && (
                  <div className="flex items-start gap-3">
                    <CalendarIcon className="w-5 h-5 text-gray-500 mt-0.5" />
                    <div>
                      <p className="text-sm text-gray-600">Data Evento</p>
                      <p className="font-semibold">{formatDate(jobInfo.eventDate)}</p>
                    </div>
                  </div>
                )}

                {!jobInfo.allDay && (jobInfo.startTime || jobInfo.endTime) && (
                  <div className="flex items-start gap-3">
                    <Clock className="w-5 h-5 text-gray-500 mt-0.5" />
                    <div>
                      <p className="text-sm text-gray-600">Orario</p>
                      <p className="font-semibold">
                        {jobInfo.startTime && jobInfo.endTime 
                          ? `${jobInfo.startTime} - ${jobInfo.endTime}`
                          : jobInfo.startTime || jobInfo.endTime || 'Tutto il giorno'}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Location Evento */}
              {jobInfo.eventLocation && (
                <div className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-gray-500 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-600">Location Evento</p>
                    <p className="font-semibold">{jobInfo.eventLocation}</p>
                  </div>
                </div>
              )}

              {/* Rito/Celebrazione */}
              {(jobInfo.rituLocation || jobInfo.rituTime) && (
                <div className="grid md:grid-cols-2 gap-4">
                  {jobInfo.rituLocation && (
                    <div className="flex items-start gap-3">
                      <MapPin className="w-5 h-5 text-gray-500 mt-0.5" />
                      <div>
                        <p className="text-sm text-gray-600">Luogo Rito/Celebrazione</p>
                        <p className="font-semibold">{jobInfo.rituLocation}</p>
                      </div>
                    </div>
                  )}

                  {jobInfo.rituTime && (
                    <div className="flex items-start gap-3">
                      <Clock className="w-5 h-5 text-gray-500 mt-0.5" />
                      <div>
                        <p className="text-sm text-gray-600">Orario Rito</p>
                        <p className="font-semibold">{jobInfo.rituTime}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Clienti */}
              {clientiInfo.length > 0 && (
                <div>
                  <p className="text-sm text-gray-600 mb-3 flex items-center gap-2">
                    <User className="w-4 h-4" />
                    {clientiInfo.length === 1 ? 'Cliente' : 'Clienti'}
                  </p>
                  <div className="grid md:grid-cols-2 gap-3">
                    {clientiInfo.map((cliente, idx) => (
                      <div key={cliente.id} className="bg-white p-3 rounded-lg border">
                        <p className="font-semibold text-gray-900 mb-2">
                          {cliente.nome} {cliente.cognome}
                          {clientiInfo.length > 1 && (
                            <span className="text-xs text-gray-500 ml-2">
                              (Cliente {idx + 1})
                            </span>
                          )}
                        </p>
                        {cliente.email && (
                          <div className="flex items-center gap-2 text-sm text-gray-600 mt-1">
                            <Mail className="w-3 h-3" />
                            <span>{cliente.email}</span>
                          </div>
                        )}
                        {cliente.telefono && (
                          <div className="flex items-center gap-2 text-sm text-gray-600 mt-1">
                            <Phone className="w-3 h-3" />
                            <span>{cliente.telefono}</span>
                          </div>
                        )}
                        {(cliente.via || cliente.citta) && (
                          <div className="flex items-start gap-2 text-sm text-gray-600 mt-2 pt-2 border-t">
                            <MapPin className="w-3 h-3 mt-0.5" />
                            <div>
                              {cliente.via && <p>{cliente.via}</p>}
                              {cliente.citta && (
                                <p>
                                  {cliente.cap && `${cliente.cap} `}
                                  {cliente.citta}
                                  {cliente.provincia && ` (${cliente.provincia})`}
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Prodotti */}
        <Card>
          <CardHeader>
            <CardTitle>Prodotti e Servizi</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(quote.products ?? []).map((product, idx) => (
              <div key={idx} className="flex items-start gap-4 p-4 border rounded-lg bg-white">
                {quote.type === 'variabile' && product.selectable && (
                  <Checkbox
                    checked={selectedProducts.includes(product.nome)}
                    onCheckedChange={(checked) => {
                      setSelectedProducts(prev => 
                        checked 
                          ? [...prev, product.nome]
                          : prev.filter(p => p !== product.nome)
                      );
                    }}
                    data-testid={`checkbox-product-${idx}`}
                  />
                )}
                
                {/* Product Image */}
                {product.immagini && product.immagini.length > 0 && (
                  <div className="flex-shrink-0">
                    <img 
                      src={product.immagini[0]} 
                      alt={product.nome}
                      className="w-20 h-20 object-cover rounded-md border"
                    />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900">{product.nome}</h3>
                  {product.descrizione && (
                    <p className="text-sm text-muted-foreground mt-1">{product.descrizione}</p>
                  )}
                  <div className="flex flex-wrap gap-2 mt-2">
                    {product.numeroFoto && (
                      <Badge variant="outline" className="text-xs">
                        📸 {product.numeroFoto} foto
                      </Badge>
                    )}
                    {product.categoria && (
                      <Badge variant="outline" className="text-xs">{product.categoria}</Badge>
                    )}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-bold text-lg text-gray-900">{formatCurrency(product.prezzo)}</p>
                </div>
              </div>
            ))}

            <Separator className="my-4" />

            {/* Totale */}
            <div className="flex justify-between items-center text-xl font-bold">
              <span>Totale</span>
              <span className="text-2xl" style={{ color: primaryColor }}>
                {formatCurrency(totale)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Clausole Contrattuali */}
        {quote.contractClauses && quote.contractClauses.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Clausole Contrattuali</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {quote.contractClauses.map((clause) => (
                <div key={clause.id} className="flex items-start gap-3 p-3 border rounded-lg">
                  <Checkbox
                    checked={acceptedClauses.includes(clause.id)}
                    onCheckedChange={(checked) => {
                      setAcceptedClauses(prev =>
                        checked
                          ? [...prev, clause.id]
                          : prev.filter(c => c !== clause.id)
                      );
                    }}
                    data-testid={`checkbox-clause-${clause.id}`}
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm" dangerouslySetInnerHTML={{ __html: clause.text }} />
                      {clause.required && (
                        <Badge variant="destructive" className="text-xs">Obbligatoria</Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {requiredClauses.length > 0 && !allRequiredAccepted && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Devi accettare tutte le clausole obbligatorie per continuare
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        )}

        {/* Firma Digitale */}
        <Card className="border-orange-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-orange-600" />
              Firma Digitale
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-2">
              Per accettare questo preventivo, inserisci il tuo nome completo e apponi la tua firma digitale qui sotto.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Nome Firmante */}
            <div className="space-y-2">
              <Label htmlFor="signer-name" className="text-base font-semibold flex items-center gap-2">
                <User className="w-4 h-4" />
                Il tuo Nome Completo *
              </Label>
              <Input
                id="signer-name"
                placeholder="Scrivi qui il tuo nome e cognome (es. Mario Rossi)"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                data-testid="input-signer-name"
                className="text-base py-6"
              />
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Il nome che inserisci apparirà nel contratto firmato
              </p>
            </div>

            {/* Signature Canvas */}
            <div>
              <Label>Firma qui sotto *</Label>
              <div className="border-2 border-dashed rounded-lg p-2 bg-white">
                <SignatureCanvas
                  ref={signatureRef}
                  canvasProps={{
                    className: 'w-full h-40',
                    style: { touchAction: 'none' }
                  }}
                  backgroundColor="white"
                />
              </div>
              <div className="flex justify-end mt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => signatureRef.current?.clear()}
                  data-testid="button-clear-signature"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Cancella Firma
                </Button>
              </div>
            </div>

            {/* Submit */}
            <Button
              onClick={() => acceptMutation.mutate()}
              disabled={!canSign}
              className="w-full"
              size="lg"
              data-testid="button-submit-signature"
            >
              {acceptMutation.isPending ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Firma in corso...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-5 w-5 mr-2" />
                  Firma e Accetta Preventivo
                </>
              )}
            </Button>

            {!canSign && (
              <p className="text-sm text-muted-foreground text-center">
                {!signerName.trim() && 'Inserisci il tuo nome. '}
                {!allRequiredAccepted && 'Accetta tutte le clausole obbligatorie.'}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Footer */}
        {quote.theme?.footerText && (
          <div className="text-center text-sm text-muted-foreground">
            <p>{quote.theme.footerText}</p>
          </div>
        )}
      </div>
    </div>
  );
}
