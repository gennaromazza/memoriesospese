/**
 * Booking API Routes - Express.js
 * Gestisce endpoint per slot disponibili Google Calendar
 * NOTA: Validazione campagna fatta lato client, server gestisce solo Google Calendar
 */

import express from "express";
import { getAvailableSlots, type WorkingHours } from "./google-calendar.js";
import { db, FieldValue } from "./firebase-admin.js";
import { Timestamp } from "firebase-admin/firestore";
import { syncBookingWorkflowState } from "../shared/workflow-helpers.js";
import { WorkflowState } from "../shared/schema.js";
import type { SlotsResponse, TimeSlot } from "../shared/calendar-types.js";
import type { BookingCampaign } from "../shared/booking-types.js";

const router = express.Router();

/**
 * Helper: Normalizza email per matching
 */
function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

/**
 * Helper: Genera document ID deterministico da email
 * Usa base64url encoding per garantire caratteri validi Firestore
 */
function generateClienteIdFromEmail(email: string): string {
  const normalized = normalizeEmail(email);
  return Buffer.from(normalized).toString("base64url");
}

/**
 * Helper: Collega booking a cliente (server-side)
 * BACKWARD COMPATIBLE: supporta sia ID hash (nuovi) che ID random (legacy)
 */
async function linkBookingToClienteServer(
  bookingId: string,
  clienteData: {
    nome: string;
    cognome: string;
    email: string;
    whatsapp?: string;
  },
): Promise<void> {
  const normalizedEmail = normalizeEmail(clienteData.email);
  const hashedId = generateClienteIdFromEmail(normalizedEmail);

  try {
    // Step 1: Cerca cliente esistente (prima hash ID, poi query email per legacy)
    const hashedDocRef = db.collection("clienti").doc(hashedId);
    const hashedDocSnap = await hashedDocRef.get();

    let targetRef = hashedDocRef;
    let isNewClient = false;

    if (!hashedDocSnap.exists) {
      // Doc hash non esiste → cerca per email (legacy compatibility)
      // NOTA: Firestore query è case-sensitive, quindi recuperiamo candidati
      // e facciamo matching case-insensitive in memoria
      const legacyQueryExact = await db
        .collection("clienti")
        .where("email", "==", normalizedEmail)
        .limit(1)
        .get();

      if (!legacyQueryExact.empty) {
        // Match esatto trovato (email già lowercase in DB)
        targetRef = legacyQueryExact.docs[0].ref;
        console.log(
          `[Link Booking] 🔄 Cliente legacy (exact) trovato: ${targetRef.id}`,
        );
      } else {
        // Fallback: cerca email case-insensitive con paginazione COMPLETA
        // Elimina limite arbitrario per garantire nessun cliente legacy venga perso
        const firstCharLower = normalizedEmail.charAt(0).toLowerCase();
        const firstCharUpper = normalizedEmail.charAt(0).toUpperCase();

        let caseInsensitiveMatch = null;

        // Helper per paginare attraverso TUTTI i risultati
        const searchInRange = async (startChar: string): Promise<any> => {
          let query = db
            .collection("clienti")
            .where("email", ">=", startChar)
            .where("email", "<=", startChar + "\uf8ff")
            .orderBy("email") // Required per startAfter cursor
            .limit(500); // Batch size ragionevole

          let hasMore = true;
          let lastDoc = null;

          while (hasMore) {
            const snapshot: FirebaseFirestore.QuerySnapshot = lastDoc
              ? await query.startAfter(lastDoc).get()
              : await query.get();

            if (snapshot.empty) {
              hasMore = false;
              break;
            }

            // Cerca match in questo batch
            const match = snapshot.docs.find(
              (doc: FirebaseFirestore.QueryDocumentSnapshot) => {
                const docEmail = doc.data()?.email;
                return docEmail && normalizeEmail(docEmail) === normalizedEmail;
              },
            );

            if (match) {
              return match; // Trovato!
            }

            // Se batch < limit, siamo alla fine
            if (snapshot.docs.length < 500) {
              hasMore = false;
            } else {
              lastDoc = snapshot.docs[snapshot.docs.length - 1];
            }
          }

          return null;
        };

        // Cerca in lowercase range
        caseInsensitiveMatch = await searchInRange(firstCharLower);

        // Se non trovato e uppercase è diverso, cerca anche lì
        if (!caseInsensitiveMatch && firstCharLower !== firstCharUpper) {
          caseInsensitiveMatch = await searchInRange(firstCharUpper);
        }

        if (caseInsensitiveMatch) {
          targetRef = caseInsensitiveMatch.ref;
          console.log(
            `[Link Booking] 🔄 Cliente legacy (paginated) trovato: ${targetRef.id}`,
          );
        } else {
          // Nessun cliente esistente → crea nuovo con hash ID
          isNewClient = true;
          console.log(`[Link Booking] ➕ Nuovo cliente: ${hashedId}`);
        }
      }
    } else {
      console.log(`[Link Booking] ✅ Cliente hash trovato: ${hashedId}`);
    }

    // Step 2: Transaction atomica per update/create (race-condition safe)
    await db.runTransaction(async (transaction) => {
      // SEMPRE fai get prima di set/update per evitare overwrites concorrenti
      const clienteDoc = await transaction.get(targetRef);

      if (!clienteDoc.exists) {
        // Cliente non esiste → crea nuovo
        const now = Timestamp.now();
        transaction.set(targetRef, {
          nome: clienteData.nome,
          cognome: clienteData.cognome,
          email: normalizedEmail,
          cellulare1: clienteData.whatsapp || undefined,
          whatsapp: clienteData.whatsapp || undefined,
          tags: [],
          sourceRefs: {
            bookingIds: [bookingId],
            orderIds: [],
            galleryIds: [],
            passwordRequestIds: [],
            userIds: [],
          },
          lifecycle: {
            firstContactAt: now,
            lastInteractionAt: now,
            status: "lead",
          },
          financials: {
            totalRevenue: 0,
            outstandingBalance: 0,
            totalOrders: 0,
          },
          createdAt: now,
          updatedAt: now,
        });
        console.log(
          `[Link Booking] ✅ Cliente creato con booking ${bookingId}`,
        );
      } else {
        // Cliente esiste (creato da noi o da transaction concorrente) → aggiorna
        const currentData = clienteDoc.data() as any;
        const currentBookingIds = currentData?.sourceRefs?.bookingIds || [];

        if (!currentBookingIds.includes(bookingId)) {
          transaction.update(targetRef, {
            "sourceRefs.bookingIds": FieldValue.arrayUnion(bookingId),
            "lifecycle.lastInteractionAt": Timestamp.now(),
            updatedAt: Timestamp.now(),
          });
          console.log(
            `[Link Booking] ✅ Booking ${bookingId} aggiunto a ${targetRef.id}`,
          );
        } else {
          console.log(
            `[Link Booking] ⚠️ Booking ${bookingId} già in ${targetRef.id}`,
          );
        }
      }
    });
  } catch (error) {
    console.error(
      `[Link Booking] ❌ Errore collegamento booking→cliente:`,
      error,
    );
  }
}

/**
 * POST /api/booking/available-slots
 * Ottiene slot disponibili da Google Calendar con filtro Firestore
 *
 * Body: {
 *   date: "YYYY-MM-DD",
 *   workingHours: { apertura, pausaInizio, pausaFine, chiusura },
 *   durataMinuti: number,
 *   calendarId?: string (opzionale, default 'primary'),
 *   campaignId?: string (opzionale, per filtro prenotazioni specifiche)
 * }
 */
router.post("/available-slots", async (req, res) => {
  try {
    const {
      date,
      workingHours,
      durataMinuti,
      calendarId,
      excludedDays,
      campaignId,
    } = req.body;

    // Validazione parametri
    if (!date || typeof date !== "string") {
      return res.status(400).json({
        error: "Parametro date mancante o invalido (formato: YYYY-MM-DD)",
      });
    }

    if (!workingHours || typeof workingHours !== "object") {
      return res.status(400).json({
        error: "Parametro workingHours mancante",
      });
    }

    if (!durataMinuti || typeof durataMinuti !== "number") {
      return res.status(400).json({
        error: "Parametro durataMinuti mancante o invalido",
      });
    }

    // Validazione formato data
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return res.status(400).json({
        error: "Formato data invalido. Usa YYYY-MM-DD",
      });
    }

    // Validazione working hours
    const { apertura, pausaInizio, pausaFine, chiusura } = workingHours;
    if (!apertura || !pausaInizio || !pausaFine || !chiusura) {
      return res.status(400).json({
        error:
          "Working hours incompleti. Richiesti: apertura, pausaInizio, pausaFine, chiusura",
      });
    }

    // Validazione formato HH:MM
    const timeRegex = /^\d{2}:\d{2}$/;
    const invalidTimes = [];
    if (!timeRegex.test(apertura)) invalidTimes.push("apertura");
    if (!timeRegex.test(pausaInizio)) invalidTimes.push("pausaInizio");
    if (!timeRegex.test(pausaFine)) invalidTimes.push("pausaFine");
    if (!timeRegex.test(chiusura)) invalidTimes.push("chiusura");

    if (invalidTimes.length > 0) {
      return res.status(400).json({
        error: `Formato orario invalido per: ${invalidTimes.join(", ")}. Usa HH:MM (es. "09:00")`,
      });
    }

    // Verifica se il giorno è escluso (0=Domenica, 1=Lunedì, ..., 6=Sabato)
    // FIX: Usa Calendar Engine V2 per timezone corretto
    if (excludedDays && Array.isArray(excludedDays)) {
      const { parseDateString, getWeekday } = await import('./calendar-engine/timezone.js');
      const requestedDate = parseDateString(date); // DateTime in Europe/Rome
      const dayOfWeek = getWeekday(requestedDate); // 0=Sunday, 1=Monday, etc.

      if (excludedDays.includes(dayOfWeek)) {
        // Giorno escluso - ritorna array vuoto
        return res.json({
          date,
          durataMinuti,
          slots: [],
          totalSlots: 0,
          excludedDay: true,
          dayOfWeek,
        });
      }
    }

    // Calcola slot disponibili usando Google Calendar
    // FIX: Usa parseDateString per garantire date Rome timezone (non UTC)
    const { parseDateString: parseDateForSlots } = await import('./calendar-engine/timezone.js');
    const dateForSlots = parseDateForSlots(date).toJSDate(); // Convert to JS Date for Google Calendar
    
    const slotsFromCalendar = await getAvailableSlots(
      calendarId || "primary",
      dateForSlots,
      {
        apertura,
        pausaInizio,
        pausaFine,
        chiusura,
      } as WorkingHours,
      durataMinuti,
    );

    // FILTRO FIRESTORE: Escludi slot occupati da prenotazioni in_attesa o confermata
    let slots = slotsFromCalendar;

    try {
      // FIX: Usa Calendar Engine V2 per day boundaries DST-safe
      // Estendi window da -1 giorno fino a fine del giorno richiesto
      const { parseDateString: parseDateBoundaries, toUTC } = await import('./calendar-engine/timezone.js');
      const requestedDate = parseDateBoundaries(date);
      const dayStart = toUTC(requestedDate.minus({ days: 1 }).startOf('day')); // Previous day start
      const dayEnd = toUTC(requestedDate.endOf('day')); // Requested day end

      console.log(
        `[Available Slots] Controllo prenotazioni esistenti per campagna ${campaignId} tra ${dayStart.toISOString()} e ${dayEnd.toISOString()}`,
      );

      // Query Firestore per prenotazioni esistenti (richiede indice composito)
      let query = db
        .collection("bookings")
        .where("dataShootingInizio", ">=", Timestamp.fromDate(dayStart))
        .where("dataShootingInizio", "<=", Timestamp.fromDate(dayEnd))
        .where("stato", "in", ["in_attesa", "confermata"]);

      // Aggiungi filtro campaignId per performance migliori
      if (campaignId) {
        query = query.where("campaignId", "==", campaignId);
      }

      const existingBookingsSnapshot = await query.get();

      console.log(
        `[Available Slots] Trovate ${existingBookingsSnapshot.size} prenotazioni esistenti da filtrare`,
      );

      // Filtra slot che non si sovrappongono con prenotazioni esistenti
      slots = slotsFromCalendar.filter((slot) => {
        const slotStart = slot.start;
        const slotEnd = slot.end;

        // Verifica che lo slot NON si sovrapponga con nessuna prenotazione
        const hasOverlap = existingBookingsSnapshot.docs.some((doc) => {
          const booking = doc.data();
          const bookingStart = booking.dataShootingInizio.toDate();
          const bookingEnd = booking.dataShootingFine.toDate();

          // Due intervalli si sovrappongono se: (slotStart < bookingEnd) E (slotEnd > bookingStart)
          return slotStart < bookingEnd && slotEnd > bookingStart;
        });

        return !hasOverlap; // Mantieni solo slot senza overlap
      });

      console.log(
        `[Available Slots] Dopo filtro Firestore: ${slots.length}/${slotsFromCalendar.length} slot disponibili`,
      );
    } catch (firestoreError: any) {
      // Se la query Firestore fallisce (es. indice mancante), usa fallback graceful
      console.error("⚠️⚠️⚠️ ERRORE QUERY FIRESTORE - INDICE MANCANTE ⚠️⚠️⚠️");
      console.error("Messaggio:", firestoreError?.message || firestoreError);

      // Firestore include il link per creare l'indice nell'errore
      if (firestoreError?.message?.includes("index")) {
        console.error("");
        console.error(
          "════════════════════════════════════════════════════════════════",
        );
        console.error(
          "🔗 CREA L'INDICE FIRESTORE CLICCANDO SUL LINK NELL'ERRORE SOPRA",
        );
        console.error(
          "════════════════════════════════════════════════════════════════",
        );
        console.error("");
        console.error("Errore completo Firestore:");
        console.error(JSON.stringify(firestoreError, null, 2));
        console.error("");
        console.error(
          "FALLBACK: Usando solo controllo Google Calendar (senza filtro Firestore)",
        );
        console.error("");
      }

      // Fallback: usa tutti gli slot da Google Calendar senza filtro Firestore
      slots = slotsFromCalendar;
      console.log(
        `[Available Slots] Fallback attivo: ${slots.length} slot da Google Calendar`,
      );
    }

    // Formatta slot per risposta JSON
    const formattedSlots = slots.map((slot) => ({
      start: slot.start.toISOString(),
      end: slot.end.toISOString(),
      startTime: slot.start.toLocaleTimeString("it-IT", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Rome",
      }),
      endTime: slot.end.toLocaleTimeString("it-IT", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Rome",
      }),
    }));

    return res.json({
      date,
      durataMinuti,
      slots: formattedSlots,
      totalSlots: formattedSlots.length,
    });
  } catch (error) {
    console.error("[Booking API] Errore calcolo slot:", error);

    // Gestione errori specifici Google Calendar
    if (error instanceof Error) {
      if (error.message.includes("Google Calendar not connected")) {
        return res.status(503).json({
          error: "Google Calendar non configurato",
          details: "Contatta l'amministratore per configurare il calendario",
        });
      }

      if (
        error.message.includes("access_token") ||
        error.message.includes("X_REPLIT_TOKEN")
      ) {
        return res.status(503).json({
          error: "Errore autenticazione Google Calendar",
          details: "Token scaduto o non valido",
        });
      }
    }

    return res.status(500).json({
      error: "Errore interno del server",
      message: error instanceof Error ? error.message : "Errore sconosciuto",
    });
  }
});

