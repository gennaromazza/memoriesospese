/**
 * REMINDER ROUTES - Gestione reminder automatici per appuntamenti
 * 
 * Endpoint per inviare email reminder 24h prima di:
 * - Booking (shooting fotografici)
 * - Consulenze
 */

import { Router } from "express";
import { db, Timestamp } from "./firebase-admin.js";
import { 
  sendGmailEmail, 
  getStudioContactInfo,
  createConsultationReminderEmailHTML,
  generateGoogleCalendarLink
} from "./email-routes.js";
import { DateTime } from "luxon";

const router = Router();

/**
 * Template HTML per email Reminder Booking (24h prima dello shooting)
 */
function createBookingReminderEmailHTML(
  clienteName: string,
  campaignName: string,
  shootingDate: string,
  shootingTime: string,
  studioInfo: { name: string; email: string; phone: string; address: string },
  calendarLink?: string
): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #8b7355 0%, #a08060 100%); color: white; padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
        <h1 style="margin: 0; font-size: 28px;">⏰ Promemoria Shooting</h1>
      </div>
      
      <div style="background: white; padding: 30px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        <p style="font-size: 16px; color: #333; margin-bottom: 20px;">
          Ciao <strong>${clienteName}</strong>,
        </p>
        
        <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 20px; margin: 25px 0; border-radius: 8px;">
          <h3 style="color: #856404; margin: 0 0 10px 0; font-size: 18px;">📸 Shooting tra 24 ore!</h3>
          <p style="color: #555; margin: 0; font-size: 14px; line-height: 1.5;">
            Ti ricordiamo che <strong>domani</strong> hai lo shooting fotografico <strong style="color: #8b7355;">${campaignName}</strong>.
          </p>
        </div>
        
        <div style="background: #f9f7f4; padding: 20px; border-radius: 8px; margin: 25px 0;">
          <h3 style="color: #8b5a3c; margin: 0 0 15px 0; font-size: 18px;">📋 Dettagli Appuntamento</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #666; font-size: 14px; width: 30%;">📅 Data:</td>
              <td style="padding: 8px 0; color: #333; font-size: 14px; font-weight: 600;">${shootingDate}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666; font-size: 14px;">🕐 Orario:</td>
              <td style="padding: 8px 0; color: #333; font-size: 14px; font-weight: 600;">${shootingTime}</td>
            </tr>
            ${studioInfo.address ? `
            <tr>
              <td style="padding: 8px 0; color: #666; font-size: 14px;">📍 Luogo:</td>
              <td style="padding: 8px 0; color: #333; font-size: 14px; font-weight: 600;">${studioInfo.address}</td>
            </tr>
            ` : ''}
          </table>
        </div>

        ${calendarLink ? `
        <div style="text-align: center; margin: 20px 0;">
          <a href="${calendarLink}" style="display: inline-block; background: #8b7355; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">
            📅 Aggiungi al Calendario
          </a>
        </div>
        ` : ''}
        
        <div style="background: #e7f3ff; padding: 15px; border-radius: 8px; margin: 25px 0;">
          <h4 style="color: #0056b3; margin: 0 0 10px 0; font-size: 16px;">💡 Suggerimenti Last Minute</h4>
          <ul style="margin: 0; padding-left: 20px; color: #555; font-size: 14px; line-height: 1.8;">
            <li>Arriva 10-15 minuti prima dell'orario</li>
            <li>Porta gli accessori/abiti che desideri includere</li>
            <li>Assicurati che il cellulare sia carico</li>
            <li>Rilassati e divertiti! 📸</li>
          </ul>
        </div>
        
        <p style="font-size: 15px; color: #555; text-align: center; margin: 25px 0;">
          Ci vediamo domani! Per qualsiasi necessità, contattaci su WhatsApp.
        </p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="https://wa.me/${studioInfo.phone.replace(/\D/g, '')}" 
             style="background: #25D366; color: white; padding: 12px 30px; 
                    text-decoration: none; border-radius: 25px; font-weight: 600; 
                    display: inline-block; font-size: 15px;">
            💬 Contattaci su WhatsApp
          </a>
        </div>
      </div>
      
      <div style="text-align: center; color: #666; font-size: 12px; margin-top: 30px;">
        <p style="margin: 5px 0; font-weight: 600;">${studioInfo.name}</p>
        ${studioInfo.address ? `<p style="margin: 5px 0;">${studioInfo.address}</p>` : ''}
        <p style="margin: 5px 0;">Email: ${studioInfo.email}</p>
        <p style="margin: 5px 0;">Tel: ${studioInfo.phone}</p>
      </div>
    </div>
  `;
}

/**
 * POST /api/reminders/send-all
 * Invia reminder email per tutti gli appuntamenti nelle prossime 20-28 ore
 * (booking + consulenze)
 */
router.post("/send-all", async (req, res) => {
  try {
    console.log("[Reminders] 🚀 Avvio invio reminder...");
    
    const nowRome = DateTime.now().setZone("Europe/Rome");
    
    // Finestra temporale: 20-28 ore da adesso (circa "domani")
    const minHours = 20;
    const maxHours = 28;
    
    const windowStart = nowRome.plus({ hours: minHours }).toJSDate();
    const windowEnd = nowRome.plus({ hours: maxHours }).toJSDate();
    
    console.log(`[Reminders] 📅 Finestra: ${windowStart.toISOString()} - ${windowEnd.toISOString()}`);
    
    const studioInfo = await getStudioContactInfo();
    
    const results = {
      bookings: { checked: 0, sent: 0, skipped: 0, errors: [] as string[] },
      consultations: { checked: 0, sent: 0, skipped: 0, errors: [] as string[] }
    };
    
    // ============= BOOKING REMINDERS =============
    console.log("[Reminders] 📸 Controllo bookings...");
    
    const bookingsSnapshot = await db.collection("bookings")
      .where("stato", "==", "confermata")
      .get();
    
    results.bookings.checked = bookingsSnapshot.size;
    
    for (const doc of bookingsSnapshot.docs) {
      const booking = doc.data();
      
      // Skip se reminder già inviato
      if (booking.reminderEmailSent) {
        results.bookings.skipped++;
        continue;
      }
      
      // Verifica che sia nella finestra temporale
      const shootingStart = booking.dataShootingInizio?.toDate?.() || booking.dataShootingInizio;
      if (!shootingStart) continue;
      
      const shootingDT = DateTime.fromJSDate(shootingStart).setZone("Europe/Rome");
      const hoursDiff = shootingDT.diff(nowRome, "hours").hours;
      
      if (hoursDiff < minHours || hoursDiff > maxHours) {
        continue; // Non nella finestra
      }
      
      try {
        // Atomic check-and-set per evitare duplicati
        const shouldSend = await db.runTransaction(async (transaction) => {
          const bookingDoc = await transaction.get(db.collection("bookings").doc(doc.id));
          if (!bookingDoc.exists || bookingDoc.data()?.reminderEmailSent) {
            return false;
          }
          transaction.update(db.collection("bookings").doc(doc.id), {
            reminderEmailSent: true,
            reminderEmailSentAt: Timestamp.now()
          });
          return true;
        });
        
        if (!shouldSend) {
          results.bookings.skipped++;
          continue;
        }
        
        // Prepara dati email
        const shootingEnd = booking.dataShootingFine?.toDate?.() || booking.dataShootingFine;
        const formattedDate = shootingDT.setLocale("it").toFormat("EEEE d MMMM yyyy");
        const formattedTime = `${shootingDT.toFormat("HH:mm")} - ${DateTime.fromJSDate(shootingEnd).setZone("Europe/Rome").toFormat("HH:mm")}`;
        
        // Recupera nome campagna
        let campaignName = "Shooting Fotografico";
        if (booking.campaignId) {
          const campaignDoc = await db.collection("booking_campaigns").doc(booking.campaignId).get();
          if (campaignDoc.exists) {
            campaignName = campaignDoc.data()?.nome || campaignName;
          }
        }
        
        const clienteName = `${booking.cliente?.nome || ""} ${booking.cliente?.cognome || ""}`.trim();
        
        // Genera calendar link
        const calendarLink = generateGoogleCalendarLink({
          title: `📸 ${campaignName}`,
          description: `Shooting fotografico con ${studioInfo.name}`,
          location: studioInfo.address || "",
          startDate: shootingStart,
          endDate: shootingEnd,
          isAllDay: false
        });
        
        const emailHTML = createBookingReminderEmailHTML(
          clienteName,
          campaignName,
          formattedDate,
          formattedTime,
          studioInfo,
          calendarLink
        );
        
        await sendGmailEmail(
          booking.cliente.email,
          `⏰ Promemoria Shooting Domani - ${campaignName}`,
          emailHTML
        );
        
        results.bookings.sent++;
        console.log(`[Reminders] ✅ Booking reminder inviato: ${doc.id} → ${booking.cliente.email}`);
        
      } catch (error: any) {
        results.bookings.errors.push(`Booking ${doc.id}: ${error.message}`);
        console.error(`[Reminders] ❌ Errore booking ${doc.id}:`, error.message);
        
        // Rollback del flag in caso di errore
        await db.collection("bookings").doc(doc.id).update({
          reminderEmailSent: false,
          reminderEmailSentAt: null
        });
      }
    }
    
    // ============= CONSULTATION REMINDERS =============
    console.log("[Reminders] 🗓️ Controllo consulenze...");
    
    const consultationsSnapshot = await db.collection("consultations")
      .where("stato", "==", "confermata")
      .get();
    
    results.consultations.checked = consultationsSnapshot.size;
    
    for (const doc of consultationsSnapshot.docs) {
      const consultation = doc.data();
      
      // Skip se reminder già inviato
      if (consultation.reminderEmailSent || consultation.reminderSentAt) {
        results.consultations.skipped++;
        continue;
      }
      
      // Verifica che sia nella finestra temporale
      const consultationDate = consultation.dataConsulenza?.toDate?.() || consultation.dataConsulenza;
      if (!consultationDate) continue;
      
      const consultationDT = DateTime.fromJSDate(consultationDate).setZone("Europe/Rome");
      const hoursDiff = consultationDT.diff(nowRome, "hours").hours;
      
      if (hoursDiff < minHours || hoursDiff > maxHours) {
        continue; // Non nella finestra
      }
      
      try {
        // Atomic check-and-set
        const shouldSend = await db.runTransaction(async (transaction) => {
          const consultDoc = await transaction.get(db.collection("consultations").doc(doc.id));
          if (!consultDoc.exists || consultDoc.data()?.reminderSentAt) {
            return false;
          }
          transaction.update(db.collection("consultations").doc(doc.id), {
            reminderSentAt: Timestamp.now(),
            reminderEmailSent: true
          });
          return true;
        });
        
        if (!shouldSend) {
          results.consultations.skipped++;
          continue;
        }
        
        // Prepara dati email
        const formattedDate = consultationDT.setLocale("it").toFormat("EEEE d MMMM yyyy");
        const formattedTime = `${consultation.orarioInizio || ""} - ${consultation.orarioFine || ""}`;
        const clienteName = `${consultation.cliente?.nome || ""} ${consultation.cliente?.cognome || ""}`.trim();
        
        // Genera calendar link
        const startDateTime = DateTime.fromFormat(
          `${consultationDT.toFormat("yyyy-MM-dd")} ${consultation.orarioInizio}`,
          "yyyy-MM-dd HH:mm",
          { zone: "Europe/Rome" }
        ).toJSDate();
        
        const endDateTime = DateTime.fromFormat(
          `${consultationDT.toFormat("yyyy-MM-dd")} ${consultation.orarioFine}`,
          "yyyy-MM-dd HH:mm",
          { zone: "Europe/Rome" }
        ).toJSDate();
        
        const calendarLink = generateGoogleCalendarLink({
          title: `🗓️ Consulenza ${consultation.jobType || ""}`,
          description: `Consulenza con ${studioInfo.name}`,
          location: studioInfo.address || "",
          startDate: startDateTime,
          endDate: endDateTime,
          isAllDay: false
        });
        
        const emailHTML = createConsultationReminderEmailHTML(
          clienteName,
          consultation.jobType || "Consulenza",
          formattedDate,
          formattedTime,
          studioInfo,
          calendarLink
        );
        
        await sendGmailEmail(
          consultation.cliente.email,
          `⏰ Promemoria Consulenza Domani - ${consultation.jobType || "Consulenza"}`,
          emailHTML
        );
        
        results.consultations.sent++;
        console.log(`[Reminders] ✅ Consultation reminder inviato: ${doc.id} → ${consultation.cliente.email}`);
        
      } catch (error: any) {
        results.consultations.errors.push(`Consultation ${doc.id}: ${error.message}`);
        console.error(`[Reminders] ❌ Errore consultation ${doc.id}:`, error.message);
        
        // Rollback
        await db.collection("consultations").doc(doc.id).update({
          reminderSentAt: null,
          reminderEmailSent: false
        });
      }
    }
    
    console.log("[Reminders] ✅ Completato!", results);
    
    res.json({
      success: true,
      message: "Reminder process completed",
      timestamp: new Date().toISOString(),
      results
    });
    
  } catch (error: any) {
    console.error("[Reminders] ❌ Errore generale:", error.message);
    res.status(500).json({
      success: false,
      error: error.message || "Errore invio reminder"
    });
  }
});

/**
 * GET /api/reminders/status
 * Mostra lo stato dei reminder: quanti appuntamenti sono in arrivo e quanti reminder sono stati inviati
 */
router.get("/status", async (req, res) => {
  try {
    const nowRome = DateTime.now().setZone("Europe/Rome");
    const next48h = nowRome.plus({ hours: 48 }).toJSDate();
    
    // Bookings nelle prossime 48h
    const bookingsSnapshot = await db.collection("bookings")
      .where("stato", "==", "confermata")
      .where("dataShootingInizio", ">=", Timestamp.fromDate(nowRome.toJSDate()))
      .where("dataShootingInizio", "<=", Timestamp.fromDate(next48h))
      .get();
    
    const bookingsData = bookingsSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        cliente: `${data.cliente?.nome || ""} ${data.cliente?.cognome || ""}`.trim(),
        email: data.cliente?.email,
        data: data.dataShootingInizio?.toDate?.()?.toISOString(),
        reminderSent: !!data.reminderEmailSent,
        reminderSentAt: data.reminderEmailSentAt?.toDate?.()?.toISOString()
      };
    });
    
    // Consultazioni nelle prossime 48h
    const consultationsSnapshot = await db.collection("consultations")
      .where("stato", "==", "confermata")
      .where("dataConsulenza", ">=", Timestamp.fromDate(nowRome.toJSDate()))
      .where("dataConsulenza", "<=", Timestamp.fromDate(next48h))
      .get();
    
    const consultationsData = consultationsSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        cliente: `${data.cliente?.nome || ""} ${data.cliente?.cognome || ""}`.trim(),
        email: data.cliente?.email,
        jobType: data.jobType,
        data: data.dataConsulenza?.toDate?.()?.toISOString(),
        reminderSent: !!(data.reminderEmailSent || data.reminderSentAt),
        reminderSentAt: data.reminderSentAt?.toDate?.()?.toISOString()
      };
    });
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      bookings: {
        total: bookingsData.length,
        withReminder: bookingsData.filter(b => b.reminderSent).length,
        pending: bookingsData.filter(b => !b.reminderSent).length,
        list: bookingsData
      },
      consultations: {
        total: consultationsData.length,
        withReminder: consultationsData.filter(c => c.reminderSent).length,
        pending: consultationsData.filter(c => !c.reminderSent).length,
        list: consultationsData
      }
    });
    
  } catch (error: any) {
    console.error("[Reminders Status] ❌ Errore:", error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
