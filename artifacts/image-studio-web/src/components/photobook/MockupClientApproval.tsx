import { useState } from 'react';
import { Button } from '@/components/ui/button';

export default function MockupClientApproval({ approvedAt, disabled, loading = false, onApprove }: {
  approvedAt?: string;
  disabled: boolean;
  loading?: boolean;
  onApprove: () => Promise<void>;
}) {
  const [agreed, setAgreed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  if (approvedAt) return <p role="status" data-testid="mockup-client-approved" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">Hai approvato questo mockup il {new Date(approvedAt).toLocaleString('it-IT')}. Lo studio ha ricevuto la tua approvazione. La stampa non parte automaticamente.</p>;
  return <div className="space-y-2" data-testid="mockup-client-approval">
    <p className="text-sm">Controlla foto, rivestimento e scritte. Puoi approvare il mockup senza modificarlo.</p>
    <label className="flex min-h-11 items-start gap-2 text-sm">
      <input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={agreed} disabled={disabled || loading || pending} onChange={event => setAgreed(event.target.checked)} />
      <span>Ho controllato l’anteprima e approvo questo mockup.</span>
    </label>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {disabled && <p role="status" className="text-sm text-muted-foreground">Questa versione non è più approvabile. Contatta lo studio per il link aggiornato.</p>}
    {!disabled && loading && <p role="status" className="text-sm text-muted-foreground">Attendi il caricamento dell’anteprima prima di approvare.</p>}
    <Button className="min-h-11 w-full sm:w-auto" data-testid="button-approve-mockup" disabled={!agreed || disabled || loading || pending} onClick={async () => {
      setPending(true); setError('');
      try { await onApprove(); }
      catch (error) { setError((error as Error).message || 'Approvazione non riuscita. Riprova.'); }
      finally { setPending(false); }
    }}>{pending ? 'Invio approvazione…' : 'Approva mockup'}</Button>
    <p className="text-xs text-muted-foreground">L’approvazione viene registrata per questa revisione. Non avvia automaticamente la stampa. Per modifiche, contatta lo studio prima di approvare.</p>
  </div>;
}
