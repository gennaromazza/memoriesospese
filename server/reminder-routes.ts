/**
 * REMINDER ROUTES - Gestione reminder automatici per appuntamenti
 * 
 * Endpoint per inviare email reminder 24h prima di:
 * - Booking (shooting fotografici)
 * - Consulenze
 */

import { Router } from "express";
import { db, Timestamp, FieldValue } from "./firebase-admin.js";
import { 
  sendGmailEmail, 
  getStudioContactInfo,
  createConsultationReminderEmailHTML,
  generateGoogleCalendarLink,
  getSiteBaseUrl,
  authenticateFirebase
} from "./email-routes.js";
import { DateTime } from "luxon";
import { formatPhoneForWhatsApp } from '../shared/phone-utils.js';
import {
  generateGallerySelectionReminderEmail,
  generateGallerySelectionReminderSubject
} from "./email-templates/gallery-selection-reminder.js";

const router = Router();

const ADMIN_EMAILS = ['gennaro.mazzacane@gmail.com'];

function requireAdmin(req: any, res: any, next: any) {
  if (!ADMIN_EMAILS.includes(req.user?.email || '')) {
    return res.status(403).json({ error: 'Accesso negato: solo admin' });
  }
  next();
}

/**
 * Template HTML per email Reminder Booking (24h prima dello shooting)
 * Palette October Mist: sage #8b9a7d, terracotta #c17f59, cream #f5f0e8, blue-gray #6b7d8a
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
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #faf8f5;">
      <div style="background: linear-gradient(135deg, #8b9a7d 0%, #a8c5b5 100%); color: white; padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
        <h1 style="margin: 0; font-size: 26px; font-weight: 600;">Promemoria Shooting</h1>
        <p style="margin: 8px 0 0 0; font-size: 14px; opacity: 0.9;">Il tuo appuntamento è domani</p>
      </div>
      
      <div style="background: white; padding: 30px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.08);">
        <p style="font-size: 16px; color: #333; margin-bottom: 20px;">
          Ciao <strong>${clienteName}</strong>,
        </p>
        
        <div style="background: #f5f0e8; border-left: 4px solid #c17f59; padding: 20px; margin: 25px 0; border-radius: 0 8px 8px 0;">
          <h3 style="color: #c17f59; margin: 0 0 10px 0; font-size: 18px;">Shooting tra 24 ore</h3>
          <p style="color: #555; margin: 0; font-size: 14px; line-height: 1.5;">
            Ti ricordiamo che <strong>domani</strong> hai lo shooting fotografico <strong style="color: #8b9a7d;">${campaignName}</strong>.
          </p>
        </div>
        
        <div style="background: #faf8f5; padding: 20px; border-radius: 8px; margin: 25px 0; border: 1px solid #e8e4de;">
          <h3 style="color: #6b7d8a; margin: 0 0 15px 0; font-size: 18px;">Dettagli Appuntamento</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #6b7d8a; font-size: 14px; width: 30%;">Data:</td>
              <td style="padding: 8px 0; color: #333; font-size: 14px; font-weight: 600;">${shootingDate}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7d8a; font-size: 14px;">Orario:</td>
              <td style="padding: 8px 0; color: #333; font-size: 14px; font-weight: 600;">${shootingTime}</td>
            </tr>
            ${studioInfo.address ? `
            <tr>
              <td style="padding: 8px 0; color: #6b7d8a; font-size: 14px;">Luogo:</td>
              <td style="padding: 8px 0; color: #333; font-size: 14px; font-weight: 600;">${studioInfo.address}</td>
            </tr>
            ` : ''}
          </table>
        </div>

        ${calendarLink ? `
        <div style="text-align: center; margin: 20px 0;">
          <a href="${calendarLink}" style="display: inline-block; background: #8b9a7d; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">
            Aggiungi al Calendario
          </a>
        </div>
        ` : ''}
        
        <div style="background: #f0f5f2; padding: 15px 20px; border-radius: 8px; margin: 25px 0; border: 1px solid #d4e0d8;">
          <h4 style="color: #6b7d8a; margin: 0 0 12px 0; font-size: 15px;">Suggerimenti Last Minute</h4>
          <ul style="margin: 0; padding-left: 20px; color: #555; font-size: 14px; line-height: 1.8;">
            <li>Arriva 10-15 minuti prima dell'orario</li>
            <li>Porta gli accessori/abiti che desideri includere</li>
            <li>Assicurati che il cellulare sia carico</li>
            <li>Rilassati e divertiti!</li>
          </ul>
        </div>
        
        <p style="font-size: 15px; color: #555; text-align: center; margin: 25px 0;">
          Ci vediamo domani! Per qualsiasi necessità, contattaci.
        </p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="https://wa.me/${formatPhoneForWhatsApp(studioInfo.phone)}" 
             style="background: #25D366; color: white; padding: 12px 30px; 
                    text-decoration: none; border-radius: 25px; font-weight: 600; 
                    display: inline-block; font-size: 15px;">
            Contattaci su WhatsApp
          </a>
        </div>
      </div>
      
      <div style="text-align: center; color: #6b7d8a; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e8e4de;">
        <p style="margin: 5px 0; font-weight: 600; color: #555;">${studioInfo.name}</p>
        ${studioInfo.address ? `<p style="margin: 5px 0;">${studioInfo.address}</p>` : ''}
        <p style="margin: 5px 0;">Email: ${studioInfo.email}</p>
        <p style="margin: 5px 0;">Tel: ${studioInfo.phone}</p>
      </div>
    </div>
  `;
}

/**
 * Crea HTML per email promemoria admin (24h prima di una consulenza)
 */
