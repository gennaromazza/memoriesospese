# Image Studio - Piattaforma Completa per Fotografi Professionisti

## Overview
Image Studio è una piattaforma all-in-one per fotografi professionisti che rivoluziona la gestione dello studio fotografico. Il suo scopo è unire fotografi e clienti in un'unica esperienza digitale integrata, gestendo ogni aspetto del business fotografico, dal primo contatto alla consegna finale. Le sue capacità principali includono la gestione clienti unificata, un sistema di prenotazioni avanzato con integrazione Google Calendar, gallerie fotografiche professionali con selezione client-side, questionari personalizzabili per clienti, gestione ordini completa e un sistema di email integrato. La visione è essere il punto di riferimento per i fotografi professionisti, offrendo una piattaforma completa che gestisce ogni aspetto del business fotografico.

## User Preferences
- Language: Italian for UI and user messages.
- Coding Style: TypeScript strict, modular components.
- Error Handling: Informative toast notifications with clear descriptions.
- Admin Features: Full access for gennaro.mazzacane@gmail.com.
- The agent should prioritize fixing critical security vulnerabilities and authentication inconsistencies.
- Iterative development with clear communication before major architectural changes.

## System Architecture

**Core Technologies:**
- **Frontend:** React + TypeScript + Tailwind CSS
- **Backend:** Express.js + Node.js (Optional/Fallback, migrating to Firebase-only where possible)
- **Database & Services:** Firebase (Firestore, Storage, Authentication, Functions, Hosting)

**Architectural Decisions & Patterns:**
- **Authentication:** Unified Firebase Auth with backend validation; admin access via hardcoded list.
- **UI/UX:** Responsive design, consistent UI, centralized authentication dialogs, consistent color palette.
- **Data Management:** Dual collection support for backward compatibility, unified client management system with `clienti` collection, and automatic booking-to-client linkage.
- **Image Handling:** Automatic compression, watermarking, duplicate detection, advanced cropping, multi-image uploads (Firebase Storage, signed URLs).
- **Galleries:** Professional galleries with client-side selection, real-time updates for likes, comments, and voice memos. Secure access via passwords and PINs.
- **Subscription System:** Stripe integration for tiered access control.
- **Email System:** Express.js server via Gmail API with dynamic templates for notifications (orders, quotes, payments, consultations). Integrated "Aggiungi al Calendario" (Add to Calendar) Google Calendar links in confirmation emails with timezone-aware date formatting, Italian localization, and brand-consistent styling (#8b5a3c).
- **Booking & Calendar System:** Campaign-based with Google Calendar integration for booking slots, atomic booking via Firestore transactions, and conflict detection. Features include flexible event duration selection, timezone-safe all-day event handling, and automated Google Calendar link generation for confirmed appointments with proper UTC conversion and exclusive end-date handling.
- **Security:** Gallery passwords and PINs stored in `gallerySecrets`, server-side verification, granular Firebase Security Rules, token verification, user isolation, and rate limiting. PDF uploads remain private using signed URLs.
- **Questionnaire System:** Secure crypto tokens, multi-step forms with auto-save, and ChatGPT export.
- **Theming:** Modular seasonal galleries with dedicated CSS and mandatory PIN-based access.
- **Order & Job Management:** Integrated order and gallery creation within BookingsManager, supporting multi-product orders and comprehensive order modification with client email notifications. Multi-client support, advanced scheduling, dynamic job types, and a comprehensive job detail page with workflow timeline, client management, payment tracking, and cost management.
- **Photo Selection Workflow:** Enterprise-grade system with progress display, validation, deadline enforcement, automated email notifications, and admin review interface. **Three-mode architecture** for optimal UX: (1) Single-product mode (1 product with N photos) uses `requiredPhotoCount` with direct 1-click photo toggle; (2) Multi-product mode (2+ products) uses `productRequirements[]` array with lightbox + chip/badge assignment; (3) Legacy mode (manual requiredPhotoCount) for backward compatibility. NewGalleryModal persists single-product as `requiredPhotoCount` (not array), EditGalleryModal prioritizes loading from `gallery.productRequirements` with fallback to orders/bookings, and Gallery.tsx implements consistent mode detection with proper hydration and auto-save support.
- **Transaction & Payment Tracking System:** Advanced payment tracking with a `transactions` array, automatic email notifications for payments received, and dedicated buttons for registration.
- **Quote Management System:** Automated email notifications for quote lifecycle (sent, accepted, payment reminders), robust backend protection for signed quotes, and an admin-only reset signature action.
- **Consultation System (Consulenze):** Pre-work consultation scheduling and data collection with admin-configurable templates, per-template availability customization with **mandatory `customWorkingHours`** (7-day grid, per-template, no default fallback), Google Calendar integration (sync on approval via `POST /api/consultations/:id/approve`), and automated email notifications (received/approved/rejected). **Architecture:** Consultations are standalone entities separate from Bookings; conversion to Jobs via `/api/consultations/:id/convert-to-job` endpoint. No automatic Consultation→Booking bridge; ManualBookingModal handles only regular bookings (separate scheduling logic). **Slot Generation Logic:** `getAvailableSlotsForDate` strictly requires `template.customWorkingHours` - no fallback defaults. Day exclusions managed via `attivo=false` in working hours grid (not `excludedDays` array). **Migration Support:** `PATCH /api/consultations/migrate-initialize-working-hours?dryRun=false&syncAll=true` initializes missing schedules AND reconciles `excludedDays` with `customWorkingHours` to prevent weekday slot outages (e.g., Monday bug fix).
- **Data Import:** Excel-based import system for clients and jobs, supporting structured field parsing and Firebase Storage integration.
- **Deployment:** Designed for subfolder deployment with dynamic base path detection, aiming for Firebase-only.
- **Error Handling & Logging:** Centralized error boundaries, structured logging, and informative toast notifications.
- **Admin Dashboard:** Enhanced navigation with dropdown menus for key modules (Consulenze, Prenotazioni, Impostazioni), and a Notification Center for unread activity. **Notification Deeplinks:** Click-to-open integration for approved photo selections and bookings with automatic scroll and highlight. **Navigation Architecture:** Single-level tab structure eliminates duplicate navigation - BookingsManager delegates order navigation to AdminDashboard via `onRequestOpenOrdersTab` callback, maintaining clean separation of concerns. Legacy sessionStorage values ('commesse') sanitized to prevent invalid tab states.
- **Workflow State Management:** Booking/Order workflow tracking system with unified WorkflowState enum (6 states: shooting_da_svolgere → shooting_completato → in_lavorazione → in_attesa_selezione → completato → consegnato). Admin manages states via touch-friendly dropdown with confirmation dialog in BookingsManager. Email notifications to clients integrated (email delivery via server endpoints). **Mobile-First UI:** Touch-friendly buttons (h-12), responsive card layout, optimized spacing for smartphone usage.
- **Multi-Product Booking Support:** Backend `/api/booking/create` now supports `prodotti: OrderItem[]` array for bookings with multiple products. Server-side validation ensures products belong to campaign. Maintains backward compatibility with legacy `prodottoId/prodottoNome` fields. Prevents data loss when admin creates bookings with product bundles.

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
- **html2pdf.js:** PDF generation from HTML