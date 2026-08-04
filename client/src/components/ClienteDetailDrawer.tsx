import { useRef, useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import type { Cliente } from '@shared/clienti-types';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  User,
  Edit,
  Briefcase
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

  // Gallerie collegate al cliente (query diretta)
  const [linkedGalleries, setLinkedGalleries] = useState<Array<{
    id: string; name: string; code: string; date?: string; photoCount?: number; jobType?: string;
  }>>([]);

  useEffect(() => {
    if (!cliente?.id || !open) return;
    // Multi-cliente: leggi gallerie via clientiIds (array-contains) + legacy clienteId, poi dedup
    const qLegacy = query(collection(db, 'galleries'), where('clienteId', '==', cliente.id));
    const qMulti = query(collection(db, 'galleries'), where('clientiIds', 'array-contains', cliente.id));
    Promise.all([getDocs(qLegacy), getDocs(qMulti)])
      .then(([snapLegacy, snapMulti]) => {
        const map = new Map<string, any>();
        for (const d of [...snapLegacy.docs, ...snapMulti.docs]) {
          if (!map.has(d.id)) {
            const data = d.data();
            map.set(d.id, {
              id: d.id,
              name: data.name || '',
              code: data.code || '',
              date: data.date,
              photoCount: data.photoCount || 0,
              jobType: data.jobType,
            });
          }
        }
        setLinkedGalleries(Array.from(map.values()));
      })
      .catch(console.error);
  }, [cliente?.id, open]);

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
          <div className="flex items-start justify-between gap-4">
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
              <div className="flex items-center gap-2">
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => onAction('edit')}
                  data-testid="button-edit-cliente"
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Modifica
                </Button>
                <ClienteQuickActions
                  cliente={cliente}
                  onAction={onAction}
                />
              </div>
            )}
          </div>
        </SheetHeader>

        <div className="space-y-6">
          <section>
            <h3 className="text-sm font-semibold text-muted-foreground mb-3">
              Dati Anagrafici
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Nome:</span>
                <div className="font-medium mt-1" data-testid="text-nome">{cliente.nome || '-'}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Cognome:</span>
                <div className="font-medium mt-1" data-testid="text-cognome">{cliente.cognome || '-'}</div>
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground">Email:</span>
                <div className="font-medium mt-1" data-testid="text-email-full">{cliente.email}</div>
              </div>
            </div>
          </section>

          <Separator />

          <section>
            <h3 className="text-sm font-semibold text-muted-foreground mb-3">
              Recapiti
            </h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Phone className="h-4 w-4 text-[hsl(var(--sage))]" />
                <div className="flex-1">
                  <span className="text-xs text-muted-foreground block">Cellulare 1:</span>
                  <span className="text-sm font-medium" data-testid="text-cellulare1-full">
                    {cliente.cellulare1 || '-'}
                  </span>
                </div>
              </div>
              {cliente.cellulare2 && (
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-[hsl(var(--sage))]" />
                  <div className="flex-1">
                    <span className="text-xs text-muted-foreground block">Cellulare 2:</span>
                    <span className="text-sm font-medium" data-testid="text-cellulare2-full">
                      {cliente.cellulare2}
                    </span>
                  </div>
                </div>
              )}
              {cliente.whatsapp && (
                <div className="flex items-center gap-3">
                  <MessageCircle className="h-4 w-4 text-[hsl(var(--terracotta))]" />
                  <div className="flex-1">
                    <span className="text-xs text-muted-foreground block">WhatsApp:</span>
                    <span className="text-sm font-medium" data-testid="text-whatsapp-full">
                      {cliente.whatsapp}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </section>

          <Separator />

          <section>
            <h3 className="text-sm font-semibold text-muted-foreground mb-3">
              Indirizzo
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <MapPin className="h-4 w-4 text-[hsl(var(--blue-gray))] mt-0.5" />
                <div className="flex-1">
                  <div className="font-medium" data-testid="text-via-full">
                    {cliente.via || '-'}
                  </div>
                  <div className="text-muted-foreground mt-1" data-testid="text-citta-full">
                    {cliente.citta || '-'}
                    {cliente.cap && ` • ${cliente.cap}`}
                    {cliente.provincia && ` • ${cliente.provincia}`}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {(cliente.codiceFiscale || cliente.partitaIva || cliente.ragioneSociale || cliente.codiceSdi || cliente.pec || cliente.dataNascita || cliente.luogoNascita) && (
            <>
              <Separator />
              <section>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3">
                  Dati di Fatturazione
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm" data-testid="section-fatturazione">
                  {cliente.tipoSoggetto && (
                    <div>
                      <span className="text-muted-foreground">Tipo soggetto:</span>
                      <div className="font-medium mt-1">{cliente.tipoSoggetto === 'azienda' ? 'Azienda / P.IVA' : 'Privato'}</div>
                    </div>
                  )}
                  {cliente.codiceFiscale && (
                    <div>
                      <span className="text-muted-foreground">Codice Fiscale:</span>
                      <div className="font-medium mt-1 font-mono" data-testid="text-codice-fiscale">{cliente.codiceFiscale}</div>
                    </div>
                  )}
                  {cliente.partitaIva && (
                    <div>
                      <span className="text-muted-foreground">Partita IVA:</span>
                      <div className="font-medium mt-1 font-mono" data-testid="text-partita-iva">{cliente.partitaIva}</div>
                    </div>
                  )}
                  {cliente.ragioneSociale && (
                    <div>
                      <span className="text-muted-foreground">Ragione sociale:</span>
                      <div className="font-medium mt-1">{cliente.ragioneSociale}</div>
                    </div>
                  )}
                  {cliente.codiceSdi && (
                    <div>
                      <span className="text-muted-foreground">Codice SDI:</span>
                      <div className="font-medium mt-1 font-mono">{cliente.codiceSdi}</div>
                    </div>
                  )}
                  {cliente.pec && (
                    <div>
                      <span className="text-muted-foreground">PEC:</span>
                      <div className="font-medium mt-1">{cliente.pec}</div>
                    </div>
                  )}
                  {cliente.dataNascita && (
                    <div>
                      <span className="text-muted-foreground">Data di nascita:</span>
                      <div className="font-medium mt-1">
                        {format(new Date(cliente.dataNascita + 'T00:00:00'), 'dd MMMM yyyy', { locale: it })}
                      </div>
                    </div>
                  )}
                  {cliente.luogoNascita && (
                    <div>
                      <span className="text-muted-foreground">Luogo di nascita:</span>
                      <div className="font-medium mt-1">{cliente.luogoNascita}</div>
                    </div>
                  )}
                </div>
              </section>
            </>
          )}

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
                    {linkedGalleries.length || cliente.sourceRefs.galleryIds?.length || 0}
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

              {/* Lavori */}
              <div 
                onClick={scrollToStorico}
                className="flex items-center gap-3 p-3 rounded-lg bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800 cursor-pointer hover:shadow-md transition-shadow"
                data-testid="badge-lavori"
              >
                <div className="p-2 rounded-full bg-indigo-100 dark:bg-indigo-900/40">
                  <Briefcase className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                    {cliente.sourceRefs.jobIds?.length || 0}
                  </div>
                  <div className="text-xs text-indigo-700/70 dark:text-indigo-300/70">
                    Lavori
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

          {/* Gallerie Associate */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-muted-foreground">Gallerie Associate</h3>
              <Badge variant="outline">{linkedGalleries.length}</Badge>
            </div>
            {linkedGalleries.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">
                Nessuna galleria collegata a questo cliente. Collega una galleria dalla modale "Modifica Galleria".
              </p>
            ) : (
              <div className="space-y-2">
                {linkedGalleries.map(g => (
                  <div key={g.id} className="flex items-center justify-between gap-2 p-3 rounded-lg border border-blue-100 bg-blue-50/50 hover:shadow-sm transition-shadow">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-gray-900 truncate">{g.name}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <code className="text-[10px] bg-white px-1.5 py-0.5 rounded border text-gray-500">{g.code}</code>
                        {g.date && <span className="text-xs text-muted-foreground">{g.date}</span>}
                        {g.jobType && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded border bg-terracotta/10 text-terracotta border-terracotta/20 font-medium">{g.jobType}</span>
                        )}
                        <span className="text-xs text-muted-foreground">{g.photoCount} foto</span>
                      </div>
                    </div>
                    <a
                      href={`/admin/gallery/${g.id}/manage`}
                      className="flex-shrink-0 text-xs font-medium text-blue-600 hover:underline whitespace-nowrap"
                    >
                      Gestisci →
                    </a>
                  </div>
                ))}
              </div>
            )}
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
