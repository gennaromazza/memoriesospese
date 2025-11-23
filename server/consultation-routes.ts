/**
 * CONSULTATION API ROUTES - Express.js
 * Gestisce endpoint per modulo Consulenze (templates e prenotazioni)
 */

import express, { Request, Response } from "express";
import { z } from "zod";
import axios from "axios";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { DateTime } from "luxon";
import * as consultationService from "./services/consultations.js";
import { authenticateFirebase } from "./email-routes.js";
import {
  InsertConsultationTemplateSchema,
  UpdateConsultationTemplateSchema,
  InsertConsultationSchema,
  UpdateConsultationSchema,
  type ConsultationStatus,
} from "../shared/consultation-types.js";
import { db, Timestamp, FieldValue, storage } from "./firebase-admin.js";
import {
  createEvent,
  deleteEvent,
  createEuropeRomeDate,
} from "./google-calendar.js";
import multer from "multer";

const router = express.Router();

/**
 * ========================================
 * AUTH MIDDLEWARE
 * ========================================
 */

interface AuthRequest extends Request {
  user?: {
    uid: string;
    email: string;
  };
}

/**
 * Admin emails (consistente con email-routes.ts)
 */
const ADMIN_EMAILS = ["gennaro.mazzacane@gmail.com"];

/**
 * Helper: Normalizza Firestore Timestamp in Date
 * Gestisce: { seconds, nanoseconds }, .toDate(), ISO string, Date object
 */
function normalizeTimestampToDate(timestamp: any): Date {
  if (!timestamp) {
    throw new Error("Timestamp is null or undefined");
  }

  // Firestore Timestamp serializzato come { seconds, nanoseconds }
  if (typeof timestamp === "object" && "seconds" in timestamp) {
    return new Date(timestamp.seconds * 1000);
  }

  // Firestore Timestamp con metodo .toDate()
  if (typeof timestamp.toDate === "function") {
    return timestamp.toDate();
  }

  // ISO string o Date object
  return new Date(timestamp);
}

/**
 * Multer setup per upload immagini template
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB max per immagine
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Solo immagini JPEG, PNG o WebP sono consentite"));
    }
  },
});

/**
 * ========================================
 * TEMPLATE ENDPOINTS (Admin only)
 * ========================================
 */

/**
 * GET /api/consultations/templates
 * Ottiene tutti i template consulenze (admin)
 */
router.get(
  "/templates",
  authenticateFirebase,
  async (req: AuthRequest, res) => {
    try {
      const { email } = req.user!;
      if (!ADMIN_EMAILS.includes(email)) {
        return res
          .status(403)
          .json({
            error: "Solo gli amministratori possono accedere ai template",
          });
      }

      const templates = await consultationService.getAllTemplates();
      res.json(templates);
    } catch (error: any) {
      console.error("[GET /templates] Errore:", error.message);
      res.status(500).json({ error: "Errore recupero template" });
    }
  },
);

/**
 * GET /api/consultations/templates/:id
 * Ottiene template singolo per ID (pubblico per booking flow)
 */
router.get("/templates/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const template = await consultationService.getTemplateById(id);

    if (!template) {
      return res.status(404).json({ error: "Template non trovato" });
    }

    res.json(template);
  } catch (error: any) {
    console.error("[GET /templates/:id] Errore:", error.message);
    res.status(500).json({ error: "Errore recupero template" });
  }
});

/**
 * GET /api/consultations/templates/by-job-type/:jobType
 * Ottiene template attivi per tipo lavoro (pubblico)
 */
router.get("/templates/by-job-type/:jobType", async (req, res) => {
  try {
    const { jobType } = req.params;
    const templates =
      await consultationService.getActiveTemplatesByJobType(jobType);
    res.json(templates);
  } catch (error: any) {
    console.error("[GET /templates/by-job-type] Errore:", error.message);
    res.status(500).json({ error: "Errore recupero template" });
  }
});

/**
 * GET /api/consultations/job-types
 * Ottiene lista tipi lavoro con template attivi (pubblico)
 */
router.get("/job-types", async (req, res) => {
  try {
    const jobTypes = await consultationService.getJobTypesWithActiveTemplates();
    res.json(jobTypes);
  } catch (error: any) {
    console.error("[GET /job-types] Errore:", error.message);
    res.status(500).json({ error: "Errore recupero tipi lavoro" });
  }
});

/**
 * POST /api/consultations/templates
 * Crea nuovo template (admin only)
 */
router.post(
  "/templates",
  authenticateFirebase,
  async (req: AuthRequest, res) => {
    try {
      const { email } = req.user!;
      if (!ADMIN_EMAILS.includes(email)) {
        return res
          .status(403)
          .json({ error: "Solo gli amministratori possono creare template" });
      }

      // Validazione Zod
      const validatedData = InsertConsultationTemplateSchema.parse(req.body);

      const templateId =
        await consultationService.createTemplate(validatedData);

      res.status(201).json({
        id: templateId,
        message: "Template creato con successo",
      });
    } catch (error: any) {
      console.error("[POST /templates] Errore:", error.message);

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: "Dati non validi",
          details: error.errors,
        });
      }

      res.status(500).json({ error: "Errore creazione template" });
    }
  },
);

/**
 * PATCH /api/consultations/templates/:id
 * Aggiorna template esistente (admin only)
 */
router.patch(
  "/templates/:id",
  authenticateFirebase,
  async (req: AuthRequest, res) => {
    try {
      const { email } = req.user!;
      if (!ADMIN_EMAILS.includes(email)) {
        return res
          .status(403)
          .json({
            error: "Solo gli amministratori possono modificare template",
          });
      }

      const { id } = req.params;

      // Validazione Zod
      const validatedData = UpdateConsultationTemplateSchema.parse(req.body);

      await consultationService.updateTemplate(id, validatedData);

      res.json({ message: "Template aggiornato con successo" });
    } catch (error: any) {
      console.error("[PATCH /templates/:id] Errore:", error.message);

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: "Dati non validi",
          details: error.errors,
        });
      }

      if (error.message.includes("non trovato")) {
        return res.status(404).json({ error: error.message });
      }

      res.status(500).json({ error: "Errore aggiornamento template" });
    }
  },
);

/**
 * DELETE /api/consultations/templates/:id
 * Elimina template (admin only)
 */
router.delete(
  "/templates/:id",
  authenticateFirebase,
  async (req: AuthRequest, res) => {
    try {
      const { email } = req.user!;
      if (!ADMIN_EMAILS.includes(email)) {
        return res
          .status(403)
          .json({
            error: "Solo gli amministratori possono eliminare template",
          });
      }

      const { id } = req.params;

      await consultationService.deleteTemplate(id);

      res.json({ message: "Template eliminato con successo" });
    } catch (error: any) {
      console.error("[DELETE /templates/:id] Errore:", error.message);

      if (error.message.includes("consultations attive")) {
        return res.status(409).json({
          error: "Impossibile eliminare template con consultations attive",
        });
      }

      res.status(500).json({ error: "Errore eliminazione template" });
    }
  },
);

/**
 * ========================================
 * CONSULTATION ENDPOINTS
 * ========================================
 */

/**
 * GET /api/consultations
 * Ottiene tutte le consultations con filtri opzionali (admin)
 */
router.get("/", authenticateFirebase, async (req: AuthRequest, res) => {
  try {
    const { email } = req.user!;
    if (!ADMIN_EMAILS.includes(email)) {
      return res
        .status(403)
        .json({
          error: "Solo gli amministratori possono accedere alle consultations",
        });
    }

    const { stato, jobType, templateId, dateFrom, dateTo } = req.query;

    const filters: any = {};

    if (stato) {
      // Supporta sia singolo che multipli stati (comma-separated)
      filters.stato =
        typeof stato === "string"
          ? (stato.split(",") as ConsultationStatus[])
          : (stato as ConsultationStatus[]);
    }

    if (jobType) {
      filters.jobType = jobType as string;
    }

    if (templateId) {
      filters.templateId = templateId as string;
    }

    if (dateFrom) {
      filters.dateFrom = new Date(dateFrom as string);
    }

    if (dateTo) {
      filters.dateTo = new Date(dateTo as string);
    }

    const consultations =
      await consultationService.getAllConsultations(filters);
    res.json(consultations);
  } catch (error: any) {
    console.error("[GET /consultations] Errore:", error.message);
    res.status(500).json({ error: "Errore recupero consultations" });
  }
});

/**
 * GET /api/consultations/:id
 * Ottiene consultation singola per ID
 */
router.get("/:id", authenticateFirebase, async (req: AuthRequest, res) => {
  try {
    const { email } = req.user!;
    if (!ADMIN_EMAILS.includes(email)) {
      return res
        .status(403)
        .json({
          error: "Solo gli amministratori possono accedere alle consultations",
        });
    }

    const { id } = req.params;
    const consultation = await consultationService.getConsultationById(id);

    if (!consultation) {
      return res.status(404).json({ error: "Consultation non trovata" });
    }

    res.json(consultation);
  } catch (error: any) {
    console.error("[GET /consultations/:id] Errore:", error.message);
    res.status(500).json({ error: "Errore recupero consultation" });
  }
});