function createAdminConsultationReminderHTML(
  clienteName: string,
  clienteEmail: string,
  clientePhone: string,
  jobType: string,
  formattedDate: string,
  formattedTime: string,
  studioInfo: { name: string; email: string; phone: string; address: string }
): string {
  return `
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#faf8f5;">
      <div style="background:linear-gradient(135deg,#4a5e4a 0%,#6b8f6b 100%);color:white;padding:28px 30px;border-radius:12px 12px 0 0;border-bottom:3px solid #c4724a;">
        <h1 style="margin:0;font-size:22px;font-weight:600;">⏰ Promemoria Consulenza — Domani</h1>
        <p style="margin:6px 0 0 0;font-size:13px;opacity:0.85;">Hai una consulenza programmata per domani</p>
      </div>
      <div style="background:white;padding:28px 30px;border-radius:0 0 12px 12px;box-shadow:0 4px 6px rgba(0,0,0,0.07);">
        <div style="background:#f5f0e8;border-left:4px solid #c4724a;padding:18px 20px;border-radius:0 8px 8px 0;margin-bottom:22px;">
          <p style="margin:0 0 6px 0;font-size:13px;color:#888;text-transform:uppercase;letter-spacing:1px;">Tipo consulenza</p>
          <p style="margin:0;font-size:18px;font-weight:700;color:#4a5e4a;">${jobType}</p>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr style="border-bottom:1px solid #f0ebe3;">
            <td style="padding:10px 0;color:#888;width:120px;">Data</td>
            <td style="padding:10px 0;font-weight:600;color:#333;">${formattedDate}</td>
          </tr>
          <tr style="border-bottom:1px solid #f0ebe3;">
            <td style="padding:10px 0;color:#888;">Orario</td>
            <td style="padding:10px 0;font-weight:600;color:#333;">${formattedTime}</td>
          </tr>
          <tr style="border-bottom:1px solid #f0ebe3;">
            <td style="padding:10px 0;color:#888;">Cliente</td>
            <td style="padding:10px 0;font-weight:600;color:#333;">${clienteName}</td>
          </tr>
          <tr style="border-bottom:1px solid #f0ebe3;">
            <td style="padding:10px 0;color:#888;">Email</td>
            <td style="padding:10px 0;"><a href="mailto:${clienteEmail}" style="color:#c4724a;">${clienteEmail}</a></td>
          </tr>
          ${clientePhone ? `<tr>
            <td style="padding:10px 0;color:#888;">Telefono</td>
            <td style="padding:10px 0;"><a href="https://wa.me/${formatPhoneForWhatsApp(clientePhone)}" style="color:#4a5e4a;font-weight:600;">${clientePhone}</a></td>
          </tr>` : ''}
        </table>
        <p style="margin:22px 0 0 0;font-size:12px;color:#aaa;text-align:center;">
          ${studioInfo.name} — Promemoria automatico generato 24h prima dell'appuntamento
        </p>
      </div>
    </div>`;
}

