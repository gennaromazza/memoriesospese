export interface BulkEmailFooterContacts {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  address?: unknown;
}

export class BulkEmailFooterConfigurationError extends Error {
  constructor() {
    super(
      "Configura almeno un indirizzo email o un numero di telefono in Impostazioni > Studio prima di inviare la campagna.",
    );
    this.name = "BulkEmailFooterConfigurationError";
  }
}

const FOOTER_START = "<!-- image-studio-bulk-email-footer:start -->";
const FOOTER_END = "<!-- image-studio-bulk-email-footer:end -->";

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildFooter(contacts: BulkEmailFooterContacts): string {
  const name = cleanText(contacts.name);
  const email = cleanText(contacts.email);
  const phone = cleanText(contacts.phone);
  const address = cleanText(contacts.address);

  if (!email && !phone) {
    throw new BulkEmailFooterConfigurationError();
  }

  const contactLines = [
    email
      ? `<div style="margin:0 0 4px"><a href="mailto:${encodeURIComponent(email)}" style="color:#3b625d;text-decoration:underline">${escapeHtml(email)}</a></div>`
      : "",
    phone
      ? `<div style="margin:0 0 4px"><a href="tel:${escapeHtml(phone.replace(/[^\d+]/g, ""))}" style="color:#3b625d;text-decoration:underline">${escapeHtml(phone)}</a></div>`
      : "",
    address
      ? `<div style="margin:0">${escapeHtml(address)}</div>`
      : "",
  ].filter(Boolean).join("");

  return `${FOOTER_START}
<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top:32px;border-top:1px solid #dedbd3;font-family:Arial,Helvetica,sans-serif">
  <tr>
    <td style="padding:18px 0 0;color:#5f625f;font-size:12px;line-height:1.6">
      <p style="margin:0 0 8px"><strong>Comunicazione automatica:</strong> ti chiediamo di non rispondere direttamente a questa email.</p>
      <p style="margin:0 0 8px">Per informazioni o assistenza, contatta${name ? ` ${escapeHtml(name)}` : " lo studio"} tramite i recapiti qui sotto:</p>
      ${contactLines}
    </td>
  </tr>
</table>
${FOOTER_END}`;
}

export function appendBulkEmailFooter(
  body: string,
  contacts: BulkEmailFooterContacts,
): string {
  const footer = buildFooter(contacts);
  const withoutPreviousFooter = body
    .replace(
      /<!--\s*image-studio-bulk-email-footer:start\s*-->[\s\S]*?<!--\s*image-studio-bulk-email-footer:end\s*-->/gi,
      "",
    )
    .trimEnd();

  return `${withoutPreviousFooter}\n${footer}`;
}
