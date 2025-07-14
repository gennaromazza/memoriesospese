/**
 * Firebase Cloud Functions per Wedding Gallery
 * Versione compilata manualmente per deployment
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const cors = require('cors');

// Inizializza Firebase Admin
admin.initializeApp();

// Configurazione CORS per permettere richieste da gennaromazzacane.it
const corsHandler = cors({
  origin: [
    'https://gennaromazzacane.it',
    'https://www.gennaromazzacane.it',
    'http://localhost:3000',
    'http://localhost:5000',
    'https://localhost:3000',
    'https://localhost:5000'
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
});

// Configurazione SMTP Brevo
const smtpConfig = {
  host: 'smtp-relay.brevo.com',
  port: 587,
  secure: false, // STARTTLS
  auth: {
    user: '91c91c001@smtp-brevo.com',
    pass: 'sIBRNp2r1y6Y0WTZ'
  },
  tls: {
    rejectUnauthorized: false
  }
};

const transporter = nodemailer.createTransport(smtpConfig);

// Verifica configurazione SMTP al caricamento
transporter.verify((error, success) => {
  if (error) {
    console.error('SMTP configuration error:', error);
  } else {
    console.log('SMTP server ready for email sending');
  }
});

/**
 * Function per invio notifiche nuove foto - Con supporto CORS
 */
exports.sendNewPhotosNotification = functions.https.onRequest(async (req, res) => {
  corsHandler(req, res, async () => {
    try {
      // Gestione preflight OPTIONS
      if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
      }

      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }

      const { galleryName, newPhotosCount, uploaderName, galleryUrl, recipients } = req.body;

      if (!recipients || recipients.length === 0) {
        res.status(400).json({ error: 'Recipients list is required' });
        return;
      }

      const mailOptions = {
        from: '"Wedding Gallery" <91c91c001@smtp-brevo.com>',
        to: recipients.join(','),
        subject: `📸 ${newPhotosCount} nuova${newPhotosCount > 1 ? 'e' : ''} foto in "${galleryName}"`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #8b5a3c; text-align: center;">🎉 Nuove foto disponibili!</h2>
            <div style="background: #f9f7f4; padding: 20px; border-radius: 10px; margin: 20px 0;">
              <p style="font-size: 16px; margin-bottom: 10px;">
                <strong>${uploaderName}</strong> ha caricato <strong>${newPhotosCount}</strong> 
                nuova${newPhotosCount > 1 ? 'e' : ''} foto nella galleria 
                <strong style="color: #8b5a3c;">${galleryName}</strong>.
              </p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${galleryUrl}" 
                   style="background: #8b5a3c; color: white; padding: 15px 30px; 
                          text-decoration: none; border-radius: 5px; font-weight: bold;">
                  📸 Visualizza la Galleria
                </a>
              </div>
            </div>
            <div style="text-align: center; color: #666; font-size: 12px; margin-top: 30px;">
              <p>Wedding Gallery System - Powered by Firebase</p>
            </div>
          </div>
        `,
        headers: {
          'X-Mailer': 'Wedding Gallery System',
          'X-Priority': '3',
          'List-Unsubscribe': '<mailto:91c91c001@smtp-brevo.com?subject=Unsubscribe>',
          'Reply-To': '91c91c001@smtp-brevo.com'
        }
      };

      await transporter.sendMail(mailOptions);
      console.log(`New photos notification sent to ${recipients.length} recipients`);
      
      res.status(200).json({ success: true, message: 'Notification sent successfully' });
    } catch (error) {
      console.error('Error sending new photos notification:', error);
      res.status(500).json({ error: 'Failed to send notification email' });
    }
  });
});

/**
 * Function per invio notifiche nuove foto - Versione onCall per compatibilità
 */
exports.sendNewPhotosNotificationCall = functions.https.onCall(async (data, context) => {
  try {
    const { galleryName, newPhotosCount, uploaderName, galleryUrl, recipients } = data;

    if (!recipients || recipients.length === 0) {
      throw new functions.https.HttpsError('invalid-argument', 'Recipients list is required');
    }

    const mailOptions = {
      from: '"Wedding Gallery" <91c91c001@smtp-brevo.com>',
      to: recipients.join(','),
      subject: `📸 ${newPhotosCount} nuova${newPhotosCount > 1 ? 'e' : ''} foto in "${galleryName}"`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #8b5a3c; text-align: center;">🎉 Nuove foto disponibili!</h2>
          <div style="background: #f9f7f4; padding: 20px; border-radius: 10px; margin: 20px 0;">
            <p style="font-size: 16px; margin-bottom: 10px;">
              <strong>${uploaderName}</strong> ha caricato <strong>${newPhotosCount}</strong> 
              nuova${newPhotosCount > 1 ? 'e' : ''} foto nella galleria 
              <strong style="color: #8b5a3c;">${galleryName}</strong>.
            </p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${galleryUrl}" 
                 style="background: #8b5a3c; color: white; padding: 15px 30px; 
                        text-decoration: none; border-radius: 5px; font-weight: bold;">
                📸 Visualizza la Galleria
              </a>
            </div>
          </div>
          <div style="text-align: center; color: #666; font-size: 12px; margin-top: 30px;">
            <p>Wedding Gallery System - Powered by Firebase</p>
          </div>
        </div>
      `,
      headers: {
        'X-Mailer': 'Wedding Gallery System',
        'X-Priority': '3',
        'List-Unsubscribe': '<mailto:91c91c001@smtp-brevo.com?subject=Unsubscribe>',
        'Reply-To': '91c91c001@smtp-brevo.com'
      }
    };

    await transporter.sendMail(mailOptions);
    console.log(`New photos notification sent to ${recipients.length} recipients`);
    
    return { success: true, message: 'Notification sent successfully' };
  } catch (error) {
    console.error('Error sending new photos notification:', error);
    throw new functions.https.HttpsError('internal', 'Failed to send notification email');
  }
});

