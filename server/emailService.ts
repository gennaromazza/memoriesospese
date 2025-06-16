import sgMail from '@sendgrid/mail';
import type { EmailTemplate } from '../client/src/lib/emailTemplates';

// Configura SendGrid come fallback se le credenziali SMTP non funzionano
let emailProvider: 'smtp' | 'sendgrid' = 'smtp';
let transporter: any = null;

// Prova Gmail SMTP come provider più affidabile per Replit
async function initializeEmailProvider() {
  const { createTransport } = await import('nodemailer');

  // Opzione 1: Gmail SMTP (più affidabile su Replit)
  if (process.env.EMAIL_FROM && process.env.EMAIL_FROM.includes('gmail.com')) {
    try {
      const gmailTransporter = createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_FROM,
          pass: process.env.EMAIL_PASS, // App Password di Gmail
        },
        tls: {
          rejectUnauthorized: false
        }
      });

      await gmailTransporter.verify();
      transporter = gmailTransporter;
      emailProvider = 'smtp';
      console.log('✓ Gmail SMTP provider inizializzato con successo');
      return;
    } catch (gmailError) {
      console.warn('⚠ Gmail SMTP non disponibile:', gmailError instanceof Error ? gmailError.message : 'Unknown error');
    }
  }

  // Opzione 2: SMTP generico con porte alternative
  const smtpConfigs = [
    { port: 25, secure: false, name: 'SMTP 25' },
    { port: 587, secure: false, name: 'SMTP 587 TLS' },
    { port: 465, secure: true, name: 'SMTP 465 SSL' }
  ];

  for (const config of smtpConfigs) {
    try {
      const smtpTransporter = createTransport({
        host: process.env.EMAIL_HOST,
        port: config.port,
        secure: config.secure,
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
        tls: {
          rejectUnauthorized: false,
          ciphers: 'SSLv3'
        },
        connectionTimeout: 8000,
        greetingTimeout: 8000,
        socketTimeout: 8000
      });

      await smtpTransporter.verify();
      transporter = smtpTransporter;
      emailProvider = 'smtp';
      console.log(`✓ ${config.name} provider inizializzato con successo`);
      return;
    } catch (smtpError) {
      console.warn(`⚠ ${config.name} non disponibile:`, smtpError instanceof Error ? smtpError.message : 'Unknown error');
    }
  }

  console.error('❌ Nessun provider email SMTP disponibile');
}

// Inizializza il provider email al caricamento
initializeEmailProvider();

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
  fromName?: string;
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  try {
    const fromEmail = process.env.EMAIL_FROM;
    if (!fromEmail) {
      throw new Error('EMAIL_FROM non configurato');
    }

    if (emailProvider === 'smtp' && transporter) {
      // Invio tramite SMTP
      const mailOptions = {
        from: `${options.fromName || 'Wedding Gallery'} <${fromEmail}>`,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
        headers: {
          'X-Mailer': 'Wedding Gallery System',
          'X-Priority': '3',
          'X-MSMail-Priority': 'Normal',
          'Importance': 'Normal',
          'List-Unsubscribe': `<mailto:${fromEmail}?subject=Unsubscribe>`,
          'Reply-To': fromEmail,
        },
        envelope: {
          from: fromEmail,
          to: options.to
        }
      };

      const result = await transporter.sendMail(mailOptions);
      console.log(`Email inviata via SMTP a ${options.to}:`, result?.messageId || 'ID non disponibile');
      return true;

    } else if (emailProvider === 'sendgrid') {
      // Invio tramite SendGrid
      const msg = {
        to: options.to,
        from: fromEmail,
        subject: options.subject,
        text: options.text,
        html: options.html,
        replyTo: fromEmail,
        headers: {
          'X-Mailer': 'Wedding Gallery System',
          'List-Unsubscribe': `<mailto:${fromEmail}?subject=Unsubscribe>`,
        }
      };

      await sgMail.send(msg);
      console.log(`Email inviata via SendGrid a ${options.to}`);
      return true;

    } else {
      throw new Error('Nessun provider email disponibile');
    }
    
  } catch (error) {
    console.error('Errore nell\'invio email:', error);
    
    // Se SMTP fallisce, prova SendGrid come fallback
    if (emailProvider === 'smtp' && process.env.SENDGRID_API_KEY) {
      console.log('Tentativo fallback con SendGrid...');
      try {
        const fromEmail = process.env.EMAIL_FROM;
        if (!fromEmail) {
          throw new Error('EMAIL_FROM richiesto per SendGrid fallback');
        }
        
        const msg = {
          to: options.to,
          from: fromEmail,
          subject: options.subject,
          text: options.text,
          html: options.html,
          replyTo: fromEmail
        };

        await sgMail.send(msg);
        console.log(`Email inviata via SendGrid (fallback) a ${options.to}`);
        return true;
      } catch (fallbackError) {
        console.error('Errore anche con SendGrid fallback:', fallbackError);
      }
    }
    
    return false;
  }
}

export async function sendWelcomeEmail(
  email: string, 
  galleryName: string, 
  fromName?: string
): Promise<boolean> {
  const template: EmailTemplate = {
    subject: `✨ Benvenuto! Sei iscritto alle notifiche di "${galleryName}"`,
    html: generateWelcomeHTML(galleryName, email),
    text: generateWelcomeText(galleryName, email)
  };

  return await sendEmail({
    to: email,
    subject: template.subject,
    html: template.html,
    text: template.text,
    fromName: fromName || 'Galleria Fotografica'
  });
}

export async function sendNewPhotosNotification(
  email: string,
  galleryName: string,
  newPhotosCount: number,
  uploaderName: string,
  galleryUrl: string,
  fromName?: string
): Promise<boolean> {
  const template: EmailTemplate = {
    subject: `📸 ${newPhotosCount} nuova${newPhotosCount > 1 ? 'e' : ''} foto in "${galleryName}"`,
    html: generateNewPhotosHTML(galleryName, newPhotosCount, uploaderName, galleryUrl),
    text: generateNewPhotosText(galleryName, newPhotosCount, uploaderName, galleryUrl)
  };

  return await sendEmail({
    to: email,
    subject: template.subject,
    html: template.html,
    text: template.text,
    fromName: fromName || 'Galleria Fotografica'
  });
}

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