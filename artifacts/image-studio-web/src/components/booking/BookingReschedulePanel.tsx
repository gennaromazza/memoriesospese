import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useGetBookingManagementSlots, useRescheduleManagedBooking, type BookingManagementView, type BookingRescheduleSlot } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { rescheduleNoticeFor } from '@shared/seasonal-vademecum';

function message(error: unknown) {
  if (error && typeof error === 'object' && 'data' in error && error.data && typeof error.data === 'object'
    && 'error' in error.data && typeof error.data.error === 'string') return error.data.error;
  return 'Non riesco a verificare l’esito. Riprova lo stesso cambio o contatta lo studio. Non effettuare un nuovo pagamento.';
}
export function BookingReschedulePanel({ booking, token, onUpdated, onRefresh }: {
  booking: BookingManagementView; token: string; onUpdated: (data: BookingManagementView) => void; onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false), [selected, setSelected] = useState<BookingRescheduleSlot | null>(null);
  const intent = useRef<string | null>(null);
  const form = useForm<{ date: string }>({ defaultValues: { date: '' } });
  const slots = useGetBookingManagementSlots({ mutation: { gcTime: 0, retry: false } });
  const change = useRescheduleManagedBooking({ mutation: { gcTime: 0, retry: false } });
  const uncertain = change.isError && (!('status' in change.error) || !change.error.status || Number(change.error.status) >= 500);
  const busy = slots.isPending || change.isPending;
  const search = ({ date }: { date: string }) => {
    setSelected(null); intent.current = null; change.reset();
    slots.mutate({ bookingId: booking.bookingId, data: { token, date } });
  };
  const confirm = () => {
    if (!selected || !booking.startsAt) return;
    intent.current ||= crypto.randomUUID();
    change.mutate({ bookingId: booking.bookingId, data: { token, requestId: intent.current,
      expectedStartsAt: booking.startsAt, startsAt: selected.startsAt, endsAt: selected.endsAt } }, {
      onSuccess: onUpdated,
      onError: error => {
        if ('status' in error && Number(error.status) < 500) intent.current = null;
        onRefresh();
      },
    });
  };
  return <section className="space-y-3 border-t pt-4" data-testid="booking-reschedule-panel">
    <h2 className="font-semibold">Cambiare appuntamento</h2>
    {!booking.reschedule.canChange ? <>
      <p role={booking.reschedule.status === 'pending' ? 'status' : undefined} className="text-sm">{booking.reschedule.reason}</p>
      {booking.reschedule.targetStartsAt && ['pending', 'blocked'].includes(booking.reschedule.status) && <p className="text-sm">
        Cambio richiesto per: <strong>{new Date(booking.reschedule.targetStartsAt).toLocaleString('it-IT', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Rome' })}</strong>.
        La nuova data non è ancora confermata.
      </p>}
      {booking.reschedule.status === 'changed' && booking.status === 'confirmed' && <p className="text-sm">
        {booking.reschedule.notificationStatus === 'sent' ? 'Ti abbiamo inviato la conferma con la nuova data.'
          : ['unknown', 'failed', 'skipped'].includes(booking.reschedule.notificationStatus || '') ? 'La data è aggiornata. Se non ricevi la conferma email, contatta lo studio.'
            : 'La data è aggiornata. Stiamo preparando la nuova conferma email.'}
      </p>}
    </> : !open ? <>
      <p className="text-sm text-muted-foreground">Puoi cambiare una sola volta, nella stessa campagna, fino a {rescheduleNoticeFor({ nome: booking.campaignName }).label} prima. L’acconto resta valido.</p>
      <Button data-testid="button-open-reschedule" variant="outline" onClick={() => setOpen(true)}>Scegli un nuovo appuntamento</Button>
    </> : <>
      <p className="text-sm">L’appuntamento attuale resta riservato finché il cambio non è confermato. Puoi usare questa possibilità una sola volta.</p>
      <Form {...form}><form onSubmit={form.handleSubmit(search)} className="flex flex-wrap items-end gap-3">
        <FormField control={form.control} name="date" rules={{ required: true }} render={({ field }) => <FormItem className="min-w-0 flex-1">
          <FormLabel>Nuova data</FormLabel><FormControl><Input {...field} type="date" required
            min={booking.reschedule.firstDate || undefined} max={booking.reschedule.lastDate || undefined}
            disabled={busy || uncertain} data-testid="input-reschedule-date"
            onChange={event => { field.onChange(event); setSelected(null); slots.reset(); intent.current = null; change.reset(); }} /></FormControl>
        </FormItem>} />
        <Button type="submit" disabled={busy || uncertain} data-testid="button-find-reschedule-slots">{slots.isPending ? 'Verifico…' : 'Mostra orari'}</Button>
      </form></Form>
      {slots.isError && <p role="alert" className="text-sm text-destructive">{message(slots.error)}</p>}
      {slots.isSuccess && slots.data.slots.length === 0 && <p role="status" className="text-sm">Nessun orario disponibile. Prova un’altra data.</p>}
      {slots.data && <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="Orari disponibili">
        {slots.data.slots.map(slot => <Button key={slot.startsAt} type="button" variant={selected?.startsAt === slot.startsAt ? 'default' : 'outline'}
          className="h-auto whitespace-normal" aria-pressed={selected?.startsAt === slot.startsAt} disabled={busy || uncertain}
          data-testid={`button-reschedule-slot-${slot.startsAt}`} onClick={() => { setSelected(slot); intent.current = null; change.reset(); }}>
          {slot.label}
        </Button>)}
      </div>}
      {selected && <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
        <p className="text-sm">Nuovo appuntamento: <strong>{new Date(selected.startsAt).toLocaleString('it-IT', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Rome' })}</strong>.
          L’acconto versato resta associato, senza un altro pagamento.</p>
        <Button type="button" className="h-auto whitespace-normal" disabled={busy} onClick={confirm} data-testid="button-confirm-reschedule">
          {change.isPending ? 'Conferma in corso…' : uncertain ? 'Riprova lo stesso cambio' : 'Conferma il cambio'}
        </Button>
      </div>}
      {change.isError && <p role="alert" className="text-sm text-destructive">{message(change.error)}</p>}
      {!busy && !uncertain && <Button type="button" variant="ghost" data-testid="button-close-reschedule" onClick={() => setOpen(false)}>Mantieni l’appuntamento attuale</Button>}
    </>}
  </section>;
}
