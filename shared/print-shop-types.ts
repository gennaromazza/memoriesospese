/**
 * Contratti condivisi del dominio "stampe online".
 *
 * I prezzi commerciali sono sempre espressi in centesimi. I tipi non importano
 * Timestamp da Firebase, così possono essere usati sia nel browser sia dal
 * backend Admin SDK.
 */

export const PRINT_SHOP_CURRENCY = 'EUR' as const;
export const PRINT_SHOP_CATALOG_VERSION = 1;
export const PRINT_SHOP_ASSET_RETENTION_DAYS = 90;
export const PRINT_SHOP_MAX_JPEG_BYTES = 50 * 1024 * 1024;

export type PrintShopCurrency = typeof PRINT_SHOP_CURRENCY;
export type PrintFinish = 'glossy' | 'matte';
export type PrintFitMode = 'border' | 'cover';
export type PrintSalesChannel = 'admin' | 'booking' | 'print_shop';
export type PrintShopDeliveryMethod = 'studio_pickup' | 'shipping';

export interface PrintShopShippingConfig {
  enabled: boolean;
  priceCents: number;
  estimatedMinDays: number;
  estimatedMaxDays: number;
}

export interface PrintShopPostalAddress {
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  province: string;
  country: 'IT';
}

export interface PrintShopBillingDetails {
  fiscalCode: string;
  residenceAddress: PrintShopPostalAddress;
}

export interface PrintPriceTier {
  minQuantity: number;
  maxQuantity?: number;
  unitPriceCents: number;
}

export interface PrintTieredPricing {
  model: 'tiered';
  tiers: readonly PrintPriceTier[];
}

export interface PrintPackagePricing {
  model: 'package';
  packageSize: number;
  packagePriceCents: number;
  /** Se true ogni fotografia del pacchetto deve riferirsi a un asset diverso. */
  requireDistinctAssets: boolean;
  /** La prima versione dello shop vende un solo pacchetto Polaroid per riga. */
  allowMultiplePackages: boolean;
}

export type PrintPricing = PrintTieredPricing | PrintPackagePricing;

export interface PrintProductSpec {
  widthMm: number;
  heightMm: number;
  finishes: readonly PrintFinish[];
  fitModes: readonly PrintFitMode[];
  pricing: PrintPricing;
  qualityWarningDpi: number;
  qualityTargetDpi: number;
}

/** Campi che estendono un prodotto gestionale rendendolo vendibile nello shop. */
export interface PrintShopProductFields {
  sku: string;
  salesChannels: readonly PrintSalesChannel[];
  currency: PrintShopCurrency;
  catalogVersion: number;
  printSpec: PrintProductSpec;
}

/**
 * Prodotto completo usato dalla fixture e dal seed Firestore. I campi italiani
 * conservano la compatibilità con l'attuale collection `products`.
 */
export interface PrintShopCatalogProduct extends PrintShopProductFields {
  id: string;
  nome: string;
  descrizione: string;
  prezzo: number;
  sconto: number;
  prezzoFinale: number;
  numeroFoto: number;
  categoria: string;
  attivo: boolean;
  immagini: readonly string[];
  displayOrder: number;
}

export interface PrintShopCategorySeed {
  id: string;
  nome: string;
  value: string;
  attivo: boolean;
  displayOrder: number;
}

export interface PrintAssetAssignmentInput {
  assetId: string;
  /** Numero di copie della stessa fotografia; Polaroid impone sempre 1. */
  copies: number;
}

export interface PrintOrderItemInput {
  sku: string;
  finish: PrintFinish;
  fitMode: PrintFitMode;
  assignments: readonly PrintAssetAssignmentInput[];
}

export interface PrintShopQuoteInput {
  items: readonly PrintOrderItemInput[];
  fulfillment?: { method: PrintShopDeliveryMethod };
}

export interface AppliedPrintTier {
  minQuantity: number;
  maxQuantity?: number;
  unitPriceCents: number;
}

/** Snapshot immutabile di una riga, da incorporare nell'ordine. */
export interface PrintOrderItemSnapshot {
  productId: string;
  sku: string;
  productName: string;
  category: string;
  catalogVersion: number;
  currency: PrintShopCurrency;
  widthMm: number;
  heightMm: number;
  finish: PrintFinish;
  fitMode: PrintFitMode;
  pricingModel: PrintPricing['model'];
  assetCount: number;
  copyCount: number;
  /** Quantità complessiva dello SKU usata per scegliere lo scaglione. */
  pricingQuantity: number;
  unitPriceCents?: number;
  appliedTier?: AppliedPrintTier;
  packageSize?: number;
  packageCount?: number;
  packagePriceCents?: number;
  lineTotalCents: number;
  assignments: readonly PrintAssetAssignmentInput[];
}

