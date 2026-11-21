export interface RecoveryStudio { name: string; email: string; phone: string; address?: string }
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
// Production domain verified through the deployment service.
const SITE = 'https://imagestudiofotografico.com';
export function bookingRecoveryEmail(name: string, campaignName: string, code: string, studio: RecoveryStudio) {
  if (!/^[A-Za-z0-9]{1,8}$/.test(code)) throw new Error('Codice campagna non valido');
  const link = `${SITE}/prenota/${encodeURIComponent(code)}`;
  return {
    subject: `La tua richiesta per ${campaignName} è scaduta`,
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;color:#293c36">
      <h1 style="font-size:24px">Vuoi ancora partecipare?</h1>
      <p>Ciao ${escape(name)}, l’acconto per <strong>${escape(campaignName)}</strong> non risulta completato entro la scadenza.</p>
      <p>La richiesta è scaduta e il tuo precedente orario <strong>non è più riservato</strong>.
      Se desideri ancora partecipare, puoi scegliere un nuovo appuntamento tra le disponibilità attuali.</p>
      <p style="margin:28px 0"><a href="${escape(link)}" style="background:#294e42;color:#fff;padding:14px 22px;text-decoration:none;border-radius:6px;display:inline-block">Scegli un nuovo appuntamento</a></p>
      <p>Non utilizzare il vecchio link di pagamento. Se hai avuto difficoltà con PayPal o ritieni di aver già pagato,
      contatta lo studio prima di effettuare un altro pagamento: ti aiutiamo noi.</p>
      <hr style="border:0;border-top:1px solid #ddd;margin:24px 0">
      <p><strong>Comunicazione automatica</strong><br>Non rispondere a questa email. Per informazioni contatta lo studio:</p>
      <p><strong>${escape(studio.name)}</strong><br>${escape(studio.email)}<br>${escape(studio.phone)}${studio.address ? `<br>${escape(studio.address)}` : ''}</p>
    </div>`,
  };
}
