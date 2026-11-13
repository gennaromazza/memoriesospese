import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { bookingPaymentMillis, bookingPaymentStageLabel } from '@shared/booking-payment-state';
import { getBookingPaymentCheckouts } from '@/lib/bookings';
import { BookingPaymentPanel } from './BookingPaymentPanel';
import { BookingCancellationAdminPanel } from './BookingCancellationAdminPanel';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export function BookingPaymentCheckouts({ userId, existingIds, campaignFilter, activeCampaignIds, statusFilter, search }:
  { userId: string; existingIds: string[]; campaignFilter: string; activeCampaignIds: string[]; statusFilter: string; search: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const query = useQuery({ queryKey: ['booking-payment-checkouts', userId], queryFn: getBookingPaymentCheckouts,
    enabled: !!userId, refetchInterval: 15_000 });
  if (query.isError) return <p role="alert" className="text-sm">Checkout PayPal temporaneamente non disponibili. <Button variant="link" onClick={() => query.refetch()}>Riprova</Button></p>;
  const items = (query.data?.items || []).filter(item => {
    if (existingIds.includes(item.bookingId)) return false;
    if (search.trim()) return `${item.customerName} ${item.customerEmail} ${item.campaignName}`.toLowerCase().includes(search.trim().toLowerCase());
    if (statusFilter !== 'all' && statusFilter !== item.stage) return false;
    return campaignFilter === 'all' || campaignFilter === 'active' && activeCampaignIds.includes(item.campaignId) || campaignFilter === item.campaignId;
  });
  if (!items.length && !query.data?.truncated && !selected) return null;
  return <section className="space-y-3" aria-label="Checkout senza prenotazione confermata">
    <h3 className="font-medium">Checkout PayPal non ancora conclusi</h3>
    <p className="text-sm text-muted-foreground">Questi slot non sono ancora prenotazioni confermate. I pagamenti da riconciliare restano visibili anche dopo la scadenza.</p>
    {query.data?.truncated && <p role="status" className="text-sm">Elenco parziale: sono mostrati al massimo 100 checkout attivi e 100 incassi da verificare.</p>}
    <div className="grid gap-3 md:grid-cols-2">{items.map(item => <Card key={item.bookingId}><CardContent className="space-y-2 p-4">
      <p className="break-words font-semibold">{item.customerName || 'Cliente'}</p><p className="break-all text-sm">{item.customerEmail}</p>
      <p className="text-sm">{item.campaignName} · {item.shootingStart ? new Date(bookingPaymentMillis(item.shootingStart)!).toLocaleString('it-IT', { timeZone: 'Europe/Rome' }) : 'Data da verificare'}</p>
      <p className="text-sm">{bookingPaymentStageLabel(item.stage)} · {item.amountCents === null ? 'Importo da verificare' : `${(item.amountCents / 100).toFixed(2)} €`}</p>
      <Button variant="outline" onClick={() => setSelected(item.bookingId)}>Dettagli pagamento</Button>
    </CardContent></Card>)}</div>
    <Dialog open={!!selected} onOpenChange={open => { if (!open) setSelected(null); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Checkout e acconto</DialogTitle>
        <DialogDescription>Verifica un pagamento senza confermare manualmente o addebitare il cliente.</DialogDescription></DialogHeader>
        {selected && <><BookingPaymentPanel key={selected} bookingId={selected} userId={userId} />
          {query.data?.items.some(item => item.bookingId === selected && item.stage === 'pagamento_da_verificare')
            && <BookingCancellationAdminPanel key={`refund-${selected}`} bookingId={selected} userId={userId} />}</>}
      </DialogContent>
    </Dialog>
  </section>;
}