/**
 * POST /api/consultations/available-slots
 * Calcola slot disponibili per data e template
 * FIX: Ora controlla Google Calendar e usa Luxon per il fuso orario corretto
 */
router.post("/available-slots", async (req, res) => {
  try {
    console.log("[POST /available-slots] Request body:", req.body);
    const { date, templateId, clientEmail } = req.body;

    if (!date || !templateId) {
      return res.status(400).json({
        error: "Parametri mancanti (date, templateId richiesti)",
      });
    }

    // Recupera template
    const template = await consultationService.getTemplateById(templateId);

    if (!template) {
      return res.status(404).json({ error: "Template non trovato" });
    }

    if (!template.attiva) {
      return res.status(400).json({ error: "Template non attivo" });
    }

    // FIX TIMEZONE: Uso Luxon per definire la giornata in Europe/Rome
    // La stringa 'date' arriva come YYYY-MM-DD
    const dateObj = DateTime.fromISO(date, { zone: "Europe/Rome" });
    const dayStart = dateObj.startOf("day").toJSDate();
    const dayEnd = dateObj.endOf("day").toJSDate();

    // FIX GOOGLE CALENDAR: Recupera impegni reali
    console.log("[POST /available-slots] Recupero impegni Google Calendar...");
    const { checkFreeBusyAllCalendars } = await import("./google-calendar.js");
    const googleBusyPeriods = await checkFreeBusyAllCalendars(dayStart, dayEnd);

    console.log(
      `[POST /available-slots] Trovati ${googleBusyPeriods.length} impegni su GCal`,
    );

    // FIX: Passa googleBusyPeriods come quinto parametro (externalBusyPeriods)
    console.log(
      `[POST /available-slots] 📊 Passando ${googleBusyPeriods.length} busy periods da GCal al service`,
    );

    const slots = await consultationService.getAvailableSlotsForDate(
      dayStart,
      template.durataMinuti,
      undefined, // workingHours - usa template customWorkingHours se presente
      template, // passa template per excludedDays e customWorkingHours
      googleBusyPeriods, // 🔥 CRITICAL: Passa busy periods di Google Calendar come externalBusyPeriods
    );

    // 🎯 FEATURE: Aggiungi info consulenze in attesa per questo cliente
    if (clientEmail) {
      const dateObj = new Date(date);
      const startOfDay = new Date(dateObj);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(dateObj);
      endOfDay.setHours(23, 59, 59, 999);

      const pendingConsultations = await db
        .collection("consultations")
        .where("cliente.email", "==", clientEmail)
        .where("stato", "==", "in_attesa")
        .where("dataConsulenza", ">=", Timestamp.fromDate(startOfDay))
        .where("dataConsulenza", "<=", Timestamp.fromDate(endOfDay))
        .get();

      const pendingSlotsMap = new Map<string, boolean>();
      pendingConsultations.docs.forEach((doc) => {
        const data = doc.data();
        const key = `${data.orarioInizio}-${data.orarioFine}`;
        pendingSlotsMap.set(key, true);
      });

      slots.forEach((slot: any) => {
        const slotStart = new Date(slot.start);
        const slotEnd = new Date(slot.end);
        const startTime = format(slotStart, "HH:mm");
        const endTime = format(slotEnd, "HH:mm");
        const key = `${startTime}-${endTime}`;
        slot.hasPendingConsultation = pendingSlotsMap.has(key) || false;
      });
    }

    console.log("[POST /available-slots] Slot calcolati:", slots.length);
    res.json({ slots });
  } catch (error: any) {
    console.error("[POST /available-slots] Errore completo:", error);
    console.error("[POST /available-slots] Stack:", error.stack);
    res.status(500).json({ error: "Errore calcolo slot disponibili" });
  }
});

/**
 * POST /api/consultations/create
 * Crea nuova consultation (pubblico)
 */
router.post("/create", async (req, res) => {
  try {
    // Validazione base dati
    const {
      templateId,
      cliente,
      dataConsulenza,
      orarioInizio,
      orarioFine,
      jobDataCollected,
      note,
    } = req.body;

    // Validazione Zod (dataConsulenza coerced ISO string → Date in schema)
    const validatedData = InsertConsultationSchema.parse({
      templateId,
      cliente,
      dataConsulenza, // z.coerce.date() converts string → Date automatically
      orarioInizio,
      orarioFine,
      jobDataCollected: jobDataCollected || {},
      note: note || "",
    });

    // Recupera template
    const template = await consultationService.getTemplateById(templateId);

    if (!template) {
      return res.status(404).json({ error: "Template non trovato" });
    }

    if (!template.attiva) {
      return res.status(400).json({ error: "Template non attivo" });
    }

    // Validazione durata slot (deve matchare template durataMinuti)
    const [startH, startM] = validatedData.orarioInizio.split(":").map(Number);
    const [endH, endM] = validatedData.orarioFine.split(":").map(Number);

    const slotStartMinutes = startH * 60 + startM;
    const slotEndMinutes = endH * 60 + endM;
    const slotDuration = slotEndMinutes - slotStartMinutes;

    if (slotDuration !== template.durataMinuti) {
      return res.status(400).json({
        error: "Durata slot non valida",
        message: `Lo slot deve avere durata ${template.durataMinuti} minuti (ricevuto: ${slotDuration} minuti)`,
      });
    }

    // 🔥 FIX BUG 409 & TIMEZONE: Pre-carica GCal con fuso orario corretto
    console.log(
      "[POST /create] 🔍 Pre-caricamento Google Calendar busy periods...",
    );

    // Converti la data string/ISO in oggetto Luxon impostato su Roma
    const dateObj = DateTime.fromJSDate(
      new Date(validatedData.dataConsulenza),
    ).setZone("Europe/Rome");
    const dayStart = dateObj.startOf("day").toJSDate();
    const dayEnd = dateObj.endOf("day").toJSDate();

    const { checkFreeBusyAllCalendars } = await import("./google-calendar.js");
    const googleCalendarBusyPeriods = await checkFreeBusyAllCalendars(
      dayStart,
      dayEnd,
    );

    // Verifica disponibilità slot (conflict detection) con dati sincronizzati
    const isAvailable = await consultationService.isSlotAvailable(
      validatedData.dataConsulenza,
      validatedData.orarioInizio,
      validatedData.orarioFine,
      undefined, // excludeConsultationId
      googleCalendarBusyPeriods, // 🎯 Passa busy periods pre-caricati
    );

    if (!isAvailable) {
      console.error(
        `[POST /create] ❌ 409 CONFLICT - Slot ${validatedData.orarioInizio}-${validatedData.orarioFine} NON disponibile per ${format(validatedData.dataConsulenza, "yyyy-MM-dd")}`,
      );
      return res.status(409).json({
        error: "Slot non disponibile",
        message:
          "Lo slot selezionato non è più disponibile. Scegli un altro orario.",
      });
    }

    // Crea consultation
    // Note: validatedData has Date from z.coerce.date(), service layer expects Date
    const consultationId = await consultationService.createConsultation(
      validatedData as any, // Type assertion needed: InsertConsultation (string) vs validated (Date)
      template,
    );

    // Invia email conferma ricezione (task 13)
    let emailStatus = "sent";
    try {
      const {
        sendGmailEmail,
        getStudioContactInfo,
        createConsultationReceivedEmailHTML,
        createAdminNotificationEmailHTML,
      } = await import("./email-routes.js");
      const studioInfo = await getStudioContactInfo();

      const clienteName = `${validatedData.cliente.nome} ${validatedData.cliente.cognome}`;
      const formattedDate = validatedData.dataConsulenza.toLocaleDateString(
        "it-IT",
        {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
          timeZone: "Europe/Rome",
        },
      );

      // 1. Email cliente
      const htmlContent = createConsultationReceivedEmailHTML(
        clienteName,
        template.jobType,
        formattedDate,
        `${validatedData.orarioInizio} - ${validatedData.orarioFine}`,
        studioInfo,
      );

      await sendGmailEmail(
        validatedData.cliente.email,
        `Richiesta Consulenza Ricevuta - ${template.jobType}`,
        htmlContent,
      );

      console.log(
        `✅ Email "Consulenza Ricevuta" inviata a ${validatedData.cliente.email}`,
      );

      // 2. Email notifica admin (nuova richiesta consulenza)
      try {
        const adminEmail = studioInfo.email; // Email admin dallo studio
        const adminEmailHTML = createAdminNotificationEmailHTML(
          clienteName,
          validatedData.cliente.email,
          validatedData.cliente.whatsapp,
          template.jobType,
          formattedDate,
          `${validatedData.orarioInizio} - ${validatedData.orarioFine}`,
          undefined, // productName (non applicabile per consulenze)
          validatedData.note,
          studioInfo,
        );

        await sendGmailEmail(
          adminEmail,
          `Nuova Richiesta Consulenza - ${template.jobType}`,
          adminEmailHTML,
        );

        console.log(
          `✅ Email notifica admin consulenza inviata a ${adminEmail}`,
        );
      } catch (adminEmailError) {
        console.error(
          "⚠️ Errore invio email notifica admin consulenza:",
          adminEmailError,
        );
        // Non bloccare la creazione se email admin fallisce
      }
    } catch (emailError: any) {
      console.error(
        "⚠️ Errore invio email consulenza ricevuta:",
        emailError.message,
      );
      emailStatus = "failed";
    }

    res.status(201).json({
      id: consultationId,
      message: "Consultation creata con successo",
      emailStatus,
    });
  } catch (error: any) {
    console.error("[POST /create] Errore:", error.message);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Dati non validi",
        details: error.errors,
      });
    }

    res.status(500).json({ error: "Errore creazione consultation" });
  }
});

