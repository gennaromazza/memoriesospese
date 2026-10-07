/**
 * CONSULTATION INVITE - Helper condivisi per l'invio del link prenotazione consulenza
 *
 * Usati sia dall'invio MANUALE (job-routes send-consultation-request) sia dallo
 * scheduler di invio AUTOMATICO della "consulenza visione" (reminder-routes).
 *
 * - buildConsultationLink: costruisce l'URL pubblico di prenotazione con jobId
 *   (pre-compilazione cliente) e range date opzionale (dateFrom/dateTo in YYYY-MM-DD).
 * - buildConsultationInviteEmailHTML: email "solo pulsante" (CTA) per l'invito automatico.
 */

interface BuildConsultationLinkParams {
  baseUrl: string;
  jobType: string;
  templateId: string;
  jobId: string;
  /** Formato YYYY-MM-DD (la pagina di prenotazione parsa la stringa, non un timestamp) */
  dateFrom?: string;
  /** Formato YYYY-MM-DD */
  dateTo?: string;
}

/**
 * Costruisce il link pubblico di prenotazione consulenza.
 * Route: /consulenze/:tipo/:id/prenota?jobId=...&dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD
 */
export function buildConsultationLink({
  baseUrl,
  jobType,
  templateId,
  jobId,
  dateFrom,
  dateTo,
}: BuildConsultationLinkParams): string {
  let link = `${baseUrl}/consulenze/${encodeURIComponent(jobType)}/${templateId}/prenota`;

  const queryParams: string[] = [];
  // Sempre includi jobId per pre-popolare i dati cliente
  queryParams.push(`jobId=${encodeURIComponent(jobId)}`);
  if (dateFrom) queryParams.push(`dateFrom=${encodeURIComponent(dateFrom)}`);
  if (dateTo) queryParams.push(`dateTo=${encodeURIComponent(dateTo)}`);

  return `${link}?${queryParams.join("&")}`;
}

interface ConsultationInviteEmailParams {
  clienteNome: string;
  templateNome: string;
  nomeEvento: string;
  consultationLink: string;
  studioInfo: {
    name: string;
    email: string;
    phone: string;
    address?: string;
  };
}

/**
 * Email "solo pulsante" per l'invito automatico alla consulenza visione.
 * Palette October Mist: sage #8b9a7d, terracotta #c17f59, cream #f5f0e8, blue-gray #6b7d8a.
 */
export function buildConsultationInviteEmailHTML({
  clienteNome,
  templateNome,
  nomeEvento,
  consultationLink,
  studioInfo,
}: ConsultationInviteEmailParams): string {
  return `
    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #f5f0e8;">
      <div style="background: #ffffff; border-radius: 12px; padding: 32px;">
        <h2 style="color: #c17f59; text-align: center; margin: 0 0 24px; font-weight: 600;">
          Prenota la tua ${templateNome}
        </h2>

        <p style="font-size: 16px; color: #3d3d3d; margin: 0 0 16px;">
          Ciao <strong>${clienteNome}</strong>,
        </p>
        <p style="font-size: 16px; color: #3d3d3d; line-height: 1.5; margin: 0 0 28px;">
          È il momento di prenotare la tua <strong style="color: #8b9a7d;">${templateNome}</strong>
          per <strong>${nomeEvento}</strong>. Scegli giorno e orario che preferisci.
        </p>

        <div style="text-align: center; margin: 32px 0;">
          <a href="${consultationLink}"
             style="display: inline-block; background: #c17f59; color: #ffffff; padding: 16px 40px;
                    text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
            Prenota ora
          </a>
        </div>
      </div>

      <div style="text-align: center; color: #6b7d8a; font-size: 12px; margin-top: 24px;">
        <p style="margin: 4px 0; font-weight: 600;">${studioInfo.name}</p>
        ${studioInfo.address ? `<p style="margin: 4px 0;">${studioInfo.address}</p>` : ""}
        <p style="margin: 4px 0;">Email: ${studioInfo.email} &nbsp;•&nbsp; Tel: ${studioInfo.phone}</p>
      </div>
    </div>
  `;
}
