/**
 * QUOTE PUBLIC VIEW PAGE
 * Portale pubblico cliente per visualizzare e firmare preventivo
 */

import { useEffect, useState, useRef, useMemo } from 'react';
import { useParams, useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
// Removed SignatureCanvas - now using text-based signature with elegant font
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, FileText, CheckCircle2, AlertCircle, Trash2, MapPin, Calendar as CalendarIcon, Clock, User, Mail, Phone, Home, Globe, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import placeholderUrl from '@assets/generated_images/Custom_product_placeholder_image_f076e89e.png';
import { useToast } from '@/hooks/use-toast';
import { acceptQuote } from '@/lib/quotes';
import type { Quote, QuoteProduct, QuoteClause } from '@shared/quotes-types';
import { calculateQuoteTotals } from '@shared/quote-utils';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

interface QuotePublicData {
  quote: Quote;
  jobInfo: { 
    nomeEvento?: string; 
    eventDate?: string | null;
    location?: string;
    rito?: string;
    rituTime?: string;
    startTime?: string;
    endTime?: string;
    allDay?: boolean;
  } | null;
  clientiInfo?: Array<{ 
    id: string;
    nome?: string; 
    cognome?: string;
    email?: string;
    telefono?: string;
    indirizzo?: string;
    citta?: string;
    cap?: string;
  }>;
  appuntamentiClienti?: Array<{
    clienteId: string;
    orarioAppuntamento?: string;
    noteAppuntamento?: string;
  }>;
  jobTypeInfo?: {
    id?: string;
    nome?: string;
    imageUrl?: string;
  } | null;
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
  const [studioLogo, setStudioLogo] = useState<string | null>(null);
  const [expandedDescriptions, setExpandedDescriptions] = useState<Set<number>>(new Set());
  // Removed signatureRef - now using text-based signature
  
  // Toggle description expansion
  const toggleDescription = (idx: number) => {
    setExpandedDescriptions(prev => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };

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
  const appuntamentiClienti = portalData?.appuntamentiClienti || [];
  const jobTypeInfo = portalData?.jobTypeInfo;

  // Initialize selected products for variabile quotes (only already selected, not selectable)
  useEffect(() => {
    if (quote?.type === 'variabile' && quote.products) {
      const preselected = quote.products
        .filter(p => p.selected === true)
        .map(p => p.nome);
      setSelectedProducts(preselected);
    }
  }, [quote]);

  // Load studio logo
  useEffect(() => {
    async function loadStudioLogo() {
      try {
        const settingsDoc = await getDoc(doc(db, 'settings', 'studio'));
        if (settingsDoc.exists()) {
          const settings = settingsDoc.data();
          if (settings.logo) {
            setStudioLogo(settings.logo);
          }
        }
      } catch (error) {
        console.error('Error loading studio logo:', error);
      }
    }
    loadStudioLogo();
  }, []);

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
      if (!signerName.trim()) throw new Error('Inserisci il tuo nome per firmare');

      await acceptQuote({
        quoteId: quote.id,
        signature: {
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
      // Redirect to unified portal after 1.5s (auto-renders signed view)
      setTimeout(() => {
        navigate(`/quote/${token}`);
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

  // Calculate totals with discount
  const totals = useMemo(() => {
    if (!quote) {
      return { totalBeforeDiscount: 0, discountAmount: 0, totalAfterDiscount: 0 };
    }
    
    if (quote.type === 'fisso') {
      // Fixed quote: use server-calculated totals
      const totalAfterDiscount = quote.totalAfterDiscount ?? quote.totaleBase ?? 0;
      const totalBeforeDiscount = quote.totalBeforeDiscount ?? totalAfterDiscount;
      const discountAmount = totalBeforeDiscount - totalAfterDiscount;
      return { totalBeforeDiscount, discountAmount, totalAfterDiscount };
    }
    
    // Variable quote: calculate subtotal of fixed products + selected variable products
    const subtotale = (quote.products ?? [])
      .filter(p => !p.selectable || selectedProducts.includes(p.nome))  // Fissi sempre inclusi + variabili solo se selezionati
      .reduce((sum, p) => sum + p.prezzo, 0);
    
    // Apply discount to selected subtotal
    return calculateQuoteTotals(subtotale, quote.discountType, quote.discountValue);
  }, [quote, selectedProducts]);

  const totale = totals.totalAfterDiscount;

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
                <Button onClick={() => navigate(`/quote/${token}`)}>
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
        {/* Header con stile October Mist */}
        <Card className="overflow-hidden border-sage/20 shadow-lg bg-gradient-to-br from-off-white to-light-mint">
          {/* Logo Studio - piccolo in alto */}
          {studioLogo && (
            <div className="flex justify-center pt-6 pb-2">
              <div className="p-2 bg-white rounded-xl shadow-sm">
                <img 
                  src={studioLogo} 
                  alt="Studio Logo" 
                  className="h-10 sm:h-12 w-auto object-contain"
                />
              </div>
            </div>
          )}
          
          {/* Banner immagine copertina tipo lavoro */}
          {jobTypeInfo?.imageUrl && (
            <div className="relative w-full aspect-[16/9] sm:aspect-[21/9] overflow-hidden">
              <img 
                src={jobTypeInfo.imageUrl} 
                alt={jobTypeInfo.nome || 'Tipo lavoro'} 
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
            </div>
          )}
          
          <CardHeader className="relative text-center py-6 sm:py-8 px-6">
            <div className="space-y-4">
              {/* Badge tipo preventivo */}
              <div className="flex justify-center mb-4">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-gray/10 backdrop-blur-sm rounded-full border border-blue-gray/20">
                  <FileText className="w-4 h-4 text-blue-gray" />
                  <span className="text-blue-gray font-medium text-sm">
                    {quote.type === 'fisso' ? 'Preventivo Fisso' : 'Preventivo Variabile'}
                  </span>
                </div>
              </div>
              
              {/* Titolo */}
              <CardTitle className="text-2xl sm:text-3xl font-playfair font-bold text-blue-gray">
                {quote.templateName || 'Preventivo'}
              </CardTitle>
              
              {/* Nome evento */}
              {jobInfo?.nomeEvento && (
                <p className="text-sage text-base sm:text-lg font-medium mt-2">
                  {jobInfo.nomeEvento}
                </p>
              )}
            </div>
          </CardHeader>
        </Card>

        {/* Riepilogo Evento */}
        {jobInfo && (
          <Card className="border-sage/20 bg-gradient-to-br from-white to-light-mint/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg text-blue-gray font-playfair">
                <CalendarIcon className="w-5 h-5 text-sage" />
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
              {jobInfo.location && (
                <div className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-gray-500 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-600">Location Evento</p>
                    <p className="font-semibold">
                      {jobInfo.location}
                      <a 
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(jobInfo.location)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 text-primary hover:underline text-xs"
                      >
                        Apri in Maps
                      </a>
                    </p>
                  </div>
                </div>
              )}

              {/* Rito/Celebrazione */}
              {(jobInfo.rito || jobInfo.rituTime) && (
                <div className="grid md:grid-cols-2 gap-4">
                  {jobInfo.rito && (
                    <div className="flex items-start gap-3">
                      <MapPin className="w-5 h-5 text-gray-500 mt-0.5" />
                      <div>
                        <p className="text-sm text-gray-600">Luogo Rito/Celebrazione</p>
                        <p className="font-semibold">
                          {jobInfo.rito}
                          <a 
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(jobInfo.rito)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-2 text-primary hover:underline text-xs"
                          >
                            Apri in Maps
                          </a>
                        </p>
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

              {/* Clienti - Info Complete */}
              {clientiInfo.length > 0 && (
                <div>
                  <p className="text-sm text-blue-gray mb-4 flex items-center gap-2 font-semibold">
                    <User className="w-5 h-5 text-sage" />
                    {clientiInfo.length === 1 ? 'Informazioni Cliente' : 'Informazioni Clienti'}
                  </p>
                  <div className="grid md:grid-cols-2 gap-4">
                    {clientiInfo.map((cliente, idx) => {
                      const appuntamento = appuntamentiClienti.find(a => a.clienteId === cliente.id);
                      return (
                      <div key={cliente.id} className="bg-gradient-to-br from-white to-light-mint/20 p-5 rounded-xl border border-sage/20 shadow-sm hover:shadow-md transition-all hover:border-sage/40">
                        {/* Nome */}
                        <div className="flex items-center gap-3 mb-4 pb-3 border-b border-mint/30">
                          <div className="w-10 h-10 rounded-full bg-mint/30 flex items-center justify-center flex-shrink-0">
                            <User className="w-5 h-5 text-blue-gray" />
                          </div>
                          <div>
                            <p className="font-bold text-blue-gray text-lg font-playfair">
                              {cliente.nome} {cliente.cognome}
                            </p>
                            {clientiInfo.length > 1 && (
                              <span className="text-xs text-sage font-medium">
                                Cliente {idx + 1}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Appuntamento */}
                        {appuntamento?.orarioAppuntamento && (
                          <div className="mb-4 p-3 bg-sage/10 rounded-lg border border-sage/20">
                            <div className="flex items-start gap-3">
                              <div className="w-8 h-8 rounded-full bg-sage/20 flex items-center justify-center flex-shrink-0">
                                <Clock className="w-4 h-4 text-sage" />
                              </div>
                              <div className="flex-1">
                                <p className="text-xs text-sage uppercase font-semibold">Appuntamento</p>
                                <p className="text-sm text-blue-gray font-bold">{appuntamento.orarioAppuntamento}</p>
                                {appuntamento.noteAppuntamento && (
                                  <p className="text-xs text-dark-sage mt-1">{appuntamento.noteAppuntamento}</p>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="space-y-3">
                          {/* Email */}
                          {cliente.email && (
                            <div className="flex items-start gap-3 p-2 rounded-lg hover:bg-mint/10 transition-colors">
                              <div className="w-8 h-8 rounded-full bg-mint/20 flex items-center justify-center flex-shrink-0">
                                <Mail className="w-4 h-4 text-blue-gray" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-sage uppercase font-medium">Email</p>
                                <p className="text-sm text-blue-gray font-medium break-all">{cliente.email}</p>
                              </div>
                            </div>
                          )}

                          {/* Telefono */}
                          {cliente.telefono && (
                            <div className="flex items-start gap-3 p-2 rounded-lg hover:bg-mint/10 transition-colors">
                              <div className="w-8 h-8 rounded-full bg-terracotta/20 flex items-center justify-center flex-shrink-0">
                                <Phone className="w-4 h-4 text-terracotta" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-sage uppercase font-medium">Telefono</p>
                                <p className="text-sm text-blue-gray font-medium">{cliente.telefono}</p>
                              </div>
                            </div>
                          )}

                          {/* Indirizzo - cliccabile per Google Maps */}
                          {(cliente.indirizzo || cliente.citta) && (() => {
                            const addressParts = [
                              cliente.indirizzo,
                              cliente.cap,
                              cliente.citta
                            ].filter(Boolean).join(', ');
                            const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressParts)}`;
                            
                            return (
                              <a 
                                href={mapsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-start gap-3 p-2 rounded-lg hover:bg-mint/10 transition-colors group cursor-pointer"
                                data-testid={`link-address-maps-${cliente.id}`}
                              >
                                <div className="w-8 h-8 rounded-full bg-cream/50 flex items-center justify-center flex-shrink-0 group-hover:bg-sage/20 transition-colors">
                                  <MapPin className="w-4 h-4 text-blue-gray group-hover:text-sage" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs text-sage uppercase font-medium mb-1 flex items-center gap-1">
                                    Indirizzo
                                    <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                  </p>
                                  <div className="text-sm text-blue-gray group-hover:text-sage transition-colors">
                                    {cliente.indirizzo && <p className="font-medium">{cliente.indirizzo}</p>}
                                    {cliente.citta && (
                                      <p className="text-dark-sage group-hover:text-sage/80">
                                        {cliente.cap && `${cliente.cap} `}
                                        {cliente.citta}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </a>
                            );
                          })()}
                        </div>
                      </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Prodotti */}
        <Card className="border-sage/20 bg-gradient-to-br from-white to-light-mint/20">
          <CardHeader>
            <CardTitle className="font-playfair text-blue-gray">Prodotti e Servizi</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(quote.products ?? []).map((product, idx) => {
              const isExpanded = expandedDescriptions.has(idx);
              const hasLongDescription = product.descrizione && product.descrizione.length > 120;
              
              return (
                <div key={idx} className="p-4 border border-mint/30 rounded-xl bg-white hover:border-sage/50 hover:shadow-lg transition-all">
                  {/* Layout responsive: verticale su mobile, orizzontale su desktop */}
                  <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                    {/* Checkbox per preventivi variabili */}
                    {quote.type === 'variabile' && product.selectable && (
                      <div className="sm:hidden flex items-center gap-2 mb-2">
                        <Checkbox
                          checked={selectedProducts.includes(product.nome)}
                          onCheckedChange={(checked) => {
                            setSelectedProducts(prev => 
                              checked 
                                ? [...prev, product.nome]
                                : prev.filter(p => p !== product.nome)
                            );
                          }}
                          data-testid={`checkbox-product-mobile-${idx}`}
                        />
                        <span className="text-sm text-sage">Seleziona questo prodotto</span>
                      </div>
                    )}
                    
                    {/* Desktop checkbox */}
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
                        className="mt-1 hidden sm:flex"
                        data-testid={`checkbox-product-${idx}`}
                      />
                    )}
                    
                    {/* Header mobile: immagine + nome + prezzo */}
                    <div className="flex items-start gap-3 sm:contents">
                      {/* Product Image */}
                      <div className="flex-shrink-0">
                        <img 
                          src={product.immagini && product.immagini.length > 0 ? product.immagini[0] : placeholderUrl} 
                          alt={product.nome}
                          className="w-20 h-20 sm:w-28 sm:h-28 object-cover rounded-lg border-2 border-mint/30 shadow-sm"
                        />
                      </div>

                      {/* Mobile: Nome e Prezzo affiancati */}
                      <div className="flex-1 min-w-0 sm:hidden">
                        <h3 className="font-bold text-blue-gray text-base font-playfair leading-tight">{product.nome}</h3>
                        <p className="font-bold text-lg text-blue-gray mt-1">{formatCurrency(product.prezzo)}</p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {product.numeroFoto && (
                            <Badge variant="outline" className="text-xs bg-mint/20 border-mint text-blue-gray">
                              📸 {product.numeroFoto} foto
                            </Badge>
                          )}
                          {product.categoria && (
                            <Badge variant="outline" className="text-xs bg-terracotta/20 border-terracotta/40 text-blue-gray">
                              {product.categoria}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Desktop: contenuto centrale */}
                    <div className="hidden sm:block flex-1 min-w-0">
                      <h3 className="font-bold text-blue-gray text-lg mb-1 font-playfair">{product.nome}</h3>
                      {product.descrizione && (
                        <p className="text-sm text-dark-sage mt-1 leading-relaxed">{product.descrizione}</p>
                      )}
                      <div className="flex flex-wrap gap-2 mt-3">
                        {product.numeroFoto && (
                          <Badge variant="outline" className="text-xs bg-mint/20 border-mint text-blue-gray">
                            📸 {product.numeroFoto} foto
                          </Badge>
                        )}
                        {product.categoria && (
                          <Badge variant="outline" className="text-xs bg-terracotta/20 border-terracotta/40 text-blue-gray">
                            {product.categoria}
                          </Badge>
                        )}
                      </div>
                    </div>
                    
                    {/* Desktop: prezzo a destra */}
                    <div className="hidden sm:block text-right flex-shrink-0">
                      <p className="font-bold text-xl sm:text-2xl text-blue-gray">{formatCurrency(product.prezzo)}</p>
                    </div>
                  </div>
                  
                  {/* Mobile: descrizione sotto con "Continua a leggere" */}
                  {product.descrizione && (
                    <div className="sm:hidden mt-3 pt-3 border-t border-mint/20">
                      <p className={`text-sm text-dark-sage leading-relaxed ${!isExpanded && hasLongDescription ? 'line-clamp-2' : ''}`}>
                        {product.descrizione}
                      </p>
                      {hasLongDescription && (
                        <button
                          onClick={() => toggleDescription(idx)}
                          className="flex items-center gap-1 text-xs text-sage hover:text-dark-sage mt-2 font-medium"
                          data-testid={`button-toggle-description-${idx}`}
                        >
                          {isExpanded ? (
                            <>
                              <ChevronUp className="w-3 h-3" />
                              Mostra meno
                            </>
                          ) : (
                            <>
                              <ChevronDown className="w-3 h-3" />
                              Continua a leggere
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            <Separator className="my-4" />

            {/* Discount Breakdown */}
            {totals.discountAmount > 0 && (
              <div className="space-y-2 text-sm mb-4">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotale</span>
                  <span>{formatCurrency(totals.totalBeforeDiscount)}</span>
                </div>
                <div className="flex justify-between text-emerald-600 font-medium">
                  <span>
                    Sconto
                    {quote.discountType === 'percent' && typeof quote.discountValue === 'number'
                      ? ` (${quote.discountValue}%)`
                      : ''}
                  </span>
                  <span>-{formatCurrency(totals.discountAmount)}</span>
                </div>
              </div>
            )}

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
        <Card className="border-sage/30 bg-gradient-to-br from-white to-light-mint/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-playfair text-blue-gray">
              <FileText className="w-5 h-5 text-sage" />
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

            {/* Signature Preview */}
            <div>
              <Label>Anteprima Firma</Label>
              <div className="border-2 border-sage/30 rounded-lg p-8 bg-gradient-to-br from-white to-sage/5 min-h-[160px] flex items-center justify-center">
                {signerName.trim() ? (
                  <p 
                    className="text-6xl text-sage" 
                    style={{ fontFamily: "'Great Vibes', cursive" }}
                    data-testid="signature-preview"
                  >
                    {signerName.trim()}
                  </p>
                ) : (
                  <p className="text-muted-foreground italic">
                    La tua firma apparirà qui
                  </p>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Il tuo nome verrà visualizzato con un font elegante stile firma
              </p>
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
