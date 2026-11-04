import { useEffect, useState } from 'react';
import { CheckCircle2, Fingerprint, Loader2, ShieldAlert, XCircle } from 'lucide-react';
import { AdminPasskeyClient, type DeviceEnrollmentApprovalInfo } from '@/lib/admin-passkey';
import { AdminSecurityError } from '@/lib/admin-passkey';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

const enrollmentIdPattern = /^[A-Za-z0-9_-]{43}$/;

export default function AdminDeviceEnrollmentApprovalPage() {
  const enrollmentId = new URLSearchParams(window.location.search).get('deviceEnrollment');
  const validEnrollmentId = !!enrollmentId && enrollmentIdPattern.test(enrollmentId);
  const [info, setInfo] = useState<DeviceEnrollmentApprovalInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState<'approved' | 'rejected' | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!validEnrollmentId || !enrollmentId) {
      setLoading(false);
      setError('Il QR non contiene una richiesta valida.');
      return;
    }
    setLoading(true);
    setError(null);
    void AdminPasskeyClient.getDeviceEnrollmentApprovalInfo(enrollmentId)
      .then((result) => {
        if (!cancelled) setInfo(result);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(
          cause instanceof AdminSecurityError && cause.status === 404
            ? 'Richiesta non valida o non più disponibile. Accedi con l’account amministratore autorizzato oppure genera un nuovo QR.'
            : cause instanceof Error
              ? cause.message
              : 'Non è stato possibile caricare la richiesta.',
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enrollmentId, validEnrollmentId]);

  const approve = async () => {
    if (!enrollmentId) return;
    setBusy(true);
    setError(null);
    try {
      await AdminPasskeyClient.approveDeviceEnrollment(enrollmentId);
      setFinished('approved');
      setInfo((current) => current ? { ...current, status: 'approved' } : current);
    } catch (cause) {
      if (await refreshAfterUnavailableMutation(cause)) return;
      setError(
        cause instanceof Error && cause.name === 'NotAllowedError'
          ? 'Verifica annullata sul dispositivo. Nessuna passkey è stata autorizzata.'
          : cause instanceof Error
            ? cause.message
            : 'Non è stato possibile approvare la richiesta.',
      );
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    if (!enrollmentId) return;
    setBusy(true);
    setError(null);
    try {
      await AdminPasskeyClient.rejectDeviceEnrollment(enrollmentId);
      setFinished('rejected');
      setInfo((current) => current ? { ...current, status: 'rejected' } : current);
    } catch (cause) {
      if (await refreshAfterUnavailableMutation(cause)) return;
      setError(cause instanceof Error ? cause.message : 'Non è stato possibile rifiutare la richiesta.');
    } finally {
      setBusy(false);
    }
  };

  const refreshAfterUnavailableMutation = async (cause: unknown): Promise<boolean> => {
    if (!(cause instanceof AdminSecurityError) || ![404, 409, 410].includes(cause.status)) {
      return false;
    }
    try {
      const latest = await AdminPasskeyClient.getDeviceEnrollmentApprovalInfo(enrollmentId!);
      setInfo(latest);
      setFinished(null);
      setError(
        latest.status === 'pending'
          ? 'La richiesta è cambiata. Controlla lo stato aggiornato prima di riprovare.'
          : null,
      );
    } catch {
      // Se l'account non è il proprietario o la richiesta è stata rimossa,
      // elimina anche i dettagli già caricati.
      setInfo(null);
      setFinished(null);
      setError('Richiesta non valida o non più disponibile. Accedi con l’account amministratore autorizzato.');
    }
    return true;
  };

  const pending = info?.status === 'pending' && !finished;

  return (
    <main className="min-h-screen flex items-center justify-center bg-off-white p-4">
      <Card className="w-full max-w-md">
        <CardContent className="p-6 space-y-5">
          <header className="text-center space-y-2">
            <div className="mx-auto h-14 w-14 rounded-full bg-sage/15 flex items-center justify-center">
              <Fingerprint className="h-7 w-7 text-sage" />
            </div>
            <h1 className="text-xl font-semibold text-charcoal">Autorizza un nuovo dispositivo</h1>
            <p className="text-sm text-blue-gray">
              Controlla il nome prima di approvare. La conferma autorizza solo la registrazione di una nuova passkey:
              non trasferisce la tua sessione né apre il pannello sul nuovo dispositivo.
            </p>
          </header>

          {loading && (
            <div className="flex items-center justify-center gap-2 text-sm text-blue-gray" role="status">
              <Loader2 className="h-4 w-4 animate-spin" />
              Controllo richiesta…
            </div>
          )}

          {error && (
            <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
              {error}
            </p>
          )}

          {info && (
            <div className="rounded-md border border-sage/30 bg-sage/5 p-4 text-center space-y-1">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Dispositivo da autorizzare</p>
              <p className="font-semibold text-charcoal break-words">{info.deviceLabel}</p>
              {info.status === 'pending' && (
                <p className="text-xs text-blue-gray">
                  QR valido fino alle {new Date(info.expiresAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}.
                </p>
              )}
            </div>
          )}

          {finished === 'approved' && (
            <div className="flex items-start gap-2 rounded-md bg-green-50 p-3 text-sm text-green-800" role="status">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <p>Autorizzazione completata. Torna al dispositivo che ha mostrato il QR e completa lì la registrazione.</p>
            </div>
          )}
          {finished === 'rejected' && (
            <div className="flex items-start gap-2 rounded-md bg-gray-100 p-3 text-sm text-blue-gray" role="status">
              <XCircle className="h-5 w-5 shrink-0" />
              <p>Richiesta rifiutata. Sul nuovo dispositivo non verrà registrata alcuna passkey.</p>
            </div>
          )}
          {info && info.status === 'expired' && (
            <div className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-900" role="status">
              <ShieldAlert className="h-5 w-5 shrink-0" />
              <p>Questo QR è scaduto. Generane uno nuovo dal dispositivo da autorizzare.</p>
            </div>
          )}
          {info && info.status === 'approved' && !finished && (
            <p className="text-sm text-green-800 text-center" role="status">
              Richiesta già approvata. Completa la registrazione sul nuovo dispositivo.
            </p>
          )}
          {info && (info.status === 'registered' || info.status === 'cancelled' || info.status === 'rejected') && !finished && (
            <p className="text-sm text-blue-gray text-center" role="status">
              {info.status === 'cancelled'
                ? 'Richiesta annullata. Non può essere approvata; genera un nuovo QR se serve.'
                : info.status === 'rejected'
                  ? 'Richiesta rifiutata. Non può essere approvata; genera un nuovo QR se serve.'
                  : 'La registrazione è già stata completata. Questa richiesta non può essere approvata di nuovo.'}
            </p>
          )}

          {pending && (
            <div className="space-y-2">
              <Button className="w-full" onClick={() => void approve()} disabled={busy}>
                <Fingerprint className="mr-2 h-4 w-4" />
                {busy ? 'Attendi la verifica…' : 'Approva e verifica con passkey'}
              </Button>
              <Button type="button" variant="outline" className="w-full" onClick={() => void reject()} disabled={busy}>
                Rifiuta richiesta
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
