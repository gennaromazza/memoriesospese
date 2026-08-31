import { useEffect, useState } from 'react';
import { Loader2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';
import { GoogleAccountLinkRequiredError } from '@/lib/auth';

interface PrintShopAuthGateProps {
  compact?: boolean;
  onAuthenticated?: () => void;
}

function authErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const code = 'code' in error && typeof error.code === 'string' ? error.code : '';
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      return 'Accesso annullato. Quando vuoi, premi di nuovo “Continua con Google”.';
    }
    if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
      return 'La password non è corretta. Riprova.';
    }
    if (code === 'auth/too-many-requests') {
      return 'Troppi tentativi ravvicinati. Aspetta qualche minuto e riprova.';
    }
    if (code === 'auth/network-request-failed') {
      return 'Connessione assente o instabile. Controlla internet e riprova.';
    }
    return error.message;
  }
  return 'Non siamo riusciti ad accedere. Riprova.';
}

export function PrintShopAuthGate({ compact = false, onAuthenticated }: PrintShopAuthGateProps) {
  const {
    user,
    isGoogleAuthenticated,
    isLoading,
    googleLinkRequest,
    loginWithGoogle,
    linkGoogleAccount,
  } = useFirebaseAuth();
  const [error, setError] = useState<string | null>(null);
  const [linkEmail, setLinkEmail] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (!googleLinkRequest) return;
    setLinkEmail(googleLinkRequest.email);
    setError(googleLinkRequest.message);
    setRedirecting(false);
  }, [googleLinkRequest]);

  if (user && isGoogleAuthenticated) return null;

  const handleGoogleLogin = async () => {
    setError(null);
    setLinkEmail(null);
    try {
      const result = await loginWithGoogle();
      setRedirecting(result.redirecting);
      if (result.user) onAuthenticated?.();
    } catch (loginError) {
      if (loginError instanceof GoogleAccountLinkRequiredError) {
        setLinkEmail(loginError.email);
        setError(loginError.message);
      } else {
        setError(authErrorMessage(loginError));
      }
    }
  };

  const handleAccountLink = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await linkGoogleAccount(password);
      setPassword('');
      onAuthenticated?.();
    } catch (linkError) {
      setError(authErrorMessage(linkError));
    }
  };

  return (
    <section
      className={`rounded-[2rem] border border-sage/25 bg-white shadow-sm ${compact ? 'p-5 sm:p-6' : 'p-6 sm:p-10'}`}
      aria-labelledby="print-auth-title"
    >
      <div className={compact ? '' : 'mx-auto max-w-xl text-center'}>
        <div className={`flex ${compact ? 'items-start' : 'flex-col items-center'} gap-4`}>
          <span className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl bg-sage/15 text-dark-sage">
            <LockKeyhole className="h-6 w-6" aria-hidden="true" />
          </span>
          <div className={compact ? '' : 'text-center'}>
            <h2 id="print-auth-title" className="text-2xl font-semibold text-blue-gray">
              {user ? 'Conferma l’accesso con Google' : 'Accedi per caricare le tue foto'}
            </h2>
            <p className="mt-2 leading-relaxed text-blue-gray/65">
              {user
                ? 'Hai già una sessione attiva, ma per proteggere foto e ordini questo servizio richiede una sessione Google verificata. Il tuo profilo e le gallerie resteranno invariati.'
                : 'Usiamo Google solo per riconoscerti e tenere privati file e ordini. Non pubblichiamo nulla sul tuo account.'}
            </p>
          </div>
        </div>

        {linkEmail ? (
          <form onSubmit={handleAccountLink} className="mt-6 rounded-2xl border border-terracotta/25 bg-terracotta/5 p-4 text-left">
            <label htmlFor="google-link-password" className="text-sm font-semibold text-blue-gray">
              Collega Google all’account {linkEmail}
            </label>
            <p className="mt-1 text-sm leading-relaxed text-blue-gray/60">
              Inserisci la vecchia password una sola volta. I tuoi dati e le gallerie esistenti resteranno nello stesso account.
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <Input
                id="google-link-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={6}
                autoComplete="current-password"
                required
                placeholder="Password del tuo account"
                className="h-12 rounded-xl"
              />
              <Button type="submit" disabled={isLoading || password.length < 6} className="h-12 rounded-xl bg-terracotta px-6 text-white hover:bg-terracotta/90">
                {isLoading && <Loader2 className="animate-spin" aria-hidden="true" />}
                Collega e continua
              </Button>
            </div>
          </form>
        ) : (
          <Button
            type="button"
            onClick={handleGoogleLogin}
            disabled={isLoading || redirecting}
            className={`mt-6 h-12 rounded-full bg-white px-7 text-blue-gray shadow-sm ring-1 ring-blue-gray/20 hover:bg-off-white ${compact ? '' : 'sm:min-w-72'}`}
          >
            {isLoading || redirecting ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-base font-bold text-[#4285F4]" aria-hidden="true">G</span>
            )}
            {redirecting ? 'Apertura di Google…' : user ? 'Conferma con Google' : 'Continua con Google'}
          </Button>
        )}

        {error && (
          <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
            {error}
          </p>
        )}

        <p className={`mt-5 flex items-center gap-2 text-xs text-blue-gray/50 ${compact ? '' : 'justify-center'}`}>
          <ShieldCheck className="h-4 w-4 text-dark-sage" aria-hidden="true" />
          Foto private, accessibili solo a te e allo studio per la stampa.
        </p>
      </div>
    </section>
  );
}
