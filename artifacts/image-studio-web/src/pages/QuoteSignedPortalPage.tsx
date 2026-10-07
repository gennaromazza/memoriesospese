
/**
 * QUOTE SIGNED PORTAL PAGE
 * Portale pubblico per visualizzare preventivo firmato + piano pagamenti
 */

import { useEffect, useState } from 'react';
import { useParams } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, FileText, Calendar, CreditCard, User, Mail, Phone, MapPin, Download, ExternalLink } from 'lucide-react';
import placeholderUrl from '@assets/generated_images/Custom_product_placeholder_image_f076e89e.png';
import type { Quote, QuoteSignature } from '@shared/quotes-types';
import type { PaymentSchedule } from '@shared/payment-schedule-types';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import html2pdf from 'html2pdf.js';
import { formatPhoneForWhatsApp } from '@shared/phone-utils';

interface QuoteSignedPortalData {
  quote: Quote & { signedAt?: any };
  paymentSchedule: PaymentSchedule | null;
  legacyOrderData?: {
    totale: number;
    acconto: number;
    saldo: number;
  } | null;
  jobInfo: {
    nomeEvento?: string;
    eventDate?: any;
    rito?: string;
    location?: string;
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
    provincia?: string;
  }>;
  appuntamentiClienti?: Array<{
    clienteId: string;
    orarioAppuntamento?: string;
    noteAppuntamento?: string;
  }>;
}

