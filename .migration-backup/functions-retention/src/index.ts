import { GoogleAuth } from "google-auth-library";
import { logger } from "firebase-functions";
import { onSchedule } from "firebase-functions/v2/scheduler";
import {
  PRINT_SHOP_MAINTENANCE_SERVICE_ACCOUNT,
  isSuccessfulMaintenanceResult,
  resolveMaintenanceUrl,
} from "./contract.js";

export {
  PRINT_SHOP_MAINTENANCE_AUDIENCE,
  PRINT_SHOP_MAINTENANCE_SERVICE_ACCOUNT,
  isSuccessfulMaintenanceResult,
  resolveMaintenanceUrl,
} from "./contract.js";

/**
 * Sveglia giornalmente il deployment Autoscale e delega al backend la
 * manutenzione idempotente di Storage, ordini e cartelle laboratorio.
 * L'autenticazione usa un Google-signed ID token con audience esatta; non viene
 * condiviso alcun segreto statico tra Firebase e Replit.
 */
export const printShopRetentionHeartbeat = onSchedule(
  {
    schedule: "15 3 * * *",
    timeZone: "Europe/Rome",
    region: "europe-west1",
    timeoutSeconds: 540,
    memory: "256MiB",
    serviceAccount: PRINT_SHOP_MAINTENANCE_SERVICE_ACCOUNT,
    retryCount: 3,
    maxRetrySeconds: 3_600,
  },
  async () => {
    const maintenanceUrl = resolveMaintenanceUrl();
    const auth = new GoogleAuth();
    const client = await auth.getIdTokenClient(maintenanceUrl);

    const response = await client.request<unknown>({
      url: maintenanceUrl,
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "firebase-print-shop-retention/3.0",
      },
      data: { source: "firebase-scheduler" },
      timeout: 8 * 60 * 1_000,
      maxRedirects: 0,
      validateStatus: () => true,
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Maintenance HTTP ${response.status}`);
    }

    if (!isSuccessfulMaintenanceResult(response.data)) {
      // Replit can return the SPA shell with HTTP 200 for an unregistered API
      // route. Treat malformed bodies and {ok:false} as failures so Scheduler
      // retries rather than silently skipping the 90-day cleanup.
      throw new Error("Maintenance response non valida o non completata");
    }

    const result = response.data;
    logger.info("Manutenzione shop stampe completata", {
      success: result?.ok === true,
      lifecycle: result?.lifecycle,
      cleanup: result?.cleanup,
      lab: result?.lab,
    });
  },
);
