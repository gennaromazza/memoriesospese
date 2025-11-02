# Wedding Gallery App - Documentazione Progetto

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
- **Email System:** All email operations handled by an Express.js server (`server/email-routes.ts`) via Gmail API integration (Replit OAuth2 connector). Uses direct function imports instead of HTTP calls for reliability. Email templates dynamically fetch studio contact info from Firestore `settings/studio` collection. Includes: new photo notifications (with anonymous auth support), secure gallery password requests, and booking confirmation emails. No emojis in subject lines for professional appearance. OAuth access token caching implemented.
- **Booking System:** Campaign-based photography booking with Google Calendar integration for slot management. Atomic booking flow prevents double-booking using Firestore transactions. Two-stage email notification: "Prenotazione Ricevuta" on creation (stato: in_attesa) and "Prenotazione Confermata" on admin approval (stato: confermata). Booking duration automatically calculated from slot timestamps. Email tracking via `emailRicevutaInviata` and `emailConfermataInviata` flags in Firestore.
- **Security - Password Protection System:** Server-side password security via Firebase Cloud Functions. Client never accesses gallery passwords or security answers directly. Security questions are validated server-side, and passwords are sent via email only after successful validation.
- **Deployment:** Designed for subfolder deployment with dynamic base path detection. Emphasis on Firebase-only architecture for core functionalities.
- **Error Handling & Logging:** Centralized error boundaries, structured logging, and robust `try-catch` blocks.
- **Code Quality:** Strict TypeScript typing, modular components, and unified interfaces.
- **Security:** Granular Firebase Security Rules, token verification for Firebase Functions, user isolation, and rate limiting on sensitive operations.
- **Questionnaire System:** Enterprise-grade questionnaire management using secure 32-byte crypto tokens, SHA-256 hashing, role-based access, multi-step forms with auto-save, localStorage backup, progress tracking, and ChatGPT export templates. Includes token validation, temporary sessions, rate limiting, and masked error messages.
- **Special Theme System:** Modular seasonal gallery system with predefined themes (Natale, Carnevale, San Valentino, Pasqua, Halloween) using dedicated CSS files with custom animations and elements. Galleries can be assigned a theme with mandatory PIN-based access. Homepage features a dedicated "Gallerie Speciali" section for themed gallery access.

## Booking System - Technical Details

**Architecture:**
- **Server Routes:** `server/booking-routes.ts` - RESTful API for booking CRUD operations
- **Email Templates:** `server/email-routes.ts` - Exported functions `createBookingReceivedEmailHTML`, `createBookingConfirmedEmailHTML`
- **Calendar Integration:** `server/google-calendar.ts` - Slot management via Google Calendar API (Replit OAuth2)
- **Client Components:** `client/src/pages/BookingPage.tsx` - Customer booking interface

**Data Flow:**
1. **Booking Creation (POST /api/booking/create):**
   - Validates slot availability via Firestore transaction
   - Creates Google Calendar event for slot reservation
   - Saves booking to Firestore with `stato: 'in_attesa'`
   - Sends "Prenotazione Ricevuta" email automatically
   - Email includes: campaign name, date/time, duration (calculated from timestamps), product, studio contact info

2. **Booking Approval (PATCH /api/booking/:id/approve):**
   - Admin updates booking status to `confermata`
   - Sends "Prenotazione Confermata" email automatically
   - Email includes same details plus any admin notes

**Email Workflow:**
- Templates fetch dynamic studio info from `settings/studio` Firestore document (name, email, phone, address)
- Duration calculated: `Math.round((slotEnd - slotStart) / (1000 * 60))` minutes
- Email functions imported directly in booking routes (no HTTP calls for reliability)
- Tracking flags prevent duplicate sends: `emailRicevutaInviata`, `emailConfermataInviata`
- Subject format: "Prenotazione Ricevuta/Confermata - {Campaign Name}" (no emojis)
- "Add to Calendar" (.ics) feature via secure HTTPS endpoint `/api/booking/calendar/:id`

**Homepage Campaign Display:**
- Full-width banner positioned immediately after hero section (before gallery access)
- Single campaign: Large gradient banner with campaign name (emoji ✨), date range, countdown, description, and prominent CTA
- Multiple campaigns: Auto-rotating carousel slider (5s interval) with embla-carousel-react and Autoplay plugin
- Campaigns auto-filtered by active date range (`dataInizio <= today <= dataFine`)
- Campaigns auto-hide when expired
- Design: Gradient sage/dark-sage background, white text with drop shadows, yellow countdown badges with pulse animation
- CTA: Large white button with emoji 📸 "Prenota Subito!" / "Prenota Ora!"

