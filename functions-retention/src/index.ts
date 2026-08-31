import { logger } from "firebase-functions";
import { defineSecret } from "firebase-functions/params";
import { onSchedule } from "firebase-functions/v2/scheduler";

const maintenanceSecret = defineSecret("PRINT_SHOP_CRON_SECRET");
const maintenanceUrl =
  "https://imagestudiofotografico.com/api/print-shop/internal/retention";

/**
 * Sveglia giornalmente il deployment Autoscale e delega al backend la
 * manutenzione idempotente di Storage, ordini e cartelle laboratorio.
 * Il codice vive in una codebase minima per non trascinare le dipendenze
 * legacy delle funzioni email.
 */
export const printShopRetentionHeartbeat = onSchedule(
  {
    schedule: "15 3 * * *",
    timeZone: "Europe/Rome",
    region: "europe-west1",
    timeoutSeconds: 540,
    memory: "256MiB",
    secrets: [maintenanceSecret],
    retryCount: 3,
    maxRetrySeconds: 3_600,
  },
  async () => {
    const secret = maintenanceSecret.value().trim();
    if (secret.length < 32) {
      throw new Error("PRINT_SHOP_CRON_SECRET non configurato correttamente");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8 * 60 * 1_000);
    try {
      const response = await fetch(maintenanceUrl, {
        method: "POST",
        headers: {
          authorization: `Bearer ${secret}`,
          "content-type": "application/json",
          "user-agent": "firebase-print-shop-retention/2.0",
        },
        body: JSON.stringify({ source: "firebase-scheduler" }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const diagnostic = (await response.text()).slice(0, 300);
        throw new Error(`Maintenance HTTP ${response.status}: ${diagnostic}`);
      }

      const result = (await response.json()) as Record<string, unknown>;
      logger.info("Manutenzione shop stampe completata", {
        success: result.ok === true,
        lifecycle: result.lifecycle,
        cleanup: result.cleanup,
        lab: result.lab,
      });
    } finally {
      clearTimeout(timeout);
    }
  },
);
