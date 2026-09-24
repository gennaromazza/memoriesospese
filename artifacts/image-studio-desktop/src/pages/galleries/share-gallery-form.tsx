import { useState } from 'react';
import { Share } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useClients, useShareGallery, type Gallery } from '../../lib/api-hooks';
import { clientLabel } from '../../lib/gallery-associations';

export function ShareGalleryForm({ gallery }: { gallery: Gallery }) {
  const [email, setEmail] = useState('');
  const [feedback, setFeedback] = useState<{ message: string; error: boolean } | null>(null);
  const clients = useClients();
  const share = useShareGallery(gallery.id);
  const protectedGallery = gallery.accessMode === 'open' ? false :
    gallery.accessMode === 'password' || gallery.accessMode === 'pin' ||
    gallery.passwordEnabled || gallery.pinEnabled;
  const associatedClients = (clients.data || []).filter(client =>
    gallery.clientIds?.includes(client.id) && typeof client.email === 'string' && client.email.trim());
  const availableClients = associatedClients.filter((client, index) =>
    associatedClients.findIndex(item => item.email?.trim().toLowerCase() === client.email?.trim().toLowerCase()) === index);

  return (
    <div className="flex max-w-sm flex-col items-end gap-1">
      <form className="flex items-center gap-2" onSubmit={event => {
        event.preventDefault();
        if (share.isPending) return;
        const recipient = email.trim();
        setFeedback(null);
        share.mutate({ to: recipient }, {
          onSuccess: () => {
            setEmail('');
            setFeedback({ message: `Email con link e informazioni di accesso inviata a ${recipient}.`, error: false });
          },
          onError: (error: Error) => {
            const detail = error.message.match(/^API Error \d+: (.+)$/)?.[1];
            let message = error.message;
            if (detail) {
              try {
                const parsed = JSON.parse(detail);
                if (typeof parsed.error === 'string') message = parsed.error;
              } catch { /* Keep the original error. */ }
            }
            setFeedback({ message: `Email non inviata: ${message}`, error: true });
          },
        });
      }}>
        <Label className="sr-only" htmlFor="gallery-share-email">Destinatario della galleria</Label>
        {protectedGallery ? (
          <select
            id="gallery-share-email"
            aria-label="Cliente associato a cui inviare le credenziali"
            value={email}
            onChange={event => { setEmail(event.target.value); setFeedback(null); }}
            required
            disabled={clients.isLoading || clients.isError || availableClients.length === 0}
            className="h-11 w-56 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Seleziona il cliente</option>
            {availableClients.map(client => (
              <option key={client.id} value={client.email!.trim()}>{clientLabel(client)} · {client.email}</option>
            ))}
          </select>
        ) : (
          <Input
            id="gallery-share-email"
            value={email}
            onChange={event => { setEmail(event.target.value); setFeedback(null); }}
            placeholder="Email destinatario"
            className="h-11 w-56"
            type="email"
            required
          />
        )}
        <Button type="submit" variant="outline" size="sm" disabled={share.isPending || !email}>
          <Share className="mr-2 h-4 w-4" />
          {share.isPending ? 'Invio in corso...' : 'Invia accesso'}
        </Button>
      </form>
      <p className="text-right text-xs text-muted-foreground">
        {protectedGallery
          ? 'La mail include link e password/PIN in chiaro. Puoi inviarla solo a un cliente associato.'
          : 'La mail include il link della galleria.'}
      </p>
      {protectedGallery && !clients.isLoading && (clients.isError || !availableClients.length) && (
        <p role="alert" className="text-right text-xs text-destructive">
          {clients.isError ? 'Impossibile caricare i clienti. Riprova.' : 'Associa un cliente con email nelle Impostazioni prima di inviare.'}
        </p>
      )}
      {feedback && <p role={feedback.error ? 'alert' : 'status'} className={`text-right text-sm ${feedback.error ? 'text-destructive' : 'text-foreground'}`}>{feedback.message}</p>}
    </div>
  );
}