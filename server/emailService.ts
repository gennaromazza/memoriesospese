// Centralized email service using Netsons SMTP via mailer.ts
import { sendWelcomeEmail as mailerSendWelcome, sendNewPhotosNotification as mailerSendNotification } from './mailer';

// Backward compatibility interface (deprecated)
interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
  fromName?: string;
}

// Deprecated: use mailer.ts functions directly
export async function sendEmail(options: EmailOptions): Promise<boolean> {
  console.warn('⚠️ sendEmail è deprecata, usa funzioni specifiche da mailer.ts');
  // Fallback generico non disponibile - richiede parametri specifici
  return false;
}

// Redirect to centralized mailer.ts
export async function sendWelcomeEmail(
  email: string, 
  galleryName: string, 
  fromName?: string
): Promise<boolean> {
  return await mailerSendWelcome(email, galleryName, fromName);
}

// Redirect to centralized mailer.ts
export async function sendNewPhotosNotification(
  email: string,
  galleryName: string,
  newPhotosCount: number,
  uploaderName: string,
  galleryUrl: string,
  fromName?: string
): Promise<boolean> {
  return await mailerSendNotification(email, galleryName, newPhotosCount, uploaderName, galleryUrl);
}