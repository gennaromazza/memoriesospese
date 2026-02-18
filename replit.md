# Image Studio - Piattaforma Completa per Fotografi Professionisti

## Overview
Image Studio is an all-in-one platform for professional photographers, designed to streamline studio management. Its purpose is to integrate photographers and clients into a single digital experience, managing every aspect of the photography business from initial contact to final delivery. Key capabilities include unified client management, advanced booking with Google Calendar integration, professional client-selection galleries, customizable client questionnaires, comprehensive order management, and an integrated email system. The vision is to be the definitive platform for professional photographers, covering all their business needs and offering a complete digital solution for their business.

## User Preferences
- Language: Italian for UI and user messages.
- Coding Style: TypeScript strict, modular components.
- Error Handling: Informative toast notifications with clear descriptions.
- Admin Features: Full access for gennaro.mazzacane@gmail.com.
- The agent should prioritize fixing critical security vulnerabilities and authentication inconsistencies.
- Iterative development with clear communication before major architectural changes.

## System Architecture

### UI/UX Decisions
- **Public Website Design:** Playfair Display typography, warm terracotta/cream/sage color palette, mobile-first responsive, smooth animations.
- **Admin Design:** Sage/beige color palette.
- **Responsive Design:** Consistent UI across all platforms.
- **Centralized Authentication Dialogs.**

### Technical Implementations
- **Frontend:** React + TypeScript + Tailwind CSS.
- **Backend:** Express.js + Node.js (migrating to Firebase-only where possible).
- **Database & Services:** Firebase (Firestore, Storage, Authentication, Functions, Hosting).
- **Authentication:** Unified Firebase Auth with backend validation; admin access via hardcoded list.
- **Data Management:** Unified client management system with automatic booking/consultation-to-client linkage.
- **Image Handling:** Automatic compression, watermarking, duplicate detection, advanced cropping, multi-image uploads using Firebase Storage and signed URLs.
- **Galleries:** Professional client-selection galleries with real-time updates, secure access, full preloading, and optional chapter-based organization. Includes a Gallery Recovery & Merge System for metadata rebuilding and inter-gallery photo migration.
- **Email System:** Express.js server via Gmail API with dynamic templates, timezone-aware "Add to Calendar" links, and automated gallery password notification (auto-send on create, manual resend via EditGalleryModal).
- **Deployment:** Designed for subfolder deployment with dynamic base path detection.
- **Error Handling & Logging:** Centralized error boundaries, structured logging, and informative toast notifications.
- **Admin Dashboard:** Enhanced navigation, Notification Center, and single-level tab structure.
- **Workflow State Management:** Unified `WorkflowState` enum for booking/order tracking, with email notifications and interactive timeline. States: SHOOTING_DA_SVOLGERE, SHOOTING_COMPLETATO, IN_LAVORAZIONE, IN_ATTESA_SELEZIONE, PRONTO_RITIRO (order ready for pickup, sends WhatsApp contact email), CONSEGNATO (delivered to client, sends confirmation email).
- **Collaborator Management:** Token-based dashboard access, comprehensive payment tracking integrated with `CashMovement`.
- **Phone Number Standardization:** Centralized utility for consistent WhatsApp link generation, handling various Italian phone formats.
- **Date/Timestamp Type Convention:** Strict separation between Firestore types and Frontend types. Firestore interfaces use `Timestamp` (e.g., `BookingCampaign`, `CashMovement`, `JobType`), while Frontend interfaces use `Date` with `FE` suffix (e.g., `BookingCampaignFE`, `CashMovementFE`, `JobTypeFE`). Conversions happen via `.toDate()` when reading from Firestore and `Timestamp.fromDate()` when writing. Client lib adapters (e.g., `booking-campaigns.ts`) include helper functions like `toBookingCampaignFE()` for consistent conversion.
- **SEO & AI Discoverability:** Comprehensive SEO system including: `useSEO` React hook (`client/src/hooks/useSEO.ts`) for dynamic meta tags per page, server-side prerender middleware (`server/seo-prerender.ts`) that serves HTML with SEO content to bots/crawlers (Google, ChatGPT, Perplexity, Claude, etc.), `llms.txt` and `llms-full.txt` files for AI crawler discoverability (llmstxt.org standard), dynamic sitemap generation with blog posts (`server/sitemap-generator.ts`), comprehensive JSON-LD structured data (ProfessionalService, Photographer Person, Organization, LocalBusiness, WebSite, BreadcrumbList, FAQPage with 10 Q&A), robots.txt with explicit AI bot permissions. Both dev and production servers include the SEO middleware.
- **Radix UI Patch:** Custom patch applied to `@radix-ui/react-compose-refs` (via `patches/fix-radix-compose-refs.cjs`) to fix "Maximum update depth exceeded" bug caused by `useCallback` dependency array instability. The patch uses `useRef` to store refs without triggering re-renders. Run `node patches/fix-radix-compose-refs.cjs` after npm install if the bug reappears. Custom Switch component (`client/src/components/ui/switch.tsx`) also replaces Radix UI Switch to avoid the same issue.

