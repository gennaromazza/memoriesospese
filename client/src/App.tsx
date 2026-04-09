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
import NotFound from "./pages/NotFound";
import CookieBanner from "./components/CookieBanner";
import ProfileImageWelcomeProvider from "./components/ProfileImageWelcomeProvider";

function lazyWithRetry(importFn: () => Promise<any>) {
  return lazy(() =>
    importFn().catch((err: Error) => {
      const hasReloaded = sessionStorage.getItem('chunk_reload');
      if (!hasReloaded) {
        sessionStorage.setItem('chunk_reload', '1');
        window.location.reload();
        return new Promise(() => {});
      }
      sessionStorage.removeItem('chunk_reload');
      throw err;
    })
  );
}

const GalleryAccessPage = lazyWithRetry(() => import("./pages/public/GalleryAccessPage"));
const PortfolioPage = lazyWithRetry(() => import("./pages/public/PortfolioPage"));
const PortfolioCategoryPage = lazyWithRetry(() => import("./pages/public/PortfolioCategoryPage"));
const StoriePage = lazyWithRetry(() => import("./pages/public/StoriePage"));
const LasciatiTrasportarePage = lazyWithRetry(() => import("./pages/public/LasciatiTrasportarePage"));
const BlogListPage = lazyWithRetry(() => import("./pages/public/BlogListPage"));
const BlogPostPage = lazyWithRetry(() => import("./pages/public/BlogPostPage"));
const WeddingVideosPage = lazyWithRetry(() => import("./pages/public/WeddingVideosPage"));
const FotografoAversaPage = lazyWithRetry(() => import("./pages/public/FotografoAversaPage"));
const GalleryAccess = lazyWithRetry(() => import("./pages/GalleryAccess"));
const Gallery = lazyWithRetry(() => import("./pages/Gallery"));
const SpecialGalleryAccess = lazyWithRetry(() => import("./pages/SpecialGalleryAccess"));
const BookingIndex = lazyWithRetry(() => import("./pages/BookingIndex"));
const BookingPage = lazyWithRetry(() => import("./pages/BookingPage"));
const QuotePortal = lazyWithRetry(() => import("./pages/QuotePortal"));
const Privacy = lazyWithRetry(() => import("./pages/Privacy"));
const CookiePolicy = lazyWithRetry(() => import("./pages/CookiePolicy"));
const GdprRequest = lazyWithRetry(() => import("./pages/GdprRequest"));
const Terms = lazyWithRetry(() => import("./pages/Terms"));
const ConsultationIndex = lazyWithRetry(() => import("./pages/ConsultationIndex"));
const ConsultationTemplates = lazyWithRetry(() => import("./pages/ConsultationTemplates"));
const ConsultationBooking = lazyWithRetry(() => import("./pages/ConsultationBooking"));
const CollaboratorAssignmentResponse = lazyWithRetry(() => import("./pages/CollaboratorAssignmentResponse"));
const CollaboratoreDashboard = lazyWithRetry(() => import("./pages/CollaboratoreDashboard"));
const QuestionnaireForm = lazyWithRetry(() => import("./pages/QuestionnaireForm"));
const RequestPassword = lazyWithRetry(() => import("./pages/RequestPassword"));
const PasswordResult = lazyWithRetry(() => import("./pages/PasswordResult"));
const AdminLogin = lazyWithRetry(() => import("./pages/AdminLogin"));
const AdminDashboard = lazyWithRetry(() => import("./pages/AdminDashboard"));
const AdminGalleryAccess = lazyWithRetry(() => import("./pages/AdminGalleryAccess"));
const Faq = lazyWithRetry(() => import("./pages/admin/Faq"));
const QuestionnaireManager = lazyWithRetry(() => import("./pages/admin/QuestionnaireManager"));
const DeleteGalleryPage = lazyWithRetry(() => import("./pages/DeleteGalleryPage"));
const UserProfile = lazyWithRetry(() => import("./pages/UserProfile"));
const GalleryManagementWorkspace = lazyWithRetry(() => import("./pages/GalleryManagementWorkspace"));
const JobDetailPage = lazyWithRetry(() => import("./pages/JobDetailPage"));
const JobsListPage = lazyWithRetry(() => import("./pages/JobsListPage"));
const ImportDataPage = lazyWithRetry(() => import("./pages/ImportDataPage"));
const ConsultationTemplatesManager = lazyWithRetry(() => import("./pages/admin/ConsultationTemplatesManager"));
const AdminConsultationsRoute = lazyWithRetry(() => import("./pages/admin/AdminConsultationsRoute"));
const AdminJsonImporter = lazyWithRetry(() => import("./pages/admin/AdminJsonImporter"));
const AdminLegacyImporter = lazyWithRetry(() => import("./pages/admin/AdminLegacyImporter"));
const AdminLegacyJobsAnalyzer = lazyWithRetry(() => import("./pages/admin/AdminLegacyJobsAnalyzer"));
const QuoteManagementDemo = lazyWithRetry(() => import("./pages/admin/QuoteManagementDemo"));
const ProductStatsPage = lazyWithRetry(() => import("./pages/admin/ProductStatsPage"));
const BackupManager = lazyWithRetry(() => import("./pages/admin/BackupManager"));
const AuditSystem = lazyWithRetry(() => import("./pages/admin/AuditSystem"));
const OrphanedPhotosManager = lazyWithRetry(() => import("./pages/admin/OrphanedPhotosManager"));
const PhoneMigrationPage = lazyWithRetry(() => import("./pages/admin/PhoneMigrationPage"));
const PaymentDiscrepanciesAudit = lazyWithRetry(() => import("./pages/admin/PaymentDiscrepanciesAudit"));
const BulkEmailSender = lazyWithRetry(() => import("./pages/BulkEmailSender"));
const QuickQuotePage = lazyWithRetry(() => import("./pages/QuickQuotePage"));
const InfoFormPublic = lazyWithRetry(() => import("./pages/InfoFormPublic"));

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
        <Route path="/fotografo-aversa" component={FotografoAversaPage} />
        <Route path="/blog" component={BlogListPage} />
        <Route path="/blog/:slug" component={BlogPostPage} />
        <Route path="/vision" component={WeddingVideosPage} />

        {/* Gallery Access (moved from /) */}
        <Route path="/accesso-galleria" component={GalleryAccessPage} />

        <Route path="/privacy" component={Privacy} />
        <Route path="/cookie-policy" component={CookiePolicy} />
        <Route path="/gdpr" component={GdprRequest} />
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

        {/* Preventivo Rapido - Link condivisibile per compilazione pubblica */}
        <Route path="/preventivo-rapido/:token" component={QuickQuotePage} />

        {/* Moduli Informativi - Link condivisibile per compilazione pubblica */}
        <Route path="/modulo/:token" component={InfoFormPublic} />

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
        <Route path="/admin/orphaned-photos" component={OrphanedPhotosManager} />
        <Route path="/admin/phone-migration" component={PhoneMigrationPage} />
        <Route path="/admin/payment-audit" component={PaymentDiscrepanciesAudit} />
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
                <CookieBanner />
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

const PathDebugInfo = lazyWithRetry(() => import("./components/PathDebugInfo"));
const AuthDebugPanel = lazyWithRetry(() => import("./components/AuthDebugPanel"));

export default App;
