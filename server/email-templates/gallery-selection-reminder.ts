/**
 * Template email per reminder scadenza selezione foto galleria.
 * Inviato automaticamente 24h prima della scadenza impostata dall'admin.
 * Palette October Mist: sage #8b9a7d, terracotta #c4724a, cream #f5f0e8
 */

export interface GallerySelectionReminderParams {
  clientName: string;
  galleryName: string;
  galleryUrl: string;
  deadlineDate: string;
  deadlineTime?: string;
  photoCount?: number;
  studioName: string;
  studioPhone?: string;
  studioEmail?: string;
}

export function generateGallerySelectionReminderEmail(params: GallerySelectionReminderParams): string {
  const { clientName, galleryName, galleryUrl, deadlineDate, deadlineTime, photoCount, studioName, studioPhone, studioEmail } = params;

  const photoCountLine = photoCount
    ? `<p style="margin:8px 0;color:#555;font-size:14px;">Hai a disposizione <strong>${photoCount} foto</strong> da cui scegliere.</p>`
    : '';

  const timeLine = deadlineTime
    ? ` alle <strong>${deadlineTime}</strong>`
    : '';

  return `
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background-color:#faf8f5;">

      <div style="background:linear-gradient(135deg,#c4724a 0%,#d4956e 100%);color:white;padding:30px;text-align:center;border-radius:12px 12px 0 0;">
        <h1 style="margin:0;font-size:26px;font-weight:600;">⏰ Scadenza Selezione Foto</h1>
        <p style="margin:8px 0 0 0;font-size:14px;opacity:0.9;">La tua selezione scade domani</p>
      </div>

      <div style="background:white;padding:30px;border-radius:0 0 12px 12px;box-shadow:0 4px 6px rgba(0,0,0,0.08);">

        <p style="font-size:16px;color:#333;margin-bottom:20px;">
          Ciao <strong>${clientName}</strong>,
        </p>

        <div style="background:#fff7f0;border-left:4px solid #c4724a;padding:20px;margin:25px 0;border-radius:0 8px 8px 0;">
          <h3 style="color:#c4724a;margin:0 0 10px 0;font-size:18px;">Hai ancora 24 ore per scegliere le tue foto!</h3>
          <p style="color:#555;margin:0 0 8px 0;font-size:14px;line-height:1.6;">
            La scadenza per la selezione della galleria <strong style="color:#8b9a7d;">${galleryName}</strong>
            è fissata per <strong>domani ${deadlineDate}${timeLine}</strong>.
          </p>
          ${photoCountLine}
        </div>

        <p style="color:#555;font-size:14px;line-height:1.6;margin:20px 0;">
          Accedi alla galleria e completa la tua selezione prima che scada il termine.
          Una volta selezionate le foto, il nostro studio le elaborerà e ti consegnerà il prodotto finale.
        </p>

        <div style="text-align:center;margin:30px 0;">
          <a href="${galleryUrl}"
             style="background:linear-gradient(135deg,#c4724a,#d4956e);color:white;padding:14px 32px;text-decoration:none;border-radius:8px;font-weight:600;font-size:16px;display:inline-block;box-shadow:0 4px 12px rgba(196,114,74,0.3);">
            📷 Vai alla Galleria e Seleziona le Foto
          </a>
        </div>

        <div style="background:#f5f0e8;border-radius:8px;padding:16px;margin:20px 0;border:1px solid #e8e0d4;">
          <p style="margin:0;font-size:13px;color:#888;line-height:1.6;">
            ⚠️ <strong>Importante:</strong> Se non completi la selezione entro la scadenza,
            il nostro studio procederà con la selezione standard secondo i termini concordati.
          </p>
        </div>

        <div style="border-top:1px solid #f0ebe3;padding-top:20px;margin-top:20px;text-align:center;">
          <p style="margin:4px 0;font-size:13px;color:#888;"><strong>${studioName}</strong></p>
          ${studioPhone ? `<p style="margin:4px 0;font-size:13px;color:#888;">📞 ${studioPhone}</p>` : ''}
          ${studioEmail ? `<p style="margin:4px 0;font-size:13px;color:#888;">✉️ <a href="mailto:${studioEmail}" style="color:#c4724a;text-decoration:none;">${studioEmail}</a></p>` : ''}
          <p style="margin:12px 0 0 0;font-size:11px;color:#bbb;">
            Promemoria automatico inviato 24h prima della scadenza selezione
          </p>
        </div>

      </div>
    </div>
  `;
}

export function generateGallerySelectionReminderSubject(galleryName: string): string {
  return `Promemoria: la selezione foto di "${galleryName}" scade domani`;
}
