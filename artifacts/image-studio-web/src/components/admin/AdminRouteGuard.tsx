/**
 * Guard di tutte le route `/admin/*` (login escluso).
 *
 * 1. Richiede un utente Firebase con email amministrativa (mai localStorage).
 * 2. Se la passkey è obbligatoria e la sessione non è verificata, mostra la
 *    schermata di verifica al posto del contenuto: il pannello non viene
 *    montato, quindi non parte nessuna lettura Firestore o chiamata API.
 * 3. Finché l'obbligo non è attivo mostra un promemoria per configurarla.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { signOut } from 'firebase/auth';
import { Fingerprint, KeyRound, LogOut, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { createUrl } from '@/lib/basePath';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';
import {
  AdminPasskeyClient,
  AdminPasskeyRefreshError,
  AdminSecurityError,
  type PreviewPasskeyHandoff,
  type ExpectedAdminPasskeyClaim,
  type AdminSecurityStatus,
} from '@/lib/admin-passkey';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

export const ADMIN_SECURITY_STATUS_KEY = ['admin-security', 'status'] as const;

export function useAdminSecurityStatus(enabled: boolean) {
  return useQuery<AdminSecurityStatus, Error>({
    queryKey: ADMIN_SECURITY_STATUS_KEY,
    queryFn: () => AdminPasskeyClient.getStatus(),
    enabled,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: true,
    retry: 1,
  });
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-off-white">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sage mx-auto" />
        <p className="mt-4 text-blue-gray">{label}</p>
      </div>
    </div>
  );
}

export function AdminRouteGuard({ children }: { children: ReactNode }) {
  const { user, isLoading: authLoading, isAdmin } = useFirebaseAuth();
  const [location, navigate] = useLocation();
  const status = useAdminSecurityStatus(!authLoading && !!user && isAdmin);
  const desktopHandoffId = new URLSearchParams(window.location.search).get('desktopHandoff');
  const validDesktopHandoff =
    typeof desktopHandoffId === 'string' && /^[A-Za-z0-9_-]{43}$/.test(desktopHandoffId);

  useEffect(() => {
    if (authLoading) return;
    if (!user || !isAdmin) {
      // Nessun flag locale può sostituire l'identità verificata.
      localStorage.removeItem('isAdmin');
      const loginPath = validDesktopHandoff
        ? `/admin?desktopHandoff=${encodeURIComponent(desktopHandoffId)}`
        : '/admin';
      navigate(createUrl(loginPath), { replace: true });
    }
  }, [authLoading, user, isAdmin, navigate, validDesktopHandoff, desktopHandoffId]);

  if (authLoading || !user || !isAdmin) {
    return <Spinner label="Verifica autenticazione..." />;
  }

  if (status.isPending) {
    return <Spinner label="Controllo sicurezza accesso..." />;
  }

  if (status.isError) {
    return (
      <StatusUnavailable
        message={status.error.message}
        onRetry={() => void status.refetch()}
      />
    );
  }

  const data = status.data;
  const expired = data.verifiedUntil !== null && data.verifiedUntil <= Date.now();
  const allowHandoffPage =
    location.startsWith('/admin/sicurezza') && validDesktopHandoff;
  if (data.passkeyRequired && (!data.verified || expired) && !allowHandoffPage) {
    return <AdminPasskeyVerification status={data} />;
  }

  const onSecurityPage = location.startsWith('/admin/sicurezza');
  return (
    <>
      {!data.passkeyRequired && !onSecurityPage && <PasskeySetupReminder enrolled={data.passkeys.length > 0} />}
      {children}
    </>
  );
}

function StatusUnavailable({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-off-white p-4">
      <Card className="max-w-md w-full">
        <CardContent className="p-6 text-center space-y-4">
          <ShieldAlert className="h-10 w-10 text-red-500 mx-auto" />
          <h1 className="text-lg font-semibold text-charcoal">Controllo di sicurezza non disponibile</h1>
          <p className="text-sm text-blue-gray">
            Non è stato possibile verificare lo stato della passkey amministratore. Per sicurezza il pannello
            resta chiuso finché il controllo non riesce.
          </p>
          <p className="text-xs text-muted-foreground break-words">{message}</p>
          <Button onClick={onRetry} data-testid="button-retry-security-status">Riprova</Button>
        </CardContent>
      </Card>
    </div>
  );
}

function PasskeySetupReminder({ enrolled }: { enrolled: boolean }) {
  const [, navigate] = useLocation();
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem('admin-passkey-reminder') === '1');
  if (dismissed) return null;
  return (
    <div
      className="bg-amber-50 border-b border-amber-200 text-amber-900 text-sm px-4 py-2 flex flex-wrap items-center gap-3 justify-center"
      data-testid="banner-passkey-setup"
    >
      <ShieldAlert className="h-4 w-4 shrink-0" />
      <span>
        {enrolled
          ? 'Hai una passkey ma non è ancora obbligatoria: attivala per proteggere il pannello anche in caso di password compromessa.'
          : 'Il pannello è protetto solo dalla password. Configura una passkey (impronta, volto o PIN del dispositivo).'}
      </span>
      <Button size="sm" variant="outline" onClick={() => navigate(createUrl('/admin/sicurezza'))} data-testid="button-open-security">
        Configura
      </Button>
      <button
        type="button"
        className="underline text-xs"
        onClick={() => {
          sessionStorage.setItem('admin-passkey-reminder', '1');
          setDismissed(true);
        }}
      >
        Più tardi
      </button>
    </div>
  );
}

export function AdminPasskeyVerification({ status }: { status: AdminSecurityStatus }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [busy, setBusy] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [refreshingSession, setRefreshingSession] = useState(false);
  const [refreshExpectedClaim, setRefreshExpectedClaim] = useState<ExpectedAdminPasskeyClaim | null>(null);
  const [needsSessionRefresh, setNeedsSessionRefresh] = useState(false);
  const [previewHandoff, setPreviewHandoff] = useState<PreviewPasskeyHandoff | null>(null);
  const [startingPreviewHandoff, setStartingPreviewHandoff] = useState(false);
  const [previewHandoffError, setPreviewHandoffError] = useState<string | null>(null);
  const supportsPasskeys = AdminPasskeyClient.supportsPasskeys();
  const locked = status.lockedUntil !== null && status.lockedUntil > Date.now();
  const hostname = window.location.hostname.toLowerCase();
  const currentRpId = hostname.startsWith('www.') ? hostname.slice(4) : hostname;
  const hasCurrentOriginPasskey = status.passkeys.some((passkey) => passkey.rpId === currentRpId);
  const canUseProductionHandoff =
    currentRpId !== 'imagestudiofotografico.com' &&
    status.passkeys.some((passkey) => passkey.rpId === 'imagestudiofotografico.com');

  useEffect(() => {
    if (!previewHandoff) return;
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      if (cancelled) return;
      if (Date.now() >= previewHandoff.expiresAt) {
        setPreviewHandoffError('La richiesta è scaduta. Avviane una nuova.');
        setPreviewHandoff(null);
        return;
      }

      try {
        const result = await AdminPasskeyClient.getPreviewHandoffStatus(previewHandoff);
        if (cancelled) return;
        if (result.status === 'expired') {
          setPreviewHandoffError('La richiesta è scaduta. Avviane una nuova.');
          setPreviewHandoff(null);
          return;
        }
        if (result.status === 'verified') {
          try {
            await AdminPasskeyClient.completePreviewHandoff(previewHandoff);
            if (cancelled) return;
            setPreviewHandoff(null);
            setPreviewHandoffError(null);
            await queryClient.invalidateQueries({ queryKey: ADMIN_SECURITY_STATUS_KEY });
            toast({
              title: 'Accesso Preview verificato',
              description: 'La passkey del sito pubblico ha autorizzato questa sessione.',
            });
          } catch (error) {
            if (cancelled) return;
            setPreviewHandoff(null);
            setPreviewHandoffError(
              error instanceof Error ? error.message : 'Non è stato possibile completare la verifica.',
            );
            void queryClient.invalidateQueries({ queryKey: ADMIN_SECURITY_STATUS_KEY });
          }
          return;
        }
      } catch (error) {
        if (cancelled) return;
        if (error instanceof AdminSecurityError && error.status < 500) {
          setPreviewHandoffError(error.message);
          setPreviewHandoff(null);
          return;
        }
        setPreviewHandoffError('Connessione in attesa: continuo a controllare la verifica.');
      }

      if (!cancelled) {
        pollTimer = setTimeout(() => void poll(), 1800);
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (pollTimer !== undefined) clearTimeout(pollTimer);
    };
  }, [previewHandoff, queryClient, toast]);

  const startPreviewHandoff = async () => {
    setStartingPreviewHandoff(true);
    setPreviewHandoffError(null);
    try {
      setPreviewHandoff(await AdminPasskeyClient.startPreviewHandoff());
    } catch (error) {
      setPreviewHandoffError(
        error instanceof Error ? error.message : 'Non è stato possibile avviare la verifica.',
      );
    } finally {
      setStartingPreviewHandoff(false);
    }
  };

  const finish = async (action: () => Promise<number>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: ADMIN_SECURITY_STATUS_KEY });
      toast({ title: 'Verifica completata', description: 'Accesso amministrativo sbloccato.' });
    } catch (err) {
      if (err instanceof AdminPasskeyRefreshError) {
        setRefreshExpectedClaim(err.expectedClaim);
        setNeedsSessionRefresh(true);
        setRefreshError(err.message);
        setError(null);
        setShowRecovery(false);
        setRecoveryCode('');
        void queryClient.invalidateQueries({ queryKey: ADMIN_SECURITY_STATUS_KEY });
        return;
      }
      const message =
        err instanceof AdminSecurityError
          ? err.message
          : err instanceof Error && err.name === 'NotAllowedError'
            ? 'Verifica annullata o non riuscita sul dispositivo.'
            : err instanceof Error
              ? err.message
              : 'Verifica non riuscita';
      setError(message);
      void queryClient.invalidateQueries({ queryKey: ADMIN_SECURITY_STATUS_KEY });
    } finally {
      setBusy(false);
    }
  };

  const refreshSession = async () => {
    const expectedClaim = needsSessionRefresh ? refreshExpectedClaim : status.expectedClaim;
    if (!needsSessionRefresh && !expectedClaim) {
      setRefreshError('Il server non ha ancora reso disponibile il claim atteso. Riprova tra poco.');
      return;
    }
    setRefreshingSession(true);
    setRefreshError(null);
    try {
      await AdminPasskeyClient.refreshEnforcementClaim(expectedClaim);
      setNeedsSessionRefresh(false);
      setRefreshExpectedClaim(null);
      await queryClient.invalidateQueries({ queryKey: ADMIN_SECURITY_STATUS_KEY });
      toast({ title: 'Sessione aggiornata', description: 'Il controllo passkey verrà ripetuto.' });
    } catch (err) {
      setRefreshError(
        err instanceof AdminPasskeyRefreshError || err instanceof Error
          ? err.message
          : 'Aggiornamento della sessione non riuscito. Riprova.',
      );
    } finally {
      setRefreshingSession(false);
    }
  };

  const logout = async () => {
    await signOut(auth);
    localStorage.removeItem('isAdmin');
    navigate(createUrl('/admin'));
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-off-white p-4">
      <Card className="max-w-md w-full">
        <CardContent className="p-6 space-y-5">
          <div className="text-center space-y-2">
            <div className="mx-auto h-14 w-14 rounded-full bg-sage/15 flex items-center justify-center">
              <Fingerprint className="h-7 w-7 text-sage" />
            </div>
            <h1 className="text-xl font-semibold text-charcoal">Verifica passkey</h1>
            <p className="text-sm text-blue-gray">
              La password non basta: conferma la tua identità con impronta, volto o PIN del dispositivo. La
              biometria resta sul tuo dispositivo, il server verifica solo la firma.
            </p>
            {status.expectedClaim && (
              <p className="text-xs text-blue-gray">
                Se hai appena attivato l'obbligo e la sessione non si è aggiornata, riprova qui senza uscire.
              </p>
            )}
          </div>

          {locked && (
            <p className="text-sm text-red-600 text-center" data-testid="text-security-locked">
              Troppi tentativi falliti. Riprova dopo le{' '}
              {new Date(status.lockedUntil!).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}.
            </p>
          )}

          {!supportsPasskeys && (
            <p className="text-sm text-amber-700 text-center">
              Questo browser non supporta le passkey: usa un codice di recupero oppure un altro dispositivo.
            </p>
          )}

          {error && (
            <p className="text-sm text-red-600 text-center" data-testid="text-passkey-error">
              {error}
            </p>
          )}
          {refreshError && (
            <p className="text-sm text-red-600 text-center" role="alert" data-testid="text-passkey-refresh-error">
              {refreshError}
            </p>
          )}
          {previewHandoffError && (
            <p className="text-sm text-amber-800 text-center" role="status" data-testid="text-preview-handoff-error">
              {previewHandoffError}
            </p>
          )}

          {(needsSessionRefresh || status.expectedClaim) && (
            <Button
              variant="outline"
              className="w-full"
              disabled={busy || refreshingSession}
              onClick={() => void refreshSession()}
              data-testid="button-retry-passkey-token-refresh"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshingSession ? 'animate-spin' : ''}`} />
              {refreshingSession ? 'Aggiornamento sessione…' : 'Riprova aggiornamento sessione'}
            </Button>
          )}

          {needsSessionRefresh && (
            <p className="text-sm text-amber-800 text-center" role="status" data-testid="text-passkey-refresh-pending">
              Il server ha completato la verifica e ha consumato l’eventuale codice monouso. Aggiorna la sessione
              qui sotto; non reinserire il codice.
            </p>
          )}

          {!showRecovery ? (
            <div className="space-y-3">
              {canUseProductionHandoff && (
                <div className="rounded-md border border-sage/30 bg-sage/5 p-3 space-y-2">
                  <p className="text-sm text-blue-gray">
                    La tua passkey è associata al sito ufficiale, non a questo dominio Preview. Verificala sul sito
                    ufficiale: autorizzeremo questa sessione senza registrare un’altra passkey.
                  </p>
                  {!previewHandoff ? (
                    <Button
                      className="w-full"
                      disabled={startingPreviewHandoff || locked || needsSessionRefresh}
                      onClick={() => void startPreviewHandoff()}
                      data-testid="button-start-preview-handoff"
                    >
                      <ShieldCheck className="h-4 w-4 mr-2" />
                      {startingPreviewHandoff ? 'Preparo la verifica…' : 'Verifica con la passkey del sito'}
                    </Button>
                  ) : (
                    <div className="space-y-2">
                      <a
                        className="inline-flex w-full items-center justify-center rounded-md bg-sage px-4 py-2 text-sm font-medium text-white hover:bg-sage/90"
                        href={previewHandoff.verificationUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid="link-open-production-handoff"
                      >
                        Apri il sito e conferma la passkey
                      </a>
                      <p className="text-xs text-center text-muted-foreground">
                        Torna qui dopo la conferma: questa scheda si sbloccherà automaticamente.
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        className="w-full"
                        onClick={() => {
                          setPreviewHandoff(null);
                          setPreviewHandoffError(null);
                        }}
                        data-testid="button-cancel-preview-handoff"
                      >
                        Annulla richiesta
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {hasCurrentOriginPasskey && (
                <Button
                  className="w-full"
                  disabled={busy || needsSessionRefresh || locked || !supportsPasskeys}
                  onClick={() => void finish(() => AdminPasskeyClient.verify())}
                  data-testid="button-verify-passkey"
                >
                  <ShieldCheck className="h-4 w-4 mr-2" />
                  {busy ? 'Verifica in corso…' : 'Verifica con passkey'}
                </Button>
              )}
              <Button
                variant="ghost"
                className="w-full"
                disabled={busy || needsSessionRefresh}
                onClick={() => setShowRecovery(true)}
                data-testid="button-use-recovery-code"
              >
                <KeyRound className="h-4 w-4 mr-2" />
                Usa un codice di recupero
              </Button>
            </div>
          ) : (
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                void finish(() => AdminPasskeyClient.redeemRecoveryCode(recoveryCode));
              }}
            >
              <Input
                value={recoveryCode}
                onChange={(event) => setRecoveryCode(event.target.value)}
                placeholder="XXXX-XXXX-XXXX"
                autoComplete="one-time-code"
                autoFocus
                data-testid="input-recovery-code"
              />
              <p className="text-xs text-muted-foreground">
                Ogni codice vale una sola volta e concede 30 minuti per registrare una nuova passkey dalla
                pagina Sicurezza Accesso.
              </p>
              <Button type="submit" className="w-full" disabled={busy || needsSessionRefresh || locked || recoveryCode.trim().length < 8} data-testid="button-submit-recovery-code">
                {busy ? 'Verifica in corso…' : 'Conferma codice'}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => setShowRecovery(false)}>
                Torna alla passkey
              </Button>
            </form>
          )}

          <button
            type="button"
            className="w-full text-xs text-blue-gray underline flex items-center justify-center gap-1"
            onClick={() => void logout()}
            data-testid="button-logout-from-verification"
          >
            <LogOut className="h-3 w-3" /> Esci dall'account
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
