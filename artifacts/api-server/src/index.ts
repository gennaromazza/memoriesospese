import app from "./app";
import { logger } from "./lib/logger";
import {
  cleanupStaleJobs,
  startBulkEmailDispatcher,
  stopBulkEmailDispatcher,
} from "./bulk-email-routes";
import {
  runReminderCheck,
  runVisioneAutoInviteCheck,
} from "./reminder-routes";
import { runFollowUpCheck } from "./follow-up-routes";
import { runLabShipmentExpiryCheck } from "./lab-routes";
import { runPrintShopRetentionCleanup } from "./print-shop/router";
import { runGiftCardDeliveries } from "./gift-cards";
import { runShopMaintenance } from "./shop";
import { startCancellationRetryWorker } from "./workers/cancellation-retry";
import {
  startEventSyncWorker,
  stopEventSyncWorker,
} from "./sync/event-sync-guard";
import { cleanupDeviceEnrollments } from "./admin-security/admin-security-store";
import { cleanupExpiredManualConsultationLocks } from "./consultation-routes";
import { runSocialCoverHealthCheck } from "./social-cover-health";
import { db } from "./firebase-admin";
import { startBookingPaymentExpiryWorker } from "./booking/payment-expiry";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

let cancellationWorkerCleanup: (() => void) | null = null;
let bookingExpiryCleanup: (() => void) | null = null;
let cleanupInterval: NodeJS.Timeout | null = null;
let reminderInterval: NodeJS.Timeout | null = null;

const runScheduledMaintenance = async () => {
  const jobs: Promise<unknown>[] = [
    runReminderCheck(),
    runVisioneAutoInviteCheck(),
    runLabShipmentExpiryCheck(),
    runPrintShopRetentionCleanup(),
    runGiftCardDeliveries(),
    runShopMaintenance(),
    runFollowUpCheck(),
    cleanupDeviceEnrollments(),
    cleanupExpiredManualConsultationLocks(),
  ];
  if (process.env.NODE_ENV === "production") {
    jobs.push(
      runSocialCoverHealthCheck().then(result => {
        if (result.checked > 0) {
          logger.info(result, "Periodic social cover health check completed");
        }
      }),
    );
  }
  const results = await Promise.allSettled(jobs);
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      logger.error(
        { err: result.reason, jobIndex: index },
        "Scheduled maintenance job failed",
      );
    }
  });
};

app.listen(port, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  cancellationWorkerCleanup = startCancellationRetryWorker();
  bookingExpiryCleanup = startBookingPaymentExpiryWorker(db);
  startEventSyncWorker(30);
  await cleanupStaleJobs();
  startBulkEmailDispatcher(30_000);
  cleanupInterval = setInterval(() => {
    void cleanupStaleJobs();
  }, 10 * 60 * 1000);
  setTimeout(() => void runScheduledMaintenance(), 2 * 60 * 1000);
  reminderInterval = setInterval(
    () => void runScheduledMaintenance(),
    60 * 60 * 1000,
  );
});

const shutdown = (signal: string) => {
  logger.info({ signal }, "Shutting down");
  cancellationWorkerCleanup?.();
  bookingExpiryCleanup?.();
  stopEventSyncWorker();
  stopBulkEmailDispatcher();
  if (cleanupInterval) clearInterval(cleanupInterval);
  if (reminderInterval) clearInterval(reminderInterval);
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
