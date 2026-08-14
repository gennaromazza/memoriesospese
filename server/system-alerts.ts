/**
 * System Alerts — avvisi automatici all'admin per problemi di sistema.
 *
 * Nato dopo l'incidente di ago 2026: la chiave Google Calendar revocata è
 * rimasta rotta per settimane senza che nessuno se ne accorgesse, e le
 * prenotazioni pubbliche accettavano orari sopra impegni reali.
 *
 * Regole:
 *  - MAI lanciare errori (fire-and-forget): un alert non deve rompere il flusso chiamante.
 *  - Throttling persistente su Firestore (sopravvive ai restart): max 1 email
 *    per tipo di alert ogni ALERT_THROTTLE_MS.
 */

const ADMIN_EMAIL = "image.studio.fotografico@gmail.com";
const ALERT_THROTTLE_MS = 12 * 60 * 60 * 1000; // 12 ore

// Guardia in-memory per evitare letture Firestore ripetute a raffica
const lastAttemptInMemory: Record<string, number> = {};
const IN_MEMORY_GUARD_MS = 5 * 60 * 1000; // 5 minuti

/**
 * Invia (se non throttled) un'email di avviso all'admin.
 * @param alertKey chiave stabile del tipo di problema (es. "calendar_unavailable")
 * @param subject oggetto dell'email
 * @param htmlBody corpo HTML dell'email
 */
export async function sendAdminSystemAlert(
  alertKey: string,
  subject: string,
  htmlBody: string,
): Promise<void> {
  try {
    const now = Date.now();

    // Guardia veloce in-memory (evita hammering su Firestore)
    if (lastAttemptInMemory[alertKey] && now - lastAttemptInMemory[alertKey] < IN_MEMORY_GUARD_MS) {
      return;
    }
    lastAttemptInMemory[alertKey] = now;

    const { db } = await import("./firebase-admin.js");
    const ref = db.collection("systemAlerts").doc(alertKey);

    // Transazione: leggi lastSentAt e, se oltre il throttle, marca PRIMA dell'invio
    // (pattern idempotente: meglio perdere un alert che inviarne a raffica).
    const shouldSend = await db.runTransaction(async (tx: any) => {
      const snap = await tx.get(ref);
      const lastSentAt: number = snap.exists ? snap.data()?.lastSentAt || 0 : 0;
      if (now - lastSentAt < ALERT_THROTTLE_MS) return false;
      tx.set(ref, { lastSentAt: now, subject, updatedAt: new Date().toISOString() }, { merge: true });
      return true;
    });

    if (!shouldSend) return;

    const { sendGmailEmail } = await import("./email-routes.js");
    await sendGmailEmail(
      ADMIN_EMAIL,
      subject,
      htmlBody,
      "Image Studio Fotografico <image.studio.fotografico@gmail.com>",
      { type: "system_alert" },
    );
    console.log(`[System Alerts] 📨 Alert "${alertKey}" inviato a ${ADMIN_EMAIL}`);
  } catch (error: any) {
    // MAI propagare: l'alert è best-effort
    console.error(`[System Alerts] ⚠️ Invio alert "${alertKey}" fallito:`, error?.message || error);
  }
}

/**
 * Alert specifico: Google Calendar non leggibile / autenticazione fallita.
 * Chiamare dai punti in cui viene rilevato CALENDAR_UNAVAILABLE o un errore auth.
 */
export function notifyCalendarUnavailable(reason: string): void {
  const subject = "⚠️ Problema collegamento Google Calendar - prenotazioni bloccate";
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #dc2626; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0;">⚠️ Attenzione Admin!</h2>
      </div>
      <div style="border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
        <p><strong>Il sistema non riesce a leggere il tuo Google Calendar.</strong></p>
        <p>Per sicurezza, le prenotazioni e le consulenze pubbliche sono <strong>temporaneamente bloccate</strong>
        (i clienti vedono "Calendario temporaneamente non disponibile"): così nessuno può prenotare
        sopra i tuoi impegni reali.</p>
        <p style="background:#f3f4f6; padding:12px; border-radius:6px; font-family:monospace; font-size:13px;">
          Dettaglio tecnico: ${reason}
        </p>
        <p><strong>Cosa fare:</strong></p>
        <ul>
          <li>Controlla che il calendario sia ancora condiviso con l'account di servizio</li>
          <li>Se il problema persiste, chiedi assistenza all'agente Replit citando "collegamento Google Calendar"</li>
        </ul>
        <p style="color:#6b7280; font-size:12px;">Questo avviso viene inviato al massimo una volta ogni 12 ore.</p>
      </div>
    </div>`;
  // Fire-and-forget: non attendere né propagare
  void sendAdminSystemAlert("calendar_unavailable", subject, html);
}
