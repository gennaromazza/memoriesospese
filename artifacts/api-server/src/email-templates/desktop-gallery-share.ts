export interface DesktopGalleryShare {
  galleryName: string;
  galleryUrl: string;
  access: { mode: 'open' } | { mode: 'password' | 'pin'; value: string };
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

export function desktopGalleryShareSubject(galleryName: string): string {
  return `La tua galleria fotografica | ${galleryName.replace(/[\r\n]+/g, ' ').trim()}`;
}

export function desktopGalleryShareHtml({ galleryName, galleryUrl, access }: DesktopGalleryShare): string {
  const name = escapeHtml(galleryName);
  const url = escapeHtml(galleryUrl);
  const credential = access.mode === 'open' ? '' : `
    <tr><td style="padding:0 36px 28px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #d9d3cb;border-radius:8px;background:#f7f5f1;">
        <tr><td style="padding:22px 24px;">
          <p style="margin:0 0 8px;color:#6d655e;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">
            ${access.mode === 'pin' ? 'PIN di accesso' : 'Password di accesso'}
          </p>
          <p style="margin:0;color:#292725;font-size:19px;line-height:1.5;font-family:Arial,sans-serif;font-weight:700;overflow-wrap:anywhere;">${escapeHtml(access.value)}</p>
          <p style="margin:10px 0 0;color:#6d655e;font-size:13px;line-height:1.5;">Inseriscila quando richiesto per aprire la galleria.</p>
        </td></tr>
      </table>
    </td></tr>`;

  return `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f1ec;font-family:Arial,Helvetica,sans-serif;color:#292725;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f3f1ec;">
    <tr><td align="center" style="padding:32px 12px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;background:#ffffff;border:1px solid #e5e0d9;border-radius:10px;">
        <tr><td style="padding:28px 36px;border-bottom:1px solid #e5e0d9;">
          <p style="margin:0;color:#8b644b;font-size:12px;letter-spacing:2px;font-weight:700;">IMAGE STUDIO FOTOGRAFICO</p>
        </td></tr>
        <tr><td style="padding:36px 36px 16px;">
          <h1 style="margin:0 0 20px;color:#292725;font-family:Georgia,serif;font-size:30px;line-height:1.2;font-weight:normal;">La tua galleria fotografica</h1>
          <p style="margin:0 0 14px;color:#4b4742;font-size:16px;line-height:1.7;">Ciao,</p>
          <p style="margin:0;color:#4b4742;font-size:16px;line-height:1.7;">puoi accedere alla galleria <strong>${name}</strong> dal link qui sotto.</p>
        </td></tr>
        <tr><td style="padding:20px 36px 24px;">
          <a href="${url}" style="display:inline-block;padding:15px 26px;border-radius:5px;background:#6f503e;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;">Apri la galleria</a>
        </td></tr>
        <tr><td style="padding:0 36px 28px;">
          <p style="margin:0 0 7px;color:#6d655e;font-size:13px;line-height:1.6;">Se il pulsante non funziona, copia questo indirizzo nel browser:</p>
          <a href="${url}" style="color:#6f503e;font-size:14px;line-height:1.6;text-decoration:underline;overflow-wrap:anywhere;">${url}</a>
        </td></tr>
        ${credential}
        <tr><td style="padding:22px 36px;border-top:1px solid #e5e0d9;">
          <p style="margin:0;color:#6d655e;font-size:13px;line-height:1.7;">A presto,<br><strong style="color:#292725;">Image Studio Fotografico</strong></p>
          ${access.mode === 'open' ? '' : '<p style="margin:12px 0 0;color:#6d655e;font-size:12px;line-height:1.5;">Questa email contiene le informazioni di accesso alla galleria: conservala e non inoltrarla a persone non autorizzate.</p>'}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}