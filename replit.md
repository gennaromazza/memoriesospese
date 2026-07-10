# Image Studio - Piattaforma Completa per Fotografi Professionisti

## Overview
Image Studio is an all-in-one platform for professional photographers, designed to streamline studio management. It integrates photographers and clients into a single digital experience, managing every aspect of the photography business from initial contact to final delivery. Key capabilities include unified client management, advanced booking with Google Calendar integration, professional client-selection galleries, customizable client questionnaires, comprehensive order management, and an integrated email system. The vision is to be the definitive platform for professional photographers, covering all their business needs and offering a complete digital solution.

## User Preferences
- Language: Italian for UI and user messages.
- Coding Style: TypeScript strict, modular components.
- Error Handling: Informative toast notifications with clear descriptions.
- Admin Features: Full access for gennaro.mazzacane@gmail.com.
- The agent should prioritize fixing critical security vulnerabilities and authentication inconsistencies.
- Iterative development with clear communication before major architectural changes.

## System Architecture

### UI/UX Decisions
- **Public Website Design:** Playfair Display typography, warm terracotta/cream/sage color palette, mobile-first responsive design with smooth animations.
- **Admin Design:** Sage/beige color palette.
- **Responsive Design:** Consistent UI across all platforms.
- **Centralized Authentication Dialogs.**

### Technical Implementations
- **Frontend:** React + TypeScript + Tailwind CSS.
- **Backend:** Express.js + Node.js (migrating to Firebase-only where possible).
- **Database & Services:** Firebase (Firestore, Storage, Authentication, Functions, Hosting).
- **Authentication:** Unified Firebase Auth with backend validation; admin access via hardcoded list.
- **Data Management:** Unified client management system; distinct Firestore/Frontend data type conventions.
- **Image Handling:** Automatic compression, watermarking, duplicate detection, advanced cropping, multi-image uploads, and a Gallery Recovery & Merge System.
- **Galleries:** Professional client-selection galleries with real-time updates, secure access, preloading, optional chapter organization, cover photo position editor, and 6 customizable header themes. Public view performance optimized via `LazyInteractionPanel` (IntersectionObserver-mounted likes/comments panel, avoids 3 Firestore queries per offscreen photo), Firestore cursor-based pagination (`useInfiniteQuery` with `startAfter`, 50 photos per page, hybrid auto-fetch: first page renders instantly, remaining pages fetched automatically in background for complete lightbox/selection support), `imageCache` LRU eviction (max 250 entries), `staleTime: 5min` (prevents refetch on tab switch/scroll), `content-visibility: auto` on below-fold PhotoCard masonry items, `selectedPhotoIdsSet` (O(1) Set lookup replacing O(n) array includes), automatic thumbnail preloading (first 12 photos via `imageCache` on metadata arrival), and optimized CSS transitions (`transform 150ms` + `box-shadow 200ms` with `will-change: transform`).
- **Email System:** Express.js server via Gmail API with dynamic templates, timezone-aware "Add to Calendar" links, and automated gallery password notifications.
- **Deployment:** Designed for subfolder deployment with dynamic base path detection.
- **Error Handling & Logging:** Centralized error boundaries, structured logging, and informative toast notifications.
- **Admin Dashboard:** Enhanced navigation, Notification Center, and single-level tab structure.
- **Workflow State Management:** Unified `WorkflowState` enum for booking/order tracking, with email notifications and interactive timeline.
- **Collaborator Management:** Token-based dashboard access and comprehensive payment tracking.
- **Phone Number Standardization:** Centralized utility for consistent WhatsApp link generation.
- **Timezone Management:** Centralized Luxon-based utilities for `Europe/Rome` timezone on the server, client-side uses browser's local timezone.
- **SEO & AI Discoverability:** Comprehensive system including dynamic meta tags, server-side prerendering, `llms.txt`, dynamic sitemap generation, and extensive JSON-LD structured data.
- **Radix UI Patch:** Custom patch for `@radix-ui/react-compose-refs` to resolve re-render issues.