/**
 * PATCH /api/consultations/:id/approve
 * Approva consultation e crea evento Google Calendar (admin only)
 */
router.patch(
  "/:id/approve",
  authenticateFirebase,
  async (req: AuthRequest, res) => {
    try {
      const { email } = req.user!;
      if (!ADMIN_EMAILS.includes(email)) {
        return res
          .status(403)
          .json({
            error: "Solo gli amministratori possono approvare consultations",
          });
      }

      const { id } = req.params;

      const consultation = await consultationService.getConsultationById(id);

      if (!consultation) {
        return res.status(404).json({ error: "Consultation non trovata" });
      }

      if (consultation.stato !== "in_attesa") {
        return res.status(400).json({
          error: "Consultation già processata",
          stato: consultation.stato,
        });
      }

      // Crea evento Google Calendar con timezone Europe/Rome corretto
      const consultationDate = normalizeTimestampToDate(
        consultation.dataConsulenza,
      );

      // --- FIX: CHECK CONFLITTI LAST-MINUTE ---
      const { checkFreeBusyAllCalendars } = await import(
        "./google-calendar.js"
      );

      // Calcola inizio/fine slot esatti
      const year = consultationDate.getFullYear();
      const month = String(consultationDate.getMonth() + 1).padStart(2, "0");
      const day = String(consultationDate.getDate()).padStart(2, "0");
      const dateStr = `${year}-${month}-${day}`;

      const startDateTime = createEuropeRomeDate(
        dateStr,
        consultation.orarioInizio,
      );
      const endDateTime = createEuropeRomeDate(
        dateStr,
        consultation.orarioFine,
      );

      // Controlla se GCal è ancora libero
      const busyResult = await checkFreeBusyAllCalendars(
        startDateTime,
        endDateTime,
      );
      if (busyResult && busyResult.length > 0) {
        // C'è un conflitto!
        return res.status(409).json({
          error: "Slot non più disponibile",
          message:
            "Attenzione: È stato rilevato un nuovo impegno su Google Calendar che si sovrappone a questa richiesta. Impossibile approvare.",
        });
      }
      // ----------------------------------------

      const calendarEvent = await createEvent("primary", {
        summary: `Consulenza ${consultation.jobType} - ${consultation.cliente.nome} ${consultation.cliente.cognome}`,
        description: `Template: ${consultation.jobType}\nCliente: ${consultation.cliente.nome} ${consultation.cliente.cognome}\nEmail: ${consultation.cliente.email}\nWhatsApp: ${consultation.cliente.whatsapp}\nNote: ${consultation.note || "Nessuna"}`,
        start: startDateTime,
        end: endDateTime,
        attendees: [consultation.cliente.email],
      });

      const eventId = calendarEvent.id;

      // Aggiorna consultation con compensating transaction (rollback Calendar su errore)
      try {
        // Prepara updates (ometti googleCalendarEventId se null/undefined)
        const consultationUpdates: any = {
          stato: "confermata",
        };
        if (eventId) {
          consultationUpdates.googleCalendarEventId = eventId;
        }

        await consultationService.updateConsultation(id, consultationUpdates);

        // Aggiorna metadata conferma
        await db
          .collection("consultations")
          .doc(id)
          .update({
            confermataDa: req.body.userId || "admin", // TODO: Auth middleware
            confermatail: Timestamp.now(),
          });
      } catch (updateError: any) {
        // Rollback completo: elimina evento Calendar E revert consultation a stato in_attesa
        console.error(
          "[approve] Errore update Firestore, eseguo rollback completo:",
          updateError.message,
        );
        try {
          // Step 1: Elimina evento Google Calendar appena creato
          if (eventId) {
            await deleteEvent("primary", eventId);
            console.log(
              `[approve] Rollback step 1 - evento Calendar ${eventId} eliminato`,
            );
          }

          // Step 2: Revert consultation a stato in_attesa (annulla updateConsultation)
          await consultationService.updateConsultation(id, {
            stato: "in_attesa",
          });

          // Step 3: Clear googleCalendarEventId usando FieldValue.delete()
          await db.collection("consultations").doc(id).update({
            googleCalendarEventId: FieldValue.delete(),
          });
          console.log(
            `[approve] Rollback step 2-3 - consultation ${id} ripristinata a stato in_attesa`,
          );
        } catch (rollbackError: any) {
          console.error(
            "[approve] ERRORE CRITICO: Fallito rollback completo",
            rollbackError.message,
          );
        }

        return res.status(500).json({
          error: "Errore approvazione",
          message:
            "Impossibile salvare la conferma. L'evento Calendar è stato cancellato e la consultation è stata ripristinata.",
        });
      }

      // Invia email conferma (task 13)
      let emailStatus = "sent";
      try {
        const {
          sendGmailEmail,
          getStudioContactInfo,
          createConsultationApprovedEmailHTML,
          generateGoogleCalendarLink,
        } = await import("./email-routes.js");
        const studioInfo = await getStudioContactInfo();

        const clienteName = `${consultation.cliente.nome} ${consultation.cliente.cognome}`;
        const formattedDate = consultationDate.toLocaleDateString("it-IT", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
          timeZone: "Europe/Rome",
        });

        // Generate Google Calendar "Add to Calendar" link
        const calendarLink = generateGoogleCalendarLink({
          title: `Consulenza ${consultation.jobType} - ${clienteName}`,
          description: `Consulenza per ${consultation.jobType}\nCliente: ${clienteName}\n\n${studioInfo.name}\nTel: ${studioInfo.phone}`,
          location: studioInfo.address,
          startDate: startDateTime,
          endDate: endDateTime,
          isAllDay: false,
        });

        const htmlContent = createConsultationApprovedEmailHTML(
          clienteName,
          consultation.jobType,
          formattedDate,
          `${consultation.orarioInizio} - ${consultation.orarioFine}`,
          null, // meetingLink
          studioInfo,
          calendarLink,
        );

        await sendGmailEmail(
          consultation.cliente.email,
          `Consulenza Confermata - ${consultation.jobType}`,
          htmlContent,
        );

        console.log(
          `✅ Email "Consulenza Approvata" inviata a ${consultation.cliente.email}`,
        );
      } catch (emailError: any) {
        console.error(
          "⚠️ Errore invio email consulenza approvata:",
          emailError.message,
        );
        emailStatus = "failed";
      }

      res.json({
        message: "Consultation approvata con successo",
        googleCalendarEventId: eventId,
        emailStatus,
      });
    } catch (error: any) {
      console.error("[PATCH /:id/approve] Errore:", error.message);
      res.status(500).json({ error: "Errore approvazione consultation" });
    }
  },
);

/**
 * PATCH /api/consultations/:id/reject
 * Rifiuta consultation (admin only)
 */
router.patch(
  "/:id/reject",
  authenticateFirebase,
  async (req: AuthRequest, res) => {
    try {
      const { email } = req.user!;
      if (!ADMIN_EMAILS.includes(email)) {
        return res
          .status(403)
          .json({
            error: "Solo gli amministratori possono rifiutare consultations",
          });
      }

      const { id } = req.params;
      const { motivo } = req.body;

      const consultation = await consultationService.getConsultationById(id);

      if (!consultation) {
        return res.status(404).json({ error: "Consultation non trovata" });
      }

      if (consultation.stato !== "in_attesa") {
        return res.status(400).json({
          error: "Consultation già processata",
          stato: consultation.stato,
        });
      }

      // Elimina evento Google Calendar se presente (BUGFIX: libera lo slot!)
      if (consultation.googleCalendarEventId) {
        try {
          const { deleteEvent } = await import("./calendar-routes.js"); // NOTE: This import might be incorrect, assuming it should be './google-calendar.js'
          await deleteEvent("primary", consultation.googleCalendarEventId);
          console.log(
            `📅 Evento Google Calendar ${consultation.googleCalendarEventId} eliminato (consulenza rifiutata)`,
          );
        } catch (calError: any) {
          console.warn(
            "[REJECT] Errore eliminazione evento Calendar:",
            calError.message,
          );
          // Continua comunque con rifiuto consultation
        }
      }

      // Aggiorna stato
      await consultationService.updateConsultation(id, {
        stato: "annullata",
        note:
          consultation.note +
          `\n[RIFIUTATA] ${motivo || "Nessun motivo specificato"}`,
      });

      // Invia email rifiuto (task 13)
      let emailStatus = "sent";
      try {
        const {
          sendGmailEmail,
          getStudioContactInfo,
          createConsultationRejectedEmailHTML,
        } = await import("./email-routes.js");
        const studioInfo = await getStudioContactInfo();

        const clienteName = `${consultation.cliente.nome} ${consultation.cliente.cognome}`;
        const rawDate = normalizeTimestampToDate(consultation.dataConsulenza);
        const formattedDate = rawDate.toLocaleDateString("it-IT", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
          timeZone: "Europe/Rome",
        });

        const htmlContent = createConsultationRejectedEmailHTML(
          clienteName,
          consultation.jobType,
          formattedDate,
          `${consultation.orarioInizio} - ${consultation.orarioFine}`,
          motivo || null,
          studioInfo,
        );

        await sendGmailEmail(
          consultation.cliente.email,
          `Aggiornamento Consulenza - ${consultation.jobType}`,
          htmlContent,
        );

        console.log(
          `✅ Email "Consulenza Rifiutata" inviata a ${consultation.cliente.email}`,
        );
      } catch (emailError: any) {
        console.error(
          "⚠️ Errore invio email consulenza rifiutata:",
          emailError.message,
        );
        emailStatus = "failed";
      }

      res.json({
        message: "Consultation rifiutata con successo",
        emailStatus,
      });
    } catch (error: any) {
      console.error("[PATCH /:id/reject] Errore:", error.message);
      res.status(500).json({ error: "Errore rifiuto consultation" });
    }
  },
);

