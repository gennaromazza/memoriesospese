// Centralized email wrappers using mailer.ts
import {
  sendWelcomeEmail as mailerSendWelcome,
  sendGalleryUpdateEmail as mailerSendGalleryUpdate,
} from "./mailer";

// Deprecated generic interface
interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
  fromName?: string;
}

/**
 * @deprecated Use specific functions from mailer.ts directly
 */
export async function sendEmail(options: EmailOptions): Promise<boolean> {
  console.warn(
    "⚠️ sendEmail è deprecata, usa funzioni specifiche da mailer.ts",
  );
  return false;
}

/**
 * Invia email di benvenuto utilizzando il servizio centralizzato
 */
export async function sendWelcomeEmail(
  email: string,
  galleryName: string,
): Promise<boolean> {
  return await mailerSendWelcome(email, galleryName);
}

/**
 * Invia notifica di nuove foto utilizzando il servizio centralizzato
 */
export async function sendNewPhotosNotification(
  email: string,
  galleryName: string,
  photoCount: number,
): Promise<boolean> {
  return await mailerSendGalleryUpdate(email, galleryName, photoCount);
}
