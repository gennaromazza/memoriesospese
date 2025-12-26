import { Suspense, lazy, useEffect } from "react";
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
import { Loader2 } from "lucide-react";

import PublicHomepage from "./pages/public/PublicHomepage";
import GalleryAccessPage from "./pages/public/GalleryAccessPage";
import PortfolioPage from "./pages/public/PortfolioPage";
import PortfolioCategoryPage from "./pages/public/PortfolioCategoryPage";
import StoriePage from "./pages/public/StoriePage";
import LasciatiTrasportarePage from "./pages/public/LasciatiTrasportarePage";
import BlogListPage from "./pages/public/BlogListPage";
import BlogPostPage from "./pages/public/BlogPostPage";
import WeddingVideosPage from "./pages/public/WeddingVideosPage";
import GalleryAccess from "./pages/GalleryAccess";
import Gallery from "./pages/Gallery";
import SpecialGalleryAccess from "./pages/SpecialGalleryAccess";
import BookingIndex from "./pages/BookingIndex";
import BookingPage from "./pages/BookingPage";
import QuotePortal from "./pages/QuotePortal";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import ConsultationIndex from "./pages/ConsultationIndex";
import ConsultationTemplates from "./pages/ConsultationTemplates";
import ConsultationBooking from "./pages/ConsultationBooking";
import CollaboratorAssignmentResponse from "./pages/CollaboratorAssignmentResponse";
import CollaboratoreDashboard from "./pages/CollaboratoreDashboard";
import QuestionnaireForm from "./pages/QuestionnaireForm";
import RequestPassword from "./pages/RequestPassword";
import PasswordResult from "./pages/PasswordResult";
import NotFound from "./pages/NotFound";
import ProfileImageWelcomeProvider from "./components/ProfileImageWelcomeProvider";

const AdminLogin = lazy(() => import("./pages/AdminLogin"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AdminGalleryAccess = lazy(() => import("./pages/AdminGalleryAccess"));
const Faq = lazy(() => import("./pages/admin/Faq"));
const QuestionnaireManager = lazy(() => import("./pages/admin/QuestionnaireManager"));
const DeleteGalleryPage = lazy(() => import("./pages/DeleteGalleryPage"));
const UserProfile = lazy(() => import("./pages/UserProfile"));
const GalleryManagementWorkspace = lazy(() => import("./pages/GalleryManagementWorkspace"));
const JobDetailPage = lazy(() => import("./pages/JobDetailPage"));
const JobsListPage = lazy(() => import("./pages/JobsListPage"));
const ImportDataPage = lazy(() => import("./pages/ImportDataPage"));
const ConsultationTemplatesManager = lazy(() => import("./pages/admin/ConsultationTemplatesManager"));
const AdminConsultationsRoute = lazy(() => import("./pages/admin/AdminConsultationsRoute"));
const AdminJsonImporter = lazy(() => import("./pages/admin/AdminJsonImporter"));
const AdminLegacyImporter = lazy(() => import("./pages/admin/AdminLegacyImporter"));
const AdminLegacyJobsAnalyzer = lazy(() => import("./pages/admin/AdminLegacyJobsAnalyzer"));
const QuoteManagementDemo = lazy(() => import("./pages/admin/QuoteManagementDemo"));
const ProductStatsPage = lazy(() => import("./pages/admin/ProductStatsPage"));
const BackupManager = lazy(() => import("./pages/admin/BackupManager"));
const AuditSystem = lazy(() => import("./pages/admin/AuditSystem"));
const BulkEmailSender = lazy(() => import("./pages/BulkEmailSender"));

import './scripts/seed-job-types';
import './scripts/seed-product-categories';

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground text-sm">Caricamento...</p>
      </div>
    </div>
  );
}

function useAnalytics() {
  const [location] = useLocation();
  useEffect(() => {
    trackPageView(location);
  }, [location]);
  return null;
}

