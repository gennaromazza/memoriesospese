import nodemailer from 'nodemailer';

// Configurazione centralizzata SMTP Brevo (ex-Sendinblue)
const transporter = nodemailer.createTransport({
  host: 'smtp-relay.brevo.com',
  port: 587,
  secure: false, // STARTTLS su porta 587
  auth: {
    user: '91c91c001@smtp-brevo.com',
    pass: 'sIBRNp2r1y6Y0WTZ'
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
      from: `"Wedding Gallery" <91c91c001@smtp-brevo.com>`,
      to: toEmail,
      subject: `📸 ${newPhotosCount} nuova${newPhotosCount > 1 ? 'e' : ''} foto in "${galleryName}"`,
      html: generateNewPhotosHTML(galleryName, newPhotosCount, uploaderName, galleryUrl),
      text: generateNewPhotosText(galleryName, newPhotosCount, uploaderName, galleryUrl),
      headers: {
        'X-Mailer': 'Wedding Gallery System',
        'X-Priority': '3',
        'List-Unsubscribe': `<mailto:91c91c001@smtp-brevo.com?subject=Unsubscribe>`,
        'Reply-To': '91c91c001@smtp-brevo.com'
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
      from: `"Wedding Gallery" <91c91c001@smtp-brevo.com>`,
      to: toEmail,
      subject: `✨ Benvenuto! Sei iscritto alle notifiche di "${galleryName}"`,
      html: generateWelcomeHTML(galleryName, toEmail),
      text: generateWelcomeText(galleryName, toEmail),
      headers: {
        'X-Mailer': 'Wedding Gallery System',
        'X-Priority': '3',
        'List-Unsubscribe': `<mailto:91c91c001@smtp-brevo.com?subject=Unsubscribe>`,
        'Reply-To': '91c91c001@smtp-brevo.com'
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
    <title>Benvenuto - Wedding Gallery</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background: linear-gradient(135deg, #ffeaa7 0%, #fab1a0 50%, #fd79a8 100%);
            min-height: 100vh;
        }
        .container {
            background-color: white;
            border-radius: 20px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
            overflow: hidden;
            border: 3px solid #fff;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px 30px;
            text-align: center;
            position: relative;
        }
        .header::before {
            content: '';
            position: absolute;
            top: -50%;
            left: -50%;
            width: 200%;
            height: 200%;
            background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
            animation: shimmer 3s ease-in-out infinite;
        }
        @keyframes shimmer {
            0%, 100% { transform: scale(0.8); opacity: 0.3; }
            50% { transform: scale(1.2); opacity: 0.1; }
        }
        .header h1 {
            margin: 0;
            font-size: 32px;
            font-weight: 700;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
            position: relative;
            z-index: 1;
        }
        .header p {
            margin: 15px 0 0 0;
            opacity: 0.95;
            font-size: 16px;
            position: relative;
            z-index: 1;
        }
        .content {
            padding: 40px 30px;
        }
        .gallery-info {
            background: linear-gradient(135deg, #a8edea 0%, #fed6e3 100%);
            border: none;
            border-radius: 15px;
            padding: 25px;
            margin: 25px 0;
            text-align: center;
            box-shadow: 0 8px 20px rgba(0,0,0,0.1);
        }
        .gallery-name {
            font-size: 26px;
            font-weight: 800;
            color: #2d3748;
            margin-bottom: 10px;
            text-shadow: 1px 1px 2px rgba(0,0,0,0.1);
        }
        .features {
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
            color: white;
            border: none;
            border-radius: 15px;
            padding: 25px;
            margin: 25px 0;
            box-shadow: 0 8px 20px rgba(0,0,0,0.15);
        }
        .features h3 {
            margin-top: 0;
            font-size: 20px;
            font-weight: 700;
        }
        .features ul {
            margin: 15px 0;
            padding-left: 20px;
        }
        .features li {
            margin: 8px 0;
            font-size: 15px;
        }
        .cta-section {
            background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
            color: white;
            border-radius: 15px;
            padding: 25px;
            text-align: center;
            margin: 25px 0;
            box-shadow: 0 8px 20px rgba(0,0,0,0.15);
        }
        .firebase-badge {
            background: #ff6b35;
            color: white;
            padding: 8px 15px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            display: inline-block;
            margin: 10px 0;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .footer {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 25px;
            text-align: center;
            font-size: 14px;
        }
        .footer p {
            margin: 5px 0;
            opacity: 0.9;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎉 Benvenuto in Wedding Gallery!</h1>
            <p>La tua iscrizione è stata confermata con successo</p>
            <div class="firebase-badge">⚡ Powered by Firebase</div>
        </div>

        <div class="content">
            <p style="font-size: 18px; color: #2d3748;"><strong>Ciao!</strong></p>

            <p style="font-size: 16px; color: #4a5568;">Grazie per esserti iscritto alle notifiche per la galleria fotografica:</p>

            <div class="gallery-info">
                <div class="gallery-name">"${galleryName}"</div>
                <p style="margin: 0; color: #2d3748; font-weight: 500;">Riceverai aggiornamenti in tempo reale quando verranno aggiunte nuove foto</p>
            </div>

            <div class="features">
                <h3>📬 Cosa riceverai:</h3>
                <ul>
                    <li>📸 Notifiche istantanee per nuove foto caricate</li>
                    <li>👥 Aggiornamenti quando gli ospiti condividono i loro ricordi</li>
                    <li>🎨 Accesso diretto alla galleria sempre aggiornata</li>
                    <li>💌 Email eleganti e mai invasive</li>
                    <li>🔔 Sistema di notifiche in tempo reale</li>
                </ul>
            </div>

            <div class="cta-section">
                <h3 style="margin-top: 0;">✨ Tecnologia Avanzata</h3>
                <p style="margin: 10px 0;">La nostra piattaforma utilizza Firebase per garantire aggiornamenti istantanei e la massima affidabilità per tutti i tuoi ricordi speciali.</p>
            </div>

            <p style="margin-top: 30px; font-size: 16px; color: #2d3748;">
                Ti ringraziamo per aver scelto <strong>Wedding Gallery</strong> per rimanere connesso ai momenti più belli!
            </p>

            <p style="margin-top: 20px; font-size: 16px; color: #4a5568;">
                Con affetto,<br>
                <strong style="color: #667eea;">Il Team di Wedding Gallery</strong>
            </p>
        </div>

        <div class="footer">
            <p><strong>Questa email è stata inviata a ${userEmail}</strong></p>
            <p>perché ti sei iscritto alle notifiche della galleria "${galleryName}"</p>
            <p style="margin-top: 15px; font-size: 12px; opacity: 0.8;">Wedding Gallery - Powered by Firebase & Replit</p>
        </div>
    </div>
</body>
</html>`;
}

// Template testo per email di benvenuto
function generateWelcomeText(galleryName: string, userEmail: string): string {
  return `
🎉 Benvenuto in Wedding Gallery!

Ciao!

Grazie per esserti iscritto alle notifiche per la galleria fotografica "${galleryName}".

⚡ Powered by Firebase - Aggiornamenti in tempo reale

Cosa riceverai:
📸 Notifiche istantanee per nuove foto caricate
👥 Aggiornamenti quando gli ospiti condividono i loro ricordi
🎨 Accesso diretto alla galleria sempre aggiornata
💌 Email eleganti e mai invasive
🔔 Sistema di notifiche in tempo reale

✨ Tecnologia Avanzata
La nostra piattaforma utilizza Firebase per garantire aggiornamenti istantanei e la massima affidabilità per tutti i tuoi ricordi speciali.

Ti ringraziamo per aver scelto Wedding Gallery per rimanere connesso ai momenti più belli!

Con affetto,
Il Team di Wedding Gallery

---
Questa email è stata inviata a ${userEmail} perché ti sei iscritto alle notifiche della galleria "${galleryName}".
Wedding Gallery - Powered by Firebase & Replit
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
    <title>Nuove foto disponibili - Wedding Gallery</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background: linear-gradient(135deg, #ff9a9e 0%, #fecfef 50%, #fecfef 100%);
            min-height: 100vh;
        }
        .container {
            background-color: white;
            border-radius: 20px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
            overflow: hidden;
            border: 3px solid #fff;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 35px 30px;
            text-align: center;
            position: relative;
        }
        .header::before {
            content: '';
            position: absolute;
            top: -50%;
            left: -50%;
            width: 200%;
            height: 200%;
            background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
            animation: pulse 2s ease-in-out infinite;
        }
        @keyframes pulse {
            0%, 100% { transform: scale(0.9); opacity: 0.3; }
            50% { transform: scale(1.1); opacity: 0.1; }
        }
        .header h1 {
            margin: 0;
            font-size: 28px;
            font-weight: 700;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
            position: relative;
            z-index: 1;
        }
        .content {
            padding: 35px 30px;
        }
        .photo-alert {
            background: linear-gradient(135deg, #ff6b6b 0%, #feca57 100%);
            border: none;
            border-radius: 20px;
            padding: 30px;
            text-align: center;
            margin: 25px 0;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
            position: relative;
            overflow: hidden;
        }
        .photo-alert::before {
            content: '';
            position: absolute;
            top: -50%;
            left: -50%;
            width: 200%;
            height: 200%;
            background: radial-gradient(circle, rgba(255,255,255,0.2) 0%, transparent 70%);
            animation: shimmer 4s ease-in-out infinite;
        }
        @keyframes shimmer {
            0%, 100% { transform: rotate(0deg); }
            50% { transform: rotate(180deg); }
        }
        .count {
            font-size: 48px;
            font-weight: 900;
            color: white;
            margin-bottom: 10px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
            position: relative;
            z-index: 1;
        }
        .photo-alert p {
            color: white;
            font-weight: 600;
            font-size: 16px;
            margin: 5px 0;
            text-shadow: 1px 1px 2px rgba(0,0,0,0.2);
            position: relative;
            z-index: 1;
        }
        .uploader-info {
            background: linear-gradient(135deg, #a8edea 0%, #fed6e3 100%);
            border-radius: 15px;
            padding: 20px;
            margin: 20px 0;
            text-align: center;
            box-shadow: 0 8px 20px rgba(0,0,0,0.1);
        }
        .gallery-name {
            font-size: 22px;
            font-weight: 700;
            color: #2d3748;
            margin: 10px 0;
            text-shadow: 1px 1px 2px rgba(0,0,0,0.1);
        }
        .cta-button {
            background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
            color: white;
            padding: 18px 35px;
            text-decoration: none;
            border-radius: 50px;
            font-weight: 700;
            font-size: 16px;
            display: inline-block;
            margin: 25px 0;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
            transition: all 0.3s ease;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .cta-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 15px 35px rgba(0, 0, 0, 0.3);
        }
        .firebase-badge {
            background: #ff6b35;
            color: white;
            padding: 8px 15px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            display: inline-block;
            margin: 15px 0;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .footer {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 25px;
            text-align: center;
            font-size: 14px;
        }
        .footer p {
            margin: 5px 0;
            opacity: 0.9;
        }
        .notification-icon {
            font-size: 60px;
            margin-bottom: 15px;
            animation: bounce 2s infinite;
        }
        @keyframes bounce {
            0%, 20%, 50%, 80%, 100% { transform: translateY(0); }
            40% { transform: translateY(-10px); }
            60% { transform: translateY(-5px); }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="notification-icon">📸</div>
            <h1>Nuove foto disponibili!</h1>
            <div class="firebase-badge">⚡ Aggiornamento Real-time</div>
        </div>

        <div class="content">
            <p style="font-size: 18px; color: #2d3748;"><strong>Ciao!</strong></p>

            <p style="font-size: 16px; color: #4a5568;">Abbiamo una fantastica notizia per te:</p>

            <div class="photo-alert">
                <div class="count">${newPhotosCount}</div>
                <p style="margin: 0; font-weight: 700; font-size: 18px;">nuova${newPhotosCount > 1 ? 'e' : ''} foto ${newPhotosCount > 1 ? 'sono state aggiunte' : 'è stata aggiunta'}!</p>
                <p style="margin: 8px 0 0 0; font-size: 14px; opacity: 0.9;">Caricate da ${uploaderName}</p>
            </div>

            <div class="uploader-info">
                <p style="margin: 0; color: #2d3748; font-size: 16px;">nella galleria matrimoniale</p>
                <div class="gallery-name">"${galleryName}"</div>
                <p style="margin: 10px 0 0 0; color: #4a5568; font-size: 14px;">I tuoi ricordi speciali ti aspettano! 💕</p>
            </div>

            <div style="text-align: center;">
                <a href="${galleryUrl}" class="cta-button">
                    🖼️ Visualizza le nuove foto
                </a>
            </div>

            <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; border-radius: 15px; padding: 20px; margin: 25px 0; text-align: center; box-shadow: 0 8px 20px rgba(0,0,0,0.15);">
                <p style="margin: 0; font-weight: 600;">✨ Grazie per essere parte di questo momento speciale!</p>
                <p style="margin: 10px 0 0 0; font-size: 14px; opacity: 0.9;">Ogni foto racconta una storia unica del vostro giorno perfetto</p>
            </div>
        </div>

        <div class="footer">
            <p><strong>Questa notifica è stata inviata in tempo reale</strong></p>
            <p>perché sei iscritto agli aggiornamenti di "${galleryName}"</p>
            <p style="margin-top: 15px; font-size: 12px; opacity: 0.8;">Wedding Gallery - Powered by Firebase & Replit</p>
        </div>
    </div>
</body>
</html>`;
}

// Template testo per notifica nuove foto
function generateNewPhotosText(galleryName: string, newPhotosCount: number, uploaderName: string, galleryUrl: string): string {
  return `
📸 Nuove foto disponibili - Wedding Gallery!

Ciao!

🎉 Abbiamo una fantastica notizia per te:

${newPhotosCount} nuova${newPhotosCount > 1 ? 'e' : ''} foto ${newPhotosCount > 1 ? 'sono state aggiunte' : 'è stata aggiunta'} da ${uploaderName} nella galleria matrimoniale "${galleryName}".

⚡ Aggiornamento Real-time tramite Firebase

I tuoi ricordi speciali ti aspettano! 💕

Visualizza le nuove foto: ${galleryUrl}

✨ Grazie per essere parte di questo momento speciale!
Ogni foto racconta una storia unica del vostro giorno perfetto.

---
Questa notifica è stata inviata in tempo reale perché sei iscritto agli aggiornamenti di "${galleryName}".
Wedding Gallery - Powered by Firebase & Replit
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