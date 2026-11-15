import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useChangeAdminBookingManagementLink, useGetAdminBookingManagementLink, type BookingManagementChangeInput } from '@workspace/api-client-react';
import { BookingRequestError, changeBookingManagementLink, getBookingManagementLinkDetails } from '@/lib/bookings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';

export function BookingManagementLinkPanel({ bookingId, userId }: { bookingId: string; userId: string }) {
  const client = useQueryClient(), { toast } = useToast();
  const queryKey = ['booking-management-link', userId, bookingId];
  const query = useGetAdminBookingManagementLink(bookingId, { query: {
    queryKey, enabled: !!userId && !!bookingId, staleTime: 0, refetchInterval: 15_000, retry: false,
    queryFn: () => getBookingManagementLinkDetails(bookingId),
  } });
  const [dialog, setDialog] = useState<'rotate' | 'revoke' | null>(null);
  const [created, setCreated] = useState<{ url: string; version: number } | null>(null);
  const intent = useRef<BookingManagementChangeInput | null>(null), input = useRef<HTMLInputElement>(null);
  useEffect(() => { setCreated(null); setDialog(null); intent.current = null; }, [bookingId, userId]);
  const mutation = useChangeAdminBookingManagementLink({
    mutation: {
      mutationFn: ({ bookingId: id, data }) => changeBookingManagementLink(id, data),
      onSuccess: data => {
        // Never put the bearer URL in a persistent query cache.
        const { url, ...metadata } = data;
        client.setQueryData(queryKey, metadata);
        setCreated(url ? { url, version: data.version } : null); setDialog(null); intent.current = null;
        toast({ title: url ? 'Nuovo link personale generato' : 'Link personale revocato',
          description: url ? 'Copia il nuovo link e invialo al cliente. Quello precedente non è più valido.' : 'Il vecchio link non permette più l’accesso.' });
      },
      onError: error => {
        if (error instanceof BookingRequestError && error.status === 409) {
          intent.current = null; void client.invalidateQueries({ queryKey });
        }
        toast({ title: 'Modifica del link non completata', description: error.message, variant: 'destructive' });
      },
    },
  });
  if (!userId) return null;
  if (query.isLoading) return <p data-testid="status-management-loading" className="text-sm text-muted-foreground">Caricamento del link personale…</p>;
  if (query.isError) return <div role="alert" className="space-y-2 text-sm">
    <p>{query.error.message}</p><Button data-testid="button-management-retry" variant="outline" onClick={() => void query.refetch()}>Riprova</Button>
  </div>;
  const data = query.data;
  if (!data || data.status === 'not_issued' && !data.canIssue) return null;
  const currentUrl = created?.version === data.version && data.status === 'active' ? created.url : null;
  const confirm = () => {
    if (!dialog || query.isFetching || dialog === 'rotate' && !data.canIssue || dialog === 'revoke' && !data.canRevoke) return;
    if (!intent.current || intent.current.action !== dialog) intent.current = {
      action: dialog, expectedVersion: data.version, requestId: crypto.randomUUID(),
    };
    mutation.mutate({ bookingId, data: intent.current });
  };
  return <Card data-testid="card-management-link" className="min-w-0">
    <CardHeader className="pb-2"><CardTitle className="text-base">Link personale del cliente</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      <p data-testid="status-management-link" className="text-sm">
        {data.status === 'active' ? 'Link attivo' : data.status === 'revoked' ? 'Link revocato o da rigenerare' : 'Link non ancora generato'}
      </p>
      <p className="text-xs text-muted-foreground">È incluso nell’email di conferma finale. Non richiede account o password: chi lo possiede può accedere alla prenotazione.</p>
      {data.reason && <p className="text-xs text-muted-foreground">{data.reason}</p>}
      <div className="flex flex-wrap gap-2">
        <Button data-testid="button-management-rotate" variant="outline" disabled={!data.canIssue || mutation.isPending}
          className="h-auto whitespace-normal text-left" onClick={() => setDialog('rotate')}>
          {data.status === 'not_issued' ? 'Genera link personale' : 'Rigenera link personale'}
        </Button>
        {data.canRevoke && <Button data-testid="button-management-revoke" variant="outline" disabled={mutation.isPending}
          className="h-auto whitespace-normal" onClick={() => setDialog('revoke')}>Revoca link</Button>}
      </div>
      {currentUrl && <div className="space-y-2 rounded-md border p-3">
        <label htmlFor={`management-link-${bookingId}`} className="text-xs">Nuovo link da inviare al cliente</label>
        <Input id={`management-link-${bookingId}`} data-testid="input-management-link" ref={input} readOnly value={currentUrl} onFocus={event => event.target.select()} />
        <Button data-testid="button-management-copy" variant="outline" onClick={async () => {
          try { await navigator.clipboard.writeText(currentUrl); toast({ title: 'Link copiato' }); }
          catch { input.current?.focus(); input.current?.select(); toast({ title: 'Copia il link selezionato manualmente' }); }
        }}>Copia link</Button>
        <p className="text-xs text-muted-foreground">La rigenerazione non invia un’altra email automaticamente: condividi questo nuovo link con il cliente.</p>
      </div>}
      <AlertDialog open={!!dialog} onOpenChange={open => { if (!open && !mutation.isPending) setDialog(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{dialog === 'revoke' ? 'Revocare il link personale?' : 'Generare un nuovo link personale?'}</AlertDialogTitle>
            <AlertDialogDescription>{dialog === 'revoke'
              ? 'Il link già ricevuto dal cliente non funzionerà più. La prenotazione e il pagamento non vengono modificati.'
              : 'Il nuovo link sostituisce quello precedente. Dopo la generazione dovrai copiarlo e inviarlo al cliente.'}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-management-cancel" disabled={mutation.isPending}>Annulla</AlertDialogCancel>
            <AlertDialogAction data-testid="button-management-confirm" disabled={mutation.isPending || query.isFetching
              || dialog === 'rotate' && !data.canIssue || dialog === 'revoke' && !data.canRevoke}
              onClick={event => { event.preventDefault(); confirm(); }}>{mutation.isPending ? 'Attendi…' : 'Conferma'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CardContent>
  </Card>;
}