/**
 * Funzione core per inviare tutti i reminder.
 * Chiamata sia dall'endpoint HTTP che dallo scheduler automatico.
 */
export async function runReminderCheck(): Promise<{
  bookings: { checked: number; sent: number; skipped: number; errors: string[] };
  consultations: { checked: number; sent: number; skipped: number; errors: string[] };
  galleries: { checked: number; sent: number; skipped: number; errors: string[] };
}> {
  console.log("[Reminders] 🚀 Avvio controllo reminder...");

  const nowRome = DateTime.now().setZone("Europe/Rome");

  const minHours = 20;
  const maxHours = 28;

  console.log(`[Reminders] 📅 Finestra: +${minHours}h — +${maxHours}h da adesso (Europe/Rome)`);

  const studioInfo = await getStudioContactInfo();

  const results = {
    bookings: { checked: 0, sent: 0, skipped: 0, errors: [] as string[] },
    consultations: { checked: 0, sent: 0, skipped: 0, errors: [] as string[] },
    galleries: { checked: 0, sent: 0, skipped: 0, errors: [] as string[] },
  };

  // ============= BOOKING REMINDERS =============
  console.log("[Reminders] 📸 Controllo bookings...");

  const bookingsSnapshot = await db.collection("bookings")
    .where("stato", "==", "confermata")
    .get();

  results.bookings.checked = bookingsSnapshot.size;

  for (const doc of bookingsSnapshot.docs) {
    const booking = doc.data();
    if (booking.reminderEmailSent) { results.bookings.skipped++; continue; }
    const shootingStart = booking.dataShootingInizio?.toDate?.() || booking.dataShootingInizio;
    if (!shootingStart) continue;
    const shootingDT = DateTime.fromJSDate(shootingStart).setZone("Europe/Rome");
    const hoursDiff = shootingDT.diff(nowRome, "hours").hours;
    if (hoursDiff < minHours || hoursDiff > maxHours) continue;

    try {
      const shouldSend = await db.runTransaction(async (transaction) => {
        const bookingDoc = await transaction.get(db.collection("bookings").doc(doc.id));
        if (!bookingDoc.exists || bookingDoc.data()?.reminderEmailSent) return false;
        transaction.update(db.collection("bookings").doc(doc.id), { reminderEmailSent: true, reminderEmailSentAt: Timestamp.now() });
        return true;
      });
      if (!shouldSend) { results.bookings.skipped++; continue; }

      const formattedDate = shootingDT.setLocale("it").toFormat("EEEE d MMMM yyyy");
      const formattedTime = shootingDT.toFormat("HH:mm");
      const clienteName = `${booking.cliente?.nome || ""} ${booking.cliente?.cognome || ""}`.trim();
      const campaignName = booking.campagnaNome || booking.campaignName || "Shooting";

      const shootingEnd = booking.dataShootingFine?.toDate?.() || booking.dataShootingFine || shootingStart;
      const calendarLink = generateGoogleCalendarLink({
        title: `Shooting: ${campaignName}`,
        description: `Shooting fotografico con ${studioInfo.name}`,
        location: studioInfo.address || "",
        startDate: shootingStart,
        endDate: shootingEnd,
        isAllDay: false
      });

      const emailHTML = createBookingReminderEmailHTML(clienteName, campaignName, formattedDate, formattedTime, studioInfo, calendarLink);
      await sendGmailEmail(booking.cliente.email, `Promemoria Shooting Domani - ${campaignName}`, emailHTML);

      results.bookings.sent++;
      console.log(`[Reminders] ✅ Booking reminder inviato: ${doc.id} → ${booking.cliente.email}`);
    } catch (error: any) {
      results.bookings.errors.push(`Booking ${doc.id}: ${error.message}`);
      console.error(`[Reminders] ❌ Errore booking ${doc.id}:`, error.message);
      await db.collection("bookings").doc(doc.id).update({ reminderEmailSent: false, reminderEmailSentAt: null });
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
    if (consultation.reminderEmailSent || consultation.reminderSentAt) { results.consultations.skipped++; continue; }

    const consultationDate = consultation.dataConsulenza?.toDate?.() || consultation.dataConsulenza;
    if (!consultationDate) continue;

    const consultationDT = DateTime.fromJSDate(consultationDate).setZone("Europe/Rome");
    const hoursDiff = consultationDT.diff(nowRome, "hours").hours;
    if (hoursDiff < minHours || hoursDiff > maxHours) continue;

    try {
      const shouldSend = await db.runTransaction(async (transaction) => {
        const consultDoc = await transaction.get(db.collection("consultations").doc(doc.id));
        if (!consultDoc.exists || consultDoc.data()?.reminderSentAt) return false;
        transaction.update(db.collection("consultations").doc(doc.id), { reminderSentAt: Timestamp.now(), reminderEmailSent: true });
        return true;
      });
      if (!shouldSend) { results.consultations.skipped++; continue; }

      const formattedDate = consultationDT.setLocale("it").toFormat("EEEE d MMMM yyyy");
      const formattedTime = `${consultation.orarioInizio || ""} - ${consultation.orarioFine || ""}`;
      const clienteName = `${consultation.cliente?.nome || ""} ${consultation.cliente?.cognome || ""}`.trim();

      const startDateTime = DateTime.fromFormat(
        `${consultationDT.toFormat("yyyy-MM-dd")} ${consultation.orarioInizio}`,
        "yyyy-MM-dd HH:mm", { zone: "Europe/Rome" }
      ).toJSDate();
      const endDateTime = DateTime.fromFormat(
        `${consultationDT.toFormat("yyyy-MM-dd")} ${consultation.orarioFine}`,
        "yyyy-MM-dd HH:mm", { zone: "Europe/Rome" }
      ).toJSDate();

      const calendarLink = generateGoogleCalendarLink({
        title: `Consulenza: ${consultation.jobType || "Appuntamento"}`,
        description: `Consulenza con ${studioInfo.name}`,
        location: studioInfo.address || "",
        startDate: startDateTime,
        endDate: endDateTime,
        isAllDay: false
      });

      // Email al cliente
      const clientEmailHTML = createConsultationReminderEmailHTML(
        clienteName, consultation.jobType || "Consulenza", formattedDate, formattedTime, studioInfo, calendarLink
      );
      await sendGmailEmail(
        consultation.cliente.email,
        `Promemoria Consulenza Domani - ${consultation.jobType || "Consulenza"}`,
        clientEmailHTML
      );

      // Email all'admin (promemoria per Gennaro)
      try {
        const adminHTML = createAdminConsultationReminderHTML(
          clienteName,
          consultation.cliente?.email || "",
          consultation.cliente?.whatsapp || consultation.cliente?.telefono || "",
          consultation.jobType || "Consulenza",
          formattedDate,
          formattedTime,
          studioInfo
        );
        await sendGmailEmail(
          studioInfo.email,
          `⏰ Promemoria: Consulenza domani con ${clienteName} — ${formattedTime}`,
          adminHTML
        );
        console.log(`[Reminders] 📧 Admin reminder inviato a ${studioInfo.email}`);
      } catch (adminErr: any) {
        console.error("[Reminders] ⚠️ Errore invio admin reminder:", adminErr.message);
      }

      results.consultations.sent++;
      console.log(`[Reminders] ✅ Consultation reminder inviato: ${doc.id} → ${consultation.cliente.email}`);
    } catch (error: any) {
      results.consultations.errors.push(`Consultation ${doc.id}: ${error.message}`);
      console.error(`[Reminders] ❌ Errore consultation ${doc.id}:`, error.message);
      await db.collection("consultations").doc(doc.id).update({ reminderSentAt: null, reminderEmailSent: false });
    }
  }

  // ============= GALLERY SELECTION DEADLINE REMINDERS =============
  console.log("[Reminders] 🖼️ Controllo scadenze selezione gallerie...");

  // Query semplice (singola condizione = no indice composito richiesto)
  // Il filtraggio finestra temporale avviene in memoria, come per bookings/consulenze
  const galleriesSnapshot = await db.collection("galleries")
    .where("selectionEnabled", "==", true)
    .get();

  const minDeadlineMs = nowRome.plus({ hours: minHours }).toMillis();
  const maxDeadlineMs = nowRome.plus({ hours: maxHours }).toMillis();

  // Filtra in memoria per scadenza nella finestra 20-28h
  const galleriesInWindow = galleriesSnapshot.docs.filter(doc => {
    const gallery = doc.data();
    if (!gallery.selectionDeadline) return false;
    const deadlineMs = gallery.selectionDeadline.toDate().getTime();
    return deadlineMs >= minDeadlineMs && deadlineMs <= maxDeadlineMs;
  });

  results.galleries.checked = galleriesInWindow.length;

  for (const doc of galleriesInWindow) {
    const gallery = doc.data();

    // Salta se selezione già completata o reminder già inviato
    if (gallery.selectionReminderSent || gallery.selectionStatus === "completed") {
      results.galleries.skipped++;
      continue;
    }

    // Recupera email cliente: prima dal campo diretto, poi dal documento cliente
    let clientEmail: string | null = gallery.clientEmail || null;
    let clientName: string = gallery.clientName || "Cliente";

    if (!clientEmail && gallery.clientId) {
      try {
        const clientDoc = await db.collection("clients").doc(gallery.clientId).get();
        if (clientDoc.exists) {
          const clientData = clientDoc.data()!;
          clientEmail = clientData.email || null;
          if (!gallery.clientName) {
            clientName = `${clientData.nome || ""} ${clientData.cognome || ""}`.trim() || "Cliente";
          }
        }
      } catch (_) {}
    }

    if (!clientEmail) {
      console.log(`[Reminders] ⚠️ Gallery ${doc.id} (${gallery.name}) senza email cliente — skip`);
      results.galleries.skipped++;
      continue;
    }

    try {
      const shouldSend = await db.runTransaction(async (transaction) => {
        const galleryDoc = await transaction.get(db.collection("galleries").doc(doc.id));
        if (!galleryDoc.exists || galleryDoc.data()?.selectionReminderSent) return false;
        transaction.update(db.collection("galleries").doc(doc.id), {
          selectionReminderSent: true,
          selectionReminderSentAt: Timestamp.now(),
        });
        return true;
      });

      if (!shouldSend) { results.galleries.skipped++; continue; }

      const deadlineDT = DateTime.fromJSDate(gallery.selectionDeadline.toDate()).setZone("Europe/Rome");
      const formattedDate = deadlineDT.setLocale("it").toFormat("EEEE d MMMM yyyy");
      const formattedTime = deadlineDT.toFormat("HH:mm");
      const galleryCode = gallery.code || doc.id;
      const galleryUrl = `${process.env.SITE_BASE_URL || "https://imagestudio.it"}/g/${galleryCode}`;

      const emailHTML = generateGallerySelectionReminderEmail({
        clientName,
        galleryName: gallery.name || "la tua galleria",
        galleryUrl,
        deadlineDate: formattedDate,
        deadlineTime: formattedTime,
        photoCount: gallery.photoCount || undefined,
        studioName: studioInfo.name,
        studioPhone: studioInfo.phone,
        studioEmail: studioInfo.email,
      });

      await sendGmailEmail(
        clientEmail,
        generateGallerySelectionReminderSubject(gallery.name || "la tua galleria"),
        emailHTML
      );

      results.galleries.sent++;
      console.log(`[Reminders] ✅ Gallery selection reminder inviato: ${doc.id} (${gallery.name}) → ${clientEmail}`);
    } catch (error: any) {
      results.galleries.errors.push(`Gallery ${doc.id}: ${error.message}`);
      console.error(`[Reminders] ❌ Errore gallery ${doc.id}:`, error.message);
      await db.collection("galleries").doc(doc.id).update({ selectionReminderSent: false, selectionReminderSentAt: null });
    }
  }

  console.log("[Reminders] ✅ Completato!", results);
  return results;
}

/**
 * AUTO-INVITO CONSULENZA VISIONE
 *
 * Trova i job il cui evento è passato da almeno N giorni (configurabile per template)
 * e invia automaticamente al cliente l'email "solo pulsante" con il link di prenotazione
 * della consulenza visione.
 *
 * Garanzie:
 * - Invio una-tantum per job (marker atomico `visioneAutoInviteSentAt` via transaction).
 * - Rispetta gli invii MANUALI della stessa consulenza (workflowEvent consulenza_inviata
 *   con metadata.templateId === template visione).
 * - Disponibilità con lead post-produzione (dateFrom calcolato sul link).
 */
export async function runVisioneAutoInviteCheck(): Promise<{
  checked: number;
  sent: number;
  skipped: number;
  errors: string[];
}> {
  const results = { checked: 0, sent: 0, skipped: 0, errors: [] as string[] };
  const nowRome = DateTime.now().setZone("Europe/Rome");

  // 1. Template visione con auto-invito attivo (collezione piccola → filtro in codice)
  const templatesSnap = await db.collection("consultationTemplates").get();
  const activeTemplates = templatesSnap.docs
    .map((d: any) => ({ id: d.id, ...(d.data() as any) }))
    .filter((t: any) => t.autoInvioVisioneAttivo === true && t.attiva === true);

  if (activeTemplates.length === 0) {
    return results;
  }

  // jobType → template visione (se più di uno per tipo, scegli il più basso per `ordine`)
  const templateByJobType = new Map<string, any>();
  for (const t of activeTemplates) {
    const existing = templateByJobType.get(t.jobType);
    if (!existing || (t.ordine ?? 0) < (existing.ordine ?? 0)) {
      templateByJobType.set(t.jobType, t);
    }
  }

  const LOOKBACK_DAYS = 30; // non invitare per eventi più vecchi di (soglia + 30 giorni)
  const maxGiorniDopo = Math.max(
    ...activeTemplates.map((t: any) => Number(t.autoInvioVisioneGiorniDopoEvento) || 0)
  );

  // 2. Finestra globale eventi passati: [now - (maxG + LOOKBACK), now]
  //    Range su singolo campo eventDate → usa l'indice automatico (no indice composito)
  const lowerBound = nowRome.minus({ days: maxGiorniDopo + LOOKBACK_DAYS }).startOf("day");
  const upperBound = nowRome.endOf("day");

  const jobsSnap = await db
    .collection("jobs")
    .where("eventDate", ">=", Timestamp.fromDate(lowerBound.toJSDate()))
    .where("eventDate", "<=", Timestamp.fromDate(upperBound.toJSDate()))
    .get();

  results.checked = jobsSnap.size;

  // Helper condivisi (import lazy, coerente con il resto del codice)
  const { buildConsultationLink, buildConsultationInviteEmailHTML } = await import(
    "./consultations/consultation-invite.js"
  );
  const { getAllDayDatesInRange } = await import("./consultations/calendar-adapter.js");
  const { computeEarliestBookableDate } = await import("./calendar-engine/index.js");

  const studioInfo = await getStudioContactInfo();
  const baseUrl = getSiteBaseUrl();

  for (const doc of jobsSnap.docs) {
    const job: any = { id: doc.id, ...doc.data() };

    // Filtri base
    if (job.dataNonDefinita || !job.eventDate) { results.skipped++; continue; }
    if (job.deletedAt) { results.skipped++; continue; }
    if (["consegnato", "archiviato"].includes(job.status)) { results.skipped++; continue; }
    if (job.visioneAutoInviteSentAt) { results.skipped++; continue; }

    const template = templateByJobType.get(job.jobType);
    if (!template) { results.skipped++; continue; }

    const eventDateJs = job.eventDate.toDate ? job.eventDate.toDate() : new Date(job.eventDate);
    const eventDT = DateTime.fromJSDate(eventDateJs).setZone("Europe/Rome");

    const giorniDopo = Number(template.autoInvioVisioneGiorniDopoEvento) || 0;
    const threshold = nowRome.minus({ days: giorniDopo });

    // Evento non ancora "maturo" (non sono passati abbastanza giorni dall'evento)
    if (eventDT.startOf("day") > threshold.startOf("day")) { results.skipped++; continue; }
    // Evento troppo vecchio (oltre la finestra di lookback) — confronto a livello di giorno
    if (eventDT.startOf("day") < threshold.minus({ days: LOOKBACK_DAYS }).startOf("day")) { results.skipped++; continue; }

    // Rispetta invio MANUALE della stessa consulenza visione
    const workflowEvents: any[] = Array.isArray(job.workflowEvents) ? job.workflowEvents : [];
    const alreadySentManual = workflowEvents.some(
      (e) => e?.tipo === "consulenza_inviata" && e?.metadata?.templateId === template.id
    );
    if (alreadySentManual) { results.skipped++; continue; }

    // Email primo cliente
    const clienteId = Array.isArray(job.clientiIds) ? job.clientiIds[0] : undefined;
    if (!clienteId) { results.skipped++; continue; }
    const clienteDoc = await db.collection("clienti").doc(clienteId).get();
    const cliente: any = clienteDoc.exists ? clienteDoc.data() : null;
    if (!cliente?.email) { results.skipped++; continue; }

    // Prima data prenotabile (lead post-produzione) → dateFrom del link.
    // Calcolata PRIMA del lock: è solo lettura, non muta dati e può fallire senza rischi.
    let dateFrom: string | undefined;
    const leadDays = Number(template.giorniPostproduzione) || 0;
    if (leadDays > 0) {
      try {
        const windowStart = nowRome.startOf("day").toJSDate();
        const windowEnd = nowRome.plus({ days: leadDays * 2 + 31 }).endOf("day").toJSDate();
        const allDayDates = await getAllDayDatesInRange(windowStart, windowEnd, db);
        let earliest = computeEarliestBookableDate(nowRome.toJSDate(), leadDays, allDayDates);
        // Allinea dateFrom alle stesse regole applicate dall'endpoint /v2/available-slots:
        // niente domeniche, niente giorni all-day, e (se attivo) niente giorno-dopo-all-day.
        let guard = 0;
        while (guard < 40) {
          const isSunday = earliest.weekday === 7;
          const isAllDay = allDayDates.has(earliest.toFormat("yyyy-MM-dd"));
          const isDayAfterAllDay =
            template.bloccaGiornoDopoEventoGiornataIntera === true &&
            allDayDates.has(earliest.minus({ days: 1 }).toFormat("yyyy-MM-dd"));
          if (!isSunday && !isAllDay && !isDayAfterAllDay) break;
          earliest = earliest.plus({ days: 1 });
          guard++;
        }
        dateFrom = earliest.toFormat("yyyy-MM-dd");
      } catch (err: any) {
        // dateFrom è solo un suggerimento per il picker: in caso di errore lo omettiamo,
        // l'endpoint /v2/available-slots applica comunque tutte le regole.
        console.warn(`[VisioneAutoInvite] dateFrom non calcolato per job ${job.id}: ${err.message}`);
        dateFrom = undefined;
      }
    }

    const consultationLink = buildConsultationLink({
      baseUrl,
      jobType: job.jobType,
      templateId: template.id,
      jobId: job.id,
      dateFrom,
    });

    const emailHTML = buildConsultationInviteEmailHTML({
      clienteNome: cliente.nome || "Cliente",
      templateNome: template.nome,
      nomeEvento: job.nomeEvento || "il tuo evento",
      consultationLink,
      studioInfo,
    });

    // Lock atomico: verifica + marca in un'unica transazione.
    // Controlla SIA il marker auto SIA un eventuale invio manuale concorrente (snapshot fresco),
    // così la dedup vs invio manuale non ha race tra la query iniziale e il lock.
    let locked = false;
    try {
      locked = await db.runTransaction(async (tx: any) => {
        const fresh = await tx.get(db.collection("jobs").doc(job.id));
        if (!fresh.exists) return false;
        const data = fresh.data() || {};
        if (data.visioneAutoInviteSentAt) return false;
        const freshEvents: any[] = Array.isArray(data.workflowEvents) ? data.workflowEvents : [];
        const manualSent = freshEvents.some(
          (e) => e?.tipo === "consulenza_inviata" && e?.metadata?.templateId === template.id
        );
        if (manualSent) return false;
        tx.update(db.collection("jobs").doc(job.id), {
          visioneAutoInviteSentAt: Timestamp.now(),
          visioneAutoInviteTemplateId: template.id,
        });
        return true;
      });
    } catch (err: any) {
      results.errors.push(`Job ${job.id}: lock ${err.message}`);
      continue;
    }
    if (!locked) { results.skipped++; continue; }

    // Invio email: SOLO un fallimento dell'invio giustifica il rollback del marker.
    try {
      await sendGmailEmail(
        cliente.email,
        `Prenota la tua ${template.nome}`,
        emailHTML,
        undefined,
        {
          type: "consultation_auto_invite",
          relatedDocId: job.id,
          relatedDocType: "job",
          clientName: cliente.nome,
        }
      );
    } catch (err: any) {
      // Email NON inviata → rollback marker per ritentare al prossimo giro
      try {
        await db.collection("jobs").doc(job.id).update({
          visioneAutoInviteSentAt: null,
          visioneAutoInviteTemplateId: null,
        });
      } catch (_) {}
      results.errors.push(`Job ${job.id}: invio ${err.message}`);
      console.error(`[VisioneAutoInvite] ❌ Invio fallito job ${job.id}:`, err.message);
      continue;
    }

    // Email INVIATA con successo: il marker NON va più annullato (evita doppi invii).
    results.sent++;
    console.log(`[VisioneAutoInvite] ✅ Inviato job ${job.id} → ${cliente.email}`);

    // Persistenza timeline best-effort: un errore qui NON deve causare un reinvio,
    // quindi viene solo loggato (il marker resta impostato).
    try {
      const timelineEvent = {
        id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        jobId: job.id,
        tipo: "consulenza_inviata",
        descrizione: `Consulenza "${template.nome}" inviata automaticamente via email`,
        data: Timestamp.now(),
        metadata: {
          templateId: template.id,
          templateNome: template.nome,
          channel: "email",
          consultationLink,
          auto: true,
        },
      };
      await db.collection("jobs").doc(job.id).update({
        workflowEvents: FieldValue.arrayUnion(timelineEvent),
        updatedAt: Timestamp.now(),
      });
      await db.collection("jobTimeline").add(timelineEvent);
    } catch (err: any) {
      results.errors.push(`Job ${job.id}: timeline ${err.message} (email già inviata)`);
      console.error(`[VisioneAutoInvite] ⚠️ Timeline non salvata job ${job.id} (email inviata):`, err.message);
    }
  }

  if (results.sent > 0 || results.errors.length > 0 || results.checked > 0) {
    console.log("[VisioneAutoInvite] Completato:", results);
  }
  return results;
}

/**
 * POST /api/reminders/send-all
 * Invia reminder email per tutti gli appuntamenti nelle prossime 20-28 ore
 * (booking + consulenze) — può essere chiamato manualmente dall'admin
 */
router.post("/send-all", authenticateFirebase, requireAdmin, async (req: any, res) => {
  try {
    const results = await runReminderCheck();
    res.json({ success: true, message: "Reminder process completed", timestamp: new Date().toISOString(), results });
  } catch (error: any) {
    console.error("[Reminders] ❌ Errore generale:", error.message);
    res.status(500).json({ success: false, error: error.message || "Errore invio reminder" });
  }
});


/**
 * GET /api/reminders/status
 * Mostra lo stato dei reminder: quanti appuntamenti sono in arrivo e quanti reminder sono stati inviati
 */
router.get("/status", authenticateFirebase, requireAdmin, async (req: any, res) => {
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
