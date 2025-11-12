import express from 'express';
import { getEvents, createEvent } from './google-calendar.js';

const router = express.Router();

/**
 * GET /api/calendar/events
 * Ottiene eventi da Google Calendar per range date
 */
router.post('/events', async (req, res) => {
  try {
    const { timeMin, timeMax } = req.body;

    if (!timeMin || !timeMax) {
      return res.status(400).json({ error: 'timeMin e timeMax sono obbligatori' });
    }

    const events = await getEvents(
      'primary',
      new Date(timeMin),
      new Date(timeMax)
    );

    res.json(events);
  } catch (error: any) {
    console.error('❌ Errore caricamento eventi calendario:', error);
    res.status(500).json({ error: error.message || 'Errore caricamento eventi' });
  }
});

/**
 * POST /api/calendar/create-event
 * Crea nuovo evento su Google Calendar
 */
router.post('/create-event', async (req, res) => {
  try {
    const { summary, description, location, start, end, attendees = [] } = req.body;

    if (!summary || !start || !end) {
      return res.status(400).json({ error: 'summary, start e end sono obbligatori' });
    }

    // Crea evento su Google Calendar
    const event = await createEvent('primary', {
      summary,
      description,
      location,
      start: new Date(start),
      end: new Date(end),
      attendees,
    });

    // Invia email personalizzata se richiesto
    if (attendees.length > 0) {
      try {
        const { sendGmailEmail, getStudioContactInfo } = await import('./email-routes.js');
        const studioInfo = await getStudioContactInfo();

        const eventDate = new Date(start).toLocaleDateString('it-IT', {
          weekday: 'long',
          day: '2-digit',
          month: 'long',
          year: 'numeric'
        });

        const eventStartTime = new Date(start).toLocaleTimeString('it-IT', {
          hour: '2-digit',
          minute: '2-digit'
        });

        const eventEndTime = new Date(end).toLocaleTimeString('it-IT', {
          hour: '2-digit',
          minute: '2-digit'
        });

        const htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #8b5a3c; text-align: center;">📅 Nuovo Appuntamento Confermato</h2>
            <div style="background: #f9f7f4; padding: 20px; border-radius: 10px; margin: 20px 0;">
              <p style="font-size: 16px; margin-bottom: 20px;">
                È stato creato un nuovo appuntamento per te:
              </p>

              <div style="background: white; padding: 20px; border-radius: 5px; margin: 20px 0;">
                <h3 style="color: #8b5a3c; margin-top: 0;">${summary}</h3>
                ${description ? `<p style="color: #666; margin: 10px 0;">${description}</p>` : ''}
                <p style="margin: 10px 0;"><strong>📅 Data:</strong> ${eventDate}</p>
                <p style="margin: 10px 0;"><strong>🕐 Orario:</strong> ${eventStartTime} - ${eventEndTime}</p>
                ${location ? `<p style="margin: 10px 0;"><strong>📍 Luogo:</strong> ${location}</p>` : ''}
              </div>

              <div style="background: #e7f3ff; border-left: 4px solid #0056b3; padding: 15px; margin: 20px 0;">
                <p style="margin: 0; font-size: 14px; color: #0c5460;">
                  <strong>💡 Promemoria:</strong><br>
                  Riceverai un promemoria automatico 24 ore prima dell'appuntamento. 
                  Per qualsiasi domanda, non esitare a contattarci!
                </p>
              </div>

              <div style="text-align: center; margin: 25px 0;">
                <a href="https://wa.me/${studioInfo.phone.replace(/[^0-9]/g, '')}" 
                   style="background: #25D366; color: white; padding: 12px 24px; 
                          text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">
                  💬 Contattaci su WhatsApp
                </a>
              </div>
            </div>

            <div style="text-align: center; color: #666; font-size: 12px; margin-top: 30px; border-top: 1px solid #e0e0e0; padding-top: 20px;">
              <p style="margin: 5px 0; font-weight: 600;">${studioInfo.name}</p>
              ${studioInfo.address ? `<p style="margin: 5px 0;">${studioInfo.address}</p>` : ''}
              <p style="margin: 5px 0;">Email: ${studioInfo.email}</p>
              <p style="margin: 5px 0;">Tel: ${studioInfo.phone}</p>
            </div>
          </div>
        `;

        await sendGmailEmail(
          attendees,
          `Nuovo Appuntamento: ${summary}`,
          htmlContent
        );

        console.log(`✅ Email appuntamento inviata a ${attendees.join(', ')}`);
      } catch (emailError) {
        console.error('⚠️ Errore invio email appuntamento:', emailError);
        // Non blocchiamo la creazione evento se l'email fallisce
      }
    }

    res.json({
      success: true,
      event: event,
    });
  } catch (error: any) {
    console.error('❌ Errore creazione evento:', error);
    res.status(500).json({
      error: 'Errore creazione evento',
      details: error.message,
    });
  }
});

/**
 * PATCH /api/calendar/update-event
 * Aggiorna evento esistente su Google Calendar
 */
router.patch('/update-event', async (req, res) => {
  try {
    const { eventId, summary, description, location, start, end, attendees = [] } = req.body;

    if (!eventId) {
      return res.status(400).json({ error: 'eventId è obbligatorio' });
    }

    const { updateEvent } = await import('./google-calendar.js');

    const updateData: any = {};
    if (summary !== undefined) updateData.summary = summary;
    if (description !== undefined) updateData.description = description;
    if (location !== undefined) updateData.location = location;
    if (start !== undefined) updateData.start = new Date(start);
    if (end !== undefined) updateData.end = new Date(end);

    const event = await updateEvent('primary', eventId, updateData);

    // Invia email se ci sono attendees e l'evento è stato modificato
    if (attendees.length > 0 && (summary || start || end)) {
      try {
        const { sendGmailEmail, getStudioContactInfo } = await import('./email-routes.js');
        const studioInfo = await getStudioContactInfo();

        const eventDate = new Date(start || event.start?.dateTime).toLocaleDateString('it-IT', {
          weekday: 'long',
          day: '2-digit',
          month: 'long',
          year: 'numeric'
        });

        const eventStartTime = new Date(start || event.start?.dateTime).toLocaleTimeString('it-IT', {
          hour: '2-digit',
          minute: '2-digit'
        });

        const eventEndTime = new Date(end || event.end?.dateTime).toLocaleTimeString('it-IT', {
          hour: '2-digit',
          minute: '2-digit'
        });

        const htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #8b5a3c; text-align: center;">📅 Appuntamento Modificato</h2>
            <div style="background: #f9f7f4; padding: 20px; border-radius: 10px; margin: 20px 0;">
              <p style="font-size: 16px; margin-bottom: 20px;">
                Il tuo appuntamento è stato modificato:
              </p>

              <div style="background: white; padding: 20px; border-radius: 5px; margin: 20px 0;">
                <h3 style="color: #8b5a3c; margin-top: 0;">${summary || event.summary}</h3>
                ${description ? `<p style="color: #666; margin: 10px 0;">${description}</p>` : ''}
                <p style="margin: 10px 0;"><strong>📅 Data:</strong> ${eventDate}</p>
                <p style="margin: 10px 0;"><strong>🕐 Orario:</strong> ${eventStartTime} - ${eventEndTime}</p>
                ${location ? `<p style="margin: 10px 0;"><strong>📍 Luogo:</strong> ${location}</p>` : ''}
              </div>

              <div style="text-align: center; margin: 25px 0;">
                <a href="https://wa.me/${studioInfo.phone.replace(/[^0-9]/g, '')}" 
                   style="background: #25D366; color: white; padding: 12px 24px; 
                          text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">
                  💬 Contattaci su WhatsApp
                </a>
              </div>
            </div>

            <div style="text-align: center; color: #666; font-size: 12px; margin-top: 30px; border-top: 1px solid #e0e0e0; padding-top: 20px;">
              <p style="margin: 5px 0; font-weight: 600;">${studioInfo.name}</p>
              ${studioInfo.address ? `<p style="margin: 5px 0;">${studioInfo.address}</p>` : ''}
              <p style="margin: 5px 0;">Email: ${studioInfo.email}</p>
              <p style="margin: 5px 0;">Tel: ${studioInfo.phone}</p>
            </div>
          </div>
        `;

        await sendGmailEmail(
          attendees,
          `Appuntamento Modificato: ${summary || event.summary}`,
          htmlContent
        );

        console.log(`✅ Email modifica inviata a ${attendees.join(', ')}`);
      } catch (emailError) {
        console.error('⚠️ Errore invio email modifica:', emailError);
      }
    }

    res.json({
      success: true,
      event: event,
    });
  } catch (error: any) {
    console.error('❌ Errore aggiornamento evento:', error);
    res.status(500).json({
      error: 'Errore aggiornamento evento',
      details: error.message,
    });
  }
});

