
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
import { Loader2, CheckCircle2, FileText, Calendar, CreditCard, User, Mail, Phone, MapPin } from 'lucide-react';
import type { Quote, QuoteSignature } from '@shared/quotes-types';
import type { PaymentSchedule } from '@shared/payment-schedule-types';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

interface QuoteSignedPortalData {
  quote: Quote & { signedAt?: any };
  paymentSchedule: PaymentSchedule | null;
  jobInfo: {
    nomeEvento?: string;
    eventDate?: any;
    rito?: string;
    location?: string;
  } | null;
  clienteInfo: {
    nome?: string;
    cognome?: string;
    email?: string;
    telefono?: string;
    indirizzo?: string;
    citta?: string;
    cap?: string;
  } | null;
}

export default function QuoteSignedPortalPage() {
  const params = useParams();
  const token = params.token;
  const [studioSettings, setStudioSettings] = useState<{ phone?: string } | null>(null);

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
  const jobInfo = portalData?.jobInfo;
  const clienteInfo = portalData?.clienteInfo;

  // Load studio settings
  useEffect(() => {
    async function loadStudioSettings() {
      try {
        const settingsDoc = await getDoc(doc(db, 'settings', 'studio'));
        if (settingsDoc.exists()) {
          setStudioSettings(settingsDoc.data());
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

  return (
    <div className="min-h-screen bg-off-white py-4 sm:py-8 px-3 sm:px-4">
      <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">
        {/* Header Hero */}
        {quote.theme?.headerImage && (
          <div className="w-full h-32 sm:h-48 rounded-lg overflow-hidden shadow-lg">
            <img 
              src={quote.theme.headerImage} 
              alt="Header" 
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Contratto Firmato Success */}
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

        {/* Cliente & Signature Info */}
        <div className="grid md:grid-cols-2 gap-4 sm:gap-6">
          <Card className="border-beige shadow-md hover:shadow-lg transition-shadow">
            <CardHeader className="bg-cream border-b border-beige pb-3 sm:pb-4">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg font-playfair font-semibold text-dark-sage">
                <div className="p-2 bg-mint rounded-full">
                  <User className="w-4 h-4 sm:w-5 sm:h-5 text-blue-gray" />
                </div>
                Informazioni Cliente
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 sm:space-y-4 pt-4 sm:pt-6 px-4 sm:px-6">
              {clienteInfo && (
                <>
                  <div className="flex items-center gap-3 p-3 bg-off-white rounded-lg hover:bg-light-mint transition-colors">
                    <div className="p-2 bg-mint rounded-full flex-shrink-0">
                      <User className="w-4 h-4 text-blue-gray" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-dark-sage uppercase tracking-wide">Nome Completo</p>
                      <p className="font-semibold text-gray-900 truncate">{clienteInfo.nome} {clienteInfo.cognome}</p>
                    </div>
                  </div>
                  {clienteInfo.email && (
                    <div className="flex items-center gap-3 p-3 bg-off-white rounded-lg hover:bg-light-mint transition-colors">
                      <div className="p-2 bg-mint rounded-full flex-shrink-0">
                        <Mail className="w-4 h-4 text-blue-gray" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-dark-sage uppercase tracking-wide">Email</p>
                        <p className="font-medium text-gray-900 text-sm break-all">{clienteInfo.email}</p>
                      </div>
                    </div>
                  )}
                  {clienteInfo.telefono && (
                    <div className="flex items-center gap-3 p-3 bg-off-white rounded-lg hover:bg-light-mint transition-colors">
                      <div className="p-2 bg-mint rounded-full flex-shrink-0">
                        <Phone className="w-4 h-4 text-blue-gray" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-dark-sage uppercase tracking-wide">Telefono</p>
                        <p className="font-medium text-gray-900">{clienteInfo.telefono}</p>
                      </div>
                    </div>
                  )}

                  {(clienteInfo.indirizzo || clienteInfo.citta || clienteInfo.cap) && (
                    <div className="flex items-center gap-3 p-3 bg-off-white rounded-lg hover:bg-light-mint transition-colors">
                      <div className="p-2 bg-mint rounded-full flex-shrink-0">
                        <MapPin className="w-4 h-4 text-blue-gray" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-dark-sage uppercase tracking-wide">Indirizzo</p>
                        <p className="font-medium text-gray-900">
                          {clienteInfo.indirizzo && <>{clienteInfo.indirizzo}<br /></>}
                          {(clienteInfo.citta || clienteInfo.cap) && (
                            <>
                              {clienteInfo.cap ? `${clienteInfo.cap} ` : ''}
                              {clienteInfo.citta}
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                  )}
                </>
              )}
              {jobInfo?.eventDate && (
                <div className="flex items-center gap-3 p-3 bg-terracotta/10 rounded-lg border border-terracotta/30">
                  <div className="p-2 bg-terracotta/20 rounded-full flex-shrink-0">
                    <Calendar className="w-4 h-4 text-terracotta" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-terracotta uppercase tracking-wide font-medium">Data Evento</p>
                    <p className="font-bold text-terracotta text-base sm:text-lg">{formatDate(jobInfo.eventDate)}</p>
                  </div>
                </div>
              )}
              {jobInfo?.location && (
                <div className="flex items-center gap-3 p-3 bg-off-white rounded-lg hover:bg-light-mint transition-colors">
                  <div className="p-2 bg-mint rounded-full flex-shrink-0">
                    <MapPin className="w-4 h-4 text-blue-gray" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-dark-sage uppercase tracking-wide">Location</p>
                    <p className="font-medium text-gray-900">{jobInfo.location}</p>
                  </div>
                </div>
              )}
              {jobInfo?.rito && (
                <div className="flex items-center gap-3 p-3 bg-off-white rounded-lg hover:bg-light-mint transition-colors">
                  <div className="p-2 bg-mint rounded-full flex-shrink-0">
                    <Calendar className="w-4 h-4 text-blue-gray" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-dark-sage uppercase tracking-wide">Rito</p>
                    <p className="font-medium text-gray-900">{jobInfo.rito}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-beige shadow-md hover:shadow-lg transition-shadow">
            <CardHeader className="bg-cream border-b border-beige pb-3 sm:pb-4">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg font-playfair font-semibold text-dark-sage">
                <div className="p-2 bg-sage/20 rounded-full">
                  <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-sage" />
                </div>
                Firma Digitale
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 sm:pt-6 px-4 sm:px-6">
              {quote.signature && (
                <div className="space-y-3 sm:space-y-4">
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
                  {quote.signature.imageUrl && (
                    <div className="mt-4 p-3 sm:p-4 bg-off-white rounded-lg border-2 border-dashed border-beige">
                      <p className="text-xs sm:text-sm text-dark-sage mb-3 font-medium flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        Firma Autografa:
                      </p>
                      <img 
                        src={quote.signature.imageUrl} 
                        alt="Firma digitale" 
                        className="max-h-20 sm:max-h-28 mx-auto border-2 border-beige rounded-lg shadow-sm bg-white p-2"
                        data-testid="signature-image"
                      />
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

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
              {quote.products.filter(p => quote.type === 'fisso' || p.selected).map((product, idx) => (
                <div 
                  key={idx} 
                  className="flex flex-col sm:flex-row sm:items-start sm:justify-between p-4 sm:p-5 bg-off-white rounded-xl border-2 border-beige hover:border-sage hover:shadow-md transition-all gap-3 sm:gap-4"
                  data-testid={`product-item-${idx}`}
                >
                  <div className="flex items-start gap-3 sm:gap-4 flex-1">
                    <div className="p-2 sm:p-3 bg-sage/20 rounded-full flex-shrink-0">
                      <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-sage" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-playfair font-bold text-gray-900 text-base sm:text-lg mb-1 sm:mb-2">{product.nome}</h4>
                      {product.descrizione && (
                        <p className="text-xs sm:text-sm text-dark-sage mb-2 leading-relaxed">{product.descrizione}</p>
                      )}
                      {product.numeroFoto && (
                        <div className="flex items-center gap-2 text-xs sm:text-sm text-blue-gray bg-mint/30 px-2 sm:px-3 py-1 rounded-full w-fit">
                          <Calendar className="w-3 h-3 sm:w-4 sm:h-4" />
                          <span className="font-medium">{product.numeroFoto} foto incluse</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-left sm:text-right sm:ml-4">
                    <p className="text-xl sm:text-2xl font-bold text-blue-gray">{formatCurrency(product.prezzo)}</p>
                  </div>
                </div>
              ))}

              <Separator className="my-4 sm:my-6" />

              {/* Totali */}
              <div className="space-y-2 sm:space-y-3 pt-2 bg-cream p-4 sm:p-5 rounded-xl border-2 border-beige">
                {quote.discountValue && (
                  <>
                    <div className="flex justify-between items-center text-sm sm:text-base">
                      <span className="text-dark-sage font-medium">Subtotale</span>
                      <span className="font-semibold text-gray-800">{formatCurrency(quote.totalBeforeDiscount)}</span>
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
                      <span className="font-semibold text-terracotta">-{formatCurrency(quote.totalBeforeDiscount - quote.totalAfterDiscount)}</span>
                    </div>
                  </>
                )}
                <Separator />
                <div className="flex justify-between items-center text-xl sm:text-2xl font-bold pt-2">
                  <span className="text-gray-800 font-playfair">Totale Contratto</span>
                  <span className="text-blue-gray">{formatCurrency(quote.totalAfterDiscount)}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Piano Pagamenti */}
        {paymentSchedule && (
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
                      href={`https://wa.me/${studioSettings.phone.replace(/\s+/g, '').replace(/^\+/, '')}?text=${encodeURIComponent(`Ciao, ho bisogno di assistenza per il mio contratto: ${window.location.href}`)}`}
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
