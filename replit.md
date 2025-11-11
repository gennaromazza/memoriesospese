# Image Studio - Piattaforma Completa per Fotografi Professionisti

## Overview
Image Studio è una piattaforma all-in-one per fotografi professionisti che rivoluziona la gestione dello studio fotografico. È un ecosistema completo che unisce fotografi e clienti in un'unica esperienza digitale integrata, gestendo ogni aspetto del business fotografico, dal primo contatto alla consegna finale. Le sue capacità principali includono la gestione clienti unificata, un sistema di prenotazioni avanzato con integrazione Google Calendar, gallerie fotografiche professionali con selezione client-side, questionari personalizzabili per clienti, gestione ordini completa, e un sistema di email integrato.

**Vision:** Essere il punto di riferimento per i fotografi professionisti, offrendo una piattaforma completa che gestisce ogni aspetto del business fotografico - dal primo contatto alla consegna finale.

## Recent Changes (November 2025)
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