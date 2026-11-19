import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { recordInPersonBookingDeposit } from '@/lib/bookings';
import {
  IN_PERSON_METHODS, IN_PERSON_METHOD_LABELS, buildInPersonDepositRequest, formatCentsForInput, parseEuroToCents, type InPersonMethod,
} from '@/lib/in-person-deposit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

const euro = (cents: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(cents / 100);

interface Props {
  bookingId: string;
  userId: string;
  /** Importo suggerito (acconto della campagna): l'admin puo' modificarlo liberamente. */
  suggestedAmountCents?: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRecorded?: () => void;
}

/**
 * Registra un acconto pagato di persona (importo libero). Conferma la prenotazione, chiude il link
 * PayPal e scrive l'incasso in cassa. Un nuovo identificativo viene creato solo quando cambiano i dati:
 * ripetere lo stesso invio (rete incerta, doppio clic) non puo' registrare due volte.
 */
export function InPersonDepositDialog({ bookingId, userId, suggestedAmountCents, open, onOpenChange, onRecorded }: Props) {
  const client = useQueryClient(), { toast } = useToast();
  const [amount, setAmount] = useState(formatCentsForInput(suggestedAmountCents));
  const [method, setMethod] = useState<InPersonMethod>('contante');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const intent = useRef<{ signature: string; requestId: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setAmount(formatCentsForInput(suggestedAmountCents)); setMethod('contante'); setNote(''); setError(null); intent.current = null;
  }, [open, bookingId, suggestedAmountCents]);

  const requestIdFor = (signature: string) => {
    if (!intent.current || intent.current.signature !== signature) intent.current = { signature, requestId: crypto.randomUUID() };
    return intent.current.requestId;
  };
  const cents = parseEuroToCents(amount);

  const mutation = useMutation({
    mutationFn: async () => {
      const built = buildInPersonDepositRequest({ amountText: amount, method, note, requestId: requestIdFor(`${amount}|${method}|${note}`) });
      if (!built.ok) throw new Error(built.error);
      return recordInPersonBookingDeposit(bookingId, built.body);
    },
    onSuccess: async () => {
      toast({ title: 'Acconto registrato', description: 'Prenotazione confermata e incasso scritto in cassa. Il link PayPal non è più utilizzabile.' });
      await Promise.all([
        client.invalidateQueries({ queryKey: ['bookings'] }),
        client.invalidateQueries({ queryKey: ['booking-payment', userId, bookingId] }),
        client.invalidateQueries({ queryKey: ['booking-payment-checkouts', userId] }),
        client.invalidateQueries({ queryKey: ['orders'] }),
      ]);
      intent.current = null;
      onRecorded?.();
      onOpenChange(false);
    },
    onError: (failure: Error) => setError(failure.message),
  });

  return <Dialog open={open} onOpenChange={next => { if (!mutation.isPending) onOpenChange(next); }}>
    <DialogContent className="sm:max-w-md" data-testid="in-person-deposit-dialog">
      <DialogHeader>
        <DialogTitle>Acconto incassato di persona</DialogTitle>
        <DialogDescription>
          Usa questo comando solo se hai già ricevuto il denaro. La prenotazione viene confermata, il link PayPal viene chiuso
          e l’incasso entra in cassa. L’importo può essere diverso da quello della campagna.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="in-person-amount">Importo ricevuto (€)</Label>
          <Input id="in-person-amount" inputMode="decimal" autoComplete="off" value={amount} aria-invalid={amount !== '' && cents === null}
            onChange={event => { setAmount(event.target.value); setError(null); }} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="in-person-method">Metodo</Label>
          <select id="in-person-method" value={method} onChange={event => { setMethod(event.target.value as InPersonMethod); setError(null); }}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
            {IN_PERSON_METHODS.map(value => <option key={value} value={value}>{IN_PERSON_METHOD_LABELS[value]}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="in-person-note">Nota (facoltativa)</Label>
          <Input id="in-person-note" maxLength={300} value={note} onChange={event => { setNote(event.target.value); setError(null); }} />
        </div>
        {cents !== null && <p className="rounded-md bg-muted p-3 text-sm" role="status">
          Registrerai <strong>{euro(cents)}</strong> ({IN_PERSON_METHOD_LABELS[method].toLowerCase()}). L’operazione non può essere ripetuta
          per la stessa prenotazione.</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>
      <DialogFooter>
        <Button variant="outline" disabled={mutation.isPending} onClick={() => onOpenChange(false)}>Annulla</Button>
        <Button disabled={cents === null || mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? 'Registrazione…' : 'Conferma incasso'}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
