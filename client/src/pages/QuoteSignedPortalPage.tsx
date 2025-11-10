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
import { Loader2, CheckCircle2, FileText, Calendar, CreditCard, User } from 'lucide-react';
import type { Quote, QuoteSignature } from '@shared/quotes-types';
import type { PaymentSchedule } from '@shared/payment-schedule-types';

interface QuoteSignedPortalData {
  quote: Quote & { signedAt?: any };
  paymentSchedule: PaymentSchedule | null;
  jobInfo: { nomeEvento?: string; eventDate?: any } | null;
  clienteInfo: { nome?: string; cognome?: string; email?: string } | null;
}

export default function QuoteSignedPortalPage() {
  const params = useParams();
  const token = params.token;

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
    refetchInterval: 30000, // Real-time updates ogni 30s
  });

  const portalData = data?.data;
  const quote = portalData?.quote;
  const paymentSchedule = portalData?.paymentSchedule;
  const jobInfo = portalData?.jobInfo;
  const clienteInfo = portalData?.clienteInfo;

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

  const getPaymentStatusBadge = (stato: string) => {
    switch (stato) {
      case 'pagato':
        return <Badge className="bg-green-100 text-green-800">✓ Pagato</Badge>;
      case 'parziale':
        return <Badge className="bg-yellow-100 text-yellow-800">⚡ Parziale</Badge>;
      case 'atteso':
        return <Badge className="bg-gray-100 text-gray-800">⏳ In attesa</Badge>;
      case 'scaduto':
        return <Badge className="bg-red-100 text-red-800">⚠️ Scaduto</Badge>;
      default:
        return <Badge variant="outline">{stato}</Badge>;
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50">
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
  if (error || !data?.success) {
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

  if (!quote) return null;

  return (
    <div 
      className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 py-8 px-4"
      style={{
        background: `linear-gradient(135deg, ${quote.theme?.primaryColor}15 0%, ${quote.theme?.secondaryColor}15 100%)`
      }}
    >
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header Hero */}
        {quote.theme?.headerImage && (
          <div className="w-full h-48 rounded-lg overflow-hidden shadow-lg">
            <img 
              src={quote.theme.headerImage} 
              alt="Header" 
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Contratto Firmato Success */}
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-6 h-6 text-green-600" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold text-green-900">Contratto Firmato con Successo</h2>
                <p className="text-green-700">
                  Il preventivo per <strong>{jobInfo?.nomeEvento || 'il tuo evento'}</strong> è stato firmato il {formatDate(quote.signedAt)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cliente & Signature Info - Design Elegante */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card className="border-blue-200 shadow-md hover:shadow-lg transition-shadow">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b">
              <CardTitle className="flex items-center gap-2 text-lg font-semibold text-gray-800">
                <div className="p-2 bg-blue-100 rounded-full">
                  <User className="w-5 h-5 text-blue-600" />
                </div>
                Informazioni Cliente
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              {clienteInfo && (
                <>
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                    <div className="p-2 bg-purple-100 rounded-full">
                      <User className="w-4 h-4 text-purple-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Nome Completo</p>
                      <p className="font-semibold text-gray-900">{clienteInfo.nome} {clienteInfo.cognome}</p>
                    </div>
                  </div>
                  {clienteInfo.email && (
                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                      <div className="p-2 bg-blue-100 rounded-full">
                        <CreditCard className="w-4 h-4 text-blue-600" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Email</p>
                        <p className="font-medium text-gray-900 break-all">{clienteInfo.email}</p>
                      </div>
                    </div>
                  )}
                </>
              )}
              {jobInfo?.eventDate && (
                <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-pink-50 to-rose-50 rounded-lg border border-pink-200">
                  <div className="p-2 bg-pink-100 rounded-full">
                    <Calendar className="w-4 h-4 text-pink-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-pink-600 uppercase tracking-wide font-medium">Data Evento</p>
                    <p className="font-bold text-pink-800 text-lg">{formatDate(jobInfo.eventDate)}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-green-200 shadow-md hover:shadow-lg transition-shadow">
            <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50 border-b">
              <CardTitle className="flex items-center gap-2 text-lg font-semibold text-gray-800">
                <div className="p-2 bg-green-100 rounded-full">
                  <FileText className="w-5 h-5 text-green-600" />
                </div>
                Firma Digitale
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              {quote.signature && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
                    <div className="p-2 bg-green-100 rounded-full">
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-green-600 uppercase tracking-wide">Firmato da</p>
                      <p className="font-semibold text-gray-900">{quote.signature.clientName}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                    <div className="p-2 bg-blue-100 rounded-full">
                      <Calendar className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-blue-600 uppercase tracking-wide">Data Firma</p>
                      <p className="font-semibold text-gray-900">{formatDate(quote.signature.signedAt)}</p>
                    </div>
                  </div>
                  {quote.signature.imageUrl && (
                    <div className="mt-4 p-4 bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg border-2 border-dashed border-gray-300">
                      <p className="text-sm text-gray-600 mb-3 font-medium flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        Firma Autografa:
                      </p>
                      <img 
                        src={quote.signature.imageUrl} 
                        alt="Firma digitale" 
                        className="max-h-28 mx-auto border-2 border-gray-300 rounded-lg shadow-sm bg-white p-2"
                        data-testid="signature-image"
                      />
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Prodotti Selezionati - Design Elegante */}
        <Card className="border-purple-200 shadow-md">
          <CardHeader className="bg-gradient-to-r from-purple-50 to-pink-50 border-b">
            <CardTitle className="flex items-center gap-3 text-xl font-bold text-gray-800">
              <div className="p-3 bg-purple-100 rounded-full">
                <FileText className="w-6 h-6 text-purple-600" />
              </div>
              Prodotti e Servizi Inclusi
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {quote.products.filter(p => quote.type === 'fisso' || p.selected).map((product, idx) => (
                <div 
                  key={idx} 
                  className="flex items-start justify-between p-5 bg-gradient-to-r from-white to-gray-50 rounded-xl border-2 border-gray-200 hover:border-purple-300 hover:shadow-md transition-all"
                  data-testid={`product-item-${idx}`}
                >
                  <div className="flex items-start gap-4 flex-1">
                    <div className="p-3 bg-purple-100 rounded-full flex-shrink-0">
                      <CheckCircle2 className="w-5 h-5 text-purple-600" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-bold text-gray-900 text-lg mb-2">{product.nome}</h4>
                      {product.descrizione && (
                        <p className="text-sm text-gray-600 mb-2 leading-relaxed">{product.descrizione}</p>
                      )}
                      {product.numeroFoto && (
                        <div className="flex items-center gap-2 text-sm text-purple-600 bg-purple-50 px-3 py-1 rounded-full w-fit">
                          <Calendar className="w-4 h-4" />
                          <span className="font-medium">{product.numeroFoto} foto incluse</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-right ml-4">
                    <p className="text-2xl font-bold text-purple-700">{formatCurrency(product.prezzo)}</p>
                  </div>
                </div>
              ))}

              <Separator className="my-6" />

              {/* Totali - Design Migliorato */}
              <div className="space-y-3 pt-2 bg-gradient-to-r from-blue-50 to-indigo-50 p-5 rounded-xl border-2 border-blue-200">
                {quote.discountValue && (
                  <>
                    <div className="flex justify-between items-center text-base">
                      <span className="text-gray-600 font-medium">Subtotale</span>
                      <span className="font-semibold text-gray-800">{formatCurrency(quote.totalBeforeDiscount)}</span>
                    </div>
                    <div className="flex justify-between items-center text-base">
                      <div className="flex items-center gap-2">
                        <div className="p-1 bg-orange-100 rounded">
                          <CreditCard className="w-4 h-4 text-orange-600" />
                        </div>
                        <span className="text-orange-600 font-medium">
                          Sconto {quote.discountType === 'percent' ? `(${quote.discountValue}%)` : ''}
                        </span>
                      </div>
                      <span className="font-semibold text-orange-600">-{formatCurrency(quote.totalBeforeDiscount - quote.totalAfterDiscount)}</span>
                    </div>
                  </>
                )}
                <Separator />
                <div className="flex justify-between items-center text-2xl font-bold pt-2">
                  <span className="text-gray-800">Totale Contratto</span>
                  <span className="text-blue-700">{formatCurrency(quote.totalAfterDiscount)}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Piano Pagamenti - Design Elegante */}
        {paymentSchedule && (
          <Card className="border-indigo-200 shadow-lg">
            <CardHeader className="bg-gradient-to-r from-indigo-50 via-purple-50 to-pink-50 border-b">
              <CardTitle className="flex items-center gap-3 text-xl font-bold text-gray-800">
                <div className="p-3 bg-indigo-100 rounded-full">
                  <CreditCard className="w-6 h-6 text-indigo-600" />
                </div>
                Piano Pagamenti
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-6">
                {/* Stats Overview - Design Migliorato */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center p-5 bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl border-2 border-blue-200 shadow-sm hover:shadow-md transition-shadow" data-testid="stat-totale">
                    <div className="flex justify-center mb-2">
                      <div className="p-2 bg-blue-200 rounded-full">
                        <CreditCard className="w-5 h-5 text-blue-700" />
                      </div>
                    </div>
                    <p className="text-xs text-blue-600 uppercase tracking-wider font-semibold mb-1">Importo Totale</p>
                    <p className="text-2xl font-bold text-blue-700">{formatCurrency(paymentSchedule.totale)}</p>
                  </div>
                  <div className="text-center p-5 bg-gradient-to-br from-green-50 to-green-100 rounded-xl border-2 border-green-200 shadow-sm hover:shadow-md transition-shadow" data-testid="stat-pagato">
                    <div className="flex justify-center mb-2">
                      <div className="p-2 bg-green-200 rounded-full">
                        <CheckCircle2 className="w-5 h-5 text-green-700" />
                      </div>
                    </div>
                    <p className="text-xs text-green-600 uppercase tracking-wider font-semibold mb-1">Già Pagato</p>
                    <p className="text-2xl font-bold text-green-700">{formatCurrency(paymentSchedule.totalePagato)}</p>
                  </div>
                  <div className="text-center p-5 bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl border-2 border-orange-200 shadow-sm hover:shadow-md transition-shadow" data-testid="stat-saldo">
                    <div className="flex justify-center mb-2">
                      <div className="p-2 bg-orange-200 rounded-full">
                        <Calendar className="w-5 h-5 text-orange-700" />
                      </div>
                    </div>
                    <p className="text-xs text-orange-600 uppercase tracking-wider font-semibold mb-1">Saldo Residuo</p>
                    <p className="text-2xl font-bold text-orange-700">{formatCurrency(paymentSchedule.saldoResiduo)}</p>
                  </div>
                </div>

                {/* Payments List - Design Elegante */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide flex items-center gap-2 mb-3">
                    <FileText className="w-4 h-4" />
                    Dettaglio Rate
                  </h3>
                  {(paymentSchedule.payments || []).map((payment, idx) => (
                    <div 
                      key={payment.id} 
                      className="flex flex-col md:flex-row md:items-center justify-between p-5 bg-gradient-to-r from-gray-50 to-white rounded-xl border-2 border-gray-200 hover:border-indigo-300 hover:shadow-md transition-all"
                      data-testid={`payment-item-${idx}`}
                    >
                      <div className="flex items-start gap-4 flex-1 mb-3 md:mb-0">
                        <div className="p-3 bg-indigo-100 rounded-full flex-shrink-0">
                          <Calendar className="w-5 h-5 text-indigo-600" />
                        </div>
                        <div className="flex-1">
                          <p className="font-bold text-gray-900 capitalize text-lg mb-1">
                            {payment.tipo} {idx + 1}
                          </p>
                          <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                            <Calendar className="w-4 h-4 text-gray-400" />
                            <span className="font-medium">Scadenza:</span>
                            <span className="font-semibold text-gray-800">{formatDate(payment.dataScadenza)}</span>
                          </div>
                          {payment.note && (
                            <p className="text-xs text-gray-500 mt-2 italic bg-gray-100 p-2 rounded">{payment.note}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-2xl font-bold text-gray-900">{formatCurrency(payment.importo)}</p>
                          {payment.dataPagamento && (
                            <div className="flex items-center gap-1 text-xs text-green-600 mt-1">
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
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <FileText className="w-4 h-4" />
              Clausole Contrattuali Accettate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {quote.contractClauses.filter(c => c.accepted).map((clause) => (
                <div key={clause.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg" data-testid={`clause-${clause.id}`}>
                  <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-gray-700" dangerouslySetInnerHTML={{ __html: clause.text }} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Footer - Design Elegante */}
        {quote.theme?.footerText && (
          <Card className="bg-gradient-to-r from-gray-50 to-blue-50 border-gray-200 shadow-sm">
            <CardContent className="pt-6 text-center">
              <p className="text-sm text-gray-700 leading-relaxed" dangerouslySetInnerHTML={{ __html: quote.theme.footerText }} />
            </CardContent>
          </Card>
        )}

        {/* Studio Info - Design Migliorato */}
        <div className="text-center pb-6">
          <Card className="bg-gradient-to-br from-blue-900 to-indigo-900 text-white shadow-xl">
            <CardContent className="py-8">
              <div className="space-y-4">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <FileText className="w-5 h-5" />
                  <p className="text-lg font-semibold">© {new Date().getFullYear()} Image Studio</p>
                </div>
                <p className="text-sm text-blue-200">Tutti i diritti riservati</p>
                <Separator className="bg-blue-700 my-4" />
                <div className="flex flex-col items-center gap-2">
                  <p className="text-sm text-blue-200 font-medium">Hai bisogno di assistenza?</p>
                  <a 
                    href="mailto:info@imagestudiofotografico.com" 
                    className="inline-flex items-center gap-2 px-6 py-3 bg-white text-blue-900 rounded-full font-semibold hover:bg-blue-50 transition-colors shadow-lg"
                  >
                    <CreditCard className="w-4 h-4" />
                    info@imagestudiofotografico.com
                  </a>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
