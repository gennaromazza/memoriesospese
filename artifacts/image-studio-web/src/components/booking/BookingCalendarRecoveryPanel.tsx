import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Calendar, Loader2 } from 'lucide-react';

interface Inspection {
  action: 'blocked' | 'already_linked' | 'link_existing' | 'create';
  canRecover: boolean;
  message: string;
  inspectionKey?: string;
  calendarId?: string;
  start?: string;
}
export function BookingCalendarRecoveryPanel({ bookingId }: { bookingId: string }) {
  const queryClient = useQueryClient();
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [error, setError] = useState('');
  const request = useMutation({
    mutationFn: async (recover: boolean) => {
      setError('');
      const url = `/api/booking/${encodeURIComponent(bookingId)}/calendar-recovery`;
      const response = await apiRequest(recover ? 'POST' : 'GET', url,
        recover ? { inspectionKey: inspection?.inspectionKey } : undefined);
      return response.json() as Promise<Inspection>;
    },
    onSuccess: (result, recover) => {
      setInspection(result);
      if (recover) {
        queryClient.invalidateQueries({ queryKey: ['bookings'] });
        queryClient.invalidateQueries({ queryKey: ['/api/calendar/events'], exact: false });
      }
    },
    onError: (e: Error) => {
      // A stale plan must be inspected again, never retried blindly.
      setInspection(null);
      try { setError(JSON.parse(e.message.replace(/^\d+:\s*/, '')).error || e.message); }
      catch { setError(e.message); }
    },
  });
  return (
    <section className="rounded-lg border p-4 space-y-3" aria-label="Recupero appuntamento Google">
      <h3 className="flex items-center gap-2 font-medium"><Calendar className="h-4 w-4" />Appuntamento Google Calendar</h3>
      <p className="text-sm text-muted-foreground">
        Non vedi lo shooting sul calendario? Verifica prima se esiste già.
        Il recupero non cambia la prenotazione o gli incassi e non invia email.
      </p>
      {inspection && <Alert><AlertDescription className="space-y-1">
        <p role="status">{inspection.message}</p>
        {inspection.calendarId && <p className="break-all text-xs">Calendario: {inspection.calendarId}</p>}
        {inspection.start && <p className="text-xs">Appuntamento: {new Date(inspection.start).toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}</p>}
      </AlertDescription></Alert>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={request.isPending} onClick={() => request.mutate(false)}>
          {request.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Verifica appuntamento
        </Button>
        {inspection?.canRecover && inspection.inspectionKey && (
          <Button disabled={request.isPending} onClick={() => request.mutate(true)}>
            {inspection.action === 'link_existing' ? 'Collega appuntamento esistente' : 'Crea appuntamento mancante'}
          </Button>
        )}
      </div>
    </section>
  );
}
