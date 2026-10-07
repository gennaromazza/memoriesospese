import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Printer, XCircle, CalendarClock, BadgeCheck } from 'lucide-react';
import {
  GIFT_CARD_STATUS_LABELS,
  formatGiftCardPrice,
  type GiftCardDto,
  type GiftCardStatus,
} from '@shared/gift-card-types';
import { createUrl } from '@/lib/basePath';
import { giftCardsApi } from '@/features/gift-cards/gift-cards-api';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { giftCardShareUrl } from '../GiftCardCartoncino';
import { GiftCardStatusBadge, errorText, formatDay, openInNewTab } from './giftCardAdminShared';

type Filter = 'tutte' | GiftCardStatus;
const FILTERS: Filter[] = ['tutte', 'attiva', 'in_attesa_pagamento', 'riscattata', 'scaduta', 'annullata'];
const CHANNEL_LABELS = { studio: 'Studio', online: 'Online' } as const;

export default function GiftCardIssuedPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>('tutte');
  const [cancelling, setCancelling] = useState<GiftCardDto | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [extending, setExtending] = useState<GiftCardDto | null>(null);
  const [extendDate, setExtendDate] = useState('');

  const cards = useQuery({
    queryKey: ['gift-cards-issued', filter],
    queryFn: () => giftCardsApi.listCards(filter === 'tutte' ? undefined : filter),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['gift-cards-issued'] });
  const fail = (title: string) => (error: unknown) => toast({ title, description: errorText(error), variant: 'destructive' });

  const confirmPayment = useMutation({
    mutationFn: (code: string) => giftCardsApi.confirmPayment(code),
    onSuccess: () => { void refresh(); toast({ title: 'Pagamento confermato', description: 'La card è attiva e l\'incasso è in cassa.' }); },
    onError: fail('Conferma non riuscita'),
  });
  const cancel = useMutation({
    mutationFn: ({ code, reason }: { code: string; reason: string }) => giftCardsApi.cancel(code, reason),
    onSuccess: () => { void refresh(); setCancelling(null); setCancelReason(''); toast({ title: 'Card annullata' }); },
    onError: fail('Annullamento non riuscito'),
  });
  const extend = useMutation({
    mutationFn: ({ code, date }: { code: string; date: string | null }) => giftCardsApi.setExpiry(code, date),
    onSuccess: () => { void refresh(); setExtending(null); setExtendDate(''); toast({ title: 'Scadenza aggiornata' }); },
    onError: fail('Modifica non riuscita'),
  });

  const copyLink = async (code: string) => {
    const link = giftCardShareUrl(code);
    try {
      await navigator.clipboard.writeText(link);
      toast({ title: 'Link copiato', description: link });
    } catch {
      toast({ title: 'Copia non riuscita', description: link });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtra per stato">
        {FILTERS.map(item => (
          <Button key={item} type="button" size="sm" variant={filter === item ? 'default' : 'outline'} aria-pressed={filter === item} onClick={() => setFilter(item)}>
            {item === 'tutte' ? 'Tutte' : GIFT_CARD_STATUS_LABELS[item]}
          </Button>
        ))}
      </div>

      {cards.isLoading ? <Skeleton className="h-64 w-full" /> : null}
      {cards.isError ? (
        <Card className="border-red-200 bg-red-50"><CardContent className="pt-6 text-sm text-red-700">{errorText(cards.error)}</CardContent></Card>
      ) : null}
      {cards.data && !cards.data.length ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Nessuna gift card in questo elenco.</CardContent></Card>
      ) : null}

      {cards.data?.length ? (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Codice</TableHead>
                <TableHead>Regalo</TableHead>
                <TableHead>Per</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead>Valore</TableHead>
                <TableHead>Scade</TableHead>
                <TableHead>Canale</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cards.data.map(card => {
                const open = card.status === 'attiva' || card.status === 'in_attesa_pagamento';
                return (
                  <TableRow key={card.code}>
                    <TableCell className="whitespace-nowrap font-mono text-xs">{card.code}</TableCell>
                    <TableCell>{card.typeName}</TableCell>
                    <TableCell>{card.recipientName || '—'}</TableCell>
                    <TableCell><GiftCardStatusBadge status={card.effectiveStatus} /></TableCell>
                    <TableCell className="whitespace-nowrap">{formatGiftCardPrice(card.valueCents)}</TableCell>
                    <TableCell className="whitespace-nowrap">{card.expiresAt ? formatDay(card.expiresAt) : 'Mai'}</TableCell>
                    <TableCell>{CHANNEL_LABELS[card.channel]}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {card.status === 'in_attesa_pagamento' ? (
                          <Button size="icon" variant="ghost" title="Conferma il pagamento" aria-label={`Conferma il pagamento di ${card.code}`} disabled={confirmPayment.isPending} onClick={() => confirmPayment.mutate(card.code)}>
                            <BadgeCheck className="h-4 w-4" />
                          </Button>
                        ) : null}
                        <Button size="icon" variant="ghost" title="Stampa il cartoncino" aria-label={`Stampa il cartoncino di ${card.code}`} onClick={() => openInNewTab(`/admin/gift-card/stampa/${encodeURIComponent(card.code)}`, createUrl)}>
                          <Printer className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" title="Copia il link del regalo" aria-label={`Copia il link di ${card.code}`} onClick={() => void copyLink(card.code)}>
                          <Copy className="h-4 w-4" />
                        </Button>
                        {open ? (
                          <>
                            <Button size="icon" variant="ghost" title="Cambia la scadenza" aria-label={`Cambia la scadenza di ${card.code}`} onClick={() => { setExtending(card); setExtendDate(''); }}>
                              <CalendarClock className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" title="Annulla la card" aria-label={`Annulla ${card.code}`} onClick={() => { setCancelling(card); setCancelReason(''); }}>
                              <XCircle className="h-4 w-4 text-red-600" />
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : null}

      <Dialog open={!!cancelling} onOpenChange={open => { if (!open) setCancelling(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Annullare la card?</DialogTitle>
            <DialogDescription>
              {cancelling ? `${cancelling.typeName} · ${cancelling.code}. ` : ''}Chi ha il cartoncino non potrà più usarla. L'incasso in cassa non viene toccato: se rimborsi, registralo a parte.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="gc-cancel-reason">Motivo</Label>
            <Input id="gc-cancel-reason" value={cancelReason} maxLength={200} placeholder="Per esempio: cartoncino smarrito" onChange={event => setCancelReason(event.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelling(null)}>Indietro</Button>
            <Button variant="destructive" disabled={!cancelReason.trim() || cancel.isPending} onClick={() => cancelling && cancel.mutate({ code: cancelling.code, reason: cancelReason })}>
              Annulla la card
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!extending} onOpenChange={open => { if (!open) setExtending(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambia la scadenza</DialogTitle>
            <DialogDescription>
              {extending ? `${extending.typeName} · ${extending.code}. Scade ora: ${extending.expiresAt ? formatDay(extending.expiresAt) : 'mai'}.` : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="gc-extend-date">Nuova data di scadenza</Label>
            <Input id="gc-extend-date" type="date" value={extendDate} onChange={event => setExtendDate(event.target.value)} />
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="ghost" disabled={extend.isPending} onClick={() => extending && extend.mutate({ code: extending.code, date: null })}>
              Togli la scadenza
            </Button>
            <span className="flex gap-2">
              <Button variant="outline" onClick={() => setExtending(null)}>Indietro</Button>
              <Button disabled={!extendDate || extend.isPending} onClick={() => extending && extend.mutate({ code: extending.code, date: extendDate })}>Salva</Button>
            </span>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
