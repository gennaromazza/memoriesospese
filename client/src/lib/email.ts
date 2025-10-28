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
      console.log('🔑 Firebase ID token ottenuto per:', currentUser.email);
    } catch (error) {
      console.error('❌ Errore ottenimento Firebase ID token:', error);
    }
  } else {
    console.warn('⚠️ Nessun utente Firebase autenticato per invio notifiche');
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

  console.log('📤 Chiamata HTTP function:', functionUrl);
  console.log('📋 Headers:', headers);
  console.log('📊 Recipients:', data.recipients.length);
  
  const response = await fetch(functionUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ Risposta HTTP function:', {
      status: response.status,
      statusText: response.statusText,
      body: errorText
    });
    throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
  }

  return await response.json();
}

/**
 * Notifica automatica quando vengono caricate nuove foto
 * USA HTTP Function con CORS manuale e autenticazione Firebase
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

    // 1. Verifica autenticazione PRIMA di procedere
    const { auth } = await import("./firebase");
    const currentUser = auth.currentUser;
    if (!currentUser) {
      console.error("❌ Nessun utente loggato: impossibile inviare notifiche");
      return {
        success: false,
        error: "Utente non autenticato",
      };
    }

    const idToken = await currentUser.getIdToken();
    console.log("🔑 Token Firebase ottenuto per utente:", currentUser.email);

    // 2. Recupera tutti i subscribers attivi
    const subscriptionsRef = collection(db, "subscriptions");
    const q = query(
      subscriptionsRef,
      where("galleryId", "==", galleryId),
      where("active", "==", true),
    );

    const snapshot = await getDocs(q);
    const subscribers = snapshot.docs.map((doc) => doc.data().email as string);

    console.log(
      `📊 Trovati ${subscribers.length} subscribers per "${galleryName}"`,
    );

    if (subscribers.length === 0) {
      console.log("📭 Nessun subscriber trovato per questa galleria");
      return { success: true, notified: 0 };
    }

    // 3. URL pubblico galleria
    const galleryUrl = createAbsoluteUrl(`/gallery/${galleryId}`);

    // 4. Chiama direttamente la Firebase Cloud Function
    const result = await sendNewPhotosNotification({
      galleryId,
      galleryName,
      newPhotosCount,
      uploaderName,
      galleryUrl,
      recipients: subscribers,
    });

    console.log("✅ Notifiche inviate tramite Firebase Cloud Function:", result);
    return {
      success: (result.data as any)?.success || false,
      notified: subscribers.length,
      method: "firebase_function",
      details: result.data,
    };
  } catch (error: any) {
    console.error("❌ Errore invio notifiche:", error);
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
