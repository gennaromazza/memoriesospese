import {
  isValidCodiceFiscale,
  isValidCodiceSdi,
  isValidPartitaIva,
  isValidPec,
  normalizeFiscalString,
} from './fiscal-validation';
import { getIndirizzoFiscale, type ClienteAddressFields } from './clienti-address';
import type {
  InvoiceLineInput,
  InvoiceTaxTreatment,
  InvoiceTotals,
  InvoiceValidationResult,
} from './fatture-types';

export interface FatturaPaSender {
  name: string;
  partitaIVA?: string;
  codiceFiscale?: string;
  regimeFiscale?: string;
  fiscalVia?: string;
  fiscalCap?: string;
  fiscalComune?: string;
  fiscalProvincia?: string;
  address?: string;
}

export interface FatturaPaRecipient extends ClienteAddressFields {
  nome?: string;
  cognome?: string;
  ragioneSociale?: string;
  email?: string;
  codiceFiscale?: string;
  partitaIva?: string;
  codiceSdi?: string;
  pec?: string;
  tipoSoggetto?: 'privato' | 'azienda';
}

export interface FatturaPaDocumentInput {
  sender: FatturaPaSender;
  recipient: FatturaPaRecipient;
  input: InvoiceLineInput & { issueDate: string; invoiceNumber: string; jobReference: string };
  totals: InvoiceTotals;
}

const NATURE_BY_TREATMENT: Partial<Record<InvoiceTaxTreatment, string>> = {
  esente: 'N4',
  non_imponibile: 'N3.5',
  fuori_campo: 'N2.2',
};

export const FORFETTARIO_N2_2_CAUSALE =
  "Operazione effettuata ai sensi dell'art. 1, commi da 54 a 89, della Legge n. 190/2014 e successive modificazioni";

export const IMPOSTA_DI_BOLLO = 2;
export const SOGLIA_IMPOSTA_DI_BOLLO = 77.47;

const VALID_TAX_TREATMENTS: InvoiceTaxTreatment[] = [
  'iva_ordinaria', 'iva_10', 'iva_5', 'iva_4', 'esente', 'non_imponibile', 'fuori_campo',
];

export function isInvoiceTaxTreatment(value: unknown): value is InvoiceTaxTreatment {
  return typeof value === 'string' && (VALID_TAX_TREATMENTS as string[]).includes(value);
}

export function getTaxRate(treatment: InvoiceTaxTreatment, customRate?: number): number {
  switch (treatment) {
    case 'iva_ordinaria': return 22;
    case 'iva_10': return 10;
    case 'iva_5': return 5;
    case 'iva_4': return 4;
    case 'esente':
    case 'non_imponibile':
    case 'fuori_campo':
      return 0;
    default:
      return Number.isFinite(customRate) ? Number(customRate) : 0;
  }
}

export function calculateInvoiceTotals(input: Pick<InvoiceLineInput, 'taxableAmount' | 'taxTreatment' | 'taxRate'>): InvoiceTotals {
  const imponibile = Math.round(input.taxableAmount * 100) / 100;
  const aliquota = getTaxRate(input.taxTreatment, input.taxRate);
  const imposta = Math.round(imponibile * aliquota) / 100;
  return {
    imponibile,
    imposta: Math.round(imposta * 100) / 100,
    totale: Math.round((imponibile + imposta) * 100) / 100,
    aliquota,
    ...(NATURE_BY_TREATMENT[input.taxTreatment] ? { natura: NATURE_BY_TREATMENT[input.taxTreatment] } : {}),
  };
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function hasOnlyValidXmlCharacters(value: string | undefined): boolean {
  return !value || !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value);
}

function validateItalianAddress(prefix: string, address: { cap?: string; provincia?: string }, errors: string[]) {
  if (hasText(address.cap) && !/^\d{5}$/.test(address.cap.trim())) errors.push(`${prefix}: CAP non valido`);
  if (hasText(address.provincia) && !/^[A-Za-z]{2}$/.test(address.provincia.trim())) errors.push(`${prefix}: provincia non valida`);
}

