import { type ReactNode, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
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
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { UploadQueueProvider } from './lib/uploadQueue';
import { Layout } from './components/layout';
import { UpdateNotice } from './components/update-notice';

import Login from './pages/login';
import GalleriesList from './pages/galleries/index';
import NewGallery from './pages/galleries/new';
import Settings from './pages/settings';
import GalleryWorkspace from './pages/galleries/workspace';
import {
  DesktopPasskeyFinalizeRetryError,
  DesktopPasskeySessionRefreshError,
  finalizeDesktopPasskeySession,
  refreshDesktopPasskeySession,
  runDesktopPasskeyHandoff,
  type DesktopPasskeyClaim,
} from './lib/admin-passkey-handoff';

const queryClient = new QueryClient();

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && !user) setLocation('/login');
  }, [loading, user, setLocation]);

  if (loading) return null;
  if (!user) return null;
  
  return <Component />;
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/login" component={Login} />
        <Route path="/">
          <Layout>
            <ProtectedRoute component={GalleriesList} />
          </Layout>
        </Route>
        <Route path="/galleries/new">
          <Layout>
            <ProtectedRoute component={NewGallery} />
          </Layout>
        </Route>
        <Route path="/galleries/:id">
          {params => (
            <Layout>
              <GalleryWorkspace id={params.id} />
            </Layout>
          )}
        </Route>
        <Route path="/settings">
          <Layout>
            <ProtectedRoute component={Settings} />
          </Layout>
        </Route>
        <Route>
          <div className="flex h-screen items-center justify-center">404 Not Found</div>
        </Route>
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function DesktopPasskeyPrompt() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingRefresh, setPendingRefresh] = useState<{
    expectedClaim: DesktopPasskeyClaim;
    expectedUid: string;
  } | null>(null);
  const [pendingFinalizeUid, setPendingFinalizeUid] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    const showPrompt = () => {
      setError(null);
      setOpen(true);
    };
    window.addEventListener('admin-passkey-required', showPrompt);
    return () => window.removeEventListener('admin-passkey-required', showPrompt);
  }, []);

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      if (pendingRefresh) {
        await refreshDesktopPasskeySession(pendingRefresh.expectedClaim, pendingRefresh.expectedUid);
      } else if (pendingFinalizeUid) {
        await finalizeDesktopPasskeySession(pendingFinalizeUid);
      } else {
        await runDesktopPasskeyHandoff();
      }
      setPendingRefresh(null);
      setPendingFinalizeUid(null);
      setOpen(false);
      await queryClient.invalidateQueries();
      toast({
        title: 'Passkey verificata',
        description: 'La sessione Windows è stata aggiornata. Riprova l’operazione che avevi avviato.',
      });
    } catch (cause) {
      if (cause instanceof DesktopPasskeySessionRefreshError) {
        setPendingRefresh({ expectedClaim: cause.expectedClaim, expectedUid: cause.expectedUid });
      } else if (cause instanceof DesktopPasskeyFinalizeRetryError) {
        setPendingFinalizeUid(cause.expectedUid);
      }
      setError(cause instanceof Error ? cause.message : 'Verifica passkey non riuscita.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!busy) setOpen(nextOpen);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {pendingRefresh
              ? 'Sessione Windows da aggiornare'
              : pendingFinalizeUid
                ? 'Finalizzazione Windows da riprovare'
                : 'Verifica passkey richiesta'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {pendingRefresh
              ? 'La verifica nel browser è già stata completata. Riprova ad aggiornare il token Windows senza riavviare la verifica.'
              : pendingFinalizeUid
                ? 'La verifica nel browser è già stata completata. Riprova la conferma con il server senza riaprire il browser o ripetere la passkey.'
                : 'Apriremo il sito ufficiale nel browser predefinito. Completa lì la verifica con la tua passkey; l’app Windows aggiornerà poi la propria sessione senza disattivare la protezione.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Annulla</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(event) => {
              event.preventDefault();
              void verify();
            }}
          >
            {busy
              ? pendingRefresh || pendingFinalizeUid
                ? 'Ripristino sessione…'
                : 'In attesa della verifica…'
              : pendingRefresh
                ? 'Riprova aggiornamento'
                : pendingFinalizeUid
                  ? 'Riprova finalizzazione'
                  : 'Apri il browser e verifica'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <UploadQueueProvider>
          <TooltipProvider>
            <UpdateNotice />
            <DesktopPasskeyPrompt />
            <WouterRouter base={window.location.protocol === 'app:' ? '' : import.meta.env.BASE_URL.replace(/\/$/, '')}>
              <Router />
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </UploadQueueProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
