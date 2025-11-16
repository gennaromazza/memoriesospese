# Image Studio - Piattaforma Completa per Fotografi Professionisti

## Overview
Image Studio is an all-in-one platform for professional photographers, designed to streamline studio management. It aims to integrate photographers and clients into a single digital experience, managing every aspect of the photography business from initial contact to final delivery. Key capabilities include unified client management, advanced booking with Google Calendar integration, professional client-selection galleries, customizable client questionnaires, comprehensive order management, and an integrated email system. The vision is to be the definitive platform for professional photographers, covering all their business needs.

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
- **Data Management:** Unified client management system with automatic booking/consultation-to-client linkage (`sourceRefs.consultationIds`); dual collection support for backward compatibility. Clients from consultations are created with complete schema (lifecycle.status, financials, sourceRefs).
- **Image Handling:** Automatic compression, watermarking, duplicate detection, advanced cropping, multi-image uploads using Firebase Storage and signed URLs.
- **Galleries:** Professional galleries with client-side selection, real-time updates, and secure access via passwords and PINs. Support for modular seasonal galleries with dedicated CSS.
- **Subscription System:** Stripe integration for tiered access control.
- **Email System:** Express.js server via Gmail API with dynamic templates, including timezone-aware "Add to Calendar" links for Google Calendar.
- **Booking & Calendar System:** Campaign-based booking with Google Calendar integration, atomic transactions, conflict detection, flexible event duration, timezone-safe all-day events, and automated Google Calendar link generation.
- **Security:** Gallery passwords/PINs stored in `gallerySecrets`, server-side verification, granular Firebase Security Rules, token verification, user isolation, and rate limiting. PDF uploads use signed URLs.
- **Questionnaire System:** Secure crypto tokens, multi-step forms with auto-save, and ChatGPT export.
- **Order & Job Management:** Integrated order and gallery creation within BookingsManager, supporting multi-product orders, comprehensive modification, and client email notifications. Features multi-client support, advanced scheduling, dynamic job types, and a comprehensive job detail page with workflow timeline, client management, payment tracking, and cost management.
- **Photo Selection Workflow:** Enterprise-grade system with progress display, validation, deadline enforcement, automated email notifications, and admin review. Supports three modes: single-product, multi-product (using `productRequirements[]`), and legacy manual `requiredPhotoCount`.
- **Transaction & Payment Tracking System:** Advanced payment tracking with `transactions` array, automated email notifications for payments, and dedicated registration buttons.
- **Quote Management System:** Automated email notifications for quote lifecycle, robust backend protection for signed quotes, and admin-only reset signature. Unified client portal via `/quote/:token` adapts to quote status. Includes Instagram-ready admin notifications upon client signature. Advanced manual status management with Firebase-authenticated endpoints, preflight validation, token revocation tracking, comprehensive audit logging, and manual signature insertion. Integrated into JobDetailPage.
- **Consultation System (Consulenze):** Pre-work consultation scheduling with admin-configurable templates, mandatory `customWorkingHours` per-template, Google Calendar integration with timezone-safe event creation (using `createEuropeRomeDate`), and automated email notifications. Consultations are standalone entities convertible to Jobs via API. Slot generation strictly requires `template.customWorkingHours`. Includes migration support for working hours. **Reminder System:** Automated 24h advance reminder emails via POST /api/consultations/send-reminders endpoint (schedulable with Cloud Functions cron), using Luxon for DST-safe Europe/Rome timezone calculations and Firestore transactions for atomic duplicate prevention. Consultations linked to unified client collection via `linkConsultationToCliente` with full schema compliance (lifecycle, financials, sourceRefs).
- **Data Import:** Excel-based import system for clients and jobs, supporting structured field parsing and Firebase Storage integration.
- **Deployment:** Designed for subfolder deployment with dynamic base path detection, aiming for Firebase-only.
- **Error Handling & Logging:** Centralized error boundaries, structured logging, and informative toast notifications.
- **Admin Dashboard:** Enhanced navigation with dropdown menus, a Notification Center with deeplinks for approved photo selections and bookings, and a single-level tab structure for clear separation of concerns.
- **Workflow State Management:** Unified WorkflowState enum (6 states) for booking/order tracking, managed via a touch-friendly dropdown in BookingsManager with email notifications to clients. Interactive workflow timeline displays dynamic events.
- **Multi-Product Booking Support:** Backend supports `prodotti: OrderItem[]` for bookings with multiple products, ensuring server-side validation and backward compatibility.
- **Collaborator Management & Payment System:** Token-based collaborator dashboard access (magic link). Comprehensive payment tracking with `pagamenti[]` array on assignments, integrated with CashMovement for financial tracking. Admin UI shows `saldo residuo`, payment history, and registration modal. Collaborator-facing dashboard displays job assignments, compensation totals, and payment history.

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
- **luxon:** Timezone-aware date/time handling for DST-safe reminder scheduling