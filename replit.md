# Wedding Gallery App - Documentazione Progetto

## Overview
A platform for preserving wedding memories, revolutionizing the digital capture and sharing of multimedia memories for couples and guests. The application provides an innovative and interactive solution to preserve and explore wedding moments.

**Key Capabilities:**
- Secure password-protected galleries with optional security questions.
- Like/comment system with user authentication.
- Voice memos with timed unlocking.
- Photo upload with automatic compression and watermarking for paid plans.
- Email notification system for new photos.
- Admin panel for gallery management, user management, and subscription control.
- Integration with Stripe for subscription management (Free, Starter, Pro, Premium plans).
- **Questionario system for wedding couples with secure token-based access, multi-step forms, auto-save functionality, and ChatGPT export for personalized album content generation.**
- **Multiple YouTube video support with interactive carousel slider** - galleries can now display multiple wedding videos with smooth navigation.
- **Dual-device cover images** - separate optimized cover images for mobile (9:16 portrait) and desktop (16:9 landscape) with advanced crop tool featuring zoom, rotation, and real-time preview.
- **Special Theme System (Seasonal Galleries)** - modular themed gallery system with hardcoded Tailwind styles (Natale, Carnevale, San Valentino, Pasqua, Halloween). Galleries can be assigned seasonal themes with PIN-based access, displayed in dedicated homepage section.

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
- **Authentication:** Migrating towards a unified Firebase Auth system (`useAuth` hook, `FirebaseAuthContext`). Backend middleware for credential validation is used where Express.js is present. Admin authentication uses a hardcoded list validated centrally.
- **Gallery Routing & Identifiers:** Dual-lookup system supports both modern `code` field (e.g., `XQhyDzLp`) and legacy Firestore document IDs for complete backward compatibility. All gallery queries (GalleryAccess, use-gallery-access, use-gallery-data) first search by `code`, then fallback to document ID lookup. This ensures all previously shared gallery links continue to work regardless of when they were created.
- **Data Management:** Dual collection support for photos, comments, and voice memos (legacy `galleries/{id}/photos` and new global `photos` collections) ensures backward compatibility.
- **Image Handling:** Automatic image compression on upload. Watermarking system integrated for Pro/Premium plans. Duplicate photo detection and automatic skipping. **Dual-device cover system:** galleries support separate mobile (9:16) and desktop (16:9) cover images with advanced crop tool (ImageCropper component) that calculates optimal crop areas based on source image dimensions, applies zoom/rotation transforms, and provides real-time preview for both formats. Automatic device detection via window.matchMedia displays the appropriate cover. Full backward compatibility with legacy single coverImageUrl.
- **Social Features:** Interactive social panel with likes, comments, and voice memos. Real-time updates for social activities.
- **User Interface:** Clean, responsive layout optimized for desktop and mobile. Consistent UI elements, centralized authentication dialogs, and improved navigation. User profile image uploads with automatic compression.
- **Subscription System:** Integrated with Stripe Checkout and Customer Portal, supporting Free, Starter, Pro, and Premium plans. Access controls based on subscription tier for features like watermarking, ZIP downloads, and CSV exports.
- **Email System:** **ALL email operations moved to Express.js server** (October 28-29, 2025) due to Firebase Cloud Functions network restrictions preventing access to Replit Connectors API. Gmail API integration via Replit OAuth2 connector with **Firebase Admin SDK for secure Firestore access**:
  - **New Photo Notifications** (`/api/email/notify-new-photos`): Server-side authentication (Firebase ID token), authorization (gallery ownership/admin), **secure subscriber retrieval via Firebase Admin SDK bypassing security rules**. Fully authenticated and authorized. Subscribers fetched server-side from `subscriptions` collection, email addresses NEVER exposed to client. Requires `FIREBASE_ADMIN_CREDENTIALS` secret (service account JSON base64-encoded). Returns 503 if Admin SDK not configured.
  - **Gallery Password Requests** (`/api/email/send-gallery-password`): Public endpoint, **server-side password retrieval via Firebase Admin SDK**, server-side security question validation (case-insensitive), email delivery via Gmail API. Client NEVER receives passwords. Requires `FIREBASE_ADMIN_CREDENTIALS`.
  - **Firebase Admin SDK**: Guarded initialization pattern - server starts even without credentials but returns 503 for email features. Non-blocking initialization prevents server crashes. Detailed logging for troubleshooting. Service account JSON must be base64-encoded in `FIREBASE_ADMIN_CREDENTIALS` Replit Secret.
  - **UI Components**: `PhotoUploadSuccessModal` displays upload confirmation with photo count and notified subscribers. `SubscriptionPrompt` appears in gallery view (every 20 photos) to encourage subscriptions with inline email input.
  - **Token Management**: OAuth access token caching with automatic expiration handling to minimize Replit Connectors API calls.
  - **Security**: CORS restricted to authorized domains, comprehensive input validation, structured error handling without sensitive data leakage. Admin-level Firestore access server-side only, zero client exposure of sensitive data.
