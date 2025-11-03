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

    // 4. Invia email automatica "Prenotazione Ricevuta" (chiamata diretta alla funzione)
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
      
      // Calcola durata in minuti
      const durationMinutes = Math.round((slotEnd.getTime() - slotStart.getTime()) / (1000 * 60));
      
      // Import diretto delle funzioni email
      const { sendGmailEmail, createBookingReceivedEmailHTML, getStudioContactInfo } = await import('./email-routes.js');
      
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
        studioInfo
      );
      
      await sendGmailEmail(
        cliente.email,
        `Prenotazione Ricevuta - ${campaignName}`,
        emailHTML
      );
      
      // Aggiorna flag email inviata
      await bookingRef.update({ emailRicevutaInviata: true });
      console.log(`✅ Email "Prenotazione Ricevuta" inviata a ${cliente.email}`);
      
      // 5. Invia email notifica admin (nuova prenotazione)
      try {
        const { createAdminNotificationEmailHTML } = await import('./email-routes.js');
        
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
          studioInfo
        );
        
        await sendGmailEmail(
          adminEmail,
          `Nuova Prenotazione - ${campaignName}`,
          adminEmailHTML
        );
        
        // Aggiorna flag email admin inviata
        await bookingRef.update({ emailAdminInviata: true });
        console.log(`✅ Email notifica admin inviata a ${adminEmail}`);
      } catch (adminEmailError) {
        // Non bloccare la prenotazione se email admin fallisce
        console.error('⚠️ Errore invio email notifica admin:', adminEmailError);
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
    
    if (!bookingData) {
      return res.status(404).json({ error: 'Dati prenotazione non validi' });
    }

    // Verifica stato attuale
    if (bookingData.stato === 'confermata') {
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

    // Invia email "Prenotazione Confermata" (chiamata diretta alla funzione)
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

      // Calcola durata in minuti
      const durationMinutes = Math.round((slotEnd.getTime() - slotStart.getTime()) / (1000 * 60));

      // Import diretto delle funzioni email
      const { sendGmailEmail, createBookingConfirmedEmailHTML, getStudioContactInfo } = await import('./email-routes.js');

      // Recupera dati contatto studio
      const studioInfo = await getStudioContactInfo();

      const clienteName = `${bookingData.cliente.nome} ${bookingData.cliente.cognome}`;
      const emailHTML = createBookingConfirmedEmailHTML(
        clienteName,
        campaignName,
        bookingDate,
        bookingTime,
        durationMinutes,
        bookingData.prodottoNome,
        bookingData.note,
        studioInfo,
        id  // bookingId per generare link calendario
      );

      await sendGmailEmail(
        bookingData.cliente.email,
        `Prenotazione Confermata - ${campaignName}`,
        emailHTML
      );

      // Aggiorna flag email confermata inviata
      await bookingRef.update({ emailConfermataInviata: true });
      console.log(`✅ Email "Prenotazione Confermata" inviata a ${bookingData.cliente.email}`);
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
 * GET /api/booking/calendar/:id
 * Genera e serve file .ics per aggiungere al calendario
 */
router.get('/calendar/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
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
    
    // Recupera booking da Firestore
    const bookingRef = db.collection('bookings').doc(id);
    const bookingDoc = await bookingRef.get();
    
    if (!bookingDoc.exists) {
      return res.status(404).json({ error: 'Prenotazione non trovata' });
    }
    
    const bookingData = bookingDoc.data();
    
    // Solo prenotazioni confermate possono essere aggiunte al calendario
    if (bookingData?.stato !== 'confermata') {
      return res.status(403).json({ error: 'Prenotazione non ancora confermata' });
    }
    
    // Recupera nome campagna
    const campaignDoc = await db.collection('booking_campaigns').doc(bookingData.campaignId).get();
    const campaignName = campaignDoc.data()?.nome || 'Shooting Fotografico';
    
    // Recupera dati studio
    const { getStudioContactInfo } = await import('./email-routes.js');
    const studioInfo = await getStudioContactInfo();
    
    // Converti timestamp in Date
    const slotStart = bookingData.dataShootingInizio.toDate();
    const slotEnd = bookingData.dataShootingFine.toDate();
    
    // Genera file .ics
    const formatICalDate = (date: Date): string => {
      return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Memorie Sospese//Booking System//IT',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `DTSTART:${formatICalDate(slotStart)}`,
      `DTEND:${formatICalDate(slotEnd)}`,
      `SUMMARY:Shooting Fotografico - ${campaignName}`,
      `DESCRIPTION:Sessione fotografica ${campaignName}${bookingData.prodottoNome ? ` - ${bookingData.prodottoNome}` : ''}${bookingData.note ? `\\n\\nNote: ${bookingData.note}` : ''}`,
      `LOCATION:${studioInfo.address || studioInfo.name}`,
      `ORGANIZER;CN=${studioInfo.name}:mailto:${studioInfo.email}`,
      'STATUS:CONFIRMED',
      'SEQUENCE:0',
      'BEGIN:VALARM',
      'TRIGGER:-PT24H',
      'DESCRIPTION:Promemoria shooting fotografico',
      'ACTION:DISPLAY',
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    // Imposta headers per download file .ics
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="shooting_${campaignName.replace(/\s+/g, '_')}.ics"`);
    res.send(icsContent);
    
    console.log(`✅ File calendario generato per booking ${id}`);
  } catch (error) {
    console.error('[Booking API] Errore generazione calendario:', error);
    return res.status(500).json({ 
      error: 'Errore generazione file calendario',
      message: error instanceof Error ? error.message : 'Errore sconosciuto' 
    });
  }
});

/**
 * PATCH /api/booking/:id/status
 * Cambia stato prenotazione e invia email notifica al cliente
 * 
 * Body: { stato: 'in_attesa' | 'confermata' | 'completata' | 'annullata' }
 */
router.patch('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { stato } = req.body;

    if (!id || !stato) {
      return res.status(400).json({ error: 'ID prenotazione e stato mancanti' });
    }

    // Validazione stato
    const validStati = ['in_attesa', 'confermata', 'completata', 'annullata'];
    if (!validStati.includes(stato)) {
      return res.status(400).json({ 
        error: 'Stato invalido',
        message: `Stato deve essere uno tra: ${validStati.join(', ')}` 
      });
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
    
    if (!bookingData) {
      return res.status(404).json({ error: 'Dati prenotazione non validi' });
    }
    
    const oldStato = bookingData.stato;

    // Aggiorna stato
    await bookingRef.update({
      stato,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`✅ Stato prenotazione ${id} cambiato da "${oldStato}" a "${stato}"`);

    // Invia email notifica al cliente solo se stato cambia (e non è già "confermata" che usa /approve)
    try {
      // Recupera nome campagna
      const campaignDoc = await db.collection('booking_campaigns').doc(bookingData.campaignId).get();
      const campaignName = campaignDoc.data()?.nome || 'Shooting Fotografico';

      // Formatta data
      const slotStart = bookingData.dataShootingInizio.toDate();
      const bookingDate = slotStart.toLocaleDateString('it-IT', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });

      // Import funzioni email
      const { 
        sendGmailEmail, 
        createBookingCompletedEmailHTML, 
        createBookingCancelledEmailHTML,
        getStudioContactInfo 
      } = await import('./email-routes.js');

      // Recupera dati contatto studio
      const studioInfo = await getStudioContactInfo();

      const clienteName = `${bookingData.cliente.nome} ${bookingData.cliente.cognome}`;
      let emailHTML = '';
      let subject = '';

      // Determina email template basato su nuovo stato
      switch (stato) {
        case 'completata':
          emailHTML = createBookingCompletedEmailHTML(
            clienteName,
            campaignName,
            bookingDate,
            studioInfo
          );
          subject = `Shooting Completato - ${campaignName}`;
          break;
        
        case 'annullata':
          emailHTML = createBookingCancelledEmailHTML(
            clienteName,
            campaignName,
            bookingDate,
            studioInfo
          );
          subject = `Prenotazione Annullata - ${campaignName}`;
          break;
        
        default:
          // Per 'in_attesa' e 'confermata' non inviamo email (gestite da altre route)
          console.log(`ℹ️ Nessuna email da inviare per stato "${stato}"`);
          return res.json({
            success: true,
            message: 'Stato aggiornato con successo',
            bookingId: id,
            newStato: stato
          });
      }

      // Invia email
      if (emailHTML && subject) {
        await sendGmailEmail(
          bookingData.cliente.email,
          subject,
          emailHTML
        );
        console.log(`✅ Email cambio stato "${stato}" inviata a ${bookingData.cliente.email}`);
      }
    } catch (emailError) {
      console.error('⚠️ Errore invio email cambio stato:', emailError);
      // Non bloccare l'aggiornamento stato se email fallisce
    }

    return res.json({
      success: true,
      message: 'Stato aggiornato con successo',
      bookingId: id,
      newStato: stato
    });

  } catch (error) {
    console.error('[Booking API] Errore cambio stato prenotazione:', error);
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
router.patch('/:id/update', async (req, res) => {
  try {
    const { id } = req.params;
    const { cliente, note, oldEmail } = req.body;

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
    
    if (!bookingData) {
      return res.status(404).json({ error: 'Dati prenotazione non validi' });
    }

    // Prepara update data
    const updateData: any = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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
      console.log(`📧 Email cambiata da "${oldEmail}" a "${newEmail}" - invio notifica`);

      try {
        // Recupera nome campagna
        const campaignDoc = await db.collection('booking_campaigns').doc(bookingData.campaignId).get();
        const campaignName = campaignDoc.data()?.nome || 'Shooting Fotografico';

        // Formatta data
        const slotStart = bookingData.dataShootingInizio.toDate();
        const bookingDate = slotStart.toLocaleDateString('it-IT', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        });
        const bookingTime = slotStart.toLocaleTimeString('it-IT', { 
          hour: '2-digit', 
          minute: '2-digit' 
        });

        // Import funzioni email
        const { sendGmailEmail, getStudioContactInfo } = await import('./email-routes.js');
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
                  <strong>${studioInfo.nome}</strong>
                </p>
                ${studioInfo.telefono ? `<p style="margin: 5px 0; font-size: 14px; color: #666;">📞 ${studioInfo.telefono}</p>` : ''}
                ${studioInfo.email ? `<p style="margin: 5px 0; font-size: 14px; color: #666;">📧 ${studioInfo.email}</p>` : ''}
                ${studioInfo.indirizzo ? `<p style="margin: 5px 0; font-size: 14px; color: #666;">📍 ${studioInfo.indirizzo}</p>` : ''}
              </div>
            </div>
          </body>
          </html>
        `;

        // Invia email alla NUOVA email
        await sendGmailEmail(
          newEmail,
          `Email Aggiornata - ${campaignName}`,
          emailHTML
        );

        console.log(`✅ Email notifica cambio email inviata a ${newEmail}`);
      } catch (emailError) {
        console.error('❌ Errore invio email notifica cambio:', emailError);
        // Non bloccare la risposta se l'email fallisce
      }
    }

    return res.json({
      success: true,
      message: 'Prenotazione aggiornata con successo',
      bookingId: id,
      emailChanged,
    });

  } catch (error) {
    console.error('[Booking API] Errore aggiornamento prenotazione:', error);
    return res.status(500).json({ 
      error: 'Errore interno del server',
      message: error instanceof Error ? error.message : 'Errore sconosciuto' 
    });
  }
});

/**
 * DELETE /api/booking/:bookingId/calendar-event
 * Cancella l'evento Google Calendar associato a una prenotazione
 */
router.delete('/:bookingId/calendar-event', async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { googleCalendarEventId } = req.body;

    if (!googleCalendarEventId) {
      return res.status(400).json({
        error: 'googleCalendarEventId mancante'
      });
    }

    // Importa deleteEvent da google-calendar
    const { deleteEvent } = await import('./google-calendar.js');
    
    // Cancella evento da Google Calendar
    await deleteEvent('primary', googleCalendarEventId);

    console.log(`✅ Evento Google Calendar cancellato per booking ${bookingId}: ${googleCalendarEventId}`);

    res.status(200).json({
      success: true,
      message: 'Evento Google Calendar cancellato con successo'
    });

  } catch (error: any) {
    console.error('❌ Errore cancellazione evento Google Calendar:', error);
    res.status(500).json({
      error: 'Errore durante la cancellazione dell\'evento dal calendario',
      details: error.message
    });
  }
});

export default router;
