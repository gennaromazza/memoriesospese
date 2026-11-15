import { useState } from 'react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { KeyRound, Loader2, Send } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import type { Cliente } from '@shared/clienti-types';

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof (value as any)?.toDate === 'function') return (value as any).toDate();
  if (typeof (value as any)?.seconds === 'number') return new Date((value as any).seconds * 1000);
  const d = new Date(value as string);
  return Number.isNaN(d.getTime()) ? null : d;
}

const fmt = (d: Date | null) => (d ? format(d, "d MMM yyyy 'alle' HH:mm", { locale: it }) : '');

/** Riquadro "Area cliente" nella scheda cliente: stato dell'invito e degli accessi. */
export default function ClientAreaStatus({ cliente }: { cliente: Cliente }) {
  const { toast } = useToast();
  const [sending, setSending] = useState(false);
  const [sentNow, setSentNow] = useState<Date | null>(null);

  const welcomeAt = sentNow ?? toDate(cliente.clientArea?.welcomeSentAt);
  const activatedAt = toDate(cliente.clientArea?.activatedAt);
  const lastLoginAt = toDate(cliente.clientArea?.lastLoginAt);
  const hasEmail = Boolean(cliente.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cliente.email));

  const send = async () => {
    setSending(true);
    try {
      await apiRequest('POST', `/api/client-area/admin/welcome/cliente/${encodeURIComponent(cliente.id)}`);
      setSentNow(new Date());
      toast({ title: 'Invito inviato', description: `${cliente.email} riceverà il link alla sua area.` });
    } catch (error) {
      const message = error instanceof Error ? error.message.replace(/^\d+:\s*/, '') : '';
      let description = 'Riprova tra poco.';
      try { description = JSON.parse(message).error || description; } catch { /* testo semplice */ }
      toast({ title: 'Invito non inviato', description, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const state = activatedAt
    ? { label: 'Attiva', variant: 'default' as const }
    : welcomeAt
      ? { label: 'Invitato, non ancora entrato', variant: 'secondary' as const }
      : { label: 'Non ancora invitato', variant: 'outline' as const };

  return (
    <section data-testid="cliente-area-status">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <KeyRound className="h-4 w-4" /> Area cliente
      </h3>
      <div className="space-y-3 rounded-lg border p-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge variant={state.variant}>{state.label}</Badge>
          <Button size="sm" variant="outline" onClick={send} disabled={sending || !hasEmail} data-testid="button-invite-client-area">
            {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            {welcomeAt ? 'Invia di nuovo' : 'Invia invito'}
          </Button>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-muted-foreground">
          <dt>Invito</dt><dd className="text-foreground">{welcomeAt ? fmt(welcomeAt) : '—'}</dd>
          <dt>Primo accesso</dt><dd className="text-foreground">{activatedAt ? fmt(activatedAt) : '—'}</dd>
          <dt>Ultimo accesso</dt><dd className="text-foreground">{lastLoginAt ? fmt(lastLoginAt) : '—'}</dd>
        </dl>
        {!hasEmail && <p className="text-xs text-destructive">Serve un indirizzo email valido per invitare il cliente.</p>}
      </div>
    </section>
  );
}
