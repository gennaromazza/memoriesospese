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

        {/* Cliente & Signature Info */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <User className="w-4 h-4" />
                Informazioni Cliente
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {clienteInfo && (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Nome:</span>
                    <span className="font-medium">{clienteInfo.nome} {clienteInfo.cognome}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Email:</span>
                    <span className="font-medium">{clienteInfo.email}</span>
                  </div>
                </>
              )}
              {jobInfo?.eventDate && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Data Evento:</span>
                  <span className="font-medium">{formatDate(jobInfo.eventDate)}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <FileText className="w-4 h-4" />
                Firma Digitale
              </CardTitle>
            </CardHeader>
            <CardContent>
              {quote.signature && (
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Firmato da:</span>
                    <span className="font-medium">{quote.signature.clientName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Data firma:</span>
                    <span className="font-medium">{formatDate(quote.signature.signedAt)}</span>
                  </div>
                  {quote.signature.imageUrl && (
                    <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                      <p className="text-sm text-gray-600 mb-2">Firma:</p>
                      <img 
                        src={quote.signature.imageUrl} 
                        alt="Firma digitale" 
                        className="max-h-24 border border-gray-300 rounded"
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
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Prodotti e Servizi
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {quote.products.filter(p => quote.type === 'fisso' || p.selected).map((product, idx) => (
                <div 
                  key={idx} 
                  className="flex items-start justify-between p-3 bg-gray-50 rounded-lg"
                  data-testid={`product-item-${idx}`}
                >
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900">{product.nome}</h4>
                    {product.descrizione && (
                      <p className="text-sm text-gray-600 mt-1">{product.descrizione}</p>
                    )}
                    {product.numeroFoto && (
                      <p className="text-sm text-gray-500 mt-1">
                        📸 {product.numeroFoto} foto incluse
                      </p>
                    )}
                  </div>
                  <div className="text-right ml-4">
                    <p className="font-semibold text-gray-900">{formatCurrency(product.prezzo)}</p>
                  </div>
                </div>
              ))}

              <Separator />

              {/* Totali */}
              <div className="space-y-2 pt-2">
                {quote.discountValue && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Subtotale:</span>
                      <span>{formatCurrency(quote.totalBeforeDiscount)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-orange-600">
                      <span>Sconto {quote.discountType === 'percent' ? `(${quote.discountValue}%)` : ''}:</span>
                      <span>-{formatCurrency(quote.totalBeforeDiscount - quote.totalAfterDiscount)}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between text-lg font-bold pt-2 border-t">
                  <span>Totale:</span>
                  <span className="text-blue-700">{formatCurrency(quote.totalAfterDiscount)}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Piano Pagamenti */}
        {paymentSchedule && (
          <Card className="border-blue-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="w-5 h-5" />
                Piano Pagamenti
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {/* Stats Overview */}
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="text-center p-3 bg-blue-50 rounded-lg" data-testid="stat-totale">
                    <p className="text-sm text-gray-600">Totale</p>
                    <p className="text-lg font-bold text-blue-700">{formatCurrency(paymentSchedule.totale)}</p>
                  </div>
                  <div className="text-center p-3 bg-green-50 rounded-lg" data-testid="stat-pagato">
                    <p className="text-sm text-gray-600">Pagato</p>
                    <p className="text-lg font-bold text-green-700">{formatCurrency(paymentSchedule.totalePagato)}</p>
                  </div>
                  <div className="text-center p-3 bg-orange-50 rounded-lg" data-testid="stat-saldo">
                    <p className="text-sm text-gray-600">Saldo</p>
                    <p className="text-lg font-bold text-orange-700">{formatCurrency(paymentSchedule.saldoResiduo)}</p>
                  </div>
                </div>

                {/* Payments List */}
                <div className="space-y-2">
                  {(paymentSchedule.payments || []).map((payment, idx) => (
                    <div 
                      key={payment.id} 
                      className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border"
                      data-testid={`payment-item-${idx}`}
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <Calendar className="w-5 h-5 text-gray-400" />
                        <div>
                          <p className="font-medium text-gray-900 capitalize">
                            {payment.tipo} {idx + 1}
                          </p>
                          <p className="text-sm text-gray-600">
                            Scadenza: {formatDate(payment.dataScadenza)}
                          </p>
                          {payment.note && (
                            <p className="text-xs text-gray-500 mt-1">{payment.note}</p>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex items-center gap-3">
                        <div>
                          <p className="font-semibold text-gray-900">{formatCurrency(payment.importo)}</p>
                          {payment.dataPagamento && (
                            <p className="text-xs text-green-600">
                              Pagato il {formatDate(payment.dataPagamento)}
                            </p>
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

        {/* Footer */}
        {quote.theme?.footerText && (
          <Card className="bg-gray-50">
            <CardContent className="pt-6 text-center">
              <p className="text-sm text-gray-600" dangerouslySetInnerHTML={{ __html: quote.theme.footerText }} />
            </CardContent>
          </Card>
        )}

        {/* Studio Info */}
        <div className="text-center text-sm text-gray-500 pb-4">
          <p>© {new Date().getFullYear()} Image Studio - Tutti i diritti riservati</p>
          <p className="mt-1">
            Per assistenza: <a href="mailto:info@imagestudiofotografico.com" className="text-blue-600 hover:underline">info@imagestudiofotografico.com</a>
          </p>
        </div>
      </div>
    </div>
  );
}
