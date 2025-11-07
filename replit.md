# Wedding Gallery App - Progetto

## Overview
A platform for preserving wedding memories, revolutionizing the digital capture and sharing of multimedia memories for couples and guests. The application provides an innovative and interactive solution to preserve and explore wedding moments.

**Key Capabilities:**
- Secure, password-protected galleries with like/comment system and voice memos.
- Photo upload with compression and watermarking (paid plans).
- Email notifications for new photos.
- Admin panel for gallery, user, and subscription management.
- Stripe integration for subscription management (Free, Starter, Pro, Premium).
- Questionnaire system for couples with secure access, multi-step forms, auto-save, and ChatGPT export.
- Multiple YouTube video support and dual-device cover images.
- Special Themed Galleries with PIN-based access.
- Professional photography booking platform with product catalog, Google Calendar integration, client portal, and order/photo selection management.
- Homepage Campaign Showcase with automatic banner/slider for active booking campaigns.

**Vision:** To be a leading platform for digital wedding memory preservation, offering a seamless and engaging experience for all users.

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