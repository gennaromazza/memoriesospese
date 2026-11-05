import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminPasskeyClient } from '@/lib/admin-passkey';

/**
 * Verifies the admin passkey in place. It deliberately does not invoke or
 * replay the product save: the operator must explicitly press Save again.
 */
export function ProductPasskeyRecovery() {
  const [status, setStatus] = useState<'required' | 'verifying' | 'ready' | 'error'>('required');
  const [message, setMessage] = useState('');

  async function verify() {
    if (status === 'verifying') return;
    setStatus('verifying');
    setMessage('');
    try {
      await AdminPasskeyClient.verify();
      setStatus('ready');
      setMessage('Verifica completata. Il modulo è rimasto invariato: premi Salva Modifiche per inviare i dati.');
    } catch (error) {
      const cancelled = error instanceof Error && error.name === 'NotAllowedError';
      setStatus('error');
      setMessage(cancelled
        ? 'Verifica annullata. I dati sono ancora nel modulo; puoi riprovare quando vuoi.'
        : error instanceof Error ? error.message : 'Verifica non riuscita. I dati sono conservati; riprova.');
    }
  }

  return (
    <div
      role={status === 'error' ? 'alert' : 'status'}
      className={`rounded-lg border p-3 text-sm ${
        status === 'error'
          ? 'border-destructive/30 bg-destructive/5 text-destructive'
          : status === 'ready'
            ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
            : 'border-amber-300 bg-amber-50 text-amber-950'
      }`}
      data-testid="product-passkey-recovery"
    >
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {status === 'verifying'
              ? 'Verifica della passkey in corso'
              : status === 'ready'
                ? 'Verifica completata'
                : status === 'error'
                  ? 'Non è stato possibile verificare la passkey'
                  : 'La verifica di sicurezza è scaduta'}
          </p>
          <p className="mt-1">
            {message || 'Il modulo resta aperto e i dati, incluse le immagini, non verranno cancellati. Verifica la passkey, poi salva di nuovo.'}
          </p>
          {status !== 'ready' ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={verify}
              disabled={status === 'verifying'}
            >
              {status === 'verifying' ? 'Attendi la passkey…' : 'Verifica di nuovo la passkey'}
            </Button>
          ) : (
            <p className="mt-2 font-medium">Ora premi “Salva Modifiche” per inviare il modulo. Il salvataggio non è stato ritentato automaticamente.</p>
          )}
        </div>
      </div>
    </div>
  );
}
