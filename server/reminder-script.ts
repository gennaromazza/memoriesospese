
/**
 * REMINDER SCRIPT - Invia email reminder 24h prima degli appuntamenti
 * Eseguito da Replit Scheduled Deployment ogni giorno alle 10:00
 * 
 * Controlla:
 * - Bookings confermati nelle prossime 24-48h
 * - Consultations confermate nelle prossime 24-48h
 * 
 * Invia email reminder solo se non già inviato (flag reminderEmailSent)
 */

import { db, Timestamp } from './firebase-admin.js';
import { sendGmailEmail, getStudioContactInfo } from './email-routes.js';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

interface ReminderStats {
  bookingsChecked: number;
  bookingsReminded: number;
  consultationsChecked: number;
  consultationsReminded: number;
  errors: string[];
}

/**
 * Template HTML email reminder booking
 */
function createBookingReminderEmailHTML(
  clienteName: string,
  campaignName: string,
  shootingDate: string,
  shootingTime: string,
  studioInfo: any
): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
        <h1 style="margin: 0; font-size: 28px;">⏰ Promemoria Shooting</h1>
      </div>
      
      <div style="background: white; padding: 30px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        <p style="font-size: 16px; color: #333; margin-bottom: 20px;">
          Ciao <strong>${clienteName}</strong>,
        </p>
        
        <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 20px; margin: 25px 0; border-radius: 8px;">
          <h3 style="color: #856404; margin: 0 0 10px 0; font-size: 18px;">📸 Shooting tra 24 ore!</h3>
          <p style="color: #555; margin: 0; font-size: 14px; line-height: 1.5;">
            Ti ricordiamo che <strong>domani</strong> hai lo shooting fotografico <strong style="color: #667eea;">${campaignName}</strong>.
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
          </table>
        </div>
        
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
 * Template HTML email reminder consulenza
 */
function createConsultationReminderEmailHTML(
  clienteName: string,
  jobType: string,
  consultationDate: string,
  consultationTime: string,
  studioInfo: any
): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #48bb78 0%, #38a169 100%); color: white; padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
        <h1 style="margin: 0; font-size: 28px;">⏰ Promemoria Consulenza</h1>
      </div>
      
      <div style="background: white; padding: 30px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        <p style="font-size: 16px; color: #333; margin-bottom: 20px;">
          Ciao <strong>${clienteName}</strong>,
        </p>
        
        <div style="background: #d1ecf1; border-left: 4px solid #17a2b8; padding: 20px; margin: 25px 0; border-radius: 8px;">
          <h3 style="color: #0c5460; margin: 0 0 10px 0; font-size: 18px;">🗓️ Consulenza tra 24 ore!</h3>
          <p style="color: #555; margin: 0; font-size: 14px; line-height: 1.5;">
            Ti ricordiamo che <strong>domani</strong> hai la consulenza per <strong style="color: #48bb78;">${jobType}</strong>.
          </p>
        </div>
        
        <div style="background: #f9f7f4; padding: 20px; border-radius: 8px; margin: 25px 0;">
          <h3 style="color: #8b5a3c; margin: 0 0 15px 0; font-size: 18px;">📋 Dettagli Appuntamento</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #666; font-size: 14px; width: 30%;">📅 Data:</td>
              <td style="padding: 8px 0; color: #333; font-size: 14px; font-weight: 600;">${consultationDate}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666; font-size: 14px;">🕐 Orario:</td>
              <td style="padding: 8px 0; color: #333; font-size: 14px; font-weight: 600;">${consultationTime}</td>
            </tr>
          </table>
        </div>
        
        <div style="background: #fff3e0; padding: 15px; border-radius: 8px; margin: 25px 0;">
          <h4 style="color: #ef6c00; margin: 0 0 10px 0; font-size: 16px;">💡 Cosa Portare</h4>
          <ul style="margin: 0; padding-left: 20px; color: #555; font-size: 14px; line-height: 1.8;">
            <li>Eventuali idee o ispirazioni per il servizio</li>
            <li>Foto di riferimento (se disponibili)</li>
            <li>Note su preferenze particolari</li>
            <li>Domande da discutere insieme</li>
          </ul>
        </div>
        
        <p style="font-size: 15px; color: #555; text-align: center; margin: 25px 0;">
          Non vediamo l'ora di conoscerti! Per qualsiasi necessità, contattaci su WhatsApp.
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
 * Controlla e invia reminder per bookings
 */
