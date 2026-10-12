import { formatShopPrice, type ShopOrderLineDto } from '@shared/shop-types';
import { escapeHtml } from '../gift-cards/email.js';
import { timestampMillis } from '../commerce/text.js';

export type ShopCustomerMailKind =
  | 'order_confirmed'
  | 'photos_reminder'
  | 'photos_received'
  | 'photo_rejected'
  | 'ready_for_pickup'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

export type ShopAdminMailKind =
  | 'admin_new_order'
  | 'admin_photos_complete'
  | 'admin_photos_overdue'
  | 'admin_refund_after_shipping'
  | 'admin_reconcile';

export type ShopMailKind = ShopCustomerMailKind | ShopAdminMailKind;

export const SHOP_ADMIN_MAIL_KINDS: readonly ShopMailKind[] = [
  'admin_new_order',
  'admin_photos_complete',
  'admin_photos_overdue',
  'admin_refund_after_shipping',
  'admin_reconcile',
];

export interface ShopMailContext {
  studioName: string;
  studioPhone?: string;
  studioEmail?: string;
  studioAddress?: string;
  siteUrl: string;
}

export interface ShopMailContent {
  subject: string;
  html: string;
}

function day(value: unknown): string {
  const millis = timestampMillis(value);
  if (!millis) return '';
  return new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(millis));
}

function photosMissing(order: any): number {
  const lines: ShopOrderLineDto[] = Array.isArray(order.lines) ? order.lines : [];
  const assets: Array<{ lineId: string; status: string }> = Array.isArray(order.__assets) ? order.__assets : [];
  return lines.reduce((total, line) => {
    const ready = assets.filter(asset => asset.lineId === line.lineId && asset.status === 'ready').length;
    return total + Math.max(0, line.photosRequired - ready);
  }, 0);
}

function footer(ctx: ShopMailContext): string {
  return `
    <div style="border-top:1px solid #e5e5e5;margin-top:28px;padding-top:18px;text-align:center;color:#777;font-size:12px;line-height:1.7">
      <strong>${escapeHtml(ctx.studioName)}</strong><br>
      ${ctx.studioAddress ? `${escapeHtml(ctx.studioAddress)}<br>` : ''}
      ${ctx.studioPhone ? `${escapeHtml(ctx.studioPhone)}<br>` : ''}
      ${ctx.studioEmail ? escapeHtml(ctx.studioEmail) : ''}
    </div>`;
}

function button(href: string, label: string): string {
  return `
    <div style="text-align:center;margin:26px 0">
      <a href="${escapeHtml(href)}" style="background:#6E0F1A;color:#FFF0CF;padding:14px 30px;text-decoration:none;border-radius:4px;font:700 15px Arial,sans-serif;display:inline-block">${escapeHtml(label)}</a>
    </div>`;
}

