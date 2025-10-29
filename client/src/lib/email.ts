/**
 * Email Service usando Firebase Cloud Functions
 * Sostituisce completamente il backend Express per l'invio email
 */

import { getFunctions, httpsCallable } from "firebase/functions";
import { db } from "./firebase";
import { collection, getDocs, query, where, addDoc } from "firebase/firestore";
import { createAbsoluteUrl } from "./basePath";

const functions = getFunctions();


export interface GalleryPasswordData {
  recipientEmail: string;
  galleryName: string;
  galleryCode: string;
  galleryPassword?: string;
}

// Cloud Functions per email
export const testEmailConfiguration = httpsCallable(
  functions,
  "testEmailConfiguration",
);
export const sendGalleryPassword = httpsCallable(
  functions,
  "sendGalleryPassword",
);
export const sendWelcomeEmail = httpsCallable(functions, "sendWelcomeEmail");

/**
 * Notifica nuove foto caricate
 * Chiamata al server Express.js che gestisce invio email
 * NO autenticazione (chiamato da pannello admin già autenticato)
 */
export async function notifyNewPhotos(
  galleryId: string,
  galleryName: string,
  uploaderName: string,
  newPhotosCount: number
): Promise<{
  success: boolean;
  notified?: number;
  error?: string;
}> {
  try {
    // Costruisce URL galleria
    const galleryUrl = createAbsoluteUrl(`/gallery/${galleryId}`);
    
    // Chiamata API locale Express.js
    const baseUrl = window.location.origin;
    const apiUrl = `${baseUrl}/api/email/notify-new-photos`;
    
    console.log(`📧 Invio notifiche nuove foto per galleria ${galleryName}...`);
    
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        galleryId,
        galleryName,
        newPhotosCount,
        uploaderName,
        galleryUrl,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("❌ Errore invio notifiche:", errorData);
      
      // Gestione errori specifici
      if (response.status === 401) {
        return { success: false, error: "Autenticazione fallita" };
      }
      if (response.status === 403) {
        return { success: false, error: "Non autorizzato" };
      }
      
      return { success: false, error: errorData.error?.message || "Errore sconosciuto" };
    }

    const result = await response.json();
    
    console.log(`✅ Notifiche inviate: ${result.notified} destinatari`);
    
    return {
      success: true,
      notified: result.notified || 0,
    };
  } catch (error: any) {
    console.error("❌ Errore notifyNewPhotos:", error);
    return {
      success: false,
      error: error?.message || "Errore sconosciuto",
    };
  }
}

/**
 * Iscrivi utente alle notifiche di una galleria
 */
export async function subscribeToGallery(
  galleryId: string,
  galleryName: string,
  email: string,
): Promise<{ success: boolean; alreadySubscribed?: boolean; error?: string }> {
  try {
    const normalizedEmail = email.toLowerCase();
    const subscriptionsRef = collection(db, "subscriptions");

    // ✅ Controllo duplicati lato client
    const existingQuery = query(
      subscriptionsRef,
      where("galleryId", "==", galleryId),
      where("email", "==", normalizedEmail)
    );
    const existingSnapshot = await getDocs(existingQuery);

    if (!existingSnapshot.empty) {
      console.log(`ℹ️ ${normalizedEmail} già iscritto alla galleria "${galleryName}"`);
      return { success: true, alreadySubscribed: true };
    }

    // Salva iscrizione in Firestore
    await addDoc(subscriptionsRef, {
      galleryId,
      galleryName,
      email: normalizedEmail,
      active: true,
      subscribedAt: new Date(),
      lastNotified: null,
    });

    // Invia email di benvenuto (con gestione errori robusta)
    if (process.env.NODE_ENV === "production") {
      Promise.resolve()
        .then(async () => {
          try {
            await sendWelcomeEmail({ recipientEmail: email, galleryName });
            console.log(`✅ Email di benvenuto inviata a ${email}`);
          } catch (emailError) {
            console.warn(
              "⚠️ Email di benvenuto non inviata (Firebase Functions non disponibili)",
            );
          }
        })
        .catch(() => {
          // Gestione silent per evitare unhandledrejection
        });
    } else {
      console.log(`ℹ️ Email di benvenuto saltata in ambiente di sviluppo`);
    }

    console.log(`✅ ${email} iscritto alle notifiche di "${galleryName}"`);
    return { success: true, alreadySubscribed: false };
  } catch (error) {
    console.error("❌ Errore iscrizione:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Errore sconosciuto",
    };
  }
}

/**
 * Test sistema email
 */
export async function testEmailSystem(): Promise<any> {
  try {
    const result = await testEmailConfiguration({
      testRecipient: "gennaro.mazzacane@gmail.com",
    });

    console.log("✅ Test email inviato:", result.data);
    return result.data;
  } catch (error) {
    console.error("❌ Errore test email:", error);

    // In sviluppo, Firebase Functions non sono disponibili
    if (
      error instanceof Error &&
      "code" in error &&
      (error as any).code === "functions/internal"
    ) {
      console.log(
        "ℹ️ Firebase Functions non disponibili in sviluppo - test simulato",
      );
      return {
        success: false,
        message: "Firebase Functions non disponibili in ambiente di sviluppo",
        developmentMode: true,
      };
    }

    throw error;
  }
}

export class EmailService {
  /**
   * Invia password/codice di accesso galleria
   */
  static async sendGalleryPassword(
    data: GalleryPasswordData,
  ): Promise<boolean> {
    try {
      const sendPassword = httpsCallable(functions, "sendGalleryPassword");
      const result = await sendPassword(data);
      return (result.data as any)?.success || false;
    } catch (error) {
      console.error("Errore invio password galleria:", error);
      return false;
    }
  }

  /**
   * Test configurazione email
   */
  static async testEmailConfiguration(): Promise<boolean> {
    try {
      const testEmail = httpsCallable(functions, "testEmailConfiguration");
      const result = await testEmail({
        testRecipient: "gennaro.mazzacane@gmail.com",
      });
      return (result.data as any)?.success || false;
    } catch (error) {
      console.error("Errore test configurazione email:", error);
      return false;
    }
  }

  /**
   * Invia email di benvenuto per nuova iscrizione
   */
  static async sendWelcomeEmail(
    email: string,
    galleryName: string,
  ): Promise<boolean> {
    try {
      const sendWelcome = httpsCallable(functions, "sendWelcomeEmail");
      const result = await sendWelcome({ recipientEmail: email, galleryName });
      return (result.data as any)?.success || false;
    } catch (error) {
      console.error("Errore invio email benvenuto:", error);
      return false;
    }
  }
}