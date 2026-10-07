import { useEffect, useState } from 'react';
import { Download, RotateCw } from 'lucide-react';
import { useUploadQueue } from '../lib/uploadQueue';
import type { DesktopUpdateStatus } from '../types/desktop';

const workingStatuses = new Set(['pending', 'compressing', 'hashing', 'uploading']);

export function UpdateNotice() {
  const desktop = window.imageStudioDesktop;
  const { items } = useUploadQueue();
  const [status, setStatus] = useState<DesktopUpdateStatus>({ phase: 'idle' });
  const [hidden, setHidden] = useState(false);
  const [message, setMessage] = useState('');
  const [workReported, setWorkReported] = useState(false);
  const busyCount = items.filter(item => workingStatuses.has(item.status)).length;

  useEffect(() => {
    if (!desktop) return;
    let received = false;
    const unsubscribe = desktop.onUpdateStatus(next => {
      received = true;
      setStatus(next);
      if (next.phase === 'ready' || next.phase === 'error') setHidden(false);
    });
    void desktop.getUpdateStatus().then(next => {
      if (!received) setStatus(next);
    }).catch(() => setStatus({ phase: 'error' }));
    return unsubscribe;
  }, [desktop]);

  useEffect(() => {
    if (!desktop) return;
    let current = true;
    setWorkReported(false);
    void desktop.setUpdateWorkCount(busyCount)
      .then(() => { if (current) setWorkReported(true); })
      .catch(() => { if (current) setWorkReported(false); });
    return () => { current = false; };
  }, [busyCount, desktop]);

  if (!desktop || status.phase === 'idle' || hidden) return null;

  const restart = async () => {
    setMessage('');
    try {
      const outcome = await desktop.installUpdate();
      if (!outcome.installed) {
        setMessage(outcome.reason === 'busy'
          ? 'Attendi la fine degli upload prima di riavviare.'
          : 'Impossibile avviare l’aggiornamento. Riprova più tardi.');
      }
    } catch {
      setMessage('Impossibile avviare l’aggiornamento. Riprova più tardi.');
    }
  };

  return (
    <section role="status" aria-live="polite" className="fixed bottom-5 right-5 z-[100] w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-border bg-background p-4 shadow-xl">
      <div className="flex items-start gap-3">
        <Download aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Aggiornamento Image Studio</p>
          {status.phase === 'checking' && <p className="mt-1 text-sm text-muted-foreground">Controllo nuove versioni…</p>}
          {status.phase === 'available' && <p className="mt-1 text-sm text-muted-foreground">Versione {status.version} disponibile. Avvio download…</p>}
          {status.phase === 'downloading' && (
            <>
              <p className="mt-1 text-sm text-muted-foreground">Download: {status.percent ?? 0}%</p>
              <div className="mt-2 h-2 rounded-full bg-muted" role="progressbar" aria-label="Download aggiornamento" aria-valuenow={status.percent ?? 0} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-primary" style={{ width: `${status.percent ?? 0}%` }} />
              </div>
            </>
          )}
          {status.phase === 'ready' && (
            <>
              <p className="mt-1 text-sm text-muted-foreground">
                Versione {status.version} pronta. {!workReported
                  ? 'Controllo della coda in corso…'
                  : busyCount > 0
                    ? 'Gli upload in corso non verranno interrotti: termina il lavoro prima di riavviare.'
                    : 'Riavvia per installarla. Il login e la coda salvata resteranno disponibili.'}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" disabled={!workReported || busyCount > 0} onClick={restart} className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">Riavvia e aggiorna</button>
                <button type="button" onClick={() => setHidden(true)} className="rounded-md border border-border px-3 py-1.5 text-sm">Più tardi</button>
              </div>
            </>
          )}
          {status.phase === 'error' && (
            <>
              <p className="mt-1 text-sm text-muted-foreground">Controllo o download non riuscito. L’app resta utilizzabile e riproverà automaticamente.</p>
              <button type="button" onClick={() => { setMessage(''); void desktop.checkForUpdates(); }} className="mt-2 inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm">
                <RotateCw aria-hidden="true" className="h-4 w-4" /> Riprova
              </button>
            </>
          )}
          {message && <p className="mt-2 text-sm text-destructive">{message}</p>}
        </div>
      </div>
    </section>
  );
}