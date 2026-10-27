import { useState } from 'react';
import { AlertCircle, Check, CheckCircle2, LoaderCircle, ShieldCheck } from 'lucide-react';
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
  if (approvedAt) return (
    <section role="status" data-testid="mockup-client-approved" className="rounded-xl border border-[#cbded1] bg-[#f1f7f1] px-3.5 py-3 text-[#35584c]">
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#dcebdd] text-[#52735c]"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /></span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">Mockup approvato</p>
          <p className="text-xs leading-5 text-[#61766a]">Conferma inviata il {new Date(approvedAt).toLocaleString('it-IT')}. La stampa non è stata avviata.</p>
        </div>
      </div>
    </section>
  );
  return (
    <section className="rounded-xl border border-[#d8e2da] bg-[#fbfcf8] px-3 py-2.5 text-[#3b514c] sm:px-4" data-testid="mockup-client-approval">
      <div className="flex flex-col gap-2 min-[390px]:flex-row min-[390px]:items-center min-[390px]:justify-between">
        <label className={`flex min-w-0 flex-1 cursor-pointer items-start gap-2.5 text-sm leading-5 ${disabled || loading || pending ? 'cursor-not-allowed text-[#86918b]' : 'text-[#52635d]'}`}>
          <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[#537665] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#789581]" checked={agreed} disabled={disabled || loading || pending} onChange={event => setAgreed(event.target.checked)} />
          <span>Ho visto l’anteprima e approvo questa revisione.</span>
        </label>
        <Button className="min-h-10 w-full shrink-0 gap-2 rounded-lg bg-[#45675b] px-3 text-sm font-semibold text-[#fbfcf8] transition-colors hover:bg-[#36584c] disabled:bg-[#dce4dc] disabled:text-[#86928a] min-[390px]:w-auto" data-testid="button-approve-mockup" disabled={!agreed || disabled || loading || pending} onClick={async () => {
          setPending(true); setError('');
          try { await onApprove(); }
          catch (error) { setError((error as Error).message || 'Non siamo riusciti a registrare la conferma. Riprova.'); }
          finally { setPending(false); }
        }}>
          {pending ? <><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />Invio della conferma…</> : <><Check className="h-4 w-4" aria-hidden="true" />Conferma mockup</>}
        </Button>
      </div>
      <p className="mt-1 text-xs leading-4 text-[#738079]">L’approvazione non avvia la stampa. Per modifiche, contatta lo studio.</p>
      {error && <p role="alert" className="mt-2 flex items-start gap-2 rounded-lg border border-[#ecd1c7] bg-[#fff5f1] px-3 py-2 text-sm leading-5 text-[#914f3d]"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{error}</p>}
      {disabled && <p role="status" className="mt-1 text-xs leading-4 text-[#796b51]">Questa revisione non è più disponibile. Contatta lo studio per il link aggiornato.</p>}
      {!disabled && loading && <p role="status" className="mt-1 text-xs leading-4 text-[#65766d]">Anteprima in caricamento…</p>}
    </section>
  );
}
