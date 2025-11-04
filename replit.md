# Wedding Gallery App - Progetto

## Overview
A platform for preserving wedding memories, revolutionizing the digital capture and sharing of multimedia memories for couples and guests. The application provides an innovative and interactive solution to preserve and explore wedding moments.

**Key Capabilities:**
- Secure password-protected galleries with optional security questions.
- Like/comment system with user authentication and voice memos.
- Photo upload with automatic compression and watermarking for paid plans.
- Email notification system for new photos.
- Admin panel for gallery, user, and subscription management.
- Integration with Stripe for subscription management (Free, Starter, Pro, Premium plans).
- Questionnaire system for wedding couples with secure token-based access, multi-step forms, auto-save, and ChatGPT export for personalized album content.
- Multiple YouTube video support with interactive carousel slider.
- Dual-device cover images with advanced crop tool.
- Special Themed Galleries (Seasonal Galleries) with PIN-based access.
- Professional photography booking platform with product catalog, seasonal campaigns, Google Calendar integration for slot management, client booking portal, admin dashboard, order management, and photo selection system.
- **Homepage Campaign Showcase**: Automatic full-width banner/slider displaying active booking campaigns with auto-rotation, emoji accents, countdown badges, and prominent CTA buttons.

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
- **Authentication:** Unified Firebase Auth system with backend middleware for validation. Admin authentication uses a hardcoded list. Anonymous authentication for guests.
- **Gallery Routing & Identifiers:** Dual-lookup system for `code` field and legacy Firestore document IDs for backward compatibility.
- **Data Management:** Dual collection support for photos, comments, and voice memos ensures backward compatibility.
- **Image Handling:** Automatic compression and watermarking. Duplicate detection. Dual-device cover images with advanced cropping (mobile 9:16, desktop 16:9).
- **Social Features:** Interactive social panel with real-time updates for likes, comments, and voice memos.
- **User Interface:** Responsive design, consistent UI elements, centralized authentication dialogs, and improved navigation.
- **Subscription System:** Stripe integration for Free, Starter, Pro, and Premium plans with access controls based on subscription tier.
- **Email System:** All email operations handled by an Express.js server via Gmail API integration (Replit OAuth2 connector). Uses direct function imports for reliability. Email templates dynamically fetch studio contact info from Firestore.
- **Booking System:** Campaign-based photography booking with Google Calendar integration for slot management. Atomic booking flow prevents double-booking using Firestore transactions. Two-stage email notification (received and confirmed). Booking duration automatically calculated.
- **Security - Password Protection System:** CRITICAL SECURITY: Gallery passwords and special PINs stored in separate `gallerySecrets` Firestore collection with admin-only access. Main `galleries` collection uses only `hasPassword` boolean flag for UI logic. Server-side password verification via `/api/email/verify-gallery-password` endpoint reads from protected collection. Both NewGalleryModal and EditGalleryModal save secrets exclusively to `gallerySecrets` using setDoc with merge. Client never accesses plaintext passwords/PINs. **Mutual Exclusivity:** Password and special PIN modes are mutually exclusive in both modals - setting one clears the other with informative toast notifications. Conditional UI rendering hides password field when special theme selected, and hides special theme section when password set. Migration script available at `scripts/migrate-gallery-passwords.ts` for existing galleries.
- **Deployment:** Designed for subfolder deployment with dynamic base path detection. Emphasis on Firebase-only architecture.
- **Error Handling & Logging:** Centralized error boundaries, structured logging, and robust `try-catch` blocks.
- **Code Quality:** Strict TypeScript typing, modular components, and unified interfaces.
- **Security:** Granular Firebase Security Rules, token verification for Firebase Functions, user isolation, and rate limiting on sensitive operations.
- **Questionnaire System:** Enterprise-grade questionnaire management using secure crypto tokens, SHA-256 hashing, role-based access, multi-step forms with auto-save, localStorage backup, progress tracking, and ChatGPT export templates.
- **Special Theme System:** Modular seasonal gallery system with predefined themes (Natale, Carnevale, San Valentino, Pasqua, Halloween) using dedicated CSS files with custom animations and elements. Galleries can be assigned a theme with mandatory PIN-based access. **PIN Uniqueness System:** Server-side validation via `/api/email/check-pin-unique` endpoint prevents duplicate PINs across special galleries using Firebase Admin SDK. Client-side validation displays toast error before save. **Automatic PIN Notification:** When PIN is created or modified, automatic email sent to client via `/api/email/special-gallery-pin-notification` endpoint with themed HTML template, PIN code, access link, and instructions. Client email/name fields persisted in gallery document for automatic notifications.
- **Order & Gallery Management Integration:** Integrated order and gallery creation within BookingsManager admin panel. Supports multi-product orders, auto-calculation, and dynamic badging for created orders. Auto-generates gallery codes and pre-populates fields based on booking data. **Custom Products:** Admins can add custom products directly during order creation/modification with optional catalog persistence via toggle. Products marked "one-time" have empty prodottoId and display "Custom" badge. **Order Modification:** Complete EditOrderModal allows updating products, prices, status, notes with automatic total recalculation. Email notification automatically sent to client upon save via `/api/orders/:id` PATCH endpoint with responsive HTML template showing updated order details.
- **Photo Selection Workflow:** Enterprise-grade photo selection system for wedding albums. Features include selection mode with heart toggles, progress display, validation for required photo counts, deadline enforcement, automated email notifications (gallery ready, selection completed, deadline reminder), and an admin review interface.
- **Transaction & Payment Tracking System:** Advanced payment tracking with transactions array storing all payment history. Each transaction tracks tipo (acconto/saldo), importo, metodo, data, note, and emailInviata flag for notification status. System supports multiple acconto payments before final saldo. Email notifications sent automatically for acconto-received, saldo-received, order-created events. Transaction email tracking prevents duplicate notifications using markTransactionEmailSent function. Cache invalidation deferred until after email send to prevent stale data in notifications. Guards prevent email attempts to empty/whitespace recipient addresses. **CRITICAL PAYMENT MANAGEMENT:** EditOrderModal displays acconto as READ-ONLY field calculated from transactions array (single source of truth). All payment registration MUST use dedicated buttons "Aggiungi Acconto" and "Registra Saldo" from OrdersManager to ensure proper transaction tracking and email notifications. CreateOrder automatically creates initial transaction when acconto > 0 is specified. Legacy order migration in ensureProdottiArray() automatically converts old acconto/saldo fields to transactions array for backward compatibility. Dashboard finanziaria reads exclusively from transactions array for accurate financial reporting.

## External Dependencies
- **Firebase:** Firestore, Storage, Authentication, Functions, Hosting
- **Stripe:** Payment processing for subscriptions
- **Google Calendar API:** Booking slot management (Replit OAuth2)
- **Gmail API:** Email delivery (Replit OAuth2)
- **Express.js:** Web application framework
- **React:** Frontend library
- **TypeScript:** Type-safe JavaScript
- **Tailwind CSS:** Utility-first CSS framework
- **wouter:** React hook-based router
- **browser-image-compression:** Client-side image compression library