async function processBookingReminders(stats: ReminderStats): Promise<void> {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  
  const dayAfterTomorrow = new Date(tomorrow);
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);
  dayAfterTomorrow.setHours(23, 59, 59, 999);
  
  console.log(`[Reminders] 🔍 Controllo bookings tra ${tomorrow.toLocaleDateString('it-IT')} e ${dayAfterTomorrow.toLocaleDateString('it-IT')}`);
  
  const bookingsSnapshot = await db.collection('bookings')
    .where('stato', '==', 'confermata')
    .where('dataShootingInizio', '>=', Timestamp.fromDate(tomorrow))
    .where('dataShootingInizio', '<=', Timestamp.fromDate(dayAfterTomorrow))
    .get();
  
  stats.bookingsChecked = bookingsSnapshot.size;
  console.log(`[Reminders] 📋 Trovati ${stats.bookingsChecked} bookings confermati`);
  
  const studioInfo = await getStudioContactInfo();
  
  for (const doc of bookingsSnapshot.docs) {
    const booking = doc.data();
    
    // Skip se reminder già inviato
    if (booking.reminderEmailSent) {
      console.log(`[Reminders] ⏭️ Reminder già inviato per booking ${doc.id}`);
      continue;
    }
    
    try {
      const shootingDate = booking.dataShootingInizio.toDate();
      const shootingEnd = booking.dataShootingFine.toDate();
      
      const formattedDate = format(shootingDate, 'EEEE d MMMM yyyy', { locale: it });
      const formattedTime = `${format(shootingDate, 'HH:mm')} - ${format(shootingEnd, 'HH:mm')}`;
      
      // Recupera nome campagna
      let campaignName = 'Shooting Fotografico';
      if (booking.campaignId) {
        const campaignDoc = await db.collection('booking_campaigns').doc(booking.campaignId).get();
        if (campaignDoc.exists) {
          campaignName = campaignDoc.data()?.nome || campaignName;
        }
      }
      
      const clienteName = `${booking.cliente.nome} ${booking.cliente.cognome}`;
      const emailHTML = createBookingReminderEmailHTML(
        clienteName,
        campaignName,
        formattedDate,
        formattedTime,
        studioInfo
      );
      
      await sendGmailEmail(
        booking.cliente.email,
        `⏰ Promemoria Shooting Domani - ${campaignName}`,
        emailHTML
      );
      
      // Marca reminder come inviato
      await db.collection('bookings').doc(doc.id).update({
        reminderEmailSent: true,
        reminderEmailSentAt: Timestamp.now()
      });
      
      stats.bookingsReminded++;
      console.log(`[Reminders] ✅ Reminder inviato per booking ${doc.id} a ${booking.cliente.email}`);
      
    } catch (error: any) {
      const errorMsg = `Booking ${doc.id}: ${error.message}`;
      stats.errors.push(errorMsg);
      console.error(`[Reminders] ❌ Errore booking ${doc.id}:`, error.message);
    }
  }
}

/**
 * Controlla e invia reminder per consultations
 */