function AppRoutes() {
  useAnalytics();
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        {/* Public Website Routes - NEW */}
        <Route path="/" component={PublicHomepage} />
        <Route path="/portfolio" component={PortfolioPage} />
        <Route path="/portfolio/:categoria" component={PortfolioCategoryPage} />
        <Route path="/storie" component={StoriePage} />
        <Route path="/lasciati-trasportare" component={LasciatiTrasportarePage} />
        <Route path="/blog" component={BlogListPage} />
        <Route path="/blog/:slug" component={BlogPostPage} />
        <Route path="/vision" component={WeddingVideosPage} />

        {/* Gallery Access (moved from /) */}
        <Route path="/accesso-galleria" component={GalleryAccessPage} />

        <Route path="/privacy" component={Privacy} />
        <Route path="/terms" component={Terms} />

        {/* Booking pubblico */}
        <Route path="/prenota" component={BookingIndex} />
        <Route path="/prenota/:code" component={BookingPage} />

        {/* Consultations pubbliche (italiano) */}
        <Route path="/consulenze" component={ConsultationIndex} />
        <Route path="/consulenze/:tipo/:id/prenota" component={ConsultationBooking} />
        <Route path="/consulenze/:tipo" component={ConsultationTemplates} />

        {/* Consultations pubbliche (inglese - backward compatibility) */}
        <Route path="/consultations" component={ConsultationIndex} />
        <Route path="/consultations/book" component={ConsultationBooking} />

        {/* Collaboratori assignment */}
        <Route path="/collaboratori/assignment/:assignmentId/:action" component={CollaboratorAssignmentResponse} />

        {/* Collaboratori dashboard - Link magico */}
        <Route path="/collaboratori/dashboard/:token" component={CollaboratoreDashboard} />

        {/* Quote portale pubblico - Link unico che si adatta allo stato */}
        <Route path="/quote/:token" component={QuotePortal} />

        {/* Nota: qui stai usando /gallery/:id -> GalleryAccess e /view/:id -> Gallery */}
        <Route path="/special-gallery" component={SpecialGalleryAccess} />
        <Route path="/gallery/:id" component={GalleryAccess} />
        <Route path="/view/:id" component={Gallery} />

        <Route path="/admin" component={AdminLogin} />
        <Route path="/admin/dashboard" component={AdminDashboard} />
        <Route path="/admin/bulk-email" component={BulkEmailSender} />
        <Route path="/admin/faq" component={Faq} />
        <Route path="/admin/galleries/:galleryId" component={AdminGalleryAccess} />
        <Route path="/admin/galleries/:galleryId/questionnaire" component={QuestionnaireManager} />
        <Route path="/admin/gallery/:galleryId/manage" component={GalleryManagementWorkspace} />
        <Route path="/admin/delete-gallery" component={DeleteGalleryPage} />
        <Route path="/admin/jobs" component={JobsListPage} />
        <Route path="/admin/jobs/:jobId" component={JobDetailPage} />
        <Route path="/admin/import" component={ImportDataPage} />
        <Route path="/admin/consulenze/templates" component={ConsultationTemplatesManager} />
        <Route path="/admin/consulenze" component={AdminConsultationsRoute} />
        <Route path="/admin/importer" component={AdminJsonImporter} />
        <Route path="/admin/legacy-import" component={AdminLegacyImporter} />
        <Route path="/admin/legacy-analyzer" component={AdminLegacyJobsAnalyzer} />
        <Route path="/admin/product-stats" component={ProductStatsPage} />
        <Route path="/admin/backup" component={BackupManager} />
        <Route path="/admin/audit" component={AuditSystem} />
        <Route path="/quote-management-demo" component={QuoteManagementDemo} />

        {/* Public questionnaire route with noindex/nofollow */}
        <Route path="/q/:galleryId" component={QuestionnaireForm} />
        <Route path="/request-password/:id" component={RequestPassword} />
        <Route path="/request-password" component={RequestPassword} />
        <Route path="/password-result/:id" component={PasswordResult} />
        <Route path="/profile" component={UserProfile} />

        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
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
                  <Suspense fallback={null}>
                    <PathDebugInfo />
                    <AuthDebugPanel />
                  </Suspense>
                )}
              </StudioProvider>
            </FirebaseAuthProvider>
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

const PathDebugInfo = lazy(() => import("./components/PathDebugInfo"));
const AuthDebugPanel = lazy(() => import("./components/AuthDebugPanel"));

export default App;
