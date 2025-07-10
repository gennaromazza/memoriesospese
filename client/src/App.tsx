import { Switch, Route, useLocation, Router as WouterRouter } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "./components/ui/toaster";
import { TooltipProvider } from "./components/ui/tooltip";
import { FirebaseAuthProvider } from "./context/FirebaseAuthContext";
import { StudioProvider } from "./context/StudioContext";
import { ThemeProvider } from "next-themes";
import { trackPageView } from "./lib/analytics";
import { useEffect } from "react";
import { ErrorBoundary, GalleryErrorBoundary, AdminErrorBoundary } from "./components/ErrorBoundary";

import Home from "./pages/Home";
import GalleryAccess from "./pages/GalleryAccess";
import Gallery from "./pages/Gallery";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import RequestPassword from "./pages/RequestPassword";
import PasswordResult from "./pages/PasswordResult";
import DeleteGalleryPage from "./pages/DeleteGalleryPage";
import SecurityTestPage from "./pages/SecurityTestPage";
import UserProfile from "./pages/UserProfile";
import NotFound from "./pages/not-found";
import PathDebugInfo from "./components/PathDebugInfo";
import AuthDebugPanel from "./components/AuthDebugPanel";


// Hook per tracciare le visualizzazioni delle pagine
function useAnalytics() {
  const [location] = useLocation();

  useEffect(() => {
    // Traccia il cambio di pagina
    trackPageView(location);

  }, [location]);

  return null;
}

// Router personalizzato con basePath
function Router() {
  // Utilizza il hook per tracciare le navigazioni
  useAnalytics();



  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/gallery/:id" component={GalleryAccess} />
      <Route path="/view/:id" component={Gallery} />
      <Route path="/admin" component={AdminLogin} />
      <Route path="/admin/dashboard" component={AdminDashboard} />
      <Route path="/admin/delete-gallery" component={DeleteGalleryPage} />
      <Route path="/request-password/:id" component={RequestPassword} />
      <Route path="/request-password" component={RequestPassword} />
      <Route path="/password-result/:id" component={PasswordResult} />
      <Route path="/security-test" component={SecurityTestPage} />
      <Route path="/profile" component={UserProfile} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  // Configure base path for Replit deployment (always root)
  const basePath = '/';

  // URL validation and normalization
  useEffect(() => {
    const { origin, pathname, search } = window.location;

    // Handle double slashes in pathname
    if (/\/\/+/.test(pathname)) {
      const correctedPath = pathname.replace(/\/\/+/g, '/');
      const correctedUrl = `${origin}${correctedPath}${search}`;
      window.history.replaceState(null, '', correctedUrl);
    }
  }, [basePath]);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider attribute="class" defaultTheme="light">
          <TooltipProvider>
            <FirebaseAuthProvider>
              <StudioProvider>
                <Toaster />
                <WouterRouter base={basePath}>
                  <Router />
                </WouterRouter>
                {/* Debug components - solo in sviluppo */}
                {import.meta.env.MODE === 'development' && (
                  <>
                    <PathDebugInfo />
                    <AuthDebugPanel />
                  </>
                )}
              </StudioProvider>
            </FirebaseAuthProvider>
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;