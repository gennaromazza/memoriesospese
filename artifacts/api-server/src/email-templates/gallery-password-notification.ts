/**
 * Template email per notifica password galleria
 * Inviato automaticamente alla creazione o manualmente dall'admin
 */

interface GalleryPasswordEmailParams {
  clientName?: string;
  galleryName: string;
  galleryUrl: string;
  password: string;
  studioName: string;
  studioPhone?: string;
  studioEmail?: string;
}

export function generateGalleryPasswordEmail(params: GalleryPasswordEmailParams): string {
  const { clientName, galleryName, galleryUrl, password, studioName, studioPhone, studioEmail } = params;

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #8b5a3c; text-align: center;">📷 Accesso alla tua Galleria Fotografica</h2>
      
      <div style="background: #f9f7f4; padding: 20px; border-radius: 10px; margin: 20px 0;">
        <p style="font-size: 16px; margin-bottom: 15px;">
          Ciao${clientName ? ` <strong>${clientName}</strong>` : ''},
        </p>
        <p style="font-size: 16px; margin-bottom: 20px;">
          La tua galleria <strong style="color: #8b5a3c;">${galleryName}</strong> è pronta per essere visualizzata!
        </p>

        <div style="background: #e7f3ff; border-left: 4px solid #0056b3; padding: 15px; margin: 20px 0;">
          <h3 style="color: #0056b3; margin-top: 0; margin-bottom: 10px;">Come accedere:</h3>
          <ol style="margin: 0; padding-left: 20px; font-size: 14px; color: #0c5460; line-height: 1.8;">
            <li>Clicca sul pulsante "Accedi alla Galleria" qui sotto</li>
            <li>Inserisci la password quando richiesta</li>
            <li>Sfoglia e seleziona le tue foto preferite!</li>
          </ol>
        </div>

        <div style="background: white; padding: 20px; border-radius: 5px; margin: 20px 0; text-align: center; border: 2px solid #8b5a3c;">
          <p style="font-size: 14px; color: #666; margin-bottom: 10px;">La tua password di accesso:</p>
          <p style="font-size: 24px; font-weight: bold; color: #8b5a3c; margin: 10px 0; letter-spacing: 2px; font-family: 'Courier New', monospace;">
            ${password}
          </p>
          <p style="font-size: 12px; color: #999; margin-top: 10px;">Conserva questa password in modo sicuro</p>
        </div>

        <div style="text-align: center; margin: 25px 0;">
          <a href="${galleryUrl}" 
             style="background: #8b5a3c; color: white; padding: 14px 28px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
            📷 Accedi alla Galleria
          </a>
        </div>
      </div>

      <div style="border-top: 1px solid #eee; padding-top: 20px; margin-top: 20px; text-align: center; color: #666; font-size: 12px;">
        <p style="margin: 5px 0;"><strong>${studioName}</strong></p>
        ${studioPhone ? `<p style="margin: 5px 0;">📞 ${studioPhone}</p>` : ''}
        ${studioEmail ? `<p style="margin: 5px 0;">✉️ ${studioEmail}</p>` : ''}
      </div>
    </div>
  `;
}

export function generateGalleryPasswordSubject(galleryName: string): string {
  return `📷 Accesso alla tua galleria: ${galleryName}`;
}
