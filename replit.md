# Image Studio - Piattaforma Completa per Fotografi Professionisti

## Overview
Image Studio è una piattaforma all-in-one per fotografi professionisti che rivoluziona la gestione dello studio fotografico. Non è solo un semplice sito di gallerie, ma un ecosistema completo che unisce fotografi e clienti in un'unica esperienza digitale integrata.

## Recent Changes (November 2025)
- **Order Payment Email Notification System** (November 10, 2025): Sistema automatico di notifiche email per registrazione pagamenti
  - **Professional HTML Template**: createOrderPaymentReceivedEmailHTML con design luxury Image Studio palette
  - **Email Content**: Tipo pagamento (acconto/saldo), importo, metodo, data, note opzionali, saldo rimanente con scadenza
  - **API Endpoint**: POST /api/orders/payment-received-notification (validates orderId, paymentType, paymentAmount, paymentMethod, paymentDate)
  - **Automatic Email Dispatch**: Email inviata automaticamente DOPO updateDoc in recordSaldoPayment e addAccontoPayment (non-blocking try-catch)
  - **Critical Bug Fixed**: remainingBalance calculation corretto usando orderData.saldo post-update (era: totale - paymentAmount ignorando acconti multipli)
  - **Transaction Tracking**: markTransactionEmailSent aggiorna flag emailInviata dopo invio email
  - **Error Handling**: Email failures non bloccano registrazione pagamento, console logging per debugging
  - **Email Style**: Verde #28a745 per success state, NO emoji in subject, consistent con palette Image Studio
  - **Files Modified**:
    - Backend: `server/email-routes.ts` (template), `server/order-routes.ts` (endpoint)
    - Frontend: `client/src/lib/orders.ts` (recordSaldoPayment, addAccontoPayment con apiRequest integration)

- **Quote Email Notification System** (November 10, 2025): Sistema completo di notifiche email automatiche per preventivi
  - **3 Template HTML Professionali**: createQuoteSentEmailHTML (invio preventivo), createQuoteAcceptedEmailHTML (conferma firma), createPaymentReminderEmailHTML (promemoria scadenze)
  - **3 API Endpoints**: POST /api/quotes/send-quote, /api/quotes/quote-signed-notification, /api/quotes/payment-reminder
  - **Automatic Email Dispatch**: Email automatica quando admin crea preventivo (QuoteBuilder.tsx onSuccess) e quando cliente firma (acceptQuote in quotes.ts)
  - **Robust Error Handling**: Email failures non bloccano il flusso principale, toast notifications per feedback utente
  - **Multi-Fallback Email Resolution**: quote.sentTo → clientiInfo[0].email → clienteId lookup
  - **Tracking Fields**: sentAt, sentTo aggiornati automaticamente su quote document
  - **Manual Payment Reminders**: Endpoint pubblico per invio promemoria manuale/schedulato con calcolo giorni scadenza
  - **Files Modified**:
    - Backend: `server/email-routes.ts` (3 template esportati), `server/quote-routes.ts` (3 endpoint)
    - Frontend: `client/src/components/quotes/QuoteBuilder.tsx` (auto-send on create), `client/src/lib/quotes.ts` (auto-send on accept)

- **Job Detail Page - Gestionale Completo** (November 8, 2025): Pagina dettaglio lavoro professionale ispirata al vecchio gestionale
  - **Layout 2 Colonne**: Main content + Workflow timeline sidebar
  - **Header Completo**: Nome evento, data/orari, badges tipo/status, actions dropdown menu
  - **Workflow Timeline**: 8 step configurabili (creazione → completamento), icone lucide-react, checkbox admin, date tracking
  - **Sezione Clienti**: Multi-client cards con quick actions (email, WhatsApp, phone), fetch parallelo useQueries
  - **Sezione Pagamenti**: Display financials (totale preventivato, pagato, saldo residuo)
  - **Sezione Costi**: CRUD inline con table, calcolo margine automatico (prezzo - costi), stats cards
  - **Sezione Moduli**: Placeholder per questionari sposi (ready per integrazione gallerie)
  - **Actions Dropdown**: Edit Job, Generate Quote (stub), Export PDF (stub), Delete Job
  - **Routing**: JobsManager card onClick → navigate `/admin/jobs/:jobId`
  - **Files Modified**:
    - New: `shared/job-workflow-types.ts`, `client/src/pages/JobDetailPage.tsx`
    - New Components: `WorkflowTimeline.tsx`, `ClienteJobCard.tsx`, `CostiLavoroTable.tsx`, `ModuliPrenotazioneSection.tsx`
    - Updated: `shared/jobs-types.ts` (CostoLavoro + costi[]), `client/src/App.tsx` (route), `JobsManager.tsx` (navigate)
    - Firebase: `firestore.rules` deployed (jobs, jobTimeline, paymentSchedules)

- **Jobs System Complete Enhancement** (November 8, 2025): Fully migrated to multi-client support with advanced scheduling
  - **Schema Migration**: `clienteId` → `clientiIds[]` for multi-client jobs (sposi)
  - **New Fields**: `nomeEvento` (user-friendly name), `allDay` (boolean), `startTime`/`endTime` (HH:mm format)
  - **Multi-Client Support**: ClientAutocomplete + chips UI, automatic sourceRefs.jobIds update for all linked clienti
  - **Advanced Scheduling**: Dual-mode date input (manual typing dd/mm/yyyy + calendar), conflict detection via Google Calendar + Firestore bookings
  - **Conflict Detection**: Auto-triggered AlertDialog with debounce 500ms, auto-close when resolved
  - **Dynamic Entities**: Firestore-based job types and provenances (no hardcoded enums)
  - **Visualization Updates**: JobsManager card shows nomeEvento + clienti count + time info, JobDetailDrawer displays multi-clienti list
  - **Search Enhancement**: Search by nomeEvento (backend + frontend filtering)
  - **Hybrid Filtering**: getAllJobs uses array-contains when possible, client-side fallback for incompatible filters
  - **Firebase Security Rules**: Updated for jobs, jobTimeline, paymentSchedules collections with multi-client access
  - **Files Modified**: 
    - Schema: `shared/jobs-types.ts`, `shared/job-provenances.ts`
    - Backend: `client/src/lib/jobs.ts`, `server/job-routes.ts` (check-calendar endpoint)
    - Components: `CreateJobModal.tsx`, `JobDetailDrawer.tsx`, `JobsManager.tsx`, `ClientAutocomplete.tsx`
    - Rules: `firestore.rules` (jobs, jobTimeline, paymentSchedules)