/**
 * PATCH /api/consultations/:id/complete
 * Marca consultation come completata (admin only)
 */
router.patch(
  "/:id/complete",
  authenticateFirebase,
  async (req: AuthRequest, res) => {
    try {
      const { email } = req.user!;
      if (!ADMIN_EMAILS.includes(email)) {
        return res
          .status(403)
          .json({
            error: "Solo gli amministratori possono completare consultations",
          });
      }

      const { id } = req.params;

      const consultation = await consultationService.getConsultationById(id);

      if (!consultation) {
        return res.status(404).json({ error: "Consultation non trovata" });
      }

      if (consultation.stato !== "confermata") {
        return res.status(400).json({
          error: "Solo consultations confermate possono essere completate",
        });
      }

      await consultationService.updateConsultation(id, {
        stato: "completata",
      });

      res.json({ message: "Consultation completata con successo" });
    } catch (error: any) {
      console.error("[PATCH /:id/complete] Errore:", error.message);
      res.status(500).json({ error: "Errore completamento consultation" });
    }
  },
);

/**
 * POST /api/consultations/:id/convert-to-job
 * Converte consultation in job (admin only)
 */
router.post(
  "/:id/convert-to-job",
  authenticateFirebase,
  async (req: AuthRequest, res) => {
    try {
      const { email } = req.user!;
      if (!ADMIN_EMAILS.includes(email)) {
        return res
          .status(403)
          .json({
            error:
              "Solo gli amministratori possono convertire consultations in job",
          });
      }

      const { id } = req.params;

      const consultation = await consultationService.getConsultationById(id);

      if (!consultation) {
        return res.status(404).json({ error: "Consultation non trovata" });
      }

      if (consultation.jobCreated) {
        return res.status(400).json({
          error: "Consultation già convertita in job",
          jobId: consultation.jobId,
        });
      }

      // Campi standard mappabili consultation → job
      const STANDARD_FIELD_KEYS = [
        "eventDate",
        "eventLocation",
        "rituLocation",
        "rituTime",
        "startTime",
        "endTime",
        "allDay",
      ];

      // Mappa campi standard da jobDataCollected
      const eventDate = consultation.jobDataCollected.eventDate
        ? new Date(consultation.jobDataCollected.eventDate as string)
        : (() => {
            // Fallback: data consulenza + 3 mesi
            const estimatedDate = normalizeTimestampToDate(
              consultation.dataConsulenza,
            );
            estimatedDate.setMonth(estimatedDate.getMonth() + 3);
            return estimatedDate;
          })();

      const allDay = !consultation.jobDataCollected.startTime;

      // Costruisci noteInterne solo con campi EXTRA (non mappati)
      const extraFields: Record<string, any> = {};
      for (const [key, value] of Object.entries(
        consultation.jobDataCollected || {},
      )) {
        if (!STANDARD_FIELD_KEYS.includes(key)) {
          extraFields[key] = value;
        }
      }

      const noteParts = [`Creato da consulenza #${id}`];
      if (Object.keys(extraFields).length > 0) {
        noteParts.push(
          `\nDati aggiuntivi raccolti durante consulenza:\n${JSON.stringify(extraFields, null, 2)}`,
        );
      }
      if (consultation.note) {
        noteParts.push(`\nNote consulenza:\n${consultation.note}`);
      }

      // Prepara dati job da consultation
      const jobData: any = {
        nomeEvento: `${consultation.jobType} - ${consultation.cliente.nome} ${consultation.cliente.cognome}`,
        clientiIds: consultation.clienteId ? [consultation.clienteId] : [],
        jobType: consultation.jobType,
        provenance: "consulenza",
        eventDate,
        allDay,
        startTime:
          (consultation.jobDataCollected.startTime as string) || undefined,
        endTime: (consultation.jobDataCollected.endTime as string) || undefined,
        eventLocation:
          (consultation.jobDataCollected.eventLocation as string) || undefined,
        rituLocation:
          (consultation.jobDataCollected.rituLocation as string) || undefined,
        rituTime:
          (consultation.jobDataCollected.rituTime as string) || undefined,
        noteInterne: noteParts.join("\n"),
      };

      // Crea job (riutilizza logica jobs esistente)
      const jobRef = await db.collection("jobs").add({
        ...jobData,
        consultationId: id, // Riferimento bidirezionale per cleanup
        status: "lead",
        financials: {


/**
 * POST /api/consultations/v2/create
 * Create consultation using Calendar Engine V2 (NO LEGACY LOGIC)
 * 
 * Flow:
 * 1. Load template
 * 2. Validate template via adapter
 * 3. Generate AvailabilityConfig
 * 4. Get existing events via Calendar Engine
 * 5. Check conflicts via Calendar Engine
 * 6. Create consultation in Firestore
 * 7. Send confirmation email
 * 8. Return success
 */
router.post("/v2/create", async (req, res) => {
  try {
    const {
      templateId,
      cliente,
      dataConsulenza,
      orarioInizio,
      orarioFine,
      jobDataCollected,
      note,
    } = req.body;

    // Step 1: Validate input
    const validatedData = InsertConsultationSchema.parse({
      templateId,
      cliente,
      dataConsulenza,
      orarioInizio,
      orarioFine,
      jobDataCollected: jobDataCollected || {},
      note: note || "",
    });

    // Step 2: Load template
    const template = await consultationService.getTemplateById(templateId);

    if (!template) {
      return res.status(404).json({ error: "Template non trovato" });
    }

    if (!template.attiva) {
      return res.status(400).json({ error: "Template non attivo" });
    }

    // Step 3: Validate template via adapter
    const { consultationTemplateToAvailabilityConfig, validateConsultationTemplate } = await import('./consultations/calendar-adapter.js');

    if (!validateConsultationTemplate(template)) {
      return res.status(400).json({
        error: "Template configurazione invalida",
        message: "Template manca di customWorkingHours o durataMinuti"
      });
    }

    // Step 4: Generate AvailabilityConfig
    const config = consultationTemplateToAvailabilityConfig(template);

    // Step 5: Parse date and time in Europe/Rome timezone
    const { DateTime } = await import('luxon');
    const dateObj = DateTime.fromISO(dataConsulenza, { zone: "Europe/Rome" });
    const slotStart = DateTime.fromISO(`${dataConsulenza}T${orarioInizio}:00`, { zone: "Europe/Rome" }).toJSDate();
    const slotEnd = DateTime.fromISO(`${dataConsulenza}T${orarioFine}:00`, { zone: "Europe/Rome" }).toJSDate();

    // Step 6: Get existing events via Calendar Engine V2
    const { checkGoogleCalendarBusyPeriods } = await import('./calendar-engine/google-sync.js');
    const { hasConflict } = await import('./calendar-engine/conflicts.js');
    const { CalendarEvent } = await import('../shared/calendar-types.js');

    const dayStart = dateObj.startOf("day").toJSDate();
    const dayEnd = dateObj.endOf("day").toJSDate();

    const existingEvents: any[] = [];

    // 6a. Google Calendar busy periods
    const googleBusy = await checkGoogleCalendarBusyPeriods(dayStart, dayEnd);
    existingEvents.push(...googleBusy);

    // 6b. Existing consultations
    const consultationsSnap = await db
      .collection("consultations")
      .where("dataConsulenza", ">=", Timestamp.fromDate(dayStart))
      .where("dataConsulenza", "<=", Timestamp.fromDate(dayEnd))
      .where("stato", "in", ["in_attesa", "confermata"])
      .get();

    for (const doc of consultationsSnap.docs) {
      const data = doc.data();
      const consultationDate = data.dataConsulenza.toDate();
      const year = consultationDate.getFullYear();
      const month = String(consultationDate.getMonth() + 1).padStart(2, '0');
      const day = String(consultationDate.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      const { createEuropeRomeDate } = await import('./google-calendar.js');
      const start = createEuropeRomeDate(dateStr, data.orarioInizio);
      const end = createEuropeRomeDate(dateStr, data.orarioFine);

      existingEvents.push({
        start,
        end,
        allDay: false,
        title: `Consultation ${data.cliente?.nome || ''}`,
        source: 'consultation'
      });
    }

    // 6c. Jobs (blocking statuses only)
    const jobsSnap = await db
      .collection("jobs")
      .where("eventDate", ">=", Timestamp.fromDate(dayStart))
      .where("eventDate", "<=", Timestamp.fromDate(dayEnd))
      .get();

    const blockingStatuses = ['confermato', 'shooting_fatto', 'selezione_pending', 'produzione'];

    for (const doc of jobsSnap.docs) {
      const data = doc.data();

      if (!blockingStatuses.includes(data.stato)) {
        continue;
      }

      const eventDate = data.eventDate.toDate();

      if (data.allDay) {
        const start = new Date(eventDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(eventDate);
        end.setHours(23, 59, 59, 999);

        existingEvents.push({
          start,
          end,
          allDay: true,
          title: `Job ${data.nomeEvento || ''}`,
          source: 'job'
        });
      } else if (data.startTime && data.endTime) {
        const year = eventDate.getFullYear();
        const month = String(eventDate.getMonth() + 1).padStart(2, '0');
        const day = String(eventDate.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        const { createEuropeRomeDate } = await import('./google-calendar.js');
        const start = createEuropeRomeDate(dateStr, data.startTime);
        const end = createEuropeRomeDate(dateStr, data.endTime);

        existingEvents.push({
          start,
          end,
          allDay: false,
          title: `Job ${data.nomeEvento || ''}`,
          source: 'job'
        });
      }
    }

    // Step 7: Check conflicts via Calendar Engine V2
    const conflict = hasConflict(slotStart, slotEnd, existingEvents);

    if (conflict) {
      console.error(`[POST /v2/create] ❌ CONFLICT - Slot ${orarioInizio}-${orarioFine} blocked by ${conflict.source}`);
      return res.status(409).json({
        error: "Slot non disponibile",
        message: "Lo slot selezionato non è più disponibile. Scegli un altro orario.",
        conflictSource: conflict.source
      });
    }

    // Step 8: Create consultation
    const consultationId = await consultationService.createConsultation(
      validatedData as any,
      template
    );

    // Step 9: Send confirmation email
    let emailStatus = "sent";
    try {
      const {
        sendGmailEmail,
        getStudioContactInfo,
        createConsultationReceivedEmailHTML,
        createAdminNotificationEmailHTML,
      } = await import("./email-routes.js");
      const studioInfo = await getStudioContactInfo();

      const clienteName = `${validatedData.cliente.nome} ${validatedData.cliente.cognome}`;
      const consultationDateObj = new Date(validatedData.dataConsulenza);
      const formattedDate = consultationDateObj.toLocaleDateString("it-IT", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "Europe/Rome",
      });

      const htmlContent = createConsultationReceivedEmailHTML(
        clienteName,
        template.jobType,
        formattedDate,
        `${validatedData.orarioInizio} - ${validatedData.orarioFine}`,
        studioInfo,
      );

      await sendGmailEmail(
        validatedData.cliente.email,
        `Richiesta Consulenza Ricevuta - ${template.jobType}`,
        htmlContent,
      );

      console.log(`✅ Email "Consulenza Ricevuta" inviata a ${validatedData.cliente.email}`);

      // Admin notification email
      try {
        const adminEmail = studioInfo.email;
        const adminEmailHTML = createAdminNotificationEmailHTML(
          clienteName,
          validatedData.cliente.email,
          validatedData.cliente.whatsapp,
          template.jobType,
          formattedDate,
          `${validatedData.orarioInizio} - ${validatedData.orarioFine}`,
          undefined,
          validatedData.note,
          studioInfo,
        );

        await sendGmailEmail(
          adminEmail,
          `Nuova Richiesta Consulenza - ${template.jobType}`,
          adminEmailHTML,
        );

        console.log(`✅ Email notifica admin consulenza inviata a ${adminEmail}`);
      } catch (adminEmailError) {
        console.error("⚠️ Errore invio email notifica admin consulenza:", adminEmailError);
      }
    } catch (emailError: any) {
      console.error("⚠️ Errore invio email consulenza ricevuta:", emailError.message);
      emailStatus = "failed";
    }

    // Step 10: Return success
    res.status(201).json({
      id: consultationId,
      message: "Consultation creata con successo",
      emailStatus,
    });
  } catch (error: any) {
    console.error("[POST /v2/create] Errore:", error.message);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Dati non validi",
        details: error.errors,
      });
    }

    res.status(500).json({ error: "Errore creazione consultation" });
  }
});

          totalePreventivato: 0,
          totaleOrdini: 0,
          totalePagato: 0,
          saldoResiduo: 0,
        },
        pdfs: [],
        costi: [],
        orderIds: [],
        galleryIds: [],
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        createdBy: req.body.userId || "admin", // TODO: Auth middleware
        jobSource: "consultation",
      });

      // Aggiorna consultation con job ID
      await consultationService.updateConsultation(id, {
        jobCreated: true,
        jobId: jobRef.id,
      });

      res.json({
        message: "Consultation convertita in job con successo",
        jobId: jobRef.id,
      });
    } catch (error: any) {
      console.error("[POST /:id/convert-to-job] Errore:", error.message);
      res.status(500).json({ error: "Errore conversione consultation in job" });
    }
  },
);

