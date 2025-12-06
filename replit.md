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
- **Data Management:** Unified client management system with automatic booking/consultation-to-client linkage. Enhanced `convertFirestoreTimestamp()` for seamless compatibility.
- **Image Handling:** Automatic compression, watermarking, duplicate detection, advanced cropping, multi-image uploads using Firebase Storage and signed URLs.
- **Galleries:** Professional client-selection galleries with real-time updates, secure access, and full preloading system for simultaneous image display. **Chapter System (Dec 2025):** Optional chapter-based photo organization allowing photographers to group photos into sections (e.g., "Preparazione Sposa", "Cerimonia", "Ricevimento"). Chapters are completely independent from client selections - moving photos between chapters never affects client choices. Features: ChaptersManager admin UI with drag & drop, client view with collapsible sections, chunked batch updates for large galleries (450 photos per batch to stay under Firestore 500 limit), automatic photo reassignment when chapters are deleted.
- **Email System:** Express.js server via Gmail API with dynamic templates and timezone-aware "Add to Calendar" links.
- **Deployment:** Designed for subfolder deployment with dynamic base path detection, aiming for Firebase-only.
- **Error Handling & Logging:** Centralized error boundaries, structured logging, and informative toast notifications.
- **Admin Dashboard:** Enhanced navigation, Notification Center, and single-level tab structure.
- **Workflow State Management:** Unified WorkflowState enum for booking/order tracking, with email notifications and interactive timeline.
- **Multi-Product Support:** Backend validation for `prodotti: OrderItem[]` in bookings.
- **Collaborator Management:** Token-based dashboard access, comprehensive payment tracking integrated with CashMovement.
- **Phone Number Standardization (Dec 2025):** Centralized `formatPhoneForWhatsApp()` utility in `shared/phone-utils.ts` for consistent WhatsApp link generation. Handles all Italian phone formats: removes non-numeric characters, strips "00" international prefix (0039→39), adds "39" prefix for domestic mobile numbers (starting with 3, 9-10 digits). Applied across all frontend and backend wa.me link generation for consistent behavior.

