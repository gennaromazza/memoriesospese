/**
 * Pagina "Sicurezza Accesso": gestione passkey dell'amministratore.
 * Percorso consigliato: registra, salva i codici, autentica la passkey sul sito
 * di produzione e solo allora rendila obbligatoria.
 */
import { useState } from 'react';
import { useLocation } from 'wouter';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, Copy, Fingerprint, KeyRound, RefreshCw, ShieldCheck, ShieldOff, Trash2 } from 'lucide-react';
import Navigation from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { createUrl } from '@/lib/basePath';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';
import {
  AdminPasskeyClient,
  AdminPasskeyRefreshError,
  AdminSecurityError,
  type ExpectedAdminPasskeyClaim,
} from '@/lib/admin-passkey';
import { ADMIN_SECURITY_STATUS_KEY, useAdminSecurityStatus } from '@/components/admin/AdminRouteGuard';

function describeError(error: unknown): string {
  if (error instanceof AdminSecurityError) return error.message;
  if (error instanceof Error && error.name === 'NotAllowedError') return 'Operazione annullata sul dispositivo.';
  if (error instanceof Error && error.name === 'InvalidStateError') return 'Questa passkey è già registrata su questo dispositivo.';
  return error instanceof Error ? error.message : 'Operazione non riuscita';
}