/**
 * DELETE /api/consultations/:id
 * Elimina consultation (admin può eliminare in qualsiasi stato)
 * Se confermata, invia email di cancellazione al cliente
 *
 * Query params opzionali:
 * - cancellationReason: motivo della cancellazione (mostrato in email)
 */
router.delete("/:id", authenticateFirebase, async (req: AuthRequest, res) => {
  try {
    const { email } = req.user!;
    if (!ADMIN_EMAILS.includes(email)) {
      return res
        .status(403)
        .json({
          error: "Solo gli amministratori possono eliminare consultations",
        });
    }

    const { id } = req.params;
    const { cancellationReason } = req.query;

    const consultation = await consultationService.getConsultationById(id);

    if (!consultation) {
      return res.status(404).json({ error: "Consultation non trovata" });
    }

    // Se consultation confermata, invia email di cancellazione al cliente
    if (consultation.stato === "confermata") {
      try {
        // Recupera template per nome jobType
        const template = await consultationService.getTemplateById(
          consultation.templateId,
        );

        // Formatta data e orario per email
        let dataConsulenza: Date;
        if (
          consultation.dataConsulenza &&
          typeof consultation.dataConsulenza === "object" &&
          "seconds" in consultation.dataConsulenza
        ) {
          dataConsulenza = new Date(
            (consultation.dataConsulenza as any).seconds * 1000,
          );
        } else {
          dataConsulenza = new Date(consultation.dataConsulenza as any);
        }

        const consultationDate = format(dataConsulenza, "dd MMMM yyyy", {
          locale: it,
        });
        const consultationTime = `${consultation.orarioInizio} - ${consultation.orarioFine}`;

        // Invia email cancellazione (fire-and-forget, non blocca eliminazione)
        axios
          .post(
            `${process.env.BASE_URL || "http://localhost:5000"}/api/email/send-consultation-cancelled`,
            {
              recipientEmail: consultation.cliente.email,
              clienteName: `${consultation.cliente.nome} ${consultation.cliente.cognome}`,
              jobType: template?.nome || "Consulenza",
              consultationDate,
              consultationTime,
              cancellationReason: cancellationReason || null,
            },
          )
          .catch((emailError) => {
            console.warn(
              "[DELETE] Errore invio email cancellazione (non bloccante):",
              emailError.message,
            );
          });

        console.log(
          `📧 Email cancellazione inviata a ${consultation.cliente.email}`,
        );
      } catch (emailError: any) {
        console.warn(
          "[DELETE] Errore preparazione email cancellazione:",
          emailError.message,
        );
        // Continua comunque con eliminazione
      }
    }

    // Elimina evento Google Calendar se presente
    if (consultation.googleCalendarEventId) {
      try {
        await deleteEvent("primary", consultation.googleCalendarEventId);
        console.log(
          `📅 Evento Google Calendar ${consultation.googleCalendarEventId} eliminato`,
        );
      } catch (calError: any) {
        console.warn(
          "[DELETE] Errore eliminazione evento Calendar:",
          calError.message,
        );
        // Continua comunque con eliminazione consultation
      }
    }

    // FIX #1: Cleanup riferimento bidirezionale job → consultation
    if (consultation.jobCreated && consultation.jobId) {
      try {
        const jobRef = db.collection("jobs").doc(consultation.jobId);
        const jobSnap = await jobRef.get();

        if (jobSnap.exists) {
          // Rimuovi consultationId dal job
          await jobRef.update({
            consultationId: FieldValue.delete(),
            updatedAt: Timestamp.now(),
          });
          console.log(
            `✅ Riferimento consultationId rimosso dal job ${consultation.jobId}`,
          );
        } else {
          console.warn(`⚠️ Job ${consultation.jobId} non trovato per cleanup`);
        }
      } catch (jobError: any) {
        console.warn(
          "[DELETE] Errore cleanup job reference:",
          jobError.message,
        );
        // Continua comunque con eliminazione consultation
      }
    }

    // Elimina consultation da Firestore
    await consultationService.deleteConsultation(id);

    res.json({
      message: "Consultation eliminata con successo",
      emailSent: consultation.stato === "confermata",
    });
  } catch (error: any) {
    console.error("[DELETE /:id] Errore:", error.message);
    res.status(500).json({ error: "Errore eliminazione consultation" });
  }
});