### Feature Specifications
- **Public Website:** SEO-optimized marketing site with portfolio masonry grid, blog system (WordPress import), biography, e-book download, and booking CTAs.
- **Portfolio System:** Admin-curated public portfolio linked to existing galleries, categorized by `jobType`, with masonry grid, lightbox, lazy loading, and homepage carousel.
- **Blog System:** Firestore-based blog with draft/published/archived states, slug-based URLs, SEO meta fields, and WordPress XML import.
- **Site Content CMS:** Flexible content management via `siteContent` collection for dynamic updates.
- **Subscription System:** Stripe integration for tiered access.
- **Booking & Calendar System:** Campaign-based booking with Google Calendar integration, atomic transactions, comprehensive conflict detection across all calendar events and jobs. **100% Google Calendar as Source of Truth** for availability. **BOTH Consultation and Booking modules now use Calendar Engine V2** with centralized adapter pattern (`campaignToAvailabilityConfig`, `getAllExistingBookingEvents`). Includes Event Sync Guard for bidirectional synchronization and Conflict Resolution System for managing approval conflicts with override justifications and audit logging. **Timezone Fix (Nov 2024):** Migrated `createEvent()` and `updateEvent()` from `.getHours()/.getMinutes()` (server UTC timezone) to Luxon DateTime with explicit Europe/Rome zone, eliminating 1-hour drift. **Comprehensive Timezone Fix Phase 2 (Nov 2024):** Eliminated ALL remaining timezone drift bugs in booking-routes.ts by replacing `.getDay()`, `.setHours()`, `.setDate()` with Calendar Engine V2 helpers (`parseDateString()`, `getDayBoundaries()`, `getWeekday()`, `toRome()`, `toUTC()`). Fixed critical DST bugs in Firestore overlap detection by using DST-safe day boundaries (`requestedDate.minus({ days: 1 }).startOf('day')` → `requestedDate.endOf('day')`). All date operations now delegate to Luxon with Europe/Rome timezone, ensuring correct behavior across DST transitions (March 30, October 26) and midnight edge cases. Architect-verified PASS for production deployment. **Admin Calendar Deduplication (Nov 2024):** Intelligent deduplication prevents consulenze/jobs with `googleCalendarEventId` from appearing twice; orphaned events (stale IDs) surface with ⚠️ warning for manual repair. **Event Sync Guard Performance Optimization (Dec 2025):** Reduced sync range from 13 months (30 days back + 365 days forward) to 4 months (30 days back + 90 days forward) for ~75% faster sync times. Conditional logging: verbose logs (FILTRATO transparent/cancelled) disabled in production via `NODE_ENV` check to reduce I/O overhead.
- **Security:** Gallery passwords/PINs stored in `gallerySecrets`, server-side verification, granular Firebase Security Rules, token verification, user isolation, and rate limiting.
- **Questionnaire System:** Secure crypto tokens, multi-step forms with auto-save, and ChatGPT export.
- **Order & Job Management:** Integrated order and gallery creation within BookingsManager, supporting multi-product orders, client email notifications, and comprehensive job detail page with workflow timeline, payment tracking, and cost management. **Bidirectional State Sync (Nov 2025):** Order↔Booking state synchronization with terminal-state guards: Order→completato syncs Booking→completata; Order→annullato syncs Booking→annullata (unless already terminal); Booking→annullata cascades to Order→annullato and Gallery.orderStatus. Guards prevent overwriting terminal states (completata/annullata) and circular loops. **Client Appointment Scheduling (Dec 2025):** Each Job can track individual appointment times for each client (`appuntamentiClienti` array). Features: per-client appointment time (HH:mm format) and optional notes (address, buzzer info, etc.) in CreateJobModal/EditJobModal; appointment display in JobDetailPage via ClienteJobCard; appointment info exposed in public/signed quote portals so clients see their scheduled appointment time.
- **Photo Selection Workflow:** Enterprise-grade system with progress display, validation, deadline enforcement, automated emails, and admin review, supporting single-product, multi-product, and legacy modes.
- **Transaction & Payment Tracking System:** Advanced payment tracking with `transactions` array, automated email notifications, event-relative payment schedules, and automated payment reminder system via Cloud Functions.
- **Quote Management System:** Automated email notifications, robust backend protection for signed quotes, admin-only reset signature, and unified client portal. Includes advanced manual status management and audit logging. **Manual Email Sending (Nov 2024):** Removed automatic email sending when creating quotes. Admins now have full control via "Invia Email" button with tracking (`emailSentAt` field). Email status shown via badge (yellow "Non inviata" → green "Inviato il [data]"). Perfect for legacy job imports without spamming old clients. **Manual Signature Fix (Dec 2025):** Fixed critical bug where manual signatures didn't show in client portal - added `signedAt` field at document root level (previously only set inside `signature` object). Portal now displays signature and payment summary correctly for both automatic and manual signatures. Email confirmation sent automatically on manual signature. **Firestore Security Hardening (Dec 2025):** Removed dangerous `allow update: if true` rule for quotes collection; now only allows admin updates or client updates limited to signature workflow fields (`status`, `signature`, `signedAt`, `contractClauses`, `products`, `totaleSelezionato`, `viewedAt`, `updatedAt`). **Anonymous Client Signature Fix (Dec 2025):** Created backend endpoint `POST /api/quotes/:id/post-signature` to handle job status/timeline/email updates after signature. Firestore rules block anonymous users from updating jobs/jobTimeline, so this endpoint executes with server-side privileges. Features: publicToken verification, granular idempotency (checks existing timeline events, skips already-confirmed jobs), sends client confirmation + admin notification emails. Client-side `acceptQuote()` now calls this endpoint instead of direct Firestore writes.
- **Consultation System (Consulenze):** Pre-work consultation scheduling with admin-configurable templates, Google Calendar integration, automated email reminders, and conversion to Jobs via API. **Migrated to Calendar Engine V2** for advanced Google Calendar event filtering and conflict detection.
- **Booking System (Prenotazioni):** Public booking form and admin manual booking with campaign-based product selection, multi-product support, Google Calendar integration. **Migrated to Calendar Engine V2 (November 2025)** - V2 endpoints: `/api/booking/v2/available-slots`, `/api/booking/v2/create`, `/api/booking/v2/:id/approve`. Frontend fully migrated (BookingPage.tsx, ManualBookingModal.tsx). Legacy V1 endpoints deprecated. **Day-Based Grouping (Nov 2025):** BookingsManager now displays bookings grouped chronologically by day with intuitive labels ("Oggi", "Domani", "Dopodomani", or full date), color-coded headers, shooting counts per day, and time-ordered bookings within each group. Pagination hidden in grouped view. **Inline Order Management (Dec 2025):** Orders tab removed from admin navigation; order management fully integrated into BookingsManager with expandable order sections, payment dialogs (acconto/saldo), transaction history, WhatsApp integration, and workflow state filtering. Default filter set to "Oggi"; annullate bookings excluded from "Tutte" view.
- **Data Import:** Excel-based import system for clients and jobs, supporting structured field parsing and Firebase Storage integration. **Auto Job Type Creation (Nov 2025):** During Excel import, missing job types are automatically created in the `jobTypes` collection with `createdBy: 'import'` flag. Post-import summary displays newly created job types with link to Job Types Manager for review. Job Types Manager shows "Importato" badge for auto-created types.
- **Cascade Delete System (Nov 2025):** Quote/Order/Gallery deletions now properly clean up job array references (`quoteIds`, `orderIds`, `galleryIds`) using `FieldValue.arrayRemove()` to prevent orphan references. Implementation: server-side for quotes (`quote-routes.ts`), client-side for orders (`orders.ts`) and galleries (`firebase-api.ts`). Jobs use soft delete (archived status) to preserve historical data.

## External Dependencies
- **Firebase:** Firestore, Storage, Authentication, Functions, Hosting
- **Stripe:** Payment processing for subscriptions
- **Google Calendar API:** Booking slot management and event synchronization
- **Gmail API:** Email delivery
- **Express.js:** Web application framework (for backend services and APIs)
- **React:** Frontend library
- **TypeScript:** Type-safe JavaScript
- **Tailwind CSS:** Utility-first CSS framework
- **wouter:** React hook-based router
- **browser-image-compression:** Client-side image compression
- **html2pdf.js:** PDF generation from HTML
- **luxon:** Timezone-aware date/time handling (for scheduling and reminders)