export default function QuoteSignedPortalPage() {
  const params = useParams();
  const token = params.token;
  const [studioSettings, setStudioSettings] = useState<{ phone?: string } | null>(null);
  const [studioLogo, setStudioLogo] = useState<string | null>(null);

  // Fetch quote signed data
  const { data, isLoading, error } = useQuery<{ success: boolean; data: QuoteSignedPortalData }>({
    queryKey: ['/api/quotes/signed', token],
    queryFn: async () => {
      const response = await fetch(`/api/quotes/signed/${token}`);
      if (!response.ok) {
        throw new Error('Failed to fetch quote');
      }
      return response.json();
    },
    enabled: !!token,
    refetchInterval: 30000,
  });

  const portalData = data?.data;
  const quote = portalData?.quote;
  const paymentSchedule = portalData?.paymentSchedule;
  const legacyOrderData = portalData?.legacyOrderData;
  const jobInfo = portalData?.jobInfo;
  const clientiInfo = portalData?.clientiInfo || [];
  const appuntamentiClienti = portalData?.appuntamentiClienti || [];

  // Load studio settings and logo
  useEffect(() => {
    async function loadStudioSettings() {
      try {
        const settingsDoc = await getDoc(doc(db, 'settings', 'studio'));
        if (settingsDoc.exists()) {
          const settings = settingsDoc.data();
          setStudioSettings(settings);
          if (settings.logo) {
            setStudioLogo(settings.logo);
          }
        }
      } catch (error) {
        console.error('Error loading studio settings:', error);
      }
    }
    loadStudioSettings();
  }, []);

  // Set theme colors
  useEffect(() => {
    if (quote?.theme) {
      document.documentElement.style.setProperty('--theme-primary', quote.theme.primaryColor);
      document.documentElement.style.setProperty('--theme-secondary', quote.theme.secondaryColor);
    }
    return () => {
      document.documentElement.style.removeProperty('--theme-primary');
      document.documentElement.style.removeProperty('--theme-secondary');
    };
  }, [quote?.theme]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  // Helper: Calcola il totale corretto per visualizzazione
  // Per preventivi variabili firmati, usa totaleSelezionato (salvato alla firma)
  // Per preventivi fissi, usa totalAfterDiscount
  const getDisplayTotal = () => {
    if (!quote) return 0;
    if (quote.type === 'variabile') {
      return quote.totaleSelezionato ?? quote.totalAfterDiscount ?? quote.totaleBase ?? 0;
    }
    return quote.totalAfterDiscount ?? quote.totaleBase ?? 0;
  };

  const displayTotal = getDisplayTotal();

  const formatDate = (date: any) => {
    if (!date) return '-';
    try {
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

  const getPaymentStatusBadge = (stato: string) => {
    switch (stato) {
      case 'pagato':
        return <Badge className="bg-sage text-white border-sage">✓ Pagato</Badge>;
      case 'parziale':
        return <Badge className="bg-terracotta text-white border-terracotta">⚡ Parziale</Badge>;
      case 'atteso':
        return <Badge className="bg-beige text-dark-sage border-beige">⏳ In attesa</Badge>;
      case 'scaduto':
        return <Badge className="bg-red-100 text-red-800 border-red-200">⚠️ Scaduto</Badge>;
      default:
        return <Badge variant="outline">{stato}</Badge>;
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-off-white p-4">
        <Card className="w-full max-w-md border-beige shadow-lg">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="w-12 h-12 animate-spin text-blue-gray" />
              <p className="text-dark-sage">Caricamento preventivo...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  if (error || !data?.success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-off-white p-4">
        <Card className="w-full max-w-md border-terracotta shadow-lg">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
                <FileText className="w-8 h-8 text-terracotta" />
              </div>
              <div>
                <h2 className="text-xl font-playfair font-semibold text-gray-900 mb-2">Preventivo non trovato</h2>
                <p className="text-dark-sage">Il link non è valido o è scaduto.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!quote) return null;

  // Download PDF function
  const handleDownloadPDF = async () => {
    const element = document.getElementById('quote-content');
    if (!element) return;

    const opt = {
      margin: 0.5,
      filename: `Preventivo-${jobInfo?.nomeEvento || 'contratto'}-firmato.pdf`,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' as const }
    };

    try {
      await html2pdf().set(opt).from(element).save();
    } catch (error) {
      console.error('Error generating PDF:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-4 py-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Download PDF Button */}
        <div className="flex justify-end">
          <Button
            onClick={handleDownloadPDF}
            className="bg-blue-gray hover:bg-blue-gray/90 text-white shadow-lg"
            data-testid="download-pdf-button"
          >
            <Download className="w-4 h-4 mr-2" />
            Scarica PDF
          </Button>
        </div>

        {/* Wrapper per contenuto PDF */}
        <div id="quote-content">
          {/* Header Hero con logo */}
          <Card className="overflow-hidden border-sage/20 shadow-lg bg-gradient-to-br from-off-white to-light-mint">
            <CardHeader className="relative text-center py-8 sm:py-12 px-6">
              <div className="space-y-4">
              {/* Logo Studio */}
              {studioLogo && (
                <div className="flex justify-center mb-6">
                  <div className="p-3 bg-white rounded-2xl shadow-md">
                    <img 
                      src={studioLogo} 
                      alt="Studio Logo" 
                      className="h-12 sm:h-16 w-auto object-contain"
                    />
                  </div>
                </div>
              )}
              
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

        {/* Success Banner */}
        <Card className="border-sage bg-light-mint shadow-md">
          <CardContent className="pt-4 sm:pt-6 px-4 sm:px-6">
            <div className="flex items-start sm:items-center gap-3 sm:gap-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-sage flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg sm:text-xl font-playfair font-bold text-dark-sage mb-1">Contratto Firmato con Successo</h2>
                <p className="text-sm sm:text-base text-dark-sage">
                  Il preventivo per <strong>{jobInfo?.nomeEvento || 'il tuo evento'}</strong> è stato firmato il {formatDate(quote.signedAt)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Dettagli Evento */}
        {jobInfo && (
          <Card className="border-sage/20 bg-gradient-to-br from-white to-light-mint/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg text-blue-gray font-playfair">
                <Calendar className="w-5 h-5 text-sage" />
                Dettagli Evento
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Data */}
              <div className="grid md:grid-cols-2 gap-4">
                {jobInfo.eventDate && (
                  <div className="flex items-start gap-3">
                    <Calendar className="w-5 h-5 text-gray-500 mt-0.5" />
                    <div>
                      <p className="text-sm text-gray-600">Data Evento</p>
                      <p className="font-semibold">{formatDate(jobInfo.eventDate)}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Location */}
              {jobInfo.location && (
                <div className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-gray-500 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-600">Location Evento</p>
                    <p className="font-semibold">{jobInfo.location}</p>
                  </div>
                </div>
              )}

              {/* Rito */}
              {jobInfo.rito && (
                <div className="flex items-start gap-3">
                  <Calendar className="w-5 h-5 text-gray-500 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-600">Rito</p>
                    <p className="font-semibold">{jobInfo.rito}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Informazioni Clienti */}
        <Card className="border-sage/20 bg-gradient-to-br from-white to-light-mint/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-blue-gray font-playfair">
              <User className="w-5 h-5 text-sage" />
              Informazioni Clienti
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              {clientiInfo.map((cliente, idx) => {
                const appuntamento = appuntamentiClienti.find(a => a.clienteId === cliente.id);
                return (
                <div 
                  key={cliente.id} 
                  className="p-4 border-2 border-beige rounded-lg bg-white space-y-3"
                  data-testid={`client-card-${idx}`}
                >
                  {clientiInfo.length > 1 && (
                    <h3 className="text-sm font-semibold text-dark-sage uppercase tracking-wide mb-3">
                      Cliente {idx + 1}
                    </h3>
                  )}
                  
                  <div className="flex items-center gap-3 p-2 bg-off-white rounded">
                    <User className="w-4 h-4 text-sage flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-600">Nome Completo</p>
                      <p className="font-semibold text-gray-900 truncate">{cliente.nome} {cliente.cognome}</p>
                    </div>
                  </div>

                  {/* Appuntamento */}
                  {appuntamento?.orarioAppuntamento && (
                    <div className="flex items-center gap-3 p-2 bg-sage/10 rounded border border-sage/20">
                      <Calendar className="w-4 h-4 text-sage flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-sage font-semibold uppercase">Appuntamento</p>
                        <p className="font-bold text-blue-gray">{appuntamento.orarioAppuntamento}</p>
                        {appuntamento.noteAppuntamento && (
                          <p className="text-xs text-dark-sage mt-0.5">{appuntamento.noteAppuntamento}</p>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {cliente.email && (
                    <div className="flex items-center gap-3 p-2 bg-off-white rounded">
                      <Mail className="w-4 h-4 text-sage flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-600">Email</p>
                        <p className="font-medium text-gray-900 text-sm break-all">{cliente.email}</p>
                      </div>
                    </div>
                  )}
                  
                  {cliente.telefono && (
                    <div className="flex items-center gap-3 p-2 bg-off-white rounded">
                      <Phone className="w-4 h-4 text-sage flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-600">Telefono</p>
                        <p className="font-medium text-gray-900">{cliente.telefono}</p>
                      </div>
                    </div>
                  )}

                  {(cliente.indirizzo || cliente.citta || cliente.cap || cliente.provincia) && (() => {
                    const fullAddress = [
                      cliente.indirizzo,
                      [cliente.cap, cliente.citta].filter(Boolean).join(' '),
                      cliente.provincia,
                    ].filter(Boolean).join(', ');
                    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`;
                    return (
                      <a
                        href={mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 p-2 bg-off-white rounded hover:bg-mint/30 transition-colors group"
                        data-testid="link-cliente-address-maps"
                        title="Apri in Google Maps"
                      >
                        <MapPin className="w-4 h-4 text-sage flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-600 flex items-center gap-1">
                            Indirizzo
                            <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </p>
                          <p className="font-medium text-gray-900 text-sm group-hover:text-sage transition-colors">
                            {cliente.indirizzo && <>{cliente.indirizzo}<br /></>}
                            {(cliente.citta || cliente.cap || cliente.provincia) && (
                              <>
                                {cliente.cap ? `${cliente.cap} ` : ''}
                                {cliente.citta}
                                {cliente.provincia && ` (${cliente.provincia})`}
                              </>
                            )}
                          </p>
                        </div>
                      </a>
                    );
                  })()}
                </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Prodotti Selezionati */}
        <Card className="border-beige shadow-md">
          <CardHeader className="bg-cream border-b border-beige pb-3 sm:pb-4">
            <CardTitle className="flex items-center gap-2 sm:gap-3 text-lg sm:text-xl font-playfair font-bold text-dark-sage">
              <div className="p-2 sm:p-3 bg-mint rounded-full">
                <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-blue-gray" />
              </div>
              Prodotti e Servizi Inclusi
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 sm:pt-6 px-3 sm:px-6">
            <div className="space-y-3 sm:space-y-4">
              {(() => {
                // Fix legacy: prodotti senza 'selected' definito in preventivi firmati → considerali selezionati
                const filteredProducts = (quote.products ?? []).filter(p => 
                  quote.type === 'fisso' || 
                  p.selected === true || 
                  (p.selected === undefined && quote.status === 'firmato')
                );
                const allPricesZero = filteredProducts.every(p => !p.prezzo || p.prezzo === 0);
                const shouldShowTotalAsPrice = allPricesZero && filteredProducts.length === 1 && displayTotal > 0;
                
                return filteredProducts.map((product, idx) => (
                  <div 
                    key={idx} 
                    className="flex flex-col sm:flex-row sm:items-start sm:justify-between p-4 sm:p-5 bg-off-white rounded-xl border-2 border-beige hover:border-sage hover:shadow-md transition-all gap-3 sm:gap-4"
                    data-testid={`product-item-${idx}`}
                  >
                    {/* Product Image */}
                    <div className="flex-shrink-0">
                      <img 
                        src={product.immagini && product.immagini.length > 0 ? product.immagini[0] : placeholderUrl} 
                        alt={product.nome}
                        className="w-20 h-20 sm:w-24 sm:h-24 object-cover rounded-lg border-2 border-mint/30 shadow-sm"
                      />
                    </div>
                    
                    <div className="flex items-start gap-3 sm:gap-4 flex-1">
                      <div className="p-2 sm:p-3 bg-sage/20 rounded-full flex-shrink-0">
                        <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-sage" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-playfair font-bold text-gray-900 text-base sm:text-lg mb-1 sm:mb-2">{product.nome}</h4>
                        {product.isOmaggio && (
                          <div className="flex items-center gap-1 text-sm font-semibold text-rose-600 mb-2">🎁 In omaggio</div>
                        )}
                        {product.descrizione && (
                          <p className="text-xs sm:text-sm text-dark-sage mb-2 leading-relaxed whitespace-pre-wrap">{product.descrizione}</p>
                        )}
                        {product.numeroFoto && (
                          <div className="flex items-center gap-2 text-xs sm:text-sm text-blue-gray bg-mint/30 px-2 sm:px-3 py-1 rounded-full w-fit">
                            <Calendar className="w-3 h-3 sm:w-4 sm:h-4" />
                            <span className="font-medium">{product.numeroFoto} foto incluse</span>
                          </div>
                        )}
                        {/* Omaggio indicator */}
                        {product.isOmaggio && (
                          <div className="flex items-center gap-2 text-xs sm:text-sm text-rose-700 bg-rose-50 px-2 sm:px-3 py-1 rounded-full w-fit mt-2">
                            <span>🎁</span>
                            <span className="font-medium">Omaggio</span>
                          </div>
                        )}
                        {/* Bundle indicator and items */}
                        {product.isBundle && (
                          <div className="flex items-center gap-2 text-xs sm:text-sm text-amber-700 bg-amber-50 px-2 sm:px-3 py-1 rounded-full w-fit mt-2">
                            <span>📦</span>
                            <span className="font-medium">Pacchetto</span>
                          </div>
                        )}
                        {product.isBundle && product.bundleItems && product.bundleItems.length > 0 && (
                          <div className="mt-2 pl-3 border-l-2 border-amber-200 space-y-1">
                            <p className="text-xs font-medium text-amber-700">Include:</p>
                            {product.bundleItems.map((item, itemIdx) => (
                              <div key={itemIdx} className="flex items-center gap-2 text-xs text-dark-sage">
                                <span>└</span>
                                <span>{item.prodottoNome}</span>
                                {item.quantita > 1 && <span className="text-gray-500">x{item.quantita}</span>}
                                {item.numeroFoto && item.numeroFoto > 0 && (
                                  <span className="text-blue-600">({item.numeroFoto} foto)</span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-left sm:text-right sm:ml-4">
                      {product.isOmaggio ? (
                        <p className="text-xl sm:text-2xl font-bold text-rose-500">🎁 Omaggio</p>
                      ) : (
                        <p className="text-xl sm:text-2xl font-bold text-blue-gray">
                          {formatCurrency(shouldShowTotalAsPrice ? displayTotal : (product.prezzo || 0))}
                        </p>
                      )}
                    </div>
                  </div>
                ));
              })()}

              <Separator className="my-4 sm:my-6" />

              {/* Totali */}
              <div className="space-y-2 sm:space-y-3 pt-2 bg-cream p-4 sm:p-5 rounded-xl border-2 border-beige">
                {quote.discountValue && (() => {
                  // Per preventivi variabili firmati: usa selectedBeforeDiscount (subtotale prodotti scelti)
                  // Per preventivi fissi: usa totalBeforeDiscount (originale)
                  const subtotaleDisplay = quote.type === 'variabile' && quote.selectedBeforeDiscount !== undefined
                    ? quote.selectedBeforeDiscount
                    : quote.totalBeforeDiscount;
                  const scontoDisplay = subtotaleDisplay - displayTotal;
                  return (
                    <>
                      <div className="flex justify-between items-center text-sm sm:text-base">
                        <span className="text-dark-sage font-medium">Subtotale</span>
                        <span className="font-semibold text-gray-800">{formatCurrency(subtotaleDisplay)}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm sm:text-base">
                        <div className="flex items-center gap-2">
                          <div className="p-1 bg-terracotta/20 rounded">
                            <CreditCard className="w-3 h-3 sm:w-4 sm:h-4 text-terracotta" />
                          </div>
                          <span className="text-terracotta font-medium">
                            Sconto {quote.discountType === 'percent' ? `(${quote.discountValue}%)` : ''}
                          </span>
                        </div>
                        <span className="font-semibold text-terracotta">-{formatCurrency(scontoDisplay)}</span>
                      </div>
                    </>
                  );
                })()}
                <Separator />
                <div className="flex justify-between items-center text-xl sm:text-2xl font-bold pt-2">
                  <span className="text-gray-800 font-playfair">Totale Contratto</span>
                  <span className="text-blue-gray">{formatCurrency(displayTotal)}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Piano Pagamenti */}
        {paymentSchedule ? (
          <Card className="border-beige shadow-lg">
            <CardHeader className="bg-cream border-b border-beige pb-3 sm:pb-4">
              <CardTitle className="flex items-center gap-2 sm:gap-3 text-lg sm:text-xl font-playfair font-bold text-dark-sage">
                <div className="p-2 sm:p-3 bg-blue-gray/20 rounded-full">
                  <CreditCard className="w-5 h-5 sm:w-6 sm:h-6 text-blue-gray" />
                </div>
                Piano Pagamenti
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 sm:pt-6 px-3 sm:px-6">
              <div className="space-y-4 sm:space-y-6">
                {/* Stats Overview */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                  <div className="text-center p-4 sm:p-5 bg-blue-gray/10 rounded-xl border-2 border-blue-gray/30 shadow-sm hover:shadow-md transition-shadow" data-testid="stat-totale">
                    <div className="flex justify-center mb-2">
                      <div className="p-2 bg-blue-gray/20 rounded-full">
                        <CreditCard className="w-4 h-4 sm:w-5 sm:h-5 text-blue-gray" />
                      </div>
                    </div>
                    <p className="text-xs text-blue-gray uppercase tracking-wider font-semibold mb-1">Importo Totale</p>
                    <p className="text-xl sm:text-2xl font-bold text-blue-gray">{formatCurrency(paymentSchedule.totale)}</p>
                  </div>
                  <div className="text-center p-4 sm:p-5 bg-sage/10 rounded-xl border-2 border-sage/30 shadow-sm hover:shadow-md transition-shadow" data-testid="stat-pagato">
                    <div className="flex justify-center mb-2">
                      <div className="p-2 bg-sage/20 rounded-full">
                        <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-sage" />
                      </div>
                    </div>
                    <p className="text-xs text-sage uppercase tracking-wider font-semibold mb-1">Già Pagato</p>
                    <p className="text-xl sm:text-2xl font-bold text-sage">{formatCurrency(paymentSchedule.totalePagato)}</p>
                  </div>
                  <div className="text-center p-4 sm:p-5 bg-terracotta/10 rounded-xl border-2 border-terracotta/30 shadow-sm hover:shadow-md transition-shadow" data-testid="stat-saldo">
                    <div className="flex justify-center mb-2">
                      <div className="p-2 bg-terracotta/20 rounded-full">
                        <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-terracotta" />
                      </div>
                    </div>
                    <p className="text-xs text-terracotta uppercase tracking-wider font-semibold mb-1">Saldo Residuo</p>
                    <p className="text-xl sm:text-2xl font-bold text-terracotta">{formatCurrency(paymentSchedule.saldoResiduo)}</p>
                  </div>
                </div>

                {/* Payments List */}
                <div className="space-y-3">
                  <h3 className="text-xs sm:text-sm font-semibold text-dark-sage uppercase tracking-wide flex items-center gap-2 mb-3">
                    <FileText className="w-4 h-4" />
                    Dettaglio Rate
                  </h3>
                  {(paymentSchedule.payments || []).map((payment, idx) => (
                    <div 
                      key={payment.id} 
                      className="flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:p-5 bg-off-white rounded-xl border-2 border-beige hover:border-sage hover:shadow-md transition-all gap-3 sm:gap-4"
                      data-testid={`payment-item-${idx}`}
                    >
                      <div className="flex items-start gap-3 sm:gap-4 flex-1">
                        <div className="p-2 sm:p-3 bg-mint rounded-full flex-shrink-0">
                          <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-blue-gray" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-playfair font-bold text-gray-900 capitalize text-base sm:text-lg mb-1">
                            {payment.tipo} {idx + 1}
                          </p>
                          <div className="flex items-center gap-2 text-xs sm:text-sm text-dark-sage mb-1">
                            <Calendar className="w-3 h-3 sm:w-4 sm:h-4 text-dark-sage/60" />
                            <span className="font-medium">Scadenza:</span>
                            <span className="font-semibold text-gray-800">{formatDate(payment.dataScadenza)}</span>
                          </div>
                          {payment.note && (
                            <p className="text-xs text-dark-sage/80 mt-2 italic bg-beige/30 p-2 rounded">{payment.note}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4">
                        <div className="text-left sm:text-right">
                          <p className="text-xl sm:text-2xl font-bold text-gray-900">{formatCurrency(payment.importo)}</p>
                          {payment.dataPagamento && (
                            <div className="flex items-center gap-1 text-xs text-sage mt-1">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Pagato il {formatDate(payment.dataPagamento)}</span>
                            </div>
                          )}
                        </div>
                        {getPaymentStatusBadge(payment.stato)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          /* Fallback: mostra riepilogo economico quando non c'è payment schedule */
          <Card className="border-beige shadow-lg">
            <CardHeader className="bg-cream border-b border-beige pb-3 sm:pb-4">
              <CardTitle className="flex items-center gap-2 sm:gap-3 text-lg sm:text-xl font-playfair font-bold text-dark-sage">
                <div className="p-2 sm:p-3 bg-blue-gray/20 rounded-full">
                  <CreditCard className="w-5 h-5 sm:w-6 sm:h-6 text-blue-gray" />
                </div>
                Riepilogo Economico
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 sm:pt-6 px-3 sm:px-6">
              <div className="space-y-4">
                {/* Dettaglio importi */}
                {quote.discountValue && quote.discountValue > 0 && (
                  <div className="flex justify-between items-center p-3 bg-off-white rounded-lg border border-beige">
                    <span className="text-sm text-dark-sage">Subtotale</span>
                    <span className="font-semibold text-gray-800">{formatCurrency(quote.totalBeforeDiscount)}</span>
                  </div>
                )}
                {quote.discountValue && quote.discountValue > 0 && (
                  <div className="flex justify-between items-center p-3 bg-terracotta/10 rounded-lg border border-terracotta/30">
                    <span className="text-sm text-terracotta flex items-center gap-2">
                      <CreditCard className="w-4 h-4" />
                      Sconto {quote.discountType === 'percent' ? `(${quote.discountValue}%)` : ''}
                    </span>
                    <span className="font-semibold text-terracotta">-{formatCurrency(quote.totalBeforeDiscount - quote.totalAfterDiscount)}</span>
                  </div>
                )}
                
                {/* Dati legacy ordine - Acconto/Saldo */}
                {legacyOrderData && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mt-4">
                    <div className="text-center p-4 sm:p-5 bg-blue-gray/10 rounded-xl border-2 border-blue-gray/30">
                      <p className="text-xs text-blue-gray uppercase tracking-wider font-semibold mb-1">Totale</p>
                      <p className="text-xl sm:text-2xl font-bold text-blue-gray">{formatCurrency(legacyOrderData.totale ?? quote.totalAfterDiscount ?? 0)}</p>
                    </div>
                    <div className="text-center p-4 sm:p-5 bg-sage/10 rounded-xl border-2 border-sage/30">
                      <div className="flex justify-center mb-2">
                        <div className="p-2 bg-sage/20 rounded-full">
                          <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-sage" />
                        </div>
                      </div>
                      <p className="text-xs text-sage uppercase tracking-wider font-semibold mb-1">Acconto Versato</p>
                      <p className="text-xl sm:text-2xl font-bold text-sage">{formatCurrency(legacyOrderData.acconto ?? 0)}</p>
                    </div>
                    <div className="text-center p-4 sm:p-5 bg-terracotta/10 rounded-xl border-2 border-terracotta/30">
                      <div className="flex justify-center mb-2">
                        <div className="p-2 bg-terracotta/20 rounded-full">
                          <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-terracotta" />
                        </div>
                      </div>
                      <p className="text-xs text-terracotta uppercase tracking-wider font-semibold mb-1">Saldo Residuo</p>
                      <p className="text-xl sm:text-2xl font-bold text-terracotta">{formatCurrency(legacyOrderData.saldo ?? 0)}</p>
                    </div>
                  </div>
                )}

                {/* Totale finale - Solo se non ci sono dati legacy */}
                {!legacyOrderData && (
                  <div className="text-center p-6 sm:p-8 bg-blue-gray/10 rounded-xl border-2 border-blue-gray/30">
                    <div className="flex justify-center mb-4">
                      <div className="p-3 bg-blue-gray/20 rounded-full">
                        <CreditCard className="w-6 h-6 sm:w-8 sm:h-8 text-blue-gray" />
                      </div>
                    </div>
                    <p className="text-sm text-blue-gray uppercase tracking-wider font-semibold mb-2">Totale Contratto</p>
                    <p className="text-3xl sm:text-4xl font-bold text-blue-gray">{formatCurrency(displayTotal)}</p>
                    <p className="text-sm text-dark-sage/70 mt-4">
                      Per i dettagli sulle modalità di pagamento, contattare lo studio.
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Firma Digitale */}
        {quote.signature && (
          <>
            <Separator className="my-8" />
            <Card className="border-sage/30 bg-gradient-to-br from-white to-sage/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg text-blue-gray font-playfair">
                  <FileText className="w-5 h-5 text-sage" />
                  Firma Digitale
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 p-3 bg-sage/10 rounded-lg">
                    <div className="p-2 bg-sage/20 rounded-full flex-shrink-0">
                      <CheckCircle2 className="w-4 h-4 text-sage" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-sage uppercase tracking-wide">Firmato da</p>
                      <p className="font-semibold text-gray-900 truncate">{quote.signature.clientName}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-blue-gray/10 rounded-lg">
                    <div className="p-2 bg-blue-gray/20 rounded-full flex-shrink-0">
                      <Calendar className="w-4 h-4 text-blue-gray" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-blue-gray uppercase tracking-wide">Data Firma</p>
                      <p className="font-semibold text-gray-900">{formatDate(quote.signature.signedAt)}</p>
                    </div>
                  </div>
                </div>
                <div className="p-8 bg-gradient-to-br from-white to-sage/5 rounded-lg border-2 border-sage/30">
                  <p className="text-sm text-dark-sage mb-4 font-medium flex items-center justify-center gap-2">
                    <FileText className="w-4 h-4" />
                    Firma Digitale
                  </p>
                  <p 
                    className="text-5xl text-sage text-center" 
                    style={{ fontFamily: "'Great Vibes', cursive" }}
                    data-testid="signature-text"
                  >
                    {quote.signature.clientName}
                  </p>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* Clausole Contrattuali */}
        <Card className="border-beige">
          <CardHeader className="bg-cream border-b border-beige pb-3 sm:pb-4">
            <CardTitle className="flex items-center gap-2 text-sm sm:text-base font-playfair text-dark-sage">
              <FileText className="w-4 h-4" />
              Clausole Contrattuali Accettate
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 sm:pt-6 px-3 sm:px-6">
            <div className="space-y-2 sm:space-y-3">
              {quote.contractClauses.filter(c => c.accepted).map((clause) => (
                <div key={clause.id} className="flex items-start gap-2 sm:gap-3 p-3 bg-off-white rounded-lg" data-testid={`clause-${clause.id}`}>
                  <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-sage mt-0.5 flex-shrink-0" />
                  <p className="text-xs sm:text-sm text-dark-sage leading-relaxed" dangerouslySetInnerHTML={{ __html: clause.text }} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        {quote.theme?.footerText && (
          <Card className="bg-cream border-beige shadow-sm">
            <CardContent className="pt-4 sm:pt-6 px-4 sm:px-6 text-center">
              <p className="text-xs sm:text-sm text-dark-sage leading-relaxed" dangerouslySetInnerHTML={{ __html: quote.theme.footerText }} />
            </CardContent>
          </Card>
        )}
        </div>

        {/* Studio Info */}
        <div className="text-center pb-4 sm:pb-6">
          <Card className="bg-blue-gray text-white shadow-xl">
            <CardContent className="py-6 sm:py-8 px-4 sm:px-6">
              <div className="space-y-3 sm:space-y-4">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
                  <p className="text-base sm:text-lg font-playfair font-semibold">© {new Date().getFullYear()} Image Studio</p>
                </div>
                <p className="text-xs sm:text-sm text-mint/80">Tutti i diritti riservati</p>
                <Separator className="bg-sage/30 my-3 sm:my-4" />
                <div className="flex flex-col items-center gap-2 sm:gap-3">
                  <p className="text-xs sm:text-sm text-mint/80 font-medium">Hai bisogno di assistenza?</p>
                  {studioSettings?.phone && (
                    <a 
                      href={`https://wa.me/${formatPhoneForWhatsApp(studioSettings.phone)}?text=${encodeURIComponent(`Ciao, ho bisogno di assistenza per il mio contratto: ${window.location.href}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-3 bg-[#25D366] text-white rounded-full text-sm sm:text-base font-semibold hover:bg-[#20BD5A] transition-colors shadow-lg"
                      data-testid="whatsapp-contact-button"
                    >
                      <Phone className="w-4 h-4" />
                      <span>Contattaci su WhatsApp</span>
                    </a>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