/**
 * PATCH /api/consultations/:id/mark-viewed
 * Marca consultation come visualizzata da admin
 */
router.patch(
  "/:id/mark-viewed",
  authenticateFirebase,
  async (req: AuthRequest, res) => {
    try {
      const { email } = req.user!;
      if (!ADMIN_EMAILS.includes(email)) {
        return res
          .status(403)
          .json({
            error:
              "Solo gli amministratori possono marcare consultations come visualizzate",
          });
      }

      const { id } = req.params;

      const consultation = await consultationService.getConsultationById(id);

      if (!consultation) {
        return res.status(404).json({ error: "Consultation non trovata" });
      }

      if (!consultation.dataVisualizzazione) {
        await db.collection("consultations").doc(id).update({
          dataVisualizzazione: Timestamp.now(),
        });
      }

      res.json({ message: "Consultation marcata come visualizzata" });
    } catch (error: any) {
      console.error("[PATCH /:id/mark-viewed] Errore:", error.message);
      res.status(500).json({ error: "Errore aggiornamento consultation" });
    }
  },
);

/**
 * ========================================
 * TEMPLATE MIGRATION ENDPOINTS
 * ========================================
 */

/**
 * GET /api/consultations/audit-working-hours
 * Audit endpoint: conta quanti template hanno customWorkingHours vs quanti usano default (admin only)
 */
router.get(
  "/audit-working-hours",
  authenticateFirebase,
  async (req: AuthRequest, res) => {
    try {
      const { email } = req.user!;
      if (!ADMIN_EMAILS.includes(email)) {
        return res
          .status(403)
          .json({ error: "Solo gli amministratori possono eseguire audit" });
      }

      console.log("[AUDIT] Inizio audit customWorkingHours");

      const report = await consultationService.auditTemplateWorkingHours();

      console.log(
        `[AUDIT] Completato - Total: ${report.total}, With custom: ${report.withCustomHours}, Without: ${report.withoutCustomHours}`,
      );

      res.json({
        success: true,
        message: `Audit completato - ${report.total} template analizzati`,
        report,
      });
    } catch (error: any) {
      console.error("[GET /audit-working-hours] Errore:", error.message);
      res.status(500).json({ error: "Errore audit template" });
    }
  },
);

/**
 * PATCH /api/consultations/migrate-initialize-working-hours
 * Migration endpoint: inizializza customWorkingHours per template legacy + sincronizza excludedDays (admin only)
 * Query params: dryRun=true (test senza modifiche), syncAll=true (sincronizza excludedDays per TUTTI i template)
 */
router.patch(
  "/migrate-initialize-working-hours",
  authenticateFirebase,
  async (req: AuthRequest, res) => {
    try {
      const { email } = req.user!;
      if (!ADMIN_EMAILS.includes(email)) {
        return res
          .status(403)
          .json({
            error: "Solo gli amministratori possono eseguire migrazioni",
          });
      }

      const dryRun = req.query.dryRun === "true";
      const syncAll = req.query.syncAll === "true";

      console.log(
        `[MIGRATE] Inizio inizializzazione customWorkingHours - dryRun: ${dryRun}, syncAll: ${syncAll}`,
      );

      const report = await consultationService.migrateInitializeWorkingHours({
        dryRun,
        syncAll,
      });

      console.log(
        `[MIGRATE] Completato - Initialized: ${report.initialized}, Synced: ${report.syncedOnly}, Skipped: ${report.skipped}`,
      );

      res.json({
        success: true,
        dryRun,
        syncAll,
        message: dryRun
          ? "Dry-run completato - nessuna modifica applicata"
          : `Migrazione completata - ${report.initialized} inizializzati, ${report.syncedOnly} sincronizzati`,
        report,
      });
    } catch (error: any) {
      console.error(
        "[PATCH /migrate-initialize-working-hours] Errore:",
        error.message,
      );
      res.status(500).json({ error: "Errore migrazione template" });
    }
  },
);

/**
 * PATCH /api/consultations/migrate-saturday-hours
 * Migration endpoint: aggiorna customWorkingHours per abilitare sabato (admin only)
 * Query params: dryRun=true (test senza modifiche), force=true (aggiorna anche template con sabato escluso)
 */
router.patch(
  "/migrate-saturday-hours",
  authenticateFirebase,
  async (req: AuthRequest, res) => {
    try {
      const { email } = req.user!;
      if (!ADMIN_EMAILS.includes(email)) {
        return res
          .status(403)
          .json({
            error: "Solo gli amministratori possono eseguire migrazioni",
          });
      }

      const dryRun = req.query.dryRun === "true";
      const force = req.query.force === "true";

      console.log(
        `[MIGRATE] Inizio migrazione sabato - dryRun: ${dryRun}, force: ${force}`,
      );

      const report = await consultationService.migrateSaturdayHours({
        dryRun,
        force,
      });

      console.log(
        `[MIGRATE] Completato - Updated: ${report.updated}, Skipped: ${report.skipped}, Excluded: ${report.excluded}, Missing: ${report.missingSaturday}`,
      );

      res.json({
        success: true,
        dryRun,
        message: dryRun
          ? "Dry-run completato - nessuna modifica applicata"
          : `Migrazione completata - ${report.updated} template aggiornati`,
        report,
      });
    } catch (error: any) {
      console.error("[PATCH /migrate-saturday-hours] Errore:", error.message);
      res.status(500).json({ error: "Errore migrazione template" });
    }
  },
);

/**
 * ========================================
 * TEMPLATE IMAGE UPLOAD ENDPOINTS
 * ========================================
 */

/**
 * POST /api/consultations/templates/:id/upload-image
 * Upload immagine per template (admin only, max 10 immagini)
 */
router.post(
  "/templates/:id/upload-image",
  authenticateFirebase,
  upload.single("image"),
  async (req: AuthRequest, res) => {
    try {
      const { email } = req.user!;
      if (!ADMIN_EMAILS.includes(email)) {
        return res
          .status(403)
          .json({ error: "Solo gli amministratori possono caricare immagini" });
      }

      const { id } = req.params;

      // Verifica template esistente
      const template = await consultationService.getTemplateById(id);
      if (!template) {
        return res.status(404).json({ error: "Template non trovato" });
      }

      // Limite 10 immagini per template
      const currentImages = template.imageUrls || [];
      if (currentImages.length >= 10) {
        return res.status(400).json({
          error: "Limite raggiunto",
          message: "Massimo 10 immagini per template",
        });
      }

      if (!req.file) {
        return res.status(400).json({ error: "Nessun file caricato" });
      }

      const bucket = storage.bucket();
      const timestamp = Date.now();
      const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `consultation-templates/${id}/${timestamp}_${safeName}`;

      const file = bucket.file(storagePath);

      // Upload immagine (privata con signed URL)
      await file.save(req.file.buffer, {
        metadata: {
          contentType: req.file.mimetype,
          metadata: {
            uploadedAt: new Date().toISOString(),
            originalName: req.file.originalname,
            templateId: id,
          },
        },
      });

      // Genera signed URL (5 anni validità)
      const [signedUrl] = await file.getSignedUrl({
        action: "read",
        expires: Date.now() + 5 * 365 * 24 * 60 * 60 * 1000, // 5 anni
      });

      // Aggiorna template con nuovo URL
      await consultationService.updateTemplate(id, {
        imageUrls: [...currentImages, signedUrl],
      });

      console.log(
        `✅ Immagine caricata per template ${id}: ${req.file.originalname}`,
      );

      res.json({
        message: "Immagine caricata con successo",
        imageUrl: signedUrl,
      });
    } catch (error: any) {
      console.error(
        "[POST /templates/:id/upload-image] Errore:",
        error.message,
      );

      if (error.message.includes("Solo immagini")) {
        return res.status(400).json({ error: error.message });
      }

      res.status(500).json({ error: "Errore upload immagine" });
    }
  },
);

/**
 * DELETE /api/consultations/templates/:id/images
 * Elimina immagine da template (admin only)
 */
router.delete(
  "/templates/:id/images",
  authenticateFirebase,
  async (req: AuthRequest, res) => {
    try {
      const { email } = req.user!;
      if (!ADMIN_EMAILS.includes(email)) {
        return res
          .status(403)
          .json({
            error: "Solo gli amministratori possono eliminare immagini",
          });
      }

      const { id } = req.params;
      const { imageUrl } = req.body;

      if (!imageUrl) {
        return res
          .status(400)
          .json({ error: "imageUrl obbligatorio nel body" });
      }

      // Verifica template esistente
      const template = await consultationService.getTemplateById(id);
      if (!template) {
        return res.status(404).json({ error: "Template non trovato" });
      }

      const currentImages = template.imageUrls || [];

      if (!currentImages.includes(imageUrl)) {
        return res
          .status(404)
          .json({ error: "Immagine non trovata nel template" });
      }

      // Estrai storage path da signed URL (pattern: consultation-templates/{id}/{filename})
      // Gli signed URL hanno formato: https://storage.googleapis.com/{bucket}/consultation-templates/...
      const pathMatch = imageUrl.match(/consultation-templates\/[^?]+/);

      if (pathMatch) {
        const storagePath = pathMatch[0];

        try {
          const bucket = storage.bucket();
          await bucket.file(storagePath).delete();
          console.log(`✅ File eliminato da Storage: ${storagePath}`);
        } catch (storageError: any) {
          console.warn(
            "[DELETE] Errore eliminazione file Storage:",
            storageError.message,
          );
          // Continua comunque con rimozione da Firestore
        }
      }

      // Rimuovi URL da template
      const updatedImages = currentImages.filter((url) => url !== imageUrl);
      await consultationService.updateTemplate(id, {
        imageUrls: updatedImages,
      });

      res.json({ message: "Immagine eliminata con successo" });
    } catch (error: any) {
      console.error("[DELETE /templates/:id/images] Errore:", error.message);
      res.status(500).json({ error: "Errore eliminazione immagine" });
    }
  },
);

