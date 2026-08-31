import { useEffect, useState } from 'react';
import { KeyRound, Loader2, LockKeyhole, Mail, ShieldCheck, UserPlus } from 'lucide-react';
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
      return 'Email o password non corretti. Riprova.';
    }
    if (code === 'auth/email-already-in-use') {
      return 'Esiste già un account con questa email. Seleziona “Accedi”.';
    }
    if (code === 'auth/invalid-email') {
      return 'Inserisci un indirizzo email valido.';
    }
    if (code === 'auth/weak-password') {
      return 'Scegli una password di almeno 6 caratteri.';
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
    isLoading,
    googleLinkRequest,
    login,
    register,
    resetPassword,
    loginWithGoogle,
    linkGoogleAccount,
  } = useFirebaseAuth();
  const [error, setError] = useState<string | null>(null);
  const [linkEmail, setLinkEmail] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [redirecting, setRedirecting] = useState(false);
  const [emailMode, setEmailMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!googleLinkRequest) return;
    setLinkEmail(googleLinkRequest.email);
    setError(googleLinkRequest.message);
    setRedirecting(false);
  }, [googleLinkRequest]);

  if (user) return null;

  const handleGoogleLogin = async () => {
    setError(null);
    setNotice(null);
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

  const handleEmailAuth = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError('Inserisci il tuo indirizzo email.');
      return;
    }
    if (emailPassword.length < 6) {
      setError('La password deve contenere almeno 6 caratteri.');
      return;
    }
    if (emailMode === 'register' && !displayName.trim()) {
      setError('Inserisci il tuo nome e cognome.');
      return;
    }
    if (emailMode === 'register' && emailPassword !== confirmPassword) {
      setError('Le due password non coincidono.');
      return;
    }

    try {
      if (emailMode === 'register') {
        await register(normalizedEmail, emailPassword, displayName.trim());
      } else {
        await login(normalizedEmail, emailPassword);
      }
      onAuthenticated?.();
    } catch (emailError) {
      setError(authErrorMessage(emailError));
    }
  };

  const handlePasswordReset = async () => {
    setError(null);
    setNotice(null);
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError('Scrivi prima la tua email, poi premi “Password dimenticata?”.');
      return;
    }
    try {
      await resetPassword(normalizedEmail);
      setNotice('Ti abbiamo inviato l’email per scegliere una nuova password.');
    } catch (resetError) {
      setError(authErrorMessage(resetError));
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
              Accedi per caricare le tue foto
            </h2>
            <p className="mt-2 leading-relaxed text-blue-gray/65">
              Scegli Google oppure usa email e password. L’account serve a tenere privati i tuoi file e a permetterti di ritrovare gli ordini.
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
          <>
            <Button
              type="button"
              onClick={handleGoogleLogin}
              disabled={isLoading || redirecting}
              className={`mt-6 h-12 rounded-full bg-white px-7 text-blue-gray shadow-sm ring-1 ring-blue-gray/20 hover:bg-off-white ${compact ? 'w-full' : 'w-full sm:max-w-sm'}`}
            >
              {isLoading || redirecting ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-base font-bold text-[#4285F4]" aria-hidden="true">G</span>
              )}
              {redirecting ? 'Apertura di Google…' : 'Continua con Google'}
            </Button>

            <div className="my-6 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-blue-gray/35" aria-hidden="true">
              <span className="h-px flex-1 bg-sage/25" /> oppure <span className="h-px flex-1 bg-sage/25" />
            </div>

            <div className="mx-auto max-w-md text-left">
              <div className="grid grid-cols-2 rounded-xl bg-sage/10 p-1" role="tablist" aria-label="Accesso con email">
                <button
                  type="button"
                  role="tab"
                  aria-selected={emailMode === 'login'}
                  onClick={() => { setEmailMode('login'); setError(null); setNotice(null); }}
                  className={`flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition ${emailMode === 'login' ? 'bg-white text-blue-gray shadow-sm' : 'text-blue-gray/55'}`}
                >
                  <KeyRound className="h-4 w-4" /> Accedi
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={emailMode === 'register'}
                  onClick={() => { setEmailMode('register'); setError(null); setNotice(null); }}
                  className={`flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition ${emailMode === 'register' ? 'bg-white text-blue-gray shadow-sm' : 'text-blue-gray/55'}`}
                >
                  <UserPlus className="h-4 w-4" /> Registrati
                </button>
              </div>

              <form onSubmit={handleEmailAuth} className="mt-4 space-y-3">
                {emailMode === 'register' && (
                  <label className="block text-sm font-semibold text-blue-gray">
                    Nome e cognome
                    <Input
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      autoComplete="name"
                      required
                      placeholder="Mario Rossi"
                      className="mt-2 h-12 rounded-xl font-normal"
                    />
                  </label>
                )}
                <label className="block text-sm font-semibold text-blue-gray">
                  Email
                  <Input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                    required
                    placeholder="nome@email.it"
                    className="mt-2 h-12 rounded-xl font-normal"
                  />
                </label>
                <label className="block text-sm font-semibold text-blue-gray">
                  Password
                  <Input
                    type="password"
                    value={emailPassword}
                    onChange={(event) => setEmailPassword(event.target.value)}
                    autoComplete={emailMode === 'register' ? 'new-password' : 'current-password'}
                    minLength={6}
                    required
                    placeholder="Almeno 6 caratteri"
                    className="mt-2 h-12 rounded-xl font-normal"
                  />
                </label>
                {emailMode === 'register' && (
                  <label className="block text-sm font-semibold text-blue-gray">
                    Ripeti la password
                    <Input
                      type="password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      autoComplete="new-password"
                      minLength={6}
                      required
                      className="mt-2 h-12 rounded-xl font-normal"
                    />
                  </label>
                )}
                {emailMode === 'login' && (
                  <button type="button" onClick={handlePasswordReset} className="text-sm font-semibold text-dark-sage underline-offset-4 hover:underline">
                    Password dimenticata?
                  </button>
                )}
                <Button type="submit" disabled={isLoading} className="h-12 w-full rounded-full bg-terracotta text-white hover:bg-terracotta/90">
                  {isLoading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Mail className="h-4 w-4" aria-hidden="true" />}
                  {emailMode === 'register' ? 'Crea account e continua' : 'Accedi e continua'}
                </Button>
              </form>
            </div>
          </>
        )}

        {error && (
          <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
            {error}
          </p>
        )}

        {notice && !error && (
          <p className="mt-4 rounded-xl bg-sage/10 px-4 py-3 text-sm text-dark-sage" role="status">
            {notice}
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