/**
 * DELETE /api/calendar/delete-event/:eventId
 * Elimina evento da Google Calendar
 */
router.delete('/delete-event/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;
    const { attendees = [] } = req.body;

    if (!eventId) {
      return res.status(400).json({ error: 'eventId è obbligatorio' });
    }

    const { deleteEvent } = await import('./google-calendar.js');

    await deleteEvent('primary', eventId);

    // Invia email di cancellazione se ci sono attendees
    if (attendees.length > 0) {
      try {
        const { sendGmailEmail, getStudioContactInfo } = await import('./email-routes.js');
        const studioInfo = await getStudioContactInfo();

        const htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #dc2626; text-align: center;">❌ Appuntamento Cancellato</h2>
            <div style="background: #fef2f2; padding: 20px; border-radius: 10px; margin: 20px 0; border: 1px solid #fecaca;">
              <p style="font-size: 16px; margin-bottom: 20px;">
                Il tuo appuntamento è stato cancellato.
              </p>

              <div style="background: #e7f3ff; border-left: 4px solid #0056b3; padding: 15px; margin: 20px 0;">
                <p style="margin: 0; font-size: 14px; color: #0c5460;">
                  <strong>💡 Serve aiuto?</strong><br>
                  Se hai domande o vuoi riprogrammare, contattaci!
                </p>
              </div>

              <div style="text-align: center; margin: 25px 0;">
                <a href="https://wa.me/${studioInfo.phone.replace(/[^0-9]/g, '')}" 
                   style="background: #25D366; color: white; padding: 12px 24px; 
                          text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">
                  💬 Contattaci su WhatsApp
                </a>
              </div>
            </div>

            <div style="text-align: center; color: #666; font-size: 12px; margin-top: 30px; border-top: 1px solid #e0e0e0; padding-top: 20px;">
              <p style="margin: 5px 0; font-weight: 600;">${studioInfo.name}</p>
              ${studioInfo.address ? `<p style="margin: 5px 0;">${studioInfo.address}</p>` : ''}
              <p style="margin: 5px 0;">Email: ${studioInfo.email}</p>
              <p style="margin: 5px 0;">Tel: ${studioInfo.phone}</p>
            </div>
          </div>
        `;

        await sendGmailEmail(
          attendees,
          'Appuntamento Cancellato',
          htmlContent
        );

        console.log(`✅ Email cancellazione inviata a ${attendees.join(', ')}`);
      } catch (emailError) {
        console.error('⚠️ Errore invio email cancellazione:', emailError);
      }
    }

    res.json({
      success: true,
      message: 'Evento eliminato con successo',
    });
  } catch (error: any) {
    console.error('❌ Errore eliminazione evento:', error);
    res.status(500).json({
      error: 'Errore eliminazione evento',
      details: error.message,
    });
  }
});

export default router;