**Key Files:**
- `server/booking-routes.ts` - Booking API endpoints
- `server/email-routes.ts` - Email template generators and `getStudioContactInfo()`
- `server/google-calendar.ts` - Calendar slot management
- `shared/booking-types.ts` - TypeScript interfaces for bookings
- `client/src/lib/bookings.ts` - Frontend booking utilities

## Order & Gallery Management Integration

**Overview:** Integrated order and gallery creation directly within BookingsManager admin panel, enabling seamless workflow from booking confirmation to order management and gallery setup.

**Order System Enhancement:**
- **Multi-Product Support:** Order model extended with `prodotti: OrderItem[]` array for managing multiple products per order
- **Backward Compatibility:** Read-time conversion shim (`ensureProdottiArray`) handles legacy single-product orders without database migration
- **Auto-Calculation:** Totale and saldo automatically recalculated from product array on create/update operations
- **OrderItem Interface:** Each item includes `productId`, `nome`, `prezzo`, `quantita` for snapshot consistency

**BookingsManager Integration:**

### Badge System
- **"Ordine Creato" Badge:** Green badge displayed on booking cards when order exists for booking
- **Dynamic Visibility:** "+ Ordine" button hidden once order created (1-to-1 booking-order relationship)
- **Visual Feedback:** Immediate UI update after order creation via query cache invalidation

### CreateOrderDialog
**Trigger:** Click "+ Ordine" button on booking card (visible only if no order exists)

**Features:**
- Pre-population: Auto-selects product from booking (`booking.prodotto`)
- Multi-product selection: Checkboxes for all active products from `getActiveProducts()`
- Quantity management: Adjustable quantity per product (default: 1)
- Live totale calculation: Real-time update via `calculateTotale(selectedProducts)` helper
- Validation: Alert if no products selected (non-empty validation)
- Product snapshot: Creates OrderItem[] with frozen product names/prices for historical accuracy

**Data Flow:**
1. Admin opens dialog → Products fetched, booking product pre-selected
2. Admin selects products, adjusts quantities → Totale updates live
3. Submit → `createOrderMutation` → `createOrder(orderData)` → Firestore `orders` collection
4. Success → Invalidate `orders` and `bookings` queries → Badge appears, dialog closes

### CreateGalleryDialog
**Trigger:** Click "+ Galleria" button on booking card (always visible, multiple galleries allowed)

**Features:**
- **Auto-Generated Code:** 8-character alphanumeric uppercase code generated via `generateRandomCode()`
- **Code Regeneration:** "Rigenera" button for manual code refresh
- **Pre-Population:**
  - Nome: `${cliente.nome} ${cliente.cognome} - ${campaign?.nome || ''}`
  - Codice: Random 8-char (e.g., "ABC12XYZ")
  - Data: Formatted from `booking.dataShootingInizio` (YYYY-MM-DD)
- **Required Fields:** Nome, Codice (8 chars), Data, Luogo
- **Optional Fields:** Password, Descrizione
- **Validation:** Alert-based validation for required fields
- **Code Format:** Uppercase forced in input and submit

**Data Flow:**
1. Admin opens dialog → Form pre-populated with booking/campaign data
2. Admin fills location (required), optional password/description
3. Submit → `createGalleryMutation` → `GalleryService.createGallery(galleryData)` → Firestore `galleries` collection
4. Success → Invalidate `galleries` query → Toast success, dialog closes

**Technical Implementation:**

### Shared Queries
- `orders` query: Shared between BookingsManager and OrdersManager for cache efficiency
- Badge logic: `orders.find(o => o.bookingId === booking.id)` determines badge visibility
- Mutation invalidation: Both `orders` and `bookings` queries invalidated on order creation

### Helpers
- `calculateTotale(prodotti: OrderItem[]): number` - Sum of (prezzo * quantita) for all products
- `generateRandomCode(): string` - 8-char random alphanumeric uppercase (collision-resistant)
- `formatDateForInput(timestamp): string` - Firestore timestamp → YYYY-MM-DD for date input
- `ensureProdottiArray(order): Order` - Backward compatibility shim for legacy orders

### Key Files
- `client/src/components/BookingsManager.tsx` - Admin panel with order/gallery integration
- `client/src/lib/orders.ts` - Order CRUD operations with auto-totale calculation
- `client/src/lib/galleries.ts` - GalleryService class-based API for Firestore
- `shared/booking-types.ts` - Extended Order type with `prodotti: OrderItem[]`, `galleryId?: string`

**Future Enhancements:**
- Link `galleryId` back to booking for "Galleria Creata" badge (similar to order badge)
- Server-side code uniqueness validation for gallery codes
- Typed `NewGallery` payload for compile-time safety in dialog submit

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