/**
 * POST /api/consultations/send-reminders
 * Invia reminder email per consulenze nelle prossime 24 ore (da schedulare con cron)
 * NOTA: Questo endpoint può essere chiamato manualmente o via Cloud Function schedulata
 */
router.post("/send-reminders", async (req, res) => {
  try {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Range: da ora a +48h per essere sicuri di non perdere consulenze
    const in48Hours = new Date(now);
    in48Hours.setDate(in48Hours.getDate() + 2);

    console.log(
      `[Reminder] Cerco consulenze confermate tra ${now.toISOString()} e ${in48Hours.toISOString()}`,
    );

    // Cerca consulenze confermate (non filtriamo per reminderSentAt qui, lo facciamo in transazione)
    const consultationsSnap = await db
      .collection("consultations")
      .where("stato", "==", "confermata")
      .get();

    const consultations = consultationsSnap.docs.map((doc) => ({
      id: doc.id,
      ref: doc.ref,
      ...doc.data(),
    })) as any[];

    console.log(
      `[Reminder] Trovate ${consultations.length} consulenze confermate totali`,
    );

    // Filtra solo quelle nelle prossime 20-28h (timezone-aware per Europe/Rome)
    // Usa luxon per gestione timezone robusta e DST-safe
    const nowRome = DateTime.now().setZone("Europe/Rome");

    const consultationsToRemind = consultations.filter((c) => {
      // Skip quick read se reminder già inviato (ottimizzazione)
      if (c.reminderEmailSent || c.reminderSentAt) {
        return false;
      }

      const consultationDate = normalizeTimestampToDate(c.dataConsulenza);
      // Converti consultationDate a Europe/Rome usando luxon (DST-safe)
      const consultationRome =
        DateTime.fromJSDate(consultationDate).setZone("Europe/Rome");

      // Calcola differenza in ore (DST-aware)
      const hoursDiff = consultationRome.diff(nowRome, "hours").hours;

      // Invia reminder tra 20h e 28h prima (giorno prima)
      return hoursDiff >= 20 && hoursDiff <= 28;
    });

    console.log(
      `[Reminder] ${consultationsToRemind.length} consulenze richiedono reminder (20-28h prima)`,
    );

    const results = {
      total: consultationsToRemind.length,
      sent: 0,
      failed: 0,
      errors: [] as string[],
    };

    // Invia email reminder per ciascuna consultation
    for (const consultation of consultationsToRemind) {
      try {
        // Atomic check-and-set: marca reminder come inviato solo se non già inviato
        // Usa transazione per prevenire race conditions
        const shouldSend = await db.runTransaction(async (transaction) => {
          const consultationDoc = await transaction.get(consultation.ref);

          if (!consultationDoc.exists) {
            return false; // Consultation eliminata nel frattempo
          }

          const data = consultationDoc.data();

          // Skip se reminder già inviato
          if (data?.reminderSentAt) {
            return false;
          }

          // Marca come inviato atomicamente
          transaction.update(consultation.ref, {
            reminderSentAt: Timestamp.now(),
          });

          return true;
        });

        if (!shouldSend) {
          console.log(
            `Reminder già inviato o consultation eliminata: ${consultation.id}`,
          );
          continue;
        }

        const {
          sendGmailEmail,
          getStudioContactInfo,
          createConsultationReminderEmailHTML,
          generateGoogleCalendarLink,
        } = await import("./email-routes.js");
        const studioInfo = await getStudioContactInfo();

        const consultationDate = normalizeTimestampToDate(
          consultation.dataConsulenza,
        );
        const clienteName = `${consultation.cliente.nome} ${consultation.cliente.cognome}`;
        const formattedDate = consultationDate.toLocaleDateString("it-IT", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
          timeZone: "Europe/Rome",
        });

        // Converti consultationDate in formato YYYY-MM-DD
        const year = consultationDate.getFullYear();
        const month = String(consultationDate.getMonth() + 1).padStart(2, "0");
        const day = String(consultationDate.getDate()).padStart(2, "0");
        const dateStr = `${year}-${month}-${day}`;

        const startDateTime = createEuropeRomeDate(
          dateStr,
          consultation.orarioInizio,
        );
        const endDateTime = createEuropeRomeDate(
          dateStr,
          consultation.orarioFine,
        );

        // Generate Google Calendar link
        const calendarLink = generateGoogleCalendarLink({
          title: `Consulenza ${consultation.jobType} - ${clienteName}`,
          description: `Consulenza per ${consultation.jobType}\nCliente: ${clienteName}\n\n${studioInfo.name}\nTel: ${studioInfo.phone}`,
          location: studioInfo.address,
          startDate: startDateTime,
          endDate: endDateTime,
          isAllDay: false,
        });

        const htmlContent = createConsultationReminderEmailHTML(
          clienteName,
          consultation.jobType,
          formattedDate,
          `${consultation.orarioInizio} - ${consultation.orarioFine}`,
          studioInfo,
          calendarLink,
        );

        await sendGmailEmail(
          consultation.cliente.email,
          `Promemoria: Consulenza Domani - ${consultation.jobType}`,
          htmlContent,
        );

        // Marca email come inviata con successo
        await db.collection("consultations").doc(consultation.id).update({
          reminderEmailSent: true,
        });

        results.sent++;
        console.log(`Reminder inviato per consultation ${consultation.id}`);
      } catch (emailError: any) {
        results.failed++;
        results.errors.push(`${consultation.id}: ${emailError.message}`);
        console.error(
          `Errore invio reminder consultation ${consultation.id}:`,
          emailError.message,
        );
      }
    }

    console.log(
      `[Reminder] Completato - Inviati: ${results.sent}, Falliti: ${results.failed}`,
    );

    res.json({
      message: "Reminder process completed",
      results,
    });
  } catch (error: any) {
    console.error("[POST /send-reminders] Errore:", error.message);
    res.status(500).json({ error: "Errore invio reminder" });
  }
});

/**
 * GET /api/consultations/list-confirmed-bookings
 * 📋 Lista tutti i bookings confermati per review manuale
 */
