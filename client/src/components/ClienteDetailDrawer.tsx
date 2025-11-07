import { useRef } from 'react';
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
  Calendar,
  Image,
  CalendarCheck,
  Package,
  Key,
  User
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
  const storicoRef = useRef<HTMLElement>(null);

  if (!cliente) return null;

  const scrollToStorico = () => {
    storicoRef.current?.scrollIntoView({ 
      behavior: 'smooth', 
      block: 'start' 
    });
  };

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
              Attività e Collegamenti
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {/* Gallerie */}
              <div 
                onClick={scrollToStorico}
                className="flex items-center gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 cursor-pointer hover:shadow-md transition-shadow"
                data-testid="badge-gallerie"
              >
                <div className="p-2 rounded-full bg-blue-100 dark:bg-blue-900/40">
                  <Image className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {cliente.sourceRefs.galleryIds?.length || 0}
                  </div>
                  <div className="text-xs text-blue-700/70 dark:text-blue-300/70">
                    Gallerie
                  </div>
                </div>
              </div>

              {/* Prenotazioni */}
              <div 
                onClick={scrollToStorico}
                className="flex items-center gap-3 p-3 rounded-lg bg-[hsl(var(--sage-soft))] dark:bg-[hsl(var(--sage))]/10 border border-[hsl(var(--sage))]/30 cursor-pointer hover:shadow-md transition-shadow"
                data-testid="badge-prenotazioni"
              >
                <div className="p-2 rounded-full bg-[hsl(var(--sage))]/20">
                  <CalendarCheck className="h-4 w-4 text-[hsl(var(--sage))]" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-[hsl(var(--sage))]">
                    {cliente.sourceRefs.bookingIds?.length || 0}
                  </div>
                  <div className="text-xs text-[hsl(var(--sage))]/70">
                    Prenotazioni
                  </div>
                </div>
              </div>

              {/* Ordini */}
              <div 
                onClick={scrollToStorico}
                className="flex items-center gap-3 p-3 rounded-lg bg-[hsl(var(--terracotta-soft))] dark:bg-[hsl(var(--terracotta))]/10 border border-[hsl(var(--terracotta))]/30 cursor-pointer hover:shadow-md transition-shadow"
                data-testid="badge-ordini"
              >
                <div className="p-2 rounded-full bg-[hsl(var(--terracotta))]/20">
                  <Package className="h-4 w-4 text-[hsl(var(--terracotta))]" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-[hsl(var(--terracotta))]">
                    {cliente.sourceRefs.orderIds?.length || 0}
                  </div>
                  <div className="text-xs text-[hsl(var(--terracotta))]/70">
                    Ordini
                  </div>
                </div>
              </div>

              {/* Richieste Password */}
              <div 
                onClick={scrollToStorico}
                className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 cursor-pointer hover:shadow-md transition-shadow"
                data-testid="badge-richieste"
              >
                <div className="p-2 rounded-full bg-amber-100 dark:bg-amber-900/40">
                  <Key className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                    {cliente.sourceRefs.passwordRequestIds?.length || 0}
                  </div>
                  <div className="text-xs text-amber-700/70 dark:text-amber-300/70">
                    Richieste
                  </div>
                </div>
              </div>

              {/* Account Registrati */}
              {(cliente.sourceRefs.userIds?.length || 0) > 0 && (
                <div 
                  onClick={scrollToStorico}
                  className="flex items-center gap-3 p-3 rounded-lg bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 col-span-2 cursor-pointer hover:shadow-md transition-shadow"
                  data-testid="badge-account"
                >
                  <div className="p-2 rounded-full bg-purple-100 dark:bg-purple-900/40">
                    <User className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                      {cliente.sourceRefs.userIds?.length || 0}
                    </div>
                    <div className="text-xs text-purple-700/70 dark:text-purple-300/70">
                      Account Registrato
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

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

          <section ref={storicoRef}>
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
