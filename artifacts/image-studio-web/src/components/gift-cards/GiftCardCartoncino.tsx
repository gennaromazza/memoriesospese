import type { CSSProperties } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { GiftCardThemeKey } from '@shared/gift-card-types';
import { createAbsoluteUrl } from '@/lib/basePath';
import { GiftCardDecor, formatCardDate } from './GiftCardArt';
import { giftCardThemeVars } from './giftCardThemes';
import './gift-cards.css';

/** Indirizzo aperto da chi scansiona il QR del cartoncino. */
export function giftCardShareUrl(code: string): string {
  return createAbsoluteUrl(`/regalo/${encodeURIComponent(code)}`);
}

export interface GiftCardCartoncinoProps {
  theme: GiftCardThemeKey;
  title: string;
  line2?: string;
  recipientName?: string;
  message?: string;
  /** ISO 8601, oppure `null` per una card senza scadenza. */
  validUntil: string | null;
  code: string;
  /** Testo mostrato al posto del codice, per le anteprime prima della vendita. */
  codeLabel?: string;
  /** Mostra la card già incollata nel riquadro in alto. */
  withCard?: boolean;
  /** Per la stampa la dimensione arriva dal CSS (1em = 3 mm), non dal contenitore. */
  print?: boolean;
}

/**
 * Cartoncino 15 x 20 cm: in alto il riquadro per la card (85,6 x 54 mm,
 * grande come una patente), sotto nome, messaggio, QR e codice.
 */
export function GiftCardCartoncino(props: GiftCardCartoncinoProps) {
  const { theme, title, line2, recipientName, message, validUntil, code, codeLabel, withCard, print } = props;
  const style = { ...giftCardThemeVars(theme), ...(print ? {} : { '--cs': 'calc(100cqw * .02)' }) } as CSSProperties;
  const card = (
    <div className="gcx gcx-c15" style={style}>
      <GiftCardDecor theme={theme} />
      <div className="gcx-frame" />
      <div className="gcx-c15-win" aria-label="Riquadro per la card">
        {withCard ? (
          <div className="gcx-c15-card">
            <b>La tua card</b>
            <small>Image Studio</small>
          </div>
        ) : (
          <span>Incolla qui la card</span>
        )}
      </div>
      <div className="gcx-c15-body">
        <div className="gcx-eyebrow">Image Studio · Gift card</div>
        {recipientName ? <div className="gcx-c15-to">Per {recipientName}</div> : null}
        <div className="gcx-c15-title">{title}</div>
        {line2 ? <div className="gcx-c15-line2">{line2}</div> : null}
        <div className="gcx-c15-msg">{message}</div>
        <div className="gcx-c15-foot">
          <div className="gcx-qr">
            <QRCodeSVG value={giftCardShareUrl(code)} level="M" bgColor="#ffffff" fgColor="#111111" marginSize={0} style={{ width: '100%', height: 'auto' }} />
          </div>
          <div className="gcx-c15-info">
            <small>Apri il tuo regalo</small>
            <p>Inquadra il QR con la fotocamera</p>
            <small>Codice</small>
            <b>{codeLabel ?? code}</b>
            <small>Valida fino al</small>
            <b>{validUntil ? formatCardDate(validUntil) : 'Senza scadenza'}</b>
          </div>
        </div>
      </div>
    </div>
  );
  return print ? card : <div className="gcx-cq">{card}</div>;
}
