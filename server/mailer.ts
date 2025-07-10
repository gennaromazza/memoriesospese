import nodemailer from 'nodemailer';

// Configurazione centralizzata SMTP Brevo (ex-Sendinblue)
const transporter = nodemailer.createTransport({
  host: 'smtp-relay.brevo.com',
  port: 587,
  secure: false, // STARTTLS su porta 587
  auth: {
    user: process.env.BREVO_SMTP_USER || 'your-brevo-email@domain.com',
    pass: process.env.BREVO_SMTP_PASS || 'your-brevo-smtp-key'
  },
  tls: {
    rejectUnauthorized: false
  }
});

// Verifica la configurazione SMTP al startup
export async function verifyEmailConfig() {
  try {
    await transporter.verify();
    console.log('✓ SMTP Netsons verificato ✔');
    return true;
  } catch (error) {
    console.error('❌ Errore SMTP Netsons:', error);
    throw error; // Blocca l'app se fallisce
  }
}

// Invia email di aggiornamento galleria con template HTML avanzato
export async function sendNewPhotosNotification(
  toEmail: string, 
  galleryName: string, 
  newPhotosCount: number,
  uploaderName: string,
  galleryUrl: string
): Promise<boolean> {
  try {
    const mailOptions = {
      from: `"Wedding Gallery" <${process.env.BREVO_SENDER_EMAIL || 'noreply@yourdomain.com'}>`,
      to: toEmail,
      subject: `📸 ${newPhotosCount} nuova${newPhotosCount > 1 ? 'e' : ''} foto in "${galleryName}"`,
      html: generateNewPhotosHTML(galleryName, newPhotosCount, uploaderName, galleryUrl),
      text: generateNewPhotosText(galleryName, newPhotosCount, uploaderName, galleryUrl),
      headers: {
        'X-Mailer': 'Wedding Gallery System',
        'X-Priority': '3',
        'List-Unsubscribe': `<mailto:${process.env.BREVO_SENDER_EMAIL || 'noreply@yourdomain.com'}?subject=Unsubscribe>`,
        'Reply-To': process.env.BREVO_SENDER_EMAIL || 'noreply@yourdomain.com'
      }
    };

    await transporter.sendMail(mailOptions);
    console.log(`📧 Email notifica inviata via Netsons a ${toEmail} per galleria ${galleryName}`);
    return true;
  } catch (error) {
    console.error('❌ Errore invio notifica Netsons:', error);
    return false;
  }
}

// Invia email di benvenuto per nuova iscrizione
export async function sendWelcomeEmail(
  toEmail: string, 
  galleryName: string,
  fromName?: string
): Promise<boolean> {
  try {
    const mailOptions = {
      from: `"Wedding Gallery" <${process.env.BREVO_SENDER_EMAIL || 'noreply@yourdomain.com'}>`,
      to: toEmail,
      subject: `✨ Benvenuto! Sei iscritto alle notifiche di "${galleryName}"`,
      html: generateWelcomeHTML(galleryName, toEmail),
      text: generateWelcomeText(galleryName, toEmail),
      headers: {
        'X-Mailer': 'Wedding Gallery System',
        'X-Priority': '3',
        'List-Unsubscribe': `<mailto:${process.env.BREVO_SENDER_EMAIL || 'noreply@yourdomain.com'}?subject=Unsubscribe>`,
        'Reply-To': process.env.BREVO_SENDER_EMAIL || 'noreply@yourdomain.com'
      }
    };

    await transporter.sendMail(mailOptions);
    console.log(`📧 Email benvenuto inviata via Netsons a ${toEmail} per galleria ${galleryName}`);
    return true;
  } catch (error) {
    console.error('❌ Errore invio benvenuto Netsons:', error);
    return false;
  }
}

// Notifica tutti gli iscritti di una galleria
export async function notifySubscribers(
  galleryId: string, 
  galleryName: string, 
  newPhotosCount: number,
  uploaderName: string,
  galleryUrl: string,
  subscribers: string[]
): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;

  console.log(`📧 Invio notifiche Netsons a ${subscribers.length} iscritti per galleria ${galleryName}`);

  for (const email of subscribers) {
    const result = await sendNewPhotosNotification(email, galleryName, newPhotosCount, uploaderName, galleryUrl);
    if (result) {
      success++;
    } else {
      failed++;
    }

    // Pausa tra invii per evitare rate limiting Netsons
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  console.log(`📊 Notifiche Netsons: ${success} successi, ${failed} fallimenti`);
  return { success, failed };
}

