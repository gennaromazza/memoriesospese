# Image Studio - Piattaforma Completa per Fotografi Professionisti

## Overview
Image Studio è una piattaforma all-in-one per fotografi professionisti che rivoluziona la gestione dello studio fotografico. È un ecosistema completo che unisce fotografi e clienti in un'unica esperienza digitale integrata, gestendo ogni aspetto del business fotografico, dal primo contatto alla consegna finale. Le sue capacità principali includono la gestione clienti unificata, un sistema di prenotazioni avanzato con integrazione Google Calendar, gallerie fotografiche professionali con selezione client-side, questionari personalizzabili per clienti, gestione ordini completa, e un sistema di email integrato.

**Vision:** Essere il punto di riferimento per i fotografi professionisti, offrendo una piattaforma completa che gestisce ogni aspetto del business fotografico - dal primo contatto alla consegna finale.

## Recent Changes (November 2025)
- **CalendarioManager Enhancements & Bug Fixes (November 13):** Critical fixes and improvements to calendar system:
  1. **Auth Fix (401 Bug):** Fixed Missing Authorization Bearer token error on `/api/calendar/create-event` and `/api/calendar/events` by adding `/api/calendar/` to `firebaseAuthEndpoints` whitelist in `client/src/lib/queryClient.ts`; replaced bare `fetch()` with `apiRequest()` for consistent auth header injection
  2. **Enhanced Error Handling:** Backend `/api/calendar/events` now returns `{ events: [], warnings: [] }` response; Google Calendar/Consulenze/Jobs fetch failures captured as warnings with specific error messages; frontend displays informational toasts for each warning; graceful degradation allows calendar to continue working even if Google Calendar integration fails
  3. **ClientAutocomplete Integration:** Replaced Select dropdown with searchable ClientAutocomplete component for cliente selection in event creation dialog; debounced search (min 2 chars) with Quick Add functionality matching existing booking system UX
  4. **Google Calendar Sync:** Unified calendar view aggregates events from 3 sources (Google Calendar, Consulenze confermate, Jobs attivi); backend properly handles timezone-safe ISO strings; frontend uses robust `safeParseISO()` helper to prevent crashes from malformed dates
  
- **Post-Rollback Feature Restoration (November 13):** Restored 6 features lost in rollback with enhancements:
  1. **Admin Dashboard Navigation:** Dropdown menus for Consulenze (consulenze/templates), Prenotazioni (bookings/commesse), Impostazioni (Prodotti/Categorie); improved state management with sessionStorage sync
  2. **Calendar & Scheduling:** New default Calendario tab with CalendarioManager component, backend routes (/api/calendar/events, /api/calendar/create-event), Google Calendar integration, schema updates with reminderEmailSent field for 24h notifications
  3. **Notification Center:** NotificationBell component in AdminDashboard header with bell icon + unread badge, Popover aggregating bookings/consultations/comments/selections, deep-link navigation with tab mapping (prenotazioni→bookings), popstate event tracking for in-app navigation, graceful Firebase permission handling
  4. **Consultation QA:** Added "Data Richiesta" column to ConsultationsManager with robust Timestamp parsing for createdAt field
  5. **Product Catalog:** Category filter in ProductsManager with dynamic statistics (total products, categories, avg price per category), responsive UI with active state highlighting
  6. **Client-Facing Refresh:** Removed admin button from Navigation, reorganized Home with "Servizi Principali" section (3 cards: Prenota/Consulenza/Gallerie), added Navigation + decorative icons to ConsultationIndex/ConsultationBooking pages, Image Studio color palette consistency
  
- **Consultation Template Enhancements (November 12):** Enhanced consultation templates with per-template availability customization (excludedDays array, customWorkingHours per day) and multi-image uploads for client-facing booking pages. Admin UI features Tabs layout (Generale|Disponibilità|Immagini|Campi Job) with weekday exclusion checkboxes, custom working hours editor (per-day apertura/chiusura/pausa), and Firebase Storage image management (up to 10 images, 5MB each, signed URLs). Backend getAvailableSlotsForDate() now respects template-specific constraints, prioritizing customWorkingHours over studio defaults. Client pages (ConsultationTemplates list, ConsultationBooking) display template images in responsive grids.