- **Security - Password Protection System:** Enterprise-grade server-side password security implemented via Firebase Cloud Functions (deployed October 18, 2025). **Client NEVER has access to gallery passwords or security answers** - all sensitive data is handled exclusively server-side. Two secure Cloud Functions power this system:
  - `getGalleryMetadata`: Returns ONLY non-sensitive metadata (gallery name, ID, security question text). Password and securityAnswer fields are filtered server-side and never exposed to client.
  - `sendGalleryPassword`: Validates security questions server-side (case-insensitive comparison), retrieves password from Firestore server-side, sends via Gmail API. Client receives NO password data.
  - **Zero client-side Firestore access** to galleries collection for password requests - eliminates Network tab exposure vulnerability. Frontend uses `getFunctions(app, 'us-central1')` to invoke Cloud Functions. All 8 Cloud Functions deployed as Gen 1 (Node 20) with TypeScript 5.3.3 and firebase-functions 4.9.0. Security audit completed and verified: no fallback mechanisms, no password exposure, comprehensive server-side validation.
- **Deployment:** Designed for deployment in a subfolder (e.g., `/memoriesospese/`) with dynamic base path detection (`VITE_BASE_PATH`). Production server uses Express.js to serve static files and handle API routes, with a strong emphasis on Firebase-only architecture for core functionalities. Uses single `.env` file for all environments to avoid configuration confusion.
- **Error Handling & Logging:** Centralized error boundaries, structured logging with appropriate levels, and robust `try-catch` blocks for Firebase services.
- **Code Quality:** Strict TypeScript typing enforced throughout the codebase, leading to zero compilation errors. Modular components and unified interfaces.
- **Security:** Granular Firebase Security Rules for Firestore and Storage, Firebase Functions protected with token verification, and user isolation preventing access to other users' galleries. Rate limiting (50 requests/5 minutes) on sensitive operations.
- **Questionario System:** Enterprise-grade questionnaire management for wedding couples with secure 32-byte crypto tokens, SHA-256 hashing, and role-based access (bride/groom). Features multi-step forms (1 question per step), auto-save with 7-second debounce, localStorage backup for offline resilience, progress tracking, privacy consent controls, and ChatGPT export templates for personalized wedding album content generation. Token validation includes temporary sessions (15 min), rate limiting (50 attempts/5 min), automatic cleanup, and masked error messages for security.
- **Special Theme System:** Modular seasonal gallery system with predefined themes (Natale, Carnevale, San Valentino, Pasqua, Halloween) using dedicated CSS files with custom animations, gradients, and decorative elements. Each theme has its own stylesheet (`client/src/styles/themes/*.css`) featuring:
  - **Natale**: Magical Christmas theme with elegant light background, animated snowflakes with rotation, twinkling Christmas lights, golden sparkling stars, dancing aurora borealis effects, animated tree/star emojis with glow effects, refined sage buttons with golden shimmer on hover, proper spacing between UI elements
  - **Carnevale**: Multicolor animated gradient with falling confetti, festive masks, rainbow effects
  - **San Valentino**: Pink/rose romantic theme with floating hearts, love-themed styling, elegant fonts
  - **Pasqua**: Pastel spring colors with Easter eggs, bunny decorations, floral elements
  - **Halloween**: Dark purple/orange spooky theme with ghosts, pumpkins, fog effects, custom cursors
  
  Galleries can be assigned a theme during creation/editing via dropdown in NewGalleryModal/EditGalleryModal with mandatory PIN-based access (stored in `specialTheme` and `specialPin` Firestore fields). Gallery.tsx dynamically applies theme class `theme-${specialTheme}` to enable scoped CSS. Homepage features dedicated "Gallerie Speciali" section with elegant wedding-themed design (sage/cream colors, floral decorations, full dark mode support), accessible via `/special-gallery` route where users enter PIN for themed gallery access. Admin dashboard includes "Temi Stagionali" tab showing theme overview, associated galleries, and PIN management. Session-based PIN verification using sessionStorage for seamless gallery access. Hybrid approach: hardcoded theme definitions in `shared/special-themes.ts` with CSS-based visual styling for performance and maintainability. **UI Consistency:** Both Home.tsx "Gallerie Speciali" section and SpecialGalleryAccess.tsx page use wedding aesthetic with sage/dark-sage gradients, FloralCorner decorations, WeddingImage components, and comprehensive dark mode support.

## External Dependencies
- **Firebase:** Firestore (NoSQL database), Storage (file storage), Authentication (user management), Functions (serverless logic), Hosting (static site hosting).
- **Stripe:** Payment processing for subscriptions (Stripe Checkout, Customer Portal, Webhooks).
- **Brevo (Sendinblue):** Email service for notifications and welcome emails.
- **Express.js:** Web application framework for Node.js (primarily for backend API routes and serving static files in production, with a push towards Firebase Functions for serverless logic).
- **React:** Frontend library for building user interfaces.
- **TypeScript:** Superset of JavaScript for type safety.
- **Tailwind CSS:** Utility-first CSS framework for styling.
- **wouter:** React hook-based router for client-side routing.
- **browser-image-compression:** Client-side image compression library.