async function processConsultationReminders(stats: ReminderStats): Promise<void> {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  
  const dayAfterTomorrow = new Date(tomorrow);
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);
  dayAfterTomorrow.setHours(23, 59, 59, 999);
  
  console.log(`[Reminders] 🔍 Controllo consultations tra ${tomorrow.toLocaleDateString('it-IT')} e ${dayAfterTomorrow.toLocaleDateString('it-IT')}`);
  
  const consultationsSnapshot = await db.collection('consultations')
    .where('stato', '==', 'confermata')
    .where('dataConsulenza', '>=', Timestamp.fromDate(tomorrow))
    .where('dataConsulenza', '<=', Timestamp.fromDate(dayAfterTomorrow))
    .get();
  
  stats.consultationsChecked = consultationsSnapshot.size;
  console.log(`[Reminders] 📋 Trovate ${stats.consultationsChecked} consultations confermate`);
  
  const studioInfo = await getStudioContactInfo();
  
  for (const doc of consultationsSnapshot.docs) {
    const consultation = doc.data();
    
    // Skip se reminder già inviato
    if (consultation.reminderEmailSent) {
      console.log(`[Reminders] ⏭️ Reminder già inviato per consultation ${doc.id}`);
      continue;
    }
    
    try {
      const consultationDate = consultation.dataConsulenza.toDate();
      
      const formattedDate = format(consultationDate, 'EEEE d MMMM yyyy', { locale: it });
      const formattedTime = `${consultation.orarioInizio} - ${consultation.orarioFine}`;
      
      const clienteName = `${consultation.cliente.nome} ${consultation.cliente.cognome}`;
      const emailHTML = createConsultationReminderEmailHTML(
        clienteName,
        consultation.jobType,
        formattedDate,
        formattedTime,
        studioInfo
      );
      
      await sendGmailEmail(
        consultation.cliente.email,
        `⏰ Promemoria Consulenza Domani - ${consultation.jobType}`,
        emailHTML
      );
      
      // Marca reminder come inviato
      await db.collection('consultations').doc(doc.id).update({
        reminderEmailSent: true,
        reminderEmailSentAt: Timestamp.now()
      });
      
      stats.consultationsReminded++;
      console.log(`[Reminders] ✅ Reminder inviato per consultation ${doc.id} a ${consultation.cliente.email}`);
      
    } catch (error: any) {
      const errorMsg = `Consultation ${doc.id}: ${error.message}`;
      stats.errors.push(errorMsg);
      console.error(`[Reminders] ❌ Errore consultation ${doc.id}:`, error.message);
    }
  }
}

/**
 * Main function - eseguita da Replit Scheduled Deployment
 */
async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('🔔 REMINDER SCRIPT - Appuntamenti 24h prima');
  console.log('═══════════════════════════════════════════════════');
  console.log(`⏰ Esecuzione: ${new Date().toLocaleString('it-IT')}`);
  console.log('');
  
  const stats: ReminderStats = {
    bookingsChecked: 0,
    bookingsReminded: 0,
    consultationsChecked: 0,
    consultationsReminded: 0,
    errors: []
  };
  
  try {
    // Process bookings
    await processBookingReminders(stats);
    
    // Process consultations
    await processConsultationReminders(stats);
    
    // Report finale
    console.log('');
    console.log('═══════════════════════════════════════════════════');
    console.log('📊 RIEPILOGO ESECUZIONE');
    console.log('═══════════════════════════════════════════════════');
    console.log(`📅 Bookings controllati: ${stats.bookingsChecked}`);
    console.log(`📧 Bookings reminder inviati: ${stats.bookingsReminded}`);
    console.log(`🗓️ Consultations controllate: ${stats.consultationsChecked}`);
    console.log(`📧 Consultations reminder inviati: ${stats.consultationsReminded}`);
    console.log(`❌ Errori: ${stats.errors.length}`);
    
    if (stats.errors.length > 0) {
      console.log('');
      console.log('Dettaglio errori:');
      stats.errors.forEach((err, idx) => {
        console.log(`  ${idx + 1}. ${err}`);
      });
    }
    
    console.log('');
    console.log('✅ Esecuzione completata con successo');
    console.log('═══════════════════════════════════════════════════');
    
    process.exit(0);
    
  } catch (error: any) {
    console.error('');
    console.error('❌ ERRORE FATALE:', error.message);
    console.error(error.stack);
    console.error('═══════════════════════════════════════════════════');
    process.exit(1);
  }
}

// Esegui script
main();
