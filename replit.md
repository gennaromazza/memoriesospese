# Image Studio - Piattaforma Completa per Fotografi Professionisti

## Overview
Image Studio è una piattaforma all-in-one per fotografi professionisti, progettata per rivoluzionare la gestione dello studio fotografico unendo fotografi e clienti in un'unica esperienza digitale integrata. L'obiettivo è gestire ogni aspetto del business fotografico, dal primo contatto alla consegna finale. Le sue capacità principali includono la gestione clienti unificata, un sistema di prenotazioni avanzato con integrazione Google Calendar, gallerie fotografiche professionali con selezione client-side, questionari personalizzabili, gestione ordini completa e un sistema di email integrato. La visione è essere il punto di riferimento per i fotografi professionisti, offrendo una piattaforma completa che gestisce ogni aspetto del business fotografico.

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
- **UI/UX:** Responsive design, consistent UI/UX including color palette and centralized authentication dialogs.
- **Data Management:** Unified client management system with `clienti` collection, dual collection support for backward compatibility, and automatic booking-to-client linkage.
- **Image Handling:** Automatic compression, watermarking, duplicate detection, advanced cropping, multi-image uploads (Firebase Storage, signed URLs), and secure gallery access via passwords/PINs.
- **Galleries:** Professional galleries with client-side selection, real-time updates (likes, comments, voice memos), and secure access.
- **Subscription System:** Stripe integration for tiered access control.
- **Email System:** Express.js server via Gmail API with dynamic templates, "Add to Calendar" Google Calendar links, timezone-aware formatting, and Italian localization.
- **Booking & Calendar System:** Campaign-based with Google Calendar integration for booking slots, atomic transactions, conflict detection, flexible event duration, timezone-safe all-day events, and automated Google Calendar link generation.
- **Security:** Granular Firebase Security Rules, token verification, user isolation, rate limiting, server-side verification for gallery passwords/PINs, and private PDF uploads via signed URLs.
- **Questionnaire System:** Secure crypto tokens, multi-step forms with auto-save, and ChatGPT export.
- **Theming:** Modular seasonal galleries with dedicated CSS and mandatory PIN-based access.
- **Order & Job Management:** Integrated order and gallery creation within BookingsManager, supporting multi-product orders, comprehensive modification, client email notifications, multi-client support, advanced scheduling, dynamic job types, and a comprehensive job detail page with workflow timeline, client management, payment tracking, and cost management.
- **Photo Selection Workflow:** Enterprise-grade system with progress display, validation, deadline enforcement, automated email notifications, and admin review interface. Features a three-mode architecture: Single-product (1 product, N photos), Multi-product (2+ products with lightbox + chip/badge assignment), and Legacy mode for backward compatibility.
- **Transaction & Payment Tracking System:** Advanced payment tracking with a `transactions` array, automatic email notifications, and dedicated registration buttons.
- **Quote Management System:** Automated email notifications for quote lifecycle, robust backend protection for signed quotes, admin-only reset signature action, and a unified client portal (`/quote/:token`) that adapts based on quote status. Includes Instagram-ready admin notifications, advanced manual status management with financial safeguards, token revocation tracking, audit logging, and manual signature insertion.
- **Consultation System (Consulenze):** Pre-work consultation scheduling with admin-configurable templates, mandatory `customWorkingHours` per-template, Google Calendar integration, and automated email notifications. Consultations are standalone entities convertible to Jobs.
- **Data Import:** Excel-based import system for clients and jobs, supporting structured field parsing and Firebase Storage integration.
- **Deployment:** Designed for subfolder deployment with dynamic base path detection, aiming for Firebase-only.
- **Error Handling & Logging:** Centralized error boundaries, structured logging, and informative toast notifications.
- **Admin Dashboard:** Enhanced navigation with dropdown menus, a Notification Center with deeplinks, and a single-level tab structure.
- **Workflow State Management:** Unified WorkflowState enum (6 states) with admin management via touch-friendly dropdowns and integrated client email notifications. Mobile-first UI with an interactive workflow timeline displaying dynamic events.
- **Multi-Product Booking Support:** Backend supports `prodotti: OrderItem[]` for bookings with multiple products, maintaining backward compatibility and server-side validation.
- **Collaborator Management & Payment System:** Token-based collaborator dashboard access (magic link), comprehensive payment tracking with `pagamenti[]` array on assignments, dual record creation (payment + CashMovement), admin UI for payment management, and a collaborator-facing public dashboard for job assignments and financial summary.

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
```