- **Consulenze (Consultations) Module (November 12):** Complete pre-work consultation system with multi-step public booking flow, admin template management, Google Calendar integration, and automated email notifications (received/approved/rejected). Enables photographers to collect advance job data through configurable templates per job type, manage consultation requests with approve/reject workflow, and convert approved consultations into full jobs with automatic client linkage.

- **Excel-Based Import System (November 11):** Complete Excel import system replacing CSV workflow with `parseExcel()` method supporting European currency formats (€ 2.500,00 → 2500), structured client field parsing from combined columns (Nome, Indirizzo, Telefono → separate fields), Firebase Storage integration with private signed URLs (5-year expiry), multi-location PDF path resolution, and new API routes `/api/import/preview-excel` and `/execute-excel`
- **Firebase Admin Storage Integration:** Added Firebase Storage singleton export for PDF upload functionality with server-side signed URL generation
- **Security Enhancement:** PDF uploads remain private in Firebase Storage using signed URLs instead of world-readable public URLs
- **Legacy Data Import System:** Complete CSV/PDF import system for migrating ~25 jobs from old management system with idempotency (legacyId), structured product data persistence (prodottiLegacy), payment schedule extraction, and admin-only cleanup endpoint
- **QuoteSignedPortalPage Enhancement:** Added product images display and PDF download functionality using html2pdf.js
- **Multi-Client Email Notifications:** Fixed quote email endpoints (/send-quote, /quote-signed-notification, /payment-reminder) to send to ALL clients in clientiInfo array instead of only first client, with proper comma-separated string splitting for sentTo field fallback
- **Client Data Management:** Added inline client editing capability from JobDetailPage with EditClienteModal component, including form reset logic to handle switching between different clients

## User Preferences
- Language: Italian for UI and user messages.
- Coding Style: TypeScript strict, modular components.
- Error Handling: Informative toast notifications with clear descriptions.
- Admin Features: Full access for gennaro.mazzacane@gmail.com.
- The agent should prioritize fixing critical security vulnerabilities and authentication inconsistencies.
- Iterative development with clear communication before major architectural changes.

## Consultation System (Consulenze)
**Purpose:** Pre-work consultation scheduling and data collection system integrated with Google Calendar and email notifications.

**Key Features:**
- **Template Management:** Admin-configurable consultation templates per job type with customizable duration, price, dynamic job data fields, per-template availability (excludedDays, customWorkingHours), and multi-image uploads (Firebase Storage, signed URLs)
- **Availability Customization:** Exclude specific weekdays per template, configure custom working hours per day (apertura/chiusura/pausa) overriding studio defaults, automatic slot generation respecting template-specific constraints
- **Image Management:** Upload up to 10 images per template (5MB max each), preview in admin grid (3 cols), client-facing display in template list and booking pages
- **Public Booking Flow:** Multi-step client-facing pages (job type selection → template selection with preview images → calendar slot booking → client data + job data collection)
- **Calendar Integration:** Automatic Google Calendar event creation on approval with conflict detection and compensating transaction rollback
- **Admin Workflow:** Approve/reject/convert-to-job actions with first-view tracking (dataVisualizzazione) and expandable detail rows
- **Email Notifications:** Automated lifecycle emails (consultation received, approved with calendar link, rejected with reason) using Gmail API with centralized HTML templates
- **Client Linkage:** Automatic findOrCreateCliente integration matching existing booking/job patterns for unified client management

**Data Model:**
- `consultationTemplates` collection: jobType, durataMinuti, prezzo, campiJobConfigurable[], attiva, excludedDays[], customWorkingHours[], imageUrls[]
- `consultations` collection: templateId, cliente{nome, cognome, email, whatsapp}, dataConsulenza, orarioInizio/Fine, jobDataCollected{}, stato (in_attesa|confermata|annullata|completata), googleCalendarEventId

