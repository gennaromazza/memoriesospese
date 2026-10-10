export const PRINT_SHOP_MAINTENANCE_SERVICE_ACCOUNT =
  "print-shop-retention-scheduler@wedding-gallery-397b6.iam.gserviceaccount.com";
export const PRINT_SHOP_MAINTENANCE_AUDIENCE =
  "https://imagestudiofotografico.com/api/print-shop/internal/retention";

const DEFAULT_SITE_URL = "https://imagestudiofotografico.com";
const MAINTENANCE_PATH = "/api/print-shop/internal/retention";

export interface MaintenanceResult {
  ok?: boolean;
  lifecycle?: unknown;
  cleanup?: unknown;
  lab?: unknown;
}

export function resolveMaintenanceUrl(siteUrl = process.env.SITE_URL): string {
  const configuredSiteUrl = siteUrl?.trim() || DEFAULT_SITE_URL;
  const maintenanceUrl = new URL(MAINTENANCE_PATH, configuredSiteUrl).toString();

  // The receiver accepts only this exact audience. A preview or misspelled
  // SITE_URL must fail closed instead of minting a token for another host.
  if (maintenanceUrl !== PRINT_SHOP_MAINTENANCE_AUDIENCE) {
    throw new Error(
      `SITE_URL non canonico per la retention: atteso ${DEFAULT_SITE_URL}`,
    );
  }
  return maintenanceUrl;
}

export function isSuccessfulMaintenanceResult(
  value: unknown,
): value is MaintenanceResult & { ok: true } {
  return Boolean(
    value
      && typeof value === "object"
      && !Array.isArray(value)
      && (value as MaintenanceResult).ok === true,
  );
}
