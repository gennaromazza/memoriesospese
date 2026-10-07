/**
 * Template Email: Notifica Video YouTube aggiunti alla Galleria
 * Template separato per mantenere il codice modulare
 */

interface StudioInfo {
  name: string;
  email: string;
  phone: string;
  address: string;
}

interface YouTubeVideoNotificationParams {
  clientName: string;
  galleryName: string;
  videoCount: number;
  galleryUrl: string;
  studioInfo?: StudioInfo;
}

export function createYouTubeVideoNotificationEmailHTML(params: YouTubeVideoNotificationParams): string {
  const { clientName, galleryName, videoCount, galleryUrl, studioInfo } = params;
  
  const studio = studioInfo || { 
    name: "Image Studio Fotografico", 
    email: "image.studio.fotografico@gmail.com",
    phone: "+39 334 7103142",
    address: ""
  };

  const videoText = videoCount === 1 
    ? "un nuovo video" 
    : `${videoCount} nuovi video`;

  return `
    <div style="font-family: 'Georgia', serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #fdfbf7;">
      
      <!-- Header -->
      <div style="text-align: center; padding: 30px 20px; border-bottom: 1px solid #e8e0d4;">
        <h1 style="font-family: 'Playfair Display', Georgia, serif; color: #8b5a3c; font-size: 28px; font-weight: 400; margin: 0; letter-spacing: 1px;">
          ${studio.name}
        </h1>
      </div>

      <!-- Content -->
      <div style="background: #ffffff; padding: 40px 30px; margin: 20px 0; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
        
        <p style="font-size: 18px; color: #5a5a5a; margin-bottom: 20px; line-height: 1.6;">
          Ciao <strong style="color: #8b5a3c;">${clientName}</strong>,
        </p>
        
        <p style="font-size: 16px; color: #5a5a5a; margin-bottom: 25px; line-height: 1.7;">
          Abbiamo aggiunto <strong>${videoText}</strong> alla tua galleria 
          <strong style="color: #8b5a3c;">"${galleryName}"</strong>.
        </p>

        <div style="background: linear-gradient(135deg, #f9f7f4 0%, #f0ebe3 100%); padding: 25px; border-radius: 8px; margin: 30px 0; border-left: 4px solid #8b5a3c;">
          <p style="font-size: 15px; color: #6b5a4a; margin: 0; line-height: 1.6;">
            I tuoi momenti speciali sono ora disponibili anche in formato video. 
            Accedi alla galleria per visualizzarli in alta qualita.
          </p>
        </div>

        <div style="text-align: center; margin: 35px 0;">
          <a href="${galleryUrl}" 
             style="display: inline-block; background: linear-gradient(135deg, #8b5a3c 0%, #a67c5b 100%); 
                    color: white; padding: 16px 40px; text-decoration: none; border-radius: 30px; 
                    font-weight: 500; font-size: 16px; letter-spacing: 0.5px;
                    box-shadow: 0 4px 15px rgba(139, 90, 60, 0.3);">
            Guarda i Video
          </a>
        </div>

        <p style="font-size: 14px; color: #888; text-align: center; margin-top: 30px; font-style: italic;">
          Se hai domande o desideri ulteriori informazioni, non esitare a contattarci.
        </p>
      </div>

      <!-- Footer -->
      <div style="text-align: center; color: #888; font-size: 13px; padding: 25px 20px; border-top: 1px solid #e8e0d4;">
        <p style="margin: 5px 0; font-weight: 600; color: #8b5a3c;">${studio.name}</p>
        ${studio.address ? `<p style="margin: 5px 0;">${studio.address}</p>` : ''}
        <p style="margin: 5px 0;">Email: <a href="mailto:${studio.email}" style="color: #8b5a3c; text-decoration: none;">${studio.email}</a></p>
        <p style="margin: 5px 0;">Tel: ${studio.phone}</p>
        <p style="font-size: 11px; margin-top: 15px; opacity: 0.7;">
          Hai ricevuto questa email perche la tua galleria fotografica e stata aggiornata.
        </p>
      </div>
    </div>
  `;
}

export function getYouTubeVideoNotificationSubject(galleryName: string, videoCount: number): string {
  if (videoCount === 1) {
    return `Nuovo video disponibile - ${galleryName}`;
  }
  return `${videoCount} nuovi video disponibili - ${galleryName}`;
}
