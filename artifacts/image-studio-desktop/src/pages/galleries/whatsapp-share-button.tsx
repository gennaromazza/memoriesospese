import { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getApiUrl } from '../../lib/api';
import { useCreateWhatsAppHandoff, type Gallery } from '../../lib/api-hooks';
import { clientLabel, galleryClientIds, type GalleryClient } from '../../lib/gallery-associations';
import { getClientWhatsAppPhone } from '../../../../../lib/shared-src/phone-utils';

interface WhatsAppRecipient {
  client: GalleryClient;
  phone: string;
}

interface WhatsAppShareButtonProps {
  gallery: Gallery;
  clients: GalleryClient[];
  clientsLoading: boolean;
  clientsError: boolean;
}

export function getWhatsAppRecipients(gallery: Gallery, clients: GalleryClient[]): WhatsAppRecipient[] {
  return galleryClientIds(gallery).flatMap(id => {
    const client = clients.find(item => item.id === id);
    const phone = client ? getClientWhatsAppPhone(client) : '';
    return client && phone ? [{ client, phone }] : [];
  });
}

function apiErrorMessage(error: Error): string {
  const detail = error.message.match(/^API Error \d+: (.+)$/)?.[1];
  if (!detail) return error.message;
  try {
    const parsed = JSON.parse(detail);
    if (typeof parsed.error === 'string') return parsed.error;
  } catch { /* Keep the server response when it is not JSON. */ }
  return detail;
}

export function WhatsAppShareButton({
  gallery,
  clients,
  clientsLoading,
  clientsError,
}: WhatsAppShareButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [feedback, setFeedback] = useState<{ message: string; error: boolean } | null>(null);
  const share = useCreateWhatsAppHandoff(gallery.id);
  const linkedClientIds = galleryClientIds(gallery);
  const recipients = getWhatsAppRecipients(gallery, clients);

  const openWhatsApp = (clientId: string) => {
    if (share.isPending) return;
    const recipient = recipients.find(item => item.client.id === clientId);
    if (!recipient) return;

    const desktop = window.imageStudioDesktop;
    const popup = desktop ? null : window.open('about:blank', '_blank');
    if (!desktop && !popup) {
      setFeedback({ message: 'Il browser ha bloccato la nuova finestra. Consenti i popup e riprova.', error: true });
      return;
    }
    if (popup) popup.opener = null;
    setFeedback(null);
    share.mutate(clientId, {
      onSuccess: result => {
        if (!result.handoffPath.startsWith('/api/desktop/galleries/whatsapp-handoff/')) {
          popup?.close();
          setFeedback({ message: 'Link temporaneo non valido. Riprova.', error: true });
          return;
        }
        const handoffUrl = new URL(getApiUrl(result.handoffPath), window.location.href).toString();
        const onOpened = () => {
          setDialogOpen(false);
          setFeedback({
            message: `WhatsApp si è aperto per ${clientLabel(recipient.client)}. Controlla il messaggio e premi Invia.`,
            error: false,
          });
        };
        if (desktop) {
          void Promise.resolve()
            .then(() => desktop.openExternal(handoffUrl))
            .then(onOpened)
            .catch(error => setFeedback({
              message: `Impossibile avviare WhatsApp: ${apiErrorMessage(error instanceof Error ? error : new Error(String(error)))}`,
              error: true,
            }));
        } else if (popup) {
          popup.location.replace(handoffUrl);
          onOpened();
        }
      },
      onError: error => {
        popup?.close();
        setFeedback({ message: `Impossibile aprire WhatsApp: ${apiErrorMessage(error)}`, error: true });
      },
    });
  };

  const disabled = clientsLoading || clientsError || recipients.length === 0 || share.isPending;
  const buttonLabel = share.isPending
    ? 'Apro WhatsApp...'
    : recipients.length > 1
      ? 'Scegli cliente su WhatsApp'
      : 'Invia con WhatsApp';

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full border-green-700/30 text-green-800 hover:bg-green-50 hover:text-green-900"
        disabled={disabled}
        title={recipients.length === 1 ? `Apri WhatsApp per ${clientLabel(recipients[0].client)}` : undefined}
        onClick={() => {
          setFeedback(null);
          if (recipients.length === 1) openWhatsApp(recipients[0].client.id);
          else if (recipients.length > 1) {
            setSelectedClientId(recipients[0].client.id);
            setDialogOpen(true);
          }
        }}
      >
        <MessageCircle className="mr-2 h-4 w-4" />
        {buttonLabel}
      </Button>

      {clientsLoading ? (
        <p className="text-xs text-muted-foreground">Caricamento clienti...</p>
      ) : clientsError ? (
        <p role="alert" className="text-xs text-destructive">Impossibile caricare i clienti associati.</p>
      ) : recipients.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {linkedClientIds.length
            ? 'I clienti associati non hanno un numero WhatsApp o cellulare valido. Aggiungilo alla scheda cliente.'
            : 'Nessun cliente collegato direttamente alla galleria. Collegane uno nelle Impostazioni.'}
        </p>
      ) : null}
      {feedback && (
        <p role={feedback.error ? 'alert' : 'status'} className={`text-xs ${feedback.error ? 'text-destructive' : 'text-muted-foreground'}`}>
          {feedback.message}
        </p>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Condividi galleria con WhatsApp</DialogTitle>
            <DialogDescription>
              Seleziona il cliente associato. Il messaggio includerà il link e, se presente, la password o il PIN.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label htmlFor={`whatsapp-recipient-${gallery.id}`} className="text-sm font-medium">
              Cliente
            </label>
            <select
              id={`whatsapp-recipient-${gallery.id}`}
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={selectedClientId}
              onChange={event => setSelectedClientId(event.target.value)}
            >
              {recipients.map(({ client, phone }) => (
                <option key={client.id} value={client.id}>{clientLabel(client)} · {phone}</option>
              ))}
            </select>
            {share.isError && (
              <p role="alert" className="text-sm text-destructive">
                Impossibile preparare il messaggio. Riprova.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={share.isPending} onClick={() => setDialogOpen(false)}>
              Annulla
            </Button>
            <Button type="button" disabled={!selectedClientId || share.isPending} onClick={() => openWhatsApp(selectedClientId)}>
              <MessageCircle className="mr-2 h-4 w-4" />
              {share.isPending ? 'Apro WhatsApp...' : 'Apri WhatsApp'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}