/**
 * Function per invio password galleria
 */
exports.sendGalleryPassword = functions.https.onCall(async (data, context) => {
  try {
    const { recipientEmail, galleryName, galleryCode, galleryPassword } = data;

    if (!recipientEmail || !galleryName || !galleryCode) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing required parameters');
    }

    const mailOptions = {
      from: '"Wedding Gallery" <91c91c001@smtp-brevo.com>',
      to: recipientEmail,
      subject: `🔑 Codice di accesso per "${galleryName}"`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #8b5a3c; text-align: center;">🔑 Accesso alla Galleria</h2>
          <div style="background: #f9f7f4; padding: 20px; border-radius: 10px; margin: 20px 0;">
            <p style="font-size: 16px; margin-bottom: 20px;">
              Ecco i dati per accedere alla galleria <strong style="color: #8b5a3c;">${galleryName}</strong>:
            </p>
            <div style="background: white; padding: 15px; border-radius: 5px; text-align: center; margin: 20px 0;">
              <p style="margin: 0; font-size: 14px; color: #666;">Codice Galleria:</p>
              <h3 style="margin: 5px 0; color: #8b5a3c; font-size: 24px; font-family: monospace;">
                ${galleryCode}
              </h3>
              ${galleryPassword ? `
                <p style="margin: 15px 0 0 0; font-size: 14px; color: #666;">Password:</p>
                <h3 style="margin: 5px 0; color: #8b5a3c; font-size: 20px; font-family: monospace;">
                  ${galleryPassword}
                </h3>
              ` : ''}
            </div>
            <p style="font-size: 14px; color: #666; text-align: center;">
              Usa questi dati per accedere alla galleria e visualizzare le foto.
            </p>
          </div>
          <div style="text-align: center; color: #666; font-size: 12px; margin-top: 30px;">
            <p>Wedding Gallery System - Powered by Firebase</p>
          </div>
        </div>
      `,
      headers: {
        'X-Mailer': 'Wedding Gallery System',
        'Reply-To': '91c91c001@smtp-brevo.com'
      }
    };

    await transporter.sendMail(mailOptions);
    console.log(`Gallery password sent to ${recipientEmail}`);
    
    return { success: true, message: 'Gallery password sent successfully' };
  } catch (error) {
    console.error('Error sending gallery password:', error);
    throw new functions.https.HttpsError('internal', 'Failed to send gallery password email');
  }
});

/**
 * Function per test configurazione email
 */
exports.testEmailConfiguration = functions.https.onCall(async (data, context) => {
  try {
    const { testRecipient } = data;
    const recipient = testRecipient || 'gennaro.mazzacane@gmail.com';

    const mailOptions = {
      from: '"Wedding Gallery" <91c91c001@smtp-brevo.com>',
      to: recipient,
      subject: '✅ Test Configurazione Email - Wedding Gallery',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #8b5a3c; text-align: center;">✅ Test Email Configurazione</h2>
          <div style="background: #f9f7f4; padding: 20px; border-radius: 10px;">
            <p>Questo è un test per verificare che la configurazione email Brevo funzioni correttamente.</p>
            <p><strong>Data/Ora:</strong> ${new Date().toLocaleString('it-IT')}</p>
            <p><strong>Sistema:</strong> Firebase Cloud Functions + Brevo SMTP</p>
            <p><strong>Status:</strong> ✅ Configurazione funzionante!</p>
          </div>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`Test email sent to ${recipient}`);
    
    return { success: true, message: 'Test email sent successfully' };
  } catch (error) {
    console.error('Error sending test email:', error);
    throw new functions.https.HttpsError('internal', 'Failed to send test email');
  }
});

/**
 * Function per email di benvenuto
 */
exports.sendWelcomeEmail = functions.https.onCall(async (data, context) => {
  try {
    const { recipientEmail, galleryName } = data;

    if (!recipientEmail || !galleryName) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing required parameters');
    }

    const mailOptions = {
      from: '"Wedding Gallery" <91c91c001@smtp-brevo.com>',
      to: recipientEmail,
      subject: `✨ Benvenuto! Sei iscritto alle notifiche di "${galleryName}"`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #8b5a3c; text-align: center;">✨ Benvenuto nella Galleria!</h2>
          <div style="background: #f9f7f4; padding: 20px; border-radius: 10px;">
            <p>Ciao! Sei stato iscritto alle notifiche della galleria <strong>${galleryName}</strong>.</p>
            <p>Riceverai automaticamente una email ogni volta che verranno caricate nuove foto.</p>
            <p>Grazie per essere parte di questo momento speciale! 💕</p>
          </div>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`Welcome email sent to ${recipientEmail}`);
    
    return { success: true, message: 'Welcome email sent successfully' };
  } catch (error) {
    console.error('Error sending welcome email:', error);
    throw new functions.https.HttpsError('internal', 'Failed to send welcome email');
  }
});