function formatDate(ms: number | null): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleString('it-IT', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function AdminSecurityPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, isAdmin } = useFirebaseAuth();
  const status = useAdminSecurityStatus(!!user && isAdmin);
  const pageParams = new URLSearchParams(window.location.search);
  const desktopHandoffId = pageParams.get('desktopHandoff');
  const handoffTarget = pageParams.get('handoffTarget') === 'preview' ? 'preview' : 'windows';
  const [label, setLabel] = useState('');
  const [freshCodes, setFreshCodes] = useState<string[] | null>(null);
  const [pendingRevoke, setPendingRevoke] = useState<{ id: string; label: string } | null>(null);
  const [confirmEnforce, setConfirmEnforce] = useState(false);
  const [sessionRefreshClaim, setSessionRefreshClaim] = useState<ExpectedAdminPasskeyClaim | null>(null);
  const [sessionRefreshPending, setSessionRefreshPending] = useState(false);
  const [sessionRefreshError, setSessionRefreshError] = useState<string | null>(null);
  const [rememberThisDevice, setRememberThisDevice] = useState(false);
  const [rememberDeviceLabel, setRememberDeviceLabel] = useState('Browser personale');
  const [pendingDeviceRevoke, setPendingDeviceRevoke] = useState<{ id: string; label: string } | null>(null);
  const [confirmRevokeAllDevices, setConfirmRevokeAllDevices] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ADMIN_SECURITY_STATUS_KEY });
  const fail = (error: unknown) =>
    toast({ title: 'Operazione non riuscita', description: describeError(error), variant: 'destructive' });
  const preserveCompletedOperation = (error: unknown) => {
    if (!(error instanceof AdminPasskeyRefreshError)) return false;
    setSessionRefreshClaim(error.expectedClaim);
    setSessionRefreshPending(true);
    setSessionRefreshError(error.message);
    void refresh();
    toast({
      title: 'Operazione completata, sessione da aggiornare',
      description: 'Il server ha già completato l’operazione. Aggiorna la sessione senza ripeterla.',
      variant: 'destructive',
    });
    return true;
  };

  const register = useMutation({
    mutationFn: () => AdminPasskeyClient.register(label),
    onSuccess: (passkey) => {
      setLabel('');
      toast({ title: 'Passkey registrata', description: `"${passkey.label}" è pronta per la verifica.` });
      void refresh();
    },
    onError: fail,
  });

  const verifyNow = useMutation({
    mutationFn: () => AdminPasskeyClient.verify(
      rememberThisDevice
        ? { rememberDevice: true, deviceLabel: rememberDeviceLabel.trim() }
        : undefined,
    ),
    onSuccess: () => {
      toast({
        title: 'Verifica riuscita',
        description: rememberThisDevice
          ? 'Questo browser è stato ricordato per 30 giorni.'
          : undefined,
      });
      void refresh();
    },
    onError: (error) => {
      if (!preserveCompletedOperation(error)) fail(error);
    },
  });

  const revokeRememberedDevice = useMutation({
    mutationFn: (deviceId: string) => AdminPasskeyClient.forgetRememberedDevice(deviceId),
    onSuccess: () => {
      setPendingDeviceRevoke(null);
      toast({ title: 'Dispositivo dimenticato', description: 'La fiducia è stata revocata anche per i token già emessi.' });
      void refresh();
    },
    onError: fail,
  });

  const revokeAllRememberedDevices = useMutation({
    mutationFn: () => AdminPasskeyClient.forgetAllRememberedDevices(),
    onSuccess: () => {
      setConfirmRevokeAllDevices(false);
      toast({ title: 'Dispositivi dimenticati', description: 'Tutte le sessioni ricordate sono state revocate.' });
      void refresh();
    },
    onError: fail,
  });
  const verifyForHandoff = useMutation({
    mutationFn: () => {
      if (!desktopHandoffId) throw new Error('Richiesta di verifica non valida.');
      return AdminPasskeyClient.verifyForDesktopHandoff(desktopHandoffId);
    },
    onSuccess: () => {
      toast({
        title: 'Passkey verificata',
        description: handoffTarget === 'preview'
          ? 'Torna alla Preview Replit: si sbloccherà automaticamente.'
          : 'Torna all’app Windows: la sessione si aggiornerà automaticamente.',
      });
      void refresh();
    },
    onError: fail,
  });

  const recoveryCodes = useMutation({
    mutationFn: () => AdminPasskeyClient.regenerateRecoveryCodes(),
    onSuccess: (codes) => {
      setFreshCodes(codes);
      void refresh();
    },
    onError: fail,
  });

  const revoke = useMutation({
    mutationFn: (id: string) => AdminPasskeyClient.revoke(id),
    onSuccess: () => {
      toast({ title: 'Passkey revocata', description: 'Le verifiche precedenti non sono più valide.' });
      setPendingRevoke(null);
      void refresh();
    },
    onError: (error) => {
      setPendingRevoke(null);
      if (!preserveCompletedOperation(error)) fail(error);
    },
  });

  const refreshEnforcementSession = useMutation({
    mutationFn: (claim: ExpectedAdminPasskeyClaim | null) => AdminPasskeyClient.refreshEnforcementClaim(claim),
    onSuccess: () => {
      setSessionRefreshClaim(null);
      setSessionRefreshPending(false);
      setSessionRefreshError(null);
      toast({ title: 'Sessione aggiornata', description: 'Il token Firebase è stato aggiornato.' });
      void refresh();
    },
    onError: (error) => {
      setSessionRefreshError(describeError(error));
    },
  });

  const enforcement = useMutation({
    mutationFn: (required: boolean) => AdminPasskeyClient.setEnforcement(required),
    onSuccess: (_, required) => {
      setSessionRefreshClaim(null);
      setSessionRefreshPending(false);
      setSessionRefreshError(null);
      toast({
        title: required ? 'Passkey obbligatoria attivata' : 'Obbligo passkey disattivato',
        description: required
          ? 'Da ora il pannello, le API e i dati amministrativi richiedono la verifica passkey.'
          : 'Il pannello torna accessibile con la sola password.',
      });
      setConfirmEnforce(false);
      void refresh();
    },
    onError: (error) => {
      setConfirmEnforce(false);
      if (!preserveCompletedOperation(error)) fail(error);
    },
  });

  const data = status.data;
  const canEnforce = !!data && data.passkeys.length > 0 && data.recoveryCodesRemaining > 0 && data.activationReady;
  const freshPasskeyRequired = !!data && (data.passkeys.length > 0 || data.passkeyRequired);
  const copyCodes = async () => {
    if (!freshCodes) return;
    await navigator.clipboard.writeText(freshCodes.join('\n'));
    toast({ title: 'Codici copiati', description: 'Conservali in un luogo sicuro: non verranno mostrati di nuovo.' });
  };

  return (
    <div className="min-h-screen bg-off-white">
      <Navigation isAdminNav={true} />
      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate(createUrl('/admin/dashboard'))} data-testid="button-back-dashboard">
            <ArrowLeft className="h-4 w-4 mr-1" /> Dashboard
          </Button>
          <h1 className="text-2xl font-semibold text-charcoal">Sicurezza Accesso</h1>
        </div>

        {status.isError && (
          <Card>
            <CardContent className="p-4 text-sm text-red-600">{status.error.message}</CardContent>
          </Card>
        )}

        {data && (
          <>
            {desktopHandoffId && (
              <Card data-testid={handoffTarget === 'preview' ? 'card-preview-passkey-handoff' : 'card-windows-passkey-handoff'}>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Fingerprint className="h-5 w-5 text-sage" />
                    {handoffTarget === 'preview'
                      ? 'Verifica per la Preview Replit'
                      : 'Verifica per l’app Windows'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {verifyForHandoff.isSuccess ? (
                    <p className="text-sm text-sage" role="status">
                      {handoffTarget === 'preview'
                        ? 'Verifica completata. Torna alla Preview Replit: si sbloccherà automaticamente.'
                        : 'Verifica completata. Torna all’app Windows; la sessione si aggiornerà automaticamente.'}
                    </p>
                  ) : (
                    <>
                      <p className="text-sm text-blue-gray">
                        {handoffTarget === 'preview'
                          ? 'Questa richiesta è stata avviata dalla Preview Replit. Verifica qui la tua passkey per autorizzare solo quella sessione.'
                          : 'Questa richiesta è stata avviata dall’app Windows. Verifica qui la tua passkey per autorizzare solo la sessione Windows che ha aperto questa pagina.'}
                      </p>
                      <Button
                        disabled={verifyForHandoff.isPending || !AdminPasskeyClient.supportsPasskeys()}
                        onClick={() => verifyForHandoff.mutate()}
                        data-testid={handoffTarget === 'preview' ? 'button-verify-preview-handoff' : 'button-verify-windows-handoff'}
                      >
                        <Fingerprint className="h-4 w-4 mr-1" />
                        {verifyForHandoff.isPending
                          ? 'Attendi il dispositivo…'
                          : handoffTarget === 'preview'
                            ? 'Verifica passkey per la Preview'
                            : 'Verifica passkey per Windows'}
                      </Button>
                      {!AdminPasskeyClient.supportsPasskeys() && (
                        <p className="text-sm text-amber-700">
                          Questo browser non supporta le passkey. Apri il link in un browser compatibile.
                        </p>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Stato */}
            <Card data-testid="card-security-state">
              <CardContent className="p-5 flex flex-wrap items-center gap-4 justify-between">
                <div className="flex items-center gap-3">
                  {data.passkeyRequired ? (
                    <ShieldCheck className="h-8 w-8 text-sage" />
                  ) : (
                    <ShieldOff className="h-8 w-8 text-amber-500" />
                  )}
                  <div>
                    <p className="font-medium text-charcoal">
                      {data.passkeyRequired ? 'Passkey obbligatoria attiva' : 'Passkey non ancora obbligatoria'}
                    </p>
                    <p className="text-sm text-blue-gray">
                      {data.verified && data.verifiedUntil
                        ? `Sessione verificata fino alle ${formatDate(data.verifiedUntil)}`
                        : 'Sessione corrente non verificata con passkey'}
                    </p>
                  </div>
                </div>
                {data.passkeys.length > 0 && (
                  <div className="flex flex-col items-start gap-2">
                    {data.passkeyRequired &&
                      window.location.hostname.replace(/^www\./, '') === 'imagestudiofotografico.com' && (
                        <div className="space-y-2">
                          <label className="flex items-start gap-2 text-xs text-blue-gray">
                            <input
                              type="checkbox"
                              checked={rememberThisDevice}
                              onChange={(event) => setRememberThisDevice(event.target.checked)}
                              data-testid="checkbox-remember-device-security"
                            />
                            <span>
                              Ricorda questo browser per 30 giorni
                              <span className="block">Solo su dispositivi personali, non condivisi.</span>
                            </span>
                          </label>
                          {rememberThisDevice && (
                            <Input
                              value={rememberDeviceLabel}
                              onChange={(event) => setRememberDeviceLabel(event.target.value)}
                              placeholder="Nome del dispositivo"
                              maxLength={60}
                              aria-label="Nome del browser personale"
                              data-testid="input-remember-device-label-security"
                            />
                          )}
                        </div>
                      )}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={verifyNow.isPending || (rememberThisDevice && !rememberDeviceLabel.trim())}
                      onClick={() => verifyNow.mutate()}
                      data-testid="button-verify-now"
                    >
                      <Fingerprint className="h-4 w-4 mr-1" /> Verifica ora
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 1. Passkey */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <span className="rounded-full bg-sage/15 text-sage h-6 w-6 inline-flex items-center justify-center text-xs">1</span>
                  Le tue passkey
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {data.passkeys.length === 0 ? (
                  <p className="text-sm text-blue-gray">
                    Nessuna passkey registrata. Registrala dal dispositivo che usi abitualmente: userai impronta,
                    volto o PIN, senza che la biometria lasci il dispositivo.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {data.passkeys.map((passkey) => (
                      <li key={passkey.id} className="py-3 flex items-center justify-between gap-3" data-testid={`row-passkey-${passkey.id}`}>
                        <div>
                          <p className="font-medium text-charcoal flex items-center gap-2">
                            {passkey.label}
                            {passkey.backedUp && <Badge variant="secondary">sincronizzata</Badge>}
                          </p>
                          <p className="text-xs text-blue-gray">
                            {passkey.rpId} · creata {formatDate(passkey.createdAt)} · ultimo uso {formatDate(passkey.lastUsedAt)}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Revoca ${passkey.label}`}
                          onClick={() => setPendingRevoke({ id: passkey.id, label: passkey.label })}
                          data-testid={`button-revoke-${passkey.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}

                {AdminPasskeyClient.supportsPasskeys() ? (
                  <form
                    className="flex flex-col sm:flex-row gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      register.mutate();
                    }}
                  >
                    <Input
                      value={label}
                      onChange={(event) => setLabel(event.target.value)}
                      placeholder="Nome dispositivo (es. iPhone di Gennaro)"
                      maxLength={60}
                      data-testid="input-passkey-label"
                    />
                    <Button
                      type="submit"
                      disabled={register.isPending || (data.passkeys.length > 0 && !data.activationReady)}
                      data-testid="button-register-passkey"
                    >
                      <Fingerprint className="h-4 w-4 mr-1" />
                      {register.isPending ? 'Attendi il dispositivo…' : 'Registra passkey'}
                    </Button>
                  </form>
                ) : (
                  <p className="text-sm text-amber-700">Questo browser non supporta le passkey.</p>
                )}
                {data.passkeys.length > 0 && !data.verified && (
                  <p className="text-xs text-muted-foreground">
                    Per aggiungere un'altra passkey devi prima verificare quella esistente ("Verifica ora").
                  </p>
                )}
              </CardContent>
            </Card>

            <Card data-testid="card-remembered-devices">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <span className="rounded-full bg-sage/15 text-sage h-6 w-6 inline-flex items-center justify-center text-xs">2</span>
                  Browser ricordati
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-blue-gray">
                  La fiducia resta legata a questo browser per 30 giorni. “Esci” chiude la sessione ma non dimentica
                  il browser; usa “Dimentica” per revocare anche la fiducia.
                </p>
                {data.rememberedDevices.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nessun browser ricordato.</p>
                ) : (
                  <ul className="divide-y">
                    {data.rememberedDevices.map((device) => (
                      <li key={device.id} className="py-3 flex flex-wrap items-center justify-between gap-3" data-testid={`row-remembered-device-${device.id}`}>
                        <div className="min-w-0">
                          <p className="font-medium text-charcoal flex flex-wrap items-center gap-2">
                            {device.label}
                            {device.id === data.rememberedDeviceId && <Badge variant="secondary">Questo browser</Badge>}
                            {device.status !== 'active' && (
                              <Badge variant="outline">
                                {device.status === 'revoked' ? 'Revocato' : 'Scaduto'}
                              </Badge>
                            )}
                          </p>
                          <p className="text-xs text-blue-gray">
                            Ultimo uso {formatDate(device.lastUsedAt)} · scade {formatDate(device.expiresAt)}
                          </p>
                        </div>
                        {device.status === 'active' && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!data.activationReady || revokeRememberedDevice.isPending}
                            onClick={() => setPendingDeviceRevoke({ id: device.id, label: device.label })}
                            data-testid={`button-forget-device-${device.id}`}
                          >
                            <Trash2 className="h-4 w-4 mr-1 text-red-500" /> Dimentica
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {data.rememberedDevices.some((device) => device.status === 'active') && (
                  <>
                    {!data.activationReady && (
                      <p className="text-xs text-amber-800">
                        Verifica di nuovo la passkey per gestire i browser ricordati.
                      </p>
                    )}
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={!data.activationReady || revokeAllRememberedDevices.isPending}
                      onClick={() => setConfirmRevokeAllDevices(true)}
                      data-testid="button-forget-all-devices"
                    >
                      Dimentica tutti i dispositivi
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>

            {/* 2. Codici di recupero */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <span className="rounded-full bg-sage/15 text-sage h-6 w-6 inline-flex items-center justify-center text-xs">2</span>
                  Codici di recupero
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-blue-gray">
                  Se perdi il dispositivo, un codice di recupero ti concede 30 minuti per registrare una nuova
                  passkey. Ogni codice vale una sola volta; il server conserva solo la loro impronta.
                </p>
                <p className="text-sm">
                  Codici disponibili: <strong data-testid="text-recovery-remaining">{data.recoveryCodesRemaining}</strong>
                  {data.recoveryCodesGeneratedAt && (
                    <span className="text-blue-gray"> · generati {formatDate(data.recoveryCodesGeneratedAt)}</span>
                  )}
                </p>
                {freshCodes && (
                  <div className="rounded-md border bg-white p-4 space-y-3" data-testid="panel-recovery-codes">
                    <p className="text-sm font-medium text-charcoal">
                      Salva questi codici ora: non saranno più visibili.
                    </p>
                    <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                      {freshCodes.map((code) => (
                        <span key={code}>{code}</span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => void copyCodes()} data-testid="button-copy-codes">
                        <Copy className="h-4 w-4 mr-1" /> Copia
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setFreshCodes(null)}>
                        <Check className="h-4 w-4 mr-1" /> Li ho salvati
                      </Button>
                    </div>
                  </div>
                )}
                <Button
                  variant="outline"
                  disabled={recoveryCodes.isPending || (freshPasskeyRequired && !data.activationReady)}
                  onClick={() => recoveryCodes.mutate()}
                  data-testid="button-generate-recovery-codes"
                >
                  <KeyRound className="h-4 w-4 mr-1" />
                  {data.recoveryCodesRemaining > 0 ? 'Rigenera codici (invalida i precedenti)' : 'Genera codici di recupero'}
                </Button>
              </CardContent>
            </Card>

            {/* 3. Obbligatorietà */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <span className="rounded-full bg-sage/15 text-sage h-6 w-6 inline-flex items-center justify-center text-xs">3</span>
                  Rendi obbligatoria la passkey
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-blue-gray">
                  Con l'obbligo attivo, dopo il login con password (o Google) serve la verifica passkey per
                  aprire il pannello, usare le API amministrative e leggere o modificare i dati dello studio.
                  Il login dei clienti non cambia. L’app Windows installata avvia la verifica in questo sito
                  HTTPS e riceve una sessione separata, valida solo per l’account Windows che ha avviato la richiesta.
                </p>
                <ul className="text-sm space-y-1">
                  <Requirement ok={data.passkeys.length > 0} label="Almeno una passkey registrata" />
                  <Requirement ok={data.recoveryCodesRemaining > 0} label="Codici di recupero generati e conservati" />
                  <Requirement ok={data.activationReady} label="Autenticazione passkey riuscita negli ultimi 5 minuti in questa sessione sul sito di produzione" />
                </ul>
                {!data.passkeyRequired && !data.activationReady && data.passkeys.length > 0 && (
                  <p className="text-sm text-amber-700" data-testid="text-activation-blocked">
                    La sola registrazione o un codice di recupero non bastano: apri questa pagina su
                    imagestudiofotografico.com e premi “Verifica ora” per provare che l'accesso con la
                    passkey funziona. Se la verifica fallisce, l'obbligo resta disabilitato.
                  </p>
                )}
                {data.passkeyRequired ? (
                  <Button
                    variant="outline"
                    disabled={enforcement.isPending || !data.activationReady}
                    onClick={() => enforcement.mutate(false)}
                    data-testid="button-disable-enforcement"
                  >
                    <ShieldOff className="h-4 w-4 mr-1" /> Disattiva obbligo
                  </Button>
                ) : (
                  <Button
                    disabled={!canEnforce || enforcement.isPending}
                    onClick={() => setConfirmEnforce(true)}
                    data-testid="button-enable-enforcement"
                  >
                    <ShieldCheck className="h-4 w-4 mr-1" /> Attiva obbligo passkey
                  </Button>
                )}
                {sessionRefreshPending && (
                  <div
                    className="rounded-md border border-amber-300 bg-amber-50 p-4 space-y-3"
                    role="alert"
                    data-testid="panel-session-refresh"
                  >
                    <p className="text-sm text-amber-900">
                      Il server ha completato l’operazione, ma il token di questa sessione non è aggiornato.
                      Aggiorna la sessione qui; non ripetere la verifica o l’azione già completata.
                    </p>
                    {sessionRefreshError && (
                      <p className="text-sm text-red-700" data-testid="text-session-refresh-error">
                        {sessionRefreshError}
                      </p>
                    )}
                    <Button
                      variant="outline"
                      disabled={refreshEnforcementSession.isPending}
                      onClick={() => refreshEnforcementSession.mutate(
                        sessionRefreshPending ? sessionRefreshClaim : data.expectedClaim,
                      )}
                      data-testid="button-retry-session-refresh"
                    >
                      <RefreshCw className={`h-4 w-4 mr-2 ${refreshEnforcementSession.isPending ? 'animate-spin' : ''}`} />
                      {refreshEnforcementSession.isPending ? 'Aggiornamento sessione…' : 'Riprova aggiornamento sessione'}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </main>

      <AlertDialog open={!!pendingRevoke} onOpenChange={(open) => !open && setPendingRevoke(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revocare "{pendingRevoke?.label}"?</AlertDialogTitle>
            <AlertDialogDescription>
              La passkey non sarà più accettata e tutte le verifiche già effettuate, anche su altri
              dispositivi, dovranno essere ripetute.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingRevoke && revoke.mutate(pendingRevoke.id)}
              data-testid="button-confirm-revoke"
            >
              Revoca
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!pendingDeviceRevoke} onOpenChange={(open) => !open && setPendingDeviceRevoke(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dimenticare “{pendingDeviceRevoke?.label}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Il browser perderà subito l’autorizzazione, anche se ha ancora un token Firebase già emesso. Per
              accedere di nuovo da lì servirà una nuova verifica passkey.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingDeviceRevoke && revokeRememberedDevice.mutate(pendingDeviceRevoke.id)}
              data-testid="button-confirm-forget-device"
            >
              Dimentica dispositivo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmRevokeAllDevices} onOpenChange={setConfirmRevokeAllDevices}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dimenticare tutti i browser?</AlertDialogTitle>
            <AlertDialogDescription>
              Tutti i browser ricordati verranno revocati subito. Le sessioni Firebase aperte non potranno più
              leggere i dati amministrativi finché non verrà verificata di nuovo una passkey.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => revokeAllRememberedDevices.mutate()}
              data-testid="button-confirm-forget-all-devices"
            >
              Dimentica tutti
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmEnforce} onOpenChange={setConfirmEnforce}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Attivare l'obbligo passkey?</AlertDialogTitle>
            <AlertDialogDescription>
              Da questo momento ogni sessione amministrativa dovrà verificare la passkey. Assicurati di aver
              conservato i codici di recupero: senza passkey e senza codici non potrai più accedere.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => enforcement.mutate(true)} data-testid="button-confirm-enforcement">
              Attiva
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Requirement({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className={`flex items-center gap-2 ${ok ? 'text-sage' : 'text-blue-gray'}`}>
      <Check className={`h-4 w-4 ${ok ? '' : 'opacity-30'}`} /> {label}
    </li>
  );
}
