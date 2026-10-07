import { Suspense, lazy, useEffect, type ComponentType } from "react";
import { AdminRouteGuard } from "@/components/admin/AdminRouteGuard";
import { Switch, Route, useLocation } from 'wouter';
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
import { isAdminPath, manifestForPath } from "./lib/pwa-manifest";

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
const OspitiPage = lazyWithRetry(() => import("./pages/public/OspitiPage"));
const PortfolioPage = lazyWithRetry(() => import("./pages/public/PortfolioPage"));
const PortfolioCategoryPage = lazyWithRetry(() => import("./pages/public/PortfolioCategoryPage"));
const StoriePage = lazyWithRetry(() => import("./pages/public/StoriePage"));
const LasciatiTrasportarePage = lazyWithRetry(() => import("./pages/public/LasciatiTrasportarePage"));
const BlogListPage = lazyWithRetry(() => import("./pages/public/BlogListPage"));
const BlogPostPage = lazyWithRetry(() => import("./pages/public/BlogPostPage"));
const ImageExperiencePage = lazyWithRetry(() => import("./pages/public/ImageExperiencePage"));
const WeddingVideosPage = lazyWithRetry(() => import("./pages/public/WeddingVideosPage"));
const WeddingSeoPage = lazyWithRetry(() => import("./pages/public/WeddingSeoPage"));
const FotografoAversaPage = lazyWithRetry(() => import("./pages/public/FotografoAversaPage"));
const StampaFotoAversaPage = lazyWithRetry(() => import("./pages/public/StampaFotoAversaPage"));
const PrintShopOrderPage = lazyWithRetry(() => import("./pages/public/PrintShopOrderPage"));
const PrintShopConfirmationPage = lazyWithRetry(() => import("./pages/public/PrintShopConfirmationPage"));
const PrintShopOrdersPage = lazyWithRetry(() => import("./pages/public/PrintShopOrdersPage"));
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
const AdminSecurityPage = lazyWithRetry(() => import("./pages/admin/AdminSecurityPage"));
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
const BlogAdminE2EHarness = lazyWithRetry(() => import("./pages/BlogAdminE2EHarness"));
const PhotobookJobGalleryE2EHarness = lazyWithRetry(() => import("./pages/PhotobookJobGalleryE2EHarness"));
const WeddingSeoDraftE2EHarness = lazyWithRetry(() => import("./pages/WeddingSeoDraftE2EHarness"));
const DateSelectorE2EHarness = lazyWithRetry(() => import("./pages/DateSelectorE2EHarness"));
const FinancialDashboardE2EHarness = lazyWithRetry(() => import("./pages/FinancialDashboardE2EHarness"));
const CollaboratorProductsE2EHarness = lazyWithRetry(() => import("./pages/CollaboratorProductsE2EHarness"));
const BulkEmailSender = lazyWithRetry(() => import("./pages/BulkEmailSender"));
const QuickQuotePage = lazyWithRetry(() => import("./pages/QuickQuotePage"));
const InfoFormPublic = lazyWithRetry(() => import("./pages/InfoFormPublic"));
const InfoFormTemplateManager = lazyWithRetry(() => import("./pages/admin/InfoFormTemplateManager"));
const PhotobookViewPage = lazyWithRetry(() => import("./pages/PhotobookViewPage"));
const PhotobookEditorPage = lazyWithRetry(() => import("./pages/admin/PhotobookEditorPage"));

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

function usePwaManifest() {
  const [location] = useLocation();
  useEffect(() => {
    const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    manifest?.setAttribute('href', manifestForPath(location));
    const appTitle = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]');
    appTitle?.setAttribute('content', isAdminPath(location) ? 'Studio Admin' : 'Image Studio');
  }, [location]);
}

/**
 * Ogni route /admin/* (login escluso) passa dal guard: identità admin da
 * Firebase e, quando obbligatoria, verifica passkey prima di montare la pagina.
 */
function adminRoute<P extends object>(Component: ComponentType<P>) {
  return function GuardedAdminRoute(props: P) {
    return (
      <AdminRouteGuard>
        <Component {...props} />
      </AdminRouteGuard>
    );
  };
}