/**
 * I record creati prima dell'introduzione del tipo soggetto non lo possiedono.
 * Un'anagrafica personale con solo codice fiscale resta quindi un privato,
 * mentre le aziende continuano a richiedere un recapito telematico.
 */
function isPrivateRecipient(recipient: FatturaPaRecipient): boolean {
  if (recipient.tipoSoggetto === 'privato') return true;
  if (recipient.tipoSoggetto === 'azienda') return false;

  return !hasText(recipient.partitaIva)
    && !hasText(recipient.ragioneSociale)
    && (hasText(recipient.codiceFiscale) || hasText(recipient.nome) || hasText(recipient.cognome));
}

export function validateFatturaPaInput(
  sender: FatturaPaSender,
  recipient: FatturaPaRecipient,
  input: Pick<InvoiceLineInput, 'taxableAmount' | 'taxTreatment' | 'taxRate' | 'description'> & { issueDate: string },
): InvoiceValidationResult {
  const missing: string[] = [];
  const errors: string[] = [];

  if (!hasText(sender.name)) missing.push('Mittente: denominazione o nome studio');
  if (!hasText(sender.partitaIVA)) missing.push('Mittente: partita IVA');
  if (hasText(sender.partitaIVA) && !isValidPartitaIva(sender.partitaIVA)) errors.push('Mittente: partita IVA non valida');
  if (hasText(sender.codiceFiscale) && !isValidCodiceFiscale(sender.codiceFiscale)) errors.push('Mittente: codice fiscale non valido');
  if (!hasText(sender.regimeFiscale)) missing.push('Mittente: regime fiscale');
  if (hasText(sender.regimeFiscale) && !/^RF\d{2}$/.test(sender.regimeFiscale.trim().toUpperCase())) errors.push('Mittente: regime fiscale non valido');
  if (!hasText(sender.fiscalVia)) missing.push('Mittente: indirizzo (via)');
  if (!hasText(sender.fiscalCap)) missing.push('Mittente: CAP');
  if (!hasText(sender.fiscalComune)) missing.push('Mittente: comune');
  if (!hasText(sender.fiscalProvincia)) missing.push('Mittente: provincia');
  validateItalianAddress('Mittente', { cap: sender.fiscalCap, provincia: sender.fiscalProvincia }, errors);

  if (!hasText(recipient.ragioneSociale) && (!hasText(recipient.nome) || !hasText(recipient.cognome))) missing.push('Cliente: nome e cognome o ragione sociale');
  const privateRecipient = isPrivateRecipient(recipient);
  if (privateRecipient && !hasText(recipient.codiceFiscale)) {
    missing.push('Cliente: codice fiscale');
  } else if (!hasText(recipient.partitaIva) && !hasText(recipient.codiceFiscale)) {
    missing.push('Cliente: partita IVA o codice fiscale');
  }
  if (hasText(recipient.partitaIva) && !isValidPartitaIva(recipient.partitaIva)) errors.push('Cliente: partita IVA non valida');
  if (hasText(recipient.codiceFiscale) && !isValidCodiceFiscale(recipient.codiceFiscale)) errors.push('Cliente: codice fiscale non valido');

  const recipientAddress = getIndirizzoFiscale(recipient);
  if (!hasText(recipientAddress.via)) missing.push('Cliente: indirizzo fiscale (via)');
  if (!hasText(recipientAddress.cap)) missing.push('Cliente: indirizzo fiscale (CAP)');
  if (!hasText(recipientAddress.citta)) missing.push('Cliente: indirizzo fiscale (comune)');
  if (!hasText(recipientAddress.provincia)) missing.push('Cliente: indirizzo fiscale (provincia)');
  validateItalianAddress('Cliente', { cap: recipientAddress.cap, provincia: recipientAddress.provincia }, errors);

  const sdi = hasText(recipient.codiceSdi) ? normalizeFiscalString(recipient.codiceSdi) : '';
  const pec = hasText(recipient.pec) ? recipient.pec.trim() : '';
  if (sdi && !isValidCodiceSdi(sdi)) errors.push('Cliente: codice destinatario non valido');
  if (pec && !isValidPec(pec)) errors.push('Cliente: PEC non valida');
  if (!privateRecipient && !sdi && !pec) missing.push('Cliente: codice destinatario SDI o PEC');

  if (!validDate(input.issueDate)) errors.push('Data emissione non valida');
  if (!hasText(input.description)) missing.push('Descrizione della prestazione');
  if (!isInvoiceTaxTreatment(input.taxTreatment)) errors.push('Trattamento IVA/fiscale non supportato');
  if (!Number.isFinite(input.taxableAmount) || input.taxableAmount <= 0) {
    errors.push('L’imponibile deve essere maggiore di zero');
  }
  const totals = calculateInvoiceTotals(input);
  if (!Number.isFinite(totals.aliquota) || totals.aliquota < 0 || totals.aliquota > 100) {
    errors.push('Aliquota IVA non valida');
  }
  const xmlTexts = [
    sender.name, sender.fiscalVia, sender.fiscalCap, sender.fiscalComune, sender.fiscalProvincia,
    recipient.nome, recipient.cognome, recipient.ragioneSociale, recipient.via, recipient.citta,
    recipient.cap, recipient.provincia, recipient.viaFiscale, recipient.cittaFiscale,
    recipient.capFiscale, recipient.provinciaFiscale, input.description,
  ];
  if (xmlTexts.some((value) => !hasOnlyValidXmlCharacters(value))) {
    errors.push('I dati non possono contenere caratteri non validi per XML');
  }

  return { valid: missing.length === 0 && errors.length === 0, missing, errors, totals };
}

