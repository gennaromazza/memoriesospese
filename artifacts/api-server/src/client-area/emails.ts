/**
 * Email e riquadri HTML dell'Area Cliente.
 *
 *  - welcomeEmailHtml: invito ad entrare nell'area (alla prima associazione a un lavoro)
 *  - clientAreaLinkBlock: riquadro "Segui tutto dalla tua area" da inserire
 *    nelle email già esistenti rivolte ai clienti.
 */

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export function clientAreaUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/area-cliente`;
}

/** Riquadro da inserire prima della firma nelle email ai clienti. */
export function clientAreaLinkBlock(baseUrl: string): string {
  const url = escapeHtml(clientAreaUrl(baseUrl));
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0 8px;">
  <tr><td style="background:#f3f5f1;border:1px solid #dfe5dc;border-radius:10px;padding:18px 20px;font-family:Arial,Helvetica,sans-serif;">
    <p style="margin:0 0 6px;color:#2f3a30;font-size:15px;font-weight:bold;">Segui tutto dalla tua area personale</p>
    <p style="margin:0 0 14px;color:#5d685f;font-size:13px;line-height:1.5;">Contratto, pagamenti, appuntamenti e gallerie in un unico posto. Entri con la tua email, senza password.</p>
    <a href="${url}" style="display:inline-block;background:#6b7f6b;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:bold;">Apri la mia area</a>
  </td></tr>
</table>`;
}

/**
 * Inserisce il riquadro prima della chiusura del contenuto principale.
 * Se l'HTML non ha un punto riconoscibile, lo aggiunge prima di </body>.
 * Non lo inserisce due volte.
 */
export function withClientAreaLink(html: string, baseUrl: string): string {
  if (html.includes('/area-cliente')) return html;
  const block = clientAreaLinkBlock(baseUrl);
  const marker = html.lastIndexOf('</body>');
  if (marker === -1) return `${html}${block}`;
  return `${html.slice(0, marker)}<div style="max-width:600px;margin:0 auto;padding:0 16px;">${block}</div>${html.slice(marker)}`;
}

export function welcomeEmailHtml({ studioName, nome, nomeEvento, baseUrl }: {
  studioName: string;
  nome: string;
  nomeEvento?: string;
  baseUrl: string;
}): string {
  const name = escapeHtml(studioName);
  const url = escapeHtml(clientAreaUrl(baseUrl));
  const evento = nomeEvento ? ` per <strong>${escapeHtml(nomeEvento)}</strong>` : '';
  return `<!DOCTYPE html>
<html lang="it"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f0e8;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f0e8;padding:32px 0;"><tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;">
      <tr><td style="background:#6b7f6b;padding:28px 32px;text-align:center;">
        <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:normal;letter-spacing:1px;">${name}</h1>
      </td></tr>
      <tr><td style="padding:36px 32px;color:#3d4a3e;font-size:15px;line-height:1.6;">
        <p style="margin:0 0 14px;">Ciao ${escapeHtml(nome)},</p>
        <p style="margin:0 0 14px;">da oggi hai una tua area personale${evento}. Lì trovi sempre aggiornati:</p>
        <ul style="margin:0 0 18px;padding-left:20px;">
          <li>il contratto e il suo stato</li>
          <li>i pagamenti fatti e quelli da fare</li>
          <li>gli appuntamenti, e puoi prenotarli da solo</li>
          <li>le tue gallerie e la selezione delle foto</li>
        </ul>
        <p style="margin:0 0 24px;">Per entrare basta la tua email: ti mandiamo un codice di 6 cifre, niente password da ricordare.</p>
        <p style="margin:0 0 24px;text-align:center;">
          <a href="${url}" style="display:inline-block;background:#6b7f6b;color:#ffffff;text-decoration:none;padding:14px 26px;border-radius:8px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;">Entra nella mia area</a>
        </p>
        <p style="margin:0;color:#888;font-size:13px;">Dal telefono puoi aggiungerla alla schermata Home e ritrovarla come un'app.</p>
      </td></tr>
      <tr><td style="background:#f9f6f1;padding:20px 32px;text-align:center;">
        <p style="margin:0;color:#aaa;font-size:11px;">${name} · Area cliente</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}