function AppRoutes() {
  useAnalytics();
  usePwaManifest();
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        {/* Public Website Routes - NEW */}
        <Route path="/" component={PublicHomepage} />
        <Route path="/portfolio" component={PortfolioPage} />
        <Route path="/portfolio/:categoria" component={PortfolioCategoryPage} />
        <Route path="/storie" component={StoriePage} />
        <Route path="/real-wedding/:slug" component={WeddingSeoPage} />
        <Route path="/lasciati-trasportare" component={LasciatiTrasportarePage} />
        <Route path="/fotografo-aversa" component={FotografoAversaPage} />
        <Route path="/stampa-foto-aversa" component={StampaFotoAversaPage} />
        <Route path="/stampa-foto-aversa/ordine" component={PrintShopOrderPage} />
        <Route path="/stampa-foto-aversa/ordine/conferma" component={PrintShopConfirmationPage} />
        <Route path="/stampa-foto-aversa/i-miei-ordini" component={PrintShopOrdersPage} />
        <Route path="/blog" component={BlogListPage} />
        <Route path="/blog/:slug" component={BlogPostPage} />
        <Route path="/image-experience" component={ImageExperiencePage} />
        <Route path="/vision" component={WeddingVideosPage} />

        {/* Gallery Access (moved from /) */}
        <Route path="/accesso-galleria" component={GalleryAccessPage} />

        {/* Pagina pubblica ospiti via QR code (mobile-first) */}
        <Route path="/ospiti" component={OspitiPage} />

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

        {/* Fotolibro - Revisione cliente tramite link a token */}
        <Route path="/fotolibro/:token" component={PhotobookViewPage} />

        {/* Moduli Informativi - Template manager standalone */}
        <Route path="/admin/moduli-template" component={adminRoute(InfoFormTemplateManager)} />

        {/* Nota: qui stai usando /gallery/:id -> GalleryAccess e /view/:id -> Gallery */}
        <Route path="/special-gallery" component={SpecialGalleryAccess} />
        <Route path="/gallery/:id" component={GalleryAccess} />
        <Route path="/view/:id" component={Gallery} />

        <Route path="/admin" component={AdminLogin} />
        <Route path="/admin/dashboard" component={adminRoute(AdminDashboard)} />
        <Route path="/admin/sicurezza" component={adminRoute(AdminSecurityPage)} />
        <Route path="/admin/bulk-email" component={adminRoute(BulkEmailSender)} />
        <Route path="/admin/faq" component={adminRoute(Faq)} />
        <Route path="/admin/galleries/:galleryId" component={adminRoute(AdminGalleryAccess)} />
        <Route path="/admin/galleries/:galleryId/questionnaire" component={adminRoute(QuestionnaireManager)} />
        <Route path="/admin/gallery/:galleryId/manage" component={adminRoute(GalleryManagementWorkspace)} />
        <Route path="/admin/delete-gallery" component={adminRoute(DeleteGalleryPage)} />
        <Route path="/admin/photobooks/:id" component={adminRoute(PhotobookEditorPage)} />
        <Route path="/admin/jobs" component={adminRoute(JobsListPage)} />
        <Route path="/admin/jobs/:jobId" component={adminRoute(JobDetailPage)} />
        <Route path="/admin/import" component={adminRoute(ImportDataPage)} />
        <Route path="/admin/consulenze/templates" component={adminRoute(ConsultationTemplatesManager)} />
        <Route path="/admin/consulenze" component={adminRoute(AdminConsultationsRoute)} />
        <Route path="/admin/importer" component={adminRoute(AdminJsonImporter)} />
        <Route path="/admin/legacy-import" component={adminRoute(AdminLegacyImporter)} />
        <Route path="/admin/legacy-analyzer" component={adminRoute(AdminLegacyJobsAnalyzer)} />
        <Route path="/admin/product-stats" component={adminRoute(ProductStatsPage)} />
        <Route path="/admin/backup" component={adminRoute(BackupManager)} />
        <Route path="/admin/audit" component={adminRoute(AuditSystem)} />
        <Route path="/admin/orphaned-photos" component={adminRoute(OrphanedPhotosManager)} />
        <Route path="/admin/phone-migration" component={adminRoute(PhoneMigrationPage)} />
        <Route path="/admin/payment-audit" component={adminRoute(PaymentDiscrepanciesAudit)} />
        {import.meta.env.DEV && import.meta.env.VITE_BLOG_E2E_HARNESS === "true" && (
          <Route path="/admin/__e2e/blog-admin-alt" component={BlogAdminE2EHarness} />
        )}
        {import.meta.env.DEV && (
          <Route
            path="/admin/__e2e/photobook-job-gallery"
            component={PhotobookJobGalleryE2EHarness}
          />
        )}
        {import.meta.env.DEV && (
          <Route
            path="/admin/__e2e/collaborator-products"
            component={CollaboratorProductsE2EHarness}
          />
        )}
        {import.meta.env.DEV && import.meta.env.VITE_FINANCE_E2E_HARNESS === "true" && (
          <Route path="/admin/__e2e/financial-dashboard" component={FinancialDashboardE2EHarness} />
        )}
        {import.meta.env.DEV && import.meta.env.VITE_DATE_PICKER_E2E_HARNESS === "true" && (
          <Route
            path="/admin/__e2e/date-selectors"
            component={DateSelectorE2EHarness}
          />
        )}
        {import.meta.env.DEV && import.meta.env.VITE_DATE_PICKER_E2E_HARNESS === "true" && (
          <Route
            path="/admin/__e2e/date-selectors/job/:jobId"
            component={DateSelectorE2EHarness}
          />
        )}
        {import.meta.env.DEV && import.meta.env.VITE_WEDDING_E2E_HARNESS === "true" && (
          <Route
            path="/admin/__e2e/wedding-seo-draft-fallback"
            component={WeddingSeoDraftE2EHarness}
          />
        )}
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
