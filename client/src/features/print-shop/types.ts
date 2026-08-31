import type {
  PrintFinish,
  PrintFitMode,
  PrintOrderItemInput,
  PrintQualityWarning,
  PrintShopCatalogProduct,
  PrintShopFulfillmentStatus,
  PrintShopPaymentStatus,
  PrintShopQuote,
} from '@shared/print-shop-types';

export type PrintPhotoUploadStatus =
  | 'queued'
  | 'preparing'
  | 'uploading'
  | 'finalizing'
  | 'uploaded'
  | 'error';

export interface LocalPrintPhoto {
  localId: string;
  /** Presente per i nuovi upload; assente per asset ripristinati dal server. */
  file?: File;
  fileName: string;
  sizeBytes: number;
  previewUrl?: string;
  sha256: string;
  widthPx: number;
  heightPx: number;
  status: PrintPhotoUploadStatus;
  progress: number;
  retryCount: number;
  assetId?: string;
  storagePath?: string;
  error?: string;
}

export interface PrintGroupAssignmentDraft {
  localPhotoId: string;
  copies: number;
}

export interface PrintGroupDraft {
  id: string;
  sku: string;
  finish: PrintFinish;
  fitMode: PrintFitMode;
  assignments: PrintGroupAssignmentDraft[];
}

export interface PrintShopContactDraft {
  displayName: string;
  email: string;
  phone: string;
  customerNotes: string;
}

export interface PrintShopCatalogPayload {
  products: PrintShopCatalogProduct[];
  catalogVersion: number;
  currency: 'EUR';
  paypalClientId?: string;
}

export interface PrintShopDraftOrder {
  id: string;
  orderNumber?: string;
  ownerUid?: string;
  payment?: {
    method: 'paypal';
    status: PrintShopPaymentStatus;
    paypalOrderId?: string;
    paypalCaptureId?: string;
  };
  fulfillment?: {
    method: 'studio_pickup';
    status: PrintShopFulfillmentStatus;
  };
  quote?: PrintShopQuote;
  totals?: PrintShopQuote['totals'];
}

export interface PrintShopOrderListItem extends PrintShopDraftOrder {
  orderNumber: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  catalogVersion?: number;
  currency?: 'EUR';
  quoteFingerprint?: string;
  customer?: { name?: string; email?: string; phone?: string };
  totals: PrintShopQuote['totals'];
  payment: {
    method: 'paypal';
    status: PrintShopPaymentStatus;
    paypalOrderId?: string;
    paypalCaptureId?: string;
  };
  fulfillment: {
    method: 'studio_pickup';
    status: PrintShopFulfillmentStatus;
  };
  printShop?: {
    items?: PrintShopQuote['items'];
    requestedItems?: PrintOrderItemInput[];
    assetCount: number;
    copyCount: number;
    assetRetentionDays?: number;
    lowResolutionAccepted?: boolean;
    qualityWarnings?: readonly PrintQualityWarning[];
    customerNotes?: string;
  };
  assets?: PrintShopOwnerAsset[];
}

export interface PrintShopOwnerAsset {
  id: string;
  status: string;
  originalName?: string;
  contentType?: string;
  sizeBytes?: number;
  widthPx?: number;
  heightPx?: number;
}

export interface PrintShopDraftPayload {
  items: PrintOrderItemInput[];
  contact: PrintShopContactDraft;
  lowResolutionAccepted: boolean;
  customerNotes?: string;
}

export interface PreparedPrintUpload {
  assetId: string;
  storagePath: string;
  uploadUrl: string;
  requiredMetadata?: Record<string, string>;
}

export interface FinalizedPrintAsset {
  assetId: string;
  storagePath: string;
  fileName?: string;
  widthPx?: number;
  heightPx?: number;
}

export interface PaypalClientConfig {
  enabled: boolean;
  clientId: string | null;
  currency: 'EUR';
  environment?: 'sandbox' | 'live';
}

export interface PaypalCreateResult {
  paypalOrderId: string;
  orderId?: string;
}

export interface PrintShopLegalConsents {
  privacyAccepted: boolean;
  termsAccepted: boolean;
  personalizedProductionAccepted: boolean;
}

export interface PaypalCaptureResult {
  orderId: string;
  orderNumber: string;
  paypalOrderId: string;
  paypalCaptureId?: string;
  paymentStatus: PrintShopPaymentStatus;
}