function layout(ctx: ShopMailContext, title: string, body: string): string {
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#222">
      <h2 style="font-family:Georgia,serif;font-weight:normal;margin:0 0 12px">${escapeHtml(title)}</h2>
      ${body}
      ${footer(ctx)}
    </div>`;
}

function summary(order: any): string {
  const lines: ShopOrderLineDto[] = Array.isArray(order.lines) ? order.lines : [];
  const rows = lines
    .map(
      line => `
      <tr>
        <td style="padding:6px 0;border-bottom:1px solid #eee">${escapeHtml(line.productName)}${line.quantity > 1 ? ` × ${line.quantity}` : ''}</td>
        <td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right">${escapeHtml(formatShopPrice(line.lineTotalCents))}</td>
      </tr>`,
    )
    .join('');
  const shipping = Number(order.totals?.shippingCents || 0);
  return `
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin:14px 0">
      ${rows}
      ${shipping > 0 ? `<tr><td style="padding:6px 0">Spedizione</td><td style="padding:6px 0;text-align:right">${escapeHtml(formatShopPrice(shipping))}</td></tr>` : ''}
      <tr><td style="padding:8px 0;font-weight:bold">Totale</td><td style="padding:8px 0;text-align:right;font-weight:bold">${escapeHtml(formatShopPrice(Number(order.totals?.totalCents || 0)))}</td></tr>
    </table>`;
}

function delivery(order: any, ctx: ShopMailContext): string {
  if (order.fulfillment?.method === 'shipping') {
    const a = order.fulfillment.shippingAddress;
    const address = a ? `${a.street} ${a.houseNumber}, ${a.postalCode} ${a.city} (${a.province})` : '';
    return `<p style="font-size:14px;line-height:1.6"><strong>Spedizione a:</strong> ${escapeHtml(address)}</p>`;
  }
  return `<p style="font-size:14px;line-height:1.6"><strong>Ritiro in studio</strong>${ctx.studioAddress ? `: ${escapeHtml(ctx.studioAddress)}` : ''}. Ti scriviamo appena è pronto.</p>`;
}

function ordersLink(order: any, ctx: ShopMailContext): string {
  return `${ctx.siteUrl}/shop-natale/i-miei-ordini?ordine=${encodeURIComponent(order.id)}`;
}

function adminLink(order: any, ctx: ShopMailContext): string {
  return `${ctx.siteUrl}/admin/dashboard?shopOrderId=${encodeURIComponent(order.id)}`;
}

/**
 * Testo delle email. `order` è il documento dell'ordine con l'`id`, più
 * (facoltativo) `__assets` con le foto già lette, per contare quelle mancanti.
 */
export function shopMailContent(kind: ShopMailKind, order: any, ctx: ShopMailContext): ShopMailContent {
  const name = escapeHtml(String(order.customer?.name || order.nomeCliente || '').split(' ')[0] || 'cliente');
  const number = escapeHtml(order.orderNumber || order.id);
  const missing = photosMissing(order);
  const deadline = day(order.shop?.photoDeadlineAt);

  switch (kind) {
    case 'order_confirmed':
      return {
        subject: `Ordine ${order.orderNumber} confermato`,
        html: layout(
          ctx,
          `Grazie, ${name}!`,
          `<p style="font-size:15px;line-height:1.6">Il pagamento è andato a buon fine: l'ordine <strong>${number}</strong> è confermato.</p>
           ${summary(order)}
           ${delivery(order, ctx)}
           ${
             missing > 0
               ? `<div style="background:#FFF6E5;border:1px solid #F0D49A;border-radius:6px;padding:14px 16px;margin:18px 0;font-size:14px;line-height:1.6">
                    <strong>Ci ${missing === 1 ? 'manca 1 foto' : `mancano ${missing} foto`}.</strong>
                    Carica ${missing === 1 ? 'la foto' : 'le foto'} ${deadline ? `entro il ${escapeHtml(deadline)}` : 'appena puoi'}: iniziamo a lavorare il prodotto quando le abbiamo tutte.
                  </div>
                  ${button(ordersLink(order, ctx), missing === 1 ? 'Carica la foto' : 'Carica le foto')}`
               : `<p style="font-size:15px;line-height:1.6">Abbiamo già tutte le foto: iniziamo a lavorare il tuo ordine.</p>`
           }
           <p style="font-size:13px;color:#666;line-height:1.6">Conserva questa email: contiene il numero dell'ordine.</p>`,
        ),
      };
    case 'photos_reminder':
      return {
        subject: `Ordine ${order.orderNumber}: ci mancano ancora delle foto`,
        html: layout(
          ctx,
          `${name}, ci mancano le tue foto`,
          `<p style="font-size:15px;line-height:1.6">Per l'ordine <strong>${number}</strong> ci ${missing === 1 ? 'manca ancora 1 foto' : `mancano ancora ${missing} foto`}${deadline ? `. Inviale entro il <strong>${escapeHtml(deadline)}</strong>` : ''}: senza non possiamo realizzare il prodotto.</p>
           ${button(ordersLink(order, ctx), 'Carica le foto')}
           <p style="font-size:13px;color:#666;line-height:1.6">Se hai bisogno di aiuto${ctx.studioPhone ? `, chiamaci al ${escapeHtml(ctx.studioPhone)}` : ', rispondi a questa email'}.</p>`,
        ),
      };
    case 'photos_received':
      return {
        subject: `Ordine ${order.orderNumber}: abbiamo tutte le foto`,
        html: layout(ctx, 'Foto ricevute, grazie!', `<p style="font-size:15px;line-height:1.6">Abbiamo ricevuto tutte le foto dell'ordine <strong>${number}</strong>. Ora iniziamo a lavorare il tuo regalo.</p>`),
      };
    case 'photo_rejected': {
      const reason = escapeHtml(order.shop?.lastPhotoRejection?.reason || '');
      return {
        subject: `Ordine ${order.orderNumber}: ci serve un'altra foto`,
        html: layout(
          ctx,
          `${name}, ci serve un'altra foto`,
          `<p style="font-size:15px;line-height:1.6">Per l'ordine <strong>${number}</strong> una delle foto che hai caricato non è adatta${reason ? `: ${reason}` : ''}.</p>
           <p style="font-size:15px;line-height:1.6">Caricane un'altra${deadline ? ` entro il <strong>${escapeHtml(deadline)}</strong>` : ' appena puoi'}: riprendiamo a lavorare il prodotto appena l'abbiamo.</p>
           ${button(ordersLink(order, ctx), 'Carica la nuova foto')}`,
        ),
      };
    }
    case 'ready_for_pickup':
      return {
        subject: `Ordine ${order.orderNumber}: è pronto per il ritiro`,
        html: layout(
          ctx,
          'Il tuo ordine è pronto',
          `<p style="font-size:15px;line-height:1.6">L'ordine <strong>${number}</strong> è pronto: puoi passare a ritirarlo in studio${ctx.studioAddress ? `, ${escapeHtml(ctx.studioAddress)}` : ''}.</p>
           <p style="font-size:14px;color:#555;line-height:1.6">Porta con te questa email o il numero dell'ordine.</p>`,
        ),
      };
    case 'shipped': {
      const tracking = order.fulfillment?.tracking;
      return {
        subject: `Ordine ${order.orderNumber}: è in viaggio`,
        html: layout(
          ctx,
          'Il tuo ordine è in viaggio',
          `<p style="font-size:15px;line-height:1.6">L'ordine <strong>${number}</strong> è stato spedito.</p>
           ${tracking?.code ? `<p style="font-size:15px;line-height:1.6"><strong>Corriere:</strong> ${escapeHtml(tracking.carrier || '—')}<br><strong>Codice di tracciamento:</strong> ${escapeHtml(tracking.code)}</p>` : ''}
           ${delivery(order, ctx).replace('Spedizione a:', 'Consegna a:')}`,
        ),
      };
    }
    case 'delivered':
      return {
        subject: `Ordine ${order.orderNumber}: consegnato`,
        html: layout(
          ctx,
          'Ordine consegnato',
          `<p style="font-size:15px;line-height:1.6">L'ordine <strong>${number}</strong> risulta consegnato. Grazie per aver scelto ${escapeHtml(ctx.studioName)}!</p>
           <p style="font-size:14px;color:#555;line-height:1.6">Se qualcosa non va${ctx.studioPhone ? `, chiamaci al ${escapeHtml(ctx.studioPhone)}` : ', rispondi a questa email'}.</p>`,
        ),
      };
    case 'cancelled':
      return {
        subject: `Ordine ${order.orderNumber}: annullato`,
        html: layout(
          ctx,
          'Ordine annullato',
          `<p style="font-size:15px;line-height:1.6">L'ordine <strong>${number}</strong> è stato annullato.</p>
           <p style="font-size:14px;color:#555;line-height:1.6">Se hai già pagato, ricevi il rimborso sullo stesso metodo di pagamento. Per qualsiasi dubbio${ctx.studioPhone ? ` chiamaci al ${escapeHtml(ctx.studioPhone)}` : ' rispondi a questa email'}.</p>`,
        ),
      };
    case 'refunded':
      return {
        subject: `Ordine ${order.orderNumber}: rimborso effettuato`,
        html: layout(
          ctx,
          'Rimborso effettuato',
          `<p style="font-size:15px;line-height:1.6">Abbiamo rimborsato l'ordine <strong>${number}</strong>. Il denaro torna sul tuo metodo di pagamento PayPal, di solito in pochi giorni.</p>`,
        ),
      };
    case 'admin_new_order':
      return {
        subject: `Nuovo ordine shop ${order.orderNumber}${missing > 0 ? ` (mancano ${missing} foto)` : ''}`,
        html: layout(
          ctx,
          `Nuovo ordine ${order.orderNumber}`,
          `<p style="font-size:15px;line-height:1.6">${escapeHtml(order.nomeCliente || order.emailCliente || '')} ha pagato un ordine dello shop online.</p>
           ${summary(order)}
           ${delivery(order, ctx)}
           <p style="font-size:14px;line-height:1.6">${missing > 0 ? `Mancano ${missing} foto${deadline ? `, il cliente ha tempo fino al ${escapeHtml(deadline)}` : ''}.` : 'Le foto ci sono tutte: puoi iniziare a lavorare.'}</p>
           ${button(adminLink(order, ctx), 'Apri l’ordine')}`,
        ),
      };
    case 'admin_photos_complete':
      return {
        subject: `Ordine shop ${order.orderNumber}: foto complete`,
        html: layout(ctx, `Foto complete: ${order.orderNumber}`, `<p style="font-size:15px;line-height:1.6">Il cliente ha caricato le ultime foto: puoi iniziare a lavorare l'ordine.</p>${button(adminLink(order, ctx), 'Apri l’ordine')}`),
      };
    case 'admin_photos_overdue':
      return {
        subject: `Ordine shop ${order.orderNumber}: foto in ritardo`,
        html: layout(
          ctx,
          `Foto in ritardo: ${order.orderNumber}`,
          `<p style="font-size:15px;line-height:1.6">Il termine per le foto${deadline ? ` (${escapeHtml(deadline)})` : ''} è passato e ne mancano ${missing || 'alcune'}. Contatta il cliente, oppure rimborsa l'ordine da PayPal.</p>${button(adminLink(order, ctx), 'Apri l’ordine')}`,
        ),
      };
    case 'admin_refund_after_shipping':
      return {
        subject: `Ordine shop ${order.orderNumber}: rimborsato dopo la spedizione`,
        html: layout(ctx, `Rimborso dopo la spedizione: ${order.orderNumber}`, `<p style="font-size:15px;line-height:1.6">L'ordine era già partito e il pagamento è stato rimborsato. L'ordine non è stato annullato: controlla.</p>${button(adminLink(order, ctx), 'Apri l’ordine')}`),
      };
    case 'admin_reconcile':
      return {
        subject: `Ordine shop ${order.orderNumber}: pagamento da controllare`,
        html: layout(ctx, `Pagamento da controllare: ${order.orderNumber}`, `<p style="font-size:15px;line-height:1.6">È arrivato un pagamento PayPal su un ordine non più attivo (annullato o con file eliminati). Verifica e, se serve, rimborsa da PayPal.</p>${button(adminLink(order, ctx), 'Apri l’ordine')}`),
      };
  }
}