function xmlEscape(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function xmlTag(name: string, value: unknown): string {
  return `<${name}>${xmlEscape(value)}</${name}>`;
}

function money(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}

function italianProvince(value: string | undefined): string {
  return normalizeFiscalString(value || '').slice(0, 2);
}

function requiresStampDuty(sender: FatturaPaSender, totals: InvoiceTotals): boolean {
  return normalizeFiscalString(sender.regimeFiscale || '') === 'RF19'
    && totals.natura === 'N2.2'
    && totals.imponibile > SOGLIA_IMPOSTA_DI_BOLLO;
}

export function buildFatturaPaXml(document: FatturaPaDocumentInput): string {
  const { sender, recipient, input, totals } = document;
  const senderVat = normalizeFiscalString(sender.partitaIVA || '').replace(/^IT/, '');
  const senderFiscalId = senderVat || normalizeFiscalString(sender.codiceFiscale || '');
  const recipientVat = normalizeFiscalString(recipient.partitaIva || '').replace(/^IT/, '');
  const recipientCf = normalizeFiscalString(recipient.codiceFiscale || '');
  const address = getIndirizzoFiscale(recipient);
  const recipientDeliveryCode = normalizeFiscalString(recipient.codiceSdi || '') || '0000000';
  const recipientPec = hasText(recipient.pec) ? recipient.pec.trim() : '';
  const recipientName = recipient.ragioneSociale
    ? xmlTag('Denominazione', recipient.ragioneSociale)
    : `${xmlTag('Nome', recipient.nome)}${xmlTag('Cognome', recipient.cognome)}`;
  const senderName = xmlTag('Denominazione', sender.name);
  const taxSummary = `${xmlTag('AliquotaIVA', money(totals.aliquota))}` +
    (totals.natura ? xmlTag('Natura', totals.natura) : '') +
    xmlTag('ImponibileImporto', money(totals.imponibile)) +
    xmlTag('Imposta', money(totals.imposta)) +
    (totals.aliquota > 0 ? xmlTag('EsigibilitaIVA', 'I') : '');
  const causali = [
    input.jobReference,
    ...(normalizeFiscalString(sender.regimeFiscale || '') === 'RF19' && totals.natura === 'N2.2'
      ? [FORFETTARIO_N2_2_CAUSALE]
      : []),
  ].filter(hasText).map((causale) => xmlTag('Causale', causale)).join('');
  const progressivoInvio = input.invoiceNumber.replace(/\D/g, '').slice(-10).padStart(5, '0');
  const datiBollo = requiresStampDuty(sender, totals)
    ? `<DatiBollo>${xmlTag('BolloVirtuale', 'SI')}${xmlTag('ImportoBollo', money(IMPOSTA_DI_BOLLO))}</DatiBollo>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica versione="FPR12" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2" xmlns="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2">
  <FatturaElettronicaHeader>
    <DatiTrasmissione>
      <IdTrasmittente>${xmlTag('IdPaese', 'IT')}${xmlTag('IdCodice', senderFiscalId)}</IdTrasmittente>
      ${xmlTag('ProgressivoInvio', progressivoInvio)}
      ${xmlTag('FormatoTrasmissione', 'FPR12')}
      ${xmlTag('CodiceDestinatario', recipientDeliveryCode)}
       ${recipientDeliveryCode === '0000000' && isValidPec(recipientPec) ? xmlTag('PECDestinatario', recipientPec) : ''}
    </DatiTrasmissione>
    <CedentePrestatore>
      <DatiAnagrafici>
        ${senderVat ? `<IdFiscaleIVA>${xmlTag('IdPaese', 'IT')}${xmlTag('IdCodice', senderVat)}</IdFiscaleIVA>` : ''}
        ${sender.codiceFiscale ? xmlTag('CodiceFiscale', normalizeFiscalString(sender.codiceFiscale)) : ''}
        <Anagrafica>${senderName}</Anagrafica>
        ${xmlTag('RegimeFiscale', normalizeFiscalString(sender.regimeFiscale || ''))}
      </DatiAnagrafici>
      <Sede>
        ${xmlTag('Indirizzo', sender.fiscalVia)}
        ${xmlTag('CAP', sender.fiscalCap)}
        ${xmlTag('Comune', sender.fiscalComune)}
        ${xmlTag('Provincia', italianProvince(sender.fiscalProvincia))}
        ${xmlTag('Nazione', 'IT')}
      </Sede>
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>
        ${recipientVat ? `<IdFiscaleIVA>${xmlTag('IdPaese', 'IT')}${xmlTag('IdCodice', recipientVat)}</IdFiscaleIVA>` : ''}
        ${recipientCf ? xmlTag('CodiceFiscale', recipientCf) : ''}
        <Anagrafica>${recipientName}</Anagrafica>
      </DatiAnagrafici>
      <Sede>
        ${xmlTag('Indirizzo', address.via)}
        ${xmlTag('CAP', address.cap)}
        ${xmlTag('Comune', address.citta)}
        ${xmlTag('Provincia', italianProvince(address.provincia))}
        ${xmlTag('Nazione', 'IT')}
      </Sede>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        ${xmlTag('TipoDocumento', 'TD01')}
        ${xmlTag('Divisa', 'EUR')}
        ${xmlTag('Data', input.issueDate)}
        ${xmlTag('Numero', input.invoiceNumber)}
        ${datiBollo}
        ${xmlTag('ImportoTotaleDocumento', money(totals.totale))}
        ${causali}
      </DatiGeneraliDocumento>
    </DatiGenerali>
    <DatiBeniServizi>
      <DettaglioLinee>
        ${xmlTag('NumeroLinea', '1')}
        ${xmlTag('Descrizione', input.description)}
        ${xmlTag('Quantita', '1.00')}
        ${xmlTag('PrezzoUnitario', money(totals.imponibile))}
        ${xmlTag('PrezzoTotale', money(totals.imponibile))}
        ${xmlTag('AliquotaIVA', money(totals.aliquota))}
        ${totals.natura ? xmlTag('Natura', totals.natura) : ''}
      </DettaglioLinee>
      <DatiRiepilogo>${taxSummary}</DatiRiepilogo>
    </DatiBeniServizi>
  </FatturaElettronicaBody>
</p:FatturaElettronica>`;
}
