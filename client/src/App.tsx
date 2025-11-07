import React, { useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "./components/ui/toaster";
import { TooltipProvider } from "./components/ui/tooltip";
import { FirebaseAuthProvider } from "./context/FirebaseAuthContext";
import { StudioProvider } from "./context/StudioContext";
import { ThemeProvider } from "next-themes";
import { trackPageView } from "./lib/analytics";
import { ErrorBoundary } from "./components/ErrorBoundary";

import Home from "./pages/Home";
import GalleryAccess from "./pages/GalleryAccess";
import Gallery from "./pages/Gallery";
import SpecialGalleryAccess from "./pages/SpecialGalleryAccess";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import Faq from "./pages/admin/Faq";
import QuestionnaireManager from "./pages/admin/QuestionnaireManager";
import QuestionnaireForm from "./pages/QuestionnaireForm";
import RequestPassword from "./pages/RequestPassword";
import PasswordResult from "./pages/PasswordResult";
import DeleteGalleryPage from "./pages/DeleteGalleryPage";
import UserProfile from "./pages/UserProfile";
import BookingIndex from "./pages/BookingIndex";
import BookingPage from "./pages/BookingPage";
import GalleryManagementWorkspace from "./pages/GalleryManagementWorkspace";
import NotFound from "./pages/not-found";
import PathDebugInfo from "./components/PathDebugInfo";
import AuthDebugPanel from "./components/AuthDebugPanel";
import ProfileImageWelcomeProvider from "./components/ProfileImageWelcomeProvider";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";

// Seed script per jobTypes (disponibile globalmente come window.seedJobTypes)
import './scripts/seed-job-types';

// Tracciamento pageview con Wouter
function useAnalytics() {
  const [location] = useLocation();
  useEffect(() => {
    trackPageView(location);
  }, [location]);
  return null;
}

// Solo definizione di rotte (il <Router base=...> è in main.tsx)
function AppRoutes() {
  useAnalytics();
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/terms" component={Terms} />

      {/* Booking pubblico */}
      <Route path="/prenota" component={BookingIndex} />
      <Route path="/prenota/:code" component={BookingPage} />

      {/* Nota: qui stai usando /gallery/:id -> GalleryAccess e /view/:id -> Gallery */}
      <Route path="/special-gallery" component={SpecialGalleryAccess} />
      <Route path="/gallery/:id" component={GalleryAccess} />
      <Route path="/view/:id" component={Gallery} />

      <Route path="/admin" component={AdminLogin} />
      <Route path="/admin/dashboard" component={AdminDashboard} />
      <Route path="/admin/faq" component={Faq} />
      <Route path="/admin/galleries/:galleryId/questionnaire" component={QuestionnaireManager} />
      <Route path="/admin/gallery/:galleryId/manage" component={GalleryManagementWorkspace} />
      <Route path="/admin/delete-gallery" component={DeleteGalleryPage} />
      
      {/* Public questionnaire route with noindex/nofollow */}
      <Route path="/q/:galleryId" component={QuestionnaireForm} />
      <Route path="/request-password/:id" component={RequestPassword} />
      <Route path="/request-password" component={RequestPassword} />
      <Route path="/password-result/:id" component={PasswordResult} />
      <Route path="/profile" component={UserProfile} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  // Nota: Inizializzazione set domande spostata in Faq.tsx per admin autenticato

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider attribute="class" defaultTheme="light">
          <TooltipProvider>
            <FirebaseAuthProvider>
              <StudioProvider>
                <Toaster />
                <AppRoutes />
                <ProfileImageWelcomeProvider />
                {import.meta.env.MODE === "development" && (
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
