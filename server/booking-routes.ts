/**
 * Booking API Routes - Express.js
 * Gestisce endpoint per slot disponibili Google Calendar
 * NOTA: Validazione campagna fatta lato client, server gestisce solo Google Calendar
 */

import express from 'express';
import { getAvailableSlots, type WorkingHours } from './google-calendar.js';

const router = express.Router();

/**
 * POST /api/booking/available-slots
 * Ottiene slot disponibili da Google Calendar
 * 
 * Body: {
 *   date: "YYYY-MM-DD",
 *   workingHours: { apertura, pausaInizio, pausaFine, chiusura },
 *   durataMinuti: number,
 *   calendarId?: string (opzionale, default 'primary')
 * }
 */
router.post('/available-slots', async (req, res) => {
  try {
    const { date, workingHours, durataMinuti, calendarId } = req.body;

    // Validazione parametri
    if (!date || typeof date !== 'string') {
      return res.status(400).json({ 
        error: 'Parametro date mancante o invalido (formato: YYYY-MM-DD)' 
      });
    }

    if (!workingHours || typeof workingHours !== 'object') {
      return res.status(400).json({ 
        error: 'Parametro workingHours mancante' 
      });
    }

    if (!durataMinuti || typeof durataMinuti !== 'number') {
      return res.status(400).json({ 
        error: 'Parametro durataMinuti mancante o invalido' 
      });
    }

    // Validazione formato data
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return res.status(400).json({ 
        error: 'Formato data invalido. Usa YYYY-MM-DD' 
      });
    }

    // Validazione working hours
    const { apertura, pausaInizio, pausaFine, chiusura } = workingHours;
    if (!apertura || !pausaInizio || !pausaFine || !chiusura) {
      return res.status(400).json({ 
        error: 'Working hours incompleti. Richiesti: apertura, pausaInizio, pausaFine, chiusura' 
      });
    }
    
    // Validazione formato HH:MM
    const timeRegex = /^\d{2}:\d{2}$/;
    const invalidTimes = [];
    if (!timeRegex.test(apertura)) invalidTimes.push('apertura');
    if (!timeRegex.test(pausaInizio)) invalidTimes.push('pausaInizio');
    if (!timeRegex.test(pausaFine)) invalidTimes.push('pausaFine');
    if (!timeRegex.test(chiusura)) invalidTimes.push('chiusura');
    
    if (invalidTimes.length > 0) {
      return res.status(400).json({ 
        error: `Formato orario invalido per: ${invalidTimes.join(', ')}. Usa HH:MM (es. "09:00")` 
      });
    }

    // Calcola slot disponibili usando Google Calendar
    const slots = await getAvailableSlots(
      calendarId || 'primary',
      new Date(date),
      {
        apertura,
        pausaInizio,
        pausaFine,
        chiusura,
      } as WorkingHours,
      durataMinuti
    );

    // Formatta slot per risposta JSON
    const formattedSlots = slots.map(slot => ({
      start: slot.start.toISOString(),
      end: slot.end.toISOString(),
      startTime: slot.start.toLocaleTimeString('it-IT', { 
        hour: '2-digit', 
        minute: '2-digit',
        timeZone: 'Europe/Rome'
      }),
      endTime: slot.end.toLocaleTimeString('it-IT', { 
        hour: '2-digit', 
        minute: '2-digit',
        timeZone: 'Europe/Rome'
      }),
    }));

    return res.json({
      date,
      durataMinuti,
      slots: formattedSlots,
      totalSlots: formattedSlots.length,
    });

  } catch (error) {
    console.error('[Booking API] Errore calcolo slot:', error);
    
    // Gestione errori specifici Google Calendar
    if (error instanceof Error) {
      if (error.message.includes('Google Calendar not connected')) {
        return res.status(503).json({ 
          error: 'Google Calendar non configurato',
          details: 'Contatta l\'amministratore per configurare il calendario' 
        });
      }
      
      if (error.message.includes('access_token') || error.message.includes('X_REPLIT_TOKEN')) {
        return res.status(503).json({ 
          error: 'Errore autenticazione Google Calendar',
          details: 'Token scaduto o non valido' 
        });
      }
    }

    return res.status(500).json({ 
      error: 'Errore interno del server',
      message: error instanceof Error ? error.message : 'Errore sconosciuto' 
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
 *   prodottoId?: string,
 *   prodottoNome?: string,
 *   note: string,
 *   workingHours: { apertura, pausaInizio, pausaFine, chiusura },
 *   durataMinuti: number
 * }
 */
router.post('/create', async (req, res) => {
  try {
    const {
      campaignId,
      cliente,
      dataShootingInizio,
      dataShootingFine,
      prodottoId,
      prodottoNome,
      note,
      workingHours,
      durataMinuti
    } = req.body;

    // Validazione parametri base
    if (!campaignId || !cliente || !dataShootingInizio || !dataShootingFine) {
      return res.status(400).json({ 
        error: 'Parametri mancanti' 
      });
    }

    // Validazione cliente
    if (!cliente.nome?.trim() || !cliente.cognome?.trim() || !cliente.email?.trim() || !cliente.whatsapp?.trim()) {
      return res.status(400).json({ 
        error: 'Dati cliente incompleti' 
      });
    }

    // Parse date
    const slotStart = new Date(dataShootingInizio);
    const slotEnd = new Date(dataShootingFine);

    if (isNaN(slotStart.getTime()) || isNaN(slotEnd.getTime())) {
      return res.status(400).json({ 
        error: 'Date invalide' 
      });
    }

    // 1. Ricontrolla disponibilità slot via Google Calendar
    const dateStr = slotStart.toISOString().split('T')[0];
    
    const availableSlots = await getAvailableSlots(
      'primary',
      slotStart,
      workingHours as WorkingHours,
      durataMinuti
    );

    // Verifica che lo slot selezionato sia ancora disponibile
    const slotStillAvailable = availableSlots.some(slot => 
      Math.abs(slot.start.getTime() - slotStart.getTime()) < 1000 &&
      Math.abs(slot.end.getTime() - slotEnd.getTime()) < 1000
    );

    if (!slotStillAvailable) {
      return res.status(409).json({ 
        error: 'Slot non più disponibile',
        message: 'Lo slot selezionato è stato prenotato da qualcun altro. Scegli un altro orario.'
      });
    }

    // 2. Crea evento Google Calendar (riserva lo slot atomicamente)
    const { createEvent } = await import('./google-calendar.js');
    
    const calendarEvent = await createEvent(
      'primary',
      {
        summary: `Shooting: ${cliente.nome} ${cliente.cognome}`,
        description: `Prenotazione shooting\n\nCliente: ${cliente.nome} ${cliente.cognome}\nEmail: ${cliente.email}\nWhatsApp: ${cliente.whatsapp}\n${prodottoNome ? `Prodotto: ${prodottoNome}\n` : ''}${note ? `Note: ${note}` : ''}`,
        start: slotStart,
        end: slotEnd,
        location: 'Studio fotografico',
        attendees: [cliente.email],
      }
    );

    // 3. Solo DOPO evento creato, salva su Firestore
    const admin = await import('firebase-admin');
    
    // Inizializza Firebase Admin se non già fatto
    if (!admin.apps.length) {
      // Usa service account completo da secret (Base64 encoded)
      const serviceAccountBase64 = process.env.FIREBASE_ADMIN_CREDENTIALS;
      
      if (!serviceAccountBase64) {
        throw new Error('FIREBASE_ADMIN_CREDENTIALS secret non configurato');
      }
      
      // Decodifica Base64 e parse JSON
      const serviceAccountJson = Buffer.from(serviceAccountBase64, 'base64').toString('utf-8');
      const serviceAccount = JSON.parse(serviceAccountJson);
      
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }

    const db = admin.firestore();
    
    const bookingRef = await db.collection('bookings').add({
      campaignId,
      cliente: {
        nome: cliente.nome.trim(),
        cognome: cliente.cognome.trim(),
        email: cliente.email.trim().toLowerCase(),
        whatsapp: cliente.whatsapp.trim(),
      },
      dataShootingInizio: admin.firestore.Timestamp.fromDate(slotStart),
      dataShootingFine: admin.firestore.Timestamp.fromDate(slotEnd),
      prodottoId: prodottoId || null,
      prodottoNome: prodottoNome || null,
      note: note || '',
      stato: 'in_attesa',
      emailRicevutaInviata: false,
      emailConfermataInviata: false,
      googleCalendarEventId: calendarEvent.id || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 4. Invia email automatica "Prenotazione Ricevuta" (chiamata al server Express)
    try {
      // Recupera nome campagna da Firestore
      const campaignDoc = await db.collection('booking_campaigns').doc(campaignId).get();
      const campaignData = campaignDoc.data();
      const campaignName = campaignData?.nome || 'Shooting Fotografico';
      
      // Formatta data e ora
      const bookingDate = slotStart.toLocaleDateString('it-IT', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
      const bookingTime = `${slotStart.toLocaleTimeString('it-IT', { 
        hour: '2-digit', 
        minute: '2-digit',
        timeZone: 'Europe/Rome'
      })} - ${slotEnd.toLocaleTimeString('it-IT', { 
        hour: '2-digit', 
        minute: '2-digit',
        timeZone: 'Europe/Rome'
      })}`;
      
      // Chiamata API locale Express.js per invio email
      const response = await fetch('http://localhost:5000/api/email/send-booking-received', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientEmail: cliente.email,
          clienteNome: cliente.nome,
          clienteCognome: cliente.cognome,
          campaignNome: campaignName,
          dataShootingInizio: bookingDate,
          dataShootingFine: bookingTime,
          prodottoNome: prodottoNome || null,
          note: note || ''
        })
      });
      
      if (response.ok) {
        // Aggiorna flag email inviata
        await bookingRef.update({ emailRicevutaInviata: true });
        console.log(`✅ Email "Prenotazione Ricevuta" inviata a ${cliente.email}`);
      } else {
        console.error('⚠️ Errore HTTP invio email:', response.status);
      }
    } catch (emailError) {
      // Non bloccare la prenotazione se email fallisce
      console.error('⚠️ Errore invio email prenotazione ricevuta:', emailError);
    }

    return res.status(201).json({
      success: true,
      bookingId: bookingRef.id,
      calendarEventId: calendarEvent.id,
      message: 'Prenotazione creata con successo'
    });

  } catch (error) {
    console.error('[Booking API] Errore creazione prenotazione:', error);
    
    // Gestione errori specifici
    if (error instanceof Error) {
      if (error.message.includes('Google Calendar')) {
        return res.status(503).json({ 
          error: 'Errore Google Calendar',
          details: 'Impossibile confermare la prenotazione. Riprova tra qualche minuto.' 
        });
      }
    }
    
    return res.status(500).json({ 
      error: 'Errore interno del server',
      message: error instanceof Error ? error.message : 'Errore sconosciuto' 
    });
  }
});

/**
 * PATCH /api/booking/:id/approve
 * Approva prenotazione e invia email conferma
 * 
 * Body: { adminUid: string }
 */
router.patch('/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const { adminUid } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'ID prenotazione mancante' });
    }

    // Inizializza Firebase Admin
    const admin = await import('firebase-admin');
    if (!admin.apps.length) {
      const serviceAccountBase64 = process.env.FIREBASE_ADMIN_CREDENTIALS;
      if (!serviceAccountBase64) {
        throw new Error('FIREBASE_ADMIN_CREDENTIALS secret non configurato');
      }
      const serviceAccountJson = Buffer.from(serviceAccountBase64, 'base64').toString('utf-8');
      const serviceAccount = JSON.parse(serviceAccountJson);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }

    const db = admin.firestore();
    const bookingRef = db.collection('bookings').doc(id);
    const bookingDoc = await bookingRef.get();

    if (!bookingDoc.exists) {
      return res.status(404).json({ error: 'Prenotazione non trovata' });
    }

    const bookingData = bookingDoc.data();

    // Verifica stato attuale
    if (bookingData?.stato === 'confermata') {
      return res.status(400).json({ 
        error: 'Prenotazione già confermata',
        message: 'Questa prenotazione è già stata approvata' 
      });
    }

    // Aggiorna stato a "confermata"
    await bookingRef.update({
      stato: 'confermata',
      confermataDa: adminUid || 'admin',
      confermatail: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Invia email "Prenotazione Confermata" (chiamata al server Express)
    try {
      // Recupera nome campagna
      const campaignDoc = await db.collection('booking_campaigns').doc(bookingData.campaignId).get();
      const campaignData = campaignDoc.data();
      const campaignName = campaignData?.nome || 'Shooting Fotografico';

      // Formatta data e ora
      const slotStart = bookingData.dataShootingInizio.toDate();
      const slotEnd = bookingData.dataShootingFine.toDate();
      
      const bookingDate = slotStart.toLocaleDateString('it-IT', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
      const bookingTime = `${slotStart.toLocaleTimeString('it-IT', { 
        hour: '2-digit', 
        minute: '2-digit',
        timeZone: 'Europe/Rome'
      })} - ${slotEnd.toLocaleTimeString('it-IT', { 
        hour: '2-digit', 
        minute: '2-digit',
        timeZone: 'Europe/Rome'
      })}`;

      // Chiamata API locale Express.js per invio email
      const response = await fetch('http://localhost:5000/api/email/send-booking-confirmed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientEmail: bookingData.cliente.email,
          clienteNome: bookingData.cliente.nome,
          clienteCognome: bookingData.cliente.cognome,
          campaignNome: campaignName,
          dataShootingInizio: bookingDate,
          dataShootingFine: bookingTime,
          prodottoNome: bookingData.prodottoNome || null,
          note: bookingData.note || ''
        })
      });

      if (response.ok) {
        // Aggiorna flag email confermata inviata
        await bookingRef.update({ emailConfermataInviata: true });
        console.log(`✅ Email "Prenotazione Confermata" inviata a ${bookingData.cliente.email}`);
      } else {
        console.error('⚠️ Errore HTTP invio email conferma:', response.status);
      }
    } catch (emailError) {
      console.error('⚠️ Errore invio email conferma:', emailError);
      // Non bloccare l'approvazione se email fallisce
    }

    return res.json({
      success: true,
      message: 'Prenotazione confermata con successo',
      bookingId: id
    });

  } catch (error) {
    console.error('[Booking API] Errore approvazione prenotazione:', error);
    return res.status(500).json({ 
      error: 'Errore interno del server',
      message: error instanceof Error ? error.message : 'Errore sconosciuto' 
    });
  }
});

/**
 * GET /api/booking/health
 * Health check per booking API
 */
router.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'booking-api',
    timestamp: new Date().toISOString() 
  });
});

export default router;
