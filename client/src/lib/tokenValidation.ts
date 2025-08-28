/**
 * Token Validation & Session Management (Fase 6)
 * Sistema avanzato per validazione token con rate limiting e cleanup
 */

import {
  collection,
  doc,
  getDoc,
  updateDoc,
  setDoc,
  query,
  where,
  getDocs,
  deleteDoc,
  addDoc,
  serverTimestamp, // Import serverTimestamp
} from "firebase/firestore";
import { db } from "./firebase";
import { QuestionnaireToken, sha256Hash } from "@shared/schema";

// Rate limiting configuration
const RATE_LIMIT_WINDOW = 5 * 60 * 1000; // 5 minuti
const MAX_ATTEMPTS = 50; // 50 tentativi per finestra
const SESSION_DURATION = 15 * 60 * 1000; // 15 minuti

export interface ValidationSession {
  id: string;
  galleryId: string;
  questionnaireId: string;
  role: "bride" | "groom";
  tokenId: string;
  validatedAt: number;
  expiresAt: number;
  ipAddress?: string;
  userAgent?: string;
}

export interface RateLimitEntry {
  id: string;
  identifier: string; // IP address o user identifier
  attempts: number;
  windowStart: number;
  blocked: boolean;
  lastAttempt: number;
}

export class TokenValidationService {
  /**
   * Valida token e crea sessione temporanea (15 min)
   */
  static async validateTokenAndCreateSession(
    rawToken: string,
    galleryId: string,
    role: "bride" | "groom",
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{
    valid: boolean;
    sessionId?: string;
    questionnaireId?: string;
    error?: string;
  }> {
    try {
      // 1. Verifica rate limiting
      const rateLimitCheck = await this.checkRateLimit(ipAddress || "unknown");
      if (!rateLimitCheck.allowed) {
        return {
          valid: false,
          error: "Troppi tentativi. Riprova più tardi.",
        };
      }

      // 2. Hash del token
      const tokenHash = await sha256Hash(rawToken);

      // 3. Cerca token in collection separata
      const tokensQuery = query(
        collection(db, "questionnaireTokens"),
        where("tokenHash", "==", tokenHash),
        where("galleryId", "==", galleryId),
        where("role", "==", role),
      );

      const snapshot = await getDocs(tokensQuery);

      if (snapshot.empty) {
        await this.recordFailedAttempt(ipAddress || "unknown");
        return {
          valid: false,
          error: "Token non valido",
        };
      }

      const tokenDoc = snapshot.docs[0];
      const tokenData = tokenDoc.data() as QuestionnaireToken;

      // 4. Verifica scadenza e revoca
      const now = Date.now();
      if (tokenData.expiresAt < now || tokenData.revoked) {
        await this.recordFailedAttempt(ipAddress || "unknown");
        return {
          valid: false,
          error: "Token scaduto o revocato",
        };
      }

      // 5. Aggiorna usedAt se primo utilizzo (FIX)
      if (!tokenData.usedAt) {
        try {
          // Using serverTimestamp for consistency
          await updateDoc(tokenDoc.ref, {
            usedAt: serverTimestamp(),
          });
        } catch (error) {
          console.warn('⚠️ Impossibile aggiornare usedAt (permessi limitati):', error);
          // Continua anche se l'aggiornamento fallisce
        }
      }

      // 6. VERIFICA AGGIUNTIVA: Controlla se il questionario è ancora attivo
      const { QuestionnaireService } = await import("./questionnaire");
      const questionnaire =
        await QuestionnaireService.getGalleryQuestionnaire(galleryId);
      if (!questionnaire || !questionnaire.enabled) {
        await this.recordFailedAttempt(ipAddress || "unknown");
        return { valid: false, error: "Questionario non più attivo" };
      }

      // 7. Crea sessione temporanea (FIX userAgent)
      const safeUserAgent =
        userAgent ??
        (typeof navigator !== "undefined" ? navigator.userAgent : "unknown");

      const sessionId = await this.createValidationSession({
        galleryId,
        questionnaireId: tokenData.questionnaireId,
        role,
        tokenId: tokenData.id,
        ipAddress,
        userAgent: safeUserAgent,
      });

      return {
        valid: true,
        sessionId,
        questionnaireId: tokenData.questionnaireId,
      };
    } catch (error) {
      console.error("Errore validazione token:", error);
      return {
        valid: false,
        error: "Errore interno del server",
      };
    }
  }

  /**
   * Verifica sessione esistente
   */
  static async validateSession(sessionId: string): Promise<{
    valid: boolean;
    session?: ValidationSession;
  }> {
    try {
      const sessionRef = doc(db, "validationSessions", sessionId);
      const sessionDoc = await getDoc(sessionRef);

      if (!sessionDoc.exists()) {
        return { valid: false };
      }

      const session = {
        id: sessionDoc.id,
        ...sessionDoc.data(),
      } as ValidationSession;
      const now = Date.now();

      if (session.expiresAt < now) {
        // Sessione scaduta, rimuovila
        try {
          await deleteDoc(sessionRef);
        } catch (error) {
          console.error("Errore rimozione sessione scaduta:", error);
          // Continua anche se la rimozione fallisce
        }
        return { valid: false };
      }

      return { valid: true, session };
    } catch (error) {
      console.error("Errore validazione sessione:", error);
      return { valid: false };
    }
  }

  /**
   * Estende sessione esistente
   */
  static async extendSession(sessionId: string): Promise<boolean> {
    try {
      const sessionRef = doc(db, "validationSessions", sessionId);
      const now = Date.now();

      try {
        await updateDoc(sessionRef, {
          expiresAt: now + SESSION_DURATION,
        });
      } catch (error) {
        console.error("Errore aggiornamento scadenza sessione:", error);
        return false;
      }

      return true;
    } catch (error) {
      console.error("Errore estensione sessione:", error);
      return false;
    }
  }

  /**
   * Revoca token specifico
   */
  static async revokeToken(tokenId: string): Promise<boolean> {
    try {
      const tokenRef = doc(db, "questionnaireTokens", tokenId);
      await updateDoc(tokenRef, {
        revoked: true,
        revokedAt: Date.now(),
      });

      // Rimuovi sessioni attive per questo token
      await this.removeSessionsByToken(tokenId);

      return true;
    } catch (error) {
      console.error("Errore revoca token:", error);
      return false;
    }
  }

  /**
   * Cleanup automatico sessioni scadute
   */
  static async cleanupExpiredSessions(): Promise<number> {
    try {
      const now = Date.now();
      const sessionsQuery = query(
        collection(db, "validationSessions"),
        where("expiresAt", "<", now),
      );

      const snapshot = await getDocs(sessionsQuery);
      const deletePromises = snapshot.docs.map((doc) => deleteDoc(doc.ref));

      await Promise.all(deletePromises);
      return snapshot.docs.length;
    } catch (error) {
      console.error("Errore cleanup sessioni:", error);
      return 0;
    }
  }

  /**
   * Rate limiting check
   */
  private static async checkRateLimit(identifier: string): Promise<{
    allowed: boolean;
    remaining: number;
    resetTime: number;
  }> {
    try {
      const now = Date.now();
      const windowStart = now - RATE_LIMIT_WINDOW;

      const rateLimitRef = doc(db, "rateLimits", identifier);
      const rateLimitDoc = await getDoc(rateLimitRef);

      if (!rateLimitDoc.exists()) {
        // Prima richiesta per questo identifier
        await setDoc(rateLimitRef, {
          identifier,
          attempts: 1,
          windowStart: now,
          blocked: false,
          lastAttempt: now,
        });

        return {
          allowed: true,
          remaining: MAX_ATTEMPTS - 1,
          resetTime: now + RATE_LIMIT_WINDOW,
        };
      }

      const rateLimitData = rateLimitDoc.data() as RateLimitEntry;

      // Verifica se la finestra è scaduta
      if (rateLimitData.windowStart < windowStart) {
        // Nuova finestra, reset contatori
        try {
          await updateDoc(rateLimitRef, {
            attempts: 1,
            windowStart: now,
            blocked: false,
            lastAttempt: now,
          });
        } catch (error) {
          console.error("Errore aggiornamento rate limit (reset):", error);
          // In caso di errore, assumiamo che la richiesta sia permessa
        }

        return {
          allowed: true,
          remaining: MAX_ATTEMPTS - 1,
          resetTime: now + RATE_LIMIT_WINDOW,
        };
      }

      // Verifica se è bloccato
      if (rateLimitData.blocked || rateLimitData.attempts >= MAX_ATTEMPTS) {
        return {
          allowed: false,
          remaining: 0,
          resetTime: rateLimitData.windowStart + RATE_LIMIT_WINDOW,
        };
      }

      // Incrementa tentativi
      const newAttempts = rateLimitData.attempts + 1;
      const shouldBlock = newAttempts >= MAX_ATTEMPTS;

      try {
        await updateDoc(rateLimitRef, {
          attempts: newAttempts,
          blocked: shouldBlock,
          lastAttempt: now,
        });
      } catch (error) {
        console.error("Errore aggiornamento rate limit (incremento):", error);
        // In caso di errore, procedi comunque
      }

      return {
        allowed: !shouldBlock,
        remaining: Math.max(0, MAX_ATTEMPTS - newAttempts),
        resetTime: rateLimitData.windowStart + RATE_LIMIT_WINDOW,
      };
    } catch (error) {
      console.error("Errore verifica rate limit:", error);
      // In caso di errore, consenti la richiesta
      return {
        allowed: true,
        remaining: MAX_ATTEMPTS,
        resetTime: Date.now() + RATE_LIMIT_WINDOW,
      };
    }
  }

  /**
   * Registra tentativo fallito
   */
  private static async recordFailedAttempt(identifier: string): Promise<void> {
    await this.checkRateLimit(identifier);
  }

  /**
   * Crea sessione di validazione
   */
  private static async createValidationSession(data: {
    galleryId: string;
    questionnaireId: string;
    role: "bride" | "groom";
    tokenId: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<string> {
    const now = Date.now();
    const sessionData: Omit<ValidationSession, "id"> = {
      ...data,
      userAgent: data.userAgent || "unknown", // FIX userAgent undefined
      validatedAt: now,
      expiresAt: now + SESSION_DURATION,
    };

    try {
      const sessionRef = await addDoc(
        collection(db, "validationSessions"),
        sessionData,
      );
      return sessionRef.id;
    } catch (error) {
      console.error("Errore creazione sessione validazione:", error);
      throw new Error("Impossibile creare sessione di validazione");
    }
  }

  /**
   * Rimuovi sessioni per token specifico
   */
  private static async removeSessionsByToken(tokenId: string): Promise<void> {
    try {
      const sessionsQuery = query(
        collection(db, "validationSessions"),
        where("tokenId", "==", tokenId),
      );

      const snapshot = await getDocs(sessionsQuery);
      const deletePromises = snapshot.docs.map((doc) => deleteDoc(doc.ref));

      await Promise.all(deletePromises);
    } catch (error) {
      console.error("Errore rimozione sessioni per token:", error);
    }
  }

  /**
   * Cleanup URL parameters dopo validazione
   */
  static cleanupUrlParams(): void {
    if (typeof window === "undefined") return;

    try {
      const url = new URL(window.location.href);
      const hasTokenParams =
        url.searchParams.has("token") || url.searchParams.has("role");

      if (hasTokenParams) {
        // Rimuovi parametri sensibili mantenendo altri
        url.searchParams.delete("token");
        url.searchParams.delete("role");

        // Aggiorna URL senza ricaricare la pagina
        window.history.replaceState({}, "", url.toString());
      }
    } catch (error) {
      console.error("Errore cleanup URL params:", error);
    }
  }

  /**
   * Genera fingerpring browser per enhanced security
   */
  static generateBrowserFingerprint(): string {
    if (typeof window === "undefined") return "unknown";

    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.textBaseline = "top";
        ctx.font = "14px Arial";
        ctx.fillText("Browser fingerprint", 2, 2);
      }

      const fingerprint = [
        navigator.userAgent,
        navigator.language,
        screen.width + "x" + screen.height,
        new Date().getTimezoneOffset(),
        navigator.platform,
        canvas.toDataURL(),
      ].join("|");

      return btoa(fingerprint).slice(0, 32);
    } catch (error) {
      return "unknown";
    }
  }

  /**
   * Estrae IP address (da utilizzare in Cloud Functions)
   */
  static extractClientIP(request: any): string {
    return (
      request.headers["x-forwarded-for"]?.split(",")[0] ||
      request.headers["x-real-ip"] ||
      request.connection?.remoteAddress ||
      "unknown"
    );
  }

  /**
   * Cleanup sessioni per token specifico
   */
  static async cleanupSessionsByTokenId(tokenId: string): Promise<void> {
    try {
      const sessionsQuery = query(
        collection(db, "validationSessions"),
        where("tokenId", "==", tokenId),
      );

      const snapshot = await getDocs(sessionsQuery);
      const deletePromises = snapshot.docs.map((doc) => deleteDoc(doc.ref));

      await Promise.all(deletePromises);

      if (snapshot.size > 0) {
        console.log(
          `Cleanup: ${snapshot.size} sessioni eliminate per token ${tokenId}`,
        );
      }
    } catch (error) {
      console.error("Errore cleanup sessioni per token:", error);
    }
  }
}