**API Routes:**
- Public: `POST /api/consultations/create`, `POST /api/consultations/available-slots`
- Admin: `GET/POST/PATCH/DELETE /api/consultations/templates`, `PATCH /api/consultations/:id/{approve|reject|complete}`, `POST /api/consultations/:id/convert-to-job`
- Storage: `POST /api/consultations/templates/:id/upload-image`, `DELETE /api/consultations/templates/:id/images`
- Email: `POST /api/email/send-consultation-{received|approved|rejected}`

**Frontend Pages:**
- Public: `/consulenze` (ConsultationIndex), `/consulenze/:tipo` (ConsultationTemplates with image previews), `/consulenze/:tipo/:id/prenota` (ConsultationBooking with full image grid)
- Admin: `/admin/consulenze` (ConsultationsManager), `/admin/consulenze/templates` (ConsultationTemplatesManager with Tabs: Generale|Disponibilità|Immagini|Campi Job) - accessible via "Consulenze" tab dropdown in AdminDashboard

## System Architecture

**Core Technologies:**
- **Frontend:** React + TypeScript + Tailwind CSS
- **Backend:** Express.js + Node.js (Optional/Fallback, migrating to Firebase-only where possible)
- **Database & Services:** Firebase (Firestore, Storage, Authentication, Functions, Hosting)

**Architectural Decisions & Patterns:**
- **Authentication:** Unified Firebase Auth with backend validation; admin access via hardcoded list.
- **UI/UX:** Responsive design, consistent UI, centralized authentication dialogs.
- **Data Management:** Dual collection support for backward compatibility, unified client management system with `clienti` collection, and automatic booking-to-client linkage.
- **Image Handling:** Automatic compression, watermarking, duplicate detection, and advanced cropping.
- **Social Features:** Real-time updates for likes, comments, and voice memos in galleries.
- **Subscription System:** Stripe integration for tiered access control.
- **Email System:** Express.js server via Gmail API with dynamic templates for notifications (orders, quotes, payments).
- **Booking System:** Campaign-based with Google Calendar integration, atomic booking via Firestore transactions, and conflict detection.
- **Security:** Gallery passwords and PINs stored in `gallerySecrets`, server-side verification, granular Firebase Security Rules, token verification, user isolation, and rate limiting.
- **Questionnaire System:** Secure crypto tokens, multi-step forms with auto-save, and ChatGPT export.
- **Special Theme System:** Modular seasonal galleries with dedicated CSS and mandatory PIN-based access.
- **Order & Gallery Management Integration:** Integrated order and gallery creation within BookingsManager, supporting multi-product orders and comprehensive order modification with client email notifications.
- **Photo Selection Workflow:** Enterprise-grade system with progress display, validation, deadline enforcement, automated email notifications, and admin review interface.
- **Transaction & Payment Tracking System:** Advanced payment tracking with a `transactions` array, automatic email notifications for payments received, and dedicated buttons for registration.
- **Job Management System:** Multi-client support with advanced scheduling, conflict detection, dynamic job types, and a comprehensive job detail page with workflow timeline, client management, payment tracking, and cost management.
- **Quote Management System:** Automated email notifications for quote lifecycle (sent, accepted, payment reminders), robust backend protection for signed quotes, and an admin-only reset signature action.
- **Deployment:** Designed for subfolder deployment with dynamic base path detection, aiming for Firebase-only.
- **Error Handling & Logging:** Centralized error boundaries, structured logging, and informative toast notifications.

## External Dependencies
- **Firebase:** Firestore, Storage, Authentication, Functions, Hosting
- **Stripe:** Payment processing for subscriptions
- **Google Calendar API:** Booking slot management
- **Gmail API:** Email delivery
- **Express.js:** Web application framework
- **React:** Frontend library
- **TypeScript:** Type-safe JavaScript
- **Tailwind CSS:** Utility-first CSS framework
- **wouter:** React hook-based router
- **browser-image-compression:** Client-side image compression