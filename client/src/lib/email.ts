/**
 * Email Service usando Firebase Cloud Functions
 * Sostituisce completamente il backend Express per l'invio email
 */

import { getFunctions, httpsCallable } from "firebase/functions";
import { db } from "./firebase";
import { collection, getDocs, query, where, addDoc } from "firebase/firestore";
import { createAbsoluteUrl } from "./basePath";

const functions = getFunctions();

export interface EmailNotificationData {
  galleryName: string;
  newPhotosCount: number;
  uploaderName: string;
  galleryUrl: string;
  recipients: string[];
}

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
export const sendNewPhotosNotification = httpsCallable(
  functions,
  "sendNewPhotosNotificationCall",
);
export const sendGalleryPassword = httpsCallable(
  functions,
  "sendGalleryPassword",
);
export const sendWelcomeEmail = httpsCallable(functions, "sendWelcomeEmail");

/**
 * Funzione HTTP per invio notifiche nuove foto (supporta CORS)
 */
export async function sendNewPhotosNotificationHTTP(
  data: EmailNotificationData,
) {
  // Import Firebase auth per ottenere ID token
  const { auth } = await import('./firebase');
  
  // Ottiene current user e ID token
  const currentUser = auth.currentUser;
  let idToken = '';
  
  if (currentUser) {
    try {
      idToken = await currentUser.getIdToken();
    } catch (error) {
      console.warn('⚠️ Unable to get Firebase ID token:', error);
    }
  }

  // Costruisce URL dinamicamente basato sulla configurazione Firebase
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || "wedding-gallery-397b6";
  const region = import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || "us-central1";
  const functionUrl = `https://${region}-${projectId}.cloudfunctions.net/sendNewPhotosNotification`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  
  // Aggiunge Authorization header se disponibile ID token
  if (idToken) {
    headers["Authorization"] = `Bearer ${idToken}`;
  }

  const response = await fetch(functionUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return await response.json();
}

/**
 * Notifica automatica quando vengono caricate nuove foto
 */
export async function notifyNewPhotos(
  galleryId: string,
  galleryName: string,
  uploaderName: string,
  newPhotosCount: number,
): Promise<{
  success: boolean;
  notified?: number;
  method?: string;
  details?: any;
  error?: string;
}> {
  try {
    console.log(
      `🔔 Iniziando notifica per ${newPhotosCount} nuove foto in "${galleryName}"`,
    );

    // 1. Recupera tutti i subscribers della galleria
    const subscriptionsRef = collection(db, "subscriptions");
    const q = query(
      subscriptionsRef,
      where("galleryId", "==", galleryId),
      where("active", "==", true),
    );

    const snapshot = await getDocs(q);
    const subscribers = snapshot.docs.map((doc) => doc.data().email as string);

    if (subscribers.length === 0) {
      console.log("📭 Nessun subscriber trovato per questa galleria");
      return { success: true, notified: 0 };
    }

    // 2. Crea URL galleria (usando basepath dinamico)  
    const galleryUrl = createAbsoluteUrl(`/gallery/${galleryId}`);

    // 3. Invia notifiche tramite Firebase Functions (Brevo già configurato)
    try {
      // Prova prima con HTTP function (supporta CORS)
      try {
        const httpResult = await sendNewPhotosNotificationHTTP({
          galleryName,
          newPhotosCount,
          uploaderName,
          galleryUrl,
          recipients: subscribers,
        });

        console.log(
          `✅ Notifiche inviate tramite Firebase Functions HTTP a ${subscribers.length} subscribers`,
        );
        return {
          success: true,
          notified: subscribers.length,
          method: "firebase_functions_http",
          details: httpResult,
        };
      } catch (httpError) {
        console.warn("⚠️ HTTP function fallita, provo con callable:", httpError);

        try {
          // Fallback con callable function
          const result = await sendNewPhotosNotification({
            galleryName,
            newPhotosCount,
            uploaderName,
            galleryUrl,
            recipients: subscribers,
          });

          console.log(
            `✅ Notifiche inviate tramite Firebase Functions callable a ${subscribers.length} subscribers`,
          );
          return {
            success: true,
            notified: subscribers.length,
            method: "firebase_functions_callable",
            details: result.data,
          };
        } catch (error) {
          console.warn(
            "⚠️ Firebase Functions non disponibili in ambiente di sviluppo:",
            error instanceof Error ? error.message : "Errore sconosciuto",
          );

          // Fallback: salva in Firestore solo se in produzione
          if (process.env.NODE_ENV === "production") {
            try {
              const notificationQueue = collection(db, "emailQueue");
              const queueData = {
                type: "new_photos_notification",
                galleryId,
                galleryName,
                newPhotosCount,
                uploaderName,
                galleryUrl,
                recipients: subscribers,
                status: "pending",
                createdAt: new Date(),
                error:
                  error instanceof Error ? error.message : "Errore sconosciuto",
              };
              await addDoc(notificationQueue, queueData);
            } catch (queueError) {
              console.error("Errore salvataggio in coda:", queueError);
            }
          }

          return {
            success: true,
            notified: 0,
            method: "development_skip",
          };
        }
      }
    } catch (outerError) {
      console.error("❌ Errore generale durante l'invio notifiche:", outerError);
      return {
        success: true,
        notified: 0,
        method: "development_skip",
      };
    }
  } catch (error) {
    console.error("❌ Errore invio notifiche:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Errore sconosciuto",
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

    // 1. Controlla se l'utente è già iscritto
    const subscriptionsRef = collection(db, "subscriptions");
    const existingSubscription = await getDocs(
      query(
        subscriptionsRef,
        where("galleryId", "==", galleryId),
        where("email", "==", normalizedEmail),
      ),
    );

    if (!existingSubscription.empty) {
      console.log(
        `ℹ️ ${email} è già iscritto alle notifiche di "${galleryName}"`,
      );
      return { success: true, alreadySubscribed: true };
    }

    // 2. Salva nuova iscrizione in Firestore
    await addDoc(subscriptionsRef, {
      galleryId,
      galleryName,
      email: normalizedEmail,
      active: true,
      subscribedAt: new Date(),
      lastNotified: null,
    });

    // 3. Invia email di benvenuto (con gestione errori robusta)
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
   * Invia notifica di nuove foto caricate
   */
  static async sendNewPhotosNotification(
    data: EmailNotificationData,
  ): Promise<boolean> {
    try {
      const sendNotification = httpsCallable(
        functions,
        "sendNewPhotosNotification",
      );
      const result = await sendNotification(data);
      return (result.data as any)?.success || false;
    } catch (error) {
      console.error("Errore invio notifica nuove foto:", error);
      return false;
    }
  }

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