### Feature Specifications
- **Public Website:** SEO-optimized marketing site with portfolio, blog, biography, e-book download, and booking CTAs.
- **Portfolio System:** Admin-curated public portfolio linked to existing galleries, categorized by `jobType`, with masonry grid, lightbox, lazy loading, and homepage carousel.
- **Blog System:** Firestore-based blog with draft/published/archived states, slug-based URLs, SEO meta fields, and WordPress XML import.
- **Site Content CMS:** Flexible content management via `siteContent` collection for dynamic updates.
- **Subscription System:** Stripe integration for tiered access.
- **Booking & Calendar System:** Campaign-based booking with Google Calendar integration (100% Google Calendar as Source of Truth), using Calendar Engine V2 for availability and conflict detection. Includes Event Sync Guard for bidirectional synchronization, Conflict Resolution, and comprehensive timezone handling via Luxon. Admin Calendar Deduplication prevents duplicate events.
- **Security:** Gallery passwords/PINs stored in `gallerySecrets`, server-side verification, granular Firebase Security Rules, token verification, user isolation, and rate limiting.
- **GDPR Compliance:** Complete GDPR implementation including: Cookie consent banner with customizable preferences (necessary/analytics/marketing), Privacy Policy page with comprehensive data protection information, Cookie Policy page with detailed cookie table, consent checkboxes in booking/consultation forms with submit validation, GDPR request system for data deletion (Art. 17) and export (Art. 20) with Firestore storage and email notifications to both admin and user.
- **Questionnaire System:** Secure crypto tokens, multi-step forms with auto-save, and ChatGPT export.
- **Order & Job Management:** Integrated order and gallery creation within BookingsManager, supporting multi-product orders, client email notifications, comprehensive job detail page with workflow timeline, payment tracking, and cost management. Features bidirectional state synchronization between orders and bookings, and per-client appointment scheduling. **Walk-in Order Client Integration:** QuickOrderModal includes client search with autocomplete (name/email/phone), automatic creation of new clients with 'walk-in' tag, and linking orders to existing clients with automatic financial aggregate updates (totalRevenue, outstandingBalance, totalOrders).
- **Product Bundle System:** Products can be marked as bundles (`isBundle: true`) containing multiple component products (`bundleItems[]`). Each bundle item has `prodottoId`, `prodottoNome`, `quantita`, and `numeroFoto`. When creating galleries from orders containing bundles, bundle items are automatically expanded into individual product requirements for photo selection. ProductsManager provides full bundle CRUD with search/filter for adding products, quantity/photo count editing per bundle item, and bundle validation.
- **Photo Selection Workflow:** Enterprise-grade system with progress display, validation, deadline enforcement, automated emails, and admin review, supporting single-product, multi-product, legacy modes, **Unlimited Selection Mode** (Selezione Libera) where clients can select any number of photos without predefined limits, and **Bundle Mode** where bundle products are expanded into their component products for individual photo assignment.
- **Transaction & Payment Tracking System:** Advanced payment tracking with `transactions` array, automated email notifications, event-relative payment schedules, and automated payment reminder system via Cloud Functions. **Payment Schedule Integration:** Registering payments in schedules automatically creates CashMovements for dashboard tracking, with atomic updates preventing race conditions. **Payment Remodulation System:** Endpoint for adjusting payment schedules when clients pay different amounts than expected, supporting 'equal' and 'last' strategies while maintaining immutable contract totals (totale = totalePagato + saldoResiduo invariant).
- **Quote Management System:** Automated email notifications, robust backend protection for signed quotes, admin-only reset signature, and unified client portal. Includes advanced manual status management, audit logging, manual email sending control, and a server-side endpoint for anonymous client signature processing to ensure Firestore security. **Preventivo Rapido:** Shareable public link system for quote templates (`shareableToken` on QuoteTemplate). Admin generates link via QuoteTemplatesManager → client fills data on `/preventivo-rapido/:token` (2-step: form → preview+sign) → backend creates client + job + quote automatically. Supports both fixed and variable quotes, optional signing, admin email notification. Public endpoints: `GET /api/quotes/quick/:token`, `POST /api/quotes/quick/:token/activate`.
- **Consultation System (Consulenze):** Pre-work consultation scheduling with admin-configurable templates, Google Calendar integration, automated email reminders, and conversion to Jobs via API, migrated to Calendar Engine V2.
- **Booking System (Prenotazioni):** Public booking form and admin manual booking with campaign-based product selection, multi-product support, Google Calendar integration. Fully migrated to Calendar Engine V2, with day-based grouping in BookingsManager and inline order management.
- **Data Import:** Excel-based import system for clients and jobs, supporting structured field parsing, Firebase Storage integration, and automatic job type creation.
- **Cascade Delete System:** Quote/Order/Gallery deletions properly clean up job array references using `FieldValue.arrayRemove()`, with jobs using soft delete. Gallery deletion includes automatic cleanup of associated photos from both `photos` and `gallery-photos` collections with chunked batch processing (max 400 docs/batch).
- **System Audit Tools:** Automated admin-only audit system (`/api/audit/*`) for detecting data integrity issues (orphaned references, missing fields), workflow consistency problems (order/quote/booking state mismatches), calendar sync issues (jobs/consultations without calendarEventId), and potential bugs. Includes **Orphaned Photos Manager** (`/admin/orphaned-photos`) for detecting and safely deleting photo metadata from deleted galleries, with duplicate detection and batch deletion. Accessible via Admin Dashboard → Impostazioni → "Audit Sistema" or "Gestione Backup" buttons.

## External Dependencies
- **Firebase:** Firestore, Storage, Authentication, Functions, Hosting
- **Stripe:** Payment processing for subscriptions
- **Google Calendar API:** Booking slot management and event synchronization
- **Gmail API:** Email delivery
- **Express.js:** Web application framework
- **React:** Frontend library
- **TypeScript:** Type-safe JavaScript
- **Tailwind CSS:** Utility-first CSS framework
- **wouter:** React hook-based router
- **browser-image-compression:** Client-side image compression
- **html2pdf.js:** PDF generation from HTML
- **luxon:** Timezone-aware date/time handling