### Feature Specifications
- **Public Website:** SEO-optimized marketing site with portfolio, blog, biography, e-book, and booking CTAs.
- **Portfolio System:** Admin-curated public portfolio linked to galleries, categorized by `jobType`, with masonry grid, lightbox, lazy loading, and homepage carousel.
- **Blog System:** Firestore-based blog with draft/published/archived states, slug-based URLs, SEO meta fields, and WordPress XML import.
- **Site Content CMS:** Flexible content management for dynamic updates.
- **Subscription System:** Stripe integration for tiered access.
- **Booking & Calendar System:** Campaign-based booking with Google Calendar integration (Google Calendar as Source of Truth) using Calendar Engine V2 for availability, conflict detection, and event synchronization.
- **Security:** Gallery passwords/PINs stored in `gallerySecrets`, server-side verification, Firebase Security Rules, token verification, user isolation, and rate limiting.
- **GDPR Compliance:** Complete implementation including cookie consent, privacy/cookie policies, consent checkboxes, and a data deletion/export request system.
- **Questionnaire System:** Secure crypto tokens, multi-step forms with auto-save, and ChatGPT export.
- **Order & Job Management:** Integrated order and gallery creation, multi-product orders, client email notifications, job detail page with workflow timeline, payment tracking, cost management, and client integration for walk-in orders.
- **Product Bundle System:** Products can be marked as bundles containing multiple component products, with automatic expansion during gallery creation.
- **Photo Selection Workflow:** Enterprise-grade system with progress display, validation, deadline enforcement, automated emails, admin review, supporting single-product, multi-product, legacy, unlimited, and bundle modes.
- **Transaction & Payment Tracking System:** Advanced payment tracking, automated email notifications, event-relative payment schedules, automated payment reminders, payment remodulation, and integration with `CashMovement`.
- **Quote Management System:** Automated email notifications, backend protection for signed quotes, admin-only signature reset, unified client portal, and a "Preventivo Rapido" (Quick Quote) system for shareable public links.
- **Consultation System (Consulenze):** Pre-work consultation scheduling with admin-configurable templates, Google Calendar integration, automated email reminders, and conversion to Jobs via API, migrated to Calendar Engine V2.
- **Booking System (Prenotazioni):** Public booking form and admin manual booking with campaign-based product selection, multi-product support, and Google Calendar integration, migrated to Calendar Engine V2.
- **Data Import:** Excel-based import system for clients and jobs, supporting structured field parsing, Firebase Storage integration, and automatic job type creation.
- **Cascade Delete System:** Proper cleanup of associated data (job references, photos) upon deletion of quotes, orders, or galleries.
- **System Audit Tools:** Automated admin-only audit system for data integrity, workflow consistency, and calendar sync issues, including an Orphaned Photos Manager.
- **Quote Benefits System:** Per-quote configurable benefit rules (`shared/quote-benefits.ts`) with pure `computeBenefitStates()` function; states: locked/preview/unlocked; admin UI in QuoteBuilder and QuoteTemplatesManager (sezione 3, variabile quotes only); client-facing live panel in QuotePublicViewPage with progress bar and dynamic feedback messages; benefits never affect totals. Each `BenefitRule` specifies a `benefitProductName` (the product that becomes FREE/OMAGGIO) and optional trigger conditions (`requiredProductNames[]` and/or `minSelectableCount`).
- **Photobook Review System (Fotolibri):** Client-facing photobook proof review via token link (`/fotolibro/:token`). Clients draw colored X marks on pages to request replace/delete/edit changes (drafts sent in batch, server-side snapshot validation via `snapshotUrlPrefix`); clients can delete already-sent requests (any status) with best-effort snapshot regeneration for remaining marks. Admin can lock a photobook ("Manda in Stampa" in PhotobooksManager): `Photobook.locked` enforced server-side (403 on snapshot/submit/delete by-token), client sees read-only "Album mandato in stampa" banner; only admin can unlock. Replacement photo picker supports large galleries (search, chapter filter from `galleries/{id}.chapters[]` + `chapterId` on photos, progressive rendering in 60-photo batches). Routes: `server/photobook-routes.ts`; types: `shared/photobook-types.ts`.
- **Info Forms System (Moduli Informativi):** Reusable logistical form templates (Firestore: `infoFormTemplates`) sent to job clients via unique-token public link (`/modulo/:token`). Responses stored in `infoFormSubmissions`, admin notifications in `infoFormNotifications`. Admin template manager in Gallerie dropdown. Job-level sending/viewing in JobDetailDrawer "Moduli" tab. Email notifications to client on send, to admin on submission. Types: `shared/info-form-types.ts`; service: `client/src/lib/infoForms.ts`.

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