/**
 * POST /api/booking/create
 * Crea prenotazione con verifica slot atomica + creazione evento Google Calendar
 *
 * Body: {
 *   campaignId: string,
 *   cliente: { nome, cognome, email, whatsapp },
 *   dataShootingInizio: ISO string,
 *   dataShootingFine: ISO string,
 *   prodottoId?: string (legacy - single product),
 *   prodottoNome?: string (legacy - single product),
 *   prodotti?: OrderItem[] (multi-product support - preferred),
 *   note: string,
 *   workingHours: { apertura, pausaInizio, pausaFine, chiusura },
 *   durataMinuti: number
 * }
 */
router.post("/create", async (req, res) => {
  try {
    const {
      campaignId,
      cliente,
      dataShootingInizio,
      dataShootingFine,
      prodottoId,
      prodottoNome,
      prodotti,
      note,
      workingHours,
      durataMinuti,
      isManual,
      createdByAdmin,
    } = req.body;

    // Validazione parametri base
    if (!campaignId || !cliente || !dataShootingInizio || !dataShootingFine) {
      return res.status(400).json({
        error: "Parametri mancanti",
      });
    }

    // Validazione cliente (whatsapp opzionale per prenotazioni manuali)
    const requiredFields = isManual
      ? !cliente.nome?.trim() ||
        !cliente.cognome?.trim() ||
        !cliente.email?.trim()
      : !cliente.nome?.trim() ||
        !cliente.cognome?.trim() ||
        !cliente.email?.trim() ||
        !cliente.whatsapp?.trim();

    if (requiredFields) {
      return res.status(400).json({
        error: "Dati cliente incompleti",
      });
    }

    // Parse date
    const slotStart = new Date(dataShootingInizio);
    const slotEnd = new Date(dataShootingFine);

    if (isNaN(slotStart.getTime()) || isNaN(slotEnd.getTime())) {
      return res.status(400).json({
        error: "Date invalide",
      });
    }

    // SECURITY: Verifica che il giorno non sia escluso dalla campagna
    const campaignDoc = await db
      .collection("booking_campaigns")
      .doc(campaignId)
      .get();

    if (!campaignDoc.exists) {
      return res.status(404).json({
        error: "Campagna non trovata",
      });
    }

    const campaign = campaignDoc.data();
    const excludedDays = campaign?.excludedDays || [];

    if (excludedDays.length > 0) {
      // FIX: Usa Calendar Engine V2 per weekday detection corretto
      const { toRome, getWeekday } = await import('./calendar-engine/timezone.js');
      const romeDateSlot = toRome(slotStart);
      const dayOfWeek = getWeekday(romeDateSlot); // 0=Sunday, 1=Monday, etc.

      if (excludedDays.includes(dayOfWeek)) {
        return res.status(400).json({
          error: "Giorno non disponibile",
          message:
            "Il giorno selezionato non è disponibile per le prenotazioni in questa campagna.",
        });
      }
    }

    // VALIDATION: Verifica che i prodotti selezionati appartengano alla campagna
    const prodottiDisponibili = campaign?.prodottiDisponibili || [];

    // Normalizza prodottiDisponibili a array di ID (supporta sia oggetti che stringhe)
    const prodottiDisponibiliIds = prodottiDisponibili.map((p: any) =>
      typeof p === "string" ? p : p.id,
    );

    // Validazione multi-prodotto (se fornito)
    if (prodotti && Array.isArray(prodotti) && prodotti.length > 0) {
      const invalidProducts = prodotti.filter(
        (item: any) => !prodottiDisponibiliIds.includes(item.prodottoId),
      );

      if (invalidProducts.length > 0) {
        console.warn(
          `⚠️ Prodotti non validi per campagna ${campaignId}:`,
          invalidProducts,
        );
        return res.status(400).json({
          error: "Prodotti non validi",
          message:
            "Alcuni prodotti selezionati non sono disponibili per questa campagna.",
        });
      }
    }

    // Validazione legacy single-product (se fornito)
    if (prodottoId && !prodottiDisponibiliIds.includes(prodottoId)) {
      console.warn(
        `⚠️ Prodotto legacy non valido per campagna ${campaignId}: ${prodottoId}`,
      );
      return res.status(400).json({
        error: "Prodotto non valido",
        message:
          "Il prodotto selezionato non è disponibile per questa campagna.",
      });
    }

    // 1. Ricontrolla disponibilità slot via Google Calendar
    const dateStr = slotStart.toISOString().split("T")[0];

    const availableSlots = await getAvailableSlots(
      "primary",
      slotStart,
      workingHours as WorkingHours,
      durataMinuti,
    );

    // Verifica che lo slot selezionato sia ancora disponibile
    const slotStillAvailable = availableSlots.some(
      (slot) =>
        Math.abs(slot.start.getTime() - slotStart.getTime()) < 1000 &&
        Math.abs(slot.end.getTime() - slotEnd.getTime()) < 1000,
    );

    if (!slotStillAvailable) {
      return res.status(409).json({
        error: "Slot non più disponibile",
        message:
          "Lo slot selezionato è stato prenotato da qualcun altro. Scegli un altro orario.",
      });
    }

    // 2. Verifica anche booking esistenti in Firestore con overlap check (prevenzione race condition)
    // FIX: Usa Calendar Engine V2 per day boundaries corretti
    const { getDayBoundaries } = await import('./calendar-engine/timezone.js');
    const { dayStart, dayEnd } = getDayBoundaries(slotStart, 0); // No extension needed

    const existingBookingsSnapshot = await db
      .collection("bookings")
      .where("dataShootingInizio", ">=", Timestamp.fromDate(dayStart))
      .where("dataShootingInizio", "<=", Timestamp.fromDate(dayEnd))
      .where("stato", "in", ["in_attesa", "confermata"])
      .get();

    // Controllo overlap in memoria
    const hasOverlap = existingBookingsSnapshot.docs.some((doc) => {
      const booking = doc.data();
      const existingStart = booking.dataShootingInizio.toDate();
      const existingEnd = booking.dataShootingFine.toDate();

      // Verifica sovrapposizione: due intervalli si sovrappongono se:
      // (slotStart < existingEnd) E (slotEnd > existingStart)
      const overlaps = slotStart < existingEnd && slotEnd > existingStart;

      if (overlaps) {
        console.log(
          `⚠️ Overlap detected: New slot ${slotStart.toISOString()}-${slotEnd.toISOString()} overlaps with existing ${existingStart.toISOString()}-${existingEnd.toISOString()}`,
        );
      }

      return overlaps;
    });

    if (hasOverlap) {
      return res.status(409).json({
        error: "Slot non più disponibile",
        message:
          "Lo slot selezionato si sovrappone con una prenotazione esistente. Scegli un altro orario.",
      });
    }

    // 3. NON creare evento Google Calendar qui - verrà creato solo all'approvazione admin
    // Questo previene che prenotazioni non confermate appaiano sul calendario

    // Fix #2: Calc workflow state sync (spread-safe)
    const workflowUpdate = syncBookingWorkflowState("in_attesa");

    const bookingData: any = {
      campaignId,
      cliente: {
        nome: cliente.nome.trim(),
        cognome: cliente.cognome.trim(),
        email: cliente.email.trim().toLowerCase(),
        whatsapp: cliente.whatsapp?.trim() || "",
      },
      dataShootingInizio: Timestamp.fromDate(slotStart),
      dataShootingFine: Timestamp.fromDate(slotEnd),
      prodottoId: prodottoId || null, // Legacy single-product support
      prodottoNome: prodottoNome || null, // Legacy single-product support
      prodotti: prodotti || null, // Multi-product support (OrderItem[])
      note: note || "",
      stato: "in_attesa",
      ...workflowUpdate, // Fix #2: Spread workflow state (omits field if {})
      emailRicevutaInviata: false,
      emailConfermataInviata: false,
      googleCalendarEventId: null, // Evento Calendar sarà creato solo all'approvazione
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    console.log(`✅ Booking data prepared:`, {
      campaignId,
      hasLegacyProduct: !!prodottoId,
      hasMultiProduct: !!prodotti,
      productsCount: prodotti?.length || 0,
    });

    // Aggiungi flag prenotazione manuale se presente
    if (isManual) {
      bookingData.isManual = true;
      bookingData.createdByAdmin = createdByAdmin || "admin";
      console.log(
        `📝 Creazione prenotazione manuale da admin: ${createdByAdmin}`,
      );
    }

    const bookingRef = await db.collection("bookings").add(bookingData);

    // 4. Invia email automatica "Prenotazione Ricevuta" (chiamata diretta alla funzione)
    try {
      // Recupera nome campagna da Firestore
      const campaignDoc = await db
        .collection("booking_campaigns")
        .doc(campaignId)
        .get();
      const campaignData = campaignDoc.data();
      const campaignName = campaignData?.nome || "Shooting Fotografico";

      // Formatta data e ora
      const bookingDate = slotStart.toLocaleDateString("it-IT", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      const bookingTime = `${slotStart.toLocaleTimeString("it-IT", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Rome",
      })} - ${slotEnd.toLocaleTimeString("it-IT", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Rome",
      })}`;

      // Calcola durata in minuti
      const durationMinutes = Math.round(
        (slotEnd.getTime() - slotStart.getTime()) / (1000 * 60),
      );

      // Import diretto delle funzioni email
      const {
        sendGmailEmail,
        createBookingReceivedEmailHTML,
        getStudioContactInfo,
      } = await import("./email-routes.js");

      // Recupera dati contatto studio
      const studioInfo = await getStudioContactInfo();

      const clienteName = `${cliente.nome} ${cliente.cognome}`;
      const emailHTML = createBookingReceivedEmailHTML(
        clienteName,
        campaignName,
        bookingDate,
        bookingTime,
        durationMinutes,
        prodottoNome,
        studioInfo,
        undefined, // No calendarLink for pending bookings
      );

      await sendGmailEmail(
        cliente.email,
        `Prenotazione Ricevuta - ${campaignName}`,
        emailHTML,
      );

      // Aggiorna flag email inviata
      await bookingRef.update({ emailRicevutaInviata: true });
      console.log(
        `✅ Email "Prenotazione Ricevuta" inviata a ${cliente.email}`,
      );

      // 5. Invia email notifica admin (nuova prenotazione)
      try {
        const { createAdminNotificationEmailHTML } = await import(
          "./email-routes.js"
        );

        const adminEmail = studioInfo.email; // Email admin dallo studio
        const clienteName = `${cliente.nome} ${cliente.cognome}`;
        const adminEmailHTML = createAdminNotificationEmailHTML(
          clienteName,
          cliente.email,
          cliente.whatsapp,
          campaignName,
          bookingDate,
          bookingTime,
          prodottoNome,
          note,
          studioInfo,
        );

        await sendGmailEmail(
          adminEmail,
          `Nuova Prenotazione - ${campaignName}`,
          adminEmailHTML,
        );

        // Aggiorna flag email admin inviata
        await bookingRef.update({ emailAdminInviata: true });
        console.log(`✅ Email notifica admin inviata a ${adminEmail}`);
      } catch (adminEmailError) {
        // Non bloccare la prenotazione se email admin fallisce
        console.error("⚠️ Errore invio email notifica admin:", adminEmailError);
      }
    } catch (emailError) {
      // Non bloccare la prenotazione se email fallisce
      console.error("⚠️ Errore invio email prenotazione ricevuta:", emailError);
    }

    // 6. Collega booking al cliente (auto-linkage sourceRefs)
    await linkBookingToClienteServer(bookingRef.id, {
      nome: cliente.nome,
      cognome: cliente.cognome,
      email: cliente.email,
      whatsapp: cliente.whatsapp,
    });

    return res.status(201).json({
      success: true,
      bookingId: bookingRef.id,
      message:
        "Prenotazione creata con successo - in attesa di approvazione admin",
    });
  } catch (error) {
    console.error("[Booking API] Errore creazione prenotazione:", error);

    // Gestione errori specifici
    if (error instanceof Error) {
      if (error.message.includes("Google Calendar")) {
        return res.status(503).json({
          error: "Errore Google Calendar",
          details:
            "Impossibile confermare la prenotazione. Riprova tra qualche minuto.",
        });
      }
    }

    return res.status(500).json({
      error: "Errore interno del server",
      message: error instanceof Error ? error.message : "Errore sconosciuto",
    });
  }
});

/**
 * PATCH /api/booking/v2/:id/approve
 * Approva prenotazione usando Calendar Engine V2 per conflict detection
 * 
 * Body: { adminUid: string }
 */
router.patch("/v2/:id/approve", async (req, res) => {
  try {
    console.log("[PATCH /v2/:id/approve] 🔵 Calendar Engine V2 - Request");
    const { id } = req.params;
    const { adminUid } = req.body;

    if (!id) {
      return res.status(400).json({ error: "ID prenotazione mancante" });
    }

    const bookingRef = db.collection("bookings").doc(id);
    const bookingDoc = await bookingRef.get();

    if (!bookingDoc.exists) {
      return res.status(404).json({ error: "Prenotazione non trovata" });
    }

    const bookingData = bookingDoc.data();

    if (!bookingData) {
      return res.status(404).json({ error: "Dati prenotazione non validi" });
    }

    // Verifica stato attuale
    if (bookingData.stato === "confermata") {
      return res.status(400).json({
        error: "Prenotazione già confermata",
        message: "Questa prenotazione è già stata approvata",
      });
    }

    // RIVALIDAZIONE con Calendar Engine V2
    const slotStart = bookingData.dataShootingInizio.toDate();
    const slotEnd = bookingData.dataShootingFine.toDate();

    // Load campaign
    const campaignDoc = await db
      .collection("booking_campaigns")
      .doc(bookingData.campaignId)
      .get();

    if (!campaignDoc.exists) {
      return res.status(404).json({ error: "Campagna non trovata" });
    }

    const campaign = campaignDoc.data() as BookingCampaign | undefined;

    if (!campaign?.attiva) {
      return res.status(400).json({ error: "Campagna non attiva" });
    }

    // Import Calendar Engine V2 modules
    const { campaignToAvailabilityConfig, getAllExistingBookingEvents } =
      await import("./booking/calendar-adapter.js");
    const { getAvailableSlotsForDate } = await import(
      "./calendar-engine/index.js"
    );
    const { DateTime } = await import("luxon");

    // Convert campaign to availability config
    const config = campaignToAvailabilityConfig(campaign);
    const dateObj = DateTime.fromJSDate(slotStart, { zone: "Europe/Rome" });
    const dayStart = dateObj.startOf("day").toJSDate();
    const dayEnd = dateObj.endOf("day").toJSDate();

    // Step 1: Check Google Calendar free/busy (catch external events)
    const { checkFreeBusy } = await import("./google-calendar.js");
    const busyPeriods = await checkFreeBusy("primary", slotStart, slotEnd);

    const hasCalendarConflict = busyPeriods.some((busy: any) => {
      const busyStart = new Date(busy.start);
      const busyEnd = new Date(busy.end);
      return slotStart < busyEnd && slotEnd > busyStart;
    });

    if (hasCalendarConflict) {
      console.warn(
        `[PATCH /v2/:id/approve] ⚠️ Google Calendar conflict detected for slot ${slotStart.toISOString()}`,
      );
      return res.status(409).json({
        error: "Conflitto calendario",
        message:
          "È stato aggiunto un evento sul calendario che si sovrappone con questa prenotazione. Impossibile confermare.",
      });
    }

    // Step 2: Load all existing events (exclude THIS booking from conflict check)
    const existingEvents = await getAllExistingBookingEvents(
      dayStart,
      dayEnd,
      db,
      id, // Exclude this booking from conflict check
    );

    // Step 3: Generate available slots using Calendar Engine V2
    const availableSlots = await getAvailableSlotsForDate(
      dayStart,
      config,
      existingEvents,
    );

    // Step 4: Verify slot is still available
    const slotStillAvailable = availableSlots.some(
      (slot) =>
        Math.abs(new Date(slot.start).getTime() - slotStart.getTime()) < 1000 &&
        Math.abs(new Date(slot.end).getTime() - slotEnd.getTime()) < 1000,
    );

    if (!slotStillAvailable) {
      console.warn(
        `[PATCH /v2/:id/approve] ❌ Conflict: slot not available for booking ${id}`,
      );
      return res.status(409).json({
        error: "Conflitto calendario",
        message:
          "È stato aggiunto un evento che si sovrappone con questa prenotazione. Impossibile confermare.",
      });
    }

    console.log(
      `[PATCH /v2/:id/approve] ✅ Slot verified available using Calendar Engine V2`,
    );

    // Crea evento Google Calendar con compensating transaction
    let calendarEventId = null;
    try {
      const { createEvent } = await import("./google-calendar.js");

      const calendarEvent = await createEvent("primary", {
        summary: `Shooting: ${bookingData.cliente.nome} ${bookingData.cliente.cognome}`,
        description: `Prenotazione shooting CONFERMATA\n\nCliente: ${bookingData.cliente.nome} ${bookingData.cliente.cognome}\nEmail: ${bookingData.cliente.email}\nWhatsApp: ${bookingData.cliente.whatsapp}\n${bookingData.prodottoNome ? `Prodotto: ${bookingData.prodottoNome}\n` : ""}${bookingData.note ? `Note: ${bookingData.note}` : ""}`,
        start: slotStart,
        end: slotEnd,
        location: "Studio fotografico",
        attendees: [bookingData.cliente.email],
      });

      calendarEventId = calendarEvent.id;
      console.log(`✅ Evento Google Calendar creato: ${calendarEventId}`);
    } catch (calendarError) {
      console.error(
        "❌ Errore creazione evento Google Calendar:",
        calendarError,
      );
      return res.status(503).json({
        error: "Errore Google Calendar",
        message:
          "Impossibile creare l'evento sul calendario. Riprova più tardi.",
        details:
          calendarError instanceof Error
            ? calendarError.message
            : "Errore sconosciuto",
      });
    }

    // Aggiorna stato a "confermata" con ID evento Calendar - con rollback su errore
    try {
      const currentWorkflowState = bookingDoc.data()?.statoWorkflow;
      const workflowUpdate = syncBookingWorkflowState(
        "confermata",
        currentWorkflowState,
      );

      await bookingRef.update({
        stato: "confermata",
        ...workflowUpdate,
        googleCalendarEventId: calendarEventId,
        confermataDa: adminUid || "admin",
        confermatail: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } catch (firestoreError) {
      // Rollback: cancella evento Calendar se update Firestore fallisce
      console.error(
        "❌ Errore update Firestore - eseguo rollback Calendar event",
        firestoreError,
      );
      try {
        const { deleteEvent } = await import("./google-calendar.js");
        await deleteEvent("primary", calendarEventId!);
        console.log(
          `✅ Rollback completato - evento Calendar cancellato: ${calendarEventId}`,
        );
      } catch (rollbackError) {
        console.error(
          "❌ ERRORE CRITICO: Fallito rollback Calendar event",
          rollbackError,
        );
      }

      return res.status(500).json({
        error: "Errore salvataggio",
        message:
          "Impossibile salvare la conferma. L'evento Calendar è stato cancellato automaticamente.",
      });
    }

    // Invia email "Prenotazione Confermata" (chiamata diretta alla funzione)
    try {
      const campaignName = campaign?.nome || "Shooting Fotografico";

      const bookingDate = slotStart.toLocaleDateString("it-IT", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      const bookingTime = `${slotStart.toLocaleTimeString("it-IT", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Rome",
      })} - ${slotEnd.toLocaleTimeString("it-IT", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Rome",
      })}`;

      const durationMinutes = Math.round(
        (slotEnd.getTime() - slotStart.getTime()) / (1000 * 60),
      );

      const {
        sendGmailEmail,
        createBookingConfirmedEmailHTML,
        getStudioContactInfo,
        generateGoogleCalendarLink,
      } = await import("./email-routes.js");

      const studioInfo = await getStudioContactInfo();

      const clienteName = `${bookingData.cliente.nome} ${bookingData.cliente.cognome}`;

      const calendarLink = generateGoogleCalendarLink({
        title: `Shooting ${campaignName} - ${clienteName}`,
        description: `Sessione fotografica: ${campaignName}\nCliente: ${clienteName}\n${bookingData.prodottoNome ? `Pacchetto: ${bookingData.prodottoNome}\n` : ""}${bookingData.note ? `Note: ${bookingData.note}\n` : ""}\n${studioInfo.name}\nTel: ${studioInfo.phone}`,
        location: studioInfo.address || "Studio fotografico",
        startDate: slotStart,
        endDate: slotEnd,
        isAllDay: false,
      });

      const emailHTML = createBookingConfirmedEmailHTML(
        clienteName,
        campaignName,
        bookingDate,
        bookingTime,
        durationMinutes,
        bookingData.prodottoNome,
        bookingData.note,
        studioInfo,
        calendarLink,
      );

      await sendGmailEmail(
        bookingData.cliente.email,
        `Prenotazione Confermata - ${campaignName}`,
        emailHTML,
      );

      await bookingRef.update({ emailConfermataInviata: true });
      console.log(
        `✅ Email "Prenotazione Confermata" inviata a ${bookingData.cliente.email}`,
      );
    } catch (emailError) {
      console.error("⚠️ Errore invio email conferma:", emailError);
      // Non bloccare l'approvazione se email fallisce
    }

    return res.json({
      success: true,
      message: "Prenotazione confermata con successo",
      bookingId: id,
    });
  } catch (error) {
    console.error("[Booking API V2] Errore approvazione prenotazione:", error);
    return res.status(500).json({
      error: "Errore interno del server",
      message: error instanceof Error ? error.message : "Errore sconosciuto",
    });
  }
});

/**
 * PATCH /api/booking/:id/approve
 * Approva prenotazione e invia email conferma
 *
 * Body: { adminUid: string }
 */
router.patch("/:id/approve", async (req, res) => {
  try {
    const { id } = req.params;
    const { adminUid } = req.body;

    if (!id) {
      return res.status(400).json({ error: "ID prenotazione mancante" });
    }

    // Inizializza Firebase Admin

    const bookingRef = db.collection("bookings").doc(id);
    const bookingDoc = await bookingRef.get();

    if (!bookingDoc.exists) {
      return res.status(404).json({ error: "Prenotazione non trovata" });
    }

    const bookingData = bookingDoc.data();

    if (!bookingData) {
      return res.status(404).json({ error: "Dati prenotazione non validi" });
    }

    // Verifica stato attuale
    if (bookingData.stato === "confermata") {
      return res.status(400).json({
        error: "Prenotazione già confermata",
        message: "Questa prenotazione è già stata approvata",
      });
    }

    // RIVALIDAZIONE: Verifica che lo slot sia ancora disponibile prima di creare evento
    const slotStart = bookingData.dataShootingInizio.toDate();
    const slotEnd = bookingData.dataShootingFine.toDate();

    // Verifica disponibilità su Google Calendar
    const { checkFreeBusy } = await import("./google-calendar.js");
    const busyPeriods = await checkFreeBusy("primary", slotStart, slotEnd);

    const hasCalendarConflict = busyPeriods.some((busy: any) => {
      const busyStart = new Date(busy.start);
      const busyEnd = new Date(busy.end);
      return slotStart < busyEnd && slotEnd > busyStart;
    });

    if (hasCalendarConflict) {
      console.log(
        `⚠️ Conflict detected on Calendar during approval for slot ${slotStart.toISOString()}`,
      );
      return res.status(409).json({
        error: "Conflitto calendario",
        message:
          "È stato aggiunto un evento sul calendario che si sovrappone con questa prenotazione. Impossibile confermare.",
      });
    }

    // Verifica overlap con altri booking in Firestore (escluso questo)
    // FIX: Usa Calendar Engine V2 per day boundaries corretti
    const { getDayBoundaries: getDayBoundariesOverride } = await import('./calendar-engine/timezone.js');
    const { dayStart, dayEnd } = getDayBoundariesOverride(slotStart, 0);

    const otherBookingsSnapshot = await db
      .collection("bookings")
      .where("dataShootingInizio", ">=", Timestamp.fromDate(dayStart))
      .where("dataShootingInizio", "<=", Timestamp.fromDate(dayEnd))
      .where("stato", "in", ["in_attesa", "confermata"])
      .get();

    const hasBookingConflict = otherBookingsSnapshot.docs.some((doc) => {
      if (doc.id === id) return false; // Salta questo stesso booking

      const otherBooking = doc.data();
      const otherStart = otherBooking.dataShootingInizio.toDate();
      const otherEnd = otherBooking.dataShootingFine.toDate();

      return slotStart < otherEnd && slotEnd > otherStart;
    });

    if (hasBookingConflict) {
      console.log(
        `⚠️ Overlap with other booking during approval for slot ${slotStart.toISOString()}`,
      );
      return res.status(409).json({
        error: "Prenotazione sovrapposta",
        message:
          "C'è un'altra prenotazione che si sovrappone con questa. Impossibile confermare.",
      });
    }

    // Crea evento Google Calendar con compensating transaction
    let calendarEventId = null;
    try {
      const { createEvent } = await import("./google-calendar.js");

      const calendarEvent = await createEvent("primary", {
        summary: `Shooting: ${bookingData.cliente.nome} ${bookingData.cliente.cognome}`,
        description: `Prenotazione shooting CONFERMATA\n\nCliente: ${bookingData.cliente.nome} ${bookingData.cliente.cognome}\nEmail: ${bookingData.cliente.email}\nWhatsApp: ${bookingData.cliente.whatsapp}\n${bookingData.prodottoNome ? `Prodotto: ${bookingData.prodottoNome}\n` : ""}${bookingData.note ? `Note: ${bookingData.note}` : ""}`,
        start: slotStart,
        end: slotEnd,
        location: "Studio fotografico",
        attendees: [bookingData.cliente.email],
      });

      calendarEventId = calendarEvent.id;
      console.log(`✅ Evento Google Calendar creato: ${calendarEventId}`);
    } catch (calendarError) {
      console.error(
        "❌ Errore creazione evento Google Calendar:",
        calendarError,
      );
      return res.status(503).json({
        error: "Errore Google Calendar",
        message:
          "Impossibile creare l'evento sul calendario. Riprova più tardi.",
        details:
          calendarError instanceof Error
            ? calendarError.message
            : "Errore sconosciuto",
      });
    }

    // Aggiorna stato a "confermata" con ID evento Calendar - con rollback su errore
    try {
      // Fix #2: Calcola nuovo statoWorkflow basato su stato esistente (spread-safe)
      const currentWorkflowState = bookingDoc.data()?.statoWorkflow;
      const workflowUpdate = syncBookingWorkflowState(
        "confermata",
        currentWorkflowState,
      );

      await bookingRef.update({
        stato: "confermata",
        ...workflowUpdate, // Fix #2: Spread workflow (omits if {})
        googleCalendarEventId: calendarEventId,
        confermataDa: adminUid || "admin",
        confermatail: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } catch (firestoreError) {
      // Rollback: cancella evento Calendar se update Firestore fallisce
      console.error(
        "❌ Errore update Firestore - eseguo rollback Calendar event",
        firestoreError,
      );
      try {
        const { deleteEvent } = await import("./google-calendar.js");
        await deleteEvent("primary", calendarEventId!);
        console.log(
          `✅ Rollback completato - evento Calendar cancellato: ${calendarEventId}`,
        );
      } catch (rollbackError) {
        console.error(
          "❌ ERRORE CRITICO: Fallito rollback Calendar event",
          rollbackError,
        );
      }

      return res.status(500).json({
        error: "Errore salvataggio",
        message:
          "Impossibile salvare la conferma. L'evento Calendar è stato cancellato automaticamente.",
      });
    }

    // Invia email "Prenotazione Confermata" (chiamata diretta alla funzione)
    try {
      // Recupera nome campagna
      const campaignDoc = await db
        .collection("booking_campaigns")
        .doc(bookingData.campaignId)
        .get();
      const campaignData = campaignDoc.data();
      const campaignName = campaignData?.nome || "Shooting Fotografico";

      // Formatta data e ora
      const slotStart = bookingData.dataShootingInizio.toDate();
      const slotEnd = bookingData.dataShootingFine.toDate();

      const bookingDate = slotStart.toLocaleDateString("it-IT", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      const bookingTime = `${slotStart.toLocaleTimeString("it-IT", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Rome",
      })} - ${slotEnd.toLocaleTimeString("it-IT", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Rome",
      })}`;

      // Calcola durata in minuti
      const durationMinutes = Math.round(
        (slotEnd.getTime() - slotStart.getTime()) / (1000 * 60),
      );

      // Import diretto delle funzioni email
      const {
        sendGmailEmail,
        createBookingConfirmedEmailHTML,
        getStudioContactInfo,
        generateGoogleCalendarLink,
      } = await import("./email-routes.js");

      // Recupera dati contatto studio
      const studioInfo = await getStudioContactInfo();

      const clienteName = `${bookingData.cliente.nome} ${bookingData.cliente.cognome}`;

      // Generate Google Calendar "Add to Calendar" link
      const calendarLink = generateGoogleCalendarLink({
        title: `Shooting ${campaignName} - ${clienteName}`,
        description: `Sessione fotografica: ${campaignName}\nCliente: ${clienteName}\n${bookingData.prodottoNome ? `Pacchetto: ${bookingData.prodottoNome}\n` : ""}${bookingData.note ? `Note: ${bookingData.note}\n` : ""}\n${studioInfo.name}\nTel: ${studioInfo.phone}`,
        location: studioInfo.address || "Studio fotografico",
        startDate: slotStart,
        endDate: slotEnd,
        isAllDay: false,
      });

      const emailHTML = createBookingConfirmedEmailHTML(
        clienteName,
        campaignName,
        bookingDate,
        bookingTime,
        durationMinutes,
        bookingData.prodottoNome,
        bookingData.note,
        studioInfo,
        calendarLink,
      );

      await sendGmailEmail(
        bookingData.cliente.email,
        `Prenotazione Confermata - ${campaignName}`,
        emailHTML,
      );

      // Aggiorna flag email confermata inviata
      await bookingRef.update({ emailConfermataInviata: true });
      console.log(
        `✅ Email "Prenotazione Confermata" inviata a ${bookingData.cliente.email}`,
      );
    } catch (emailError) {
      console.error("⚠️ Errore invio email conferma:", emailError);
      // Non bloccare l'approvazione se email fallisce
    }

    return res.json({
      success: true,
      message: "Prenotazione confermata con successo",
      bookingId: id,
    });
  } catch (error) {
    console.error("[Booking API] Errore approvazione prenotazione:", error);
    return res.status(500).json({
      error: "Errore interno del server",
      message: error instanceof Error ? error.message : "Errore sconosciuto",
    });
  }
});

/**
 * PATCH /api/booking/:id/reject
 * Rifiuta prenotazione e invia email con link per prenotare altro giorno
 *
 * Body: { adminUid: string }
 */
router.patch("/:id/reject", async (req, res) => {
  try {
    const { id } = req.params;
    const { adminUid } = req.body;

    console.log(
      `[Booking API] Rifiuto prenotazione ${id} da admin ${adminUid}`,
    );

    // Recupera booking da Firestore
    const bookingRef = db.collection("bookings").doc(id);
    const bookingDoc = await bookingRef.get();

    if (!bookingDoc.exists) {
      return res.status(404).json({ error: "Prenotazione non trovata" });
    }

    const bookingData = bookingDoc.data();
    if (!bookingData) {
      return res.status(404).json({ error: "Dati prenotazione non validi" });
    }

    // Verifica stato attuale
    if (bookingData.stato === "annullata") {
      return res.status(400).json({
        error: "Prenotazione già annullata",
        message: "Questa prenotazione è già stata annullata",
      });
    }

    // Prepara update data
    // Fix #2: Preserva statoWorkflow esistente per booking annullate (spread-safe)
    const currentWorkflowState = bookingData.statoWorkflow;
    const workflowUpdate = syncBookingWorkflowState(
      "annullata",
      currentWorkflowState,
    );

    let updateData: any = {
      stato: "annullata",
      ...workflowUpdate, // Fix #2: Spread workflow (omits if {} for legacy)
      rifiutataDa: adminUid || "admin",
      rifiutataIl: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    // Se era confermata, cancella evento Google Calendar
    if (
      bookingData.stato === "confermata" &&
      bookingData.googleCalendarEventId
    ) {
      try {
        const { deleteEvent } = await import("./google-calendar.js");
        await deleteEvent("primary", bookingData.googleCalendarEventId);
        console.log(
          `✅ Evento Google Calendar cancellato: ${bookingData.googleCalendarEventId}`,
        );
        // Rimuovi googleCalendarEventId dopo la cancellazione
        updateData.googleCalendarEventId = null;
      } catch (calendarError) {
        console.error(
          "⚠️ Errore cancellazione evento Google Calendar:",
          calendarError,
        );
        // Non bloccare il rifiuto se cancellazione Calendar fallisce
      }
    }

    // Aggiorna stato a "annullata" (rifiutata)
    await bookingRef.update(updateData);

    // Invia email "Prenotazione Rifiutata" con link per nuova prenotazione
    try {
      // Recupera nome campagna
      const campaignDoc = await db
        .collection("booking_campaigns")
        .doc(bookingData.campaignId)
        .get();
      const campaignData = campaignDoc.data();
      const campaignName = campaignData?.nome || "Shooting Fotografico";

      // Formatta data
      const slotStart = bookingData.dataShootingInizio.toDate();
      const bookingDate = slotStart.toLocaleDateString("it-IT", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      // Import diretto delle funzioni email
      const {
        sendGmailEmail,
        createBookingRejectedEmailHTML,
        getStudioContactInfo,
        getSiteBaseUrl,
      } = await import("./email-routes.js");

      // Crea URL assoluto per booking page della campagna
      const baseUrl = getSiteBaseUrl(req);
      const bookingUrl = `${baseUrl}/booking/${bookingData.campaignId}`;

      // Recupera dati contatto studio
      const studioInfo = await getStudioContactInfo();

      const clienteName = `${bookingData.cliente.nome} ${bookingData.cliente.cognome}`;
      const emailHTML = createBookingRejectedEmailHTML(
        clienteName,
        campaignName,
        bookingDate,
        bookingUrl,
        studioInfo,
      );

      await sendGmailEmail(
        bookingData.cliente.email,
        `Prenotazione Non Disponibile - ${campaignName}`,
        emailHTML,
      );

      // Aggiorna flag email rifiuto inviata
      await bookingRef.update({ emailRifiutoInviata: true });
      console.log(
        `✅ Email "Prenotazione Rifiutata" inviata a ${bookingData.cliente.email}`,
      );
    } catch (emailError) {
      console.error("⚠️ Errore invio email rifiuto:", emailError);
      // Non bloccare il rifiuto se email fallisce
    }

    return res.json({
      success: true,
      message: "Prenotazione rifiutata con successo",
      bookingId: id,
    });
  } catch (error) {
    console.error("[Booking API] Errore rifiuto prenotazione:", error);
    return res.status(500).json({
      error: "Errore interno del server",
      message: error instanceof Error ? error.message : "Errore sconosciuto",
    });
  }
});

/**
 * GET /api/booking/calendar/:id
 * Genera e serve file .ics per aggiungere al calendario
 */
router.get("/calendar/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Recupera booking da Firestore
    const bookingRef = db.collection("bookings").doc(id);
    const bookingDoc = await bookingRef.get();

    if (!bookingDoc.exists) {
      return res.status(404).json({ error: "Prenotazione non trovata" });
    }

    const bookingData = bookingDoc.data();

    // Solo prenotazioni confermate possono essere aggiunte al calendario
    if (bookingData?.stato !== "confermata") {
      return res
        .status(403)
        .json({ error: "Prenotazione non ancora confermata" });
    }

    // Recupera nome campagna
    const campaignDoc = await db
      .collection("booking_campaigns")
      .doc(bookingData.campaignId)
      .get();
    const campaignName = campaignDoc.data()?.nome || "Shooting Fotografico";

    // Recupera dati studio
    const { getStudioContactInfo } = await import("./email-routes.js");
    const studioInfo = await getStudioContactInfo();

    // Converti timestamp in Date
    const slotStart = bookingData.dataShootingInizio.toDate();
    const slotEnd = bookingData.dataShootingFine.toDate();

    // Genera file .ics
    const formatICalDate = (date: Date): string => {
      return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    };

    const icsContent = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Image Studio Fotografico//Booking System//IT",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `DTSTART:${formatICalDate(slotStart)}`,
      `DTEND:${formatICalDate(slotEnd)}`,
      `SUMMARY:Shooting Fotografico - ${campaignName}`,
      `DESCRIPTION:Sessione fotografica ${campaignName}${bookingData.prodottoNome ? ` - ${bookingData.prodottoNome}` : ""}${bookingData.note ? `\\n\\nNote: ${bookingData.note}` : ""}`,
      `LOCATION:${studioInfo.address || studioInfo.name}`,
      `ORGANIZER;CN=${studioInfo.name}:mailto:${studioInfo.email}`,
      "STATUS:CONFIRMED",
      "SEQUENCE:0",
      "BEGIN:VALARM",
      "TRIGGER:-PT24H",
      "DESCRIPTION:Promemoria shooting fotografico",
      "ACTION:DISPLAY",
      "END:VALARM",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    // Imposta headers per download file .ics
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="shooting_${campaignName.replace(/\s+/g, "_")}.ics"`,
    );
    res.send(icsContent);

    console.log(`✅ File calendario generato per booking ${id}`);
  } catch (error) {
    console.error("[Booking API] Errore generazione calendario:", error);
    return res.status(500).json({
      error: "Errore generazione file calendario",
      message: error instanceof Error ? error.message : "Errore sconosciuto",
    });
  }
});

/**
 * PATCH /api/booking/:id/status
 * Cambia stato prenotazione e invia email notifica al cliente
 *
 * Body: { stato: 'in_attesa' | 'confermata' | 'completata' | 'annullata' }
 */
router.patch("/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { stato } = req.body;

    if (!id || !stato) {
      return res
        .status(400)
        .json({ error: "ID prenotazione e stato mancanti" });
    }

    // Validazione stato
    const validStati = ["in_attesa", "confermata", "completata", "annullata"];
    if (!validStati.includes(stato)) {
      return res.status(400).json({
        error: "Stato invalido",
        message: `Stato deve essere uno tra: ${validStati.join(", ")}`,
      });
    }

    // Inizializza Firebase Admin

    const bookingRef = db.collection("bookings").doc(id);
    const bookingDoc = await bookingRef.get();

    if (!bookingDoc.exists) {
      return res.status(404).json({ error: "Prenotazione non trovata" });
    }

    const bookingData = bookingDoc.data();

    if (!bookingData) {
      return res.status(404).json({ error: "Dati prenotazione non validi" });
    }

    const oldStato = bookingData.stato;

    // Fix #2: Sync statoWorkflow basato su nuovo stato (spread-safe)
    const currentWorkflowState = bookingData.statoWorkflow;
    const workflowUpdate = syncBookingWorkflowState(
      stato,
      currentWorkflowState,
    );

    // Se la prenotazione viene annullata e ha un evento Google Calendar, cancellalo
    let updateData: any = {
      stato,
      ...workflowUpdate, // Fix #2: Spread workflow (omits if {} for legacy/annullata)
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (stato === "annullata" && bookingData.googleCalendarEventId) {
      try {
        const { deleteEvent } = await import("./google-calendar.js");
        await deleteEvent("primary", bookingData.googleCalendarEventId);
        console.log(
          `✅ Evento Google Calendar cancellato: ${bookingData.googleCalendarEventId}`,
        );
        // Rimuovi googleCalendarEventId dopo la cancellazione
        updateData.googleCalendarEventId = null;
      } catch (calendarError) {
        console.error(
          "⚠️ Errore cancellazione evento Google Calendar:",
          calendarError,
        );
        // Non bloccare l'annullamento se cancellazione Calendar fallisce
      }
    }

    // Aggiorna stato
    await bookingRef.update(updateData);

    console.log(
      `✅ Stato prenotazione ${id} cambiato da "${oldStato}" a "${stato}"`,
    );
    
    // SYNC BOOKING → ORDINE: Se booking viene annullata, annulla anche l'ordine associato
    if (stato === "annullata") {
      try {
        // Cerca ordini associati a questo booking
        const ordersSnapshot = await db.collection("orders")
          .where("bookingId", "==", id)
          .get();
        
        if (!ordersSnapshot.empty) {
          for (const orderDoc of ordersSnapshot.docs) {
            const orderData = orderDoc.data();
            // Annulla solo se l'ordine non è già annullato o completato
            if (orderData.stato !== 'annullato' && orderData.stato !== 'completato') {
              await db.collection("orders").doc(orderDoc.id).update({
                stato: 'annullato',
                updatedAt: FieldValue.serverTimestamp()
              });
              console.log(`✅ Ordine ${orderDoc.id} annullato (sync da booking ${id})`);
              
              // Se l'ordine ha una galleria associata, aggiorna anche quella
              if (orderData.galleryId) {
                try {
                  await db.collection("galleries").doc(orderData.galleryId).update({
                    orderStatus: 'annullato',
                    updatedAt: FieldValue.serverTimestamp()
                  });
                  console.log(`✅ Galleria ${orderData.galleryId} aggiornata con orderStatus: annullato`);
                } catch (galleryError: any) {
                  console.error(`⚠️ Errore aggiornamento galleria ${orderData.galleryId}:`, galleryError.message);
                }
              }
            }
          }
        }
      } catch (orderSyncError: any) {
        console.error(`⚠️ Errore sincronizzazione ordini per booking ${id}:`, orderSyncError.message);
        // Non blocca l'operazione
      }
    }

    // Invia email notifica al cliente solo se stato cambia (e non è già "confermata" che usa /approve)
    try {
      // Recupera nome campagna
      const campaignDoc = await db
        .collection("booking_campaigns")
        .doc(bookingData.campaignId)
        .get();
      const campaignName = campaignDoc.data()?.nome || "Shooting Fotografico";

      // Formatta data
      const slotStart = bookingData.dataShootingInizio.toDate();
      const bookingDate = slotStart.toLocaleDateString("it-IT", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      // Import funzioni email
      const {
        sendGmailEmail,
        createBookingCompletedEmailHTML,
        createBookingCancelledEmailHTML,
        getStudioContactInfo,
      } = await import("./email-routes.js");

      // Recupera dati contatto studio
      const studioInfo = await getStudioContactInfo();

      const clienteName = `${bookingData.cliente.nome} ${bookingData.cliente.cognome}`;
      let emailHTML = "";
      let subject = "";

      // Determina email template basato su nuovo stato
      switch (stato) {
        case "completata":
          emailHTML = createBookingCompletedEmailHTML(
            clienteName,
            campaignName,
            bookingDate,
            studioInfo,
          );
          subject = `Shooting Completato - ${campaignName}`;
          break;

        case "annullata":
          emailHTML = createBookingCancelledEmailHTML(
            clienteName,
            campaignName,
            bookingDate,
            studioInfo,
          );
          subject = `Prenotazione Annullata - ${campaignName}`;
          break;

        default:
          // Per 'in_attesa' e 'confermata' non inviamo email (gestite da altre route)
          console.log(`ℹ️ Nessuna email da inviare per stato "${stato}"`);
          return res.json({
            success: true,
            message: "Stato aggiornato con successo",
            bookingId: id,
            newStato: stato,
          });
      }

      // Invia email
      if (emailHTML && subject) {
        await sendGmailEmail(bookingData.cliente.email, subject, emailHTML);
        console.log(
          `✅ Email cambio stato "${stato}" inviata a ${bookingData.cliente.email}`,
        );
      }
    } catch (emailError) {
      console.error("⚠️ Errore invio email cambio stato:", emailError);
      // Non bloccare l'aggiornamento stato se email fallisce
    }

    return res.json({
      success: true,
      message: "Stato aggiornato con successo",
      bookingId: id,
      newStato: stato,
    });
  } catch (error) {
    console.error("[Booking API] Errore cambio stato prenotazione:", error);
    return res.status(500).json({
      error: "Errore interno del server",
      message: error instanceof Error ? error.message : "Errore sconosciuto",
    });
  }
});

/**
 * GET /api/booking/health
 * Health check per booking API
 */
router.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "booking-api",
    timestamp: new Date().toISOString(),
  });
});

/**
 * PATCH /api/booking/:id/update
 * Aggiorna dati prenotazione (nome, email, whatsapp, note)
 * Invia notifica email se l'email cambia
 *
 * Body: {
 *   cliente?: { nome?, cognome?, email?, whatsapp? },
 *   note?: string,
 *   oldEmail?: string // Per rilevare cambio email
 * }
 */
router.patch("/:id/update", async (req, res) => {
  try {
    const { id } = req.params;
    const { cliente, note, oldEmail } = req.body;

    if (!id) {
      return res.status(400).json({ error: "ID prenotazione mancante" });
    }

    // Inizializza Firebase Admin

    const bookingRef = db.collection("bookings").doc(id);
    const bookingDoc = await bookingRef.get();

    if (!bookingDoc.exists) {
      return res.status(404).json({ error: "Prenotazione non trovata" });
    }

    const bookingData = bookingDoc.data();

    if (!bookingData) {
      return res.status(404).json({ error: "Dati prenotazione non validi" });
    }

    // Prepara update data
    const updateData: any = {
      updatedAt: FieldValue.serverTimestamp(),
    };

    // Aggiorna dati cliente se forniti
    if (cliente) {
      const currentCliente = bookingData.cliente || {};
      updateData.cliente = {
        ...currentCliente,
        ...(cliente.nome !== undefined && { nome: cliente.nome }),
        ...(cliente.cognome !== undefined && { cognome: cliente.cognome }),
        ...(cliente.email !== undefined && { email: cliente.email }),
        ...(cliente.whatsapp !== undefined && { whatsapp: cliente.whatsapp }),
      };
    }

    // Aggiorna note se fornite
    if (note !== undefined) {
      updateData.note = note;
    }

    // Aggiorna Firestore
    await bookingRef.update(updateData);

    console.log(`✅ Prenotazione ${id} aggiornata con successo`);

    // Rilevamento cambio email e invio notifica
    const newEmail = cliente?.email;
    const emailChanged = oldEmail && newEmail && oldEmail !== newEmail;

    if (emailChanged) {
      console.log(
        `📧 Email cambiata da "${oldEmail}" a "${newEmail}" - invio notifica`,
      );

      try {
        // Recupera nome campagna
        const campaignDoc = await db
          .collection("booking_campaigns")
          .doc(bookingData.campaignId)
          .get();
        const campaignName = campaignDoc.data()?.nome || "Shooting Fotografico";

        // Formatta data
        const slotStart = bookingData.dataShootingInizio.toDate();
        const bookingDate = slotStart.toLocaleDateString("it-IT", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        });
        const bookingTime = slotStart.toLocaleTimeString("it-IT", {
          hour: "2-digit",
          minute: "2-digit",
        });

        // Import funzioni email
        const { sendGmailEmail, getStudioContactInfo } = await import(
          "./email-routes.js"
        );
        const studioInfo = await getStudioContactInfo();

        const clienteName = `${updateData.cliente.nome || bookingData.cliente.nome} ${updateData.cliente.cognome || bookingData.cliente.cognome}`;

        // Template email notifica cambio email
        const emailHTML = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: 'Arial', sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f4f4f4;">
            <div style="background-color: #ffffff; border-radius: 10px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
              <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #8B7355; margin: 0; font-size: 28px;">📧 Email Aggiornata</h1>
              </div>
              
              <p style="font-size: 16px; margin-bottom: 20px;">Gentile <strong>${clienteName}</strong>,</p>
              
              <p style="font-size: 16px; margin-bottom: 20px;">
                Ti informiamo che l'indirizzo email associato alla tua prenotazione è stato aggiornato con successo.
              </p>

              <div style="background-color: #f8f8f8; border-left: 4px solid #8B7355; padding: 15px; margin: 25px 0; border-radius: 5px;">
                <p style="margin: 0; font-size: 14px; color: #666;">
                  <strong>Email precedente:</strong> ${oldEmail}
                </p>
                <p style="margin: 10px 0 0 0; font-size: 14px; color: #666;">
                  <strong>Nuova email:</strong> ${newEmail}
                </p>
              </div>

              <div style="background-color: #e8f5e9; border-radius: 8px; padding: 20px; margin: 25px 0;">
                <h3 style="color: #2e7d32; margin-top: 0; font-size: 18px;">📅 Riepilogo Prenotazione</h3>
                <p style="margin: 10px 0; font-size: 15px;"><strong>Servizio:</strong> ${campaignName}</p>
                <p style="margin: 10px 0; font-size: 15px;"><strong>Data:</strong> ${bookingDate}</p>
                <p style="margin: 10px 0; font-size: 15px;"><strong>Ora:</strong> ${bookingTime}</p>
              </div>

              <div style="background-color: #fff3e0; border-radius: 8px; padding: 15px; margin: 25px 0;">
                <p style="margin: 0; font-size: 14px; color: #e65100;">
                  ⚠️ <strong>Importante:</strong> D'ora in avanti tutte le comunicazioni verranno inviate a <strong>${newEmail}</strong>.
                  Se non hai richiesto questa modifica, contattaci immediatamente.
                </p>
              </div>

              <p style="font-size: 16px; margin: 25px 0;">
                Ti aspettiamo! Per qualsiasi dubbio o informazione, non esitare a contattarci.
              </p>

              <div style="border-top: 2px solid #e0e0e0; margin-top: 30px; padding-top: 20px; text-align: center;">
                <p style="margin: 5px 0; font-size: 14px; color: #666;">
                  <strong>${studioInfo.name}</strong>
                </p>
                ${studioInfo.phone ? `<p style="margin: 5px 0; font-size: 14px; color: #666;">📞 ${studioInfo.phone}</p>` : ""}
                ${studioInfo.email ? `<p style="margin: 5px 0; font-size: 14px; color: #666;">📧 ${studioInfo.email}</p>` : ""}
                ${studioInfo.address ? `<p style="margin: 5px 0; font-size: 14px; color: #666;">📍 ${studioInfo.address}</p>` : ""}
              </div>
            </div>
          </body>
          </html>
        `;

        // Invia email alla NUOVA email
        await sendGmailEmail(
          newEmail,
          `Email Aggiornata - ${campaignName}`,
          emailHTML,
        );

        console.log(`✅ Email notifica cambio email inviata a ${newEmail}`);
      } catch (emailError) {
        console.error("❌ Errore invio email notifica cambio:", emailError);
        // Non bloccare la risposta se l'email fallisce
      }
    }

    return res.json({
      success: true,
      message: "Prenotazione aggiornata con successo",
      bookingId: id,
      emailChanged,
    });
  } catch (error) {
    console.error("[Booking API] Errore aggiornamento prenotazione:", error);
    return res.status(500).json({
      error: "Errore interno del server",
      message: error instanceof Error ? error.message : "Errore sconosciuto",
    });
  }
});

/**
 * DELETE /api/booking/:bookingId/calendar-event
 * Cancella l'evento Google Calendar associato a una prenotazione
 *
 * STATE-MACHINE CANCELLATION:
 * 1. Marca booking come 'cancellation_pending' (mantieni googleCalendarEventId)
 * 2. Tenta Calendar delete
 * 3. Se success → 'cancellata' + rimuovi googleCalendarEventId
 * 4. Se fail → rimane 'cancellation_pending' + googleCalendarEventId per retry
 *
 * Questo garantisce:
 * - MAI stato='confermata' senza Calendar event
 * - Retry automatico possibile (googleCalendarEventId mantenuto)
 * - Eventual consistency con automated/manual retry
 */
router.delete("/:bookingId/calendar-event", async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { googleCalendarEventId } = req.body;

    if (!googleCalendarEventId) {
      return res.status(400).json({
        error: "googleCalendarEventId mancante",
      });
    }

    const bookingRef = db.collection("bookings").doc(bookingId);
    const bookingDoc = await bookingRef.get();

    if (!bookingDoc.exists) {
      return res.status(404).json({
        error: "Booking non trovato in Firestore",
      });
    }

    const bookingData = bookingDoc.data();
    const currentState = bookingData?.stato;
    const currentWorkflowState = bookingData?.statoWorkflow;

    // Step 1: Marca come 'cancellation_pending' (se non già cancellata/pending)
    if (
      currentState !== "cancellata" &&
      currentState !== "cancellation_pending"
    ) {
      await bookingRef.update({
        stato: "cancellation_pending",
        cancellationMetadata: {
          initiatedAt: FieldValue.serverTimestamp(),
          reason: "Evento cancellato da Google Calendar",
          googleCalendarEventId: googleCalendarEventId,
          // Retry tracking per automated worker
          retryAttempts: 0,
          lastAttemptAt: Timestamp.now(),
          nextRetryAt: Timestamp.now(), // Immediate first retry - concrete Timestamp for worker query
          lastErrorCode: null,
          lastErrorMessage: null,
          // NON salvare originalStato/originalStatoWorkflow: mai usati, evita stale data
          // Refetch latest workflow state in Step 3 invece
        },
        updatedAt: FieldValue.serverTimestamp(),
      });
      console.log(
        `✅ Step 1: Booking ${bookingId} → stato='cancellation_pending'`,
      );
    } else {
      console.log(
        `ℹ️  Booking ${bookingId} già in stato='${currentState}' - skip pending`,
      );
    }

    // Step 2: Tenta Calendar delete
    const { deleteEvent } = await import("./google-calendar.js");
    let calendarDeleted = false;

    try {
      await deleteEvent("primary", googleCalendarEventId);
      calendarDeleted = true;
      console.log(
        `✅ Step 2: Evento Google Calendar cancellato: ${googleCalendarEventId}`,
      );
    } catch (error: any) {
      // Se 404, evento già cancellato
      if (error.code === 404 || error.message?.includes("Not Found")) {
        calendarDeleted = true;
        console.log(
          `ℹ️  Evento già cancellato (404) - procedo con finalizzazione`,
        );
      } else {
        // Calendar API failure - update retry metadata e mantieni 'cancellation_pending'
        console.error(
          `❌ Calendar delete fallito - booking rimane 'cancellation_pending': ${error.message}`,
        );

        const currentMetadata = bookingData?.cancellationMetadata || {};
        const retryAttempts = (currentMetadata.retryAttempts || 0) + 1;
        const backoffMinutes = Math.min(Math.pow(2, retryAttempts), 60); // Exponential backoff, max 60min
        const nextRetryAt = new Date(Date.now() + backoffMinutes * 60 * 1000);

        await bookingRef.update({
          "cancellationMetadata.retryAttempts": retryAttempts,
          "cancellationMetadata.lastAttemptAt": FieldValue.serverTimestamp(),
          "cancellationMetadata.nextRetryAt": Timestamp.fromDate(nextRetryAt),
          "cancellationMetadata.lastErrorCode": error.code || "UNKNOWN",
          "cancellationMetadata.lastErrorMessage": error.message,
          updatedAt: FieldValue.serverTimestamp(),
        });

        console.log(
          `ℹ️  Retry metadata updated: attempts=${retryAttempts}, nextRetry in ${backoffMinutes}min`,
        );

        return res.status(500).json({
          error: "Calendar delete fallito - booking in cancellation_pending",
          details: error.message,
          retryable: true,
          bookingState: "cancellation_pending",
          retryAttempts,
          nextRetryAt: nextRetryAt.toISOString(),
        });
      }
    }

    // Step 3: Finalizza cancellazione (SOLO se Calendar delete success)
    if (calendarDeleted) {
      // IMPORTANTE: Re-fetch Firestore per ottenere workflow state AGGIORNATO
      // (potrebbe essere cambiato da retry precedenti o altri update concorrenti)
      const latestBookingDoc = await bookingRef.get();
      if (!latestBookingDoc.exists) {
        throw new Error("Booking non trovato durante finalizzazione");
      }

      const latestData = latestBookingDoc.data();
      const latestWorkflowState = latestData?.statoWorkflow;
      const workflowUpdate = syncBookingWorkflowState(
        "cancellata",
        latestWorkflowState,
      );

      await bookingRef.update({
        stato: "cancellata",
        ...workflowUpdate,
        googleCalendarEventId: FieldValue.delete(),
        cancelledAt: FieldValue.serverTimestamp(),
        cancelledReason: "Evento cancellato da Google Calendar",
        cancellationMetadata: FieldValue.delete(), // Cleanup metadata
        updatedAt: FieldValue.serverTimestamp(),
      });
      console.log(
        `✅ Step 3: Booking ${bookingId} → stato='cancellata' (workflow da ${latestWorkflowState}), googleCalendarEventId rimosso`,
      );

      return res.status(200).json({
        success: true,
        message: "Booking cancellato completamente",
        finalState: "cancellata",
      });
    }
  } catch (error: any) {
    console.error("❌ Errore critico cancellazione booking:", error);
    res.status(500).json({
      error: "Errore critico durante la cancellazione del booking",
      details: error.message,
      retryable: false,
    });
  }
});

/**
 * ========================================
 * NEW CALENDAR ENGINE V2 — Unified API for Bookings
 * ========================================
 * Endpoint v2 that uses centralized Calendar Engine
 * Legacy endpoint /available-slots remains untouched
 */

/**
 * POST /api/booking/v2/create
 * Crea booking usando Calendar Engine V2 per conflict detection
 * 
 * Body: {
 *   campaignId: string,
 *   cliente: { nome, cognome, email, whatsapp },
 *   dataShootingInizio: ISO string,
 *   dataShootingFine: ISO string,
 *   prodottoId?: string (legacy),
 *   prodottoNome?: string (legacy),
 *   prodotti?: OrderItem[] (multi-product),
 *   note: string,
 *   isManual?: boolean,
 *   createdByAdmin?: string
 * }
 * 
 * NOTA: Non richiede più workingHours/durataMinuti - vengono presi dalla campaign
 */
router.post("/v2/create", async (req, res) => {
  try {
    console.log("[POST /v2/create] 🔵 Calendar Engine V2 - Request");
    
    const {
      campaignId,
      cliente,
      dataShootingInizio,
      dataShootingFine,
      prodottoId,
      prodottoNome,
      prodotti,
      note,
      isManual,
      createdByAdmin,
      // Campi pagamento (per prenotazioni manuali con ordine integrato)
      totale,
      acconto,
      metodoPagamento,
    } = req.body;

    // Validazione parametri base
    if (!campaignId || !cliente || !dataShootingInizio || !dataShootingFine) {
      return res.status(400).json({
        error: "Parametri mancanti",
      });
    }

    // Validazione cliente
    const requiredFields = isManual
      ? !cliente.nome?.trim() ||
        !cliente.cognome?.trim() ||
        !cliente.email?.trim()
      : !cliente.nome?.trim() ||
        !cliente.cognome?.trim() ||
        !cliente.email?.trim() ||
        !cliente.whatsapp?.trim();

    if (requiredFields) {
      return res.status(400).json({
        error: "Dati cliente incompleti",
      });
    }

    // Parse date
    const slotStart = new Date(dataShootingInizio);
    const slotEnd = new Date(dataShootingFine);

    if (isNaN(slotStart.getTime()) || isNaN(slotEnd.getTime())) {
      return res.status(400).json({
        error: "Date invalide",
      });
    }

    // Step 1: Load and validate campaign
    const campaignDoc = await db.collection("booking_campaigns").doc(campaignId).get();

    if (!campaignDoc.exists) {
      return res.status(404).json({ error: "Campagna non trovata" });
    }

    const campaign = campaignDoc.data() as BookingCampaign | undefined;

    if (!campaign?.attiva) {
      return res.status(400).json({ error: "Campagna non attiva" });
    }

    // Step 2: Import Calendar Engine modules
    const { campaignToAvailabilityConfig, validateCampaign } = await import('./booking/calendar-adapter.js');
    const { getAvailableSlotsForDate } = await import('./calendar-engine/index.js');
    const { DateTime } = await import('luxon');

    if (!validateCampaign(campaign)) {
      return res.status(400).json({
        error: "Campagna configurazione invalida",
        message: "Campagna manca di orari lavorativi o durata shooting"
      });
    }

    // Step 3: Verify excluded days
    // FIX: Usa Calendar Engine V2 per weekday detection corretto
    const excludedDays = campaign?.excludedDays || [];
    if (excludedDays.length > 0) {
      const { toRome: toRomeWeekday, getWeekday: getWeekdayV2 } = await import('./calendar-engine/timezone.js');
      const romeDateSlot2 = toRomeWeekday(slotStart);
      const dayOfWeek = getWeekdayV2(romeDateSlot2);
      if (excludedDays.includes(dayOfWeek)) {
        return res.status(400).json({
          error: "Giorno non disponibile",
          message: "Il giorno selezionato non è disponibile per le prenotazioni in questa campagna.",
        });
      }
    }

    // Step 4: Validate products belong to campaign (skip for manual bookings - admin can use any product)
    if (!isManual) {
      const prodottiDisponibili = campaign?.prodottiDisponibili || [];
      const prodottiDisponibiliIds = prodottiDisponibili.map((p: any) =>
        typeof p === "string" ? p : p.id,
      );

      if (prodotti && Array.isArray(prodotti) && prodotti.length > 0) {
        const invalidProducts = prodotti.filter(
          (item: any) => !prodottiDisponibiliIds.includes(item.prodottoId),
        );

        if (invalidProducts.length > 0) {
          return res.status(400).json({
            error: "Prodotti non validi",
            message: "Alcuni prodotti selezionati non sono disponibili per questa campagna.",
          });
        }
      }

      if (prodottoId && !prodottiDisponibiliIds.includes(prodottoId)) {
        return res.status(400).json({
          error: "Prodotto non valido",
          message: "Il prodotto selezionato non è disponibile per questa campagna.",
        });
      }
    }

    // Step 5: Calendar Engine V2 conflict detection
    const config = campaignToAvailabilityConfig(campaign);
    const dateObj = DateTime.fromISO(dataShootingInizio, { zone: "Europe/Rome" });
    const dayStart = dateObj.startOf("day").toJSDate();
    const dayEnd = dateObj.endOf("day").toJSDate();

    // Load all existing events
    const { getAllExistingBookingEvents } = await import('./booking/calendar-adapter.js');
    const existingEvents = await getAllExistingBookingEvents(dayStart, dayEnd, db);

    // Generate available slots
    const availableSlots = await getAvailableSlotsForDate(dayStart, config, existingEvents);

    // Verify slot is still available
    const slotStillAvailable = availableSlots.some(
      (slot) =>
        Math.abs(new Date(slot.start).getTime() - slotStart.getTime()) < 1000 &&
        Math.abs(new Date(slot.end).getTime() - slotEnd.getTime()) < 1000,
    );

    if (!slotStillAvailable) {
      console.warn(`[POST /v2/create] ❌ Conflict: slot not available`);
      return res.status(409).json({
        error: "Slot non più disponibile",
        message: "Lo slot selezionato è stato prenotato da qualcun altro. Scegli un altro orario.",
      });
    }

    console.log(`[POST /v2/create] ✅ Slot verified available using Calendar Engine V2`);

    // Step 6: Create booking (same as legacy)
    const workflowUpdate = syncBookingWorkflowState("in_attesa");

    const bookingData: any = {
      campaignId,
      cliente: {
        nome: cliente.nome.trim(),
        cognome: cliente.cognome.trim(),
        email: cliente.email.trim().toLowerCase(),
        whatsapp: cliente.whatsapp?.trim() || "",
      },
      dataShootingInizio: Timestamp.fromDate(slotStart),
      dataShootingFine: Timestamp.fromDate(slotEnd),
      prodottoId: prodottoId || null,
      prodottoNome: prodottoNome || null,
      prodotti: prodotti || null,
      note: note || "",
      stato: isManual ? "confermata" : "in_attesa", // Auto-approve manual bookings
      ...workflowUpdate,
      emailRicevutaInviata: false,
      emailConfermataInviata: false,
      googleCalendarEventId: null, // Will be set for manual bookings below
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (isManual) {
      bookingData.isManual = true;
      bookingData.createdByAdmin = createdByAdmin || "admin";
      bookingData.confermataDa = createdByAdmin || "admin";
      bookingData.confermatail = FieldValue.serverTimestamp();
      
      // Aggiungi dati pagamento se presenti (prenotazione manuale con ordine integrato)
      if (typeof totale === 'number' && totale > 0) {
        // Validazione: acconto non può superare totale
        const accontoValue = typeof acconto === 'number' ? Math.min(Math.max(0, acconto), totale) : 0;
        const saldoValue = Math.max(0, totale - accontoValue);
        
        bookingData.totale = totale;
        bookingData.acconto = accontoValue;
        bookingData.saldo = saldoValue;
        bookingData.metodoPagamento = metodoPagamento || 'contante';
        
        // Crea prima transazione se acconto > 0
        if (accontoValue > 0) {
          bookingData.transactions = [{
            tipo: saldoValue === 0 ? 'saldo' : 'acconto',
            importo: accontoValue,
            metodo: metodoPagamento || 'contante',
            data: Timestamp.now(),
            note: saldoValue === 0 ? 'Pagamento completo' : 'Acconto alla prenotazione',
            emailInviata: false,
          }];
        } else {
          bookingData.transactions = [];
        }
      }
    }

    const bookingRef = await db.collection("bookings").add(bookingData);
    console.log(`[POST /v2/create] ✅ Booking created: ${bookingRef.id}`);

    // Step 6b: For manual bookings, create Google Calendar event immediately
    if (isManual) {
      try {
        const { createEvent } = await import("./google-calendar.js");
        
        const calendarEvent = await createEvent("primary", {
          summary: `Shooting: ${cliente.nome} ${cliente.cognome}`,
          description: `Prenotazione shooting CONFERMATA (Manuale)\n\nCliente: ${cliente.nome} ${cliente.cognome}\nEmail: ${cliente.email}\nWhatsApp: ${cliente.whatsapp || ""}\n${prodottoNome ? `Prodotto: ${prodottoNome}\n` : ""}${note ? `Note: ${note}` : ""}`,
          start: slotStart,
          end: slotEnd,
          location: "Studio fotografico",
          attendees: [cliente.email],
        });

        await bookingRef.update({ 
          googleCalendarEventId: calendarEvent.id,
          emailConfermataInviata: true, // Skip confirmation email for manual
        });
        console.log(`[POST /v2/create] ✅ Google Calendar event created for manual booking: ${calendarEvent.id}`);
      } catch (calendarError) {
        console.error("[POST /v2/create] ⚠️ Google Calendar event creation failed:", calendarError);
        // Non-blocking: booking is still created, just without calendar event
      }
    }

    // Step 7: Send emails (same as legacy)
    try {
      const campaignName = campaign?.nome || "Shooting Fotografico";

      const bookingDate = slotStart.toLocaleDateString("it-IT", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      const bookingTime = `${slotStart.toLocaleTimeString("it-IT", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Rome",
      })} - ${slotEnd.toLocaleTimeString("it-IT", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Rome",
      })}`;

      const durationMinutes = Math.round(
        (slotEnd.getTime() - slotStart.getTime()) / (1000 * 60),
      );

      const {
        sendGmailEmail,
        createBookingReceivedEmailHTML,
        createAdminNotificationEmailHTML,
        getStudioContactInfo,
      } = await import("./email-routes.js");

      const studioInfo = await getStudioContactInfo();
      const clienteName = `${cliente.nome} ${cliente.cognome}`;

      // Send client email
      const emailHTML = createBookingReceivedEmailHTML(
        clienteName,
        campaignName,
        bookingDate,
        bookingTime,
        durationMinutes,
        prodottoNome,
        studioInfo,
        undefined,
      );

      await sendGmailEmail(
        cliente.email,
        `Prenotazione Ricevuta - ${campaignName}`,
        emailHTML,
      );

      await bookingRef.update({ emailRicevutaInviata: true });
      console.log(`[POST /v2/create] ✅ Email sent to ${cliente.email}`);

      // Send admin email
      try {
        const adminEmailHTML = createAdminNotificationEmailHTML(
          clienteName,
          cliente.email,
          cliente.whatsapp,
          campaignName,
          bookingDate,
          bookingTime,
          prodottoNome,
          note,
          studioInfo,
        );

        await sendGmailEmail(
          studioInfo.email,
          `Nuova Prenotazione - ${campaignName}`,
          adminEmailHTML,
        );

        await bookingRef.update({ emailAdminInviata: true });
        console.log(`[POST /v2/create] ✅ Admin notification sent`);
      } catch (adminEmailError) {
        console.error("[POST /v2/create] ⚠️ Admin email failed:", adminEmailError);
      }
    } catch (emailError) {
      console.error("[POST /v2/create] ⚠️ Email failed:", emailError);
    }

    // Step 8: Link to client
    await linkBookingToClienteServer(bookingRef.id, {
      nome: cliente.nome,
      cognome: cliente.cognome,
      email: cliente.email,
      whatsapp: cliente.whatsapp,
    });

    return res.status(201).json({
      success: true,
      bookingId: bookingRef.id,
      message: isManual 
        ? "Prenotazione manuale creata e confermata automaticamente" 
        : "Prenotazione creata con successo - in attesa di approvazione admin",
    });
  } catch (error: any) {
    console.error("[POST /v2/create] ❌ Error:", error);
    
    if (error.message?.includes("Google Calendar")) {
      return res.status(503).json({
        error: "Errore Google Calendar",
        details: error.message,
      });
    }

    return res.status(500).json({
      error: "Errore interno del server",
      message: error.message || "Errore sconosciuto",
    });
  }
});

router.post("/v2/available-slots", async (req, res) => {
  try {
    console.log("[POST /v2/available-slots] 🔵 Calendar Engine V2 - Request:", req.body);
    const { date, campaignId, isManualBooking } = req.body;

    if (!date || !campaignId) {
      return res.status(400).json({
        error: "Parametri mancanti (date, campaignId richiesti)",
      });
    }

    // Step 1: Load campaign
    const campaignDoc = await db.collection("booking_campaigns").doc(campaignId).get();

    if (!campaignDoc.exists) {
      return res.status(404).json({ error: "Campagna non trovata" });
    }

    const campaign = campaignDoc.data();

    if (!campaign?.attiva) {
      return res.status(400).json({ error: "Campagna non attiva" });
    }

    // Step 2: Import Calendar Engine modules
    const { campaignToAvailabilityConfig, validateCampaign } = await import('./booking/calendar-adapter.js');
    const { getAvailableSlotsForDate, getUnavailabilityReason } = await import('./calendar-engine/index.js');
    const { hasAllDayEvent } = await import('./calendar-engine/google-sync.js');
    // SlotsResponse è importato staticamente in cima al file

    // Step 3: Validate campaign
    if (!validateCampaign(campaign)) {
      return res.status(400).json({
        error: "Campagna configurazione invalida",
        message: "Campagna manca di orari lavorativi o durata shooting"
      });
    }

    // Step 4: Convert campaign to AvailabilityConfig
    const config = campaignToAvailabilityConfig(campaign, isManualBooking === true);

    console.log("[POST /v2/available-slots] 📋 Config generato:", {
      slotDuration: config.slotDurationMinutes,
      excludedWeekdays: config.excludedWeekdays,
      timezone: config.timezone
    });

    // Step 5: Parse date with Europe/Rome timezone
    const { DateTime } = await import('luxon');
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

    // Step 7: Load all existing events via centralized adapter
    const { getAllExistingBookingEvents } = await import('./booking/calendar-adapter.js');
    const existingEvents = await getAllExistingBookingEvents(dayStart, dayEnd, db);

    // Step 8: Generate slots using Calendar Engine
    const slots = await getAvailableSlotsForDate(dayStart, config, existingEvents);

    console.log(`[POST /v2/available-slots] ✅ ${slots.length} slot disponibili generati`);

    // Step 8.5: Format slots with startTime/endTime strings (for UI display)
    const formattedSlots: TimeSlot[] = slots.map((slot) => ({
      start: slot.start,
      end: slot.end,
      label: `${slot.start.toLocaleTimeString("it-IT", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Rome",
      })} - ${slot.end.toLocaleTimeString("it-IT", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Rome",
      })}`,
      available: true,
    }));

    // Step 9: Prepare response with user-friendly message if no slots
    const response: SlotsResponse = {
      date,
      slots: formattedSlots
    };

    if (slots.length === 0 && !hasAllDay) {
      const unavailabilityInfo = getUnavailabilityReason(dayStart, config, false);

      if (unavailabilityInfo.reason) {
        response.unavailableReason = unavailabilityInfo.reason;
        response.message = unavailabilityInfo.message ?? undefined;
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

/**
 * POST /api/booking/resend-confirmation-emails
 * Rinvia email di conferma alle ultime N prenotazioni
 */
router.post("/resend-confirmation-emails", async (req, res) => {
  try {
    const { limit = 5 } = req.body;
    
    console.log(`📧 Rinvio email di conferma alle ultime ${limit} prenotazioni...`);
    
    // Recupera ultime prenotazioni confermate
    const bookingsSnapshot = await db
      .collection("bookings")
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();
    
    if (bookingsSnapshot.empty) {
      return res.status(404).json({ error: "Nessuna prenotazione trovata" });
    }
    
    const results: any[] = [];
    
    // Import funzioni email
    const {
      sendGmailEmail,
      createBookingReceivedEmailHTML,
      createBookingConfirmedEmailHTML,
      getStudioContactInfo,
    } = await import("./email-routes.js");
    
    const studioInfo = await getStudioContactInfo();
    
    for (const doc of bookingsSnapshot.docs) {
      const booking = doc.data();
      const bookingId = doc.id;
      
      try {
        const cliente = booking.cliente || {};
        const clienteEmail = cliente.email;
        const clienteNome = `${cliente.nome || ''} ${cliente.cognome || ''}`.trim();
        
        if (!clienteEmail) {
          results.push({ 
            bookingId, 
            success: false, 
            error: "Email cliente mancante" 
          });
          continue;
        }
        
        // Recupera nome campagna
        let campaignName = "Shooting Fotografico";
        if (booking.campaignId) {
          const campaignDoc = await db
            .collection("booking_campaigns")
            .doc(booking.campaignId)
            .get();
          if (campaignDoc.exists) {
            campaignName = campaignDoc.data()?.nome || campaignName;
          }
        }
        
        // Formatta date
        const startDate = booking.dataShootingInizio?.toDate?.() || new Date(booking.dataShootingInizio);
        const endDate = booking.dataShootingFine?.toDate?.() || new Date(booking.dataShootingFine);
        
        const bookingDate = startDate.toLocaleDateString("it-IT", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        });
        const bookingTime = `${startDate.toLocaleTimeString("it-IT", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Europe/Rome",
        })} - ${endDate.toLocaleTimeString("it-IT", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Europe/Rome",
        })}`;
        
        const durationMinutes = Math.round(
          (endDate.getTime() - startDate.getTime()) / (1000 * 60)
        );
        
        const prodottoNome = booking.prodottoNome || booking.prodotti?.[0]?.nome || "Servizio Fotografico";
        
        // Scegli template in base allo stato
        let emailHTML: string;
        let subject: string;
        
        if (booking.stato === "confermata") {
          // Email di conferma (con link calendario)
          // Firma: clienteName, campaignName, bookingDate, bookingTime, duration, productName, notes, studioInfo, calendarLink
          emailHTML = createBookingConfirmedEmailHTML(
            clienteNome,
            campaignName,
            bookingDate,
            bookingTime,
            durationMinutes,
            prodottoNome,
            undefined, // notes
            studioInfo,
            booking.calendarLink || undefined
          );
          subject = `Prenotazione Confermata - ${campaignName}`;
        } else {
          // Email di ricezione
          // Firma: clienteName, campaignName, bookingDate, bookingTime, duration, productName, studioInfo, calendarLink
          emailHTML = createBookingReceivedEmailHTML(
            clienteNome,
            campaignName,
            bookingDate,
            bookingTime,
            durationMinutes,
            prodottoNome,
            studioInfo,
            undefined
          );
          subject = `Prenotazione Ricevuta - ${campaignName}`;
        }
        
        await sendGmailEmail(clienteEmail, subject, emailHTML);
        
        console.log(`✅ Email rinviata a ${clienteEmail} per booking ${bookingId}`);
        
        results.push({
          bookingId,
          success: true,
          email: clienteEmail,
          stato: booking.stato,
          cliente: clienteNome
        });
        
      } catch (emailError: any) {
        console.error(`❌ Errore invio email booking ${bookingId}:`, emailError);
        results.push({
          bookingId,
          success: false,
          error: emailError.message
        });
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    
    console.log(`📧 Rinvio completato: ${successCount}/${results.length} email inviate`);
    
    return res.json({
      success: true,
      message: `${successCount} email inviate su ${results.length} prenotazioni`,
      results
    });
    
  } catch (error: any) {
    console.error("❌ Errore resend-confirmation-emails:", error);
    return res.status(500).json({
      error: error.message || "Errore rinvio email"
    });
  }
});

export default router;
