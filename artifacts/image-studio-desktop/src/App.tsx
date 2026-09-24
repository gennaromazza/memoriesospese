import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { UploadQueueProvider } from './lib/uploadQueue';
import { Layout } from './components/layout';

import Login from './pages/login';
import GalleriesList from './pages/galleries/index';
import NewGallery from './pages/galleries/new';
import Settings from './pages/settings';
import GalleryWorkspace from './pages/galleries/workspace';

const queryClient = new QueryClient();

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  if (loading) return null;
  if (!user) {
    setLocation('/login');
    return null;
  }
  
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

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <UploadQueueProvider>
          <TooltipProvider>
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