export interface PrintShopQuote {
  currency: PrintShopCurrency;
  catalogVersion: number;
  items: readonly PrintOrderItemSnapshot[];
  totals: {
    subtotalCents: number;
    discountCents: number;
    shippingCents?: number;
    totalCents: number;
  };
  /** Numero di file unici, anche se uno stesso asset appare in più righe. */
  assetCount: number;
  copyCount: number;
  fulfillment?: { method: PrintShopDeliveryMethod };
  /** Valutazione server-side della risoluzione rispetto al formato scelto. */
  qualityWarnings?: readonly PrintQualityWarning[];
  /** Hash server-side da inviare insieme ai consensi al momento del checkout. */
  quoteFingerprint?: string;
}

export interface PrintQualityWarning {
  assetId: string;
  sku: string;
  effectiveDpi: number;
  warningBelowDpi: number;
  targetDpi: number;
}

export type PrintShopFulfillmentStatus =
  | 'draft'
  | 'awaiting_payment'
  | 'submitted'
  | 'files_check'
  | 'ready_to_print'
  | 'sent_to_laboratory'
  | 'printing'
  | 'ready_for_pickup'
  | 'delivered'
  | 'cancelled';

/** Collegamento opzionale al laboratorio/fornitore incaricato della stampa. */
export interface PrintLaboratoryFulfillment<TTimestamp = unknown> {
  laboratoryId: string;
  laboratoryName?: string;
  supplierOrderReference?: string;
  transferMethod?: 'manual_download' | 'email' | 'api' | 'other';
  assignedAt?: TTimestamp;
  sentAt?: TTimestamp;
  acceptedAt?: TTimestamp;
  completedAt?: TTimestamp;
  notes?: string;
}

export interface PrintShopFulfillment<TTimestamp = unknown> {
  method: PrintShopDeliveryMethod;
  status: PrintShopFulfillmentStatus;
  shippingAddress?: PrintShopPostalAddress;
  laboratory?: PrintLaboratoryFulfillment<TTimestamp>;
  promisedAt?: TTimestamp;
  readyAt?: TTimestamp;
  deliveredAt?: TTimestamp;
}

export type PrintShopPaymentStatus =
  | 'pending'
  | 'paid'
  | 'failed'
  | 'expired'
  | 'paid_action_required'
  | 'partially_refunded'
  | 'refunded';

export interface PrintShopPayment<TTimestamp = unknown> {
  /** Il checkout richiede pagamento anticipato: non esiste pay_at_pickup. */
  method: 'paypal';
  status: PrintShopPaymentStatus;
  paypalOrderId?: string;
  paypalCaptureId?: string;
  paidAt?: TTimestamp;
}

export interface PrintShopOrderFields<TTimestamp = unknown> {
  orderType: 'print_shop';
  orderNumber: string;
  ownerUid: string;
  clienteId: string;
  catalogVersion: number;
  currency: PrintShopCurrency;
  totals: PrintShopQuote['totals'];
  fulfillment: PrintShopFulfillment<TTimestamp>;
  billingDetails?: PrintShopBillingDetails;
  payment: PrintShopPayment<TTimestamp>;
  printShop: {
    items: readonly PrintOrderItemSnapshot[];
    assetCount: number;
    copyCount: number;
    assetRetentionDays: number;
    lowResolutionAccepted: boolean;
    customerNotes?: string;
    qualityWarnings?: readonly PrintQualityWarning[];
  };
}

export interface PrintJpegUploadCandidate {
  fileName: string;
  contentType: string;
  sizeBytes: number;
  /** Se disponibili, i primi byte permettono anche il controllo della firma JPEG. */
  firstBytes?: ArrayLike<number>;
}

export type PrintShopValidationCode =
  | 'EMPTY_ORDER'
  | 'INVALID_ITEM'
  | 'UNKNOWN_SKU'
  | 'INACTIVE_PRODUCT'
  | 'INVALID_FINISH'
  | 'INVALID_FIT_MODE'
  | 'EMPTY_ASSIGNMENTS'
  | 'INVALID_ASSET_ID'
  | 'DUPLICATE_ASSET'
  | 'INVALID_COPIES'
  | 'INVALID_PACKAGE_SIZE'
  | 'PACKAGE_REQUIRES_DISTINCT_ASSETS'
  | 'PACKAGE_REQUIRES_SINGLE_COPIES'
  | 'MULTIPLE_PACKAGES_NOT_ALLOWED'
  | 'UNSUPPORTED_QUANTITY'
  | 'INVALID_FILE_NAME'
  | 'INVALID_CONTENT_TYPE'
  | 'EMPTY_FILE'
  | 'FILE_TOO_LARGE'
  | 'INVALID_JPEG_SIGNATURE';

export interface PrintShopValidationIssue {
  code: PrintShopValidationCode;
  message: string;
  path?: string;
}

export interface PrintShopValidationResult {
  valid: boolean;
  issues: readonly PrintShopValidationIssue[];
}

export class PrintShopValidationError extends Error {
  readonly issues: readonly PrintShopValidationIssue[];

  constructor(issues: readonly PrintShopValidationIssue[]) {
    super(issues.map(issue => issue.message).join('; '));
    this.name = 'PrintShopValidationError';
    this.issues = issues;
  }
}
