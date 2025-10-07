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
- **Data Management:** Dual collection support for photos, comments, and voice memos (legacy `galleries/{id}/photos` and new global `photos` collections) ensures backward compatibility.
- **Image Handling:** Automatic image compression on upload. Watermarking system integrated for Pro/Premium plans. Duplicate photo detection and automatic skipping. **Dual-device cover system:** galleries support separate mobile (9:16) and desktop (16:9) cover images with advanced crop tool (ImageCropper component) that calculates optimal crop areas based on source image dimensions, applies zoom/rotation transforms, and provides real-time preview for both formats. Automatic device detection via window.matchMedia displays the appropriate cover. Full backward compatibility with legacy single coverImageUrl.
- **Social Features:** Interactive social panel with likes, comments, and voice memos. Real-time updates for social activities.
- **User Interface:** Clean, responsive layout optimized for desktop and mobile. Consistent UI elements, centralized authentication dialogs, and improved navigation. User profile image uploads with automatic compression.
- **Subscription System:** Integrated with Stripe Checkout and Customer Portal, supporting Free, Starter, Pro, and Premium plans. Access controls based on subscription tier for features like watermarking, ZIP downloads, and CSV exports.
- **Email System:** Centralized email notifications via Brevo (Sendinblue) using Firebase Functions for new photo notifications and welcome emails. Robust fallback to Firestore queue.
- **Deployment:** Designed for deployment in a subfolder (e.g., `/memoriesospese/`) with dynamic base path detection (`VITE_BASE_PATH`). Production server uses Express.js to serve static files and handle API routes, with a strong emphasis on Firebase-only architecture for core functionalities. Uses single `.env` file for all environments to avoid configuration confusion.
- **Error Handling & Logging:** Centralized error boundaries, structured logging with appropriate levels, and robust `try-catch` blocks for Firebase services.
- **Code Quality:** Strict TypeScript typing enforced throughout the codebase, leading to zero compilation errors. Modular components and unified interfaces.
- **Security:** Granular Firebase Security Rules for Firestore and Storage, Firebase Functions protected with token verification, and user isolation preventing access to other users' galleries. Rate limiting (50 requests/5 minutes) on sensitive operations.
- **Questionario System:** Enterprise-grade questionnaire management for wedding couples with secure 32-byte crypto tokens, SHA-256 hashing, and role-based access (bride/groom). Features multi-step forms (1 question per step), auto-save with 7-second debounce, localStorage backup for offline resilience, progress tracking, privacy consent controls, and ChatGPT export templates for personalized wedding album content generation. Token validation includes temporary sessions (15 min), rate limiting (50 attempts/5 min), automatic cleanup, and masked error messages for security.

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