**Key Capabilities:**
- **Gestione Clienti Unificata:** Database centralizzato con anagrafica completa, storico attività, gestione finanziaria e tracciamento sorgenti.
- **Sistema di Prenotazioni:** Campagne booking con Google Calendar integration, controllo slot disponibili, homepage banner automatico.
- **Gallerie Fotografiche Avanzate:** Password-protected, like/comment system, voice memos, watermarking, multi-YouTube video, dual-device cover images.
- **Selezione Foto Clienti:** Workflow enterprise con selezione multi-prodotto, deadline enforcement, notifiche email automatiche, admin review interface.
- **Questionari per Sposi:** Accesso sicuro con crypto tokens, form multi-step con auto-save, export ChatGPT, localStorage backup.
- **Gallerie Tematiche Speciali:** Accesso PIN-based, CSS modulari stagionali, email notification automatica.
- **Gestione Ordini:** Multi-product orders, custom products, dynamic badging, transaction tracking con acconto/saldo.
- **Email System Integrato:** Gmail API con template dinamici, notifiche automatiche per eventi (nuove foto, pagamenti, selezioni).
- **Admin Dashboard Completo:** Gestione gallerie, utenti, ordini, clienti, subscription Stripe (Free/Starter/Pro/Premium).
- **Sistema di Importazione:** CSV import clienti con sincronizzazione, duplicate detection, merge capabilities.

**Vision:** Essere il punto di riferimento per i fotografi professionisti, offrendo una piattaforma completa che gestisce ogni aspetto del business fotografico - dal primo contatto alla consegna finale.

**Branding:**
- Nome: Image Studio
- Dominio: imagestudiofotografico.com
- Posizionamento: Piattaforma all-in-one per fotografi professionisti, non un semplice sito di gallerie

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
- **Authentication:** Unified Firebase Auth with backend validation. Admin uses hardcoded list. Anonymous for guests.
- **Gallery Routing & Identifiers:** Dual-lookup for `code` and legacy Firestore IDs.
- **Data Management:** Dual collection support for backward compatibility.
- **Image Handling:** Automatic compression, watermarking, duplicate detection, and dual-device advanced cropping.
- **Social Features:** Real-time updates for likes, comments, and voice memos.
- **User Interface:** Responsive design, consistent UI, centralized authentication dialogs.
- **Subscription System:** Stripe integration for tiered access control.
- **Email System:** Express.js server via Gmail API (Replit OAuth2) with dynamic templates.
- **Booking System:** Campaign-based with Google Calendar integration and atomic booking via Firestore transactions. Features slider advance, flexible booking control, and smart navigation with auto-scroll and highlight. Public page disables past time slots.
- **Security - Password Protection System:** Gallery passwords and PINs stored in `gallerySecrets` collection (admin-only). Server-side verification. Mutual exclusivity for password/PIN modes in UI.
- **Deployment:** Designed for subfolder deployment with dynamic base path detection, aiming for Firebase-only.
- **Error Handling & Logging:** Centralized error boundaries, structured logging.
- **Code Quality:** Strict TypeScript, modular components, unified interfaces.
- **Security:** Granular Firebase Security Rules, token verification, user isolation, rate limiting.
- **Questionnaire System:** Secure crypto tokens, SHA-256 hashing, role-based access, multi-step forms, auto-save, localStorage backup, progress tracking, and ChatGPT export.
- **Special Theme System:** Modular seasonal galleries with dedicated CSS. Mandatory PIN-based access. Server-side PIN uniqueness validation and automatic email notification on creation/modification.
- **Order & Gallery Management Integration:** Integrated order and gallery creation within BookingsManager. Supports multi-product orders, custom products, dynamic badging, and pre-population from booking data. Multi-product gallery creation with product selection dropdown. EditOrderModal allows comprehensive order modification with client email notifications.
- **Photo Selection Workflow:** Enterprise-grade system with selection mode, progress display, validation, deadline enforcement, automated email notifications, and admin review interface.
- **Transaction & Payment Tracking System:** Advanced payment tracking with a `transactions` array for history (acconto/saldo). Automatic email notifications for payments received. Dedicated buttons for payment registration ensure proper tracking.
- **Unified Client Management System:** Centralized `clienti` Firestore collection with comprehensive anagrafici, contacts, address, status, financial tracking, source refs, tags, and metadata. Backward compatibility with `clienteId`. Migration script available. Modular UI components (Form, Table, QuickActions, Storico, DetailDrawer, Manager). Integrated into AdminDashboard. Includes real-time statistics dashboard.
- **Automatic Booking→Cliente Linkage:** Server-side automatic population of `sourceRefs.bookingIds` when bookings are created. Uses deterministic hash ID (base64url email) for new clients with full backward compatibility for legacy clients (random IDs + mixed-case emails). Implements Firestore transaction atomicity, paginated case-insensitive lookup with orderBy cursors, and arrayUnion deduplication. Prevents race conditions and duplicate cliente records. Production-ready implementation validated by architect.

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