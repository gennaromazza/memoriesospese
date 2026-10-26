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
    <section role="status" data-testid="mockup-client-approved" className="relative overflow-hidden rounded-2xl border border-[#cbded1] bg-[#f1f7f1] p-5 text-[#35584c] shadow-[0_16px_40px_-32px_rgba(42,82,61,0.45)] sm:p-6">
      <div aria-hidden="true" className="absolute -right-6 -top-8 h-32 w-32 rounded-full border border-[#d8e7da]" />
      <div className="relative flex items-start gap-3.5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#dcebdd] text-[#52735c]"><CheckCircle2 className="h-5 w-5" aria-hidden="true" /></span>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#64806b]">Risposta registrata</p>
          <h2 className="mt-1 font-playfair text-xl text-[#35584c]">Mockup approvato</h2>
          <p className="mt-2 text-sm leading-6 text-[#526b5e]">Hai approvato questo mockup il {new Date(approvedAt).toLocaleString('it-IT')}. Lo studio ha ricevuto la tua conferma.</p>
          <p className="mt-3 border-t border-[#dce9dc] pt-3 text-xs leading-5 text-[#61766a]">La conferma riguarda questa revisione e non avvia automaticamente la stampa.</p>
        </div>
      </div>
    </section>
  );
  return (
    <section className="overflow-hidden rounded-2xl border border-[#d8e2da] bg-[#fbfcf8] text-[#3b514c] shadow-[0_18px_48px_-40px_rgba(39,68,61,0.55)]" data-testid="mockup-client-approval">
      <div className="border-b border-[#e6ece5] bg-[#f4f7f1] px-5 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-[#e2ebe2] text-[#577365]"><ShieldCheck className="h-[18px] w-[18px]" aria-hidden="true" /></span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#71847a]">La vostra risposta</p>
            <h2 className="font-playfair text-xl leading-tight text-[#334d47]">Conferma del mockup</h2>
          </div>
        </div>
      </div>
      <div className="space-y-4 px-5 py-5 sm:px-6 sm:py-6">
        <p className="text-sm leading-6 text-[#61716b]">Dopo aver sfogliato l’anteprima, potete inviare una conferma allo studio. Questa risposta è separata dalla visualizzazione: non modifica l’album e non avvia la stampa.</p>
        <label className={`flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border px-4 py-3.5 text-sm leading-5 transition-colors ${disabled || loading || pending ? 'cursor-not-allowed border-[#e3e8e1] bg-[#f5f6f2] text-[#86918b]' : agreed ? 'border-[#9fbaa7] bg-[#eef5ee] text-[#405d4e]' : 'border-[#dce5dc] bg-[#fafbf8] text-[#52635d] hover:border-[#b8cbbd] hover:bg-[#f6f9f4]'}`}>
          <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[#537665] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#789581]" checked={agreed} disabled={disabled || loading || pending} onChange={event => setAgreed(event.target.checked)} />
          <span>Ho controllato l’anteprima e confermo questa revisione.</span>
        </label>
        {error && <p role="alert" className="flex items-start gap-2 rounded-lg border border-[#ecd1c7] bg-[#fff5f1] px-3.5 py-3 text-sm leading-5 text-[#914f3d]"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{error}</p>}
        {disabled && <p role="status" className="rounded-lg border border-[#e7ddca] bg-[#faf6ed] px-3.5 py-3 text-sm leading-5 text-[#796b51]">Questa revisione non è più disponibile per una risposta. Contattate lo studio per il link aggiornato.</p>}
        {!disabled && loading && <p role="status" className="rounded-lg border border-[#dce5dc] bg-[#f5f8f3] px-3.5 py-3 text-sm leading-5 text-[#65766d]">L’anteprima è ancora in caricamento. Potrete confermare quando sarà pronta.</p>}
        <Button className="min-h-12 w-full gap-2 rounded-xl bg-[#45675b] px-5 text-sm font-semibold text-[#fbfcf8] shadow-[0_8px_20px_-12px_rgba(45,79,65,0.6)] transition-colors hover:bg-[#36584c] disabled:bg-[#dce4dc] disabled:text-[#86928a] disabled:shadow-none sm:w-auto" data-testid="button-approve-mockup" disabled={!agreed || disabled || loading || pending} onClick={async () => {
          setPending(true); setError('');
          try { await onApprove(); }
          catch (error) { setError((error as Error).message || 'Non siamo riusciti a registrare la conferma. Riprova.'); }
          finally { setPending(false); }
        }}>
          {pending ? <><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />Invio della conferma…</> : <><Check className="h-4 w-4" aria-hidden="true" />Conferma mockup</>}
        </Button>
        <p className="border-t border-[#e7ece5] pt-3 text-xs leading-5 text-[#738079]">La conferma viene registrata per questa revisione. Non avvia automaticamente la stampa. Per richiedere modifiche, contattate lo studio prima di confermare.</p>
      </div>
    </section>
  );
}