// Template HTML per email di benvenuto
function generateWelcomeHTML(galleryName: string, userEmail: string): string {
  return `
<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Benvenuto - Notifiche Galleria</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f8f9fa;
        }
        .container {
            background-color: white;
            border-radius: 12px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        .header h1 {
            margin: 0;
            font-size: 28px;
            font-weight: 600;
        }
        .content {
            padding: 30px;
        }
        .gallery-info {
            background-color: #f8f9ff;
            border: 2px solid #e3e8ff;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
            text-align: center;
        }
        .gallery-name {
            font-size: 24px;
            font-weight: 700;
            color: #4c51bf;
            margin-bottom: 8px;
        }
        .features {
            background-color: #f0fff4;
            border-left: 4px solid #48bb78;
            padding: 15px;
            margin: 20px 0;
        }
        .footer {
            background-color: #edf2f7;
            padding: 20px;
            text-align: center;
            font-size: 14px;
            color: #718096;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎉 Benvenuto!</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">Iscrizione confermata con successo</p>
        </div>

        <div class="content">
            <p>Ciao!</p>

            <p>Grazie per esserti iscritto alle notifiche per la galleria fotografica:</p>

            <div class="gallery-info">
                <div class="gallery-name">"${galleryName}"</div>
                <p style="margin: 0; color: #6b7280;">Riceverai aggiornamenti quando verranno aggiunte nuove foto</p>
            </div>

            <div class="features">
                <h3>📬 Cosa riceverai:</h3>
                <ul>
                    <li>📸 Notifica immediata quando vengono aggiunte nuove foto</li>
                    <li>👥 Aggiornamenti quando gli ospiti caricano i loro ricordi</li>
                    <li>🎨 Accesso diretto alla galleria aggiornata</li>
                    <li>💌 Email eleganti e non invasive</li>
                </ul>
            </div>

            <p>Ti ringraziamo per aver scelto il nostro servizio per rimanere aggiornato sui momenti più belli!</p>

            <p style="margin-top: 30px;">
                Con affetto,<br>
                <strong>Il Team della Galleria</strong>
            </p>
        </div>

        <div class="footer">
            <p>Questa email è stata inviata a <strong>${userEmail}</strong></p>
            <p>perché ti sei iscritto alle notifiche della galleria "${galleryName}".</p>
        </div>
    </div>
</body>
</html>`;
}

// Template testo per email di benvenuto
function generateWelcomeText(galleryName: string, userEmail: string): string {
  return `
🎉 Benvenuto! Iscrizione confermata

Ciao!

Grazie per esserti iscritto alle notifiche per la galleria fotografica "${galleryName}".

Cosa riceverai:
📸 Notifica immediata quando vengono aggiunte nuove foto
👥 Aggiornamenti quando gli ospiti caricano i loro ricordi  
🎨 Accesso diretto alla galleria aggiornata
💌 Email eleganti e non invasive

Ti ringraziamo per aver scelto il nostro servizio!

Con affetto,
Il Team della Galleria

---
Questa email è stata inviata a ${userEmail} perché ti sei iscritto alle notifiche della galleria "${galleryName}".
`;
}

// Template HTML per notifica nuove foto
function generateNewPhotosHTML(galleryName: string, newPhotosCount: number, uploaderName: string, galleryUrl: string): string {
  return `
<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Nuove foto disponibili</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f8f9fa;
        }
        .container {
            background-color: white;
            border-radius: 12px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #48bb78 0%, #38a169 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        .content {
            padding: 30px;
        }
        .photo-alert {
            background: linear-gradient(135deg, #fed7d7 0%, #feb2b2 100%);
            border-radius: 8px;
            padding: 20px;
            text-align: center;
            margin: 20px 0;
        }
        .count {
            font-size: 36px;
            font-weight: 700;
            color: #c53030;
            margin-bottom: 8px;
        }
        .cta-button {
            background: linear-gradient(135deg, #4299e1 0%, #3182ce 100%);
            color: white;
            padding: 15px 30px;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 600;
            display: inline-block;
            margin: 20px 0;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        .footer {
            background-color: #edf2f7;
            padding: 20px;
            text-align: center;
            font-size: 14px;
            color: #718096;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📸 Nuove foto disponibili!</h1>
        </div>

        <div class="content">
            <p>Ciao!</p>

            <p>Abbiamo una bella notizia per te:</p>

            <div class="photo-alert">
                <div class="count">${newPhotosCount}</div>
                <p style="margin: 0; font-weight: 600;">nuova${newPhotosCount > 1 ? 'e' : ''} foto ${newPhotosCount > 1 ? 'sono state aggiunte' : 'è stata aggiunta'}</p>
                <p style="margin: 8px 0 0 0; color: #666;">da ${uploaderName}</p>
            </div>

            <p>nella galleria <strong>"${galleryName}"</strong></p>

            <div style="text-align: center;">
                <a href="${galleryUrl}" class="cta-button">
                    🖼️ Visualizza le nuove foto
                </a>
            </div>
        </div>

        <div class="footer">
            <p>Questa notifica è stata inviata perché sei iscritto agli aggiornamenti di "${galleryName}"</p>
        </div>
    </div>
</body>
</html>`;
}

// Template testo per notifica nuove foto
function generateNewPhotosText(galleryName: string, newPhotosCount: number, uploaderName: string, galleryUrl: string): string {
  return `
📸 Nuove foto disponibili!

Ciao!

${newPhotosCount} nuova${newPhotosCount > 1 ? 'e' : ''} foto ${newPhotosCount > 1 ? 'sono state aggiunte' : 'è stata aggiunta'} da ${uploaderName} nella galleria "${galleryName}".

Visualizza le nuove foto: ${galleryUrl}

---
Questa notifica è stata inviata perché sei iscritto agli aggiornamenti di "${galleryName}".
`;
}

// Funzione backward-compatibility per sendGalleryUpdateEmail (deprecata)
export async function sendGalleryUpdateEmail(
  toEmail: string, 
  galleryName: string, 
  photoCount: number
): Promise<boolean> {
  console.warn('⚠️ sendGalleryUpdateEmail è deprecata, usa sendNewPhotosNotification');
  return await sendNewPhotosNotification(toEmail, galleryName, photoCount, 'Sistema', '');
}