router.get("/list-confirmed-bookings", async (req, res) => {
  try {
    const bookingsSnap = await db
      .collection("bookings")
      .where("stato", "==", "confermata")
      .orderBy("dataShootingInizio", "asc")
      .get();

    const bookings = bookingsSnap.docs.map((doc) => ({
      id: doc.id,
      clienteNome: doc.data().clienteNome,
      clienteEmail: doc.data().clienteEmail,
      dataInizio: doc.data().dataShootingInizio?.toDate?.(),
      dataFine: doc.data().dataShootingFine?.toDate?.(),
      googleEventId: doc.data().googleCalendarEventId,
      createdAt: doc.data().createdAt?.toDate?.(),
    }));

    res.json({
      total: bookings.length,
      bookings,
    });
  } catch (error: any) {
    console.error("[List confirmed bookings] Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/consultations/cancel-booking/:bookingId
 * ❌ Cancella manualmente un booking specifico
 */
router.post("/cancel-booking/:bookingId", async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { reason = "Cancellato manualmente dall'admin" } = req.body;

    const bookingRef = db.collection("bookings").doc(bookingId);
    const bookingDoc = await bookingRef.get();

    if (!bookingDoc.exists) {
      return res.status(404).json({ error: "Booking non trovato" });
    }

    await bookingRef.update({
      stato: "cancellata",
      cancelledAt: Timestamp.now(),
      cancelledReason: reason,
    });

    console.log(`[Cancel booking] Booking ${bookingId} cancellato: ${reason}`);

    res.json({
      message: "Booking cancellato con successo",
      bookingId,
    });
  } catch (error: any) {
    console.error("[Cancel booking] Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/consultations/debug/slot-conflicts/:date
 * 🔍 DEBUG: Mostra tutte le risorse che occupano slot in una data specifica
 */
router.get("/debug/slot-conflicts/:date", async (req, res) => {
  try {
    const { date } = req.params; // Format: YYYY-MM-DD

    const targetDate = new Date(date);
    const dayStart = new Date(targetDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(targetDate);
    dayEnd.setHours(23, 59, 59, 999);

    const results: any = {
      date,
      consultations: [],
      bookings: [],
      jobs: [],
      googleCalendar: [],
    };

    // 1. Consultations
    const consultationsSnap = await db
      .collection("consultations")
      .where("dataConsulenza", ">=", Timestamp.fromDate(dayStart))
      .where("dataConsulenza", "<=", Timestamp.fromDate(dayEnd))
      .get();

    results.consultations = consultationsSnap.docs.map((doc) => ({
      id: doc.id,
      cliente: doc.data().cliente,
      orarioInizio: doc.data().orarioInizio,
      orarioFine: doc.data().orarioFine,
      stato: doc.data().stato,
      createdAt: doc.data().createdAt?.toDate?.(),
    }));

    // 2. Bookings
    const bookingsSnap = await db
      .collection("bookings")
      .where("dataShootingInizio", ">=", Timestamp.fromDate(dayStart))
      .where("dataShootingInizio", "<=", Timestamp.fromDate(dayEnd))
      .get();

    results.bookings = bookingsSnap.docs.map((doc) => ({
      id: doc.id,
      clienteNome: doc.data().clienteNome,
      clienteEmail: doc.data().clienteEmail,
      dataShootingInizio: doc.data().dataShootingInizio?.toDate?.(),
      dataShootingFine: doc.data().dataShootingFine?.toDate?.(),
      stato: doc.data().stato,
    }));

    // 3. Jobs
    const jobsSnap = await db
      .collection("jobs")
      .where("eventDate", ">=", Timestamp.fromDate(dayStart))
      .where("eventDate", "<=", Timestamp.fromDate(dayEnd))
      .get();

    results.jobs = jobsSnap.docs.map((doc) => ({
      id: doc.id,
      nomeEvento: doc.data().nomeEvento,
      allDay: doc.data().allDay,
      startTime: doc.data().startTime,
      endTime: doc.data().endTime,
      stato: doc.data().stato,
      eventDate: doc.data().eventDate?.toDate?.(),
    }));

    // 4. Google Calendar
    try {
      const { checkFreeBusyAllCalendars } = await import(
        "./google-calendar.js"
      );
      const busyPeriodsResult = await checkFreeBusyAllCalendars(
        dayStart,
        dayEnd,
      );
      results.googleCalendar = busyPeriodsResult || [];
    } catch (error: any) {
      results.googleCalendarError = error.message;
    }

    res.json(results);
  } catch (error: any) {
    console.error("[Debug slot-conflicts] Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * ========================================
 * NEW CALENDAR ENGINE V2 — Unified API
 * ========================================
 * Endpoint v2 that uses centralized Calendar Engine
 * Legacy endpoint /available-slots remains untouched
 */

router.post("/v2/available-slots", async (req, res) => {
  try {
    console.log("[POST /v2/available-slots] 🔵 Calendar Engine V2 - Request:", req.body);
    const { date, templateId } = req.body;

    if (!date || !templateId) {
      return res.status(400).json({
        error: "Parametri mancanti (date, templateId richiesti)",
      });
    }

    // Step 1: Load template
    const template = await consultationService.getTemplateById(templateId);

    if (!template) {
      return res.status(404).json({ error: "Template non trovato" });
    }

    if (!template.attiva) {
      return res.status(400).json({ error: "Template non attivo" });
    }

    // Step 2: Import Calendar Engine modules
    const { consultationTemplateToAvailabilityConfig, validateConsultationTemplate } = await import('./consultations/calendar-adapter.js');
    const { getAvailableSlotsForDate, getUnavailabilityReason } = await import('./calendar-engine/index.js');
    const { checkGoogleCalendarBusyPeriods, hasAllDayEvent } = await import('./calendar-engine/google-sync.js');
    const { CalendarEvent, SlotsResponse } = await import('../shared/calendar-types.js');

    // Step 3: Validate template
    if (!validateConsultationTemplate(template)) {
      return res.status(400).json({
        error: "Template configurazione invalida",
        message: "Template manca di customWorkingHours o durataMinuti"
      });
    }

    // Step 4: Convert template to AvailabilityConfig
    const config = consultationTemplateToAvailabilityConfig(template);

    console.log("[POST /v2/available-slots] 📋 Config generato:", {
      slotDuration: config.slotDurationMinutes,
      excludedWeekdays: config.excludedWeekdays,
      timezone: config.timezone
    });

    // Step 5: Parse date with Europe/Rome timezone
    const dateObj = DateTime.fromISO(date, { zone: "Europe/Rome" });
    const dayStart = dateObj.startOf("day").toJSDate();
    const dayEnd = dateObj.endOf("day").toJSDate();

    // Step 6: Check for all-day events
    const hasAllDay = await hasAllDayEvent(dayStart);

    if (hasAllDay) {
      console.log("[POST /v2/available-slots] 🚫 All-day event detected");
      const unavailabilityInfo = getUnavailabilityReason(dayStart, config, true);

      return res.json({
        date,
        slots: [],
        unavailableReason: unavailabilityInfo.reason,
        message: unavailabilityInfo.message
      } as SlotsResponse);
    }

    // Step 7: Collect existing events from all sources
    const existingEvents: CalendarEvent[] = [];

    // 7a. Google Calendar busy periods
    const googleBusy = await checkGoogleCalendarBusyPeriods(dayStart, dayEnd);
    existingEvents.push(...googleBusy);
    console.log(`[POST /v2/available-slots] 📅 ${googleBusy.length} busy periods da Google Calendar`);

    // 7b. Existing consultations
    const consultationsSnap = await db
      .collection("consultations")
      .where("dataConsulenza", ">=", Timestamp.fromDate(dayStart))
      .where("dataConsulenza", "<=", Timestamp.fromDate(dayEnd))
      .where("stato", "in", ["in_attesa", "confermata"])
      .get();

    for (const doc of consultationsSnap.docs) {
      const data = doc.data();
      const consultationDate = normalizeTimestampToDate(data.dataConsulenza);
      const year = consultationDate.getFullYear();
      const month = String(consultationDate.getMonth() + 1).padStart(2, '0');
      const day = String(consultationDate.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      const start = createEuropeRomeDate(dateStr, data.orarioInizio);
      const end = createEuropeRomeDate(dateStr, data.orarioFine);

      existingEvents.push({
        start,
        end,
        allDay: false,
        title: `Consultation ${data.cliente?.nome || ''}`,
        source: 'consultation'
      });
    }

    console.log(`[POST /v2/available-slots] 📋 ${consultationsSnap.size} consultations esistenti`);

    // 7c. Bookings - DISABLED: Calendar Engine V2 manages them via adapters
    // ⚠️ DO NOT re-enable manual booking queries here - causes phantom conflicts
    console.log("[POST /v2/available-slots] ⏭️ Booking conflicts managed by Calendar Engine V2 adapter");

    // 7d. Jobs (only blocking statuses)
    const jobsSnap = await db
      .collection("jobs")
      .where("eventDate", ">=", Timestamp.fromDate(dayStart))
      .where("eventDate", "<=", Timestamp.fromDate(dayEnd))
      .get();

    const blockingStatuses = ['confermato', 'shooting_fatto', 'selezione_pending', 'produzione'];

    for (const doc of jobsSnap.docs) {
      const data = doc.data();

      if (!blockingStatuses.includes(data.stato)) {
        continue; // Skip non-blocking jobs
      }

      const eventDate = data.eventDate.toDate();

      if (data.allDay) {
        // All-day job blocks entire day
        const start = new Date(eventDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(eventDate);
        end.setHours(23, 59, 59, 999);

        existingEvents.push({
          start,
          end,
          allDay: true,
          title: `Job ${data.nomeEvento || ''}`,
          source: 'job'
        });
      } else if (data.startTime && data.endTime) {
        // Time-bound job
        const year = eventDate.getFullYear();
        const month = String(eventDate.getMonth() + 1).padStart(2, '0');
        const day = String(eventDate.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        const start = createEuropeRomeDate(dateStr, data.startTime);
        const end = createEuropeRomeDate(dateStr, data.endTime);

        existingEvents.push({
          start,
          end,
          allDay: false,
          title: `Job ${data.nomeEvento || ''}`,
          source: 'job'
        });
      }
    }

    console.log(`[POST /v2/available-slots] 💼 ${existingEvents.filter(e => e.source === 'job').length} jobs bloccanti`);
    console.log(`[POST /v2/available-slots] 🎯 TOTALE: ${existingEvents.length} eventi bloccanti`);

    // Step 8: Generate slots using Calendar Engine
    const slots = await getAvailableSlotsForDate(dayStart, config, existingEvents);

    console.log(`[POST /v2/available-slots] ✅ ${slots.length} slot disponibili generati`);

    // Step 9: Prepare response with user-friendly message if no slots
    const response: SlotsResponse = {
      date,
      slots
    };

    if (slots.length === 0 && !hasAllDay) {
      const unavailabilityInfo = getUnavailabilityReason(dayStart, config, false);

      if (unavailabilityInfo.reason) {
        response.unavailableReason = unavailabilityInfo.reason;
        response.message = unavailabilityInfo.message;
      } else {
        // All slots are booked
        response.unavailableReason = 'all-booked';
        response.message = 'Ci dispiace, ma questa data è sold out';
      }
    }

    res.json(response);
  } catch (error: any) {
    console.error("[POST /v2/available-slots] ❌ Error:", error);
    console.error("[POST /v2/available-slots] Stack:", error.stack);
    res.status(500).json({ error: "Errore calcolo slot disponibili" });
  }
});

export default router;