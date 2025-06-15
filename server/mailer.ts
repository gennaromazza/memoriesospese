import nodemailer from 'nodemailer';

// Configurazione del transporter per Netsons
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.netsons.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false, // true per 465, false per altre porte
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Verifica la configurazione SMTP al startup
export async function verifyEmailConfig() {
  try {
    await transporter.verify();
    console.log('Configurazione email verificata con successo');
  } catch (error) {
    console.error('Errore nella configurazione email:', error);
  }
}

// Invia email di aggiornamento galleria
export async function sendGalleryUpdateEmail(
  toEmail: string, 
  galleryName: string, 
  photoCount: number
): Promise<boolean> {
  try {
    const mailOptions = {
      from: `"EasyGallery" <${process.env.SMTP_USER}>`,
      to: toEmail,
      subject: `Aggiornamento Galleria - ${galleryName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4a5568;">Nuove foto disponibili!</h2>
          <p>Ciao,</p>
          <p>Sono state aggiunte <strong>${photoCount}</strong> nuove foto alla galleria <strong>"${galleryName}"</strong>.</p>
          <p>Accedi alla galleria per visualizzare le nuove foto.</p>
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #e2e8f0;">
          <p style="color: #718096; font-size: 14px;">
            Questo messaggio è stato inviato automaticamente da EasyGallery.
          </p>
        </div>
      `,
      text: `Sono state aggiunte ${photoCount} nuove foto alla galleria "${galleryName}".`
    };

    await transporter.sendMail(mailOptions);
    console.log(`Email inviata con successo a ${toEmail} per galleria ${galleryName}`);
    return true;
  } catch (error) {
    console.error('Errore nell\'invio email:', error);
    return false;
  }
}

// Invia email di benvenuto per nuova iscrizione
export async function sendWelcomeEmail(
  toEmail: string, 
  galleryName: string
): Promise<boolean> {
  try {
    const mailOptions = {
      from: `"EasyGallery" <${process.env.SMTP_USER}>`,
      to: toEmail,
      subject: `Iscrizione confermata - ${galleryName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4a5568;">Iscrizione confermata!</h2>
          <p>Ciao,</p>
          <p>Ti sei iscritto con successo agli aggiornamenti della galleria <strong>"${galleryName}"</strong>.</p>
          <p>Riceverai una notifica ogni volta che verranno aggiunte nuove foto.</p>
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #e2e8f0;">
          <p style="color: #718096; font-size: 14px;">
            Questo messaggio è stato inviato automaticamente da EasyGallery.
          </p>
        </div>
      `,
      text: `Ti sei iscritto con successo agli aggiornamenti della galleria "${galleryName}".`
    };

    await transporter.sendMail(mailOptions);
    console.log(`Email di benvenuto inviata a ${toEmail} per galleria ${galleryName}`);
    return true;
  } catch (error) {
    console.error('Errore nell\'invio email di benvenuto:', error);
    return false;
  }
}

// Notifica tutti gli iscritti di una galleria
export async function notifySubscribers(
  galleryId: string, 
  galleryName: string, 
  newPhotosCount: number,
  subscribers: string[]
): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;

  console.log(`Invio notifiche a ${subscribers.length} iscritti per galleria ${galleryName}`);

  for (const email of subscribers) {
    const result = await sendGalleryUpdateEmail(email, galleryName, newPhotosCount);
    if (result) {
      success++;
    } else {
      failed++;
    }
    
    // Piccola pausa tra gli invii per evitare rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log(`Notifiche inviate: ${success} successi, ${failed} fallimenti`);
  return { success, failed };
}