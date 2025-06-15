export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export const createWelcomeEmailTemplate = (galleryName: string, userEmail: string): EmailTemplate => {
  const subject = `✨ Benvenuto! Sei iscritto alle notifiche di "${galleryName}"`;
  
  const html = `
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
        .features h3 {
            color: #2d3748;
            margin-top: 0;
        }
        .features ul {
            margin: 10px 0;
            padding-left: 20px;
        }
        .features li {
            margin: 8px 0;
            color: #4a5568;
        }
        .footer {
            background-color: #edf2f7;
            padding: 20px;
            text-align: center;
            font-size: 14px;
            color: #718096;
        }
        .unsubscribe {
            color: #a0aec0;
            font-size: 12px;
            margin-top: 15px;
        }
        .emoji {
            font-size: 20px;
            margin-right: 8px;
        }
        @media (max-width: 600px) {
            body {
                padding: 10px;
            }
            .header h1 {
                font-size: 24px;
            }
            .content {
                padding: 20px;
            }
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
                    <li><span class="emoji">📸</span>Notifica immediata quando vengono aggiunte nuove foto</li>
                    <li><span class="emoji">👥</span>Aggiornamenti quando gli ospiti caricano i loro ricordi</li>
                    <li><span class="emoji">🎨</span>Accesso diretto alla galleria aggiornata</li>
                    <li><span class="emoji">💌</span>Email eleganti e non invasive</li>
                </ul>
            </div>
            
            <p>Le nostre email sono progettate per essere:</p>
            <ul>
                <li>🚀 <strong>Immediate</strong> - ricevi le notifiche in tempo reale</li>
                <li>🎯 <strong>Rilevanti</strong> - solo aggiornamenti importanti</li>
                <li>📱 <strong>Mobile-friendly</strong> - perfette su ogni dispositivo</li>
                <li>🔒 <strong>Sicure</strong> - la tua privacy è protetta</li>
            </ul>
            
            <p>Ti ringraziamo per aver scelto il nostro servizio per rimanere aggiornato sui momenti più belli!</p>
            
            <p style="margin-top: 30px;">
                Con affetto,<br>
                <strong>Il Team della Galleria</strong>
            </p>
        </div>
        
        <div class="footer">
            <p>Questa email è stata inviata a <strong>${userEmail}</strong></p>
            <p>perché ti sei iscritto alle notifiche della galleria "${galleryName}".</p>
            
            <div class="unsubscribe">
                <p>📧 Questa email non finirà mai nello spam grazie alle nostre impostazioni ottimizzate</p>
                <p>🛡️ I tuoi dati sono protetti e non saranno mai condivisi con terzi</p>
            </div>
        </div>
    </div>
</body>
</html>`;

  const text = `
🎉 Benvenuto! Iscrizione confermata

Ciao!

Grazie per esserti iscritto alle notifiche per la galleria fotografica "${galleryName}".

Cosa riceverai:
📸 Notifica immediata quando vengono aggiunte nuove foto
👥 Aggiornamenti quando gli ospiti caricano i loro ricordi  
🎨 Accesso diretto alla galleria aggiornata
💌 Email eleganti e non invasive

Le nostre email sono:
🚀 Immediate - ricevi le notifiche in tempo reale
🎯 Rilevanti - solo aggiornamenti importanti
📱 Mobile-friendly - perfette su ogni dispositivo
🔒 Sicure - la tua privacy è protetta

Ti ringraziamo per aver scelto il nostro servizio!

Con affetto,
Il Team della Galleria

---
Questa email è stata inviata a ${userEmail} perché ti sei iscritto alle notifiche della galleria "${galleryName}".
🛡️ I tuoi dati sono protetti e non saranno mai condivisi con terzi.
`;

  return { subject, html, text };
};

export const createNewPhotosEmailTemplate = (
  galleryName: string, 
  newPhotosCount: number, 
  uploaderName: string,
  galleryUrl: string
): EmailTemplate => {
  const subject = `📸 ${newPhotosCount} nuova${newPhotosCount > 1 ? 'e' : ''} foto in "${galleryName}"`;
  
  const html = `
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
            
            <p style="color: #666; font-size: 14px;">
                Clicca il pulsante qui sopra per vedere subito le nuove foto aggiunte alla galleria.
            </p>
        </div>
        
        <div class="footer">
            <p>Questa notifica è stata inviata perché sei iscritto agli aggiornamenti di "${galleryName}"</p>
        </div>
    </div>
</body>
</html>`;

  const text = `
📸 Nuove foto disponibili!

Ciao!

${newPhotosCount} nuova${newPhotosCount > 1 ? 'e' : ''} foto ${newPhotosCount > 1 ? 'sono state aggiunte' : 'è stata aggiunta'} da ${uploaderName} nella galleria "${galleryName}".

Visualizza le nuove foto: ${galleryUrl}

---
Questa notifica è stata inviata perché sei iscritto agli aggiornamenti di "${galleryName}".
`;

  return { subject, html, text };
};