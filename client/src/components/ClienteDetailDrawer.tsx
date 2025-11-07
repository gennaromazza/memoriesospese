import type { Cliente } from '@shared/clienti-types';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import ClienteQuickActions from './ClienteQuickActions';
import ClienteStorico from './ClienteStorico';
import { 
  Mail, 
  Phone, 
  MessageCircle, 
  MapPin, 
  Euro,
  ShoppingCart,
  TrendingUp,
  Calendar
} from 'lucide-react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

interface ClienteDetailDrawerProps {
  cliente: Cliente | null;
  open: boolean;
  onClose: () => void;
  onAction?: (action: string) => void;
}

export default function ClienteDetailDrawer({ 
  cliente, 
  open, 
  onClose,
  onAction 
}: ClienteDetailDrawerProps) {
  if (!cliente) return null;

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: 'default' | 'secondary' | 'outline' | 'destructive'; label: string }> = {
      'lead': { variant: 'outline', label: 'Lead' },
      'prospect': { variant: 'secondary', label: 'Prospect' },
      'cliente_attivo': { variant: 'default', label: 'Cliente Attivo' },
      'archiviato': { variant: 'destructive', label: 'Archiviato' },
    };

    const config = variants[status] || { variant: 'outline' as const, label: status };
    
    return (
      <Badge variant={config.variant}>
        {config.label}
      </Badge>
    );
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent 
        side="right" 
        className="w-full sm:max-w-2xl overflow-y-auto"
        data-testid="drawer-cliente-detail"
      >
        <SheetHeader className="mb-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <SheetTitle className="text-2xl mb-2" data-testid="text-cliente-nome">
                {cliente.nome} {cliente.cognome}
              </SheetTitle>
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                <Mail className="h-4 w-4" />
                <span data-testid="text-cliente-email">{cliente.email}</span>
              </div>
              {getStatusBadge(cliente.lifecycle.status)}
            </div>
            {onAction && (
              <ClienteQuickActions
                cliente={cliente}
                onAction={onAction}
              />
            )}
          </div>
        </SheetHeader>

        <div className="space-y-6">
          <section>
            <h3 className="text-sm font-semibold text-muted-foreground mb-3">
              Informazioni di Contatto
            </h3>
            <div className="space-y-3">
              {cliente.cellulare1 && (
                <div className="flex items-center gap-3" data-testid="text-cellulare1">
                  <Phone className="h-4 w-4 text-[hsl(var(--sage))]" />
                  <span className="text-sm">{cliente.cellulare1}</span>
                </div>
              )}
              {cliente.cellulare2 && (
                <div className="flex items-center gap-3" data-testid="text-cellulare2">
                  <Phone className="h-4 w-4 text-[hsl(var(--sage))]" />
                  <span className="text-sm">{cliente.cellulare2}</span>
                </div>
              )}
              {cliente.whatsapp && (
                <div className="flex items-center gap-3" data-testid="text-whatsapp">
                  <MessageCircle className="h-4 w-4 text-[hsl(var(--terracotta))]" />
                  <span className="text-sm">{cliente.whatsapp}</span>
                </div>
              )}
              {(cliente.via || cliente.citta) && (
                <div className="flex items-start gap-3" data-testid="text-indirizzo">
                  <MapPin className="h-4 w-4 text-[hsl(var(--blue-gray))] mt-0.5" />
                  <div className="text-sm">
                    {cliente.via && <div>{cliente.via}</div>}
                    {(cliente.citta || cliente.cap || cliente.provincia) && (
                      <div>
                        {cliente.citta}
                        {cliente.cap && `, ${cliente.cap}`}
                        {cliente.provincia && ` (${cliente.provincia})`}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>

          <Separator />

          <section>
            <h3 className="text-sm font-semibold text-muted-foreground mb-3">
              Statistiche
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Fatturato Totale
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Euro className="h-5 w-5 text-[hsl(var(--terracotta))]" />
                    <span 
                      className="text-2xl font-bold text-[hsl(var(--terracotta))]"
                      data-testid="text-fatturato-totale"
                    >
                      €{cliente.financials.totalRevenue?.toFixed(2) || '0.00'}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Ordini Totali
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="h-5 w-5 text-[hsl(var(--blue-gray))]" />
                    <span 
                      className="text-2xl font-bold"
                      data-testid="text-ordini-totali"
                    >
                      {cliente.financials.totalOrders || 0}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Saldo Pendente
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-[hsl(var(--sage))]" />
                    <span 
                      className={`text-2xl font-bold ${
                        (cliente.financials.outstandingBalance || 0) > 0 
                          ? 'text-[hsl(var(--sage))]' 
                          : 'text-muted-foreground'
                      }`}
                      data-testid="text-saldo-pendente"
                    >
                      €{cliente.financials.outstandingBalance?.toFixed(2) || '0.00'}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>

          {cliente.note && (
            <>
              <Separator />
              <section>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3">
                  Note
                </h3>
                <div 
                  className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted/30 p-4 rounded-md"
                  data-testid="text-note"
                >
                  {cliente.note}
                </div>
              </section>
            </>
          )}

          {cliente.tags && cliente.tags.length > 0 && (
            <>
              <Separator />
              <section>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3">
                  Tags
                </h3>
                <div className="flex flex-wrap gap-2" data-testid="container-tags">
                  {cliente.tags.map((tag, index) => (
                    <Badge 
                      key={index} 
                      variant="secondary"
                      data-testid={`tag-${tag}`}
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              </section>
            </>
          )}

          <Separator />

          <section>
            <h3 className="text-sm font-semibold text-muted-foreground mb-3">
              Date Importanti
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Primo Contatto:</span>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-[hsl(var(--blue-gray))]" />
                  <span data-testid="text-primo-contatto">
                    {cliente.lifecycle.firstContactAt
                      ? format(cliente.lifecycle.firstContactAt.toDate(), 'dd MMMM yyyy', { locale: it })
                      : '-'}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Ultima Interazione:</span>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-[hsl(var(--sage))]" />
                  <span data-testid="text-ultima-interazione">
                    {cliente.lifecycle.lastInteractionAt
                      ? format(cliente.lifecycle.lastInteractionAt.toDate(), 'dd MMMM yyyy', { locale: it })
                      : '-'}
                  </span>
                </div>
              </div>
              {cliente.financials.lastPaymentAt && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Ultimo Pagamento:</span>
                  <div className="flex items-center gap-2">
                    <Euro className="h-4 w-4 text-[hsl(var(--terracotta))]" />
                    <span data-testid="text-ultimo-pagamento">
                      {format(cliente.financials.lastPaymentAt.toDate(), 'dd MMMM yyyy', { locale: it })}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </section>

          <Separator />

          <section>
            <h3 className="text-sm font-semibold text-muted-foreground mb-4">
              Storico Attività
            </h3>
            <ClienteStorico cliente={cliente} />
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
